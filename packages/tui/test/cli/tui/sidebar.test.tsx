/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { KVProvider } from "../../../src/context/kv"
import { ThemeProvider } from "../../../src/context/theme"
import { TuiConfigProvider, type TuiConfig } from "../../../src/config"
import { SDKProvider } from "../../../src/context/sdk"
import { ProjectProvider } from "../../../src/context/project"
import { SyncContext } from "../../../src/context/sync"
import { createEventSource, createFetch, directory } from "../../fixture/tui-sdk"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { PanelContext, createPanelState, type PanelContextValue } from "../../../src/routes/session/panel"
import { Sidebar } from "../../../src/routes/session/sidebar"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

function StubSlot(props: {
  name: string
  session_id: string
  children?: JSX.Element
  mode?: string
}) {
  const fallback = props.mode === "single_winner" && props.children
  return <box data-name={`slot:${props.name}`}>{fallback ?? <text>{`[${props.name}]`}</text>}</box>
}

type RenderOpts = {
  session?: unknown
  panelValue?: PanelContextValue
}

function renderSidebar(opts: RenderOpts = {}) {
  const config = createTuiResolvedConfig()
  const panel = opts.panelValue ?? createPanelState()
  const events = createEventSource()
  const calls = createFetch(() => undefined, events)
  const sync = {
    session: {
      get: () => opts.session,
    },
  } as never

  const Harness = () => (
    <TestTuiContexts>
      <SDKProvider url="http://test" directory={directory} events={events.source} fetch={calls.fetch}>
        <ProjectProvider>
          <TuiConfigProvider config={config as TuiConfig.Resolved}>
            <KVProvider>
              <SyncContext.Provider value={sync}>
                {/* @ts-expect-error stubbed plugin runtime */}
                <PanelContext.Provider value={panel}>
                  <ThemeProvider mode="dark">
                    <Sidebar sessionID="session-1" />
                  </ThemeProvider>
                </PanelContext.Provider>
              </SyncContext.Provider>
            </KVProvider>
          </TuiConfigProvider>
        </ProjectProvider>
      </SDKProvider>
    </TestTuiContexts>
  )
  return testRender(() => <Harness />, { width: 80, height: 24 })
}

async function frameContains(text: string) {
  const frame = testSetup?.captureCharFrame() ?? ""
  return frame.includes(text)
}

test("sidebar renders numbered tabs and the active panel slot", async () => {
  testSetup = await renderSidebar({ session: { id: "session-1", title: "T" } })
  try {
    await testSetup.waitForFrame(() => true)
    expect(await frameContains("Files")).toBe(true)
    expect(await frameContains("MCP")).toBe(true)
    // files is the default active panel
    expect(await frameContains("[sidebar_files]")).toBe(true)
  } finally {
    testSetup.renderer.destroy()
  }
})

test("selecting a different panel index switches the active slot", async () => {
  const panel = createPanelState()
  testSetup = await renderSidebar({ session: { id: "session-1", title: "T" }, panelValue: panel })
  try {
    await testSetup.waitForFrame(() => true)
    expect(await frameContains("[sidebar_files]")).toBe(true)
    panel.select(3)
    await testSetup.waitForFrame(() => true)
    expect(await frameContains("[sidebar_mcp]")).toBe(true)
    expect(await frameContains("[sidebar_files]")).toBe(false)
  } finally {
    testSetup.renderer.destroy()
  }
})