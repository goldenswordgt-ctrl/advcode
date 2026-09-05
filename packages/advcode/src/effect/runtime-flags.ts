import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("OPENCODE_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )
// Background subagents are a headline ADVCode feature and default ON. An explicit
// OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=false overrides (opt-out); otherwise enabled.
const backgroundSubagentsDefaultOn = () =>
  Config.boolean("OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS")
    .pipe(Config.option)
    .pipe(Config.map((enabled) => Option.getOrElse(enabled, () => true)))

export class Service extends ConfigService.Service<Service>()("@opencode/RuntimeFlags", {
  autoShare: bool("OPENCODE_AUTO_SHARE"),
  pure: bool("OPENCODE_PURE"),
  // Lightweight mode: one switch that disables the heavy subsystems so the
  // agent runs acceptably on low-RAM / low-CPU hardware. Compose the existing
  // per-subsystem flags rather than gating each wiring point individually.
  lightweight: bool("OPENCODE_LIGHTWEIGHT"),
  disableDefaultPlugins: bool("OPENCODE_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("OPENCODE_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("OPENCODE_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("OPENCODE_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("OPENCODE_DISABLE_CLAUDE_CODE"),
    direct: bool("OPENCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("OPENCODE_DISABLE_CLAUDE_CODE"),
    direct: bool("OPENCODE_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("OPENCODE_ENABLE_EXA"),
    legacy: bool("OPENCODE_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("OPENCODE_ENABLE_PARALLEL"),
    legacy: bool("OPENCODE_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("OPENCODE_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("OPENCODE_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("OPENCODE_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: backgroundSubagentsDefaultOn(),
  experimentalLspTy: bool("OPENCODE_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("OPENCODE_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("OPENCODE_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("OPENCODE_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("OPENCODE_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("OPENCODE_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("OPENCODE_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("OPENCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("OPENCODE_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("OPENCODE_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("OPENCODE_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

// Lightweight mode folds the heavy-subsystem disables into one switch. Read the
// underlying config service, apply the override set, and return the folded Info.
//
// Purpose: a deterministic MINIMAL profile so low-RAM / low-CPU hosts only pay
// for the core agent. Everything experimental or optional is forced off here —
// even if an env var tried to enable it — and the profile composes the existing
// per-subsystem flags rather than gating each wiring point individually.
//
// Not folded: in-process background tool settlement (core SessionRunner
// BACKGROUND_TOOLS) is cheap and runs the tool either way — no extra process,
// no heavy machinery — so it stays available even in lightweight mode.
const foldLightweight = (flags: Info): Info => {
  if (!flags.lightweight) return flags
  return {
    ...flags,
    // Plugins + session hooks (in-process plugin machinery is a real RAM cost)
    pure: true,
    disableDefaultPlugins: true,
    // Embedded web UI and external skills
    disableEmbeddedWebUi: true,
    disableExternalSkills: true,
    // LSP downloads, LSP tool, and LSP type tooling
    disableLspDownload: true,
    experimentalLspTool: false,
    experimentalLspTy: false,
    // Claude Code prompt + skills
    disableClaudeCodePrompt: true,
    disableClaudeCodeSkills: true,
    // Background subagents
    experimentalBackgroundSubagents: false,
    // EventV2 projections (catalog/drain/durable markers)
    experimentalEventSystem: false,
    // Parallel extension requests, interactive question tool, Exa search
    enableParallel: false,
    enableQuestionTool: false,
    enableExa: false,
    enableExperimentalModels: false,
    // All remaining experimental gates off for a fully deterministic profile
    experimentalReferences: false,
    experimentalOxfmt: false,
    experimentalPlanMode: false,
    experimentalCodeMode: false,
    experimentalWorkspaces: false,
    experimentalIconDiscovery: false,
    experimentalNativeLlm: false,
    experimentalWebSockets: false,
  }
}

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

/** Test overlay: parse defaults, apply the lightweight fold (if lightweight is set by config or overrides), then explicit overrides on top. */
export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      const effective = { ...flags, ...overrides }
      return Service.of({ ...foldLightweight(effective), ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

// Production node: read the real env config, then apply the lightweight fold so
// OPENCODE_LIGHTWEIGHT=1 actually reaches every subsystem gate.
export const node = LayerNode.make({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of(foldLightweight(flags))
    }),
  ).pipe(Layer.provide(Service.layer.pipe(Layer.orDie))),
  deps: [],
})

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
