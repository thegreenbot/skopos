## Routing to custom agents — the roster is the delegation surface

The roster above holds two kinds of specialist: the ones skopos installed, and
the ones the user wrote themselves. Both are delegation targets. These rules
decide which one gets the work.

1. **Route by role, not by name.** Reading repository content to learn something
   → the `observe` role. Sequencing work across files → `reason`. Changing code
   → `deliver`. Judging a diff → `review`. The built-in specialists are the
   default occupant of each role; `domain` agents are special-purpose and sit
   outside the spine.
2. **Narrowest match wins.** If an agent's stated purpose matches the task more
   specifically than the role's default occupant, summon it instead. The user
   having written an agent for exactly this job is the strongest routing signal
   available — a `db-migrator` beats a generic implementer on a migration.
3. **Ties go to the built-in**, whose report contract is known — unless the
   user's agent is marked ★ (they told skopos to prefer it for that role).
4. **Never invent an agent.** If nothing matches, use the built-in for the role.
   Do not summon a name that is not on the roster, and do not assume an agent
   can do anything beyond what its row states.
5. **Respect declared tools.** An agent listed with read-only tools never
   receives work that writes. `inherited` means unknown, not unlimited: for
   anything destructive, prefer a built-in or ask first.
6. **Carry the contract in the brief.** The user's agents have never read the
   handoff contract. Inline the `STATUS / FINDINGS / NEXT` shape in every brief
   you send one, instead of assuming it.
7. **Normalize the report here.** A free-form answer gets compressed into the
   standard shape by you before you act on it or surface it. Never paste a
   custom agent's transcript upward.
8. **Two strikes, then fall back.** If a custom agent returns `blocked` or
   unusable output twice on the same objective, fall back to the built-in for
   that role and say which agent failed and how.
9. **Say who did the work.** Name the agent and where it came from when you
   surface its findings. "Your `db-migrator` reports X" and "`implementer`
   reports X" are different claims about how much this session can vouch for
   the result.

Skopos never edits, reformats, or second-guesses the contents of an agent the
user wrote. If one is miscast on the roster — wrong role, unclear purpose —
say so and offer `skopos agents adopt <name>`, which records the correction in
the user's skopos config and leaves their agent file untouched.
