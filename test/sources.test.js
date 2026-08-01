'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const { makeSandbox, writeConfig, baseConfig, skoposRoot, write, fs, path } = require('./helpers');
const { runSourcesSync, runInstall, runVerify } = require('../lib/commands');
const lockLib = require('../lib/lock');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

// Build a local fixture repo usable as a file:// source.
function makeFixtureRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@test'], dir);
  git(['config', 'user.name', 'test'], dir);
  write(path.join(dir, 'skopos.source.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  write(path.join(dir, 'agents', 'auditor.md'), '---\nname: auditor\ndescription: fixture agent\nmodel: fast\n---\naudit body');
  write(path.join(dir, 'skills', 'fixture-skill', 'SKILL.md'), '---\nname: fixture-skill\ndescription: f\n---\nfixture skill body');
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'v1'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

test('sync pins SHA; re-sync after a new commit updates the pin', (t) => {
  const { env, dir } = makeSandbox(t);
  const fixture = path.join(dir, 'fixture-repo');
  const sha1 = makeFixtureRepo(fixture);
  writeConfig(env, baseConfig({ sources: [{ name: 'fixture', url: fixture, ref: 'main' }] }));

  const r1 = runSourcesSync({ env, skoposRoot });
  assert.equal(r1.results[0].sha, sha1);
  assert.equal(lockLib.readLock(env).sources.fixture.sha, sha1);

  // fixture content lands in the install
  const inst = runInstall({ skoposRoot, env, mode: 'install' });
  assert.ok(inst.agents.includes('auditor'));
  assert.ok(fs.existsSync(path.join(env.agentsDir, 'skills', 'fixture-skill', 'SKILL.md')));

  // new commit → re-sync updates pin and content
  write(path.join(fixture, 'agents', 'auditor.md'), '---\nname: auditor\ndescription: fixture agent v2\nmodel: fast\n---\naudit body v2');
  git(['add', '-A'], fixture);
  git(['commit', '-q', '-m', 'v2'], fixture);
  const sha2 = git(['rev-parse', 'HEAD'], fixture);

  const r2 = runSourcesSync({ env, skoposRoot });
  assert.equal(r2.results[0].sha, sha2);
  assert.notEqual(sha1, sha2);
  runInstall({ skoposRoot, env, mode: 'update' });
  const rendered = fs.readFileSync(path.join(env.claudeDir, 'agents', 'auditor.md'), 'utf8');
  assert.ok(rendered.includes('fixture agent v2'));
  assert.equal(runVerify({ env }).ok, true);
});

test('source agent takes precedence over catalog agent of the same name', (t) => {
  const { env, dir } = makeSandbox(t);
  const fixture = path.join(dir, 'fixture-repo');
  makeFixtureRepo(fixture);
  write(path.join(fixture, 'agents', 'scout.md'), '---\nname: scout\ndescription: enterprise scout\nmodel: fast\n---\nenterprise scout body');
  git(['add', '-A'], fixture);
  git(['commit', '-q', '-m', 'add scout override'], fixture);

  writeConfig(env, baseConfig({ sources: [{ name: 'fixture', url: fixture, ref: 'main' }] }));
  runSourcesSync({ env, skoposRoot });
  const r = runInstall({ skoposRoot, env, mode: 'install' });
  const rendered = fs.readFileSync(path.join(env.claudeDir, 'agents', 'scout.md'), 'utf8');
  assert.ok(rendered.includes('enterprise scout'));
  assert.ok(r.warnings.some((w) => w.includes("agent 'scout' from catalog skipped")));
});

test('bad URL degrades gracefully and keeps the prior checkout', (t) => {
  const { env, dir } = makeSandbox(t);
  const fixture = path.join(dir, 'fixture-repo');
  const sha1 = makeFixtureRepo(fixture);
  writeConfig(env, baseConfig({ sources: [{ name: 'fixture', url: fixture, ref: 'main' }] }));
  runSourcesSync({ env, skoposRoot });

  // now break the URL (simulates network failure/offline)
  writeConfig(env, baseConfig({ sources: [{ name: 'fixture', url: path.join(dir, 'does-not-exist'), ref: 'main' }] }));
  const r = runSourcesSync({ env, skoposRoot });
  assert.ok(r.results[0].error);
  assert.equal(r.results[0].sha, sha1); // prior pin kept
  // and update still renders from the on-disk checkout
  const inst = runInstall({ skoposRoot, env, mode: 'update' });
  assert.ok(inst.agents.includes('auditor'));
});

test('removing a source from config prunes its checkout on sync', (t) => {
  const { env, dir } = makeSandbox(t);
  const fixture = path.join(dir, 'fixture-repo');
  makeFixtureRepo(fixture);
  writeConfig(env, baseConfig({ sources: [{ name: 'fixture', url: fixture, ref: 'main' }] }));
  runSourcesSync({ env, skoposRoot });
  assert.ok(fs.existsSync(path.join(env.skoposHome, 'sources', 'fixture')));

  writeConfig(env, baseConfig({ sources: [] }));
  const r = runSourcesSync({ env, skoposRoot });
  assert.deepEqual(r.prunedDirs, ['fixture']);
  assert.ok(!fs.existsSync(path.join(env.skoposHome, 'sources', 'fixture')));
  assert.equal(lockLib.readLock(env).sources.fixture, undefined);
});
