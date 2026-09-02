/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { PANELS, createPanelState, panelByIndex } from "../../../src/routes/session/panel"

test("PANELS are numbered 1-6 starting with chat", () => {
  expect(PANELS.map((panel) => panel.index)).toEqual([1, 2, 3, 4, 5, 6])
  expect(PANELS[0]).toMatchObject({ id: "chat", title: "Chat" })
  expect(PANELS.map((panel) => panel.slot)).toEqual([
    undefined,
    "sidebar_files",
    "sidebar_mcp",
    "sidebar_lsp",
    "sidebar_todo",
    "sidebar_context",
  ])
})

test("panelByIndex resolves the panel", () => {
  expect(panelByIndex(3)).toEqual(PANELS[2])
  expect(panelByIndex(9)).toBeUndefined()
})

test("panel state defaults to files panel with chat focus", () => {
  createRoot((dispose) => {
    const panel = createPanelState()
    expect(panel.activePanel().id).toBe("files")
    expect(panel.focus()).toBe("chat")
    dispose()
  })
})

test("selecting chat focuses chat, selecting sidebar panels focuses sidebar", () => {
  createRoot((dispose) => {
    const panel = createPanelState()
    panel.select(1)
    expect(panel.activePanel().id).toBe("chat")
    expect(panel.focus()).toBe("chat")

    panel.select(3)
    expect(panel.activePanel().id).toBe("mcp")
    expect(panel.focus()).toBe("sidebar")

    panel.select(2)
    expect(panel.activePanel().id).toBe("files")
    expect(panel.focus()).toBe("sidebar")

    panel.select(9)
    expect(panel.activePanel().id).toBe("files")

    dispose()
  })
})

test("focusChat and focusSidebar only change focus", () => {
  createRoot((dispose) => {
    const panel = createPanelState()
    panel.select(4)
    panel.focusChat()
    expect(panel.focus()).toBe("chat")
    panel.focusSidebar()
    expect(panel.focus()).toBe("sidebar")
    expect(panel.activePanel().id).toBe("lsp")
    dispose()
  })
})