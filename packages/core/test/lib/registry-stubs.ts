import { Effect, Layer, Stream } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { Hooks } from "@opencode-ai/core/hooks/hooks"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"

// No-op Hooks service. The real Hooks node shells out to configured shell
// commands; tests don't want that, so stub it with immediate pass-through.
export const hooksNoop = Layer.succeed(
  Hooks.Service,
  Hooks.Service.of({
    preToolUse: () => Effect.succeed({ blocked: false }),
    postToolUse: () => Effect.void,
    postToolBatch: () => Effect.void,
  }),
)

// In-memory EventV2. The real node needs a Database; tool tests don't care
// about tool-intent events, so stub publish/listen with no-ops.
export const eventNoop = Layer.succeed(
  EventV2.Service,
  EventV2.Service.of({
    publish: () => Effect.succeed(undefined as never),
    subscribe: () => Stream.empty,
    all: () => Stream.empty,
    durable: () => Stream.empty,
    listen: () => Effect.succeed(Effect.void),
    project: () => Effect.void,
    replay: () => Effect.void,
    replayAll: () => Effect.succeed(undefined),
    remove: () => Effect.void,
    claim: () => Effect.void,
  }),
)

// A fixed Location backed by /project so tool tests that don't otherwise bind
// Location (registry pulls it in for cwd/hooks) have something to resolve.
export const locationFixed = [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })] as const
