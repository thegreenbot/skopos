# Model capability reference

Skopos maintains a small, best-effort registry of what each model it knows
about can do. This is a foundation for **influencing** routing decisions, not
determining them: the AI platform running an agent (Claude Code, the Copilot
CLI, or anything a task gets delegated to) always makes the final call on
which model actually runs. See `docs/model-routing-guide.md` for how that
signal flows through delegation.

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

## Agents skopos doesn't render

The user's own agents (see [docs/custom-agents.md](custom-agents.md)) carry
whatever `model:` their file declares. skopos does not resolve it, map it
through a tier, or change it — so advisories for them say only that the
declared model's tool-use capability looks light for the tools the agent lists,
and say plainly that the file is the user's. When the declared model isn't in
the registry, skopos stays silent: their platform may well know a model skopos
doesn't. `skopos models check` reports these separately from the agents it
renders.

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
`lib/model-capabilities.js` with all five fields filled in — the test suite
(`test/model-capabilities.test.js`) enforces every entry is complete, and
`test/model-compatibility.test.js` will automatically include it in the
cross-model render/advisory checks.
