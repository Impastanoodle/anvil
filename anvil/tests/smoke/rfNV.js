  // ---- rfNV (local-2026-11-16b, lane stepasm): File ▸ Open of a STEP assembly opens an assembly document (one
  // component per occurrence, each product one part document saved in this browser) in its parts' colours; a STEP part
  // whose solids differ in colour shows each body in its own colour. Documents made here are named 'rfNV6 …' and
  // removed at the end; the page ends on a new part.
  var RFNV_T = 0.0598;
  function rfNVPart(name, color, body) { return 'p.name(' + JSON.stringify(name) + '); p.color("' + color + '"); p.units("in"); p.sheet(' + RFNV_T + ', ' + RFNV_T + ', 0.5); ' + body; }
  function rfNVStep() {
    var AS = W.Assembly, m = AS.newAssembly();
    AS.runScript(m, 'a.name("rfNV6 Enclosure").units("in");\n' +
      'a.insert({ script: ' + JSON.stringify(rfNVPart('rfNV6 Box', '#3366cc', 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange(); p.flange(1, [[2, ' + RFNV_T + ', 0]], { position: "inside", lengthRef: "outer" });')) + ' }, { fixed: true });\n' +
      'a.insert({ script: ' + JSON.stringify(rfNVPart('rfNV6 Lid', '#cc3333', 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();')) + ' }, { position: [0, 1.5, -4] });\n' +
      'a.insert({ script: ' + JSON.stringify(rfNVPart('rfNV6 Bracket', '#33aa55', 'p.sketch("Top").rect(0, -1, 2, 1).end().baseFlange(); p.flange(1, [[1, ' + RFNV_T + ', 0]]);')) + ' }, { position: [5, 0, 0] });\n' +
      'a.insert({ script: ' + JSON.stringify(rfNVPart('rfNV6 Bracket', '#33aa55', 'p.sketch("Top").rect(0, -1, 2, 1).end().baseFlange(); p.flange(1, [[1, ' + RFNV_T + ', 0]]);')) + ' }, { position: [5.5, 0.2, 3], rotation: [0.36, 0.48, -0.8, -0.8, 0.6, 0, 0.48, 0.64, 0.6] });\n');
    return W.Exchange.exportSTEP(m, AS.rebuild(m));
  }
  // the canvas as drawn: how many pixels lean to each of the three colours (blue, red, green clearly dominant)
  function rfNVHues() {
    UI.render();
    var R = UI.renderer, gl = R.getContext(), c = R.domElement, px = new Uint8Array(c.width * c.height * 4), n = { blue: 0, red: 0, green: 0 };
    R.setRenderTarget(null);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (var i = 0; i < px.length; i += 4) {
      var r = px[i], g = px[i + 1], b = px[i + 2];
      if (b > r + 40 && b > g + 25) n.blue++; else if (r > g + 50 && r > b + 50) n.red++; else if (g > r + 40 && g > b + 30) n.green++;
    }
    return n;
  }
  // the colour each component's faces are drawn with (the body mesh's vertex colours), as '#rrggbb'
  function rfNVDrawn() {
    var bm = UI.getBodyMesh && UI.getBodyMesh(), g = bm && bm.geometry, at = g && g.getAttribute('color'), out = {};
    if (!at || !UI.App.mesh) return null;
    UI.App.mesh.faces.forEach(function (f) {
      var o = f.start * 9, hex = '#' + [at.array[o], at.array[o + 1], at.array[o + 2]].map(function (v) { var h = Math.round(v * 255).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
      (out[f.body || 0] = out[f.body || 0] || {})[hex] = true;
    });
    return Object.keys(out).map(function (k) { return Object.keys(out[k]).join('/'); });
  }
  step('rfNV: File ▸ Open of a STEP assembly (box, lid, a bracket twice, one at a general rotation) opens an assembly of 4 components on 3 part documents, named and placed as in the file, each drawn in its part\'s colour (vertex colours to 1/255, the three hues on screen); the parts are linked documents', async function () {
    var text = rfNVStep(), made = [];
    try {
      var s = await anvil.importFile('rfNV6 Enclosure.step', text); await idle(); await wait(40);
      made = W.Assembly.Documents.list().filter(function (n) { return /^rfNV6 /.test(n); });
      assert(UI.App.model.type === 'assembly' && UI.App.model.components.length === 4, 'opened as ' + UI.App.model.type + ' with ' + (UI.App.model.components || []).length + ' components');
      assert(JSON.stringify(UI.App.model.components.map(function (c) { return c.name + '=' + c.source.file; })) === JSON.stringify(['rfNV6 Box<1>=rfNV6 Box', 'rfNV6 Lid<1>=rfNV6 Lid', 'rfNV6 Bracket<1>=rfNV6 Bracket', 'rfNV6 Bracket<2>=rfNV6 Bracket']), JSON.stringify(UI.App.model.components.map(function (c) { return c.name + '=' + JSON.stringify(c.source); })));
      assert(made.length === 3, 'documents ' + JSON.stringify(made));
      assert(/assembly of 4 components \(4 in the file\)/.test(statusText()), 'status: ' + statusText());
      near(UI.App.model.components[3].transform.rotation[2], -0.8, 1e-12, 'the general rotation kept');
      near(UI.App.model.components[3].transform.position[0], 5.5, 1e-12, 'placement kept');
      var rows = Array.prototype.map.call(D.querySelectorAll('.component-row'), function (r) { return r.textContent; }).join('|');
      ['rfNV6 Box<1>', 'rfNV6 Lid<1>', 'rfNV6 Bracket<1>', 'rfNV6 Bracket<2>'].forEach(function (n) { assert(rows.indexOf(n) >= 0, 'tree row ' + n + ' in ' + rows); });
      if (UI.setView) UI.setView('Isometric');
      if (UI.zoomToFit) UI.zoomToFit();
      await wait(60);
      var drawn = rfNVDrawn();
      assert(drawn && JSON.stringify(drawn) === JSON.stringify(['#3366cc', '#cc3333', '#33aa55', '#33aa55']), 'drawn colours ' + JSON.stringify(drawn));
      var h = rfNVHues();
      assert(h.blue > 200 && h.red > 200 && h.green > 200, 'the three hues on screen: ' + JSON.stringify(h));
      return JSON.stringify(h) + ' px';
    } finally {
      made.forEach(function (n) { W.Assembly.Documents.remove(n); });
    }
  });
  step('rfNV: a STEP part file whose solids differ in colour (the same file read as one part: Insert ▸ into a new part) draws each body in its file colour; the part colour stays for a single-colour file', async function () {
    var text = rfNVStep(), res = W.Exchange.importFile('rfNV6 flat.step', text, { units: 'in' });
    var m = W.Exchange.newPartFromImport(res);
    await UI.loadModel(m); await idle(); await wait(40);
    try {
      assert(UI.App.model.type !== 'assembly' && UI.App.build.bodies.length === 4, 'one part, four bodies');
      var drawn = rfNVDrawn();
      assert(drawn && JSON.stringify(drawn) === JSON.stringify(['#3366cc', '#cc3333', '#33aa55', '#33aa55']), 'drawn colours ' + JSON.stringify(drawn));
      var h = rfNVHues();
      assert(h.blue > 200 && h.red > 200 && h.green > 200, 'the three hues on screen: ' + JSON.stringify(h));
      return JSON.stringify(h) + ' px';
    } finally { await anvil.newPart(); await idle(); }
  });
