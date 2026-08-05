'use strict';

const c = require('./colors');

// Box drawing characters and utilities for styled CLI output
const BOX = {
  // Double line
  DOUBLE_TOP_LEFT: '╔',
  DOUBLE_TOP_RIGHT: '╗',
  DOUBLE_BOTTOM_LEFT: '╚',
  DOUBLE_BOTTOM_RIGHT: '╝',
  DOUBLE_HORIZONTAL: '═',
  DOUBLE_VERTICAL: '║',

  // Single line
  SINGLE_TOP_LEFT: '┌',
  SINGLE_TOP_RIGHT: '┐',
  SINGLE_BOTTOM_LEFT: '└',
  SINGLE_BOTTOM_RIGHT: '┘',
  SINGLE_HORIZONTAL: '─',
  SINGLE_VERTICAL: '│',

  // Rounded
  ROUND_TOP_LEFT: '╭',
  ROUND_TOP_RIGHT: '╮',
  ROUND_BOTTOM_LEFT: '╰',
  ROUND_BOTTOM_RIGHT: '╯',

  // Thick
  THICK_TOP_LEFT: '┏',
  THICK_TOP_RIGHT: '┓',
  THICK_BOTTOM_LEFT: '┗',
  THICK_BOTTOM_RIGHT: '┛',
  THICK_HORIZONTAL: '━',
  THICK_VERTICAL: '┃',
};

function getTerminalWidth() {
  return process.stdout.columns || 80;
}

function header(title, style = 'double') {
  const width = getTerminalWidth();
  const styles = {
    double: {
      tl: BOX.DOUBLE_TOP_LEFT,
      tr: BOX.DOUBLE_TOP_RIGHT,
      h: BOX.DOUBLE_HORIZONTAL,
    },
    single: {
      tl: BOX.SINGLE_TOP_LEFT,
      tr: BOX.SINGLE_TOP_RIGHT,
      h: BOX.SINGLE_HORIZONTAL,
    },
    thick: {
      tl: BOX.THICK_TOP_LEFT,
      tr: BOX.THICK_TOP_RIGHT,
      h: BOX.THICK_HORIZONTAL,
    },
  };

  const s = styles[style] || styles.double;
  const padding = width - title.length - 4;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;

  const line = s.tl + s.h.repeat(width - 2) + s.tr;
  const titleLine = s.tl + s.h + title.padStart(width - 3 - rightPad).padEnd(width - 3) + s.h + s.tr;

  return [line, titleLine, line].join('\n');
}

function section(title, content, style = 'single') {
  const width = getTerminalWidth();
  const styles = {
    single: {
      tl: BOX.SINGLE_TOP_LEFT,
      tr: BOX.SINGLE_TOP_RIGHT,
      bl: BOX.SINGLE_BOTTOM_LEFT,
      br: BOX.SINGLE_BOTTOM_RIGHT,
      h: BOX.SINGLE_HORIZONTAL,
      v: BOX.SINGLE_VERTICAL,
    },
    round: {
      tl: BOX.ROUND_TOP_LEFT,
      tr: BOX.ROUND_TOP_RIGHT,
      bl: BOX.ROUND_BOTTOM_LEFT,
      br: BOX.ROUND_BOTTOM_RIGHT,
      h: BOX.SINGLE_HORIZONTAL,
      v: BOX.SINGLE_VERTICAL,
    },
  };

  const s = styles[style] || styles.single;
  const titleStr = title ? `${s.h} ${title} ${s.h.repeat(Math.max(0, width - title.length - 4))}` : s.h.repeat(width - 2);
  const topLine = s.tl + titleStr + s.tr;
  const bottomLine = s.bl + s.h.repeat(width - 2) + s.br;
  const emptyLine = s.v + ' '.repeat(width - 2) + s.v;

  const lines = [topLine];
  lines.push(emptyLine);
  if (Array.isArray(content)) {
    for (const line of content) {
      const wrappedLine = (typeof line === 'string' ? line : '')
        .split('\n')
        .map((l) => s.v + ' ' + l.padEnd(width - 4) + ' ' + s.v)
        .join('\n');
      lines.push(wrappedLine);
    }
  } else {
    lines.push(s.v + ' ' + String(content).padEnd(width - 4) + ' ' + s.v);
  }
  lines.push(emptyLine);
  lines.push(bottomLine);

  return lines.join('\n');
}

function divider(char = '─', width = null) {
  const w = width || getTerminalWidth();
  return char.repeat(w);
}

function progressBar(current, total, width = 20) {
  const percent = (current / total) * 100;
  const filled = Math.round((width * current) / total);
  const empty = width - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${Math.round(percent)}%`;
}

function statusLine(label, value, width = null) {
  const w = width || getTerminalWidth();
  const labelStr = `  ${label}`;
  const remaining = Math.max(0, w - labelStr.length - String(value).length - 2);
  return `${labelStr}${' '.repeat(remaining)}${value}`;
}

function keyValue(key, value, style = 'dim') {
  const padded = key.padEnd(11);
  const styledKey = style === 'dim' ? c.dim(padded) : padded;
  return `  ${styledKey}${value}`;
}

module.exports = {
  BOX,
  getTerminalWidth,
  header,
  section,
  divider,
  progressBar,
  statusLine,
  keyValue,
};
