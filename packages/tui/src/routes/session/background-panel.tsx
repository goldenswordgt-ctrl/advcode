import { createSignal, onCleanup, onMount, Show, For } from "solid-js"
import type { BackgroundJobInfo } from "@opencode-ai/sdk/v2"
import { useTheme } from "../../context/theme"
import { useSDK } from "../../context/sdk"

type JobView = BackgroundJobInfo

export function BackgroundPanel(props: { sessionID: string; workspace?: string }) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const [jobs, setJobs] = createSignal<JobView[]>([])
  const [error, setError] = createSignal(false)

  onMount(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await sdk.client.experimental.background.list(
          { workspace: props.workspace },
          { throwOnError: true },
        )
        if (!cancelled) {
          setJobs(res.data ?? [])
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void poll()
    const timer = setInterval(poll, 2000)
    onCleanup(() => {
      cancelled = true
      clearInterval(timer)
    })
  })

  const running = () => jobs().filter((job) => job.status === "running").length

  return (
    <Show when={props.sessionID}>
      <box flexDirection="row" paddingLeft={1} paddingRight={1} gap={1} flexShrink={0}>
        <text fg={theme.text} attributes={2 /* BOLD */}>
          Background {running() > 0 ? `(${running()})` : ""}
        </text>
        <Show when={error()}>
          <text fg={theme.error}>offline</text>
        </Show>
      </box>
      <box flexGrow={1}>
        <Show
          when={jobs().length > 0}
          fallback={
            <box paddingLeft={1} paddingRight={1}>
              <text fg={theme.textMuted}>No background tasks</text>
            </box>
          }
        >
          <scrollbox flexGrow={1}>
            <For each={jobs()}>
              {(job) => <JobRow job={job} />}
            </For>
          </scrollbox>
        </Show>
      </box>
    </Show>
  )
}

function JobRow(props: { job: JobView }) {
  const { theme } = useTheme()
  const color = () =>
    props.job.status === "running"
      ? theme.success
      : props.job.status === "error"
        ? theme.error
        : props.job.status === "cancelled"
          ? theme.textMuted
          : theme.textMuted

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} flexShrink={0}>
      <box flexDirection="row" gap={1}>
        <text fg={color()}>{statusIcon(props.job.status)}</text>
        <text fg={theme.text}>{props.job.title ?? props.job.id}</text>
      </box>
      <text fg={theme.textMuted} paddingLeft={2}>
        {elapsed(Number(props.job.started_at))} {props.job.error ? `· ${props.job.error}` : ""}
      </text>
    </box>
  )
}

function statusIcon(status: JobView["status"]): string {
  switch (status) {
    case "running":
      return "●"
    case "error":
      return "✕"
    case "cancelled":
      return "⊘"
    default:
      return "✓"
  }
}

function elapsed(startedAt: number): string {
  const ms = Date.now() - startedAt
  if (ms < 0) return "now"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60}m`
}
