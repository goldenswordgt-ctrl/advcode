export * as SkillSQL from "./sql"

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"

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