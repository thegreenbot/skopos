---
name: feature-charter
description: Distill stakeholder interviews into a feature charter — observable acceptance criteria, an assumption ledger, explicit non-goals, and the conflicts that still need a human decision. This is the definition of "complete" that the implementation plan, the evaluation plan, and the retro all measure against. Use after two or more feature-interview runs, or when the user asks for a definition of done, acceptance criteria, or scope alignment.
---

# feature-charter — what "complete" means, in writing

The charter reconciles several stakeholders' views of done into one document
everybody can be held to. It is the contract; everything downstream cites it.

**Artifact:** `docs/skopos/features/<slug>/charter.md`

## Inputs

Every interview under `docs/skopos/features/<slug>/interviews/`, plus
`docs/skopos/GUIDANCE.md`. If only one interview exists, say so and offer to
run `feature-interview` for the missing perspective — a single-stakeholder
charter is a scope risk, not a charter.

## Rules

- **Reconcile, don't average.** Where stakeholders disagree, the answer is
  rarely the midpoint. Either one view is the real bar, or both are required
  and the scope is bigger than anyone said. Name which.
- **Never resolve a conflict by picking quietly.** If a decision needs a
  human, it goes in *Decisions required*, with a recommendation and the cost
  of each option. Unresolved is an acceptable state; invisible is not.
- **Every criterion is observable by someone who didn't build it.** If you
  cannot say where a person would look and what they would see, it is not a
  criterion yet — it is an intention.
- **Attribute.** Each criterion carries whose need it serves; that is what
  makes it defensible when scope is cut.
- **The ledger is the point.** An assumption that nobody wrote down is the
  one that costs a rebuild. Carry every assumption forward from the
  interviews, add the ones the interviews implied, and rank them.

## Building the assumption ledger

For each assumption, fill four fields. The third is the one people skip and
the one that pays:

| Field | Question it answers |
|---|---|
| Assumption | What are we taking as true without having checked? |
| Held by | Who believes it — and does anyone disagree? |
| **Cheapest disproof** | What is the fastest, smallest thing that would show this is false? |
| Blast radius | If it's false and we find out after building: what has to be redone? |

Rank by `blast radius × uncertainty`. The top one or two drive the spike in
`feature-plan` — you buy down risk by testing assumptions early, not by
building carefully.

Classify each as:
- **Load-bearing** — the design collapses if it's wrong. Must be probed before or during the spike.
- **Contained** — wrong means local rework. Probe it in the evaluation plan.
- **Cosmetic** — wrong means a tweak. Record and move on.

## Artifact format

```markdown
# Charter — <feature name>
Feature: <slug> · Status: draft | signed off · Last updated: <YYYY-MM-DD>
Sources: interviews 01–NN

## Outcome
<One sentence, in stakeholder language, naming who is better off and how.>

## Acceptance criteria
| ID | Criterion (observable) | Serves | Verified where |
|----|------------------------|--------|----------------|
| AC1 | <what a person can see/measure> | <stakeholder> | <surface> |

## Assumption ledger
| ID | Assumption | Held by | Class | Cheapest disproof | Blast radius |
|----|-----------|---------|-------|-------------------|--------------|
| A1 | <...> | <who> | load-bearing | <fast check> | <what gets redone> |

## Non-goals
- <explicitly out of scope, and who agreed>

## Decisions required
| # | Question | Options (cost) | Recommendation | Owner | Status |
|---|----------|----------------|----------------|-------|--------|
| D1 | <conflict> | A: <cost> / B: <cost> | <yours, with reasoning> | <person> | open |

## Known unknowns
- <question> — resolve by <when / how>

## Signoff
- [ ] <Direction owner> — the criteria describe what I asked for
- [ ] <Tech lead> — the criteria are buildable and testable as written
```

## Gate

The charter is **signed off** when every stakeholder interviewed has ticked
their box and no `Decisions required` row is still `open`. Until then,
downstream skills may run but must print the charter's status at the top of
their output — nobody should discover mid-implementation that the bar moved.

## Next

Run `feature-plan` (implementation) and `feature-eval` (evaluation). They can
be produced in parallel; both must be signed off before implementation starts.
