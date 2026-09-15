'use strict';

const { fs, path, exists, readText } = require('./util');
const frontmatter = require('./frontmatter');
const lockLib = require('./lock');
const adapters = require('../adapters');

// Discovery of agents skopos does NOT own — the user's own sub-agents, already
// sitting in ~/.claude/agents, ~/.copilot/agents, or any extra directory they
// name in config.agents.dirs.
//
// Three rules govern everything in this file:
//   1. Read-only. Nothing here writes, moves, or reformats a user's file, and
//      nothing discovered here ever enters the lock as managed.
//   2. Overlay, never mutate. Routing metadata skopos needs but the file does
//      not carry comes from config.agents.overlays, never from editing the file.
//   3. Inert. A discovered string is rendered into the persona block, which is
//      a fenced region located by literal marker match (lib/fence.js). Every
//      discovered string is sanitized before it can reach a renderer.
//
// Kept out of lib/manifest.js deliberately: the manifest is the pure
// catalog+sources plan, while discovery needs the lock (to know what is already
// ours) and the adapters (to know each tool's agent-dir conventions).

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ROLES = ['observe', 'reason', 'deliver', 'review', 'domain'];
const OVERLAY_KEYS = ['summon', 'role', 'tags', 'prefer', 'hide', 'description'];

const MAX_LINE = 200;          // per description/summon, after collapsing
const MAX_ROSTER = 40;         // agents per scanned directory
const MAX_ROSTER_BYTES = 6144; // total rendered user-roster budget

// ---------------------------------------------------------------------------
// sanitizing

// Collapse to a single safe table cell. Order matters: comment delimiters are
// neutralized before anything else, because `<!-- SKOPOS:MANAGED:END -->`
// appearing verbatim inside the block would sever it on the next render.
function sanitizeLine(value, maxLen = MAX_LINE) {
  let out = value === null || value === undefined ? '' : String(value);
  out = out.replace(/\s+/g, ' ').trim();
  out = out.replace(/<!--/g, '&lt;!--').replace(/-->/g, '--&gt;');
  out = out.replace(/SKOPOS:/gi, 'SKOPOS-'); // belt and braces on the marker token
  out = out.replace(/\|/g, '\\|');
  if (out.length > maxLen) {
    // Never end on a lone backslash — it would escape the table's cell divider.
    out = out.slice(0, maxLen - 1).trimEnd().replace(/\\+$/, '') + '…';
  }
  return out;
}

// ---------------------------------------------------------------------------
// normalizing

function normalizeRole(raw) {
  if (!raw) return null;
  const r = String(raw).trim().toLowerCase();
  return ROLES.includes(r) ? r : null;
}

// `tools` absent → null, meaning "inherits / unknown". That is materially
// different from an empty list, and routing must not read it as "no tools".
function normalizeTools(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const out = list.map((t) => sanitizeLine(t, 24)).filter(Boolean);
  return out.length ? out : null;
}

