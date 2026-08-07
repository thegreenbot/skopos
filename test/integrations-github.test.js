'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox } = require('./helpers');
const github = require('../lib/integrations/github');

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

test('GitHubClient.authenticate calls /user endpoint', async (t) => {
  const mockFetch = createMockFetch({
    'https://api.github.com/user': {
      body: {
        id: 'user123',
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
      },
    },
  });

  const client = github.create({
    system: {
      baseUrl: 'https://api.github.com',
      repo: 'owner/repo',
      auth: { mode: 'bearer' },
    },
    secret: 'ghp_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const auth = await client.authenticate();
  assert.equal(auth.accountId, 'user123');
  assert.equal(auth.displayName, 'Test User');
});

test('GitHubClient.resolveTarget converts owner/repo#123 to issue', async (t) => {
  const mockFetch = createMockFetch({
    'https://api.github.com/repos/owner/repo/issues/123': {
      body: {
        number: 123,
        title: 'Feature Issue',
        url: 'https://github.com/owner/repo/issues/123',
      },
    },
  });

  const client = github.create({
    system: {
      baseUrl: 'https://api.github.com',
      repo: 'owner/repo',
      auth: { mode: 'bearer' },
    },
    secret: 'ghp_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = await client.resolveTarget('#123');
  assert.equal(target.key, '#123');
  assert.equal(target.container, 'owner/repo');
});

test('GitHubClient.list fetches comments with skopos-artifact marker', async (t) => {
  const mockFetch = createMockFetch({
    'https://api.github.com/repos/owner/repo/issues/123/comments': {
      body: [
        {
          id: 'comment1',
          body: '<!-- skopos-artifact: feature-charter-v001 -->\n```markdown\n# Charter\n```',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'comment2',
          body: 'Regular comment',
          created_at: '2025-01-02T00:00:00Z',
        },
      ],
    },
  });

  const client = github.create({
    system: {
      baseUrl: 'https://api.github.com',
      repo: 'owner/repo',
      auth: { mode: 'bearer' },
    },
    secret: 'ghp_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { key: '#123', container: 'owner/repo' };
  const list = await client.list(target);

  assert(Array.isArray(list.artifacts));
  assert(list.artifacts.length >= 1);
});

test('GitHubClient.publish posts comment with skopos-artifact marker', async (t) => {
  let postedData = null;

  const mockFetch = async (url, opts) => {
    if (url.includes('/comments') && opts.method === 'POST') {
      postedData = JSON.parse(opts.body);
      return new Response(JSON.stringify({
        id: 'comment1',
        body: postedData.body,
        created_at: '2025-01-01T00:00:00Z',
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected: ${url} ${opts.method}`);
  };

  const client = github.create({
    system: {
      baseUrl: 'https://api.github.com',
      repo: 'owner/repo',
      auth: { mode: 'bearer' },
    },
    secret: 'ghp_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { key: '#123', container: 'owner/repo' };
  const result = await client.publish(target, {
    title: 'Feature Charter',
    body: '# Charter\n\nContent here',
  });

  assert.equal(result.ok, true);
  assert(postedData.body.includes('<!-- skopos-artifact'));
  assert(postedData.body.includes('# Charter'));
});

test('GitHubClient.read extracts artifact from comment markdown block', async (t) => {
  const mockFetch = createMockFetch({
    'https://api.github.com/repos/owner/repo/issues/123/comments': {
      body: [
        {
          id: 'comment1',
          body: `<!-- skopos-artifact: feature-charter-v001 -->
\`\`\`markdown
# Feature Charter
- Point 1
- Point 2
\`\`\``,
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
    },
  });

  const client = github.create({
    system: {
      baseUrl: 'https://api.github.com',
      repo: 'owner/repo',
      auth: { mode: 'bearer' },
    },
    secret: 'ghp_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { key: '#123', container: 'owner/repo' };
  const artifact = await client.read(target, 'comment1');

  assert(artifact.body.includes('Feature Charter'));
});

test('GitHubClient.read throws NOT_FOUND for missing artifact', async (t) => {
  const mockFetch = createMockFetch({
    'https://api.github.com/repos/owner/repo/issues/123/comments': {
      body: [
        {
          id: 'comment1',
          body: 'Regular comment without skopos marker',
        },
      ],
    },
  });

  const client = github.create({
    system: {
      baseUrl: 'https://api.github.com',
      repo: 'owner/repo',
      auth: { mode: 'bearer' },
    },
    secret: 'ghp_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { key: '#123', container: 'owner/repo' };
  const result = await client.read(target, 'nonexistent');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_FOUND');
});

test('GitHubClient has required capabilities', () => {
  assert(Array.isArray(github.capabilities.storageModes));
  assert(github.capabilities.storageModes.includes('comment'));
  assert.equal(github.capabilities.attachments, false);
});

test('GitHubClient.mapStatus converts HTTP codes to SorError codes', (t) => {
  const testCases = [
    { status: 401, expectedCode: 'AUTH_FAILED' },
    { status: 403, expectedCode: 'PERMISSION_DENIED' },
    { status: 404, expectedCode: 'NOT_FOUND' },
    { status: 422, expectedCode: 'CONFLICT' },
    { status: 429, expectedCode: 'RATE_LIMITED' },
    { status: 500, expectedCode: 'SERVER' },
  ];

  for (const { status, expectedCode } of testCases) {
    const mapped = github.mapStatus(status);
    assert.equal(mapped.code, expectedCode, `Status ${status} should map to ${expectedCode}`);
  }
});

test('GitHubClient validates system config', async (t) => {
  const errors = github.validateConfig({
    kind: 'github',
    // missing repo
  }, 'systemOfRecord.systems.test');

  assert(Array.isArray(errors));
  assert(errors.length > 0);
  assert(errors.some((e) => e.includes('repo')));
});
