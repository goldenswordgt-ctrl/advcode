import { randomUUID } from "crypto"
import { spawn, type ChildProcess } from "child_process"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import WebSocket from "ws"

/** A minimal Chrome DevTools Protocol client hand-rolled over `ws`. */
export class CDP {
  private ws: WebSocket
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly id = { next: 1 }
  private closed = false

  private constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as {
        id?: number
        method?: string
        params?: unknown
        error?: { message: string }
        result?: unknown
      }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message))
        else p.resolve(msg.result)
      } else if (msg.method) {
        this.onEvent.emit(msg.method, msg.params)
      }
    })
    this.ws.on("close", () => {
      this.closed = true
      for (const p of this.pending.values()) p.reject(new Error("CDP connection closed"))
      this.pending.clear()
    })
    this.ws.on("error", (err) => {
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
    })
  }

  /** Internal event emitter kept tiny to avoid pulling in an events dependency. */
  private handlers = new Map<string, Array<(params: unknown) => void>>()
  private readonly onEvent = {
    emit: (method: string, params: unknown) => {
      for (const h of this.handlers.get(method) ?? []) h(params)
    },
    on: (method: string, handler: (params: unknown) => void) => {
      const arr = this.handlers.get(method) ?? []
      arr.push(handler)
      this.handlers.set(method, arr)
    },
  }

  static async connect(webSocketDebuggerUrl: string): Promise<CDP> {
    const ws = new WebSocket(webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve())
      ws.once("error", (err) => reject(new Error(`CDP connect failed: ${(err as Error).message}`)))
    })
    return new CDP(ws)
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error("CDP connection closed"))
    const id = this.id.next++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method: string, handler: (params: unknown) => void): void {
    this.onEvent.on(method, handler)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.ws.close()
    } catch {
      /* already gone */
    }
  }
}

export type ChromeInstance = {
  readonly proc: ChildProcess
  readonly port: number
  readonly userDataDir: string
  /** webSocketDebuggerUrl of the browser-level endpoint (attachable). */
  readonly browserWsUrl: string
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : undefined,
  ].filter((p): p is string => Boolean(p))
  return candidates[0] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
}

export async function launchChrome(opts: {
  headless?: boolean
  port?: number
  userDataDir?: string
  extraArgs?: readonly string[]
  onReady?: (browserWsUrl: string) => void
}): Promise<ChromeInstance> {
  const port = opts.port ?? 0
  const userDataDir = opts.userDataDir ?? mkdtempSync(join(tmpdir(), "advcode-chrome-"))
  const binary = findChrome()
  const args = [
    "--remote-debugging-port=" + port,
    `--user-data-dir=${userDataDir}`,
    opts.headless === false ? [] : ["--headless=new", "--no-sandbox", "--disable-gpu"],
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
    ...(opts.extraArgs ?? []),
  ].flat()

  const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] })
  const actualPort = port === 0 ? await waitForPort(proc) : port

  // Discover the browser-level webSocketDebuggerUrl.
  const wsUrl = await discoverWsUrl(actualPort)
  opts.onReady?.(wsUrl)
  return { proc, port: actualPort, userDataDir, browserWsUrl: wsUrl }
}

async function waitForPort(proc: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let buf = ""
    const onData = (chunk: Buffer) => {
      buf += chunk.toString()
      const m = buf.match(/DevTools listening on ws:\/\/[^\s]+/i)
      const portM = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)
      if (m && portM) {
        cleanup()
        resolve(Number(portM[1]))
      }
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`Chrome exited early with code ${code}`))
    }
    const cleanup = () => {
      proc.stderr?.off("data", onData)
      proc.off("exit", onExit)
    }
    proc.stderr?.on("data", onData)
    proc.once("exit", onExit)
  })
}

async function discoverWsUrl(port: number): Promise<string> {
  const base = `http://127.0.0.1:${port}`
  // Poll /json/version until Chrome answers (it can lag the port handshake).
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${base}/json/version`)
      if (res.ok) {
        const body = (await res.json()) as { webSocketDebuggerUrl?: string }
        if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Timed out discovering Chrome DevTools endpoint on port ${port}`)
}

/** Create a new tab and return a CDP connection targeted at it. */
export async function newTab(browserWsUrl: string): Promise<{ cdp: CDP; targetId: string }> {
  // The browser endpoint cannot call Target.createTarget; use the HTTP endpoint instead.
  const port = new URL(browserWsUrl).port
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT",
  })
  if (!res.ok) throw new Error(`Failed to create tab: ${res.status} ${await res.text()}`)
  const target = (await res.json()) as { id?: string; webSocketDebuggerUrl?: string }
  if (!target.webSocketDebuggerUrl) throw new Error("No webSocketDebuggerUrl on new tab")
  const cdp = await CDP.connect(target.webSocketDebuggerUrl)
  return { cdp, targetId: (target.id as string) ?? randomUUID() }
}

/** Cleanly tear down a launched Chrome instance. */
export function disposeChrome(instance: ChromeInstance): void {
  try {
    instance.proc.kill("SIGKILL")
  } catch {
    /* already dead */
  }
  try {
    rmSync(instance.userDataDir, { recursive: true, force: true })
  } catch {
    /* cleanup best-effort */
  }
}
