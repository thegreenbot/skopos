# Phase 1 Technical Specification — System-of-Record Configuration
**Issue:** [thegreenbot/skopos#16](https://github.com/thegreenbot/skopos/issues/16) · **Scope:** configuration during `skopos-setup`, plus the integration layer Phase 2 will call.

## 0. Constraints inherited from the codebase (read this first)

Five facts from the existing code that shape every decision below:

| Fact | Source | Consequence |
|---|---|---|
| **Zero runtime dependencies.** `package.json` has no `dependencies` key at all; `engines.node: ">=18"`. | `/home/user/skopos/package.json` | Use global `fetch`, `FormData`, `Blob` (all global in Node 18+). No axios, no jira-client, no dotenv. Tests use `node --test`. |
| **`catalog/` is content, not code.** `collectRoot()` only reads `skills/`, `agents/`, `templates/`, `instructions/`. | `/home/user/skopos/lib/manifest.js` | A file at `catalog/integrations/jira.js` **is never installed and never loaded**. The issue's proposed path is dead on arrival without a manifest change. See §6 for the resolution. |
| **The CLI owns plumbing; skills own judgement.** "you write exactly one file, `~/.skopos/config.json`". | `/home/user/skopos/catalog/skills/skopos-setup/SKILL.md`, `/home/user/skopos/skopos` header comment | HTTP calls, credential storage, and retry belong in `lib/`, exposed as `skopos sor …` subcommands. The skill *asks questions* and *shells out to verify*; it never makes an API call itself. |
| **Config merge is deep for objects, by-`name` for named arrays.** | `merge()` in `/home/user/skopos/lib/config.js` | `systemOfRecord` must be an **object map**, not an array, so an enterprise `config.defaults.json` can supply `baseUrl`/`project` and the user's layer supplies only auth. Arrays would be replaced wholesale. |
| **`saveConfig` writes world-readable JSON** (`writeText` → default 0644) and `runUninstall` deletes `backup/` and `sources/` under `skoposHome` but preserves everything else. | `/home/user/skopos/lib/config.js`, `/home/user/skopos/lib/commands.js` | Credentials cannot live in `config.json`. A sibling `~/.skopos/credentials.json` at 0600 survives uninstall — document that, and add `skopos sor auth clear`. |

---

## 1. Config schema

### 1.1 Shape

Added to `builtinDefaults()` in `/home/user/skopos/lib/config.js`:

```js
systemOfRecord: {
  enabled: false,
  default: null,
  publish: {
    interviews: true,
    charter: true,
    onFailure: 'warn',        // 'warn' | 'fail'
    includeCommitSha: true,
  },
  systems: {},
}
```

A fully configured user layer (`~/.skopos/config.json`):

```json
{
  "version": 1,
  "systemOfRecord": {
    "enabled": true,
    "default": "jira",
    "publish": { "interviews": true, "charter": true, "onFailure": "warn", "includeCommitSha": true },
    "systems": {
      "jira": {
        "kind": "jira",
        "enabled": true,
        "baseUrl": "https://acme.atlassian.net",
        "apiVersion": 3,
        "project": "FEAT",
        "auth": {
          "mode": "apiToken",
          "username": "will@acme.example",
          "tokenEnv": "SKOPOS_JIRA_TOKEN"
        },
        "artifactStorage": {
          "mode": "attachment",
          "namePrefix": "skopos--",
          "retain": 5
        },
        "index": { "mode": "issueProperty", "key": "skopos" }
      },
      "gh": {
        "kind": "github",
        "enabled": true,
        "baseUrl": "https://api.github.com",
        "repo": "thegreenbot/skopos",
        "auth": { "mode": "bearer", "tokenRef": "gh" },
        "artifactStorage": { "mode": "comment", "namePrefix": "skopos--" },
        "index": { "mode": "comment", "key": "skopos" }
      }
    }
  }
}
```

### 1.2 Deviations from the issue's sketch — and why

| Issue sketch | Spec | Rationale |
|---|---|---|
| `systemOfRecord.jira` (systems as siblings of `default`) | `systemOfRecord.systems.jira` | Reserved keys (`default`, `enabled`, `publish`) would collide with a system named `default`. Nesting lets the validator iterate `Object.entries(systems)` without a keyword denylist, and lets a user configure **two Jira instances** (`jira-cloud`, `jira-dc`). |
| `"token": ""` inside the system block | **No `token` key. Ever.** Validator hard-fails on it. | `config.json` is 0644, is shown back to the user in chat by `skopos-setup`, and is a natural thing to paste into a bug report. See §9. |
| `"artifactStorage": "attachment" \| "custom_field:<id>"` (string with embedded id) | `artifactStorage: { mode, field, … }` (object) | String-with-colon parsing is a papercut; the object also carries `namePrefix` and `retain`, which attachment mode needs and Phase 2 requires. |
| — | `kind` separate from the system's key | The key is a user-chosen label; `kind` selects the integration module. Required for multi-instance. Defaults to the key when omitted. |

### 1.3 Per-system field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | enum: `jira` \| `github` \| `mock` | no (defaults to key) | Must resolve in the integration registry. |
| `enabled` | boolean | no (default `true`) | Disabled systems are skipped, not validated for reachability. |
| `baseUrl` | string | yes | `https://` required, except `http://127.0.0.1:*` / `http://localhost:*` (test servers — see §7). No trailing slash; validator normalizes. |
| `apiVersion` | `2` \| `3` | no (default `3`) | Jira only. `2` for Server/Data Center and for plain-string description fields. |
| `project` / `repo` | string | per-kind | Jira: project key `^[A-Z][A-Z0-9_]+$`. GitHub: `owner/repo`. |
| `auth.mode` | enum: `apiToken` \| `bearer` \| `none` | yes | `oauth` reserved, rejected in Phase 1 with `not yet supported`. |
| `auth.username` | string | iff `apiToken` | Atlassian account email. |
| `auth.tokenEnv` | string | one-of | Env var name, `^[A-Z][A-Z0-9_]*$`. |
| `auth.tokenRef` | string | one-of | Key into `~/.skopos/credentials.json`. Exactly one of `tokenEnv`/`tokenRef`. |
| `artifactStorage.mode` | enum: `attachment` \| `description` \| `comment` \| `customField` | yes | Must be in the integration's `capabilities.storageModes`. |
| `artifactStorage.field` | string | iff `customField` | Jira: `^customfield_\d+$`. |
| `artifactStorage.namePrefix` | string | no (default `skopos--`) | Namespaces skopos artifacts so `list()` never touches a human's attachments. |
| `artifactStorage.retain` | integer ≥ 1 \| `"all"` | no (default `"all"`) | How many versions to keep remotely. |
| `index.mode` | enum: `issueProperty` \| `comment` \| `none` | no | Where the artifact manifest lives (§3.4). |

### 1.4 Validation rules

Implemented as `validateSystemOfRecord(config, { integrations })`, called from `validateConfig()` in `/home/user/skopos/lib/config.js`. Messages follow the existing flat-string convention (`systemOfRecord.systems.jira.baseUrl must be …`).

**R1 — default must point at an enabled, configured system.**
**R2 — enabled with no default and more than one system is ambiguous.**
**R3 — publish block validates.**
**R4 — secret literals are a hard error, wherever they appear in the subtree.**
**R5 — integration must exist, and validate its own extras.**
**R6 — capability/storage compatibility produces an actionable error.**

The **secret-leak scanner (R4)** is the single most valuable rule in the schema:

```js
const SECRETISH = /^(token|password|secret|apikey|api_key|pat|credential|authorization)$/i;

function findSecretLiterals(node, at, out = []) {
  if (Array.isArray(node)) { node.forEach((v, i) => findSecretLiterals(v, `${at}[${i}]`, out)); return out; }
  if (!isPlainObject(node)) return out;
  for (const [k, v] of Object.entries(node)) {
    if (SECRETISH.test(k) && typeof v === 'string' && v !== '') {
      out.push(`${at}.${k} must never hold a literal secret in config.json — ` +
               `use auth.tokenEnv (an env var name) or auth.tokenRef (a key in ~/.skopos/credentials.json). ` +
               `Run \`skopos sor auth set ${at.split('.')[2] || '<system>'}\` to store it safely.`);
    } else findSecretLiterals(v, `${at}.${k}`, out);
  }
  return out;
}
```

---

## 2. Integration interface

**File:** `/home/user/skopos/lib/integrations/base.js` (contract + shared helpers)
**Registry:** `/home/user/skopos/lib/integrations/index.js` — mirrors `/home/user/skopos/adapters/index.js`.

### 2.1 The module contract

```js
/**
 * @typedef {Object} Capabilities
 * @property {string[]} storageModes      Subset of attachment|description|comment|customField.
 * @property {boolean}  attachments       Can store opaque files.
 * @property {boolean}  nativeVersions    System versions artifacts itself (false for all Phase 1 systems).
 * @property {boolean}  sideMetadata      Supports out-of-band metadata (Jira issue properties).
 * @property {number}   maxArtifactBytes  Hard ceiling before PAYLOAD_TOO_LARGE.
 * @property {boolean}  markdownNative    Renders Markdown as-is in text fields.
 */

