import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

/**
 * Durable drain lifecycle marker for post-crash continuation recovery.
 * Handwritten (CREATE TABLE IF NOT EXISTS) because the live database already
 * carries tables the old snapshot never listed; a generated diff migration
 * would try to re-create them.
 */
export default {
  id: "20260905063008_session-drain",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`session_drain\` (
          \`session_id\` text PRIMARY KEY,
          \`status\` text NOT NULL,
          \`attempt\` integer NOT NULL,
          \`step\` integer DEFAULT 0 NOT NULL,
          \`time_started\` integer NOT NULL,
          \`time_heartbeat\` integer NOT NULL,
          \`time_finished\` integer,
          CONSTRAINT \`fk_session_drain_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration