import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { RepoMap } from "@opencode-ai/core/repo-map/repo-map"
import { RepoMapGuidance } from "@opencode-ai/core/repo-map/guidance"
import { Config } from "@opencode-ai/core/config"
import { ConfigExperimental } from "@opencode-ai/core/config/experimental"
import { SystemContext } from "@opencode-ai/core/system-context/index"
import { it } from "../lib/effect"

const repoMapEnabled = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({ type: "document", info: new Config.Info({ experimental: new ConfigExperimental.Experimental({ repo_map: true }) }) }),
      ]),
  }),
)

const repoMapDisabled = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({ type: "document", info: new Config.Info({ experimental: new ConfigExperimental.Experimental({ repo_map: false }) }) }),
      ]),
  }),
)

const guidanceLayer = (repoMap: Layer.Layer<RepoMap.Service>, config: Layer.Layer<Config.Service>) =>
  AppNodeBuilder.build(RepoMapGuidance.node, [
    [RepoMap.node, repoMap],
    [Config.node, config],
  ])

describe("RepoMapGuidance", () => {
  it.effect("exposes the built repo map when the repo_map flag is on", () =>
    Effect.gen(function* () {
      const guidance = yield* RepoMapGuidance.Service
      const generation = yield* SystemContext.initialize(yield* guidance.load())

      expect(generation.baseline).toContain("<repo_map>")
      expect(generation.baseline).toContain("core/engine.ts :: class:Engine")
    }).pipe(
      Effect.provide(
        guidanceLayer(
          Layer.mock(RepoMap.Service, {
            build: () =>
              Effect.succeed(
                [
                  "<repo_map>",
                  "Project overview by file and the symbols they define, ranked by centrality.",
                  "core/engine.ts :: class:Engine, function:boot",
                  "</repo_map> (1 files shown under a 1000-token budget)",
                ].join("\n"),
              ),
          }),
          repoMapEnabled,
        ),
      ),
    ),
  )

  it.effect("omits the repo map when the flag is off (default)", () =>
    Effect.gen(function* () {
      const guidance = yield* RepoMapGuidance.Service
      const generation = yield* SystemContext.initialize(yield* guidance.load())
      expect(generation.baseline).toBe("")
    }).pipe(
      Effect.provide(
        guidanceLayer(Layer.mock(RepoMap.Service, { build: () => Effect.succeed("<repo_map>mocked</repo_map>") }), repoMapDisabled),
      ),
    ),
  )

  it.effect("omits the repo map when none can be built", () =>
    Effect.gen(function* () {
      const guidance = yield* RepoMapGuidance.Service
      const generation = yield* SystemContext.initialize(yield* guidance.load())
      expect(generation.baseline).toBe("")
    }).pipe(
      Effect.provide(
        guidanceLayer(Layer.mock(RepoMap.Service, { build: () => Effect.succeed("") }), repoMapEnabled),
      ),
    ),
  )
})
