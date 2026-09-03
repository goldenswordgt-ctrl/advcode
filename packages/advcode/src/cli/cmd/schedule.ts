import { EOL } from "os"
import os from "node:os"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { Clock, Effect, Stream } from "effect"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { Catalog } from "@opencode-ai/core/catalog"
import { Integration } from "@opencode-ai/core/integration"
import { MemoryV2 } from "@opencode-ai/core/memory/memory"
import { fromCatalogModel } from "@opencode-ai/core/session/runner/model"
import { LLM, LLMClient, LLMEvent, Message, SystemPart, type LLMClientShape } from "@opencode-ai/llm"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"

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

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface Schedule {
  id: string
  prompt: string
  daily: boolean
  atH?: number
  atM?: number
  runAt?: number
  created: number
}
export type ScheduleStore = Record<string, Schedule>

const storePath = path.join(os.homedir(), ".advcode", "schedules.json")

const readStore: Effect.Effect<ScheduleStore> = Effect.tryPromise(async () => {
  const file = Bun.file(storePath)
  if (await file.exists()) return (await file.json()) as ScheduleStore
  return {}
}).pipe(Effect.catch(() => Effect.succeed({})))

const writeStore = (store: ScheduleStore) =>
  Effect.tryPromise(async () => {
    await mkdir(path.dirname(storePath), { recursive: true })
    await Bun.write(storePath, JSON.stringify(store, null, 2))
  }).pipe(Effect.orDie)

const nextClock = (now: number, hour: number, minute: number) => {
  const d = new Date(now)
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0).getTime()
  if (today > now) return today
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute, 0, 0).getTime()
}

const nextRunAt = (s: Schedule, now: number) => {
  if (s.daily && s.atH !== undefined && s.atM !== undefined) return nextClock(now, s.atH, s.atM)
  if (s.runAt !== undefined) return s.runAt
  return now + 24 * 3600 * 1000
}

type SchedDeps = {
  catalog: Catalog.Interface
  integrations: Integration.Interface
  memory: MemoryV2.Interface
  llm: LLMClientShape
}

const resolveModel = (deps: SchedDeps) =>
  Effect.gen(function* () {
    const selected = yield* deps.catalog.model.default().pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (!selected) return undefined
    const provider = yield* deps.catalog.provider.get(selected.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))
    const connection = provider
      ? yield* deps.integrations.connection
          .active(provider.integrationID ?? Integration.ID.make(selected.providerID))
          .pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    const credential = connection
      ? yield* deps.integrations.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    return yield* fromCatalogModel(selected, credential).pipe(Effect.catch(() => Effect.succeed(undefined)))
  })

const runPrompt = (deps: SchedDeps, prompt: string) =>
  Effect.gen(function* () {
    const model = yield* resolveModel(deps)
    if (model === undefined) return yield* Effect.fail(new Error("no model available"))
    const memoryContext = (yield* deps.memory.recallTop(10).pipe(Effect.catch(() => Effect.succeed([]))))
      .map((e: MemoryV2.Entry) => `- [${e.type}] ${e.key}: ${e.value}`)
      .join("\n")
    const system = SystemPart.make(
      [
        "You are advcode's scheduled task runner.",
        "Answer the scheduled prompt concisely and actionably.",
        memoryContext.length > 0 ? `\nRemembered context:\n${memoryContext}` : "",
      ]
        .filter((s) => s.length > 0)
        .join("\n"),
    )
    const chunks: string[] = []
    yield* deps.llm
      .stream(LLM.request({ model, system: [system], messages: [Message.user(prompt)], tools: [] }))
      .pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          return Effect.void
        }),
      )
    const reply = chunks.join("").trim()
    if (reply.length === 0) return yield* Effect.fail(new Error("scheduled task produced no output"))
    return reply
  })

const scheduleLoop = (deps: SchedDeps, id: string): Effect.Effect<string, unknown> =>
  Effect.gen(function* () {
    const schedule = (yield* readStore)[id]
    if (!schedule) return `schedule ${id} not found`
    const now = yield* Clock.currentTimeMillis
    const target = nextRunAt(schedule, now)
    const delay = Math.max(0, target - now)
    if (delay > 0) yield* Effect.sleep(delay)
    const result = yield* runPrompt(deps, schedule.prompt).pipe(Effect.catch((e) => Effect.succeed(`error: ${errMsg(e)}`)))
    process.stdout.write(`[schedule:${schedule.id}] ${result}${EOL}`)
    if (schedule.daily) {
      yield* Effect.yieldNow
      return yield* scheduleLoop(deps, id)
    }
    return result
  })

export const ScheduleCommand = cmd({
  command: "schedule",
  describe: "manage scheduled agent tasks",
  builder: (yargs) =>
    yargs
      .command(ScheduleAddCommand)
      .command(ScheduleListCommand)
      .command(ScheduleCancelCommand)
      .command(ScheduleRunCommand)
      .demandCommand(),
  async handler() {},
})

