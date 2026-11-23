'use strict';

const { fs, path, exists } = require('./util');

// Nested skill discovery for sources whose skills don't live in a root
// skills/ directory (e.g. adobe/skills keeps them under
// plugins/<product>/[<sub>/]skills/<name>/SKILL.md).
//
// A source opts in with `skillsPaths`: a list of repo-relative directory
// patterns. Each pattern names directories that *contain* skill dirs — the
// same role the root skills/ directory plays by default.
//
// Pattern syntax is deliberately small and deterministic:
//   /    separates segments (always forward slash, on every OS)
//   *    any run of characters within one segment
//   ?    exactly one character within one segment
//   **   zero or more whole segments
// Wildcards never match dot-entries (.git, .github, …), symlinked directories
// are never followed, and every match is checked to resolve inside the
// checkout — a source can only ever contribute files from its own tree.
// Nothing here executes anything; it is a read-only directory walk.

// Returns null when the pattern is acceptable, otherwise a reason string.
// Shared with config validation so `skopos config validate` and render-time
// skipping can never disagree.
function patternProblem(p) {
  if (typeof p !== 'string' || !p.trim()) return 'must be a non-empty string';
  if (p.includes('\\')) return 'must use forward slashes';
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || path.isAbsolute(p)) return 'must be relative to the source root, not absolute';
  if (p.split('/').some((seg) => seg === '..')) return "must not contain '..'";
  return null;
}

function segmentRegex(seg) {
  let re = '^';
  for (const ch of seg) {
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${re}$`);
}

// Plain directories under `dir`, sorted by code point (not locale) so the
// order — and therefore collision resolution — is identical on every machine.
function childDirs(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !e.isSymbolicLink())
    .map((e) => e.name)
    .sort(byCodePoint);
}

function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Expand one pattern against `root`. Returns repo-relative posix paths of
// matching directories, sorted.
function expandPattern(root, pattern) {
  const segs = pattern.split('/').filter((s) => s && s !== '.');
  const out = new Set();

  const step = (rel, i) => {
    const abs = rel ? path.join(root, ...rel.split('/')) : root;
    if (i === segs.length) { out.add(rel); return; }
    const seg = segs[i];
    if (seg === '**') {
      step(rel, i + 1); // zero segments
      for (const d of childDirs(abs)) {
        if (d.startsWith('.')) continue;
        step(rel ? `${rel}/${d}` : d, i); // one more segment, stay on **
      }
      return;
    }
    if (!/[*?]/.test(seg)) {
      const next = path.join(abs, seg);
      let st;
      try { st = fs.lstatSync(next); } catch { return; }
      if (!st.isDirectory()) return; // also rejects symlinks
      step(rel ? `${rel}/${seg}` : seg, i + 1);
      return;
    }
    const re = segmentRegex(seg);
    for (const d of childDirs(abs)) {
      if (d.startsWith('.')) continue;
      if (re.test(d)) step(rel ? `${rel}/${d}` : d, i + 1);
    }
  };

  step('', 0);
  return [...out].sort(byCodePoint);
}

function inside(root, abs) {
  const r = fs.realpathSync(root);
  const a = fs.realpathSync(abs);
  return a === r || a.startsWith(r + path.sep);
}

// Every skill a source contributes through its skillsPaths. Returns
// { skills: [{ name, srcDir, relPath }], warnings }.
//
// Within one source, two matches with the same skill name are resolved by
// sorted relative path: the first wins and the rest are skipped with a warning
// naming both paths. Cross-source collisions are handled by the manifest,
// exactly as for root skills/.
function discoverNestedSkills(rootDir, patterns, origin) {
  const warnings = [];
  const candidates = new Map(); // relPath -> { name, srcDir, relPath }

  for (const pattern of patterns || []) {
    const problem = patternProblem(pattern);
    if (problem) {
      warnings.push(`skillsPaths entry ${JSON.stringify(pattern)} for ${origin} ${problem} — ignored`);
      continue;
    }
    const dirs = expandPattern(rootDir, pattern);
    let found = 0;
    for (const rel of dirs) {
      const container = rel ? path.join(rootDir, ...rel.split('/')) : rootDir;
      for (const name of childDirs(container)) {
        if (name.startsWith('.')) continue;
        const srcDir = path.join(container, name);
        if (!exists(path.join(srcDir, 'SKILL.md'))) continue;
        if (!inside(rootDir, srcDir)) continue;
        const relPath = rel ? `${rel}/${name}` : name;
        found++;
        if (!candidates.has(relPath)) candidates.set(relPath, { name, srcDir, relPath });
      }
    }
    if (!found) warnings.push(`skillsPaths entry '${pattern}' for ${origin} matched no skills (looked for <dir>/<name>/SKILL.md)`);
  }

  const skills = [];
  const firstAt = new Map();
  for (const relPath of [...candidates.keys()].sort(byCodePoint)) {
    const s = candidates.get(relPath);
    if (firstAt.has(s.name)) {
      warnings.push(`skill '${s.name}' at ${relPath} in ${origin} skipped — duplicate name, keeping ${firstAt.get(s.name)} (first in sorted path order)`);
      continue;
    }
    firstAt.set(s.name, relPath);
    skills.push(s);
  }
  return { skills, warnings };
}

module.exports = { patternProblem, expandPattern, discoverNestedSkills, segmentRegex };
