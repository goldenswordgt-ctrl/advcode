import { describe, expect, test } from "bun:test"
import { consumeMarker, extractMarkers } from "../../src/cli/cmd/watch"

describe("extractMarkers", () => {
  test("extracts AI: instructions with text", () => {
    const content = ["// AI: fix the loop", "const x = 1", "# AI: rename this"].join("\n")
    expect(extractMarkers(content, "AI")).toEqual([
      { line: 1, text: "fix the loop", kind: ":" },
      { line: 3, text: "rename this", kind: ":" },
    ])
  })

  test("skips bare AI: with no instruction", () => {
    expect(extractMarkers("// AI:", "AI")).toEqual([])
    expect(extractMarkers("// AI:  ", "AI")).toEqual([])
  })

  test("extracts AI! with and without text", () => {
    expect(extractMarkers("// AI! fix this", "AI")).toEqual([{ line: 1, text: "fix this", kind: "!" }])
    expect(extractMarkers("// AI!", "AI")).toEqual([{ line: 1, text: "", kind: "!" }])
  })

  test("extracts AI? with and without text", () => {
    expect(extractMarkers("// AI? is this correct", "AI")).toEqual([{ line: 1, text: "is this correct", kind: "?" }])
    expect(extractMarkers("// AI?", "AI")).toEqual([{ line: 1, text: "", kind: "?" }])
  })

  test("strips comment prefix and suffix before matching", () => {
    const content = ["<!-- AI: check the html -->", "/* AI! */", "-- AI? why"].join("\n")
    expect(extractMarkers(content, "AI")).toEqual([
      { line: 1, text: "check the html", kind: ":" },
      { line: 2, text: "", kind: "!" },
      { line: 3, text: "why", kind: "?" },
    ])
  })

  test("does not match bare marker without suffix", () => {
    expect(extractMarkers("// AI do something", "AI")).toEqual([])
  })

  test("does not match longer markers sharing the prefix", () => {
    expect(extractMarkers("// AID:", "AI")).toEqual([])
    expect(extractMarkers("// AIP! fix", "AI")).toEqual([])
  })

  test("supports a custom marker prefix", () => {
    expect(extractMarkers("# BOT! handle it", "BOT")).toEqual([{ line: 1, text: "handle it", kind: "!" }])
  })
})

describe("consumeMarker", () => {
  test("strips the bang from an AI! marker line", () => {
    const content = ["// first", "// AI! fix me", "// third"].join("\n")
    expect(consumeMarker(content, "AI", 2)).toBe(["// first", "// AI fix me", "// third"].join("\n"))
  })

  test("leaves other lines untouched", () => {
    const content = ["// AI: keep me", "// AI! bang"].join("\n")
    expect(consumeMarker(content, "AI", 1)).toBe(content)
  })

  test("no-op when the line does not contain the marker", () => {
    const content = "// plain comment"
    expect(consumeMarker(content, "AI", 1)).toBe(content)
  })

  test("handles empty content and out-of-range lines", () => {
    expect(consumeMarker("", "AI", 1)).toBe("")
    expect(consumeMarker("// AI!", "AI", 99)).toBe("// AI!")
  })
})
