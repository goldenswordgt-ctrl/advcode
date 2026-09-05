import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260905091439_deep_shocker",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`semantic_index_chunk\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT,
          \`project_dir\` text NOT NULL,
          \`file_path\` text NOT NULL,
          \`start_line\` integer NOT NULL,
          \`end_line\` integer NOT NULL,
          \`symbol\` text,
          \`kind\` text,
          \`tokens\` text NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`semantic_index_file\` (
          \`project_dir\` text NOT NULL,
          \`file_path\` text NOT NULL,
          \`mtime_ms\` integer NOT NULL,
          \`size\` integer NOT NULL,
          CONSTRAINT \`semantic_index_file_pk\` PRIMARY KEY(\`project_dir\`, \`file_path\`)
        );
      `)
      yield* tx.run(`CREATE INDEX \`semantic_index_chunk_project_idx\` ON \`semantic_index_chunk\` (\`project_dir\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
