import { EOL } from "os"
import { Effect } from "effect"
import { SelfLearning } from "@opencode-ai/core/skill/self-learn"
import { SessionSchema } from "@opencode-ai/core/session/schema"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
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

export const LearnCommand = effectCmd({
  command: "learn <sessionID>",
  describe: "distill a session into cross-session memory and learned skills",
  instance: false,
  builder: (yargs) =>
    yargs.positional("sessionID", { type: "string", describe: "session ID to distill", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const sessionID = args.sessionID as SessionSchema.ID
      const selfLearning = yield* SelfLearning.Service
      yield* selfLearning.learnFromTurn({ sessionID, worked: true })
      process.stdout.write(`Distilled ${args.sessionID}${EOL}`)
    }).pipe(
      Effect.withSpan("Cli.learn"),
      withLocation,
    ),
})