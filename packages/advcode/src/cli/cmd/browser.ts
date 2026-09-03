import { EOL } from "os"
import { Effect, Schema } from "effect"
import { openBrowser } from "@/browser"
import { effectCmd, fail } from "../effect-cmd"

export const BrowserCommand = effectCmd({
  command: "browser <url>",
  describe: "drive a headless Chrome page via CDP, optionally recording a webm + running JS",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("url", {
        type: "string",
        describe: "URL to navigate to",
        demandOption: true,
      })
      .option("evaluate", {
        type: "string",
        describe: "JS expression to evaluate after load (JSON-serializable result is printed)",
      })
      .option("video", {
        type: "string",
        alias: "o",
        describe: "record the page to this webm path",
      })
      .option("wait", {
        type: "number",
        describe: "ms to wait after page load before evaluating",
        default: 0,
      })
      .option("duration", {
        type: "number",
        describe: "seconds to record (default 3)",
      })
      .option("fps", {
        type: "number",
        describe: "frames per second for the webm (default 20)",
      })
      .option("headed", {
        type: "boolean",
        describe: "show the browser window instead of headless",
        default: false,
      }),
  handler: (args) =>
    Effect.gen(function* () {
      const url = args.url
      if (!/^https?:\/\//i.test(url)) {
        return yield* fail("browser: url must be http(s)", 2)
      }
      if (args.video && !args.video.endsWith(".webm")) {
        return yield* fail("browser: --video path must end in .webm", 2)
      }

      const result = yield* Effect.tryPromise(() =>
        openBrowser({
          url,
          videoPath: args.video,
          evaluate: args.evaluate,
          waitMs: args.wait,
          durationSec: args.duration,
          fps: args.fps,
          headless: !args.headed,
        }),
      ).pipe(
        Effect.catch((error) => fail("browser: " + (error instanceof Error ? error.message : String(error)), 1)),
      )

      const lines: string[] = []
      lines.push(`browser: loaded ${url}`)
      if (result.videoPath) lines.push(`browser: video -> ${result.videoPath} (${result.frames} frames, ${result.seconds}s)`)
      if (args.evaluate) {
        lines.push(`browser: eval => ${JSON.stringify(result.evalResult)}`)
      }
      process.stdout.write(lines.join(EOL) + EOL)
      return
    }).pipe(Effect.withSpan("Cli.browser")),
})
