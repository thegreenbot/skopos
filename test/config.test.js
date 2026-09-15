'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, writeConfig, skoposRoot, write, path } = require('./helpers');
const configLib = require('../lib/config');

test('loadConfig returns pure defaults when nothing exists', (t) => {
  const { env } = makeSandbox(t);
  const { config, existed, problems } = configLib.loadConfig(env, skoposRoot);
  assert.equal(existed, false);
  assert.deepEqual(problems, []);
  assert.equal(config.version, 1);
  assert.equal(config.models.claude.smart, 'opus');
  assert.equal(config.compat.skillLinks, 'auto');
  assert.equal(config.catalog.templates, 'all');
  assert.deepEqual(config.templates, []);
});

test('user config merges over defaults', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, { version: 1, identity: { name: 'Will' }, models: { claude: { smart: 'opus-5' } } });
  const { config } = configLib.loadConfig(env, skoposRoot);
  assert.equal(config.identity.name, 'Will');
  assert.equal(config.models.claude.smart, 'opus-5');
  assert.equal(config.models.claude.fast, 'sonnet'); // untouched default survives
});

test('enterprise config.defaults.json layers under user config', (t) => {
  const { env, dir } = makeSandbox(t);
  // fake fork root with enterprise defaults
  const fork = path.join(dir, 'fork');
  write(path.join(fork, 'config.defaults.json'), JSON.stringify({
    sources: [{ name: 'acme-approved', url: 'https://ghe.example/acme.git', ref: 'main' }],
    tone: { style: 'enterprise-standard' },
  }));
  writeConfig(env, { version: 1, tone: { style: 'my own style' } });
  const { config } = configLib.loadConfig(env, fork);
  assert.equal(config.tone.style, 'my own style'); // user wins
  assert.equal(config.sources.length, 1);          // enterprise source present
  assert.equal(config.sources[0].name, 'acme-approved');
});

test('named-object arrays merge by name, user order first', () => {
  const merged = configLib.merge(
    { sources: [{ name: 'a', url: 'u1' }, { name: 'b', url: 'u2' }] },
    { sources: [{ name: 'b', url: 'override' }, { name: 'c', url: 'u3' }] },
  );
  assert.deepEqual(merged.sources.map((s) => s.name), ['b', 'c', 'a']);
  assert.equal(merged.sources[0].url, 'override');
});

test('validateConfig catches the important mistakes', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), {
    version: 2,
    repos: [{ name: 'x', path: 'relative/path' }, { path: '/no-name' }],
    sources: [{ name: 'bad name!', url: '' }],
    targets: { claude: 'yes' },
    compat: { skillLinks: 'sometimes' },
    catalog: { templates: 'nope' },
    templates: [{ description: 'missing name and content' }],
  });
  const errors = configLib.validateConfig(bad);
  const text = errors.join('\n');
  assert.match(text, /version/);
  assert.match(text, /absolute path/);
  assert.match(text, /repos\[1\]\.name/);
  assert.match(text, /simple slug/);
  assert.match(text, /url is required/);
  assert.match(text, /targets\.claude/);
  assert.match(text, /skillLinks/);
  assert.match(text, /catalog\.templates must be "all" or an array of names/);
  assert.match(text, /templates\[0\]\.name is required/);
  assert.match(text, /templates\[0\]\.content is required/);
});

test('valid default config produces no errors or warnings', () => {
  assert.deepEqual(configLib.validateConfig(configLib.builtinDefaults()), []);
  assert.deepEqual(configLib.configWarnings(configLib.builtinDefaults()), []);
});

test('copilot ships a populated tier map', () => {
  const d = configLib.builtinDefaults();
  assert.equal(d.models.copilot.smart, 'gpt-5');
  assert.equal(d.models.copilot.fast, 'gpt-5-mini');
});

test('validateConfig accepts both per-agent override shapes', () => {
  const ok = configLib.merge(configLib.builtinDefaults(), {
    models: { agents: { sentinel: 'opus', implementer: { claude: 'sonnet', copilot: 'gpt-5' } } },
  });
  assert.deepEqual(configLib.validateConfig(ok), []);
});

test('validateConfig errors on a family/target mismatch in a keyed override', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), {
    models: { agents: { scout: { copilot: 'haiku' } } },
  });
  const text = configLib.validateConfig(bad).join('\n');
  assert.match(text, /models\.agents\.scout\.copilot names 'haiku', a claude model/);
});

