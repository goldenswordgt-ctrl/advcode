# advcode Feature Harvest — Best-in-Class Abilities Across AI Coding CLIs

**Date:** 2026-09-02 · **Researcher:** v-search specialist · **Status:** living roadmap input

We are building **advcode** (fork of sst/opencode dev ~1.18.x). Round 1 already adds: distilled cross-session memory, autonomous skill-learning loop, bot mode. This doc harvests the best abilities from every major CLI so advcode never invents a worse wheel.

---

## 1. Feature Harvest Table

| # | Feature | Source CLI | Why best-in-class | Effort | Priority |
|---|---------|-----------|-------------------|--------|----------|
| 1 | **Self-improvement loop** (create skills from completed tasks, patch during use) | Hermes | The core differentiator — agent gets measurably faster over time; 40% faster with 20+ skills (Nous benchmark) | L | **P0** |
| 2 | **Background skill curator** (weekly grade/prune/consolidate skills) | Hermes | Prevents skill library rot; keeps retrieval precision high | M | **P0** |
| 3 | **Progressive disclosure for skills** (index ~630 tokens, load full SKILL.md on demand) | Hermes | Skills cost ~0 tokens until used; scales to hundreds of skills | M | **P0** |
| 4 | **`/learn` from sources** (turn docs/books/specs into knowledge-base skills with references/) | Hermes | Converts reference material into reusable skills without hand-writing | M | P1 |
| 5 | **Background self-review** (every N turns, reflect → update memory/skills) | Hermes | Continuous learning without blocking the main loop | M | **P0** |
| 6 | **Multi-pass dialectic memory** (cold/warm prompts, audit, reconcile) | Hermes/Honcho | Deep user modeling beyond key-value facts | L | P1 |
| 7 | **Memory write-approval gate** | Hermes | Safety on the self-improvement loop (small models misjudge) | S | P1 |
| 8 | **Durable background subagents** (fire-and-forget, completion callback) | OpenCode v2 / Claude Code | Unlocks parallel-agent workflows; main agent keeps working | L | **P0** |
| 9 | **Background bash jobs** (async, durable status, cancel/continue) | OpenCode v2 / Claude Code | Long-running commands don't block the loop | M | **P0** |
| 10 | **Hooks with exit-code contract** (PreToolUse/PostToolUse, block via exit 2) | Claude Code | Deterministic policy — fires whether or not the model thinks to | M | **P0** |
| 11 | **Agent-based hooks** (spawn subagent to verify before deciding) | Claude Code | Verification beyond single LLM call | M | P2 |
| 12 | **Async/HTTP/MCP-tool hooks** | Claude Code | Hooks as first-class integration surface | M | P2 |
| 13 | **Subagent memory scope** (user/project/local persistent dir) | Claude Code | Cross-session learning per subagent | M | P1 |
| 14 | **Auto memory** (build commands, debugging insights remembered) | Claude Code | Zero-effort memory accumulation | M | P1 |
| 15 | **Checkpoints / rewind** (restore codebase to pre-message state) | Claude Code / Zed | Undo at the agent level, not just git | M | **P0** |
| 16 | **Agent teams** (coordinated sessions that message each other) | Claude Code | Multi-agent orchestration beyond subagents | L | P1 |
| 17 | **Cross-session messaging** | Claude Code | Sessions pass messages to each other | L | P2 |
| 18 | **Worktree isolation** (per-agent git worktrees) | Claude Code / Cursor | Parallel agents don't stomp each other's files | M | **P0** |
| 19 | **Repo map with graph ranking** (token-budgeted, dependency-graph relevance) | Aider | Best-in-class codebase context; 1k-token default | M | **P0** |
| 20 | **Auto-commit with weak-model commit messages** | Aider | Clean git history, /undo works, Conventional Commits | S | P1 |
| 21 | **Watch mode** (AI comments in files become instructions) | Aider | Edit-in-IDE → agent acts | S | P2 |
| 22 | **Architect/Code mode split** | Aider / Roo | Plan-then-implement separation | S | P1 |
| 23 | **Sandbox modes** (read-only / workspace-write / full) | Codex | OS-level enforcement (Seatbelt/Landlock/seccomp/AppContainer) | L | **P0** |
| 24 | **Auto-review reviewer agent** (separate agent approves boundary-crossing) | Codex | Reduces approval fatigue without weakening the boundary | L | P1 |
| 25 | **Prefix rules for shell commands** (allow/deny by command pattern) | Codex | Granular command-level permission | M | P1 |
| 26 | **GitHub Actions integration** (codex-action, autofix PRs, [skip ci] loop guard) | Codex | CI/CD agent workhorse | M | P2 |
| 27 | **OpenTelemetry agent-native logs** | Codex | Auditability / security telemetry | M | P2 |
| 28 | **1M-token context** | Gemini CLI | Long-context codebase understanding | S (config) | P1 |
| 29 | **Checkpointing conversations** (save/resume) | Gemini CLI | Session continuity | M | P1 |
| 30 | **Parallel subagents** (multiple instances at once) | Gemini CLI | Speed via fan-out | M | P1 |
| 31 | **JIT context discovery** | Gemini CLI | Load context only when needed | M | P2 |
| 32 | **Model routing / fallback resilience** | Gemini CLI / Hermes | Provider failover | M | P1 |
| 33 | **Custom modes** (slug/roleDefinition/groups) | Roo Code | Reusable specialized personas | S | **P0** (have agents; extend) |
| 34 | **Memory Bank** (projectbrief/productContext/activeContext/systemPatterns/techContext/progress) | Cline / Roo | Structured project memory across sessions | M | **P0** |
| 35 | **Plan/Act split** | Cline | Review before execute | S | P1 |
| 36 | **MCP-first design** (70+ extensions, tool creation on demand) | Goose / Cline | Broadest MCP surface; neutral governance | M | P1 |
| 37 | **ACP (Agent Client Protocol)** | Zed / Goose / Gemini | Run any agent in any editor; OpenCode already has ACP | M | P1 |
| 38 | **Agent Panel + Terminal Threads** | Zed | Parallel agent sessions in one surface | M | P2 |
| 39 | **Token usage display + auto-compaction** | Zed | Context budget visibility | S | P1 |
| 40 | **Parallel agents in git worktrees** (up to 8) | Cursor | Fan-out refactors safely | M | P1 |
| 41 | **Background agents in cloud sandboxes** | Cursor / Devin | Async long-running work | L | P2 |
| 42 | **Bugbot-style PR review** | Cursor | Agentic code review aware of conventions | L | P2 |
| 43 | **Agent Command Center / Kanban board** | Devin | Manage dozens of parallel agents | L | P2 |
| 44 | **Spaces / shared repo index** (auto-index, shared across agents) | Devin | No per-task context setup; identical understanding | L | P1 |
| 45 | **DeepWiki-style auto-generated wiki** | Devin | New agents start with context, not cold crawl | L | P2 |
| 46 | **SWE-bench / Terminal-Bench harness** (eval loop) | Open-source | Measure agent quality; gate changes | M | **P0** |
| 47 | **Evolutionary skill optimization** (DSPy+GEPA, mutate→eval→select) | Hermes (hermes-forge) | Auto-improve skills/prompts from usage data | L | P2 |
| 48 | **Trajectory export / RL training** (Atropos) | Hermes | Research-ready; train next-gen models | L | P2 |
| 49 | **Prompt caching preservation** (inject memory into user message, not system prompt) | Hermes | Cost control on long sessions | S | **P0** |
| 50 | **Hot-reloadable services** (granular events, no teardown) | OpenCode v2 | Config/model changes without restart | M | P1 |

