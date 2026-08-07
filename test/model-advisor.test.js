'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, skoposRoot } = require('./helpers');
const { requirementsFor, assess, assessForTarget, adviseInstall } = require('../lib/model-advisor');
const { buildManifest } = require('../lib/manifest');
const configLib = require('../lib/config');

const smartAgent = { name: 'planner', data: { name: 'planner', model: 'smart', tools: ['read', 'grep', 'glob'] } };
const fastAgent = { name: 'scout', data: { name: 'scout', model: 'fast', tools: ['read', 'grep', 'glob'] } };
const toolHeavyFastAgent = {
  name: 'implementer',
  data: { name: 'implementer', model: 'fast', tools: ['read', 'grep', 'glob', 'edit', 'write', 'shell'] },
};

test('requirementsFor: smart tier needs complex reasoning, fast needs only simple', () => {
  assert.equal(requirementsFor(smartAgent).reasoningDepth, 'complex');
  assert.equal(requirementsFor(fastAgent).reasoningDepth, 'simple');
});

test('requirementsFor: tool-heavy or shell-using agents need advanced tool-use', () => {
  assert.equal(requirementsFor(fastAgent).toolUse, 'basic');
  assert.equal(requirementsFor(toolHeavyFastAgent).toolUse, 'advanced');
});

test('assess: opus satisfies a smart agent with no warnings', () => {
  const r = assess(smartAgent, 'opus');
  assert.deepEqual(r.warnings, []);
});

test('assess: haiku under-serves a smart agent and warns', () => {
  const r = assess(smartAgent, 'haiku');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /expects complex reasoning but 'haiku' offers simple/);
});

test('assess: unknown model warns instead of throwing', () => {
  const r = assess(smartAgent, 'gpt-3-davinci');
  assert.equal(r.capabilities, null);
  assert.match(r.warnings[0], /no known capability profile/);
});

test('assess: no resolved model produces no warnings (nothing to advise on)', () => {
  const r = assess(smartAgent, undefined);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.model, undefined);
});

test('assessForTarget resolves through the real claude adapter, honoring per-agent overrides', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { agents: { planner: 'haiku' } } });
  const r = assessForTarget(smartAgent, 'claude', config);
  assert.equal(r.model, 'haiku');
  assert.equal(r.warnings.length, 1);
});

test('adviseInstall: default catalog + default config produces no advisories', (t) => {
  const { env } = makeSandbox(t);
  const config = configLib.merge(configLib.builtinDefaults(), { targets: { claude: true } });
  const plan = buildManifest(skoposRoot, config, env);
  assert.deepEqual(adviseInstall(plan, config), []);
});

test('adviseInstall: downgrading a smart catalog agent to haiku surfaces a prefixed warning', (t) => {
  const { env } = makeSandbox(t);
  const config = configLib.merge(configLib.builtinDefaults(), {
    targets: { claude: true },
    models: { agents: { planner: 'haiku' } },
  });
  const plan = buildManifest(skoposRoot, config, env);
  const warnings = adviseInstall(plan, config);
  assert.ok(warnings.some((w) => w.startsWith('[claude]') && w.includes("agent 'planner'")));
});
