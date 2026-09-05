import { describe, expect, test } from "bun:test"
import { findLatestCheckpoint } from "../../src/cli/cmd/checkpoint"

const stepStart = (snapshot?: string, id = "part") => ({ id, type: "step-start", snapshot })
const stepFinish = (snapshot?: string, id = "part") => ({ id, type: "step-finish", snapshot })

describe("findLatestCheckpoint", () => {
const messages = (rows: { id: string; parts: { id: string; type: string; snapshot?: string }[] }[]) =>
  rows.map((row) => ({ info: { id: row.id }, parts: row.parts }))

  test("finds the most recent step-start snapshot across messages", () => {
    const result = findLatestCheckpoint(
      messages([
        { id: "msg-1", parts: [stepStart("snap-1"), stepFinish("after-1")] },
        { id: "msg-2", parts: [stepStart("snap-2"), stepFinish("after-2")] },
      ]),
    )
    expect(result).toEqual({ messageID: "msg-2", partID: "part" })
  })

  test("walks parts newest-first within the newest message", () => {
    const result = findLatestCheckpoint(
      messages([{ id: "msg-9", parts: [stepStart("old"), stepFinish("mid"), stepStart("new", "part-2")] }]),
    )
    expect(result).toEqual({ messageID: "msg-9", partID: "part-2" })
  })

  test("ignores step-finish parts without a preceding step-start in the same message", () => {
    const result = findLatestCheckpoint(
      messages([
        { id: "msg-1", parts: [stepStart("a")] },
        { id: "msg-2", parts: [stepFinish("no-start")] },
      ]),
    )
    expect(result).toEqual({ messageID: "msg-1", partID: "part" })
  })

  test("ignores step-start parts without a snapshot", () => {
    const result = findLatestCheckpoint(messages([{ id: "msg-1", parts: [stepStart(undefined), stepStart("real")] }]))
    expect(result).toEqual({ messageID: "msg-1", partID: "part" })
  })

  test("returns undefined when there are no step-start snapshots", () => {
    expect(
      findLatestCheckpoint(
        messages([
          { id: "msg-1", parts: [stepFinish("only-finish")] },
          { id: "msg-2", parts: [] },
        ]),
      ),
    ).toBeUndefined()
  })

  test("returns undefined for an empty message list", () => {
    expect(findLatestCheckpoint(messages([]))).toBeUndefined()
  })
})
