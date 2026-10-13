  // --- sketch PM selection (user report: in Linear Sketch Pattern / Mirror Entities a click on an entity opened that
  // entity's location / size PropertyManager instead of selecting it) ---
  step('sketch PM selection: with Linear Sketch Pattern open a plain click adds the entity to Entities to Pattern, a second click removes it, and the Pattern PM stays open', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 10, cy: 10, r: 4 }, { t: 'line', x1: 30, y1: 0, x2: 50, y2: 0 });
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]); UI.App.sel = null;
    UI.cmdSketchPattern(); await wait(20);
    assert(UI.pmTitle() === 'Linear Pattern' && UI.pmSpec().values.entities.length === 0, 'opens empty');
    rskClick([14, 10]); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'Linear Pattern', 'click on the circle kept the Pattern PM: ' + UI.pmTitle());
    assert(UI.pmSpec().values.entities.join() === '0', 'circle in the box: ' + UI.pmSpec().values.entities.join());
    rskClick([40, 0]); await wait(20);
    assert(UI.pmSpec().values.entities.join() === '0,1', 'line added: ' + UI.pmSpec().values.entities.join());
    rskClick([14, 10]); await wait(20);
    assert(UI.pmTitle() === 'Linear Pattern' && UI.pmSpec().values.entities.join() === '1', 'second click removed the circle: ' + UI.pmSpec().values.entities.join());
    UI.pmSetField('count', '2'); await wait(20);
    await UI.pmOK();
    assert(rskEnts().length === 3 && rskEnts()[2].t === 'line', 'only the line patterned: ' + rskEnts().length);
    // with no PM open a click still opens the entity's PropertyManager
    rskClick([14, 10]); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'Circle', 'no PM: the entity PM opens: ' + UI.pmTitle());
    UI.pmCancel();
    return 'pattern box by clicks';
  });
  step('sketch PM selection: Mirror Entities takes clicked entities into Entities to Mirror; clicking the Mirror about box and then a centerline sets the mirror line', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 20, cy: 10, r: 4 }, { t: 'line', x1: 0, y1: -20, x2: 0, y2: 30, construction: true }, { t: 'line', x1: 10, y1: 25, x2: 30, y2: 25 });
    UI.updateSketches(); UI.setTool('select'); UI.setSelection([]); UI.App.sel = null;
    UI.cmdMirrorEntities(); await wait(20);
    assert(UI.pmTitle() === 'Mirror Entities' && UI.pmSpec().values.entities.length === 0, 'opens with an empty box (no everything fallback)');
    rskClick([24, 10]); await wait(20);
    assert(UI.hasPM() && UI.pmTitle() === 'Mirror Entities' && UI.pmSpec().values.entities.join() === '0', 'circle in the box, PM open: ' + UI.pmTitle());
    var boxes = D.querySelectorAll('#pm .pm-pick');
    assert(boxes.length === 2 && boxes[0].classList.contains('active'), 'Entities to Mirror is the active box');
    boxes[1].click(); await wait(20);
    assert(D.querySelectorAll('#pm .pm-pick')[1].classList.contains('active'), 'Mirror about became active');
    rskClick([24, 10]); await wait(20);
    assert(UI.pmSpec().values.axis === '' && UI.pmSpec().values.entities.join() === '0', 'a circle is refused as the mirror line');
    rskClick([0, 5]); await wait(20);
    assert(UI.pmSpec().values.axis === '1', 'centerline is the mirror line: ' + UI.pmSpec().values.axis);
    assert(D.querySelectorAll('#pm .pm-pick')[0].classList.contains('active'), 'back to Entities to Mirror');
    await UI.pmOK();
    var e = rskEnts();
    assert(e.length === 4 && e[3].t === 'circle' && Math.abs(e[3].cx + 20) < 1e-9 && Math.abs(e[3].cy - 10) < 1e-9, 'circle mirrored about the centerline: ' + JSON.stringify(e[3]));
    return 'mirror boxes by clicks';
  });
  // --- end sketch PM selection ---