---

## 2. OpenCode v2 (fork-relevant!)

The dev branch we forked is actively being rebuilt into v2 (`specs/v2/todo.md` — working doc, not shipped product; opencode.ai/v2/docs exist, "2.0 in beta"):

- **Server: Hono → Effect HttpApi** (PR #25667 merged, ~9k LOC deleted; PR #24853 backend). SSE event schemas, aggregate route groups, generated SDK.
- **New Data Mode (Dax)**: durably models subagents, skill invocations, shell commands.
- **Reworked agent loop (Kit)**: Effect-native `SessionExecution.resume()`, durable V2 projections (text, reasoning, provider failures, tool calls, tool results), scoped `ToolRegistry`, permission-checked built-ins, `session_input` inbox (steer/queue), concurrent resumes join one process-local run.
- **BackgroundJob service**: background bash jobs + background agent dispatch, durable status, completion delivery, cancellation/continuation. ← the fire-and-forget subagent.
- **Deferred durable continuation recovery**: post-crash recovery, retry/abandon, retry budget/backoff, cluster fencing.
- **Plugin API redesign**: immer drafts, global `opencode` instance with `opencode.session.prompt()` / `opencode.tool.register()`.
- **EventV2 core**: sync-versioned persistence, transactional sequencing, pub/sub, replay, replay-owner claims.
- **Everything hot-reloadable**, **auth system** (any auth kind, not just providers), **Model Database** (dynamic registration; providers register as plugins).
- **A2A remote agents** — issue #3023, PR #10308 ("remote subagent protocol"), PR #10452.
- **Async subagents** — issue #5887 (fire-and-forget + completion callback), PR #13261.
- **Experimental flags on dev**: `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, `_EVENT_SYSTEM`, `_NATIVE_LLM`, `_PARALLEL`, `_SCOUT`, `_SPACES`.

**Fork implication:** build our memory/skill/bot layers on durable V2 projections + EventV2, not the legacy bus. Don't over-invest in the current plugin API (it's being redesigned).

---

## 3. Hermes Deep-Dive (beyond memory/learning/bots)

Eight temporal loops at different timescales; slower loops manage and improve faster ones ("persistent brain"):

1. **L1 Execution loop** — send → tool call → append → continue.
2. **L2 Goal pursuit** (`/goal`) — judge checks acceptance criteria each turn; persists across sessions (`/goal resume`); 20-turn budget.
3. **L3 Post-task self-improvement** — tasks with ≥5 tool calls / error recovery / user corrections → serialize reusable procedure as SKILL.md into `~/.hermes/skills/`. Skills are living documents, patched via targeted string replacement.
4. **L4 Skill Curator** (weekly) — grades, consolidates overlapping, prunes obsolete.
5. **L5 Memory loop** — MEMORY.md + USER.md injected every session.
6. **L6 Kanban dispatcher** — parallel workstreams, `kill(pid,0)` crash detection, circuit breaker.
7. **L7 Context compression** — two-threshold compressor.
8. **L8 Sub-agent spawning** — each sub-agent runs own L1/L3/L5; skills shared back to parent.

Unique mechanics to steal:
- **Progressive disclosure** — skills_list (~3k tokens) → skill_view on demand → skill_view(file_path).
- **`/learn`** — point at anything, agent gathers material, authors standards-compliant skill; large sources → lean SKILL.md + distilled files under `references/`; re-run folds in.
- **Skill bundles**, **Skills Hub / taps** (registries, security scanner on install).
- **`skill_manage` tool** — create/patch/edit/delete/write_file/remove_file.
- **Write-approval gate** — stage skill writes for human review.
- **Memory providers (8)** — Honcho (dialectic), OpenViking, Mem0, Hindsight (knowledge graph + reflect), Holographic (HRR algebra + trust), RetainDB (delta compression), ByteRover, Supermemory, Memori. The plugin architecture is the lesson — swappable memory backends.
- **Honcho dialectic** — multi-pass reasoning about the user (cold/warm query, self-audit, reconciliation). **Key cost trick: inject memory into the user message, not the system prompt, to preserve prompt caching.**
- **Evolutionary self-improvement** (hermes-forge) — DSPy+GEPA to evolve skills/prompts from usage data.
- **Bot Mode refinements** — peer roster in system prompt, fire-and-forget message delivery with attribution, @mentions, cron routines.

---

## 4. Top 10 Recommendations

1. **Durable background subagents + background bash (P0)** — OpenCode v2/Claude Code. Biggest parallel-agent unlock; already on upstream roadmap.
2. **Self-improvement closed loop (P0)** — Hermes. Post-task serialization + in-use patching + background curator. This is our moat.
3. **Progressive disclosure for skills (P0)** — Hermes. Hundreds of skills at ~630 tokens.
4. **Hooks with exit-code contract (P0)** — Claude Code. Deterministic policy layer.
5. **Checkpoints/rewind + worktree isolation (P0)** — Claude Code/Cursor.
6. **Repo map with graph ranking (P0)** — Aider. Pairs with our LSP integration.
7. **Sandbox modes (P0)** — Codex. OS-level enforcement; permission system is prompt-level today.
8. **Eval harness (SWE-bench + Terminal-Bench) (P0)** — gate feature changes on measured quality.
9. **Memory Bank + prompt-caching-aware injection (P0)** — Cline/Roo + Hermes. Structured project memory.
10. **Track OpenCode v2 rebuild (P0)** — build on EventV2/durable projections, not legacy bus. Don't over-invest in current plugin API.

---

## 5. Sources

- OpenCode: opencode.ai/docs (agents/skills/plugins/permissions/server/web/cli), `specs/v2/todo.md` (dev), PR #25667, #24853, issue #3023 / PR #10308 / #10452 (A2A), issue #5887 / PR #13261 (async subagents), deepwiki.com/sst/opencode, opencode.ai/v2/docs
- Hermes: hermes-agent.nousresearch.com/docs, github.com/NousResearch/hermes-agent (issue #337), honcho.dev/docs/v3/guides/integrations/hermes, luonghongthuan.com 8-loop architecture analysis
- Claude Code: code.claude.com/docs (hooks, subagents), cesarayala.dev
- Aider: aider.chat/docs/repomap.html, /git.html, /config/options.html
- Codex: github.com/openai/codex/docs/sandbox.md, developers.openai.com/codex (auto-review), openai.com/index/running-codex-safely
- Gemini CLI: github.com/google-gemini/gemini-cli, developers.googleblog.com/en/subagents-have-arrived-in-gemini-cli
- Cursor/Devin/Windsurf: developersdigest, apidog, getbind, vibecoding blogs
- Goose/Zed/ACP: zed.dev/docs/ai/agent-panel.html, zed.dev/blog/terminal-threads, zed.dev/acp/agent/goose, morphllm.com/agent-client-protocol, github.com/block/goose
- Roo/Cline: docs.cline.bot/best-practices/memory-bank, GreatScottyMac/roo-code-memory-bank
- Evals: swebench.com/verified, tbench.ai, arxiv 2601.11868, presenc.ai research

**Honesty caveats:** vendor self-reports directional only (Hermes "40% faster", Cursor/Devin SWE-bench claims — 10-20pt harness swings on identical weights exist). v2 spec is a working todo, not shipped. "OpenCode 2" is a rebuild phase, not a marketing launch — real signal is `specs/v2/todo.md` + merged HttpApi PRs.