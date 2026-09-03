import { EOL } from "os"
import { Effect } from "effect"
import { SessionTranscript } from "@opencode-ai/core/memory/transcript"
import { effectCmd } from "../effect-cmd"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"

/**
 * Transcript command — list/read session transcripts.
 *
 * Usage:
 *   advcode transcript list           list all saved transcripts
 *   advcode transcript get <session>  get a specific transcript
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

const TranscriptListCommand = effectCmd({
  command: "list",
  describe: "list all saved session transcripts",
  instance: false,
  handler: () =>
    Effect.gen(function* () {
      const transcripts = yield* SessionTranscript.Service.use((s) => s.list(20))
      if (transcripts.length === 0) {
        process.stdout.write(`(no transcripts saved)${EOL}`)
        return
      }
      for (const t of transcripts) {
        const time = new Date(t.time_updated).toISOString().slice(0, 16).replace("T", " ")
        const msgs = t.messages ?? "?"
        const title = t.title || "(unnamed)"
        process.stdout.write(`${t.session_id}  ${time}  ${msgs} msgs  ${title}${EOL}`)
      }
    }).pipe(
      Effect.withSpan("Cli.transcript.list"),
      withLocation,
    ),
})

const TranscriptGetCommand = effectCmd({
  command: "get <sessionID>",
  describe: "get a specific transcript",
  instance: false,
  builder: (yargs) =>
    yargs.positional("sessionID", { type: "string", describe: "session ID", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const t = yield* SessionTranscript.Service.use((s) => s.get(args.sessionID))
      if (!t) {
        process.stdout.write(`(no transcript found for ${args.sessionID})${EOL}`)
        return
      }
      process.stdout.write(`Session: ${t.session_id}${EOL}`)
      process.stdout.write(`Title:   ${t.title || "(unnamed)"}${EOL}`)
      process.stdout.write(`Agent:   ${t.agent || "?"}${EOL}`)
      process.stdout.write(`Model:   ${t.model || "?"}${EOL}`)
      process.stdout.write(`Messages: ${t.messages ?? "?"}${EOL}`)
      process.stdout.write(`File:    ${t.file_path}${EOL}`)
      process.stdout.write(`Updated: ${new Date(t.time_updated).toISOString()}${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.transcript.get"),
      withLocation,
    ),
})

export { TranscriptListCommand, TranscriptGetCommand }
