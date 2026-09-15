'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, writeConfig, baseConfig, runCli, skoposRoot, read, write, fs, path } = require('./helpers');
const { runInstall, runVerify, runUninstall } = require('../lib/commands');
const lockLib = require('../lib/lock');
const fence = require('../lib/fence');

function install(env, opts) {
  return runInstall(Object.assign({ skoposRoot, env, mode: 'install' }, opts));
}
function update(env, opts) {
  return runInstall(Object.assign({ skoposRoot, env, mode: 'update' }, opts));
}

test('install writes lock, skills to the universal home, agents + fenced instructions', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  const r = install(env);

  assert.equal(r.firstInstall, true);
  assert.deepEqual(r.targets, ['claude']);
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'skills', 'skopos-setup', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'templates', 'pr-description.md')));
  assert.ok(read(path.join(env.agentsDir, 'templates', 'pr-description.md')).includes('## Summary'));
  assert.ok(fs.existsSync(path.join(env.claudeDir, 'agents', 'scout.md')));
  const claudeMd = read(path.join(env.claudeDir, 'CLAUDE.md'));
  assert.ok(claudeMd.includes('SKOPOS:MANAGED:START'));
  assert.ok(claudeMd.includes('Test User'));

  const lock = lockLib.readLock(env);
  assert.ok(Object.keys(lock.managed).length > 5);
  assert.ok(lock.fenced['claude:CLAUDE.md']);
  assert.ok(lock.generated.includes('claude:CLAUDE.md'));
});

test('verify: managed tamper is drift (exit 2 via CLI), fenced outside-edit is not', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  assert.equal(runVerify({ env }).ok, true);

  // edit OUTSIDE the fence → still ok
  const p = path.join(env.claudeDir, 'CLAUDE.md');
  write(p, '# mine\n\n' + read(p));
  assert.equal(runVerify({ env }).ok, true);

  // edit USER-FACTS inside the fence → still ok
  write(p, read(p).replace(/(SKOPOS:USER-FACTS:START -->\n)/, '$1my personal fact\n'));
  assert.equal(runVerify({ env }).ok, true);

  // tamper a managed agent → drift, and the CLI exits 2
  fs.appendFileSync(path.join(env.claudeDir, 'agents', 'scout.md'), '\ntampered\n');
  const v = runVerify({ env });
  assert.equal(v.ok, false);
  assert.deepEqual(v.modified, ['claude:agents/scout.md']);
  const cli = runCli(env, ['verify']);
  assert.equal(cli.code, 2);
  assert.match(cli.stdout, /DRIFT/);
});

test('update preserves USER-FACTS and repairs tampered managed files', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  const p = path.join(env.claudeDir, 'CLAUDE.md');
  write(p, read(p).replace(/(SKOPOS:USER-FACTS:START -->\n)/, '$1I deploy on Fridays.\n'));
  fs.appendFileSync(path.join(env.claudeDir, 'agents', 'scout.md'), '\ntampered\n');

  update(env);
  assert.ok(read(p).includes('I deploy on Fridays.'));
  assert.equal(runVerify({ env }).ok, true);
  assert.ok(!read(path.join(env.claudeDir, 'agents', 'scout.md')).includes('tampered'));
});

test('deselecting an agent prunes it; pre-existing user agents are untouched', (t) => {
  const { env } = makeSandbox(t);
  const userAgent = path.join(env.claudeDir, 'agents', 'my-own-agent.md');
  write(userAgent, '---\nname: my-own-agent\n---\nmine');
  writeConfig(env, baseConfig());
  const r1 = install(env);
  assert.ok(r1.userAgents.some((a) => a.name === 'my-own-agent' && a.origin === 'user:claude'));

  writeConfig(env, baseConfig({ catalog: { agents: ['scout'], skills: 'all' } }));
  const r2 = update(env);
  assert.ok(r2.pruned.includes('claude:agents/planner.md'));
  assert.ok(!fs.existsSync(path.join(env.claudeDir, 'agents', 'planner.md')));
  assert.ok(fs.existsSync(path.join(env.claudeDir, 'agents', 'scout.md')));
  assert.equal(read(userAgent), '---\nname: my-own-agent\n---\nmine');
});

test('user-supplied config template installs and overrides a same-named default', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig({
    templates: [
      { name: 'adr', description: 'Architecture decision record', content: '# ADR-<n>\n' },
      { name: 'pr-description', description: 'override', content: 'custom pr body' },
    ],
  }));
  const r = install(env);
  assert.ok(r.templates.includes('adr'));
  assert.equal(read(path.join(env.agentsDir, 'templates', 'adr.md')).trim(), '# ADR-<n>');
  assert.equal(read(path.join(env.agentsDir, 'templates', 'pr-description.md')).trim(), 'custom pr body');
});

