export * as SkillGuidance from "./guidance"

import { makeLocationNode } from "../effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import { AgentV2 } from "../agent"
import { PermissionV2 } from "../permission"
import { SkillV2 } from "../skill"
import { SystemContext } from "../system-context/index"

/**
 * Progressive disclosure for skills.
 *
 * The full SKILL.md body is never injected into system context — it loads on
 * demand through the `skill` tool. What the agent sees here is a compact,
 * token-budgeted index (name + one-line description or name-only). As the skill
 * library grows to hundreds of entries, the index is truncated under a fixed
 * token budget so a turn never pays for an unbounded skill wall. Skills that
 * lack a description still appear (name-only) so they stay reachable.
 */

const Summary = Schema.Struct({
  name: Schema.String,
  description: Schema.String.pipe(Schema.optional),
})
type Summary = typeof Summary.Type

const DEFAULT_TOKEN_BUDGET = 1000
const CHARS_PER_TOKEN = 4

const renderSkill = (skill: Summary): string =>
  skill.description === undefined
    ? ["  <skill>", `    <name>${skill.name}</name>`, "  </skill>"].join("\n")
    : [
        "  <skill>",
        `    <name>${skill.name}</name>`,
        `    <description>${skill.description}</description>`,
        "  </skill>",
      ].join("\n")

// Progressive disclosure: render only as many skill entries as fit a fixed
// token budget. The full SKILL.md body is never shown here — it loads through
// the `skill` tool. Truncated entries are summarized so the agent knows more
// exist and can reach them on demand (a skill can otherwise go undiscovered).
const renderIndex = (skills: ReadonlyArray<Summary>): readonly string[] => {
  if (skills.length === 0) return ["No skills are currently available."]
  const charBudget = DEFAULT_TOKEN_BUDGET * CHARS_PER_TOKEN
  const lines: string[] = []
  let used = 0
  let shown = 0
  for (const skill of skills) {
    const block = renderSkill(skill)
    const cost = block.length + 1
    if (shown > 0 && used + cost > charBudget) break
    lines.push(block)
    used += cost
    shown++
  }
  const omitted = skills.length - shown
  const tail =
    omitted > 0
      ? [`  <more>${omitted} more skills available; use the skill tool to load one</more>`]
      : []
  return ["<available_skills>", ...lines, ...tail, "</available_skills>"]
}

const render = (skills: ReadonlyArray<Summary>) =>
  [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    ...renderIndex(skills),
  ].join("\n")

export interface Interface {
  readonly load: (agent: AgentV2.Selection) => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SkillGuidance") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skills = yield* SkillV2.Service

    return Service.of({
      load: Effect.fn("SkillGuidance.load")(function* (selection) {
        const agent = selection.info
        if (!agent) return SystemContext.empty
        const permitted = SkillV2.available(yield* skills.list(), agent)
        if (permitted.length === 0 && PermissionV2.evaluate("skill", "*", agent.permissions).effect === "deny")
          return SystemContext.empty
        const available = permitted
          .map((skill) =>
            skill.description === undefined
              ? { name: skill.name }
              : { name: skill.name, description: skill.description },
          )
          .toSorted((a, b) => a.name.localeCompare(b.name))
        return SystemContext.make({
          key: SystemContext.Key.make("core/skill-guidance"),
          codec: Schema.toCodecJson(Schema.Array(Summary)),
          load: Effect.succeed(available),
          baseline: render,
          update: (_previous, current) =>
            [
              "The available skills have changed. This list supersedes the previous available skills list.",
              render(current),
            ].join("\n"),
          removed: () => "Skill guidance is no longer available. Do not use any previously listed skill.",
        })
      }),
    })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [SkillV2.node] })