/**
 * @typedef {Object} Integration
 * @property {string} kind
 * @property {string} displayName
 * @property {Capabilities} capabilities
 * @property {(system: object, at: string) => string[]} [validateConfig]  Extra per-kind config errors.
 * @property {(question: object) => object[]} [setupQuestions]  Drives the skopos-setup interview (§4.4).
 * @property {(ctx: ClientContext) => Client} create
 */
```

### 2.2 Client methods

Every client implements exactly five methods. All are `async`; all reject with a `SorError` (§2.4).

```js
authenticate(): Promise<AuthResult>
resolveTarget(ref: string): Promise<Target>
list(target: Target, opts?: { kind?: 'interview'|'charter' }): Promise<ArtifactRef[]>
read(target: Target, remoteId: string): Promise<ArtifactDoc>
publish(target: Target, artifact: ArtifactInput, opts?: { dryRun?: boolean }): Promise<PublishResult>
```

### 2.3 Optional methods

```js
supersede(target, refs: ArtifactRef[]): Promise<void>
writeIndex(target, index: object): Promise<void>
readIndex(target): Promise<object|null>
close(): Promise<void>
```

### 2.4 Error contract

**File:** `/home/user/skopos/lib/integrations/base.js`

```js
const CODES = {
  CONFIG:            { retryable: false, fatal: true  },
  AUTH_MISSING:      { retryable: false, fatal: true  },
  AUTH_FAILED:       { retryable: false, fatal: true  },
  PERMISSION_DENIED: { retryable: false, fatal: true  },
  NOT_FOUND:         { retryable: false, fatal: true  },
  UNSUPPORTED:       { retryable: false, fatal: true  },
  PAYLOAD_TOO_LARGE: { retryable: false, fatal: true  },
  CONFLICT:          { retryable: false, fatal: false },
  RATE_LIMITED:      { retryable: true,  fatal: false },
  NETWORK:           { retryable: true,  fatal: false },
  SERVER:            { retryable: true,  fatal: false },
};

