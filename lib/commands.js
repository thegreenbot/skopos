'use strict';

const {
  fs, path, ensureDir, readText, writeText, exists, sha256, nowIso,
  copyDir, walk, removeAndPrune, resolveEnv,
} = require('./util');
const configLib = require('./config');
const lockLib = require('./lock');
const fence = require('./fence');
const { buildManifest } = require('./manifest');
const { renderInstructionsBody } = require('./instructions');
const adapters = require('../adapters');
const sourcesLib = require('./sources');
const modelAdvisor = require('./model-advisor');
const discovery = require('./discovery');

const SKOPOS_VERSION = require('../package.json').version;

// ---------------------------------------------------------------------------
// helpers

function backupDir(env) { return path.join(env.skoposHome, 'backup'); }
function backupManifestPath(env) { return path.join(backupDir(env), 'manifest.json'); }

function relToRoot(env, root, absFile) {
  return lockLib.makeRef(root, path.relative(lockLib.rootDir(env, root), absFile));
}

const EMPTY_SET = new Set();

// Skopos never touches files it doesn't manage. lib/discovery.js finds the
// user's own agents in the same directories and returns them as roster records;
// this applies agents.onCollision when one of them claims a name the plan also
// claims. Returns target -> Set(names the plan must not render for that target).
function applyCollisionPolicy(found, config, warnings) {
  const settings = discovery.settingsFor(config);
  const policy = settings.onCollision;
  const excluded = new Set(settings.exclude || []);
  const skip = new Map();
  for (const col of found.collisions) {
    if (!col.target) {
      // A directory from agents.dirs holds no file skopos would ever write, so
      // nothing is at risk: the managed agent keeps the name and the user's
      // file is simply left off the roster.
      warnings.push(`your agent '${col.name}' at ${col.path} is shadowed by the managed agent of the same name — rename it, or drop the managed one via catalog.agents`);
      continue;
    }
    if (policy === 'error') {
      throw new Error(`agent name collision: '${col.name}' is provided by the catalog/sources and by your own file at ${col.path}. Rename one, or set agents.onCollision to user-wins|catalog-wins.`);
    }
    if (policy === 'catalog-wins') {
      warnings.push(`your agent '${col.name}' at ${col.path} will be overwritten by the managed agent (agents.onCollision=catalog-wins; the original is snapshotted for rollback)`);
      continue;
    }
    if (!skip.has(col.target)) skip.set(col.target, new Set());
    skip.get(col.target).add(col.name);
    warnings.push(`agent '${col.name}' not installed for ${col.target} — you define your own at ${col.path} (agents.onCollision=user-wins)`);
    if (col.record && !col.record.hidden && !excluded.has(col.record.name)) {
      delete col.record.hidden;
      found.agents.push(col.record);
    }
  }
  return skip;
}

// The user agents visible to one target: its own agents dir, plus any
// target-agnostic directory from agents.dirs.
function userAgentsFor(found, target) {
  return found.agents.filter((r) => r.target === null || r.target === target);
}

// Create a compat link <linkDir>/<name> → <skills home>/<name>. Symlinks need
// privileges on Windows, so fall back to a directory junction, then to a copy.
function makeSkillLink(linkPath, targetDir) {
  fs.rmSync(linkPath, { recursive: true, force: true });
  ensureDir(path.dirname(linkPath));
  try {
    fs.symlinkSync(targetDir, linkPath, 'dir');
    return 'symlink';
  } catch {
    try {
      fs.symlinkSync(targetDir, linkPath, 'junction');
      return 'junction';
    } catch {
      copyDir(targetDir, linkPath);
      return 'copy';
    }
  }
}

// ---------------------------------------------------------------------------
// install / update

