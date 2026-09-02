export * as MemoryContext from "./context"

import { Effect, Layer, Schema } from "effect"
import { MemoryV2 } from "./memory"
import { SystemContext } from "../system-context/index"
import { SystemContextRegistry } from "../system-context/registry"
import { makeLocationNode } from "../effect/app-node"

/**
 * MemoryContext — makes the agent's distilled cross-session memory part of
 * the System Context so the model actually SEES the facts the memory service
 * stores. Without this, MemoryV2 was a write-only vault: the agent never
 * remembered anything, because nothing ever read it back in.
 *
 * It recalls the highest-importance durable facts and the current user model
 * and renders them as a stable system-context source (`core/memory`). When a
 * fact is learned mid-session it emits an update, so the model learns without
 * a restart.
 */

const EntrySummary = Schema.Struct({
  type: Schema.String,
  key: Schema.String,
  value: Schema.String,
  importance: Schema.optional(Schema.Number),
})
type EntrySummary = typeof EntrySummary.Type

const UserFact = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
  confidence: Schema.Number,
})
type UserFact = typeof UserFact.Type

const Snapshot = Schema.Struct({
  entries: Schema.Array(EntrySummary),
  user: Schema.Array(UserFact),
  count: Schema.Number,
})
type Snapshot = typeof Snapshot.Type

const LIMIT = 15

const render = (value: Snapshot) => {
  const user = value.user
    .filter((fact) => fact.confidence >= 0.3)
    .map((fact) => `- ${fact.key}: ${fact.value}`)
  const facts = value.entries
    .filter((entry) => entry.importance !== undefined && entry.importance >= 2)
    .map((entry) => `- [${entry.type}] ${entry.key}: ${entry.value}`)

  if (user.length === 0 && facts.length === 0) return "No meaningful cross-session memory has been distilled yet."
  return [
    "Cross-session memory (facts distilled by the evolving agent across prior sessions). Use these rather than assuming:",
    ...(user.length > 0 ? ["", "About the user:", ...user] : []),
    ...(facts.length > 0 ? ["", "Durable lessons and decisions:", ...facts] : []),
    "",
    "If a new, important fact about the user or the project surfaces in this session, record it in memory so it is available later.",
  ].join("\n")
}

const key = SystemContext.Key.make("core/memory")

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const memory = yield* MemoryV2.Service
    const registry = yield* SystemContextRegistry.Service

    const observe = Effect.fn("MemoryContext.observe")(() =>
      Effect.gen(function* () {
        const entries = yield* memory.recallTop(LIMIT)
        const user = yield* memory.recallUser()
        return {
          entries: entries.map((entry) => ({
            type: entry.type,
            key: entry.key,
            value: entry.value,
            importance: entry.importance,
          })),
          user: user.map((u) => ({ key: u.key, value: u.value, confidence: u.confidence })),
          count: entries.length + user.length,
        } satisfies Snapshot
      }),
    )

    const source = (value: Snapshot) =>
      SystemContext.make({
        key,
        codec: Schema.toCodecJson(Snapshot),
        load: Effect.succeed(value),
        baseline: render,
        update: (previous, current) =>
          ["Your cross-session memory has changed. This supersedes the previous memory block:", render(current)].join(
            "\n\n",
          ),
      })

    yield* registry.register({
      key,
      load: observe().pipe(
        Effect.map((value) => (value.count === 0 ? SystemContext.empty : source(value))),
        Effect.catch(() => Effect.succeed(SystemContext.empty)),
        Effect.catchDefect(() => Effect.succeed(SystemContext.empty)),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "memory-context",
  layer,
  deps: [MemoryV2.node, SystemContextRegistry.node],
})
