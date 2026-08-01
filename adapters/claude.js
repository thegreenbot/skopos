'use strict';

const { path, exists } = require('../lib/util');
const frontmatter = require('../lib/frontmatter');

// Claude Code adapter — pure frontmatter/path translation.
//
// agents       → ~/.claude/agents/<name>.md   (model tier resolved, tools: dropped —
//                Claude Code subagents inherit tools unless restricted)
// instructions → fenced SKOPOS:MANAGED block in ~/.claude/CLAUDE.md
// skills       → native home is ~/.agents/skills; compat links land in ~/.claude/skills

function resolveModel(agent, config) {
  const models = config.models || {};
  const perAgent = (models.agents || {})[agent.name];
  if (perAgent) return perAgent;
  const tier = agent.data.model; // 'smart' | 'fast' | literal model name
  const map = models.claude || {};
  return map[tier] || tier || undefined;
}

module.exports = {
  name: 'claude',

  detect(env) {
    return exists(env.claudeDir);
  },

  instructionsFile(env) {
    return path.join(env.claudeDir, 'CLAUDE.md');
  },

  agentDest(env, agent) {
    return path.join(env.claudeDir, 'agents', `${agent.name}.md`);
  },

  renderAgent(agent, config) {
    const data = {
      name: agent.name,
      description: agent.data.description,
      model: resolveModel(agent, config),
    };
    return frontmatter.serialize(data, agent.body);
  },

  // Where compat skill links should land when this tool can't read ~/.agents/skills.
  skillLinkDir(env) {
    return path.join(env.claudeDir, 'skills');
  },
};
