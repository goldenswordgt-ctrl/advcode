export * as SemanticIndex from "./semantic-index"

import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"
import { join } from "path"
import { computeStats, score } from "./bm25"
import { chunkSource } from "./chunk"
import { tokenize } from "./tokenize"
import { SemanticIndexChunkTable, SemanticIndexFileTable } from "./sql"
import { Database } from "../database/database"
import { FSUtil } from "../fs-util"
import { Ripgrep } from "../ripgrep"
import { makeGlobalNode } from "../effect/app-node"

/**
 * SemanticIndex — incremental, structure-aware codebase search backed by BM25.
 *
 * A global core-owned service (directory-parameterized, like Ripgrep) that
 * builds a persistent token index of a project and answers natural queries
 * like "user auth handler" against *symbols*, not literal text.
 *
 * Incremental strategy (Merkle-style):
 *  - Each indexed file records an (mtime_ms, size) fingerprint in
 *    `semantic_index_file` (the change ledger).
 *  - A sync enumerates the tree (ripgrep --files, which respects .gitignore),
 *    stats every file, and re-chunks only those whose fingerprint changed.
 *  - Removed files drop their chunks + ledger rows. Deletion only runs when
 *    the enumeration is provably complete (fewer results than MAX_FILES), so
 *    a truncated listing can never nuke rows for files beyond the cap.
 */

export const MAX_FILES = 2000
const DEFAULT_LIMIT = 10
const MAX_FILE_BYTES = 1024 * 1024

/** Extensions that can never tokenize into meaningful identifiers. */
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif", "heic", "tiff",
  "mp3", "mp4", "mov", "webm", "wav", "flac", "ogg", "m4a", "aac",
  "zip", "gz", "tar", "bz2", "7z", "xz", "rar", "zst",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
  "woff", "woff2", "ttf", "otf", "eot",
  "exe", "dll", "so", "dylib", "bin", "wasm", "class", "o", "a", "lib", "obj",
  "db", "sqlite", "sqlite3", "lock",
])

export interface SearchResult {
  readonly path: string // project-relative (posix)
  readonly startLine: number
  readonly endLine: number
  readonly symbol: string | undefined
  readonly kind: string | undefined
  readonly score: number
}

export interface SyncStats {
  readonly files: number // candidate files enumerated
  readonly chunks: number // chunks indexed for the project
  readonly changed: number // files re-chunked on this sync
  readonly removed: number // files dropped on this sync
}

export interface Interface {
  /** Index (if stale) then rank chunks in `directory` against `query`. */
  readonly search: (query: string, options: { directory: string; limit?: number }) => Effect.Effect<SearchResult[]>
  /** Re-sync the index for `directory`, re-chunking only changed files. */
  readonly sync: (directory: string) => Effect.Effect<SyncStats>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SemanticIndex") {}

const isBinary = (path: string) => BINARY_EXTENSIONS.has(path.split(".").pop()?.toLowerCase() ?? "")

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service

    interface Fingerprint {
      file_path: string
      mtime_ms: number
      size: number
    }

    const removeFile = Effect.fn("SemanticIndex.removeFile")(function* (directory: string, filePath: string) {
      yield* db
        .delete(SemanticIndexChunkTable)
        .where(
          and(eq(SemanticIndexChunkTable.project_dir, directory), eq(SemanticIndexChunkTable.file_path, filePath)),
        )
        .run()
        .pipe(Effect.orDie)
      yield* db
        .delete(SemanticIndexFileTable)
        .where(and(eq(SemanticIndexFileTable.project_dir, directory), eq(SemanticIndexFileTable.file_path, filePath)))
        .run()
        .pipe(Effect.orDie)
    })

    const reindexFile = Effect.fn("SemanticIndex.reindexFile")(function* (directory: string, filePath: string) {
      const source = yield* fs.readFileStringSafe(join(directory, filePath)).pipe(Effect.orDie)
      if (source === undefined || source.length === 0) return 0

      const chunks = chunkSource(filePath, source)
      if (chunks.length > 0) {
        yield* db
          .delete(SemanticIndexChunkTable)
          .where(
            and(
              eq(SemanticIndexChunkTable.project_dir, directory),
              eq(SemanticIndexChunkTable.file_path, filePath),
            ),
          )
          .run()
          .pipe(Effect.orDie)
        yield* db
          .insert(SemanticIndexChunkTable)
          .values(
            chunks.map((chunk) => ({
              project_dir: directory,
              file_path: filePath,
              start_line: chunk.startLine,
              end_line: chunk.endLine,
              symbol: chunk.symbol,
              kind: chunk.kind,
              tokens: JSON.stringify(chunk.tokens),
            })),
          )
          .run()
          .pipe(Effect.orDie)
      }
      return chunks.length
    })

