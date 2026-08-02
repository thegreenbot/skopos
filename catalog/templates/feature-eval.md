---
name: feature-eval
description: Default shape for an evaluation plan — step-by-step acceptance procedures, negative scenarios, and assumption probes a person who didn't build the feature can follow. Pairs with catalog/skills/feature-eval/SKILL.md.
---

# Evaluation plan — <feature name>
Feature: <slug> · Charter: <signed off | draft> · Date: <YYYY-MM-DD>

## Where to look
| Surface | URL / command | Environment | Access needed |
|---------|---------------|-------------|---------------|
| <name> | `<exact>` | staging | <role> |

## Setup (once)
1. <how to get into a position to test at all>

## Acceptance procedures
T1 · AC1 — <what this proves>
  Preconditions: <account/role/data/flags>
  Steps:
    1. Go to <exact URL>
    2. <exact action>
  Expect: <exactly what appears / returns / changes>
  If it fails: <what that most likely means — helps them report usefully>

## Negative scenarios
N1 · <scenario, e.g. empty state, bad input, permissions, boundary, concurrency> — expected graceful behaviour: <...>

## Assumption probes
P1 · A2 — "<assumption text>"
  Probe: <query/action against real-shaped data>
  Assumption holds if: <condition>
  If it breaks: <which criteria and which plan phases are invalidated>

## Out of scope for this pass
- <what this evaluation deliberately does not cover, so silence isn't mistaken for coverage>

## Result log
| Date | Who | Passed | Failed | Notes |
|------|-----|--------|--------|-------|

## Signoff
- [ ] <Direction owner> — if all of this passes, I will call the feature done
