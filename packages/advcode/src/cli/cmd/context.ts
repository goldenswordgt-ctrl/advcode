import { EOL } from "os"
import { Effect } from "effect"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SystemContextRegistry } from "@opencode-ai/core/system-context/registry"
import { Location } from "@opencode-ai/core/location"
import {
  LocationServiceMap,
  locationServiceMapLayer,
  locationGlobalServices,
} from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"

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

export interface ContextSource {
  readonly key: string
  readonly chars: number
}

const charCount = (text: string) => text.length
const tokenEstimate = (chars: number) => chars / 4

/** Render the context sources as a proportional colored grid, sorted largest first. */
export function formatGrid(
  sources: ContextSource[],
  options: { width: number; bloat: number },
): { body: string; warnings: string[] } {
  if (sources.length === 0) return { body: "no context sources registered", warnings: [] }
  const width = Math.max(10, Math.min(100, options.width))
  const sorted = [...sources].sort((a, b) => b.chars - a.chars)
  const max = sorted[0]!.chars
  const total = sorted.reduce((sum, source) => sum + source.chars, 0)
  const keyWidth = Math.max(...sorted.map((source) => source.key.length))

  const bar = (source: ContextSource) => {
    const filled = Math.max(1, Math.round((source.chars / max) * width))
    const color =
      source.chars > options.bloat
        ? UI.Style.TEXT_DANGER
        : source.chars / total > 0.25
          ? UI.Style.TEXT_WARNING
          : UI.Style.TEXT_SUCCESS
    return `${color}${"█".repeat(filled)}${UI.Style.TEXT_NORMAL}`
  }

  const rows = sorted.map((source) => {
    const pct = ((source.chars / total) * 100).toFixed(1).padStart(5)
    return `${source.key.padEnd(keyWidth)} ${bar(source)}  ${pct}%  ${source.chars.toLocaleString()} chars  (~${Math.round(tokenEstimate(source.chars)).toLocaleString()} tokens)`
  })

  const bloat = sorted.filter((source) => source.chars > options.bloat)
  const warnings = bloat.map(
    (source) =>
      `⚠  ${source.key} is ${source.chars.toLocaleString()} chars (~${Math.round(tokenEstimate(source.chars)).toLocaleString()} tokens) — consider shrinking this context source`,
  )

  const header = `System context (${sorted.length} sources, ${total.toLocaleString()} chars, ~${Math.round(tokenEstimate(total)).toLocaleString()} tokens estimated)`
  return { body: [header, ...rows].join(EOL), warnings }
}

export const ContextCommand = effectCmd({
  command: "context",
  describe: "visualize system context sources as a colored size grid with bloat warnings",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("width", {
        type: "number",
        default: 60,
        describe: "grid width in characters",
      })
      .option("bloat", {
        type: "number",
        default: 12000,
        describe: "warning threshold in characters per source",
      })
      .option("json", {
        type: "boolean",
        default: false,
        describe: "emit machine-readable JSON instead of the grid",
      }),
  handler: (args) =>
    Effect.gen(function* () {
      const registry = yield* SystemContextRegistry.Service
      const combined = yield* registry.load()
      const rendered = yield* SystemContext.renderSources(combined).pipe(
        Effect.catchTag("SystemContext.InitializationBlocked", () =>
          fail("some context sources are unavailable right now — try again"),
        ),
      )
      const sources = rendered.map(({ key, text }) => ({ key, chars: charCount(text) }))

      if (args.json) {
        const total = sources.reduce((sum, source) => sum + source.chars, 0)
        console.log(
          JSON.stringify(
            {
              total: { chars: total, tokens: Math.round(tokenEstimate(total)) },
              sources: [...sources].sort((a, b) => b.chars - a.chars),
            },
            null,
            2,
          ),
        )
        return
      }

      const { body, warnings } = formatGrid(sources, { width: args.width, bloat: args.bloat })
      UI.println(body)
      for (const warning of warnings) UI.println(UI.Style.TEXT_WARNING_BOLD + warning + UI.Style.TEXT_NORMAL)
    }).pipe(Effect.withSpan("Cli.context"), withLocation),
})
