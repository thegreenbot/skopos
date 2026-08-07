'use strict';

// Model preference signaling — when Skopos delegates work (rendering an agent
// for a target, or handing a task to another platform/agent), it can signal
// which model would suit the work best and why, without forcing a choice.
// The receiving platform weighs this alongside cost, availability, and its
// own policy; Skopos never enforces the outcome. See docs/model-routing-guide.md.

const { CAPABILITIES, DEPTH_RANK, TOOLUSE_RANK, COST_RANK, modelsInFamily } = require('./model-capabilities');
const { requirementsFor } = require('./model-advisor');

// Order a family's models weakest → strongest, so the cheapest sufficient
// model can be picked first and the rest form a strength-ordered fallback.
// Cost is the tiebreaker when two models are equally capable, so "cheapest
// sufficient model" (the claim `signalForAgent` makes) is actually true.
function familyRankedWeakToStrong(family) {
  return modelsInFamily(family).sort((a, b) => {
    const ca = CAPABILITIES[a];
    const cb = CAPABILITIES[b];
    return (DEPTH_RANK[ca.reasoningDepth] - DEPTH_RANK[cb.reasoningDepth])
      || (TOOLUSE_RANK[ca.toolUse] - TOOLUSE_RANK[cb.toolUse])
      || (COST_RANK[ca.costTier] - COST_RANK[cb.costTier]);
  });
}

function meetsRequirements(capabilities, requirements) {
  return DEPTH_RANK[capabilities.reasoningDepth] >= DEPTH_RANK[requirements.reasoningDepth]
    && TOOLUSE_RANK[capabilities.toolUse] >= TOOLUSE_RANK[requirements.toolUse];
}

// Build a preference signal for one agent within one model family. Not a
// directive: `preferredModel` is the cheapest model in the family that meets
// the agent's inferred requirements, `fallback` orders the remaining models
// strongest-first for when the preferred one isn't available.
function signalForAgent(agent, family = 'claude') {
  const requirements = requirementsFor(agent);
  const ranked = familyRankedWeakToStrong(family); // weak -> strong

  if (!ranked.length) {
    return {
      agent: agent.name, family, requirements,
      preferredModel: null, fallback: [],
      rationale: `no known models registered for family '${family}'`,
      note: 'This is a preference signal, not a directive — the delegating platform makes the final routing decision.',
    };
  }

  const capable = ranked.filter((name) => meetsRequirements(CAPABILITIES[name], requirements));
  const preferredModel = capable[0] || ranked[ranked.length - 1];
  const fallback = ranked.filter((name) => name !== preferredModel).reverse(); // strongest-first

  const rationale = capable.length
    ? `'${agent.name}' needs ${requirements.reasoningDepth} reasoning and ${requirements.toolUse} tool-use (${requirements.toolCount} tool(s)); '${preferredModel}' is the most cost-efficient ${family} model that meets this.`
    : `'${agent.name}' needs ${requirements.reasoningDepth} reasoning and ${requirements.toolUse} tool-use (${requirements.toolCount} tool(s)); no known ${family} model fully meets this — '${preferredModel}' is the strongest available.`;

  return {
    agent: agent.name, family, requirements,
    preferredModel, fallback, rationale,
    note: 'This is a preference signal, not a directive — the delegating platform makes the final routing decision.',
  };
}

module.exports = { signalForAgent, familyRankedWeakToStrong, meetsRequirements };
