  // --- rfK (sheet-metal fidelity audit, test-reports/2026-10-12-sheetmetal-fidelity.md): the PropertyManager never
  //     clips a group's last row, Base Flange/Tab without a sketch asks for a plane, and a 16 ga golden flat ---
  var RFK_BASE = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();';
  function rfKGroup(title) { return Array.prototype.filter.call(D.querySelectorAll('#pm .pm-group'), function (g) { return g.querySelector('h4').textContent.trim() === title; })[0]; }
  step('rfK/pm: the Edge-Flange PropertyManager in a frame shorter than its content — no group shrinks (its fields stay inside its box, the Reverse direction check and the Sheet metal parameters… button are reachable), the Message box keeps its text, the PM scrolls instead; the relief group reads Custom Relief Type', async function () {
    await anvil.run(RFK_BASE); await idle();
    UI.cmdEdgeFlange();
    assert(UI.hasPM(), 'Edge-Flange PM');
    var pmEl = $('pm'), groups = D.querySelectorAll('#pm .pm-group');
    assert(groups.length >= 8 && pmEl.scrollHeight > pmEl.clientHeight, 'a PM taller than the panel: ' + groups.length + ' groups, ' + pmEl.scrollHeight + ' > ' + pmEl.clientHeight);
    Array.prototype.forEach.call(groups, function (g) {
      if (g.classList.contains('collapsed')) return;
      var gr = g.getBoundingClientRect(), fr = g.querySelector('.pm-fields').getBoundingClientRect();
      assert(fr.bottom <= gr.bottom + 0.5 && fr.top >= gr.top, g.querySelector('h4').textContent.trim() + ': fields ' + Math.round(fr.top) + '-' + Math.round(fr.bottom) + ' outside the group ' + Math.round(gr.top) + '-' + Math.round(gr.bottom));
    });
    var msg = D.querySelector('#pm .pm-msg');
    assert(msg && msg.scrollHeight <= msg.clientHeight + 1, 'the Message box shows all of its text (' + (msg && msg.scrollHeight) + ' / ' + (msg && msg.clientHeight) + ')');
    var rev = D.querySelector('#pm input[type=checkbox][data-key="reverse"]'), rr = rev.getBoundingClientRect(), gl = rfKGroup('Flange Length').getBoundingClientRect();
    assert(rr.bottom <= gl.bottom + 0.5, 'Reverse direction inside Flange Length: ' + Math.round(rr.bottom) + ' / ' + Math.round(gl.bottom));
    rev.scrollIntoView({ block: 'center' });
    var hit = D.elementFromPoint(rr.left + rr.width / 2, rev.getBoundingClientRect().top + rr.height / 2);
    assert(hit === rev, 'the check is what the mouse reaches: ' + (hit && hit.tagName + '.' + hit.className));
    assert(rfKGroup('Custom Relief Type') && !rfKGroup('Auto Relief'), 'Custom Relief Type group');
    assert(rfKGroup('Sheet').querySelector('button') && rfKGroup('Sheet').querySelector('button').getBoundingClientRect().bottom <= rfKGroup('Sheet').getBoundingClientRect().bottom + 0.5, 'Sheet metal parameters… inside its group');
    UI.pmCancel();
    return groups.length + ' groups, PM ' + pmEl.scrollHeight + ' px in ' + pmEl.clientHeight;
  });
  step('rfK/base: Base Flange/Tab on a part with no sketch asks for a plane (Top Plane opens the sketch); a rectangle drawn, Exit Sketch brings the Base Flange/Tab PM back on that sketch and ✓ makes Base-Flange1; an empty sketch is discarded and nothing reopens', async function () {
    await anvil.run('p.units("in");'); await idle();
    var errs0 = errors.length;
    UI.cmdBaseFlange();
    assert(UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Base Flange/Tab' && UI.App.command && UI.App.command.pickPlane, 'the plane picker');
    clickPmButton('Top Plane'); await idle();
    assert(UI.App.mode === 'sketch', 'sketch mode');
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: -3, x2: 4, y2: -3 }, { t: 'line', x1: 4, y1: -3, x2: 4, y2: 0 }, { t: 'line', x1: 4, y1: 0, x2: 0, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: -3 }); UI.updateSketches();
    await UI.exitSketch(); await idle(); await wait(50);
    assert(UI.App.mode === 'part' && UI.hasPM() && D.querySelector('#pm .pm-head span').textContent === 'Base Flange/Tab' && pmField('Thickness'), 'Base Flange/Tab PM after Exit Sketch: ' + (UI.hasPM() && D.querySelector('#pm .pm-head span').textContent));
    setInput(pmField('Thickness'), 0.0598); setInput(pmField('Bend radius'), 0.0598);
    await pmAccept();
    var names = UI.App.model.features.map(function (q) { return q.name; });
    assert(names.join() === 'Sketch1,Base-Flange1' && UI.App.model.sheet && UI.App.model.sheet.thickness === 0.0598, 'features ' + names.join() + ' sheet ' + JSON.stringify(UI.App.model.sheet));
    near(anvil.flat().size[0], 4, 1e-9, 'flat 4'); near(anvil.flat().size[1], 3, 1e-9, 'flat 3');
    // an empty sketch: discarded, no PM
    await anvil.run('p.units("in");'); await idle();
    UI.cmdBaseFlange(); clickPmButton('Front Plane'); await idle();
    await UI.exitSketch(); await idle(); await wait(50);
    assert(!UI.hasPM() && UI.App.model.features.length === 0, 'empty sketch discarded, nothing reopened: ' + UI.App.model.features.length + ' features, PM ' + UI.hasPM());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return names.join(', ');
  });
  step('rfK/golden: 16 ga (T = R = .0598, K .44) 4 × 3 base, Edge-Flange 1.5 Material Inside / Outer Virtual Sharp through the PM: flat 4 + 1.5 − BD = 5.39606 (BA .13526, BD .10394, bend line at 3.948, note UP 90° R.060); Material Outside 5.45586, Bend Outside 5.51566; Reverse direction makes it DOWN', async function () {
    var T = 0.0598, Kf = 0.44, BA = Math.PI / 2 * (T + Kf * T), BD = 2 * (T + T) - BA;
    near(BA, 0.135264, 1e-6, 'hand BA'); near(BD, 0.103936, 1e-6, 'hand BD');
    async function flange(position, reverse) {
      await anvil.run(RFK_BASE); await idle();
      UI.cmdEdgeFlange();
      assert(UI.App.command.onPick({ kind: 'edge', edge: edgeNear([4, 0.0598, 1.5]) }) !== false, 'edge pick');
      setInput(pmField('Length'), 1.5); setInput(pmField('Flange angle'), 90);
      var ovs = D.querySelector('#pm [data-key="lengthRef:outer"]'); ovs.click();
      setInput(pmField('Position'), position);
      var rev = D.querySelector('#pm input[type=checkbox][data-key="reverse"]'); if (rev.checked !== !!reverse) rev.click();
      await pmAccept();
      var s = anvil.summary(); assert(Object.keys(s.errors).length === 0, JSON.stringify(s.errors));
      return anvil.flat();
    }
    var fl = await flange('inside', false);
    near(fl.size[0], 4 + 1.5 - BD, 1e-9, 'Material Inside flat'); near(fl.size[1], 3, 1e-9, 'width');
    assert(fl.bends.length === 1 && fl.bends[0].up && fl.bends[0].angle === 90, 'one UP 90° bend ' + JSON.stringify(fl.bends[0]));
    near(fl.bends[0].ba, BA, 1e-9, 'BA'); near(fl.bends[0].bd, BD, 1e-9, 'BD');
    near(fl.bends[0].a[0], 4 - (T + T) + BA / 2, 1e-9, 'bend line at the middle of the allowance (3.948)');
    assert(K.bendNoteText(fl.bends[0], 'in') === 'UP 90° R.060', 'note ' + K.bendNoteText(fl.bends[0], 'in'));
    near((await flange('outside', false)).size[0], 4 + T + 1.5 - BD, 1e-9, 'Material Outside flat');
    near((await flange('bendOutside', false)).size[0], 4 + T + T + 1.5 - BD, 1e-9, 'Bend Outside flat');
    var rv = await flange('inside', true);
    near(rv.size[0], 4 + 1.5 - BD, 1e-9, 'reverse flat'); assert(!rv.bends[0].up && K.bendNoteText(rv.bends[0], 'in') === 'DOWN 90° R.060', 'reverse: DOWN ' + JSON.stringify(rv.bends[0]));
    return 'flat ' + fmt(fl.size[0]) + ' × ' + fmt(fl.size[1]) + ', BA ' + fmt(BA) + ', BD ' + fmt(BD);
  });
  // --- end rfK ---
