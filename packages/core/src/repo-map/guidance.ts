export * as RepoMapGuidance from "./guidance"

import { makeLocationNode } from "../effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import { RepoMap } from "./repo-map"
import { SystemContext } from "../system-context/index"

/**
 * RepoMapGuidance — exposes the built repo map as a SystemContext contributor.
 *
 * Follows the same pattern as SkillGuidance / ReferenceGuidance: the map is a
 * loadable, reconcilable context source. When the dependency graph changes
 * (files edited), the update path tells the agent the map is stale; the fresh
 * map is reloaded on the next provider turn.
 */

export interface Interface {
  readonly load: () => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@advcode/RepoMapGuidance") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const repoMap = yield* RepoMap.Service

    return Service.of({
      load: Effect.fn("RepoMapGuidance.load")(function* () {
        const map = yield* repoMap.build()
        if (map.length === 0) return SystemContext.empty
        return SystemContext.make({
          key: SystemContext.Key.make("advcode/repo-map"),
          codec: Schema.toCodecJson(Schema.String),
          load: Effect.succeed(map),
          baseline: (current) => current,
          update: (_previous, current) =>
            ["The repository map has changed (files or symbols were edited). Here is the refreshed map:", current].join(
              "\n",
            ),
          removed: () => "The repository map is no longer available.",
        })
      }),
    })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [RepoMap.node] })
