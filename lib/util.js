'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function nowIso() {
  return new Date().toISOString();
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Recursively copy a directory tree, returning the list of files written
// (as paths relative to destRoot) so managed files can be recorded in the lock.
function copyDir(srcDir, destDir, destRoot, written) {
  written = written || [];
  destRoot = destRoot || destDir;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest, destRoot, written);
    } else {
      const real = entry.isSymbolicLink() ? fs.realpathSync(src) : src;
      ensureDir(path.dirname(dest));
      fs.copyFileSync(real, dest);
      written.push(path.relative(destRoot, dest));
    }
  }
  return written;
}

// Remove a file and any now-empty parent directories, stopping at `stopAt`.
function removeAndPrune(absFile, stopAt) {
  try { fs.unlinkSync(absFile); } catch { /* already gone */ }
  let dir = path.dirname(absFile);
  const stop = path.resolve(stopAt);
  while (dir.startsWith(stop) && dir !== stop) {
    try {
      if (fs.readdirSync(dir).length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir); }
      else break;
    } catch { break; }
  }
}

// All filesystem roots skopos touches, every one env-overridable so the full
// lifecycle can run against a temp dir in tests.
function resolveEnv(overrides) {
  const home = os.homedir();
  const e = Object.assign({}, process.env, overrides || {});
  return {
    home,
    skoposHome: e.SKOPOS_HOME || path.join(home, '.skopos'),
    agentsDir: e.SKOPOS_AGENTS_DIR || path.join(home, '.agents'),
    claudeDir: e.SKOPOS_CLAUDE_DIR || path.join(home, '.claude'),
    copilotDir: e.SKOPOS_COPILOT_DIR || path.join(home, '.copilot'),
  };
}

module.exports = {
  fs, path,
  ensureDir, readText, writeText, exists, sha256, safeJson, nowIso, uniq,
  walk, copyDir, removeAndPrune, resolveEnv,
};
