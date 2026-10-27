  // --- rfDL (2026-10-27, lane DL): sheet-metal fidelity #11 / #13 / #12 / #5 through the UI — Miter Flange from a
  // profile sketch (edge clicked, Miter Flange opens a sketch normal to it at its end, an L profile drawn with the Line
  // tool, exit, the second edge clicked, gap typed, ✓, the tree's Miter Flange1, Edit Feature), the CommandManager
  // staying on Sheet Metal after a Cut-Extrude from a sketch started on the Sketch tab, the Sheet Metal ribbon order,
  // and Hem opening on Closed. Self-contained. ---
  (function () {
    var T = 0.06, R = 0.06;
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function rfDLEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfDLClick(p) { rfDLEv('mousemove', p); rfDLEv('mousedown', p, $('viewport')); rfDLEv('mouseup', p); }
    function rfDLKey(k) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
    function rfDLSk(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
    function rfDLTab(name) { var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rtab'), function (b) { return b.textContent === name; })[0]; assert(t, 'tab ' + name); t.click(); }
    function rfDLBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === label; })[0]; }
    function rfDLOk() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'PM ✓ button'); b.click(); }
    // clicks a sharp edge through the point P after checking the pick under the cursor is that edge
    function rfDLEdge(P) {
      var s = UI.worldToScreen(P), pk = UI.pickEdge(s[0], s[1]);
      assert(pk && pk.edge && K.pointSegmentDistance(P, pk.edge.a, pk.edge.b) < 1e-6, 'edge under ' + JSON.stringify(P) + ': ' + JSON.stringify(pk && [pk.edge.a, pk.edge.b]));
      rfDLClick(s);
    }
    function rfDLRow(text) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti[data-fid]'), function (r) { var n = r.querySelector('.nm'); return n && n.textContent === text; })[0]; }

    step('rfDL: Miter Flange — click an edge, Sheet Metal ▸ Miter Flange opens a sketch normal to it at its end; an L profile drawn with the Line tool; Exit Sketch opens the Miter Flange PM (Miter Parameters, Flange position, Start/End Offset); the second edge clicked, gap .01 typed, ✓: Miter Flange1 in the tree, mitred corner, Edit Feature reopens with the values', async function () {
      await anvil.newPart(); await idle();
      await anvil.run(PLATE); await idle();
      UI.setView('Isometric'); await idle();
      rfDLEdge([1, T, 0]);
      assert(UI.App.sel && UI.App.sel.kind === 'edge', 'edge selected: ' + JSON.stringify(UI.App.sel && UI.App.sel.kind));
      rfDLTab('Sheet Metal');
      var mb = rfDLBtn('Miter Flange');
      assert(mb && !mb.disabled, 'Miter Flange button');
      mb.click(); await idle();
      assert(UI.App.mode === 'sketch', 'a sketch opened: ' + UI.App.mode);
      var pl = UI.activePlane(), n = K.vec.cross(pl.x, pl.y);
      assert(Math.abs(Math.abs(n[0]) - 1) < 1e-9 && Math.abs(pl.origin[1] - T) < 1e-9 && Math.abs(pl.origin[2]) < 1e-9 && (Math.abs(pl.origin[0]) < 1e-9 || Math.abs(pl.origin[0] - 4) < 1e-9), 'plane normal to the edge at its end: ' + JSON.stringify(pl));
      // the L profile: up 1 from the corner (the sketch origin), then 0.5 outward (sketch x = outward, y = up)
      UI.setTool('line');
      rfDLClick(rfDLSk([0, 0])); rfDLClick(rfDLSk([0, 1])); rfDLClick(rfDLSk([0.5, 1]));
      rfDLKey('Escape'); rfDLKey('Escape'); await idle();
      var sk = UI.activeSketchFeature();
      assert(sk.entities.length === 2 && sk.entities.every(function (e) { return e.t === 'line'; }), 'two lines: ' + JSON.stringify(sk.entities));
      var skId = sk.id;
      var ex = D.querySelector('#exit-sketch .cc-exit'); assert(ex, 'Exit Sketch in the confirmation corner'); ex.click(); await idle(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Miter Flange', 'Miter Flange PM after the sketch: ' + UI.pmTitle());
      var titles = Array.prototype.map.call(D.querySelectorAll('#pm .pm-group-title, #pm .grp-title, #pm summary, #pm .pm-gt'), function (e) { return e.textContent.trim(); }).join('|');
      var pmText = $('pm').textContent;
      ['Miter Parameters', 'Start/End Offset', 'Gap distance', 'Flange position', 'Trim side bends', 'Use default radius'].forEach(function (t) { assert(pmText.indexOf(t) >= 0, 'PM shows ' + t + ' (' + titles + ')'); });
      var v = UI.pmSpec().values;
      assert(v.sketch === skId && v.edges.length === 1 && v.position === 'inside', 'values: sketch ' + v.sketch + ', ' + v.edges.length + ' edge, ' + v.position);
      var mi = D.querySelector('#pm [data-key="position:inside"]');
      assert(mi && mi.getAttribute('aria-checked') === 'true', 'Material Inside pressed');
      UI.setView('Isometric'); await idle();
      rfDLEdge([0, T, 1]); await idle();
      assert(UI.pmSpec().values.edges.length === 2, 'second edge added: ' + UI.pmSpec().values.edges.length);
      var gap = pmField('Gap distance');
      gap.focus(); setInput(gap, '0.01'); await idle();
      rfDLOk(); await idle(); await idle();
      assert(!UI.hasPM(), 'PM closed');
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'flange' && f.miterFlange && f.sketch === skId && f.edges.length === 2 && Math.abs(+f.miterGap - 0.01) < 1e-12 && f.position === 'inside' && f.name === 'Miter Flange1', 'feature: ' + JSON.stringify(f));
      assert(!UI.App.build.errors[f.id], 'built: ' + UI.App.build.errors[f.id]);
      assert(rfDLRow('Miter Flange1'), 'tree row Miter Flange1');
      var bb = K.massProps(UI.App.mesh).bbox;
      assert(Math.abs(bb.min[0] + 0.5) < 0.03 && Math.abs(bb.min[2] + 0.5) < 0.03 && Math.abs(bb.max[1] - (1 + 2 * T)) < 0.03, 'both returns out about 0.5, 1 + 2T high: ' + JSON.stringify(bb));
      var h = Math.SQRT1_2, mit = UI.App.mesh.faces.filter(function (fc) { return Math.abs(Math.abs(fc.normal[0] * h - fc.normal[2] * h) - 1) < 1e-6; });
      assert(mit.length >= 2, 'mitre faces at 45°: ' + mit.length);
      // Edit Feature (right-click the tree row)
      var row = rfDLRow('Miter Flange1'), rb = row.getBoundingClientRect();
      row.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rb.left + 20, clientY: rb.top + 5 }));
      var item = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim().indexOf('Edit Feature') === 0; })[0];
      assert(item, 'Edit Feature in the context menu');
      item.click(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Miter Flange1', 'Edit Feature opens the Miter Flange PM: ' + UI.pmTitle());
      var ev = UI.pmSpec().values;
      assert(ev.edges.length === 2 && Math.abs(+ev.miterGap - 0.01) < 1e-12 && ev.position === 'inside' && ev.sketch === skId && pmField('Gap distance'), 'edit values: ' + JSON.stringify({ e: ev.edges.length, g: ev.miterGap, p: ev.position }));
      UI.pmCancel(); await idle();
      // the old edge-only miter flange still opens the Edge-Flange PM
      await anvil.run(PLATE + 'p.flange(1, [[2, ' + T + ', 0], [0, ' + T + ', 1]], { miter: true, miterGap: 0.01, position: "inside" });\n'); await idle();
      UI.editFeature(UI.App.model.features[UI.App.model.features.length - 1]); await idle();
      assert(UI.hasPM() && pmField('Miter corners'), 'an edge-only miter flange edits in the Edge-Flange PM: ' + UI.pmTitle());
      UI.pmCancel(); await idle();
      return 'L profile, 2 edges, gap .01, bbox ' + JSON.stringify(bb.min.map(function (x) { return +x.toFixed(3); }));
    });

    step('rfDL: CommandManager — a sketch started from the Sketch tab, Sheet Metal tab clicked while sketching, Extruded Cut ▸ ✓: the ribbon stays on Sheet Metal (fidelity #13); Features clicked while sketching is where Exit Sketch leaves you', async function () {
      await anvil.newPart(); await idle();
      await anvil.run(PLATE); await idle();
      UI.setView('Isometric'); await idle();
      var s = UI.worldToScreen([2, T, 1]), pk = UI.pickFace(s[0], s[1]);
      assert(pk && pk.kind === 'face', 'top face under the cursor');
      rfDLClick(s); await idle();
      rfDLTab('Sketch');
      var sb = rfDLBtn('Sketch');
      assert(sb, 'Sketch button');
      sb.click(); await idle(); await idle();
      assert(UI.App.mode === 'sketch' && UI.App.ribbonTab === 'Sketch', 'sketching on the Sketch tab: ' + UI.App.mode + ' ' + UI.App.ribbonTab);
      var pl = UI.activePlane(), c = K.to2D(pl, [2, T, 1]), e = K.to2D(pl, [2.25, T, 1]);
      UI.setTool('circle');
      rfDLClick(rfDLSk(c)); rfDLClick(rfDLSk(e)); rfDLKey('Escape'); await idle();
      assert(UI.activeSketchFeature().entities.some(function (x) { return x.t === 'circle'; }), 'circle drawn');
      rfDLTab('Sheet Metal');
      rfDLBtn('Extruded Cut').click(); await idle(); await idle();
      assert(UI.hasPM(), 'Cut-Extrude PM');
      assert(UI.App.ribbonTab === 'Sheet Metal', 'tab after leaving the sketch: ' + UI.App.ribbonTab);
      rfDLOk(); await idle(); await idle();
      var active = D.querySelector('#ribbon .rtab.active');
      assert(UI.App.ribbonTab === 'Sheet Metal' && active && active.textContent === 'Sheet Metal', 'tab after ✓: ' + UI.App.ribbonTab);
      // Features clicked while sketching (then Sketch again): Exit Sketch leaves you on Features
      var s2 = UI.worldToScreen([1, T, 0.5]);
      rfDLClick(s2); await idle();
      assert(UI.App.sel && UI.App.sel.kind === 'face', 'top face selected again');
      rfDLTab('Sketch'); rfDLBtn('Sketch').click(); await idle(); await idle();
      assert(UI.App.mode === 'sketch', 'second sketch open');
      rfDLTab('Features'); rfDLTab('Sketch');
      UI.exitSketch(); await idle();
      assert(UI.App.ribbonTab === 'Features', 'Features clicked while sketching: the sketch leaves you on Features: ' + UI.App.ribbonTab);
      return 'ok';
    });

    step('rfDL: Sheet Metal ribbon in SolidWorks 2024 order (… Extruded Cut, Simple Hole, Vent, Unfold, Fold, Flatten, No Bends, Insert Bends, Rip), Flat to DXF last; Hem opens on Closed (fidelity #12, #5)', async function () {
      await anvil.newPart(); await idle();
      await anvil.run(PLATE); await idle();
      rfDLTab('Sheet Metal');
      var labels = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label'); });
      var want = ['Extruded Cut', 'Simple Hole', 'Vent', 'Unfold', 'Fold', 'Flatten', 'No Bends', 'Insert Bends', 'Rip', 'Flat to DXF'];
      var at = want.map(function (w) { return labels.indexOf(w); });
      assert(at.every(function (i, k) { return i >= 0 && (k === 0 || i === at[k - 1] + 1); }), 'order: ' + labels.join(' | '));
      assert(labels[labels.length - 1] === 'Flat to DXF', 'Flat to DXF last: ' + labels[labels.length - 1]);
      // Hem: a fresh session (no hem remembered) opens on Closed, Material Inside
      UI.sheetMetalMemory(null);
      UI.setView('Isometric'); await idle();
      rfDLEdge([1, T, 0]);
      rfDLBtn('Hem').click(); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Hem', 'Hem PM: ' + UI.pmTitle());
      var cl = D.querySelector('#pm [data-key="hemType:closed"]'), ins = D.querySelector('#pm [data-key="hemPosition:inside"]');
      assert(cl && cl.getAttribute('aria-checked') === 'true' && UI.pmSpec().values.hemType === 'closed', 'Closed preselected');
      assert(ins && ins.getAttribute('aria-checked') === 'true', 'Material Inside preselected');
      UI.pmCancel(); await idle();
      return labels.slice(at[0]).join(', ');
    });
  })();
