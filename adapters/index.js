'use strict';

// Adapter registry. Supporting a new tool = one adapter file + one entry here.
//
// Adapter contract (plain module):
//   name                       — target key used in config.targets / --target
//   detect(env)                — is this tool present on the machine?
//   instructionsFile(env)      — file that receives the fenced SKOPOS:MANAGED block
//   agentsDir(env)             — dir holding this tool's sub-agents (also scanned
//                                for the user's own agents — see lib/discovery.js)
//   agentSuffix                — agent filename suffix ('.md', '.agent.md')
//   agentDest(env, agent)      — destination path for a rendered agent
//   renderAgent(agent, config) — universal agent → tool-native file content
//   skillLinkDir(env)          — where compat skill links land (skills' true home
//                                is always ~/.agents/skills)

const adapters = {
  claude: require('./claude'),
  copilot: require('./copilot'),
};

function get(name) {
  const a = adapters[name];
  if (!a) throw new Error(`unknown target: ${name} (known: ${Object.keys(adapters).join(', ')})`);
  return a;
}

function all() {
  return Object.values(adapters);
}

module.exports = { adapters, get, all };
