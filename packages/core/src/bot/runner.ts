export * as BotRunner from "./runner"

import { Context, Effect, Layer, Stream } from "effect"
import { LLM, LLMClient, LLMEvent, Message, SystemPart } from "@opencode-ai/llm"
import { Catalog } from "../catalog"
import { Integration } from "../integration"
import { ModelV2 } from "../model"
import { BotMode } from "./bot"
import { fromCatalogModel } from "../session/runner/model"
import { makeLocationNode } from "../effect/app-node"
import { llmClient } from "../effect/app-node-platform"

/**
 * BotRunner — the execution side of BotMode.
 *
 * BotMode stores bots and channel messages; BotRunner gives them a brain:
 * load a bot, read the channel transcript, resolve a model, stream a reply
 * as that persona, and post it back to the channel. This is the "bot loop"
 * that makes group chats with named agents actually work.
 */

export interface Interface {
  /** Generate and post a reply as the named bot in a channel. */
  readonly respond: (input: { bot_name: string; channel: string }) => Effect.Effect<BotMode.BotMessage, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode2/v2/BotRunner") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bots = yield* BotMode.Service
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    const llm = yield* LLMClient.Service

    const resolveModel = Effect.fn("BotRunner.resolveModel")(function* (modelID: string | undefined) {
      const parsed = modelID ? ModelV2.parse(modelID) : undefined
      const selected = parsed
        ? yield* catalog.model
            .get(parsed.providerID, parsed.modelID)
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
        : yield* catalog.model.default().pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (selected === undefined) return
      const provider = yield* catalog.provider.get(selected.providerID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const connection = provider
        ? yield* integrations.connection
            .active(provider?.integrationID ?? Integration.ID.make(selected.providerID))
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      const credential = connection ? yield* integrations.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined))) : undefined
      return yield* fromCatalogModel(selected, credential).pipe(Effect.catch(() => Effect.succeed(undefined)))
    })

    const respond = Effect.fn("BotRunner.respond")(function* (input: { bot_name: string; channel: string }) {
      const bot = yield* bots.get(input.bot_name)
      if (!bot) return yield* Effect.fail(new Error(`unknown bot: ${input.bot_name}`))

      const history = yield* bots.read(input.channel, 24)
      const names = new Map<string, string>((yield* bots.list()).map((b) => [b.id, b.name]))
      const transcript = history
        .slice()
        .reverse()
        .map((m) => `${names.get(m.bot_id) ?? "?"}: ${m.body}`)
        .join("\n")

      const model = yield* resolveModel(bot.model)
      if (model === undefined) return yield* Effect.fail(new Error(`no model available for bot: ${input.bot_name}`))

      const persona = [bot.system_prompt, bot.persona].filter((s): s is string => Boolean(s)).join("\n\n")
      const system = SystemPart.make(
        persona.length > 0
          ? `You are ${bot.name}, participating in a group chat.\n\n${persona}`
          : `You are ${bot.name}, participating in a group chat.`,
      )

      const chunks: string[] = []
      yield* llm
        .stream(
          LLM.request({
            model,
            system: [system],
            messages: transcript.length > 0 ? [Message.user(transcript)] : [],
            tools: [],
          }),
        )
        .pipe(
          Stream.runForEach((event) => {
            if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
            return Effect.void
          }),
        )

      const reply = chunks.join("").trim()
      if (reply.length === 0) return yield* Effect.fail(new Error(`bot '${input.bot_name}' produced no reply`))
      return yield* bots.post({ bot_name: input.bot_name, channel: input.channel, body: reply })
    })

    return Service.of({ respond })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [BotMode.node, Catalog.node, Integration.node, llmClient],
})