export * as RepoMapRank from "./rank"

/**
 * RepoMapRank — lightweight symbol extraction + ranking for the repo map.
 *
 * This is the "graph ranking" half of the Aider-style repo map. We avoid a
 * heavyweight tree-sitter grammar dependency for every language by using a
 * small, extension-keyed set of symbol-definition regexes (the approach Aider
 * itself falls back to). Ranking approximates graph centrality with two cheap
 * signals:
 *
 *   1. symbol density — how many definitions a file carries per line (a proxy
 *      for how much of the codebase "depends conceptually" on it)
 *   2. connectivity — how often the file's exported symbols are referenced
 *      elsewhere (measured with a bounded ripgrep at build time)
 *
 * The result is a token-budgeted, dependency-weighted map the agent can use to
 * orient itself in a codebase before it reads individual files.
 */

export interface Definition {
  readonly symbol: string
  readonly kind: "function" | "class" | "interface" | "type" | "const" | "enum" | "module" | "method"
  readonly line: number
}

export interface RankedFile {
  readonly path: string
  readonly definitions: Definition[]
  readonly rank: number
}

/**
 * Extension-keyed symbol-definition patterns. Each captures the symbol name in
 * group 1 and the starting line via the optional line parameter. Order matters:
 * more specific patterns come before general ones.
 */
const EXT_PATTERNS: ReadonlyArray<{ extensions: string[]; patterns: RegExp[] }> = [
  {
    extensions: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
    patterns: [
      /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
      /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*([A-Za-z_$][\w$]*)/gm,
      /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)/gm,
      /^\s*export\s+type\s+([A-Za-z_$][\w$]*)\s*=/gm,
      /^\s*export\s+enum\s+([A-Za-z_$][\w$]*)/gm,
      /^\s*export\s+const\s+([A-Za-z_$][\w$]*)/gm,
      /^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm,
      /^\s*export\s+namespace\s+([A-Za-z_$][\w$]*)/gm,
    ],
  },
  {
    extensions: ["py"],
    patterns: [
      /^(?:async\s+)?def\s+([a-zA-Z_]\w*)/gm,
      /^class\s+([a-zA-Z_]\w*)/gm,
    ],
  },
  {
    extensions: ["rs"],
    patterns: [
      /^(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z_]\w*)/gm,
      /^(?:pub\s+)?struct\s+([a-zA-Z_]\w*)/gm,
      /^(?:pub\s+)?enum\s+([a-zA-Z_]\w*)/gm,
      /^(?:pub\s+)?trait\s+([a-zA-Z_]\w*)/gm,
      /^(?:pub\s+)?mod\s+([a-zA-Z_]\w*)/gm,
      /^(?:pub\s+)?type\s+([a-zA-Z_]\w*)/gm,
    ],
  },
  {
    extensions: ["go"],
    patterns: [
      /^func\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)/gm,
      /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/gm,
    ],
  },
  {
    extensions: ["java", "kt", "scala"],
    patterns: [
      /^(?:public|private|protected|internal)?\s*(?:abstract\s+|final\s+|static\s+)*class\s+([A-Za-z_]\w*)/gm,
      /^(?:public|private|protected|internal)?\s*interface\s+([A-Za-z_]\w*)/gm,
      /^(?:public|private|protected|internal)?\s*(?:fun|def)\s+([a-zA-Z_]\w*)/gm,
    ],
  },
  {
    extensions: ["c", "h", "cpp", "hpp", "cxx", "cc"],
    patterns: [
      /^[A-Za-z_][\w\s\*&:<>]*\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{/gm,
      /^\s*(?:class|struct|enum|namespace)\s+([A-Za-z_]\w*)/gm,
    ],
  },
  {
    extensions: ["rb"],
    patterns: [
      /^(?:def|def self)\.?\s+([a-zA-Z_]\w*)/gm,
      /^class\s+([A-Za-z_]\w*)/gm,
      /^module\s+([A-Za-z_]\w*)/gm,
    ],
  },
  {
    extensions: ["php"],
    patterns: [
      /^(?:public|private|protected)?\s*function\s+([a-zA-Z_]\w*)/gm,
      /^class\s+([A-Za-z_]\w*)/gm,
      /^interface\s+([A-Za-z_]\w*)/gm,
    ],
  },
  {
    extensions: ["sh", "bash", "zsh"],
    patterns: [
      /^([a-zA-Z_]\w*)\s*\(\s*\)\s*\{/gm,
      /^(?:function\s+)?([a-zA-Z_]\w*)\s*\(/gm,
    ],
  },
]

const extensionFor = (file: string) => {
  const match = /\.([a-zA-Z0-9]+)$/.exec(file)
  return match ? match[1].toLowerCase() : ""
}

const patternsFor = (file: string): ReadonlyArray<RegExp> => {
  const ext = extensionFor(file)
  if (!ext) return []
  for (const entry of EXT_PATTERNS) {
    if (entry.extensions.includes(ext)) return entry.patterns
  }
  return []
}

const kindFor = (pattern: RegExp): Definition["kind"] => {
  const src = pattern.source
  if (src.includes("class")) return "class"
  if (src.includes("interface")) return "interface"
  if (src.includes("enum")) return "enum"
  if (src.includes("namespace") || src.includes("mod")) return "module"
  if (src.includes("type")) return "type"
  if (src.includes("const")) return "const"
  if (src.includes("def self") || src.includes("function")) return "function"
  return "function"
}

/**
 * Extract definition symbols from a file's source text. Line numbers are
 * 1-based to match ripgrep / editors.
 */
export function extractDefinitions(path: string, source: string): Definition[] {
  const patterns = patternsFor(path)
  if (patterns.length === 0) return []
  const definitions: Definition[] = []
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      const symbol = match[1]
      if (!symbol) continue
      // The match may start on a leading blank line because the patterns open
      // with `^\s*`, letting `\s*` swallow a preceding newline. Anchor the line
      // to the symbol's own offset so 1-based line numbers match ripgrep.
      const symbolOffset = match.index + match[0].indexOf(symbol)
      const line = source.slice(0, symbolOffset).split("\n").length
      definitions.push({ symbol, kind: kindFor(pattern), line })
    }
  }
  // Dedupe identical symbol names on the same line (overlapping regexes).
  const seen = new Set<string>()
  return definitions.filter((d) => {
    const key = `${d.symbol}:${d.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Rank a set of files. The caller precomputes each file's `rank` (a composite
 * centrality score, e.g. connectivity + symbol count). Here we only add a small
 * density tiebreaker (definitions per source line) and return the sorted order.
 * Higher rank + density sorts earlier so the most central files lead the map.
 */
export function rankFiles(files: ReadonlyArray<RankedFile>): RankedFile[] {
  return files
    .map((file) => {
      const lineCount =
        file.definitions.reduce((acc, d) => Math.max(acc, d.line), 1) + 1
      const density = file.definitions.length / lineCount
      return { ...file, rank: file.rank + density }
    })
    .toSorted((a, b) => b.rank - a.rank)
}
