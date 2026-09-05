export * as SessionDrain from "./drain"

import { and, eq, lt } from "drizzle-orm"
import { DateTime, Effect } from "effect"
import type { Database } from "../database/database"
import { SessionSchema } from "./schema"
import { SessionDrainTable } from "./sql"

type DatabaseService = Database.Interface["db"]

/**
 * Durable drain lifecycle marker. A drain is the process-local series of
 * provider turns that settles admitted inputs for one Session.
 *
 * This marker gives a drain a durable identity and transcript boundary so
 * post-crash continuation recovery can be explicit: `start()` claims the
 * Session, `heartbeat()` records progress per turn, and `finish()` records a
 * terminal state. Crash recovery never auto-retries provider work; an operator
 * reviews `recover()` results and explicitly `retry()`s or `abandon()`s.
 */
export type Status = "running" | "completed" | "interrupted" | "abandoned"

const TERMINAL_STATUSES: readonly Status[] = ["completed", "interrupted", "abandoned"]

export const start = Effect.fn("SessionDrain.start")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  const existing = yield* db
    .select({ status: SessionDrainTable.status, attempt: SessionDrainTable.attempt })
    .from(SessionDrainTable)
    .where(eq(SessionDrainTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
  // A completed drain is a settled run; the next start is a fresh run. Any
  // non-terminal prior state means the last run never settled, so this is a
  // retry and the attempt counter climbs.
  const attempt = existing !== undefined && existing.status !== "completed" ? existing.attempt + 1 : 1
  const timestamp = Date.now()
  yield* db
    .insert(SessionDrainTable)
    .values({ session_id: sessionID, status: "running", attempt, time_started: timestamp, time_heartbeat: timestamp })
    .onConflictDoUpdate({
      target: SessionDrainTable.session_id,
      set: { status: "running", attempt, time_started: timestamp, time_heartbeat: timestamp, time_finished: null },
    })
    .run()
    .pipe(Effect.orDie)
})

export const heartbeat = Effect.fn("SessionDrain.heartbeat")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  step: number,
) {
  yield* db
    .update(SessionDrainTable)
    .set({ step, time_heartbeat: Date.now() })
    .where(eq(SessionDrainTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
})

export const finish = Effect.fn("SessionDrain.finish")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  status: Status,
) {
  const row = yield* db
    .select({ status: SessionDrainTable.status })
    .from(SessionDrainTable)
    .where(eq(SessionDrainTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
  if (row === undefined || TERMINAL_STATUSES.includes(row.status)) return
  const terminal = TERMINAL_STATUSES.includes(status)
  yield* db
    .update(SessionDrainTable)
    .set({ status, time_finished: terminal ? Date.now() : null })
    .where(eq(SessionDrainTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
})

export const list = Effect.fn("SessionDrain.list")(function* (db: DatabaseService) {
  return yield* db.select().from(SessionDrainTable).all().pipe(Effect.orDie)
})

/**
 * Mark running drains whose heartbeat has gone quiet as interrupted and return
 * them. A stale heartbeat means the owning process died or lost the drain; the
 * durable session_input rows remain, so an operator may explicitly retry.
 */
export const recover = Effect.fn("SessionDrain.recover")(function* (
  db: DatabaseService,
  staleBefore: Date,
) {
  return yield* db
    .update(SessionDrainTable)
    .set({ status: "interrupted", time_finished: Date.now() })
    .where(and(eq(SessionDrainTable.status, "running"), lt(SessionDrainTable.time_heartbeat, staleBefore.getTime())))
    .returning()
    .pipe(Effect.orDie)
})

/** Clear the durable marker so the next explicit wake starts a clean drain. */
export const retry = Effect.fn("SessionDrain.retry")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  yield* db.delete(SessionDrainTable).where(eq(SessionDrainTable.session_id, sessionID)).run().pipe(Effect.orDie)
})

/** Record an abandoned drain for audit; durable inputs remain untouched. */
export const abandon = Effect.fn("SessionDrain.abandon")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  yield* db
    .update(SessionDrainTable)
    .set({ status: "abandoned", time_finished: Date.now() })
    .where(eq(SessionDrainTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
})