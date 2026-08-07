const { SorError } = require('./secrets');

/**
 * Advanced publishing operations for system-of-record.
 * Handles batch operations, polling, reconciliation, and retries.
 */
class SorPublisher {
  constructor(orchestrator, opts = {}) {
    this.orchestrator = orchestrator;
    this.opts = opts;
    this.log = opts.log || (() => {});
    this.pollIntervalMs = opts.pollIntervalMs || 5000;
    this.maxPollAttempts = opts.maxPollAttempts || 60;
  }

  /**
   * Publish multiple artifacts to multiple systems.
   * Returns { ok, results: [{system, target, artifacts: [{kind, version, remoteId}]}] }
   */
  async publishBatch(systemNames, targets, artifacts, opts = {}) {
    const results = [];
    const failures = [];

    for (const systemName of systemNames) {
      for (const target of targets) {
        for (const artifact of artifacts) {
          try {
            const result = await this.orchestrator.publish(systemName, target, artifact, opts);
            results.push({
              system: systemName,
              target,
              artifact: artifact.title,
              result,
            });
          } catch (e) {
            failures.push({
              system: systemName,
              target,
              artifact: artifact.title,
              error: e.message,
            });
            this.log(`❌ ${systemName}: ${artifact.title} → ${e.message}`);
          }
        }
      }
    }

    return {
      ok: failures.length === 0,
      results,
      failures,
      summary: `${results.length} published, ${failures.length} failed`,
    };
  }

  /**
   * Poll for artifact publication status.
   * Useful when publishing is async or distributed across systems.
   */
  async pollForArtifact(systemName, target, artifactName, opts = {}) {
    const { maxAttempts = this.maxPollAttempts, intervalMs = this.pollIntervalMs } = opts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const list = await this.orchestrator.list(systemName, target);
        const found = list.artifacts?.find((a) => a.name === artifactName);

        if (found) {
          this.log(`✓ Found artifact ${artifactName} (attempt ${attempt}/${maxAttempts})`);
          return { ok: true, artifact: found, attempts: attempt };
        }

        if (attempt < maxAttempts) {
          this.log(`⏳ Waiting for ${artifactName}... (attempt ${attempt}/${maxAttempts})`);
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      } catch (e) {
        this.log(`⚠️  Poll attempt ${attempt} failed: ${e.message}`);
      }
    }

