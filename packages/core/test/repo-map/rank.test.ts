import { describe, expect, it } from "bun:test"
import { extractDefinitions, rankFiles } from "@opencode-ai/core/repo-map/rank"

describe("RepoMapRank.extractDefinitions", () => {
  const tsSource = `
import { z } from "zod"

export interface User {
  id: string
  name: string
}

export type UserId = string

export class UserService {
  async get(id: string) { return id }
  private helper() { return 1 }
}

export function createUser(name: string) { return { name } }

export const VERSION = "1.0"
export enum Role { Admin, User }
`
  it("extracts TS definitions of the expected kinds", () => {
    const defs = extractDefinitions("src/user.ts", tsSource)
    const kinds = new Map(defs.map((d) => [d.symbol, d.kind]))
    expect(kinds.get("User")).toBe("interface")
    expect(kinds.get("UserId")).toBe("type")
    expect(kinds.get("UserService")).toBe("class")
    expect(kinds.get("createUser")).toBe("function")
    expect(kinds.get("VERSION")).toBe("const")
    expect(kinds.get("Role")).toBe("enum")
  })

  it("assigns 1-based line numbers matching the source", () => {
    const defs = extractDefinitions("src/user.ts", tsSource)
    const user = defs.find((d) => d.symbol === "UserService")
    // "interface User" is on line 4; class UserService on line 11 (1-based).
    expect(user?.line).toBe(11)
  })

  it("returns nothing for unknown extensions", () => {
    expect(extractDefinitions("foo.xyz", "function a(){}")).toEqual([])
  })

  it("extracts python definitions", () => {
    const defs = extractDefinitions("app.py", "class Foo:\n  pass\n\ndef bar():\n  return 1\n")
    const kinds = new Map(defs.map((d) => [d.symbol, d.kind]))
    expect(kinds.get("Foo")).toBe("class")
    expect(kinds.get("bar")).toBe("function")
  })
})

describe("RepoMapRank.rankFiles", () => {
  it("ranks denser files higher", () => {
    const dense = {
      path: "core.ts",
      rank: 0,
      definitions: [
        { symbol: "a", kind: "function" as const, line: 1 },
        { symbol: "b", kind: "function" as const, line: 2 },
        { symbol: "c", kind: "function" as const, line: 3 },
        { symbol: "d", kind: "function" as const, line: 4 },
      ],
    }
    const sparse = {
      path: "main.ts",
      rank: 0,
      definitions: [{ symbol: "main", kind: "function" as const, line: 1 }],
    }
    const [first] = rankFiles([sparse, dense])
    expect(first.path).toBe("core.ts")
  })
})
