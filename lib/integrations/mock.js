const path = require('path');
const fs = require('fs');
const { buildArtifactName, parseArtifactName, sha256 } = require('./base');

const mock = {
  kind: 'mock',
  displayName: 'Mock (filesystem)',

  capabilities: {
    storageModes: ['attachment'],
    attachments: true,
    nativeVersions: false,
    sideMetadata: false,
    maxArtifactBytes: 100 * 1024 * 1024,
    markdownNative: true,
  },

  validateConfig(system, at) {
    const errs = [];
    if (!system.dir) {
      errs.push(`${at}.dir is required (filesystem path for mock artifacts)`);
    }
    return errs;
  },

  create(ctx) {
    return new MockClient(ctx);
  },
};

class MockClient {
  constructor(ctx) {
    this.ctx = ctx;
    this.system = ctx.system;
    this.log = ctx.log || (() => {});
    this.dir = this.system.dir;
  }

  async authenticate() {
    // Mock always succeeds
    return {
      ok: true,
      accountId: 'mock-user',
      displayName: 'Mock User',
      email: 'mock@example.com',
    };
  }

  async resolveTarget(ref) {
    // Mock creates a target from any ref
    return {
      id: ref,
      key: ref,
      url: `mock://${ref}`,
      title: `Mock target ${ref}`,
      container: 'mock',
    };
  }

  async list(target, opts = {}) {
    const targetDir = path.join(this.dir, target.key);
    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const files = fs.readdirSync(targetDir);
    const refs = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const parsed = parseArtifactName(file);
      if (!parsed) continue;

      if (opts.kind && parsed.kind !== opts.kind) continue;

      const stat = fs.statSync(path.join(targetDir, file));
      refs.push({
        remoteId: file,
        name: file,
        kind: parsed.kind,
        slug: parsed.feature,
        version: parsed.version,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        url: `mock://${target.key}/${file}`,
      });
    }

    refs.sort((a, b) => a.slug.localeCompare(b.slug) || a.version - b.version);
    return refs;
  }

  async read(target, remoteId) {
    const filePath = path.join(this.dir, target.key, remoteId);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact not found: ${remoteId}`);
    }

    const body = fs.readFileSync(filePath, 'utf8');
    const meta = this.parseFrontmatter(body);

    return {
      ref: {
        remoteId,
        name: remoteId,
        kind: meta['skopos-artifact'],
        slug: meta['skopos-feature'],
        version: parseInt(meta['skopos-version'] || 0, 10),
      },
      meta,
      body,
    };
  }

  async publish(target, artifact, opts = {}) {
    const { kind, slug, body, meta } = artifact;

    const targetDir = path.join(this.dir, target.key);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Find latest version
    const existing = await this.list(target, { kind });
    const mine = existing.filter((a) => a.slug === slug);
    const latest = mine[mine.length - 1];

    const version = latest ? latest.version + 1 : 1;
    const filename = buildArtifactName({
      prefix: this.system.artifactStorage?.namePrefix || 'skopos--',
      feature: slug,
      kind,
      version,
    });

    const bodyHash = sha256(body);
    const fullBody = this.formatArtifact({ ...meta, 'skopos-version': version, 'skopos-sha256': bodyHash }, body);

    const filePath = path.join(targetDir, filename);

    if (opts.dryRun) {
      return {
        action: latest ? 'updated' : 'created',
        remoteId: filename,
        version,
        name: filename,
        url: `mock://${target.key}/${filename}`,
        bytes: fullBody.length,
      };
    }

    fs.writeFileSync(filePath, fullBody, 'utf8');

    return {
      action: latest ? 'updated' : 'created',
      remoteId: filename,
      version,
      name: filename,
      url: `mock://${target.key}/${filename}`,
      bytes: fullBody.length,
    };
  }

  parseFrontmatter(body) {
    const match = body.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return {};

    const meta = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const [key, ...valParts] = line.split(':');
      const val = valParts.join(':').trim();
      if (key && val) {
        meta[key.trim()] = val.replace(/^["']|["']$/g, '');
      }
    }

    return meta;
  }

  formatArtifact(meta, body) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(meta)) {
      lines.push(`${k}: ${v}`);
    }
    lines.push('---');
    lines.push('');
    lines.push(body);
    return lines.join('\n');
  }
}

module.exports = mock;
