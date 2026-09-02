import { EOL } from "os"
import { Effect } from "effect"
import { MemoryV2 } from "@opencode-ai/core/memory/memory"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { cmd } from "./cmd"
import { effectCmd } from "../effect-cmd"
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
  describe: "inspect the persistent cross-session memory",
  builder: (yargs: Argv) => yargs.command(MemoryListCommand).command(MemoryUserCommand).demandCommand(),
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
    }).pipe(
      Effect.withSpan("Cli.memory.list"),
      withLocation,
    ),
})

const MemoryUserCommand = effectCmd({
  command: "user",
  describe: "show the distilled user model",
  handler: () =>
    Effect.gen(function* () {
      const memory = yield* MemoryV2.Service
      const facts = yield* memory.recallUser()
      process.stdout.write(JSON.stringify(facts, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.memory.user"),
      withLocation,
    ),
})