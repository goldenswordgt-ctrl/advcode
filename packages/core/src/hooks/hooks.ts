export * as Hooks from "./hooks"

import { makeLocationNode } from "../effect/app-node"
import { Config } from "../config"
import { ConfigHooks } from "../config/hooks"
import { Context, Effect, Layer } from "effect"

export interface PreToolUseResult {
  readonly blocked: boolean
  readonly reason?: string
}

export interface Interface {
  readonly preToolUse: (input: {
    readonly tool: string
    readonly input: unknown
    readonly cwd: string
  }) => Effect.Effect<PreToolUseResult>
  readonly postToolUse: (input: {
    readonly tool: string
    readonly input: unknown
    readonly output: unknown
    readonly cwd: string
  }) => Effect.Effect<void>
  readonly postToolBatch: (input: {
    readonly batch: ReadonlyArray<{ readonly tool: string; readonly input: unknown; readonly output: unknown }>
    readonly cwd: string
  }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Hooks") {}

function matchesMatcher(tool: string, matcher: { readonly tool?: string } | undefined): boolean {
  if (!matcher?.tool) return true
  return tool === matcher.tool
}

function runCommand(command: string, input: unknown, cwd: string) {
  return Effect.gen(function* () {
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    if (input !== undefined) {
      yield* Effect.tryPromise(async () => {
        proc.stdin.write(new TextEncoder().encode(JSON.stringify(input)))
        proc.stdin.end()
      })
    }
    const exitCode = yield* Effect.tryPromise(() => proc.exited)
    const stdout = yield* Effect.tryPromise(() => new Response(proc.stdout).text())
    return { exitCode, stdout }
  })
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    const getHooks = Effect.fn("Hooks.getHooks")(function* () {
      const entries = yield* config.entries()
      return entries
        .filter((entry): entry is Config.Document => entry.type === "document")
        .flatMap((entry) => entry.info.hooks ?? [])
    })

    const runPreHooks = Effect.fn("Hooks.runPreHooks")(function* (input: {
      readonly tool: string
      readonly input: unknown
      readonly cwd: string
    }) {
      const hooks = yield* getHooks()
      const matching = hooks.filter(
        (h): h is ConfigHooks.Entry & { event: "pre_tool_use" } =>
          h.event === "pre_tool_use" && matchesMatcher(input.tool, h.matcher),
      )
      if (matching.length === 0) return { blocked: false as const }

      const results = yield* Effect.forEach(
        matching,
        (hook) =>
          runCommand(hook.command, { tool: input.tool, input: input.input }, input.cwd).pipe(
            Effect.map(({ exitCode, stdout }) => ({ exitCode, stdout, command: hook.command })),
            Effect.catch(() => Effect.succeed({ exitCode: 0, stdout: "", command: hook.command })),
          ),
        { concurrency: "unbounded" },
      )

      const blocker = results.find((r) => r.exitCode === 2)
      if (blocker)
        return {
          blocked: true as const,
          reason: blocker.stdout.trim() || `Blocked by hook: ${blocker.command}`,
        }

      return { blocked: false as const }
    })

    const runPostHooks = Effect.fn("Hooks.runPostHooks")(function* (input: {
      readonly tool: string
      readonly input: unknown
      readonly output: unknown
      readonly cwd: string
    }) {
      const hooks = yield* getHooks()
      const matching = hooks.filter(
        (h): h is ConfigHooks.Entry & { event: "post_tool_use" } =>
          h.event === "post_tool_use" && matchesMatcher(input.tool, h.matcher),
      )
      if (matching.length === 0) return

      yield* Effect.forEach(
        matching,
        (hook) =>
          runCommand(hook.command, { tool: input.tool, input: input.input, output: input.output }, input.cwd).pipe(
            Effect.catch(() => Effect.void),
          ),
        { concurrency: "unbounded" },
      )
    })

    const runPostBatchHooks = Effect.fn("Hooks.runPostBatchHooks")(function* (input: {
      readonly batch: ReadonlyArray<{ readonly tool: string; readonly input: unknown; readonly output: unknown }>
      readonly cwd: string
    }) {
      const hooks = yield* getHooks()
      const matching = hooks.filter((h): h is ConfigHooks.Entry & { event: "post_tool_batch" } => h.event === "post_tool_batch")
      if (matching.length === 0) return

      yield* Effect.forEach(
        matching,
        (hook) =>
          runCommand(hook.command, { batch: input.batch }, input.cwd).pipe(Effect.catch(() => Effect.void)),
        { concurrency: "unbounded" },
      )
    })

    return Service.of({
      preToolUse: runPreHooks,
      postToolUse: runPostHooks,
      postToolBatch: runPostBatchHooks,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node],
})
