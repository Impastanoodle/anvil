// Moves rfGD's TODO rows that now match SolidWorks to hard rows, in anvil/tests/kernel/rfGD.js (no SolidWorks needed).
//   node anvil/headless/anvil.js test --verbose > out.txt
//   node head-tools/sw-reference/ref2_promote.js out.txt
// differ / swbuilds rows that say "matches SolidWorks now" become same; anvilbuilds rows that say "refuses now" become
// both; a swbuilds row Anvil builds but off SolidWorks becomes differ; a gauge sweep group that matches becomes ok.
// Run it after ref2_make_test.py, which starts again from the numbers in the JSON.
'use strict';
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', '..', 'anvil', 'tests', 'kernel', 'rfGD.js');
const L = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
let t = fs.readFileSync(file, 'utf8'), same = 0, both = 0, built = 0, sweep = 0, missed = [];

function setKind(id, kind) {
  const key = id.replace(/^(hem\/jog|corner|loft|corpus) /, ''), at = t.indexOf('"id": ' + JSON.stringify(key) + ',');
  const lab = at < 0 ? t.indexOf('"id": ' + JSON.stringify(id) + ',') : at;
  if (lab < 0) { missed.push(id); return false; }
  const k = t.indexOf('"kind": "', lab), e = t.indexOf('"', k + 9);
  t = t.slice(0, k + 9) + kind + t.slice(e);
  return true;
}
L.forEach((line, i) => {
  const m = line.match(/^(?:PASS|FAIL) {2}rfGD TODO: (.+)$/);
  if (!m) return;
  const d = L[i + 1] || '', name = m[1], s = name.match(/^gauge sweep: (.+), \d+ parts$/);
  if (s) {
    if (!/matches SolidWorks now/.test(d)) return;
    const at = t.indexOf(JSON.stringify(s[1]) + ': {"ok": false');
    if (at < 0) { missed.push(name); return; }
    t = t.slice(0, at) + t.slice(at).replace('"ok": false', '"ok": true');
    sweep++;
    return;
  }
  const r = name.match(/^(\w+): (.+?)(?: \(.*\))?$/);
  if (!r) return;
  if (/matches SolidWorks now/.test(d)) { if (setKind(r[2], 'same')) same++; }
  else if (/refuses now/.test(d)) { if (setKind(r[2], 'both')) both++; }
  else if (r[1] === 'swbuilds' && /^\s*TODO (volume|bodies|bbox|flat)/.test(d)) { if (setKind(r[2], 'differ')) built++; }
});
fs.writeFileSync(file, t);
console.log(JSON.stringify({ same, both, built, sweep, missed }));
