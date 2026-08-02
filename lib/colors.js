'use strict';

// Minimal, dependency-free ANSI helper. Disabled for NO_COLOR, dumb
// terminals, and non-TTY stdout (piping/log capture) so output stays
// plain and diffable wherever color wouldn't render correctly.
const enabled = !!process.stdout.isTTY
  && !process.env.NO_COLOR
  && process.env.TERM !== 'dumb';

function wrap(code) {
  return (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
}

module.exports = {
  enabled,
  bold: wrap('1'),
  dim: wrap('2'),
  green: wrap('32'),
  yellow: wrap('33'),
  red: wrap('31'),
  cyan: wrap('36'),
  boldGreen: wrap('1;32'),
  boldYellow: wrap('1;33'),
  boldRed: wrap('1;31'),
};
