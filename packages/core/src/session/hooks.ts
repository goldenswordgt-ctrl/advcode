export * as SessionHooks from "./hooks"

import { Context, Effect, Layer, Scope } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { State } from "../state"
import type { DeepMutable } from "../schema"
import type { Prompt } from "./prompt"

/**
 * Runtime session interception for plugins.
 *
 * Mirrors the AISDK hook pattern: plugins register callbacks per lifecycle
 * name, later hooks observe mutations made by earlier hooks, disposal is
 * scope-owned, and hook events are the only thing callbacks may touch.
 *
 * Hooks are runtime-only — they are not replayed during domain rebuilds.
 */

export interface SessionPromptEvent {
  readonly sessionID: string
  readonly messageID: string
  readonly delivery: "steer" | "queue"
  readonly prompt: DeepMutable<Prompt>
}

export interface SessionTurnEvent {
  readonly sessionID: string
  readonly step: number
  readonly finish: string | undefined
  readonly modelID: string
  readonly providerID: string
}

export interface Interface {
  readonly hook: {
    readonly promptBefore: (
      callback: (event: SessionPromptEvent) => Effect.Effect<void> | void,
    ) => Effect.Effect<State.Registration, never, Scope.Scope>
    readonly turnAfter: (
      callback: (event: SessionTurnEvent) => Effect.Effect<void> | void,
    ) => Effect.Effect<State.Registration, never, Scope.Scope>
  }
  readonly runPromptBefore: (event: SessionPromptEvent) => Effect.Effect<SessionPromptEvent>
  readonly runTurnAfter: (event: SessionTurnEvent) => Effect.Effect<SessionTurnEvent>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionHooks") {}

export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    let promptBefore: ((event: SessionPromptEvent) => Effect.Effect<void> | void)[] = []
    let turnAfter: ((event: SessionTurnEvent) => Effect.Effect<void> | void)[] = []

    const register = <Event>(
      hooks: () => ((event: Event) => Effect.Effect<void> | void)[],
      update: (hooks: ((event: Event) => Effect.Effect<void> | void)[]) => void,
    ) =>
      Effect.fn("SessionHooks.hook")(function* (callback: (event: Event) => Effect.Effect<void> | void) {
        const scope = yield* Scope.Scope
        let active = true
        update([...hooks(), callback])
        const dispose = Effect.sync(() => {
          if (!active) return
          active = false
          update(hooks().filter((item) => item !== callback))
        })
        yield* Scope.addFinalizer(scope, dispose)
        return { dispose }
      })

    const run = Effect.fnUntraced(function* <Event>(
      hooks: readonly ((event: Event) => Effect.Effect<void> | void)[],
      event: Event,
    ) {
      for (const hook of hooks) {
        const result = hook(event)
        if (Effect.isEffect(result)) yield* result
      }
      return event
    })

    const service = Service.of({
      hook: {
        promptBefore: register(
          () => promptBefore,
          (next) => (promptBefore = next),
        ),
        turnAfter: register(
          () => turnAfter,
          (next) => (turnAfter = next),
        ),
      },
      runPromptBefore: (event) => run(promptBefore, event),
      runTurnAfter: (event) => run(turnAfter, event),
    })
    return service
  }),
)

export const node = makeGlobalNode({ service: Service, layer: locationLayer, deps: [] })