'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox } = require('./helpers');
const { SorPublisher } = require('../lib/sor-publisher');

// Mock orchestrator for testing
class MockOrchestrator {
  constructor(opts = {}) {
    this.artifacts = opts.artifacts || {};
    this.failures = opts.failures || {};
  }

  async publish(system, target, artifact) {
    const key = `${system}:${target.id}`;
    if (this.failures[key]?.publish) {
      throw new Error('Publish failed');
    }
    return { ok: true, remoteId: 'remote-1', version: 1 };
  }

  async list(system, target, opts) {
    const key = `${system}:${target.id}`;
    const list = this.artifacts[key] || [];
    if (opts?.kind) {
      return list.filter((a) => a.kind === opts.kind);
    }
    return list;
  }

  async read(system, target, remoteId) {
    return { ok: true, body: '# Content' };
  }
}

test('SorPublisher.publishBatch publishes to multiple systems', async (t) => {
  const orchestrator = new MockOrchestrator();
  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.publishBatch(
    ['jira', 'github'],
    [{ id: 'issue-1' }],
    [{ title: 'Charter', body: 'Content' }],
  );

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2); // jira + github
});

test('SorPublisher.publishBatch tracks failures', async (t) => {
  const orchestrator = new MockOrchestrator({
    failures: { 'jira:issue-1': { publish: true } },
  });
  orchestrator.publish = async (system, target, artifact) => {
    if (system === 'jira') throw new Error('Jira failed');
    return { ok: true, remoteId: 'remote-1' };
  };

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.publishBatch(
    ['jira', 'github'],
    [{ id: 'issue-1' }],
    [{ title: 'Charter', body: 'Content' }],
  );

  assert.equal(result.ok, false);
  assert(result.failures.length > 0);
});

test('SorPublisher.pollForArtifact waits for artifact', async (t) => {
  let attempts = 0;
  const orchestrator = new MockOrchestrator();
  orchestrator.list = async (system, target) => {
    attempts++;
    if (attempts >= 2) {
      return {
        artifacts: [
          { name: 'skopos--feature--charter--v001.md', slug: 'feature', kind: 'charter', version: 1 },
        ],
      };
    }
    return { artifacts: [] };
  };

  const publisher = new SorPublisher(orchestrator, { pollIntervalMs: 10, log: () => {} });

  const result = await publisher.pollForArtifact('jira', { id: 'issue-1' }, 'skopos--feature--charter--v001.md');

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
});

test('SorPublisher.pollForArtifact times out after max attempts', async (t) => {
  const orchestrator = new MockOrchestrator();
  orchestrator.list = async () => ({ artifacts: [] });

  const publisher = new SorPublisher(orchestrator, {
    pollIntervalMs: 1,
    log: () => {},
  });

  const result = await publisher.pollForArtifact('jira', { id: 'issue-1' }, 'nonexistent.md', {
    maxAttempts: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'TIMEOUT');
});

test('SorPublisher.reconcileInterviews detects conflicts', async (t) => {
  const orchestrator = new MockOrchestrator({
    artifacts: {
      'jira:issue-1': [
        {
          name: 'skopos--feature--interview-po--v001.md',
          slug: 'feature',
          kind: 'interview-po',
          version: 1,
          remoteId: 'att1',
        },
      ],
      'github:issue-1': [
        {
          name: 'skopos--feature--interview-po--v002.md',
          slug: 'feature',
          kind: 'interview-po',
          version: 2,
          remoteId: 'comment1',
        },
      ],
    },
  });

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.reconcileInterviews(['jira', 'github'], { id: 'issue-1' });

  assert.equal(result.ok, false);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].feature, 'feature');
  assert.equal(result.conflicts[0].versions.length, 2);
});

