import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Worktree } from "@/worktree"
import { UI } from "../ui"

function mapWorktreeError(error: Worktree.Error) {
  return fail(error.message, 1)
}

export const WorktreeCommand = cmd({
  command: "worktree",
  describe: "manage isolated git worktrees for sandboxed work",
  builder: (yargs: Argv) =>
    yargs
      .command(WorktreeListCommand)
      .command(WorktreeCreateCommand)
      .command(WorktreeRemoveCommand)
      .command(WorktreeResetCommand)
      .demandCommand(),
  async handler() {},
})

export const WorktreeListCommand = effectCmd({
  command: "list",
  describe: "list worktrees for the current project",
  builder: (yargs) =>
    yargs.option("format", {
      describe: "output format",
      type: "string",
      choices: ["table", "json"],
      default: "table",
    }),
  handler: Effect.fn("Cli.worktree.list")(function* (args) {
    const svc = yield* Worktree.Service
    const worktrees = yield* svc.list().pipe(Effect.catch(mapWorktreeError))

    if (worktrees.length === 0) return

    const output = args.format === "json" ? formatJSON(worktrees) : formatTable(worktrees)
    console.log(output)
  }),
})

export const WorktreeCreateCommand = effectCmd({
  command: "create [name]",
  describe: "create a fresh git worktree for the current project",
  builder: (yargs) =>
    yargs
      .positional("name", {
        describe: "optional worktree name; a slug is generated when omitted",
        type: "string",
      })
      .option("detached", {
        describe: "create a detached worktree instead of an advcode branch",
        type: "boolean",
        default: false,
      })
      .option("start-command", {
        describe: "additional startup script to run after the project's start command",
        type: "string",
      }),
  handler: Effect.fn("Cli.worktree.create")(function* (args) {
    const svc = yield* Worktree.Service
    const info = yield* svc
      .makeWorktreeInfo({ name: args.name, detached: args.detached })
      .pipe(Effect.catch(mapWorktreeError))
    yield* svc
      .createFromInfo(info, args.startCommand)
      .pipe(Effect.catch((error: Worktree.Error) => mapWorktreeError(error)))
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Created worktree '${info.name}'` + UI.Style.TEXT_NORMAL)
    UI.println(`Directory: ${info.directory}${info.branch ? `\nBranch: ${info.branch}` : ""}`)
  }),
})

export const WorktreeRemoveCommand = effectCmd({
  command: "remove <directory>",
  describe: "remove a worktree by directory path",
  builder: (yargs) =>
    yargs.positional("directory", {
      describe: "path to the worktree directory to remove",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.worktree.remove")(function* (args) {
    const svc = yield* Worktree.Service
    yield* svc.remove({ directory: args.directory }).pipe(Effect.catch(mapWorktreeError))
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Removed worktree ${args.directory}` + UI.Style.TEXT_NORMAL)
  }),
})

export const WorktreeResetCommand = effectCmd({
  command: "reset <directory>",
  describe: "reset a worktree back to the default branch, dropping local changes",
  builder: (yargs) =>
    yargs.positional("directory", {
      describe: "path to the worktree directory to reset",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.worktree.reset")(function* (args) {
    const svc = yield* Worktree.Service
    yield* svc.reset({ directory: args.directory }).pipe(Effect.catch(mapWorktreeError))
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Reset worktree ${args.directory}` + UI.Style.TEXT_NORMAL)
  }),
})

function formatTable(worktrees: (Omit<Worktree.Info, "branch"> & { branch?: string })[]) {
  const maxNameWidth = Math.max(4, ...worktrees.map((w) => w.name.length))
  const lines = [`Name${" ".repeat(maxNameWidth - 4)}  Directory${" ".repeat(20 - 9)}  Branch`]
  lines.push("─".repeat(40))
  for (const worktree of worktrees) {
    const branch = worktree.branch ?? "(detached)"
    lines.push(`${worktree.name.padEnd(maxNameWidth)}  ${worktree.directory.padEnd(20)}  ${branch}`)
  }
  return lines.join("\n")
}

function formatJSON(worktrees: (Omit<Worktree.Info, "branch"> & { branch?: string })[]) {
  return JSON.stringify(worktrees, null, 2)
}