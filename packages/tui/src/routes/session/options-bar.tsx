import { createMemo, For, Match, Show, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useDirectory } from "../../context/directory"
import { useConnected } from "../../component/use-connected"
import { useRoute } from "../../context/route"
import { useCommandShortcut } from "../../keymap"
import { PANELS, usePanel } from "./panel"

export function OptionsBar() {
  const { theme } = useTheme()
  const sync = useSync()
  const route = useRoute()
  const panel = usePanel()
  const mcp = createMemo(() => Object.values(sync.data.mcp).filter((x) => x.status === "connected").length)
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed"))
  const lsp = createMemo(() => Object.keys(sync.data.lsp))
  const permissions = createMemo(() => {
    if (route.data.type !== "session") return []
    return sync.data.permission[route.data.sessionID] ?? []
  })
  const directory = useDirectory()
  const connected = useConnected()

  const chatShortcut = useCommandShortcut("session.panel.chat")
  const filesShortcut = useCommandShortcut("session.panel.files")
  const mcpShortcut = useCommandShortcut("session.panel.mcp")
  const lspShortcut = useCommandShortcut("session.panel.lsp")
  const todoShortcut = useCommandShortcut("session.panel.todo")
  const contextShortcut = useCommandShortcut("session.panel.context")

  const focused = () => panel.focus()

  return (
    <box flexDirection="column" flexShrink={0} paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
        <text fg={theme.textMuted}>{directory()}</text>
        <box gap={2} flexDirection="row" flexShrink={0}>
          <Show when={connected()}>
            <Show when={permissions().length > 0}>
              <text fg={theme.warning}>
                <span style={{ fg: theme.warning }}>△</span> {permissions().length} Permission
                {permissions().length > 1 ? "s" : ""}
              </text>
            </Show>
            <text fg={theme.text}>
              <span style={{ fg: lsp().length > 0 ? theme.success : theme.textMuted }}>•</span> {lsp().length} LSP
            </text>
            <Show when={mcp()}>
              <text fg={theme.text}>
                <Switch>
                  <Match when={mcpError()}>
                    <span style={{ fg: theme.error }}>⊙ </span>
                  </Match>
                  <Match when={true}>
                    <span style={{ fg: theme.success }}>⊙ </span>
                  </Match>
                </Switch>
                {mcp()} MCP
              </text>
            </Show>
            <text fg={theme.textMuted}>/status</text>
          </Show>
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0} paddingBottom={1}>
        <text fg={focused() === "sidebar" ? theme.text : theme.textMuted}>
          {focused() === "sidebar" ? "sidebar focused" : "chat focused"}
        </text>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <For each={PANELS}>
            {(panelDef) => {
              const shortcut = () => {
                switch (panelDef.id) {
                  case "chat":
                    return chatShortcut()
                  case "files":
                    return filesShortcut()
                  case "mcp":
                    return mcpShortcut()
                  case "lsp":
                    return lspShortcut()
                  case "todo":
                    return todoShortcut()
                  case "context":
                    return contextShortcut()
                }
              }
              const isActive = () => panel.activePanel().id === panelDef.id
              return (
                <text fg={isActive() ? theme.text : theme.textMuted}>
                  <span style={{ fg: theme.primary }}>{shortcut()}</span> {panelDef.title}
                </text>
              )
            }}
          </For>
        </box>
      </box>
    </box>
  )
}