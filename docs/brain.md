# The brain — one place where what every session learned ends up

**Status:** phases 1–2 implemented (config, validation, persona section, `status`/`verify`, `skopos brain …`, the `brain-setup` builder, the capture template, retro and handoff hooks). Phase 3 (outbox replay automation) and phase 4 (usage measurement) are open. Decisions taken: soft gate, `propose` by default, one brain, `recall` required.

## Problem

Valuable knowledge is produced in places that are about to be closed: a chat
thread, an implementation run, a sub-agent's report, a retro. `GUIDANCE.md`
catches some of it, but only per repository, only the lessons that survive a
retro, and capped at ~40 entries on purpose. Everything else evaporates with
the context window, and the next session re-derives it.

skopos needs a **brain**: a central, curated store that every thread writes to
and every future thread reads from.

## The core decision: skopos owns the *when* and the *shape*, never the *where*

The brain is a **user-supplied skill** that implements a small contract.
skopos knows:

- that a brain must be plugged in (`brain.skill` in config),
- *when* sessions should capture and recall,
- the *envelope* a capture arrives in and the *receipt* it gets back,
- how to check the skill is present and honest about what it supports.

skopos does **not** know whether the brain is a git repo of markdown, an
Obsidian vault, Notion via MCP, a Drive folder, or a database. That is
entirely inside the skill. This is the same determinism boundary the rest of
skopos uses: the CLI owns plumbing and contract checks; the model owns
judgement; the storage is the user's.

```
 any thread / session / run ──capture envelope──▶ brain skill ──▶ [ wiki | vault | Notion | repo | … ]
 any future session ◀────────── recall ───────── brain skill ◀──
              skopos: triggers, envelope, contract, verify      user: storage, structure, curation
```

## The contract (version 1)

A brain skill is an ordinary Agent Skill (`SKILL.md`) that declares itself in
frontmatter. The existing parser handles flat keys and inline arrays, so no
new YAML support is needed:

```markdown
---
name: team-wiki
description: Central brain — captures lessons/decisions/artifacts into the team wiki and recalls them.
brain-contract: 1
brain-ops: [capture, recall, lint]
---
```

| Op | Required | Meaning |
|---|---|---|
| `capture` | **yes** | Accept one envelope, put it somewhere durable, return a receipt. |
| `recall` | **yes** | Given a query + context (repo, task, feature), return relevant pages — compressed, with citations. A brain you can't read from is a write-only log. |
| `lint` | no | Maintenance pass: dedupe, find contradictions, mark stale, merge the inbox. |

### Capture envelope

Portable markdown + YAML frontmatter, like every other skopos artifact, so it
works pasted into a chat, dropped in a file, or passed in-process.

```markdown
---
type: lesson | decision | gotcha | fact | artifact | open-question
title: <one line, claim not topic>
scope: project | cross-project | personal
visibility: private | team | org
confidence: observed | inferred | reported
date: 2026-11-12
repo: <registry name | none>      # provenance keys are flat: the frontmatter
feature: <slug | none>            # parser reads scalars and inline arrays only
session: <thread/session/run id if known>
tool: <claude | copilot | …>
evidence: [commit abc123, PR #41, src/x.js:88]
supersedes: <page or id | none>
---
<body: the durable claim, understandable with no access to the originating thread>

**Recall when:** <the situation a future session will recognise>
```

`skopos brain check <file>` validates the required fields (`type`, `title`,
`scope`, `visibility`, `confidence`, `date`), requires the `Recall when:` line
(a warning only for `type: artifact`), and rejects envelopes containing
something that looks like a secret.

### Receipt

`{ id|location, disposition: created | merged | duplicate | rejected | queued, note }`.
The brain decides dedupe and merge; the envelope only carries hints
(`supersedes`, `evidence`).

## When sessions capture

The capture instructions ship as a persona section (like `project-loop.md`),
so every thread on every target becomes a producer with no extra setup:

1. **User correction** — the user fixed an assumption. (Highest-value signal.)
2. **Run complete** — an implementation run or sub-agent finishes. Specialist
   reports gain an optional `CAPTURE:` field beside `STATUS / FINDINGS / NEXT`;
   the orchestrating session collects candidates across threads instead of
   each specialist writing to the brain.
