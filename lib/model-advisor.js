'use strict';

// Model advisor — turns an agent's declared tier + tool footprint into
// concrete capability requirements, then checks those requirements against
// the model a target adapter actually resolves for it (lib/model-capabilities.js).
//
// This is advisory only: it produces warnings for `skopos install`/`update`
// and standalone `skopos models check`, but never blocks a render. Each AI
// platform still decides which model actually runs. See docs/model-capabilities.md.

const adapters = require('../adapters');
const { capabilitiesFor, allModels, DEPTH_RANK, TOOLUSE_RANK } = require('./model-capabilities');

// An agent's `model: smart|fast` tier is the author's signal of how much
// reasoning the work needs; its tool list is a proxy for how much tool-use
// sophistication it needs. Both are heuristics, not hard schema — see
// docs/model-capabilities.md for the reasoning.
function requirementsFor(agent) {
  const tier = agent.data && agent.data.model;
  const tools = (agent.data && agent.data.tools) || [];
  // 'fast' maps to 'simple', not 'moderate': it's the tier authors reach for
  // when an agent explicitly doesn't need heavy reasoning, so the cheapest
  // model with only 'simple' depth (haiku) should be able to satisfy it.
  const reasoningDepth = tier === 'smart' ? 'complex' : 'simple';
  const toolUse = tools.length > 3 || tools.includes('shell') ? 'advanced' : 'basic';
  return { reasoningDepth, toolUse, toolCount: tools.length };
}

// Assess one (agent, resolvedModel) pair.
function assess(agent, resolvedModel) {
  const requirements = requirementsFor(agent);
  const capabilities = capabilitiesFor(resolvedModel);
  const warnings = [];

  if (!resolvedModel) {
    return { agent: agent.name, model: resolvedModel, capabilities: null, requirements, warnings };
  }
  if (!capabilities) {
    warnings.push(`model '${resolvedModel}' has no known capability profile — routing advisories unavailable for '${agent.name}'`);
    return { agent: agent.name, model: resolvedModel, capabilities: null, requirements, warnings };
  }

  if (DEPTH_RANK[capabilities.reasoningDepth] < DEPTH_RANK[requirements.reasoningDepth]) {
    warnings.push(`agent '${agent.name}' expects ${requirements.reasoningDepth} reasoning but '${resolvedModel}' offers ${capabilities.reasoningDepth}`);
  }
  if (TOOLUSE_RANK[capabilities.toolUse] < TOOLUSE_RANK[requirements.toolUse]) {
    warnings.push(`agent '${agent.name}' uses ${requirements.toolCount} tool(s) (needs ${requirements.toolUse} tool-use) but '${resolvedModel}' offers ${capabilities.toolUse}`);
  }

  return { agent: agent.name, model: resolvedModel, capabilities, requirements, warnings };
}

// Assess one agent as it will actually render for one target, using that
// target's real resolution logic (per-agent override → tier map → default).
function assessForTarget(agent, targetName, config) {
  const adapter = adapters.get(targetName);
  const resolvedModel = adapter.resolveModel ? adapter.resolveModel(agent, config) : undefined;
  return assess(agent, resolvedModel);
}

// Run advisories across every agent x every enabled target in a manifest
// plan. Returns flat, prefixed warning strings ready to fold into install/
// update output.
function adviseInstall(plan, config) {
  const warnings = [];
  for (const targetName of plan.targets) {
    for (const agent of plan.agents) {
      const result = assessForTarget(agent, targetName, config);
      for (const w of result.warnings) warnings.push(`[${targetName}] ${w}`);
    }
  }
  return warnings;
}

// Full skill/agent-model compatibility matrix: every agent in a plan against
// every model in the registry (or a caller-supplied subset), independent of
// what's actually configured. This is the reference data platforms and
// tests use to know what's known-compatible ahead of time — see
// docs/model-capabilities.md and test/model-compatibility.test.js.
function compatibilityMatrix(plan, models = allModels()) {
  return plan.agents.map((agent) => ({
    agent: agent.name,
    cells: models.map((model) => assess(agent, model)),
  }));
}

module.exports = { requirementsFor, assess, assessForTarget, adviseInstall, compatibilityMatrix };