const ScheduleAddCommand = effectCmd({
  command: "add <prompt>",
  describe: "schedule an agent task to run on a timer",
  builder: (yargs) =>
    yargs
      .positional("prompt", { type: "string", describe: "instruction to run", demandOption: true })
      .option("at", { type: "string", describe: "HH:MM time of day; one-shot today unless --daily" })
      .option("in", { type: "number", describe: "run one-shot in N minutes from now" })
      .option("daily", { type: "boolean", default: false, describe: "recur daily at --at time" })
      .option("name", { type: "string", describe: "schedule id to use (defaults to a generated one)" }),
  handler: (args) =>
    Effect.gen(function* () {
      const background = yield* BackgroundJob.Service
      const deps: SchedDeps = {
        catalog: yield* Catalog.Service,
        integrations: yield* Integration.Service,
        memory: yield* MemoryV2.Service,
        llm: yield* LLMClient.Service,
      }
      const now = yield* Clock.currentTimeMillis
      const id = args.name ?? crypto.randomUUID()
      let schedule: Schedule
      if (args.daily) {
        if (!args.at) return yield* fail("--daily requires --at HH:MM")
        const at = parseAt(args.at)
        if (!at) return yield* fail(`invalid time: ${args.at} (expected HH:MM)`)
        const [h, m] = at
        schedule = { id, prompt: args.prompt, daily: true, atH: h, atM: m, created: now }
      } else if (args.at) {
        const at = parseAt(args.at)
        if (!at) return yield* fail(`invalid time: ${args.at} (expected HH:MM)`)
        const [h, m] = at
        schedule = { id, prompt: args.prompt, daily: false, runAt: nextClock(now, h, m), created: now }
      } else if (args["in"] !== undefined) {
        schedule = { id, prompt: args.prompt, daily: false, runAt: now + args["in"] * 60000, created: now }
      } else {
        return yield* fail("provide --at HH:MM, --in <minutes>, or --daily --at HH:MM")
      }
      const store = yield* readStore
      yield* writeStore({ ...store, [id]: schedule })
      yield* background.start({
        id: `schedule:${id}`,
        type: "schedule",
        title: args.prompt,
        metadata: { scheduleID: id },
        run: scheduleLoop(deps, id),
      })
      const next = nextRunAt(schedule, now)
      process.stdout.write(`scheduled ${id} at ${new Date(next).toLocaleString()} (${schedule.daily ? "daily" : "one-shot"})${EOL}`)
      if (!schedule.daily) {
        const result = yield* background.wait({ id: `schedule:${id}` })
        if (result.info?.status === "completed" && result.info.output)
          process.stdout.write(`[schedule:${id}] ${result.info.output}${EOL}`)
        else if (result.info?.status === "error")
          process.stderr.write(`[schedule:${id}] error: ${result.info.error ?? "unknown"}${EOL}`)
      }
    }).pipe(Effect.withSpan("Cli.schedule.add"), withLocation),
})

const ScheduleListCommand = effectCmd({
  command: "list",
  describe: "list all scheduled tasks and their next run times",
  handler: () =>
    Effect.gen(function* () {
      const store = yield* readStore
      const now = yield* Clock.currentTimeMillis
      const entries = Object.values(store).toSorted((a, b) => nextRunAt(a, now) - nextRunAt(b, now))
      if (entries.length === 0) {
        process.stdout.write("no scheduled tasks" + EOL)
        return
      }
      for (const s of entries) {
        const next = nextRunAt(s, now)
        process.stdout.write(`${s.id}\t${s.prompt}\t${s.daily ? "daily" : "one-shot"}\t${new Date(next).toLocaleString()}${EOL}`)
      }
    }).pipe(Effect.withSpan("Cli.schedule.list"), withLocation),
})

const ScheduleCancelCommand = effectCmd({
  command: "cancel <id>",
  describe: "remove a scheduled task",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", describe: "schedule id to remove", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const background = yield* BackgroundJob.Service
      const store = yield* readStore
      if (!store[args.id]) return yield* fail(`no schedule: ${args.id}`)
      const { [args.id]: _removed, ...rest } = store
      yield* writeStore(rest)
      yield* background.cancel(`schedule:${args.id}`).pipe(Effect.catch(() => Effect.succeed(undefined)))
      process.stdout.write(`cancelled ${args.id}${EOL}`)
    }).pipe(Effect.withSpan("Cli.schedule.cancel"), withLocation),
})

const ScheduleRunCommand = effectCmd({
  command: "run <id>",
  describe: "manually trigger a scheduled task's prompt now",
  builder: (yargs) =>
    yargs.positional("id", { type: "string", describe: "schedule id to run", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const background = yield* BackgroundJob.Service
      const deps: SchedDeps = {
        catalog: yield* Catalog.Service,
        integrations: yield* Integration.Service,
        memory: yield* MemoryV2.Service,
        llm: yield* LLMClient.Service,
      }
      const schedule = (yield* readStore)[args.id]
      if (!schedule) return yield* fail(`no schedule: ${args.id}`)
      const job = yield* background.start({
        id: `schedule-run:${args.id}`,
        type: "schedule",
        title: schedule.prompt,
        metadata: { scheduleID: args.id },
        run: runPrompt(deps, schedule.prompt),
      })
      const result = yield* background.wait({ id: job.id })
      if (result.info?.status === "completed" && result.info.output)
        process.stdout.write(`[schedule:${args.id}] ${result.info.output}${EOL}`)
      else if (result.info?.status === "error")
        process.stderr.write(`[schedule:${args.id}] error: ${result.info.error ?? "unknown"}${EOL}`)
    }).pipe(Effect.withSpan("Cli.schedule.run"), withLocation),
})

const parseAt = (at: string): readonly [number, number] | undefined => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(at)
  if (!match) return
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return
  return [h, m] as const
}
