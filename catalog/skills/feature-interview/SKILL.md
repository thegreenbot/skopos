---
name: feature-interview
description: Interview one stakeholder about what "done" means for a feature, in their own words, capturing the assumptions underneath. The interview is freeform — you analyse every answer and follow it with a clarifying question, until the coverage contract is filled or the answers stop producing new assumptions. Runs once per stakeholder (product owner, tech lead, director), resumes across sessions if cut off, and can be handed to someone with no tooling at all; each run reads the prior interviews so views can diverge before they are reconciled. Use before planning or building anything non-trivial, or when the user says "interview", "gather requirements", "what does done mean", or "align on scope".
---

# feature-interview — one stakeholder, one sitting

**Model guidance:** Works well with Opus or Sonnet. This skill is freeform —
the quality of the interview is the quality of the follow-up questions, so it
asks more of the model than a fixed script does. Haiku is not recommended for
the adaptive loop; if Haiku is all that's available, fall back to working
straight down the probe bank in *When a thread runs dry* and say in the
artifact that you did. See the skopos repo's docs/model-capabilities.md.

Agentic delivery reaches 90% fast and stalls there, because the wrong thing
was assumed, not because the code was wrong. This interview exists to drag
those assumptions into text **before** anyone writes code.

You are interviewing **one** person. Interviews are asynchronous and portable:
each writes a standalone artifact that the next interview reads.

There is no question script. There is a contract of what the interview owes
downstream, and a loop that reads each answer and asks the next question. The
contract tells you when to stop.

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
   you've confirmed it's the same person continuing. A file marked
   `provisional` is a different case: that interview concluded, and you are
   extending it — see "Reopening a provisional interview."
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
7. **State the budget.** Roughly how many questions, roughly how long, and
   that they can stop at any point — anything unresolved gets written down as
   an open question with an owner, not lost. People answer more openly when
   the shape of the thing is visible and the exit is theirs.

**Order matters.** Interview the direction-setter first (product owner or
whoever owns the outcome), then delivery (tech lead), then the wider
stakeholders (director, adjacent team leads). Three is usually enough — stop
when a new interview stops producing new assumptions or new conflicts, not
when you hit a number.

## The coverage contract

This is what the interview owes the charter, and the only definition of
"finished" that matters. Every slot ends up **filled**, or explicitly
**unknown with a named owner** — an unknown closes a thread, it does not
leave one open.

| Slot | Filled when you have | Feeds |
|---|---|---|
| Outcome | Who is worse off today, and how they know | charter *Outcome* |
| Complete | At least one thing an outsider could observe | `AC*` |
| Verification surface | Where they'd look, who checks, what counts as proof | `AC*` *Verified where* |
| Assumptions | Each with confidence, **cheapest disproof**, **blast radius** | assumption ledger |
| Non-goals | At least one thing they'd refuse if offered | *Non-goals* |
| Disagreements | Their reaction to each conflict with an earlier interview | *Decisions required* |
| Open questions | Each with someone who could answer it | *Known unknowns* |

Cheapest disproof and blast radius are the two fields teams reconstruct badly
after the fact. Ask for them **while the assumption is still in the room** —
that is the main thing this loop buys you over a script.

The contract is also the resume state: the `Coverage` block in the artifact
says which slots are still open, which is more useful mid-loop than a phase
number.

## Checkpointing — interviews may span sessions

Don't wait until the end to write anything. A single sitting can get cut off
by a context limit, a closed tab, or the stakeholder just running out of
time — and nothing before Phase 5 is otherwise saved.

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
phase captured using the section headings from *The artifact* below (partial
sections are fine; a stakeholder resuming next week should see exactly
where they left off).

Phase 2 is a loop rather than a single pass, so checkpoint inside it: every
time a thread closes, refresh the `Coverage` block and any assumption rows
you've filled. A Phase 2 draft that says which slots are still open can be
resumed precisely; one that only says `skopos-interview-phase: 1` cannot.

Phase 5 replaces `in-progress` with `complete` or `provisional` and drops the
phase counter — see "Output your artifact."

## Picking up a cut-off interview

You detected this in "Before you ask anything." Once confirmed:

1. Read the draft back to them in a couple of sentences — not a full
   replay, just enough to place them: *"Last time you'd told me <what they
   said so far>, and we'd gotten as far as where you'd verify this. Want to
   keep going from there, or has anything changed since?"*
2. Resume at the phase **after** `skopos-interview-phase`. If that phase is
   2, resume inside the loop, on the open slots the `Coverage` block names —
   highest cost first, exactly as the loop does normally.
3. Never re-ask Phase 1's opening question if it's already answered — the
   anchoring concern only applies the first time.
4. If they'd rather restart clean, let them — overwrite the draft and begin
   at Phase 1 as normal.
