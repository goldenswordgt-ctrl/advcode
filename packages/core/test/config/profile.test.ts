import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Config } from "@opencode-ai/core/config"
import { ConfigAgentPlugin } from "@opencode-ai/core/config/plugin/agent"
import { ConfigProfile } from "@opencode-ai/core/config/profile"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { testEffect } from "../lib/effect"
import { agentHost, host } from "../plugin/host"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([AgentV2.node, FSUtil.node, Global.node])))
const decode = Schema.decodeUnknownSync(Config.Info)

describe("ConfigProfile", () => {
  it.effect("maps profile tools into trailing permission rules", () =>
    Effect.gen(function* () {
      const rules = ConfigProfile.applyTools({ edit: false, bash: true })
      expect(rules).toEqual([
        { action: "edit", resource: "*", effect: "deny" },
        { action: "bash", resource: "*", effect: "allow" },
      ])
      expect(ConfigProfile.applyTools(undefined)).toEqual([])
    }),
  )

  it.effect("applies a named profile to the default agent and permission rules", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      yield* agents.transform((editor) => editor.update(AgentV2.defaultID, () => {}))
      const profileName = "ci"
      process.env.OPENCODE_PROFILE = profileName
      try {
        const config = Config.Service.of({
          entries: () =>
            Effect.succeed([
              new Config.Document({
                type: "document",
                info: decode({
                  permissions: [{ action: "edit", resource: "*", effect: "allow" }],
                  agents: { build: { model: "anthropic/claude-sonnet" } },
                  profiles: {
                    ci: {
                      description: "CI hardening",
                      model: "anthropic/claude-haiku",
                      small_model: "openai/gpt-mini",
                      advisor_model: "openai/gpt-mini",
                      tools: { edit: false, bash: true },
                    },
                  },
                }),
              }),
            ]),
        })

        yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
          Effect.provideService(Config.Service, config),
        )

        const build = yield* agents.get(AgentV2.defaultID)
        if (!build) throw new Error("expected build agent")
        expect(build).toMatchObject({
          model: { providerID: "anthropic", id: "claude-haiku", variant: undefined },
          smallModel: { providerID: "openai", id: "gpt-mini" },
          advisorModel: { providerID: "openai", id: "gpt-mini" },
        })
        const permissions = build.permissions
        expect(permissions).toContainEqual({ action: "edit", resource: "*", effect: "allow" })
        expect(permissions.filter((rule) => rule.action === "edit").map((rule) => rule.effect)).toEqual([
          "allow",
          "deny",
        ])
        expect(permissions.filter((rule) => rule.action === "bash")).toEqual([
          { action: "bash", resource: "*", effect: "allow" },
        ])
      } finally {
        delete process.env.OPENCODE_PROFILE
      }
    }),
  )

  it.effect("leaves agents unchanged for an undefined profile", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      yield* agents.transform((editor) => editor.update(AgentV2.defaultID, () => {}))
      process.env.OPENCODE_PROFILE = "missing"
      try {
        const config = Config.Service.of({
          entries: () =>
            Effect.succeed([
              new Config.Document({
                type: "document",
                info: decode({ agents: { build: { model: "anthropic/claude-sonnet" } } }),
              }),
            ]),
        })

        yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
          Effect.provideService(Config.Service, config),
        )

        const build = yield* agents.get(AgentV2.defaultID)
        if (!build) throw new Error("expected build agent")
        expect(build).toMatchObject({ model: { providerID: "anthropic", id: "claude-sonnet", variant: undefined } })
        expect(build.smallModel).toBeUndefined()
      } finally {
        delete process.env.OPENCODE_PROFILE
      }
    }),
  )
})
