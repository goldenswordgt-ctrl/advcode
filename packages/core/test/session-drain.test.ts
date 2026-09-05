import { eq } from "drizzle-orm"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionDrain } from "@opencode-ai/core/session/drain"
import { SessionDrainTable } from "@opencode-ai/core/session/sql"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node])))

const sessionID = SessionV2.ID.make("ses_drain_test")

const seed = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: sessionID,
      directory: "/project",
      title: "test",
      version: "test",
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
})

describe("SessionDrain", () => {
  it.effect("records a running drain on start and completes it on finish", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seed
      yield* SessionDrain.start(db, sessionID)
      const running = yield* SessionDrain.list(db)
      expect(running).toHaveLength(1)
      expect(running[0].status).toBe("running")
      expect(running[0].attempt).toBe(1)
      expect(running[0].step).toBe(0)
      yield* SessionDrain.finish(db, sessionID, "completed")
      const completed = yield* SessionDrain.list(db)
      expect(completed[0].status).toBe("completed")
      expect(completed[0].time_finished).not.toBeNull()
    }),
  )

  it.effect("heartbeat records the current step", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seed
      yield* SessionDrain.start(db, sessionID)
      yield* SessionDrain.heartbeat(db, sessionID, 3)
      const rows = yield* SessionDrain.list(db)
      expect(rows[0].step).toBe(3)
    }),
  )

  it.effect("bumps the attempt when a non-completed drain restarts", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seed
      yield* SessionDrain.start(db, sessionID)
      yield* SessionDrain.finish(db, sessionID, "interrupted")
      yield* SessionDrain.start(db, sessionID)
      const rows = yield* SessionDrain.list(db)
      expect(rows[0].attempt).toBe(2)
      yield* SessionDrain.finish(db, sessionID, "completed")
      yield* SessionDrain.start(db, sessionID)
      const fresh = yield* SessionDrain.list(db)
      expect(fresh[0].attempt).toBe(1)
    }),
  )

  it.effect("finish never overwrites a terminal status", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seed
      yield* SessionDrain.start(db, sessionID)
      yield* SessionDrain.finish(db, sessionID, "abandoned")
      yield* SessionDrain.finish(db, sessionID, "interrupted")
      const rows = yield* SessionDrain.list(db)
      expect(rows[0].status).toBe("abandoned")
    }),
  )

  it.effect("recover only interrupts running drains with stale heartbeats", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seed
      yield* SessionDrain.start(db, sessionID)
      yield* SessionDrain.heartbeat(db, sessionID, 1)
      const stale = new Date(Date.now() - 60_000)
      const recovered = yield* SessionDrain.recover(db, stale)
      expect(recovered).toHaveLength(0)
      yield* db
        .update(SessionDrainTable)
        .set({ time_heartbeat: Date.now() - 120_000 })
        .where(eq(SessionDrainTable.session_id, sessionID))
        .run()
        .pipe(Effect.orDie)
      const recovered2 = yield* SessionDrain.recover(db, new Date(Date.now() - 60_000))
      expect(recovered2).toHaveLength(1)
      expect(recovered2[0].session_id).toBe(sessionID)
      expect(recovered2[0].status).toBe("interrupted")
    }),
  )

  it.effect("retry clears the marker so a restart begins clean", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      yield* seed
      yield* SessionDrain.start(db, sessionID)
      yield* SessionDrain.retry(db, sessionID)
      const rows = yield* SessionDrain.list(db)
      expect(rows).toHaveLength(0)
    }),
  )
})