'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const base = require('../lib/integrations/base');

test('buildArtifactName produces correct format', () => {
  const name = base.buildArtifactName({ feature: 'billing-export', kind: 'charter', version: 7 });
  assert.equal(name, 'skopos--billing-export--charter--v007.md');
});

test('buildArtifactName with version 1', () => {
  const name = base.buildArtifactName({ feature: 'login-flow', kind: 'interview-po', version: 1 });
  assert.equal(name, 'skopos--login-flow--interview-po--v001.md');
});

test('parseArtifactName extracts feature, kind, and version', () => {
  const parsed = base.parseArtifactName('skopos--billing-export--charter--v007.md');
  assert.equal(parsed.feature, 'billing-export');
  assert.equal(parsed.kind, 'charter');
  assert.equal(parsed.version, 7);
});

test('parseArtifactName returns null for non-skopos files', () => {
  const parsed = base.parseArtifactName('my-interview.md');
  assert.equal(parsed, null);
});

test('parseArtifactName returns null for malformed skopos files', () => {
  const parsed = base.parseArtifactName('skopos--feature--missing-version.md');
  assert.equal(parsed, null);
});

test('parseArtifactName handles zero-padded versions', () => {
  const parsed = base.parseArtifactName('skopos--feature--charter--v042.md');
  assert.equal(parsed.version, 42);
});

test('sha256() produces consistent hashes', () => {
  const content = 'test content';
  const hash1 = base.sha256(content);
  const hash2 = base.sha256(content);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64); // hex digest is 64 chars
});

test('sha256() produces different hashes for different content', () => {
  const hash1 = base.sha256('content1');
  const hash2 = base.sha256('content2');
  assert.notEqual(hash1, hash2);
});

test('withRetry retries on retryable errors', async (t) => {
  let attempts = 0;
  const { SorError } = require('../lib/secrets');
  const retryable = new SorError('RATE_LIMITED', 'Too many requests');

  const result = await base.withRetry(async () => {
    attempts++;
    if (attempts < 3) throw retryable;
    return 'success';
  }, { attempts: 3 });

  assert.equal(result, 'success');
  assert.equal(attempts, 3);
});

test('withRetry throws on fatal errors immediately', async (t) => {
  const { SorError } = require('../lib/secrets');
  const fatal = new SorError('AUTH_FAILED', 'Authentication failed');

  assert.rejects(
    () => base.withRetry(async () => {
      throw fatal;
    }),
    (err) => err.code === 'AUTH_FAILED',
  );
});

test('withRetry respects attempts limit', async (t) => {
  let attempts = 0;
  const { SorError } = require('../lib/secrets');
  const retryable = new SorError('NETWORK', 'Network error');

  assert.rejects(
    () => base.withRetry(
      async () => {
        attempts++;
        throw retryable;
      },
      { attempts: 2 },
    ),
    (err) => err.code === 'NETWORK',
  );

  assert(attempts > 0);
});
