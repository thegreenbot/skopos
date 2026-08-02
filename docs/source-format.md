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
model: smart            # tier: smart | fast (or a literal model name)
tools: [read, grep, glob]
summon: One line for the persona roster (optional; falls back to description).
---

System prompt body, tool-agnostic.
```

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

1. the user's own unmanaged files — never touched;
2. templates declared inline in `config.templates` (the skopos-setup interview
   writes these for gaps the shipped defaults don't cover);
3. sources, in config order;
4. the built-in catalog.

Collisions (same skill/agent/template/section name) are skipped with a
warning naming both origins — check `skopos status`.
