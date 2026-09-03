export * as SessionActivityEvent from "./session-activity-event"

import { Schema } from "effect"
import { optional } from "./schema"
import { Event } from "./event"
import { SessionID } from "./session-id"

/** Cross-window / cross-session presence payload */
export const Info = Event.define({
  type: "session.activity",
  schema: {
    sessionID: SessionID,
    /** Present when a window is actively working on this session. */
    window: optional(Schema.String),
    /** Current agent, if any. */
    agent: optional(Schema.String),
    /** Current model id (provider/model). */
    model: optional(Schema.String),
    /** What the window is doing. */
    status: Schema.Union([
      Schema.Literal("idle"),
      Schema.Literal("working"),
      Schema.Literal("streaming"),
      Schema.Literal("waiting"),
      Schema.Literal("suspended"),
    ]),
    /** Unix ms timestamp of the last reported activity. */
    at: Schema.Number,
  },
})

export type InfoData = Schema.Schema.Type<typeof Info["data"]>

export const Definitions = Event.inventory(Info)
