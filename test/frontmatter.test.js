'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fm = require('../lib/frontmatter');

test('parse extracts scalars, inline arrays, and body', () => {
  const doc = [
    '---',
    'name: scout',
    'description: Read-only interrogation',
    'model: fast',
    'tools: [read, grep, glob]',
    '---',
    '',
    'Body here.',
  ].join('\n');
  const { data, body } = fm.parse(doc);
  assert.equal(data.name, 'scout');
  assert.equal(data.model, 'fast');
  assert.deepEqual(data.tools, ['read', 'grep', 'glob']);
  assert.equal(body, 'Body here.');
});

test('parse handles dash lists and quoted values', () => {
  const doc = [
    '---',
    "description: 'quoted: value'",
    'tools:',
    '  - read',
    '  - shell',
    '---',
    'b',
  ].join('\n');
  const { data } = fm.parse(doc);
  assert.equal(data.description, 'quoted: value');
  assert.deepEqual(data.tools, ['read', 'shell']);
});

test('parse without frontmatter returns null data', () => {
  const { data, body } = fm.parse('just a body');
  assert.equal(data, null);
  assert.equal(body, 'just a body');
});

test('serialize omits undefined keys and round-trips', () => {
  const out = fm.serialize({ name: 'x', model: undefined, tools: ['a', 'b'] }, 'Body.');
  assert.ok(!out.includes('model'));
  const { data, body } = fm.parse(out);
  assert.equal(data.name, 'x');
  assert.deepEqual(data.tools, ['a', 'b']);
  assert.equal(body.trim(), 'Body.');
});

test('parse tolerates CRLF line endings', () => {
  const doc = '---\r\nname: x\r\n---\r\nbody';
  const { data, body } = fm.parse(doc);
  assert.equal(data.name, 'x');
  assert.equal(body, 'body');
});
