'use strict';

// Model capability registry — Skopos's best-effort knowledge of what each
// model can do. It backs both routing layers: the advisories that inform a
// routing decision made elsewhere, and the family check in the directive
// resolution that renders agent frontmatter. See docs/model-capabilities.md.
//
// Fields:
//   family          — the model's provider family. Participates in directive
//                      resolution (a bare models.agents name applies only to the
//                      target whose family matches — see model-routing.js) as
//                      well as fallback-chain construction (model-preferences.js)
//   toolUse         — 'advanced' | 'basic' | 'limited' | 'none'
//   concurrentTools — 'high' | 'medium' | 'low' — rough capacity for
//                      juggling several tool calls in one turn
//   reasoningDepth  — 'complex' | 'moderate' | 'simple'
//   costTier        — 'high' | 'medium' | 'low'
//   bestFor         — short human-readable scenarios this model suits
const CAPABILITIES = {
  opus: {
    family: 'claude',
    toolUse: 'advanced',
    concurrentTools: 'high',
    reasoningDepth: 'complex',
    costTier: 'high',
    bestFor: ['multi-step planning', 'tool orchestration', 'complex workflows'],
  },
  sonnet: {
    family: 'claude',
    toolUse: 'advanced',
    concurrentTools: 'high',
    reasoningDepth: 'complex',
    costTier: 'medium',
    bestFor: ['most day-to-day work', 'balanced reasoning and speed'],
  },
  haiku: {
    family: 'claude',
    toolUse: 'basic',
    concurrentTools: 'medium',
    reasoningDepth: 'simple',
    costTier: 'low',
    bestFor: ['fast responses', 'simple tool use', 'high-volume tasks'],
  },
  'gpt-5': {
    family: 'copilot',
    toolUse: 'advanced',
    concurrentTools: 'high',
    reasoningDepth: 'complex',
    costTier: 'high',
    bestFor: ['multi-step planning', 'tool orchestration'],
  },
  'gpt-5-mini': {
    family: 'copilot',
    toolUse: 'advanced',
    concurrentTools: 'medium',
    reasoningDepth: 'moderate',
    costTier: 'medium',
    bestFor: ['balanced reasoning and speed'],
  },
  'gpt-4o': {
    family: 'copilot',
    toolUse: 'advanced',
    concurrentTools: 'medium',
    reasoningDepth: 'moderate',
    costTier: 'medium',
    bestFor: ['general-purpose tool use'],
  },
  'gpt-3.5-turbo': {
    family: 'copilot',
    toolUse: 'limited',
    concurrentTools: 'low',
    reasoningDepth: 'simple',
    costTier: 'low',
    bestFor: ['simple, non-tool-heavy tasks'],
  },
};

// Ordinal ranks so "does model X meet requirement Y" is a plain comparison.
const DEPTH_RANK = { simple: 0, moderate: 1, complex: 2 };
const TOOLUSE_RANK = { none: 0, limited: 1, basic: 2, advanced: 3 };
const COST_RANK = { low: 0, medium: 1, high: 2 };

function capabilitiesFor(model) {
  if (!model) return null;
  return CAPABILITIES[model] || null;
}

function allModels() {
  return Object.keys(CAPABILITIES);
}

function modelsInFamily(family) {
  return Object.entries(CAPABILITIES)
    .filter(([, c]) => c.family === family)
    .map(([name]) => name);
}

module.exports = { CAPABILITIES, capabilitiesFor, allModels, modelsInFamily, DEPTH_RANK, TOOLUSE_RANK, COST_RANK };
