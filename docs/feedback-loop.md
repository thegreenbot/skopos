# The delivery loop

Agentic workflows get from zero to 90% in one shot. The last 10% is rarely
bad code — it is an assumption that nobody wrote down, discovered when a real
person tests against real expectations. Every one of those costs a rework
cycle and a pile of tokens re-deriving context that was already in someone's
head at the start.

The loop's premise: **treat assumptions as the deliverable.** Surface them
before building, design tests that try to break them, grade them after
shipping, and keep only the lessons that would change what a future session
does.

## The stages

| Stage | Skill | Produces |
|---|---|---|
| Discovery | `feature-interview` | One artifact per stakeholder, in their words |
| Definition of done | `feature-charter` | Acceptance criteria + assumption ledger + conflicts |
| How to build | `feature-plan` | Phased plan, spike first, tech-lead signoff |
| How to prove | `feature-eval` | Test procedures, negative scenarios, preview URLs, assumption probes |
| Build | `implementer` (agent) | The diff |
| Feedback | `feature-retro` | Graded assumptions, misses, lessons → `GUIDANCE.md` |
| Anytime | `feature-status` | Where every feature stands, what's blocked |

## Artifacts

Everything lives in the project, not in the tool — the lessons belong to the
codebase and outlive any one machine or AI CLI:

```
docs/skopos/
├── GUIDANCE.md                      # accrued lessons — read at the start of work
└── features/<slug>/
    ├── interviews/01-po-sam.md      # portable; each interview reads the prior ones
    ├── charter.md                   # criteria (AC*) + assumption ledger (A*) + signoffs
    ├── plan.md                      # phases mapped to AC*, spike targets the riskiest A*
    ├── evaluation.md                # T* procedures, N* negatives, P* assumption probes
    └── retro.md                     # grades every A*, graduates lessons
```

IDs are the connective tissue. `AC3` in the charter is the same `AC3` the
plan's Phase 2 serves and the evaluation's `T7` proves. `A2` is the assumption
the spike probes and the retro grades. That traceability is what lets
`feature-status` say "ready to build, but A2 is still untested".

## Why interviews are asynchronous and plural

One stakeholder gives you one version of done. The product owner's "done" is a
support-queue metric; the tech lead's is a clean migration; the director's is
a compliance obligation nobody mentioned. Each interview writes a standalone
file, and later interviews read the earlier ones — but only **after** asking
their own opening question unanchored, so you capture genuine divergence
instead of agreement manufactured by anchoring.

Disagreements are recorded, not smoothed. Reconciliation happens once, in the
charter, in the open, with a named owner for each decision.

"Asynchronous" also means a single stakeholder's own interview doesn't have
to finish in one sitting. `feature-interview` checkpoints a draft after
every phase and picks it back up where it left off in a later session
instead of starting the opening question over — and a stakeholder can
return after a completed interview to amend it, recorded as a dated
addition rather than a silent rewrite of what they said the first time.

Not every stakeholder has skopos, or any AI tool with the skill installed.
For those, `feature-interview` can hand off a self-contained packet instead
of a bare transcript — interview rules, phases, and every prior interview
inlined in one file, usable from a paste into any AI chat with nothing set
up. See `catalog/templates/interview-handoff.md`.

Three interviews is the usual saturation point. Stop when a new interview
stops producing new assumptions or new conflicts.

## How a single interview runs

There is no question script. A script cannot ask the second question, and the
second question is where the assumption actually surfaces.

Each interview opens with one unanchored question, then runs a loop: read the
answer, decide what it contains, ask one clarifying question. Answers are read
for six things — a vague qualifier, an unverifiable claim of done, a new
assumption, a scope boundary, a collision with an earlier interview, or an
unknown. Each routes to a different follow-up. Collisions are held back for
the divergence pass so they don't anchor the rest of the conversation.

What keeps freeform from running forever is a **coverage contract**: outcome,
observable completion, verification surface, assumptions (with cheapest
disproof and blast radius), non-goals, disagreements, open questions. Every
slot ends up filled or explicitly unknown *with a named owner* — an unknown
closes a thread rather than leaving one open.

An interview concludes when any of three conditions holds:

- **coverage** — every slot filled or owned;
- **saturation** — two consecutive answers producing no new assumption, no new
  verification surface, no new non-goal (the same test applied to whole
  interviews, one level down);
- **budget** — the time stated up front is spent, or the stakeholder calls it.

