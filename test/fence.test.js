'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fence = require('../lib/fence');

const BODY = [
  '# Persona',
  '',
  'managed content v1',
  '',
  fence.USER_FACTS_START,
  '_default facts placeholder_',
  fence.USER_FACTS_END,
].join('\n');

test('applyBlock creates a new file when none exists', () => {
  const { text, action } = fence.applyBlock(null, BODY);
  assert.equal(action, 'created');
  assert.ok(text.includes(fence.MANAGED_START));
  assert.ok(text.includes(fence.MANAGED_END));
  assert.ok(text.includes('managed content v1'));
  assert.ok(fence.hasBlock(text));
});

test('applyBlock appends to an existing file without a block', () => {
  const existing = '# My CLAUDE.md\n\nmy own rules\n';
  const { text, action } = fence.applyBlock(existing, BODY);
  assert.equal(action, 'appended');
  assert.ok(text.startsWith('# My CLAUDE.md'));
  assert.ok(text.indexOf('my own rules') < text.indexOf(fence.MANAGED_START));
});

test('applyBlock replaces an existing block, leaving surroundings intact', () => {
  const v1 = fence.applyBlock('above\n', BODY).text + '\nbelow\n';
  const v2body = BODY.replace('managed content v1', 'managed content v2');
  const { text, action } = fence.applyBlock(v1, v2body);
  assert.equal(action, 'replaced');
  assert.ok(text.includes('managed content v2'));
  assert.ok(!text.includes('managed content v1'));
  assert.ok(text.startsWith('above\n'));
  assert.ok(text.endsWith('below\n'));
  // exactly one block
  assert.equal(text.split(fence.MANAGED_START).length, 2);
});

test('applyBlock preserves USER-FACTS content across regeneration', () => {
  const v1 = fence.applyBlock(null, BODY).text;
  const edited = v1.replace('_default facts placeholder_', 'I use spaces, not tabs.');
  const v2 = fence.applyBlock(edited, BODY.replace('v1', 'v2'));
  assert.equal(v2.action, 'replaced');
  assert.ok(v2.text.includes('I use spaces, not tabs.'));
  assert.ok(!v2.text.includes('_default facts placeholder_'));
  assert.ok(v2.text.includes('managed content v2'));
});

test('empty USER-FACTS falls back to the fresh default', () => {
  const v1 = fence.applyBlock(null, BODY).text;
  const emptied = v1.replace('_default facts placeholder_\n', '');
  const v2 = fence.applyBlock(emptied, BODY);
  assert.ok(v2.text.includes('_default facts placeholder_'));
});

test('stripBlock removes the block and keeps user content', () => {
  const full = fence.applyBlock('# mine\n\ncontent\n', BODY).text;
  const stripped = fence.stripBlock(full);
  assert.ok(!stripped.includes('SKOPOS:MANAGED'));
  assert.ok(!stripped.includes('managed content'));
  assert.ok(stripped.includes('# mine'));
  assert.ok(stripped.includes('content'));
});

test('stripBlock on a skopos-created file leaves effectively nothing', () => {
  const full = fence.applyBlock(null, BODY).text;
  assert.equal(fence.stripBlock(full).trim(), '');
});

test('stripBlock is a no-op without a block', () => {
  assert.equal(fence.stripBlock('hello\n'), 'hello\n');
});

test('extractBlock/extractUserFacts return null when absent', () => {
  assert.equal(fence.extractBlock('nope'), null);
  assert.equal(fence.extractUserFacts('nope'), null);
});

test('normalizeUserFacts blanks facts so user edits are not drift', () => {
  const a = fence.extractBlock(fence.applyBlock(null, BODY).text);
  const edited = a.replace('_default facts placeholder_', 'personal note');
  assert.notEqual(a, edited);
  assert.equal(fence.normalizeUserFacts(a), fence.normalizeUserFacts(edited));
});

test('malformed region (start without end) is treated as no block', () => {
  const broken = `before\n${fence.MANAGED_START}\nno end marker\n`;
  assert.equal(fence.hasBlock(broken), false);
  const { action } = fence.applyBlock(broken, BODY);
  assert.equal(action, 'appended');
});
