'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  CAPABILITIES, capabilitiesFor, allModels, modelsInFamily, DEPTH_RANK, TOOLUSE_RANK,
} = require('../lib/model-capabilities');

test('every registered model has a complete capability profile', () => {
  for (const [name, c] of Object.entries(CAPABILITIES)) {
    assert.ok(c.family, `${name} missing family`);
    assert.ok(c.reasoningDepth in DEPTH_RANK, `${name} has unknown reasoningDepth: ${c.reasoningDepth}`);
    assert.ok(c.toolUse in TOOLUSE_RANK, `${name} has unknown toolUse: ${c.toolUse}`);
    assert.ok(['high', 'medium', 'low'].includes(c.concurrentTools), `${name} has unknown concurrentTools: ${c.concurrentTools}`);
    assert.ok(['high', 'medium', 'low'].includes(c.costTier), `${name} has unknown costTier: ${c.costTier}`);
    assert.ok(Array.isArray(c.bestFor) && c.bestFor.length, `${name} missing bestFor`);
  }
});

test('capabilitiesFor looks up a known model and misses gracefully', () => {
  assert.equal(capabilitiesFor('opus').reasoningDepth, 'complex');
  assert.equal(capabilitiesFor('does-not-exist'), null);
  assert.equal(capabilitiesFor(undefined), null);
});

test('allModels lists every registered model name', () => {
  assert.deepEqual(allModels().sort(), Object.keys(CAPABILITIES).sort());
});

test('modelsInFamily filters by provider family', () => {
  assert.deepEqual(modelsInFamily('claude').sort(), ['haiku', 'opus', 'sonnet']);
  assert.ok(modelsInFamily('copilot').length > 0);
  assert.deepEqual(modelsInFamily('nonexistent'), []);
});

test('opus and sonnet both outrank haiku on reasoning depth and tool-use', () => {
  for (const name of ['opus', 'sonnet']) {
    const c = capabilitiesFor(name);
    assert.ok(DEPTH_RANK[c.reasoningDepth] > DEPTH_RANK[capabilitiesFor('haiku').reasoningDepth]);
    assert.ok(TOOLUSE_RANK[c.toolUse] >= TOOLUSE_RANK[capabilitiesFor('haiku').toolUse]);
  }
});
