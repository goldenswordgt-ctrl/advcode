export * as SemanticTokenize from "./tokenize"

/**
 * SemanticTokenize — identifier-aware tokenizer for the semantic index.
 *
 * Code identifiers are the atomic unit of "meaning" here: `getUserById`,
 * `user_id`, and `GET_USER_BY_ID` must all reduce to the same core terms so a
 * query for "user id" matches all three. The tokenizer splits one word into
 * words, with a small stopword set traded against noise (English articles +
 * code scaffolding tokens that carry no retrieval signal).
 */

const STOPWORDS = new Set([
  // english filler
  "the", "and", "for", "with", "this", "that", "from", "into", "onto", "are", "was", "were",
  "has", "have", "had", "its", "her", "his", "their", "them", "they", "you", "your", "our",
  "not", "but", "all", "any", "can", "could", "would", "should", "will", "shall", "may",
  "might", "must", "very", "just", "also", "than", "then", "when", "where", "which", "who",
  "whom", "whose", "what", "why", "how", "over", "under", "again", "further", "once",
  // code scaffolding
  "const", "var", "let", "class", "function", "return", "returns", "export", "import", "default",
  "public", "private", "protected", "static", "async", "await", "extends", "implements",
  "interface", "type", "enum", "namespace", "module", "new", "this", "super", "void", "null",
  "undefined", "true", "false", "get", "set", "strict", "readonly", "optional", "throws",
  "by", "returns",
])

/** Tokenize a single identifier / code string into searchable terms. */
export function tokenize(input: string): string[] {
  if (!input) return []
  // Split camelCase / PascalCase / snake_case / kebab-case / dot-notation.
  const split = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
  return split
}