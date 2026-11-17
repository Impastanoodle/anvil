  // --- rfNH (2026-11-16, lane pmsense) --- the PropertyManagers make sense to a SolidWorks user, under the SolidWorks
  // profile: Chamfer / Fillet show their SolidWorks types and grey ✓ until an edge is clicked; option rows never show
  // one drawing on two buttons (Rib Thickness, Miter Flange position; a row whose drawings are missing shows words);
  // Mirror asks for the "Feature to mirror"; Simple Hole's PM is "Hole"; Forming Tool's Flip tool is its own box;
  // Linear / Circular Pattern read as SolidWorks (directions first, ⇄ by the direction, Number of instances); the sketch
  // Linear Pattern's Direction 1 ends with Angle as Direction 2; Edge-Flange's message names the controls it has; the
  // sheet-metal and feature PMs grey ✓ until their selection is made, and a real click lights it; the plane pick of
  // Sketch / Base Flange greys ✓; and a sweep over every PM a sheet-metal shop opens: every selection box has an icon
  // and a prompt, every numeric box a unit (counts and ratios excepted), no two option buttons of a row share an icon.
  (function () {
    var T = 0.0598;
    var SM = 'p.units("in");\np.sheet(' + T + ', 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Top").line(0, -1.5, 4, -1.5).end();\n';
    var BOX = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(1);\n';
    var prof0 = null;
    function rfNHScr(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
    function rfNHEv(type, c) {
      (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }));
    }
    async function rfNHClickAt(c) { rfNHEv('mousemove', c); await wait(15); rfNHEv('mousedown', c); rfNHEv('mouseup', c); await wait(25); }
    // a real click a little off the middle of the edge through p (checked to be the edge under the cursor)
    async function rfNHClickEdge(p) {
      UI.setView('Isometric'); if (UI.finishViewAnimation) UI.finishViewAnimation(); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(40);
      var e = edgeNear(p), P = K.vec.add(e.mid, K.vec.scale(K.vec.sub(e.b, e.a), 0.1)), s = rfNHScr(P), r0 = $('viewport').getBoundingClientRect();
      var pe = UI.pickEdge(s[0] - r0.left, s[1] - r0.top);
      assert(pe && pe.edge && K.pointSegmentDistance(P, pe.edge.a, pe.edge.b) < 1e-6, 'the edge is under the cursor: ' + JSON.stringify(pe && pe.edge && pe.edge.mid));
      await rfNHClickAt(s); await idle();
    }
    function rfNHOk() { var b = D.querySelector('#pm .pm-ok'); return { grey: !!(b && b.classList.contains('disabled')), title: b ? b.title : '' }; }
    function rfNHGroups() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-group h4 .pm-gt'), function (t) { return t.textContent.trim(); }); }
    function rfNHRow(key) { return Array.prototype.slice.call(D.querySelectorAll('#pm [data-key^="' + key + ':"]')); }
    function rfNHIconMarkup(b) { var s = b.querySelector('svg'); return s ? s.innerHTML : ''; }
    function rfNHLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-row.pm-field > label, #pm .pm-row.check > label'), function (l) { return l.textContent.trim(); }); }
    async function rfNHPart(code) {
      if (UI.hasPM()) UI.pmCancel();
      if (UI.App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
      if (!prof0 && UI.Profiles) { prof0 = UI.Profiles.active ? (UI.Profiles.active() || {}).id || UI.Profiles.active() : null; }
      if (UI.Profiles && UI.Profiles.set) UI.Profiles.set('solidworks');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      if (UI.setSelection) UI.setSelection([]);
    }
    async function rfNHOpen(fn) { if (UI.hasPM()) UI.pmCancel(); if (UI.setSelection) UI.setSelection([]); await fn(); await wait(30); await idle(); }
    function rfNHRestore() { if (UI.hasPM()) UI.pmCancel(); if (UI.Profiles && UI.Profiles.set) UI.Profiles.set(typeof prof0 === 'string' && prof0 ? prof0 : 'solidworks'); }

    step('rfNH: Chamfer shows SolidWorks\' Chamfer Type row (Distance Distance pressed, the other four greyed and saying why), Equal distance; ✓ greys until an edge is clicked; Fillet shows Fillet Type (Constant Size pressed)', async function () {
      try {
        await rfNHPart(BOX);
        await rfNHOpen(function () { UI.cmdChamfer(); });
        assert(UI.hasPM() && UI.pmTitle() === 'Chamfer', 'Chamfer PM');
        assert(rfNHGroups()[0] === 'Chamfer Type', 'Chamfer Type first: ' + rfNHGroups().join('|'));
        var row = rfNHRow('_type');
        assert(row.map(function (b) { return b.getAttribute('aria-label'); }).join('|') === 'Angle Distance|Distance Distance|Vertex|Offset Face|Face Face', 'types: ' + row.map(function (b) { return b.getAttribute('aria-label'); }).join('|'));
        assert(row[1].getAttribute('aria-checked') === 'true' && !row[1].disabled, 'Distance Distance pressed');
        assert([0, 2, 3, 4].every(function (i) { return row[i].disabled && /not available/.test(row[i].title); }), 'the others greyed with a reason');
        row[0].click(); await wait(20);
        assert(UI.pmSpec().values._type === 'dd', 'a greyed type does not press');
        var eq = pmField('Equal distance');
        assert(eq && eq.checked && eq.disabled, 'Equal distance ticked (the chamfer Anvil builds)');
        var ok = rfNHOk();
        assert(ok.grey && /Select at least one edge/.test(ok.title), '✓ greyed with nothing picked: ' + ok.title);
        await rfNHClickEdge([4, 2, 0.5]);
        assert(UI.pmSpec().values.edges.length === 1, 'edge taken by the click: ' + statusText());
        assert(!rfNHOk().grey, '✓ lit after the click');
        var n0 = UI.App.model.features.length;
        await pmAccept();
        var f = UI.App.model.features[UI.App.model.features.length - 1];
        assert(UI.App.model.features.length === n0 + 1 && f.type === 'chamfer' && f._type === undefined && f._equal === undefined, 'chamfer made, no PM-only values in it: ' + JSON.stringify(f));
        await rfNHOpen(function () { UI.cmdFillet(); });
        assert(rfNHGroups()[0] === 'Fillet Type', 'Fillet Type first: ' + rfNHGroups().join('|'));
        row = rfNHRow('_type');
        assert(row.map(function (b) { return b.getAttribute('aria-label'); }).join('|') === 'Constant Size Fillet|Variable Size Fillet|Face Fillet|Full Round Fillet' && row[0].getAttribute('aria-checked') === 'true' && row.slice(1).every(function (b) { return b.disabled; }), 'fillet types');
        assert(rfNHOk().grey, 'Fillet ✓ greyed with nothing picked');
        return 'Chamfer Type 5 (1 live), ✓ greyed → lit by a click; Fillet Type 4 (1 live)';
      } finally { rfNHRestore(); }
    });

    step('rfNH: option rows never show one drawing on two buttons: Rib Thickness (was the Rib icon three times) and Miter Flange position (was the Hem\'s curls) show three different options; Hem keeps its two drawings', async function () {
      try {
        await rfNHPart(SM);
        function distinct(key, want) {
          var row = rfNHRow(key);
          assert(row.length === want.length && row.map(function (b) { return b.getAttribute('aria-label'); }).join('|') === want.join('|'), key + ' options: ' + row.map(function (b) { return b.getAttribute('aria-label'); }).join('|'));
          var looks = row.map(function (b) { return rfNHIconMarkup(b) || 'words:' + b.textContent; });
          assert(looks.every(function (m, i) { return looks.indexOf(m) === i; }), key + ': two buttons look the same');
          assert(row.every(function (b) { return rfNHIconMarkup(b) || b.textContent.trim() === b.getAttribute('aria-label'); }), key + ': each button shows its own drawing or its name');
          return row;
        }
        await rfNHOpen(function () { UI.cmdRib(); });
        assert(UI.pmTitle() === 'Rib', 'Rib PM');
        var rib = distinct('side', ['First Side', 'Both Sides', 'Second Side']);
        rib[0].click(); await wait(20);
        assert(UI.pmSpec().values.side === 'one' && rfNHRow('side')[0].getAttribute('aria-checked') === 'true', 'First Side pressed by a click');
        await rfNHOpen(function () { UI.cmdMiterFlange(); });
        assert(UI.pmTitle() === 'Miter Flange', 'Miter Flange PM');
        var mi = distinct('position', ['Material Inside', 'Material Outside', 'Bend Outside']);
        var hemLooks = [W.Icons('hemInside', 16), W.Icons('hemOutside', 16)].map(function (s) { return String(s).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); });
        assert(mi.every(function (b) { return hemLooks.indexOf(rfNHIconMarkup(b)) < 0; }), 'Miter Flange position does not show the hem drawings');
        await rfNHOpen(function () { UI.cmdHem(); });
        distinct('hemPosition', ['Material Inside', 'Bend Outside']);
        distinct('hemType', ['Closed', 'Open', 'Tear Drop', 'Rolled']);
        return 'Rib ' + (rfNHIconMarkup(rib[0]) ? 'icons' : 'words') + ', Miter ' + (rfNHIconMarkup(mi[0]) ? 'icons' : 'words');
      } finally { rfNHRestore(); }
    });

    step('rfNH: Mirror asks for the "Feature to mirror" (it said Feature to pattern); Sheet Metal ▸ Simple Hole opens the "Hole" PM (it said Hole Wizard); Forming Tool\'s Flip tool is its own box (it was a ⇄ on Position X)', async function () {
      try {
        await rfNHPart(BOX);
        await rfNHOpen(function () { UI.cmdMirror(); });
        var labs = rfNHLabels();
        assert(labs.indexOf('Feature to mirror') >= 0 && labs.indexOf('Feature to pattern') < 0, 'Mirror labels: ' + labs.join('|'));
        await rfNHPart(SM);
        UI.setRibbonTab('Sheet Metal'); await wait(20);
        var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === 'Simple Hole'; })[0];
        assert(b, 'Simple Hole on the Sheet Metal tab');
        b.click(); await wait(30);
        assert(UI.hasPM() && UI.pmTitle() === 'Hole', 'Simple Hole PM title: ' + (UI.hasPM() && UI.pmTitle()));
        assert(rfNHOk().grey, 'Hole ✓ greyed until a face is clicked');
        await rfNHOpen(function () { UI.cmdFormingTool(); });
        var flip = pmField('Flip tool');
        assert(flip && flip.type === 'checkbox' && !flip.closest('.pm-rev'), 'Flip tool is a check box of its own');
        assert(!D.querySelector('#pm .pm-has-rev [data-key="atU"]') && !pmField('Reverse direction'), 'no ⇄ on Position X');
        return 'labels / titles as SolidWorks';
      } finally { rfNHRestore(); }
    });

    step('rfNH: Linear Pattern reads as SolidWorks: Direction 1, Direction 2, then Features to Pattern; ⇄ Reverse direction beside the Direction list; Number of instances. Circular Pattern: Direction 1 first, Number of instances', async function () {
      try {
        await rfNHPart(BOX);
        // rfNN: the feature picked in the FeatureManager first (with nothing selected Features to Pattern is empty)
        await rfNHOpen(function () { var fs = UI.App.model.features.filter(function (f) { return f.type !== 'sketch'; }); D.querySelector('#tree .ti[data-fid="' + fs[fs.length - 1].id + '"]').click(); UI.cmdLinearPattern(); });
        var g = rfNHGroups();
        assert(g.indexOf('Direction 1') === 0 && g.indexOf('Features to Pattern') > g.indexOf('Direction 2'), 'groups: ' + g.join('|'));
        var rev = D.querySelector('#pm .pm-has-rev select[data-key="d1"]');
        assert(rev && rev.parentNode.querySelector('.pm-rev input[data-key="rev1"]'), '⇄ beside Direction 1');
        assert(pmField('Number of instances') && pmField('Number of instances').getAttribute('data-key') === 'n1', 'Number of instances');
        var n0 = UI.App.model.features.length;
        setInput(pmField('Number of instances'), '2'); await wait(20);
        await pmAccept();
        assert(UI.App.model.features.length === n0 + 1 && UI.App.model.features[n0].n1 === 2, 'pattern made: ' + JSON.stringify(UI.App.model.features[n0]));
        await rfNHOpen(function () { UI.cmdCircularPattern(); });
        g = rfNHGroups();
        assert(g[0] === 'Direction 1' && g.indexOf('Features to Pattern') > 0, 'circular groups: ' + g.join('|'));
        assert(pmField('Number of instances') && pmField('Number of instances').getAttribute('data-key') === 'n', 'circular Number of instances');
        return g.join(' · ');
      } finally { rfNHRestore(); }
    });

    step('rfNH: sketch Linear Pattern: Direction 1 ends with Angle after Display instance count, as Direction 2 (SolidWorks\' order)', async function () {
      try {
        await rfNHPart('p.units("in");\np.sketch("Front").circle(1, 1, 0.25).end();');
        var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
        UI.editSketch(sk.id); await idle();
        UI.setSelection([{ kind: 'entity', index: 0 }]);
        await rfNHOpen(function () { UI.cmdSketchPattern(); });
        var labs = rfNHLabels().join('|');
        var d1 = labs.indexOf('Number of instances|Display instance count|Angle'), d2 = labs.indexOf('Number of instances|Display instance count|Angle', d1 + 1);
        assert(d1 >= 0 && d2 > d1, 'both directions end Number of instances, Display instance count, Angle: ' + labs);
        return 'ok';
      } finally { rfNHRestore(); if (UI.App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true); }
    });

    step('rfNH: Edge-Flange\'s message names the ⇄ beside End condition (it told to "use Reverse", a box the PM does not have); ✓ greys until an edge is clicked, then lights', async function () {
      try {
        await rfNHPart(SM);
        await rfNHOpen(function () { UI.cmdEdgeFlange(); });
        var msg = D.querySelector('#pm .pm-msg').textContent;
        assert(/⇄ button beside End condition/.test(msg) && !/use Reverse/.test(msg), 'message: ' + msg);
        assert(D.querySelector('#pm .pm-has-rev select[data-key="lengthEnd"], #pm .pm-has-rev select') && D.querySelector('#pm .pm-rev'), 'the ⇄ is there');
        var ok = rfNHOk();
        assert(ok.grey && /Select at least one edge/.test(ok.title), '✓ greyed: ' + ok.title);
        await rfNHClickEdge([4, T, 1.5]);
        assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
        await wait(300);
        assert(!rfNHOk().grey, '✓ lit after the click');
        return 'ok';
      } finally { rfNHRestore(); }
    });

    step('rfNH: a spline\'s right-click Spline Tools rows use their own icons (splInsertPt, splSimplify … from the SolidWorks set), the Spline icon only where the active set has none', async function () {
      try {
        await rfNHPart('p.units("in");\np.sketch("Front").spline([[0, 0], [1, 1], [2, 0], [3, 1]]).end();');
        var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0];
        var idx = sk.entities.map(function (e) { return e.t; }).indexOf('spline');
        assert(idx >= 0, 'a spline: ' + JSON.stringify(sk.entities.map(function (e) { return e.t; })));
        var rows = UI.splineMenuItems(sk, idx).filter(function (r) { return r.label; });
        var want = { 'Insert Spline Point': 'splInsertPt', 'Simplify Spline…': 'splSimplify', 'Relax Spline': 'splRelax', 'Add Tangency Control': 'splTangency', 'Add Curvature Control': 'splCurvCtrl',
          'Show Inflection Points': 'splInflection', 'Show Spline Handles': 'splHandles', 'Show Curvature': 'splCurvature', 'Show Minimum Radius': 'splMinRadius' };
        var bad = rows.filter(function (r) { var n = want[r.label]; return !n || r.icon !== (W.Icons.has(n) ? n : 'spline'); }).map(function (r) { return r.label + '=' + r.icon; });
        assert(rows.length >= 4 && !bad.length, 'rows: ' + bad.join(', ') + ' of ' + rows.map(function (r) { return r.label; }).join('|'));
        return rows.length + ' rows, ' + rows.filter(function (r) { return r.icon !== 'spline'; }).length + ' with their own icon';
      } finally { rfNHRestore(); }
    });

    step('rfNH: with nothing selected, ✓ is greyed and its tooltip says what to select (it took the click and refused with a toast): Hem, Closed Corner, Corner Relief, Break Corner, Cross-Break, Rip, Forming Tool, Welded Corner, Vent, Hole Wizard, Delete/Keep Body, Unfold (no bends); Sketch and Base Flange\'s plane pick', async function () {
      try {
        await rfNHPart(SM);
        var C = [['Hem', /Select at least one edge/], ['ClosedCorner', /face to extend/], ['CornerRelief', /corner/], ['BreakCorner', /corner edge or face/], ['CrossBreak', /planar face/], ['RipFeature', /edge to rip/],
          ['FormingTool', /flat face/], ['WeldedCorner', /side face/], ['Vent', /vent/], ['HoleWizard', /Click a face/], ['Unfold', /no bends/]];
        var bad = [];
        for (var i = 0; i < C.length; i++) {
          await rfNHOpen(function () { UI['cmd' + C[i][0]](); });
          var ok = rfNHOk();
          if (!UI.hasPM() || !ok.grey || !C[i][1].test(ok.title)) bad.push(C[i][0] + ': ' + (UI.hasPM() ? UI.pmTitle() + ' ' + ok.grey + ' "' + ok.title + '"' : 'no PM'));
          else {
            var n0 = UI.App.model.features.length;
            D.querySelector('#pm .pm-ok').click(); await wait(20); await idle();
            if (!UI.hasPM() || UI.App.model.features.length !== n0) bad.push(C[i][0] + ': a click on the greyed ✓ did something');
          }
        }
        await rfNHPart(BOX);
        await rfNHOpen(function () { UI.cmdDeleteBody(); });
        if (!rfNHOk().grey) bad.push('Delete/Keep Body ✓ lit');
        await anvil.newPart(); await idle();
        await rfNHOpen(function () { UI.cmdSketch(); });
        if (!UI.hasPM() || !rfNHOk().grey) bad.push('Sketch plane pick ✓ lit');
        await rfNHOpen(function () { UI.cmdBaseFlange(); });
        if (!UI.hasPM() || UI.pmTitle() !== 'Base Flange/Tab' || !rfNHOk().grey) bad.push('Base Flange plane pick ✓ lit');
        assert(!bad.length, bad.join(' | '));
        return C.length + 3 + ' PMs';
      } finally { rfNHRestore(); }
    });

    // the sweep: every PM a sheet-metal shop opens (sketch tools, sketch commands, features, sheet metal, drawing)
    function rfNHSweepPM(where, bad) {
      if (!UI.hasPM()) { bad.push(where + ': no PM'); return; }
      Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-pick'), function (p) {
        if (!p.querySelector('svg')) bad.push(where + ': selection box with no icon');
        if (!p.textContent.trim() || /^Select…$/.test(p.textContent.trim())) bad.push(where + ': selection box with no prompt ("' + p.textContent.trim() + '")');
      });
      Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-row-num'), function (r) {
        var lab = (r.querySelector(':scope > label') || {}).textContent || '', u = (r.querySelector('.unit') || {}).textContent || '';
        if (!u && !/number of|instances|factor|bends per|sheets|sides|copies|degree/i.test(lab)) bad.push(where + ': "' + lab + '" has no unit');
      });
      Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-icons'), function (row) {
        var looks = Array.prototype.map.call(row.querySelectorAll('button'), function (b) { var s = b.querySelector('svg'); return s ? s.innerHTML : 'words:' + b.textContent; });
        looks.forEach(function (m, i) { if (looks.indexOf(m) !== i) bad.push(where + ': two buttons of "' + row.getAttribute('aria-label') + '" share an icon'); });
      });
    }
    step('rfNH: sweep, every PropertyManager a sheet-metal shop opens (sketch tools and commands, features, sheet metal, drawing): every selection box has an icon and a prompt, every numeric box a unit (counts and ratios excepted), no two option buttons of a row share an icon', async function () {
      var bad = [], n = 0;
      try {
        await rfNHPart(SM);
        var FEAT = ['EdgeFlange', 'MiterFlange', 'Hem', 'Jog', 'SketchedBend', 'ClosedCorner', 'CornerRelief', 'BreakCorner', 'Unfold', 'Fold', 'SheetMetal', 'Vent', 'CrossBreak', 'RipFeature', 'FormingTool', 'WeldedCorner', 'BaseFlange',
          'Extrude', 'Revolve', 'Fillet', 'Chamfer', 'HoleWizard', 'Hole', 'LinearPattern', 'CircularPattern', 'Mirror', 'Shell', 'Draft', 'Rib', 'Plane', 'RefAxis', 'RefPoint', 'Csys', 'Measure', 'DxfOutput', 'TNesting'];
        for (var i = 0; i < FEAT.length; i++) { await rfNHOpen(function () { UI['cmd' + FEAT[i]](); }); rfNHSweepPM(FEAT[i], bad); n++; }
        var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[1];
        if (UI.hasPM()) UI.pmCancel();
        UI.editSketch(sk.id); await idle();
        var TOOLS = ['line', 'rect', 'crect', 'circle', 'pcircle', 'arc', 'tarc', 'arc3', 'slot', 'aslot', 'polygon', 'spline', 'point', 'text'];
        for (i = 0; i < TOOLS.length; i++) { await rfNHOpen(function () { UI.setTool('select'); UI.setTool(TOOLS[i]); }); rfNHSweepPM('tool ' + TOOLS[i], bad); n++; }
        UI.setTool('select');
        var SKC = ['Centerline', 'SketchFillet', 'SketchChamfer', 'OffsetEntities', 'ConvertEntities', 'TrimEntities', 'ExtendEntities', 'MirrorEntities', 'SketchPattern', 'CircularSketchPattern', 'MoveEntities', 'CopyEntities', 'RotateEntities', 'ScaleEntities', 'AddRelations'];
        for (i = 0; i < SKC.length; i++) { await rfNHOpen(function () { UI.setTool('select'); UI['cmd' + SKC[i]](); }); rfNHSweepPM(SKC[i], bad); n++; }
        if (UI.hasPM()) UI.pmCancel();
        UI.setTool('select'); if (UI.exitSketch) UI.exitSketch(true); await idle();
        anvil.drawing.make(); if (UI.drawing && UI.drawing.ready) await UI.drawing.ready();
        var DW = [['View Layout', 'Model View'], ['View Layout', 'Section View'], ['View Layout', 'Detail View'], ['Annotation', 'Center Mark'], ['Annotation', 'Balloon'], ['Annotation', 'Bill of Materials'], ['Annotation', 'Model Items'], ['Annotation', 'Hole Table']];
        for (i = 0; i < DW.length; i++) {
          if (UI.escapeCommand) UI.escapeCommand();
          var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === DW[i][0]; })[0]; if (tab) tab.click();
          var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === DW[i][1]; })[0];
          if (!b) { bad.push('drawing ' + DW[i][1] + ': no ribbon button'); continue; }
          b.click(); await wait(40); await idle();
          rfNHSweepPM('drawing ' + DW[i][1], bad); n++;
        }
        if (UI.escapeCommand) UI.escapeCommand();
        assert(!bad.length, bad.join(' | '));
        return n + ' PropertyManagers';
      } finally {
        if (UI.escapeCommand) UI.escapeCommand();
        if (UI.closeDrawing && UI.drawingActive && UI.drawingActive()) UI.closeDrawing();
        rfNHRestore();
      }
    });
  })();
