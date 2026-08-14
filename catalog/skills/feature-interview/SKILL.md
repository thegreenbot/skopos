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
docs/skopos/features/<slug>/interviews/skopos--<slug>--interview-handoff--vNNN.md   (see "Handing off" below, only when needed)
```

If the repo already keeps this material somewhere else, follow the repo's
convention instead and say so in your first message.

## Before you ask anything

1. Establish: feature slug, who you're interviewing, their role.
2. Check `docs/skopos/features/<slug>/interviews/` for a file for this same
   stakeholder with `skopos-interview-status: in-progress` in its
   frontmatter. If one exists, this is a **resume**, not a fresh start — see
   "Picking up a cut-off interview" below, and skip straight to it once
   you've confirmed it's the same person continuing.
3. Read `docs/skopos/GUIDANCE.md` if it exists — past lessons often name the
   question this project always forgets to ask. Ask it.
4. Read every existing **complete** interview under this feature's
   `interviews/` (skip other stakeholders' in-progress drafts — unfinished
   answers aren't reliable context yet).
5. If your config has `systemOfRecord.enabled: true` and `systemOfRecord.publish.interviews: true`,
   try to fetch prior interviews from the system-of-record (Jira, GitHub, etc.). Report what you found.
   If that fails and `onFailure: fail`, stop and ask them to paste prior interviews manually. If `warn`,
   continue with manual fallback.
6. Ask if they have prior interview artifacts (from another AI tool, manual notes, etc.) to paste in.
   If yes, read them as context before proceeding.

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

## Checkpointing — interviews may span sessions

Don't wait until the end to write anything. A single sitting can get cut off
by a context limit, a closed tab, or the stakeholder just running out of
time — and nothing before Phase 5 is currently saved.

As soon as you've established who you're interviewing (step 1 above), write
a draft to `docs/skopos/features/<slug>/interviews/NN-<role>-<name>.md`:

```markdown
---
skopos-artifact: interview
skopos-feature: <slug>
skopos-interview-status: in-progress
skopos-interview-phase: 0
skopos-updated: <ISO timestamp>
---

# Interview NN — <Name>, <Role> (in progress)
Feature: <slug> · Date: <YYYY-MM-DD> · Interviewer: skopos
```

Update it after **every phase** — bump `skopos-interview-phase` to the
number just completed, refresh `skopos-updated`, and add whatever that
phase captured using the section headings from Phase 5's template (partial
sections are fine; a stakeholder resuming next week should see exactly
where they left off). Phase 5 itself replaces `in-progress` with `complete`
and drops the phase counter — see "Output your artifact."

## Picking up a cut-off interview

You detected this in "Before you ask anything." Once confirmed:

1. Read the draft back to them in a couple of sentences — not a full
   replay, just enough to place them: *"Last time you'd told me <what they
   said so far>, and we'd gotten through the role probes. Want to keep
   going from the evaluation surface, or has anything changed since?"*
2. Resume at the phase **after** `skopos-interview-phase`. Never re-ask
   Phase 1's opening question if it's already answered — the anchoring
   concern only applies the first time.
3. If they'd rather restart clean, let them — overwrite the draft and begin
   at Phase 1 as normal.
4. Everything else (checkpointing, Phase 5, output) proceeds exactly as if
   this were one sitting.

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

Then write the artifact, replacing the checkpointed draft in place — same
filename, `skopos-interview-status` now `complete`, `skopos-interview-phase`
dropped:

```markdown
---
skopos-artifact: interview
skopos-feature: <slug>
skopos-interview-status: complete
skopos-updated: <ISO timestamp>
---

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

## Handing off without skopos or system-of-record access

Copy-paste and download (below) are enough when the next stakeholder has
*some* AI tool with the feature-interview skill installed — they read the
transcript, already know the phases, and carry on. They are not enough when
the next stakeholder has nothing installed at all: a customer, a contractor,
an executive with only a browser tab open to a generic chat assistant. That
person's AI needs the interview instructions themselves, not just a
transcript to react to.

Ask, before you finish: **"Does whoever goes next have skopos, or at least
this skill, available to them?"** If no (or you don't know), build a
hand-off packet in addition to the normal artifact:

1. Use the `interview-handoff` template (`~/.agents/templates/interview-handoff.md`,
   shipped by skopos and shown/overridable during `skopos-setup`).
2. Fill in the feature slug and your own name/contact as "handed off by" —
   that's who the packet tells the next person to send their result back to.
3. Under "Prior interviews," paste the **full text** of every interview
   under this feature's `interviews/` folder, including the one you just
   wrote — not a summary. The next person's AI has no repo access; whatever
   isn't in the packet doesn't exist for them.
4. Leave the next stakeholder's name and role blank — the packet's opening
   question establishes both.
5. Write it to `docs/skopos/features/<slug>/interviews/skopos--<slug>--interview-handoff--vNNN.md`,
   incrementing the version if a packet already exists for this feature.

The packet is self-contained: interview rules, phases, and the
read-back-then-write artifact format are inline, so any AI chat interface
can run it from a paste with nothing installed. It closes by asking the new
stakeholder to either add their finished interview to the system-of-record
themselves (same as the normal process, if they have access) or save it and
send it back to whoever handed it to them — email, Slack, Teams, whatever
they'd normally use. Tell them which artifact reference (ticket key, or
"none yet") to mention when they do.

## Revisiting a completed interview

Someone comes back after the fact — a follow-up thought, a correction, new
information that changes an answer. Don't renumber and don't create a new
`interviews/` entry for the same stakeholder; that fragments one person's
view across files the charter has to reconcile against itself.

Instead, open their existing `complete` artifact and append:

```markdown
## Amendment — <YYYY-MM-DD>
> <what changed, in their words>
- Affects: <section/assumption ID this touches, e.g. "A3">
- Why: <what prompted the correction>
```

Leave the original answer untouched above it — an amendment is a recorded
delta, not a silent rewrite, for the same reason disagreements between
stakeholders are recorded rather than smoothed over. Bump `skopos-updated`.
If the amendment reverses something `feature-charter` already reconciled,
say so — that charter's signoff may need revisiting.

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
If you produced a hand-off packet, say so and tell them to send it on now —
don't wait for `feature-charter` to notice the interview never came back.
When interviews saturate, run `feature-charter`.
