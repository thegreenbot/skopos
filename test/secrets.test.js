'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox, write } = require('./helpers');
const secretsLib = require('../lib/secrets');

test('SorError has correct code and remedy', (t) => {
  const err = new secretsLib.SorError('CONFIG', 'Missing config', { remedy: 'Check your setup' });
  assert.equal(err.code, 'CONFIG');
  assert.equal(err.message, 'Missing config');
  assert.equal(err.remedy, 'Check your setup');
});

test('findSecretLiterals detects common token patterns in config', (t) => {
  const config = {
    systems: {
      test: {
        auth: {
          token: 'ghp_abcdef1234567890',
          apiKey: 'sk-1234567890abcdef',
          password: 'my-secret-password',
        },
      },
    },
  };
  const secrets = secretsLib.findSecretLiterals(config, 'systems.test');
  assert(secrets.length > 0);
  assert(secrets.some((s) => s.includes('token') || s.includes('apiKey') || s.includes('password')));
});

test('findSecretLiterals ignores non-secret fields', (t) => {
  const config = {
    systems: {
      test: {
        baseUrl: 'https://example.com',
        project: { key: 'PROJ' },
        name: 'my-system',
      },
    },
  };
  const secrets = secretsLib.findSecretLiterals(config, 'systems.test');
  assert.equal(secrets.length, 0);
});

test('resolveSecret prioritizes env vars over credentials.json', (t) => {
  const { env, dir } = makeSandbox(t);
  const credentialsPath = path.join(env.skoposHome, 'credentials.json');
  fs.mkdirSync(env.skoposHome, { recursive: true });

  // Write credentials file
  fs.writeFileSync(credentialsPath, JSON.stringify({
    version: 1,
    secrets: {
      'jira-cloud': { value: 'file-token', createdAt: '2025-01-01T00:00:00Z' },
    },
  }), { mode: 0o600 });

  const system = {
    auth: { tokenEnv: 'JIRA_TOKEN', tokenRef: 'jira-cloud' },
  };

  // With env var set, should use env var
  const originalEnv = process.env.JIRA_TOKEN;
  try {
    process.env.JIRA_TOKEN = 'env-token';
    const secret = secretsLib.resolveSecret(env, system, 'jira-cloud');
    assert.equal(secret, 'env-token');
  } finally {
    process.env.JIRA_TOKEN = originalEnv;
  }
});

test('resolveSecret reads from credentials.json when env var not set', (t) => {
  const { env } = makeSandbox(t);
  const credentialsPath = path.join(env.skoposHome, 'credentials.json');
  fs.mkdirSync(env.skoposHome, { recursive: true });

  fs.writeFileSync(credentialsPath, JSON.stringify({
    version: 1,
    secrets: {
      'github': { value: 'ghp_secret', createdAt: '2025-01-01T00:00:00Z' },
    },
  }), { mode: 0o600 });

  const system = { auth: { tokenRef: 'github' } };

  const secret = secretsLib.resolveSecret(env, system, 'github');
  assert.equal(secret, 'ghp_secret');
});

test('resolveSecret throws if credential file is world-readable (security check)', (t) => {
  const { env } = makeSandbox(t);
  const credentialsPath = path.join(env.skoposHome, 'credentials.json');
  fs.mkdirSync(env.skoposHome, { recursive: true });

  fs.writeFileSync(credentialsPath, JSON.stringify({
    version: 1,
    secrets: {
      'test': { value: 'secret', createdAt: '2025-01-01T00:00:00Z' },
    },
  }), { mode: 0o644 }); // world-readable - BAD

  const system = { auth: { tokenRef: 'test' } };

  assert.throws(() => {
    secretsLib.resolveSecret(env, system, 'test');
  }, /permissions/i);
});

test('writeCredentials creates file with 0600 permissions', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });

  secretsLib.writeCredentials(env, {
    'test': { value: 'secret', createdAt: '2025-01-01T00:00:00Z' },
  });

  const credentialsPath = path.join(env.skoposHome, 'credentials.json');
  const stat = fs.statSync(credentialsPath);
  const mode = (stat.mode & parseInt('777', 8)).toString(8);
  assert.equal(mode, '600');
});

test('redact() scrubs tokens from strings', (t) => {
  const original = 'Authenticated with token ghp_1234567890abcdef in Jira';
  const redacted = secretsLib.redact(original);
  assert(!redacted.includes('ghp_'));
  assert(redacted.includes('[REDACTED]'));
});

test('resolveSecret throws with remedy when no token found', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  fs.writeFileSync(path.join(env.skoposHome, 'credentials.json'), '{}', { mode: 0o600 });

  const system = { auth: { type: 'token', tokenEnv: 'MISSING_TOKEN' } };

  assert.throws(() => {
    secretsLib.resolveSecret(env, system, 'test');
  }, (err) => {
    assert.equal(err.code, 'AUTH_MISSING');
    assert(err.remedy);
    return true;
  });
});
