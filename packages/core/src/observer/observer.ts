export * as ObserverJob from "./observer"

import { Context, Effect, Layer, Schema } from "effect"
import { LLM, Message, SystemPart } from "@opencode-ai/llm"
import type { Model } from "@opencode-ai/llm"
import { MemoryV2 } from "../memory/memory"
import { fromCatalogModel } from "../session/runner/model"
import { makeLocationNode } from "../effect/app-node"
import { llmClient } from "../effect/app-node-platform"
import { Catalog } from "../catalog"
import { Integration } from "../integration"
import { SkillLearning } from "../skill/learning"

/**
 * ObserverJob — background observer agents + reconciler.
 *
 * Each observer watches a single axis of quality and proposes short
 * advisories. The reconciler gates which proposals actually surface.
 * No observer ever answers for the user or directly writes; the
 * reconciler is the source of truth for what gets committed.
 */

export interface Proposal {
  readonly note: string
}

export interface Advisory {
  readonly observer: string
  readonly axis: string
  readonly note: string
  readonly reason: string
}

export interface ObserverInput {
  readonly sessionID?: string
  readonly recentMemory?: ReadonlyArray<MemoryV2.Entry>
  readonly activeGoals?: ReadonlyArray<{ readonly id: string; readonly objective: string; readonly status: string }>
  readonly availableSkills?: ReadonlyArray<{ readonly name: string; readonly description?: string }>
}

export interface Observer {
  readonly name: string
  readonly axis: string
  readonly propose: (input: ObserverInput) => Effect.Effect<Proposal | undefined>
}

const MAX_ADVISORIES = 2

const memoryRecallObserver: Observer = {
  name: "memory-recall",
  axis: "memory recall",
  propose: (input) => {
    const top = input.recentMemory ?? []
    const candidates = top.filter(
      (entry) => entry.importance !== undefined && entry.importance >= 6,
    )
    if (candidates.length === 0) return Effect.succeed(undefined)
    const best = candidates[0]
    return Effect.succeed({
      note: `Relevant prior: ${best.key} — ${best.value.slice(0, 120)}`,
    } satisfies Proposal)
  },
}

const skillRecallObserver: Observer = {
  name: "skill-recall",
  axis: "skill recall",
  propose: (input) => {
    const available = input.availableSkills ?? []
    const recent = input.recentMemory ?? []
    const taskKeywords = recent
      .filter((e) => e.type === "lesson" || e.type === "workflow")
      .flatMap((e) => e.value.split(/\s+/).slice(0, 5))
    const matching = available.find((skill) => {
      const words = skill.name.split("-")
      return words.some((w) => taskKeywords.includes(w))
    })
    if (!matching) return Effect.succeed(undefined)
    return Effect.succeed({
      note: `Consider loading skill "${matching.name}": ${matching.description ?? "(no description)"}`,
    } satisfies Proposal)
  },
}

const goalProgressObserver: Observer = {
  name: "goal-progress",
  axis: "goal progress",
  propose: (input) => {
    const goals = input.activeGoals ?? []
    const active = goals.filter((g) => g.status === "active")
    if (active.length === 0) return Effect.succeed(undefined)
    const goal = active[0]
    return Effect.succeed({
      note: `Active goal "${goal.objective}" — consider progress or blockers`,
    } satisfies Proposal)
  },
}

const verificationObserver: Observer = {
  name: "verification",
  axis: "work verification",
  propose: () => Effect.succeed(undefined),
}

const defaultObservers: ReadonlyArray<Observer> = [
  memoryRecallObserver,
  skillRecallObserver,
  goalProgressObserver,
  verificationObserver,
]

const ReconcilerOutput = Schema.Struct({
  accepted: Schema.Array(
    Schema.Struct({
      observer: Schema.String,
      axis: Schema.String,
      note: Schema.String,
      reason: Schema.String,
    }),
  ),
  rejected: Schema.Array(Schema.String),
})

const RECONCILER_SYSTEM = [
  "You are the reconciler gate for an autonomous observer system.",
  "Multiple observers propose short advisory notes. You decide which are worth surfacing.",
  "Rules:",
  "- Accept at most 2 advisories. Quality over quantity.",
  "- Reject duplicate or overlapping advisories.",
  "- Reject advisories that are not actionable or are too vague.",
  "- Return accepted advisories with a reason, and rejected observer names.",
  "Respond with ONLY the JSON object matching the schema.",
].join("\n")

export interface ObserverResult {
  readonly accepted: ReadonlyArray<Advisory>
  /** Proposals that the reconciler gate rejected (kept for auditability). */
  readonly filtered: ReadonlyArray<Advisory>
}

export interface Interface {
  readonly runObservers: (input: ObserverInput) => Effect.Effect<ObserverResult>
}

