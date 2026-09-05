import { describe, expect } from "bun:test"
import {
  LLMClient,
  LLMError,
  LLMEvent,
  Model,
  type LLMClientShape,
  type LLMRequest,
} from "@opencode-ai/llm"
import * as OpenAIChat from "@opencode-ai/llm/protocols/openai-chat"
import { Database } from "@opencode-ai/core/database/database"
import { makeLocationNode } from "@opencode-ai/core/effect/app-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { QuestionV2 } from "@opencode-ai/core/question"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { Snapshot } from "@opencode-ai/core/snapshot"
import { SessionInput } from "@opencode-ai/core/session/input"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionRunCoordinator } from "@opencode-ai/core/session/run-coordinator"
import { SessionRunner } from "@opencode-ai/core/session/runner"
import * as SessionRunnerLLM from "@opencode-ai/core/session/runner/llm"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Config } from "@opencode-ai/core/config"
import { ConfigCompaction } from "@opencode-ai/core/config/compaction"
import { Tool } from "@opencode-ai/core/tool/tool"
import { SessionInputTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionStore } from "@opencode-ai/core/session/store"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SystemContextRegistry } from "@opencode-ai/core/system-context/registry"
import { SkillGuidance } from "@opencode-ai/core/skill/guidance"
import { ReferenceGuidance } from "@opencode-ai/core/reference/guidance"
import { ModelV2 } from "@opencode-ai/core/model"
import { Location } from "@opencode-ai/core/location"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Effect, Layer, Schema, Stream } from "effect"
import { and, eq } from "drizzle-orm"
import { testEffect } from "./lib/effect"

const requests: LLMRequest[] = []
let responses: LLMEvent[][] | undefined
let streamFailure: LLMError | undefined
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      const events = streamFailure
        ? Stream.fail(streamFailure)
        : Stream.fromIterable(responses === undefined ? [] : (responses.shift() ?? []))
      return events
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const authorizations: Tool.Context[] = []
const executions: string[] = []
const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: () => Effect.die("unused"),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const bash = Layer.effectDiscard(
  ToolRegistry.Service.use((registry) =>
    registry.register({
      bash: Tool.make({
        description: "Run a shell command",
        input: Schema.Struct({ command: Schema.String }),
        output: Schema.Struct({ done: Schema.Boolean }),
        toModelOutput: ({ output }) => [{ type: "text", text: `done: ${output.done}` }],
        execute: ({ command }, context) =>
          Effect.sync(() => {
            authorizations.push(context)
            executions.push(command)
            return { done: true }
          }),
      }),
    }),
  ),
)
const bashNode = makeLocationNode({ name: "test/session-background-tools", layer: bash, deps: [ToolRegistry.node] })
const models = SessionRunnerModel.layerWith((session) => Effect.succeed(session.model?.id === "replacement" ? model : model))
const systemContextKey = SystemContext.Key.make("test/background-context")
const systemContext = Layer.effectDiscard(
  SystemContextRegistry.Service.pipe(
    Effect.flatMap((registry) =>
      registry.register({
        key: systemContextKey,
        load: Effect.succeed(
          SystemContext.combine([
            SystemContext.make({
              key: systemContextKey,
              codec: Schema.toCodecJson(Schema.String),
              load: Effect.succeed("background context"),
              baseline: String,
              update: (_previous, current) => current,
              removed: () => "removed",
            }),
          ]),
        ),
      }),
    ),
  ),
).pipe(Layer.provideMerge(AppNodeBuilder.build(SystemContextRegistry.node)))
const skillGuidance = Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const referenceGuidance = Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const config = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({
          type: "document",
          info: new Config.Info({
            compaction: new ConfigCompaction.Info({
              buffer: 3_000,
              keep: new ConfigCompaction.Keep({ tokens: 1_000 }),
            }),
          }),
        }),
      ]),
  }),
)
const runnerLayer = AppNodeBuilder.build(SessionRunnerLLM.node, [
  [Snapshot.node, Snapshot.noopLayer],
  [LayerNodePlatform.llmClient, client],
  [SessionRunnerModel.node, models],
  [SystemContextRegistry.node, systemContext],
  [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
  [SkillGuidance.node, skillGuidance],
  [ReferenceGuidance.node, referenceGuidance],
  [PermissionV2.node, permission],
  [Config.node, config],
])
const execution = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const sessionRunner = yield* SessionRunner.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
      drain: (sessionID, force) => sessionRunner.run({ sessionID, force }),
    })
    return SessionExecution.Service.of({
      active: coordinator.active,
      resume: coordinator.run,
      wake: coordinator.wake,
      interrupt: coordinator.interrupt,
    })
  }),
).pipe(Layer.provide(runnerLayer))
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      QuestionV2.node,
      SessionProjector.node,
      SessionStore.node,
      AgentV2.node,
      ToolRegistry.node,
      bashNode,
      SessionRunnerModel.node,
      SystemContextRegistry.node,
      SkillGuidance.node,
      ReferenceGuidance.node,
      Config.node,
      Snapshot.node,
      SessionRunnerLLM.node,
      SessionExecution.node,
      SessionV2.node,
    ]),
    [
      [LayerNodePlatform.llmClient, client],
      [PermissionV2.node, permission],
      [SessionRunnerModel.node, models],
      [SystemContextRegistry.node, systemContext],
      [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
      [SkillGuidance.node, skillGuidance],
      [ReferenceGuidance.node, referenceGuidance],
      [Snapshot.node, Snapshot.noopLayer],
      [SessionExecution.node, execution],
      [Config.node, config],
    ],
  ),
)
const sessionID = SessionV2.ID.make("ses_background_tool")

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

const waitForSteer = Effect.gen(function* () {
  const { db } = yield* Database.Service
  for (let i = 0; i < 100; i++) {
    const rows = yield* db
      .select()
      .from(SessionInputTable)
      .where(and(eq(SessionInputTable.session_id, sessionID), eq(SessionInputTable.delivery, "steer")))
      .all()
      .pipe(Effect.orDie)
    const completion = rows.find((row) => row.prompt.text.includes("[background job"))
    if (completion) return completion
    yield* Effect.sleep("50 millis")
  }
  return yield* Effect.die("background job completion steer was never admitted")
})

describe("background tool settlement", () => {
  it.effect("runs a background tool as a job and admits a completion steer", () =>
    Effect.gen(function* () {
      yield* insertSession
      yield* Effect.sync(() => {
        requests.length = 0
        executions.length = 0
        responses = [
          [
            LLMEvent.stepStart({ index: 0 }),
            LLMEvent.toolCall({ id: "call-bash", name: "bash", input: { command: "echo hello" } }),
            LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
            LLMEvent.finish({ reason: "tool-calls" }),
          ],
          [],
        ]
      })
      const session = yield* SessionV2.Service

      yield* session.prompt({ sessionID, prompt: { text: "Run the command" }, resume: false })
      yield* session.resume(sessionID)

      const completion = yield* waitForSteer
      expect(completion.prompt.text).toContain("bash settled")
      expect(completion.prompt.text).toContain("done: true")
      expect(executions).toEqual(["echo hello"])
      expect(requests.length).toBeGreaterThanOrEqual(2)

      const context = yield* session.context(sessionID)
      const toolParts = context.flatMap((message) => (message.type === "assistant" ? message.content : []))
      expect(toolParts.some((part) => part.type === "tool" && part.id === "call-bash")).toBe(true)
      expect(toolParts.some((part) => JSON.stringify(part).includes("[background] bash running as job"))).toBe(true)
    }),
  )
})