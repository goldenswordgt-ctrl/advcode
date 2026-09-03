import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { createEffect, onCleanup } from "solid-js"
import { useEvent } from "./event"

export type SessionPresence = {
  sessionID: string
  status: "idle" | "working" | "streaming" | "waiting" | "suspended"
  agent?: string
  model?: string
  at: number
}

/**
 * Cross-window / cross-session presence. The server publishes a coarse
 * `session.activity` event whenever any session on the shared instance changes
 * status, agent, or model. This hook consumes those events (from this window
 * AND every other window attached to the same instance) and exposes a reactive
 * map of "which session is doing what, right now." Combined, the instance is a
 * shared room; this is the "who else is here" channel.
 */
export const {
  context: PresenceContext,
  use: usePresence,
  provider: PresenceProvider,
} = createSimpleContext({
  name: "Presence",
  init: () => {
    const event = useEvent()

    const [store, setStore] = createStore<{
      sessions: Record<string, SessionPresence>
    }>({ sessions: {} })

    createEffect(() => {
      const unsubscribe = event.on("session.activity", (evt) => {
        const sessionID = evt.properties.sessionID
        const presence: SessionPresence = {
          sessionID,
          status: evt.properties.status,
          agent: evt.properties.agent,
          model: evt.properties.model,
          at: Number(evt.properties.at),
        }
        setStore("sessions", sessionID, presence as never)
      })
      onCleanup(unsubscribe)
    })

    return {
      /** Presence for every session that has reported activity on this instance. */
      sessions: store.sessions,
      /** Convenience accessor for a single session's presence. */
      session: (sessionID: string): SessionPresence | undefined => store.sessions[sessionID],
      /** True if any session (other than the queried one) is currently streaming/working. */
      isInstanceBusy: (excluding?: string) =>
        Object.values(store.sessions).some(
          (p) => p.sessionID !== excluding && (p.status === "streaming" || p.status === "working"),
        ),
    }
  },
})
