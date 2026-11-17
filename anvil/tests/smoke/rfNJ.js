  // --- rfNJ (2026-11-16, lane uileft) --- UI that did not make sense, leftovers: a feature PropertyManager whose
  // feature cannot be built greys ✓ with the reason (SolidWorks does not take ✓ there): Extrude / Revolve / Loft on an
  // open sketch, a Rib that misses the body, Miter Flange, Swept Flange, Lofted-Bend, Shell, Tab, Boundary, Wrap,
  // Projected Curve (they built a failed feature, or took ✓ and refused with a toast); a real click on the greyed ✓
  // builds nothing and says why; fixing the input lights it. The View Settings rows keep "When still" out of the key
  // column; the Mastercam right-click menu gives every row its own icon; Chamfer / Fillet types not built say so in
  // their tooltip.
  (function () {
    var T = 0.0598;
    // a Base Flange plus a sketch holding one line (the user's repro)
    var SM = 'p.units("in");\np.sheet(' + T + ', 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Top").line(0, -1.5, 4, -1.5).end();\n';
    // the same with a closed sketch (a circle on the flange) made before the line sketch
    var SM2 = 'p.units("in");\np.sheet(' + T + ', 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Top").circle(2, -1.5, 0.5).end();\np.sketch("Top").line(0, -1.5, 4, -1.5).end();\n';
    var BOX = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(1);\n';
    var prof0 = null;
    function rfNJOk() { var b = D.querySelector('#pm .pm-ok'); return { grey: !!(b && b.classList.contains('disabled')), title: b ? b.title : '' }; }
    function rfNJFeats() { return UI.App.model.features.length; }
    // a real click on ✓ (press, release, click at its middle)
    async function rfNJClickOk() {
      var b = D.querySelector('#pm .pm-ok'), r = b.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      ['mousedown', 'mouseup', 'click'].forEach(function (t) { b.dispatchEvent(new W.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, buttons: t === 'mousedown' ? 1 : 0, clientX: x, clientY: y })); });
      await wait(40); await idle();
    }
    async function rfNJSettle() { if (UI.previewIdle) await UI.previewIdle(); await wait(320); await idle(); }   // the ✓ state is polled every 250 ms
    async function rfNJPart(code) {
      if (UI.hasPM()) UI.pmCancel();
      if (UI.App.mode === 'sketch' && UI.exitSketch) UI.exitSketch(true);
      if (!prof0 && UI.Profiles) { prof0 = UI.Profiles.active ? (UI.Profiles.active() || {}).id || UI.Profiles.active() : null; }
      if (UI.Profiles && UI.Profiles.set) UI.Profiles.set('solidworks');
      if (UI.sheetMetalMemory) UI.sheetMetalMemory(null);
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      if (UI.setSelection) UI.setSelection([]);
    }
    async function rfNJOpen(fn) { if (UI.hasPM()) UI.pmCancel(); if (UI.setSelection) UI.setSelection([]); await fn(); await wait(30); await idle(); await rfNJSettle(); }
    function rfNJRestore() { if (UI.hasPM()) UI.pmCancel(); if (UI.closeMenus) UI.closeMenus(); if (UI.Profiles && UI.Profiles.set) UI.Profiles.set(typeof prof0 === 'string' && prof0 ? prof0 : 'solidworks'); }
    // the command's ✓ is greyed with a reason matching rx; a real click on it builds nothing, keeps the PM open and
    // puts the reason in the status bar
    async function rfNJBlocked(name, open, title, rx) {
      await rfNJOpen(open);
      assert(UI.hasPM() && UI.pmTitle() === title, name + ' PM: ' + (UI.hasPM() && UI.pmTitle()));
      var ok = rfNJOk();
      assert(ok.grey && rx.test(ok.title), name + ': ✓ greyed with the reason: ' + ok.title);
      var n0 = rfNJFeats();
      await rfNJClickOk();
      assert(rfNJFeats() === n0 && UI.hasPM() && UI.pmTitle() === title, name + ': the click on the greyed ✓ built nothing and kept the PM (' + (rfNJFeats() - n0) + ' features added)');
      assert(rx.test(statusText()), name + ': the status bar says why: ' + statusText());
      return ok.title.replace(/^OK \(Enter\) — /, '');
    }

    step('rfNJ: on a Base Flange with a sketch holding one line, Boss-Extrude, Revolve, Loft and Tab grey ✓ ("has no closed profile"), a click on it builds nothing; picking the closed sketch in the Extrude PM lights ✓ and a click builds the boss', async function () {
      try {
        await rfNJPart(SM2);
        var out = [];
        out.push(await rfNJBlocked('Boss-Extrude', function () { UI.cmdExtrude(); }, 'Boss-Extrude', /has no closed profile/));
        // pick the closed sketch in the Sketch box: ✓ lights, a click builds the boss
        var sel = D.querySelector('#pm select[data-key="sketch"]');
        assert(sel, 'the sketch box');
        var closedId = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[1].id;
        sel.value = String(closedId); sel.dispatchEvent(new W.Event('change', { bubbles: true }));
        await rfNJSettle();
        assert(!rfNJOk().grey, '✓ lit with the closed sketch: ' + rfNJOk().title);
        var n0 = rfNJFeats();
        await rfNJClickOk();
        var f = UI.App.model.features[UI.App.model.features.length - 1];
        assert(rfNJFeats() === n0 + 1 && f.type === 'extrude' && !UI.App.build.errors[f.id], 'the boss built: ' + JSON.stringify(UI.App.build.errors));
        await rfNJPart(SM);
        out.push(await rfNJBlocked('Revolve', function () { UI.cmdRevolve(); }, 'Revolve', /has no closed profile/));
        out.push(await rfNJBlocked('Loft', function () { UI.cmdLoft(); }, 'Loft', /closed profile|two different sketches/));
        out.push(await rfNJBlocked('Tab', function () { UI.cmdBaseFlange(); }, 'Base Flange/Tab', /has no closed profile/));
        return out.join(' | ');
      } finally { rfNJRestore(); }
    });

    step('rfNJ: features the kernel refuses grey ✓ with its message: Rib that misses the body, Miter Flange off its edge, Swept Flange and Lofted-Bend on a rectangle, Shell too thick for the sheet; typing a thin Shell wall lights ✓', async function () {
      try {
        await rfNJPart(SM);
        var out = [];
        out.push(await rfNJBlocked('Rib', function () { UI.cmdRib(); }, 'Rib', /cannot be built: .*rib/i));
        out.push(await rfNJBlocked('Miter Flange', function () { UI.cmdMiterFlange(); }, 'Miter Flange', /cannot be built: Miter Flange/));
        out.push(await rfNJBlocked('Swept Flange', function () { UI.cmdSweptFlange(); }, 'Swept Flange', /cannot be built: Swept Flange/));
        out.push(await rfNJBlocked('Lofted-Bend', function () { UI.cmdLoftedBend(); }, 'Lofted-Bend', /cannot be built: Lofted-Bend/));
        out.push(await rfNJBlocked('Shell', function () { UI.cmdShell(); }, 'Shell', /cannot be built: Shell thickness/));
        var inp = pmField('Thickness  D1');
        assert(inp, 'the Thickness box');
        setInput(inp, '0.01'); await rfNJSettle();
        assert(!rfNJOk().grey, '✓ lit with a 0.01 in wall: ' + rfNJOk().title);
        return out.join(' | ');
      } finally { rfNJRestore(); }
    });

    step('rfNJ: Boundary, Wrap and Projected Curve grey ✓ with what is missing (they took ✓ and refused with a toast)', async function () {
      try {
        await rfNJPart(SM);
        var out = [];
        out.push(await rfNJBlocked('Boundary', function () { UI.cmdBoundary(); }, 'Boundary', /two profiles/));
        out.push(await rfNJBlocked('Wrap', function () { UI.cmdWrap(); }, 'Wrap', /Click the face|Select the sketch to wrap/));
        out.push(await rfNJBlocked('Projected Curve', function () { UI.cmdProjectedCurve(); }, 'Projected Curve', /\S/));
        return out.join(' | ');
      } finally { rfNJRestore(); }
    });

    step('rfNJ: a zero Jog offset greys ✓ (it toasted on ✓); a valid Jog keeps ✓ lit', async function () {
      try {
        await rfNJPart(SM);
        await rfNJOpen(function () { UI.cmdJog(); });
        assert(UI.hasPM() && UI.pmTitle() === 'Jog' && !rfNJOk().grey, 'Jog ✓ lit on the line: ' + rfNJOk().title);
        var off = pmField('Offset') || pmField('Offset distance') || pmField('Distance');
        assert(off, 'the Jog offset box');
        setInput(off, '0'); await rfNJSettle();
        assert(rfNJOk().grey && /offset must be greater than zero/.test(rfNJOk().title), 'zero offset greys ✓: ' + rfNJOk().title);
        var n0 = rfNJFeats();
        await rfNJClickOk();
        assert(rfNJFeats() === n0 && UI.hasPM(), 'nothing built');
        return 'Jog offset 0 greyed';
      } finally { rfNJRestore(); }
    });

    step('rfNJ: Chamfer / Fillet types not built say so in their tooltip the SolidWorks way (name, what the type does, why it is greyed, what to use) and in the status bar on hover', async function () {
      try {
        await rfNJPart(BOX);
        await rfNJOpen(function () { UI.cmdChamfer(); });
        var row = Array.prototype.slice.call(D.querySelectorAll('#pm [data-key^="_type:"]'));
        assert(row.length === 5, 'five chamfer types');
        var ad = row[0];
        assert(ad.disabled && /^Angle Distance: a chamfer set by a distance along one face and an angle\n.*not available in Anvil yet \(not built\): use Distance Distance with Equal distance\.$/.test(ad.title), 'Angle Distance tooltip: ' + JSON.stringify(ad.title));
        assert(!row[1].disabled && !/not available/.test(row[1].title) && /^Distance Distance: /.test(row[1].title), 'Distance Distance tooltip: ' + row[1].title);
        ad.dispatchEvent(new W.MouseEvent('mouseenter', { bubbles: false }));
        assert(/Angle Distance: .*not built/.test(statusText()), 'status bar on hover: ' + statusText());
        await rfNJOpen(function () { UI.cmdFillet(); });
        row = Array.prototype.slice.call(D.querySelectorAll('#pm [data-key^="_type:"]'));
        assert(row.slice(1).every(function (b) { return b.disabled && /not built\): use Constant Size Fillet\.$/.test(b.title); }) && /^Constant Size Fillet: one radius/.test(row[0].title), 'fillet tooltips: ' + row.map(function (b) { return b.title; }).join(' / '));
        return ad.title.replace(/\n/, ' / ');
      } finally { rfNJRestore(); }
    });

    step('rfNJ: View Settings ▸ Ambient Occlusion held back by the governor shows its note beside the name and in the help line, not in the key column (it showed "When still" / "Held back" where keys go)', async function () {
      var G = UI.renderFx && UI.renderFx.governor;
      if (!G) return 'no governor in this build';
      var ao0 = UI.ambientOcclusion();
      try {
        G.reset({ auto: false, slowGuess: false });
        UI.setAmbientOcclusion(true);
        G.setScene('rfNJ-ao');
        G.feed('move', 6, {}); for (var i = 0; i < 4; i++) G.feed('sample', 100, {});
        G.feed('first', 400, { ao: 'full' });
        var row = UI.depthFxMenuItems().filter(function (r) { return /Ambient Occlusion/.test(r.label); })[0];
        assert(row && !row.key, 'no key on the row: ' + JSON.stringify(row && row.key));
        assert(/^(Held back|Half resolution)$/.test(row.note || '') && /^Ambient Occlusion \((held back|half resolution)\)$/.test(row.label) && /^Ambient Occlusion: .*too slowly/.test(row.help || ''), 'note beside the name and in the help: ' + JSON.stringify({ l: row.label, h: row.help }));
        var rows = UI.depthFxMenuItems();
        assert(rows.every(function (r) { return !r.key; }), 'no row has a key: ' + rows.map(function (r) { return r.key; }).join(','));
        return row.label;
      } finally { G.reset({ auto: false, slowGuess: false }); UI.setAmbientOcclusion(ao0); }
    });

    step('rfNJ: the Mastercam right-click menu gives every row an icon of its own (Unzoom 80 %, Dynamic Rotation, the views, GView, Delete had none; Analyze Entity Properties showed Analyze Distance\'s ruler)', async function () {
      try {
        await rfNJPart(BOX);
        if (UI.Profiles && UI.Profiles.set) UI.Profiles.set('mastercam');
        var items = UI.mastercamMenuItems(null).filter(function (it) { return !it.sep; });
        var noIcon = items.filter(function (it) { return !it.icon; }).map(function (it) { return it.label; });
        assert(!noIcon.length, 'rows without an icon: ' + noIcon.join(', '));
        var looks = items.map(function (it) { return W.Icons(it.icon, 16); });
        var same = [];
        looks.forEach(function (m, i) { var j = looks.indexOf(m); if (j !== i) same.push(items[j].label + ' = ' + items[i].label); });
        assert(!same.length, 'rows sharing a drawing: ' + same.join(', '));
        var gv = items.filter(function (it) { return it.label === 'GView'; })[0];
        assert(gv.items.every(function (it) { return it.icon && W.Icons.has(it.icon); }), 'GView rows have icons');
        assert(W.Icons.has('analyzeEntity') && W.Icons.has('dynRotate') && W.Icons.has('gview'), 'the new icons are drawn');
        // the menu as opened by a right-click shows them
        var r = $('viewport').getBoundingClientRect();
        $('viewport').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 0, clientX: Math.round(r.left + 30), clientY: Math.round(r.top + 30) }));
        await wait(60);
        var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return /Analyze Entity Properties|Unzoom 80/.test(m.textContent); });
        assert(mi.length === 2 && mi.every(function (m) { return m.querySelector('svg'); }), 'the open menu draws the icons: ' + mi.length);
        return items.length + ' rows, ' + items.length + ' drawings';
      } finally { rfNJRestore(); }
    });
  })();
