# Adapters

An adapter is a plain Node module (~50–100 lines) doing pure frontmatter/path
translation. Supporting a new tool = one file in `adapters/` + one entry in
`adapters/index.js`. No adapter ever fetches, prompts, or holds state.

## Contract

```js
module.exports = {
  name: 'claude',                    // target key in config.targets / --target
  detect(env) {},                    // is the tool present? (used on first run)
  instructionsFile(env) {},          // file that receives the fenced managed block
  agentDest(env, agent) {},          // destination for one rendered agent
  renderAgent(agent, config) {},     // universal agent → tool-native file content
  skillLinkDir(env) {},              // where compat skill links land
  resolveModel(agent, config) {},    // agent + config → the literal model name that will render
};
```

`resolveModel` is exported (not just used internally by `renderAgent`) so
`lib/model-advisor.js` can check the model an adapter will actually render
against that agent's inferred capability requirements — see
[docs/model-capabilities.md](model-capabilities.md). A new adapter should
implement it with the same "per-agent override → tier map → tier/undefined"
precedence claude/copilot use, so `skopos models check`/`matrix` cover it too.

`env` carries the resolved roots (`claudeDir`, `copilotDir`, `agentsDir`,
`skoposHome`) — always env-overridable, never hardcode a home path.

## What each adapter does today

| | claude | copilot |
|---|---|---|
| agents | `~/.claude/agents/<n>.md`; `model:` tier resolved via `models.claude`; `tools:` dropped | `~/.copilot/agents/<n>.agent.md`; `tools:` kept; `model:` via `models.copilot`, stripped when unmapped |
| instructions | fenced block in `~/.claude/CLAUDE.md` | fenced block in `~/.copilot/copilot-instructions.md` (the CLI's documented global-instructions file) |
| skills | compat links in `~/.claude/skills/` | compat links in `~/.copilot/skills/` |

Skills' true home is `~/.agents/skills/` (Agent Skills standard). The compat
links exist for tools that don't read that directory yet; disable with
`compat.skillLinks: "never"` once a tool reads the standard location. On
Windows, links degrade symlink → junction → copy.

The `model:` tier resolution each adapter does here is what actually ships;
it's deterministic by design. For the informational layer built on top
(capability advisories, cross-model compatibility, delegation preference
signaling), see [docs/model-capabilities.md](model-capabilities.md) and
[docs/model-routing-guide.md](model-routing-guide.md).

## Rules for new adapters

- Translation only: no content authoring in adapters — content lives in the
  catalog/sources in universal form.
- Never write outside the tool's own root.
- The instructions file must tolerate the fence contract: skopos owns only the
  `SKOPOS:MANAGED` block, appends to existing files, and strips on uninstall.
- Universal frontmatter keys an adapter doesn't project (`summon`, future
  additions) are silently dropped, never passed through.
