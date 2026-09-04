import { describe, expect, test } from "bun:test"
import { fromMode } from "../../src/permission"

describe("Permission.fromMode", () => {
  test("read-only denies edits and bash", () => {
    const rules = fromMode("read-only")
    const edit = rules.find((r) => r.permission === "edit" && r.pattern === "*")
    const bash = rules.find((r) => r.permission === "bash" && r.pattern === "*")
    expect(edit?.action).toBe("deny")
    expect(bash?.action).toBe("deny")
  })

  test("workspace-write denies external_directory", () => {
    const rules = fromMode("workspace-write")
    expect(rules).toContainEqual({
      permission: "external_directory",
      pattern: "*",
      action: "deny",
    })
  })

  test("workspace-write allows in-workspace edits (no edit deny)", () => {
    const rules = fromMode("workspace-write")
    expect(rules.some((r) => r.permission === "edit")).toBe(false)
  })

  test("full mode produces no rules", () => {
    expect(fromMode("full")).toEqual([])
  })

  test("undefined mode produces no rules", () => {
    expect(fromMode(undefined)).toEqual([])
  })
})