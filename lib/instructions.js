'use strict';

const { renderRegistrySection } = require('./registry');
const discovery = require('./discovery');

// Render the body of the managed instruction block from the persona template,
// the config, and the plan. The template embeds the SKOPOS:USER-FACTS fence;
// fence.applyBlock carries the user's facts across regenerations.

function fill(tmpl, vars) {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

// The built-in roster: agents skopos renders and therefore vouches for.
function renderRoster(agents) {
  if (!agents.length) return '_No specialists installed._';
  const lines = [
    '| Agent | Role | Tier | Summon when |',
    '|-------|------|------|-------------|',
  ];
  for (const a of agents) {
    const r = discovery.toRecord(a);
    lines.push(`| \`${r.name}\` | ${r.role} | ${a.data.model || '-'} | ${r.summon} |`);
  }
  return lines.join('\n');
}

const PROJECT_AGENTS_NOTE = [
  '### Project-scoped agents',
  '',
  'Repositories can carry their own sub-agents. When starting substantive work',
  'in a repository, check `.claude/agents/` and `.github/agents/` for',
  'project-local specialists. They join the roster for the duration of that',
  'work under the same contract as the agents above: brief them explicitly,',
  'inline the report shape, verify what comes back. If the directory is absent,',
  'carry on normally.',
].join('\n');

// The user's own agents: skopos did not write them, does not manage them, and
// knows nothing about them beyond what their frontmatter states.
function renderUserRoster(records) {
  if (!records || !records.length) return '';
  const lines = [
    '### Your agents — defined by you, read-only to skopos',
    '',
    '| Agent | Role | Model | Tools | Summon when | Origin |',
    '|-------|------|-------|-------|-------------|--------|',
  ];
  for (const r of records) {
    const tools = r.tools ? r.tools.join(', ') : 'inherited';
    lines.push(`| \`${r.name}\` | ${r.role}${r.prefer ? ' ★' : ''} | ${r.model || '-'} | ${tools} | ${r.summon || '_(no stated purpose — do not route to it on a guess)_'} | ${r.display} |`);
  }
  lines.push('');
  lines.push('These are yours. Skopos did not write them and knows nothing about them');
  lines.push('beyond the row above — brief them explicitly, inline the report shape you');
  lines.push('want, and verify what comes back. `inherited` tools means unknown, not');
  lines.push('unlimited: do not send work that writes to an agent whose tools you cannot');
  lines.push('see. A ★ marks an agent you told skopos to prefer over the built-in for its role.');
  return lines.join('\n');
}

// Everything in the roster section that skopos does not own: the user's agents
// and the standing instruction to look for project-scoped ones.
function renderUserAgentsSection(records, config) {
  const parts = [];
  const table = renderUserRoster(records);
  if (table) parts.push(table);
  if (((config || {}).agents || {}).projectScoped !== false) parts.push(PROJECT_AGENTS_NOTE);
  return parts.join('\n\n');
}

function renderInstructionsBody(plan, config, opts) {
  if (!plan.personaTemplate) {
    throw new Error('persona template missing — catalog/instructions/skopos-persona.md.tmpl not found');
  }
  const { userAgents = [], skipAgents = new Set() } = opts || {};
  const identity = config.identity || {};
  const tone = config.tone || {};
  const personalized = Boolean(identity.name || identity.role);

  const sections = plan.instructionSections.map((s) => s.text).join('\n\n');
  const builtins = plan.agents.filter((a) => !skipAgents.has(a.name));

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
    ROSTER: renderRoster(builtins),
    USER_ROSTER: renderUserAgentsSection(userAgents, config),
    SECTIONS: sections,
  });
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  renderInstructionsBody, fill, renderRoster, renderUserRoster, renderUserAgentsSection,
  PROJECT_AGENTS_NOTE,
};
