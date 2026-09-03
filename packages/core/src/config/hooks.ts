export * as ConfigHooks from "./hooks"

import { Schema } from "effect"

export class Matcher extends Schema.Class<Matcher>("ConfigV2.Hooks.Matcher")({
  tool: Schema.String.pipe(Schema.optional),
}) {}

export const Event = Schema.Literals(["pre_tool_use", "post_tool_use", "post_tool_batch"])
export type Event = typeof Event.Type

export class Entry extends Schema.Class<Entry>("ConfigV2.Hooks.Entry")({
  event: Event,
  command: Schema.String,
  matcher: Matcher.pipe(Schema.optional),
}) {}

export const Info = Entry.pipe(Schema.Array)
