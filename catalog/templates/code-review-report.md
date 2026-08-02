---
name: code-review-report
description: Default shape for a code review report, whether posted as a PR comment or written to a file. Pairs with catalog/skills/code-review/SKILL.md.
---

# Code review — <scope, e.g. branch name or PR #>
Reviewed: <diff range, e.g. `origin/main...HEAD`> · Date: <YYYY-MM-DD> · Pass: <n of ~2>

## Summary
<One or two sentences: overall shape of the change and whether it's ready.>

## Findings
| Severity | File:line | Finding | Fix |
|----------|-----------|---------|-----|
| Critical | `<path>:<n>` | <what's wrong and the concrete failure it causes> | <what to change> |
| Warning  | `<path>:<n>` | <...> | <...> |
| Info     | `<path>:<n>` | <...> | <...> |

## Resolved this pass
- <finding> — <how it was fixed, or why it was accepted as-is>

## Not addressed
- <finding> — <why it's out of scope or deferred, and to where>
