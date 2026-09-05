import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { applyLightweight } from "../../src/session/lightweight"

describe("applyLightweight", () => {
  test("creates a config file with trimmed tools and auto compaction", async () => {
    await using tmp = await tmpdir()
    const result = await applyLightweight(tmp.path)

    expect(result.denies).toEqual(["browser", "task", "plan", "code-mode", "question", "lsp"])
    expect(result.compaction).toBe(true)

    const config = await Bun.file(path.join(tmp.path, "opencode.json")).json()
    expect(config.tools.browser).toBe(false)
    expect(config.tools.task).toBe(false)
    expect(config.tools.plan).toBe(false)
    expect(config.tools["code-mode"]).toBe(false)
    expect(config.tools.question).toBe(false)
    expect(config.tools.lsp).toBe(false)
    // Web tooling must NOT be denied
    expect(config.tools.webfetch).toBeUndefined()
    expect(config.tools.websearch).toBeUndefined()
    expect(config.tools["mcp-websearch"]).toBeUndefined()
    expect(config.compaction.auto).toBe(true)
  })

  test("merges into an existing config without clobbering other keys", async () => {
    await using tmp = await tmpdir({
      config: { model: "test/model", tools: { bash: true, websearch: true } },
    })

    await applyLightweight(tmp.path)

    const config = await Bun.file(path.join(tmp.path, "opencode.json")).json()
    expect(config.model).toBe("test/model")
    expect(config.tools.bash).toBe(true)
    expect(config.tools.websearch).toBe(true)
    expect(config.tools.browser).toBe(false)
    expect(config.compaction.auto).toBe(true)
  })

  test("preserves jsonc comments and is idempotent", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "opencode.jsonc"), "{\n  // keep me\n  \"model\": \"test/model\"\n}\n")

    const first = await applyLightweight(tmp.path)
    const firstText = await Bun.file(path.join(tmp.path, "opencode.jsonc")).text()
    const second = await applyLightweight(tmp.path)
    const secondText = await Bun.file(path.join(tmp.path, "opencode.jsonc")).text()

    expect(first.path).toEndWith("opencode.jsonc")
    expect(firstText).toContain("// keep me")
    expect(firstText).toContain('"model": "test/model"')
    expect(firstText).toContain('"browser": false')
    expect(firstText).toContain('"auto": true')
    // Idempotent: a second run leaves the file unchanged
    expect(secondText).toBe(firstText)
    expect(second.path).toBe(first.path)
  })

  test("defaults to opencode.json when the directory is empty", async () => {
    await using tmp = await tmpdir()
    const result = await applyLightweight(tmp.path)
    expect(result.path).toEndWith("opencode.json")
  })
})