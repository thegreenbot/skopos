'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const { makeSandbox, writeConfig, baseConfig, skoposRoot, write, runCli, fs, path } = require('./helpers');
const { runSourcesSync, runInstall, runVerify, runStatus, runConfigValidate } = require('../lib/commands');
const { expandPattern, patternProblem } = require('../lib/skill-paths');
const configLib = require('../lib/config');
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

// ---------------------------------------------------------------------------
// nested skills (skillsPaths)

function skill(name, body) {
  return `---\nname: ${name}\ndescription: ${name}\n---\n${body || name}`;
}

// Mirrors adobe/skills: no root skills/, skills nested under plugins/.
function makeNestedRepo(dir, extra) {
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@test'], dir);
  git(['config', 'user.name', 'test'], dir);
  write(path.join(dir, 'plugins', 'aem', 'edge-delivery-services', 'skills', 'eds-block', 'SKILL.md'), skill('eds-block'));
  write(path.join(dir, 'plugins', 'aem', 'edge-delivery-services', 'skills', 'eds-block', 'references', 'guide.md'), 'eds guide');
  write(path.join(dir, 'plugins', 'aem', 'cloud-service', 'skills', 'aem-dispatcher', 'SKILL.md'), skill('aem-dispatcher'));
  write(path.join(dir, 'plugins', 'aem', 'skills', 'aem-top', 'SKILL.md'), skill('aem-top'));
  write(path.join(dir, 'plugins', 'app-builder', 'skills', 'ab-action', 'SKILL.md'), skill('ab-action'));
  write(path.join(dir, 'plugins', 'analytics', 'skills', 'not-wanted', 'SKILL.md'), skill('not-wanted'));
  write(path.join(dir, 'plugins', 'aem', 'skills', 'no-skill-md', 'README.md'), 'not a skill');
  if (extra) extra(dir);
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'v1'], dir);
}

const ADOBE_PATHS = ['plugins/aem/**/skills', 'plugins/app-builder/skills'];

test('skillsPaths: nested skills are discovered and rendered as full dirs', (t) => {
  const { env, dir } = makeSandbox(t);
  const repo = path.join(dir, 'nested-repo');
  makeNestedRepo(repo);
  writeConfig(env, baseConfig({ sources: [{ name: 'nested', url: repo, ref: 'main', skillsPaths: ADOBE_PATHS }] }));
  runSourcesSync({ env, skoposRoot });

  const r = runInstall({ skoposRoot, env, mode: 'install' });
  for (const n of ['eds-block', 'aem-dispatcher', 'aem-top', 'ab-action']) {
    assert.ok(r.skills.includes(n), `${n} rendered`);
    assert.ok(fs.existsSync(path.join(env.agentsDir, 'skills', n, 'SKILL.md')));
  }
  assert.ok(!r.skills.includes('not-wanted'));
  assert.ok(!r.skills.includes('no-skill-md'));
  // references ship with the skill
  assert.equal(fs.readFileSync(path.join(env.agentsDir, 'skills', 'eds-block', 'references', 'guide.md'), 'utf8'), 'eds guide');
  // grouped by source for the CLI
  const g = r.skillsBySource.find((x) => x.origin === 'source:nested');
  assert.deepEqual(g.names.slice().sort(), ['ab-action', 'aem-dispatcher', 'aem-top', 'eds-block']);
  assert.ok(!r.warnings.some((w) => w.includes('provides no skills')));
  assert.equal(runVerify({ env }).ok, true);

  // status names the source for each skill
  const s = runStatus({ env, skoposRoot });
  assert.ok(s.skills.includes('eds-block (source:nested)'));
  assert.ok(s.skills.includes('code-review (catalog)'));
  const out = runCli(env, ['status']).stdout;
  assert.match(out, /source:nested.*\(4\).*eds-block/);
});

test('skillsPaths: sources without it keep root skills/ behaviour', (t) => {
  const { env, dir } = makeSandbox(t);
  const fixture = path.join(dir, 'fixture-repo');
  makeFixtureRepo(fixture);
  // a nested skill in a root-layout source is NOT picked up without opting in
  write(path.join(fixture, 'plugins', 'x', 'skills', 'hidden', 'SKILL.md'), skill('hidden'));
  git(['add', '-A'], fixture);
  git(['commit', '-q', '-m', 'nested'], fixture);
  writeConfig(env, baseConfig({ sources: [{ name: 'fixture', url: fixture, ref: 'main' }] }));
  runSourcesSync({ env, skoposRoot });
  const r = runInstall({ skoposRoot, env, mode: 'install' });
  assert.ok(r.skills.includes('fixture-skill'));
  assert.ok(!r.skills.includes('hidden'));
});

test('skillsPaths glob matching: ** spans zero or more segments, * and ? stay in one', (t) => {
  const { dir } = makeSandbox(t);
  const repo = path.join(dir, 'g');
  for (const d of ['plugins/aem/skills', 'plugins/aem/eds/skills', 'plugins/aem/a/b/skills',
    'plugins/aem/.hidden/skills', 'plugins/app-builder/skills', 'plugins/apx/skills', 'other/skills']) {
    fs.mkdirSync(path.join(repo, ...d.split('/')), { recursive: true });
  }
  assert.deepEqual(expandPattern(repo, 'plugins/aem/**/skills'),
    ['plugins/aem/a/b/skills', 'plugins/aem/eds/skills', 'plugins/aem/skills']);
  assert.deepEqual(expandPattern(repo, 'plugins/*/skills'),
    ['plugins/aem/skills', 'plugins/app-builder/skills', 'plugins/apx/skills']);
  assert.deepEqual(expandPattern(repo, 'plugins/ap?/skills'), ['plugins/apx/skills']);
  assert.deepEqual(expandPattern(repo, 'plugins/app-builder/skills'), ['plugins/app-builder/skills']);
  assert.deepEqual(expandPattern(repo, 'nope/skills'), []);
  // symlinked directories are never followed
  fs.symlinkSync(path.join(repo, 'other'), path.join(repo, 'plugins', 'linked'), 'dir');
  assert.ok(!expandPattern(repo, 'plugins/**/skills').some((p) => p.includes('linked')));
});

test('skillsPaths: duplicate name within one source keeps the first sorted path and warns', (t) => {
  const { env, dir } = makeSandbox(t);
  const repo = path.join(dir, 'nested-repo');
  makeNestedRepo(repo, (d) => {
    // same skill name in two places; plugins/aem/cloud-service < plugins/aem/edge-delivery-services
    write(path.join(d, 'plugins', 'aem', 'edge-delivery-services', 'skills', 'shared', 'SKILL.md'), skill('shared', 'from eds'));
    write(path.join(d, 'plugins', 'aem', 'cloud-service', 'skills', 'shared', 'SKILL.md'), skill('shared', 'from cloud-service'));
  });
  writeConfig(env, baseConfig({ sources: [{ name: 'nested', url: repo, ref: 'main', skillsPaths: ADOBE_PATHS }] }));
  runSourcesSync({ env, skoposRoot });
  const r = runInstall({ skoposRoot, env, mode: 'install' });
  assert.equal(r.skills.filter((n) => n === 'shared').length, 1);
  assert.ok(fs.readFileSync(path.join(env.agentsDir, 'skills', 'shared', 'SKILL.md'), 'utf8').includes('from cloud-service'));
  assert.ok(r.warnings.some((w) => w.includes("skill 'shared' at plugins/aem/edge-delivery-services/skills/shared in source:nested skipped")
    && w.includes('keeping plugins/aem/cloud-service/skills/shared')));
});

