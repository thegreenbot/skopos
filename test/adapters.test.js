'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const adapters = require('../adapters');
const fm = require('../lib/frontmatter');
const configLib = require('../lib/config');

const agent = {
  name: 'scout',
  data: {
    name: 'scout',
    description: 'Read-only interrogation',
    model: 'fast',
    tools: ['read', 'grep', 'glob'],
    summon: 'when reading is needed',
  },
  body: 'You are a scout.',
};

test('claude adapter resolves tier and drops tools', () => {
  const config = configLib.builtinDefaults();
  const out = adapters.get('claude').renderAgent(agent, config);
  const { data, body } = fm.parse(out);
  assert.equal(data.model, 'sonnet'); // fast → sonnet by default mapping
  assert.equal(data.tools, undefined);
  assert.equal(data.summon, undefined); // internal key never projected
  assert.equal(body.trim(), 'You are a scout.');
});

test('claude adapter honors per-agent model override', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { agents: { scout: 'haiku' } } });
  const { data } = fm.parse(adapters.get('claude').renderAgent(agent, config));
  assert.equal(data.model, 'haiku');
});

test('copilot adapter keeps tools and resolves the shipped default tier map', () => {
  const config = configLib.builtinDefaults(); // models.copilot = { smart, fast }
  const out = adapters.get('copilot').renderAgent(agent, config);
  const { data } = fm.parse(out);
  assert.deepEqual(data.tools, ['read', 'grep', 'glob']);
  assert.equal(data.model, 'gpt-5-mini'); // fast → gpt-5-mini by default mapping
});

test('copilot adapter strips the model key when the tier has no mapping', () => {
  // Not merged over the defaults — an empty tier map is the case under test.
  const { data } = fm.parse(adapters.get('copilot').renderAgent(agent, { models: { copilot: {} } }));
  assert.equal(data.model, undefined);
});

test('copilot adapter maps tier when configured', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { copilot: { fast: 'gpt-5-mini' } } });
  const { data } = fm.parse(adapters.get('copilot').renderAgent(agent, config));
  assert.equal(data.model, 'gpt-5-mini');
});

test('a bare claude model name in models.agents does not leak into copilot', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { agents: { scout: 'haiku' } } });
  // Claude honors it; copilot skips it on family mismatch and uses its tier map.
  assert.equal(fm.parse(adapters.get('claude').renderAgent(agent, config)).data.model, 'haiku');
  assert.equal(fm.parse(adapters.get('copilot').renderAgent(agent, config)).data.model, 'gpt-5-mini');
});

test('a target-keyed override directs each target independently', () => {
  const config = configLib.merge(configLib.builtinDefaults(), {
    models: { agents: { scout: { claude: 'haiku', copilot: 'gpt-4o' } } },
  });
  assert.equal(fm.parse(adapters.get('claude').renderAgent(agent, config)).data.model, 'haiku');
  assert.equal(fm.parse(adapters.get('copilot').renderAgent(agent, config)).data.model, 'gpt-4o');
});

test('a target-keyed override covering one target leaves the other on its tier map', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { agents: { scout: { claude: 'haiku' } } } });
  assert.equal(fm.parse(adapters.get('claude').renderAgent(agent, config)).data.model, 'haiku');
  assert.equal(fm.parse(adapters.get('copilot').renderAgent(agent, config)).data.model, 'gpt-5-mini');
});

test('an unregistered model name in models.agents still applies to every target', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { agents: { scout: 'acme-llm-1' } } });
  assert.equal(fm.parse(adapters.get('claude').renderAgent(agent, config)).data.model, 'acme-llm-1');
  assert.equal(fm.parse(adapters.get('copilot').renderAgent(agent, config)).data.model, 'acme-llm-1');
});

test('a copilot model name in models.agents does not leak into claude', () => {
  const config = configLib.merge(configLib.builtinDefaults(), { models: { agents: { scout: 'gpt-4o' } } });
  assert.equal(fm.parse(adapters.get('claude').renderAgent(agent, config)).data.model, 'sonnet');
  assert.equal(fm.parse(adapters.get('copilot').renderAgent(agent, config)).data.model, 'gpt-4o');
});

test('adapter destinations follow each tool convention', () => {
  const env = { claudeDir: '/h/.claude', copilotDir: '/h/.copilot' };
  assert.match(adapters.get('claude').agentDest(env, agent).replace(/\\/g, '/'), /\.claude\/agents\/scout\.md$/);
  assert.match(adapters.get('copilot').agentDest(env, agent).replace(/\\/g, '/'), /\.copilot\/agents\/scout\.agent\.md$/);
  assert.match(adapters.get('claude').instructionsFile(env).replace(/\\/g, '/'), /\.claude\/CLAUDE\.md$/);
  assert.match(adapters.get('copilot').instructionsFile(env).replace(/\\/g, '/'), /\.copilot\/copilot-instructions\.md$/);
});

test('unknown target throws with the known list', () => {
  assert.throws(() => adapters.get('cursor'), /unknown target: cursor/);
});
