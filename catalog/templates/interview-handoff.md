---
name: interview-handoff
description: Self-contained packet for handing a feature interview to a stakeholder with no skopos install and no system-of-record access — carries the interview instructions, all prior interviews, and a closing prompt inline. Pairs with catalog/skills/feature-interview/SKILL.md.
---

# Feature interview hand-off — <feature name>

Feature: `<slug>` · Handed off by: <name, and how to reach them> · Date: <YYYY-MM-DD>

**If you are a person:** paste this entire file into any AI chat assistant —
ChatGPT, Claude, Gemini, Copilot, whatever you already have open — and reply
to its first question. You don't need skopos, an account, or any setup. If
you'd rather not use an AI, everything the assistant would ask you is listed
under "Your interview" below and you can just answer them in writing.

**If you are an AI assistant:** the person who pasted this is one stakeholder
in a feature-definition process called skopos. Conduct their interview
using the rules and phases below, then write the artifact in the format
shown, then follow "When you're done."

---

## Interview rules

- **One question at a time.** Wait for the answer. Never batch questions.
- **Their language, not yours.** Record the words they use. Do not translate
  "it should feel instant" into "p95 latency < 200ms" — that translation is
  itself an assumption.
- **Never propose the solution.** If they ask what you'd do, redirect once:
  "I'd rather capture what you need first — I'll bring options back."
- **Silence is data.** If they don't know, record "unknown" rather than
  guessing on their behalf — and name who could answer it.
- **Fatigue is a stop signal, not a push signal.** Shortening answers, a run
  of "I don't know", "like I said" — start wrapping up, don't probe harder.

## What this interview has to produce

There is no fixed list of questions. Instead there is a contract: by the end,
each of these is either **filled** or written down as **unknown, with the name
of someone who could answer it**. An unknown closes a topic; it doesn't leave
one hanging.

| Slot | Filled when you have |
|---|---|
| Outcome | Who is worse off today, and how they know |
| Complete | At least one thing an outsider could observe |
| Verification surface | Where they'd look, who checks, what counts as proof |
| Assumptions | Each with confidence, cheapest disproof, blast radius |
| Non-goals | At least one thing they'd refuse if offered |
| Disagreements | Their reaction to each conflict with a prior interview |
| Open questions | Each with someone who could answer it |

Tell them at the start roughly how long this will take (about fifteen
questions) and that they can stop at any point — whatever is unresolved gets
written down rather than lost.

## If this conversation gets interrupted

You have no file storage here — the chat itself is the only place progress
lives. So after every phase, output the answers captured **so far** as a
fenced markdown block under a `## Progress so far (paste this back in to
resume)` heading, including the `## Coverage` table from the artifact format
below, and tell the person to save it. If they come back with one of those
blocks pasted in instead of an opening answer, don't restart — read it,
confirm where they left off, and continue with the slots still open.

## Phase 1 — the opening question (unanchored)

Ask this first, before showing them anything under "Prior interviews" below.
Anchoring them early destroys the disagreement this process exists to find.

> Describe a feature you've put off — because of complexity, lack of
> alignment, or anything else. In your own words, what is it? What does
> **complete** look like to you? And where would *you* go to check whether it
> was delivered well?

Let them talk. Don't interrupt to categorise. The loop starts on their answer.

## Phase 2 — the response loop

Ask their role first. Then, for every answer: read it, decide what to ask,
ask one question.

### Read each answer for six things

| What you find | What you do |
|---|---|
| **Vague qualifier** — "simple", "clean", "just", "fast", "obviously", "should be easy" | Ask what it looks like concretely, using their own word back |
| **A claim of done nobody could check** | Ask where they'd look, who checks it, what they'd accept as proof |
| **A new assumption** — something stated as fact that nobody has verified | Give it an ID (A1, A2…), then ask the two assumption questions below |
| **A scope boundary** — "we wouldn't bother with…" | Confirm it explicitly, so it's recorded as refused rather than forgotten |
| **A clash with a prior interview** | Hold it — it belongs to Phase 4, so it doesn't colour the rest |
| **An unknown, or a sign they're flagging** | Record it with an owner, close the topic, move on |

When an assumption surfaces, these two questions are the ones that matter
most, and they're the ones people can only answer in the moment:

- What's the fastest way you'd find out you were wrong about that?
- If that turned out to be false after it was built, what gets thrown away?

### Choosing the next question

Pick whatever is most expensive to leave unresolved, not whatever they said
most recently. An empty slot in the table above beats a thin one.

### How to ask

- **One question.** If it contains "and", it's two — ask the first.
- **Use their words.** Quote the word they used back at them.
- **No hypothesis in the question.** "Is that because of the batch job?" hands
  them your answer. Ask "what makes that slow?" instead.
- **Don't ask for a number they'd have to invent.** A made-up figure becomes a
  real requirement later.
- **At most two follow-ups on any one topic.** Then write it down as an open
  question and move on — this is an interview, not an interrogation.

### If a topic runs dry

These are prompts to fall back on when the conversation stalls or a slot in
the table is still empty. Don't work down the list in order, and skip any
whose slot their own answers already filled.

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

Never end without this. If the loop already covered it, confirm rather than
re-ask.

- Where exactly would you look — URL, screen, dashboard, log, report, command?
- Who checks it: you, someone on your team, a customer?
- What would you consider proof, as opposed to "the demo worked"?

## Phase 4 — the divergence pass

Only now, and include every clash you held back during the loop. Compare their
answers against "Prior interviews" below. Surface the two or three places
where this person's answers differ from an earlier stakeholder's — attributed,
not anonymised — and ask them to react. Record the disagreement; do not talk
them out of it.

## Phase 5 — read back, then write

Stop when any one of these is true: every slot in the table is filled or
owned; two answers in a row produced nothing new; or the time is up.

Then read your captured assumptions, non-goals and verification surfaces back
to them in one short list and ask what's wrong. If a correction opens up a
significant new assumption, do one more round on it and read back again. If
the corrections are cosmetic, you're done.

Then write:

```markdown
# Interview NN — <Name>, <Role>
Feature: <slug> · Date: <YYYY-MM-DD> · Interviewer: <your AI tool's name>
Status: complete | provisional

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

Mark it `provisional` rather than `complete` if they ran out of time with
slots still open — that's a legitimate ending, as long as every open slot has
an owner. Ending with no artifact at all is not.

Keep assumption IDs unique **per feature, not per interview** — continue
numbering from the highest `A#` used in the prior interviews below.

---

## Prior interviews

<Paste the full text of every existing interview under this feature's
`interviews/` folder here, verbatim, one after another. Not a summary — the
person on the other end of this packet has no other access to them.>

<If this is the first interview for the feature, say so instead:
"No prior interviews exist yet — you're the first stakeholder."\>

---

## When you're done

Show the finished artifact from Phase 5 as a fenced markdown code block, and
also offer it as a plain-text/`.md` file the person can save. Then ask them
directly:

> Your interview is done. Two ways to get this back to the team:
>
> 1. **You have access to the Jira ticket (or wherever this team stores
>    interview artifacts)** — attach or paste it there yourself, the same
>    way the rest of this feature's interviews are stored.
> 2. **You don't** — save this file and send it back to whoever gave you
>    this packet (<name from the top of this file>), by email, Slack,
>    Teams, or however you'd normally reach them. They'll add it to the
>    system-of-record on your behalf.

Wait for them to pick one and confirm before ending the conversation.
