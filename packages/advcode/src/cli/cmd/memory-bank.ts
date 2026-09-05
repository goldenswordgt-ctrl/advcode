import path from "path"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SessionSummary } from "@/session/summary"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"

/**
 * Memory bank — a Cline/Roo-style set of living project documents that the
 * agent reads on every session so context survives restarts.
 *
 *   memory-bank/brief.md         what the project is and its goals
 *   memory-bank/activeContext.md what work is currently in flight
 *   memory-bank/progress.md      chronological log of completed work
 *
 * `init` scaffolds the files, `update` records the latest session's work into
 * activeContext.md and progress.md. The documents themselves are plain Markdown
 * checked into the repo; any agent reads them as project context.
 */

const DOCS = ["brief.md", "activeContext.md", "progress.md"] as const

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

export const MemoryBankCommand = cmd({
  command: "memory-bank",
  describe: "maintain project memory documents (brief / active context / progress)",
  builder: (yargs) => yargs.command(MemoryBankInitCommand).command(MemoryBankUpdateCommand).demandCommand(),
  async handler() {},
})

export const MemoryBankInitCommand = effectCmd({
  command: "init",
  describe: "create a memory-bank/ directory with starter documents",

  builder: (yargs) =>
    yargs.option("force", {
      type: "boolean",
      default: false,
      describe: "overwrite existing documents with starter templates",
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const dir = memoryBankDir(location.project.directory)
      yield* fs.ensureDir(dir).pipe(Effect.orDie)

      const created: string[] = []
      for (const name of DOCS) {
        const target = path.join(dir, name)
        const exists = yield* fs.existsSafe(target)
        if (exists && !args.force) {
          UI.println(`[memory-bank] exists: ${name}`)
          continue
        }
        yield* fs.writeWithDirs(target, STARTERS[name]).pipe(Effect.orDie)
        created.push(name)
        UI.println(`[memory-bank] ${args.force && exists ? "overwritten" : "created"}: ${name}`)
      }
      if (created.length === 0) UI.println(`[memory-bank] all documents present in ${dir}`)
    }).pipe(
      Effect.withSpan("Cli.memory-bank.init"),
      withLocation,
    ),
})

export const MemoryBankUpdateCommand = effectCmd({
  command: "update [sessionID]",
  describe: "record the latest session's work into activeContext.md and progress.md",

  builder: (yargs) =>
    yargs
      .positional("sessionID", {
        describe: "session to record (defaults to the most recently updated project session)",
        type: "string",
      })
      .option("diff", {
        type: "boolean",
        default: true,
        describe: "include changed files in the record",
      }),
  handler: (args) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const sessions = yield* Session.Service
      const summary = yield* SessionSummary.Service

      const projectDir = location.project.directory
      const session = args.sessionID
        ? yield* sessions.get(SessionID.make(args.sessionID)).pipe(Effect.orDie)
        : yield* latestSession(sessions, projectDir)

      const diffs = args.diff ? yield* summary.diff({ sessionID: session.id }) : []
      const files = diffs.map((diff) => diff.file).filter((file): file is string => file !== undefined)
      const stamp = new Date(session.time.updated).toISOString()

      const dir = memoryBankDir(projectDir)
      yield* fs.ensureDir(dir).pipe(Effect.orDie)

      const active = [
        "# Active context",
        "",
        `## ${stamp} — ${session.title}`,
        "",
        `- Session: \`${session.id}\``,
        session.model ? `- Model: \`${session.model.providerID}/${session.model.id}\`` : undefined,
        files.length > 0 ? `- Files changed: ${files.join(", ")}` : "- No file changes recorded",
      ]
        .filter((line) => line !== undefined)
        .join("\n")
      yield* fs.writeWithDirs(path.join(dir, "activeContext.md"), active + "\n").pipe(Effect.orDie)

      const progressEntry = [
        `## ${stamp} — ${session.title} (\`${session.id}\`)`,
        files.length > 0 ? `- Files changed: ${files.join(", ")}` : "- No file changes recorded",
      ].join("\n")
      const previous = yield* fs
        .readFileStringSafe(path.join(dir, "progress.md"))
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      const progress = previous ? previous.trimEnd() + "\n\n" + progressEntry + "\n" : "# Progress\n\n" + progressEntry + "\n"
      yield* fs.writeWithDirs(path.join(dir, "progress.md"), progress).pipe(Effect.orDie)

      UI.println(`[memory-bank] recorded session ${session.id} (${session.title})`)
    }).pipe(
      Effect.withSpan("Cli.memory-bank.update"),
      withLocation,
    ),
})

function memoryBankDir(projectDir: string) {
  return path.join(projectDir, "memory-bank")
}

function latestSession(sessions: Session.Interface, projectDir: string) {
  return Effect.gen(function* () {
    const all = yield* sessions.list({ directory: projectDir, scope: "project" })
    if (all.length === 0) return yield* fail("no sessions found for this project")
    const byRecency = [...all].sort((a, b) => b.time.updated - a.time.updated)
    return byRecency[0]!
  })
}

const STARTERS: Record<(typeof DOCS)[number], string> = {
  "brief.md": [
    "# Project brief",
    "",
    "What this project is, who it is for, and what it is trying to achieve.",
    "",
    "## Goals",
    "",
    "## Current priorities",
    "",
  ].join("\n"),
  "activeContext.md": [
    "# Active context",
    "",
    "What work is currently in flight. Updated by `advcode memory-bank update`.",
    "",
  ].join("\n"),
  "progress.md": [
    "# Progress",
    "",
    "Chronological log of completed work. Updated by `advcode memory-bank update`.",
    "",
  ].join("\n"),
}