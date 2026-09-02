<p align="center">
  <img src="packages/tui/src/logo.ts" alt="advcode logo" width="0" height="0" style="display:none">
</p>
<p align="center">
<pre>
           ▄
█▀▀█ █▀▀█ █__█   █▀▀▀ █▀▀█ █▀▀█ █▀▀█
█^^█ █__█ █__█   █___ █__█ █__█ █^^^
█__█ ▀▀▀▄ ▀~~▀   ▀▀▀▀ ▀▀▀▀ ▀▀▀▄ ▀▀▀▀
</pre>
</p>

<p align="center"><strong>The AI coding agent that learns from experience.</strong></p>

<p align="center">
  <a href="#installation"><img alt="install" src="https://img.shields.io/badge/install-git-orange?style=flat-square" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

---

**advcode** is a fork of [opencode](https://github.com/anomalyco/opencode) (MIT) that grafts a **persistent brain** onto the best open-source agent CLI: distilled cross-session memory, an autonomous skill-learning loop, and bot mode for named agents that talk to each other.

It keeps everything opencode is great at — providers, models, LSP, plugins, permissions, the TUI — and adds the parts that make an agent *get better over time*.

## What's different

| Feature | What it does |
| ------- | ------------ |
| 🧠 **Memory** | Distilled cross-session memory with a user model. Facts, decisions, preferences, and lessons survive between sessions — stored in SQLite, queryable by the agent. |
| 📖 **Skill learning** | After completing tasks, advcode serializes reusable procedures into `SKILL.md` files it writes itself. Skills are living documents, patched when a better approach is found. |
| 📚 **Learned skills directory** | Learned skills live in `<data>/skills/learned` and are auto-discovered — no config, no restart. |
| 🤖 **Bot mode** | Named agents with personas, avatars, and their own model config. They can post messages to each other — a group chat for your army of agents. |
| 🔪 **Zero setup adoption** | If you already have opencode config, advcode adopts it: your providers, auth, plugins, and models (including big-pickle) work immediately. Its *data* is fully isolated — your real opencode sessions are never touched. |

## Installation

### From source (recommended for now)

```bash
git clone https://github.com/goldenswordgt-ctrl/advcode.git
cd advcode
bun install
bun run --cwd packages/advcode src/index.ts
```

Or build a single-platform binary:

```bash
bun run --cwd packages/advcode script/build.ts --single
# binary at packages/advcode/dist/advcode-<platform>-<arch>/bin/advcode
```

### npm (when published)

```bash
npm i -g advcode@latest   # or bun/pnpm/yarn
```

### Config

- **Config:** adopts `~/.config/opencode` if present, else `~/.config/advcode`
- **Data (sessions, memory DB):** `~/.local/share/advcode` — never touches opencode's data
- **Cache:** `~/.cache/advcode`

## The learning loop

1. You complete a task with the agent.
2. If the task involved enough steps (tool calls, error recovery, corrections), advcode distills the reusable procedure into a skill.
3. The next time a similar task comes up, the skill is loaded automatically and the agent is faster and more accurate.
4. Skills get patched in place when you find a better way, and can be removed or improved.

This is the same "self-improvement loop" idea as Hermes (Nous Research) — an agent that compounds its own competence.

## Bot mode

```ts
// in a plugin or config
BotMode.register({ name: "reviewer", persona: "ruthless code reviewer", avatar: "🦅" })
BotMode.post("reviewer", "channel", "someone pushed to main, go read the diff")
```

Bots are full agents — they can be assigned work, reply into channels, and their messages are stored in the same SQLite DB.

## Memory service

```ts
MemoryV2.remember({ type: "preference", key: "editor", value: "neovim", importance: 0.7 })
MemoryV2.recallTop({ types: ["preference", "decision"], limit: 10 })
MemoryV2.rememberUser({ key: "name", value: "Oliver" })
```

Memories are typed (`user | project | workflow | preference | decision | lesson`), weighted by importance, and independently queryable.

## Roadmap

See [specs/feature-harvest.md](specs/feature-harvest.md) for the full harvest of best-in-class abilities from Hermes, Claude Code, Aider, Codex, Gemini CLI, Cursor, and others. Priorities:

- [ ] Durable background subagents + background bash (fire-and-forget agents)
- [ ] Progressive disclosure for skills (hundreds of skills at ~630 tokens)
- [ ] Hooks with exit-code contract
- [ ] Repo map with graph ranking (Aider-style)
- [ ] Checkpoints/rewind + worktree isolation
- [ ] Sandbox modes (Codex-style OS-level enforcement)
- [ ] Eval harness (SWE-bench + Terminal-Bench)

## Credits

Built on [opencode](https://github.com/anomalyco/opencode) — the open-source AI coding agent, MIT licensed. Feature ideas harvested from [Hermes](https://github.com/NousResearch/hermes-agent), Claude Code, Aider, OpenAI Codex, Gemini CLI, Cursor, and others.

## License

MIT — see [LICENSE](LICENSE). Upstream opencode retains its copyright; advcode is an independent fork.