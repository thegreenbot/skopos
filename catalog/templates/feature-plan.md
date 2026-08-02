---
name: feature-plan
description: Default shape for a phased implementation plan whose first phase is a spike that tests the riskiest charter assumption. Pairs with catalog/skills/feature-plan/SKILL.md.
---

# Implementation plan — <feature name>
Feature: <slug> · Charter status: <signed off | draft> · Date: <YYYY-MM-DD>

## Approach
<Two or three sentences. The shape of the solution and the one real trade-off.>

## Rejected alternatives
- <option> — rejected because <reason>

## Scout findings
| Question | Finding | Anchor |
|----------|---------|--------|
| <q> | <answer> | <file:line> |

## Phase 0 — spike: <assumption ID>
- Sandbox: <where>
- Signal: holds if <x>; stop and reopen charter if <y>
- Timebox: <n>
- Disposal: <thrown away | graduates>

## Phase 1 — <name>  (serves AC1, AC3 · depends on A2)
1. `<path>` — <change>
2. `<path>` — <change>
Verify: `<command>` → <expected>
Blast radius: <what could break> · defended by <test>

## Operational plan
Migration: … · Rollout: … · Observability: … · Failure modes: … · Security: … · Docs: …

## Estimate and confidence
<Phase: size, and where the uncertainty actually sits.>

## Signoff
- [ ] <Tech lead> — approach, sandbox, and rollback are sound
