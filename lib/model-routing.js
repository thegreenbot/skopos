'use strict';

// Directive model resolution — the one place that turns an agent's declared
// tier plus the user's `models` config into the literal model name an adapter
// writes into rendered agent frontmatter. Both adapters call this; they differ
// only in what happens when nothing matches (see `tierFallback`).
//
// Resolution order, highest precedence first:
//   models.agents.<name>.<target>   target-specific override
//   models.agents.<name>            string override, only when the model's
//                                   family matches the target (or the model is
//                                   unregistered — custom IDs apply everywhere)
//   models.<target>.<tier>          the per-target tier map
//   the tier string itself          claude only; copilot strips the key instead
//
// The family check is what keeps a bare `"haiku"` out of a Copilot agent file.
// Target names and `family` values share a namespace on purpose: an adapter is
// named for the model family it serves. See docs/model-routing-guide.md.

const { capabilitiesFor } = require('./model-capabilities');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Does a bare model name, written with no target in mind, apply to `target`?
// Unregistered models have no family to check, so they keep the pre-target-aware
// behaviour of applying everywhere.
function appliesToTarget(model, target) {
  const caps = capabilitiesFor(model);
  if (!caps) return true;
  return caps.family === target;
}

// The per-agent override for one target, or undefined when there is none that
// applies. Accepts both the string form and the target-keyed object form.
function resolveOverride(override, target) {
  if (!override) return undefined;
  if (typeof override === 'string') {
    return appliesToTarget(override, target) ? override : undefined;
  }
  if (isPlainObject(override)) {
    const forTarget = override[target];
    return typeof forTarget === 'string' && forTarget ? forTarget : undefined;
  }
  return undefined;
}

// Full resolution for one (agent, target) pair. `opts.tierFallback` makes the
// raw tier string the last resort instead of undefined.
function resolveModel(agent, config, target, opts = {}) {
  const models = (config && config.models) || {};
  const override = resolveOverride((models.agents || {})[agent.name], target);
  if (override) return override;

  const tier = agent.data && agent.data.model; // 'smart' | 'fast' | literal model name
  const map = models[target] || {};
  if (map[tier]) return map[tier];
  return opts.tierFallback ? tier || undefined : undefined;
}

module.exports = { resolveModel, resolveOverride, appliesToTarget };
