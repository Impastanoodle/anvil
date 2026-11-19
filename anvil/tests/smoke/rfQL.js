  // ---- rfQL (local-2026-11-18b, lane sketchflow10): shop sketch jobs driven by real mouse / key events on INCH parts
  // (report test-reports/2026-11-19-sketch-flow-10.md). Uses rfPR's helpers (one eval scope).
  // select the pieces at uv points (first a plain click, the rest Ctrl+click), Add Relations, the named button
  async function rfQLRel(uvs, name) {
    UI.setTool('select'); await wait(20); UI.setSelection([]);
    for (var k = 0; k < uvs.length; k++) await rfPRClick(uvs[k], k ? { ctrlKey: true } : null);
    UI.cmdAddRelations(); await idle(); await wait(20);
    var b = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === name; })[0];
    assert(b, name + ' offered for ' + JSON.stringify(UI.App.relPick) + ': ' + Array.prototype.map.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim(); }).join('|'));
    b.click(); await idle(); await wait(20);
    if (UI.pmTitle() === 'Add Relations') { UI.pmOK(); await idle(); }
    UI.setSelection([]); await wait(10);
  }
  function rfQLErr(e, log) { return /^DBG/.test(e.message) ? e : new Error(e.message + ' || ' + log.join(' | ')); }
  function rfQLSeg(f) {
    return (f || rfPRF()).entities.map(function (e, i) { return e.t === 'line' ? i + (e.construction ? '*' : '') + '(' + [e.x1, e.y1, e.x2, e.y2].map(function (v) { return (+v).toFixed(4); }).join(',') + ')' : i + ':' + e.t; }).join(' ');
  }
  // ---------------------------------------------------------------- flow 1: a hat channel as one open chain
  step('rfQL flow 1: a hat channel on Front as one open chain of 5 lines (flange 1, web 2, top 3, web 2, flange 1) by the Line tool, Horizontal / Vertical by inference, a centerline from the origin, two Equal relations and a Symmetric from Add Relations, Smart Dimensions 1 / 2 / 3; Base Flange 10 long 16 ga: the flat equals the closed form; the top 3 -> 4 by a double-click on the part', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 8, 5, 0.5, 0.75);
      UI.setTool('line'); await wait(30);
      await rfPRClick([-2.55, 0]); await rfPRClick([-1.45, 0]); await rfPRClick([-1.45, 2.1]); await rfPRClick([1.55, 2.1]); await rfPRClick([1.55, 0]); await rfPRClick([2.6, 0]);
      await rfPREsc(2);
      UI.cmdCenterline(); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([0, 2.6]); await rfPREsc(2);
      log.push('drawn ' + rfQLSeg() + ' rels ' + rfPRRels().join(' ') + ' ' + rfPRAn().status + ' dof ' + rfPRAn().dof);
      await rfQLRel([[-2, 0], [2.1, 0]], 'Equal');
      await rfQLRel([[-1.45, 1], [1.55, 1]], 'Equal');
      await rfQLRel([[0, 1.3], [-1.45, 2.1], [1.55, 2.1]], 'Symmetric');
      log.push('related ' + rfQLSeg() + ' rels ' + rfPRRels().join(' ') + ' ' + rfPRAn().status + ' dof ' + rfPRAn().dof);
      f = rfPRF();
      await rfPRDim([[(f.entities[0].x1 + f.entities[0].x2) / 2, 0]], [-2, -0.6], '1');
      f = rfPRF(); await rfPRDim([[f.entities[1].x1, 1]], [f.entities[1].x1 - 0.6, 1], '2');
      f = rfPRF(); await rfPRDim([[0.7, f.entities[2].y1]], [0.7, f.entities[2].y1 + 0.6], '3');
      log.push('dimensioned ' + rfQLSeg() + ' ' + rfPRAn().status + ' dof ' + rfPRAn().dof);
      f = rfPRF();
      await rfQLRel([[-2.3, f.entities[0].y1], [0, 0]], 'Coincident');
      f = rfPRF();
      await rfQLRel([[0, 2.6], [-0.8, f.entities[2].y1]], 'Coincident');
      f = rfPRF();
      log.push('defined ' + rfQLSeg(f) + ' rels ' + rfPRRels(f).join(' ') + ' ' + rfPRAn().status + ' dof ' + rfPRAn().dof + ' | ' + statusText());
      assert(rfPRAn().status === 'full', 'fully defined: ' + log.join(' | '));
      // Sheet Metal > Base Flange: Blind 10, gauge table steel 16 ga
      var sid = f.id;
      UI.exitSketch(); await idle();
      UI.App.sel = { kind: 'feature', id: sid };
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Base Flange/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent); })[0];
      assert(btn, 'Base Flange on the ribbon'); btn.click(); await idle(); await wait(30);
      assert(/Base Flange/.test(UI.pmTitle()), 'the Base Flange PropertyManager: ' + UI.pmTitle());
      setInput(pmField('Depth'), '10'); await wait(20);
      if (!pmField('Use gauge table').checked) { pmField('Use gauge table').click(); await wait(30); }
      setInput(pmField('Table'), 'steel'); await wait(20);
      setInput(pmField('Gauge'), '16'); await wait(30);
      log.push('PM ' + statusText());
      await UI.pmOK(); await idle();
      var sh = UI.App.model.sheet, T = sh.thickness, R = sh.bendRadius, kf = sh.kFactor;
      log.push('sheet T ' + T + ' R ' + R + ' K ' + kf + ' ' + sh.baType + ' errors ' + JSON.stringify(UI.App.build.errors || {}));
      near(T, 0.0598, 1e-9, '16 ga');
      var BA = Math.PI / 2 * (R + kf * T), flatL = function (top) { return 2 + 4 + top - 4 * (2 * R - BA) - 2 * T * 2; };
      var fl = anvil.flat();
      log.push('flat ' + fl.size.map(function (v) { return v.toFixed(6); }).join(' x ') + ' expected ' + flatL(3).toFixed(6) + ' x 10');
      var sz = function (q) { return q.size.slice().sort(function (a, b) { return a - b; }); };
      near(sz(fl)[1], 10, 1e-9, 'the flat is 10 long');
      near(sz(fl)[0], flatL(3), 1e-9, 'the flat across the hat: 2 + 4 + 3 - 4 (2R - BA) - 4T');
      // the top 3 -> 4. A double-click on Base-Flange1 shows no dimensions for a Base Flange from an open profile (an
      // insertBends feature: ui-select.js computeHandles / ui-commands.js DIM_TYPES, other lanes' files: in the report),
      // so as a SolidWorks user then does: right-click Edit Sketch, double-click the 3, 4 Enter, exit
      var bf = UI.App.model.features.filter(function (q) { return q.sheetBase; })[0];
      assert(bf && bf.type === 'insertBends' && bf.openBase, 'an open-profile Base-Flange: ' + (bf && bf.type));
      UI.enterSketch(sid); await idle(); await wait(30);
      rfPRFrame(8, 5, 0.5, 0.75); await wait(30);
      await rfPREditDim(/^3\.0+$/, '4');
      UI.exitSketch(); await idle();      fl = anvil.flat();
      log.push('top 4: flat ' + sz(fl).map(function (v) { return v.toFixed(6); }).join(' x ') + ' errors ' + JSON.stringify(UI.App.build.errors || {}));
      near(sz(fl)[0], flatL(4), 1e-9, 'the flat after the top 3 -> 4');
      var sk = UI.App.model.features.filter(function (q) { return q.id === sid; })[0], top = sk.entities[2];
      near(top.x1, -2, 1e-9, 'the top grows both ways about the centerline'); near(top.x2, 2, 1e-9, 'its right end');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });  // ---------------------------------------------------------------- flow 2: values linked by equations
  function rfQLEqRows() { return Array.prototype.slice.call(D.querySelectorAll('#eq-table tr.eq-row')); }
  function rfQLEqRow(name) { return rfQLEqRows().filter(function (tr) { return tr.querySelector('.eq-name').value === name; })[0]; }
  async function rfQLEqOpen() {
    var rows = menuRows('Equations');
    assert(rows.length && /Tools/.test(rows[0].menu), 'Tools > Equations: ' + JSON.stringify(rows.map(function (r) { return r.menu; })));
    rows[0].row.click(); if (UI.closeMenus) UI.closeMenus(); await wait(30);
    assert(modalOpen() && $('eq-dialog'), 'the Equations dialog');
  }
  async function rfQLEqOK() { $('eq-ok').click(); await anvil.idle(); await idle(); await wait(30); }
  function rfQLDims(f) {
    f = f || rfPRF();
    return UI.sketchDimItems(f).map(function (it) { var d = it.d, v = it.kind === 'rel' ? d.v : K.dimValue(f.entities[d.e], d); return UI.sketchDimShortName(f, d) + '=' + (+v).toFixed(4) + (d.expr ? '[' + d.expr + ']' : ''); }).join(' ');
  }
  step('rfQL flow 2: Tools > Equations W = 6, H = 4; a rectangle dimensioned =W and =H/2, a hole patterned by Linear Sketch Pattern with spacing =W/4; W 6 -> 8 in the dialog: everything follows; W renamed WIDTH: the dimensions still follow; WIDTH deleted: the dimensions that used it are equation errors, none silently becomes a number', async function () {
    var log = [];
    try {
      await rfPRPart();
      await rfQLEqOpen();
      for (var k = 0; k < 2; k++) {
        $('eq-add').click(); await wait(20);
        var tr = rfQLEqRows()[rfQLEqRows().length - 1];
        setInput(tr.querySelector('.eq-name'), k ? 'H' : 'W'); setInput(tr.querySelector('.eq-expr'), k ? '4' : '6'); await wait(20);
      }
      await rfQLEqOK();
      log.push('eqs ' + JSON.stringify(anvil.equations()));
      var f = await rfPRNew('Front', 10, 6, 0.1, 0.8, true);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([6.1, 2.1]); await rfPREsc(2);
      f = rfPRF();
      await rfPRDim([[3, 0]], [3, -0.6], '=W');
      f = rfPRF(); await rfPRDim([[f.entities[1].x1, 1]], [f.entities[1].x1 + 0.7, 1], '=H/2');
      UI.setTool('circle'); await wait(30);
      await rfPRClick([0.75, 1]); await rfPRClick([1, 1]); await rfPREsc(2);
      f = rfPRF();
      log.push('rect ' + rfQLDims(f) + ' ' + rfPREnts(f));
      var C = f.entities[4];
      await rfPRDim([[C.cx + C.r * 0.7071, C.cy + C.r * 0.7071]], [C.cx + 0.6, C.cy + 0.6], '1/2');
      C = rfPRF().entities[4]; await rfPRDim([[C.cx, C.cy], [0, 1.6]], [C.cx / 2, 1.5], '3/4');
      C = rfPRF().entities[4]; await rfPRDim([[C.cx, C.cy], [3, 0]], [0.3, C.cy / 2], '1');
      log.push('hole ' + rfQLDims() + ' ' + rfPRAn().status);
      // Linear Sketch Pattern of the hole: 4 along X, spacing =W/4
      UI.setTool('select'); await wait(20); UI.setSelection([]);
      C = rfPRF().entities[4]; await rfPRClick([C.cx + C.r, C.cy]);
      UI.cmdSketchPattern(); await wait(40);
      var fk = function (k) { return D.querySelector('#pm input[data-key="' + k + '"]'); };
      await rfPRTypePM(fk('count'), '4'); pressEnter(fk('count')); await wait(20);
      await rfPRTypePM(fk('spacing'), '=W/4'); pressEnter(fk('spacing')); await wait(20);
      log.push('PM spacing ' + fk('spacing').value + ' ' + statusText());
      rfPROK(); await idle(); await wait(50);
      f = rfPRF();
      var holes = function () { return rfPRF().entities.filter(function (e) { return e.t === 'circle' && !e.construction; }).map(function (e) { return e.cx; }).sort(function (a, b) { return a - b; }); };
      log.push('pattern ' + holes().map(function (x) { return x.toFixed(4); }).join(',') + ' ' + rfQLDims() + ' ' + rfPRAn().status);
      assert(/D6=1\.5000\[=W\/4\]/.test(rfQLDims()), 'the spacing dimension keeps =W/4: ' + rfQLDims());
      var id = rfPRF().id;
      UI.exitSketch(); await idle();
      var sk = function () { return UI.App.model.features.filter(function (q) { return q.id === id; })[0]; };
      var cx = function () { return sk().entities.filter(function (e) { return e.t === 'circle' && !e.construction; }).map(function (e) { return e.cx; }).sort(function (a, b) { return a - b; }); };
      var dimsOf = function () { return rfQLDims(sk()); };
      // W 6 -> 8 in the dialog
      await rfQLEqOpen();
      setInput(rfQLEqRow('W').querySelector('.eq-expr'), '8'); await wait(20);
      await rfQLEqOK();
      log.push('W 8: ' + dimsOf() + ' holes ' + cx().map(function (x) { return x.toFixed(4); }).join(','));
      near(sk().entities[0].x2 - sk().entities[0].x1, 8, 1e-9, 'the width follows W = 8');
      near(cx()[3] - cx()[0], 3 * 2, 1e-9, 'the spacing follows W/4 = 2');
      near(Math.abs(sk().entities[1].y2 - sk().entities[1].y1), 2, 1e-9, 'the height H/2 = 2');
      // W renamed WIDTH: the dimensions still follow
      await rfQLEqOpen();
      setInput(rfQLEqRow('W').querySelector('.eq-name'), 'WIDTH'); await wait(20);
      log.push('renamed rows ' + rfQLEqRows().map(function (r) { return r.querySelector('.eq-name').value + '=' + r.querySelector('.eq-expr').value + ' ' + r.querySelector('.eq-val').textContent; }).join('; ') + ' msg ' + ($('eq-msg') ? $('eq-msg').textContent : ''));
      await rfQLEqOK();
      log.push('renamed: ' + dimsOf() + ' errors ' + JSON.stringify(UI.App.build.errors || {}) + ' eqerr ' + JSON.stringify(UI.App.build.equationErrors || null));
      await rfQLEqOpen();
      setInput(rfQLEqRow('WIDTH').querySelector('.eq-expr'), '10'); await wait(20);
      await rfQLEqOK();
      log.push('WIDTH 10: ' + dimsOf() + ' holes ' + cx().map(function (x) { return x.toFixed(4); }).join(','));
      near(sk().entities[0].x2 - sk().entities[0].x1, 10, 1e-9, 'the width follows WIDTH = 10');
      near(cx()[3] - cx()[0], 3 * 2.5, 1e-9, 'the spacing follows WIDTH/4');
      // WIDTH deleted: the dimensions that used it are equation errors
      await rfQLEqOpen();
      rfQLEqRow('WIDTH').querySelector('.eq-del').click(); await wait(20);
      log.push('deleting: msg ' + ($('eq-msg') ? $('eq-msg').textContent : '') + ' modal ' + modalOpen());
      await rfQLEqOK();
      log.push('deleted: modal ' + modalOpen() + ' ' + dimsOf() + ' errors ' + JSON.stringify(UI.App.build.errors || {}) + ' warnings ' + JSON.stringify(UI.App.build.warnings || {}) + ' eqerr ' + JSON.stringify(UI.App.build.equationErrors || null) + ' | ' + statusText());
      // before: the sketch failed (rels.12.expr: Unknown variable "WIDTH"); now it builds, both equations are kept and
      // named as equation errors, the values stay
      assert(!Object.keys(UI.App.build.errors || {}).length, 'the sketch still builds: ' + JSON.stringify(UI.App.build.errors));
      var ee = UI.App.build.equationErrors || {};
      assert(/Unknown variable "WIDTH"/.test(ee['D1@Sketch1'] || '') && /Unknown variable "WIDTH"/.test(ee['D6@Sketch1'] || ''), 'D1 and D6 are equation errors: ' + JSON.stringify(ee));
      assert(/D1=10\.0000\[=WIDTH\]/.test(dimsOf()) && /D6=2\.5000\[=WIDTH\/4\]/.test(dimsOf()), 'equations and values kept: ' + dimsOf());
      UI.enterSketch(id); await idle(); rfPRFrame(10, 6, 0.1, 0.8); await wait(40);
      var labs = rfPRLabels();
      log.push('labels ' + labs.join(' '));
      assert(labs.some(function (x) { return /^!Σ10\.0+$/.test(x); }) && labs.some(function (x) { return /^!Σ2\.50+$/.test(x); }) && labs.some(function (x) { return /^Σ2\.0+$/.test(x); }), 'the broken equations read !Σ, H/2 still Σ: ' + labs.join(' '));
      UI.exitSketch(); await idle();
      // H 4 -> 6: the dimension still linked follows
      await rfQLEqOpen();
      setInput(rfQLEqRow('H').querySelector('.eq-expr'), '6'); await wait(20);
      await rfQLEqOK();
      near(Math.abs(sk().entities[1].y2 - sk().entities[1].y1), 3, 1e-9, 'H = 6: the height H/2 = 3');
      near(sk().entities[0].x2 - sk().entities[0].x1, 10, 1e-9, 'the width keeps 10');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- flow 3: a sketch on a flange face
  var rfQLTRAY = function (len, w) {
    return 'p.units("in");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "16" });\np.sketch("Top").rect(0, -4, ' + w + ', 4).end().baseFlange();\n' +
      'p.flange(' + len + ', [[' + (w / 2) + ', 0.0598, 0]], { position: "inside", lengthRef: "outer" });\n';
  };
  step('rfQL flow 3: on a 16 ga base 6 x 4 with an Edge Flange 2: a sketch on the flange\'s outer face, Convert Entities of its outline, Offset Entities .25 inward as construction, two straight slots dimensioned from the converted bend edge, Cut-Extrude Link to thickness; the flange 2 -> 3 and the base 6 -> 8: the cut follows, nothing dangles', async function () {
    var log = [];
    try {
      await rfPRPart();
      await anvil.run(rfQLTRAY(2, 6)); await idle();
      log.push('part ' + JSON.stringify(UI.App.build.errors || {}) + ' ' + UI.App.model.features.map(function (q) { return q.type + ':' + q.name; }).join(','));
      var fl = UI.App.model.features.filter(function (q) { return q.type === 'flange'; })[0];
      var faces = UI.App.mesh.faces.map(function (q, i) { return { i: i, n: q.normal.map(function (v) { return +v.toFixed(3); }), a: +q.area.toFixed(3), fid: UI.App.triShared[q.start] }; }).filter(function (q) { return q.fid === fl.id && q.a > 5; });
      log.push('flange faces ' + JSON.stringify(faces));
      var fo = faces.filter(function (q) { return q.n[2] < 0; })[0];
      assert(fo, 'the flange\'s outer face (normal -Z)');
      UI.App.sel = { kind: 'face', index: fo.i };
      UI.cmdSketch(); await idle(); await wait(40);
      assert(UI.App.mode === 'sketch', 'a sketch on the flange face');
      var pl = UI.activePlane(), c2 = K.to2D(pl, UI.App.mesh.faces[fo.i].centroid);
      var f = rfPRF(); f._u0 = UI.App.undo.length;
      if (rfPRGrid == null) rfPRGrid = UI.App.view.showGrid;
      UI.App.view.showGrid = false; UI.App.gridStale = true;
      // frame the face: 9 x 5 inches across the view, the face's centre at 50% / 50%
      rfPRFrame(9, 5, 0.5, 0.5); await wait(20);
      var o = UI.worldToScreen(K.to3D(pl, 0, 0)), cc = UI.worldToScreen(K.to3D(pl, c2[0], c2[1]));
      UI.panView(o[0] - cc[0], o[1] - cc[1]); UI.updateSketches(); await wait(30);
      log.push('plane centre ' + c2.map(function (v) { return v.toFixed(4); }).join(',') + ' x ' + JSON.stringify(K.to3D(pl, 1, 0).map(function (v, k) { return +(v - K.to3D(pl, 0, 0)[k]).toFixed(3); })) + ' y ' + JSON.stringify(K.to3D(pl, 0, 1).map(function (v, k) { return +(v - K.to3D(pl, 0, 0)[k]).toFixed(3); })));
      UI.cmdConvertEntities(); await wait(30);
      await rfPRClick([c2[0], c2[1]]); await wait(30);
      await UI.pmOK(); await idle();
      f = rfPRF();
      log.push('converted ' + rfQLSeg(f) + ' rels ' + rfPRRels(f).join(' ') + ' ' + rfPRAn().status + ' | ' + statusText());
      // the converted outline is reference only: its four lines picked, For construction in their PropertyManager (a
      // closed outline left solid made the cut take the whole flange face but the slots)
      UI.setTool('select'); await wait(20); UI.setSelection([]);
      var mids = f.entities.map(function (e) { return [(e.x1 + e.x2) / 2 + (Math.abs(e.y1 - e.y2) < 1e-9 ? 0.7 : 0), (e.y1 + e.y2) / 2 + (Math.abs(e.x1 - e.x2) < 1e-9 ? 0.3 : 0)]; });
      for (var q = 0; q < 4; q++) await rfPRClick(mids[q], q ? { ctrlKey: true } : null);
      var fc = pmField('For construction');
      assert(fc, 'For construction in the PropertyManager of the four lines: ' + UI.pmTitle() + ' ' + JSON.stringify(UI.selection()));
      if (!fc.checked) { fc.click(); await idle(); await wait(30); }
      UI.setSelection([]); f = rfPRF();
      log.push('construction ' + rfPREnts(f));
      assert(f.entities.slice(0, 4).every(function (e) { return e.construction; }), 'the outline is construction: ' + rfPREnts(f));
      var bendY = Math.min.apply(null, f.entities.map(function (e) { return Math.min(e.y1, e.y2); }));
      var bendI = f.entities.map(function (e, i) { return Math.abs(e.y1 - bendY) < 1e-9 && Math.abs(e.y2 - bendY) < 1e-9 ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      var edgeI = f.entities.map(function (e, i) { return Math.abs(e.x1) < 1e-9 && Math.abs(e.x2) < 1e-9 ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      // Offset Entities .25 inward of the chain, the offset as construction
      UI.setTool('select'); await wait(20); UI.setSelection([]);
      await rfPRClick([-3, 2]); await wait(30);
      UI.cmdOffsetEntities(); await wait(40);
      var ch = pmField('Select chain'); if (ch && !ch.checked) { ch.click(); await wait(30); }
      await rfPRTypePM(pmField('Offset distance'), '1/4'); await wait(30);
      pmField('Offset geometry').click(); await wait(30);
      var inside = function () { return (UI.App.tempEntities || []).length && (UI.App.tempEntities || []).every(function (e) { return e.t !== 'line' || (Math.max(e.x1, e.x2) < -0.1 && Math.min(e.y1, e.y2) > bendY + 0.1); }); };
      if (!inside()) { pmField('Reverse').click(); await wait(30); }
      await UI.pmOK(); await idle();
      f = rfPRF();
      log.push('offset ' + rfQLSeg(f) + ' ' + rfPRAn().status);
      // two straight slots, 1 between centres, .25 wide, .75 above the bend edge, 1.5 and 4.5 from the side
      var slots = [];
      for (var s = 0; s < 2; s++) {
        var x0 = s ? -4.6 : -1.6, n0 = rfPRF().entities.length;
        UI.setTool('slot'); await wait(30);
        await rfPRClick([x0 - 0.05, 1.0]); await rfPRClick([x0 + 0.95, 1.0]); await rfPRClick([x0 + 0.95, 1.12]); await rfPREsc(2);
        slots.push(n0);
      }
      f = rfPRF();
      log.push('slots ' + rfPREnts(f));
      var arcsOf = function (s) { var E = rfPRF().entities; return E.slice(slots[s], s ? E.length : slots[1]).map(function (e, k) { return e.t === 'arc' ? e : null; }).filter(Boolean).sort(function (a, b) { return b.cx - a.cx; }); };
      for (s = 0; s < 2; s++) {
        var A = arcsOf(s);
        await rfPRDim([[A[0].cx, A[0].cy], [A[1].cx, A[1].cy]], [(A[0].cx + A[1].cx) / 2, A[0].cy + 0.45], '1');
        A = arcsOf(s); await rfPRDim([[A[0].cx + A[0].r * 0.7071, A[0].cy + A[0].r * 0.7071]], [A[0].cx + 0.1, A[0].cy + 0.4], '1/8');
        A = arcsOf(s); await rfPRDim([[A[0].cx, A[0].cy], [A[0].cx + 0.3, bendY]], [A[0].cx - 0.15, (A[0].cy + bendY) / 2 + 0.05], '3/4');
        A = arcsOf(s); await rfPRDim([[A[0].cx, A[0].cy], [0, 1.3]], [A[0].cx / 2, 1.55 - s * 0.15], s ? '4.5' : '1.5');
      }
      f = rfPRF();
      log.push('slot dims ' + rfQLDims(f) + ' ' + rfPRAn().status);
      [0, 1].forEach(function (s) { var A = arcsOf(s); near(A[0].cx, s ? -4.5 : -1.5, 1e-9, 'slot ' + s + ' right centre'); near(A[1].cx, s ? -5.5 : -2.5, 1e-9, 'left centre'); near(A[0].cy, bendY + 0.75, 1e-9, '.75 above the bend edge'); near(A[0].r, 0.125, 1e-9, '.25 wide'); });
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfPRAn().status);
      // Cut-Extrude, Link to thickness
      var vol = function () { return W.Kernel.massProps(UI.App.mesh, 1).volume; };
      var sid = f.id, v0 = vol(), T = UI.App.model.sheet.thickness;
      UI.exitSketch(); await idle();
      UI.App.sel = { kind: 'feature', id: sid };
      UI.cmdExtrude(true); await idle(); await wait(40);
      var lt = pmField('Link to thickness');
      assert(lt && lt.checked, 'Link to thickness checked for a cut on a sheet part');
      await UI.pmOK(); await idle();
      var slotA = 2 * (1 * 0.25 + Math.PI * 0.125 * 0.125);
      var v1 = vol();
      log.push('cut ' + JSON.stringify(UI.App.build.errors || {}) + ' removed ' + (v0 - v1).toFixed(9) + ' expected ' + (slotA * T).toFixed(9));
      near(v0 - v1, slotA * T, 1e-9, 'the two slots through the flange');
      var sk2 = function () { return UI.App.model.features.filter(function (q) { return q.id === sid; })[0]; };
      var arcs2 = function () { return sk2().entities.filter(function (e) { return e.t === 'arc'; }).map(function (e) { return [+e.cx.toFixed(6), +e.cy.toFixed(6)]; }).sort(function (a, b) { return a[0] - b[0]; }); };
      var arcs0 = JSON.stringify(arcs2());
      var outline = function () { var E = sk2().entities.slice(0, 4), xs = [], ys = []; E.forEach(function (e) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }); return [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)].map(function (v) { return +v.toFixed(6); }); };
      // the flange 2 -> 3: double-click Edge-Flange1, a click on its length, 3 Enter
      var ef = UI.App.model.features.filter(function (q) { return q.type === 'flange'; })[0];
      var row = D.querySelector('#tree .ti[data-fid="' + ef.id + '"]');
      var rowEv = function (type, detail) { var r = row.getBoundingClientRect(), nm = row.querySelector('.nm') || row; nm.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: 0, detail: detail || 1, clientX: r.left + 40, clientY: r.top + r.height / 2 })); };
      UI.setView('Isometric'); await idle();
      rowEv('mousedown'); rowEv('mouseup'); rowEv('click'); rowEv('mousedown', 2); rowEv('mouseup', 2); rowEv('click', 2); rowEv('dblclick', 2);
      await idle(); await wait(40);
      UI.drawDims();
      var lt2 = Array.prototype.filter.call(D.querySelectorAll('#i3d-layer g.i3d .pe-fdim, #i3d-layer g.i3d .i3d-dim-text'), function (t) { return Math.abs(parseFloat(t.textContent) - 2) < 1e-9; })[0];
      assert(lt2, 'the flange length 2 on the part: ' + Array.prototype.map.call(D.querySelectorAll('#i3d-layer text'), function (t) { return t.textContent; }).join(','));
      lt2.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, button: 0, buttons: 1 })); await idle();
      var inp = D.querySelector('#viewport input[aria-label="Instant3D value"]');
      assert(inp && inp.offsetParent !== null, 'a value box on the 2');
      inp.focus(); inp.value = '3'; inp.dispatchEvent(new W.Event('input', { bubbles: true }));
      pressEnter(inp); await idle(); await wait(60); await idle();
      log.push('flange 3: ' + JSON.stringify(UI.App.build.errors || {}) + ' outline ' + outline() + ' arcs ' + JSON.stringify(arcs2()) + ' ' + JSON.stringify(UI.App.build.warnings || {}));
      assert(!Object.keys(UI.App.build.errors || {}).length, 'no rebuild error');
      near(outline()[3], 3, 1e-9, 'the converted outline follows the flange to 3');
      assert(JSON.stringify(arcs2()) === arcs0, 'the slots stay dimensioned from the bend edge and the side');
      var uncut = function () {
        var m = JSON.parse(JSON.stringify(UI.App.model));
        m.features = m.features.filter(function (q) { return !(q.type === 'extrude' && q.cut); });
        var b = W.Kernel.rebuild(m);
        return W.Kernel.massProps(W.Kernel.meshFromBody(b.body), 1).volume;
      };
      near(uncut() - vol(), slotA * T, 1e-9, 'flange 3: the cut takes the two slots');
      // the base 6 -> 8: Edit Sketch1, Smart Dimension on its long side, 8
      var s1 = UI.App.model.features.filter(function (q) { return q.type === 'sketch'; })[0];
      UI.enterSketch(s1.id); await idle(); await wait(30);
      rfPRFrame(11, 7, 0.1, 0.2); await wait(30);
      log.push('Sketch1 ' + rfPREnts() + ' ' + JSON.stringify(rfPRF().entities[0]));
      // (the script's rect is one rect entity: its edge on the bend side, y = 0, is picked as a line would be)
      await rfPRDim([[3, 0]], [3, 0.6], '8');
      log.push('Sketch1 dimensioned ' + rfQLSeg() + ' ' + rfPRAn().status);
      UI.exitSketch(); await idle();
      log.push('base 8: ' + JSON.stringify(UI.App.build.errors || {}) + ' outline ' + outline() + ' arcs ' + JSON.stringify(arcs2()) + ' ' + JSON.stringify(UI.App.build.warnings || {}));
      assert(!Object.keys(UI.App.build.errors || {}).length, 'no rebuild error after the base 6 -> 8');
      near(outline()[1] - outline()[0], 8, 1e-9, 'the converted outline follows the base to 8');
      assert(JSON.stringify(arcs2()) === arcs0, 'the slots stay where they were dimensioned: ' + JSON.stringify(arcs2()));
      near(uncut() - vol(), slotA * T, 1e-9, 'base 8: the cut takes the two slots');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });

  // ---------------------------------------------------------------- flow 4: a customer DXF in mm into an inch sketch
  // a 152.4 x 101.6 mm plate whose upper right corner is an R25.4 drawn as 12 chords, the bottom line twice, a 0.02 mm
  // gap at the lower left corner and a 0.015 mm one where the chords meet the top line
  function rfQLDxf() {
    var L = [], r = 25.4, W = 152.4, H = 101.6;
    function line(a, b) { L.push('0', 'LINE', '8', 'CUT', '10', a[0].toFixed(6), '20', a[1].toFixed(6), '30', '0', '11', b[0].toFixed(6), '21', b[1].toFixed(6), '31', '0'); }
    line([0, 0], [W, 0]); line([0, 0], [W, 0]);
    line([W, 0], [W, H - r]);
    for (var k = 0; k < 12; k++) {
      var a0 = k * Math.PI / 24, a1 = (k + 1) * Math.PI / 24, c = [W - r, H - r];
      line([c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0)], [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)]);
    }
    line([W - r - 0.015, H], [0, H]);
    line([0, H], [0, 0.02]);
    return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'].concat(L, ['0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n';
  }
  step('rfQL flow 4: a customer DXF (mm, an outline with two tiny gaps, a duplicated line, an R1 corner as 12 chords) onto Top of an inch part: the units taken from the file (x 1/25.4), Repair Sketch, Fully Define Sketch, the width 6 -> 7 by its dimension: the outline follows; Boss-Extrude .25 equals the closed form', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Top', 9, 6, 0.15, 0.2);
      UI.importDXFText(rfQLDxf(), { name: 'customer.dxf' }); await idle(); await wait(40);
      assert(/DXF/.test(UI.pmTitle() || ''), 'the DXF/DWG Import PropertyManager: ' + UI.pmTitle());
      log.push('PM ' + ($('pm') ? $('pm').textContent.replace(/\s+/g, ' ').slice(0, 400) : ''));
      await UI.pmOK(); await idle(); await wait(30);
      f = rfPRF();
      log.push('imported ' + f.entities.length + ' ' + rfPRAn().status + ' dof ' + rfPRAn().dof + ' | ' + statusText());
      UI.cmdRepairSketch(); await idle(); await wait(30);
      log.push('repair PM ' + UI.pmTitle() + ': ' + ($('pm') ? $('pm').textContent.replace(/\s+/g, ' ').slice(0, 300) : ''));
      await UI.pmOK(); await idle(); await wait(30);
      f = rfPRF();
      log.push('repaired ' + f.entities.length + ' ' + rfPRAn().status + ' dof ' + rfPRAn().dof + ' | ' + statusText());
      UI.cmdFullyDefineSketch(); await idle(); await wait(30);
      clickPmButton('Calculate'); await idle(); await wait(30);
      log.push('fully define ' + statusText());
      await UI.pmOK(); await idle(); await wait(30);
      f = rfPRF();
      log.push('defined ' + rfPRAn().status + ' dims ' + rfQLDims(f) + ' rels ' + rfPRRels(f).length);
      assert(f.entities.length === 16 && rfPRAn().status === 'full', 'the 16 entities fully defined');
      near(Math.max.apply(null, f.entities.map(function (e) { return Math.max(e.x1, e.x2); })), 6, 1e-9, '152.4 mm = 6 in wide');
      near(Math.max.apply(null, f.entities.map(function (e) { return Math.max(e.y1, e.y2); })), 4, 1e-9, '101.6 mm = 4 in high');
      var r = 1, poly = 12 * 0.5 * r * r * Math.sin(Math.PI / 24);   // the 12 chord triangles of the corner
      var area0 = 24 - r * r + poly;
      // the bottom line 6 -> 7 by its dimension (Fully Define put the X of each corner from the origin, as SolidWorks'
      // Baseline scheme: the right side moves, the chord points dimensioned from the origin stay)
      await rfPREditDim(/^6\.0+$/, '7');
      f = rfPRF();
      var shoelace = function (g) {
        var P = g.entities.map(function (e) { return [e.x1, e.y1, e.x2, e.y2]; }), s = 0;
        P.forEach(function (p) { s += p[0] * p[3] - p[2] * p[1]; });
        return Math.abs(s) / 2;
      };
      var prof = W.Kernel.sketchProfile(f);
      log.push('width 7: ' + rfPRAn().status + ' loops ' + prof.loops.length + ' ' + rfQLSeg(f).slice(0, 300));
      assert(prof.loops.length === 1 && rfPRAn().status === 'full', 'still one closed outline, fully defined');
      var area1 = shoelace(f);
      near(area1, area0 + 3 + 0.5 * Math.sin(Math.PI / 24), 1e-7,   // (the file's 6 decimals of a mm: 4e-8 in
         'the right side moved 1: + 1 x 3 and the first chord stretched (+ 1 x sin 7.5 deg / 2)');
      var v = await rfPRBuild(0.25);
      log.push('volume ' + v.toFixed(9) + ' area ' + area1.toFixed(9));
      near(v, area1 * 0.25, 1e-9, 'Boss-Extrude .25');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });

  // ---------------------------------------------------------------- flow 5: editing under relations
  step('rfQL flow 5: a fully defined 4 x 2 rectangle from the origin: a drag of its top line moves nothing and the status line says why; the height dimension deleted, the same drag moves the top only; Display/Delete Relations: the right side\'s Vertical suppressed: the status changes, Ctrl+Z restores it', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 8, 5, 0.15, 0.75);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([4.1, 2.05]); await rfPREsc(2);
      await rfPRDim([[2, 0]], [2, -0.6], '4');
      f = rfPRF(); await rfPRDim([[f.entities[1].x1, 1]], [f.entities[1].x1 + 0.7, 1], '2');
      f = rfPRF();
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfPRAn().status + ' ' + rfPRRels().join(' '));
      var s0 = rfPRState(f);
      UI.setTool('select'); await wait(20);
      await rfPRDrag([2, 2], [2.4, 2.8]); await wait(30);
      log.push('drag full: moved ' + (rfPRState() !== s0) + ' | ' + statusText());
      assert(rfPRState() === s0, 'a fully defined sketch does not move');
      assert(/[Ff]ully [Dd]efined|cannot|not move|fixed|dimension/.test(statusText()), 'the status line says why: ' + statusText());
      UI.setSelection([]); await rfPREsc(1);
      await rfQHDeleteLabel(/^2\.0+$/);
      f = rfPRF();
      log.push('height deleted ' + rfPRAn().status + ' dof ' + rfPRAn().dof + ' dims ' + rfQLDims(f));
      var bottom = JSON.stringify(f.entities.filter(function (e) { return Math.abs(e.y1) < 1e-9 && Math.abs(e.y2) < 1e-9; }));
      UI.setTool('select'); await wait(20);
      await rfPRDrag([2, 2], [2.4, 2.8]); await wait(30);
      f = rfPRF();
      var top = f.entities.filter(function (e) { return Math.abs(e.y1 - e.y2) < 1e-9 && e.y1 > 1; })[0];
      log.push('drag under: ' + rfQLSeg(f) + ' | ' + statusText());
      assert(top && Math.abs(top.y1 - 2.8) < 0.05 && Math.abs(Math.min(top.x1, top.x2)) < 1e-9 && Math.abs(Math.max(top.x1, top.x2) - 4) < 1e-9, 'the top follows the mouse up, its ends stay over the sides: ' + rfQLSeg(f));
      assert(JSON.stringify(f.entities.filter(function (e) { return Math.abs(e.y1) < 1e-9 && Math.abs(e.y2) < 1e-9; })) === bottom, 'the bottom does not move');
      UI.setSelection([]); await rfPREsc(1);
      // Display/Delete Relations: the right side's Vertical suppressed
      var st0 = rfPRAn(), u0 = UI.App.undo.length, s1 = rfPRState(f);
      UI.cmdDisplayRelations(); await idle(); await wait(30);
      var vi = (f.rels || []).map(function (r, i) { return r.type === 'vertical' && r.refs.length === 1 && Math.abs(f.entities[+r.refs[0]].x1 - 4) < 1e-9 ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      assert(vi != null, 'the right side\'s Vertical: ' + rfPRRels().join(' '));
      var row = D.querySelector('#rel-display [data-key="r' + vi + '"]');
      assert(row, 'its row in the list');
      row.click(); await wait(30);
      assert(UI.App.sel && UI.App.sel.kind === 'rel' && UI.App.sel.index === vi, 'the row selected: ' + JSON.stringify(UI.App.sel));
      var sup = pmField('Suppressed');
      assert(sup, 'a Suppressed box for the selected relation');
      sup.click(); await idle(); await wait(30);
      var st1 = rfPRAn();
      log.push('suppressed ' + st0.status + '/' + st0.dof + ' -> ' + st1.status + '/' + st1.dof + ' | ' + statusText());
      assert(f.rels[vi].suppressed && st1.dof === st0.dof + 1, 'one more degree of freedom: ' + st0.dof + ' -> ' + st1.dof);
      await UI.pmOK(); await idle();
      UI.setTool('select'); await wait(20);
      rfPRKey('z', { ctrlKey: true }); await idle(); await wait(30);
      log.push('undo ' + rfPRAn().status + '/' + rfPRAn().dof + ' undo ' + (UI.App.undo.length - u0));
      assert(!rfPRF().rels[vi].suppressed && rfPRAn().dof === st0.dof && rfPRState() === s1, 'Ctrl+Z puts the Vertical back');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
