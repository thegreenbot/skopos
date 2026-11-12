'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, writeConfig, baseConfig, runCli, skoposRoot, read, write, fs, path } = require('./helpers');
const { runInstall, runVerify, runStatus, runBrainPlug, runBrainOptOut } = require('../lib/commands');
const brain = require('../lib/brain');
const configLib = require('../lib/config');

function install(env, mode) {
  return runInstall({ skoposRoot, env, mode: mode || 'install' });
}

function writeBrainSkill(env, name, frontmatter) {
  const dir = path.join(env.agentsDir, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: test brain\n${frontmatter}---\n\n## capture\n## recall\n`);
}
const GOOD = 'brain-contract: 1\nbrain-ops: [capture, recall, lint]\n';

const ENVELOPE = `---
type: lesson
title: Accounts older than 2023 have no verified email
scope: cross-project
visibility: team
confidence: observed
date: 2026-11-12
evidence: [commit abc123]
---

Twelve percent of accounts predate email verification.

**Recall when:** adding a NOT NULL column to the accounts table
`;

// --- config ---------------------------------------------------------------

test('brain defaults are propose + recall via scout, unplugged', () => {
  const d = configLib.builtinDefaults().brain;
  assert.equal(d.skill, null);
  assert.equal(d.capture.autoCapture, 'propose');
  assert.equal(d.recall.viaScout, true);
  assert.equal(d.allowOptOut, true);
  assert.deepEqual(configLib.validateConfig(configLib.builtinDefaults()), []);
});

test('validateConfig rejects bad brain values', () => {
  const bad = (brainCfg) => configLib.validateConfig(configLib.merge(configLib.builtinDefaults(), { brain: brainCfg }));
  assert.match(bad({ capture: { autoCapture: 'yolo' } }).join('\n'), /autoCapture/);
  assert.match(bad({ capture: { triggers: ['sometimes'] } }).join('\n'), /triggers/);
  assert.match(bad({ capture: { onFailure: 'ignore' } }).join('\n'), /onFailure/);
  assert.match(bad({ recall: { budgetTokens: 5 } }).join('\n'), /budgetTokens/);
  assert.match(bad({ contract: 2 }).join('\n'), /contract/);
  assert.match(bad({ skill: '../evil' }).join('\n'), /brain.skill/);
  assert.match(bad({ optOut: true, allowOptOut: false }).join('\n'), /not allowed/);
});

// --- contract + state -----------------------------------------------------

test('brainState: unplugged, opted-out, invalid, plugged', (t) => {
  const { env } = makeSandbox(t);
  const cfg = (b) => configLib.merge(configLib.builtinDefaults(), { brain: b });

  assert.equal(brain.brainState(cfg({}), env).state, 'unplugged');
  assert.equal(brain.brainState(cfg({ optOut: true }), env).state, 'opted-out');
  // enterprise forbids opting out: the opt-out is ignored, brain stays unplugged
  assert.equal(brain.brainState(cfg({ optOut: true, allowOptOut: false }), env).state, 'unplugged');

  assert.equal(brain.brainState(cfg({ skill: 'ghost' }), env).state, 'invalid');

  writeBrainSkill(env, 'nocontract', '');
  const nc = brain.brainState(cfg({ skill: 'nocontract' }), env);
  assert.equal(nc.state, 'invalid');
  assert.match(nc.problems[0], /brain-contract/);

  writeBrainSkill(env, 'writeonly', 'brain-contract: 1\nbrain-ops: [capture]\n');
  const wo = brain.brainState(cfg({ skill: 'writeonly' }), env);
  assert.equal(wo.state, 'invalid');
  assert.match(wo.problems.join(), /recall/);

  writeBrainSkill(env, 'future', 'brain-contract: 2\nbrain-ops: [capture, recall]\n');
  assert.match(brain.brainState(cfg({ skill: 'future' }), env).problems.join(), /not supported/);

  writeBrainSkill(env, 'good', GOOD);
  const ok = brain.brainState(cfg({ skill: 'good' }), env);
  assert.equal(ok.state, 'plugged');
  assert.deepEqual(ok.ops, ['capture', 'recall', 'lint']);
});

// --- envelope -------------------------------------------------------------

test('checkEnvelope accepts a good envelope and names what is wrong otherwise', () => {
  assert.deepEqual(brain.checkEnvelope(ENVELOPE).errors, []);

  const noTrigger = brain.checkEnvelope(ENVELOPE.replace(/\*\*Recall when:\*\*.*\n/, ''));
  assert.match(noTrigger.errors.join(), /Recall when/);
  // an artifact may omit the trigger — warning only
  const art = brain.checkEnvelope(ENVELOPE.replace('type: lesson', 'type: artifact').replace(/\*\*Recall when:\*\*.*\n/, ''));
  assert.deepEqual(art.errors, []);
  assert.match(art.warnings.join(), /Recall when/);

  assert.match(brain.checkEnvelope('no frontmatter').errors[0], /frontmatter/);
  assert.match(brain.checkEnvelope(ENVELOPE.replace('scope: cross-project', 'scope: galaxy')).errors.join(), /scope/);
  assert.match(brain.checkEnvelope(ENVELOPE.replace('2026-11-12', 'yesterday')).errors.join(), /date/);
});

test('checkEnvelope blocks secrets', () => {
  for (const leak of ['password = hunter2hunter2', 'ghp_' + 'a'.repeat(36), 'AKIA' + 'B'.repeat(16), '-----BEGIN RSA PRIVATE KEY-----']) {
    const r = brain.checkEnvelope(ENVELOPE + `\n${leak}\n`);
    assert.match(r.errors.join(), /secret/, leak);
  }
});

// --- outbox ---------------------------------------------------------------

test('outbox: add validates, list shows, ack removes', (t) => {
  const { env } = makeSandbox(t);
  assert.deepEqual(brain.outboxList(env), []);
  assert.throws(() => brain.outboxAdd(env, 'junk'), /rejected/);

  const a = brain.outboxAdd(env, ENVELOPE, '2026-11-12T10:00:00.000Z');
  const b = brain.outboxAdd(env, ENVELOPE, '2026-11-12T10:00:00.000Z');
  assert.notEqual(a.id, b.id);
  assert.equal(brain.outboxList(env).length, 2);
  assert.equal(brain.outboxList(env)[0].title, 'Accounts older than 2023 have no verified email');

  brain.outboxAck(env, a.id);
  assert.equal(brain.outboxList(env).length, 1);
  assert.throws(() => brain.outboxAck(env, a.id), /no pending/);
  assert.throws(() => brain.outboxAck(env, '../x'), /invalid/);
});

// --- lifecycle ------------------------------------------------------------

test('install never fails without a brain; persona carries the unplugged banner', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  const r = install(env);
  assert.equal(r.brain.state, 'unplugged');
  assert.ok(read(path.join(env.claudeDir, 'CLAUDE.md')).includes('Brain: NOT PLUGGED IN'));
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'skills', 'brain-setup', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'skills', 'brain-setup', 'references', 'contract.md')));
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'templates', 'brain-capture.md')));
  // unplugged is loud but verify still passes
  const v = runVerify({ env, skoposRoot });
  assert.equal(v.ok, true);
  assert.equal(v.brainOk, true);
  assert.equal(runCli(env, ['verify']).code, 0);
});

