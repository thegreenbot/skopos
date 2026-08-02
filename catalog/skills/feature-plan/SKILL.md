---
name: feature-plan
description: Analyze the codebase and its dependencies against a signed feature charter, then produce a phased implementation plan whose first phase is a spike that tests the riskiest assumption. Uses scout fan-out across the repo registry for blast-radius analysis. Requires tech-lead signoff before implementation. Use when a charter exists and someone asks how to build it, for an implementation plan, or for a technical approach.
---

# feature-plan — how it gets built, and what we prove first

**Artifact:** `docs/skopos/features/<slug>/plan.md`
**Input:** the charter (`charter.md`) — refuse to plan without one; run
`feature-charter` first. Planning against unstated criteria is how the 90%
problem happens.

## Phase 1 — observe before reasoning

Do not read the codebase in this session. Fan out `scout` agents in parallel,
one per relevant entry in the repo registry, each with a single question. A
useful default set:

- Where does the behaviour this feature changes currently live? (entry points, file:line)
- Who consumes it — callers, jobs, external clients, other repos?
- What tests cover it today, and what do they actually assert?
- What is the data shape, and does anything persist or migrate?
- What config, feature flags, or secrets gate this path?

For each load-bearing assumption in the charter, add one scout question that
would **disprove** it from the code. Assumptions die cheapest here.

Synthesize the reports yourself. If two scouts disagree, resolve it before
planning — a plan built on a contradiction is worse than no plan.

## Phase 2 — the spike

The first phase of the plan is always a spike unless every charter assumption
is `cosmetic`. The spike's job is not to build the feature; it is to make the
riskiest assumption fail fast and cheap.

Specify:
- **Which assumption** (by ID) it tests.
- **Sandbox**: where it runs without risk — throwaway branch, local fixture, staging
  namespace, feature flag defaulted off, a script against a copy of the data.
- **The signal**: what result means "assumption holds" versus "stop, redesign".
- **Timebox**: hours or days. A spike without a timebox becomes the implementation.
- **Disposal**: is spike code thrown away or does it graduate? Say which now.

If the signal comes back negative, the correct next action is to reopen the
charter — not to proceed carefully.

## Phase 3 — phased plan

Each phase leaves the tree working and shippable. For each phase:

- The acceptance criteria (`AC*`) it moves toward — a phase advancing no
  criterion is scope creep; cut it.
- The assumptions (`A*`) it depends on.
- Concrete files and paths, not areas.
- The verification command that proves the phase (build / lint / test / manual).
- Blast radius: what else could break, and which tests defend it.

## Phase 4 — the things plans usually omit

Answer each explicitly, even if the answer is "n/a":

- **Migration / backfill** — and how it's reversed.
- **Rollout** — flag, staged, big bang? Who can turn it off, how fast?
- **Observability** — what log, metric, or trace tells us it's working in production?
- **Failure modes** — what happens on timeout, partial write, duplicate delivery, empty state?
- **Security surface** — new inputs, new permissions, new external calls. Summon `sentinel` if any of these are non-trivial.
- **Docs and support** — who needs to know, and where does that get written?

## Artifact format

Use the `feature-plan` template (`~/.agents/templates/feature-plan.md`,
shipped by skopos and shown/overridable during `skopos-setup`) as the
skeleton. Don't improvise a different shape.

## Gate

Implementation does not start until this plan **and** the evaluation plan are
both signed off. If asked to build before then, say what's missing and offer
to run the spike — the spike is always safe to start.

## Next

`feature-eval` if it doesn't exist yet; otherwise hand Phase 0 to
`implementer` and report against the plan.
