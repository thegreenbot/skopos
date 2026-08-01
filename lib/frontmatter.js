'use strict';

// Centralized frontmatter handling. Deliberately a small subset of YAML —
// enough for agent/skill frontmatter (scalars, inline arrays, dash lists,
// one level of nesting). Anything fancier belongs in the body, not the fence.

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseValue(raw) {
  const t = raw.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => stripQuotes(s));
  }
  return stripQuotes(t);
}

// Split a markdown document into { data, body }. Returns data: null when the
// document has no frontmatter block.
function parse(text) {
  if (!text.startsWith('---')) return { data: null, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: null, body: text };
  const fmText = text.slice(text.indexOf('\n', 0) + 1, end);
  const body = text.slice(end + 4).replace(/^(?:\r?\n)+/, '');

  const data = {};
  const lines = fmText.split(/\r?\n/).map((l) => l.replace(/\r$/, ''));
  let listKey = null;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const dashMatch = line.match(/^\s+-\s*(.+)$/);
    if (dashMatch && listKey) {
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      data[listKey].push(stripQuotes(dashMatch[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw.trim() === '') {
      // may be the head of a dash list
      listKey = key;
      data[key] = '';
    } else {
      listKey = null;
      data[key] = parseValue(raw);
    }
  }
  return { data, body };
}

function serializeValue(v) {
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (typeof v === 'boolean') return String(v);
  const s = String(v);
  // Quote when the value would otherwise be misparsed.
  if (/^[\[{]|[:#]/.test(s) && !/^[A-Za-z0-9 _.,'()\/-]+$/.test(s)) return JSON.stringify(s);
  return s;
}

// Rebuild a document from { data, body }. Key order follows the object.
function serialize(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    lines.push(`${k}: ${serializeValue(v)}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n\n${body.replace(/^\n+/, '')}`;
}

module.exports = { parse, serialize };