function firstBodyLine(body) {
  for (const line of String(body || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('---')) continue;
    return t.replace(/^#+\s*/, '').replace(/^[*_]+|[*_]+$/g, '');
  }
  return '';
}

// Collapse an absolute path to ~-relative for display in the roster.
function displayDir(dir, env) {
  const home = env && env.home;
  if (home && dir.startsWith(home)) return `~${dir.slice(home.length)}`;
  return dir;
}

// One record shape for every provenance class, so renderers and the model
// advisor stop caring where an agent came from.
function makeRecord(fields) {
  return Object.assign({
    name: '',
    description: '',
    summon: '',
    role: 'domain',
    model: '',
    tools: null,
    tags: [],
    prefer: false,
    origin: '',
    target: null,
    dir: '',
    display: '',
    path: '',
    managed: false,
    routable: false,
    reportContract: 'unknown',
  }, fields);
}

// A managed agent (catalog / source / config) projected into the same record
// shape as a discovered one.
function toRecord(agent) {
  const d = (agent && agent.data) || {};
  const description = sanitizeLine(d.description);
  const summon = sanitizeLine(d.summon) || description;
  return makeRecord({
    name: agent.name,
    description,
    summon,
    role: normalizeRole(d.role) || 'domain',
    model: sanitizeLine(d.model, 40),
    tools: normalizeTools(d.tools),
    origin: agent.origin || 'catalog',
    path: agent.src || '',
    managed: true,
    routable: Boolean(summon),
    reportContract: 'skopos',
  });
}

// ---------------------------------------------------------------------------
// reading one file

function readRecord(file, scan, env, settings, warnings) {
  let text;
  try {
    text = readText(file);
  } catch (e) {
    warnings.push(`agent file unreadable, skipped: ${file} (${e.message})`);
    return null;
  }

  let parsed;
  try {
    parsed = frontmatter.parse(text);
  } catch (e) {
    warnings.push(`agent frontmatter unparseable, skipped: ${file} (${e.message})`);
    return null;
  }
  const data = parsed.data || {};
  const fallbackName = path.basename(file).slice(0, -scan.suffix.length);
  const rawName = (data.name && String(data.name).trim()) || fallbackName;

  if (!NAME_RE.test(rawName)) {
    warnings.push(`agent name '${rawName}' is not a valid agent name, skipped: ${file}`);
    return null;
  }

  const overlay = (settings.overlays || {})[rawName] || {};
  for (const k of Object.keys(overlay)) {
    if (!OVERLAY_KEYS.includes(k)) warnings.push(`agents.overlays.${rawName}.${k} is not a known overlay key — ignored`);
  }

  const description = sanitizeLine(overlay.description || data.description || firstBodyLine(parsed.body));
  const summon = sanitizeLine(overlay.summon || data.summon) || description;
  const role = normalizeRole(overlay.role) || normalizeRole(data.role);
  if (data.role && !normalizeRole(data.role) && !overlay.role) {
    warnings.push(`agent '${rawName}' declares role '${data.role}' (known: ${ROLES.join(', ')}) — treated as domain`);
  }

  return makeRecord({
    name: rawName,
    description,
    summon,
    role: role || 'domain',
    model: sanitizeLine(data.model, 40),
    tools: normalizeTools(data.tools),
    tags: Array.isArray(overlay.tags) ? overlay.tags.map((t) => sanitizeLine(t, 24)).filter(Boolean) : [],
    prefer: overlay.prefer === true,
    origin: scan.origin,
    target: scan.target,
    dir: scan.dir,
    display: displayDir(scan.dir, env),
    path: file,
    managed: false,
    routable: Boolean(summon),
    reportContract: 'unknown',
    hidden: overlay.hide === true,
  });
}

// ---------------------------------------------------------------------------
// scanning

function settingsFor(config) {
  return Object.assign({
    discover: 'auto',
    dirs: [],
    exclude: [],
    onCollision: 'user-wins',
    projectScoped: true,
    maxRoster: MAX_ROSTER,
    define: [],
    overlays: {},
  }, (config && config.agents) || {});
}

// Every directory to scan, in a stable order: enabled targets first (in the
// order given), then any extra directories from config.
function scanDirs(env, targets, settings) {
  const out = [];
  const seen = new Set();
  const push = (entry) => {
    const key = path.resolve(entry.dir);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };

  for (const t of targets || []) {
    let adapter;
    try { adapter = adapters.get(t); } catch { continue; }
    const dir = adapter.agentsDir ? adapter.agentsDir(env) : path.dirname(adapter.agentDest(env, { name: 'x' }));
    push({ dir, target: t, suffix: adapter.agentSuffix || '.md', origin: `user:${t}` });
  }
  for (const d of settings.dirs || []) {
    push({ dir: d, target: null, suffix: '.md', origin: 'user:dirs' });
  }
  return out;
}

// Estimated rendered width of a roster row — the budget is a safety valve on
// how much of every session's context this feature may consume, so an estimate
// is the right precision.
function rowBytes(r) {
  return Buffer.byteLength(
    `| \`${r.name}\` | ${r.role} | ${r.model} | ${(r.tools || ['inherited']).join(', ')} | ${r.summon} | ${r.display} |\n`,
  );
}

// Discover the user's own agents.
//
//   targets         enabled target names (their agent dirs get scanned)
//   config          merged config (reads config.agents)
//   lock            the previous lock, to recognise files skopos already owns
//   planAgentNames  names the current plan will render (collision detection)
//
// Returns { agents, collisions, warnings }. `collisions` are unmanaged files
// whose name the plan also claims — the caller applies agents.onCollision.
function discoverUserAgents(env, opts) {
  const { targets = [], config = {}, lock = null, planAgentNames = [] } = opts || {};
  const settings = settingsFor(config);
  const warnings = [];
  const agents = [];
  const collisions = [];

  if (settings.discover === 'off') return { agents, collisions, warnings, settings };

  const managedRefs = new Set(Object.keys((lock && lock.managed) || {}));
  const planned = new Set(planAgentNames);
  const excluded = new Set(settings.exclude || []);
  const maxRoster = Number.isInteger(settings.maxRoster) && settings.maxRoster > 0 ? settings.maxRoster : MAX_ROSTER;
  let budget = MAX_ROSTER_BYTES;

  for (const scan of scanDirs(env, targets, settings)) {
    if (!exists(scan.dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(scan.dir, { withFileTypes: true });
    } catch (e) {
      warnings.push(`agents directory unreadable, skipped: ${scan.dir} (${e.message})`);
      continue;
    }

    let kept = 0;
    let truncated = 0;
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) continue;
      if (!entry.name.endsWith(scan.suffix)) continue;
      const abs = path.join(scan.dir, entry.name);

      // Ours? Two independent tests, because either alone has a hole: the lock
      // is missing on a first install (or if deleted), and a name match alone
      // would swallow a genuine user agent that happens to share a name.
      if (scan.target) {
        const ref = lockLib.makeRef(scan.target, path.relative(lockLib.rootDir(env, scan.target), abs));
        if (managedRefs.has(ref)) continue;
      }

      const record = readRecord(abs, scan, env, settings, warnings);
      if (!record) continue;

      const fallbackName = entry.name.slice(0, -scan.suffix.length);
      const collidesWith = planned.has(fallbackName)
        ? fallbackName
        : (planned.has(record.name) ? record.name : null);
      if (collidesWith) {
        collisions.push({ name: collidesWith, path: abs, target: scan.target, origin: scan.origin, record });
        continue;
      }

      if (excluded.has(record.name)) continue;
      if (record.hidden) continue;

      if (kept >= maxRoster) { truncated++; continue; }
      const cost = rowBytes(record);
      if (cost > budget) { truncated++; continue; }
      budget -= cost;
      kept++;
      delete record.hidden;
      agents.push(record);
    }
    if (truncated) {
      warnings.push(`${truncated} agent(s) in ${displayDir(scan.dir, env)} left off the roster — the cap is ${maxRoster} per directory and ${MAX_ROSTER_BYTES} bytes total (agents.maxRoster, agents.exclude)`);
    }
  }

  return { agents, collisions, warnings, settings };
}

module.exports = {
  NAME_RE, ROLES, MAX_LINE, MAX_ROSTER, MAX_ROSTER_BYTES,
  sanitizeLine, normalizeRole, normalizeTools, firstBodyLine, displayDir,
  makeRecord, toRecord, settingsFor, scanDirs, discoverUserAgents,
};
