'use strict';

const { fs, path, exists, readText } = require('./util');
const frontmatter = require('./frontmatter');

// Pure plan builder: config + on-disk source checkouts + built-in catalog → plan.
// No writes happen here; `sources sync` and rendering are separate steps, so a
// bare `skopos update` is deterministic and offline-safe.
//
// Precedence, highest first:
//   1. the user's own unmanaged files (handled at install time, not here)
//   2. sources, in config order
//   3. built-in catalog
// Collisions are skipped with a warning naming both origins.

function listSkillDirs(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(path.join(dir, d.name, 'SKILL.md')))
    .map((d) => ({ name: d.name, srcDir: path.join(dir, d.name) }));
}

function listMd(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
}

function parseAgent(src, origin, warnings) {
  const { data, body } = frontmatter.parse(readText(src));
  if (!data || !data.name) {
    warnings.push(`agent missing frontmatter name, skipped: ${src} (${origin})`);
    return null;
  }
  return { name: data.name, src, origin, data, body };
}

function parseTemplate(src, origin, warnings) {
  const { data, body } = frontmatter.parse(readText(src));
  if (!data || !data.name) {
    warnings.push(`template missing frontmatter name, skipped: ${src} (${origin})`);
    return null;
  }
  return { name: data.name, description: data.description || '', src, origin, body: body.trim() };
}

function selected(selection, name) {
  if (selection === undefined || selection === 'all') return true;
  return [].concat(selection).includes(name);
}

// One content root (a source checkout or the built-in catalog) contributes
// skills/, agents/, instructions/.
function collectRoot(rootDir, origin, warnings) {
  const out = { skills: [], agents: [], templates: [], instructionSections: [] };
  for (const s of listSkillDirs(path.join(rootDir, 'skills'))) {
    out.skills.push({ name: s.name, srcDir: s.srcDir, origin });
  }
  for (const src of listMd(path.join(rootDir, 'agents'))) {
    const a = parseAgent(src, origin, warnings);
    if (a) out.agents.push(a);
  }
  for (const src of listMd(path.join(rootDir, 'templates'))) {
    const t = parseTemplate(src, origin, warnings);
    if (t) out.templates.push(t);
  }
  // Sections may live in instructions/ directly (sources) or instructions/sections/
  // (the built-in catalog keeps the persona template beside a sections/ dir).
  for (const dir of [path.join(rootDir, 'instructions'), path.join(rootDir, 'instructions', 'sections')]) {
    if (!exists(dir)) continue;
    for (const src of fs.readdirSync(dir).sort()) {
      if (!src.endsWith('.md')) continue;
      if (!fs.statSync(path.join(dir, src)).isFile()) continue;
      out.instructionSections.push({
        name: src.replace(/\.md$/, ''),
        text: readText(path.join(dir, src)).trim(),
        origin,
      });
    }
  }
  return out;
}

function buildManifest(skoposRoot, config, env) {
  const warnings = [];
  const plan = {
    skills: [],
    agents: [],
    templates: [],
    instructionSections: [],
    personaTemplate: null,
    targets: [],
    // Every agent name discovered on any root, including ones `catalog.agents`
    // filtered out of `agents` above. Config validation uses the gap between the
    // two to tell a typo'd `models.agents` key (names nothing, anywhere) from a
    // deliberately narrowed catalog (names a real agent that isn't installed).
    knownAgents: [],
    warnings,
  };

  // Targets come from config only — the --target install flag writes back into
  // config before this runs, so update can never silently drop a surface.
  plan.targets = Object.entries(config.targets || {})
    .filter(([, on]) => on)
    .map(([name]) => name)
    .sort();

  // Roots in precedence order: sources first (config order), catalog last.
  const roots = [];
  for (const s of config.sources || []) {
    const dir = path.join(env.skoposHome, 'sources', s.name);
    if (exists(dir)) roots.push({ dir, origin: `source:${s.name}` });
    else warnings.push(`source '${s.name}' not synced yet — run \`skopos sources sync\``);
  }
  roots.push({ dir: path.join(skoposRoot, 'catalog'), origin: 'catalog' });

  const seenSkill = new Map();
  const seenAgent = new Map();
  const knownAgents = new Set();
  const seenTemplate = new Map();
  const seenSection = new Map();

  // User-declared templates in config.templates (filled in by the skopos-setup
  // interview for gaps the shipped defaults don't cover) take precedence over
  // every root — they were explicitly asked for, not just discovered.
  for (const t of config.templates || []) {
    if (!t || !t.name) { warnings.push('config.templates entry missing name, skipped'); continue; }
    seenTemplate.set(t.name, 'config');
    plan.templates.push({ name: t.name, description: t.description || '', origin: 'config', body: (t.content || '').trim() });
  }

  for (const root of roots) {
    const c = collectRoot(root.dir, root.origin, warnings);
    for (const s of c.skills) {
      if (root.origin === 'catalog' && !selected((config.catalog || {}).skills, s.name)) continue;
      if (seenSkill.has(s.name)) {
        warnings.push(`skill '${s.name}' from ${root.origin} skipped — already provided by ${seenSkill.get(s.name)}`);
        continue;
      }
      seenSkill.set(s.name, root.origin);
      plan.skills.push(s);
    }
    for (const a of c.agents) {
      if (!knownAgents.has(a.name)) knownAgents.add(a.name);
      if (root.origin === 'catalog' && !selected((config.catalog || {}).agents, a.name)) continue;
      if (seenAgent.has(a.name)) {
        warnings.push(`agent '${a.name}' from ${root.origin} skipped — already provided by ${seenAgent.get(a.name)}`);
        continue;
      }
      seenAgent.set(a.name, root.origin);
      plan.agents.push(a);
    }
    for (const tp of c.templates) {
      if (root.origin === 'catalog' && !selected((config.catalog || {}).templates, tp.name)) continue;
      if (seenTemplate.has(tp.name)) {
        warnings.push(`template '${tp.name}' from ${root.origin} skipped — already provided by ${seenTemplate.get(tp.name)}`);
        continue;
      }
      seenTemplate.set(tp.name, root.origin);
      plan.templates.push(tp);
    }
    for (const sec of c.instructionSections) {
      if (seenSection.has(sec.name)) {
        warnings.push(`instruction section '${sec.name}' from ${root.origin} skipped — already provided by ${seenSection.get(sec.name)}`);
        continue;
      }
      seenSection.set(sec.name, root.origin);
      plan.instructionSections.push(sec);
    }
  }

  const tmpl = path.join(skoposRoot, 'catalog', 'instructions', 'skopos-persona.md.tmpl');
  if (exists(tmpl)) plan.personaTemplate = readText(tmpl);
  else warnings.push('persona template missing from catalog/instructions/skopos-persona.md.tmpl');

  // Template file is not an instruction section; drop it if picked up.
  plan.instructionSections = plan.instructionSections.filter((s) => !s.name.endsWith('.tmpl'));

  plan.knownAgents = [...knownAgents].sort();

  return plan;
}

module.exports = { buildManifest };
