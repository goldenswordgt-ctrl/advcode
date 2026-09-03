export * as SkillLearning from "./learning"

import path from "path"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { SkillLearnedTable } from "./sql"
import { desc, eq, sql } from "drizzle-orm"
import { makeGlobalNode } from "../effect/app-node"

/**
 * SkillLearning — the learning loop.
 *
 * After a complex task completes, the agent can distill what it learned
 * into a reusable skill. Skills are written to disk as markdown with
 * frontmatter (matching the SkillV2 loader's expectation), so they become
 * available as normal skills on the next list(). The DB record keeps
 * provenance (source session) and usage stats so skills can self-improve.
 */

export const LearnedSkill = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  content: Schema.String,
  source_session_id: Schema.optional(Schema.String),
  times_used: Schema.Number,
  times_improved: Schema.Number,
  time_created: Schema.Number,
  last_used_at: Schema.optional(Schema.Number),
})
export type LearnedSkill = typeof LearnedSkill.Type

export interface Interface {
  /** Create (or overwrite) a learned skill. Returns the stored record. */
  readonly create: (input: {
    name: string
    description?: string
    content: string
    source_session_id?: string
  }) => Effect.Effect<LearnedSkill, Error>
  /** Read a learned skill by name. */
  readonly get: (name: string) => Effect.Effect<LearnedSkill | undefined>
  /** List learned skills, newest first. */
  readonly list: () => Effect.Effect<LearnedSkill[]>
  /** Record that a learned skill was used. */
  readonly recordUse: (name: string) => Effect.Effect<void>
  /** Record that a learned skill was improved. */
  readonly recordImprovement: (name: string) => Effect.Effect<void>
  /** Remove a learned skill (DB row + disk file). */
  readonly remove: (name: string) => Effect.Effect<void>
  /** Absolute directory where learned skills live on disk. */
  readonly directory: () => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode2/v2/SkillLearning") {}

const skillDirName = "learned"

// Valid skill names: lowercase alphanumeric + dashes, no path separators.
const isValidSkillName = (name: string) => /^[a-z0-9][a-z0-9-]*$/.test(name)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service

    const root = path.join(global.data, "skills", skillDirName)

    const renderMarkdown = (skill: { name: string; description?: string; content: string }) =>
      [
        "---",
        `name: ${skill.name}`,
        skill.description !== undefined ? `description: ${skill.description}` : "description:",
        "---",
        "",
        skill.content,
      ].join("\n")

    const fileFor = (name: string) => path.join(root, `${name}.md`)

    const create = Effect.fn("SkillLearning.create")(function* (input) {
      if (!isValidSkillName(input.name)) {
        return yield* Effect.fail(new Error(`invalid skill name: ${input.name}`))
      }
      const id = crypto.randomUUID()
      const now = Date.now()

      yield* fs.writeWithDirs(fileFor(input.name), renderMarkdown(input)).pipe(Effect.orDie)

      const existing = yield* db
        .select()
        .from(SkillLearnedTable)
        .where(eq(SkillLearnedTable.name, input.name))
        .limit(1)
        .all()
        .pipe(Effect.orDie)
      if (existing[0]) {
        yield* db
          .update(SkillLearnedTable)
          .set({ content: input.content, description: input.description ?? null, time_updated: now })
          .where(eq(SkillLearnedTable.name, input.name))
          .run()
          .pipe(Effect.orDie)
        return {
          id: existing[0].id,
          name: input.name,
          description: input.description,
          content: input.content,
          source_session_id: existing[0].source_session_id ?? undefined,
          times_used: existing[0].times_used,
          times_improved: existing[0].times_improved,
          time_created: existing[0].time_created,
          last_used_at: existing[0].last_used_at ?? undefined,
        } satisfies LearnedSkill
      }

      yield* db
        .insert(SkillLearnedTable)
        .values({
          id,
          name: input.name,
          description: input.description ?? null,
          content: input.content,
          source_session_id: input.source_session_id ?? null,
          times_used: 0,
          times_improved: 0,
          time_created: now,
          time_updated: now,
        })
        .run()
        .pipe(Effect.orDie)
      return {
        id,
        name: input.name,
        description: input.description,
        content: input.content,
        source_session_id: input.source_session_id,
        times_used: 0,
        times_improved: 0,
        time_created: now,
        last_used_at: undefined,
      } satisfies LearnedSkill
    })

    const get = Effect.fn("SkillLearning.get")(function* (name) {
      const row = yield* db
        .select()
        .from(SkillLearnedTable)
        .where(eq(SkillLearnedTable.name, name))
        .limit(1)
        .all()
        .pipe(Effect.orDie)
      if (!row[0]) return undefined
      return {
        id: row[0].id,
        name: row[0].name,
        description: row[0].description ?? undefined,
        content: row[0].content,
        source_session_id: row[0].source_session_id ?? undefined,
        times_used: row[0].times_used,
        times_improved: row[0].times_improved,
        time_created: row[0].time_created,
        last_used_at: row[0].last_used_at ?? undefined,
      } satisfies LearnedSkill
    })

    const list = Effect.fn("SkillLearning.list")(function* () {
      const rows = yield* db
        .select()
        .from(SkillLearnedTable)
        .orderBy(desc(SkillLearnedTable.time_created))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        content: row.content,
        source_session_id: row.source_session_id ?? undefined,
        times_used: row.times_used,
        times_improved: row.times_improved,
        time_created: row.time_created,
        last_used_at: row.last_used_at ?? undefined,
      } satisfies LearnedSkill))
    })

    const recordUse = Effect.fn("SkillLearning.recordUse")(function* (name) {
      yield* db
        .update(SkillLearnedTable)
        .set({ times_used: sql`times_used + 1`, last_used_at: Date.now(), time_updated: Date.now() })
        .where(eq(SkillLearnedTable.name, name))
        .run()
        .pipe(Effect.orDie)
    })

    const recordImprovement = Effect.fn("SkillLearning.recordImprovement")(function* (name) {
      yield* db
        .update(SkillLearnedTable)
        .set({ times_improved: sql`times_improved + 1`, time_updated: Date.now() })
        .where(eq(SkillLearnedTable.name, name))
        .run()
        .pipe(Effect.orDie)
    })

    const remove = Effect.fn("SkillLearning.remove")(function* (name) {
      yield* fs.remove(fileFor(name), { recursive: true, force: true }).pipe(Effect.orDie)
      yield* db
        .delete(SkillLearnedTable)
        .where(eq(SkillLearnedTable.name, name))
        .run()
        .pipe(Effect.orDie)
    })

    const directory = Effect.fn("SkillLearning.directory")(function* () {
      return root
    })

    return Service.of({ create, get, list, recordUse, recordImprovement, remove, directory })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, FSUtil.node, Global.node],
})