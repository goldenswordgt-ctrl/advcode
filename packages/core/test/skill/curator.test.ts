import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { SkillCurator } from "@opencode-ai/core/skill/curator"
import { SkillLearning } from "@opencode-ai/core/skill/learning"
import { it } from "../lib/effect"

// Mock SkillLearning with a few representative skills. The curator's scoring
// logic is entirely driven by what learning reports (usage metrics + content),
// so a mock gives us deterministic control over every dimension.
const makeLearningLayer = (skills: SkillLearning.LearnedSkill[]) =>
  Layer.mock(SkillLearning.Service, {
    get: (name) =>
      Effect.succeed(skills.find((s) => s.name === name)),
    list: () => Effect.succeed(skills),
    remove: (name) =>
      Effect.sync(() => {
        const idx = skills.findIndex((s) => s.name === name)
        if (idx >= 0) skills.splice(idx, 1)
      }),
    create: () => Effect.succeed({
      id: "x",
      name: "x",
      times_used: 0,
      times_improved: 0,
      time_created: 0,
      content: "",
    }),
    recordUse: () => Effect.void,
    recordImprovement: () => Effect.void,
    directory: () => Effect.succeed("/skills/learned"),
  })

const curatorLayer = (skills: SkillLearning.LearnedSkill[]) =>
  AppNodeBuilder.build(SkillCurator.node, [[SkillLearning.node, makeLearningLayer(skills)]])

// A well-used, well-formed skill.
const goodSkill: SkillLearning.LearnedSkill = {
  id: "1",
  name: "refactor-rust",
  description: "Safely refactor a Rust binary to use Result instead of panic.",
  content: [
    "## When to use",
    "Use when converting panic or unwrap into proper error handling.",
    "## Steps",
    "1. Find unwrap calls.",
    "2. Thread Result through the call chain.",
    "## Gotchas",
    "Panic in a library panics the host process.",
  ].join("\n"),
  times_used: 30,
  times_improved: 3,
  time_created: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
  last_used_at: Date.now() - 1000 * 60, // 1 minute ago
}

// Never used, sparse content, no structure.
const junkSkill: SkillLearning.LearnedSkill = {
  id: "2",
  name: "quick-note",
  content: "did a thing",
  times_used: 0,
  times_improved: 0,
  time_created: Date.now() - 1000 * 60 * 60 * 24 * 60, // 60 days ago
}

// Used a bit, decent but missing gotchas.
const mediocreSkill: SkillLearning.LearnedSkill = {
  id: "3",
  name: "sql-optimize",
  description: "Optimize a slow SQL query.",
  content: [
    "## When to use",
    "During slow query tuning.",
    "## Steps",
    "1. Run EXPLAIN.",
    "2. Add the missing index.",
  ].join("\n"),
  times_used: 1,
  times_improved: 0,
  time_created: Date.now() - 1000 * 60 * 60 * 24 * 30,
  last_used_at: Date.now() - 1000 * 60 * 60 * 24 * 29,
}

describe("SkillCurator", () => {
  it.effect("scores a well-used well-formed skill as keep", () => {
    return Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const scored = yield* curator.score("refactor-rust")
      expect(scored).toBeDefined()
      expect(scored!.score).toBeGreaterThanOrEqual(50)
      expect(scored!.quality.has_description).toBe(true)
      expect(scored!.quality.has_sections).toBe(true)
      expect(scored!.quality.has_gotchas).toBe(true)

      const review = yield* curator.review("refactor-rust")
      expect(review!.verdict).toBe("keep")
    }).pipe(Effect.provide(curatorLayer([goodSkill])))
  })

  it.effect("marks a never-used sparse skill as prune", () => {
    return Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const scored = yield* curator.score("quick-note")
      expect(scored).toBeDefined()
      expect(scored!.score).toBeLessThan(20)
      expect(scored!.quality.has_sections).toBe(false)
      expect(scored!.quality.has_gotchas).toBe(false)

      const review = yield* curator.review("quick-note")
      expect(review!.verdict).toBe("prune")
      expect(review!.reasons).toContain("never used")
      expect(review!.reasons).toContain("suspiciously short content")
    }).pipe(Effect.provide(curatorLayer([junkSkill])))
  })

  it.effect("scores a barely-used under-structured skill as improve", () => {
    return Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const review = yield* curator.review("sql-optimize")
      expect(review!.verdict).toBe("improve")
    }).pipe(Effect.provide(curatorLayer([mediocreSkill])))
  })

  it.effect("computes aggregate stats across the library", () => {
    return Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const stats = yield* curator.stats()
      expect(stats.total).toBe(3)
      expect(stats.keep).toBe(1)
      expect(stats.improve).toBe(1)
      expect(stats.prune).toBe(1)
      expect(stats.avg_score).toBeGreaterThan(0)
    }).pipe(Effect.provide(curatorLayer([goodSkill, junkSkill, mediocreSkill])))
  })

  it.effect("prunes skills below the threshold and returns removed names", () => {
    return Effect.gen(function* () {
      const curator = yield* SkillCurator.Service
      const removed = yield* curator.prune(20)
      expect(removed).toContain("quick-note")
      expect(removed).not.toContain("refactor-rust")
    }).pipe(Effect.provide(curatorLayer([goodSkill, junkSkill])))
  })
})