test('plug → update renders the brain; status reports it; the capture template ships', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  writeBrainSkill(env, 'team-wiki', GOOD);

  const stale0 = runStatus({ env, skoposRoot });
  assert.equal(stale0.brain.state, 'unplugged');

  const r = runBrainPlug({ env, skoposRoot, skill: 'team-wiki', verified: true });
  assert.deepEqual(r.ops, ['capture', 'recall', 'lint']);
  assert.ok(r.verifiedAt);

  // plugged in config but instructions not re-rendered yet → roster is stale
  assert.ok(runStatus({ env, skoposRoot }).stale.length >= 1);

  install(env, 'update');
  const md = read(path.join(env.claudeDir, 'CLAUDE.md'));
  assert.ok(md.includes('`team-wiki` skill'));
  assert.ok(md.includes('Mode: propose'));
  assert.ok(md.includes('CAPTURE:'));
  assert.ok(!md.includes('NOT PLUGGED IN'));
  assert.equal(runStatus({ env, skoposRoot }).stale.length, 0);
  assert.equal(runStatus({ env, skoposRoot }).brain.state, 'plugged');
  assert.equal(runCli(env, ['verify']).code, 0);
});

test('verify exits 3 when the configured brain skill disappears or breaks', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  writeBrainSkill(env, 'team-wiki', GOOD);
  runBrainPlug({ env, skoposRoot, skill: 'team-wiki' });
  install(env, 'update');

  fs.rmSync(path.join(env.agentsDir, 'skills', 'team-wiki'), { recursive: true });
  const v = runVerify({ env, skoposRoot });
  assert.equal(v.ok, true);          // no managed-file drift
  assert.equal(v.brainOk, false);    // but the brain is unusable
  assert.equal(runCli(env, ['verify']).code, 3);
  assert.equal(runCli(env, ['brain', 'status']).code, 3);
  // install/update still never fail
  install(env, 'update');
  assert.ok(read(path.join(env.claudeDir, 'CLAUDE.md')).includes('Brain: BROKEN'));
});

