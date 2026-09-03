import { readFileSync } from "fs"
import { Effect, Schema } from "effect"
import { openBrowser } from "../browser"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({
    description:
      "The http(s) URL to navigate to. Must be fully qualified (e.g. https://example.com/path).",
  }),
  evaluate: Schema.optional(
    Schema.String.annotate({
      description:
        "Optional JS expression to evaluate after the page loads (awaitPromise is on). The JSON-serializable result is returned in the tool output. Use it to read DOM state, extract text, or drive page interactions.",
    }),
  ),
  videoPath: Schema.optional(
    Schema.String.annotate({
      description:
        "If set, record the rendered page to this path as a webm video (VP9). The video is returned as a file attachment. Uses screen recording so page motion/interactions appear in the video.",
    }),
  ),
  waitMs: Schema.optional(
    Schema.Number.annotate({
      description:
        "Milliseconds to wait after page load before evaluating/recording. Default 0.",
    }),
  ),
  durationSec: Schema.optional(
    Schema.Number.annotate({
      description: "Seconds to record video after load/eval. Default 3.",
    }),
  ),
  fps: Schema.optional(
    Schema.Number.annotate({
      description: "Frames per second for the recorded video. Default 20.",
    }),
  ),
  headless: Schema.optional(
    Schema.Boolean.annotate({
      description: "Whether to run Chrome headless. Default true.",
    }),
  ),
})

const DESCRIPTION = [
  "Drive a real headless Chrome page via Chrome DevTools Protocol and optionally record it as webm video.",
  "Use this when you need to:",
  "- See what a web page actually renders (capture it as video for the user).",
  "- Verify a live site, run a frontend check, or capture a visual regression.",
  "- Evaluate JavaScript against a real page's DOM and get a JSON result.",
  "",
  "On success with videoPath set, the recorded webm is attached. The tool resolves targets, waits for page load, evaluates your script, and records — one-shot, then the browser is torn down.",
].join(" ")

export const BrowserTool = Tool.define(
  "browser",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (
        params: Schema.Schema.Type<typeof Parameters>,
        ctx: Tool.Context,
      ): Effect.Effect<Tool.ExecuteResult> =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "browser",
            patterns: [params.url],
            always: ["*"],
            metadata: { url: params.url },
          })

          const result = yield* Effect.tryPromise(() =>
            openBrowser({
              url: params.url,
              evaluate: params.evaluate,
              videoPath: params.videoPath,
              waitMs: params.waitMs,
              durationSec: params.durationSec,
              fps: params.fps,
              headless: params.headless,
            }),
          ).pipe(
            Effect.orDie,
          )

          const lines: string[] = []
          lines.push(`Loaded ${params.url}`)
          if (result.videoPath) {
            lines.push(`Video recorded: ${result.videoPath} (${result.frames} frames, ${result.seconds}s)`)
          }
          if (params.evaluate) {
            lines.push(`Eval result: ${JSON.stringify(result.evalResult)}`)
          }

          const attachments: NonNullable<Tool.ExecuteResult["attachments"]> = []
          if (result.videoPath) {
            try {
              const bytes = readFileSync(result.videoPath)
              attachments.push({
                type: "file" as const,
                mime: "video/webm",
                filename: result.videoPath.split(/[\\/]/).pop() ?? "capture.webm",
                url: `data:video/webm;base64,${Buffer.from(bytes).toString("base64")}`,
              })
            } catch {
              // attachment is best-effort; output still carries the path
            }
          }

          return {
            title: `Browser: ${new URL(params.url).hostname}`,
            output: lines.join("\n"),
            metadata: {
              url: params.url,
              videoPath: result.videoPath,
              frames: result.frames,
              seconds: result.seconds,
              output: result.evalResult,
            },
            attachments,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
