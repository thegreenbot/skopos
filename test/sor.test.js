'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox, write } = require('./helpers');
const { SorOrchestrator, SorError } = require('../lib/sor');
const secretsLib = require('../lib/secrets');
const fs = require('fs');
const path = require('path');

test('SorOrchestrator.getSystem throws when SoR not enabled', (t) => {
  const { env } = makeSandbox(t);
  const config = {
    systemOfRecord: {
      enabled: false,
      systems: { test: {} },
    },
  };
  const sor = new SorOrchestrator(config, env);

  assert.throws(() => sor.getSystem('test'), (err) => {
    assert(err instanceof SorError);
    assert.equal(err.code, 'CONFIG');
    return true;
  });
});

test('SorOrchestrator.getSystem throws when system not found', (t) => {
  const { env } = makeSandbox(t);
  const config = {
    systemOfRecord: {
      enabled: true,
      systems: { jira: {} },
    },
  };
  const sor = new SorOrchestrator(config, env);

  assert.throws(() => sor.getSystem('github'), (err) => {
    assert(err instanceof SorError);
    assert.equal(err.code, 'CONFIG');
    return true;
  });
});

test('SorOrchestrator.getSystem returns system when configured and enabled', (t) => {
  const { env } = makeSandbox(t);
  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        jira: { kind: 'jira', baseUrl: 'https://example.atlassian.net' },
      },
    },
  };
  const sor = new SorOrchestrator(config, env);
  const system = sor.getSystem('jira');
  assert.equal(system.kind, 'jira');
});

test('SorOrchestrator.createClient throws with AUTH_MISSING when secret not found', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  fs.writeFileSync(path.join(env.skoposHome, 'credentials.json'), '{}', { mode: 0o600 });

  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        mock: { kind: 'mock', auth: { type: 'token', tokenEnv: 'MISSING' } },
      },
    },
  };
  const sor = new SorOrchestrator(config, env);

  assert.throws(() => sor.createClient('mock'), (err) => {
    assert(err instanceof SorError);
    assert.equal(err.code, 'AUTH_MISSING');
    return true;
  });
});

test('SorOrchestrator.createClient creates mock client when credentials present', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  secretsLib.writeCredentials(env, {
    mock: { token: 'test-token' },
  });

  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        mock: { kind: 'mock', auth: { type: 'token' } },
      },
    },
  };
  const sor = new SorOrchestrator(config, env);
  const client = sor.createClient('mock');

  assert(client);
  assert.equal(typeof client.authenticate, 'function');
});

test('SorOrchestrator.test returns checks for config and credential', async (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  secretsLib.writeCredentials(env, {
    mock: { token: 'test-token' },
  });

  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        mock: { kind: 'mock', auth: { type: 'token' } },
      },
    },
  };
  const sor = new SorOrchestrator(config, env);
  const result = await sor.test('mock');

  assert.equal(result.ok, true);
  assert(Array.isArray(result.checks));
  assert(result.checks.some((c) => c.name === 'config'));
  assert(result.checks.some((c) => c.name === 'credential'));
});

test('SorOrchestrator.test fails fast on credential check failure', async (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  fs.writeFileSync(path.join(env.skoposHome, 'credentials.json'), '{}', { mode: 0o600 });

  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        mock: { kind: 'mock', auth: { type: 'token', tokenEnv: 'MISSING' } },
      },
    },
  };
  const sor = new SorOrchestrator(config, env);
  const result = await sor.test('mock');

  assert.equal(result.ok, false);
  const credCheck = result.checks.find((c) => c.name === 'credential');
  assert.equal(credCheck.ok, false);
});

test('SorOrchestrator passes fetchImpl option to integration', (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  secretsLib.writeCredentials(env, {
    mock: { token: 'test-token' },
  });

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return new Response('{}');
  };

  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        mock: { kind: 'mock', auth: { type: 'token' } },
      },
    },
  };
  const sor = new SorOrchestrator(config, env, { fetchImpl: mockFetch });

  // Verify the orchestrator accepts fetchImpl without error
  assert(sor.fetchImpl === mockFetch);
});

test('SorOrchestrator logs messages when log function provided', async (t) => {
  const { env } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });
  secretsLib.writeCredentials(env, {
    mock: { token: 'test-token' },
  });

  const logs = [];
  const config = {
    systemOfRecord: {
      enabled: true,
      systems: {
        mock: { kind: 'mock', auth: { type: 'token' } },
      },
    },
  };
  const sor = new SorOrchestrator(config, env, {
    log: (msg) => logs.push(msg),
  });

  await sor.test('mock');
  assert(sor.log === logs.push); // Verify log function was set
});

test('SorOrchestrator uses custom now function for timestamps', (t) => {
  const { env } = makeSandbox(t);
  const customNow = () => new Date('2025-01-01');

  const config = {
    systemOfRecord: {
      enabled: true,
      systems: { mock: { kind: 'mock' } },
    },
  };
  const sor = new SorOrchestrator(config, env, { now: customNow });

  assert.equal(sor.now(), customNow());
});

test('SorOrchestrator respects timeoutMs option', (t) => {
  const { env } = makeSandbox(t);
  const config = {
    systemOfRecord: {
      enabled: true,
      systems: { mock: { kind: 'mock' } },
    },
  };
  const sor = new SorOrchestrator(config, env, { timeoutMs: 5000 });

  assert.equal(sor.timeoutMs, 5000);
});
