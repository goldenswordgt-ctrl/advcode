import { createSignal, onCleanup, onMount } from "solid-js"
import os from "node:os"
import { execFileSync } from "node:child_process"

export type SystemStats = {
  cpu: number // percent used
  memUsed: number // bytes
  memTotal: number // bytes
  swapUsed: number // bytes
  swapTotal: number // bytes
  load: number[] // load averages (1, 5, 15)
}

type CpuSample = { idle: number; total: number }

let lastCpu: CpuSample | undefined

function cpuSample(): CpuSample {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq
    idle += cpu.times.idle
  }
  return { idle, total }
}

function readSwap(): { used: number; total: number } {
  try {
    if (process.platform === "darwin") {
      const out = execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8" })
      const match = out.match(/used\s*=\s*([\d.]+)M\s+free\s*=\s*([\d.]+)M/)
      if (!match) return { used: 0, total: 0 }
      const used = Math.round(parseFloat(match[1]) * 1024 * 1024)
      const free = Math.round(parseFloat(match[2]) * 1024 * 1024)
      return { used, total: used + free }
    }
    if (process.platform === "linux") {
      const out = execFileSync("cat", ["/proc/meminfo"], { encoding: "utf8" })
      let swapTotal = 0
      let swapFree = 0
      for (const line of out.split("\n")) {
        const kv = line.split(":")
        if (kv[0] === "SwapTotal") swapTotal = parseInt(kv[1]) * 1024
        else if (kv[0] === "SwapFree") swapFree = parseInt(kv[1]) * 1024
      }
      return { used: Math.max(0, swapTotal - swapFree), total: swapTotal }
    }
    return { used: 0, total: 0 }
  } catch {
    return { used: 0, total: 0 }
  }
}

function readStats(): SystemStats {
  const snap = cpuSample()
  let cpu = 0
  if (lastCpu) {
    const idleDelta = snap.idle - lastCpu.idle
    const totalDelta = snap.total - lastCpu.total
    cpu = totalDelta > 0 ? Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100)) : 0
  }
  lastCpu = snap

  const memTotal = os.totalmem()
  const memFree = os.freemem()
  const swap = readSwap()
  return {
    cpu,
    memUsed: memTotal - memFree,
    memTotal,
    swapUsed: swap.used,
    swapTotal: swap.total,
    load: os.loadavg(),
  }
}

export function useSystemMonitor(intervalMs = 2000): () => SystemStats {
  const [stats, setStats] = createSignal<SystemStats>(readStats())

  onMount(() => {
    const timer = setInterval(() => setStats(readStats()), intervalMs)
    onCleanup(() => clearInterval(timer))
  })

  return stats
}

const GB = 1024 * 1024 * 1024

export function formatBytes(bytes: number): string {
  const MB = 1024 * 1024
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)}G`
  if (bytes >= MB) return `${(bytes / MB).toFixed(0)}M`
  return `${(bytes / 1024).toFixed(0)}K`
}

export function formatPct(used: number, total: number): string {
  if (total <= 0) return "0%"
  return `${Math.round((used / total) * 100)}%`
}
