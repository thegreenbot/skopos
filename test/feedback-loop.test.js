'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, writeConfig, baseConfig, skoposRoot, read, fs, path } = require('./helpers');
const { runInstall, runVerify } = require('../lib/commands');
const { buildManifest } = require('../lib/manifest');
const configLib = require('../lib/config');
const fence = require('../lib/fence');

const LOOP_SKILLS = [
  'feature-interview', 'feature-charter', 'feature-plan',
  'feature-eval', 'feature-retro', 'feature-status',
];

test('the delivery-loop skills are in the catalog', (t) => {
  const { env } = makeSandbox(t);
  const config = configLib.merge(configLib.builtinDefaults(), { targets: { claude: true } });
  const plan = buildManifest(skoposRoot, config, env);
  const names = plan.skills.map((s) => s.name);
  for (const s of LOOP_SKILLS) assert.ok(names.includes(s), `missing skill: ${s}`);
});

test('install copies full skill dirs, including reference files', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  runInstall({ skoposRoot, env, mode: 'install' });

  const skills = path.join(env.agentsDir, 'skills');
  for (const s of LOOP_SKILLS) {
    assert.ok(fs.existsSync(path.join(skills, s, 'SKILL.md')), `${s}/SKILL.md not installed`);
  }
  // engsys shipped SKILL.md only; skopos must carry the whole directory.
  const ref = path.join(skills, 'feature-retro', 'references', 'guidance-template.md');
  assert.ok(fs.existsSync(ref), 'skill reference file was not installed');
  assert.match(read(ref), /Seen:/);
});

test('project-loop instructions land inside the managed block', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  runInstall({ skoposRoot, env, mode: 'install' });

  const claudeMd = read(path.join(env.claudeDir, 'CLAUDE.md'));
  const block = fence.extractBlock(claudeMd);
  assert.ok(block, 'no managed block rendered');
  assert.match(block, /docs\/skopos\/GUIDANCE\.md/);
  assert.match(block, /feature-charter/);
  assert.match(block, /Assumptions are the deliverable/);
});

test('the loop section is regenerated, but user facts around it survive', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig());
  runInstall({ skoposRoot, env, mode: 'install' });

  const p = path.join(env.claudeDir, 'CLAUDE.md');
  const withFact = read(p).replace(
    /(SKOPOS:USER-FACTS:START -->\n)/,
    '$1This repo keeps its lessons in docs/eng/GUIDANCE.md instead.\n',
  );
  fs.writeFileSync(p, withFact);

  runInstall({ skoposRoot, env, mode: 'update' });
  const after = read(p);
  assert.match(after, /docs\/eng\/GUIDANCE\.md instead/);
  assert.match(after, /docs\/skopos\/GUIDANCE\.md/);
  assert.equal(runVerify({ env }).ok, true);
});

test('skills can be deselected without breaking the rest of the catalog', (t) => {
  const { env } = makeSandbox(t);
  writeConfig(env, baseConfig({ catalog: { skills: ['feature-charter'], agents: 'all' } }));
  const r = runInstall({ skoposRoot, env, mode: 'install' });
  assert.deepEqual(r.skills, ['feature-charter']);
  assert.equal(r.agents.length, 5);
  const skills = path.join(env.agentsDir, 'skills');
  assert.ok(fs.existsSync(path.join(skills, 'feature-charter', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(skills, 'feature-retro')));
});

test('every loop skill declares a usable name and description', () => {
  const frontmatter = require('../lib/frontmatter');
  for (const s of LOOP_SKILLS) {
    const src = path.join(skoposRoot, 'catalog', 'skills', s, 'SKILL.md');
    const { data } = frontmatter.parse(fs.readFileSync(src, 'utf8'));
    assert.equal(data.name, s, `${s}: frontmatter name must match its directory`);
    assert.ok(data.description && data.description.length > 60,
      `${s}: description too thin to trigger reliably`);
  }
});
