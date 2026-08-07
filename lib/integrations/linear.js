const { SorError, sha256, buildArtifactName, parseArtifactName, withRetry, httpJson, redact } = require('./base');

const linear = {
  kind: 'linear',
  displayName: 'Linear',

  capabilities: {
    storageModes: ['comment', 'description'],
    attachments: false,
    nativeVersions: false,
    sideMetadata: false,
    maxArtifactBytes: 65536,
    markdownNative: true,
  },

  validateConfig(system, at) {
    const errs = [];

    if (!system.baseUrl) {
      errs.push(`${at}.baseUrl is required (e.g., https://linear.app/api/graphql)`);
    }

    if (!system.teamKey) {
      errs.push(`${at}.teamKey is required (e.g., FEAT)`);
    } else if (!/^[A-Z][A-Z0-9_]*$/.test(system.teamKey)) {
      errs.push(`${at}.teamKey must be a valid Linear team key (uppercase, e.g., FEAT)`);
    }

    if (system.artifactStorage?.mode && !['comment', 'description'].includes(system.artifactStorage.mode)) {
      errs.push(`${at}.artifactStorage.mode must be comment or description for Linear`);
    }

    return errs;
  },

  create(ctx) {
    return new LinearClient(ctx);
  },
};

class LinearClient {
  constructor(ctx) {
    this.ctx = ctx;
    this.system = ctx.system;
    this.secret = ctx.secret;
    this.fetchImpl = ctx.fetchImpl || fetch;
    this.log = ctx.log || (() => {});
    this.timeoutMs = ctx.timeoutMs || 30000;
    this.baseUrl = this.system.baseUrl;
    this.teamKey = this.system.teamKey;
  }

  async authenticate() {
    try {
      const res = await this.gqlQuery(`
        query {
          viewer {
            id
            displayName
            email
          }
        }
      `);

      if (!res.ok) {
        throw new SorError('AUTH_FAILED', `Linear rejected credentials`, {
          system: this.system.kind || 'linear',
        });
      }

      const viewer = res.data?.data?.viewer;
      if (!viewer) {
        throw new SorError('AUTH_FAILED', 'No viewer data returned', {
          system: this.system.kind || 'linear',
        });
      }

      return {
        ok: true,
        accountId: viewer.id,
        displayName: viewer.displayName,
        email: viewer.email,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to authenticate: ${e.message}`, {
        system: this.system.kind || 'linear',
      });
    }
  }

  async resolveTarget(ref) {
    // ref can be FEAT-123, ENG-456, etc
    let issueId = ref;

    if (ref.includes('/')) {
      issueId = ref.split('/').pop();
    }

    try {
      const res = await this.gqlQuery(`
        query {
          issue(id: "${issueId}") {
            id
            identifier
            title
            url
            team {
              key
            }
          }
        }
      `);

      if (!res.ok || !res.data?.data?.issue) {
        throw new SorError('NOT_FOUND', `Issue ${issueId} not found`, {
          system: this.system.kind || 'linear',
        });
      }

      const issue = res.data.data.issue;
      return {
        id: issue.id,
        key: issue.identifier,
        url: issue.url,
        title: issue.title,
        container: issue.team.key,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to resolve target: ${e.message}`, {
        system: this.system.kind || 'linear',
      });
    }
  }

