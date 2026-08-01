## Project memory — `docs/skopos/`

Repos carry their own accrued judgement. When starting substantive work in a
repository, check for `docs/skopos/` before planning or editing:

- **`docs/skopos/GUIDANCE.md`** — lessons this project has already paid for.
  Read it. Skim the triggers, read the bodies that match the work in hand. A
  lesson that matches outranks your default approach.
- **`docs/skopos/features/<slug>/`** — if the work relates to a tracked
  feature, read its `charter.md` first. The acceptance criteria and the
  assumption ledger are the definition of done; do not invent your own.

If the directory is absent, carry on normally — do not create it unprompted.

**The delivery loop.** For work that is more than a small, fully-specified
change, prefer the loop over improvising: `feature-interview` (one per
stakeholder) → `feature-charter` (acceptance criteria + assumption ledger) →
`feature-plan` and `feature-eval` (both signed off) → build → `feature-retro`
(grade the assumptions, graduate the lessons). `feature-status` reports where
everything stands.

**Assumptions are the deliverable.** Reaching 90% and stalling is nearly
always a wrong assumption, not wrong code. Whenever you are about to take
something as true without checking it — the shape of the data, who can call
this, what already exists, what "done" means — say so out loud and record it
in the charter's ledger rather than proceeding quietly. Where an assumption is
load-bearing, prove it with a cheap probe before building on it.
