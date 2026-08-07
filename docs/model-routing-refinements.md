# Refined GitHub Issues: Model Routing Influence

## Overview
These issues have been refined to focus on **influencing** model routing decisions rather than **determining** them. The key insight is that each AI platform ultimately controls which model gets used, but Skopos can provide valuable metadata, capability profiles, and delegation context that inform those decisions—especially when delegating work to other AI agents or platforms.

---

## Issue #17: Add model capability metadata for informed routing
**Current Title:** Add model capability validation for skill discovery  
**Refined Title:** Add model capability metadata for informed routing

### Refined Description

When delegating work or presenting available skills to a model, Skopos should gather and expose model capability metadata so that downstream systems (AI platforms, agents, tools) can make informed routing decisions.

**Problem Statement:**
- Skill discovery in Skopos is currently model-agnostic
- There's no centralized record of model capabilities (tool use levels, concurrent tool limits, reasoning complexity, etc.)
- When delegating work, Skopos has no way to communicate model constraints to platforms that will ultimately choose which model to use
- Users and systems downstream lack visibility into whether a selected model is well-suited for available skills

**Example Scenario:**
A user or delegating agent could provide a set of required skills. Skopos should be able to communicate: "These skills require tool-use capability, support for parallel tool calls, and complex reasoning—Opus is a good fit, Sonnet can handle most of it, Haiku will struggle."

**Implementation Approach:**
- Define a model capability metadata schema (tool support, reasoning levels, constraints)
- Gather capability data for all supported models
- Expose this metadata via API/CLI so downstream systems can use it in their routing decisions
- Document constraints and best-fit scenarios for each model-skill combination

**Key Actions:**
1. Create `lib/model-capabilities.json` - Centralized model metadata
2. Build capability registry with fields for: tool-use, concurrent-tools, reasoning-depth, cost-tier, availability
3. Export capability data so platforms and agents can query it when routing work
4. Add warnings/advisories when a skill set may be challenging for a particular model
5. Document the capability matrix for user reference

**Note:** This is a foundation for influencing decisions, not a guarantee. Platforms will use this data as they see fit.

---

## Issue #18: Improve model preference signaling when delegating work
**Current Title:** Improve auto-model selection to consider skill compatibility  
**Refined Title:** Improve model preference signaling when delegating work

### Refined Description

When Skopos delegates work to other agents or platforms, it should provide clear, contextual guidance about which models would be best suited for the task—not by forcing a selection, but by signaling preferences and constraints based on the Skopos persona, delegation context, and available skills.

**Problem Statement:**
- Current auto-selection uses only tier mapping (smart→opus, fast→sonnet) without considering the delegation context
- When delegating, Skopos provides no information about model preferences to the platform making the actual routing decision
- There's no feedback loop if a delegated task fails because the routing choice was suboptimal
- Different Skopos personas might have different model preferences (e.g., detailed documentation tasks benefit from Opus; quick summaries work fine on Haiku)

**Example Scenario:**
When delegating a complex feature charter, Skopos could signal: "This task benefits from Opus-level reasoning and planning. If Opus is unavailable, Sonnet is acceptable but less optimal. Haiku would struggle." The receiving platform considers this signal along with cost, availability, and other factors before making the final choice.

**Implementation Approach:**
- Move from "auto-select" (deterministic) to "preference signaling" (informational)
- Define routing preferences per Skopos persona and task type
- Signal preferences when delegating (via metadata, headers, or context objects)
- Provide fallback guidance if the preferred model isn't available
- Let platforms interpret signals according to their own policies

**Key Actions:**
1. Update config to map personas to model preferences (not just tiers)
2. Create delegation context that includes model preference guidance
3. Expose preference data so delegating frameworks can use it
4. Add skill-aware preference logic (if delegating a tool-heavy task, signal Opus preference)
5. Document how Skopos preferences influence but don't determine routing

**Note:** This is about providing good information, not controlling outcomes.

---

## Issue #19: Add cross-model testing and documentation for routing decisions
**Current Title:** Add cross-model testing for skill discovery and tool use  
**Refined Title:** Add cross-model testing and documentation for routing decisions

### Refined Description

