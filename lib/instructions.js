'use strict';

const { renderRegistrySection } = require('./registry');
const adapters = require('../adapters');

// Render the body of the managed instruction block from the persona template,
// the config, and the plan. The template embeds the SKOPOS:USER-FACTS fence;
// fence.applyBlock carries the user's facts across regenerations.

function fill(tmpl, vars) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

// The Model column is the resolution this target will actually write into each
// agent's frontmatter — the persona needs it to route delegation that isn't one
// of the named specialists. Without a target there is nothing to resolve, so the
// column falls back to '-'.
function renderRoster(agents, config, target) {
  if (!agents.length) return '_No specialists installed._';
  const adapter = target ? adapters.get(target) : null;
  const lines = [
    '| Agent | Tier | Model | Summon when |',
    '|-------|------|-------|-------------|',
  ];
  for (const a of agents) {
    const model = adapter && adapter.resolveModel ? adapter.resolveModel(a, config || {}) : undefined;
    lines.push(`| \`${a.name}\` | ${a.data.model || '-'} | ${model || '-'} | ${a.data.summon || a.data.description || ''} |`);
  }
  return lines.join('\n');
}

// `target` is the adapter this body is being rendered for; it decides which
// model each roster row reports.
function renderInstructionsBody(plan, config, target) {
  if (!plan.personaTemplate) {
    throw new Error('persona template missing — catalog/instructions/skopos-persona.md.tmpl not found');
  }
  const identity = config.identity || {};
  const tone = config.tone || {};
  const personalized = Boolean(identity.name || identity.role);

  const sections = plan.instructionSections.map((s) => s.text).join('\n\n');

  const body = fill(plan.personaTemplate, {
    IDENTITY_NAME: identity.name || 'the user',
    IDENTITY_ROLE: identity.role || '(role not set)',
    IDENTITY_CONTEXT: identity.context || '',
    TONE_STYLE: tone.style || 'clear and professional',
    TONE_VERBOSITY: tone.verbosity || 'normal',
    PERSONALIZATION_NOTE: personalized
      ? ''
      : '> **Not yet personalized.** Run the `skopos-setup` interview skill, then `skopos update`.\n',
    REGISTRY: renderRegistrySection(config),
    ROSTER: renderRoster(plan.agents, config, target),
    SECTIONS: sections,
  });
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { renderInstructionsBody, fill, renderRoster };
