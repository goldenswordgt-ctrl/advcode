import { describe, expect, it } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
import { RepoMap } from "@opencode-ai/core/repo-map/repo-map"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { tmpdir } from "../fixture/tmpdir"
import { location } from "../fixture/location"

const repoMapFor = (tmp: { path: string }) => {
  const ref = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
  const locationLayer = Layer.succeed(Location.Service, Location.Service.of(location(ref)))
  return LayerNode.compile(RepoMap.node, [[Location.node, locationLayer]])
}

const writeProject = (tmp: { path: string }, files: Record<string, string>) =>
  Effect.gen(function* () {
    for (const [relative, source] of Object.entries(files)) {
      const full = path.join(tmp.path, relative)
      yield* Effect.promise(() => fs.mkdir(path.dirname(full), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(full, source))
    }
  })

const withProject = <A>(
  files: Record<string, string>,
  body: (tmp: { path: string }) => Effect.Effect<A, never, RepoMap.Service>,
) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) =>
      Effect.gen(function* () {
        yield* writeProject(tmp, files)
        return yield* body(tmp).pipe(Effect.provide(repoMapFor(tmp)))
      }),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const runWithProject = <A>(
  files: Record<string, string>,
  body: (tmp: { path: string }) => Effect.Effect<A, never, RepoMap.Service>,
) => Effect.runPromise(withProject(files, body))

describe("RepoMap.build", () => {
  it("renders files with their extracted symbols", () =>
    runWithProject(
      {
        "core/engine.ts": `
export const VERSION = "1.0"
export class Engine { start() {} }
export function boot() { return new Engine() }
`,
        "main.ts": `export function main() { return "hello" }\n`,
      },
      () =>
        Effect.gen(function* () {
          const map = yield* (yield* RepoMap.Service).build(100)
          expect(map).toContain("core/engine.ts")
          expect(map).toContain("main.ts")
          expect(map).toContain("class:Engine")
          expect(map).toContain("function:boot")
        }),
    ),
  )

  it("returns an empty map when no file defines symbols", () =>
    runWithProject(
      { "readme.txt": "no symbols here\n" },
      () =>
        Effect.gen(function* () {
          const map = yield* (yield* RepoMap.Service).build()
          expect(map).toBe("")
        }),
    ),
  )

  it("ranks the referenced file above the entry file", () =>
    runWithProject(
      {
        "core/engine.ts": `
export const VERSION = "1.0"
export class Engine { start() {} }
export function boot() { return new Engine() }
`,
        "main.ts": `
import { Engine } from "./core/engine"
export function main() { return new Engine() }
`,
      },
      () =>
        Effect.gen(function* () {
          const map = yield* (yield* RepoMap.Service).build(100)
          const engineIndex = map.indexOf("core/engine.ts")
          const mainIndex = map.indexOf("main.ts")
          expect(engineIndex).toBeGreaterThan(-1)
          expect(mainIndex).toBeGreaterThan(-1)
          // The dependency-weighted file (the one others reference) leads the map.
          expect(engineIndex).toBeLessThan(mainIndex)
        }),
    ),
  )

  it("respects a tight token budget", () =>
    runWithProject(
      {
        "a.ts": `export function a() {} export function b() {} export function c() {}\n`,
        "b.ts": `export function d() {} export function e() {} export function f() {}\n`,
        "c.ts": `export function g() {} export function h() {} export function i() {}\n`,
      },
      () =>
        Effect.gen(function* () {
          const map = yield* (yield* RepoMap.Service).build(1)
          const shown = map.split("\n").filter((line) => line.includes(".ts ::")).length
          // The first line always lands even at a tiny budget (the guard only
          // truncates once at least one line is present); everything after it
          // must be cut.
          expect(shown).toBe(1)
          expect(map).toContain("</repo_map>")
        }),
    ),
  )

  it("caches the built map between calls under the same budget", () =>
    runWithProject(
      {
        "a.ts": `export function a() {}\n`,
        "b.ts": `export function b() {}\n`,
      },
      () =>
        Effect.gen(function* () {
          const service = yield* RepoMap.Service
          const first = yield* service.build()
          const second = yield* service.build()
          expect(first).toBe(second)
          // Same budget returns the cached string, not a rebuild.
          expect(second).toContain("<repo_map>")
        }),
    ),
  )

  it("keys the cache by budget", () =>
    runWithProject(
      {
        "a.ts": `export function a() {}\n`,
        "b.ts": `export function b() {}\n`,
        "c.ts": `export function c() {}\n`,
        "d.ts": `export function d() {}\n`,
      },
      () =>
        Effect.gen(function* () {
          const service = yield* RepoMap.Service
          const small = yield* service.build(1)
          const large = yield* service.build(1_000_000)
          // A different budget must not reuse the small-budget cache.
          const smallLines = small.split("\n").filter((line) => line.includes(".ts ::")).length
          const largeLines = large.split("\n").filter((line) => line.includes(".ts ::")).length
          expect(smallLines).toBe(1)
          expect(largeLines).toBeGreaterThan(smallLines)
        }),
    ),
  )
})
