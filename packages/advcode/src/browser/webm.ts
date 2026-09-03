import { spawn, type ChildProcess } from "child_process"

/**
 * Composes JPEG screenshot frames (from CDP Page.screencastFrame) into a
 * single webm video by piping raw frames into ffmpeg's image2pipe demuxer.
 *
 * WebM/VP9 gives us a sharp, broadly-playable container. ffmpeg must be on PATH.
 */
export class WebmRecorder {
  private ffmpeg: ChildProcess | null = null
  private _frames = 0
  private failed: Error | null = null
  private closed = false
  private readonly ffmpegBin: string

  /** Number of JPEG frames fed so far. */
  get frames(): number {
    return this._frames
  }

  constructor(opts: { width: number; height: number; output: string; ffmpegBin?: string; fps?: number }) {
    const fps = opts.fps ?? 20
    this.ffmpegBin = opts.ffmpegBin ?? "ffmpeg"
    this.ffmpeg = spawn(this.ffmpegBin, [
      "-y",
      "-f", "image2pipe",
      "-framerate", String(fps),
      "-vcodec", "mjpeg",
      "-i", "pipe:0",
      "-c:v", "libvpx-vp9",
      "-row-mt", "1",
      "-b:v", "0",
      "-crf", "32",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      opts.output,
    ], { stdio: ["pipe", "ignore", "pipe"] })

    this.ffmpeg.stderr?.on("data", (_chunk) => {
      // ffmpeg progress goes to stderr; swallow it unless we've hit a hard error.
    })
    this.ffmpeg.on("error", (err) => {
      this.failed = err
    })
    this.ffmpeg.on("exit", (code) => {
      if (code !== 0 && !this.closed) {
        this.failed = new Error(`ffmpeg exited with code ${code}`)
      }
    })
  }

  /** Write one JPEG frame (raw Buffer of an image/jpeg screencastFrame). */
  pushFrame(jpeg: Buffer): void {
    if (this.closed || this.failed) return
    this._frames++
    if (this.ffmpeg?.stdin?.writable) {
      this.ffmpeg.stdin.write(jpeg as unknown as string | Uint8Array)
    }
  }

  /** Finalize the webm and wait for ffmpeg to finish writing. */
  async end(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.failed) throw this.failed
    if (!this.ffmpeg) throw new Error("recorder never initialized")
    this.ffmpeg.stdin?.end()
    await new Promise<void>((resolve) => {
      this.ffmpeg!.once("exit", () => resolve())
      // Safety net: don't hang forever if the pipe stalls.
      setTimeout(() => resolve(), 10_000).unref()
    })
    if (this.failed) throw this.failed
  }
}
