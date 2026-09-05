import { describe, expect, test } from "bun:test"
import { diffMemory, parseMemoryDump, serializeEntries } from "../../src/cli/cmd/memory"

const line = (type: string, key: string, value: string, importance?: number) => ({
  type,
  key,
  value,
  importance,
})

describe("serializeEntries", () => {
  test("writes one JSON object per line", () => {
    const out = serializeEntries([line("user", "color", "red", 5), line("lesson", "be-careful", "trust nothing")])
    expect(out).toBe(
      `{"type":"user","key":"color","value":"red","importance":5}\n{"type":"lesson","key":"be-careful","value":"trust nothing"}\n`,
    )
  })

  test("empty list produces empty output", () => {
    expect(serializeEntries([])).toBe("")
  })
})

describe("parseMemoryDump", () => {
  test("parses valid JSONL entries", () => {
    const text = `{"type":"user","key":"color","value":"red","importance":5}\n{"type":"lesson","key":"be-careful","value":"trust nothing"}\n`
    const { entries, errors } = parseMemoryDump(text)
    expect(errors).toEqual([])
    expect(entries).toEqual([line("user", "color", "red", 5), line("lesson", "be-careful", "trust nothing")])
  })

  test("handles CRLF and trailing blank lines", () => {
    const text = `{"type":"user","key":"a","value":"b"}\r\n\r\n`
    const { entries, errors } = parseMemoryDump(text)
    expect(errors).toEqual([])
    expect(entries).toEqual([line("user", "a", "b")])
  })

  test("escaped quotes inside values survive the round-trip", () => {
    const original = line("user", "quote", 'she said "hello"')
    const { entries, errors } = parseMemoryDump(serializeEntries([original]))
    expect(errors).toEqual([])
    expect(entries[0]).toEqual(original)
  })

  test("rejects malformed lines with line numbers", () => {
    const text = `{"type":"user","key":"a","value":"b"}\nnot json\n{"type":"bogus","key":"x","value":"y"}\n`
    const { entries, errors } = parseMemoryDump(text)
    expect(entries).toHaveLength(1)
    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain("line 2")
    expect(errors[1]).toContain("line 3")
    expect(errors[1]).toContain("type must be one of")
  })

  test("rejects empty keys, empty values, and non-finite importance", () => {
    const bad = [
      `{"type":"user","key":"","value":"b"}`,
      `{"type":"user","key":"a","value":""}`,
      `{"type":"user","key":"a","value":"b","importance":"high"}`,
    ]
    const { entries, errors } = parseMemoryDump(bad.join("\n"))
    expect(entries).toHaveLength(0)
    expect(errors).toHaveLength(3)
  })
})

describe("diffMemory", () => {
  const old = [line("user", "keep", "same"), line("user", "change", "old value", 3), line("project", "gone", "bye")]

  test("classifies adds, updates, deletes, and unchanged", () => {
    const next = [
      line("user", "keep", "same"),
      line("user", "change", "new value", 5),
      line("preference", "new", "hello"),
    ]
    const diff = diffMemory(old, next)
    expect(diff.adds).toEqual([line("preference", "new", "hello")])
    expect(diff.updates).toEqual([line("user", "change", "new value", 5)])
    expect(diff.deletes).toEqual([{ type: "project", key: "gone" }])
    expect(diff.unchanged).toBe(1)
  })

  test("same importance change alone triggers an update", () => {
    const next = [line("user", "change", "old value", 9)]
    const diff = diffMemory(old, next)
    expect(diff.updates).toEqual([line("user", "change", "old value", 9)])
    expect(diff.deletes).toEqual([
      { type: "user", key: "keep" },
      { type: "project", key: "gone" },
    ])
  })

  test("identical lists produce an empty diff", () => {
    const diff = diffMemory(old, [...old])
    expect(diff.adds).toEqual([])
    expect(diff.updates).toEqual([])
    expect(diff.deletes).toEqual([])
    expect(diff.unchanged).toBe(3)
  })

  test("same key in different types is treated as two distinct entries", () => {
    const a = [line("user", "x", "1"), line("project", "x", "2")]
    const b = [line("user", "x", "1")]
    const diff = diffMemory(a, b)
    expect(diff.unchanged).toBe(1)
    expect(diff.deletes).toEqual([{ type: "project", key: "x" }])
  })
})
