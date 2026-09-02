import { EOL } from "os"
import { Effect } from "effect"
import { SkillLearning } from "@opencode-ai/core/skill/learning"
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

export const SkillCommand = cmd({
  command: "skill",
  describe: "inspect skills the agent learned across sessions",
  builder: (yargs: Argv) => yargs.command(SkillListCommand).demandCommand(),
  async handler() {},
})

const SkillListCommand = effectCmd({
  command: "list",
  describe: "list learned skills",
  builder: (yargs) =>
    yargs.option("names", {
      alias: "n",
      describe: "print only skill names (one per line)",
      type: "boolean",
      default: false,
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const skills = yield* SkillLearning.Service
      const items = yield* skills.list()
      if (args.names) {
        for (const skill of items) process.stdout.write(`${skill.name}${EOL}`)
        return
      }
      process.stdout.write(JSON.stringify(items, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.skill.list"),
      withLocation,
    ),
})