test('deselecting a template prunes its installed file', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'templates', 'spec-sheet.md')));

  writeConfig(env, baseConfig({ catalog: { templates: ['pr-description'] } }));
  const r2 = update(env);
  assert.ok(r2.pruned.includes('agents:templates/spec-sheet.md'));
  assert.ok(!fs.existsSync(path.join(env.agentsDir, 'templates', 'spec-sheet.md')));
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'templates', 'pr-description.md')));
});

test('install surfaces a model advisory warning when a config override under-serves an agent', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig({ models: { agents: { planner: 'haiku' } } }));
  const r = install(env);
  assert.ok(r.warnings.some((w) => w.includes("[claude] agent 'planner' expects complex reasoning but 'haiku' offers simple")));
});

test('--target install persists into config so bare update keeps the surface', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.claudeDir, { recursive: true });
  writeConfig(env, baseConfig({ targets: { claude: true } }));
  install(env, { target: 'copilot' });

  const cfg = JSON.parse(read(path.join(env.skoposHome, 'config.json')));
  assert.equal(cfg.targets.copilot, true);

  const r = update(env); // bare update — no --target
  assert.deepEqual(r.targets, ['claude', 'copilot']);
  assert.ok(fs.existsSync(path.join(env.copilotDir, 'agents', 'scout.agent.md')));
});

test('first install with no targets detects installed tools and persists', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.claudeDir, { recursive: true }); // only claude "installed"
  const r = install(env);
  assert.deepEqual(r.detected, ['claude']);
  const cfg = JSON.parse(read(path.join(env.skoposHome, 'config.json')));
  assert.equal(cfg.targets.claude, true);
  assert.equal(cfg.targets.copilot, undefined);
});

test('uninstall: removes managed, strips fence from user files, restores snapshots', (t) => {
  const { env } = makeSandbox(t);
  const p = path.join(env.claudeDir, 'CLAUDE.md');
  write(p, '# my pre-existing CLAUDE.md\n');
  writeConfig(env, baseConfig());
  install(env);
  assert.ok(read(p).includes('SKOPOS:MANAGED'));

  const r = runUninstall({ env });
  assert.ok(r.stripped.includes('claude:CLAUDE.md'));
  const after = read(p);
  assert.ok(!after.includes('SKOPOS:MANAGED'));
  assert.ok(after.includes('# my pre-existing CLAUDE.md'));
  assert.ok(!fs.existsSync(path.join(env.claudeDir, 'agents', 'scout.md')));
  assert.ok(!fs.existsSync(lockLib.lockPath(env)));
  // config.json survives uninstall
  assert.ok(fs.existsSync(path.join(env.skoposHome, 'config.json')));
});

test('uninstall deletes a skopos-created instructions file only when fully ours', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  const p = path.join(env.claudeDir, 'CLAUDE.md');
  assert.ok(fs.existsSync(p));
  runUninstall({ env });
  assert.ok(!fs.existsSync(p), 'file skopos created and user never touched should be removed');
});

test('uninstall keeps a skopos-created file the user added content to', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  const p = path.join(env.claudeDir, 'CLAUDE.md');
  write(p, read(p) + '\n# my notes\nkeep me\n');
  runUninstall({ env });
  assert.ok(fs.existsSync(p));
  const after = read(p);
  assert.ok(after.includes('keep me'));
  assert.ok(!after.includes('SKOPOS:MANAGED'));
});

test('dry-run writes nothing', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env, { dryRun: true });
  assert.ok(!fs.existsSync(path.join(env.claudeDir, 'CLAUDE.md')));
  assert.equal(lockLib.readLock(env), null);
});

test('update rejects --target at the CLI', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  install(env);
  const r = runCli(env, ['update', '--target', 'copilot']);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /targets always come from config/);
});

test('persona block renders registry table and roster from config', (t) => {
  const { env, dir } = makeSandbox(t);
  const repoDir = path.join(dir, 'repos', 'my-service');
  fs.mkdirSync(repoDir, { recursive: true });
  writeConfig(env, baseConfig({
    repos: [{ name: 'my-service', path: repoDir, description: 'The service' }],
  }));
  install(env);
  const claudeMd = read(path.join(env.claudeDir, 'CLAUDE.md'));
  assert.ok(claudeMd.includes('| my-service |'));
  assert.ok(claudeMd.includes('summon one'));
  assert.ok(claudeMd.includes('`scout`'));
  assert.ok(claudeMd.includes('| `sentinel` |'));
});
