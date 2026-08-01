# skopos

**AI agents are fast at starting. They're slow at finishing.**

Ask an AI CLI to build something non-trivial and it hits 90% quickly — then
stalls. Not because the code is wrong, but because somewhere early on it made
an assumption that seemed safe and never surfaced it. Now you're debugging
the assumption, not the code.

The same pattern shows up everywhere:

- **Config drift** — Claude Code, Cursor, Copilot each have their own config.
  Keeping them consistent by hand doesn't scale.
- **Assumption debt** — Agents assume things about your stack that live only
  in the context window. When the session ends, the assumptions are gone.
- **Lost lessons** — You taught it something. It worked. You closed the
  terminal. Next session, you start over.

**skopos fixes the last mile.**

It gives every AI CLI on your machine a single source of truth: shared
instructions, fenced per-tool config, and a delivery loop that makes
assumptions explicit so they can be corrected before they derail the work.

## The delivery loop

**The reason agentic work stalls at 90% isn't the code — it's an assumption
that was treated as fact.**

skopos introduces a structured delivery loop:

1. **Surface assumptions early** — before an agent writes a line of code,
   the ledger makes its working beliefs explicit.
2. **You correct what's wrong** — fast, before bad assumptions are baked
   into hundreds of lines of generated code.
3. **The correction gets written back** — not into the context window
   (which evaporates), but into your instruction files, which the agent
   reads at the start of every session.

The loop closes. The lesson survives.

```
feature-interview  →  feature-charter  →  feature-plan   →  build  →  feature-retro
 one per stakeholder   criteria +          spike proves      …         grade every
 async, portable       assumption ledger   the riskiest                assumption,
                                          feature-eval                 keep the lesson
                                          how anyone proves it
```

Artifacts live in the project (`docs/skopos/`), not in the tool, so lessons
outlive any one machine or AI CLI. Every session checks
`docs/skopos/GUIDANCE.md` before planning or editing. `feature-status` reports
where everything stands. Full design: [docs/feedback-loop.md](docs/feedback-loop.md).

## Your files stay yours

skopos writes inside clearly marked regions. Everything outside those
regions is untouched — always. You're never locked in.

## Quick start

```bash
git clone git@github.com:thegreenbot/skopos.git
cd skopos
./skopos install            # detects installed tools, renders everything
```

Then open your AI tool, run the **skopos-setup** interview (it gathers your
identity, tone, repo registry, and enterprise sources by conversation and
writes `~/.skopos/config.json`), and finish with:

```bash
./skopos update
```

Restart your AI session — it now opens with the Skopos persona: your identity
and tone, your repository registry with scout fan-out, and a small roster of
functional specialists (`scout`, `planner`, `implementer`, `reviewer`,
`sentinel`).

## What gets installed where

| Content | Destination | Ownership |
|---|---|---|
| Skills (full dirs, `SKILL.md` standard) | `~/.agents/skills/<name>/` | managed |
| Compat skill links (per tool, `compat.skillLinks`) | `~/.claude/skills/`, `~/.copilot/skills/` | managed |
| Agents (universal → per-tool frontmatter) | `~/.claude/agents/<n>.md`, `~/.copilot/agents/<n>.agent.md` | managed |
| Instructions (persona + sections) | fenced block in `~/.claude/CLAUDE.md` and `~/.copilot/copilot-instructions.md` | **fenced** |
| Config, lock, backups, source checkouts | `~/.skopos/` | skopos home |

**Inverted ownership:** you own `~/.claude/CLAUDE.md`; skopos owns only the
`SKOPOS:MANAGED` block inside it. Inside that block, the nested
`SKOPOS:USER-FACTS` fence is yours and survives every `skopos update`.
Uninstall strips the block — it never deletes your file. Files skopos finds
that it doesn't manage (your own agents, your own skills) are surfaced in
`skopos status` and never touched.

## CLI

```
skopos install   [--dry-run] [--force] [--target claude|copilot|all]
skopos update    [--dry-run]      # targets always come from config
skopos verify                     # exit 2 on drift (fenced files: block-only hash)
skopos status
skopos uninstall [--dry-run]      # strip fences, restore snapshots
skopos sources sync|list
skopos config validate
```

## Enterprise onboarding

Your org forks/mirrors this repo, adds a `config.defaults.json` pre-listing
approved content sources, and a new hire does:

```bash
git clone <org-fork> && cd skopos && ./skopos install
```

…then runs the interview. Approved-content repos follow a simple layout
(`skills/`, `agents/`, `instructions/` + `skopos.source.json`) — see
[docs/source-format.md](docs/source-format.md) and
[docs/enterprise.md](docs/enterprise.md). Sources are cloned shallow, pinned
by SHA in the lock, and take precedence over the built-in catalog.

## Design

- **Determinism boundary** (inherited from engsys): the installer owns
  plumbing, the model owns judgement. The interview writes config; the CLI
  renders everything from it. `sources sync` (network) and `update` (render)
  are separate steps, so updates are deterministic and offline-safe.
- **Config is JSON** (`~/.skopos/config.json`) — the primary writer is a
  machine.
- **Every root is env-overridable** (`SKOPOS_HOME`, `SKOPOS_AGENTS_DIR`,
  `SKOPOS_CLAUDE_DIR`, `SKOPOS_COPILOT_DIR`), so the entire lifecycle runs
  against a temp dir in tests.
- **Zero dependencies**, Node ≥ 18. `npm test` runs `node:test`.

Adding a tool = one adapter file + one registry entry:
[docs/adapters.md](docs/adapters.md).
