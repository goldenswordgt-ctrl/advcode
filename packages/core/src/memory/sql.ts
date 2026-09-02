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

/**
 * Skills created FROM experience. The DB record keeps provenance + usage
 * stats; the actual markdown content lives on disk so the existing
 * SkillV2 loader picks it up as a normal skill source.
 */
export const SkillLearnedTable = sqliteTable(
  "skill_learned",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    description: text(),
    content: text().notNull(),
    source_session_id: text(),
    times_used: integer().notNull().default(0),
    times_improved: integer().notNull().default(0),
    last_used_at: integer(),
    ...Timestamps,
  },
  (table) => [index("skill_learned_name_idx").on(table.name)],
)

/** Named bot agents for bot mode. */
export const BotAgentTable = sqliteTable(
  "bot_agent",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    persona: text(),
    avatar: text(),
    model: text(),
    system_prompt: text(),
    ...Timestamps,
  },
  (table) => [index("bot_agent_name_idx").on(table.name)],
)

/** Cross-agent group chat messages. */
export const BotMessageTable = sqliteTable(
  "bot_message",
  {
    id: text().primaryKey(),
    bot_id: text().notNull(),
    channel: text().notNull(),
    body: text().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [index("bot_message_channel_idx").on(table.channel), index("bot_message_bot_idx").on(table.bot_id)],
)