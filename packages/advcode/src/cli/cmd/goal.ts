import { EOL } from "os"
import { Effect, Schema } from "effect"
import { LLM, Message, SystemPart } from "@opencode-ai/llm"
import { MemoryV2 } from "@opencode-ai/core/memory/memory"
import { Catalog } from "@opencode-ai/core/catalog"
import { Integration } from "@opencode-ai/core/integration"
import { fromCatalogModel } from "@opencode-ai/core/session/runner/model"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import type { Argv } from "yargs"

const withLocation = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(
      LocationServiceMap.Service.get(
        Location.Ref.make({
          directory: AbsolutePath.make(process.cwd()),
        }),
      ),
    ),
    Effect.provide(locationServiceMapLayer),
    Effect.provide(locationGlobalServices),
  )

const MEMORY_TYPE = "project" as const
const KEY_PREFIX = "goal:"

interface GoalData {
  readonly id: string
  readonly objective: string
  readonly oracle?: string
  readonly oracleCmd?: string
  readonly status: "active" | "completed" | "blocked"
  readonly created_at: string
  readonly updated_at: string
  readonly steps: readonly string[]
}

const parseGoal = (value: string): GoalData | undefined => {
  const parsed = Effect.runSync(Effect.try({ try: () => JSON.parse(value) as unknown, catch: () => undefined }))
  if (parsed === undefined || typeof parsed !== "object" || parsed === null) return undefined
  const obj = parsed as Record<string, unknown>
  if (typeof obj.id !== "string" || typeof obj.objective !== "string" || typeof obj.status !== "string") return undefined
  return {
    id: obj.id,
    objective: obj.objective,
    oracle: typeof obj.oracle === "string" ? obj.oracle : undefined,
    oracleCmd: typeof obj.oracleCmd === "string" ? obj.oracleCmd : undefined,
    status: obj.status as GoalData["status"],
    created_at: typeof obj.created_at === "string" ? obj.created_at : "",
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : "",
    steps: Array.isArray(obj.steps) ? obj.steps.filter((s): s is string => typeof s === "string") : [],
  }
}

const resolveDefaultModel = Effect.gen(function* () {
  const catalog = yield* Catalog.Service
  const integrations = yield* Integration.Service
  const selected = yield* catalog.model.default().pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (selected === undefined) return yield* fail("no default model configured")
  const provider = yield* catalog.provider.get(selected.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))
  const connection = provider
    ? yield* integrations.connection
        .active(provider.integrationID ?? Integration.ID.make(selected.providerID))
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
    : undefined
  const credential = connection
    ? yield* integrations.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
    : undefined
  return yield* fromCatalogModel(selected, credential).pipe(Effect.catch(() => Effect.succeed(undefined)))
})

const OracleVerdict = Schema.Struct({
  passed: Schema.Boolean,
  reason: Schema.String,
})

