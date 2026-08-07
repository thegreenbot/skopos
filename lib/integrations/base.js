const crypto = require('crypto');
const { SorError, CODES, redact, registerSecret } = require('../secrets');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildArtifactName(opts) {
  const { prefix = 'skopos--', feature, kind, version } = opts;
  const verStr = String(version || 0).padStart(3, '0');
  return `${prefix}${feature}--${kind}--v${verStr}.md`;
}

function parseArtifactName(filename) {
  const match = filename.match(
    /^(?<prefix>.+?)--(?<feature>[a-z0-9-]+)--(?<kind>charter|interview-.+?)--v(?<version>\d{3,})\.md$/
  );
  if (!match) return null;

  return {
    prefix: match.groups.prefix,
    feature: match.groups.feature,
    kind: match.groups.kind,
    version: parseInt(match.groups.version, 10),
  };
}

async function withRetry(fn, { attempts = 3, log } = {}) {
  let lastErr;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;

      if (!(e instanceof SorError) || !e.retryable || i === attempts - 1) {
        throw e;
      }

      const backoff = e.retryAfterMs ?? Math.min(8000, 400 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
      log?.(`retry ${i + 1}/${attempts - 1} after ${backoff}ms (${e.code})`);

      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastErr;
}

/**
 * Base HTTP helper that handles common patterns:
 * - Authorization header
 * - JSON request/response
 * - Error mapping
 * - Redaction
 */
async function httpJson(fetchImpl, opts = {}) {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    auth,
    timeout = 30000,
    redirect = 'follow',
  } = opts;

  const allHeaders = { ...headers };

  if (auth) {
    allHeaders.Authorization = auth;
  }

  const fetchOpts = {
    method,
    headers: allHeaders,
    redirect,
    signal: AbortSignal.timeout(timeout),
  };

  if (body) {
    if (typeof body === 'object') {
      fetchOpts.body = JSON.stringify(body);
      allHeaders['Content-Type'] = 'application/json';
    } else {
      fetchOpts.body = body;
    }
  }

  let res;
  try {
    res = await fetchImpl(url, fetchOpts);
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED') {
      throw new SorError('NETWORK', `Cannot reach ${new URL(url).hostname}: ${e.message}`);
    }
    if (e.name === 'AbortError') {
      throw new SorError('NETWORK', `Request timeout after ${timeout}ms`);
    }
    throw new SorError('NETWORK', `Network error: ${redact(e.message)}`);
  }

  let data;
  const contentType = res.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
  } catch (e) {
    throw new SorError('SERVER', `Failed to parse response: ${e.message}`);
  }

  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    data,
    body: typeof data === 'string' ? data : JSON.stringify(data),
  };
}

module.exports = {
  SorError,
  CODES,
  sha256,
  buildArtifactName,
  parseArtifactName,
  withRetry,
  httpJson,
  redact,
  registerSecret,
};
