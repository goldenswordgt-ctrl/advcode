export * as SessionTranscript from "./transcript"

import { Context, Effect, Layer, Schema } from "effect"
import { eq, desc } from "drizzle-orm"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"

/**
 * SessionTranscript — full session transcripts stored as markdown.
 *
 * Mirrors opencode's session-memory plugin: saves complete session
 * transcripts as markdown files alongside the existing SQLite memory.
 * Each session gets one transcript file + an entry in the index.
 */

// Schema
const TranscriptTable = sqliteTable("session_transcript", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  title: text(),
  agent: text(),
  model: text(),
  messages: integer().default(0),
  file_path: text().notNull(),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
})

export const Transcript = Schema.Struct({
  id: Schema.String,
  session_id: Schema.String,
  title: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  messages: Schema.optional(Schema.Number),
  file_path: Schema.String,
  time_created: Schema.Number,
  time_updated: Schema.Number,
})
export type Transcript = typeof Transcript.Type

export interface Interface {
  /** Save or update a session transcript */
  readonly save: (input: {
    session_id: string
    title?: string
    agent?: string
    model?: string
    messages?: number
    file_path: string
  }) => Effect.Effect<Transcript>
  /** Get a transcript by session ID */
  readonly get: (session_id: string) => Effect.Effect<Transcript | undefined>
  /** List all transcripts */
  readonly list: (limit?: number) => Effect.Effect<Transcript[]>
  /** Delete a transcript */
  readonly remove: (session_id: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode2/v2/SessionTranscript") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const save = Effect.fn("SessionTranscript.save")(function* (input) {
      const existing = yield* db
        .select()
        .from(TranscriptTable)
        .where(eq(TranscriptTable.session_id, input.session_id))
        .limit(1)
        .all()
        .pipe(Effect.orDie)

      const now = Date.now()
      if (existing.length > 0) {
        const row = existing[0]
        yield* db
          .update(TranscriptTable)
          .set({
            title: input.title ?? row.title,
            agent: input.agent ?? row.agent,
            model: input.model ?? row.model,
            messages: input.messages ?? row.messages,
            file_path: input.file_path,
            time_updated: now,
          })
          .where(eq(TranscriptTable.id, row.id))
          .run()
          .pipe(Effect.orDie)
        return {
          id: row.id,
          session_id: row.session_id,
          title: input.title ?? row.title,
          agent: input.agent ?? row.agent,
          model: input.model ?? row.model,
          messages: input.messages ?? row.messages,
          file_path: input.file_path,
          time_created: row.time_created,
          time_updated: now,
        } satisfies Transcript
      }

      const id = crypto.randomUUID()
      yield* db
        .insert(TranscriptTable)
        .values({
          id,
          session_id: input.session_id,
          title: input.title,
          agent: input.agent,
          model: input.model,
          messages: input.messages,
          file_path: input.file_path,
          time_created: now,
          time_updated: now,
        })
        .run()
        .pipe(Effect.orDie)

      return {
        id,
        session_id: input.session_id,
        title: input.title,
        agent: input.agent,
        model: input.model,
        messages: input.messages,
        file_path: input.file_path,
        time_created: now,
        time_updated: now,
      } satisfies Transcript
    })

    const get = Effect.fn("SessionTranscript.get")(function* (session_id) {
      const rows = yield* db
        .select()
        .from(TranscriptTable)
        .where(eq(TranscriptTable.session_id, session_id))
        .limit(1)
        .all()
        .pipe(Effect.orDie)
      if (rows.length === 0) return undefined
      const row = rows[0]
      return {
        id: row.id,
        session_id: row.session_id,
        title: row.title ?? undefined,
        agent: row.agent ?? undefined,
        model: row.model ?? undefined,
        messages: row.messages ?? undefined,
        file_path: row.file_path,
        time_created: row.time_created,
        time_updated: row.time_updated,
      } satisfies Transcript
    })

    const list = Effect.fn("SessionTranscript.list")(function* (limit = 50) {
      const rows = yield* db
        .select()
        .from(TranscriptTable)
        .orderBy(desc(TranscriptTable.time_updated))
        .limit(limit)
        .all()
        .pipe(Effect.orDie)
      return rows.map(
        (row) =>
          ({
            id: row.id,
            session_id: row.session_id,
            title: row.title ?? undefined,
            agent: row.agent ?? undefined,
            model: row.model ?? undefined,
            messages: row.messages ?? undefined,
            file_path: row.file_path,
            time_created: row.time_created,
            time_updated: row.time_updated,
          }) satisfies Transcript,
      )
    })

    const remove = Effect.fn("SessionTranscript.remove")(function* (session_id) {
      yield* db.delete(TranscriptTable).where(eq(TranscriptTable.session_id, session_id)).run().pipe(Effect.orDie)
    })

    return Service.of({ save, get, list, remove })
  }),
)

export const locationLayer = layer
export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
