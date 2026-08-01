'use strict';

const { renderRegistrySection } = require('./registry');

// Render the body of the managed instruction block from the persona template,
// the config, and the plan. The template embeds the SKOPOS:USER-FACTS fence;
// fence.applyBlock carries the user's facts across regenerations.

function fill(tmpl, vars) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

function renderRoster(agents) {
  if (!agents.length) return '_No specialists installed._';
  const lines = [
    '| Agent | Tier | Summon when |',
    '|-------|------|-------------|',
  ];
  for (const a of agents) {
    lines.push(`| \`${a.name}\` | ${a.data.model || '-'} | ${a.data.summon || a.data.description || ''} |`);
  }
  return lines.join('\n');
}

function renderInstructionsBody(plan, config) {
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
    ROSTER: renderRoster(plan.agents),
    SECTIONS: sections,
  });
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { renderInstructionsBody, fill, renderRoster };
