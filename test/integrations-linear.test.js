'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { makeSandbox } = require('./helpers');
const linear = require('../lib/integrations/linear');

function createMockFetch(responses = {}) {
  return async (url, opts) => {
    const query = JSON.parse(opts?.body || '{}').query || '';
    const key = `${query.split('\n')[0].trim()} ${url}`;
    const response = responses[key] || responses[url] || { body: {} };

    if (response.error) {
      throw response.error;
    }

    return new Response(JSON.stringify(response.body), {
      status: response.status || 200,
      headers: response.headers || { 'content-type': 'application/json' },
    });
  };
}

test('LinearClient.authenticate calls viewer GraphQL query', async (t) => {
  const mockFetch = createMockFetch({
    'https://linear.app/api/graphql': {
      body: {
        data: {
          viewer: {
            id: 'user123',
            displayName: 'Test User',
            email: 'test@example.com',
          },
        },
      },
    },
  });

  const client = linear.create({
    system: {
      baseUrl: 'https://linear.app/api/graphql',
      teamKey: 'FEAT',
      auth: { mode: 'bearer' },
    },
    secret: 'lin_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const auth = await client.authenticate();
  assert.equal(auth.accountId, 'user123');
  assert.equal(auth.displayName, 'Test User');
});

test('LinearClient.resolveTarget fetches issue by identifier', async (t) => {
  const mockFetch = createMockFetch({
    'https://linear.app/api/graphql': {
      body: {
        data: {
          issue: {
            id: 'issue123',
            identifier: 'FEAT-123',
            title: 'Feature Issue',
            url: 'https://linear.app/issue/FEAT-123',
            team: { key: 'FEAT' },
          },
        },
      },
    },
  });

  const client = linear.create({
    system: {
      baseUrl: 'https://linear.app/api/graphql',
      teamKey: 'FEAT',
      auth: { mode: 'bearer' },
    },
    secret: 'lin_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = await client.resolveTarget('FEAT-123');
  assert.equal(target.key, 'FEAT-123');
  assert.equal(target.container, 'FEAT');
});

test('LinearClient.list fetches comments with skopos-artifact marker', async (t) => {
  const mockFetch = createMockFetch({
    'https://linear.app/api/graphql': {
      body: {
        data: {
          issue: {
            comments: {
              edges: [
                {
                  node: {
                    id: 'comment1',
                    body: '<!-- skopos-artifact: feature-charter-v001 -->\n```markdown\n# Charter\n```',
                    createdAt: '2025-01-01T00:00:00Z',
                  },
                },
                {
                  node: {
                    id: 'comment2',
                    body: 'Regular comment',
                    createdAt: '2025-01-02T00:00:00Z',
                  },
                },
              ],
            },
          },
        },
      },
    },
  });

  const client = linear.create({
    system: {
      baseUrl: 'https://linear.app/api/graphql',
      teamKey: 'FEAT',
      auth: { mode: 'bearer' },
    },
    secret: 'lin_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { id: 'issue123', key: 'FEAT-123' };
  const list = await client.list(target);

  assert(Array.isArray(list));
  assert(list.length >= 1);
  assert(list[0].name.includes('skopos--'));
});

test('LinearClient.publish posts comment with skopos-artifact marker', async (t) => {
  let postedData = null;

  const mockFetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query.includes('commentCreate')) {
      postedData = body;
      return new Response(JSON.stringify({
        data: {
          commentCreate: {
            comment: { id: 'comment1' },
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected query: ${body.query}`);
  };

  const client = linear.create({
    system: {
      baseUrl: 'https://linear.app/api/graphql',
      teamKey: 'FEAT',
      auth: { mode: 'bearer' },
    },
    secret: 'lin_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { id: 'issue123', key: 'FEAT-123', url: 'https://linear.app/issue/FEAT-123' };
  const result = await client.publish(target, {
    title: 'Feature Charter',
    body: '# Charter\n\nContent here',
  });

  assert.equal(result.ok, true);
  assert(postedData.query.includes('commentCreate'));
  assert(postedData.query.includes('skopos-artifact'));
});

test('LinearClient.read extracts artifact from comment', async (t) => {
  const mockFetch = createMockFetch({
    'https://linear.app/api/graphql': {
      body: {
        data: {
          comment: {
            body: `<!-- skopos-artifact: feature-charter-v001 -->

## Feature Charter

\`\`\`markdown
# Charter
- Point 1
- Point 2
\`\`\``,
          },
        },
      },
    },
  });

  const client = linear.create({
    system: {
      baseUrl: 'https://linear.app/api/graphql',
      teamKey: 'FEAT',
      auth: { mode: 'bearer' },
    },
    secret: 'lin_token',
    fetchImpl: mockFetch,
    log: () => {},
  });

  const target = { id: 'issue123' };
  const artifact = await client.read(target, 'comment1');

  assert.equal(artifact.ok, true);
  assert(artifact.body.includes('Charter'));
});

test('LinearClient has required capabilities', () => {
  assert(Array.isArray(linear.capabilities.storageModes));
  assert(linear.capabilities.storageModes.includes('comment'));
  assert.equal(linear.capabilities.attachments, false);
  assert.equal(linear.capabilities.markdownNative, true);
});

test('LinearClient validates system config', async (t) => {
  const errors = linear.validateConfig({
    kind: 'linear',
    // missing baseUrl and teamKey
  }, 'systemOfRecord.systems.test');

  assert(Array.isArray(errors));
  assert(errors.length > 0);
  assert(errors.some((e) => e.includes('baseUrl')));
  assert(errors.some((e) => e.includes('teamKey')));
});

test('LinearClient formats artifact with skopos marker', () => {
  const client = linear.create({
    system: { baseUrl: 'https://linear.app/api/graphql', teamKey: 'FEAT' },
    secret: 'token',
    log: () => {},
  });

  const formatted = client.formatArtifact('Test Title', 'Test body', {
    feature: 'test-feature',
    kind: 'charter',
    version: 1,
  });

  assert(formatted.includes('<!-- skopos-artifact: test-feature-charter-v001 -->'));
  assert(formatted.includes('## Test Title'));
  assert(formatted.includes('```markdown'));
});

test('LinearClient parses artifact from comment correctly', () => {
  const client = linear.create({
    system: { baseUrl: 'https://linear.app/api/graphql', teamKey: 'FEAT' },
    secret: 'token',
    log: () => {},
  });

  const comment = `<!-- skopos-artifact: billing-export-charter-v007 -->
## Title
\`\`\`markdown
# Content
\`\`\``;

  const parsed = client.parseArtifactFromComment(comment);
  assert.equal(parsed.feature, 'billing-export');
  assert.equal(parsed.kind, 'charter');
  assert.equal(parsed.version, 7);
});

test('LinearClient extracts artifact content from markdown block', () => {
  const client = linear.create({
    system: { baseUrl: 'https://linear.app/api/graphql', teamKey: 'FEAT' },
    secret: 'token',
    log: () => {},
  });

  const body = `Some text
\`\`\`markdown
# Charter Content
- Item 1
- Item 2
\`\`\`
More text`;

  const content = client.extractArtifactContent(body);
  assert(content.includes('Charter Content'));
  assert(content.includes('Item 1'));
});
