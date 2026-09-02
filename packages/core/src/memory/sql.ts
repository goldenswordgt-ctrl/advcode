export * as MemorySQL from "./sql"

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"

/**
 * Distilled cross-session memory. One row = one durable fact.
 * Type distinguishes user facts, project facts, workflow facts, etc.
 */
export const MemoryEntryTable = sqliteTable(
  "memory_entry",
  {
    id: text().primaryKey(),
    session_id: text(),
    type: text().notNull(),
    key: text().notNull(),
    value: text().notNull(),
    importance: integer().notNull().default(1),
    source: text().notNull().default("session"),
    ...Timestamps,
    time_last_accessed: integer(),
  },
  (table) => [index("memory_entry_key_idx").on(table.key), index("memory_entry_type_idx").on(table.type)],
)

/**
 * Compounding model of the user across sessions.
 * Confidence reflects how sure we are that this fact still holds.
 */
export const MemoryUserModelTable = sqliteTable(
  "memory_user_model",
  {
    id: text().primaryKey(),
    key: text().notNull(),
    value: text().notNull(),
    confidence: real().notNull().default(0.5),
    source_session_id: text(),
    ...Timestamps,
  },
  (table) => [index("memory_user_model_key_idx").on(table.key)],
)
