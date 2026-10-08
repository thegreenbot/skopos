'use strict';

const { path, exists } = require('../lib/util');
const frontmatter = require('../lib/frontmatter');
const modelRouting = require('../lib/model-routing');

// Claude Code adapter — pure frontmatter/path translation.
//
// agents       → ~/.claude/agents/<name>.md   (model tier resolved, tools: dropped —
//                Claude Code subagents inherit tools unless restricted)
// instructions → fenced SKOPOS:MANAGED block in ~/.claude/CLAUDE.md
// skills       → native home is ~/.agents/skills; compat links land in ~/.claude/skills

// Per-agent override (target-aware) → models.claude.<tier> → the tier string
// itself. See lib/model-routing.js for the full order.
function resolveModel(agent, config) {
  return modelRouting.resolveModel(agent, config, 'claude', { tierFallback: true });
}

module.exports = {
  name: 'claude',
  resolveModel,

  detect(env) {
    return exists(env.claudeDir);
  },

  instructionsFile(env) {
    return path.join(env.claudeDir, 'CLAUDE.md');
  },

  // Where this tool keeps its sub-agents, and the file suffix it uses. Both are
  // needed by lib/discovery.js to find the user's *own* agents in the same dir.
  agentSuffix: '.md',

  agentsDir(env) {
    return path.join(env.claudeDir, 'agents');
  },

  agentDest(env, agent) {
    return path.join(this.agentsDir(env), `${agent.name}${this.agentSuffix}`);
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
