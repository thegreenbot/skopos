---
name: feature-charter
description: Distill stakeholder interviews into a feature charter — observable acceptance criteria, an assumption ledger, explicit non-goals, and the conflicts that still need a human decision. This is the definition of "complete" that the implementation plan, the evaluation plan, and the retro all measure against. Use after two or more feature-interview runs, or when the user asks for a definition of done, acceptance criteria, or scope alignment.
---

# feature-charter — what "complete" means, in writing

**Model guidance:** Works best with Opus — reconciling divergent stakeholder views into one coherent charter is the most judgement-heavy step in the delivery loop. Sonnet is acceptable; Haiku is not recommended. See the skopos repo's docs/model-capabilities.md.

The charter reconciles several stakeholders' views of done into one document
everybody can be held to. It is the contract; everything downstream cites it.

**Artifact:** `docs/skopos/features/<slug>/charter.md`

## Inputs

Collect interviews from all sources:
1. Local files under `docs/skopos/features/<slug>/interviews/` — treat a
   file as an interview unless its frontmatter says otherwise. Skip two
   kinds explicitly: `skopos-interview-status: in-progress` drafts
   (unfinished, not yet reconciled — see `feature-interview`'s
   checkpointing) and `skopos-artifact: interview-handoff` packets (a
   template for producing an interview, not one itself; its presence means
   that stakeholder is still out for interview). Files with no frontmatter
   at all are older interviews and count as complete.
2. If `systemOfRecord.enabled: true`, fetch interviews from your configured system (Jira, GitHub, etc.).
   - Try to list all artifacts matching the feature slug.
   - If successful, show what you found and add them to the pool.
   - If failed and `onFailure: fail`, stop and ask them to provide interviews manually (see below).
   - If failed and `onFailure: warn`, warn and continue.
3. Ask if they have pasted interviews from other tools (Slack threads, emails, copy-paste) to add to the pool.

Once you have collected all interviews from all sources, reconcile them together as if they were all local.
If only one interview exists (combined from all sources), say so and offer to run `feature-interview` for
the missing perspective — a single-stakeholder charter is a scope risk, not a charter.

Also read `docs/skopos/GUIDANCE.md` if it exists.

## Rules

- **Reconcile, don't average.** Where stakeholders disagree, the answer is
  rarely the midpoint. Either one view is the real bar, or both are required
  and the scope is bigger than anyone said. Name which.
- **Never resolve a conflict by picking quietly.** If a decision needs a
  human, it goes in *Decisions required*, with a recommendation and the cost
  of each option. Unresolved is an acceptable state; invisible is not.
- **Every criterion is observable by someone who didn't build it.** If you
  cannot say where a person would look and what they would see, it is not a
  criterion yet — it is an intention.
- **Attribute.** Each criterion carries whose need it serves; that is what
  makes it defensible when scope is cut.
- **The ledger is the point.** An assumption that nobody wrote down is the
  one that costs a rebuild. Carry every assumption forward from the
  interviews, add the ones the interviews implied, and rank them.

## Building the assumption ledger

For each assumption, fill four fields. The third is the one people skip and
the one that pays:

| Field | Question it answers |
|---|---|
| Assumption | What are we taking as true without having checked? |
| Held by | Who believes it — and does anyone disagree? |
| **Cheapest disproof** | What is the fastest, smallest thing that would show this is false? |
| Blast radius | If it's false and we find out after building: what has to be redone? |

Rank by `blast radius × uncertainty`. The top one or two drive the spike in
`feature-plan` — you buy down risk by testing assumptions early, not by
building carefully.

Classify each as:
- **Load-bearing** — the design collapses if it's wrong. Must be probed before or during the spike.
- **Contained** — wrong means local rework. Probe it in the evaluation plan.
- **Cosmetic** — wrong means a tweak. Record and move on.

## Artifact format

Use the `feature-charter` template (`~/.agents/templates/feature-charter.md`,
shipped by skopos and shown/overridable during `skopos-setup`) as the
skeleton. Don't improvise a different shape — if the template doesn't fit,
that's a signal to revise the template, not to freelance this one charter.

## Gate

The charter is **signed off** when every stakeholder interviewed has ticked
their box and no `Decisions required` row is still `open`. Until then,
downstream skills may run but must print the charter's status at the top of
their output — nobody should discover mid-implementation that the bar moved.

## Output your charter

Write the markdown artifact using the `feature-charter` template. Then:

**If `systemOfRecord.enabled: true` and `systemOfRecord.publish.charter: true`:**
1. Try to publish the charter to your configured system (Jira, GitHub, etc.).
   - If successful: Report the remote artifact link. The team can reference it across tools.
   - If failed and `onFailure: fail`: Stop and ask them to upload manually (see below).
   - If failed and `onFailure: warn`: Warn them, then proceed to manual copy-paste (see below).

**Always provide manual fallback:**
- Show the markdown in a fenced code block for copy-paste (with "Copy to clipboard" if in web).
- Provide a downloadable file `<feature-slug>-charter.md` they can save and share.

**Attribution & context:**
- If `systemOfRecord.publish.includeCommitSha: true`, append the commit SHA of the current repo
  to the frontmatter (helps trace which version of code prompted this charter).

## Next

Run `feature-plan` (implementation) and `feature-eval` (evaluation). They can
be produced in parallel; both must be signed off before implementation starts.
