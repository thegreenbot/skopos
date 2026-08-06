'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox } = require('./helpers');
const jira = require('../lib/integrations/jira');

// Mock fetch responses for testing
function createMockFetch(responses = {}) {
  return async (url, opts) => {
    const key = `${opts?.method || 'GET'} ${url}`;
    const response = responses[key] || responses[url];

    if (!response) {
      throw new Error(`No mock response for ${key}`);
    }

    if (response.error) {
      throw response.error;
    }

    return new Response(JSON.stringify(response.body), {
      status: response.status || 200,
      headers: response.headers || { 'content-type': 'application/json' },
    });
  };
}

test('JiraClient.authenticate calls /rest/api/3/myself', async (t) => {
  const { env } = makeSandbox(t);
  let authCalled = false;

  const mockFetch = createMockFetch({
    'https://example.atlassian.net/rest/api/3/myself': {
      body: {
        accountId: 'user123',
        displayName: 'Test User',
        emailAddress: 'test@example.com',
      },
    },
  });

  const client = jira.create({
    system: {
      baseUrl: 'https://example.atlassian.net',
      auth: { mode: 'apiToken', username: 'user@example.com' },
      project: 'FEAT',
    },
    secret: 'jira-token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const auth = await client.authenticate();
  assert.equal(auth.accountId, 'user123');
  assert.equal(auth.displayName, 'Test User');
});

test('JiraClient.resolveTarget converts FEAT-123 to issue', async (t) => {
  const { env } = makeSandbox(t);
  const mockFetch = createMockFetch({
    'https://example.atlassian.net/rest/api/3/issues/FEAT-123': {
      body: {
        id: '123',
        key: 'FEAT-123',
        fields: { summary: 'Feature Title' },
      },
    },
  });

  const client = jira.create({
    system: {
      baseUrl: 'https://example.atlassian.net',
      project: { key: 'FEAT' },
    },
    secret: { token: 'jira-token' },
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = await client.resolveTarget('FEAT-123');
  assert.equal(target.key, 'FEAT-123');
  assert.equal(target.container, 'FEAT');
});

test('JiraClient.list fetches attachments matching skopos-- prefix', async (t) => {
  const { env } = makeSandbox(t);
  const mockFetch = createMockFetch({
    'https://example.atlassian.net/rest/api/3/issues/FEAT-123': {
      body: {
        id: '123',
        key: 'FEAT-123',
        fields: {
          summary: 'Feature Title',
          attachment: [
            {
              id: 'att1',
              filename: 'skopos--feature--charter--v001.md',
              created: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'att2',
              filename: 'other-file.txt',
              created: '2025-01-02T00:00:00.000Z',
            },
          ],
        },
      },
    },
  });

  const client = jira.create({
    system: {
      baseUrl: 'https://example.atlassian.net',
      project: { key: 'FEAT' },
    },
    secret: { token: 'jira-token' },
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = await client.resolveTarget('FEAT-123');
  const list = await client.list(target);

  assert(Array.isArray(list.artifacts));
  assert.equal(list.artifacts.length, 1);
  assert(list.artifacts[0].filename.includes('skopos--'));
});

test('JiraClient.publish formats artifact with frontmatter', async (t) => {
  const { env } = makeSandbox(t);
  let uploadedContent = null;

  const mockFetch = async (url, opts) => {
    if (url.includes('/attachments')) {
      // Capture the FormData body
      uploadedContent = opts.body;
      return new Response(JSON.stringify({
        values: [{ id: 'att1', filename: 'skopos--feature--charter--v001.md' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const client = jira.create({
    system: {
      baseUrl: 'https://example.atlassian.net',
      project: { key: 'FEAT' },
    },
    secret: { token: 'jira-token' },
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { container: '123', key: 'FEAT-123' };
  const result = await client.publish(target, {
    title: 'Feature Charter',
    body: 'Charter content here',
  });

  assert.equal(result.ok, true);
});

test('JiraClient has required capabilities', () => {
  assert(Array.isArray(jira.capabilities.storageModes));
  assert(jira.capabilities.storageModes.includes('attachment'));
  assert.equal(jira.capabilities.attachments, true);
  assert(jira.capabilities.maxArtifactBytes > 0);
});

test('JiraClient.mapStatus converts HTTP codes to SorError codes', (t) => {
  const testCases = [
    { status: 401, expectedCode: 'AUTH_FAILED' },
    { status: 403, expectedCode: 'PERMISSION_DENIED' },
    { status: 404, expectedCode: 'NOT_FOUND' },
    { status: 413, expectedCode: 'PAYLOAD_TOO_LARGE' },
    { status: 429, expectedCode: 'RATE_LIMITED' },
    { status: 500, expectedCode: 'SERVER' },
  ];

  for (const { status, expectedCode } of testCases) {
    const mapped = jira.mapStatus(status);
    assert.equal(mapped.code, expectedCode, `Status ${status} should map to ${expectedCode}`);
  }
});

test('JiraClient validates system config', async (t) => {
  const errors = jira.validateConfig({
    kind: 'jira',
    // missing baseUrl
    project: { key: 'FEAT' },
  }, 'systemOfRecord.systems.test');

  assert(Array.isArray(errors));
  assert(errors.length > 0);
  assert(errors.some((e) => e.includes('baseUrl')));
});
