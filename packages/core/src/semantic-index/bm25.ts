export * as SemanticBm25 from "./bm25"

/**
 * SemanticBm25 — BM25 ranking over identifier token sets.
 *
 * Classic Okapi BM25 with k1=1.2, b=0.75. Documents here are code chunks and
 * their "words" are the identifier tokens produced by SemanticTokenize, so the
 * whole pipeline stays pure TS — no external index, no FTS5, no vector store.
 */

export interface Bm25Stats {
  readonly docCount: number
  readonly avgDocLen: number
  readonly df: ReadonlyMap<string, number>
}

const K1 = 1.2
const B = 0.75

/** Compute corpus statistics (doc frequency, average length) for scoring. */
export function computeStats(docs: ReadonlyArray<readonly string[]>): Bm25Stats {
  const df = new Map<string, number>()
  let totalLen = 0
  for (const tokens of docs) {
    totalLen += tokens.length
    for (const term of new Set(tokens)) {
      df.set(term, (df.get(term) ?? 0) + 1)
    }
  }
  const docCount = docs.length
  return { docCount, avgDocLen: docCount === 0 ? 0 : totalLen / docCount, df }
}

function idf(df: number, docCount: number): number {
  // Smoothed inverse document frequency: ln(1 + (N - df + 0.5)/(df + 0.5)).
  return Math.log(1 + (docCount - df + 0.5) / (df + 0.5))
}

/** Score one document against a query using precomputed corpus stats. */
export function score(queryTokens: readonly string[], docTokens: readonly string[], stats: Bm25Stats): number {
  if (stats.docCount === 0 || docTokens.length === 0) return 0
  const docLen = docTokens.length

  const seen = new Set<string>()
  let total = 0
  for (const term of queryTokens) {
    if (seen.has(term)) continue
    seen.add(term)

    const df = stats.df.get(term) ?? 0
    if (df === 0) continue

    // Term frequency in this doc.
    let tf = 0
    for (const token of docTokens) if (token === term) tf++
    if (tf === 0) continue

    const norm = K1 * (1 - B + B * (docLen / stats.avgDocLen))
    total += idf(df, stats.docCount) * ((tf * (K1 + 1)) / (tf + norm))
  }
  return total
}