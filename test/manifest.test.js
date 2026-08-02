'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, skoposRoot, write, path } = require('./helpers');
const { buildManifest } = require('../lib/manifest');
const configLib = require('../lib/config');

function cfg(overrides) {
  return configLib.merge(configLib.builtinDefaults(), Object.assign({ targets: { claude: true } }, overrides));
}

test('catalog content is discovered', (t) => {
  const { env } = makeSandbox(t);
  const plan = buildManifest(skoposRoot, cfg(), env);
  assert.ok(plan.skills.some((s) => s.name === 'skopos-setup'));
  const agentNames = plan.agents.map((a) => a.name).sort();
  assert.deepEqual(agentNames, ['implementer', 'planner', 'reviewer', 'scout', 'sentinel']);
  assert.ok(plan.personaTemplate.includes('{{ROSTER}}'));
  assert.deepEqual(plan.targets, ['claude']);
  const templateNames = plan.templates.map((t) => t.name).sort();
  assert.deepEqual(templateNames, [
    'code-review-report', 'feature-charter', 'feature-eval', 'feature-plan',
    'feature-retro', 'pr-description', 'spec-sheet',
  ]);
  assert.ok(plan.templates.every((t) => t.origin === 'catalog'));
});

test('catalog selection filters built-ins', (t) => {
  const { env } = makeSandbox(t);
  const plan = buildManifest(skoposRoot, cfg({
    catalog: { agents: ['scout'], skills: ['skopos-setup'], templates: ['pr-description'] },
  }), env);
  assert.deepEqual(plan.agents.map((a) => a.name), ['scout']);
  assert.deepEqual(plan.skills.map((s) => s.name), ['skopos-setup']);
  assert.deepEqual(plan.templates.map((t) => t.name), ['pr-description']);
});

test('config.templates entries take precedence over the catalog and are collected', (t) => {
  const { env } = makeSandbox(t);
  const plan = buildManifest(skoposRoot, cfg({
    templates: [
      { name: 'adr', description: 'Architecture decision record', content: '# ADR\n' },
      { name: 'pr-description', description: 'override', content: 'custom body' },
    ],
  }), env);
  const adr = plan.templates.find((t) => t.name === 'adr');
  assert.equal(adr.origin, 'config');
  assert.equal(adr.body, '# ADR');
  const pr = plan.templates.find((t) => t.name === 'pr-description');
  assert.equal(pr.origin, 'config');
  assert.equal(pr.body, 'custom body');
  assert.ok(plan.warnings.some((w) => w.includes("template 'pr-description' from catalog skipped")));
});

test('sources take precedence over catalog; collisions warn and skip', (t) => {
  const { env } = makeSandbox(t);
  const srcDir = path.join(env.skoposHome, 'sources', 'acme');
  write(path.join(srcDir, 'agents', 'scout.md'), '---\nname: scout\ndescription: acme scout\nmodel: fast\n---\nacme body');
  write(path.join(srcDir, 'skills', 'acme-deploy', 'SKILL.md'), '---\nname: acme-deploy\ndescription: d\n---\nbody');
  const plan = buildManifest(skoposRoot, cfg({ sources: [{ name: 'acme', url: 'x' }] }), env);

  const scout = plan.agents.find((a) => a.name === 'scout');
  assert.equal(scout.origin, 'source:acme');
  assert.equal(scout.data.description, 'acme scout');
  assert.ok(plan.skills.some((s) => s.name === 'acme-deploy'));
  assert.ok(plan.warnings.some((w) => w.includes("agent 'scout' from catalog skipped")));
});

test('unsynced source warns instead of failing', (t) => {
  const { env } = makeSandbox(t);
  const plan = buildManifest(skoposRoot, cfg({ sources: [{ name: 'ghost', url: 'x' }] }), env);
  assert.ok(plan.warnings.some((w) => w.includes("source 'ghost' not synced")));
  assert.ok(plan.agents.length >= 5); // catalog still fully present
});

test('source templates take precedence over catalog templates; collisions warn and skip', (t) => {
  const { env } = makeSandbox(t);
  const srcDir = path.join(env.skoposHome, 'sources', 'acme');
  write(path.join(srcDir, 'templates', 'pr-description.md'), '---\nname: pr-description\ndescription: acme pr\n---\nacme body');
  const plan = buildManifest(skoposRoot, cfg({ sources: [{ name: 'acme', url: 'x' }] }), env);
  const pr = plan.templates.find((t) => t.name === 'pr-description');
  assert.equal(pr.origin, 'source:acme');
  assert.equal(pr.body, 'acme body');
  assert.ok(plan.warnings.some((w) => w.includes("template 'pr-description' from catalog skipped")));
});

test('template missing frontmatter name is skipped with a warning', (t) => {
  const { env } = makeSandbox(t);
  const srcDir = path.join(env.skoposHome, 'sources', 'acme');
  write(path.join(srcDir, 'templates', 'broken.md'), 'no frontmatter at all');
  const plan = buildManifest(skoposRoot, cfg({ sources: [{ name: 'acme', url: 'x' }] }), env);
  assert.ok(plan.warnings.some((w) => w.includes('template missing frontmatter name')));
});

test('source instruction sections are collected', (t) => {
  const { env } = makeSandbox(t);
  const srcDir = path.join(env.skoposHome, 'sources', 'acme');
  write(path.join(srcDir, 'instructions', 'compliance.md'), '## Compliance\nAlways.');
  const plan = buildManifest(skoposRoot, cfg({ sources: [{ name: 'acme', url: 'x' }] }), env);
  assert.ok(plan.instructionSections.some((s) => s.name === 'compliance' && s.origin === 'source:acme'));
});

test('agent without a name in frontmatter is skipped with a warning', (t) => {
  const { env } = makeSandbox(t);
  const srcDir = path.join(env.skoposHome, 'sources', 'acme');
  write(path.join(srcDir, 'agents', 'broken.md'), 'no frontmatter at all');
  const plan = buildManifest(skoposRoot, cfg({ sources: [{ name: 'acme', url: 'x' }] }), env);
  assert.ok(plan.warnings.some((w) => w.includes('missing frontmatter name')));
});
