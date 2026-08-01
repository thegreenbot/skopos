'use strict';

const { execFileSync } = require('child_process');
const { fs, path, exists, ensureDir, nowIso } = require('./util');

// Enterprise source sync: shallow clone/fetch each configured source into
// ~/.skopos/sources/<name>/, check out the configured ref, and record the
// pinned SHA. Network failure keeps the prior checkout and warns — sync and
// render are separate deterministic steps, so `update` stays offline-safe.

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function sourceDir(env, name) {
  return path.join(env.skoposHome, 'sources', name);
}

// Sync one source. Returns { name, url, sha, syncedAt } on success; on failure
// returns { name, url, error, sha } with the previously pinned sha when a
// prior checkout exists.
function syncSource(env, source, prevPin) {
  const dir = sourceDir(env, source.name);
  const ref = source.ref || 'HEAD';
  try {
    if (!exists(path.join(dir, '.git'))) {
      ensureDir(path.dirname(dir));
      fs.rmSync(dir, { recursive: true, force: true });
      git(['clone', '--depth', '1', ...(source.ref ? ['--branch', source.ref] : []), source.url, dir]);
    } else {
      // The config URL may have changed since the clone — the remote follows config.
      git(['remote', 'set-url', 'origin', source.url], dir);
      git(['fetch', '--depth', '1', 'origin', ...(source.ref ? [source.ref] : [])], dir);
      git(['checkout', '--force', source.ref ? 'FETCH_HEAD' : 'origin/HEAD'], dir);
    }
    const sha = git(['rev-parse', 'HEAD'], dir);
    return { name: source.name, url: source.url, sha, syncedAt: nowIso() };
  } catch (e) {
    const prior = exists(dir) && prevPin ? prevPin.sha : null;
    return {
      name: source.name, url: source.url, error: firstLine(e), sha: prior,
      syncedAt: prevPin ? prevPin.syncedAt : null,
    };
  }
}

function firstLine(e) {
  const msg = (e.stderr && String(e.stderr).trim()) || e.message || String(e);
  return msg.split('\n')[0];
}

function syncAll(env, config, prevSources) {
  const results = [];
  for (const s of config.sources || []) {
    results.push(syncSource(env, s, (prevSources || {})[s.name]));
  }
  return results;
}

// Drop checkouts for sources no longer in config.
function pruneStale(env, config) {
  const dir = path.join(env.skoposHome, 'sources');
  if (!exists(dir)) return [];
  const keep = new Set((config.sources || []).map((s) => s.name));
  const pruned = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || keep.has(d.name)) continue;
    fs.rmSync(path.join(dir, d.name), { recursive: true, force: true });
    pruned.push(d.name);
  }
  return pruned;
}

module.exports = { syncSource, syncAll, pruneStale, sourceDir };
