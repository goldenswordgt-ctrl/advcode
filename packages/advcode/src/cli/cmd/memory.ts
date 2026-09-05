import { EOL } from "os"
import path from "path"
import { rm } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { MemoryV2 } from "@opencode-ai/core/memory/memory"
import {
  LocationServiceMap,
  locationServiceMapLayer,
  locationGlobalServices,
} from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { UI } from "../ui"
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

export const MemoryCommand = cmd({
  command: "memory",
  describe: "inspect and edit the persistent cross-session memory",
  builder: (yargs: Argv) =>
    yargs
      .command(MemoryListCommand)
      .command(MemoryUserCommand)
      .command(MemoryAddCommand)
      .command(MemoryRmCommand)
      .command(MemorySearchCommand)
      .command(MemoryEditCommand)
      .demandCommand(),
  async handler() {},
})

const MemoryListCommand = effectCmd({
  command: "list",
  describe: "list the top recalled memory entries",
  builder: (yargs) =>
    yargs.option("limit", {
      alias: "n",
      describe: "max entries to show",
      type: "number",
      default: 15,
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const entries = yield* memory.recallTop(args.limit)
      process.stdout.write(JSON.stringify(entries, null, 2) + EOL)
    }).pipe(Effect.withSpan("Cli.memory.list"), withLocation),
})

const MemoryUserCommand = effectCmd({
  command: "user",
  describe: "show the distilled user model",
  handler: () =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const facts = yield* memory.recallUser()
      process.stdout.write(JSON.stringify(facts, null, 2) + EOL)
    }).pipe(Effect.withSpan("Cli.memory.user"), withLocation),
})

export const MEMORY_TYPES = ["user", "project", "workflow", "preference", "decision", "lesson"] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export interface MemoryLine {
  type: string
  key: string
  value: string
  importance?: number
}

/** One JSON object per line — unambiguous round-trip for free-text values. */
export function serializeEntries(entries: MemoryLine[]): string {
  if (entries.length === 0) return ""
  return entries.map((e) => JSON.stringify(e)).join(EOL) + EOL
}