test('plug refuses a skill that breaks the contract, and writes nothing', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  writeBrainSkill(env, 'bad', 'brain-contract: 1\nbrain-ops: [capture]\n');
  const before = read(path.join(env.skoposHome, 'config.json'));
  assert.throws(() => runBrainPlug({ env, skoposRoot, skill: 'bad' }), /recall/);
  assert.throws(() => runBrainPlug({ env, skoposRoot, skill: 'missing' }), /no skill named/);
  assert.equal(read(path.join(env.skoposHome, 'config.json')), before);
});

test('opt-out is a recorded decision; --undo reverses it', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  runBrainOptOut({ env, skoposRoot });
  install(env, 'update');
  const md = read(path.join(env.claudeDir, 'CLAUDE.md'));
  assert.ok(md.includes('the user opted out'));
  assert.ok(!md.includes('NOT PLUGGED IN'));
  assert.equal(runStatus({ env, skoposRoot }).brain.state, 'opted-out');
  runBrainOptOut({ env, skoposRoot, undo: true });
  assert.equal(runStatus({ env, skoposRoot }).brain.state, 'unplugged');
});

test('enterprise allowOptOut:false: opt-out is refused at write time', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig({ brain: { allowOptOut: false } }));
  assert.throws(() => runBrainOptOut({ env, skoposRoot }), /not allowed/);
});

test('CLI: brain check + outbox round trip', (t) => {
  const { env, dir } = makeSandbox(t);
  writeConfig(env, baseConfig());
  const good = path.join(dir, 'good.md'); fs.writeFileSync(good, ENVELOPE);
  const bad = path.join(dir, 'bad.md'); fs.writeFileSync(bad, ENVELOPE + '\ntoken=abcdefgh12345678\n');

  assert.equal(runCli(env, ['brain', 'check', good]).code, 0);
  assert.equal(runCli(env, ['brain', 'check', bad]).code, 1);
  assert.notEqual(runCli(env, ['brain', 'outbox', 'add', bad]).code, 0);

  assert.equal(runCli(env, ['brain', 'outbox', 'add', good]).code, 0);
  const listed = JSON.parse(runCli(env, ['brain', 'outbox', 'list', '--json']).stdout);
  assert.equal(listed.items.length, 1);
  assert.equal(runCli(env, ['brain', 'outbox', 'ack', listed.items[0].id]).code, 0);
  assert.equal(JSON.parse(runCli(env, ['brain', 'outbox', 'list', '--json']).stdout).items.length, 0);
});

test('persona variants stay small when not plugged in', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  writeBrainSkill(env, 'team-wiki', GOOD);
  const unplugged = brain.renderBrainSection(brain.brainState(configLib.builtinDefaults(), env));
  const plugged = brain.renderBrainSection(brain.brainState(configLib.merge(configLib.builtinDefaults(), { brain: { skill: 'team-wiki' } }), env));
  assert.ok(unplugged.length < plugged.length / 2);
  assert.match(plugged, /Recall/);
  const noRecall = brain.renderBrainSection(brain.brainState(configLib.merge(configLib.builtinDefaults(), { brain: { skill: 'team-wiki', recall: { onStart: false } } }), env));
  assert.ok(!/### Recall/.test(noRecall));
  const auto = brain.renderBrainSection(brain.brainState(configLib.merge(configLib.builtinDefaults(), { brain: { skill: 'team-wiki', capture: { autoCapture: 'auto' } } }), env));
  assert.match(auto, /Mode: auto/);
});
