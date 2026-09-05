import type { Prompt } from "@opencode-ai/sdk/v2/types"
import type { Hooks } from "./registration.js"

export interface SessionPromptContext {
  readonly sessionID: string
  readonly messageID: string
  readonly delivery: "steer" | "queue"
  readonly prompt: Prompt
}

export interface SessionTurnContext {
  readonly sessionID: string
  readonly step: number
  readonly finish: string | undefined
  readonly modelID: string
  readonly providerID: string
}

export type SessionHooks = Hooks<{
  "prompt.before": SessionPromptContext
  "turn.after": SessionTurnContext
}>