'use strict';

const { path, exists } = require('../lib/util');
const frontmatter = require('../lib/frontmatter');

// Copilot CLI adapter — pure frontmatter/path translation.
//
// agents       → ~/.copilot/agents/<name>.agent.md  (tools: kept; model resolved
//                via models.copilot or stripped when the tier has no mapping)
// instructions → fenced SKOPOS:MANAGED block in ~/.copilot/copilot-instructions.md
//                (R3: verified against the Copilot CLI docs — the CLI reads
//                $HOME/.copilot/copilot-instructions.md as its global file)
// skills       → native home is ~/.agents/skills; compat links land in ~/.copilot/skills

const GLOBAL_INSTRUCTIONS_FILE = 'copilot-instructions.md';

function resolveModel(agent, config) {
  const models = config.models || {};
  const perAgent = (models.agents || {})[agent.name];
  if (perAgent) return perAgent;
  const tier = agent.data.model;
  const map = models.copilot || {};
  // No mapping → strip the key entirely and let Copilot use its default.
  return map[tier] || undefined;
}

module.exports = {
  name: 'copilot',

  detect(env) {
    return exists(env.copilotDir);
  },

  instructionsFile(env) {
    return path.join(env.copilotDir, GLOBAL_INSTRUCTIONS_FILE);
  },

  agentDest(env, agent) {
    return path.join(env.copilotDir, 'agents', `${agent.name}.agent.md`);
  },

  renderAgent(agent, config) {
    const data = {
      name: agent.name,
      description: agent.data.description,
      model: resolveModel(agent, config),
      tools: agent.data.tools,
    };
    return frontmatter.serialize(data, agent.body);
  },

  skillLinkDir(env) {
    return path.join(env.copilotDir, 'skills');
  },
};
