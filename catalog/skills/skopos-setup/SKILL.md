---
name: skopos-setup
description: Onboarding interview for skopos. Gathers identity, tone, repo registry, enterprise sources, targets and model tiers by conversation, then writes ~/.skopos/config.json and re-renders. Run once after installing skopos, or any time to revise the config.
---

# skopos-setup — the onboarding interview

You are conducting the skopos onboarding interview. Your job is judgement —
gathering who the user is and how they work. The deterministic CLI owns all
plumbing: **you write exactly one file, `~/.skopos/config.json`** (respect
`SKOPOS_HOME` if set). Never write into `~/.claude`, `~/.copilot`, or
`~/.agents` — `skopos update` renders those.

## Ground rules

- One question at a time. Short questions, concrete examples.
- If a config already exists, load it first and treat this as a revision:
  confirm existing values instead of re-asking from scratch.
- Before each write: show the change, get a yes.
- Convert everything to the config schema below — no extra keys.

## Config schema (version 1)

```json
{
  "version": 1,
  "identity": { "name": "", "role": "", "context": "" },
  "tone":     { "style": "", "verbosity": "terse|normal|verbose" },
  "repos":    [ { "name": "", "path": "/abs/path", "description": "", "remote": "" } ],
  "sources":  [ { "name": "", "url": "", "ref": "main" } ],
  "targets":  { "claude": true, "copilot": false },
  "models":   { "claude": { "smart": "opus", "fast": "sonnet" }, "copilot": {}, "agents": {} },
  "catalog":  { "skills": "all", "agents": "all", "templates": "all" },
  "compat":   { "skillLinks": "auto" },
  "templates": [ { "name": "", "description": "", "content": "" } ]
}
```

## Interview phases

**1. Identity.** Name, role, and one or two sentences of working context
(domain, team, what they spend their days on). This seeds the persona block.

**2. Tone.** Offer three concrete style samples and let them pick or dictate
their own. Example samples to offer:
- *direct, dry, no filler* — "Done. Two files changed. Tests pass."
- *warm but efficient* — "Nice — that worked. Two files changed, tests pass."
- *thorough narrator* — "I changed X because Y; here's what happened…"
Also ask verbosity: `terse` / `normal` / `verbose`.

**3. Repo registry.** For each repo the user works in: name, absolute path,
one-line description, optional remote URL. Use literal absolute paths — never
env vars. Verify each path exists with `ls` before accepting it. Offer to:
- scan `~/Projects` (or wherever they keep code) and propose entries;
- import `*_REPOSITORY` environment variables from their shell rc files as a
  bootstrap convenience (resolving them to literal paths).

**4. Enterprise sources.** Git URLs of approved-content repos, if any. Sanity-
check the URL shape only — do **not** clone anything; `skopos sources sync`
does that later.

**5. Targets & models.** Which tools to enhance (claude / copilot — default to
what's detected on the machine) and, only if the user cares, the model tier
mapping (which model is "smart", which is "fast") per tool.

**6. Templates.** skopos ships default templates for the workflow artifacts it
produces — PR descriptions, code review reports, spec sheets, and the
feature-charter / feature-plan / feature-eval / feature-retro artifacts
(`catalog/templates/*.md`, installed to `~/.agents/templates/`). List what's
shipped and ask if any should be turned off (`catalog.templates`, same
`"all"` | array-of-names shape as `catalog.skills`). Then ask explicitly
whether any workflow artifact they care about is missing from that set — e.g.
incident postmortems, ADRs, release notes. If so, get its name and either the
full Markdown skeleton or enough description that you can draft one, show it
back for approval, and add it to `templates` in the config (each entry:
`name`, `description`, `content`). A `templates` entry with the same `name`
as a shipped default overrides it.

**7. Write & render.** Show the final JSON. On approval:
1. Write `~/.skopos/config.json`.
2. Run `skopos config validate` — fix and re-show if it fails.
3. Run `skopos sources sync` if any sources were configured.
4. Run `skopos update`.
5. Tell the user to restart their AI session so the new instructions load.
