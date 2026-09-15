'use strict';

const { path, exists, readText, writeText, safeJson } = require('./util');
const { capabilitiesFor } = require('./model-capabilities');

// JSON, not YAML: the primary writer is the onboarding interview skill (a
// machine), JSON.parse is exact and zero-dep.

function builtinDefaults() {
  return {
    version: 1,
    identity: { name: '', role: '', context: '' },
    tone: { style: '', verbosity: 'normal' },
    repos: [],
    sources: [],
    targets: {},
    // Deterministic tier → literal model resolution (see lib/model-routing.js).
    // `agents` overrides win over the per-target tier map, and take either a
    // bare model name or an object keyed by target. This layer is directive:
    // whatever it resolves is written into the rendered agent's frontmatter.
    // The advisories on top of it (capability warnings, delegation preference
    // signaling) are informational only — see docs/model-capabilities.md and
    // docs/model-routing-guide.md.
    models: {
      claude: { smart: 'opus', fast: 'sonnet' },
      copilot: { smart: 'gpt-5', fast: 'gpt-5-mini' },
      agents: {},
    },
    catalog: { skills: 'all', agents: 'all', templates: 'all' },
    compat: { skillLinks: 'auto' },
    templates: [],
    systemOfRecord: {
      enabled: false,
      default: null,
      publish: {
        interviews: true,
        charter: true,
        onFailure: 'warn',
        includeCommitSha: true,
      },
      systems: {},
    },
  };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Deep merge: `over` wins. Arrays of named objects (repos, sources) merge by
// `name` with `over` taking precedence and keeping its order first; plain
// arrays are replaced outright.
function merge(base, over) {
  if (over === undefined) return base;
  if (Array.isArray(base) && Array.isArray(over)) {
    const named = (a) => a.every((x) => isPlainObject(x) && typeof x.name === 'string');
    if (base.length && over.length && named(base) && named(over)) {
      const overNames = new Set(over.map((x) => x.name));
      return [...over, ...base.filter((x) => !overNames.has(x.name))];
    }
    return over;
  }
  if (isPlainObject(base) && isPlainObject(over)) {
    const out = Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
  }
  return over;
}

function configPath(env) {
  return path.join(env.skoposHome, 'config.json');
}

// Load layers, lowest precedence first:
//   built-in defaults < <skoposRoot>/config.defaults.json (enterprise fork) < user config
function loadConfig(env, skoposRoot) {
  const layers = [builtinDefaults()];
  const problems = [];

  const entDefaults = path.join(skoposRoot, 'config.defaults.json');
  if (exists(entDefaults)) {
    const parsed = safeJson(readText(entDefaults));
    if (parsed) layers.push(parsed);
    else problems.push(`config.defaults.json is not valid JSON: ${entDefaults}`);
  }

  const userPath = configPath(env);
  const existed = exists(userPath);
  let userConfig = null;
  if (existed) {
    userConfig = safeJson(readText(userPath));
    if (!userConfig) problems.push(`config.json is not valid JSON: ${userPath}`);
    else layers.push(userConfig);
  }

  let config = layers[0];
  for (const layer of layers.slice(1)) config = merge(config, layer);
  return { config, path: userPath, existed, problems, userConfig };
}

// Validate systemOfRecord config
function validateSystemOfRecord(config) {
  const errors = [];
  const err = (m) => errors.push(m);
  const { findSecretLiterals } = require('./secrets');

  const sor = config.systemOfRecord;
  if (!sor) return errors;

  if (typeof sor.enabled === 'boolean') {
    // OK
  } else if (sor.enabled !== undefined) {
    err('systemOfRecord.enabled must be true or false');
  }

  if (sor.default !== null && sor.default !== undefined) {
    if (typeof sor.default !== 'string') err('systemOfRecord.default must be a system name or null');
    else if (!isPlainObject(sor.systems) || !(sor.default in sor.systems)) {
      err(`systemOfRecord.default "${sor.default}" is not defined in systemOfRecord.systems`);
    } else if (sor.systems[sor.default].enabled === false) {
      err(`systemOfRecord.default "${sor.default}" points at a disabled system`);
    }
  }

  // R2 — enabled with no default and more than one system is ambiguous
  if (sor.enabled === true && isPlainObject(sor.systems)) {
    const on = Object.entries(sor.systems).filter(([, s]) => s && s.enabled !== false);
    if (!on.length) err('systemOfRecord.enabled is true but no system is enabled');
    else if (!sor.default && on.length > 1) err('systemOfRecord.default is required when more than one system is enabled');
  }

  // Publish block
  const pub = sor.publish;
  if (pub !== undefined) {
    if (!isPlainObject(pub)) {
      err('systemOfRecord.publish must be an object');
    } else {
      for (const k of ['interviews', 'charter', 'includeCommitSha']) {
        if (pub[k] !== undefined && typeof pub[k] !== 'boolean') {
          err(`systemOfRecord.publish.${k} must be true or false`);
        }
      }
      if (pub.onFailure !== undefined && !['warn', 'fail'].includes(pub.onFailure)) {
        err(`systemOfRecord.publish.onFailure must be warn|fail (got: ${pub.onFailure})`);
      }
    }
  }

  // Systems
  if (!isPlainObject(sor.systems)) {
    err('systemOfRecord.systems must be an object');
    return errors;
  }

  for (const [name, sys] of Object.entries(sor.systems)) {
    const at = `systemOfRecord.systems.${name}`;
    if (!isPlainObject(sys)) {
      err(`${at} must be an object`);
      continue;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      err(`${at}: system name must be a lowercase slug`);
    }

    // Check for secret literals — this is critical
    const secretLeaks = findSecretLiterals(sys, at);
    errors.push(...secretLeaks);

    // Basic fields
    if (!sys.kind && name) sys.kind = name;

    const integrations = require('./integrations');
    const integration = integrations.tryGet(sys.kind || name);
    if (!integration) {
      err(`${at}.kind "${sys.kind || name}" is not a known integration`);
      continue;
    }

    // Let integration validate extra fields
    if (integration.validateConfig) {
      const intErrs = integration.validateConfig(sys, at);
      errors.push(...intErrs);
    }
  }

  return errors;
}

// Inspect the `models` block. Errors are blocking; warnings are not, because an
// unregistered model name is a legitimate thing to write (custom deployments,
// preview models) — Skopos just can't advise on it.
//
// `plan.agentNames` and `plan.knownAgentNames` come from the manifest, which
// this module can't build for itself. Together they separate two cases that
// look identical from the config alone: an override naming nothing at all (a
// typo — the user's intent silently fails, so it is an error) from one naming a
// real agent that `catalog.agents` excluded (deliberate; the key is inert, so it
// is a warning). Without the plan, neither check runs.
function inspectModels(config, plan = {}) {
  const { agentNames, knownAgentNames } = plan;
  const errors = [];
  const warnings = [];
  const models = config.models;

  if (!isPlainObject(models)) {
    errors.push('models must be an object');
    return { errors, warnings };
  }

  // Required here, not at module load: the adapter registry is the one source
  // of truth for target names, but config must stay loadable on its own.
  const targets = require('../adapters').all().map((a) => a.name);
  const unregistered = (at, model) =>
    warnings.push(`${at} names '${model}', which is not in the model registry — it is written through as-is, without capability advisories`);

  for (const target of targets) {
    const map = models[target];
    if (map === undefined) continue;
    if (!isPlainObject(map)) {
      errors.push(`models.${target} must be an object mapping tiers to model names`);
      continue;
    }
    for (const [tier, model] of Object.entries(map)) {
      const at = `models.${target}.${tier}`;
      if (typeof model !== 'string' || !model) {
        errors.push(`${at} must be a model name`);
        continue;
      }
      const caps = capabilitiesFor(model);
      // Same rule as a target-keyed override: a tier map is target-scoped by
      // construction, so naming another family's model there can only ever
      // render an unusable value into that target's agent files.
      if (!caps) unregistered(at, model);
      else if (caps.family !== target) {
        errors.push(`${at} names '${model}', a ${caps.family} model — a ${target} tier must name a ${target} model`);
      }
    }
  }

  const agents = models.agents;
  if (agents === undefined) return { errors, warnings };
  if (!isPlainObject(agents)) {
    errors.push('models.agents must be an object keyed by agent name');
    return { errors, warnings };
  }

  for (const [name, override] of Object.entries(agents)) {
    const at = `models.agents.${name}`;
    if (agentNames && !agentNames.includes(name)) {
      if (knownAgentNames && knownAgentNames.includes(name)) {
        warnings.push(`${at} has no effect — agent '${name}' exists but catalog.agents excludes it from this install`);
      } else {
        errors.push(`${at} names no agent in the current plan (known: ${agentNames.join(', ') || 'none'})`);
      }
    }

    if (typeof override === 'string' && override) {
      if (!capabilitiesFor(override)) unregistered(at, override);
      continue;
    }
    if (!isPlainObject(override)) {
      errors.push(`${at} must be a model name or an object keyed by target`);
      continue;
    }

    for (const [target, model] of Object.entries(override)) {
      const atTarget = `${at}.${target}`;
      if (!targets.includes(target)) {
        errors.push(`${atTarget} is not a known target (known: ${targets.join(', ')})`);
        continue;
      }
      if (typeof model !== 'string' || !model) {
        errors.push(`${atTarget} must be a model name`);
        continue;
      }
      const caps = capabilitiesFor(model);
      if (!caps) unregistered(atTarget, model);
      else if (caps.family !== target) {
        errors.push(`${atTarget} names '${model}', a ${caps.family} model — a ${target} override must name a ${target} model`);
      }
    }
  }

  return { errors, warnings };
}

// Non-blocking advisories about an otherwise valid config. Kept separate from
// validateConfig so that function's return stays a flat list of blocking errors
// for every existing caller.
function configWarnings(config, plan = {}) {
  return inspectModels(config, plan).warnings;
}

// Validation returns a flat list of human-readable errors; empty = valid.
// `opts.agentNames` enables the checks that need the manifest plan.
function validateConfig(config, opts = {}) {
  const errors = [];
  const err = (m) => errors.push(m);

  if (config.version !== 1) err(`unsupported config version: ${JSON.stringify(config.version)} (expected 1)`);
  if (!isPlainObject(config.identity)) err('identity must be an object');
  if (!isPlainObject(config.tone)) err('tone must be an object');

  if (!Array.isArray(config.repos)) err('repos must be an array');
  else config.repos.forEach((r, i) => {
    if (!isPlainObject(r)) return err(`repos[${i}] must be an object`);
    if (!r.name) err(`repos[${i}].name is required`);
    if (!r.path) err(`repos[${i}].path is required`);
    else if (!path.isAbsolute(r.path)) err(`repos[${i}].path must be an absolute path (got: ${r.path})`);
  });

  if (!Array.isArray(config.sources)) err('sources must be an array');
  else config.sources.forEach((s, i) => {
    if (!isPlainObject(s)) return err(`sources[${i}] must be an object`);
    if (!s.name) err(`sources[${i}].name is required`);
    else if (!/^[a-z0-9][a-z0-9._-]*$/i.test(s.name)) err(`sources[${i}].name must be a simple slug (got: ${s.name})`);
    if (!s.url) err(`sources[${i}].url is required`);
  });

  if (!isPlainObject(config.targets)) err('targets must be an object');
  else for (const [k, v] of Object.entries(config.targets)) {
    if (typeof v !== 'boolean') err(`targets.${k} must be true or false`);
  }

  errors.push(...inspectModels(config, opts).errors);
  if (!isPlainObject(config.catalog)) err('catalog must be an object');
  else for (const k of ['skills', 'agents', 'templates']) {
    const v = config.catalog[k];
    if (v !== undefined && v !== 'all' && !Array.isArray(v)) err(`catalog.${k} must be "all" or an array of names`);
  }
  if (!isPlainObject(config.compat)) err('compat must be an object');
  else if (config.compat.skillLinks !== undefined && !['auto', 'always', 'never'].includes(config.compat.skillLinks)) {
    err(`compat.skillLinks must be auto|always|never (got: ${config.compat.skillLinks})`);
  }

  if (config.templates !== undefined) {
    if (!Array.isArray(config.templates)) err('templates must be an array');
    else config.templates.forEach((t, i) => {
      if (!isPlainObject(t)) return err(`templates[${i}] must be an object`);
      if (!t.name) err(`templates[${i}].name is required`);
      if (!t.content) err(`templates[${i}].content is required`);
    });
  }

  const names = new Set();
  for (const r of Array.isArray(config.repos) ? config.repos : []) {
    if (r && r.name) {
      if (names.has(r.name)) err(`duplicate repo name: ${r.name}`);
      names.add(r.name);
    }
  }

  // SystemOfRecord validation
  errors.push(...validateSystemOfRecord(config));

  return errors;
}

// Persist the *user layer* of the config (never the merged view).
function saveConfig(env, userConfig) {
  writeText(configPath(env), JSON.stringify(userConfig, null, 2) + '\n');
}

module.exports = { builtinDefaults, merge, loadConfig, validateConfig, configWarnings, saveConfig, configPath };
