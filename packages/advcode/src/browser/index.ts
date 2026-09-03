import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { CDP, disposeChrome, launchChrome, newTab, type ChromeInstance } from "./chrome"
import { WebmRecorder } from "./webm"

export type BrowserOptions = {
  readonly url: string
  /** Emit captured page to this path (webm). */
  readonly videoPath?: string
  /** Evaluate arbitrary JS in the page after load (returns JSON-serializable result). */
  readonly evaluate?: string
  /** Wait ms after load before evaluating / finishing. */
  readonly waitMs?: number
  /** Frames per second for the webm. Larger = bigger file. */
  readonly fps?: number
  /** Seconds to capture. If unset, records until navigation settles + wait, capped at 30s. */
  readonly durationSec?: number
  readonly headless?: boolean
}

export type BrowserResult = {
  readonly seconds: number
  readonly frames: number
  readonly evalResult?: unknown
  readonly videoPath?: string
  readonly scriptFinished: boolean
}

/**
 * Launch a headless Chrome, drive it to a URL, optionally record a webm of the
 * page, and evaluate a script. One-shot orchestrator used by the CLI command
 * and (later) the agent tool.
 */
export async function openBrowser(opts: BrowserOptions): Promise<BrowserResult> {
  const headless = opts.headless ?? true
  const workDir = mkdtempSync(join(tmpdir(), "advcode-browser-"))
  const instance: ChromeInstance = await launchChrome({ headless, userDataDir: workDir })
  let recorder: WebmRecorder | null = null

  try {
    const { cdp } = await newTab(instance.browserWsUrl)

    // Screen metrics so our recording matches the window size.
    const { Metrics } = await cdp.send<{ Metrics?: { contentSize?: { width?: number; height?: number } } }>(
      "Page.getLayoutMetrics",
    )
    const width = opts.videoPath ? Math.min(Metrics?.contentSize?.width ?? 1280, 1280) : 0

    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")

    if (opts.videoPath) {
      const fps = opts.fps ?? 20
      const intervalMs = 1000 / fps
      const h = Math.round((Metrics?.contentSize?.height ?? 800) * 0.7)
      recorder = new WebmRecorder({ width: Math.max(width, 640), height: Math.max(h, 480), output: opts.videoPath, fps })
      // CDP screencast emits frames faster than our target output rate (often 60fps).
      // Throttle to the target fps so webm playback matches wall-clock duration.
      let lastPushedAt = 0
      cdp.on("Page.screencastFrame", (params) => {
        const p = params as { data?: string; sessionId?: number }
        const now = Date.now()
        if (p.data && recorder && now - lastPushedAt >= intervalMs) {
          lastPushedAt = now
          recorder.pushFrame(Buffer.from(p.data, "base64"))
        }
        if (p.sessionId !== undefined) void cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {})
      })
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
    }

    await cdp.send("Page.navigate", { url: opts.url })
    await waitForLoad(cdp)

    if (opts.waitMs && opts.waitMs > 0) await sleep(opts.waitMs)

    let evalResult: unknown
    if (opts.evaluate) {
      const res = await cdp.send<{ result?: { value?: unknown } }>("Runtime.evaluate", {
        expression: opts.evaluate,
        returnByValue: true,
        awaitPromise: true,
      })
      evalResult = res?.result?.value
    }

    // Keep recording for the requested duration (default: ~3s after eval).
    const duration = opts.durationSec ?? 3
    if (recorder) {
      await sleep(duration * 1000)
      await cdp.send("Page.stopScreencast").catch(() => {})
      await recorder.end()
    }

    const frames = recorder?.frames ?? 0
    return {
      seconds: duration,
      frames,
      evalResult,
      videoPath: opts.videoPath,
      scriptFinished: true,
    }
  } finally {
    try {
      if (recorder) await recorder.end().catch(() => {})
    } catch {
      /* best-effort */
    }
    try {
      disposeChrome(instance)
    } catch {
      /* best-effort */
    }
  }
}

function waitForLoad(cdp: CDP): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    cdp.on("Page.loadEventFired", finish)
    // Safety: never hang.
    setTimeout(finish, 15_000).unref()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
