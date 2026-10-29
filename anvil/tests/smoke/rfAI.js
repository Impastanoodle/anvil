  // ---- rfAI (shop workflow audit 2, 2026-10-12): the 16 ga inch shop part — Hole Wizard clearance / tapped /
  // countersink holes land in the flat pattern at their drill radii and get ANSI inch hole callouts on the drawing; the
  // flat DXF Anvil wrote inserts back (R12 and R2000) and extrudes to the same blank; dxfToDwg refuses an R12 DXF
  var rfAIT = 0.0598;
  async function rfAISheet() {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in"); p.sheet(' + rfAIT + ', ' + rfAIT + ', 0.5);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange(' + rfAIT + ');'); await idle();
    assert(UI.App.model.units === 'in' && Object.keys(UI.App.build.errors || {}).length === 0, 'inch sheet');
  }
  function rfAIFlatHoles() {
    var fl = anvil.flat();
    return fl.loops.slice(1).map(function (l) { var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; }); return { c: [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2], r: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 }; }).sort(function (a, b) { return a.c[0] - b.c[0]; });
  }
  step('rfAI: Hole Wizard on a 16 ga inch sheet — Ø.266 (1/4) Clearance, 1/4-20 UNC Tapped (#7 drill) and CSK for 1/4 Flat Head (its 82° cone goes through the sheet) build without errors and the flat pattern carries the three holes at r .133 / .1005 / .2015', async function () {
    var errs0 = errors.length;
    await rfAISheet();
    var top = faceWithNormal([0, 1, 0]);
    function pmSel(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
    var specs = [{ holeType: 'hole', size: '1/4', fit: 'normal', pt: [2, rfAIT, 3] }, { holeType: 'tap', size: '1/4-20 UNC', pt: [5, rfAIT, 3] }, { holeType: 'csk', size: '1/4', fit: 'normal', pt: [8, rfAIT, 3] }];
    for (var i = 0; i < specs.length; i++) {
      UI.cmdHoleWizard();
      assert(UI.App.command.onPick({ kind: 'face', index: top, point: specs[i].pt }) !== false, 'face pick');
      clickPmButton('Type');
      assert(pmSel('standard').value === 'ANSI Inch', 'ANSI Inch on an inch part: ' + pmSel('standard').value);
      setInput(pmSel('holeType'), specs[i].holeType); await wait(10);
      setInput(pmSel('size'), specs[i].size);
      if (specs[i].fit) setInput(pmSel('fit'), specs[i].fit);
      // End Condition Through All, as the shop draws sheet holes (the callout reads the feature: a Blind .750 hole would
      // read 'Ø.281 ↧ .750', rfAJ)
      setInput(pmSel('end'), 'through'); await wait(10);
      await pmAccept();
    }
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'build errors ' + JSON.stringify(UI.App.build.errors));
    var nm = UI.App.model.features.filter(function (x) { return x.type === 'hole'; }).map(function (x) { return x.name; }).slice(-3);
    assert(/Clearance Hole/.test(nm[0]) && /1\/4-20 UNC Tapped Hole/.test(nm[1]) && /CSK for 1\/4 Flat Head/.test(nm[2]), 'names ' + nm.join(' | '));
    var holes = rfAIFlatHoles();
    assert(holes.length === 3, 'three holes in the flat: ' + JSON.stringify(holes));
    near(holes[0].c[0], 2, 1e-6, 'clearance x'); near(holes[0].r, 0.266 / 2, 2e-4, 'clearance r (Ø.266, the SolidWorks 1/4 Normal clearance)');
    near(holes[1].c[0], 5, 1e-6, 'tap x'); near(holes[1].r, 0.201 / 2, 2e-4, 'tap drill r (#7, Ø.201)');
    // CSK Ø.507 x 82° on a .0598 sheet: the cone is .130 deep, so the sheet's far face sees Ø.507 - 2 T tan 41° = Ø.403
    near(holes[2].c[0], 8, 1e-6, 'csk x'); near(holes[2].r, (0.507 - 2 * rfAIT * Math.tan(41 * Math.PI / 180)) / 2, 2e-3, 'csk far-side r');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return holes.map(function (h) { return 'r' + h.r.toFixed(4) + '@' + h.c[0]; }).join(' ');
  });
  step('rfAI: hole callouts on the drawing\'s Top view of that sheet — the clearance hole reads "Ø.266 THRU ALL", the tapped hole "Ø.201 THRU ALL" + "1/4-20 UNC - 2B THRU ALL"; Model Items with Hole callouts inserts one per hole', async function () {
    var errs0 = errors.length;
    assert(anvil.drawing.make(), 'drawing');
    var s = anvil.drawing.standard3View();
    var top = s.views.filter(function (v) { return v.orient === 'Top'; })[0];
    assert(top, 'Top view');
    var s1 = anvil.drawing.holeCallout(top.id, { c: [2, -3], r: 0.1405 });
    var s2 = anvil.drawing.holeCallout(top.id, { c: [5, -3], r: 0.1005 });
    function texts(sm) { return sm.annotations.filter(function (a) { return a.type === 'holeCallout'; }).map(function (a) { return a.text; }); }
    assert(s1 && s2, 'callouts placed: ' + statusText());
    var t = texts(s2);
    assert(/^Ø\.266 THRU( ALL)?$/.test(t[0]), 'clearance callout: ' + t[0]);
    assert(/^Ø\.201 THRU( ALL)?\s+1\/4-20 UNC - 2B THRU( ALL)?$/.test(t[1]), 'tapped callout: ' + t[1]);
    anvil.drawing.deleteAnnotation(s2.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0].id);
    anvil.drawing.deleteAnnotation(s2.annotations.filter(function (a) { return a.type === 'holeCallout'; })[1].id);
    // Model Items ▸ Hole callout inserts the Hole Wizard callouts (shop audit 2 finding 3, rfAJ), the CSK's from the feature
    var sm = anvil.drawing.modelItems({ views: [top.id], holeCallouts: true, holeLocations: true, dedupe: true });
    var mt = texts(sm);
    assert(mt.length === 3 && /Model Items inserted into 1 view/.test(statusText()), 'Model Items puts a hole callout on each of the three holes: ' + mt.join(' | ') + ', ' + statusText());
    assert(mt.indexOf('Ø.266 THRU ALL ⌵ Ø.507 X 82°') >= 0 && mt.indexOf('Ø.201 THRU ALL 1/4-20 UNC - 2B THRU ALL') >= 0 && mt.indexOf('Ø.266 THRU ALL') >= 0, 'callout texts: ' + mt.join(' | '));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return t.join(' | ') + '; Model Items ' + mt.join(' | ');
  });
  step('rfAI: the flat DXF of a 10 x 6 blank with four Ø.281 holes and a 1.5 Edge Flange (11.5213 x 6) inserts back as R12 and as R2000 (4 outline lines, 4 circles, 1 bend line, 2 notes, inches) and a .0598 Boss-Extrude of it has the part\'s own volume', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in"); p.sheet(' + rfAIT + ', ' + rfAIT + ', 0.5);\np.sketch("Top").rect(0, -6, 10, 6).circle(1, -1, 0.1405).circle(9, -1, 0.1405).circle(1, -5, 0.1405).circle(9, -5, 0.1405).end().baseFlange(' + rfAIT + ');\np.flange(1.5, [[0, ' + rfAIT + ', 3]], { lengthRef: "outer" });'); await idle();
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'build errors ' + JSON.stringify(UI.App.build.errors));
    var fl = anvil.flat();
    near(fl.size[0], 11.5213, 2e-4, 'flat length (10 + R + T + 1.5 - BD)'); near(fl.size[1], 6, 1e-9, 'flat width');
    var vol = anvil.summary().volume, r12 = UI.dxfOutput({ export: 'sheet', version: 'R12' }), r2000 = UI.dxfOutput({ export: 'sheet', version: 'R2000' });
    assert(/AC1009/.test(r12) && /AC1015/.test(r2000) && rfAIFlatHoles().length === 4, 'two flats, four holes');
    var out = [];
    for (var k = 0; k < 2; k++) {
      await anvil.newPart(); await idle(); await anvil.run('p.units("in");'); await idle();
      var v = await UI.importDXFText(k ? r2000 : r12, { name: 'flat_' + (k ? 'R2000' : 'R12') + '.dxf' }); await idle();
      assert(v && UI.pmTitle() === 'DXF/DWG Import' && /OUTLINE\(4\)HOLES\(4\)BEND\(1\)NOTES\(2\)/.test($('pm').textContent.replace(/\s+/g, '')) && /inches/.test($('pm').textContent), 'import PM: ' + $('pm').textContent.replace(/\s+/g, ' ').slice(0, 200));
      await pmAccept();
      var f = UI.activeSketchFeature(), kinds = f.entities.map(function (e) { return e.t; }).sort().join(',');
      assert(kinds === 'circle,circle,circle,circle,line,line,line,line,line,text,text', 'entities ' + kinds);
      await UI.exitSketch(true); await idle();
      UI.cmdExtrude(false); await idle(); setInput(pmNumber(0), rfAIT); await pmAccept();
      assert(Object.keys(UI.App.build.errors || {}).length === 0, 'extrude errors ' + JSON.stringify(UI.App.build.errors));
      near(anvil.summary().volume, vol, 1e-6 * vol, 'volume of the re-imported blank (' + (k ? 'R2000' : 'R12') + ')');
      out.push((k ? 'R2000' : 'R12') + ' ' + anvil.summary().volume.toFixed(4));
    }
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return out.join(', ') + ' in³';
  });
  step('rfAI: UI.dxfToDwg refuses an R12 DXF before any request (LibreDWG writes an empty DWG from one); the DXF/DWG Output PM, Save Drawing as DWG and the headless runner all convert from R2000', async function () {
    var errs0 = errors.length, msg = null;
    var real = W.fetch, calls = 0;
    W.fetch = function () { calls++; return real.apply(W, arguments); };
    try { await UI.dxfToDwg('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nEOF\n'); } catch (e) { msg = e.message; } finally { W.fetch = real; }
    assert(calls === 0 && /R2000 DXF \(AC1015\); this DXF is R12/.test(msg || ''), 'refused without a request: ' + calls + ' ' + msg);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return msg;
  });
  step('rfAI: Convert Entities on an Edge Flange wall face brings the whole boundary — two sides, the top and the tangent edge at the bend — as a closed, fully defined contour (shop audit 2 finding 1)', async function () {
    var errs0 = errors.length;
    await rfAISheet();
    await anvil.append('p.flange(1.5, [[10, ' + rfAIT + ', 3]]);'); await idle();
    assert(Object.keys(UI.App.build.errors || {}).length === 0, 'flange built');
    var fi = UI.App.mesh.faces.findIndex(function (f) { return f.normal && f.normal[0] > 0.999 && Math.abs(f.area - 9) < 1e-6; });
    assert(fi >= 0, 'the flange wall face (6 x 1.5, normal +X)');
    UI.App.sel = { kind: 'face', index: fi, point: [10 + 2 * rfAIT, 0.8, 3] }; UI.cmdSketch(); await idle();
    assert(UI.App.mode === 'sketch', 'sketch on the wall face');
    fi = UI.App.mesh.faces.findIndex(function (f) { return f.normal && f.normal[0] > 0.999 && Math.abs(f.area - 9) < 1e-6; });
    UI.cmdConvertEntities(); await wait(20);
    UI.pmSpec().values.items = [{ kind: 'face', index: fi }]; UI.renderPM();
    await UI.pmOK(); await idle();
    var f = UI.activeSketchFeature(), lines = f.entities.filter(function (e) { return e.t === 'line'; });
    assert(lines.length === 4, 'four lines: ' + f.entities.map(function (e) { return e.t; }).join());
    var ends = {}; lines.forEach(function (l) { [[l.x1, l.y1], [l.x2, l.y2]].forEach(function (p) { var k = p[0].toFixed(4) + ',' + p[1].toFixed(4); ends[k] = (ends[k] || 0) + 1; }); });
    assert(Object.keys(ends).every(function (k) { return ends[k] === 2; }), 'closed: ' + JSON.stringify(ends));
    assert(UI.sketchStatus().status === 'full', 'fully defined (On Edge): ' + UI.sketchStatus().status);
    await UI.exitSketch(true); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '4 lines, closed';
  });
  // --- end rfAI ---
