import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-service-map"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionHooks } from "@opencode-ai/core/session/hooks"
import { SessionInput } from "@opencode-ai/core/session/input"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { Prompt } from "@opencode-ai/core/session/prompt"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { SessionStore } from "@opencode-ai/core/session/store"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionHooks.node,
      SessionProjector.node,
      SessionStore.node,
      SessionV2.node,
    ]),
    [
      [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
      [SessionExecution.node, SessionExecution.noopLayer],
    ],
  ),
)

const sessionID = SessionV2.ID.make("ses_hooks_test")

const insertSession = Effect.gen(function* () {
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

describe("SessionHooks", () => {
  it.effect("prompt.before rewrites the durable prompt before admission", () =>
    Effect.gen(function* () {
      yield* insertSession
      const session = yield* SessionV2.Service
      const hooks = yield* SessionHooks.Service
      yield* hooks.hook.promptBefore((event) => {
        event.prompt.text = `${event.prompt.text} [hooked]`
      })
      const messageID = SessionMessage.ID.make("msg_hooked")
      yield* session.prompt({
        sessionID,
        id: messageID,
        prompt: Prompt.make({ text: "hello" }),
        resume: false,
      })
      const { db } = yield* Database.Service
      const admitted = yield* SessionInput.find(db, messageID)
      expect(admitted).toMatchObject({ sessionID, prompt: { text: "hello [hooked]" } })
      expect(admitted?.delivery).toBe("steer")
    }),
  )

  it.effect("prompt.before hooks run in registration order and see prior mutations", () =>
    Effect.gen(function* () {
      yield* insertSession
      const session = yield* SessionV2.Service
      const hooks = yield* SessionHooks.Service
      yield* hooks.hook.promptBefore((event) => {
        event.prompt.text = `${event.prompt.text} first`
      })
      yield* hooks.hook.promptBefore((event) => {
        event.prompt.text = `${event.prompt.text} second`
      })
      const messageID = SessionMessage.ID.make("msg_ordered")
      yield* session.prompt({
        sessionID,
        id: messageID,
        prompt: Prompt.make({ text: "hello" }),
        resume: false,
      })
      const { db } = yield* Database.Service
      const admitted = yield* SessionInput.find(db, messageID)
      expect(admitted?.prompt.text).toBe("hello first second")
    }),
  )

  it.effect("prompt passes through untouched when no hooks are registered", () =>
    Effect.gen(function* () {
      yield* insertSession
      const session = yield* SessionV2.Service
      const messageID = SessionMessage.ID.make("msg_passthrough")
      yield* session.prompt({
        sessionID,
        id: messageID,
        prompt: Prompt.make({ text: "hello" }),
        resume: false,
      })
      const { db } = yield* Database.Service
      const admitted = yield* SessionInput.find(db, messageID)
      expect(admitted?.prompt.text).toBe("hello")
    }),
  )

  it.effect("turn.after receives the settled turn context", () =>
    Effect.gen(function* () {
      const hooks = yield* SessionHooks.Service
      let captured: SessionHooks.SessionTurnEvent | undefined
      yield* hooks.hook.turnAfter((event) => {
        captured = event
      })
      yield* hooks.runTurnAfter({
        sessionID: "ses_runner_test",
        step: 1,
        finish: "stop",
        modelID: "fake-model",
        providerID: "fake",
      })
      expect(captured).toEqual({
        sessionID: "ses_runner_test",
        step: 1,
        finish: "stop",
        modelID: "fake-model",
        providerID: "fake",
      })
    }),
  )
})