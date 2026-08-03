---
name: feature-eval
description: Write the evaluation plan for a feature — step-by-step test procedures a person who did not build it can follow, negative and edge scenarios, the exact URLs, commands and screens where it can be previewed, and probes designed to break the charter's assumptions. Requires stakeholder signoff before implementation starts. Use when someone asks how a feature will be tested, verified, demoed, accepted, or QA'd.
---

# feature-eval — how anyone proves it's done

The evaluation plan is written **before** implementation and handed to the
person who will judge the work. If they can't follow it without asking the
author a question, it isn't finished.

**Artifact:** `docs/skopos/features/<slug>/evaluation.md`
**Input:** `charter.md` (criteria + assumption ledger), `plan.md` if it exists
(for environments and surfaces).

## The reader you are writing for

Someone competent, with access, who was not in any of the interviews and has
not read the code. They should never have to infer a URL, guess an
environment, or know which button "the new flow" means.

Concretely, that bans: "verify the feature works", "check the endpoint",
"test error handling", "confirm the UI looks right".

## Rules

- **Every acceptance criterion gets at least one procedure**, mapped by ID. A
  criterion with no test is a criterion nobody agreed how to check.
- **Exact surfaces.** Real URLs with the real path, real commands with real
  flags, real file paths, named environment. If the URL doesn't exist yet,
  write the URL it *will* be and mark it `[pending]` — a placeholder that
  specific gets fixed; "the staging site" doesn't.
- **Expected result is observable.** "A green check appears next to the
  filename" — not "it succeeds".
- **State the starting state.** Which account, which role, seeded with what.
  Most flaky acceptance sessions are actually state mismatches.
- **Negative scenarios are not optional.** They are where the assumptions die.
- **Time-box the whole pass.** If acceptance takes longer than an hour,
  stakeholders skip it and you learn nothing.

## Building the procedures

For each criterion, write one procedure: a precondition (account/role/data/
flags), numbered steps starting from an exact URL, an expected result
specific enough to be observed rather than judged, and what a failure most
likely means for whoever re-runs it. Use the `T1` entry in the `feature-eval`
template (below) for the exact shape — don't invent a different one.

## Negative and edge scenarios

Work the list, keep what applies, and write each as a procedure with the
expected *graceful* behaviour — the failure mode is the specification:

- Empty state — first run, zero records, new account.
- Bad input — wrong type, oversized, malformed, hostile (script tags, path traversal, SQL).
- Permissions — the user who should *not* be able to do this; logged out; expired session.
- Boundaries — 0, 1, exactly-the-limit, limit+1, unicode, very long strings.
- Concurrency — two people editing the same thing; double-submit; retry after timeout.
- Dependency failure — third party down, slow, or returning garbage.
- Interruption — network drop mid-operation, browser refresh, back button.
- Reversal — undo, delete, rollback, re-run the same action twice.

For anything touching auth, secrets, user input, or an external boundary,
summon `sentinel` and fold its findings in as procedures.

## Assumption probes

The section that makes this loop worth running. For each **load-bearing** and
**contained** assumption in the charter, write a test whose purpose is to
falsify it — not to confirm the happy path. For example: rather than assuming
every existing account has a verified email because the schema says so,
count the rows where `verified_at IS NULL` in a staging copy and let that
number decide. Use the `P1` entry in the `feature-eval` template (below) for
the exact shape.

A probe that has never been run against real-shaped data is not evidence.
Prefer production-shaped fixtures over hand-made ones.

## Artifact format

Use the `feature-eval` template (`~/.agents/templates/feature-eval.md`,
shipped by skopos and shown/overridable during `skopos-setup`) as the
skeleton — `T1…Tn` for acceptance procedures, `N1…Nn` for negative scenarios,
`P1…Pn` for assumption probes, each built as described above.

That last checkbox is the whole point: it converts "looks good to me" into a
falsifiable, pre-agreed statement.

## Gate

Signed evaluation plan + signed implementation plan → implementation may
start. Run the assumption probes **during** the spike, not after the build.

## Next

Implementation. After it ships and this plan has been run, `feature-retro`.
