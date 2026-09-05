import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { defaultAgentFile, patchVariant, readVariant } from "../../src/cli/cmd/effort"

const BODY = "\nSome agent body.\nThank you for flying V airlines.\n"

describe("patchVariant", () => {
  test("inserts a variant line and preserves the body byte-for-byte", () => {
    const input = `---\ndescription: the agent\nmodel: opencode/big-pickle\n---${BODY}`
    const patched = patchVariant(input, "high")
    expect(patched).toBe(`---\ndescription: the agent\nmodel: opencode/big-pickle\nvariant: high\n---${BODY}`)
    expect(patched.endsWith(BODY)).toBe(true)
  })

  test("updates an existing variant line in place", () => {
    const input = `---\ndescription: the agent\nvariant: low\nmodel: opencode/big-pickle\n---${BODY}`
    const patched = patchVariant(input, "medium")
    expect(patched).toBe(`---\ndescription: the agent\nvariant: medium\nmodel: opencode/big-pickle\n---${BODY}`)
  })

  test("removes the variant line when given undefined", () => {
    const input = `---\ndescription: the agent\nvariant: high\n---${BODY}`
    const patched = patchVariant(input, undefined)
    expect(patched).toBe(`---\ndescription: the agent\n---${BODY}`)
  })

  test("removing a missing variant line is a no-op returning the same reference", () => {
    const input = `---\ndescription: the agent\n---${BODY}`
    expect(patchVariant(input, undefined)).toBe(input)
  })

  test("setting the same value is idempotent and returns identical content", () => {
    const input = `---\nvariant: low\n---${BODY}`
    expect(patchVariant(input, "low")).toBe(input)
  })

  test("handles CRLF frontmatter and keeps the line endings elsewhere intact", () => {
    const input = `---\r\ndescription: the agent\r\n---\r\n${BODY}`
    const patched = patchVariant(input, "high")
    expect(patched).toBe(`---\r\ndescription: the agent\r\nvariant: high\r\n---\r\n${BODY}`)
  })

  test("returns content unchanged when there is no frontmatter block", () => {
    const input = `no frontmatter here\n${BODY}`
    expect(patchVariant(input, "high")).toBe(input)
  })

  test("quoted variant values are replaced, not double-quoted", () => {
    const input = `---\nvariant: "low"\n---${BODY}`
    expect(patchVariant(input, "high")).toBe(`---\nvariant: high\n---${BODY}`)
  })
})

describe("readVariant", () => {
  test("reads an unquoted value", () => {
    expect(readVariant(`---\nvariant: medium\n---\nbody\n`)).toBe("medium")
  })

  test("reads a quoted value", () => {
    expect(readVariant(`---\nvariant: "high"\n---\nbody\n`)).toBe("high")
  })

  test("returns undefined when no variant line exists", () => {
    expect(readVariant(`---\ndescription: x\n---\nbody\n`)).toBeUndefined()
  })

  test("returns undefined without a frontmatter block", () => {
    expect(readVariant("no frontmatter")).toBeUndefined()
  })
})

describe("defaultAgentFile", () => {
  test("prefers a project agent file over the global config dir", () => {
    const root = mkdtempSync(join(tmpdir(), "effort-test-"))
    try {
      const project = join(root, ".opencode", "agent")
      mkdirSync(project, { recursive: true })
      writeFileSync(join(project, "default.md"), "---\n---\n")
      expect(defaultAgentFile(root, join(root, "global-config"))).toBe(join(project, "default.md"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("falls back to agents/ dir when agent/ is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "effort-test-"))
    try {
      const project = join(root, ".opencode", "agents")
      mkdirSync(project, { recursive: true })
      writeFileSync(join(project, "default.md"), "---\n---\n")
      expect(defaultAgentFile(root, join(root, "global-config"))).toBe(join(project, "default.md"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("falls back to the global config dir when no project file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "effort-test-"))
    try {
      const globalConfig = join(root, "global-config", "agent")
      mkdirSync(globalConfig, { recursive: true })
      writeFileSync(join(globalConfig, "default.md"), "---\n---\n")
      expect(defaultAgentFile(root, join(root, "global-config"))).toBe(join(globalConfig, "default.md"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("returns undefined when no default agent file exists anywhere", () => {
    const root = mkdtempSync(join(tmpdir(), "effort-test-"))
    try {
      expect(defaultAgentFile(root, join(root, "global-config"))).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
