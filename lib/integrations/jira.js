const { SorError, CODES, sha256, buildArtifactName, parseArtifactName, withRetry, httpJson, redact } = require('./base');

const jira = {
  kind: 'jira',
  displayName: 'Jira',

  capabilities: {
    storageModes: ['attachment', 'description', 'comment', 'customField'],
    attachments: true,
    nativeVersions: false,
    sideMetadata: true,
    maxArtifactBytes: 10 * 1024 * 1024,
    markdownNative: false,
  },

  validateConfig(system, at) {
    const errs = [];

    if (!system.baseUrl) {
      errs.push(`${at}.baseUrl is required`);
    } else {
      const url = system.baseUrl.toLowerCase();
      if (!url.startsWith('https://')) {
        if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('http://localhost:')) {
          errs.push(`${at}.baseUrl must use https:// (except localhost for testing)`);
        }
      }
    }

    if (!system.project) {
      errs.push(`${at}.project is required`);
    } else if (!/^[A-Z][A-Z0-9_]*$/.test(system.project)) {
      errs.push(`${at}.project must be a valid Jira project key (uppercase, e.g., FEAT)`);
    }

    if (system.artifactStorage?.mode === 'customField' && !system.artifactStorage?.field) {
      errs.push(`${at}.artifactStorage.field is required when mode is customField`);
    } else if (system.artifactStorage?.mode === 'customField' && system.artifactStorage?.field) {
      if (!/^customfield_\d+$/.test(system.artifactStorage.field)) {
        errs.push(`${at}.artifactStorage.field must be in format customfield_NNNNN`);
      }
    }

    if (system.apiVersion && ![2, 3].includes(system.apiVersion)) {
      errs.push(`${at}.apiVersion must be 2 or 3`);
    }

    return errs;
  },

  create(ctx) {
    return new JiraClient(ctx);
  },
};

class JiraClient {
  constructor(ctx) {
    this.ctx = ctx;
    this.system = ctx.system;
    this.secret = ctx.secret;
    this.fetchImpl = ctx.fetchImpl;
    this.log = ctx.log || (() => {});
    this.timeoutMs = ctx.timeoutMs || 30000;
    this.baseUrl = this.system.baseUrl.replace(/\/$/, '');
    this.apiVersion = this.system.apiVersion || 3;
    this.project = this.system.project;
  }

  authHeader() {
    const { mode, username } = this.system.auth || {};

    if (mode === 'apiToken') {
      if (!username) {
        throw new SorError('CONFIG', 'auth.username is required for apiToken mode', {
          system: this.system.kind || 'jira',
        });
      }
      const b64 = Buffer.from(`${username}:${this.secret}`, 'utf8').toString('base64');
      return `Basic ${b64}`;
    }

    if (mode === 'bearer') {
      return `Bearer ${this.secret}`;
    }

    throw new SorError('UNSUPPORTED', `auth mode "${mode}" is not supported for Jira`, {
      system: this.system.kind || 'jira',
      remedy: 'Use mode "apiToken" (Cloud) or "bearer" (Data Center personal access token).',
    });
  }

