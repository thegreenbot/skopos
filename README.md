# skopos

**Observe. Reason. Deliver.**

One global install that enhances whatever AI CLI is in use — Claude Code,
Copilot CLI, and (via a one-file adapter) whatever comes next. Successor to
[engsys](https://github.com/thegreenbot/engsys): where engsys naturalized one
project at a time, skopos is a single user-level install built on what is
universal — the Agent Skills `SKILL.md` standard and `~/.agents/skills/` —
with thin per-tool adapters for what isn't standardized yet (global
instructions, subagents).

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

## The delivery loop

Agentic delivery reaches 90% fast and stalls there — almost always because an
assumption was wrong, not because the code was. Skopos ships a loop that
treats assumptions as the deliverable:

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