const runLlmOracle = Effect.fn("Goal.runLlmOracle")(function* (objective: string, oracleDescription: string) {
  const model = yield* resolveDefaultModel
  if (model === undefined) return yield* fail("no model available for oracle check")
  const result = yield* LLM.generateObject({
    model,
    system: [
      SystemPart.make(
        [
          "You are a strict acceptance oracle for a coding objective.",
          "You are given the objective and an acceptance criterion.",
          "Judge whether the objective has been satisfactorily completed based on the criterion.",
          "Respond with a JSON object: { passed: boolean, reason: string }.",
          "Be strict: only pass if the criterion is clearly met.",
        ].join("\n"),
      ),
    ],
    messages: [
      Message.user(
        [
          `Objective: ${objective}`,
          `Acceptance criterion: ${oracleDescription}`,
          "",
          "Has the objective been satisfactorily completed? Respond with the JSON object.",
        ].join("\n"),
      ),
    ],
    schema: OracleVerdict,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (result === undefined) return yield* fail("oracle LLM call failed")
  return result.object
})

const GoalSetCommand = effectCmd({
  command: "set <objective>",
  describe: "set a persistent coding objective",
  builder: (yargs: Argv) =>
    yargs
      .positional("objective", { type: "string", describe: "the coding objective to achieve", demandOption: true })
      .option("oracle", { type: "string", describe: "acceptance description for LLM oracle check" })
      .option("oracle-cmd", { type: "string", describe: "shell command that must exit 0 to pass" })
      .option("session", { type: "string", describe: "session ID to associate with" }),
  handler: (args) =>
    Effect.gen(function* () {
      const oracle = args.oracle as string | undefined
      const oracleCmd = args["oracle-cmd"] as string | undefined
      if (!oracle && !oracleCmd) return yield* fail("provide --oracle or --oracle-cmd")
      const memory = yield* MemoryV2.Service
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const goal: GoalData = {
        id,
        objective: args.objective as string,
        oracle,
        oracleCmd,
        status: "active",
        created_at: now,
        updated_at: now,
        steps: [],
      }
      yield* memory.remember({
        type: MEMORY_TYPE,
        key: `${KEY_PREFIX}${id}`,
        value: JSON.stringify(goal),
        importance: 10,
        session_id: args.session as string | undefined,
      })
      process.stdout.write(`Goal ${id} created${EOL}`)
      process.stdout.write(`Objective: ${goal.objective}${EOL}`)
      if (oracle) process.stdout.write(`Oracle (description): ${oracle}${EOL}`)
      if (oracleCmd) process.stdout.write(`Oracle (command): ${oracleCmd}${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.goal.set"),
      withLocation,
    ),
})

const GoalListCommand = effectCmd({
  command: "list",
  describe: "list all goals",
  handler: () =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const entries = yield* memory.recall({ type: MEMORY_TYPE, key: KEY_PREFIX, limit: 100 })
      if (entries.length === 0) {
        process.stdout.write(`No goals found${EOL}`)
        return
      }
      for (const entry of entries) {
        const goal = parseGoal(entry.value)
        if (goal === undefined) continue
        const statusTag = goal.status === "active" ? "[active]" : goal.status === "completed" ? "[done]" : "[blocked]"
        process.stdout.write(`${goal.id}  ${statusTag}  ${goal.objective}${EOL}`)
      }
    }).pipe(
      Effect.withSpan("Cli.goal.list"),
      withLocation,
    ),
})

const GoalShowCommand = effectCmd({
  command: "show <id>",
  describe: "show a goal's full details",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "goal ID", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const entries = yield* memory.recall({ type: MEMORY_TYPE, key: `${KEY_PREFIX}${args.id}`, limit: 1 })
      const entry = entries[0]
      if (entry === undefined) return yield* fail(`Goal ${args.id} not found`)
      const goal = parseGoal(entry.value)
      if (goal === undefined) return yield* fail(`Goal ${args.id} has corrupt data`)
      process.stdout.write(JSON.stringify(goal, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.goal.show"),
      withLocation,
    ),
})

const GoalCheckCommand = effectCmd({
  command: "check <id>",
  describe: "run the oracle to verify a goal",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "goal ID", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const entries = yield* memory.recall({ type: MEMORY_TYPE, key: `${KEY_PREFIX}${args.id}`, limit: 1 })
      const entry = entries[0]
      if (entry === undefined) return yield* fail(`Goal ${args.id} not found`)
      const goal = parseGoal(entry.value)
      if (goal === undefined) return yield* fail(`Goal ${args.id} has corrupt data`)
      if (goal.status !== "active") return yield* fail(`Goal ${args.id} is ${goal.status}, not active`)

      if (goal.oracleCmd) {
        const proc = Bun.spawnSync({ cmd: ["sh", "-c", goal.oracleCmd], stdout: "pipe", stderr: "pipe" })
        if (proc.exitCode === 0) {
          const updated = { ...goal, status: "completed" as const, updated_at: new Date().toISOString() }
          yield* memory.remember({ type: MEMORY_TYPE, key: `${KEY_PREFIX}${goal.id}`, value: JSON.stringify(updated) })
          process.stdout.write(`PASS: ${goal.oracleCmd}${EOL}`)
          process.stdout.write(`Goal ${goal.id} marked completed${EOL}`)
        } else {
          const stderr = proc.stderr?.toString().trim() ?? ""
          process.stdout.write(`FAIL: ${goal.oracleCmd}${EOL}`)
          if (stderr.length > 0) process.stdout.write(`stderr: ${stderr}${EOL}`)
          process.stdout.write(`Goal ${goal.id} remains active${EOL}`)
        }
        return
      }

      if (goal.oracle) {
        const verdict = yield* runLlmOracle(goal.objective, goal.oracle)
        if (verdict.passed) {
          const updated = { ...goal, status: "completed" as const, updated_at: new Date().toISOString() }
          yield* memory.remember({ type: MEMORY_TYPE, key: `${KEY_PREFIX}${goal.id}`, value: JSON.stringify(updated) })
          process.stdout.write(`PASS: ${verdict.reason}${EOL}`)
          process.stdout.write(`Goal ${goal.id} marked completed${EOL}`)
        } else {
          process.stdout.write(`FAIL: ${verdict.reason}${EOL}`)
          process.stdout.write(`Goal ${goal.id} remains active${EOL}`)
        }
        return
      }

      return yield* fail(`Goal ${args.id} has no oracle configured`)
    }).pipe(
      Effect.withSpan("Cli.goal.check"),
      withLocation,
    ),
})

const GoalCancelCommand = effectCmd({
  command: "cancel <id>",
  describe: "cancel a goal (mark as blocked)",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "goal ID", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const entries = yield* memory.recall({ type: MEMORY_TYPE, key: `${KEY_PREFIX}${args.id}`, limit: 1 })
      const entry = entries[0]
      if (entry === undefined) return yield* fail(`Goal ${args.id} not found`)
      const goal = parseGoal(entry.value)
      if (goal === undefined) return yield* fail(`Goal ${args.id} has corrupt data`)
      const updated = { ...goal, status: "blocked" as const, updated_at: new Date().toISOString() }
      yield* memory.remember({ type: MEMORY_TYPE, key: `${KEY_PREFIX}${goal.id}`, value: JSON.stringify(updated) })
      process.stdout.write(`Goal ${goal.id} marked as blocked${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.goal.cancel"),
      withLocation,
    ),
})

export const GoalCommand = cmd({
  command: "goal",
  describe: "persistent coding objective with oracle verification",
  builder: (yargs: Argv) =>
    yargs.command(GoalSetCommand).command(GoalListCommand).command(GoalShowCommand).command(GoalCheckCommand).command(GoalCancelCommand).demandCommand(),
  async handler() {},
})
