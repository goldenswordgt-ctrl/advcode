import { useTheme } from "../../context/theme"
import { TextAttributes, type RGBA } from "@opentui/core"
import { useSystemMonitor, formatBytes, formatPct, type SystemStats } from "./system-monitor"

export function SystemMonitorPanel() {
  const { theme } = useTheme()
  const stats = useSystemMonitor(2000)

  const pct = () => {
    const s: SystemStats = stats()
    return {
      cpu: Math.round(s.cpu),
      mem: formatPct(s.memUsed, s.memTotal),
      swap: formatPct(s.swapUsed, s.swapTotal),
    }
  }

  const memText = () => {
    const s: SystemStats = stats()
    return `${formatBytes(s.memUsed)} / ${formatBytes(s.memTotal)}`
  }

  const swapText = () => {
    const s: SystemStats = stats()
    return `${formatBytes(s.swapUsed)} / ${formatBytes(s.swapTotal)}`
  }

  const loadText = () => {
    const s: SystemStats = stats()
    return s.load.map((v) => v.toFixed(1)).join(" ")
  }

  return (
    <box flexDirection="column" flexShrink={0} paddingLeft={1} paddingRight={1} paddingTop={1}>
      <box flexDirection="row" gap={1} flexShrink={0} paddingBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          System
        </text>
        <text fg={theme.textMuted}>load {loadText()}</text>
      </box>
      <BoxRow label="CPU" value={`${pct().cpu}%`} bar={pct().cpu} barColor={theme.success} />
      <BoxRow label="RAM" value={`${pct().mem} ${memText()}`} bar={parseInt(pct().mem)} barColor={theme.info} />
      <BoxRow label="Swap" value={`${pct().swap} ${swapText()}`} bar={parseInt(pct().swap)} barColor={theme.warning} />
    </box>
  )
}

function BoxRow(props: { label: string; value: string; bar: number; barColor: string | RGBA }) {
  const { theme } = useTheme()
  const width = 10
  const filled = Math.round((Math.min(100, Math.max(0, props.bar)) / 100) * width)
  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.textMuted} width={4}>
          {props.label}
        </text>
        <text fg={theme.text}>{props.value}</text>
      </box>
      <text fg={props.barColor}>
        {"█".repeat(filled)}
        {"░".repeat(width - filled)}
      </text>
    </box>
  )
}
