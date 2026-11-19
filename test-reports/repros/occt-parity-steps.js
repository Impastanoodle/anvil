// lane QP (2026-11-19): one fuzz stack, feature by feature: Anvil's volume and OpenCascade's after each feature (the
// model cut after it), so the first feature where the two engines part is plain.
//   node test-reports/repros/occt-parity-steps.js plate 6142
'use strict';
const fs = require('fs'), path = require('path');
const here = path.resolve(__dirname, '../..');
const g = require(path.join(here, 'anvil/headless/load.js')).load({ occt: true });
const K = g.Kernel, X = g.Exchange, OK = g.OcctKernel;
const src = fs.readFileSync(path.join(here, 'anvil/tests/kernel/rfON.js'), 'utf8');
const fuzz = new Function(src.slice(src.indexOf('// rfON-TABLE-BEGIN'), src.indexOf('// rfON-TABLE-END')) + '\nreturn rfONfuzz;')();
const kind = process.argv[2], seed = +process.argv[3], c = fuzz(kind, seed);
let m = K.newModel('P');
if (c.base) {
  K.runScript(m, c.base); const b0 = K.rebuild(m), st = X.exportSTEP(m, b0);
  m = X.newPartFromImport(X.importFile('b.step', st, { units: 'in' }));
  m.features.forEach((f) => { if (f.type === 'import' && !f.brep) f.brep = { format: 'step', text: st }; });
}
K.runScript(m, c.code);
console.log(c.code);
(async () => {
  const { oc } = await require(path.join(here, 'anvil/headless/occt.js')).loadOpenCascade({});
  for (let n = 1; n <= m.features.length; n++) {
    const f = m.features[n - 1];
    if (f.type === 'sketch') continue;
    const mm = JSON.parse(JSON.stringify(m)); mm.features = mm.features.slice(0, n);
    const b = K.rebuild(mm), av = b.body ? K.massProps(K.meshFromBody(b.body), 1).volume : null;
    const errs = b.errors || {};
    mm.features.forEach((q) => { if (errs[q.id] && K.isRefusal(errs[q.id])) q.suppressed = true; });
    const o = OK.build(oc, K, mm);
    console.log(n, f.id, f.type, 'anvil', av, errs[f.id] ? '(' + String(errs[f.id]).slice(0, 60) + ')' : '', 'occt', o.volume, o.valid ? '' : 'NOT VALID', o.status[f.id] !== 'ok' ? o.status[f.id] : '', 'rel', av ? ((o.volume - av) / av).toExponential(2) : '-');
  }
})();