class SorError extends Error {
  constructor(code, message, opts = {}) {
    super(redact(message));
    this.name = 'SorError';
    this.code = code;
    this.system = opts.system || null;
    this.status = opts.status || null;
    this.remedy = opts.remedy || null;
    this.retryable = CODES[code].retryable;
    this.retryAfterMs = opts.retryAfterMs || null;
    this.cause = undefined;                 // deliberately dropped
  }
}
```

---

## 3. Jira integration

**File:** `/home/user/skopos/lib/integrations/jira.js`

### 3.1 Authentication

**Phase 1 supports API-token Basic auth only.** Atlassian Cloud: email + API token from `id.atlassian.com/manage-profile/security/api-tokens`.

```js
function authHeader(system, secret) {
  const { mode, username } = system.auth;
  if (mode === 'apiToken') {
    if (!username) throw new SorError('CONFIG', 'auth.username is required for apiToken mode');
    return 'Basic ' + Buffer.from(`${username}:${secret}`, 'utf8').toString('base64');
  }
  throw new SorError('UNSUPPORTED', `auth mode "${mode}" is not supported for Jira in Phase 1`, {
    remedy: 'Use mode "apiToken" (Cloud) or "bearer" (Data Center personal access token).',
  });
}
```

**Verification call** (`authenticate()`):
```
GET {baseUrl}/rest/api/3/myself
Authorization: Basic <b64>
Accept: application/json
```

### 3.2 Attachment mode — the primary path

**Upload.** Node 18 gives us multipart for free via global `FormData`/`Blob`.

```js
async function uploadAttachment(ctx, issueKey, filename, body) {
  const form = new FormData();
  form.append('file', new Blob([body], { type: 'text/markdown' }), filename);
  const res = await ctx.fetchImpl(`${base}/rest/api/${v}/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(ctx.system, ctx.secret),
      'X-Atlassian-Token': 'no-check',   // MANDATORY
      Accept: 'application/json',
    },
    body: form,
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
}
```

**Key gotcha:** `X-Atlassian-Token: no-check` is required. Without it Jira returns `403 XSRF check failed`.

### 3.3 Artifact naming, metadata, and idempotency

Filename scheme:
```
skopos--billing-export--charter--v007.md
skopos--billing-export--interview-02-tech-lead--v003.md
```

Everything else lives in **YAML frontmatter inside the Markdown**:

```yaml
---
skopos-artifact: charter
skopos-feature: billing-export
skopos-version: 7
skopos-sha256: <sha256 of body below frontmatter>
skopos-updated: 2026-08-06T10:12:00.000Z
skopos-repo: https://github.com/thegreenbot/skopos
skopos-commit: baa6302…
skopos-source: docs/skopos/features/billing-export/charter.md
---
```

**Idempotency** is a hash comparison:

```js
async function publish(target, artifact, opts) {
  const bodyHash = sha256(artifact.body);
  const existing = await this.list(target, { kind: artifact.kind });
  const mine = existing.filter((a) => a.slug === artifact.slug && a.name === artifact.name);
  const latest = mine[mine.length - 1];

  if (latest) {
    const doc = await this.read(target, latest.remoteId);
    if (doc.meta['skopos-sha256'] === bodyHash) {
      return { action: 'unchanged', remoteId: latest.remoteId, version: latest.version, ... };
    }
  }
  // ... auto-increment and upload
}
```

### 3.4 The index — bidirectional linkage

Jira **issue properties** store metadata:

```
PUT {baseUrl}/rest/api/3/issue/{key}/properties/skopos
Content-Type: application/json

{
  "version": 1,
  "repo": "https://github.com/thegreenbot/skopos",
  "feature": "billing-export",
  "sourcePath": "docs/skopos/features/billing-export",
  "updatedAt": "2026-08-06T10:12:00.000Z",
  "artifacts": {
    "charter": { "version": 7, "attachmentId": "10412", "sha256": "…" }
  }
}
```

**Fallback chain:** property fails with 403 → degrade to comment-based index.

### 3.5 Field-based modes

| Mode | Call | Note |
|---|---|---|
| `description` | `PUT /rest/api/2/issue/{key}` | Use API v2, not v3. Set `apiVersion: 2` in config. |
| `comment` | `POST /rest/api/2/issue/{key}/comment` | Version history is native; one artifact per comment. |
| `customField` | `PUT /rest/api/2/issue/{key}` | Must be a paragraph field. Probe at authenticate-time. |

All three overwrite in place, so versioning falls back to frontmatter counter.

---

## 4. `skopos-setup` interview phase

**File:** `/home/user/skopos/catalog/skills/skopos-setup/SKILL.md`

Insert as **Phase 7 — System of record**, between templates and write.

### 4.1 The gate question

```
Most teams keep the charter in the repo and that's the end of it. If your team
tracks work in Jira, GitHub Issues, or Linear, skopos can also publish the
interviews and charter there.

Do you want that?
```

**No → write `systemOfRecord: { enabled: false }`.**

### 4.2 Question sequence

1. **Which system?** Offer only `integrations.names()`.
2. **Site URL.** Sanity-check the shape only (`https://`, no path).
3. **Project / repo.** Jira: project key. GitHub: `owner/repo`.
4. **Account identity.** Atlassian account email (not a secret).
5. **Credentials.** **Never ask the user to paste a token into chat.** Instead:
   ```bash
   skopos sor auth set jira
   # or
   export SKOPOS_JIRA_TOKEN=…
   ```
6. **Where should artifacts live?** Ask only after capability probe. Offer in preference order: attachment, comment, customField, description.
7. **What to publish?** `publish.interviews` / `publish.charter` (default both true).
8. **What happens if Jira is down?** → `publish.onFailure`: `warn` (recommended) or `fail`.

### 4.3 Validation loop

Before writing config:

```bash
skopos sor test jira --json
```

Skill behaviour on outcomes: `ok: true` → proceed. `ok: true, degraded: true` → report fallback, proceed. `ok: false` → fix or skip with `enabled: false`.

---

## 5. Data flow

### 5.1 Where the target reference comes from

Resolution order, first hit wins:

1. `--target FEAT-123` on the command line.
2. `docs/skopos/features/<slug>/sor.json` — a committed, secret-free sidecar.
3. Frontmatter `ticket:` in `charter.md`.
4. Current branch name matched against `^(?<key>[A-Z]+-\d+)`.
5. Ask the user.

### 5.2 Publishing (Phase 2 calls this; Phase 1 builds it)

```bash
skopos sor publish \
  --system jira --target FEAT-123 \
  --kind charter --feature billing-export \
  --file docs/skopos/features/billing-export/charter.md \
  [--dry-run] [--json]
```

**Local-first rule:** The local artifact is written first, always, and is never rolled back because remote publish failed.

### 5.3 Artifact output — copy-paste + download (always, regardless of Jira)

**Phase 2 requirement:** `feature-interview` and `feature-charter` always provide three outputs:

1. **Local markdown file** — written to `docs/skopos/features/<slug>/` as usual
2. **Copy-paste block** — raw markdown in a fenced code block, ready to paste into any tool:
   ```markdown
   Output:
   
   Copy this to share with the next person or paste into your system-of-record:
   
   ```markdown
   ---
   skopos-artifact: interview
   skopos-feature: billing-export
   ...
   ---
   
   ## In their words
   > ...
   ```
   ```
3. **Downloadable file** — same markdown, offered as a download when running through skopos-setup or Claude Code:
   - Filename: `skopos--billing-export--interview-01-po--v001.md`
   - User can manually attach to Jira, email, Slack, or pass to next stakeholder

**Why always?** The next stakeholder may not have access to the same system-of-record. This enables asynchronous hand-offs between team members using different tools (skopos, Copilot, Gemini, etc).

### 5.4 Publishing with graceful degradation

The publish sequence attempts Jira but falls back to copy-paste + download if Jira is unavailable:

```
feature-interview writes docs/skopos/features/<slug>/interviews/NN-<role>-<name>.md
        │
        ├─ config.systemOfRecord.enabled === false ───► output copy+download, done
        │
        └─ skopos sor publish --json
                 ├─ load config + resolve secret (env > credentials file)
                 │
                 ├─ (secret missing or network down?) ──► FALLBACK: output copy+download + warn
                 ├─ resolveTarget(FEAT-123)
                 ├─ (404, permission denied?) ──────► FALLBACK: output copy+download + warn
                 │
                 ├─ list/read/upload to Jira
                 ├─ (network/403/413?) ──────────► FALLBACK: output copy+download + warn
                 │
                 └─ SUCCESS: output copy+download + "published to Jira"
```

**Key behavior:**
- Copy-paste + download are **always** produced, regardless of success or failure
- Jira publish is **optional** — if it fails, the user can still hand off to the next person
- `onFailure: warn` (default) proceeds after Jira failure; `onFailure: fail` exits 1 on publish error (but copy/download still provided)

### 5.5 Cross-tool workflow — pasting prior artifacts

**Phase 3 requirement:** `feature-interview` can accept a prior interview artifact pasted into the conversation as context:

```
User: [pastes artifact]
   ---
   skopos-artifact: interview
   skopos-feature: billing-export
   ...
   ---

Skill: [parses frontmatter, detects prior interview]
  "I see an existing interview from Jane (Product). Here's what's documented..."
  [shows summary]
  "Did you see this already, or should I repeat the context?"
```

The skill parses the frontmatter, recognizes the artifact format, and treats pasted interviews the same as ones read from Jira. This enables:
- Tech lead runs interview via skopos, downloads artifact
- Tech lead sends to PO (email, Slack, etc)
- PO pastes into Copilot
- Copilot treats it as context (reads `skopos-feature`, `skopos-artifact` type, prior assumptions)
- PO runs her interview, gets her own artifact (copy-paste + downloadable)
- Loop continues across tools

### 5.6 Mixed-source reading for feature-charter (Phase 4)

**Phase 4 requirement:** `feature-charter` reads interviews from **all sources**:

1. **Local** — `docs/skopos/features/<slug>/interviews/` (skopos-generated)
2. **Jira** — via `skopos sor read` (auto-uploaded or manually uploaded)
3. **Pasted** — frontmatter-bearing markdown in the conversation (from Copilot, manually created, etc)

The charter reconciliation logic is source-agnostic: if it has the right frontmatter (`skopos-artifact: interview`, `skopos-feature: billing-export`), it is a valid input. This enables the PO's Copilot-generated interview to be treated identically to a skopos-generated one.

### 5.7 Reading

`skopos sor read` and `skopos sor list` **ship in Phase 1** (they are 40 lines given the client already exists, and `publish` needs `list`/`read` internally for idempotency anyway). Wiring them into `feature-interview`'s opening phase is Phase 3 — the CLI surface is available early so Phase 3 is a SKILL.md change with no code.

---

## 6. Directory structure

```
/home/user/skopos/
├── lib/
│   ├── config.js                 EDIT  + systemOfRecord defaults & validation
│   ├── secrets.js                NEW   credential file read/write
│   ├── sor.js                    NEW   orchestration: config → integration → client
│   ├── commands.js               EDIT  + runSorTest/Publish/List/Read/Auth
│   └── integrations/
│       ├── index.js              NEW   registry
│       ├── base.js               NEW   SorError, CODES, withRetry, redact
│       ├── jira.js               NEW   Phase 1 primary
│       ├── github.js             NEW   Phase 1 second system
│       └── mock.js               NEW   filesystem-backed for tests
├── skopos                        EDIT  + `sor` command family
├── catalog/skills/skopos-setup/SKILL.md   EDIT  + Phase 7
├── docs/system-of-record.md      NEW   user-facing setup guide
└── test/
    ├── sor-*.test.js             NEW   config, secrets, jira, cli
    └── helpers-sor.js            NEW   fakeJira, fixtures
```

### 6.2 File locations and permissions

| Path | Mode | Survives `uninstall`? |
|---|---|---|
| `~/.skopos/config.json` | 0644 | yes (existing) |
| `~/.skopos/credentials.json` | **0600** | yes — cleared only by `skopos sor auth clear` |
| `~/.skopos/` | **0700** | — |
| `docs/skopos/features/<slug>/sor.json` | 0644 | n/a (committed) |

---

## 7. Testing strategy

### 7.1 A real HTTP server as fake Jira

`node:http` on `127.0.0.1:0`. This exercises the actual `fetch` path — multipart encoding, the 303 redirect, `Retry-After` parsing.

### 7.2 `lib/integrations/mock.js`

A filesystem-backed integration for tests and user rehearsals. Enable with `kind: "mock"`.

### 7.3 Test matrix

**`test/sor-config.test.js`** — schema validation:
- Secret literals (`token:`, `password:`) are rejected
- `default` must point at an enabled system
- `kind` must resolve in the registry
- `baseUrl` must use https (except localhost)
- Exactly one of `tokenEnv` / `tokenRef`

**`test/sor-secrets.test.js`**:
- 0644 `credentials.json` is refused
- Env var beats file
- Missing secret → `AUTH_MISSING` with remedy
- `redact()` scrubs tokens in URLs, headers, base64 blobs
- `SorError` never carries `cause`

**`test/sor-jira.test.js`** — against `fakeJira`:
- `authenticate()` 200/401/403/404 mappings
- Upload sends `X-Atlassian-Token: no-check`
- 403 `XSRF` body maps to `CONFIG`
- **Idempotency:** publish same body twice → `unchanged`, one attachment
- **Auto-increment:** publish changed body → `v002`, both attachments
- **Retention:** `retain: 2`, publish five times → two attachments
- **303 redirect:** content endpoint redirects; proves manual redirect handling
- **429:** first two 429, third 200 → succeeds in 3 attempts
- **413** → `PAYLOAD_TOO_LARGE`
- **Index fallback:** property 403 → comment index, publish still `ok`
- **`--dry-run`** → zero mutations, correct predicted version

**`test/sor-cli.test.js`**:
- `skopos sor test` on a config with a literal token exits non-zero
- **The token string does not appear in stdout/stderr.** This is a release blocker.

---

## 8. Error handling and rollback

### 8.1 Governing rule

**The local artifact is written first, always, and is never rolled back because a remote publish failed.** The repo remains the source of truth; the system-of-record is a projection.

### 8.2 Failure matrix

| Failure | Code | `onFailure: warn` | `onFailure: fail` | Recovery |
|---|---|---|---|---|
| DNS/TCP/timeout | `NETWORK` | retry 3×, warn + journal | exit 1 | `skopos sor retry` |
| 429 | `RATE_LIMITED` | honour `Retry-After` ×3, warn + journal | exit 1 | `skopos sor retry` |
| 5xx | `SERVER` | retry 3×, warn + journal | exit 1 | `skopos sor retry` |
| Token missing | `AUTH_MISSING` | warn, no journal | exit 1 | `skopos sor auth set jira` |
| 401 | `AUTH_FAILED` | warn, no journal | exit 1 | rotate token, re-run `skopos sor auth set` |
| 403 on attachment create | `PERMISSION_DENIED` | warn, suggest `comment` mode | exit 1 | ask admin or re-run `skopos-setup` |
| 403 on property write | — | **degrade to comment**, publish succeeds | same (non-fatal) | none |
| 404 issue | `NOT_FOUND` | warn, no journal | exit 1 | fix `--target` |

### 8.3 The retry journal

`~/.skopos/sor-queue.json` — stores failed publishes for `skopos sor retry`. Only retryable codes journalled. Entries >30 days old are pruned.

---

## 9. Security

### 9.1 Threat model

Leak paths, in likelihood order:
1. Token typed into AI chat (preserved in transcript)
2. Token in `config.json` (echoed back by setup skill)
3. Token in error message (failed request)
4. World-readable credential file
5. Token committed to repo sidecar

Design closes each.

### 9.2 Credential storage and resolution

**`lib/secrets.js`:**

```js
function resolveSecret(env, system, systemName) {
  const auth = system.auth || {};
  
  // 1. Environment wins
  if (auth.tokenEnv) {
    const v = process.env[auth.tokenEnv];
    if (v) return v;
    throw new SorError('AUTH_MISSING', `env var ${auth.tokenEnv} not set`, { system: systemName,
      remedy: `export ${auth.tokenEnv}=… or run \`skopos sor auth set ${systemName}\`` });
  }
  
  // 2. The 0600 credential file
  if (auth.tokenRef) {
    const store = readCredentials(env);
    const entry = store.secrets?.[auth.tokenRef];
    if (entry?.value) return entry.value;
    throw new SorError('AUTH_MISSING', `credential "${auth.tokenRef}" not found`, { system: systemName,
      remedy: `Run \`skopos sor auth set ${systemName}\`.` });
  }
}
```

**Permission enforcement:**

```js
function readCredentials(env) {
  const p = path.join(env.skoposHome, 'credentials.json');
  const mode = fs.statSync(p).mode & 0o777;
  if (process.platform !== 'win32' && (mode & 0o077)) {
    throw new SorError('CONFIG', `credentials file has perms ${mode.toString(8)} (group/other readable)`,
      { remedy: `chmod 600 ${p}` });
  }
  return safeJson(readText(p)) || { version: 1, secrets: {} };
}
```

**`skopos sor auth set <system>` reads from TTY with echo disabled** (never accepts token as CLI arg — visible in `ps` and shell history).

### 9.3 Redaction

```js
const SECRETISH = /^(token|password|secret|apikey|api_key|pat|credential|authorization)$/i;

