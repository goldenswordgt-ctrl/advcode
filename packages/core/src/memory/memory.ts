export * as MemoryV2 from "./memory"

import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { MemoryEntryTable, MemoryUserModelTable } from "./sql"
import { eq, and, desc, like, gt } from "drizzle-orm"
import { makeGlobalNode } from "../effect/app-node"

/**
 * MemoryV2 — distilled cross-session memory.
 *
 * Unlike the raw session transcript (which OpenCode already stores in
 * SQLite), this layer keeps compact durable FACTS that survive across
 * sessions: who the user is, what they prefer, what the project needs,
 * what workflows work. This is the "coworker who remembers you" part.
 */

export const Type = Schema.Literals([
  "user", // facts about the user
  "project", // facts about a project/repo
  "workflow", // facts about how work gets done
  "preference", // user preferences
  "decision", // decisions made and why
  "lesson", // lessons learned
])
export type Type = typeof Type.Type

export const Entry = Schema.Struct({
  id: Schema.String,
  session_id: Schema.optional(Schema.String),
  type: Type,
  key: Schema.String,
  value: Schema.String,
  importance: Schema.optional(Schema.Number),
  source: Schema.optional(Schema.String),
  time_created: Schema.optional(Schema.Number),
})
export type Entry = typeof Entry.Type

export interface Interface {
  /** Store a durable fact. Upserts on (type, key). */
  readonly remember: (input: {
    type: Type
    key: string
    value: string
    importance?: number
    session_id?: string
  }) => Effect.Effect<Entry>
  /** Recall facts matching a key prefix or type. */
  readonly recall: (opts: { type?: Type; key?: string; limit?: number }) => Effect.Effect<Entry[]>
  /** Recall facts by search string across key+value. */
  readonly search: (query: string, limit?: number) => Effect.Effect<Entry[]>
  /** Recall the N most important recent facts. */
  readonly recallTop: (limit: number) => Effect.Effect<Entry[]>
  /** Drop a fact by id or (type, key). */
  readonly forget: (opts: { id?: string; type?: Type; key?: string }) => Effect.Effect<void>
  /** User model: upsert a belief about the user with confidence. */
  readonly rememberUser: (input: { key: string; value: string; confidence?: number; session_id?: string }) => Effect.Effect<void>
  /** User model: read the current beliefs. */
  readonly recallUser: () => Effect.Effect<ReadonlyArray<{ key: string; value: string; confidence: number }>>
}