test('validateConfig errors on a family/target mismatch in a tier map', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), {
    models: { claude: { smart: 'gpt-5' }, copilot: { fast: 'haiku' } },
  });
  const text = configLib.validateConfig(bad).join('\n');
  assert.match(text, /models\.claude\.smart names 'gpt-5', a copilot model — a claude tier must name a claude model/);
  assert.match(text, /models\.copilot\.fast names 'haiku', a claude model — a copilot tier must name a copilot model/);
});

test('an unregistered model in a tier map still only warns', () => {
  const cfg = configLib.merge(configLib.builtinDefaults(), { models: { claude: { smart: 'opus-5' } } });
  assert.deepEqual(configLib.validateConfig(cfg), []);
  assert.match(configLib.configWarnings(cfg).join('\n'), /models\.claude\.smart names 'opus-5'/);
});

test('the shipped tier defaults are themselves family-consistent', () => {
  const d = configLib.builtinDefaults();
  assert.deepEqual(configLib.validateConfig(d), []);
  assert.deepEqual(configLib.configWarnings(d), []);
});

test('validateConfig errors on an unknown target key inside an override', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), {
    models: { agents: { scout: { cursor: 'haiku' } } },
  });
  const text = configLib.validateConfig(bad).join('\n');
  assert.match(text, /models\.agents\.scout\.cursor is not a known target \(known: claude, copilot\)/);
});

test('validateConfig errors on an override naming an unknown agent, but only when agents are known', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), { models: { agents: { implementor: 'haiku' } } });
  assert.deepEqual(configLib.validateConfig(bad), []); // no plan → nothing to compare against
  const text = configLib.validateConfig(bad, { agentNames: ['scout', 'implementer'] }).join('\n');
  assert.match(text, /models\.agents\.implementor names no agent in the current plan \(known: scout, implementer\)/);
});

test('an override on a real agent that catalog.agents excluded warns instead of erroring', () => {
  const cfg = configLib.merge(configLib.builtinDefaults(), { models: { agents: { sentinel: 'opus' } } });
  const plan = { agentNames: ['scout'], knownAgentNames: ['scout', 'sentinel'] };
  assert.deepEqual(configLib.validateConfig(cfg, plan), []); // inert, not a mistake
  assert.match(
    configLib.configWarnings(cfg, plan).join('\n'),
    /models\.agents\.sentinel has no effect — agent 'sentinel' exists but catalog\.agents excludes it/,
  );
});

test('knownAgentNames does not excuse an agent that exists nowhere', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), { models: { agents: { implementor: 'opus' } } });
  const plan = { agentNames: ['scout'], knownAgentNames: ['scout', 'sentinel'] };
  assert.match(
    configLib.validateConfig(bad, plan).join('\n'),
    /models\.agents\.implementor names no agent in the current plan/,
  );
});

test('validateConfig rejects an override that is neither a name nor a target map', () => {
  const bad = configLib.merge(configLib.builtinDefaults(), { models: { agents: { scout: ['haiku'] } } });
  const text = configLib.validateConfig(bad).join('\n');
  assert.match(text, /models\.agents\.scout must be a model name or an object keyed by target/);
});

test('an unregistered model warns instead of erroring, wherever it appears', () => {
  const custom = configLib.merge(configLib.builtinDefaults(), {
    models: {
      claude: { smart: 'acme-llm-1' },
      agents: { scout: 'acme-llm-2', planner: { claude: 'acme-llm-3' } },
    },
  });
  assert.deepEqual(configLib.validateConfig(custom), []);
  const warnings = configLib.configWarnings(custom);
  assert.equal(warnings.length, 3);
  for (const w of warnings) assert.match(w, /not in the model registry/);
  assert.ok(warnings.some((w) => w.startsWith('models.claude.smart')));
  assert.ok(warnings.some((w) => w.startsWith('models.agents.scout')));
  assert.ok(warnings.some((w) => w.startsWith('models.agents.planner.claude')));
});

test('invalid JSON is reported as a problem, not a crash', (t) => {
  const { env } = makeSandbox(t);
  write(configLib.configPath(env), '{ not json');
  const { problems } = configLib.loadConfig(env, skoposRoot);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not valid JSON/);
});
