// Server-side cross-window/session presence publisher.
// Subscribes to the native EventV2 stream and re-broadcasts a coarse
// `session.activity` presence event so every connected TUI (window) can see
// "which session is doing what" on the shared instance. This is the backbone
// of cross-window session sync — session data itself already syncs via event
// replay, but active status/agent/model presence does not.
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { Context, Effect, Layer } from "effect"
import { SessionActivityEvent } from "@opencode-ai/schema/session-activity-event"
import { SessionID } from "@opencode-ai/schema/session-id"

export class Service extends Context.Service<Service, {}>()("@opencode/SessionActivity") {}

// Native EventV2 event types -> presence status. Unlisted events are ignored.
type Rule =
  | { status: "working" }
  | { status: "idle" }
  | { status: "streaming" }
  | { status: undefined }

const STATUS_RULES: Record<string, Rule> = {
  "session.next.agent.switched": { status: "working" },
  "session.next.model.switched": { status: "working" },
  "session.next.prompted": { status: "working" },
  "session.next.prompt.admitted": { status: "working" },
  "session.next.step.started": { status: "working" },
  "session.next.text.started": { status: "working" },
  "session.next.shell.started": { status: "working" },
  "session.next.tool.called": { status: "working" },
  "session.next.tool.input.started": { status: "working" },
  "session.next.reasoning.started": { status: "working" },
  "session.next.compaction.started": { status: "working" },
  "session.next.text.delta": { status: "streaming" },
  "session.next.text.ended": { status: "streaming" },
  "session.next.step.ended": { status: "idle" },
  "session.next.step.failed": { status: "idle" },
  "session.next.shell.ended": { status: "idle" },
  "session.next.reasoning.ended": { status: "idle" },
  "session.next.revert.staged": { status: "idle" },
  "session.next.retried": { status: "idle" },
  "session.next.compaction.ended": { status: "idle" },
  "session.idle": { status: "idle" },
}

// last-write-wins cache of the most recent presence per session
const cache = new Map<string, SessionActivityEvent.InfoData>()

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service

    const publish = (
      sessionID: SessionActivityEvent.InfoData["sessionID"],
      status: SessionActivityEvent.InfoData["status"],
      agent?: string,
      model?: string,
    ) => {
      const at = Date.now()
      cache.set(sessionID, { sessionID, status, agent, model, at })
      return events.publish(SessionActivityEvent.Info, {
        sessionID,
        status,
        ...(agent ? { agent } : {}),
        ...(model ? { model } : {}),
        at,
      })
    }

    const unsubscribe = yield* events.listen((event) => {
      const data = event.data as { sessionID?: unknown; agent?: unknown; model?: unknown }
      const sessionID = data?.sessionID
      if (typeof sessionID !== "string") return Effect.void

      const prior = cache.get(sessionID)
      const rule = STATUS_RULES[event.type]
      let status = prior?.status
      if (rule) {
        status = rule.status
      } else if (event.type === "session.status") {
        const st = (data as { status?: unknown }).status
        if (typeof st === "object" && st !== null && "type" in st) {
          status = (st as { type: string }).type === "busy" ? "working" : "idle"
        }
      }
      if (status === undefined) return Effect.void

      const agent = typeof data?.agent === "string" ? data.agent : prior?.agent
      const model = typeof data?.model === "string" ? data.model : prior?.model
      return publish(SessionID.make(sessionID), status, agent, model)
    })

    yield* Effect.addFinalizer(() => unsubscribe)

    return Service.of({})
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [EventV2.node] })

export * as SessionActivity from "./activity"
