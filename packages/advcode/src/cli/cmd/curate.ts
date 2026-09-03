import { EOL } from "os"
import { Effect } from "effect"
import { SkillCurator } from "@opencode-ai/core/skill/curator"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { effectCmd } from "../effect-cmd"
import { cmd } from "./cmd"
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

export const CurateCommand = cmd({
  command: "curate",
  describe: "score, review, and prune learned skills",
  builder: (yargs: Argv) =>
    yargs
      .command(CurateStatsCommand)
      .command(CuratePruneCommand)
      .demandCommand(),
  async handler() {},
})

const CurateStatsCommand = effectCmd({
  command: "stats",
  describe: "score all learned skills and show the distribution",
  handler: (args) =>
    Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const stats = yield* curator.stats()
      process.stdout.write(JSON.stringify(stats, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.curate.stats"),
      withLocation,
    ),
})

const CuratePruneCommand = effectCmd({
  command: "prune",
  describe: "remove learned skills below a score threshold",
  builder: (yargs) =>
    yargs.option("threshold", {
      alias: "t",
      describe: "minimum score to keep (default 15)",
      type: "number",
      default: 15,
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const removed = yield* curator.prune(args.threshold ?? 15)
      if (removed.length === 0) {
        process.stdout.write("Nothing to prune. Clean library. Impressive." + EOL)
        return
      }
      for (const name of removed) process.stdout.write(`pruned: ${name}${EOL}`)
      process.stdout.write(`${removed.length} skill(s) removed${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.curate.prune"),
      withLocation,
    ),
})
