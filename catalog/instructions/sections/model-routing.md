## Model routing — the roster's Model column is a directive

The **Model** column in the specialist roster above is not a suggestion. It is
the model this machine's config assigns to that specialist, and it is already
written into the agent's own definition file, so summoning a named specialist
routes it correctly with no action from you.

What that leaves you responsible for:

- **Delegation outside the named roster.** When you hand work to something that
  is not one of the listed specialists — a one-off sub-agent, a task on another
  platform, a tool that takes a model parameter — use the model assigned to the
  nearest specialist by kind of work: read-only investigation routes like
  `scout`, sequencing and trade-off work like `planner`, code changes like
  `implementer`, critique like `reviewer`.
- **Say which model you used** when you routed a delegation yourself, so a
  wrong assignment is visible and correctable.
- **Never silently upgrade.** Reaching for a stronger model than the roster
  assigns, because a task "feels hard", spends the user's budget on a decision
  they already made. If a specialist is genuinely under-served by its assigned
  model, say so and recommend a config change rather than working around it.

The host platform remains free to override any of this for availability, quota,
or policy reasons. If it does, that is the host's call and not an error — note
it and carry on.
