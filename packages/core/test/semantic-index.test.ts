import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SemanticIndex } from "@opencode-ai/core/semantic-index/semantic-index"
import { tokenize } from "@opencode-ai/core/semantic-index/tokenize"
import { chunkSource } from "@opencode-ai/core/semantic-index/chunk"
import { computeStats, score as bm25Score } from "@opencode-ai/core/semantic-index/bm25"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, FSUtil.node, SemanticIndex.node])),
)

/** Acquire a disposable temp dir for the duration of an effect. */
const withTmpdir = <A, E, R>(run: (dir: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const tmp = yield* Effect.promise(() => tmpdir())
    const dispose = tmp[Symbol.asyncDispose]!
    yield* Effect.addFinalizer(() => Effect.promise(() => dispose()))
    return yield* run(tmp.path)
  })

describe("tokenize", () => {
  it.effect("splits camelCase, snake_case, and kebab-case identifiers", () =>
    Effect.gen(function* () {
      expect(tokenize("handleUserAuth")).toEqual(["handle", "user", "auth"])
      expect(tokenize("ensure_user_by_id")).toEqual(["ensure", "user", "id"])
      expect(tokenize("fetch-total-items")).toEqual(["fetch", "total", "items"])
    }))

  it.effect("drops stopwords and single characters", () =>
    Effect.gen(function* () {
      expect(tokenize("a the for returns")).toEqual([])
      expect(tokenize("x y z")).toEqual([])
    }))
})

describe("chunkSource", () => {
  it.effect("chunks a TS file at symbol boundaries with symbols attached", () =>
    Effect.gen(function* () {
      const source = [
        "export class UserRepository {",
        "  constructor() {}",
        "}",
        "",
        "export function handleUserAuth(userId: string) {",
        "  return userId",
        "}",
        "",
        "export const MAX_RETRIES = 3",
      ].join("\n")
      const chunks = chunkSource("src/user.ts", source)
      expect(chunks.length).toBe(4)
      expect(chunks[0]!.symbol).toBe("UserRepository")
      expect(chunks[0]!.startLine).toBe(1)
      expect(chunks[1]!.symbol).toBe("constructor")
      expect(chunks[1]!.startLine).toBe(2)
      expect(chunks[2]!.symbol).toBe("handleUserAuth")
      expect(chunks[2]!.startLine).toBe(5)
      expect(chunks[2]!.tokens).toContain("user")
      expect(chunks[2]!.tokens).toContain("auth")
      expect(chunks[3]!.symbol).toBe("MAX_RETRIES")
    }))

  it.effect("falls back to fixed windows for files with no symbols", () =>
    Effect.gen(function* () {
      const source = Array.from({ length: 70 }, (_, i) => `line ${i}`).join("\n")
      const chunks = chunkSource("notes.txt", source)
      expect(chunks.length).toBe(2)
      expect(chunks[0]!.startLine).toBe(1)
      expect(chunks[0]!.endLine).toBe(60)
      expect(chunks[1]!.startLine).toBe(61)
      expect(chunks[1]!.endLine).toBe(70)
      expect(chunks[1]!.symbol).toBeUndefined()
    }))
})

describe("bm25", () => {
  it.effect("ranks documents containing query terms above documents that do not", () =>
    Effect.gen(function* () {
      const docs = [
        ["handle", "user", "auth", "session", "token"],
        ["render", "homepage", "static", "assets"],
      ]
      const stats = computeStats(docs)
      const query = tokenize("user auth")
      expect(bm25Score(query, docs[0]!, stats)).toBeGreaterThan(0)
      expect(bm25Score(query, docs[1]!, stats)).toBe(0)
    }))

  it.effect("prefers documents with repeated query terms (term frequency)", () =>
    Effect.gen(function* () {
      const docs = [
        ["user", "user", "user", "login"],
        ["user", "login"],
      ]
      const stats = computeStats(docs)
      expect(bm25Score(["user"], docs[0]!, stats)).toBeGreaterThan(bm25Score(["user"], docs[1]!, stats))
    }))
})

describe("SemanticIndex", () => {
  it.effect("indexes a project and finds symbols by natural-language query", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        const indexPath = path.join(dir, "src")
        yield* Effect.promise(() => fs.mkdir(indexPath, { recursive: true }))
        yield* Effect.promise(() =>
          fs.writeFile(
            path.join(indexPath, "user.ts"),
            [
              "export class UserRepository {",
              "  constructor() {}",
              "}",
              "",
              "export function handleUserAuth(userId: string) {",
              "  return userId",
              "}",
            ].join("\n"),
          ),
        )
        yield* Effect.promise(() =>
          fs.writeFile(
            path.join(indexPath, "orders.ts"),
            "export function renderOrder(items: string[]) {\n  return items.join(',')\n}\n",
          ),
        )

        const index = yield* SemanticIndex.Service
        const results = yield* index.search("user auth", { directory: dir })

        expect(results.length).toBeGreaterThan(0)
        expect(results[0]!.path).toBe("src/user.ts")
        expect(results[0]!.symbol).toBe("handleUserAuth")
        expect(results[0]!.startLine).toBe(5)
      }),
    ))

  it.effect("does not re-chunk unchanged files on repeated syncs", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.writeFile(path.join(dir, "a.ts"), "export function alpha() {}\n"))
        const index = yield* SemanticIndex.Service

        yield* index.search("alpha", { directory: dir })
        const first = yield* index.sync(dir)
        const second = yield* index.sync(dir)

        expect(first.changed).toBe(0) // first search already indexed everything
        expect(second.changed).toBe(0)
        expect(second.chunks).toBe(first.chunks)
      }),
    ))

  it.effect("re-chunks a file whose content changed and forgets removed files", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        const target = path.join(dir, "a.ts")
        yield* Effect.promise(() => fs.writeFile(target, "export function originalName() {}\n"))
        const index = yield* SemanticIndex.Service

        yield* index.search("original", { directory: dir })
        expect((yield* index.search("original", { directory: dir }))[0]?.symbol).toBe("originalName")

        yield* Effect.promise(() => fs.writeFile(target, "export function renamedFunction() {}\n"))
        const renamed = yield* index.search("renamed", { directory: dir })
        expect(renamed[0]?.symbol).toBe("renamedFunction")
        expect(yield* index.search("original", { directory: dir })).toEqual([])

        yield* Effect.promise(() => fs.rm(target))
        const afterDelete = yield* index.search("renamed", { directory: dir })
        expect(afterDelete).toEqual([])
      }),
    ))

  it.effect("respects the limit option", () =>
    withTmpdir((dir) =>
      Effect.gen(function* () {
        for (const name of ["one.ts", "two.ts", "three.ts"]) {
          yield* Effect.promise(() =>
            fs.writeFile(path.join(dir, name), `export function commonFactor${name}() { /* ${name} */ }\n`),
          )
        }
        const index = yield* SemanticIndex.Service
        const limited = yield* index.search("commonFactor", { directory: dir, limit: 2 })
        const unlimited = yield* index.search("commonFactor", { directory: dir })
        expect(limited.length).toBe(2)
        expect(unlimited.length).toBe(3)
      }),
    ))
})