Skopos should maintain comprehensive documentation and test coverage across multiple models to help users and systems make informed routing decisions. This ensures that when models are chosen (by platforms, users, or delegates), those choices are backed by known compatibility data.

**Problem Statement:**
- No systematic testing validates which model tiers work well with which Skopos skills
- Skill incompatibility issues are discovered reactively (by users) rather than proactively
- Platforms making routing decisions have no reference data about Skopos skill-model compatibility
- Documentation doesn't guide users on model selection for different Skopos workflows

**Testing Gaps:**
- Cross-model skill execution tests (Opus, Sonnet, Haiku with each skill)
- Auto-preference validation (does the signaling match real-world performance?)
- Fallback scenarios (what happens when the preferred model isn't available?)
- Cost-performance tradeoffs (which model offers best value for each skill?)

**Implementation Approach:**
- Build a skill-model compatibility matrix
- Run integration tests across all model tiers
- Document real-world performance characteristics
- Capture edge cases and workarounds
- Make this data available for routing decisions

**Key Actions:**
1. Create comprehensive skill-model compatibility documentation
2. Add integration tests that validate skills across all supported models
3. Build a performance/cost matrix (execution time, token usage, success rate per model)
4. Document edge cases and known limitations
5. Export test results so routing systems can query compatibility data
6. Add CI/CD checks to prevent regressions

**Note:** This data informs decisions made by platforms and agents; it doesn't enforce them.

---

## Issue #20: Document model routing preferences and constraints
**Current Title:** Document model compatibility and skill requirements  
**Refined Title:** Document model routing preferences and constraints

### Refined Description

Skopos should provide clear, comprehensive documentation that helps users, platforms, and delegating agents understand model routing options, preferences, and constraints. This documentation enables better-informed decisions when models are selected.

**Problem Statement:**
- Users don't know which models work well with which Skopos skills/workflows
- No single source of truth for model-skill compatibility
- When delegating, there's no documented guidance for platforms to follow
- Skill requirements aren't documented in a way that informs model selection

**Documentation Needed:**

### 1. **Model Capability Reference** (`docs/model-capabilities.md`)
   - Opus: Multi-step reasoning, tool orchestration, complex workflows
   - Sonnet: Balanced reasoning and speed; most Skopos skills work well
   - Haiku: Fast responses, simple tool use; some complex features limited
   - Clear capability matrix with tool-support, reasoning-depth, limits

### 2. **Skill Model Requirements** (per-skill guidance)
   - Update each skill's `SKILL.md` with: "Works best with: Opus/Sonnet. Can use: Haiku (with limitations)."
   - Note any skills that strongly benefit from specific model capabilities
   - Example: Feature planning → Opus preferred; bug triage → Haiku fine; delegation → Opus recommended

### 3. **Model Routing Guide** (`docs/model-routing-guide.md`)
   - When Skopos persona prefers certain models
   - How to signal preferences when delegating
   - Fallback strategies if preferred model unavailable
   - Cost vs. capability tradeoffs

### 4. **Delegation Guidance** (`docs/delegation.md` update)
   - How to provide model preference context when delegating
   - How receiving systems should interpret Skopos preference signals
   - Examples of good delegation with clear model guidance

**Implementation Approach:**
- Create a capability reference that's both human-readable and machine-queryable
- Document each skill's model requirements clearly
- Provide clear guidance for users selecting models
- Enable platforms to understand Skopos's routing philosophy

**Key Actions:**
1. Write `docs/model-capabilities.md` with comprehensive matrix
2. Write `docs/model-routing-guide.md` with decision framework
3. Update each skill's documentation with model requirements
4. Update README to link routing guidance
5. Add examples of good model selection for common workflows

**Note:** This documentation informs decisions; it doesn't enforce them. Platforms and users remain in control.

---

## Summary

These refined issues reframe model routing from "Skopos determines which model runs" to "Skopos provides high-quality information and preferences that influence routing decisions made by platforms, users, and delegating agents."

The key philosophical shift:
- **Before:** Skopos selects/validates/enforces model choice
- **After:** Skopos signals preferences, documents capabilities, and provides metadata that helps others make better routing decisions

This approach respects platform autonomy while empowering Skopos to have meaningful influence through information and delegation context—especially when delegating work to other agents or systems.
