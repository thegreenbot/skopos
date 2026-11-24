# Source format

A skopos *source* is a git repository of approved content — the unit of
enterprise onboarding. Configure it in `~/.skopos/config.json`:

```jsonc
{
  "sources": [
    { "name": "acme-approved", "url": "https://ghe.example/acme/acme-skopos-source.git", "ref": "main" }
  ]
}
```

`skopos sources sync` shallow-clones each source into
`~/.skopos/sources/<name>/`, checks out `ref`, and pins the SHA in
`~/.skopos/skopos.lock`. `skopos update` reads only the on-disk checkouts —
sync (network) and render (deterministic) are separate steps. A failed sync
keeps the prior checkout and warns; it never breaks `update`.

## Layout

```
acme-skopos-source/
├── skopos.source.json        # metadata only (nothing is executed)
├── skills/<name>/SKILL.md    # standard Agent Skills format, full dirs copied
│   └── references/…          # any supporting files ship with the skill
├── agents/<name>.md          # universal agent format (below)
├── templates/<name>.md       # workflow-artifact templates (below)
└── instructions/*.md         # optional sections appended to the managed block
```

### Nested skills (`skillsPaths`)

By default skills are read only from `skills/<name>/SKILL.md` at the source
root. A repo that keeps them elsewhere — [adobe/skills](https://github.com/adobe/skills)
nests ~200 under `plugins/<product>/[<sub>/]skills/<name>/SKILL.md` — opts in
on its config entry:

```json
{
  "name": "adobe-skills",
  "url": "https://github.com/adobe/skills.git",
  "ref": "main",
  "skillsPaths": ["plugins/aem/**/skills", "plugins/app-builder/skills"]
}
```

Each entry names directories that *contain* skill directories, the role the
root `skills/` plays by default. Every `<match>/<name>/SKILL.md` is rendered to
`~/.agents/skills/<name>/` as a full directory (references, sub-folders and
all). With `skillsPaths` set, the root `skills/` is **not** read unless listed
(add `"skills"`); `agents/`, `templates/` and `instructions/` are unaffected.

Pattern syntax, always forward slashes and relative to the source root:

| Token | Matches |
|---|---|
| `*` | any characters within one path segment |
| `?` | one character within one path segment |
| `**` | zero or more whole segments (`plugins/aem/**/skills` matches `plugins/aem/skills` and `plugins/aem/a/b/skills`) |

Wildcards never match dot-directories (`.git`, `.github`, …), symlinked
directories are never followed, and every match must resolve inside the
checkout. Discovery is a read-only directory walk — nothing in a source is
executed, and it runs at render time against the synced checkout, so `update`
stays offline and deterministic.

`skopos config validate` rejects a `skillsPaths` that isn't a non-empty array
of strings, or that holds an absolute path, a backslash, or a `..` segment.
A pattern that matches no skill is a warning.

**Duplicate names inside one source** are resolved by sorted relative path
(code-point order, the same on every OS): the first wins and each later one is
skipped with a warning naming both paths. Pattern order does not matter. For
adobe/skills, `plugins/aem/6.5-lts/…` sorts before `plugins/aem/cloud-service/…`,
so where both define a skill the 6.5 LTS one is kept. To prefer Cloud
Service, narrow the patterns (e.g. list `plugins/aem/cloud-service/skills` and
the `edge-delivery-services*` paths instead of `plugins/aem/**/skills`).
Collisions *between* sources follow the normal precedence rules below.

### Empty sources

A synced source that contributes no skills, agents or templates triggers a
warning on `update` and `status` (a source laid out differently than expected
used to be a silent no-op).

### skopos.source.json

```json
{
  "name": "acme-approved",
  "version": "1.0.0",
  "minSkoposVersion": "0.1.0",
  "description": "ACME's approved skills, agents and instructions."
}
```

### Universal agent format

One markdown file per agent. Frontmatter is the universal schema; adapters
project it per tool (Claude Code drops `tools:` and resolves `model:` tiers;
Copilot keeps `tools:` and resolves via `models.copilot` or strips).

```markdown
---
name: auditor
description: What it does — also used as the roster's summon criterion.
role: review            # observe | reason | deliver | review | domain (optional)
model: smart            # tier: smart | fast (or a literal model name)
tools: [read, grep, glob]
summon: One line for the persona roster (optional; falls back to description).
---

System prompt body, tool-agnostic.
```

This is also the format skopos *reads* from the user's own agent directories.
Agents found there are advertised in the roster and never written — see
[docs/custom-agents.md](custom-agents.md).

### Templates

One markdown file per workflow-artifact template — the skeleton a skill (or
the user directly) fills in when producing a PR description, code review
report, spec sheet, etc. Frontmatter carries `name` (required) and an
optional `description`; the body is the template itself, installed verbatim
to `~/.agents/templates/<name>.md`.

```markdown
---
name: adr
description: Architecture decision record.
---

# ADR-<n>: <title>
Status: proposed | accepted | superseded · Date: <YYYY-MM-DD>

## Context
## Decision
## Consequences
```

### Instruction sections

Every `instructions/*.md` is appended (alphabetically, deduped by filename
across sources) to the managed instruction block after the persona. Keep
sections short — they live in every session's context.

## Precedence

Highest first:

1. the user's own unmanaged files — never touched. A user agent whose name the
   catalog also claims is resolved by `agents.onCollision`, which defaults to
   `user-wins`: the managed agent is skipped for that target and the user's
   file is left exactly as it is. Enterprise forks that need the approved agent
   to win set `agents.onCollision: "catalog-wins"` in `config.defaults.json`;
2. templates declared inline in `config.templates` (the skopos-setup interview
   writes these for gaps the shipped defaults don't cover);
3. sources, in config order;
4. the built-in catalog.

Collisions (same skill/agent/template/section name) are skipped with a
warning naming both origins — check `skopos status`.