Then the read-back, which is a test rather than a ritual: corrections that open
a new load-bearing assumption buy one more round; cosmetic corrections mean
write the artifact. Because interviews are async and portable, concluding
`provisional` — unfilled slots carried as owned open questions, a later session
reopening the same file to close them — is a legitimate ending. That is a
different state from a checkpointed `in-progress` draft: provisional means the
interview concluded and was written up with gaps that have owners, not that it
was cut off mid-phase. Concluding by silence is neither, and is never
acceptable.

The probe bank still exists, demoted from script to **prior**: consulted when a
thread runs dry or a slot is still empty, and the place `feature-retro`
deposits a lesson that was knowable at interview. That write-back is what makes
the loop compound, so the bank outlives the script that used to wrap it.

## The assumption ledger

The core artifact. Every assumption gets four fields, and the third is the one
teams skip — which is why the interview now chases it while the stakeholder is
still in the room, rather than leaving the charter to reconstruct it:

- **Assumption** — what we're taking as true without checking.
- **Held by** — who believes it, and who disagrees.
- **Cheapest disproof** — the fastest small thing that would show it's false.
- **Blast radius** — what has to be rebuilt if we find out late.

Ranked by `blast radius × uncertainty`, then classed **load-bearing**
(design collapses), **contained** (local rework), or **cosmetic**. The
top-ranked load-bearing assumption becomes Phase 0 of the plan: a timeboxed,
sandboxed spike whose only job is to make that assumption fail cheaply.

If the spike's signal comes back negative, the correct move is to reopen the
charter — not to proceed more carefully.

## Evaluation written before implementation

The evaluation plan is handed to whoever will judge the work, **before** the
build starts. It is written for someone competent who was in none of the
interviews and has read none of the code: exact URLs, exact commands, named
environment, stated starting state, and observable expected results.

It carries three kinds of procedure:

- **`T*` acceptance** — one or more per criterion; every `AC` is covered.
- **`N*` negative** — empty state, hostile input, permissions, boundaries,
  concurrency, dependency failure, interruption, reversal. The failure mode is
  the specification.
- **`P*` assumption probes** — tests designed to *falsify* a ledger entry, run
  against production-shaped data during the spike, not after the build.

The stakeholder's signoff line reads: *if all of this passes, I will call the
feature done.* That converts "looks good to me" into something falsifiable and
agreed in advance.

## Feedback that compounds

`feature-retro` grades every assumption **held / broke / untested /
irrelevant**, and for each break asks the diagnostic question:

> At which stage was this first knowable — interview, charter, plan, spike,
> evaluation, or only in production?

That answer routes the fix. Knowable at interview → a probe question is
missing from the interview bank. Knowable at evaluation → the negative list
needs an entry. Only knowable in production → genuinely new information, and
the lesson is about monitoring rather than process.

`untested` is the grade that matters most: those assumptions are still live
risks running in production, and the retro assigns each one an owner.

### Lessons that stay useful

A lesson enters `GUIDANCE.md` only if it names a recognisable trigger,
prescribes a concrete action, and would have changed what was just done.
Trigger-first, so it can be matched at the right moment:

```markdown
### L-007 · When adding a column to a table older than the current team
**Do:** Query the production distribution before designing around NOT NULL.
**Because:** billing-export assumed every account had a verified email
(A2, load-bearing, untested). 12% did not. Cost: rollback plus two days.
**Stage it was knowable:** interview.
**Seen:** 2× (billing-export, account-merge)
```

Guidance is **curated, not appended**: refine and increment `Seen:` instead of
duplicating, delete what newer experience contradicts, and keep the file under
roughly forty lessons. An unread guidance file is pure token cost.

When a lesson reaches `Seen: 3×` it has outgrown the document, and the retro
recommends promoting it into the system itself — an interview probe, a
standing negative scenario, a durable fact in the `SKOPOS:USER-FACTS` fence,
or a rule in an enterprise source's `instructions/` so every repo in the org
inherits it.

## How skopos finds all this

The managed instruction block carries a short `Project memory` section telling
the session to check `docs/skopos/GUIDANCE.md` and the relevant `charter.md`
before planning or editing — and to do nothing if the directory is absent.

The loop is content, not plumbing: six skills and one instruction section, no
CLI changes. Enterprises can override any of it by shipping their own
`skills/feature-*` in an approved source, which takes precedence over the
built-in catalog.
