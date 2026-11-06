  // --- rfIY (2026-11-05, lane smpm) --- the flat-pattern export and Flat-Pattern1 PMs against SolidWorks 2024: DXF/DWG
  // Output lists Sheet metal first with SolidWorks' names and its Entities to export (Geometry, Bend lines, Sketches,
  // Forming tools; Anvil's Notes), each box changing the file; Flat-Pattern1 opens on Parameters (Fixed face, Grain
  // direction; no dead boxes, lane DK); the Corners flyout says
  // Break-Corner/Corner-Trim.
  function rfIYRibbon(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return ((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).replace(/\s+/g, ' ').indexOf(label) >= 0; })[0]; }
  function rfIYLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }); }
  // the PM saves through UI.download: the step records what it is given (the file is never written)
  var rfIYSaved = [];
  async function rfIYLast() {
    var d = rfIYSaved[rfIYSaved.length - 1];
    assert(d, 'a download was recorded');
    return d;
  }
  function rfIYLayer(text, layer) { return new RegExp('\\n\\s*8\\s*\\r?\\n' + layer + '\\s*\\r?\\n').test(text); }
  var RFIY_PART = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, 0.0598, 0]]);\np.formingTool("dimple", [2, 0.0598, 1.5]);';
  step('rfIY: Sheet Metal ▸ Flat to DXF opens DXF/DWG Output on Sheet metal (listed first, SolidWorks names); Entities to export Geometry / Bend lines / Sketches / Forming tools / Notes; unchecking Forming tools then Bend lines drops FORM then BEND from the file', async function () {
    var errs0 = errors.length;
    var down = UI.download;
    rfIYSaved = [];
    UI.download = function (name, data) { rfIYSaved.push({ name: name, text: String(data) }); };
    try {
    await anvil.newPart(); await idle();
    await anvil.run(RFIY_PART); await idle();
    assert(!Object.keys(anvil.summary().errors).length, 'part builds: ' + JSON.stringify(anvil.summary().errors));
    var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Sheet Metal'; })[0];
    tab.click(); await wait(10);
    var btn = rfIYRibbon('Flat to');
    assert(btn, 'Flat to DXF button');
    btn.click(); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM ' + (UI.hasPM() && UI.pmTitle()));
    var radios = Array.prototype.map.call(D.querySelectorAll('#pm input[type=radio][name="pm-export"]'), function (r) { return r.value + '=' + r.parentElement.textContent.trim(); });
    assert(radios.join('|') === 'sheet=Sheet metal|faces=Faces/Loops/Edges|views=Annotation views|sketch=Sketch', 'Export list: ' + radios.join('|'));
    assert(D.querySelector('#pm input[data-key="export:sheet"]').checked, 'Sheet metal chosen');
    assert(/Entities to export/.test($('pm').innerText), 'Entities to export heading');
    var L = rfIYLabels(), want = ['Geometry', 'Bend lines', 'Sketches', 'Forming tools', 'Notes (bend notes, blank size)'];
    var at = want.map(function (w) { return L.indexOf(w); });
    assert(at.every(function (x, i) { return x >= 0 && (i === 0 || x > at[i - 1]); }), 'entity order: ' + L.join(' | '));
    var geo = D.querySelector('#pm input[data-key="geometry"]');
    assert(geo.checked && geo.disabled, 'Geometry always on');
    ['bendLines', 'etch', 'formingTools', 'notes'].forEach(function (k) { assert(D.querySelector('#pm input[data-key="' + k + '"]').checked, k + ' on by default'); });
    var n0 = rfIYSaved.length;
    await pmAccept(); await wait(20);
    assert(rfIYSaved.length === n0 + 1, 'saved');
    var all = await rfIYLast();
    assert(/_flat\.dxf$/.test(all.name) && rfIYLayer(all.text, 'FORM') && rfIYLayer(all.text, 'BEND') && rfIYLayer(all.text, 'NOTES'), 'all entities: ' + all.name);
    // Forming tools off: no FORM entities, the bend line stays
    btn.click(); await wait(30);
    D.querySelector('#pm input[data-key="formingTools"]').click(); await wait(10);
    await pmAccept(); await wait(20);
    var noForm = await rfIYLast();
    assert(!rfIYLayer(noForm.text, 'FORM') && rfIYLayer(noForm.text, 'BEND'), 'Forming tools off: FORM dropped, BEND kept');
    // Bend lines off as well: no BEND either; the outline is still there
    btn.click(); await wait(30);
    assert(D.querySelector('#pm input[data-key="formingTools"]').checked, 'a new DXF/DWG Output starts with every entity on');
    D.querySelector('#pm input[data-key="bendLines"]').click(); await wait(10);
    await pmAccept(); await wait(20);
    var noBend = await rfIYLast();
    assert(!rfIYLayer(noBend.text, 'BEND') && rfIYLayer(noBend.text, 'FORM') && rfIYLayer(noBend.text, 'OUTLINE'), 'Bend lines off, Forming tools on: BEND dropped, FORM kept');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return all.text.length + ' / ' + noForm.text.length + ' / ' + noBend.text.length + ' bytes';
    } finally { UI.download = down; }
  });
  step('rfIY: Flat-Pattern1 ▸ Edit Feature (double-click on its tree row) opens SolidWorks\' Parameters group first, Fixed face above Grain direction, and no greyed boxes for Merge faces / Simplify bends / Show slit / Corner treatment (lane DK; they need kernel switches); Cancel leaves the part as it was', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(RFIY_PART); await idle();
    var row = D.querySelector('#tree .ti.fp-row');
    assert(row, 'Flat-Pattern row in the tree');
    row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await wait(30);
    assert(UI.hasPM() && UI.pmTitle() === 'Flat-Pattern1', 'PM ' + (UI.hasPM() && UI.pmTitle()));
    var heads = Array.prototype.map.call(D.querySelectorAll('#pm .pm-group > h4'), function (h) { return h.textContent.replace(/^[▸▾]/, '').trim(); });
    assert(heads[0] === 'Parameters', 'groups: ' + heads.join(' | '));
    var txt = $('pm').textContent, iF = txt.indexOf('Fixed face'), iG = txt.indexOf('Grain direction');
    assert(iF >= 0 && iG > iF, 'Fixed face, then Grain direction: ' + txt.slice(0, 300));
    assert(['Merge faces', 'Simplify bends', 'Show slit', 'Corner treatment'].every(function (w) { return !pmField(w); }), 'no dead boxes');
    var before = JSON.stringify(anvil.model());
    UI.pmCancel(); await idle();
    assert(JSON.stringify(anvil.model()) === before, 'Cancel changes nothing');
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return heads.join(' | ');
  });
  step('rfIY: Sheet Metal ▸ Corners flyout lists Break-Corner/Corner-Trim (SolidWorks\' name) and its click opens the Break-Corner PM', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(RFIY_PART); await idle();
    var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Sheet Metal'; })[0];
    tab.click(); await wait(10);
    var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0];
    assert(caret, 'Corners caret');
    caret.click(); await wait(20);
    var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf('Break-Corner/Corner-Trim') >= 0; })[0];
    assert(mi, 'flyout row: ' + Array.prototype.map.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.trim(); }).join(' | '));
    mi.click(); await wait(30);
    assert(UI.hasPM() && /Break/.test(UI.pmTitle()), 'Break-Corner PM: ' + (UI.hasPM() && UI.pmTitle()));
    UI.pmCancel(); await idle();
    assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
    return UI.App.model.features.length + ' features';
  });
