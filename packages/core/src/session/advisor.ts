export * as SessionAdvisor from "./advisor"

import { Effect, Stream } from "effect"
import { LLM, Message, SystemPart, type LLMError, type LLMEvent, type LLMRequest, type Model } from "@opencode-ai/llm"

type Client = { readonly stream: (request: LLMRequest) => Stream.Stream<LLMEvent, LLMError> }

const SYSTEM =
  "You are a rigorous but terse code-review advisor. Review only the assistant output of one turn. " +
  "Judge correctness, safety, and obvious regressions; ignore style nits. " +
  'Reply with exactly one line: "OK" when nothing needs fixing, otherwise one "ISSUE: <finding>" line per genuine problem and nothing else.'

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly issues: readonly string[] }

export const buildRequest = (model: Model, text: string, sessionID: string) =>
  LLM.request({
    model,
    http: { headers: { "x-session-affinity": sessionID, "X-Session-Id": sessionID } },
    system: [SystemPart.make(SYSTEM)],
    messages: [Message.user(text)],
  })

export const parseVerdict = (text: string): Verdict => {
  const issues = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toUpperCase().startsWith("ISSUE"))
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/** Reviews an assistant turn with a second model and logs findings. Always fails open. */
export const review = (llm: Client, model: Model, text: string, sessionID: string) =>
  Effect.gen(function* () {
    let output = ""
    yield* llm.stream(buildRequest(model, text, sessionID)).pipe(
      Stream.runForEach((event: LLMEvent) => {
        if (event.type === "text-delta") output += event.text
        return Effect.void
      }),
    )
    const verdict = parseVerdict(output)
    if (verdict.ok) {
      yield* Effect.logInfo("advisor review passed", { sessionID })
    } else {
      yield* Effect.logWarning("advisor review findings", { sessionID, issues: verdict.issues })
    }
  }).pipe(Effect.catch(() => Effect.logWarning("advisor review failed")))