5. Everything else (checkpointing, Phase 5, output) proceeds exactly as if
   this were one sitting. The budget resets: state a fresh one.

## Rules

- **One question at a time.** Wait for the answer. Never batch.
- **Their language, not yours.** Record the words they used. Do not translate
  "it should feel instant" into "p95 latency < 200ms" — that translation is
  itself an assumption, and it belongs to the charter, not to you.
- **Never propose the solution.** If they ask what you'd do, redirect once:
  "I'd rather capture what you need first — I'll bring options back."
- **Silence is data.** If they don't know, record "unknown" rather than
  guessing on their behalf.
- **Fatigue is a stop signal, not a push signal.** Shortening answers, a run
  of "I don't know", "like I said" — conclude, don't probe harder.

## Phase 1 — the opening question (unanchored)

Ask this first, before revealing anything from prior interviews. Anchoring
them early destroys the disagreement you are here to find. An adaptive
interviewer is *more* prone to leading than a scripted one, not less — this
opening is the guard against it, so keep it verbatim.

> Describe a feature you've put off — because of complexity, lack of
> alignment, or anything else. In your own words, what is it? What does
> **complete** look like to you? And where would *you* go to check whether it
> was delivered well?

Let them talk. Do not interrupt to classify. The loop starts on their answer.

## Phase 2 — the response loop

For every answer, in order: read it, decide what to ask, ask one question.

### Read the answer for six things

| What you find | What it means | What you do |
|---|---|---|
| **Vague qualifier** — "simple", "clean", "just", "fast", "obviously", "should be easy", "everyone knows" | An assumption is hiding inside a word you both think you share | Ask what it looks like concretely, using their word back |
| **Unverifiable claim of done** | A criterion nobody could check | Ask where they'd look, who checks it, what they'd accept as proof |
| **New assumption** — something stated as fact that nobody has checked | A ledger row | Give it an ID, then chase confidence, cheapest disproof, blast radius |
| **Scope boundary** — "we wouldn't bother with…", "that's a different project" | A non-goal, which is as load-bearing as a criterion | Confirm it explicitly so it can be written down as refused, not forgotten |
| **Collision with an earlier interview** | The disagreement you came for | **Hold it.** Do not spend it here — it belongs to Phase 4, unanchored |
| **Unknown, or a fatigue signal** | The thread is done | Record it with an owner, close the thread, move on |

An answer often carries three of these. That is normal — pick one, park the
rest as open threads.

### Choose the next question

Pick the open thread with the **highest cost if it stays unresolved**, not the
most recent one. A load-bearing assumption with no cheapest disproof beats a
vague adjective sitting inside a non-goal. An empty contract slot beats a thin
one. If nothing is open, go to *When a thread runs dry*.

### Question shape

Constrain the shape of what you ask; never constrain what they can say.

- **One question.** If it contains "and", it is two — ask the first.
- **Their vocabulary.** Quote the word they used back at them.
- **No hypothesis in the question.** "Is that because of the batch job?" hands
  them your answer. Ask "what makes that slow?" instead.
- **Open unless you are confirming a boundary.** Yes/no questions are for
  closing a non-goal, not for exploring.
- **Never ask for a number they'd have to invent.** A made-up threshold in
  their words becomes a real criterion in the charter.

### Depth cap

**At most two follow-ups on any one thread.** On the third, park it as an open
question with an owner and move on. Without this cap, "chase the vague" turns
into interrogation — and a director giving you twenty minutes will not give
you a second interview.

### When a thread runs dry

The probe bank below is a **prior, not a script**: consult it when the
conversation stalls or a contract slot is still empty, and ask the probe that
fills that slot. Never work down it in order, and never ask a probe whose slot
their own answers already filled.

This bank is also where `feature-retro` deposits lessons — a miss that was
knowable at interview becomes a probe here. Expect it to grow.

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

**Any role, when an assumption has just surfaced**
- What's the fastest way you'd find out you were wrong about that?
- If that turned out to be false after we'd built it, what gets thrown away?

### The exit ramp

Once you are past roughly two thirds of the stated budget, offer the choice
out loud: "I've got two threads left — keep going, or wrap and leave them as
open questions?" Their call, not yours.

## Phase 3 — the evaluation surface

Never conclude without this slot filled. It seeds the whole evaluation plan.
If the loop already covered it, confirm rather than re-ask.

- Where exactly would you look — URL, screen, dashboard, log, report, command?
- Who checks it: you, someone on your team, a customer?
- What would you consider proof, as opposed to "the demo worked"?

## Phase 4 — the divergence pass

Only now, if prior interviews exist — including every collision you held back
during the loop. Surface the two or three sharpest, attributed, not
anonymised, and ask them to react:

> The tech lead described "done" as the migration running clean in staging.
> You described it as the support queue dropping. Are both required, or is one
> of them the real bar?

