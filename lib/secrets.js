const fs = require('fs');
const path = require('path');
const { readText, writeText, exists } = require('./util');

const SECRETISH = /^(token|password|secret|apikey|api_key|pat|credential|authorization)$/i;

class SorError extends Error {
  constructor(code, message, opts = {}) {
    super(redact(message));
    this.name = 'SorError';
    this.code = code;
    this.system = opts.system || null;
    this.status = opts.status || null;
    this.remedy = opts.remedy || null;
    this.retryable = CODES[code]?.retryable || false;
    this.retryAfterMs = opts.retryAfterMs || null;
    this.cause = undefined;
  }

  toUserLines() {
    return [
      `${this.system ? `[${this.system}] ` : ''}${this.code}: ${this.message}`,
      this.remedy ? `  → ${this.remedy}` : null,
    ].filter(Boolean);
  }
}

const CODES = {
  CONFIG: { retryable: false, fatal: true },
  AUTH_MISSING: { retryable: false, fatal: true },
  AUTH_FAILED: { retryable: false, fatal: true },
  PERMISSION_DENIED: { retryable: false, fatal: true },
  NOT_FOUND: { retryable: false, fatal: true },
  UNSUPPORTED: { retryable: false, fatal: true },
  PAYLOAD_TOO_LARGE: { retryable: false, fatal: true },
  CONFLICT: { retryable: false, fatal: false },
  RATE_LIMITED: { retryable: true, fatal: false },
  NETWORK: { retryable: true, fatal: false },
  SERVER: { retryable: true, fatal: false },
};

const secretRegistry = new Set();

function registerSecret(v) {
  if (v && typeof v === 'string' && v.length >= 8) {
    secretRegistry.add(v);
  }
}

function redact(s) {
  if (typeof s !== 'string') return s;
  let out = s;

  for (const v of secretRegistry) {
    out = out.split(v).join('«redacted»');
  }

  return out
    .replace(/(Authorization\s*[:=]\s*)(Basic|Bearer)\s+\S+/gi, '$1$2 «redacted»')
    .replace(/\b(token|password|secret|apikey|api_key|pat|credential)(["'\s:=]+)([^\s"',}]{8,})/gi, '$1$2«redacted»')
    .replace(/([?&](token|access_token|jwt)=)[^&\s]+/gi, '$1«redacted»');
}

function findSecretLiterals(node, at = '', out = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => findSecretLiterals(v, `${at}[${i}]`, out));
    return out;
  }

  if (typeof node !== 'object' || node === null) return out;

  for (const [k, v] of Object.entries(node)) {
    const fullPath = at ? `${at}.${k}` : k;
    if (SECRETISH.test(k) && typeof v === 'string' && v !== '') {
      out.push(
        `${fullPath} must never hold a literal secret in config.json — ` +
          `use auth.tokenEnv (an env var name) or auth.tokenRef (a key in ~/.skopos/credentials.json). ` +
          `Run \`skopos sor auth set ${fullPath.split('.')[2] || '<system>'}\` to store it safely.`
      );
    } else {
      findSecretLiterals(v, fullPath, out);
    }
  }

  return out;
}

function resolveSecret(env, system, systemName) {
  const auth = system.auth || {};
  if (auth.mode === 'none') return null;

  // 1. Environment wins
  if (auth.tokenEnv) {
    const v = process.env[auth.tokenEnv];
    if (v) {
      registerSecret(v);
      return v;
    }
    if (!auth.tokenRef) {
      throw new SorError('AUTH_MISSING', `environment variable ${auth.tokenEnv} is not set`, {
        system: systemName,
        remedy: `export ${auth.tokenEnv}=… in your shell, or run \`skopos sor auth set ${systemName}\` to store it in ~/.skopos/credentials.json instead.`,
      });
    }
  }

  // 2. The 0600 credential file
  if (auth.tokenRef) {
    const store = readCredentials(env);
    const entry = store.secrets?.[auth.tokenRef];
    if (entry?.value) {
      registerSecret(entry.value);
      return entry.value;
    }
    throw new SorError('AUTH_MISSING', `no stored credential named "${auth.tokenRef}"`, {
      system: systemName,
      remedy: `Run \`skopos sor auth set ${systemName}\`.`,
    });
  }

  throw new SorError('CONFIG', 'no credential source configured', {
    system: systemName,
    remedy: `Set auth.tokenEnv or auth.tokenRef for systemOfRecord.systems.${systemName}.`,
  });
}

function readCredentials(env) {
  const p = path.join(env.skoposHome, 'credentials.json');
  if (!exists(p)) return { version: 1, secrets: {} };

  // Permission enforcement
  const mode = fs.statSync(p).mode & 0o777;
  if (process.platform !== 'win32' && (mode & 0o077)) {
    throw new SorError('CONFIG', `credentials file has permissions ${mode.toString(8)} (group/other readable)`, {
      remedy: `Run: chmod 600 ${p}`,
    });
  }

  try {
    const json = JSON.parse(readText(p));
    return json || { version: 1, secrets: {} };
  } catch (e) {
    throw new SorError('CONFIG', `credentials.json is not valid JSON: ${e.message}`, {
      remedy: `Check ~/.skopos/credentials.json for syntax errors.`,
    });
  }
}

function writeCredentials(env, secrets) {
  const dir = env.skoposHome;
  const p = path.join(dir, 'credentials.json');

  // Ensure directory exists with secure permissions
  if (!exists(dir)) {
    fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  }

  const content = JSON.stringify({ version: 1, secrets }, null, 2);

  // Write to temp file first
  const tmp = p + '.tmp';
  writeText(tmp, content, { mode: 0o600 });

  // Atomic rename
  fs.renameSync(tmp, p);

  // Ensure permissions (in case file existed)
  fs.chmodSync(p, 0o600);
}

function storeCredential(env, systemName, value) {
  const store = readCredentials(env);
  store.secrets = store.secrets || {};
  store.secrets[systemName] = {
    value,
    createdAt: new Date().toISOString(),
  };
  writeCredentials(env, store.secrets);
  registerSecret(value);
}

function clearCredential(env, systemName) {
  const store = readCredentials(env);
  if (store.secrets?.[systemName]) {
    delete store.secrets[systemName];
    writeCredentials(env, store.secrets);
  }
}

function listCredentials(env) {
  const store = readCredentials(env);
  const entries = [];
  for (const [name, entry] of Object.entries(store.secrets || {})) {
    entries.push({
      name,
      createdAt: entry.createdAt,
      source: 'file',
    });
  }
  return entries;
}

module.exports = {
  SorError,
  CODES,
  redact,
  registerSecret,
  findSecretLiterals,
  resolveSecret,
  readCredentials,
  writeCredentials,
  storeCredential,
  clearCredential,
  listCredentials,
};
