  // ---- p9-bendtable: the Bend Table on free paper with a BEND DED. column; its columns in the flat view's PM
  step('p9-bendtable: a flat view with a Bend Table placed by the title block: the table stays off the title block; its PM shows Bend Table Columns (BEND DED. on), K-factor ✓ adds a K-FACTOR column', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(P9_INCH); await idle();
    anvil.drawing.make(); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 14, y: 3.4, bendNotes: 'table' }); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary(), fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(fv && fv.flat && !fv.flat.error, 'flat view ' + JSON.stringify(fv && fv.flat));
    var tab = fv.flat.annotations.filter(function (a) { return a.type === 'bendTable'; })[0], S = UI.drawing.state.sheet.size, Dr = W.Drawing, b1 = Dr._.BORDER / 25.4;
    var tb = [S[0] - b1 - Dr._.TB_W / 25.4, b1, S[0] - b1, b1 + Dr._.TB_H / 25.4];
    assert(tab && !(tab.box[0] < tb[2] && tb[0] < tab.box[2] && tab.box[1] < tb[3] && tb[1] < tab.box[3]), 'the table is off the title block: ' + JSON.stringify(tab && tab.box) + ' vs ' + JSON.stringify(tb));
    function tableTexts() { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="BEND_NOTES"] text'), function (t) { return t.textContent; }); }
    var t0 = tableTexts();
    assert(t0.indexOf('Bend Ded.') >= 0 && t0.indexOf('Inner Radius') >= 0 && t0.indexOf('0.030') >= 0 && t0.indexOf('K-Factor') < 0, 'default columns ' + t0.join('|'));
    UI.drawing.viewProperties(fv.id);
    assert(UI.hasPM() && /Bend Table Columns/.test($('pm').innerText), 'Bend Table Columns group: ' + $('pm').innerText.replace(/\s+/g, ' ').slice(0, 300));
    assert(pmField('Bend deduction').checked && !pmField('K-factor').checked, 'BEND DED. on, K-factor off');
    pmField('K-factor').click();
    await UI.pmOK(); await UI.drawing.ready(); await wait(30);
    var v = anvil.drawing.doc().views.filter(function (x) { return x.kind === 'flat'; })[0], t1 = tableTexts();
    assert(JSON.stringify(v.bendCols) === '["bd","k"]', 'bendCols ' + JSON.stringify(v.bendCols));
    assert(t1.indexOf('K-Factor') >= 0 && t1.indexOf('0.44') >= 0 && t1.indexOf('Bend Ded.') >= 0, 'K-Factor column drawn ' + t1.join('|'));
    anvil.drawing.close();
    return 'table at ' + tab.box.join(', ') + '; columns ' + t1.slice(0, 6).join(' / ');
  });