test('skillsPaths: collision across sources follows the existing "already provided by" rule', (t) => {
  const { env, dir } = makeSandbox(t);
  const fixture = path.join(dir, 'fixture-repo');
  makeFixtureRepo(fixture);
  const repo = path.join(dir, 'nested-repo');
  makeNestedRepo(repo, (d) => {
    write(path.join(d, 'plugins', 'app-builder', 'skills', 'fixture-skill', 'SKILL.md'), skill('fixture-skill', 'nested copy'));
    write(path.join(d, 'plugins', 'app-builder', 'skills', 'code-review', 'SKILL.md'), skill('code-review', 'nested review'));
  });
  writeConfig(env, baseConfig({ sources: [
    { name: 'fixture', url: fixture, ref: 'main' },
    { name: 'nested', url: repo, ref: 'main', skillsPaths: ADOBE_PATHS },
  ] }));
  runSourcesSync({ env, skoposRoot });
  const r = runInstall({ skoposRoot, env, mode: 'install' });
  assert.ok(r.warnings.includes("skill 'fixture-skill' from source:nested skipped — already provided by source:fixture"));
  assert.ok(r.warnings.includes("skill 'code-review' from catalog skipped — already provided by source:nested"));
  assert.ok(fs.readFileSync(path.join(env.agentsDir, 'skills', 'fixture-skill', 'SKILL.md'), 'utf8').includes('fixture skill body'));
});

test('a synced source yielding no skills, agents or templates warns', (t) => {
  const { env, dir } = makeSandbox(t);
  const repo = path.join(dir, 'nested-repo');
  makeNestedRepo(repo);

  // root layout expected, skills are nested → used to be a silent no-op
  writeConfig(env, baseConfig({ sources: [{ name: 'nested', url: repo, ref: 'main' }] }));
  runSourcesSync({ env, skoposRoot });
  const r = runInstall({ skoposRoot, env, mode: 'install' });
  assert.ok(r.warnings.some((w) => w.startsWith("source 'nested' is synced but provides no skills, agents or templates") && w.includes('skillsPaths')));
  assert.ok(runStatus({ env, skoposRoot }).warnings.some((w) => w.includes("source 'nested' is synced but provides no")));

  // skillsPaths that match nothing also warns, per pattern and for the source
  writeConfig(env, baseConfig({ sources: [{ name: 'nested', url: repo, ref: 'main', skillsPaths: ['plugins/nope/skills'] }] }));
  const r2 = runInstall({ skoposRoot, env, mode: 'update' });
  assert.ok(r2.warnings.some((w) => w.includes("skillsPaths entry 'plugins/nope/skills' for source:nested matched no skills")));
  assert.ok(r2.warnings.some((w) => w.includes("source 'nested' is synced but provides no")));

  // a productive source does not warn
  writeConfig(env, baseConfig({ sources: [{ name: 'nested', url: repo, ref: 'main', skillsPaths: ADOBE_PATHS }] }));
  const r3 = runInstall({ skoposRoot, env, mode: 'update' });
  assert.ok(!r3.warnings.some((w) => w.includes('provides no')));
});

test('config validate checks skillsPaths', (t) => {
  const cfg = (skillsPaths) => configLib.merge(configLib.builtinDefaults(),
    { sources: [{ name: 's', url: 'https://example.com/s.git', skillsPaths }] });
  const errs = (p) => configLib.validateConfig(cfg(p)).filter((e) => e.includes('skillsPaths'));

  assert.deepEqual(errs(undefined), []);
  assert.deepEqual(errs(ADOBE_PATHS), []);
  assert.deepEqual(errs(['skills']), []);
  assert.match(errs('plugins/aem/skills')[0], /must be an array/);
  assert.match(errs([])[0], /at least one path/);
  assert.match(errs([42])[0], /non-empty string/);
  assert.match(errs([''])[0], /non-empty string/);
  assert.match(errs(['/abs/skills'])[0], /not absolute/);
  assert.match(errs(['C:/abs/skills'])[0], /not absolute/);
  assert.match(errs(['plugins/../../etc'])[0], /'\.\.'/);
  assert.match(errs(['..'])[0], /'\.\.'/);
  assert.match(errs(['plugins\\aem'])[0], /forward slashes/);
  assert.equal(patternProblem('plugins/..x/skills'), null); // '..' only as a whole segment

  // through the CLI command too
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig({ sources: [{ name: 's', url: 'https://example.com/s.git', skillsPaths: ['../escape'] }] }));
  const r = runConfigValidate({ env, skoposRoot });
  assert.ok(r.errors.some((e) => e.startsWith('sources[0].skillsPaths[0]')));
  assert.equal(runCli(env, ['config', 'validate']).code, 1);
});
