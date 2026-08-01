'use strict';

const { path, exists, readText, writeText, safeJson } = require('./util');

// Lock file: ~/.skopos/skopos.lock
//
// Because skopos writes into several roots (~/.agents, ~/.claude, ~/.copilot,
// ~/.skopos) and every root is env-overridable, lock entries are recorded as
// root-tagged refs — "<root>:<relative/path>" — never absolute paths. That
// keeps a lock written in a test sandbox meaningful, and a real lock portable.
//
// Three ownership classes:
//   managed   {ref: sha256}  — files skopos owns outright; pruned/removed freely
//   generated [ref]          — files skopos created wholesale (e.g. a CLAUDE.md
//                              that did not exist before); deleted on uninstall
//   fenced    {ref: sha256}  — files skopos does NOT own but holds a managed
//                              block in; the hash covers ONLY the block content,
//                              so user edits outside the fence are never drift.
//                              Uninstall strips the block, never the file.

const ROOTS = ['agents', 'claude', 'copilot', 'skopos'];

function rootDir(env, root) {
  switch (root) {
    case 'agents': return env.agentsDir;
    case 'claude': return env.claudeDir;
    case 'copilot': return env.copilotDir;
    case 'skopos': return env.skoposHome;
    default: throw new Error(`unknown lock root: ${root}`);
  }
}

function makeRef(root, rel) {
  if (!ROOTS.includes(root)) throw new Error(`unknown lock root: ${root}`);
  return `${root}:${rel.split(path.sep).join('/')}`;
}

function parseRef(ref) {
  const i = ref.indexOf(':');
  return { root: ref.slice(0, i), rel: ref.slice(i + 1) };
}

function refToAbs(env, ref) {
  const { root, rel } = parseRef(ref);
  return path.join(rootDir(env, root), ...rel.split('/'));
}

function lockPath(env) {
  return path.join(env.skoposHome, 'skopos.lock');
}

function readLock(env) {
  const p = lockPath(env);
  if (!exists(p)) return null;
  return safeJson(readText(p));
}

function writeLock(env, lock) {
  writeText(lockPath(env), JSON.stringify(lock, null, 2) + '\n');
}

function emptyLock(skoposVersion) {
  return {
    skoposVersion,
    configHash: null,
    targets: [],
    sources: {},
    managed: {},
    generated: [],
    fenced: {},
  };
}

module.exports = {
  ROOTS, rootDir, makeRef, parseRef, refToAbs,
  lockPath, readLock, writeLock, emptyLock,
};