function runInstall(opts) {
  const { skoposRoot, dryRun, force } = opts;
  const env = opts.env || resolveEnv();
  const warnings = [];

  const loaded = configLib.loadConfig(env, skoposRoot);
  warnings.push(...loaded.problems);
  let userConfig = loaded.userConfig || {};

  // --target writes back into config BEFORE the lock is written, so a later
  // bare `update` can never silently drop a surface.
  if (opts.target) {
    const names = opts.target === 'all' ? Object.keys(adapters.adapters) : [opts.target];
    userConfig.targets = userConfig.targets || {};
    for (const n of names) {
      adapters.get(n); // throws on unknown target
      userConfig.targets[n] = true;
    }
    loaded.config.targets = Object.assign({}, loaded.config.targets, userConfig.targets);
  }

  // First run with no targets at all → detect installed tools, print + persist.
  const detected = [];
  if (!Object.keys(loaded.config.targets || {}).length) {
    for (const a of adapters.all()) {
      if (a.detect(env)) { detected.push(a.name); }
    }
    if (!detected.length) detected.push('claude'); // sensible default on a clean machine
    userConfig.targets = userConfig.targets || {};
    for (const n of detected) userConfig.targets[n] = true;
    loaded.config.targets = Object.assign({}, loaded.config.targets, userConfig.targets);
  }

  const config = loaded.config;
  const configErrors = configLib.validateConfig(config);
  if (configErrors.length) {
    throw new Error(`config invalid:\n  - ${configErrors.join('\n  - ')}`);
  }

  if (!dryRun && (opts.target || detected.length || !loaded.existed)) {
    userConfig.version = userConfig.version || 1;
    configLib.saveConfig(env, userConfig);
  }

  const plan = buildManifest(skoposRoot, config, env);
  warnings.push(...plan.warnings);
  warnings.push(...modelAdvisor.adviseInstall(plan, config));
  const targets = plan.targets;

  const oldLock = lockLib.readLock(env);
  const firstInstall = !oldLock;
  const mode = opts.mode === 'install' && oldLock ? 'update' : opts.mode;

  // The user's own agents. Read-only: nothing here is written, and nothing
  // discovered ever enters the lock.
  const found = discovery.discoverUserAgents(env, {
    targets, config, lock: oldLock, planAgentNames: plan.agents.map((a) => a.name),
  });
  warnings.push(...found.warnings);
  const collisionSkip = applyCollisionPolicy(found, config, warnings);
  const skipFor = (t) => collisionSkip.get(t) || EMPTY_SET;
  warnings.push(...modelAdvisor.adviseUserAgents(found.agents));

  // Rollback baseline: on first install, snapshot every pre-existing file we
  // are about to overwrite or merge into, so uninstall can restore it exactly.
  const snapshot = { skoposVersion: SKOPOS_VERSION, createdAt: nowIso(), restore: [] };
  const snapped = new Set();
  const snapBefore = (root, absFile) => {
    if (!firstInstall || dryRun) return;
    const ref = relToRoot(env, root, absFile);
    if (snapped.has(ref)) return;
    snapped.add(ref);
    if (!exists(absFile)) return;
    const dest = path.join(backupDir(env), 'files', ref.replace(':', path.sep));
    ensureDir(path.dirname(dest));
    fs.copyFileSync(absFile, dest);
    snapshot.restore.push(ref);
  };

  const managed = {};
  const generated = [];
  const fenced = {};
  const links = [];
  const oldManaged = (oldLock && oldLock.managed) || {};

  const writeManagedFile = (root, absFile, content) => {
    const ref = relToRoot(env, root, absFile);
    const hash = sha256(content);
    if (!dryRun) {
      const wasOurs = ref in oldManaged;
      if (exists(absFile) && !wasOurs && sha256(readText(absFile)) !== hash) {
        snapBefore(root, absFile);
        warnings.push(`overwrote a pre-existing ${ref} (original snapshotted for rollback)`);
      }
      writeText(absFile, content);
    }
    managed[ref] = hash;
  };

  // (1) skills — copied once, full dirs incl. references/assets, to the
  // universal home ~/.agents/skills/.
  const skillsHome = path.join(env.agentsDir, 'skills');
  for (const s of plan.skills) {
    const destDir = path.join(skillsHome, s.name);
    for (const f of walk(s.srcDir)) {
      const rel = path.relative(s.srcDir, f);
      writeManagedFile('agents', path.join(destDir, rel), readText(f));
    }
  }

  // (1b) templates — flat markdown files, written once to the universal home
  // ~/.agents/templates/, same author-once-project-everywhere model as skills.
  const templatesHome = path.join(env.agentsDir, 'templates');
  for (const t of plan.templates) {
    writeManagedFile('agents', path.join(templatesHome, `${t.name}.md`), `${t.body}\n`);
  }

  // (2) agents + (3) instructions, per enabled target adapter.
  for (const t of targets) {
    const adapter = adapters.get(t);

    for (const a of plan.agents) {
      if (skipFor(t).has(a.name)) continue;
      writeManagedFile(t, adapter.agentDest(env, a), adapter.renderAgent(a, config));
    }

    const body = renderInstructionsBody(plan, config, {
      userAgents: userAgentsFor(found, t),
      skipAgents: skipFor(t),
    });
    const instrFile = adapter.instructionsFile(env);
    const ref = relToRoot(env, t, instrFile);
    const existing = exists(instrFile) ? readText(instrFile) : null;
    const wasGenerated = oldLock && (oldLock.generated || []).includes(ref);
    const { text, action } = fence.applyBlock(existing, body);
    if (existing !== null && action === 'appended') snapBefore(t, instrFile);
    if (!dryRun) writeText(instrFile, text);
    // `generated` = the file itself did not exist before skopos; uninstall may
    // delete it. Otherwise it's fenced-only: uninstall strips the block.
    if (action === 'created' || wasGenerated) generated.push(ref);
    // Hash the block with USER-FACTS blanked: the user's facts are theirs to
    // edit and must never register as drift.
    fenced[ref] = sha256(fence.normalizeUserFacts(fence.extractBlock(text)) || '');

    // skill compat links (R1/R2 mitigation).
    const mode2 = (config.compat || {}).skillLinks || 'auto';
    if (mode2 !== 'never' && adapter.skillLinkDir) {
      for (const s of plan.skills) {
        const linkPath = path.join(adapter.skillLinkDir(env), s.name);
        const ref2 = relToRoot(env, t, linkPath);
        if (!dryRun) makeSkillLink(linkPath, path.join(skillsHome, s.name));
        links.push(ref2);
      }
    }
  }

  // Prune anything the previous lock managed that this plan no longer does.
  const pruned = [];
  if (oldLock) {
    for (const ref of Object.keys(oldManaged)) {
      if (ref in managed) continue;
      const abs = lockLib.refToAbs(env, ref);
      // A file skopos wrote but the user has since edited is theirs now —
      // deselecting content must never delete work skopos did not author.
      if (exists(abs) && sha256(readText(abs)) !== oldManaged[ref]) {
        warnings.push(`${ref} left in place — modified since skopos wrote it, so it is yours now (delete it yourself if you don't want it)`);
        continue;
      }
      if (!dryRun && exists(abs)) removeAndPrune(abs, lockLib.rootDir(env, lockLib.parseRef(ref).root));
      pruned.push(ref);
    }
    for (const ref of oldLock.links || []) {
      if (links.includes(ref)) continue;
      if (!dryRun) fs.rmSync(lockLib.refToAbs(env, ref), { recursive: true, force: true });
      pruned.push(ref);
    }
    for (const ref of Object.keys(oldLock.fenced || {})) {
      if (ref in fenced) continue;
      const abs = lockLib.refToAbs(env, ref);
      if (!dryRun && exists(abs)) writeText(abs, fence.stripBlock(readText(abs)));
      pruned.push(ref);
    }
  }

  if (firstInstall && !dryRun) {
    writeText(backupManifestPath(env), JSON.stringify(snapshot, null, 2) + '\n');
  }

  const lock = {
    skoposVersion: SKOPOS_VERSION,
    configHash: exists(configLib.configPath(env)) ? sha256(readText(configLib.configPath(env))) : null,
    targets,
    sources: (oldLock && oldLock.sources) || {},
    managed,
    generated,
    fenced,
    links,
  };
  if (!dryRun) lockLib.writeLock(env, lock);

  const changes = { added: 0, updated: 0, unchanged: 0, removed: pruned.length };
  for (const [ref, h] of Object.entries(managed)) {
    if (!(ref in oldManaged)) changes.added++;
    else if (oldManaged[ref] !== h) changes.updated++;
    else changes.unchanged++;
  }

  return {
    env, mode, dryRun, firstInstall, targets, detected,
    skills: plan.skills.map((s) => s.name),
    agents: plan.agents.map((a) => a.name),
    templates: plan.templates.map((t) => t.name),
    managedCount: Object.keys(managed).length,
    generated, fenced: Object.keys(fenced), links, pruned, changes,
    snapshotted: snapshot.restore,
    userAgents: found.agents,
    agentsSkipped: Object.fromEntries([...collisionSkip].map(([t, names]) => [t, [...names].sort()])),
    collisions: found.collisions.map((c) => ({ name: c.name, path: c.path, target: c.target })),
    personalized: Boolean((config.identity || {}).name || (config.identity || {}).role),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// verify — exit 2 on drift. For fenced files only the block content is hashed,
// so user edits outside the fence are never drift.

function runVerify(opts) {
  const env = opts.env || resolveEnv();
  const lock = lockLib.readLock(env);
  if (!lock) throw new Error(`no skopos install found (missing ${lockLib.lockPath(env)}) — run \`skopos install\` first.`);

  const missing = [], modified = [];
  for (const [ref, hash] of Object.entries(lock.managed || {})) {
    const abs = lockLib.refToAbs(env, ref);
    if (!exists(abs)) { missing.push(ref); continue; }
    if (sha256(readText(abs)) !== hash) modified.push(ref);
  }
  for (const [ref, hash] of Object.entries(lock.fenced || {})) {
    const abs = lockLib.refToAbs(env, ref);
    if (!exists(abs)) { missing.push(ref); continue; }
    const block = fence.extractBlock(readText(abs));
    if (block === null) { missing.push(`${ref} (managed block stripped)`); continue; }
    if (sha256(fence.normalizeUserFacts(block)) !== hash) modified.push(`${ref} (managed block)`);
  }
  return { lock, missing, modified, ok: !missing.length && !modified.length };
}

// ---------------------------------------------------------------------------
// uninstall — remove everything skopos added, strip fences, restore snapshots.
// The user's own files (config.json included) are left in place.

function runUninstall(opts) {
  const env = opts.env || resolveEnv();
  const { dryRun } = opts;
  const lock = lockLib.readLock(env);
  if (!lock) throw new Error(`no skopos install found (missing ${lockLib.lockPath(env)}).`);

  const manifest = exists(backupManifestPath(env))
    ? JSON.parse(readText(backupManifestPath(env)))
    : { restore: [] };
  const restoreSet = new Set(manifest.restore || []);

  const removed = [], stripped = [], restored = [];

  for (const ref of lock.links || []) {
    if (!dryRun) fs.rmSync(lockLib.refToAbs(env, ref), { recursive: true, force: true });
    removed.push(ref);
  }
  for (const ref of Object.keys(lock.managed || {})) {
    if (restoreSet.has(ref)) continue; // will be restored from snapshot below
    const abs = lockLib.refToAbs(env, ref);
    if (!dryRun && exists(abs)) removeAndPrune(abs, lockLib.rootDir(env, lockLib.parseRef(ref).root));
    removed.push(ref);
  }
  for (const ref of Object.keys(lock.fenced || {})) {
    const abs = lockLib.refToAbs(env, ref);
    if (!exists(abs)) continue;
    // Always strip rather than delete outright: even a file skopos created may
    // since have gained the user's own content outside the fence. Delete only
    // when a skopos-created file is empty once the block is gone.
    const strippedText = fence.stripBlock(readText(abs));
    const wasOurs = (lock.generated || []).includes(ref) && !restoreSet.has(ref);
    if (wasOurs && strippedText.trim() === '') {
      if (!dryRun) removeAndPrune(abs, lockLib.rootDir(env, lockLib.parseRef(ref).root));
      removed.push(ref);
    } else {
      if (!dryRun) writeText(abs, strippedText);
      stripped.push(ref);
    }
  }
  for (const ref of restoreSet) {
    const bsrc = path.join(backupDir(env), 'files', ref.replace(':', path.sep));
    if (!exists(bsrc)) continue;
    const abs = lockLib.refToAbs(env, ref);
    if (!dryRun) { ensureDir(path.dirname(abs)); fs.copyFileSync(bsrc, abs); }
    restored.push(ref);
  }
  if (!dryRun) {
    removeAndPrune(lockLib.lockPath(env), env.skoposHome);
    fs.rmSync(backupDir(env), { recursive: true, force: true });
    fs.rmSync(path.join(env.skoposHome, 'sources'), { recursive: true, force: true });
  }
  return { env, dryRun, removed, stripped, restored };
}

// ---------------------------------------------------------------------------
// status

// Which enabled targets carry an instruction block that no longer matches what
// the current config + roster would render. Adding an agent file changes
// nothing until `skopos update` runs, and that used to be silent.
function rosterStaleness(env, plan, config, found, skipFor, lock) {
  const out = [];
  for (const t of (lock && lock.targets) || []) {
    let adapter;
    try { adapter = adapters.get(t); } catch { continue; }
    const file = adapter.instructionsFile(env);
    if (!exists(file)) continue;
    const existingText = readText(file);
    const current = fence.extractBlock(existingText);
    if (current === null) continue;
    const mine = userAgentsFor(found, t);
    const body = renderInstructionsBody(plan, config, { userAgents: mine, skipAgents: skipFor(t) });
    const fresh = fence.extractBlock(fence.applyBlock(existingText, body).text);
    if (fence.normalizeUserFacts(fresh) === fence.normalizeUserFacts(current)) continue;
    out.push({
      target: t,
      added: mine.filter((r) => !current.includes(`| \`${r.name}\` |`)).map((r) => r.name),
    });
  }
  return out;
}

function runStatus(opts) {
  const env = opts.env || resolveEnv();
  const skoposRoot = opts.skoposRoot;
  const lock = lockLib.readLock(env);
  const loaded = configLib.loadConfig(env, skoposRoot);
  const plan = buildManifest(skoposRoot, loaded.config, env);
  const warnings = plan.warnings.slice();

  const found = discovery.discoverUserAgents(env, {
    targets: plan.targets, config: loaded.config, lock, planAgentNames: plan.agents.map((a) => a.name),
  });
  warnings.push(...found.warnings);
  // status reports, never refuses: an onCollision=error config surfaces here as
  // a warning rather than an exception.
  let collisionSkip = new Map();
  try {
    collisionSkip = applyCollisionPolicy(found, loaded.config, warnings);
  } catch (e) {
    warnings.push(e.message);
  }
  const skipFor = (t) => collisionSkip.get(t) || EMPTY_SET;

  let drift = null;
  if (lock) {
    const v = runVerify({ env });
    drift = { missing: v.missing, modified: v.modified, ok: v.ok };
  }
  return {
    env,
    skoposVersion: SKOPOS_VERSION,
    installed: Boolean(lock),
    lock,
    configExists: loaded.existed,
    configProblems: loaded.problems,
    targets: plan.targets,
    skills: plan.skills.map((s) => `${s.name} (${s.origin})`),
    agents: plan.agents.map((a) => `${a.name} (${a.origin})`),
    templates: plan.templates.map((t) => `${t.name} (${t.origin})`),
    warnings,
    drift,
    userAgents: found.agents,
    collisions: found.collisions.map((c) => ({ name: c.name, path: c.path, target: c.target })),
    stale: lock ? rosterStaleness(env, plan, loaded.config, found, skipFor, lock) : [],
  };
}

// ---------------------------------------------------------------------------
// agents — inspect the effective roster, and record routing metadata for the
// user's own agents WITHOUT ever touching their files.

function effectiveRoster(opts) {
  const env = opts.env || resolveEnv();
  const loaded = configLib.loadConfig(env, opts.skoposRoot);
  const plan = buildManifest(opts.skoposRoot, loaded.config, env);
  const lock = lockLib.readLock(env);
  const warnings = [];

  const allTargets = plan.targets;
  if (opts.target) adapters.get(opts.target); // throws on unknown target
  const targets = opts.target ? [opts.target] : allTargets;

  const found = discovery.discoverUserAgents(env, {
    targets, config: loaded.config, lock, planAgentNames: plan.agents.map((a) => a.name),
  });
  warnings.push(...found.warnings);
  let collisionSkip = new Map();
  try {
    collisionSkip = applyCollisionPolicy(found, loaded.config, warnings);
  } catch (e) {
    warnings.push(e.message);
  }
  const skipped = new Set([].concat(...[...collisionSkip.values()].map((v) => [...v])));

  const builtins = plan.agents
    .filter((a) => !skipped.has(a.name))
    .map((a) => Object.assign(discovery.toRecord(a), { origin: a.origin }));

  return {
    env,
    targets,
    notScanned: allTargets.filter((t) => !targets.includes(t)),
    builtins,
    userAgents: found.agents,
    collisions: found.collisions.map((c) => ({ name: c.name, path: c.path, target: c.target })),
    advisories: modelAdvisor.adviseUserAgents(found.agents),
    settings: found.settings,
    warnings,
    config: loaded.config,
    userConfig: loaded.userConfig || {},
  };
}

function runAgentsList(opts) {
  const r = effectiveRoster(opts);
  return {
    targets: r.targets,
    notScanned: r.notScanned,
    builtins: r.builtins,
    userAgents: r.userAgents,
    collisions: r.collisions,
    advisories: r.advisories,
    warnings: r.warnings,
  };
}

function runAgentsShow(opts) {
  const r = effectiveRoster(opts);
  const all = [...r.builtins, ...r.userAgents];
  const agent = all.find((a) => a.name === opts.name);
  if (!agent) {
    throw new Error(`no agent named '${opts.name}' on the roster (known: ${all.map((a) => a.name).join(', ') || 'none'})`);
  }
  const overlay = ((r.config.agents || {}).overlays || {})[opts.name] || null;
  return { agent, overlay, advisories: r.advisories.filter((w) => w.includes(`'${opts.name}'`)) };
}

// Write the user layer only, and validate before persisting — an overlay that
// fails validation must never reach disk.
function saveUserLayer(env, userConfig, skoposRoot) {
  const merged = configLib.merge(configLib.loadConfig(env, skoposRoot).config, userConfig);
  const errors = configLib.validateConfig(merged);
  if (errors.length) throw new Error(`refusing to write an invalid config:\n  - ${errors.join('\n  - ')}`);
  userConfig.version = userConfig.version || 1;
  configLib.saveConfig(env, userConfig);
}

function runAgentsAdopt(opts) {
  const env = opts.env || resolveEnv();
  const r = effectiveRoster({ env, skoposRoot: opts.skoposRoot });
  const known = [...r.builtins, ...r.userAgents].find((a) => a.name === opts.name);
  const collided = r.collisions.find((c) => c.name === opts.name);
  if (!known && !collided) {
    throw new Error(`no agent named '${opts.name}' found — run \`skopos agents list\` to see the roster`);
  }

  const userConfig = r.userConfig;
  userConfig.agents = userConfig.agents || {};
  userConfig.agents.overlays = userConfig.agents.overlays || {};
  const overlay = Object.assign({}, userConfig.agents.overlays[opts.name]);
  let supplied = 0;
  for (const k of ['summon', 'role', 'description', 'tags', 'prefer', 'hide']) {
    if (opts[k] === undefined) continue;
    overlay[k] = opts[k];
    supplied++;
  }
  if (!supplied) {
    throw new Error(`nothing to record for '${opts.name}' — pass at least one of --summon, --role, --tags, --prefer, --hide`);
  }
  userConfig.agents.overlays[opts.name] = overlay;
  saveUserLayer(env, userConfig, opts.skoposRoot);
  return { name: opts.name, overlay, path: configLib.configPath(env), managed: Boolean(known && known.managed) };
}

function runAgentsIgnore(opts) {
  const env = opts.env || resolveEnv();
  const r = effectiveRoster({ env, skoposRoot: opts.skoposRoot });
  const userConfig = r.userConfig;
  userConfig.agents = userConfig.agents || {};
  const exclude = new Set(userConfig.agents.exclude || []);
  if (opts.undo) exclude.delete(opts.name);
  else exclude.add(opts.name);
  userConfig.agents.exclude = [...exclude].sort();
  saveUserLayer(env, userConfig, opts.skoposRoot);
  return { name: opts.name, excluded: !opts.undo, exclude: userConfig.agents.exclude, path: configLib.configPath(env) };
}

// ---------------------------------------------------------------------------
// sources

function runSourcesSync(opts) {
  const env = opts.env || resolveEnv();
  const loaded = configLib.loadConfig(env, opts.skoposRoot);
  const lock = lockLib.readLock(env) || lockLib.emptyLock(SKOPOS_VERSION);
  const results = sourcesLib.syncAll(env, loaded.config, lock.sources);
  for (const r of results) {
    if (!r.error) lock.sources[r.name] = { url: r.url, sha: r.sha, syncedAt: r.syncedAt };
  }
  const prunedDirs = sourcesLib.pruneStale(env, loaded.config);
  for (const name of Object.keys(lock.sources)) {
    if (!(loaded.config.sources || []).some((s) => s.name === name)) delete lock.sources[name];
  }
  lockLib.writeLock(env, lock);
  return { env, results, prunedDirs };
}

// ---------------------------------------------------------------------------
// models — capability metadata + routing advisories (informational only;
// see docs/model-capabilities.md and docs/model-routing-guide.md).

const modelCapabilities = require('./model-capabilities');
const modelPreferences = require('./model-preferences');

function runModelsList() {
  return {
    models: modelCapabilities.allModels().map((name) => ({ name, ...modelCapabilities.capabilitiesFor(name) })),
  };
}

function runModelsCheck(opts) {
  const env = opts.env || resolveEnv();
  const skoposRoot = opts.skoposRoot;
  const loaded = configLib.loadConfig(env, skoposRoot);
  const plan = buildManifest(skoposRoot, loaded.config, env);

  const results = [];
  for (const targetName of plan.targets) {
    for (const agent of plan.agents) {
      results.push({ target: targetName, ...modelAdvisor.assessForTarget(agent, targetName, loaded.config) });
    }
  }

  // The user's own agents get advisories too, but they are informational in a
  // different sense: skopos neither resolves nor changes their model.
  const found = discovery.discoverUserAgents(env, {
    targets: plan.targets, config: loaded.config, lock: lockLib.readLock(env),
    planAgentNames: plan.agents.map((a) => a.name),
  });
  const userAdvisories = modelAdvisor.adviseUserAgents(found.agents);

  return {
    targets: plan.targets,
    results,
    userAgents: found.agents.map((a) => ({ name: a.name, model: a.model, tools: a.tools, origin: a.origin })),
    userAdvisories,
    warnings: results.flatMap((r) => r.warnings.map((w) => `[${r.target}] ${w}`)),
  };
}

// Preference signal for one agent (or every agent), for use when delegating
// work — informational guidance, not a routing directive.
function runModelsSignal(opts) {
  const env = opts.env || resolveEnv();
  const skoposRoot = opts.skoposRoot;
  const family = opts.family || 'claude';
  const loaded = configLib.loadConfig(env, skoposRoot);
  const plan = buildManifest(skoposRoot, loaded.config, env);

  const agents = opts.agentName
    ? plan.agents.filter((a) => a.name === opts.agentName)
    : plan.agents;
  if (opts.agentName && !agents.length) {
    throw new Error(`no agent named '${opts.agentName}' in the current plan (known: ${plan.agents.map((a) => a.name).join(', ') || 'none'})`);
  }

  return { family, signals: agents.map((a) => modelPreferences.signalForAgent(a, family)) };
}

// Full agent x model compatibility matrix, independent of current config —
// the reference data behind docs/model-capabilities.md.
function runModelsMatrix(opts) {
  const env = opts.env || resolveEnv();
  const skoposRoot = opts.skoposRoot;
  const loaded = configLib.loadConfig(env, skoposRoot);
  const plan = buildManifest(skoposRoot, loaded.config, env);
  return { models: modelCapabilities.allModels(), matrix: modelAdvisor.compatibilityMatrix(plan) };
}

// ---------------------------------------------------------------------------
// system-of-record (sor)

const { SorOrchestrator, SorError } = require('./sor');
const { storeCredential, clearCredential, listCredentials, readCredentials, SorError: SecretError } = require('./secrets');

async function runSorAuth(opts) {
  const { env = resolveEnv(), action, system, value } = opts;
  const loaded = configLib.loadConfig(env, opts.skoposRoot);

  if (action === 'set') {
    if (value) {
      // Value provided (from env, etc)
      storeCredential(env, system, value);
      return { ok: true, system, stored: true };
    }
    // Interactive: read from TTY
    return { ok: true, system, needsInteractive: true };
  }

  if (action === 'clear') {
    clearCredential(env, system);
    return { ok: true, system, cleared: true };
  }

  if (action === 'list') {
    const creds = listCredentials(env);
    return { ok: true, credentials: creds };
  }

  throw new Error(`Unknown auth action: ${action}`);
}

async function runSorTest(opts) {
  const { env = resolveEnv(), system } = opts;
  const loaded = configLib.loadConfig(env, opts.skoposRoot);

  const sor = new SorOrchestrator(loaded.config, env, {
    fetchImpl: opts.fetchImpl || fetch,
    log: opts.log,
  });

  try {
    const result = await sor.test(system);
    return result;
  } catch (e) {
    if (e instanceof SorError) {
      return { ok: false, code: e.code, message: e.message, remedy: e.remedy };
    }
    throw e;
  }
}

async function runSorPublish(opts) {
  const { env = resolveEnv(), system, target, kind, feature, file, dryRun = false } = opts;
  const loaded = configLib.loadConfig(env, opts.skoposRoot);

  const sor = new SorOrchestrator(loaded.config, env, {
    fetchImpl: opts.fetchImpl || fetch,
    log: opts.log,
  });

  try {
    const body = readText(file);
    const artifact = { kind, slug: feature, name: `${feature}--${kind}.md`, body, meta: {} };

    const result = await sor.publish(system || loaded.config.systemOfRecord?.default, target, artifact, { dryRun });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof SorError) {
      return { ok: false, code: e.code, message: e.message, remedy: e.remedy };
    }
    throw e;
  }
}

async function runSorList(opts) {
  const { env = resolveEnv(), system, target, kind } = opts;
  const loaded = configLib.loadConfig(env, opts.skoposRoot);

  const sor = new SorOrchestrator(loaded.config, env, {
    fetchImpl: opts.fetchImpl || fetch,
    log: opts.log,
  });

  try {
    const artifacts = await sor.list(system || loaded.config.systemOfRecord?.default, target, { kind });
    return { ok: true, artifacts };
  } catch (e) {
    if (e instanceof SorError) {
      return { ok: false, code: e.code, message: e.message, remedy: e.remedy };
    }
    throw e;
  }
}

async function runSorRead(opts) {
  const { env = resolveEnv(), system, target, remoteId } = opts;
  const loaded = configLib.loadConfig(env, opts.skoposRoot);

  const sor = new SorOrchestrator(loaded.config, env, {
    fetchImpl: opts.fetchImpl || fetch,
    log: opts.log,
  });

  try {
    const result = await sor.read(system || loaded.config.systemOfRecord?.default, target, remoteId);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof SorError) {
      return { ok: false, code: e.code, message: e.message, remedy: e.remedy };
    }
    throw e;
  }
}

module.exports = {
  SKOPOS_VERSION,
  runInstall, runVerify, runUninstall, runStatus, runSourcesSync,
  runAgentsList, runAgentsShow, runAgentsAdopt, runAgentsIgnore,
  runModelsList, runModelsCheck, runModelsSignal, runModelsMatrix,
  runSorAuth, runSorTest, runSorPublish, runSorList, runSorRead,
};
