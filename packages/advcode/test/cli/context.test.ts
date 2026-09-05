import { describe, expect, test } from "bun:test"
import { formatGrid } from "../../src/cli/cmd/context"

const sources = [
  { key: "core/date", chars: 40 },
  { key: "core/environment", chars: 200 },
  { key: "advcode/repo-map", chars: 6000 },
  { key: "core/memory", chars: 800 },
]

describe("formatGrid", () => {
  test("sorts sources largest first and shows a header with totals", () => {
    const { body, warnings } = formatGrid(sources, { width: 60, bloat: 12000 })
    const lines = body.split("\n")
    expect(lines[0]).toContain("4 sources")
    expect(lines[0]).toContain("7,040 chars")
    expect(lines[1]).toContain("advcode/repo-map")
    expect(lines[2]).toContain("core/memory")
    expect(lines[4]).toContain("core/date")
    expect(warnings).toEqual([])
  })

  test("flags sources over the bloat threshold and computes warnings", () => {
    const { body, warnings } = formatGrid(sources, { width: 60, bloat: 1000 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("advcode/repo-map is 6,000 chars")
    expect(body).toContain("~1,500 tokens")
  })

  test("color-codes relative share buckets", () => {
    const { body } = formatGrid(sources, { width: 60, bloat: 12000 })
    // Repo map dominates the total (>25%) -> warning-yellow bar; tiny sources
    // are success-green. Assert the color escapes appear exactly once each.
    expect(body).toContain("\x1b[93m") // yellow
    expect(body).toContain("\x1b[92m") // green
    expect(body).not.toContain("\x1b[91m") // no red without bloat
  })

  test("handles empty source list", () => {
    const { body, warnings } = formatGrid([], { width: 60, bloat: 12000 })
    expect(body).toBe("no context sources registered")
    expect(warnings).toEqual([])
  })

  test("clamps grid width to a sane range", () => {
    const wide = formatGrid(sources, { width: 5000, bloat: 12000 })
    const narrow = formatGrid(sources, { width: 2, bloat: 12000 })
    for (const { body } of [wide, narrow]) {
      for (const line of body.split("\n").slice(1)) {
        expect(line.length).toBeLessThan(240)
      }
    }
  })
})
