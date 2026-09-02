import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

/**
 * opencode2: Hermes-style persistent memory layer.
 *
 * Adds distilled cross-session memory + user model tables on top of the
 * existing session/message store. Session data stays untouched — this is a
 * pure additive layer.
 *
 * Tables:
 *   memory_entry        - distilled facts that survive across sessions
 *   memory_user_model   - compounding model of who the user is
 *   skill_learned       - skills created FROM experience (learning loop)
 *   bot_agent           - named bot agents (bot mode)
 *   bot_message         - cross-agent group chat messages
 */
export default {
  id: "20260902090000_opencode2_memory_layer",
  up(tx) {
    return Effect.gen(function* () {
      // Distilled cross-session memory entries.
      // One row = one durable fact. `source_session_id` keeps provenance.
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`memory_entry\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text,
          \`type\` text NOT NULL,
          \`key\` text NOT NULL,
          \`value\` text NOT NULL,
          \`importance\` integer NOT NULL DEFAULT 1,
          \`source\` text NOT NULL DEFAULT 'session',
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_last_accessed\` integer
        );
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`memory_entry_key_idx\` ON \`memory_entry\` (\`key\`);
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`memory_entry_type_idx\` ON \`memory_entry\` (\`type\`);
      `)

      // Compounding model of the user across sessions (Hermes "Honcho" analog).
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`memory_user_model\` (
          \`id\` text PRIMARY KEY,
          \`key\` text NOT NULL,
          \`value\` text NOT NULL,
          \`confidence\` real NOT NULL DEFAULT 0.5,
          \`source_session_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`memory_user_model_key_idx\` ON \`memory_user_model\` (\`key\`);
      `)

      // Learning loop: skills created from experience, self-improving.
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`skill_learned\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`description\` text,
          \`content\` text NOT NULL,
          \`source_session_id\` text,
          \`times_used\` integer NOT NULL DEFAULT 0,
          \`times_improved\` integer NOT NULL DEFAULT 0,
          \`last_used_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`skill_learned_name_idx\` ON \`skill_learned\` (\`name\`);
      `)

      // Bot mode: named agents with faces + group chat.
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`bot_agent\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`persona\` text,
          \`avatar\` text,
          \`model\` text,
          \`system_prompt\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`bot_message\` (
          \`id\` text PRIMARY KEY,
          \`bot_id\` text NOT NULL,
          \`channel\` text NOT NULL,
          \`body\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`bot_message_channel_idx\` ON \`bot_message\` (\`channel\`);
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`bot_message_bot_idx\` ON \`bot_message\` (\`bot_id\`);
      `)
    })
  },
} satisfies DatabaseMigration.Migration