export class Service extends Context.Service<Service, Interface>()("@advcode/ObserverJob") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memory = yield* MemoryV2.Service
    const skills = yield* SkillLearning.Service
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    const observers = defaultObservers

    const resolveModel = Effect.fn("ObserverJob.resolveModel")(function* () {
      const selected = yield* catalog.model.default().pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (selected === undefined) return undefined
      const provider = yield* catalog.provider
        .get(selected.providerID)
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      const connection = provider
        ? yield* integrations.connection
            .active(provider.integrationID ?? Integration.ID.make(selected.providerID))
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      const credential = connection
        ? yield* integrations.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      return yield* fromCatalogModel(selected, credential).pipe(Effect.catch(() => Effect.succeed(undefined)))
    })

    const reconcile = Effect.fn("ObserverJob.reconcile")(function* (
      proposals: ReadonlyArray<Proposal & { observer: string; axis: string }>,
    ) {
      if (proposals.length === 0) return { accepted: [], filtered: [] } as ObserverResult
      if (proposals.length <= MAX_ADVISORIES) {
        return {
          accepted: proposals.map((p) => ({
            observer: p.observer,
            axis: p.axis,
            note: p.note,
            reason: "auto-accepted (under threshold)",
          })),
          filtered: [],
        } as ObserverResult
      }
      const model = yield* resolveModel()
      if (model === undefined) {
        const accepted = proposals.slice(0, MAX_ADVISORIES).map((p) => ({
          observer: p.observer,
          axis: p.axis,
          note: p.note,
          reason: "auto-accepted (no model for reconciliation)",
        }))
        return {
          accepted,
          filtered: proposals.slice(MAX_ADVISORIES).map((p) => ({
            observer: p.observer,
            axis: p.axis,
            note: p.note,
            reason: "filtered (reconciler unavailable)",
          })),
        } as ObserverResult
      }
      const proposalText = proposals.map((p, i) => `[${i}] (${p.observer} / ${p.axis}) ${p.note}`).join("\n")
      const result = yield* LLM.generateObject({
        model,
        system: [SystemPart.make(RECONCILER_SYSTEM)],
        messages: [Message.user(proposalText)],
        schema: ReconcilerOutput,
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (result === undefined) {
        const accepted = proposals.slice(0, MAX_ADVISORIES).map((p) => ({
          observer: p.observer,
          axis: p.axis,
          note: p.note,
          reason: "auto-accepted (reconciler fallback)",
        }))
        return {
          accepted,
          filtered: proposals.slice(MAX_ADVISORIES).map((p) => ({
            observer: p.observer,
            axis: p.axis,
            note: p.note,
            reason: "filtered (reconciler fallback)",
          })),
        } as ObserverResult
      }
      const accepted = result.object.accepted
      const acceptedNames = new Set(accepted.map((a) => a.observer))
      const filtered = proposals
        .filter((p) => !acceptedNames.has(p.observer))
        .map((p) => ({
          observer: p.observer,
          axis: p.axis,
          note: p.note,
          reason: "filtered (reconciler gate)",
        }))
      return { accepted, filtered } as ObserverResult
    })

    const runObservers: Interface["runObservers"] = Effect.fn("ObserverJob.runObservers")(function* (input) {
      const recentMemory =
        input.recentMemory ?? (yield* memory.recallTop(10).pipe(Effect.catch(() => Effect.succeed([]))))
      const skillList = yield* skills.list().pipe(Effect.catch(() => Effect.succeed([])))
      const goals = yield* memory
        .recall({ type: "project", key: "goal:", limit: 20 })
        .pipe(Effect.catch(() => Effect.succeed([])))
      const activeGoals = parseGoals(goals)

      const inputWithContext: ObserverInput = {
        ...input,
        recentMemory,
        activeGoals,
        availableSkills: skillList.map((s) => ({ name: s.name, description: s.description })),
      }

      const proposals = yield* Effect.forEach(observers, (obs) =>
        obs.propose(inputWithContext).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
          Effect.map((proposal) => (proposal ? { ...proposal, observer: obs.name, axis: obs.axis } : undefined)),
        ),
      )
      const validProposals = proposals.filter(
        (p): p is Proposal & { observer: string; axis: string } => p !== undefined,
      )
      return yield* reconcile(validProposals)
    })

    return Service.of({ runObservers })
  }),
)

function parseGoals(
  goals: ReadonlyArray<MemoryV2.Entry>,
): ReadonlyArray<{ id: string; objective: string; status: string }> {
  const parsed = goals.map((entry) => {
    try {
      return JSON.parse(entry.value) as unknown
    } catch {
      return undefined
    }
  })
  return parsed.filter(
    (p): p is { id: string; objective: string; status: string } =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as Record<string, unknown>).id === "string" &&
      typeof (p as Record<string, unknown>).objective === "string" &&
      typeof (p as Record<string, unknown>).status === "string",
  )
}

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [MemoryV2.node, SkillLearning.node, Catalog.node, Integration.node, llmClient],
})