    return {
      ok: false,
      code: 'TIMEOUT',
      message: `Artifact not found after ${maxAttempts} attempts`,
    };
  }

  /**
   * Reconcile artifacts across systems.
   * Returns { ok, interviews: [{system, target, artifacts}], conflicts }
   */
  async reconcileInterviews(systems, target, opts = {}) {
    const interviews = {};
    const sources = [];

    for (const systemName of systems) {
      try {
        const list = await this.orchestrator.list(systemName, target, { kind: 'interview' });

        for (const interview of list.artifacts || []) {
          const key = interview.slug;
          if (!interviews[key]) {
            interviews[key] = [];
          }

          interviews[key].push({
            system: systemName,
            ...interview,
          });

          sources.push(`${systemName}:${interview.name}`);
        }
      } catch (e) {
        this.log(`⚠️  Failed to list interviews from ${systemName}: ${e.message}`);
      }
    }

    // Detect conflicts (same feature, different versions across systems)
    const conflicts = [];
    for (const [feature, versions] of Object.entries(interviews)) {
      const uniqueVersions = new Set(versions.map((v) => v.version));
      if (uniqueVersions.size > 1) {
        conflicts.push({
          feature,
          versions: Array.from(uniqueVersions).sort((a, b) => b - a),
          sources: versions.map((v) => `${v.system}:${v.name}`),
        });
      }
    }

    return {
      ok: conflicts.length === 0,
      count: Object.keys(interviews).length,
      sources,
      interviews,
      conflicts,
      summary: conflicts.length
        ? `Found ${conflicts.length} version conflicts`
        : `All interviews consistent across ${systems.length} systems`,
    };
  }

  /**
   * Download artifact from system and convert to markdown.
   * Returns { ok, content, metadata: {system, version, updatedAt} }
   */
  async downloadArtifact(systemName, target, remoteId, opts = {}) {
    try {
      const artifact = await this.orchestrator.read(systemName, target, remoteId);

      if (!artifact.ok) {
        return { ok: false, code: artifact.code, message: artifact.message };
      }

      return {
        ok: true,
        content: artifact.body,
        metadata: {
          system: systemName,
          remoteId,
          downloadedAt: new Date().toISOString(),
        },
      };
    } catch (e) {
      throw new SorError('NETWORK', `Failed to download artifact: ${e.message}`, {
        system: systemName,
      });
    }
  }

  /**
   * Sync artifacts between two systems.
   * Reads from source, publishes to target if not already present.
   */
  async syncArtifacts(sourceSystem, targetSystem, target, opts = {}) {
    const { overwrite = false } = opts;
    const results = { synced: 0, skipped: 0, failed: 0 };

    try {
      const sourceList = await this.orchestrator.list(sourceSystem, target);
      const targetList = await this.orchestrator.list(targetSystem, target);

      const targetNames = new Set((targetList.artifacts || []).map((a) => a.name));

      for (const source of sourceList.artifacts || []) {
        if (targetNames.has(source.name) && !overwrite) {
          this.log(`⊘ Skipping ${source.name} (exists on target)`);
          results.skipped++;
          continue;
        }

        try {
          const artifact = await this.orchestrator.read(sourceSystem, target, source.remoteId);
          if (!artifact.ok) {
            results.failed++;
            continue;
          }

          await this.orchestrator.publish(targetSystem, target, {
            title: source.name,
            body: artifact.body,
          });

          this.log(`✓ Synced ${source.name} → ${targetSystem}`);
          results.synced++;
        } catch (e) {
          this.log(`✗ Failed to sync ${source.name}: ${e.message}`);
          results.failed++;
        }
      }
    } catch (e) {
      throw new SorError('NETWORK', `Sync failed: ${e.message}`, {
        system: sourceSystem,
      });
    }

    return {
      ok: results.failed === 0,
      results,
      summary: `${results.synced} synced, ${results.skipped} skipped, ${results.failed} failed`,
    };
  }

  /**
   * Export all artifacts from a target to local directory.
   * Returns { ok, exported: [{name, path, system}] }
   */
  async exportArtifacts(systemNames, target, exportDir, opts = {}) {
    const fs = require('fs');
    const path = require('path');
    const exported = [];
    const { overwrite = false } = opts;

    fs.mkdirSync(exportDir, { recursive: true });

    for (const systemName of systemNames) {
      try {
        const list = await this.orchestrator.list(systemName, target);

        for (const artifact of list.artifacts || []) {
          const filePath = path.join(exportDir, artifact.name);

          if (fs.existsSync(filePath) && !overwrite) {
            this.log(`⊘ Skipping export of ${artifact.name} (file exists)`);
            continue;
          }

          try {
            const content = await this.orchestrator.read(systemName, target, artifact.remoteId);
            if (content.ok) {
              fs.writeFileSync(filePath, content.body, 'utf8');
              this.log(`✓ Exported ${artifact.name}`);
              exported.push({
                name: artifact.name,
                path: filePath,
                system: systemName,
              });
            }
          } catch (e) {
            this.log(`✗ Failed to export ${artifact.name}: ${e.message}`);
          }
        }
      } catch (e) {
        this.log(`⚠️  Failed to list artifacts from ${systemName}: ${e.message}`);
      }
    }

    return {
      ok: true,
      exported,
      count: exported.length,
      exportDir,
    };
  }

  /**
   * Validate artifacts across systems for consistency.
   * Checks: naming, versioning, frontmatter format.
   */
  async validateArtifacts(systemName, target, opts = {}) {
    const issues = [];

    try {
      const list = await this.orchestrator.list(systemName, target);

      for (const artifact of list.artifacts || []) {
        // Check naming convention
        if (!artifact.name.startsWith('skopos--')) {
          issues.push({
            artifact: artifact.name,
            severity: 'warning',
            issue: 'Does not follow skopos naming convention',
          });
        }

        // Check versioning
        if (!artifact.version || artifact.version < 1) {
          issues.push({
            artifact: artifact.name,
            severity: 'error',
            issue: 'Invalid version number',
          });
        }

        // Check kind
        if (!artifact.kind || !['charter', 'interview-po', 'interview-tech', 'interview-lead'].includes(artifact.kind)) {
          issues.push({
            artifact: artifact.name,
            severity: 'warning',
            issue: `Unknown artifact kind: ${artifact.kind}`,
          });
        }
      }
    } catch (e) {
      throw new SorError('NETWORK', `Validation failed: ${e.message}`, {
        system: systemName,
      });
    }

    return {
      ok: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
      summary: `${issues.filter((i) => i.severity === 'error').length} errors, ${issues.filter((i) => i.severity === 'warning').length} warnings`,
    };
  }
}

module.exports = { SorPublisher };
