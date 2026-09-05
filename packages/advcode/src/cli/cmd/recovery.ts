import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Database } from "@opencode-ai/core/database/database"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionDrain } from "@opencode-ai/core/session/drain"
import { UI } from "../ui"

export const RecoveryCommand = cmd({
  command: "recovery",
  describe: "inspect and recover interrupted session drains (post-crash continuation)",
  builder: (yargs: Argv) =>
    yargs
      .command(RecoveryListCommand)
      .command(RecoveryScanCommand)
      .command(RecoveryRetryCommand)
      .command(RecoveryAbandonCommand)
      .demandCommand(),
  async handler() {},
})

type DrainRow = {
  session_id: string
  status: string
  attempt: number
  step: number
  time_started: number
  time_heartbeat: number
  time_finished: number | null
}

export const RecoveryListCommand = effectCmd({
  command: "list",
  describe: "list durable drain markers for all sessions",
  builder: (yargs) =>
    yargs.option("format", {
      describe: "output format",
      type: "string",
      choices: ["table", "json"],
      default: "table",
    }),
  instance: false,
  handler: Effect.fn("Cli.recovery.list")(function* (args) {
    const { db } = yield* Database.Service
    const rows = yield* SessionDrain.list(db).pipe(Effect.orDie)
    if (rows.length === 0) {
      UI.println("No durable drain markers found.")
      return
    }
    const output = args.format === "json" ? JSON.stringify(rows, null, 2) : formatDrains(rows)
    console.log(output)
  }),
})

export const RecoveryScanCommand = effectCmd({
  command: "scan",
  describe: "mark running drains with stale heartbeats as interrupted (crash recovery)",
  builder: (yargs) =>
    yargs.option("stale-minutes", {
      describe: "heartbeat age (minutes) beyond which a running drain is considered abandoned",
      type: "number",
      default: 60,
    }),
  instance: false,
  handler: Effect.fn("Cli.recovery.scan")(function* (args) {
    const { db } = yield* Database.Service
    const staleBefore = new Date(Date.now() - args.staleMinutes * 60_000)
    const recovered = yield* SessionDrain.recover(db, staleBefore).pipe(Effect.orDie)
    if (recovered.length === 0) {
      UI.println("No stale running drains found.")
      return
    }
    UI.println(UI.Style.TEXT_WARNING + `Interrupted ${recovered.length} stale drain(s):` + UI.Style.TEXT_NORMAL)
    console.log(formatDrains(recovered))
  }),
})

export const RecoveryRetryCommand = effectCmd({
  command: "retry <sessionID>",
  describe: "clear a drain marker so the next explicit wake starts a clean drain",
  builder: (yargs) =>
    yargs.positional("sessionID", {
      describe: "session ID to retry",
      type: "string",
      demandOption: true,
    }),
  instance: false,
  handler: Effect.fn("Cli.recovery.retry")(function* (args) {
    const { db } = yield* Database.Service
    const sessionID = SessionV2.ID.make(args.sessionID)
    yield* SessionDrain.retry(db, sessionID).pipe(Effect.orDie)
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Cleared drain marker for ${sessionID}` + UI.Style.TEXT_NORMAL)
  }),
})

export const RecoveryAbandonCommand = effectCmd({
  command: "abandon <sessionID>",
  describe: "mark a drain abandoned for audit; durable inputs remain untouched",
  builder: (yargs) =>
    yargs.positional("sessionID", {
      describe: "session ID to abandon",
      type: "string",
      demandOption: true,
    }),
  instance: false,
  handler: Effect.fn("Cli.recovery.abandon")(function* (args) {
    const { db } = yield* Database.Service
    const sessionID = SessionV2.ID.make(args.sessionID)
    yield* SessionDrain.abandon(db, sessionID).pipe(Effect.orDie)
    UI.println(UI.Style.TEXT_WARNING + `Abandoned drain for ${sessionID}` + UI.Style.TEXT_NORMAL)
  }),
})

function formatDrains(rows: DrainRow[]) {
  const lines = ["Session ID                    Status        Attempt  Step  Started          Heartbeat        Finished"]
  lines.push("─".repeat(110))
  for (const d of rows) {
    lines.push(
      `${d.session_id.padEnd(30)} ${d.status.padEnd(13)} ${String(d.attempt).padEnd(8)} ${String(d.step).padEnd(5)} ${new Date(d.time_started).toISOString().padEnd(17)} ${new Date(d.time_heartbeat).toISOString().padEnd(16)} ${d.time_finished ? new Date(d.time_finished).toISOString() : "-"}`,
    )
  }
  return lines.join("\n")
}