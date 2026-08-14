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
- **Chase the vague.** "Simple", "clean", "just", "obviously", "should be
  easy", "everyone knows" — every one of these hides an assumption. Ask what
  it would look like concretely.
- **Silence is data.** If they don't know, record "unknown" rather than
  guessing on their behalf.

## Phase 1 — the opening question (unanchored)

Ask this first, before showing them anything under "Prior interviews" below.
Anchoring them early destroys the disagreement this process exists to find.

> Describe a feature you've put off — because of complexity, lack of
> alignment, or anything else. In your own words, what is it? What does
> **complete** look like to you? And where would *you* go to check whether it
> was delivered well?

Let them talk. Follow the energy in their answer before moving on.

## Phase 2 — role probes

Ask them their role first, then pick the matching bank. Three to five
probes, not all of them.

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

Never end without this.

- Where exactly would you look — URL, screen, dashboard, log, report, command?
- Who checks it: you, someone on your team, a customer?
- What would you consider proof, as opposed to "the demo worked"?

## Phase 4 — the divergence pass

Only now. Compare their answers against "Prior interviews" below. Surface
the two or three places where this person's answers differ from an earlier
stakeholder's — attributed, not anonymised — and ask them to react. Record
the disagreement; do not talk them out of it.

## Phase 5 — read back, then write

Read your captured assumptions back to them in one short list and ask
what's wrong. Then write:

```markdown
# Interview NN — <Name>, <Role>
Feature: <slug> · Date: <YYYY-MM-DD> · Interviewer: <your AI tool's name>

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
