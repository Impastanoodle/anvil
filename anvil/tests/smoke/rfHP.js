  // --- rfHP (2026-11-04, lane sw-sketch): sketch tools against numbers measured on a live SolidWorks 2022
  // (test-reports/2026-11-04-sketch-solidworks.md): Angle Quick Snap at SolidWorks' 45° Snap angle, measured from the
  // line the point starts at; Segment on a spline at equal arc length; Autodimension rows 10 mm / 6 mm apart. ---
  async function rfHPNew(ents) {
    await anvil.newPart(); await idle();
    UI.App.model.units = 'in';
    await UI.newSketchOnPlane('Front'); await idle();
    if (ents) fxSk(ents);
    UI.zoomToFit && UI.zoomToFit(); await idle();
    UI.zoomView(2.5); await idle();   // (k > 1 zooms out) room round the geometry for the clicks
    return UI.activeSketchFeature();
  }
  function rfHPAng(L) { return Math.atan2(L.y2 - L.y1, L.x2 - L.x1) * 180 / Math.PI; }
  step('rfHP: Angle Quick Snap: 45° steps (SolidWorks\' Snap angle) from X on a free start, and from the line a chain starts at the end of (a 30° line: the next line snaps to 75°, not 90°)', async function () {
    try {
      var c30 = Math.cos(Math.PI / 6), s30 = 0.5;
      var f = await rfHPNew([{ t: 'line', x1: 1, y1: 1, x2: 1 + 2 * c30, y2: 1 + 2 * s30 }, { t: 'point', x: 6, y: -1 }]);
      assert(UI.quickSnapAngle() === 45, 'snap angle ' + UI.quickSnapAngle());
      UI.setTool('line'); await idle();
      var E = [1 + 2 * c30, 2];
      rskClick(E); await idle();
      var p0 = UI.App.toolState.pts && UI.App.toolState.pts[0];
      assert(p0 && Math.hypot(p0[0] - E[0], p0[1] - E[1]) < 1e-9, 'chain starts at the line end ' + JSON.stringify(p0));
      UI.quickSnap('angle');
      var a70 = 90 * Math.PI / 180;   // 60° off the 30° line: 75° (15° steps or X-based 45° steps gave 90°)
      rskClick([E[0] + 1.5 * Math.cos(a70), E[1] + 1.5 * Math.sin(a70)]); await idle();
      f = UI.activeSketchFeature();
      var L = f.entities[f.entities.length - 1];
      assert(L.t === 'line' && Math.abs(L.x1 - E[0]) < 1e-9, 'new line ' + JSON.stringify(L));
      near(rfHPAng(L), 75, 1e-6, 'angle from the 30° line');
      UI.cancelTool && UI.cancelTool(); await idle();
      UI.setTool('line'); await idle();
      rskClick([6, -1]); await idle();
      UI.quickSnap('angle');
      var a50 = 60 * Math.PI / 180;   // 15° steps kept 60°
      rskClick([6 + 1.5 * Math.cos(a50), -1 + 1.5 * Math.sin(a50)]); await idle();
      f = UI.activeSketchFeature();
      L = f.entities[f.entities.length - 1];
      near(rfHPAng(L), 45, 1e-6, 'angle from X');
      UI.cancelTool && UI.cancelTool();
      UI.setTool('select');
      await UI.exitSketch(); await idle();
      return '75° and 45°';
    } finally { UI.App.quickSnap = null; }
  });
  step('rfHP: Segment on a spline (Tools ▸ Sketch Tools ▸ Segment, 5 instances): 4 sketch points at equal arc length, within .001 in of SolidWorks\' points on the same spline', async function () {
    var pts = [];
    for (var k = 0; k < 9; k++) pts.push([0.5 * k, 0.5 * Math.sin(0.5 * k)]);
    var f = await rfHPNew([{ t: 'spline', pts: pts }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]);
    UI.cmdSegment(); await idle();
    assert(UI.pmTitle() === 'Segment', 'PM ' + UI.pmTitle());
    UI.pmSpec().values.n = 5; UI.pmSpec().onChange(UI.pmSpec().values, 'n'); await idle();
    UI.pmOK(); await idle();
    f = UI.activeSketchFeature();
    var made = f.entities.filter(function (e) { return e.t === 'point'; });
    var SW = [[0.777643, 0.350942], [1.613434, 0.499438], [2.443895, 0.321221], [3.217862, -0.038175]];
    assert(made.length === 4, 'points ' + JSON.stringify(made));
    SW.forEach(function (p, i) { near(made[i].x, p[0], 1e-3, 'x' + i); near(made[i].y, p[1], 1e-3, 'y' + i); });
    assert(/4 sketch points/.test(statusText()), statusText());
    await UI.exitSketch(); await idle();
    return made.map(function (e) { return e.x.toFixed(4) + ',' + e.y.toFixed(4); }).join(' ');
  });
  step('rfHP: Autodimension in an inch part: the first row of dimensions sits 0.3937 in (10 mm) below / left of the sketch with the origin, the next rows 0.2362 in (6 mm) on, or the 34 px label floor', async function () {
    var f = await rfHPNew([{ t: 'rect', x: 1, y: 1, w: 4, h: 2 }, { t: 'circle', cx: 3, cy: 2, r: 0.25 }]);
    UI.zoomToFit(); await idle();   // a sketch filling the view: the 34 px floor is below SolidWorks' 6 mm
    UI.cmdAutodimension(); await idle();
    assert(UI.pmTitle() === 'Autodimension', 'PM ' + UI.pmTitle());
    clickPmButton('Apply'); await idle();
    f = UI.activeSketchFeature();
    var h = f.rels.filter(function (r) { return r.type === 'distance' && r.dir === 'h'; }).sort(function (a, b) { return a.v - b.v; });
    var floor = 34 * UI.cam.scale, first = Math.max(10 / 25.4, floor), stepG = Math.max(6 / 25.4, floor);
    assert(h.length === 3, 'horizontal ' + JSON.stringify(h));
    assert(floor < 6 / 25.4, 'zoomed so the SolidWorks offsets show: floor ' + floor);
    h.forEach(function (r, k) { near(r.off, -Math.round((first + k * stepG) * 1e4) / 1e4, 1e-9, 'row ' + k); });
    UI.pmOK(); await idle();
    await UI.exitSketch(); await idle();
    return 'rows ' + h.map(function (r) { return r.off; }).join(', ') + ' (floor ' + floor.toFixed(4) + ')';
  });
