export * as SemanticChunk from "./chunk"

import { extractDefinitions } from "../repo-map/rank"
import { tokenize } from "./tokenize"

/**
 * SemanticChunk — structure-aware code chunker.
 *
 * Splits a source file into retrievable units whose boundaries follow the
 * file's own symbol definitions (reusing RepoMapRank.extractDefinitions, so
 * symbol detection never drifts between the repo map and the semantic index).
 * Each chunk carries its tokenized content up front so indexing never
 * re-lexes, and carries its source span so hits can be located precisely.
 */

export interface CodeChunk {
  readonly file: string // relative path (project-relative, posix)
  readonly startLine: number // 1-based, inclusive
  readonly endLine: number // 1-based, inclusive
  readonly symbol: string | undefined
  readonly kind: string | undefined
  readonly content: string
  readonly tokens: string[]
}

const FALLBACK_WINDOW_LINES = 60
const MAX_CHUNK_LINES = 300

/**
 * Chunk a source file into retrievable units.
 *
 * Symbol-defined chunks span from one definition to the next. Files with no
 * detectable symbols (markdown, JSON, configs, scripts) fall back to fixed-size
 * line windows so they still participate in search.
 */
export function chunkSource(file: string, source: string): CodeChunk[] {
  const lines = source.split("\n")
  const definitions = extractDefinitions(file, source).sort((a, b) => a.line - b.line)

  if (definitions.length === 0) {
    const chunks: CodeChunk[] = []
    for (let start = 0; start < lines.length; start += FALLBACK_WINDOW_LINES) {
      const end = Math.min(start + FALLBACK_WINDOW_LINES, lines.length)
      const content = lines.slice(start, end).join("\n")
      chunks.push({
        file,
        startLine: start + 1,
        endLine: end,
        symbol: undefined,
        kind: undefined,
        content,
        tokens: tokenize(content),
      })
    }
    return chunks
  }

  // Cap oversized spans (a 2k-line function) into bounded sub-chunks so a
  // single bomb symbol can't flush token budgets.
  const chunks: CodeChunk[] = []
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index]!
    const nextLine = index + 1 < definitions.length ? definitions[index + 1]!.line : lines.length + 1
    for (let start = definition.line; start < nextLine; start += MAX_CHUNK_LINES - 1) {
      const end = Math.min(start + MAX_CHUNK_LINES - 1, nextLine - 1)
      const content = lines.slice(start - 1, end).join("\n")
      chunks.push({
        file,
        startLine: start,
        endLine: end,
        symbol: definition.symbol,
        kind: definition.kind,
        content,
        tokens: tokenize(content),
      })
    }
  }
  return chunks
}