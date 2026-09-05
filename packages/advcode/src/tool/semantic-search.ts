import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SemanticIndex } from "@opencode-ai/core/semantic-index/semantic-index"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./semantic-search.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({ description: "The natural-language query to search for, e.g. 'user auth handler'" }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory to search in. Defaults to the current working directory.",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of results to return (default 10)",
  }),
})

export const SemanticSearchTool = Tool.define(
  "semantic-search",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const semanticIndex = yield* SemanticIndex.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { query: string; path?: string; limit?: number }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.query) {
            throw new Error("query is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.query],
            always: ["*"],
            metadata: {
              query: params.query,
              path: params.path,
              limit: params.limit,
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          const info = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: false,
            kind: info?.type === "Directory" ? "directory" : "file",
          })

          if (info?.type !== "Directory") {
            return {
              title: params.query,
              metadata: { matches: 0 },
              output: "Path is not a directory",
            }
          }

          const results = yield* semanticIndex.search(params.query, {
            directory: FSUtil.resolve(requested),
            limit: params.limit ?? 10,
          })
          if (results.length === 0) {
            return {
              title: params.query,
              metadata: { matches: 0 },
              output: "No results found",
            }
          }

          const output = [`Found ${results.length} results for "${params.query}"`, ""]
          for (const result of results) {
            const location = result.symbol
              ? `${result.path}:${result.startLine}-${result.endLine} (${result.symbol})`
              : `${result.path}:${result.startLine}-${result.endLine}`
            output.push(`  ${location} — score ${result.score.toFixed(2)}`)
          }

          return {
            title: params.query,
            metadata: { matches: results.length },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)