  // --- rfND (2026-11-16, lane swsketchicons: under the SolidWorks profile every sketch icon shows its own tool) ---
  // User: "perimeter circle & normal circle have the same descriptor preview". Every group of sketch commands a user
  // picks from (each Sketch tab flyout, the tab's own buttons, the Tools menu's Sketch Entities / Sketch Tools /
  // Relations / Dimensions / Spline Tools / Blocks sections, the sketch Shortcut Bar, the relation glyphs) is drawn by
  // the set, nothing empty, and no two rows of one group look alike. "Alike" is measured: both icons rasterised on
  // SolidWorks' chrome (#d7dade) at 16 and 32 px, distance = sum |a - b| over the pixels / sum of the larger of
  // |a - chrome|, |b - chrome| (0 = one picture, 1 = nothing in common). Survey 2026-11-16: the old look-alikes scored
  // Circle ~ Perimeter Circle 0.032 / 0.019, Move ~ Copy Entities 0.037 / 0.074, Line ~ Centerline 0.046 / 0.084; after
  // the redraw the closest pair of a group is Line ~ Centerline 0.154 / 0.284 (a dash-dot copy of the line is meant to
  // stay its relative). RFND_MIN = 0.1 sits between the two, and step 2 keeps the old Circle / Perimeter Circle pair
  // under it as a regression check on the measure itself.
  var RFND_MIN = 0.1;
  // rows of another lane's file (ui-panels.js) that still pass one icon name for several commands: the set already draws
  // each its own (step 3, RFND_NAMES); once ui-panels.js names them these entries no longer match and can go
  var RFND_SHARED = { quickSnaps: 1, offset: 1, spline: 1, block: 1, moveEnt: 1, closeArc: 1, relations: 1, fullyDefine: 1 };
  var RFND_NAMES = {
    'Quick Snaps': ['qsPoint', 'qsCenter', 'qsMidpoint', 'qsQuadrant', 'qsIntersection', 'qsNearest', 'qsTangent', 'qsPerpendicular', 'qsParallel', 'qsHvLines', 'qsHvPoints', 'qsLength', 'qsGrid', 'qsAngle'],
    'Spline Tools': ['splInsertPt', 'splSimplify', 'splFit', 'splHandles', 'splCurvature', 'splRelax', 'splTangency', 'splCurvCtrl', 'splInflection', 'splMinRadius'],
    'Blocks': ['blockMake', 'blockEdit', 'blockInsert', 'blockAddRemove', 'blockRebuild', 'blockExplode', 'blockSave'],
    'Sketch Tools': ['convert', 'intersectCurve', 'segment', 'offset', 'trim', 'extend', 'splitEnt', 'joinEnt', 'closeArc', 'construction', 'mirrorEnt', 'dynMirror', 'stretchEnt', 'moveEnt', 'rotateEnt', 'scaleEnt', 'copyEnt', 'sketchPattern', 'cSketchPattern', 'sketchXpert', 'modifySketch', 'alignGrid', 'replaceEnt', 'closeToModel', 'makePath'],
    'Offset': ['offset', 'offsetSurface'],
    'Relations': ['relations', 'addRelation', 'fullyDefine', 'relEqual']
  };
  // the drawings Circle and Perimeter Circle had before (icons-solidworks.js at fb02cb0, the body at 16 px)
  var RFND_OLD_PT = function (x, y) { return '<rect x="' + x + '" y="' + y + '" width="2" height="2" fill="#fefefe" stroke="#323232" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>'; };
  var RFND_OLD_RIM = '<circle cx="8" cy="8" r="5.5" fill="none" stroke="#2f7ca3" style="stroke:color-mix(in srgb, currentColor 16%, #2c84b2)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
  var RFND_OLD = {
    circle: RFND_OLD_RIM + '<path d="M7 7 l2 2 M9 7 l-2 2" fill="none" stroke="#a8a9aa" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round"/>' + RFND_OLD_PT(11.5, 3.5) + RFND_OLD_PT(1.5, 7.5) + RFND_OLD_PT(9.5, 12),
    pcircle: RFND_OLD_RIM + RFND_OLD_PT(11.5, 3.5) + RFND_OLD_PT(1.5, 7.5) + RFND_OLD_PT(9.5, 12)
  };
  function rfNDFlat(s) { return String(s || '').replace(/\s*\n\s*/g, ' '); }
  function rfNDSet() { return W.Icons.sets.get('solidworks'); }
  function rfNDHas(n) { return !!(n && rfNDSet().has(n)); }
  function rfNDIcon(it) { return it.icon || (rfNDHas(it.cmd) ? it.cmd : it.id); }
  // every group of sketch commands, as { group, items: [{ label, icon }] }, read from the app's own data
  function rfNDGroups() {
    var groups = [], tab = [];
    (function walk(list, top) {
      list.forEach(function (n) {
        if (!n || n.sep) return;
        if (n.stack) { walk(n.stack, top); return; }
        if (n.fly) {
          var items = (n.items || []).map(function (it) { return { label: rfNDFlat(it.label), icon: rfNDIcon(it) }; });
          groups.push({ group: 'Sketch tab flyout ' + n.fly, items: items });
          if (top) tab.push(n.label && rfNDHas(n.fly) ? { label: rfNDFlat(n.label), icon: n.fly } : items[0]);
          return;
        }
        if (n.id && top) tab.push({ label: rfNDFlat(n.label), icon: rfNDIcon(n) });
      });
    })(UI.RIBBON.Sketch, true);
    groups.unshift({ group: 'Sketch tab buttons', items: tab });
    var cap = null, h0 = UI.menuHook;
    UI.menuHook = function (m) { m = h0 ? h0(m) : m; cap = m; return m; };
    try {
      var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (x) { return x.textContent.trim() === 'Tools'; })[0];
      assert(li, 'no Tools menu');
      li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    } finally { UI.menuHook = h0; if (UI.closeMenus) UI.closeMenus(); }
    var tools = (cap || []).filter(function (m) { return m.label === 'Tools'; })[0], secs = {};
    assert(tools, 'the Tools menu was not built');
    tools.items.forEach(function (r) {
      var m = r && !r.sep && r.label && /^(Sketch Entities|Sketch Tools|Relations|Dimensions|Spline Tools|Blocks) ▸ (.*)$/.exec(r.label);
      if (m && r.icon) (secs[m[1]] = secs[m[1]] || []).push({ label: m[2], icon: r.icon });
    });
    ['Sketch Entities', 'Sketch Tools', 'Relations', 'Dimensions', 'Spline Tools', 'Blocks'].forEach(function (k) { assert(secs[k] && secs[k].length > 1, 'Tools ▸ ' + k + ': ' + (secs[k] ? secs[k].length : 0) + ' rows'); groups.push({ group: 'Tools menu ' + k, items: secs[k] }); });
    var leaves = [];
    (function lw(list) { list.forEach(function (n) { if (!n || n.sep) return; if (n.stack) return lw(n.stack); if (n.fly) return lw(n.items); if (n.id) leaves.push(n); }); })(UI.RIBBON.Sketch);
    groups.push({ group: 'Shortcut Bar (sketch)', items: UI.shortcutBar.labels('sketch').map(function (l) { var it = leaves.filter(function (x) { return rfNDFlat(x.label) === l; })[0]; assert(it, 'Shortcut Bar row ' + l + ' is not a Sketch tab command'); return { label: l, icon: rfNDIcon(it) }; }) });
    var rel = ['Horizontal', 'Vertical', 'Coincident', 'Parallel', 'Perpendicular', 'Tangent', 'Concentric', 'Equal', 'Midpoint', 'Symmetric', 'Collinear', 'Fix', 'Coradial', 'Intersection', 'Merge', 'OnEdge', 'Pattern'];
    groups.push({ group: 'Relations', items: rel.map(function (r) { return { label: r, icon: 'rel' + r }; }) });
    return groups;
  }
  // an icon's pixels on SolidWorks' chrome: `name` through W.Icons(), or { body } through W.Icons.svg (weighed the same way)
  function rfNDRaster(what, size) {
    var m = typeof what === 'string' ? W.Icons(what, size) : W.Icons.svg(what.body, size, null, true);
    m = m.replace(/var\(--[^)]*\)/g, '#d7dade').replace(/currentColor/g, '#3e3e3e');
    if (m.indexOf('xmlns=') < 0) m = m.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { var c = D.createElement('canvas'); c.width = c.height = size; var g = c.getContext('2d'); g.fillStyle = '#d7dade'; g.fillRect(0, 0, size, size); g.drawImage(img, 0, 0, size, size); res(g.getImageData(0, 0, size, size).data); };
      img.onerror = function () { res(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
    });
  }
  function rfNDDist(a, b) {
    var bg = [0xd7, 0xda, 0xde], num = 0, den = 0;
    for (var i = 0; i < a.length; i += 4) for (var c = 0; c < 3; c++) { num += Math.abs(a[i + c] - b[i + c]); den += Math.max(Math.abs(a[i + c] - bg[c]), Math.abs(b[i + c] - bg[c])); }
    return den ? num / den : 0;
  }
  // the smaller of the 16 and 32 px distances, cached per pair
  var rfNDCache = {};
  async function rfNDPair(a, b) {
    var k = (typeof a === 'string' ? a : a.key) + '|' + (typeof b === 'string' ? b : b.key);
    if (rfNDCache[k] != null) return rfNDCache[k];
    var d = [];
    for (var s of [16, 32]) {
      var pa = await rfNDRaster(a, s), pb = await rfNDRaster(b, s);
      assert(pa && pb, 'icon did not render: ' + k + ' at ' + s);
      d.push(rfNDDist(pa, pb));
    }
    return (rfNDCache[k] = Math.min(d[0], d[1]));
  }
  async function rfNDReset() {
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    if (UI.hasPM && UI.hasPM()) UI.closePM();
    if (UI.closeMenus) UI.closeMenus();
    anvil.profile('solidworks');
    await idle();
  }

  step('rfND: SolidWorks profile: every sketch flyout, Sketch tab button group, Tools menu sketch section, the sketch Shortcut Bar and the relation glyphs: every icon comes from the set, none is empty, no two rows share an icon (but the listed rows of ui-panels.js) and every pair differs by more than RFND_MIN', async function () {
    await rfNDReset();
    try {
      var groups = rfNDGroups(), bad = [], n = 0;
      assert(groups.length >= 25, groups.length + ' groups');
      for (var g of groups) {
        for (var it of g.items) {
          var m = W.Icons(it.icon, 16);
          if (!/data-set="solidworks"/.test(m) || !/<(path|rect|circle|ellipse|polygon|line|text)\b/.test(m)) bad.push(g.group + ': ' + it.label + ' (' + it.icon + ') not drawn by the set');
        }
        for (var i = 0; i < g.items.length; i++) for (var j = i + 1; j < g.items.length; j++) {
          var a = g.items[i], b = g.items[j];
          if (a.icon === b.icon) { if (!RFND_SHARED[a.icon]) bad.push(g.group + ': ' + a.label + ' and ' + b.label + ' share ' + a.icon); continue; }
          var d = await rfNDPair(a.icon, b.icon); n++;
          if (d <= RFND_MIN) bad.push(g.group + ': ' + a.label + ' (' + a.icon + ') ~ ' + b.label + ' (' + b.icon + ') ' + d.toFixed(3));
        }
      }
      assert(n > 400, 'only ' + n + ' pairs compared');
      assert(!bad.length, bad.length + ' problem(s): ' + bad.slice(0, 6).join('; '));
    } finally { await rfNDReset(); }
  });

  step('rfND: the Circle flyout shows three different pictures (Circle: centre and radius; Perimeter Circle: three rim points; Tangent Circle: touching two lines), and the old Circle / Perimeter Circle drawings score under RFND_MIN', async function () {
    await rfNDReset();
    var fly = rfNDGroups().filter(function (g) { return g.group === 'Sketch tab flyout circle'; })[0];
    assert(fly && fly.items.map(function (x) { return x.icon; }).join() === 'circle,pcircle,tangentCircle', 'Circle flyout: ' + (fly && fly.items.map(function (x) { return x.icon; }).join()));
    var sw = rfNDSet();
    ['circle', 'pcircle', 'tangentCircle'].forEach(function (k) { assert(sw.has(k), k + ' is not drawn for the set'); });
    var d1 = await rfNDPair('circle', 'pcircle'), d2 = await rfNDPair('circle', 'tangentCircle'), d3 = await rfNDPair('pcircle', 'tangentCircle');
    assert(Math.min(d1, d2, d3) > RFND_MIN, 'Circle flyout distances ' + [d1, d2, d3].map(function (x) { return x.toFixed(3); }).join(' / '));
    // the measure itself: the drawings the user complained about are under the threshold
    var old = await rfNDPair({ key: 'old-circle', body: RFND_OLD.circle }, { key: 'old-pcircle', body: RFND_OLD.pcircle });
    assert(old < RFND_MIN, 'old Circle ~ Perimeter Circle scores ' + old.toFixed(3) + ', not under ' + RFND_MIN);
    // and the redraw is not the old picture
    var was = await rfNDPair('circle', { key: 'old-circle', body: RFND_OLD.circle });
    assert(was > RFND_MIN, 'Circle still looks like its old drawing: ' + was.toFixed(3));
  });

  step('rfND: the set draws a picture for every row that ui-panels.js still gives a shared icon (each Quick Snap, Spline Tools, Blocks, the Sketch Tools rows, Offset On Surface), each its own (more than RFND_MIN apart in its section)', async function () {
    await rfNDReset();
    var bad = [];
    for (var sec of Object.keys(RFND_NAMES)) {
      var names = RFND_NAMES[sec];
      names.forEach(function (k) { if (!rfNDHas(k)) bad.push(sec + ': ' + k + ' not drawn'); });
      for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) {
        if (!rfNDHas(names[i]) || !rfNDHas(names[j])) continue;
        var d = await rfNDPair(names[i], names[j]);
        if (d <= RFND_MIN) bad.push(sec + ': ' + names[i] + ' ~ ' + names[j] + ' ' + d.toFixed(3));
      }
    }
    assert(!bad.length, bad.join('; '));
  });
