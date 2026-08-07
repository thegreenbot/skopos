const jira = require('./jira');
const github = require('./github');
const linear = require('./linear');
const mock = require('./mock');

const integrations = {
  jira,
  github,
  linear,
  mock,
};

function get(kind) {
  const i = integrations[kind];
  if (!i) {
    throw new Error(`unknown system-of-record kind: ${kind} (known: ${Object.keys(integrations).join(', ')})`);
  }
  return i;
}

function tryGet(kind) {
  return integrations[kind] || null;
}

function names() {
  return Object.keys(integrations);
}

module.exports = {
  integrations,
  get,
  tryGet,
  names,
  all: () => Object.values(integrations),
};