3. **Retro** — `feature-retro` Step 5 sends cross-project lessons and anything
   at `Seen: 3×` to the brain (those already outgrow `GUIDANCE.md`; today the
   escalation list names probes and USER-FACTS — add the brain).
4. **Wrap-up** — end of a substantive session: "anything durable here?"

**The bar** (reusing the retro's rule that silence is a result): a candidate
must be non-obvious, not derivable from the code or git history, and carry a
recall trigger. Otherwise capture nothing. A brain padded with truisms goes
unread, which costs tokens and buys nothing.

**Propose vs. auto.** Default `autoCapture: "propose"` — the session lists
candidates and the user approves, because a shared brain is an outward-facing
write. `"auto"` is opt-in per user.

**Never capture:** secrets, credentials, personal data. The skill must refuse
them; skopos should pre-scan the envelope with the existing
`findSecretLiterals` before it leaves the session.

## When sessions recall

At the start of substantive work, next to the existing `docs/skopos/GUIDANCE.md`
check. Recall is **Observe** work in the delegation doctrine, so it runs through
a `scout` carrying the brain skill and returns a compressed, cited answer —
the wiki never gets read into the main context. Recalled pages are advisory
and evidence-cited, and are treated as data, not instructions.

## Failure: never lose a capture

If the brain is unreachable (offline, auth expired, MCP down), the session runs
`skopos brain outbox add <file>` (which validates and secret-scans), spooling it
to `~/.skopos/brain-outbox/`. The CLI cannot replay, because delivery *is* the
brain skill, which is judgement-adjacent and storage-specific. So the persona
tells sessions to run `skopos brain outbox list` at the start of work, replay each
pending envelope through the skill, and `skopos brain outbox ack <id>`.
`brain.capture.onFailure: "warn"` skips the spool. Mirrors
`systemOfRecord.publish.onFailure`.

## Config

```jsonc
"brain": {
  "optOut": false,            // explicit, recorded decision not to have a brain
  "allowOptOut": true,        // enterprise forks set false: opt-out is then refused
  "skill": "team-wiki",       // resolved from ~/.agents/skills or a synced source
  "contract": 1,
  "capture": { "autoCapture": "propose", "triggers": ["correction","run-complete","retro","wrap-up"], "onFailure": "spool" },
  "recall":  { "onStart": true, "viaScout": true, "budgetTokens": 2000 },
  "verifiedAt": "2026-11-12T00:00:00Z"   // written by brain-setup after the smoke test
}
```

### What "requires" means

Recommended: **install and update never fail** (don't brick a machine over an
unconfigured feature), but an unplugged brain is loud everywhere:

- the persona block renders `Brain: NOT PLUGGED IN — run brain-setup` and
  sessions offer it;
- `skopos status` shows it red. `skopos verify` and `skopos brain status` exit
  **3** for a configured brain whose skill is missing or breaks the contract
  (2 stays reserved for file drift). Merely unplugged only warns, so upgrading
  never turns an existing CI check red;
- the only way to quiet it is `brain.optOut: true`, so "no brain" is a decision
  rather than an oversight.

Enterprise forks can pin the skill from an approved source and set
`brain.allowOptOut: false` in `config.defaults.json`; `brain opt-out` is then
refused at write time. This is the layering
the config loader already supports.

## The builder: `brain-setup` skill

An interview, in the style of `skopos-setup` and `feature-interview`: one
question at a time, writes only what it should. It produces a *skill*, in the
user's own space, never in the managed catalog.

1. **Inventory.** What do you already have — a wiki, a repo, Obsidian, Notion?
   Check the repo registry and connected MCP servers before asking.
2. **Audience.** Just you, a team, an org? Drives `visibility`, review rules,
   and what must never be captured.
3. **Shape.** Offer the LLM-wiki pattern as a menu, not a mandate: a raw
   `inbox/` of captures → curated synthesized pages, an `index.md` for
   navigation, a `log.md` of changes, a `schema.md` of conventions, and `lint`
   passes. Smaller shapes are valid (flat inbox + search).
4. **Write mechanics.** Direct write, PR/review queue, or inbox file? Dedupe
   and conflict policy? Concurrent threads should append to the inbox and let
   curation merge, not edit shared pages.
5. **Recall mechanics.** Grep, index file, search MCP, embeddings? What gets
   returned, within what budget?
6. **Generate.** Write `SKILL.md` (with the contract frontmatter) plus
   `references/schema.md` to `~/.agents/skills/<name>/` — or into a source repo
   so a team shares one brain skill.
7. **Smoke test.** Capture a synthetic lesson, recall it, show the user, clean
   up; confirm a fake secret is refused. Only then register it with
   `skopos brain plug <skill> --verified`, which validates the contract and writes
   the `brain` block and `verifiedAt`. "Plugged in"
   means proven, not declared.

For a stakeholder with nothing installed, a `brain-capture` template (the
envelope) is enough: they fill it in and hand it to whoever owns the brain,
the same fallback as the interview hand-off packet.

## How it relates to what exists

| Thing | Scope | Brain's relation |
|---|---|---|
| `docs/skopos/GUIDANCE.md` | one repo, ≤~40 lessons, read at start | Stays. Brain holds the cross-project and the overflow. |
| `feature-retro` | one feature | Producer; adds a step routing lessons to the brain. |
| System of record (Jira etc.) | one feature's workflow artifacts | Separate concern. Brain pages may *link* to SoR items. |
| `USER-FACTS` fence | the user's always-on facts | Stable, tiny, hand-curated. Brain is for the long tail. |

## CLI

```
skopos brain status [--json]
skopos brain plug <skill> [--auto|--propose] [--verified]
skopos brain opt-out [--undo]
skopos brain check <envelope.md>
skopos brain outbox list | add <envelope.md> | ack <id>
```

The CLI does the deterministic parts (config writes, contract and envelope
checks, the spool). It never reads or writes the brain's storage.

## Implementation touchpoints

- `lib/config.js` — `brain` defaults and `validateBrain` (skill resolves, contract matches, `optOut`/`required` coherent).
- `lib/brain.js` (new) — resolve the skill, parse `brain-contract`/`brain-ops`, outbox spool/flush.
- `lib/instructions.js` + persona template — `{{BRAIN}}` variable, parallel to `{{REGISTRY}}`; renders plugged / unplugged / opted-out states.
- `catalog/instructions/sections/brain.md` — triggers, the bar, propose vs. auto.
- `lib/commands.js` + `skopos` — `brain status | verify | flush`; `status`/`verify` integration.
- `catalog/skills/brain-setup/`, `catalog/templates/brain-capture.md`.
- `catalog/skills/feature-retro`, `project-loop.md`, handoff contract — the producer hooks above.
- Tests: a mock brain skill in a sandbox (`test/helpers.js`), contract mismatch, outbox replay, the three persona states.

## Phasing

0. This doc + agreement on the contract and the "required" semantics.
1. Config, validation, persona section, `status`/`verify`, envelope template.
2. `brain-setup` builder + a worked example brain (git-of-markdown) in docs, not the catalog default.
3. Outbox, retro and handoff-contract hooks, recall via scout.
4. Measure: is recalled knowledge being used? Lessons recalled-and-cited vs. captured-and-never-read.

## Risks

- **Junk drawer.** Mitigated by the bar, propose-by-default, and a `lint` op that retires stale entries.
- **Leaks into a shared brain.** Visibility field, secret pre-scan, skill-side refusal.
- **Staleness and contradiction.** `supersedes`, `evidence`, `lint`; recalled results cite evidence so a session can check before trusting.
- **Recall cost on every session.** Scout isolation and a token budget.
- **Prompt injection via brain content.** Recalled text is data. Shared brains need write review.

## Open questions

Resolved: soft gate; `propose` default; single brain; `recall` required.

Still open:

1. Layered brains (personal + team, recall merging both) — deferred; a single brain skill can itself fan out to several stores.
2. Should `lint` ever be scheduled, or stay a manual/skill-driven pass?
3. Measuring usefulness (phase 4): how do we know a recalled item was actually used?