  async authenticate() {
    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/rest/api/${this.apiVersion}/myself`,
        method: 'GET',
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
        timeout: this.timeoutMs,
      });

      if (!res.ok) {
        return this.mapStatus(res.status, res.data, 'authenticate');
      }

      const { accountId, displayName, emailAddress } = res.data;
      return { ok: true, accountId, displayName, email: emailAddress };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to authenticate: ${e.message}`, {
        system: this.system.kind || 'jira',
      });
    }
  }

  async resolveTarget(ref) {
    // ref can be FEAT-123, https://..., etc
    let key = ref;

    if (ref.startsWith('http')) {
      const match = ref.match(/\/([A-Z0-9]+-\d+)/);
      if (match) key = match[1];
    }

    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/rest/api/${this.apiVersion}/issue/${key}`,
        method: 'GET',
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
        timeout: this.timeoutMs,
      });

      if (res.status === 404) {
        throw new SorError('NOT_FOUND', `Issue ${key} not found`, {
          system: this.system.kind || 'jira',
        });
      }

      if (!res.ok) {
        return this.mapStatus(res.status, res.data, 'resolve target');
      }

      return {
        id: res.data.id,
        key: res.data.key,
        url: `${this.baseUrl}/browse/${res.data.key}`,
        title: res.data.fields?.summary || '',
        container: this.project,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to resolve target: ${e.message}`, {
        system: this.system.kind || 'jira',
      });
    }
  }

  async list(target, opts = {}) {
    try {
      const res = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/rest/api/${this.apiVersion}/issue/${target.key}?fields=attachment`,
        method: 'GET',
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
        timeout: this.timeoutMs,
      });

      if (!res.ok) {
        return this.mapStatus(res.status, res.data, 'list');
      }

      const attachments = res.data.fields?.attachment || [];
      const namePrefix = this.system.artifactStorage?.namePrefix || 'skopos--';

      const refs = [];
      for (const att of attachments) {
        if (!att.filename.startsWith(namePrefix)) continue;

        const parsed = parseArtifactName(att.filename);
        if (!parsed) continue;

        if (opts.kind && parsed.kind !== opts.kind) continue;

        refs.push({
          remoteId: att.id,
          name: att.filename,
          kind: parsed.kind,
          slug: parsed.feature,
          version: parsed.version,
          size: att.size,
          updatedAt: att.created,
          url: att.content,
        });
      }

      // Sort by feature, then version
      refs.sort((a, b) => a.slug.localeCompare(b.slug) || a.version - b.version);

      return refs;
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('NETWORK', `Failed to list artifacts: ${e.message}`, {
        system: this.system.kind || 'jira',
      });
    }
  }

  async read(target, remoteId) {
    try {
      // First, get attachment metadata
      const metaRes = await httpJson(this.fetchImpl, {
        url: `${this.baseUrl}/rest/api/3/attachment/${remoteId}`,
        method: 'GET',
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
        timeout: this.timeoutMs,
      });

      if (!metaRes.ok) {
        return this.mapStatus(metaRes.status, metaRes.data, 'read attachment metadata');
      }

      const contentUrl = metaRes.data.content;

      // Second, download content with manual redirect handling
      let contentRes = await this.fetchImpl(contentUrl, {
        method: 'GET',
        headers: { Authorization: this.authHeader() },
        timeout: this.timeoutMs,
        redirect: 'manual',
      });

      if (contentRes.status === 303 || contentRes.status === 302 || contentRes.status === 307) {
        const redirectUrl = contentRes.headers.get('location');
        if (redirectUrl) {
          contentRes = await this.fetchImpl(redirectUrl, { redirect: 'follow', timeout: this.timeoutMs });
        }
      }

      if (!contentRes.ok) {
        throw new SorError('NOT_FOUND', `Failed to download artifact`, {
          system: this.system.kind || 'jira',
        });
      }

      const body = await contentRes.text();

      // Parse frontmatter
      const meta = this.parseFrontmatter(body);
      return {
        ref: {
          remoteId,
          name: metaRes.data.filename,
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
        system: this.system.kind || 'jira',
      });
    }
  }

  async publish(target, artifact, opts = {}) {
    const { kind, slug, name, body, meta } = artifact;
    const bodyHash = sha256(body);

    // Check if already published
    const existing = await this.list(target, { kind });
    const mine = existing.filter((a) => a.slug === slug && a.name === name);
    const latest = mine[mine.length - 1];

    if (latest) {
      try {
        const doc = await this.read(target, latest.remoteId);
        if (doc.meta['skopos-sha256'] === bodyHash) {
          return {
            action: 'unchanged',
            remoteId: latest.remoteId,
            version: latest.version,
            name: latest.name,
            url: target.url,
            bytes: 0,
          };
        }
      } catch (e) {
        this.log?.(`Warning: could not check idempotency: ${e.message}`);
      }
    }

    const version = latest ? latest.version + 1 : 1;
    const filename = buildArtifactName({
      prefix: this.system.artifactStorage?.namePrefix || 'skopos--',
      feature: slug,
      kind,
      version,
    });

    const fullBody = this.formatArtifact(
      { ...meta, 'skopos-version': version, 'skopos-sha256': bodyHash },
      body
    );

    if (fullBody.length > this.jira.capabilities.maxArtifactBytes) {
      throw new SorError('PAYLOAD_TOO_LARGE', `Artifact is ${Math.round(fullBody.length / 1024)} KB`, {
        system: this.system.kind || 'jira',
        remedy: `Site limit is ${Math.round(this.jira.capabilities.maxArtifactBytes / 1024)} KB. Split the artifact or ask an admin.`,
      });
    }

    if (opts.dryRun) {
      return {
        action: latest ? 'updated' : 'created',
        remoteId: null,
        version,
        name: filename,
        url: target.url,
        bytes: fullBody.length,
      };
    }

    try {
      const attId = await withRetry(() => this.uploadAttachment(target, filename, fullBody), {
        log: this.log,
      });

      // Clean up old versions
      const retain = this.system.artifactStorage?.retain || 'all';
      if (retain !== 'all' && retain > 0) {
        const toDelete = mine.slice(0, Math.max(0, mine.length - retain + 1));
        for (const att of toDelete) {
          try {
            await this.deleteAttachment(att.remoteId);
          } catch (e) {
            this.log?.(`Warning: could not delete old version: ${e.message}`);
          }
        }
      }

      return {
        action: latest ? 'updated' : 'created',
        remoteId: attId,
        version,
        name: filename,
        url: target.url,
        bytes: fullBody.length,
      };
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('SERVER', `Failed to publish: ${e.message}`, {
        system: this.system.kind || 'jira',
      });
    }
  }

  async uploadAttachment(target, filename, body) {
    const FormData = globalThis.FormData || require('form-data');
    const Blob = globalThis.Blob || require('buffer').Blob;

    const form = new FormData();
    form.append('file', new Blob([body], { type: 'text/markdown' }), filename);

    const res = await this.fetchImpl(
      `${this.baseUrl}/rest/api/${this.apiVersion}/issue/${target.key}/attachments`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authHeader(),
          'X-Atlassian-Token': 'no-check',
          Accept: 'application/json',
        },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      }
    );

    if (!res.ok) {
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
      return this.mapStatus(res.status, data, 'upload attachment');
    }

    const result = await res.json();
    return result[0]?.id;
  }

  async deleteAttachment(id) {
    const res = await httpJson(this.fetchImpl, {
      url: `${this.baseUrl}/rest/api/3/attachment/${id}`,
      method: 'DELETE',
      headers: { Authorization: this.authHeader() },
      timeout: this.timeoutMs,
    });

    if (res.status === 403) {
      throw new SorError('PERMISSION_DENIED', `Cannot delete attachment`, {
        system: this.system.kind || 'jira',
        remedy: `Check attachment permissions on this issue.`,
      });
    }

    if (!res.ok && res.status !== 204) {
      throw new SorError('SERVER', `Delete failed with status ${res.status}`, {
        system: this.system.kind || 'jira',
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

  mapStatus(status, data, context) {
    const message = data?.errorMessages?.[0] || data?.message || `HTTP ${status}`;

    if (status === 400) {
      throw new SorError('CONFIG', `Jira rejected the request: ${message}`, {
        system: this.system.kind || 'jira',
        remedy: `Check request format. If using description mode on API v3, set apiVersion: 2.`,
      });
    }

    if (status === 401) {
      throw new SorError('AUTH_FAILED', `Jira rejected credentials`, {
        system: this.system.kind || 'jira',
        remedy: `Re-run \`skopos sor auth set ${this.system.kind || 'jira'}\`. Tokens expire — check it still exists.`,
      });
    }

    if (status === 403) {
      if (typeof message === 'string' && message.includes('XSRF')) {
        throw new SorError('CONFIG', `XSRF check failed — missing X-Atlassian-Token header`, {
          system: this.system.kind || 'jira',
          remedy: `This is a skopos bug. Please report it.`,
        });
      }

      throw new SorError('PERMISSION_DENIED', `Account lacks permissions`, {
        system: this.system.kind || 'jira',
        remedy: `Check Create Attachments / Edit Issues on project ${this.project}. Ask a Jira admin.`,
      });
    }

    if (status === 404) {
      throw new SorError('NOT_FOUND', `Issue or resource not found`, {
        system: this.system.kind || 'jira',
        remedy: `Check the issue key and that it's visible to this account.`,
      });
    }

    if (status === 413) {
      throw new SorError('PAYLOAD_TOO_LARGE', `Artifact exceeds size limit`, {
        system: this.system.kind || 'jira',
        remedy: `Split the artifact or ask an admin to raise the limit.`,
      });
    }

    if (status === 429) {
      throw new SorError('RATE_LIMITED', `Jira is rate-limiting requests`, {
        system: this.system.kind || 'jira',
        retryAfterMs: this.parseRetryAfter(data) || 5000,
      });
    }

    if (status >= 500) {
      throw new SorError('SERVER', `Jira returned error ${status}`, {
        system: this.system.kind || 'jira',
      });
    }

    throw new SorError('SERVER', `Unexpected status ${status}: ${message}`, {
      system: this.system.kind || 'jira',
    });
  }

  parseRetryAfter(data) {
    if (data?.retryAfter) {
      const secs = parseInt(data.retryAfter, 10);
      if (!Number.isNaN(secs)) return secs * 1000;
    }
    return null;
  }
};

module.exports = jira;
