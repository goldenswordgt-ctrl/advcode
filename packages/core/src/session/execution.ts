export * as SessionExecution from "./execution"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode, Node } from "../effect/app-node"
import { SessionRunner } from "./runner/index"
import { SessionSchema } from "./schema"

export interface Interface {
  /** Snapshots active execution owned by this process. */
  readonly active: Effect.Effect<ReadonlySet<SessionSchema.ID>>
  /** Starts execution while idle or joins the active execution. */
  readonly resume: (sessionID: SessionSchema.ID) => Effect.Effect<void, SessionRunner.RunError>
  /** Registers newly recorded work. Repeated wakeups may coalesce. */
  readonly wake: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /** Interrupt active work owned by this process. Idle interruption is a no-op. */
  readonly interrupt: (sessionID: SessionSchema.ID) => Effect.Effect<void>
}

/** Routes execution from a Session ID to the runner owned by that Session's Location. */
export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionExecution") {}

/** Low-level compatibility layer for callers that only need durable Session recording. */
export const noopLayer = Layer.succeed(
  Service,
  Service.of({
    active: Effect.succeed(new Set()),
    resume: () => Effect.void,
    wake: () => Effect.void,
    interrupt: () => Effect.void,
  }),
)

/**
 * Defaulted rather than unbound so the eager location-service map can compile
 * standalone. Every real composition replaces this node by name
 * (e.g. `SessionExecutionLocal.node` from `./execution/local`); the noop only
 * guards module-level compiles that never run provider work.
 */
export const node = makeGlobalNode({ service: Service, layer: noopLayer, deps: [] })
