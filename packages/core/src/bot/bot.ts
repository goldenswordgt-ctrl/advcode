export * as BotMode from "./bot"

import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database"
import { BotAgentTable, BotMessageTable } from "./sql"
import { eq, desc } from "drizzle-orm"

/**
 * BotMode — named agents with faces, talking in group chats.
 *
 * Hermes's "Bot Mode" lets a society of named agents (with distinct
 * personae/avatars/models) converse in channels. This is the local
 * equivalent: bots live in SQLite, messages are threaded by channel,
 * and any agent (or the main session) can post or read a channel.
 */

export const Bot = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  persona: Schema.optional(Schema.String),
  avatar: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  system_prompt: Schema.optional(Schema.String),
  time_created: Schema.Number,
})
export type Bot = typeof Bot.Type

export const BotMessage = Schema.Struct({
  id: Schema.String,
  bot_id: Schema.String,
  channel: Schema.String,
  body: Schema.String,
  time_created: Schema.Number,
})
export type BotMessage = typeof BotMessage.Type

export interface Interface {
  /** Register a named bot with a persona/avatar/model. */
  readonly register: (input: {
    name: string
    persona?: string
    avatar?: string
    model?: string
    system_prompt?: string
  }) => Effect.Effect<Bot>
  /** List registered bots. */
  readonly list: () => Effect.Effect<Bot[]>
  /** Get a bot by name. */
  readonly get: (name: string) => Effect.Effect<Bot | undefined>
  /** Post a message to a channel as a bot. */
  readonly post: (input: { bot_name: string; channel: string; body: string }) => Effect.Effect<BotMessage>
  /** Read recent messages in a channel. */
  readonly read: (channel: string, limit?: number) => Effect.Effect<BotMessage[]>
  /** Remove a bot and its messages. */
  readonly unregister: (name: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode2/v2/BotMode") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const register = Effect.fn("BotMode.register")(function* (input) {
      const id = crypto.randomUUID()
      const now = Date.now()
      yield* Effect.tryPromise(() =>
        db.insert(BotAgentTable).values({
          id,
          name: input.name,
          persona: input.persona ?? null,
          avatar: input.avatar ?? null,
          model: input.model ?? null,
          system_prompt: input.system_prompt ?? null,
          time_created: now,
          time_updated: now,
        }),
      )
      return {
        id,
        name: input.name,
        persona: input.persona,
        avatar: input.avatar,
        model: input.model,
        system_prompt: input.system_prompt,
        time_created: now,
      } satisfies Bot
    })

    const list = Effect.fn("BotMode.list")(function* () {
      const rows = yield* Effect.tryPromise(() => db.select().from(BotAgentTable).orderBy(desc(BotAgentTable.time_created)))
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        persona: row.persona ?? undefined,
        avatar: row.avatar ?? undefined,
        model: row.model ?? undefined,
        system_prompt: row.system_prompt ?? undefined,
        time_created: row.time_created,
      } satisfies Bot))
    })

    const get = Effect.fn("BotMode.get")(function* (name) {
      const rows = yield* Effect.tryPromise(() =>
        db.select().from(BotAgentTable).where(eq(BotAgentTable.name, name)).limit(1),
      )
      const row = rows[0]
      if (!row) return undefined
      return {
        id: row.id,
        name: row.name,
        persona: row.persona ?? undefined,
        avatar: row.avatar ?? undefined,
        model: row.model ?? undefined,
        system_prompt: row.system_prompt ?? undefined,
        time_created: row.time_created,
      } satisfies Bot
    })

    const post = Effect.fn("BotMode.post")(function* (input) {
      const bot = yield* get(input.bot_name)
      if (!bot) return yield* Effect.fail(new Error(`unknown bot: ${input.bot_name}`))
      const id = crypto.randomUUID()
      const now = Date.now()
      yield* Effect.tryPromise(() =>
        db.insert(BotMessageTable).values({ id, bot_id: bot.id, channel: input.channel, body: input.body, time_created: now }),
      )
      return { id, bot_id: bot.id, channel: input.channel, body: input.body, time_created: now } satisfies BotMessage
    })

    const read = Effect.fn("BotMode.read")(function* (channel, limit = 50) {
      const rows = yield* Effect.tryPromise(() =>
        db
          .select()
          .from(BotMessageTable)
          .where(eq(BotMessageTable.channel, channel))
          .orderBy(desc(BotMessageTable.time_created))
          .limit(limit),
      )
      return rows.map((row) => ({
        id: row.id,
        bot_id: row.bot_id,
        channel: row.channel,
        body: row.body,
        time_created: row.time_created,
      } satisfies BotMessage))
    })

    const unregister = Effect.fn("BotMode.unregister")(function* (name) {
      const bot = yield* get(name)
      if (!bot) return
      yield* Effect.tryPromise(() => db.delete(BotMessageTable).where(eq(BotMessageTable.bot_id, bot.id))).pipe(
        Effect.ignore,
      )
      yield* Effect.tryPromise(() => db.delete(BotAgentTable).where(eq(BotAgentTable.id, bot.id))).pipe(Effect.ignore)
    })

    return Service.of({ register, list, get, post, read, unregister })
  }),
)

export const node = Layer.provide(layer, Database.node)