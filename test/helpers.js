'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const skoposRoot = path.join(__dirname, '..');

// A sandbox = one temp dir holding every skopos root, so the full lifecycle
// runs without touching the real home directory.
function makeSandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skopos-test-'));
  const env = {
    home: dir,
    skoposHome: path.join(dir, '.skopos'),
    agentsDir: path.join(dir, '.agents'),
    claudeDir: path.join(dir, '.claude'),
    copilotDir: path.join(dir, '.copilot'),
  };
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, env };
}

function writeConfig(env, config) {
  fs.mkdirSync(env.skoposHome, { recursive: true });
  fs.writeFileSync(path.join(env.skoposHome, 'config.json'), JSON.stringify(config, null, 2));
}

function baseConfig(overrides) {
  return Object.assign({
    version: 1,
    identity: { name: 'Test User', role: 'Engineer' },
    targets: { claude: true },
  }, overrides);
}

// Run the real CLI in a child process (for exit-code assertions).
function runCli(env, args) {
  const childEnv = Object.assign({}, process.env, {
    SKOPOS_HOME: env.skoposHome,
    SKOPOS_AGENTS_DIR: env.agentsDir,
    SKOPOS_CLAUDE_DIR: env.claudeDir,
    SKOPOS_COPILOT_DIR: env.copilotDir,
  });
  try {
    const stdout = execFileSync(process.execPath, [path.join(skoposRoot, 'skopos'), ...args], {
      env: childEnv, encoding: 'utf8',
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout || '') + (e.stderr || '') };
  }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }

module.exports = { skoposRoot, makeSandbox, writeConfig, baseConfig, runCli, read, write, fs, path };
