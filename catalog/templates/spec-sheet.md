---
name: spec-sheet
description: Default shape for docs/spec-sheet.md — a durable map of what a repo is (architecture, entry points, data model, dependencies, interfaces). Pairs with catalog/skills/spec-sheet/SKILL.md.
---

## 1. Metadata
| Key | Value |
|---|---|
| Repo | |
| Primary stack | |
| Default branch | |
| Last validated | |
| Spec version | 1.0 |

## 2. Repository Purpose
<2-5 sentences describing business purpose and technical role.>

## 3. System Boundaries
### In scope
-

### Out of scope
-

### Upstream dependencies
- :

### Downstream consumers
- :

## 4. Top-Level Structure
| Path | Type | Purpose | Notes |
|---|---|---|---|
| /src/... | code | | |
| /config/... | config | | |
| /test/... | tests | | |

## 5. Runtime / Build / Test
| Concern | Command | Notes |
|---|---|---|
| Install | `` | |
| Build | `` | |
| Unit tests | `` | |
| Integration tests | `` | |
| Lint | `` | |

## 6. Domain Model / Core Concepts
| Concept | Definition | Source of truth |
|---|---|---|
| | | |

## 7. Public Interfaces
### 7.1 APIs / Endpoints
| Interface | Method | Path/Name | Input | Output | Auth | Source |
|---|---|---|---|---|---|---|
| | | | | | | |

### 7.2 Events
| Event name | Producer | Consumer(s) | Payload shape | Source |
|---|---|---|---|---|
| | | | | |

### 7.3 Config surface
| Key | Type | Default | Allowed values | Effect | Source |
|---|---|---|---|---|---|
| | | | | | |

## 8. Feature/Component Catalog
| Feature/Component | Primary files | Key symbols | Related tests | Notes |
|---|---|---|---|---|
| | | | | |

## 9. Change Impact Map
### If changing `<area>`
1. Update:
2. Validate:
3. Coordinate with:

### High-risk areas
- :

## 10. Observability / Debugging
| Concern | Where to look | Signal |
|---|---|---|
| Logs | | |
| Metrics | | |
| Tracing | | |

## 11. Security / Compliance Constraints
-
-
-
-

## 12. Known Gaps / Open Questions
-

## 13. Quick Answers (for interrogator fast-path)
- **Where is `<X>` implemented?**
- **Where is config for `<X>`?**
- **Which tests validate `<X>`?**
- **Primary entrypoint(s)?**
