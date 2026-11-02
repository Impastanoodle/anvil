  // --- rfGU (2026-11-02, lane thickness) --- Evaluate ▸ Thickness Analysis: the ribbon button is live, Calculate colours the
  // part from Target thickness, Show thin / thick regions and Treat corners as zero thickness, the results read the wall,
  // and the colours go when the PropertyManager closes.
  function rfGUBtn() {
    UI.App.ribbonTab = 'Evaluate'; UI.refreshRibbon();
    var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return /Thickness Analysis/.test(x.textContent + ' ' + (x.title || '')); })[0];
    assert(b, 'Thickness Analysis button');
    assert(!b.disabled && !/disabled|greyed/.test(b.className), 'Thickness Analysis is enabled');
    return b;
  }
  function rfGUCalc() {
    var b = Array.prototype.filter.call(D.querySelectorAll('#pm button'), function (x) { return x.textContent.trim() === 'Calculate'; })[0];
    assert(b, 'Calculate button');
    b.click();
  }
  function rfGUColors() {
    var o = UI.evaluate.analysisGroup().children[0];
    assert(o && o.geometry.getAttribute('color'), 'the analysis overlay has colours');
    return o.geometry.getAttribute('color').array;
  }
  step('rfGU: Thickness Analysis opens from the Evaluate ribbon with Target thickness, thin / thick regions, corners; Calculate reports the .125 wall of a shell and colours the part; closing removes the colours', async function () {
    await anvil.newPart('Thick'); await idle();
    await anvil.run('p.units("in"); p.box(6, 5, 4); p.shell(0.125, [[3, 4, 2]]);'); await idle();
    rfGUBtn().click();
    await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Thickness Analysis', 'PropertyManager: ' + UI.pmTitle());
    var txt = D.querySelector('#pm').textContent;
    ['Target thickness', 'Show thin regions', 'Show thick regions', 'Treat corners as zero thickness', 'Calculate'].forEach(function (s) { assert(txt.indexOf(s) >= 0, 'PM has ' + s); });
    near(UI.evaluate.thicknessValues().target, 0.125, 1e-3, 'the target starts at the part\'s thinnest wall');
    assert(UI.evaluate.display() === null, 'nothing coloured before Calculate');
    rfGUCalc();
    await idle();
    assert(UI.evaluate.display() === 'thickness', 'the display is on');
    var r = UI.evaluate.thickness();
    near(r.min, 0.125, 1e-6, 'min'); near(r.max, 0.125, 1e-6, 'max');
    var c = rfGUColors();
    assert(c.length === r.samples * 9, 'one colour per cell vertex');
    assert(/Thickness distribution/.test(D.querySelector('#pm').textContent) && D.querySelector('#pm .th-scale'), 'results and scale in the PM');
    assert(/minimum .*maximum/.test(statusText()), 'status: ' + statusText());
    await pmAccept();
    await idle();
    assert(UI.evaluate.display() === null && UI.evaluate.analysisGroup().children.length === 0, 'colours removed on close');
  });
  step('rfGU: Show thin regions greys walls over the target, Show thick regions greys walls under it; Treat corners as zero thickness takes min to 0', async function () {
    await anvil.newPart('Thick2'); await idle();
    await anvil.run('p.units("in"); p.box(4, 4, 0.5); p.sketch("Top", 0.5).centerRect(1, -2, 2, 4).cut(0.25, { reverse: true });'); await idle();
    rfGUBtn().click(); await idle();
    var v = UI.evaluate.thicknessValues();
    v.target = 0.3; v.limit = 0.6;
    rfGUCalc(); await idle();
    var r = UI.evaluate.thickness();
    near(r.min, 0.25, 1e-6, 'min'); near(r.max, 0.5, 1e-6, 'max');
    function greys() { var c = rfGUColors(), g = 0; for (var i = 0; i < c.length; i += 9) if (Math.abs(c[i] - 0.62) < 1e-3 && Math.abs(c[i + 2] - 0.66) < 1e-3) g++; return g; }
    var thin = greys();
    assert(thin > 0 && thin < r.samples, 'thin regions: ' + thin + ' of ' + r.samples + ' grey');
    v.mode = 'thick';
    rfGUCalc(); await idle();
    var thickG = greys();
    assert(thickG > 0 && thickG < r.samples && thickG !== thin, 'thick regions: ' + thickG + ' grey');
    UI.closePM(); await idle();
    assert(UI.evaluate.display() === null, 'closing removes the colours');
    await anvil.run('p.units("in"); p.box(6, 5, 4); p.shell(0.125, [[3, 4, 2]]);'); await idle();
    rfGUBtn().click(); await idle();
    UI.evaluate.thicknessValues().corners = true;
    rfGUCalc(); await idle();
    assert(UI.evaluate.thickness().min === 0, 'corners as zero: min ' + UI.evaluate.thickness().min);
    UI.closePM(); await idle();
  });
