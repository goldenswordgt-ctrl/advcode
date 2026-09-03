export * as ToolIntentEvent from "./tool-intent-event"

import { Schema } from "effect"
import { optional } from "./schema"
import { Event } from "./event"
import { SessionID } from "./session-id"
import { DateTimeUtcFromMillis } from "./schema"

const Base = {
  timestamp: DateTimeUtcFromMillis,
  sessionID: SessionID,
}

const options = {
  durable: {
    aggregate: "sessionID",
    version: 1,
  },
} as const

export const Started = Event.define({
  type: "tool.intent.start",
  ...options,
  schema: {
    ...Base,
    toolCallID: Schema.String,
    tool: Schema.String,
    input: Schema.Record(Schema.String, Schema.Unknown),
    agent: Schema.String,
  },
})
export type Started = typeof Started.Type

export const Ended = Event.define({
  type: "tool.intent.end",
  ...options,
  schema: {
    ...Base,
    toolCallID: Schema.String,
    tool: Schema.String,
    agent: Schema.String,
    resultType: Schema.Literals(["success", "error"]),
    outputSummary: Schema.String.pipe(optional),
  },
})
export type Ended = typeof Ended.Type

export const Definitions = Event.inventory(Started, Ended)

export const DurableDefinitions = Event.inventory(Started, Ended)

export const Durable = Schema.Union(DurableDefinitions, { mode: "oneOf" })
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "ToolIntentDurableEvent" })
export type DurableEvent = typeof Durable.Type
