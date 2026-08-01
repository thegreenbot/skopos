---
name: feature-status
description: Show where every tracked feature stands in the skopos delivery loop — which stage it reached, what is blocked awaiting signoff, which assumptions are still untested, and which skill to run next. Use when the user asks where a feature stands, what is in flight, what needs signoff, or what to do next.
---

# feature-status — where everything stands

Read-only. Reports the state of the delivery loop in this repo and names the
single next action per feature.

**Reads:** `docs/skopos/features/*/` and `docs/skopos/GUIDANCE.md`.
If neither exists, say the loop isn't set up here and offer
`feature-interview` to start one — don't scaffold empty directories.

## Determining a stage

Per feature directory, in order — the stage is the last one satisfied:

| Stage | Evidence |
|---|---|
| `discovery` | `interviews/` has files, no `charter.md` |
| `charter draft` | `charter.md` exists, unticked signoff boxes or open decisions |
| `charter signed` | all boxes ticked, no open `Decisions required` |
| `planned` | `plan.md` signed off |
| `evaluable` | `evaluation.md` signed off |
| `ready to build` | plan **and** evaluation signed off |
| `in flight` | evaluation `Result log` has rows, no `retro.md` |
| `closed` | `retro.md` exists |

## Output

Terse. One block per feature, most-blocked first.

```
docs/skopos — 3 features tracked · GUIDANCE.md: 11 lessons

billing-export      ready to build
  charter ✓ (3 interviews) · plan ✓ · eval ✓
  untested assumptions: A2 (load-bearing), A5
  next: spike Phase 0 — probe A2 before building

account-merge       charter draft  ⛔ blocked
  interviews 2/3 (director not interviewed) · D1 open: "does merge preserve audit history?"
  next: resolve D1 with <owner>, then feature-interview for the director

search-rerank       closed
  3 assumptions broke · 2 lessons graduated · 1 still-live risk (A4, owner: unassigned)
  next: assign an owner to A4
```

## Flag these, always

- **Untested load-bearing assumptions** on anything past `ready to build` —
  the loop's single highest-value warning.
- **Still-live risks** from closed features with no owner.
- **Stale signoffs**: a charter signed off before a plan that materially
  changed the approach. Recommend re-confirming rather than assuming.
- **GUIDANCE.md over ~40 lessons** — recommend a curation pass in the next retro.
