# Model routing guide

Skopos never picks which model runs a piece of work — the platform executing
it always does (Claude Code, the Copilot CLI, or whatever a task gets
delegated to). What Skopos can do is **signal** a preference, backed by the
capability registry in `docs/model-capabilities.md`, so that decision is
better informed.

This guide covers two related but distinct things:

1. **Deterministic tier resolution** — how `models.claude`/`models.copilot`
   in config actually pick the model that lands in a rendered agent file.
2. **Preference signaling** — the informational layer on top, for use when
   delegating work rather than rendering a fixed config.

## 1. Deterministic tier resolution (what actually ships)

Each catalog/source agent declares `model: smart` or `model: fast` in its
frontmatter — the author's signal of how much reasoning the work needs. Each
adapter resolves that tier to a literal model name at render time:

```
models.agents.<name>  (per-agent override, wins if set)
  ↓ else
models.<target>.<tier>  (e.g. models.claude.smart)
  ↓ else
the tier string itself, or nothing (copilot has no fallback default)
```

This is what `skopos install`/`update` actually write to
`~/.claude/agents/*.md` or `~/.copilot/agents/*.agent.md`. It's deterministic
by design — Skopos needs to write *something* concrete to disk.

`skopos models check` runs the capability advisor (see
`docs/model-capabilities.md`) against every one of these resolutions and
warns, non-blocking, when a configured tier or override under-serves an
agent's inferred requirements.

## 2. Preference signaling (for delegation)

When Skopos — or an agent it renders — delegates a task to another platform
or agent rather than running inside a fixed, pre-rendered config, there's no
tier map to fall back on. `lib/model-preferences.js` fills that gap:

```
skopos models signal <agent> [--family claude|copilot]
skopos models signal              # every agent in the current plan
```

For one agent, this returns:

```json
{
  "agent": "planner",
  "family": "claude",
  "requirements": { "reasoningDepth": "complex", "toolUse": "basic", "toolCount": 3 },
  "preferredModel": "sonnet",
  "fallback": ["opus", "haiku"],
  "rationale": "'planner' needs complex reasoning and basic tool-use (3 tool(s)); 'sonnet' is the most cost-efficient claude model that meets this.",
  "note": "This is a preference signal, not a directive — the delegating platform makes the final routing decision."
}
```

- **`preferredModel`** — the cheapest model in the family that meets the
  agent's inferred requirements (see `docs/model-capabilities.md` for how
  requirements are derived from `model:` tier and `tools:`).
- **`fallback`** — the remaining models in the family, strongest first, for
  when the preferred model isn't available.
- **`rationale`** — a one-line, human-readable explanation, safe to surface
  directly to a user or pass along in delegation metadata.

### Fallback strategy

If `preferredModel` is unavailable (rate-limited, not enrolled, etc.), work
down `fallback` in order — it's already sorted strongest-first, so the next
entry is the closest capability match rather than a random pick. If no model
in the family meets the requirements at all, `preferredModel` is the
strongest model available and `rationale` says so explicitly.

### Cost vs. capability

`preferredModel` deliberately favors the *cheapest sufficient* model, not the
strongest one — a smart-tier agent with light tool use signals `sonnet`
before `opus` even though both meet its reasoning requirement. Tie-breaking
is capability first, cost second, so signaling never recommends a weaker
model to save money.

## How Skopos preferences influence but don't determine routing

Every signal this module produces carries the same caveat, deliberately kept
in the payload itself rather than only in prose here: it is a preference
signal, not a directive. A delegating platform is free to weigh it against
cost, availability, load, or its own routing policy, and to disregard it
entirely. Skopos's job stops at providing a well-reasoned recommendation.
