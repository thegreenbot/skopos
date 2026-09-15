# Model routing guide

Model routing in Skopos is two layers, and conflating them is the fastest way
to misunderstand what it does:

1. **Directive resolution** — `models.claude` / `models.copilot` /
   `models.agents` in config decide the literal model written into every
   rendered agent file. Skopos makes this call, and the host CLI honors it.
2. **Preference signaling** — the informational layer on top, for delegation
   that has no rendered config to read. Skopos recommends; whoever is routing
   decides.

The only thing Skopos genuinely cannot direct is the **primary session's own
model**. Skopos is a persona layer inside a session the host already started,
so that model was chosen before any Skopos instruction was read.

## 1. Directive resolution (what actually ships)

Each catalog/source agent declares `model: smart` or `model: fast` in its
frontmatter — the author's signal of how much reasoning the work needs. At
render time that tier resolves to a literal model name (`lib/model-routing.js`,
shared by both adapters):

```
models.agents.<name>.<target>   target-specific override
  ↓ else
models.agents.<name>            bare model name — only when the model's family
                                matches the target (see below)
  ↓ else
models.<target>.<tier>          e.g. models.claude.smart
  ↓ else
the tier string itself, or nothing (copilot strips the key instead)
```

So a per-agent override takes either shape:

```json
{
  "models": {
    "claude":  { "smart": "opus",  "fast": "sonnet" },
    "copilot": { "smart": "gpt-5", "fast": "gpt-5-mini" },
    "agents": {
      "sentinel":    "opus",
      "implementer": { "claude": "sonnet", "copilot": "gpt-5" },
      "scout":       { "claude": "haiku" }
    }
  }
}
```

### The family-matching rule

A bare string in `models.agents` was written without a target in mind, so it is
applied only to targets whose model family matches — `"sentinel": "opus"` pins
Sentinel on Claude and is *skipped* for Copilot, which falls through to
`models.copilot.smart`. That is what stops a Claude model name from landing in a
Copilot agent file when both targets are enabled.

A model with no entry in the capability registry has no family to check, so it
applies to every target: custom, self-hosted, and preview model IDs keep
working. Use the target-keyed object form whenever you want certainty.

This is what `skopos install`/`update` write to `~/.claude/agents/*.md` and
`~/.copilot/agents/*.agent.md`, and it is also the **Model** column of the
specialist roster in the rendered persona block, so the session knows how to
route delegation that isn't one of the named specialists.

### Validation

`skopos config validate` checks the `models` block and distinguishes blocking
errors from advisories. `skopos install` and `skopos update` apply the same
rules, so a config that validates is a config that installs:

| Condition | Result |
|---|---|
| Override names an agent that exists nowhere (typo) | error |
| Override object uses an unknown target key | error |
| Target-keyed override names a model from another family | error |
| Tier map names a model from another family | error |
| Override names a real agent that `catalog.agents` excludes | warning, not blocking |
| Model is not in the capability registry | warning, not blocking |

The two warnings are the cases where nothing is actually wrong. An **unregistered
model** renders through as-is; Skopos just can't advise on it, which is what
keeps custom and preview model IDs working. An **override on an excluded agent**
is inert rather than mistaken — narrowing `catalog.agents` without pruning
`models.agents` is a normal thing to do, and the key starts working again the
moment the agent is re-enabled.

The typo case is an error precisely because it is *not* inert in intent: the
user asked for a specific model and would silently not get it.

Family mismatches are errors in both the tier maps and the target-keyed
overrides, because both are target-scoped by construction — naming another
family's model there can only ever render a value that target cannot use. The
bare string form in `models.agents` is the one place a cross-family name is
tolerated, and there it is skipped rather than rejected (see above).

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

This caveat belongs to §2 only. It does not apply to the resolution in §1,
which is a directive: it is written to disk and the host CLI acts on it. A host
may of course still substitute a model for availability or policy reasons — but
that is the host overriding an instruction, not Skopos declining to give one.
