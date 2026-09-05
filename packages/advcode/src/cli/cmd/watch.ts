import path from "path"
import { Duration, Effect, Ref, Stream } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { FileSystemWatcher } from "@opencode-ai/schema/filesystem-watcher"
import { effectCmd, fail } from "../effect-cmd"
import { Flag } from "@opencode-ai/core/flag/flag"
import { UI } from "../ui"

/**
 * Watch mode — Aider-style `AI:` comments drive the agent.
 *
 * Leaves an `AI: <instruction>` comment in any watched file and the agent
 * picks it up as a task within the debounce window. Language-agnostic: the
 * marker is matched after common single-line comment prefixes (`//`, `#`,
 * `--`, `*`, `/*`, `<!--`, `;`). Identical instructions are only dispatched
 * once per process, so re-saving a file does not re-run the same task.
 */

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

const COMMENT_PREFIX = /^(?:\/\/|#|--|\*|\/\*|<!--|;)/
const COMMENT_SUFFIX = /(?:-->|\*\/)\s*$/

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractInstructions(content: string, marker: string): { line: number; text: string }[] {
  const tag = `${marker}:`
  const out: { line: number; text: string }[] = []
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    let rest = lines[i]!.trim()
    const prefix = COMMENT_PREFIX.exec(rest)?.[0]
    if (prefix) rest = rest.slice(prefix.length).trimStart()
    rest = rest.replace(COMMENT_SUFFIX, "").trimEnd()
    if (!rest.startsWith(tag)) continue
    const text = rest.slice(tag.length).trim()
    if (text.length > 0) out.push({ line: i + 1, text })
  }
  return out
}

export const WatchCommand = effectCmd({
  command: "watch",
  describe:
    "watch files for 'AI:' comments and run each as an agent task (requires OPENCODE_EXPERIMENTAL_FILEWATCHER=1)",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("marker", {
        type: "string",
        default: "AI",
        describe: "instruction marker prefix (matched as <marker>:)",
      })
      .option("model", {
        type: "string",
        describe: "model ID to use for dispatched tasks",
      })
      .option("agent", {
        type: "string",
        describe: "agent name to use for dispatched tasks",
      })
      .option("debounce", {
        type: "number",
        default: 1000,
        describe: "quiet window in ms before a batch of instructions is dispatched",
      })
      .option("dry-run", {
        type: "boolean",
        default: false,
        describe: "print matching instructions without running them",
      }),
  handler: (args) =>
    Effect.gen(function* () {
      if (!(yield* Flag.OPENCODE_EXPERIMENTAL_FILEWATCHER.pipe(Effect.orDie))) {
        return yield* fail("file watching is disabled — run with OPENCODE_EXPERIMENTAL_FILEWATCHER=1")
      }
      const events = yield* EventV2.Service
      // Force the watcher node to initialize so file events actually publish.
      yield* Watcher.Service
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service

      // Instructions already dispatched (file:line:text) so re-saving a file
      // does not re-trigger the same task.
      const seen = yield* Ref.make(new Set<string>())
      // Files changed since the last drain. Every watcher event appends; the
      // debounced stream emits a settle tick, which drains the whole batch.
      const pending = yield* Ref.make(new Set<string>())

      const dispatch = Effect.fn("Cli.watch.dispatch")(function* (file: string, instruction: { line: number; text: string }) {
        const rel = path.relative(location.project.directory, file)
        const where = `${rel}:${instruction.line}`
        if (args["dry-run"]) {
          UI.println(`[watch] ${where}: ${instruction.text}`)
          return
        }
        UI.println(`[watch] ${where}: ${instruction.text}`)
        const { runMini } = yield* Effect.promise(() => import("./run"))
        yield* Effect.tryPromise(() =>
          runMini({
            directory: location.project.directory,
            model: args.model,
            agent: args.agent,
            prompt: [`[watch] instruction from ${where}`, instruction.text].join("\n"),
          }),
        ).pipe(Effect.catchCause((cause) => Effect.logError("watch task failed", { file, cause })))
      })

      const processFile = Effect.fn("Cli.watch.processFile")(function* (file: string) {
        const content = yield* fs
          .readFileStringSafe(file)
          .pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (content === undefined) return
        for (const instruction of extractInstructions(content, args.marker)) {
          const key = `${file}:${instruction.line}:${instruction.text}`
          const isNew = yield* Ref.modify(seen, (set) =>
            set.has(key) ? [false, set] : [true, new Set(set).add(key)],
          )
          if (isNew) yield* dispatch(file, instruction)
        }
      })

      const drain = Effect.fn("Cli.watch.drain")(function* () {
        const files = yield* Ref.getAndSet(pending, new Set<string>())
        yield* Effect.forEach([...files].sort(), processFile, { concurrency: 1 })
      })

      // Startup scan: dispatch instructions already present in the tree so a
      // freshly started watcher handles pending tasks instead of waiting for
      // an edit. Uses the same scanner as the event path.
      const scanInitial = Effect.fn("Cli.watch.scanInitial")(function* () {
        const rg = yield* Ripgrep.Service
        const pattern = `^\\s*(?://|#|--|\\*|/\\*|<!--|;)?\\s*${escapeRegex(args.marker)}:`
        const matches = yield* rg
          .grep({ cwd: location.project.directory, pattern, limit: 1000 })
          .pipe(Effect.catch(() => Effect.succeed([])))
        const files = Array.from(
          new Set(matches.map((match) => path.join(location.project.directory, match.entry.path))),
        ).sort()
        yield* Effect.forEach(files, processFile, { concurrency: 4 })
      })

      UI.println(
        `[watch] watching ${location.project.directory} for "${args.marker}:" comments (Ctrl+C to stop)`,
      )
      yield* scanInitial()
      yield* events.subscribe(FileSystemWatcher.Event.Updated).pipe(
        Stream.tap((update) => Ref.update(pending, (set) => new Set(set).add(update.data.file))),
        Stream.debounce(Duration.millis(args.debounce)),
        Stream.runForEach(() => drain()),
      )
    }).pipe(
      Effect.withSpan("Cli.watch"),
      withLocation,
    ),
})