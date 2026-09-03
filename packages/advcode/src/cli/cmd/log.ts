import { EOL } from "os"
import type { Argv } from "yargs"
import { DateTime, Effect } from "effect"
import { ToolIntentEvent } from "@opencode-ai/schema/tool-intent-event"
import { Event } from "@opencode-ai/schema/event"
import { EventV2 } from "@opencode-ai/core/event"
import { Database } from "@opencode-ai/core/database/database"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { cmd } from "./cmd"
import { effectCmd } from "../effect-cmd"

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

const toolIntentManifest = {
  definitions: Event.durable(ToolIntentEvent.DurableDefinitions),
  schema: ToolIntentEvent.Durable,
}

export const LogCommand = cmd({
  command: "log",
  describe: "read event-sourced logs",
  builder: (yargs: Argv) => yargs.command(ToolLogCommand).demandCommand(),
  async handler() {},
})

type Started = ToolIntentEvent.Started
type Ended = ToolIntentEvent.Ended

const ToolLogCommand = effectCmd({
  command: "tool <sessionID>",
  describe: "list tool_intent events for a session (start -> end pairs with outcome), most recent first",
  instance: false,
  builder: (yargs) =>
    yargs.positional("sessionID", {
      type: "string",
      describe: "the session ID to read",
      demandOption: true,
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const page = yield* EventV2.readAggregate(db, {
        aggregateID: args.sessionID,
        limit: 1000,
        manifest: toolIntentManifest,
      })
      const starts = new Map<string, Started>()
      const ends = new Map<string, Ended>()
      for (const event of page.events.toReversed()) {
        if (event.type === "tool.intent.start") starts.set(event.data.toolCallID, event as unknown as Started)
        if (event.type === "tool.intent.end") ends.set(event.data.toolCallID, event as unknown as Ended)
      }
      const ids = Array.from(new Set([...starts.keys(), ...ends.keys()]))
      const rows = ids.map((toolCallID) => {
        const start = starts.get(toolCallID)
        const end = ends.get(toolCallID)
        return {
          toolCallID,
          tool: start?.data.tool ?? end?.data.tool ?? "",
          agent: start?.data.agent ?? end?.data.agent ?? "",
          input: start?.data.input,
          resultType: end?.data.resultType,
          outputSummary: end?.data.outputSummary,
          startAt: start?.data.timestamp ? DateTime.formatIso(start.data.timestamp) : undefined,
          endAt: end?.data.timestamp ? DateTime.formatIso(end.data.timestamp) : undefined,
        }
      })
      process.stdout.write(JSON.stringify(rows, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.log.tool"),
      withLocation,
    ),
})
