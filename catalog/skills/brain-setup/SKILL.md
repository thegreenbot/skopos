---
name: brain-setup
description: Walk the user through building the skill that plugs a central brain into skopos — a place where lessons, decisions and artifacts from every thread, session and run are captured and later recalled, in an LLM-wiki style. Interviews about storage, audience, structure and mechanics, generates the brain skill, smoke-tests it, and registers it. Use when skopos reports the brain is NOT PLUGGED IN or BROKEN, or when the user wants to create, change or repair their brain.
---

# brain-setup — build the skill that is your brain

**Model guidance:** Works well with Sonnet — conversational design plus careful file generation. Haiku may skip the smoke test; don't let it. See the skopos repo's docs/model-capabilities.md.

skopos is deliberately blind to *where* knowledge is kept. Its job is the
contract: when to capture, what a capture looks like, how recall behaves. Your
job here is to help the user build **a skill that implements that contract
against whatever storage they already have**, then prove it works.

**You write exactly two things:** the brain skill directory, and (through the
CLI) the `brain` block of `~/.skopos/config.json`. Never write into
`~/.claude`, `~/.copilot`, or edit another managed skill.

Read `references/contract.md` first. It is the contract; this file is the
interview.

## Ground rules

- One question at a time, short, concrete. Offer examples drawn from what you
  find, not abstractions.
- Look before asking. Run `skopos brain status`; check `skopos status` and the
  repo registry; see which MCP connectors and CLIs are available. Do not ask a
  question the machine can answer.
- If a brain skill is already configured, this is a revision. Load it, show
  what it does today, and change only what the user asks.
- Agnostic means agnostic. Never push a storage backend. Offer the user's
  existing tools first, a git repo of markdown as the sensible default second.
- Show every file before writing it. Get a yes.

## Phase 1 — Inventory

What do they already have? A team wiki, a repo of notes, an Obsidian vault,
Notion, Confluence, a Drive folder, nothing? Which of those can this session
actually reach (MCP servers, `gh`, local paths)? A brain you cannot write to
from a session is a brain that will never be written to.

Settle: **the storage**, and **how a session authenticates to it**. Never put
a credential in the skill; reference an env var or an MCP connector by name.

## Phase 2 — Audience and sensitivity

Just them, a team, or the org? Then:

- the default `visibility` for captures (`private | team | org`);
- whether writes need review (a PR, a queue) before they are visible;
- what must **never** be captured here — customer data, secrets, unreleased
  plans. These become refusal rules inside the skill, in addition to skopos's
  own secret scan.

A shared brain is an outward-facing write. Default `autoCapture` to `propose`
(the session shows candidates, the user approves) unless they are the only
reader *and* ask for `auto`.

## Phase 3 — Shape

Offer the **LLM-wiki pattern** as a menu — the user picks, adapts, or declines:

| Piece | Purpose |
|---|---|
| `inbox/` — raw captures, one file per envelope | Append-only, so many concurrent threads never collide. |
| Curated pages — synthesized from the inbox, one topic each | What recall actually reads. Claims, evidence, triggers. |
| `index.md` — a catalog of pages, one line each | Cheap first-hop for recall; avoids reading everything. |
| `log.md` — dated record of ingests and changes | Lets a curator or a human see what moved. |
| `schema.md` — the conventions, in words | So any session (or person) maintains it the same way. |
| `lint` — periodic pass | Dedupe, resolve contradictions, mark stale, retire the obsolete. |

Smaller shapes are legitimate: a flat inbox plus search; a single running
document; a database table. Pick the smallest that keeps recall useful.
Resist structure the user will not maintain.

## Phase 4 — Capture mechanics

Decide, and write into the skill:

1. **Landing.** Direct write, a PR/review queue, or an inbox file?
2. **Dedupe and merge.** On a near-duplicate: merge into the existing page,
   report `duplicate`, or just add to the inbox for the curator? How does
   `supersedes` get honored?
3. **Disposition.** The skill must return a receipt:
   `created | merged | duplicate | rejected | queued`, plus where it landed.
4. **Refusals.** What it rejects (secrets, out-of-scope visibility, empty
   triggers) and says so.
5. **Failure.** If storage is unreachable, the skill says so plainly and does
   **not** pretend success — skopos then spools the envelope with
   `skopos brain outbox add`.

## Phase 5 — Recall mechanics

Decide how a query + context (repo, task, feature slug) finds pages: read the
index then open pages, grep, a search MCP, embeddings. And what comes back:
**a compressed, cited answer** — a handful of items, each with its trigger and
evidence — never raw pages. The caller has a token budget
(`brain.recall.budgetTokens`, default 2000).

## Phase 6 — Generate the skill

Write to `~/.agents/skills/<name>/` (or into a source repo if the team will
share one brain skill — then the skill name is what matters). Ask for the name;
suggest `brain` or `<team>-brain`.

```
<name>/
├── SKILL.md              # frontmatter with the contract + procedures
└── references/
    ├── schema.md         # the conventions from phases 3-4, in plain words
    └── envelope.md       # copy of the capture envelope, for a self-contained skill
```

`SKILL.md` **must** open with frontmatter declaring the contract — `skopos`
refuses a skill without it:

```markdown
---
name: <name>
description: <one sentence: what this brain is, where it lives, what it captures and recalls>
brain-contract: 1
brain-ops: [capture, recall]      # add lint if you wrote one
---
```

The body has one section per op — `## capture`, `## recall`, and `## lint` if
present — each a numbered procedure a model can follow cold: inputs, steps,
what to return. Include the refusals from phase 2 and the failure behavior from
phase 4. Keep it short; it is read on every capture.

## Phase 7 — Smoke test (not optional)

"Plugged in" means proven. Run this *before* registering:

1. Build a throwaway envelope from `~/.agents/templates/brain-capture.md`,
   title prefixed `[smoke-test]`, with a real-looking trigger. Run
   `skopos brain check <file>`.
2. Follow the skill's `capture` procedure. Show the receipt.
3. Follow its `recall` procedure with a query the envelope should answer. The
   envelope must come back, cited.
4. Delete the throwaway item from the brain. Confirm it is gone.
5. Capture a second throwaway containing a fake secret (`password=hunter2hunter2`).
   It must be refused. Delete if it was not.

If any step fails, fix the skill and rerun from step 1. Do not register a
brain that failed its own smoke test.

## Phase 8 — Register

On success, through the CLI (it validates the contract and writes the config):

```bash
skopos brain plug <name> --propose --verified     # or --auto
skopos update
```

Then tell the user to restart their AI session so the new instructions load.
Summarize in four lines: where it lives, what a session will capture and when,
how recall works, and how to repair it (`skopos brain status`).

If the user decides they do not want a brain after all, `skopos brain opt-out`
records that as a decision. Do not argue; do not raise it again.

## What not to do

- Do not invent a storage backend the user did not choose.
- Do not capture anything yourself during setup beyond the smoke tests.
- Do not store credentials in the skill, the config, or a capture.
- Do not mark `--verified` without having actually run phase 7.
