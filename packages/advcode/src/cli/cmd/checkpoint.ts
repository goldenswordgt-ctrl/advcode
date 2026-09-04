import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { SessionRevert } from "@/session/revert"
import { SessionSummary } from "@/session/summary"
import { Session } from "@/session/session"
import { SessionID, MessageID, PartID } from "@/session/schema"
import { UI } from "../ui"

export const CheckpointCommand = cmd({
  command: "checkpoint",
  describe: "inspect and revert message-level snapshots (undo agent work)",
  builder: (yargs: Argv) =>
    yargs
      .command(CheckpointListCommand)
      .command(CheckpointDiffCommand)
      .command(CheckpointRevertCommand)
      .command(CheckpointUnrevertCommand)
      .demandCommand(),
  async handler() {},
})

export const CheckpointListCommand = effectCmd({
  command: "list <sessionID>",
  describe: "list checkpoints (message snapshots) for a session",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session ID to inspect",
        type: "string",
        demandOption: true,
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      }),
  handler: Effect.fn("Cli.checkpoint.list")(function* (args) {
    const sessions = yield* Session.Service
    const sessionID = SessionID.make(args.sessionID)
    const [session, messages] = yield* Effect.all(
      [
        sessions.get(sessionID).pipe(Effect.orDie),
        sessions.messages({ sessionID }).pipe(Effect.orDie),
      ],
      { concurrency: 0 },
    )

    const checkpoints = messages.flatMap((msg) => {
      const parts: { id: string; snapshot: string; kind: string }[] = []
      for (const part of msg.parts) {
        if (part.type === "step-start" && part.snapshot) {
          parts.push({ id: part.id, snapshot: part.snapshot, kind: "start" })
        } else if (part.type === "step-finish" && part.snapshot) {
          parts.push({ id: part.id, snapshot: part.snapshot, kind: "finish" })
        } else if (part.type === "snapshot" && "snapshot" in part && typeof part.snapshot === "string") {
          parts.push({ id: part.id, snapshot: part.snapshot, kind: "snapshot" })
        }
      }
      return parts.map((part) => ({
        messageID: msg.info.id,
        role: msg.info.role,
        ...part,
        active: session.revert?.messageID === msg.info.id && session.revert?.partID === part.id,
      }))
    })

    if (checkpoints.length === 0) {
      UI.println("No checkpoints found for this session.")
      return
    }

    const output = args.format === "json" ? JSON.stringify(checkpoints, null, 2) : formatTable(checkpoints)
    console.log(output)
  }),
})

export const CheckpointDiffCommand = effectCmd({
  command: "diff <sessionID> [messageID]",
  describe: "show file changes up to a user message",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session ID",
        type: "string",
        demandOption: true,
      })
      .positional("messageID", {
        describe: "user message ID to diff up to",
        type: "string",
      }),
  handler: Effect.fn("Cli.checkpoint.diff")(function* (args) {
    const summary = yield* SessionSummary.Service
    const sessionID = SessionID.make(args.sessionID)
    const messageID = args.messageID ? MessageID.make(args.messageID) : undefined
    const diffs = yield* summary.diff({ sessionID, messageID })

    if (diffs.length === 0) {
      UI.println("No file changes found.")
      return
    }

    console.log(JSON.stringify(diffs, null, 2))
  }),
})

export const CheckpointRevertCommand = effectCmd({
  command: "revert <sessionID> <messageID> [partID]",
  describe: "revert the session to a checkpoint, discarding later agent work",
  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session ID",
        type: "string",
        demandOption: true,
      })
      .positional("messageID", {
        describe: "message ID to revert to (agent messages restore their step-start snapshot)",
        type: "string",
        demandOption: true,
      })
      .positional("partID", {
        describe: "optional part ID for a finer-grained revert",
        type: "string",
      }),
  handler: Effect.fn("Cli.checkpoint.revert")(function* (args) {
    const svc = yield* SessionRevert.Service
    const sessionID = SessionID.make(args.sessionID)
    const messageID = MessageID.make(args.messageID)
    const partID = args.partID ? PartID.make(args.partID) : undefined
    const session = yield* svc.revert({ sessionID, messageID, partID }).pipe(Effect.orDie)

    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Reverted session ${sessionID} to ${messageID}` + UI.Style.TEXT_NORMAL)
    if (session.revert?.diff) {
      UI.println("Filesystem changes have been restored to the checkpoint state.")
      UI.println("Run `advcode checkpoint diff <sessionID> <messageID>` to review the change diff.")
    }
  }),
})

export const CheckpointUnrevertCommand = effectCmd({
  command: "unrevert <sessionID>",
  describe: "restore the session from a reverted checkpoint",
  builder: (yargs) =>
    yargs.positional("sessionID", {
      describe: "session ID",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.checkpoint.unrevert")(function* (args) {
    const svc = yield* SessionRevert.Service
    const sessionID = SessionID.make(args.sessionID)
    yield* svc.unrevert({ sessionID }).pipe(Effect.orDie)
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Restored session ${sessionID}` + UI.Style.TEXT_NORMAL)
  }),
})

function formatTable(checkpoints: { messageID: string; role: string; id: string; snapshot: string; kind: string; active: boolean }[]) {
  const lines = ["Message ID       Role       Part      Kind       Snapshot"]
  lines.push("─".repeat(70))
  for (const c of checkpoints) {
    const marker = c.active ? " ◂" : ""
    lines.push(
      `${c.messageID.padEnd(16)} ${c.role.padEnd(10)} ${c.id.padEnd(9)} ${c.kind.padEnd(10)} ${c.snapshot}${marker}`,
    )
  }
  return lines.join("\n")
}