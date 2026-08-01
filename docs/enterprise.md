# Enterprise story

Goal: a new hire is productive in minutes, using only their enterprise's
approved skill sources.

## For the platform team

1. **Fork or mirror this repo** inside your network.
2. **Create one or more source repos** following
   [source-format.md](source-format.md) — your approved skills, agents, and
   instruction sections.
3. **Ship `config.defaults.json` in your fork's root**, pre-listing those
   sources (and any org-wide defaults):

```json
{
  "sources": [
    { "name": "acme-approved", "url": "https://ghe.example/acme/acme-skopos-source.git", "ref": "main" }
  ],
  "models": { "claude": { "smart": "opus", "fast": "sonnet" } }
}
```

`config.defaults.json` is merged **under** the user's own
`~/.skopos/config.json` at load time: users inherit the org defaults and can
override anything locally. The file lives in the fork, so updating the fork
updates the defaults.

## For the new hire

```bash
git clone <your-org-fork>/skopos.git && cd skopos
./skopos install        # renders immediately; persona flagged "not yet personalized"
```

Open your AI tool, run the **skopos-setup** interview (identity, tone, repo
registry — it only writes `~/.skopos/config.json`), then:

```bash
./skopos sources sync   # shallow-clone + SHA-pin the approved sources
./skopos update
```

## Operational properties

- **Pinning:** every synced source's SHA is recorded in
  `~/.skopos/skopos.lock`; `skopos status` shows the pins.
- **Offline-safe:** `update` never touches the network; a failed `sources
  sync` keeps the previous checkout and warns.
- **Precedence:** user files → sources (config order) → built-in catalog;
  collisions warn and skip, so an enterprise source can deliberately override
  a built-in agent (ship an `agents/scout.md` and yours wins).
- **Audit:** `skopos verify` exits 2 when any managed file or fenced block
  drifted from the lock.
- **Rollback:** first install snapshots every pre-existing file it touches;
  `skopos uninstall` restores them and strips fences.