  async list(target, opts = {}) {
    try {
      const res = await this.gqlQuery(`
        query {
          issue(id: "${target.id}") {
            comments {
              edges {
                node {
                  id
                  body
                  createdAt
                }
              }
            }
          }
        }
      `);

      if (!res.ok) {
        throw new SorError('SERVER', `Failed to list artifacts`, {
          system: this.system.kind || 'linear',
        });
      }

      const comments = res.data?.data?.issue?.comments?.edges || [];
      const artifacts = [];

      for (const edge of comments) {
        const comment = edge.node;
        const parsed = this.parseArtifactFromComment(comment.body);
        if (!parsed) continue;

        if (opts.kind && parsed.kind !== opts.kind) continue;

        artifacts.push({
          remoteId: comment.id,
          name: parsed.name,
          kind: parsed.kind,
          slug: parsed.feature,
          version: parsed.version,
          updatedAt: comment.createdAt,
        });
      }

      // Sort by feature, then version
      artifacts.sort((a, b) => a.slug.localeCompare(b.slug) || a.version - b.version);

      return artifacts;
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to list artifacts: ${e.message}`, {
        system: this.system.kind || 'linear',
      });
    }
  }

  async read(target, remoteId) {
    try {
      const res = await this.gqlQuery(`
        query {
          comment(id: "${remoteId}") {
            body
          }
        }
      `);

      if (!res.ok || !res.data?.data?.comment) {
        return { ok: false, code: 'NOT_FOUND', message: 'Comment not found' };
      }

      const body = res.data.data.comment.body;
      const content = this.extractArtifactContent(body);

      if (!content) {
        return { ok: false, code: 'NOT_FOUND', message: 'No artifact marker found' };
      }

      return {
        ok: true,
        body: content,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      return { ok: false, code: 'NETWORK', message: `Failed to read artifact: ${e.message}` };
    }
  }

  async publish(target, artifact, opts = {}) {
    const { title, body } = artifact;
    const contentHash = sha256(body);

    // Check if already published (idempotent)
    const list = await this.list(target);
    for (const existing of list) {
      if (existing.slug === opts.feature && existing.kind === opts.kind) {
        const existingHash = sha256(existing.body || '');
        if (existingHash === contentHash) {
          return {
            ok: true,
            remoteId: existing.remoteId,
            status: 'unchanged',
            version: existing.version,
          };
        }
      }
    }

    try {
      const formattedBody = this.formatArtifact(title, body, opts);

      const res = await this.gqlQuery(`
        mutation {
          commentCreate(input: {
            issueId: "${target.id}",
            body: ${JSON.stringify(formattedBody)}
          }) {
            comment {
              id
            }
          }
        }
      `);

      if (!res.ok || !res.data?.data?.commentCreate?.comment) {
        return this.mapStatus(res.status, res.data);
      }

      const commentId = res.data.data.commentCreate.comment.id;

      return {
        ok: true,
        remoteId: commentId,
        status: 'created',
        url: `${target.url}#comment-${commentId}`,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to publish artifact: ${e.message}`, {
        system: this.system.kind || 'linear',
      });
    }
  }

  formatArtifact(title, body, opts = {}) {
    const version = (opts.version || 1).toString().padStart(3, '0');
    const feature = opts.feature || 'unknown';
    const kind = opts.kind || 'artifact';

    return `<!-- skopos-artifact: ${feature}-${kind}-v${version} -->

## ${title}

\`\`\`markdown
${body}
\`\`\``;
  }

  parseArtifactFromComment(body) {
    const match = body.match(/<!-- skopos-artifact: ([a-z0-9-]+)-(charter|interview[a-z0-9-]*)-v(\d{3,}) -->/);
    if (!match) return null;

    return {
      feature: match[1],
      kind: match[2],
      version: parseInt(match[3], 10),
      name: `skopos--${match[1]}--${match[2]}--v${match[3]}.md`,
    };
  }

  extractArtifactContent(body) {
    const match = body.match(/```markdown\n([\s\S]*?)\n```/);
    return match ? match[1] : null;
  }

  async gqlQuery(query) {
    return withRetry(async () => {
      const response = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const data = await response.json();

      if (data.errors) {
        const firstError = data.errors[0]?.message || 'Unknown GraphQL error';
        throw new SorError('SERVER', `Linear API error: ${firstError}`, {
          system: this.system.kind || 'linear',
        });
      }

      return { ok: true, data };
    }, { log: this.log });
  }

  mapStatus(status, data) {
    const codeMap = {
      401: 'AUTH_FAILED',
      403: 'PERMISSION_DENIED',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
      500: 'SERVER',
    };

    const code = codeMap[status] || 'SERVER';
    const message = data?.message || `HTTP ${status}`;

    return { ok: false, code, message };
  }
}

module.exports = linear;
