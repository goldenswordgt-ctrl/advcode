import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

/**
 * opencode2: Session transcript table.
 *
 * Stores full session transcripts as metadata alongside the existing
 * memory layer. The actual markdown files live in ~/.opencode/session-memory/.
 * This table provides a SQLite index for quick lookup and listing.
 */
export default {
  id: "20260903000000_session_transcript",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS \`session_transcript\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`title\` text,
          \`agent\` text,
          \`model\` text,
          \`messages\` integer,
          \`file_path\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`session_transcript_session_idx\` ON \`session_transcript\` (\`session_id\`);
      `)
      yield* tx.run(`
        CREATE INDEX IF NOT EXISTS \`session_transcript_updated_idx\` ON \`session_transcript\` (\`time_updated\`);
      `)
    })
  },
} satisfies DatabaseMigration.Migration