Record the disagreement. **Do not negotiate it away** — reconciliation belongs
to `feature-charter`, and a conflict resolved silently in an interview is a
conflict that resurfaces during review.

## Phase 5 — read back, then decide whether you're done

### Stop when any one of these is true

- **Coverage.** Every contract slot is filled, or recorded unknown with an owner.
- **Saturation.** Two consecutive answers produced no new assumption, no new
  verification surface, and no new non-goal. This is the same test the loop
  applies to whole interviews, one level down.
- **Budget.** The stated budget is spent, or they called it.

### Then read back

Read your captured assumptions, non-goals and verification surfaces back in
one short list, and ask what's wrong. People correct a list far more readily
than they volunteer detail.

The read-back is a **test, not a ritual**:

- Corrections that open a **new load-bearing assumption** → one more round on
  that thread, then read back again.
- Corrections that are **cosmetic** — wording, a name, a detail that changes no
  criterion — → you're done. Write the artifact.

### Complete, or provisional

Both are real endings; `in-progress` is not.

- **`complete`** — every contract slot filled or owned, read-back clean.
- **`provisional`** — they ran out of time, or stopped, with slots still open.
  Write the full artifact anyway, carry the unfilled slots as open questions
  with owners, and say what a follow-up would need to cover.

Interviews are asynchronous and portable, so "complete in one sitting" is not
a real constraint. What is never acceptable is concluding by silence — every
interview ends with an artifact and a named state.

## The artifact

```markdown
---
skopos-artifact: interview
skopos-feature: <slug>
skopos-interview-status: complete | provisional
skopos-concluded-by: coverage | saturation | budget
skopos-updated: <ISO timestamp>
---

# Interview NN — <Name>, <Role>
Feature: <slug> · Date: <YYYY-MM-DD> · Interviewer: skopos

## In their words
> <the most load-bearing verbatim quotes — three or four, not a transcript>

## What "complete" means to them
- <bullet, observable where possible>

## Where they would verify it
- <surface: URL / screen / command / report> — checked by <who> — proof is <what>

## Assumptions surfaced
| ID | Assumption (their framing) | Confidence | Cheapest disproof | Blast radius |
|----|---------------------------|-----------|-------------------|--------------|
| A1 | <e.g. "existing accounts already have a verified email"> | stated / implied | <fastest thing that would show it's false> | <what has to be redone if it is> |

## Explicit non-goals
- <what they said they do NOT want>

## Disagreements with earlier interviews
- <attributed delta, unresolved on purpose>

## Open questions they could not answer
- <question> — owner: <who could answer>

## Coverage
| Slot | State |
|------|-------|
| Outcome | filled / unknown — owner <who> |
| Complete | filled / unknown — owner <who> |
| Verification surface | filled / unknown — owner <who> |
| Assumptions | <n> captured, <n> without a cheapest disproof |
| Non-goals | filled / none offered |
| Disagreements | <n> recorded / no prior interviews |
```

Keep assumption IDs unique **per feature**, not per interview — later
artifacts reference `A3` and must mean one thing. Before assigning an ID,
check the highest ID used in every prior interview for this feature; if
interviews ran in parallel and IDs collide, renumber yours and say so in the
artifact.

`Cheapest disproof` and `Blast radius` carry straight into the charter's
ledger. A row with an empty disproof is not finished — it is an open question,
so record it as one.

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

The packet is self-contained: the coverage contract, the response loop, and
the read-back-then-write artifact format are inline, so any AI chat interface
can run it from a paste with nothing installed. It carries the same method
this skill does — if you change the loop or the artifact here, change it
there too, or hand-off interviews will come back missing fields the charter
expects. It closes by asking the new stakeholder to either add their finished
interview to the system-of-record themselves (same as the normal process, if
they have access) or save it and send it back to whoever handed it to them —
email, Slack, Teams, whatever they'd normally use. Tell them which artifact
reference (ticket key, or "none yet") to mention when they do.

## Reopening a provisional interview

A `provisional` artifact has open slots and a named owner for each. When the
same stakeholder comes back with time to fill them, this is neither a resume
nor an amendment: reopen the file, work only the open slots from the
`Coverage` block, then re-run the read-back and set the status to `complete`.
Don't re-ask what's already answered.

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

Write the markdown artifact as shown above, replacing the checkpointed draft
in place — same filename, `skopos-interview-status` now `complete` or
`provisional`, `skopos-interview-phase` dropped. Then:

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

Report how the interview concluded, which stakeholders remain, and what the
sharpest unresolved conflict is. If any assumption lacks a cheapest disproof,
name it — that is the one the charter will struggle to rank. If the interview
ended `provisional`, say which slots are still open and who owns them.

If you produced a hand-off packet, say so and tell them to send it on now —
don't wait for `feature-charter` to notice the interview never came back.

When interviews saturate, run `feature-charter`.
