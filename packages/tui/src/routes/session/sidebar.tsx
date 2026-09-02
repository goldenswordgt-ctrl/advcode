import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../config"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { usePluginRuntime } from "../../plugin/runtime"
import { RGBA, TextAttributes } from "@opentui/core"

import { getScrollAcceleration } from "../../util/scroll"
import { WorkspaceLabel } from "../../component/workspace-label"
import { PANELS, usePanel, type PanelDefinition } from "./panel"

export function Sidebar(props: { sessionID: string; overlay?: boolean; scrollRef?: (el: { scrollBy(delta: number): void }) => void }) {
  const pluginRuntime = usePluginRuntime()
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const panel = usePanel()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const activePanel = panel.activePanel
  const focused = () => panel.focus() === "sidebar"

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
        position={props.overlay ? "absolute" : "relative"}
        onMouseDown={(e) => {
          e.stopPropagation()
          panel.focusSidebar()
        }}
      >
        <PanelTabs active={activePanel()} onSelect={(index) => panel.select(index)} />
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          ref={(el) => props.scrollRef?.(el)}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </pluginRuntime.Slot>
            <Show when={activePanel().slot}>
              {(slotName) => <pluginRuntime.Slot name={slotName()} session_id={props.sessionID} />}
            </Show>
            <Show when={activePanel().id === "chat"}>
              <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
            </Show>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <pluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.success }}>•</span> <b>Open</b>
              <span style={{ fg: theme.text }}>
                <b>Code</b>
              </span>{" "}
              <span>{InstallationVersion}</span>
            </text>
          </pluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}

type PanelTabsProps = {
  active: PanelDefinition
  onSelect: (index: number) => void
}

function PanelTabs(props: PanelTabsProps) {
  const { theme } = useTheme()
  return (
    <box flexShrink={0} flexDirection="row" gap={0} alignItems="center">
      <For each={PANELS}>
        {(panel) => {
          const isActive = () => props.active.id === panel.id
          return (
            <box
              onMouseUp={(e) => {
                e.stopPropagation()
                props.onSelect(panel.index)
              }}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isActive() ? theme.borderActive : RGBA.fromInts(0, 0, 0, 0)}
            >
              <text fg={isActive() ? theme.text : theme.textMuted} attributes={isActive() ? TextAttributes.BOLD : undefined}>
                {panel.index}
              </text>
              <text fg={isActive() ? theme.text : theme.textMuted}>{panel.title}</text>
            </box>
          )
        }}
      </For>
    </box>
  )
}