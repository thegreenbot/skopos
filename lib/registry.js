'use strict';

// Repo-registry model + rendering. The registry is the promoted form of the
// hand-rolled env-var registry in jira-ticket-refiner: literal absolute paths
// in config, rendered as a table plus a generalized scout fan-out rule inside
// the persona block.

function renderRegistryTable(repos) {
  if (!repos || !repos.length) {
    return '_No repositories registered yet — run the `skopos-setup` interview to add them._';
  }
  const lines = [
    '| Repo | Path | Description |',
    '|------|------|-------------|',
  ];
  for (const r of repos) {
    const desc = [r.description || '', r.remote ? `(${r.remote})` : ''].filter(Boolean).join(' ');
    lines.push(`| ${r.name} | \`${r.path}\` | ${desc} |`);
  }
  return lines.join('\n');
}

function renderFanOutRule(repos) {
  if (!repos || !repos.length) return '';
  return [
    'When a task may span repositories, do not guess from memory: summon one',
    '`scout` per relevant registry entry **in parallel**, each with a targeted',
    'question and the repo path from the table above. Synthesize the scout',
    'reports before planning or acting.',
  ].join('\n');
}

function renderRegistrySection(config) {
  const repos = config.repos || [];
  const parts = ['## Repository registry', '', renderRegistryTable(repos)];
  const rule = renderFanOutRule(repos);
  if (rule) parts.push('', rule);
  return parts.join('\n');
}

module.exports = { renderRegistryTable, renderFanOutRule, renderRegistrySection };
