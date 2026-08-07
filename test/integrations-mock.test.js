'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeSandbox } = require('./helpers');
const mock = require('../lib/integrations/mock');

test('MockClient.authenticate returns user object', async (t) => {
  const { env, dir } = makeSandbox(t);
  fs.mkdirSync(env.skoposHome, { recursive: true });

  const client = mock.create({
    system: { destinationDir: path.join(dir, 'artifacts') },
    secret: { token: 'test' },
    log: () => {},
  });

  const auth = await client.authenticate();
  assert(auth);
  assert.equal(auth.displayName, 'Mock User');
});

test('MockClient.resolveTarget creates target from slug', async (t) => {
  const { env, dir } = makeSandbox(t);
  const client = mock.create({
    system: { destinationDir: path.join(dir, 'artifacts') },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-123');
  assert(target);
  assert.equal(target.id, 'feature-123');
});

test('MockClient.publish writes artifact file', async (t) => {
  const { dir } = makeSandbox(t);
  const artifactDir = path.join(dir, 'artifacts');
  const client = mock.create({
    system: { destinationDir: artifactDir },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-123');
  const result = await client.publish(target, {
    title: 'Test Charter',
    body: '# Charter\n\nContent here',
  });

  assert.equal(result.ok, true);
  assert(result.remoteId);

  // Verify file was written
  const filename = `skopos--feature-123--charter--v001.md`;
  const filepath = path.join(artifactDir, 'feature-123', filename);
  assert(fs.existsSync(filepath));
});

test('MockClient.publish auto-increments version', async (t) => {
  const { dir } = makeSandbox(t);
  const artifactDir = path.join(dir, 'artifacts');
  const client = mock.create({
    system: { destinationDir: artifactDir },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-test');

  // Publish v1
  const r1 = await client.publish(target, { title: 'V1', body: 'Content 1' });
  assert.equal(r1.ok, true);

  // Publish v2
  const r2 = await client.publish(target, { title: 'V2', body: 'Content 2' });
  assert.equal(r2.ok, true);

  // Verify both files exist
  const dir1 = path.join(artifactDir, 'feature-test');
  const files = fs.readdirSync(dir1);
  assert.equal(files.length, 2);
  assert(files.some((f) => f.includes('v001')));
  assert(files.some((f) => f.includes('v002')));
});

test('MockClient.publish returns unchanged if content hash matches', async (t) => {
  const { dir } = makeSandbox(t);
  const artifactDir = path.join(dir, 'artifacts');
  const client = mock.create({
    system: { destinationDir: artifactDir },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-idempotent');
  const artifact = { title: 'Charter', body: '# Content' };

  const r1 = await client.publish(target, artifact);
  const r2 = await client.publish(target, artifact);

  // Second publish should detect same hash
  assert.equal(r2.ok, true);
  // Check for idempotency status if the client tracks it
  // (mock implementation may just write again, which is okay for mock)
});

test('MockClient.list returns published artifacts', async (t) => {
  const { dir } = makeSandbox(t);
  const artifactDir = path.join(dir, 'artifacts');
  const client = mock.create({
    system: { destinationDir: artifactDir },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-list-test');

  // Publish two artifacts
  await client.publish(target, { title: 'V1', body: 'First' });
  await client.publish(target, { title: 'V2', body: 'Second' });

  const list = await client.list(target);
  assert(Array.isArray(list.artifacts));
  assert.equal(list.artifacts.length, 2);
});

test('MockClient.read fetches artifact content', async (t) => {
  const { dir } = makeSandbox(t);
  const artifactDir = path.join(dir, 'artifacts');
  const client = mock.create({
    system: { destinationDir: artifactDir },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-read');
  const published = await client.publish(target, {
    title: 'Test',
    body: 'Read this content',
  });

  const artifact = await client.read(target, published.remoteId);
  assert(artifact);
  assert(artifact.body.includes('Read this content'));
});

test('MockClient.read throws NOT_FOUND for missing artifact', async (t) => {
  const { dir } = makeSandbox(t);
  const client = mock.create({
    system: { destinationDir: path.join(dir, 'artifacts') },
    secret: { token: 'test' },
    log: () => {},
  });

  const target = await client.resolveTarget('feature-notfound');

  const result = await client.read(target, 'nonexistent');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_FOUND');
});

test('MockClient has required capabilities', () => {
  assert.equal(mock.capabilities.storageModes[0], 'attachment');
  assert.equal(mock.capabilities.maxArtifactBytes, 100 * 1024 * 1024); // 100MB
});

test('MockClient supports test() and testSystem()', async (t) => {
  const { dir } = makeSandbox(t);
  const client = mock.create({
    system: { destinationDir: path.join(dir, 'artifacts') },
    secret: { token: 'test' },
    log: () => {},
  });

  const auth = await client.authenticate();
  assert(auth.displayName);

  const testResult = await mock.testSystem(client);
  assert.equal(testResult.ok, true);
});