function redact(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  // Redact registered values
  for (const v of registry) out = out.split(v).join('«redacted»');
  // Redact patterns
  return out
    .replace(/(Authorization\s*[:=]\s*)(Basic|Bearer)\s+\S+/gi, '$1$2 «redacted»')
    .replace(/\b(token|password|secret|apikey)(["'\s:=]+)([^\s"',}]{8,})/gi, '$1$2«redacted»')
    .replace(/([?&](token|access_token|jwt)=)[^&\s]+/gi, '$1«redacted»');
}
```

`SorError` constructor calls `redact()` unconditionally.

### 9.4 Additional rules

- Request logging: method + path + status only. Never headers or bodies. Enable via `SKOPOS_SOR_DEBUG=1`.
- Jira media redirect `Location` header is itself a bearer credential (signed URL). Redact before logging.
- `config.json` contains no secrets by construction (validator enforces).
- `docs/skopos/features/<slug>/sor.json` is designed to be committed — holds ticket key, URLs, versions, hashes. Must never gain auth fields.
- Token rotation: `skopos sor auth set jira` overwrites in place. Test with `skopos sor test`.
- `skopos sor auth list`: prints system names, source (`env:SKOPOS_JIRA_TOKEN` / `file:jira`), `createdAt` — **never values, not even truncated.**

---

## 10. Future extension points

### 10.1 Adding a system (Phase 2's "generalize integrations")

Three edits, no core changes:
1. `lib/integrations/linear.js` implementing the five methods + `capabilities`
2. One line in `lib/integrations/index.js`
3. Tests in `test/`

Config validation, CLI verbs, retry, redaction, and failure matrix are inherited. **`skopos-setup` needs no edit** — it asks `integrations.names()` for the list and `capabilities.storageModes` for storage options.

Optional `setupQuestions()` hook lets a system contribute extra questions without the skill knowing they exist.

### 10.2 Version sync (Phase 4)

Phase 1 establishes the three primitives conflict resolution needs:
- **Monotonic version** in the filename
- **Content hash** in the frontmatter
- **`skopos-commit`** provenance field

Phase 4's comparison is then pure and deterministic. **Add `baseVersion` to `sor.json` in Phase 1 even though nothing reads it yet** — cheap now, impossible to reconstruct later.

### 10.3 Conflict-resolution hooks

Reserve, but do not implement:
- `SorError` code `CONFLICT` (already in `CODES` with `fatal: false`).
- Optional client method `publish(target, artifact, { ifVersion })`
- `--on-conflict ask|local|remote|abort` on `skopos sor publish` (only `abort` implemented in Phase 1)

### 10.4 Source-distributed integrations

The safe version of `catalog/integrations/`: gate loading on **both** `config.catalog.integrations` **and** a new explicit `compat.allowSourceCode: false` default. Loading executable code from a synced URL is a different trust posture and should require an affirmative opt-in. Recommend deferring past Phase 4.

---

## 11. Cross-tool workflow example

**Day 1 — Tech Lead (using skopos)**

```bash
skopos-setup          # configure Jira
feature-interview     # interview tech lead
# Output:
#   - docs/skopos/features/billing-export/interviews/01-tech-lead.md (local)
#   - Copy-paste block: raw markdown in chat
#   - Download link: billing-export-interview-01-tech-lead-v001.md
#   - Auto-published to Jira ticket FEAT-123
```

Tech lead sends downloaded file to PO via Slack.

**Day 2 — PO (using Microsoft Copilot in browser)**

PO pastes the interview artifact into Copilot chat:
```
Here's the tech lead's interview on the billing export feature:

---
skopos-artifact: interview
skopos-feature: billing-export
...
---

Now please conduct your interview as the Product Owner...
```

Copilot-based feature-interview skill (no skopos):
- Recognizes the artifact format (frontmatter)
- Shows: "I see a tech lead interview already conducted. Here's what's documented..."
- Asks: "Did you review this? Any conflicts with what you're seeing?"
- Runs PO's interview questions
- Outputs:
  - Copy-paste block: raw markdown in chat
  - Download link: billing-export-interview-02-po-v001.md

PO manually uploads to Jira or sends back to tech lead.

**Day 3 — Tech Lead (using skopos again)**

```bash
skopos config        # still configured with Jira
feature-charter      # reconcile all interviews
# Reads from Jira:
#   - 01-tech-lead.md (auto-uploaded day 1)
#   - 02-po.md (manually uploaded day 2)
# Reconciles both, generates charter.md, auto-publishes to Jira
```

**Key insight:** The same Markdown format works in all contexts. No format translation. No special tooling. Just copy-paste and go.

---

## Phase 1 acceptance checklist

- [x] `skopos-setup` offers system-of-record configuration including artifact storage strategy (§4)
- [x] Config validates credentials without exposing them (§4.3, §9.3)
- [x] Graceful degradation when APIs unavailable (§8.2, index fallback §3.4)
- [x] Credentials never committed (§9.2, validator rule R4 §1.4)
- [x] Markdown artifacts, system-agnostic (§3.3 frontmatter + filename scheme)
- [x] Auto-increment versioning (§3.3, invoked in Phase 2)
- [x] Tests cover Jira with a mock API (§7)
- [x] Docs updated (§6 `/home/user/skopos/docs/system-of-record.md`)
- [x] Universal artifact format enables cross-tool workflow (§5.3, §5.5, §5.6, §11)
- [x] Always offer copy-paste + download, even when Jira succeeds (§5.3)
- [x] Graceful fallback to copy-paste + download when Jira unavailable (§5.4)
- [ ] *Deferred to Phase 2:* `feature-interview` / `feature-charter` invoke `skopos sor publish`
- [ ] *Deferred to Phase 3:* Reading artifacts during interviews + pasting prior artifacts
- [ ] *Deferred to Phase 4:* `feature-charter` reading from mixed sources (local + remote + pasted)

---

## Two decisions needing human sign-off before implementation

1. **`catalog/integrations/` → `lib/integrations/`** (§6.1)
   - The issue's proposed path does not load; this is a correction.
   - Integrations are executed by the CLI, not read by AI tools.
   - Synced sources executing code is a supply-chain hole.

2. **`systemOfRecord.systems.<name>` nesting and the removal of the `token` field** (§1.2)
   - Both are breaking changes to the schema as sketched in the issue.
   - Should be reflected in issue #16 before code lands.