test('SorPublisher.reconcileInterviews handles consistent interviews', async (t) => {
  const orchestrator = new MockOrchestrator({
    artifacts: {
      'jira:issue-1': [
        {
          name: 'skopos--feature--interview-po--v001.md',
          slug: 'feature',
          kind: 'interview-po',
          version: 1,
          remoteId: 'att1',
        },
      ],
      'github:issue-1': [
        {
          name: 'skopos--other--interview-tech--v001.md',
          slug: 'other',
          kind: 'interview-tech',
          version: 1,
          remoteId: 'comment1',
        },
      ],
    },
  });

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.reconcileInterviews(['jira', 'github'], { id: 'issue-1' });

  assert.equal(result.ok, true);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.count, 2);
});

test('SorPublisher.downloadArtifact fetches from system', async (t) => {
  const orchestrator = new MockOrchestrator();

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.downloadArtifact('jira', { id: 'issue-1' }, 'att-123');

  assert.equal(result.ok, true);
  assert(result.content.includes('Content'));
  assert.equal(result.metadata.system, 'jira');
});

test('SorPublisher.downloadArtifact handles not found', async (t) => {
  const orchestrator = new MockOrchestrator();
  orchestrator.read = async () => ({ ok: false, code: 'NOT_FOUND', message: 'Not found' });

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.downloadArtifact('jira', { id: 'issue-1' }, 'missing');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_FOUND');
});

test('SorPublisher.syncArtifacts syncs between systems', async (t) => {
  const { dir } = makeSandbox(t);
  const orchestrator = new MockOrchestrator({
    artifacts: {
      'jira:issue-1': [
        {
          name: 'skopos--feature--charter--v001.md',
          remoteId: 'att1',
          kind: 'charter',
          version: 1,
        },
      ],
      'github:issue-1': [],
    },
  });

  let published = 0;
  orchestrator.publish = async (system, target, artifact) => {
    if (system === 'github') published++;
    return { ok: true, remoteId: 'comment1' };
  };

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.syncArtifacts('jira', 'github', { id: 'issue-1' });

  assert.equal(result.ok, true);
  assert.equal(published, 1);
  assert.equal(result.results.synced, 1);
});

test('SorPublisher.exportArtifacts exports to directory', async (t) => {
  const { dir } = makeSandbox(t);
  const exportDir = path.join(dir, 'export');

  const orchestrator = new MockOrchestrator({
    artifacts: {
      'jira:issue-1': [
        {
          name: 'skopos--feature--charter--v001.md',
          remoteId: 'att1',
          kind: 'charter',
          version: 1,
        },
      ],
    },
  });

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.exportArtifacts(['jira'], { id: 'issue-1' }, exportDir);

  assert.equal(result.ok, true);
  assert.equal(result.exported.length, 1);
  assert(fs.existsSync(path.join(exportDir, 'skopos--feature--charter--v001.md')));
});

test('SorPublisher.validateArtifacts checks naming convention', async (t) => {
  const orchestrator = new MockOrchestrator({
    artifacts: {
      'jira:issue-1': [
        {
          name: 'bad-name.md',
          remoteId: 'att1',
          kind: 'charter',
          version: 1,
        },
      ],
    },
  });

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.validateArtifacts('jira', { id: 'issue-1' });

  assert.equal(result.ok, true); // warnings don't fail
  assert(result.issues.some((i) => i.severity === 'warning'));
});

test('SorPublisher.validateArtifacts detects invalid versions', async (t) => {
  const orchestrator = new MockOrchestrator({
    artifacts: {
      'jira:issue-1': [
        {
          name: 'skopos--feature--charter--v001.md',
          remoteId: 'att1',
          kind: 'charter',
          version: 0, // invalid
        },
      ],
    },
  });

  const publisher = new SorPublisher(orchestrator, { log: () => {} });

  const result = await publisher.validateArtifacts('jira', { id: 'issue-1' });

  assert.equal(result.ok, false);
  assert(result.issues.some((i) => i.severity === 'error' && i.issue.includes('version')));
});
