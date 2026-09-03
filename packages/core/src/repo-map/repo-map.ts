export * as RepoMap from "./repo-map"

import { makeLocationNode } from "../effect/app-node"
import { Context, Effect, Layer } from "effect"
import { FSUtil } from "../fs-util"
import { Location } from "../location"
import path from "path"
import { Ripgrep } from "../ripgrep"
import { extractDefinitions, rankFiles, type Definition, type RankedFile } from "./rank"

/**
 * RepoMap — a token-budgeted, dependency-weighted map of a codebase.
 *
 * The agent sees this in system context as an orientation aid (Aider-style):
 * which files exist and what symbols they define. It pairs with LSP and file
 * reads — the map keeps the agent from cold-crawling a large tree every turn.
 *
 * Build pipeline:
 *   1. enumerate project files (ripgrep --files, which respects .gitignore)
 *   2. read each file, extract symbol definitions
 *   3. compute connectivity (cross-file symbol references) with a bounded grep
 *   4. rank by density + connectivity, then truncate to a token budget
 *
 * Everything is best-effort and bounded: a pathological repo can never stall or
 * fail a provider turn. If no map can be built, we return an empty string and
 * the system-context contributor simply omits it.
 */

const DEFAULT_TOKEN_BUDGET = 1000
const CHARS_PER_TOKEN = 4
const MAX_FILES = 400
const MAX_SYMBOLS_PER_FILE = 8
const MAX_REF_SYMBOLS = 80
const IGNORED_PREFIXES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "vendor",
  ".venv",
  "venv",
  ".cache",
  "coverage",
  ".turbo",
]

const isIgnored = (path: string) =>
  IGNORED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

// ripgrep needs at least one positive glob in a brace; a brace made only of
// negations (`!`) matches nothing. The leading `**/*` includes everything, and
// the negations keep ripgrep from descending into vendored/build trees.
const GLOB_EXCLUSIONS = `**/*,${IGNORED_PREFIXES.map((p) => `!**/${p}/**`).join(",")}`

export interface Interface {
  /** Build the repo map for the current location, budgeted to `tokenBudget` tokens. */
  readonly build: (tokenBudget?: number) => Effect.Effect<string, never>
}

export class Service extends Context.Service<Service, Interface>()("@advcode/RepoMap") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service

    const build = Effect.fn("RepoMap.build")(function* (tokenBudget = DEFAULT_TOKEN_BUDGET) {
      const projectDir = location.project.directory
      const charBudget = tokenBudget * CHARS_PER_TOKEN

      // 1. Enumerate files. ripgrep --files respects .gitignore.
      const entries = yield* ripgrep
        .find({ cwd: projectDir, pattern: `{${GLOB_EXCLUSIONS}}`, limit: MAX_FILES })
        .pipe(Effect.catch(() => Effect.succeed([])))
      const paths = entries
        .flatMap((e) => (e.path === undefined ? [] : [e.path as unknown as string]))
        .filter((f) => !isIgnored(f))

      // 2. Read + extract definitions (bounded concurrency). ripgrep yields
      //    project-relative paths, so resolve them against the project dir
      //    before reading.
      const candidates: RankedFile[] = []
      yield* Effect.forEach(
        paths,
        (file) =>
          fs
            .readFileStringSafe(path.join(projectDir, file))
            .pipe(
              Effect.map((source) => {
                if (source === undefined) return
                const definitions = extractDefinitions(file, source)
                if (definitions.length === 0) return
                candidates.push({ path: file, definitions, rank: 0 })
              }),
              Effect.catch(() => Effect.void),
            ),
        { concurrency: 16 },
      )

      if (candidates.length === 0) return ""

      // 3. Connectivity: how many files reference each file's symbols. Bounded
      //    batch grep over the top symbols of the candidate set.
      const connectivity = new Map<string, number>()
      const refSymbols = candidates
        .flatMap((c) => c.definitions.slice(0, 6).map((d) => d.symbol))
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .slice(0, MAX_REF_SYMBOLS)
      if (refSymbols.length > 0) {
        const query = refSymbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
        const matches = yield* ripgrep
          .grep({ cwd: projectDir, pattern: `\\b(${query})\\b`, limit: 12000 })
          .pipe(Effect.catch(() => Effect.succeed([])))
        for (const m of matches) {
          const p = m.entry?.path as unknown as string | undefined
          if (p === undefined) continue
          connectivity.set(p, (connectivity.get(p) ?? 0) + 1)
        }
      }

      // 4. Rank + render under the token budget. A file's centrality = its
      //    symbol count (how much the codebase exposes through it) plus a
      //    connectivity weight (how often its symbols are referenced elsewhere).
      const ranked = rankFiles(
        candidates.map((c) => {
          const conn = connectivity.get(c.path) ?? 0
          return {
            ...c,
            rank: c.definitions.length + Math.min(conn, 50) * 10,
          }
        }),
      )

      const render = (file: RankedFile): string =>
        `${file.path} :: ${file.definitions
          .slice(0, MAX_SYMBOLS_PER_FILE)
          .map((d: Definition) => `${d.kind}:${d.symbol}`)
          .join(", ")}`

      const lines: string[] = []
      let used = 0
      for (const file of ranked) {
        const line = render(file)
        used += line.length + 1
        if (used > charBudget && lines.length > 0) break
        lines.push(line)
      }

      if (lines.length === 0) return ""

      return [
        "<repo_map>",
        "Project overview by file and the symbols they define, ranked by centrality.",
        ...lines,
        `</repo_map> (${lines.length} files shown under a ${tokenBudget}-token budget)`,
      ].join("\n")
    })

    return Service.of({ build })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Location.node, FSUtil.node, Ripgrep.node],
})
