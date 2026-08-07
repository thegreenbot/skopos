const { SorError, buildArtifactName, parseArtifactName, httpJson } = require('./base');

const github = {
  kind: 'github',
  displayName: 'GitHub',

  capabilities: {
    storageModes: ['comment'],
    attachments: false,
    nativeVersions: false,
    sideMetadata: false,
    maxArtifactBytes: 65536,
    markdownNative: true,
  },

  validateConfig(system, at) {
    const errs = [];

    if (!system.baseUrl) {
      errs.push(`${at}.baseUrl is required`);
    }

    if (!system.repo) {
      errs.push(`${at}.repo is required (format: owner/repo)`);
    } else if (!/^[\w-]+\/[\w.-]+$/.test(system.repo)) {
      errs.push(`${at}.repo must be in format owner/repo`);
    }

    return errs;
  },

  create(ctx) {
    return new GitHubClient(ctx);
  },
};

class GitHubClient {
  constructor(ctx) {
    this.ctx = ctx;
    this.system = ctx.system;
    this.secret = ctx.secret;
    this.fetchImpl = ctx.fetchImpl;
    this.log = ctx.log || (() => {});
    this.timeoutMs = ctx.timeoutMs || 30000;
    this.baseUrl = this.system.baseUrl.replace(/\/$/, '');
    this.repo = this.system.repo;
  }

  authHeader() {
    const { mode } = this.system.auth || {};

    if (mode === 'bearer') {
      return `Bearer ${this.secret}`;
    }

    throw new SorError('UNSUPPORTED', `auth mode "${mode}" is not supported for GitHub`, {
      system: this.system.kind || 'github',
      remedy: 'Use mode "bearer" (personal access token or GitHub token).',
    });
  }

  async authenticate() {
    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/user`,
        method: 'GET',
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: this.timeoutMs,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new SorError('AUTH_FAILED', `GitHub rejected credentials`, {
            system: this.system.kind || 'github',
          });
        }
        throw new SorError('SERVER', `GitHub authentication failed`, {
          system: this.system.kind || 'github',
        });
      }

      return {
        ok: true,
        accountId: res.data.id,
        displayName: res.data.name || res.data.login,
        email: res.data.email,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to authenticate: ${e.message}`, {
        system: this.system.kind || 'github',
      });
    }
  }

  async resolveTarget(ref) {
    // ref can be #123, owner/repo#123, or URL
    let issueNum = ref;

    if (ref.includes('/')) {
      issueNum = ref.split('/').pop();
    }

    issueNum = issueNum.replace(/^#/, '');

    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/repos/${this.repo}/issues/${issueNum}`,
        method: 'GET',
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: this.timeoutMs,
      });

      if (res.status === 404) {
        throw new SorError('NOT_FOUND', `Issue #${issueNum} not found`, {
          system: this.system.kind || 'github',
        });
      }

      if (!res.ok) {
        throw new SorError('SERVER', `Failed to resolve issue`, {
          system: this.system.kind || 'github',
        });
      }

      return {
        id: res.data.id,
        key: `#${res.data.number}`,
        url: res.data.html_url,
        title: res.data.title,
        container: this.repo,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to resolve target: ${e.message}`, {
        system: this.system.kind || 'github',
      });
    }
  }

  async list(target, opts = {}) {
    // Extract issue number from key like "#123"
    const issueNum = target.key.replace(/^#/, '');

    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/repos/${this.repo}/issues/${issueNum}/comments`,
        method: 'GET',
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: this.timeoutMs,
      });

      if (!res.ok) {
        throw new SorError('SERVER', `Failed to list comments`, {
          system: this.system.kind || 'github',
        });
      }

      const namePrefix = this.system.artifactStorage?.namePrefix || 'skopos--';
      const refs = [];

      for (const comment of res.data) {
        if (!comment.body.includes('```markdown')) continue;

        const match = comment.body.match(/```markdown\n([\s\S]*?)\n```/);
        if (!match) continue;

        const content = match[1];
        const nameMatch = content.match(/^skopos-artifact-name:\s*(.+?)$/m);
        if (!nameMatch) continue;

        const filename = nameMatch[1].trim();
        if (!filename.startsWith(namePrefix)) continue;

        const parsed = parseArtifactName(filename);
        if (!parsed) continue;

        if (opts.kind && parsed.kind !== opts.kind) continue;

        refs.push({
          remoteId: comment.id,
          name: filename,
          kind: parsed.kind,
          slug: parsed.feature,
          version: parsed.version,
          size: content.length,
          updatedAt: comment.updated_at,
          url: comment.html_url,
        });
      }

      refs.sort((a, b) => a.slug.localeCompare(b.slug) || a.version - b.version);
      return refs;
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to list artifacts: ${e.message}`, {
        system: this.system.kind || 'github',
      });
    }
  }

  async read(target, remoteId) {
    const issueNum = target.key.replace(/^#/, '');

    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/repos/${this.repo}/issues/comments/${remoteId}`,
        method: 'GET',
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: this.timeoutMs,
      });

      if (!res.ok) {
        throw new SorError('NOT_FOUND', `Comment not found`, {
          system: this.system.kind || 'github',
        });
      }

      const match = res.data.body.match(/```markdown\n([\s\S]*?)\n```/);
      if (!match) {
        throw new SorError('CONFLICT', `Comment does not contain markdown artifact`, {
          system: this.system.kind || 'github',
        });
      }

      const body = match[1];
      const meta = this.parseFrontmatter(body);

      return {
        ref: {
          remoteId,
          name: `${meta['skopos-feature']}--${meta['skopos-artifact']}.md`,
          kind: meta['skopos-artifact'],
          slug: meta['skopos-feature'],
          version: parseInt(meta['skopos-version'] || 0, 10),
        },
        meta,
        body,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to read artifact: ${e.message}`, {
        system: this.system.kind || 'github',
      });
    }
  }

  async publish(target, artifact, opts = {}) {
    const { kind, slug, body, meta } = artifact;
    const issueNum = target.key.replace(/^#/, '');

    const version = (meta['skopos-version'] || 0) + 1;
    const filename = buildArtifactName({
      prefix: this.system.artifactStorage?.namePrefix || 'skopos--',
      feature: slug,
      kind,
      version,
    });

    const fullBody = this.formatArtifact({ ...meta, 'skopos-version': version }, body);

    if (fullBody.length > this.capabilities.maxArtifactBytes) {
      throw new SorError('PAYLOAD_TOO_LARGE', `Artifact exceeds GitHub comment size limit`, {
        system: this.system.kind || 'github',
        remedy: `GitHub comments have a 65KB limit. Split the artifact.`,
      });
    }

    const commentBody = `<!-- skopos-artifact -->\n\`\`\`markdown\n${fullBody}\n\`\`\``;

    if (opts.dryRun) {
      return {
        action: 'created',
        remoteId: null,
        version,
        name: filename,
        url: target.url,
        bytes: commentBody.length,
      };
    }

    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/repos/${this.repo}/issues/${issueNum}/comments`,
        method: 'POST',
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/vnd.github.v3+json',
        },
        body: { body: commentBody },
        timeout: this.timeoutMs,
      });

      if (!res.ok) {
        throw new SorError('SERVER', `Failed to create comment`, {
          system: this.system.kind || 'github',
        });
      }

      return {
        action: 'created',
        remoteId: res.data.id,
        version,
        name: filename,
        url: res.data.html_url,
        bytes: commentBody.length,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to publish: ${e.message}`, {
        system: this.system.kind || 'github',
      });
    }
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

module.exports = github;
