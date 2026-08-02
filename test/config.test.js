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

test('valid default config produces no errors', () => {
  assert.deepEqual(configLib.validateConfig(configLib.builtinDefaults()), []);
});

test('invalid JSON is reported as a problem, not a crash', (t) => {
  const { env } = makeSandbox(t);
  write(configLib.configPath(env), '{ not json');
  const { problems } = configLib.loadConfig(env, skoposRoot);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not valid JSON/);
});
