import { createContext, createMemo, createSignal, useContext, type JSX } from "solid-js"

export type PanelId = "chat" | "files" | "mcp" | "lsp" | "todo" | "context"

export type PanelFocus = "chat" | "sidebar"

export type PanelDefinition = {
  id: PanelId
  title: string
  slot?: string
  index: number
}

export const PANELS: PanelDefinition[] = [
  { id: "chat", title: "Chat", index: 1 },
  { id: "files", title: "Files", slot: "sidebar_files", index: 2 },
  { id: "mcp", title: "MCP", slot: "sidebar_mcp", index: 3 },
  { id: "lsp", title: "LSP", slot: "sidebar_lsp", index: 4 },
  { id: "todo", title: "Todo", slot: "sidebar_todo", index: 5 },
  { id: "context", title: "Context", slot: "sidebar_context", index: 6 },
]

export function panelByIndex(index: number): PanelDefinition | undefined {
  return PANELS.find((panel) => panel.index === index)
}

export type PanelContextValue = {
  activePanel: () => PanelDefinition
  focus: () => PanelFocus
  select(index: number): void
  focusChat(): void
  focusSidebar(): void
}

export function createPanelState(): PanelContextValue {
  const [activeIndex, setActiveIndex] = createSignal(2)
  const [focus, setFocus] = createSignal<PanelFocus>("chat")
  const activePanel = createMemo(() => panelByIndex(activeIndex()) ?? PANELS[0])

  return {
    activePanel,
    focus,
    select(index: number) {
      const panel = panelByIndex(index)
      if (!panel) return
      setActiveIndex(panel.index)
      if (panel.id === "chat") setFocus("chat")
      else setFocus("sidebar")
    },
    focusChat() {
      setFocus("chat")
    },
    focusSidebar() {
      setFocus("sidebar")
    },
  }
}

export const PanelContext = createContext<PanelContextValue>()

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext)
  if (!value) throw new Error("usePanel must be used within <PanelProvider>")
  return value
}

export function PanelProvider(props: { value?: PanelContextValue; children: JSX.Element }) {
  const state = props.value ?? createPanelState()
  return <PanelContext.Provider value={state}>{props.children}</PanelContext.Provider>
}