'use strict';

// Fenced-region mechanics — the highest-risk code in skopos. Skopos owns only
// the SKOPOS:MANAGED block inside files the *user* owns (e.g. ~/.claude/CLAUDE.md).
// Inside the managed block, a nested SKOPOS:USER-FACTS fence survives every
// regeneration. Uninstall strips the block, never deletes the file.

const MANAGED_START = '<!-- SKOPOS:MANAGED:START -->';
const MANAGED_END = '<!-- SKOPOS:MANAGED:END -->';
const USER_FACTS_START = '<!-- SKOPOS:USER-FACTS:START -->';
const USER_FACTS_END = '<!-- SKOPOS:USER-FACTS:END -->';

const MANAGED_NOTE =
  '<!-- Managed by skopos — edits inside this block (outside USER-FACTS) are overwritten by `skopos update`. -->';

function findRegion(text, startMarker, endMarker) {
  const s = text.indexOf(startMarker);
  if (s === -1) return null;
  const e = text.indexOf(endMarker, s + startMarker.length);
  if (e === -1) return null;
  return { start: s, innerStart: s + startMarker.length, innerEnd: e, end: e + endMarker.length };
}

function hasBlock(text) {
  return findRegion(text, MANAGED_START, MANAGED_END) !== null;
}

// Inner content of the managed block (trimmed), or null when absent/malformed.
function extractBlock(text) {
  const r = findRegion(text, MANAGED_START, MANAGED_END);
  if (!r) return null;
  return text.slice(r.innerStart, r.innerEnd).trim();
}

// Inner content of the USER-FACTS fence (trimmed), or null when absent.
function extractUserFacts(text) {
  const r = findRegion(text, USER_FACTS_START, USER_FACTS_END);
  if (!r) return null;
  return text.slice(r.innerStart, r.innerEnd).trim();
}

// Wrap a rendered body (which should itself contain a USER-FACTS fence) in the
// managed markers.
function wrapBlock(body) {
  return `${MANAGED_START}\n${MANAGED_NOTE}\n\n${body.trim()}\n${MANAGED_END}`;
}

// Replace the USER-FACTS fence inside `body` with preserved content.
function substituteUserFacts(body, preserved) {
  const r = findRegion(body, USER_FACTS_START, USER_FACTS_END);
  if (!r || preserved === null) return body;
  return (
    body.slice(0, r.innerStart) + `\n${preserved}\n` + body.slice(r.innerEnd)
  );
}

// Merge a freshly rendered managed body into a file's current text.
//   existing === null      → file will be created  (action: 'created')
//   present, no block      → block appended        (action: 'appended')
//   present, block found   → block replaced, USER-FACTS carried over ('replaced')
function applyBlock(existing, body) {
  if (existing === null || existing === undefined) {
    return { text: wrapBlock(body) + '\n', action: 'created' };
  }
  const r = findRegion(existing, MANAGED_START, MANAGED_END);
  if (!r) {
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    return { text: existing + sep + wrapBlock(body) + '\n', action: 'appended' };
  }
  const preserved = extractUserFacts(existing.slice(r.innerStart, r.innerEnd));
  const merged = preserved !== null && preserved !== ''
    ? substituteUserFacts(body, preserved)
    : body;
  const text = existing.slice(0, r.start) + wrapBlock(merged) + existing.slice(r.end);
  return { text, action: 'replaced' };
}

// Remove the managed block (used by uninstall). Collapses the surrounding
// blank lines the block occupied; returns text unchanged when no block exists.
function stripBlock(text) {
  const r = findRegion(text, MANAGED_START, MANAGED_END);
  if (!r) return text;
  let before = text.slice(0, r.start);
  let after = text.slice(r.end);
  before = before.replace(/\n+$/, '\n');
  after = after.replace(/^[ \t]*\n+/, '');
  if (before === '\n') before = '';
  const out = before + after;
  return out;
}

// Block content with the USER-FACTS interior blanked out — the form that gets
// hashed for drift detection, so the user's own facts are never "drift".
function normalizeUserFacts(block) {
  if (block === null) return null;
  const r = findRegion(block, USER_FACTS_START, USER_FACTS_END);
  if (!r) return block;
  return block.slice(0, r.innerStart) + block.slice(r.innerEnd);
}

module.exports = {
  MANAGED_START, MANAGED_END, USER_FACTS_START, USER_FACTS_END,
  hasBlock, extractBlock, extractUserFacts, applyBlock, stripBlock, wrapBlock,
  normalizeUserFacts,
};
