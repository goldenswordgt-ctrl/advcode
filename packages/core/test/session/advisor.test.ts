import { describe, expect, test } from "bun:test"
import { SessionAdvisor } from "@opencode-ai/core/session/advisor"

describe("SessionAdvisor.parseVerdict", () => {
  test("passes on a clean OK verdict", () => {
    expect(SessionAdvisor.parseVerdict("OK")).toEqual({ ok: true })
    expect(SessionAdvisor.parseVerdict("  ok  ")).toEqual({ ok: true })
  })

  test("collects ISSUE lines into findings", () => {
    const verdict = SessionAdvisor.parseVerdict(
      "ISSUE: division by zero is unguarded\nISSUE: unused import left behind",
    )
    expect(verdict).toEqual({
      ok: false,
      issues: ["ISSUE: division by zero is unguarded", "ISSUE: unused import left behind"],
    })
  })

  test("ignores non-ISSUE commentary", () => {
    expect(SessionAdvisor.parseVerdict("Looks fine overall\n(nothing else needed)")).toEqual({ ok: true })
  })
})
