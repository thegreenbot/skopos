---
name: spec-sheet
description: Generate or regenerate docs/spec-sheet.md — a deep-analysis document of what a repo actually is (architecture, entry points, data model, external dependencies, key flows, conventions) so future sessions and new contributors orient fast without re-reading the codebase. Uses scout fan-out, same doctrine as feature-plan. Use when asked for a spec sheet, to analyze/document a repo's architecture, or to orient on an unfamiliar codebase.
---

# spec-sheet — a durable map of what this repo is

**Model guidance:** Works best with Opus — deep repo analysis across many files, same doctrine as feature-plan. Sonnet is acceptable; Haiku is not recommended. See the skopos repo's docs/model-capabilities.md.

The artifact-producing counterpart to what `scout` does ephemerally: instead
of a report that lives only in one session's context, this is a durable,
regenerable file the project keeps.

**Artifact:** `docs/spec-sheet.md`, in the target repo.
**Input:** a repo — either the current directory, or (if run from the primary
skopos session) a named entry in the repository registry table. Ask which
repo if it isn't obvious from context.

## Phase 1 — observe before reasoning

Do not read the target repo directly in this session. Fan out `scout` agents
in parallel, one per concern, each with the repo path and a single targeted
question:

- **Architecture & entry points** — how is the code organized, and where does
  execution start (CLI, server boot, main, handlers)?
- **Data model** — what are the core domain objects, where are they defined,
  and what persists or migrates?
- **External dependencies & integrations** — what third-party services, APIs,
  or other repos does this talk to, and where is that wired up?
- **Public interfaces** — APIs, events, CLI commands, config surface: what's
  exposed and where is it defined?
- **Build, test & deploy** — install/build/test/lint commands, CI config, how
  it ships.

Add more scouts for repo-specific concerns (e.g. a queue, a plugin system) if
the repo's shape warrants it. Synthesize the reports yourself — if two scouts
disagree or overlap, resolve it before writing; a spec sheet that repeats a
contradiction is worse than a gap marked unknown.

## Rules

- **Evidence or absence.** Every non-obvious claim carries a `file:line` or
  path anchor, same standard as a scout report. Where something genuinely
  isn't in the repo, say so rather than inventing a plausible-sounding row.
- **Orientation, not exhaustive docs.** Write for someone who needs to get
  productive fast, not a full API reference — link to source rather than
  reproducing it.
- **Regeneration is a full overwrite.** `docs/spec-sheet.md` is regenerated
  from scratch each run, the same way `skopos update` re-renders its managed
  files. Don't ask the reader to hand-edit it — if something needs to survive
  a regen, it belongs in a different doc and gets linked from here. Diff
  against git to see what changed between runs.

## Artifact format

Use the `spec-sheet` template (`~/.agents/templates/spec-sheet.md`, shipped
by skopos and shown/overridable during `skopos-setup`) as the skeleton.

## Gate

None — this is read-only analysis and a doc write, safe to run anytime and
re-run as often as the project changes.

## Next

Nothing forced. A fresh spec sheet is a reasonable thing to point a
`feature-plan` or `feature-charter` run at instead of re-scouting from zero,
if one exists and is recent.
