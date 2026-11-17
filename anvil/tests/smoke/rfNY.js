  // ---- rfNY (2026-11-16, lane unitsmate): B1, two flat sheet-metal faces beside bends clicked in the Mate PM give
  // Coincident (they were taken as cylinders: Concentric); D1, Tools ▸ Units on an mm bracket converts it to inches
  // (the part keeps its size, a 100 dimension reads 3.937, the inch flat DXF is 3.937 wide) and back
  var RFNY_T = 0.0598, RFNY_HEAD = 'p.units(\\"in\\"); p.sheet(' + RFNY_T + ', 0.06, 0.42); ';
  var RFNY_ASM = 'a.name("NyTray").units("in");\n' +
    'var tray = a.insert({ script: "' + RFNY_HEAD + 'p.name(\\"Tray\\"); p.sketch(\\"Top\\").rect(0, -6, 8, 6).end().baseFlange(); p.flange(2, [[0, ' + RFNY_T + ', 3], [8, ' + RFNY_T + ', 3], [4, ' + RFNY_T + ', 0], [4, ' + RFNY_T + ', 6]]);" }, { fixed: true });\n' +
    'var br = a.insert({ script: "' + RFNY_HEAD + 'p.name(\\"Bracket\\"); p.sketch(\\"Top\\").rect(0, -3, 4, 3).end().baseFlange(); p.flange(2, [[0, ' + RFNY_T + ', 1.5]]);" }, { position: [10, 1, 0] });\n';
  function rfNYSelect(key) { return D.querySelector('#pm select[data-key="' + key + '"]'); }
  function rfNYMenu(label, re) {
    var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === label; })[0];
    li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, detail: 1, button: 0 }));
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return re.test(m.textContent); })[0];
    if (!row) throw new Error(label + ' menu: no row ' + re);
    row.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W, detail: 0, button: 0 }));
  }
  async function rfNYClick(p) {
    var vp = $('viewport'), r = vp.getBoundingClientRect();
    function ev(type, target) { (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: r.left + p[0], clientY: r.top + p[1] })); }
    ev('mousemove', vp); ev('mousedown', vp); ev('mouseup');
    await idle();
  }
  step('rfNY: Mate PM: the bracket\'s top face and the tray floor (both flat faces beside bends) clicked give Coincident, not Concentric, and the mate solves', async function () {
    await anvil.run(RFNY_ASM);
    await idle();
    UI.setView('Isometric'); await idle();
    if (UI.zoomToFit) { UI.zoomToFit(); await idle(); }
    UI.cmdMate();
    await idle();
    await rfNYClick(UI.worldToScreen([10 + 3.2, 1 + RFNY_T, 0.8]));
    var v = UI.pmSpec().values;
    assert(v.a && v.a.component === 2 && v.a.face && !v.a.cylinder, 'bracket top: ' + JSON.stringify(v.a));
    await rfNYClick(UI.worldToScreen([1, RFNY_T, 1]));
    v = UI.pmSpec().values;
    assert(v.b && v.b.component === 1 && v.b.face && !v.b.cylinder, 'tray floor: ' + JSON.stringify(v.b));
    assert(rfNYSelect('type').value === 'coincident', 'mate type ' + rfNYSelect('type').value);
    await pmAccept();
    var mt = UI.App.model.mates[UI.App.model.mates.length - 1];
    assert(mt && mt.type === 'coincident' && /^Coincident/.test(mt.name), JSON.stringify(mt));
    assert(anvil.mates().every(function (x) { return x.ok; }), JSON.stringify(anvil.mates()));
    var br = anvil.components().filter(function (c) { return /^Bracket/.test(c.name); })[0];
    near(br.position[1] + (br.rotation[4] < 0 ? -RFNY_T : RFNY_T), RFNY_T, 1e-6, 'the bracket\'s top face lies on the floor: ' + JSON.stringify(br));
  });

  var RFNY_MM = 'p.name("MmBracket").units("mm");\np.sheet(2, 2, 0.42);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange();\n' +
    'p.hole("Top", 50, -30, 10, { offset: 2 });\np.flange(25, [[50, 2, 0]]);\n';
  function rfNYVol() { var mp = anvil.mass(); return mp.volume != null ? mp.volume : mp.vol; }
  function rfNYDxfWidth(txt) {   // the X extent of the OUTLINE layer's vertices / line ends
    var L = txt.split(/\r?\n/), xs = [], layer = '';
    for (var i = 0; i + 1 < L.length; i += 2) {
      var c = L[i].trim(), v = L[i + 1].trim();
      if (c === '0') layer = '';
      if (c === '8') layer = v;
      if ((c === '10' || c === '11') && layer === 'OUTLINE') xs.push(+v);
    }
    return Math.max.apply(null, xs) - Math.min.apply(null, xs);
  }
  step('rfNY: Tools ▸ Units on a 100 mm bracket: inches keeps the size (volume in mm³, flat), the 100 dimension reads 3.937, the inch flat DXF is 3.937 wide; millimetres again gives the same part; one undo step', async function () {
    var keepDef = UI.defaultUnits();
    await anvil.run(RFNY_MM);
    await idle();
    assert(UI.App.model.units === 'mm', 'mm part');
    var v0 = rfNYVol(), w0 = UI.fmtDim(UI.App.model.features[0].entities[0].w), fx0 = anvil.flat().size[0];
    assert(w0 === '100', 'reads ' + w0);
    rfNYMenu('Tools', /^Units: inches/);
    await idle(); await idle();
    var m = UI.App.model;
    assert(m.units === 'in', 'units ' + m.units);
    var w1 = UI.fmtDim(m.features[0].entities[0].w);
    assert(w1 === '3.937', 'the 100 dimension reads ' + w1);
    near(m.sheet.thickness, 2 / 25.4, 1e-12, 'T');
    var v1 = rfNYVol() * Math.pow(25.4, 3);
    assert(Math.abs(v1 - v0) <= 1e-4 * v0, 'volume in mm³ ' + v0 + ' -> ' + v1);
    near(anvil.flat().size[0] * 25.4, fx0, 1e-9, 'flat width');
    var dxf = anvil.dxfFlat();
    assert(/\$INSUNITS\r?\n\s*70\r?\n\s*1\r?\n/.test(dxf), 'inch DXF header');
    var wd = rfNYDxfWidth(dxf);
    near(wd, 100 / 25.4, 1e-6, 'DXF width ' + wd);
    assert(wd.toFixed(3) === '3.937', 'DXF width ' + wd.toFixed(3));
    rfNYMenu('Tools', /^Units: millimeters/);
    await idle(); await idle();
    assert(UI.App.model.units === 'mm' && UI.fmtDim(UI.App.model.features[0].entities[0].w) === '100', 'back to mm');
    near(rfNYVol(), v0, 1e-12 * v0, 'mm -> in -> mm volume');
    UI.undo(); await idle();
    assert(UI.App.model.units === 'in', 'undo takes back the last change only: ' + UI.App.model.units);
    assert(UI.defaultUnits() === keepDef, 'default units untouched');
  });
