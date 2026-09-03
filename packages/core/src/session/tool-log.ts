export * as ToolLog from "./tool-log"

import { ToolIntentEvent } from "@opencode-ai/schema/tool-intent-event"
import { DateTime, Effect } from "effect"
import { EventV2 } from "../event"
import { SessionSchema } from "./schema"

export const recordIntentStart = (events: EventV2.Interface, input: {
  readonly sessionID: SessionSchema.ID
  readonly agent: string
  readonly toolCallID: string
  readonly tool: string
  readonly toolInput: unknown
}) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    yield* events.publish(ToolIntentEvent.Started, {
      sessionID: input.sessionID,
      timestamp: now,
      toolCallID: input.toolCallID,
      tool: input.tool,
      input: toRecord(input.toolInput),
      agent: input.agent,
    })
  }).pipe(Effect.catchCause(() => Effect.void))

export const recordIntentEnd = (events: EventV2.Interface, input: {
  readonly sessionID: SessionSchema.ID
  readonly agent: string
  readonly toolCallID: string
  readonly tool: string
  readonly resultType: "success" | "error"
  readonly outputSummary?: string
}) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    yield* events.publish(ToolIntentEvent.Ended, {
      sessionID: input.sessionID,
      timestamp: now,
      toolCallID: input.toolCallID,
      tool: input.tool,
      agent: input.agent,
      resultType: input.resultType,
      outputSummary: input.outputSummary,
    })
  }).pipe(Effect.catchCause(() => Effect.void))

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  return { value }
}
