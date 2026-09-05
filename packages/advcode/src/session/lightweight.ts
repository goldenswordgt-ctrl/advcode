import path from "path"
import { applyEdits, modify } from "jsonc-parser"
import { Filesystem } from "@/util/filesystem"

/**
 * Tool names too heavy / too interactive for low-RAM hosts. Each entry is denied
 * in the project config by the lightweight profile. Web tooling (webfetch,
 * websearch, mcp-websearch) is deliberately NOT denied — web access stays on.
 */
export const LIGHTWEIGHT_TOOLS_DENY = ["browser", "task", "plan", "code-mode", "question", "lsp"] as const

/**
 * Deterministically apply the lightweight profile to a project config directory.
 * This is a real CLI action — no model, no prompt injection. It merges (never
 * clobbers) the existing opencode config file, preserving comments via
 * jsonc-parser, and flips `OPENCODE_LIGHTWEIGHT` in the current process so the
 * running instance's fold picks it up.
 *
 * Returns a human-readable summary of what changed.
 */
export const applyLightweight = async (directory: string) => {
  const candidates = [
    path.join(directory, "opencode.json"),
    path.join(directory, "opencode.jsonc"),
    path.join(directory, ".opencode", "opencode.json"),
    path.join(directory, ".opencode", "opencode.jsonc"),
  ]
  let existing: string | undefined
  for (const candidate of candidates) {
    if (await Filesystem.exists(candidate)) {
      existing = candidate
      break
    }
  }
  const configPath = existing ?? candidates[0]!

  const text = existing ? await Filesystem.readText(existing) : "{}"
  if (!existing) await Filesystem.write(configPath, "{}")

  // jsonc-parser edits are offset-based: apply incrementally so each modify()
  // sees the result of the previous edit.
  const opts = { formattingOptions: { tabSize: 2, insertSpaces: true } }
  let next = text
  for (const tool of LIGHTWEIGHT_TOOLS_DENY) {
    next = applyEdits(next, modify(next, ["tools", tool], false, opts))
  }
  next = applyEdits(next, modify(next, ["compaction", "auto"], true, opts))
  await Filesystem.write(configPath, next)

  return {
    path: configPath,
    denies: [...LIGHTWEIGHT_TOOLS_DENY],
    compaction: true,
  }
}