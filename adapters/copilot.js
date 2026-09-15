'use strict';

const { path, exists } = require('../lib/util');
const frontmatter = require('../lib/frontmatter');
const modelRouting = require('../lib/model-routing');

// Copilot CLI adapter — pure frontmatter/path translation.
//
// agents       → ~/.copilot/agents/<name>.agent.md  (tools: kept; model resolved
//                via models.copilot or stripped when the tier has no mapping)
// instructions → fenced SKOPOS:MANAGED block in ~/.copilot/copilot-instructions.md
//                (R3: verified against the Copilot CLI docs — the CLI reads
//                $HOME/.copilot/copilot-instructions.md as its global file)
// skills       → native home is ~/.agents/skills; compat links land in ~/.copilot/skills

const GLOBAL_INSTRUCTIONS_FILE = 'copilot-instructions.md';

// Per-agent override (target-aware) → models.copilot.<tier>. No mapping → strip
// the key entirely and let Copilot use its default; the tier words ('smart',
// 'fast') are not model names Copilot would recognise.
function resolveModel(agent, config) {
  return modelRouting.resolveModel(agent, config, 'copilot', { tierFallback: false });
}

module.exports = {
  name: 'copilot',
  resolveModel,

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
