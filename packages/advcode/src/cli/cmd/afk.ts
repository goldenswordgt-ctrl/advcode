import { EOL } from "os"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import type { Argv } from "yargs"

/**
 * AFK command — wired directly into advcode, no prompt needed.
 *
 * Manages the AFK state file shared with opencode's afk-mode plugin.
 * When AFK is ON, V operates autonomously: decides everything, logs
 * decisions, and doesn't ask questions.
 *
 * Usage:
 *   advcode afk on [sessionID]   arm AFK mode
 *   advcode afk off              disarm AFK mode
 *   advcode afk status           show current AFK state
 *   advcode afk add "<decision>" log an autonomous decision
 *   advcode afk list             list logged decisions
 *   advcode afk clear            wipe decisions after report
 */

const HOME = process.env.HOME || "/Users/oliver.wang"
const STATE_FILE = join(HOME, ".config", "opencode", "afk-mode.json")
const LOG_FILE = "/tmp/afk_advcode.log"

function now(): string {
  return new Date().toISOString()
}

function log(msg: string) {
  try {
    const { appendFileSync } = require("node:fs")
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}${EOL}`)
  } catch {
    /* never crash */
  }
}

function readState(): Record<string, unknown> {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"))
    }
  } catch {
    /* fall through */
  }
  return {}
}

function writeState(state: Record<string, unknown>) {
  const dir = join(HOME, ".config", "opencode")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function formatTime(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

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

const AfkOnCommand = effectCmd({
  command: "on [sessionID]",
  describe: "arm AFK mode — V operates autonomously, no questions asked",
  instance: false,
  builder: (yargs: Argv) =>
    yargs.positional("sessionID", {
      type: "string",
      describe: "session ID to bind AFK to",
      default: "",
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const state = readState()
      if (state.on) {
        process.stdout.write(`AFK already ON since ${state.since ?? "?"}${EOL}`)
        return
      }

      const sessionID = args.sessionID || ""
      const newState = {
        ...state,
        on: true,
        since: now(),
        sessionID,
        decisions: [] as { t: string; d: string }[],
        nudges: 0,
        gaveUp: false,
      }
      delete (newState as any).ended
      writeState(newState)
      log(`AFK ON (session=${sessionID})`)
      process.stdout.write(`AFK ON — V is fully autonomous until you say you're back${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.afk.on"),
      withLocation,
    ),
})

const AfkOffCommand = effectCmd({
  command: "off",
  describe: "disarm AFK mode — V returns to normal",
  instance: false,
  handler: () =>
    Effect.gen(function* () {
      const state = readState()
      if (!state.on) {
        process.stdout.write(`AFK already OFF${EOL}`)
        return
      }
      state.on = false
      state.ended = now()
      writeState(state)
      const decisions = (state.decisions as any[]) ?? []
      log(`AFK OFF (${decisions.length} decisions)`)
      process.stdout.write(
        `AFK OFF at ${formatTime(state.ended as string)} — ${decisions.length} decision(s) logged${EOL}`
      )
    }).pipe(
      Effect.withSpan("Cli.afk.off"),
      withLocation,
    ),
})

const AfkStatusCommand = effectCmd({
  command: "status",
  describe: "show current AFK state",
  instance: false,
  handler: () =>
    Effect.gen(function* () {
      const state = readState()
      const on = state.on ? "ON" : "OFF"
      const since = state.since ? ` since ${formatTime(state.since as string)}` : ""
      const session = state.sessionID ? ` (session: ${state.sessionID})` : ""
      const decisions = (state.decisions as any[]) ?? []
      const gaveUp = state.gaveUp ? " [WATCHDOG GAVE UP]" : ""
      process.stdout.write(`AFK: ${on}${since}${session}${gaveUp}${EOL}`)
      if (decisions.length > 0) {
        process.stdout.write(`${decisions.length} decision(s) logged:${EOL}`)
        for (const d of decisions) {
          process.stdout.write(`  ${formatTime(d.t)} — ${d.d}${EOL}`)
        }
      }
    }).pipe(
      Effect.withSpan("Cli.afk.status"),
      withLocation,
    ),
})

const AfkAddCommand = effectCmd({
  command: "add <decision>",
  describe: "log an autonomous decision (AFK must be ON)",
  instance: false,
  builder: (yargs: Argv) =>
    yargs.positional("decision", {
      type: "string",
      describe: "what was decided and why",
      demandOption: true,
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const state = readState()
      if (!state.on) {
        yield* fail("AFK is OFF — nothing to log (arm with: advcode afk on)")
      }
      const decisions = (state.decisions as any[]) ?? []
      decisions.push({ t: now(), d: args.decision })
      state.decisions = decisions
      writeState(state)
      process.stdout.write(`logged (${decisions.length} total): ${args.decision}${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.afk.add"),
      withLocation,
    ),
})

const AfkListCommand = effectCmd({
  command: "list",
  describe: "list logged autonomous decisions",
  instance: false,
  handler: () =>
    Effect.gen(function* () {
      const state = readState()
      const decisions = (state.decisions as any[]) ?? []
      if (decisions.length === 0) {
        process.stdout.write(`(no decisions logged)${EOL}`)
        return
      }
      for (let i = 0; i < decisions.length; i++) {
        const d = decisions[i]
        process.stdout.write(`${i + 1}. [${formatTime(d.t)}] ${d.d}${EOL}`)
      }
    }).pipe(
      Effect.withSpan("Cli.afk.list"),
      withLocation,
    ),
})

const AfkClearCommand = effectCmd({
  command: "clear",
  describe: "wipe decisions after the return report",
  instance: false,
  handler: () =>
    Effect.gen(function* () {
      const state = readState()
      const decisions = (state.decisions as any[]) ?? []
      const n = decisions.length
      state.decisions = []
      writeState(state)
      process.stdout.write(`cleared ${n} decision(s)${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.afk.clear"),
      withLocation,
    ),
})

export const AfkCommand = cmd({
  command: "afk",
  describe: "manage AFK mode — V operates autonomously while you're away",
  builder: (yargs: Argv) =>
    yargs
      .command(AfkOnCommand)
      .command(AfkOffCommand)
      .command(AfkStatusCommand)
      .command(AfkAddCommand)
      .command(AfkListCommand)
      .command(AfkClearCommand)
      .demandCommand(),
  async handler() {},
})