export class Service extends Context.Service<Service, Interface>()("@opencode2/v2/Memory") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const remember = Effect.fn("MemoryV2.remember")(function* (input) {
      const id = crypto.randomUUID()
      const existing = yield* db
        .select()
        .from(MemoryEntryTable)
        .where(and(eq(MemoryEntryTable.type, input.type), eq(MemoryEntryTable.key, input.key)))
        .limit(1)
        .all()
        .pipe(Effect.orDie)
      const row = existing[0]
      if (row) {
        yield* db
          .update(MemoryEntryTable)
          .set({ value: input.value, importance: input.importance ?? row.importance, time_updated: Date.now() })
          .where(eq(MemoryEntryTable.id, row.id))
          .run()
          .pipe(Effect.orDie)
        return {
          id: row.id,
          session_id: row.session_id ?? undefined,
          type: input.type,
          key: input.key,
          value: input.value,
          importance: input.importance ?? row.importance,
          source: row.source ?? undefined,
          time_created: row.time_created,
        } satisfies Entry
      }
      yield* db
        .insert(MemoryEntryTable)
        .values({
          id,
          session_id: input.session_id ?? null,
          type: input.type,
          key: input.key,
          value: input.value,
          importance: input.importance ?? 1,
          source: "session",
          time_created: Date.now(),
          time_updated: Date.now(),
          time_last_accessed: Date.now(),
        })
        .run()
        .pipe(Effect.orDie)
      return {
        id,
        session_id: input.session_id,
        type: input.type,
        key: input.key,
        value: input.value,
        importance: input.importance ?? 1,
        source: "session",
        time_created: Date.now(),
      } satisfies Entry
    })

    const recall = Effect.fn("MemoryV2.recall")(function* (opts) {
      const limit = opts.limit ?? 20
      const conditions = []
      if (opts.type) conditions.push(eq(MemoryEntryTable.type, opts.type))
      if (opts.key) conditions.push(like(MemoryEntryTable.key, `%${opts.key}%`))
      const where = conditions.length > 0 ? and(...conditions) : undefined
      const rows = yield* (where
        ? db
            .select()
            .from(MemoryEntryTable)
            .where(where)
            .orderBy(desc(MemoryEntryTable.importance))
            .limit(limit)
            .all()
        : db.select().from(MemoryEntryTable).orderBy(desc(MemoryEntryTable.importance)).limit(limit).all()).pipe(
        Effect.orDie,
      )
      // Touch last-accessed for recency-biased recall.
      if (rows.length > 0) {
        yield* db
          .update(MemoryEntryTable)
          .set({ time_last_accessed: Date.now() })
          .where(eq(MemoryEntryTable.id, rows[0].id))
          .run()
          .pipe(Effect.ignore)
      }
      return rows.map((r) => ({
        id: r.id,
        session_id: r.session_id ?? undefined,
        type: r.type as Type,
        key: r.key,
        value: r.value,
        importance: r.importance,
        source: r.source ?? undefined,
        time_created: r.time_created,
      } satisfies Entry))
    })

    const search = Effect.fn("MemoryV2.search")(function* (query, limit = 20) {
      const rows = yield* db
        .select()
        .from(MemoryEntryTable)
        .where(like(MemoryEntryTable.value, `%${query}%`))
        .orderBy(desc(MemoryEntryTable.importance))
        .limit(limit)
        .all()
        .pipe(Effect.orDie)
      return rows.map((r) => ({
        id: r.id,
        session_id: r.session_id ?? undefined,
        type: r.type as Type,
        key: r.key,
        value: r.value,
        importance: r.importance,
        source: r.source ?? undefined,
        time_created: r.time_created,
      } satisfies Entry))
    })

    const recallTop = Effect.fn("MemoryV2.recallTop")(function* (limit) {
      return yield* recall({ limit })
    })

    const forget = Effect.fn("MemoryV2.forget")(function* (opts) {
      if (opts.id) {
        yield* db.delete(MemoryEntryTable).where(eq(MemoryEntryTable.id, opts.id)).run().pipe(Effect.orDie)
        return
      }
      if (opts.type && opts.key) {
        yield* db
          .delete(MemoryEntryTable)
          .where(and(eq(MemoryEntryTable.type, opts.type), eq(MemoryEntryTable.key, opts.key)))
          .run()
          .pipe(Effect.orDie)
      }
    })

    const rememberUser = Effect.fn("MemoryV2.rememberUser")(function* (input) {
      const existing = yield* db
        .select()
        .from(MemoryUserModelTable)
        .where(eq(MemoryUserModelTable.key, input.key))
        .limit(1)
        .all()
        .pipe(Effect.orDie)
      const confidence = input.confidence ?? 0.5
      if (existing[0]) {
        yield* db
          .update(MemoryUserModelTable)
          .set({ value: input.value, confidence, time_updated: Date.now() })
          .where(eq(MemoryUserModelTable.id, existing[0].id))
          .run()
          .pipe(Effect.orDie)
      } else {
        yield* db
          .insert(MemoryUserModelTable)
          .values({
            id: crypto.randomUUID(),
            key: input.key,
            value: input.value,
            confidence,
            source_session_id: input.session_id ?? null,
            time_created: Date.now(),
            time_updated: Date.now(),
          })
          .run()
          .pipe(Effect.orDie)
      }
    })

    const recallUser = Effect.fn("MemoryV2.recallUser")(function* () {
      const rows = yield* db
        .select()
        .from(MemoryUserModelTable)
        .orderBy(desc(MemoryUserModelTable.confidence))
        .all()
        .pipe(Effect.orDie)
      return rows.map((r) => ({ key: r.key, value: r.value, confidence: r.confidence }))
    })

    return Service.of({
      remember,
      recall,
      search,
      recallTop,
      forget,
      rememberUser,
      recallUser,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })