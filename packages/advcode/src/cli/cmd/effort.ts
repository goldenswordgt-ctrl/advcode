import path from "path"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { ConfigMarkdown as ConfigMarkdownCore } from "@opencode-ai/core/config/markdown"
import { Filesystem } from "@/util/filesystem"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"

export const EFFORT_VALUES = ["low", "medium", "high"] as const
export type EffortValue = (typeof EFFORT_VALUES)[number]
export type EffortDial = EffortValue | "default"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/
const VARIANT_LINE = /^variant\s*:/

/** Parse the value of an existing `variant:` frontmatter line, unquoted. */
export function readVariant(content: string): string | undefined {
  const match = FRONTMATTER.exec(content)
  if (!match) return undefined
  for (const line of match[1]!.split(/\r?\n/)) {
    if (VARIANT_LINE.test(line)) {
      return line
        .replace(VARIANT_LINE, "")
        .trim()
        .replace(/^["']|["']$/g, "")
    }
  }
  return undefined
}

/**
 * Insert, update, or remove the `variant:` frontmatter line while leaving
 * every other byte untouched. Setting `undefined` removes the line; a dial
 * value of "default" is lowered to `undefined` by the caller. Returns the
 * original content when nothing changes so files are never rewritten
 * needlessly. Files without a YAML frontmatter block are returned untouched.
 */
export function patchVariant(content: string, value: string | undefined): string {
  const match = FRONTMATTER.exec(content)
  if (!match) return content
  const eol = /\r/.test(match[0]) ? "\r\n" : "\n"
  const lines = match[1]!.split(eol)
  const index = lines.findIndex((line) => VARIANT_LINE.test(line))
  const next =
    value === undefined
      ? index === -1
        ? lines
        : [...lines.slice(0, index), ...lines.slice(index + 1)]
      : index === -1
        ? [...lines, `variant: ${value}`]
        : [...lines.slice(0, index), `variant: ${value}`, ...lines.slice(index + 1)]
  if (next === lines) return content
  return content.replace(match[1]!, next.join(eol))
}

/**
 * Resolve the default agent markdown file to edit: a project-scoped
 * `agent/default.md` or `agents/default.md` wins, otherwise the global one.
 */
export function defaultAgentFile(cwd: string, globalConfigDir: string = Global.Path.config): string | undefined {
  const candidates = [
    path.join(cwd, ".opencode", "agent", "default.md"),
    path.join(cwd, ".opencode", "agents", "default.md"),
    path.join(globalConfigDir, "agent", "default.md"),
    path.join(globalConfigDir, "agents", "default.md"),
  ]
  return candidates.find((p) => Filesystem.stat(p) !== undefined)
}

export const EffortCommand = effectCmd({
  command: "effort [value]",
  describe:
    "dial the default agent's reasoning effort (low/medium/high) via its `variant` frontmatter; 'default' clears it",
  instance: false,
  builder: (yargs) =>
    yargs.positional("value", {
      type: "string",
      choices: [...EFFORT_VALUES, "default"] as const,
      describe: "effort level to dial in, or 'default' to clear the agent variant back to provider defaults",
    }),
  handler: (args) =>
    Effect.gen(function* () {
      const dial = args.value as EffortDial | undefined
      if (dial !== undefined && dial !== "default" && !EFFORT_VALUES.includes(dial as EffortValue)) {
        return yield* fail(`invalid effort "${dial}" — use ${EFFORT_VALUES.join("/")} or "default"`)
      }

      const cwd = process.cwd()
      const file = yield* Effect.sync(() => defaultAgentFile(cwd))
      if (!file) {
        return yield* fail(
          `no default agent markdown found — expected .opencode/agent/default.md (project) or ${Global.Path.config}/agent/default.md (global)`,
        )
      }

      const content = yield* Effect.promise(() => Filesystem.readText(file))
      const current = readVariant(content)
      if (dial === undefined) {
        UI.println(
          current
            ? `effort dial: ${UI.Style.TEXT_SUCCESS}${current}${UI.Style.TEXT_NORMAL} (default agent ${file})`
            : `effort dial: unset (${UI.Style.TEXT_WARNING}provider default${UI.Style.TEXT_NORMAL}) — default agent ${file}`,
        )
        return
      }

      const value = dial === "default" ? undefined : dial
      const patched = patchVariant(content, value)
      if (patched === content) {
        if (value === undefined) UI.println("effort dial already unset")
        else UI.println(`effort dial already ${value}`)
        return
      }
      yield* Effect.promise(() => Filesystem.write(file, patched))
      UI.println(
        value === undefined
          ? `effort dial cleared (${file})`
          : `effort dial set to ${UI.Style.TEXT_SUCCESS}${value}${UI.Style.TEXT_NORMAL} — default agent ${file}`,
      )
    }).pipe(Effect.withSpan("Cli.effort")),
})
