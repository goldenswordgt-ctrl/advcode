import { EOL } from "os"
import { Effect } from "effect"
import { ObserverJob } from "@opencode-ai/core/observer/observer"
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

const OBSERVERS = [
  { name: "memory-recall", axis: "memory recall", enabled: true },
  { name: "skill-recall", axis: "skill recall", enabled: true },
  { name: "goal-progress", axis: "goal progress", enabled: true },
  { name: "verification", axis: "work verification", enabled: false },
] as const

const ObserveCheckCommand = effectCmd({
  command: "check",
  describe: "run all observers and show accepted / filtered advisories",
  handler: () =>
    Effect.gen(function* () {
      const observer = yield* ObserverJob.Service
      const result = yield* observer.runObservers({})
      if (result.accepted.length === 0 && result.filtered.length === 0) {
        process.stdout.write(`No observers produced proposals${EOL}`)
        return
      }
      if (result.accepted.length === 0) {
        process.stdout.write(`No advisories accepted${EOL}`)
      } else {
        process.stdout.write(`Accepted advisories:${EOL}`)
        for (const advisory of result.accepted) {
          process.stdout.write(`  [${advisory.observer}] ${advisory.note}${EOL}`)
          process.stdout.write(`    axis: ${advisory.axis}${EOL}`)
          process.stdout.write(`    reason: ${advisory.reason}${EOL}`)
        }
      }
      if (result.filtered.length > 0) {
        process.stdout.write(`Filtered (rejected by reconciler gate):${EOL}`)
        for (const advisory of result.filtered) {
          process.stdout.write(`  [${advisory.observer}] ${advisory.note}${EOL}`)
          process.stdout.write(`    axis: ${advisory.axis}${EOL}`)
          process.stdout.write(`    reason: ${advisory.reason}${EOL}`)
        }
      }
    }).pipe(
      Effect.withSpan("Cli.observe.check"),
      withLocation,
    ),
})

const ObserveStatusCommand = effectCmd({
  command: "status",
  describe: "show enabled observers and their axes",
  handler: () =>
    Effect.gen(function* () {
      process.stdout.write(`Observer status:${EOL}`)
      for (const obs of OBSERVERS) {
        const status = obs.enabled ? "enabled" : "disabled"
        process.stdout.write(`  ${obs.name}  [${status}]  axis: ${obs.axis}${EOL}`)
      }
    }).pipe(
      Effect.withSpan("Cli.observe.status"),
      withLocation,
    ),
})

export const ObserveCommand = cmd({
  command: "observe",
  describe: "background observer agents + reconciler",
  builder: (yargs) => yargs.command(ObserveCheckCommand).command(ObserveStatusCommand).demandCommand(),
  async handler() {},
})
