const integrations = require('./integrations');
const { resolveSecret, SorError } = require('./secrets');

/**
 * System-of-Record orchestrator.
 * Loads config, resolves secrets, creates clients, handles failures.
 */
class SorOrchestrator {
  constructor(config, env, opts = {}) {
    this.config = config;
    this.env = env;
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl || fetch;
    this.log = opts.log || (() => {});
    this.now = opts.now || (() => new Date());
    this.timeoutMs = opts.timeoutMs || 30000;
  }

  /**
   * Get the configured system or throw.
   */
  getSystem(systemName) {
    const sor = this.config.systemOfRecord;
    if (!sor?.enabled) {
      throw new SorError('CONFIG', 'systemOfRecord is not enabled', {
        remedy: 'Run skopos-setup and enable system-of-record, or set systemOfRecord.enabled: true in config.',
      });
    }

    const system = systemName ? sor.systems?.[systemName] : sor.systems?.[sor.default];

    if (!system) {
      const name = systemName || sor.default || '(none)';
      throw new SorError('CONFIG', `System ${name} not configured`, {
        remedy: `Run skopos-setup to configure a system-of-record.`,
      });
    }

    return system;
  }

  /**
   * Create a client for a system.
   */
  createClient(systemName) {
    const system = this.getSystem(systemName);
    const kind = system.kind || systemName;
    const integration = integrations.get(kind);

    let secret;
    try {
      secret = resolveSecret(this.env, system, systemName);
    } catch (e) {
      if (e instanceof SorError) throw e;
      throw new SorError('AUTH_MISSING', e.message, { system: systemName });
    }

    const ctx = {
      system,
      secret,
      fetchImpl: this.fetchImpl,
      log: this.log,
      now: this.now,
      timeoutMs: this.timeoutMs,
    };

    return integration.create(ctx);
  }

  /**
   * Test connectivity and configuration.
   * Returns { ok, degraded, checks: [{name, ok, detail, code}] }
   */
  async test(systemName) {
    const checks = [];
    let ok = true;
    let degraded = false;

    // Config check
    const system = this.getSystem(systemName);
    const kind = system.kind || systemName;
    const integration = integrations.get(kind);

    checks.push({
      name: 'config',
      ok: true,
      detail: `${kind} system configured`,
    });

    // Credential check
    try {
      resolveSecret(this.env, system, systemName);
      checks.push({
        name: 'credential',
        ok: true,
        detail: system.auth?.tokenEnv ? `env var ${system.auth.tokenEnv}` : 'file:~/.skopos/credentials.json',
      });
    } catch (e) {
      checks.push({
        name: 'credential',
        ok: false,
        code: e.code || 'AUTH_MISSING',
        detail: e.message,
      });
      return { ok: false, degraded: false, checks };
    }

    // Auth check
    try {
      const client = this.createClient(systemName);
      const auth = await client.authenticate();
      checks.push({
        name: 'auth',
        ok: true,
        detail: `authenticated as ${auth.displayName} (${auth.email || auth.accountId})`,
      });
    } catch (e) {
      checks.push({
        name: 'auth',
        ok: false,
        code: e.code || 'AUTH_FAILED',
        detail: e.message,
      });
      return { ok: false, degraded: false, checks };
    }

    // System-specific checks (Jira project, etc)
    if (integration.testSystem) {
      try {
        const result = await integration.testSystem(this.createClient(systemName));
        if (!result.ok) {
          checks.push({ name: 'project', ok: false, code: result.code, detail: result.message });
          return { ok: false, degraded: false, checks };
        }
        checks.push({ name: 'project', ok: true, detail: result.message });
      } catch (e) {
        checks.push({
          name: 'project',
          ok: false,
          code: e.code || 'SERVER',
          detail: e.message,
        });
        return { ok: false, degraded: false, checks };
      }
    }

    checks.push({ name: 'storage', ok: true, detail: `${system.artifactStorage?.mode} mode` });

    return { ok: true, degraded, checks };
  }

  /**
   * Publish an artifact.
   */
  async publish(systemName, target, artifact, opts = {}) {
    const client = this.createClient(systemName);

    const resolved = await client.resolveTarget(target);
    return client.publish(resolved, artifact, opts);
  }

  /**
   * List artifacts on a target.
   */
  async list(systemName, target, opts = {}) {
    const client = this.createClient(systemName);
    const resolved = await client.resolveTarget(target);
    return client.list(resolved, opts);
  }

  /**
   * Read an artifact.
   */
  async read(systemName, target, remoteId) {
    const client = this.createClient(systemName);
    const resolved = await client.resolveTarget(target);
    return client.read(resolved, remoteId);
  }
}

module.exports = { SorOrchestrator, SorError };