export function parseMemoryDump(text: string): { entries: MemoryLine[]; errors: string[] } {
  const entries: MemoryLine[] = []
  const errors: string[] = []
  let lineNo = 0
  for (const raw of text.split(/\r?\n/)) {
    lineNo++
    const line = raw.trim()
    if (!line) continue
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object")
      const { type, key, value, importance } = parsed
      if (typeof type !== "string" || !MEMORY_TYPES.includes(type as MemoryType)) {
        throw new Error(`type must be one of ${MEMORY_TYPES.join("/")}`)
      }
      if (typeof key !== "string" || key.length === 0) throw new Error("key must be a non-empty string")
      if (typeof value !== "string" || value.length === 0) throw new Error("value must be a non-empty string")
      if (importance !== undefined && (typeof importance !== "number" || !Number.isFinite(importance))) {
        throw new Error("importance must be a finite number")
      }
      entries.push({ type, key, value, importance })
    } catch (e) {
      errors.push(`line ${lineNo}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { entries, errors }
}

export interface MemoryDiff {
  adds: MemoryLine[]
  updates: MemoryLine[]
  deletes: { type: string; key: string }[]
  unchanged: number
}

/** Deterministic per-(type,key) identity: splitting on the NUL is impossible. */
const keyOf = (e: MemoryLine) => `${e.type}\u0000${e.key}`

export function diffMemory(old: MemoryLine[], next: MemoryLine[]): MemoryDiff {
  const oldMap = new Map(old.map((e) => [keyOf(e), e]))
  const nextMap = new Map(next.map((e) => [keyOf(e), e]))
  const adds: MemoryLine[] = []
  const updates: MemoryLine[] = []
  const deletes: { type: string; key: string }[] = []
  let unchanged = 0
  for (const [k, e] of nextMap) {
    const prev = oldMap.get(k)
    if (!prev) adds.push(e)
    else if (prev.value !== e.value || prev.importance !== e.importance) updates.push(e)
    else unchanged++
  }
  for (const [k, prev] of oldMap) {
    if (!nextMap.has(k)) deletes.push({ type: prev.type, key: prev.key })
  }
  return { adds, updates, deletes, unchanged }
}

function toMemoryLine(entry: { type: string; key: string; value: string; importance?: number }): MemoryLine {
  return { type: entry.type, key: entry.key, value: entry.value, importance: entry.importance }
}

const MemoryAddCommand = effectCmd({
  command: "add <key> <value>",
  describe: "store a durable memory fact (upserts on type+key)",
  builder: (yargs) =>
    yargs
      .positional("key", { type: "string", describe: "fact identifier (e.g. favorite-color)", demandOption: true })
      .positional("value", { type: "string", describe: "the fact itself", demandOption: true })
      .option("type", {
        type: "string",
        choices: MEMORY_TYPES,
        default: "user",
        describe: "fact category",
      })
      .option("importance", {
        type: "number",
        describe: "importance weight (higher = recalled sooner)",
      }),
  handler: (args) =>
    Effect.gen(function* () {
      if (args.key.length === 0 || args.value.length === 0) {
        return yield* fail("key and value must be non-empty")
      }
      const memory = yield* MemoryV2.Service
      yield* memory.remember({
        type: args.type as MemoryType,
        key: args.key,
        value: args.value,
        importance: args.importance,
      })
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `remembered ${args.type}:${args.key}` + UI.Style.TEXT_NORMAL)
    }).pipe(Effect.withSpan("Cli.memory.add"), withLocation),
})

const MemoryRmCommand = effectCmd({
  command: "rm <key>",
  describe: "forget a memory fact (by key+type, or --id)",
  builder: (yargs) =>
    yargs
      .positional("key", { type: "string", describe: "fact identifier to forget", demandOption: true })
      .option("type", { type: "string", choices: MEMORY_TYPES, default: "user", describe: "fact category" })
      .option("id", { type: "string", describe: "forget by exact entry id instead of key+type" }),
  handler: (args) =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      if (args.id) {
        yield* memory.forget({ id: args.id })
        UI.println(UI.Style.TEXT_SUCCESS_BOLD + `forgot entry ${args.id}` + UI.Style.TEXT_NORMAL)
        return
      }
      yield* memory.forget({ type: args.type as MemoryType, key: args.key })
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `forgot ${args.type}:${args.key}` + UI.Style.TEXT_NORMAL)
    }).pipe(Effect.withSpan("Cli.memory.rm"), withLocation),
})

const MemorySearchCommand = effectCmd({
  command: "search <query>",
  describe: "search memory entries by value text",
  builder: (yargs) =>
    yargs
      .positional("query", { type: "string", describe: "text to search for in values", demandOption: true })
      .option("limit", { type: "number", default: 20, describe: "max entries to show" }),
  handler: (args) =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const entries = yield* memory.search(args.query, args.limit)
      if (entries.length === 0) {
        UI.println(`No memory entries match "${args.query}".`)
        return
      }
      for (const e of entries) {
        UI.println(
          `${e.type.padEnd(10)} ${UI.Style.TEXT_NORMAL_BOLD}${e.key}${UI.Style.TEXT_NORMAL} ${e.importance !== undefined ? `(${e.importance}) ` : ""}— ${e.value}`,
        )
      }
    }).pipe(Effect.withSpan("Cli.memory.search"), withLocation),
})

function editorCommand(): string {
  return process.env.EDITOR || process.env.VISUAL || "vi"
}

const MemoryEditCommand = effectCmd({
  command: "edit",
  describe: "open all memory as a JSONL file in $EDITOR; save to apply adds/updates/removals",
  handler: () =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const existing = yield* memory.recall({ limit: 100000 })
      const oldLines = existing.map(toMemoryLine)
      const dump = serializeEntries(oldLines)

      const tmp = path.join(tmpdir(), `advcode-memory-${process.pid}-${Date.now()}.jsonl`)
      yield* Effect.promise(() => Filesystem.write(tmp, dump))

      const editor = editorCommand()
      UI.println(`Opening ${existing.length} memory entr${existing.length === 1 ? "y" : "ies"} in ${editor}...`)
      const code = yield* Effect.promise(async () => {
        const proc = Process.spawn([editor, tmp], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
        return proc.exited
      })
      if (code !== 0) {
        return yield* fail(`editor exited with code ${code} — memory unchanged (edits preserved at ${tmp})`)
      }

      const edited = yield* Effect.promise(() => Filesystem.readText(tmp))
      const { entries, errors } = parseMemoryDump(edited)
      if (errors.length > 0) {
        return yield* fail(
          `memory file has ${errors.length} invalid line${errors.length === 1 ? "" : "s"} — nothing applied${EOL}${errors.slice(0, 5).join(EOL)}${EOL}Your edits are preserved at ${tmp}`,
        )
      }

      const diff = diffMemory(oldLines, entries)
      for (const e of diff.adds) {
        yield* memory.remember({ type: e.type as MemoryType, key: e.key, value: e.value, importance: e.importance })
      }
      for (const e of diff.updates) {
        yield* memory.remember({ type: e.type as MemoryType, key: e.key, value: e.value, importance: e.importance })
      }
      for (const d of diff.deletes) {
        yield* memory.forget({ type: d.type as MemoryType, key: d.key })
      }
      yield* Effect.promise(() => rm(tmp, { force: true }))

      const total = diff.adds.length + diff.updates.length + diff.deletes.length
      if (total === 0) {
        UI.println("No changes to memory.")
        return
      }
      UI.println(
        UI.Style.TEXT_SUCCESS_BOLD +
          `Memory updated: ${diff.adds.length} added, ${diff.updates.length} updated, ${diff.deletes.length} removed` +
          UI.Style.TEXT_NORMAL,
      )
    }).pipe(Effect.withSpan("Cli.memory.edit"), withLocation),
})
