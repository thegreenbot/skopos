---
name: feature-retro
description: After a feature ships, grade which assumptions held, name the misses and the stage at which each was first knowable, capture the surprising successes, and graduate durable lessons into the project's docs/skopos/GUIDANCE.md. This is the feedback step that makes the next feature's first pass higher fidelity. Use after implementation and acceptance, or when the user asks for a retro, postmortem, lessons learned, or "what did we get wrong".
---

# feature-retro — grade the assumptions, keep the lesson

Most retrospectives produce feelings. This one produces two things: a graded
assumption ledger, and lessons written so a future session actually acts on
them.

**Artifact:** `docs/skopos/features/<slug>/retro.md`
**Also updates:** `docs/skopos/GUIDANCE.md` (create it if absent)
**Inputs:** charter, plan, evaluation plan + its result log, the actual diff
(`git log`/`git diff` for the feature branch), and any rework that followed.

## Rules

- **Evidence, not memory.** Cite commits, PR comments, test runs, evaluation
  result rows. "It felt rushed" is not a finding; "three commits after
  acceptance all fixed timezone handling" is.
- **No blame, no praise.** Findings attach to the *process step*, not to
  people. The output is "the charter didn't ask about X", never "Sam forgot X".
- **Grade honestly, including the wins.** A ledger where everything held
  either means the interviews were excellent or the assumptions were trivial.
  Say which.
- **Silence is a result.** If nothing durable was learned, write that and add
  no lesson. A guidance file padded with truisms stops being read, and an
  unread guidance file costs tokens without buying fidelity.

## Step 1 — grade the ledger

Walk every assumption in the charter:

| Grade | Meaning |
|---|---|
| **held** | Checked and true. Note how it was checked. |
| **broke** | False. Record what it cost — hours, rework, rollback, incident. |
| **untested** | Never actually verified. These are the dangerous ones: they are still live risks in production. |
| **irrelevant** | Overtaken; the design changed. |

Then the diagnostic question, for each `broke`:

> **At which stage was this first knowable?** interview · charter · plan ·
> spike · evaluation · only in production

That answer is the whole engine. A miss knowable at *interview* means a probe
question is missing from the interview bank. A miss knowable at *evaluation*
means the negative-scenario list needs an entry. A miss only knowable in
production is genuinely new information — and deserves a monitoring lesson,
not a process one.

## Step 2 — misses

For each: what was expected, what actually happened, the evidence, the cost,
and the stage at which it was knowable. Include misses that cost nothing but
could have been expensive — near misses are cheap lessons.

## Step 3 — surprising successes

Deliberately hunted, not an afterthought. Things that went better than
expected are reusable technique, and they are the only part of a retro that
tells you what to *keep* doing:

- What took far less time than estimated, and why?
- Which existing abstraction absorbed the change cleanly?
- Which test caught a real defect before review?
- Where did a stakeholder say "that's exactly it" without iteration?

## Step 4 — loop cost

The numbers that tell you whether this process is paying for itself:

- Rounds of rework after "done" was first claimed.
- Acceptance procedures that failed on first run.
- Assumptions that broke *after* implementation versus during the spike.
- Anything rebuilt rather than adjusted.

Track these across features. If broke-after-implementation isn't falling over
time, the interview and charter steps aren't earning their cost — say so
plainly in the retro.

## Step 5 — graduate lessons

A lesson earns a place in `GUIDANCE.md` only if it is **actionable at a
specific future moment**. Test it against three questions:

1. Does it name a trigger a future session can recognise?
2. Does it prescribe a concrete action, not a value ("be careful", "consider…")?
3. Would it have changed what we did on this feature?

Three yeses, or it doesn't go in.

Format — trigger first, so it can be grepped and matched at the right moment:

```markdown
### L-007 · When adding a column to a table older than the current team
**Do:** Query the production distribution before designing around NOT NULL —
count the rows that would violate it, don't reason about what "should" be there.
**Because:** feature `billing-export` assumed every account had a verified
email (A2, load-bearing, untested). 12% did not. Cost: rollback plus two days.
**Stage it was knowable:** interview.
**Seen:** 2× (billing-export, account-merge)
```

### Curation is part of the job

Before appending, read the existing lessons:

- **Refine, don't duplicate.** If a lesson already covers this, sharpen it and
  increment `Seen:` — a lesson seen three times is far stronger evidence than
  three near-identical entries.
- **Supersede and delete.** A lesson contradicted by newer experience is
  removed, not left to confuse. Note the supersession in the retro.
- **Retire the obsolete.** Lessons about systems that no longer exist go.
- **Cap it.** Keep `GUIDANCE.md` under roughly forty lessons. Past that, it
  stops being read, and an unread file is pure token cost.

### Escalate what recurs

A lesson at `Seen: 3×` has outgrown a document. Recommend promoting it into
the system itself so it can't be forgotten:

- a probe question added to the `feature-interview` bank;
- a standing entry in the negative-scenario list in `feature-eval`;
- a durable fact in the `SKOPOS:USER-FACTS` fence, or a rule in an enterprise
  source's `instructions/` if it applies across the whole org.

Say which, explicitly, in the retro's Next section.

## Artifact format

Use the `feature-retro` template (`~/.agents/templates/feature-retro.md`,
shipped by skopos and shown/overridable during `skopos-setup`) as the
skeleton.

## Next

Report the graded ledger and the lessons in three lines. The still-live risks
section deserves a human owner before you close the loop — untested
assumptions in production are the one output of this skill that expires.
