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

const SKOPOS_VERSION = require('../package.json').version;

// ---------------------------------------------------------------------------
// helpers

function backupDir(env) { return path.join(env.skoposHome, 'backup'); }
function backupManifestPath(env) { return path.join(backupDir(env), 'manifest.json'); }

function relToRoot(env, root, absFile) {
  return lockLib.makeRef(root, path.relative(lockLib.rootDir(env, root), absFile));
}

// Skopos never touches files it doesn't manage; anything else found in a
// tool's agents dir is the user's own and is surfaced, not pruned.
function detectPreexisting(env, targets, managedRefs) {
  const out = [];
  for (const t of targets) {
    const adapter = adapters.get(t);
    const dir = path.dirname(adapter.agentDest(env, { name: 'x' }));
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const ref = relToRoot(env, t, path.join(dir, f));
      if (!managedRefs.has(ref)) out.push(ref);
    }
  }
  return out;
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
      writeManagedFile(t, adapter.agentDest(env, a), adapter.renderAgent(a, config));
    }

    const body = renderInstructionsBody(plan, config);
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
    preexisting: detectPreexisting(env, targets, new Set(Object.keys(managed))),
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

function runStatus(opts) {
  const env = opts.env || resolveEnv();
  const skoposRoot = opts.skoposRoot;
  const lock = lockLib.readLock(env);
  const loaded = configLib.loadConfig(env, skoposRoot);
  const plan = buildManifest(skoposRoot, loaded.config, env);

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
    warnings: plan.warnings,
    drift,
    preexisting: lock ? detectPreexisting(env, lock.targets || [], new Set(Object.keys(lock.managed || {}))) : [],
  };
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
  return { targets: plan.targets, results, warnings: results.flatMap((r) => r.warnings.map((w) => `[${r.target}] ${w}`)) };
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
  runModelsList, runModelsCheck,
  runSorAuth, runSorTest, runSorPublish, runSorList, runSorRead,
};
