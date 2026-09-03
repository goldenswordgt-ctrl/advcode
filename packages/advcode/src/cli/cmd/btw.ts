import { EOL } from "os"
import { Effect, Stream } from "effect"
import { LLM, LLMClient, LLMEvent, Message, SystemPart } from "@opencode-ai/llm"
import { BackgroundJob } from "@opencode-ai/core/background-job"
import { Catalog } from "@opencode-ai/core/catalog"
import { Integration } from "@opencode-ai/core/integration"
import { ModelV2 } from "@opencode-ai/core/model"
import { MemoryV2 } from "@opencode-ai/core/memory/memory"
import { fromCatalogModel } from "@opencode-ai/core/session/runner/model"
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

export const BtwCommand = effectCmd({
  command: "btw <question>",
  describe: "run a quick out-of-band side query (by the way) without pausing the session",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("question", {
        type: "string",
        describe: "the question to ask",
        demandOption: true,
      })
      .option("model", {
        type: "string",
        describe: "model ID to use (provider/model)",
      })
      .option("limit", {
        type: "number",
        default: 8,
        describe: "max memory facts to recall",
      })
      .option("no-memory", {
        type: "boolean",
        default: false,
        describe: "skip memory recall",
      }),
  handler: (args) =>
    Effect.gen(function* () {
      const background = yield* BackgroundJob.Service
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      const llm = yield* LLMClient.Service
      const memory = yield* MemoryV2.Service

      const parsed = args.model ? ModelV2.parse(args.model) : undefined
      const selected = parsed
        ? yield* catalog.model
            .get(parsed.providerID, parsed.modelID)
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
        : yield* catalog.model.default().pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!selected) {
        process.stderr.write("[btw] no model available" + EOL)
        return
      }
      const provider = yield* catalog.provider.get(selected.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const connection = provider
        ? yield* integrations.connection
            .active(provider.integrationID ?? Integration.ID.make(selected.providerID))
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      const credential = connection
        ? yield* integrations.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      const model = yield* fromCatalogModel(selected, credential).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!model) {
        process.stderr.write("[btw] failed to resolve model" + EOL)
        return
      }

      const memoryContext = args["no-memory"]
        ? ""
        : (yield* memory.recallTop(args.limit))
            .map((e) => `- [${e.type}] ${e.key}: ${e.value}`)
            .join("\n")

      const system = SystemPart.make(
        [
          "You are a helpful coding assistant providing a quick side answer.",
          "Be concise and direct.",
          memoryContext.length > 0 ? `\nRemembered context:\n${memoryContext}` : "",
        ]
          .filter((s) => s.length > 0)
          .join("\n"),
      )

      const job = yield* background.start({
        type: "btw",
        title: args.question,
        run: Effect.gen(function* () {
          const chunks: string[] = []
          yield* llm
            .stream(
              LLM.request({
                model,
                system: [system],
                messages: [Message.user(args.question)],
                tools: [],
              }),
            )
            .pipe(
              Stream.runForEach((event) => {
                if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
                return Effect.void
              }),
            )
          return chunks.join("").trim()
        }),
      })

      process.stderr.write("[btw] " + EOL)

      const result = yield* background.wait({ id: job.id })
      if (result.info?.status === "completed" && result.info.output) {
        process.stdout.write(result.info.output + EOL)
      } else if (result.info?.status === "error") {
        process.stderr.write("[btw] error: " + (result.info.error ?? "unknown") + EOL)
      }
    }).pipe(
      Effect.withSpan("Cli.btw"),
      withLocation,
    ),
})
