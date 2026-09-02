export * as BotSQL from "./sql"

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"

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
    ...Timestamps,
  },
  (table) => [index("bot_message_channel_idx").on(table.channel), index("bot_message_bot_idx").on(table.bot_id)],
)