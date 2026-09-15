# Custom agents — your own sub-agents on the Skopos roster

skopos ships five functional specialists (`scout`, `planner`, `implementer`,
`reviewer`, `sentinel`). You almost certainly have more of your own: a
`db-migrator` that knows your migration drill, an `api-contract-checker` that
knows your OpenAPI conventions. Those are yours, they encode judgement skopos
doesn't have, and the Skopos persona delegates to them.

Nothing here writes to your agent files. Ever.

## How it works

On every `skopos install` / `skopos update`, skopos scans each enabled target's
agents directory — `~/.claude/agents/`, `~/.copilot/agents/` — plus anything in
`agents.dirs`. Files it doesn't manage itself are read, normalized, and
advertised in the persona block under **Your agents**, alongside the built-in
roster:

```markdown
### Your agents — defined by you, read-only to skopos

| Agent | Role | Model | Tools | Summon when | Origin |
|-------|------|-------|-------|-------------|--------|
| `db-migrator` | deliver | opus | read, edit, shell | A Postgres schema change needs to ship. | ~/.claude/agents |
```

The persona then routes by role and by stated purpose, not by name — the rules
live in the *Routing to custom agents* section of your instruction block. In
short: the narrowest match wins, a purpose-built agent beats the generic
occupant of its role, and because your agents have never read the skopos
handoff contract, Skopos inlines the expected report shape in every brief it
sends one and normalizes whatever comes back.

## What skopos reads

Any frontmatter key below, all optional. The format is the same
[universal agent format](source-format.md#universal-agent-format) sources use —
a superset of what Claude Code and Copilot already write, so an existing agent
file needs no changes.

| Key | Used for | Missing → |
|---|---|---|
| `name` | the name Skopos summons | the filename |
| `description` | roster text, fallback summon criterion | first non-empty body line, else `(no description)` |
| `summon` | the roster's "Summon when" — the routing signal | falls back to `description` |
| `role` | `observe` \| `reason` \| `deliver` \| `review` \| `domain` | `domain` (special-purpose, outside the spine) |
| `model` | shown as-is; skopos never resolves or changes it | shown as `-` |
| `tools` | shown as-is; routing won't send writes to a read-only agent | `inherited` — treated as *unknown*, not unlimited |

Roles are never guessed from your description. An agent with no stated role is
`domain`, and Skopos will not route production edits to something it merely
inferred was an implementer.

## Overlays — telling skopos more, without editing your file

Terse descriptions (`description: helps with migrations`) don't route well.
Rather than edit your agent, record the extra metadata in your own skopos
config:

```bash
skopos agents adopt db-migrator \
  --summon "A Postgres schema change needs to ship, including rollback." \
  --role deliver --tags postgres,migrations --prefer
skopos update
```

That writes to `~/.skopos/config.json` only:

```jsonc
"agents": {
  "overlays": {
    "db-migrator": {
      "summon": "A Postgres schema change needs to ship, including rollback.",
      "role": "deliver",
      "tags": ["postgres", "migrations"],
      "prefer": true,   // wins ties against the built-in for this role (shown as ★)
      "hide": false     // keep it off the roster without deleting anything
    }
  }
}
```

An overlay changes roster metadata and nothing else — the agent's behaviour
lives in its own system prompt, which skopos does not read into itself, alter,
or second-guess.

## Commands

```
skopos agents list [--target claude|copilot] [--json]   the effective roster
skopos agents show <name>                               one agent, plus its overlay
skopos agents adopt <name> [--summon ...] [--role ...] [--tags a,b] [--prefer] [--hide]
skopos agents ignore <name> [--undo]                    keep it off the roster
```

`skopos status` lists your agents and flags a **stale roster** — an agent file
you added since the last `skopos update`, which the installed instruction block
doesn't know about yet.

## Configuration

```jsonc
"agents": {
  "discover": "auto",         // "off" disables scanning entirely
  "dirs": [],                 // extra absolute dirs to scan (dotfiles repo, other tools)
  "exclude": [],              // names kept off the roster
  "onCollision": "user-wins", // user-wins | catalog-wins | error
  "projectScoped": true,      // emit the "check .claude/agents" runtime instruction
  "maxRoster": 40,
  "overlays": {}
}
```

## Name collisions

If you have your own `~/.claude/agents/scout.md`, skopos would otherwise
overwrite it with its own `scout`. `onCollision` decides:

- **`user-wins`** (default) — skopos does not install its `scout` for that
  target, leaves your file exactly as it is, and puts *your* scout on the
  roster. This is what
  [source-format.md § Precedence](source-format.md#precedence) has always
  promised: your own unmanaged files are the highest precedence.
- **`catalog-wins`** — the managed agent is authoritative. Your file is
  snapshotted first (`skopos uninstall` restores it) and a warning names it.
  Enterprise forks that need an approved agent to win set this in
  `config.defaults.json`.
- **`error`** — refuse to install until one of them is renamed. For CI.

A collision in an `agents.dirs` directory is different: no file is at risk
there, so the managed agent keeps the name and yours is left off the roster
with a warning.

One thing collisions do *not* cover: a file skopos wrote and you later edited.
That file is managed — `skopos verify` reports the edit as drift and `update`
overwrites it. To own that name outright, drop the built-in from
`catalog.agents`. skopos will, however, never *delete* a managed file you have
since modified: deselecting content leaves it in place with a warning.

## Project-scoped agents

`~/.claude/agents/` is global; `.claude/agents/` inside a repository is not.
The managed instruction block is global too, so per-project agents can't be
baked into it. Instead, skopos emits a standing instruction to look for them at
the start of substantive work in a repo — same contract, resolved at runtime.
Turn it off with `agents.projectScoped: false`.

## What lands in your context, and a word on trust

Discovered descriptions are rendered into the persona block — the instructions
every session opens with. Two consequences worth knowing:

- **It is bounded.** Descriptions are collapsed to one line and truncated
  (200 chars), the roster is capped (`agents.maxRoster`, 40 by default) with a
  total size budget, and anything over the cap is dropped with a warning. The
  persona block must not become a phone book.
- **It is sanitized.** Comment delimiters, `SKOPOS:` marker tokens, and table
  pipes are neutralized before rendering, so nothing in an agent file can
  sever the `SKOPOS:MANAGED` fence or break the roster table.

This is not a privilege boundary — they're your own files, and skopos assumes
you trust them. But an agent copy-pasted from the internet is a real scenario,
and its description does reach your assistant's instructions. Read what you
adopt.

## What skopos will not do

- Execute, test, or validate your agent's behaviour.
- Rewrite, reformat, or "improve" your agent files.
- Enter them in the lock, prune them, or restore over them.
- Mirror an agent from one tool into another. A `~/.claude/agents/db-migrator.md`
  is advertised to Claude Code only; Copilot sees the agents in its own
  directory. Cross-tool mirroring is deliberately deferred — a derived copy
  raises a staleness and ownership question this design avoids.
