'use strict';

// Cross-model compatibility: validates that every catalog agent renders and
// advises correctly against every model tier this repo claims to support,
// not just whatever the default config happens to map. This is the
// regression net for the "a model silently can't use an available skill"
// failure mode issue #19 exists to prevent.

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, skoposRoot } = require('./helpers');
const { buildManifest } = require('../lib/manifest');
const configLib = require('../lib/config');
const adapters = require('../adapters');
const { assess, compatibilityMatrix } = require('../lib/model-advisor');
const { allModels, capabilitiesFor, DEPTH_RANK, TOOLUSE_RANK } = require('../lib/model-capabilities');

function planWith(env, overrides) {
  const config = configLib.merge(configLib.builtinDefaults(), Object.assign({ targets: { claude: true, copilot: true } }, overrides));
  return { config, plan: buildManifest(skoposRoot, config, env) };
}

test('every catalog agent renders without throwing for every claude and copilot tier', (t) => {
  const { env } = makeSandbox(t);
  const { config, plan } = planWith(env);
  for (const model of allModels()) {
    for (const targetName of ['claude', 'copilot']) {
      const adapter = adapters.get(targetName);
      for (const agent of plan.agents) {
        // Force this exact model via the per-agent override so rendering is
        // exercised against every registered model, not just configured tiers.
        const forced = configLib.merge(config, { models: { agents: { [agent.name]: model } } });
        assert.doesNotThrow(() => adapter.renderAgent(agent, forced), `${targetName}/${agent.name}/${model} render threw`);
      }
    }
  }
});

test('compatibilityMatrix covers every catalog agent x every registered model exactly once', (t) => {
  const { env } = makeSandbox(t);
  const { plan } = planWith(env);
  const matrix = compatibilityMatrix(plan);
  assert.equal(matrix.length, plan.agents.length);
  for (const row of matrix) {
    assert.equal(row.cells.length, allModels().length);
    assert.deepEqual(row.cells.map((c) => c.model), allModels());
  }
});

test('compatibilityMatrix agrees with a from-scratch capability comparison for every cell', (t) => {
  const { env } = makeSandbox(t);
  const { plan } = planWith(env);
  const matrix = compatibilityMatrix(plan);

  for (const row of matrix) {
    const agent = plan.agents.find((a) => a.name === row.agent);
    for (const cell of row.cells) {
      const caps = capabilitiesFor(cell.model);
      const meetsDepth = DEPTH_RANK[caps.reasoningDepth] >= DEPTH_RANK[cell.requirements.reasoningDepth];
      const meetsTools = TOOLUSE_RANK[caps.toolUse] >= TOOLUSE_RANK[cell.requirements.toolUse];
      const expectedOk = meetsDepth && meetsTools;
      assert.equal(cell.warnings.length === 0, expectedOk, `${row.agent} x ${cell.model} mismatch`);
    }
  }
});

test('haiku is known-compatible with low-tool "fast" agents but not "smart" agents', (t) => {
  const { env } = makeSandbox(t);
  const { plan } = planWith(env);
  const scout = plan.agents.find((a) => a.name === 'scout'); // fast, read-only tools
  const planner = plan.agents.find((a) => a.name === 'planner'); // smart

  assert.deepEqual(assess(scout, 'haiku').warnings, []);
  assert.ok(assess(planner, 'haiku').warnings.length > 0);
});

test('a tool-heavy "fast" agent still requires advanced tool-use, regardless of reasoning tier', (t) => {
  const { env } = makeSandbox(t);
  const { plan } = planWith(env);
  const implementer = plan.agents.find((a) => a.name === 'implementer'); // fast, 6 tools incl. shell
  const r = assess(implementer, 'haiku');
  assert.ok(r.warnings.some((w) => w.includes('tool-use')));
});

test('every registered model is reachable from at least one target family', () => {
  const families = new Set(allModels().map((m) => capabilitiesFor(m).family));
  assert.ok(families.has('claude'));
  assert.ok(families.has('copilot'));
});
