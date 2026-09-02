import { EOL } from "os"
import { Effect } from "effect"
import { BotMode } from "@opencode-ai/core/bot/bot"
import { BotRunner } from "@opencode-ai/core/bot/runner"
import { LocationServiceMap, locationServiceMapLayer, locationGlobalServices } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
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

export const BotCommand = cmd({
  command: "bot",
  describe: "manage named bots in group chats",
  builder: (yargs: Argv) =>
    yargs
      .command(BotRegisterCommand)
      .command(BotListCommand)
      .command(BotPostCommand)
      .command(BotReadCommand)
      .command(BotRespondCommand)
      .demandCommand(),
  async handler() {},
})

const BotRegisterCommand = effectCmd({
  command: "register <name>",
  describe: "register a bot with a persona",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", describe: "bot name", demandOption: true })
      .option("persona", { type: "string", describe: "personality description" })
      .option("system-prompt", { type: "string", describe: "system prompt override" })
      .option("model", { type: "string", describe: "model in provider/model format" })
      .option("avatar", { type: "string", describe: "avatar key" }),
  handler: (args) =>
    Effect.gen(function* () {
      const bots = yield* BotMode.Service
      const bot = yield* bots.register({
        name: args.name,
        persona: args.persona,
        system_prompt: args["system-prompt"],
        model: args.model,
        avatar: args.avatar,
      })
      process.stdout.write(JSON.stringify(bot, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.bot.register"),
      withLocation,
    ),
})

const BotListCommand = effectCmd({
  command: "list",
  describe: "list registered bots",
  instance: false,
  handler: () =>
    Effect.gen(function* () {
      const bots = yield* BotMode.Service
      const items = yield* bots.list()
      process.stdout.write(JSON.stringify(items, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.bot.list"),
      withLocation,
    ),
})

const BotPostCommand = effectCmd({
  command: "post <name> <channel> <body>",
  describe: "post a message to a channel as a bot",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", describe: "bot name", demandOption: true })
      .positional("channel", { type: "string", describe: "channel name", demandOption: true })
      .positional("body", { type: "string", describe: "message body", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const bots = yield* BotMode.Service
      const message = yield* bots
        .post({ bot_name: args.name, channel: args.channel, body: args.body })
        .pipe(Effect.catch(() => fail(`unknown bot: ${args.name}`)))
      process.stdout.write(JSON.stringify(message, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.bot.post"),
      withLocation,
    ),
})

const BotReadCommand = effectCmd({
  command: "read <channel>",
  describe: "read recent messages in a channel",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("channel", { type: "string", describe: "channel name", demandOption: true })
      .option("limit", { alias: "n", type: "number", describe: "max messages", default: 50 }),
  handler: (args) =>
    Effect.gen(function* () {
      const bots = yield* BotMode.Service
      const messages = yield* bots.read(args.channel, args.limit)
      process.stdout.write(JSON.stringify(messages, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.bot.read"),
      withLocation,
    ),
})

const BotRespondCommand = effectCmd({
  command: "respond <name> <channel>",
  describe: "have a bot generate and post a reply in a channel",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", describe: "bot name", demandOption: true })
      .positional("channel", { type: "string", describe: "channel name", demandOption: true }),
  handler: (args) =>
    Effect.gen(function* () {
      const runner = yield* BotRunner.Service
      const message = yield* runner
        .respond({ bot_name: args.name, channel: args.channel })
        .pipe(Effect.catch((error) => fail(error.message)))
      process.stdout.write(JSON.stringify(message, null, 2) + EOL)
    }).pipe(
      Effect.withSpan("Cli.bot.respond"),
      withLocation,
    ),
})