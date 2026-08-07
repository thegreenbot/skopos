---
name: feature-interview
description: Interview one stakeholder about what "done" means for a feature, in their own words, capturing the assumptions underneath. Run once per stakeholder (product owner, tech lead, director); each run reads the prior interviews so views can diverge before they are reconciled. Use before planning or building anything non-trivial, or when the user says "interview", "gather requirements", "what does done mean", or "align on scope".
---

# feature-interview — one stakeholder, one sitting

**Model guidance:** Works well with Sonnet. Opus is not required for a single-stakeholder conversation; Haiku can conduct it but may under-probe vague answers. See the skopos repo's docs/model-capabilities.md.

Agentic delivery reaches 90% fast and stalls there, because the wrong thing
was assumed, not because the code was wrong. This interview exists to drag
those assumptions into text **before** anyone writes code.

You are interviewing **one** person. Interviews are asynchronous and portable:
each writes a standalone artifact that the next interview reads.

## Artifacts

```
docs/skopos/features/<slug>/interviews/NN-<role>-<name>.md
```

If the repo already keeps this material somewhere else, follow the repo's
convention instead and say so in your first message.

## Before you ask anything

1. Read `docs/skopos/GUIDANCE.md` if it exists — past lessons often name the
   question this project always forgets to ask. Ask it.
2. Read every existing interview under this feature's `interviews/`.
3. If your config has `systemOfRecord.enabled: true` and `systemOfRecord.publish.interviews: true`,
   try to fetch prior interviews from the system-of-record (Jira, GitHub, etc.). Report what you found.
   If that fails and `onFailure: fail`, stop and ask them to paste prior interviews manually. If `warn`,
   continue with manual fallback.
4. Ask if they have prior interview artifacts (from another AI tool, manual notes, etc.) to paste in.
   If yes, read them as context before proceeding.
5. Establish: feature slug, who you're interviewing, their role.

**Order matters.** Interview the direction-setter first (product owner or
whoever owns the outcome), then delivery (tech lead), then the wider
stakeholders (director, adjacent team leads). Three is usually enough — stop
when a new interview stops producing new assumptions or new conflicts, not
when you hit a number.

## Rules

- **One question at a time.** Wait for the answer. Never batch.
- **Their language, not yours.** Record the words they used. Do not translate
  "it should feel instant" into "p95 latency < 200ms" — that translation is
  itself an assumption, and it belongs to the charter, not to you.
- **Never propose the solution.** If they ask what you'd do, redirect once:
  "I'd rather capture what you need first — I'll bring options back."
- **Chase the vague.** "Simple", "clean", "just", "obviously", "should be
  easy", "everyone knows" — every one of these hides an assumption. Ask what
  it would look like concretely.
- **Silence is data.** If they don't know, record "unknown" rather than
  guessing on their behalf.

## Phase 1 — the opening question (unanchored)

Ask this first, before revealing anything from prior interviews. Anchoring
them early destroys the disagreement you are here to find.

> Describe a feature you've put off — because of complexity, lack of
> alignment, or anything else. In your own words, what is it? What does
> **complete** look like to you? And where would *you* go to check whether it
> was delivered well?

Let them talk. Follow the energy in their answer before moving on.

## Phase 2 — role probes

Pick the bank that matches the person. Three to five probes, not all of them.

**Direction (PO / product / founder)**
- Who is worse off today, and how do you know?
- What's the first thing you'd click, run, or look at on the day this ships?
- What would make you say "that's not what I asked for" even if it works?
- What's explicitly *not* in scope — what would you refuse if offered?
- If we could ship only a third of this, which third earns its keep?

**Delivery (tech lead / senior engineer)**
- What already exists that this touches? What breaks first under load?
- Where would you sandbox this — can it be proven without a full build?
- What's the cheapest prototype that would tell us the approach is wrong?
- What's the rollback story? What's irreversible once released?
- Which dependency here do you least trust?

**Organisation (director / adjacent leads)**
- Which teams feel this? Who finds out only after it ships?
- What compliance, contractual, or support obligation attaches to it?
- What does this make harder six months out?
- What has failed here before, and why?

## Phase 3 — the evaluation surface

Never end without this. It seeds the whole evaluation plan.

- Where exactly would you look — URL, screen, dashboard, log, report, command?
- Who checks it: you, someone on your team, a customer?
- What would you consider proof, as opposed to "the demo worked"?

## Phase 4 — the divergence pass

Only now, if prior interviews exist. Surface the two or three places where
this person's answers differ from an earlier stakeholder's — attributed, not
anonymised — and ask them to react:

> The tech lead described "done" as the migration running clean in staging.
> You described it as the support queue dropping. Are both required, or is one
> of them the real bar?

Record the disagreement. **Do not negotiate it away** — reconciliation belongs
to `feature-charter`, and a conflict resolved silently in an interview is a
conflict that resurfaces during review.

## Phase 5 — read back, then write

Read your captured assumptions back to them in one short list and ask what's
wrong. People correct a list far more readily than they volunteer detail.

Then write the artifact:

```markdown
# Interview NN — <Name>, <Role>
Feature: <slug> · Date: <YYYY-MM-DD> · Interviewer: skopos

## In their words
> <the most load-bearing verbatim quotes — three or four, not a transcript>

## What "complete" means to them
- <bullet, observable where possible>

## Where they would verify it
- <surface: URL / screen / command / report> — checked by <who>

## Assumptions surfaced
| ID | Assumption (their framing) | Confidence | If wrong |
|----|---------------------------|-----------|----------|
| A1 | <e.g. "existing accounts already have a verified email"> | stated / implied | <consequence> |

## Explicit non-goals
- <what they said they do NOT want>

## Disagreements with earlier interviews
- <attributed delta, unresolved on purpose>

## Open questions they could not answer
- <question> — owner: <who could answer>
```

Keep assumption IDs unique **per feature**, not per interview — later
artifacts reference `A3` and must mean one thing.

## Output your artifact

Write the markdown artifact as shown in Phase 5 above. Then:

**If `systemOfRecord.enabled: true` and `systemOfRecord.publish.interviews: true`:**
1. Try to publish the interview to your configured system (Jira, GitHub, etc.).
   - If successful: Report the remote artifact link. They can share this URL across tools.
   - If failed and `onFailure: fail`: Stop and ask them to upload manually (see below).
   - If failed and `onFailure: warn`: Warn them, then proceed to manual copy-paste (see below).

**Always provide manual fallback:**
- Show the markdown in a fenced code block for copy-paste (with "Copy to clipboard" if in web).
- Provide a downloadable file `<feature-slug>-interview-NN.md` they can save and share.

**Attribution & context:**
- If `systemOfRecord.publish.includeCommitSha: true`, append the commit SHA of the current repo
  to the frontmatter (helps trace which version of code prompted this interview).

## Next

Report which stakeholders remain and what the sharpest unresolved conflict is.
When interviews saturate, run `feature-charter`.
