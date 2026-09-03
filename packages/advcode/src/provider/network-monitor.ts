import { EventEmitter } from "events"

/**
 * Network connectivity monitor for the provider layer.
 *
 * Detects when the machine loses connectivity (ECONNREFUSED / ENOTFOUND / fetch
 * failed / network timeouts) and tracks recovery so the provider retry loop can
 * hold until the connection returns instead of burning all retries into a dead
 * wire.
 *
 * Singleton (process-global) — mirrors GlobalBus so every provider instance
 * shares the same connectivity state.
 */

export type ConnectivityState = "online" | "offline" | "unknown"

export type ConnectivityProbe = () => Promise<boolean>

export type NetworkMonitorOptions = {
  /** Probe used to test reachability. Defaults to a lightweight DNS/discovery check. */
  probe?: ConnectivityProbe
  /** How often to probe while offline, in ms. Default 2000ms. */
  retryInterval?: number
  /** Consider the network down after this many consecutive failed probes, in ms. */
  offlineAfterMs?: number
}

const DEFAULT_RETRY_INTERVAL = 2000
const DEFAULT_OFFLINE_AFTER_MS = 4000

class NetworkMonitorEmitter extends EventEmitter<{
  change: [ConnectivityState]
  error: [NetworkErrorInfo]
}> {}

// Node's EventEmitter treats "error" specially: emitting it with no listener
// throws ERR_UNHANDLED_ERROR. Nothing in the app subscribes to these events yet
// (they are a future hook), so a bare emit on a connectivity failure would throw
// out of the retry path. Attach a default error sink so the emitter is always
// safe, and guard the change signal similarly.
const emitter = new NetworkMonitorEmitter()
emitter.on("error", () => {})

class NetworkErrorInfoShape {
  constructor(
    readonly cause: string,
    readonly code: string | undefined,
    readonly providerID: string | undefined,
    readonly at: number,
  ) {}
}

export type NetworkErrorInfo = InstanceType<typeof NetworkErrorInfoShape>

let state: ConnectivityState = "unknown"
let probe: ConnectivityProbe = defaultProbe
let retryTimer: ReturnType<typeof setTimeout> | undefined
let offlineTimer: ReturnType<typeof setTimeout> | undefined
let consecutiveFailures = 0
let lastError: NetworkErrorInfo | undefined
let enabled = false

async function defaultProbe(): Promise<boolean> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 2000)
  try {
    // Lightweight reachability — a HEAD to a stable, widely-available endpoint.
    const res = await fetch("https://opencode.ai/health", { method: "HEAD", signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(id)
  }
}

function setState(next: ConnectivityState) {
  if (state === next) return
  state = next
  emitter.emit("change", state)
}

function beginProbeLoop() {
  if (!enabled || retryTimer) return
  retryTimer = setTimeout(probeLoop, DEFAULT_RETRY_INTERVAL)
}

function probeLoop() {
  void probe()
    .then((ok) => {
      if (ok) {
        consecutiveFailures = 0
        if (offlineTimer) clearTimeout(offlineTimer)
        offlineTimer = undefined
        setState("online")
        return
      }
      consecutiveFailures += 1
      if (state !== "offline" && consecutiveFailures * DEFAULT_RETRY_INTERVAL >= DEFAULT_OFFLINE_AFTER_MS) {
        setState("offline")
      }
    })
    .catch(() => {
      consecutiveFailures += 1
      if (state !== "offline" && consecutiveFailures * DEFAULT_RETRY_INTERVAL >= DEFAULT_OFFLINE_AFTER_MS) {
        setState("offline")
      }
    })
    .finally(() => {
      retryTimer = undefined
      if (state === "offline") beginProbeLoop()
    })
}

/**
 * Report an error observed during a provider request. If it looks like a
 * connectivity failure, mark the network offline and start probing for
 * recovery.
 */
export function reportNetworkError(input: { cause: unknown; code?: string; providerID?: string }) {
  if (!isConnectivityFailure(input.cause, input.code)) return
  lastError = new NetworkErrorInfoShape(stringifyCause(input.cause), input.code, input.providerID, Date.now())
  emitter.emit("error", lastError)
  consecutiveFailures = Math.max(consecutiveFailures, 0)
  setState("offline")
  beginProbeLoop()
}

export function isConnectivityFailure(cause: unknown, code?: string): boolean {
  const c = code ?? (cause && typeof cause === "object" && "code" in cause ? String((cause as { code: unknown }).code) : undefined)
  if (c) {
    const lower = c.toLowerCase()
    if (
      lower === "econnrefused" ||
      lower === "econnreset" ||
      lower === "enotfound" ||
      lower === "eai_again" ||
      lower === "etimedout" ||
      lower === "ehostunreach" ||
      lower === "network_unreachable" ||
      lower === "ehostdown"
    )
      return true
  }

  const message = stringifyCause(cause).toLowerCase()
  return (
    /fetch failed|failed to fetch|network[-_\s]error|connection (?:error|refused|lost|reset|closed)|socket (?:hang up|closed)|getaddrinfo|enotfound|econnrefused|econnreset|etimedout|eai_again|network un?reachable|i\/o timeout|read (?:ec)??\s*timeout/i.test(
      message,
    )
  )
}

function stringifyCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === "string") return cause
  try {
    return JSON.stringify(cause)
  } catch {
    return String(cause)
  }
}

export function connectivity(): ConnectivityState {
  return state
}

export function lastNetworkError(): NetworkErrorInfo | undefined {
  return lastError
}

export function resetConnectivity() {
  consecutiveFailures = 0
  if (offlineTimer) clearTimeout(offlineTimer)
  offlineTimer = undefined
  setState("online")
}

export const NetworkMonitor = {
  emitter,
  reportNetworkError,
  isConnectivityFailure,
  connectivity,
  lastNetworkError,
  resetConnectivity,
  setProbe: (p: ConnectivityProbe) => {
    probe = p
  },
  enable: () => {
    enabled = true
    // If already offline, keep probing immediately.
    if (state === "offline") beginProbeLoop()
  },
  disable: () => {
    enabled = false
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = undefined
  },
}

export * as ProviderNetwork from "./network-monitor"
