export * as SelfLearning from "./self-learn"

import { Context, Effect, Layer, Schema } from "effect"
import { LLM, Message, SystemPart } from "@opencode-ai/llm"
import { MemoryV2 } from "../memory/memory"
import { SkillLearning } from "./learning"
import { SessionSchema } from "../session/schema"
import { SessionMessage } from "../session/message"
import { SessionStore } from "../session/store"
import { SessionRunnerModel } from "../session/runner/model"
import { llmClient } from "../effect/app-node-platform"
import { makeLocationNode } from "../effect/app-node"

/**
 * SelfLearning — closes the loop on the "persistent brain."
 *
 * MemoryV2 and SkillLearning are storage: nothing ever wrote to them from the
 * live loop and nothing read them back. SelfLearning is the wiring between the
 * two and the agent. After a provider turn settles with real work, the runner
 * asks this service to distill the just-completed work into:
 *
 *   1. durable memory facts (user, project, workflow, preference, decision, lesson)
 *   2. user-model beliefs (who the user is, with confidence)
 *   3. an optional reusable skill, when the task was complex enough
 *
 * Every path is best-effort and fully swallowed: learning can never break,
 * block, or slow the coding loop it observes.
 */

const MemType = Schema.Literals([
  "user",
  "project",
  "workflow",
  "preference",
  "decision",
  "lesson",
])

const Distill = Schema.Struct({
  memories: Schema.Array(
    Schema.Struct({
      type: MemType,
      key: Schema.String,
      value: Schema.String,
      importance: Schema.optional(Schema.Number),
    }),
  ),
  user: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      value: Schema.String,
      confidence: Schema.Number,
    }),
  ),
  skill: Schema.optional(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String,
      content: Schema.String,
    }),
  ),
})
type Distill = typeof Distill.Type

const SYSTEM = [
  "You are the long-term memory of a coding agent (advcode).",
  "Given the tail of a recent session transcript, distill the few durable, useful facts worth remembering across sessions.",
  "",
  "Memory types:",
  "- user: stable facts about the person (name, role, preferences, context)",
  "- project: stable facts about the repo/project (stack, conventions, decisions)",
  "- workflow: how work actually gets done here (commands, tools, patterns)",
  "- preference: explicit stated preferences (editor, style, language)",
  "- decision: decisions made and why (so they are not re-litigated)",
  "- lesson: things learned the hard way (gotchas, pitfalls)",
  "",
  "Rules:",
  "- Only emit facts that are durable and non-obvious. Skip trivia and one-off remarks.",
  "- Prefer a few high-signal facts over many noisy ones. importance is 1-10.",
  "- user beliefs carry a confidence 0-1 (how sure you are it still holds).",
  "- If this session's work is complex, generalizable, and reusable (several tool calls / corrections / a clear procedure), propose ONE skill with name (lowercase-alphanumeric-dashes), description, and markdown content with sections: When to use, Steps, Gotchas.",
  "- If nothing is worth remembering or learning, return empty arrays and no skill.",
  "Respond with ONLY the JSON object matching the schema.",
].join("\n")

export interface Interface {
  /**
   * Best-effort distill of a settled provider turn. Returns nothing; all
   * failures are swallowed. `worked` is true when the turn settled tool calls
   * (the signal that real work happened worth learning from).
   */
  readonly learnFromTurn: (input: {
    readonly sessionID: SessionSchema.ID
    readonly worked: boolean
  }) => Effect.Effect<void, never>
}

export class Service extends Context.Service<Service, Interface>()("@advcode/self-learning") {}

const sanitizeSkillName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)

function renderMessage(m: SessionMessage.Message): string {
  switch (m.type) {
    case "user":
      return `user: ${m.text}`
    case "system":
      return `system: ${m.text}`
    case "synthetic":
      return `user: ${m.text}`
    case "compaction":
      return `[compacted: ${m.summary}]`
    case "assistant": {
      const body = m.content
        .map((part) => (part.type === "text" ? part.text : part.type === "tool" ? `[tool: ${part.name}]` : "[reasoning]"))
        .join(" ")
      return `assistant: ${body}`
    }
    default:
      return ""
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const models = yield* SessionRunnerModel.Service
    const memory = yield* MemoryV2.Service
    const skills = yield* SkillLearning.Service

    // Dedupe by session so a single session is never distilled twice.
    const learnedSessions = new Set<string>()

    const distill = Effect.fn("SelfLearning.distill")(function* (input: {
      readonly sessionID: SessionSchema.ID
      readonly worked: boolean
    }) {
        if (learnedSessions.has(input.sessionID)) return
        if (!input.worked) return

        const session = yield* store.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!session) return

        const history = yield* store.context(input.sessionID).pipe(Effect.catch(() => Effect.succeed([])))
        if (history.length === 0) return

        const transcript = history
          .slice(-40)
          .map((m) => renderMessage(m))
          .filter((line) => line.length > 0)
          .join("\n")

        if (transcript.length < 200) return

        const model = yield* models.resolve(session).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (model === undefined) return

        const result = yield* LLM.generateObject({
          model,
          system: [SystemPart.make(SYSTEM)],
          messages: [Message.user(`<transcript>\n${transcript}\n</transcript>`)],
          schema: Distill,
        }).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (result === undefined) return
        const parsed = result.object
        learnedSessions.add(input.sessionID)

        for (const mem of parsed.memories) {
          yield* memory
            .remember({
              type: mem.type,
              key: mem.key,
              value: mem.value,
              importance: mem.importance ?? 1,
              session_id: input.sessionID,
            })
            .pipe(Effect.catch(() => Effect.void), Effect.catchDefect(() => Effect.void))
        }
        for (const u of parsed.user) {
          yield* memory
            .rememberUser({ key: u.key, value: u.value, confidence: u.confidence, session_id: input.sessionID })
            .pipe(Effect.catch(() => Effect.void), Effect.catchDefect(() => Effect.void))
        }
        if (parsed.skill) {
          const name = sanitizeSkillName(parsed.skill.name)
          if (name.length > 0) {
            const content = parsed.skill.content ?? ""
            const lower = content.toLowerCase()
            const hasStructure =
              /^##\s+/m.test(content) &&
              (lower.includes("gotcha") ||
                lower.includes("pitfall") ||
                lower.includes("when to use") ||
                lower.includes("steps"))
            // Quality gate: skip a skill with no reusable procedure structure —
            // procedural noise has no sections and no guidance, so it would only
            // become dead weight the curator later has to prune.
            if (!hasStructure) return

            yield* skills
              .create({
                name,
                description: parsed.skill.description,
                content: parsed.skill.content,
                source_session_id: input.sessionID,
              })
              .pipe(Effect.catch(() => Effect.void), Effect.catchDefect(() => Effect.void))
          }
        }
      })

    return Service.of({
      learnFromTurn: Effect.fn("SelfLearning.learnFromTurn")(function* ({ sessionID, worked }) {
        yield* distill({ sessionID, worked }).pipe(
          Effect.catch(() => Effect.void),
          Effect.catchDefect(() => Effect.void),
        )
      }),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [
    SessionStore.node,
    SessionRunnerModel.node,
    llmClient,
    MemoryV2.node,
    SkillLearning.node,
  ],
})