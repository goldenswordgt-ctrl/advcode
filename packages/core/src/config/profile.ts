export * as ConfigProfile from "./profile"

import { Schema } from "effect"
import { Permission } from "@opencode-ai/schema/permission"

export class Info extends Schema.Class<Info>("Config.Profile.Info")({
  description: Schema.String.pipe(Schema.optional).annotate({
    description: "Human-readable description of the profile",
  }),
  model: Schema.String.pipe(Schema.optional).annotate({
    description: "Model override applied to the default agent",
  }),
  small_model: Schema.String.pipe(Schema.optional).annotate({
    description: "Editor model override applied to the default agent",
  }),
  tools: Schema.Record(Schema.String, Schema.Boolean).pipe(Schema.optional).annotate({
    description:
      "Tool permission overrides: false denies the tool, true allows it. Applied after all other permission rules, so a profile can tighten or widen any tool",
  }),
}) {}

/** Maps a profile's tool overrides into permission rules ordered after every other rule. */
export const applyTools = (tools: Readonly<Record<string, boolean>> | undefined): Permission.Ruleset =>
  Object.entries(tools ?? {}).map(([action, allow]) => ({
    action,
    resource: "*",
    effect: allow ? "allow" : "deny",
  }))
