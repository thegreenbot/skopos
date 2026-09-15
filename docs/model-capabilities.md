# Model capability reference

Skopos maintains a small, best-effort registry of what each model it knows
about can do. The registry serves both routing layers described in
`docs/model-routing-guide.md`:

- **Directive** — `family` participates in resolution. A bare model name in
  `models.agents` applies only to targets whose model family matches it, and
  `skopos config validate` rejects any *target-scoped* slot that names a model
  from the wrong family — both the tier maps (`models.claude.smart`) and the
  target-keyed overrides. A model that is *not* in this registry has no family
  to check, so it applies everywhere and validation only warns.
- **Advisory** — `reasoningDepth` and `toolUse` back the capability warnings
  below, and `family` plus `costTier` build the fallback chains behind
  `skopos models signal`. These inform a routing decision; they never block one.

Source of truth: `lib/model-capabilities.js`. Print the live matrix with:

```
skopos models list
```

## Capability matrix

| Model | Family | Reasoning depth | Tool-use | Concurrent tools | Cost | Best for |
|---|---|---|---|---|---|---|
| `opus` | claude | complex | advanced | high | high | multi-step planning, tool orchestration, complex workflows |
| `sonnet` | claude | complex | advanced | high | medium | most day-to-day work, balanced reasoning and speed |
| `haiku` | claude | simple | basic | medium | low | fast responses, simple tool use, high-volume tasks |
| `gpt-5` | copilot | complex | advanced | high | high | multi-step planning, tool orchestration |
| `gpt-5-mini` | copilot | moderate | advanced | medium | medium | balanced reasoning and speed |
| `gpt-4o` | copilot | moderate | advanced | medium | medium | general-purpose tool use |
| `gpt-3.5-turbo` | copilot | simple | limited | low | low | simple, non-tool-heavy tasks |

Fields:

- **Reasoning depth** — `complex` / `moderate` / `simple`. How much multi-step
  or ambiguous reasoning the model handles well.
- **Tool-use** — `advanced` / `basic` / `limited` / `none`. Whether the model
  reliably invokes tools, including in combination.
- **Concurrent tools** — `high` / `medium` / `low`. Rough capacity for
  juggling several tool calls in one turn.
- **Cost tier** — `high` / `medium` / `low`, relative within the registry.
- **Family** — the provider family. Target adapters are named for the family
  they serve (`claude`, `copilot`), which is what lets resolution and validation
  compare the two directly.

## How Skopos derives per-agent requirements

Each catalog/source agent declares a `model:` tier (`smart` or `fast`) and a
`tools:` list in its frontmatter. Skopos turns that into a requirement:

- `model: smart` → requires `complex` reasoning depth.
- `model: fast` → requires `simple` reasoning depth.
- More than 3 tools, or a `shell` tool → requires `advanced` tool-use.
  Otherwise `basic` tool-use is enough.

This is a heuristic, not a strict schema — see `lib/model-advisor.js`
(`requirementsFor`).

## Advisories

`skopos install` and `skopos update` run this check automatically for every
agent against every enabled target, and print any mismatch as a warning —
informational only, nothing is blocked. Run it standalone at any time:

```
skopos models check
```

Example output when a config override under-serves an agent:

```
⚠ [claude] planner → haiku
    ! agent 'planner' expects complex reasoning but 'haiku' offers simple
```

## Full compatibility matrix

Advisories above only check the model each target currently resolves. To see
every catalog/source agent against every registered model — the reference
data behind this doc — run:

```
skopos models matrix
```

This is the same matrix `test/model-compatibility.test.js` asserts against
in CI (`.github/workflows/test.yml`, run on every push and PR): it renders
every agent against every registered model tier and confirms the advisor's
verdict agrees with a from-scratch capability comparison, so a regression in
either the registry or the requirement heuristics fails the build instead of
surfacing as a confused user report.

## Extending the registry

Add a new model by adding an entry to `CAPABILITIES` in
`lib/model-capabilities.js` with all six fields filled in — note that adding a
model also changes resolution, since a bare `models.agents` name that was
previously unregistered (and therefore applied to every target) becomes
family-scoped once it is in the registry. The test suite
(`test/model-capabilities.test.js`) enforces every entry is complete, and
`test/model-compatibility.test.js` will automatically include it in the
cross-model render/advisory checks.
