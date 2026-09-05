export * as SemanticIndexSQL from "./sql"

import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core"

/**
 * Drizzle table mirror of the semantic_index migration. One row per indexed
 * file (change fingerprint) + one row per indexed code chunk (token set with
 * source position).
 */

export const SemanticIndexFileTable = sqliteTable(
  "semantic_index_file",
  {
    project_dir: text().notNull(),
    file_path: text().notNull(),
    mtime_ms: integer().notNull(),
    size: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.project_dir, table.file_path] })],
)

export const SemanticIndexChunkTable = sqliteTable(
  "semantic_index_chunk",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    project_dir: text().notNull(),
    file_path: text().notNull(),
    start_line: integer().notNull(),
    end_line: integer().notNull(),
    symbol: text(),
    kind: text(),
    tokens: text().notNull(),
  },
  (table) => [index("semantic_index_chunk_project_idx").on(table.project_dir)],
)