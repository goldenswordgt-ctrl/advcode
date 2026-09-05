import { expect, test } from "bun:test"
import { SessionCompaction } from "@opencode-ai/core/session/compaction"

test("compaction prompt preserves detailed work state and relevant files", () => {
  const prompt = SessionCompaction.buildPrompt({ context: ["conversation history"] })

  expect(prompt).toStartWith(
    "Here is the conversation so far:\n\n<conversation>\nconversation history\n</conversation>",
  )
  expect(prompt.indexOf("</conversation>")).toBeLessThan(prompt.indexOf("Create a new anchored summary"))
  expect(prompt).toContain("conversation history in the <conversation> tags above")
  expect(prompt).toContain("## Work State\n### Completed")
  expect(prompt).toContain("### Active")
  expect(prompt).toContain("### Blocked")
  expect(prompt).toContain("## Relevant Files")
})

test("compaction prompt gives update instructions for a prior summary", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["new conversation"],
    previousSummary: "existing summary",
  })

  expect(prompt.indexOf("<conversation>")).toBeLessThan(prompt.indexOf("<prior-summary>"))
  expect(prompt.indexOf("</prior-summary>")).toBeLessThan(prompt.indexOf("The <prior-summary> summarizes"))
  expect(prompt).toContain(
    "Carry forward objectives, constraints, user directives, decisions, and parallel workstreams from the <prior-summary>",
  )
  expect(prompt).toContain('Move completed work from "Active" to "Completed".')
  expect(prompt).toContain('Update "Objective" and "Next Move" to reflect the current work state.')
})

test("compaction prompt injects focus instructions when focus is supplied", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["conversation history"],
    focus: "keep the auth flow and the DB schema exact",
  })

  expect(prompt.indexOf("<focus>")).toBeLessThan(prompt.indexOf("keep the auth flow and the DB schema exact"))
  expect(prompt.indexOf("keep the auth flow and the DB schema exact")).toBeLessThan(prompt.indexOf("</focus>"))
  expect(prompt).toContain("focus instructions for this compaction")
  expect(prompt).toContain('Shape "Objective", "Work State", "Next Move", and "Relevant Files" around the focus.')
})

test("compaction prompt omits focus section when focus is empty or undefined", () => {
  const undefinedFocus = SessionCompaction.buildPrompt({ context: ["here"], previousSummary: "prior" })
  const blankFocus = SessionCompaction.buildPrompt({ context: ["here"], focus: "   \n  " })

  expect(undefinedFocus).not.toContain("<focus>")
  expect(undefinedFocus).not.toContain("focus instructions")
  expect(blankFocus).not.toContain("<focus>")
  expect(blankFocus).not.toContain("focus instructions")
})

test("compaction prompt anchors focus for repeated summaries too", () => {
  const prompt = SessionCompaction.buildPrompt({
    context: ["new conversation"],
    previousSummary: "existing summary",
    focus: "preserve the Vitale icon geometry decisions",
  })

  expect(prompt).toContain("<prior-summary>")
  expect(prompt).toContain("preserve the Vitale icon geometry decisions")
  expect(prompt.indexOf("<focus>")).toBeGreaterThan(prompt.indexOf("The <prior-summary> summarizes"))
})

test("compaction describes tool media without embedding base64", () => {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
  const serialized = SessionCompaction.serializeToolContent([
    { type: "text", text: "Image read successfully" },
    {
      type: "file",
      uri: `data:image/png;base64,${base64}`,
      mime: "image/png",
      name: "pixel.png",
    },
  ])

  expect(serialized).toBe("Image read successfully\n[Attached image/png: pixel.png]")
  expect(serialized).not.toContain(base64)
})
