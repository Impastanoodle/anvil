  // ---- p9-output (run local-2026-10-07a, headless lane): laser-ready DXF options and the ANSI Inch Hole Wizard
  step('p9-output: DXF/DWG Output on the U-bracket — Version R12 / R2000 and Loops as polylines / lines and arcs in the PM, ✓ writes the chosen kind (R2000 lines and arcs: 6 CIRCLEs, 2 ARCs, no LWPOLYLINE in R12, flat at 0,0); Views in R12 or R2000', async function () {
    await anvil.run(exByName('Sheet-metal U-bracket').code); await idle();
    var errs0 = errors.length;
    UI.cmdDxfOutput();
    assert(UI.hasPM() && UI.pmTitle() === 'DXF/DWG Output', 'PM: ' + UI.pmTitle());
    var ver = pmSelect('version'), sty = pmSelect('style');
    assert(ver && optionValues(ver).join() === 'R12,R2000' && ver.value === 'R12', 'version options ' + (ver && optionValues(ver).join()));
    assert(sty && optionValues(sty).join() === 'polyline,entities' && sty.value === 'polyline', 'Loops as options ' + (sty && optionValues(sty).join()));
    setInput(ver, 'R2000'); setInput(pmSelect('style'), 'entities');
    var got = null, saved = UI.download;
    UI.download = function (name, data) { got = { name: name, data: data }; };
    try { await pmAccept(); } finally { UI.download = saved; }
    assert(got && /_flat\.dxf$/.test(got.name), 'downloaded ' + (got && got.name));
    var t = got.data;
    assert(/\$ACADVER\n1\nAC1015\n/.test(t) && /\$INSUNITS\n70\n4\n/.test(t) && /\$MEASUREMENT\n70\n1\n/.test(t), 'R2000 mm header');
    assert((t.match(/\n0\nCIRCLE\n/g) || []).length === 6 && (t.match(/\n0\nARC\n/g) || []).length === 2 && t.indexOf('LWPOLYLINE') < 0, 'lines and arcs: ' + (t.match(/\n0\n[A-Z]+\n/g) || []).join(''));
    // rfE: DXF coordinates are written at full precision (210.74424…, not rounded to 210.744247)
    var xmax = /\$EXTMAX\n10\n([-0-9.]+)\n20\n60\n/.exec(t);
    assert(/\$EXTMIN\n10\n0\n20\n/.test(t) && xmax && Math.abs(+xmax[1] - 210.744247) < 5e-7, 'the flat runs from x = 0 to its 210.744 length and up to y = 60 (the sheet note sits below y = 0): ' + (xmax && xmax[1]));
    var r12 = anvil.dxfOutput({ export: 'sheet', version: 'R12' });
    assert(/AC1009/.test(r12) && r12.indexOf('LWPOLYLINE') < 0 && (r12.match(/\n0\nPOLYLINE\n/g) || []).length === 2 && /\n42\n/.test(r12), 'R12: two bulged POLYLINEs (blank, slot)');
    var r2k = anvil.dxfOutput({ export: 'sheet', version: 'R2000' });
    assert((r2k.match(/\n0\nLWPOLYLINE\n/g) || []).length === 2 && /\nOBJECTS\n/.test(r2k), 'R2000 polylines are LWPOLYLINEs');
    UI.cmdDxfOutput();
    D.querySelector('#pm input[data-key="export:views"]').click(); await idle();
    assert(optionValues(pmSelect('version')).join() === 'R12,R2000' && !pmSelect('style'), 'views: R12 / R2000, no Loops as: ' + optionValues(pmSelect('version')).join());
    var v2k = anvil.dxfOutput({ export: 'views', views: ['Front'], version: 'R2000' });
    assert(/AC1015/.test(v2k) && /\nOBJECTS\n/.test(v2k) && !/\n8\nSHEET\n/.test(v2k.split('ENTITIES')[1] || ''), 'views in R2000, no SHEET entities');
    UI.pmCancel();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'R2000 lines/arcs ' + t.length + ' chars, R12 ' + r12.length + ' chars';
  });

  step('p9-output: Hole Wizard in an inch part — Standard defaults to ANSI Inch, Size lists 1/4 / #10, the spec reads "Ø.281 … ⌴ Ø.438 ↧ .250"; Straight Tap switches the size to 1/4-20 UNC, Hole offers drill sizes; ✓ makes a CBORE for 1/4 (volume exact); edit to ISO M6 scales to inches; script round trip keeps standard: "ANSI Inch"', async function () {
    await anvil.run('p.units("in");\np.box(2, 2, 1, { centered: true });'); await idle();
    assert(UI.App.model.units === 'in', 'inch part');
    var idx = faceWithNormal([0, 1, 0]);
    UI.cmdHoleWizard();
    assert(UI.App.command.onPick({ kind: 'face', index: idx, point: [-0.5, 1, 0] }) !== false, 'pick rejected');
    clickPmButton('Type');
    assert(pmSelect('standard') && pmSelect('standard').value === 'ANSI Inch', 'Standard: ' + (pmSelect('standard') && pmSelect('standard').value));
    var sizes = optionValues(pmSelect('size'));
    assert(sizes.indexOf('1/4') >= 0 && sizes.indexOf('#10') >= 0 && sizes.indexOf('M6') < 0, 'sizes ' + sizes.join());
    setInput(pmSelect('holeType'), 'cbore'); setInput(pmSelect('size'), '1/4'); setInput(pmSelect('fit'), 'normal'); setInput(pmSelect('end'), 'blind');
    setInput(pmNumber(0), 0.75);
    var txt = $('pm').textContent;
    assert(txt.indexOf('Ø.281') >= 0 && txt.indexOf('⌴ Ø.438 ↧ .250') >= 0 && txt.indexOf('9/32 drill') >= 0, 'spec text: ' + txt.slice(0, 400));
    setInput(pmSelect('holeType'), 'tap'); await idle();
    assert(pmSelect('size').value === '1/4-20 UNC' && !pmSelect('fit'), 'tap size ' + pmSelect('size').value);
    assert(/1\/4-20 UNC - 2B/.test($('pm').textContent) && /#7 drill/.test($('pm').textContent), 'tap spec');
    setInput(pmSelect('holeType'), 'hole'); await idle();
    assert(pmSelect('sizeType'), 'Hole type select for an ANSI Hole');
    setInput(pmSelect('sizeType'), 'drill'); await idle();
    var drills = optionValues(pmSelect('size'));
    assert(drills.indexOf('#7') >= 0 && drills.indexOf('F') >= 0 && drills.indexOf('17/64') >= 0 && !pmSelect('fit'), 'drill sizes: ' + drills.length);
    setInput(pmSelect('holeType'), 'cbore'); setInput(pmSelect('size'), '1/4'); setInput(pmSelect('fit'), 'normal');
    await pmAccept();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'hole' && f.standard === 'ANSI Inch' && f.holeType === 'cbore' && f.size === '1/4' && f.depth === 0.75 && !f.sizeType, JSON.stringify(f));
    assert(f.name === 'CBORE for 1/4 Socket Head Cap Screw1', f.name);
    var Rc = 0.4375 / 2, R = 0.28125 / 2;
    near(anvil.mass().volume, 4 - (Math.PI * Rc * Rc * 0.25 + Math.PI * R * R * 0.5), 1e-8, 'counterbore volume (in³)');
    var code = anvil.script();
    assert(/standard: "ANSI Inch", type: "cbore", size: "1\/4"/.test(code), code);
    var v0 = anvil.mass().volume;
    await anvil.run(code); await idle();
    near(anvil.mass().volume, v0, 1e-8, 'round trip');
    f = UI.App.model.features[UI.App.model.features.length - 1];
    UI.editFeature(f);
    setInput(pmSelect('standard'), 'ISO'); await idle();
    assert(pmSelect('size').value === 'M6', 'ISO size ' + pmSelect('size').value);
    await pmAccept();
    assert(f.standard === 'ISO' && f.size === 'M6', JSON.stringify(f));
    var k = 1 / 25.4, Rc2 = 5.5 * k, R2 = 3.3 * k, dc = 6.5 * k;
    near(anvil.mass().volume, 4 - (Math.PI * Rc2 * Rc2 * dc + Math.PI * R2 * R2 * (0.75 - dc)), 1e-8, 'ISO M6 counterbore in inches');
    return 'ANSI 1/4 cbore ' + v0.toFixed(6) + ' in³';
  });
  // --- end p9-output ---

