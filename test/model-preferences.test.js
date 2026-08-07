'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { signalForAgent, familyRankedWeakToStrong, meetsRequirements } = require('../lib/model-preferences');
const { CAPABILITIES } = require('../lib/model-capabilities');

const smartAgent = { name: 'planner', data: { name: 'planner', model: 'smart', tools: ['read', 'grep', 'glob'] } };
const fastAgent = { name: 'scout', data: { name: 'scout', model: 'fast', tools: ['read', 'grep', 'glob'] } };
const toolHeavyAgent = {
  name: 'implementer',
  data: { name: 'implementer', model: 'fast', tools: ['read', 'grep', 'glob', 'edit', 'write', 'shell'] },
};

test('familyRankedWeakToStrong orders claude models by capability then cost', () => {
  const ranked = familyRankedWeakToStrong('claude');
  assert.deepEqual(ranked, ['haiku', 'sonnet', 'opus']); // haiku weakest; sonnet cheaper than opus at equal capability
});

test('meetsRequirements is a straightforward capability comparison', () => {
  assert.equal(meetsRequirements(CAPABILITIES.opus, { reasoningDepth: 'complex', toolUse: 'advanced' }), true);
  assert.equal(meetsRequirements(CAPABILITIES.haiku, { reasoningDepth: 'complex', toolUse: 'advanced' }), false);
});

test('signalForAgent picks the cheapest claude model that meets a smart agent\'s requirements', () => {
  const s = signalForAgent(smartAgent, 'claude');
  assert.equal(s.preferredModel, 'sonnet'); // ties opus on capability, cheaper
  assert.deepEqual(s.fallback, ['opus', 'haiku']); // strongest-first fallback, excluding the preference
  assert.match(s.rationale, /most cost-efficient claude model/);
});

test('signalForAgent picks haiku for a low-requirement fast agent', () => {
  const s = signalForAgent(fastAgent, 'claude');
  assert.equal(s.preferredModel, 'haiku');
});

test('signalForAgent escalates preference for a tool-heavy agent even at fast tier', () => {
  const s = signalForAgent(toolHeavyAgent, 'claude');
  assert.notEqual(s.preferredModel, 'haiku'); // haiku's basic tool-use doesn't cover 6 tools incl. shell
});

test('signalForAgent falls back to the strongest model when nothing fully qualifies', () => {
  // No copilot model in the registry is a perfect stand-in for "haiku doesn't
  // exist in this family" edge case, so exercise the unknown-family path.
  const s = signalForAgent(smartAgent, 'nonexistent-family');
  assert.equal(s.preferredModel, null);
  assert.match(s.rationale, /no known models registered/);
});

test('signalForAgent always includes the non-directive note', () => {
  const s = signalForAgent(smartAgent, 'claude');
  assert.match(s.note, /not a directive/);
});