    const scan = Effect.fn("SemanticIndex.sync")(function* (directory: string) {
      // Enumerate text-like files. ripgrep --files respects .gitignore; the
      // explicit glob keeps us honest without double-scanning node_modules.
      const entries = yield* ripgrep
        .find({ cwd: directory, pattern: "**/*", limit: MAX_FILES, hidden: false })
        .pipe(Effect.orDie)
      const candidates = entries
        .map((entry) => String(entry.path))
        .filter((relative) => !isBinary(relative))
        .sort()

      const complete = candidates.length < MAX_FILES

      const ledger = yield* db
        .select({
          file_path: SemanticIndexFileTable.file_path,
          mtime_ms: SemanticIndexFileTable.mtime_ms,
          size: SemanticIndexFileTable.size,
        })
        .from(SemanticIndexFileTable)
        .where(eq(SemanticIndexFileTable.project_dir, directory))
        .all()
        .pipe(Effect.orDie)
      const byPath = new Map(ledger.map((row) => [row.file_path, row]))

      let changed = 0
      let removed = 0
      const seen = new Set<string>()

      for (const relative of candidates) {
        seen.add(relative)
        const info = yield* fs.stat(join(directory, relative)).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (info === undefined || info.type !== "File") continue
        if (Number(info.size) > MAX_FILE_BYTES) continue

        const mtimeMs = Option.getOrNull(info.mtime)?.getTime() ?? 0
        const size = Number(info.size)
        const stored = byPath.get(relative)
        if (stored && stored.mtime_ms === mtimeMs && stored.size === size) {
          continue // unchanged — no re-chunk
        }

        const chunks = yield* reindexFile(directory, relative)
        if (chunks > 0 || stored) {
          if (chunks > 0) {
            yield* db
              .insert(SemanticIndexFileTable)
              .values({ project_dir: directory, file_path: relative, mtime_ms: mtimeMs, size })
              .onConflictDoUpdate({
                target: [SemanticIndexFileTable.project_dir, SemanticIndexFileTable.file_path],
                set: { mtime_ms: mtimeMs, size },
              })
              .run()
              .pipe(Effect.orDie)
            changed++
          } else if (stored) {
            // File shrank to empty / unreadable: drop it entirely.
            yield* removeFile(directory, relative)
            removed++
          }
        }
      }

      // Only sweep deletions when the enumeration is complete; otherwise files
      // beyond the cap would be misread as removed.
      if (complete) {
        for (const row of ledger) {
          if (!seen.has(row.file_path)) {
            yield* removeFile(directory, row.file_path)
            removed++
          }
        }
      }

      const chunkRows = yield* db
        .select({ id: SemanticIndexChunkTable.id })
        .from(SemanticIndexChunkTable)
        .where(eq(SemanticIndexChunkTable.project_dir, directory))
        .all()
        .pipe(Effect.orDie)

      return { files: candidates.length, chunks: chunkRows.length, changed, removed }
    })

    const search = Effect.fn("SemanticIndex.search")(function* (query: string, options) {
      yield* scan(options.directory)
      const limit = options.limit ?? DEFAULT_LIMIT

      const rows = yield* db
        .select({
          file_path: SemanticIndexChunkTable.file_path,
          start_line: SemanticIndexChunkTable.start_line,
          end_line: SemanticIndexChunkTable.end_line,
          symbol: SemanticIndexChunkTable.symbol,
          kind: SemanticIndexChunkTable.kind,
          tokens: SemanticIndexChunkTable.tokens,
        })
        .from(SemanticIndexChunkTable)
        .where(eq(SemanticIndexChunkTable.project_dir, options.directory))
        .all()
        .pipe(Effect.orDie)
      if (rows.length === 0) return []

      const queryTokens = tokenize(query)
      if (queryTokens.length === 0) return []

      const docs = rows.map((row) => ({
        tokens: JSON.parse(row.tokens) as string[],
        row,
      }))
      const stats = computeStats(docs.map((doc) => doc.tokens))

      const scored = docs
        .map((doc) => ({ result: doc.row, score: score(queryTokens, doc.tokens, stats) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)

      return scored.slice(0, limit).map((hit) => ({
        path: hit.result.file_path,
        startLine: hit.result.start_line,
        endLine: hit.result.end_line,
        symbol: hit.result.symbol ?? undefined,
        kind: hit.result.kind ?? undefined,
        score: hit.score,
      }))
    })

    return Service.of({ search, sync: scan })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, FSUtil.node, Ripgrep.node] })