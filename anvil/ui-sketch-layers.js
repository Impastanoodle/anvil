// ui-sketch-layers.js — sketch layers (AutoCAD layers), shaded closed regions with open ends flagged (Fusion 360 /
// Onshape), and Copy / Paste of sketch entities between sketches (Onshape). Loaded after ui-core.js and ui-sketch.js;
// ui-core's updateSketches calls UI.sketchLayerStyle and UI.sketchRegionObjects, ui-sketch's snapping and
// UI.pickEntity skip UI.entityLayerHidden, and the drawing tools put new entities on the current layer through
// UI.sketchLayerNew. The layer table itself lives on the sketch (kernel-sketch.js: Kernel.sketchLayer, noProfile).
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$;

  // ================================================================== layers
  // sketch.layers = [{ name, color, hidden, noProfile, lineType, aci }]; entity.layer names one (absent = "0", the
  // default layer, which has no record). The current layer (where new entities go) is per sketch and per session.
  var current = {};   // sketch id -> layer name
  function layerRec(f, name) { return K.sketchLayer(f, { layer: name }); }
  function currentLayer(f) {
    var n = f ? current[f.id] : null;
    return n && layerRec(f, n) ? n : '0';
  }
  function entityLayerName(f, e) { return K.sketchLayer(f, e) ? e.layer : '0'; }
  function entityLayerHidden(f, e) { var l = K.sketchLayer(f, e); return !!(l && l.hidden); }
  // a material per layer colour, for the active sketch (drawn over the body) and for the others
  var lyrMats = {};
  function layerMat(color, active) {
    var key = color + (active ? '|a' : '|i'), m = lyrMats[key];
    if (!m) m = lyrMats[key] = new THREE.LineBasicMaterial({ color: new THREE.Color(color), depthTest: !active });
    if (UI.LINE_W && m.userData.lineWidth == null) m.userData.lineWidth = active ? UI.LINE_W.sketch : UI.LINE_W.sketchInactive;
    return m;
  }
  // updateSketches (ui-core.js): { hidden, mat (the layer colour, or null), dashed } for an entity on a layer, else null
  UI.sketchLayerStyle = function (f, e, active) {
    var l = K.sketchLayer(f, e);
    if (!l) return null;
    return { hidden: !!l.hidden, mat: l.color ? layerMat(l.color, active) : null, dashed: l.lineType === 'dashed' };
  };
  UI.entityLayerHidden = entityLayerHidden;
  // a new entity of the sketch goes on its current layer (unless it was given one)
  UI.sketchLayerNew = function (f, e) {
    if (!f || !e || e.layer != null) return;
    var n = currentLayer(f);
    if (n !== '0') e.layer = n;
  };
  UI.sketchCurrentLayer = function (name) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    if (name != null) {
      if (String(name) !== '0' && !layerRec(f, String(name))) throw new Error('No layer ' + name + ' in this sketch.');
      current[f.id] = String(name);
    }
    return currentLayer(f);
  };

  function markDirty() { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }
  function refresh() { App.gridStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); }
  function selectedEntities() {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s && s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.sort(function (a, b) { return a - b; });
  }
  function uniqueName(f, base) {
    var n = 1;
    while (layerRec(f, base + n)) n++;
    return base + n;
  }
  function validName(f, name, except) {
    name = String(name == null ? '' : name).trim();
    if (!name) return { error: 'Type a layer name.' };
    if (name === '0') return { error: '"0" is the default layer.' };
    if (layerRec(f, name) && name !== except) return { error: 'There is already a layer ' + name + '.' };
    return { name: name };
  }
  // The layer operations (each one undo step; `f` is the sketch feature). All return a result { ok, error? }.
  var Layers = {
    add: function (f, spec) {
      spec = spec || {};
      var v = validName(f, spec.name != null ? spec.name : uniqueName(f, 'Layer'));
      if (v.error) return { ok: false, error: v.error };
      markDirty();
      var r = { name: v.name };
      ['color', 'hidden', 'noProfile', 'lineType', 'aci'].forEach(function (k) { if (spec[k] != null && spec[k] !== false) r[k] = spec[k]; });
      if (r.color === undefined) r.color = null;
      (f.layers = f.layers || []).push(r);
      return { ok: true, name: r.name };
    },
    preset: function (f, name) {
      var p = (K.LAYER_PRESETS || []).filter(function (x) { return x.name === name; })[0];
      if (!p) return { ok: false, error: 'No preset ' + name + '.' };
      if (layerRec(f, name)) return { ok: false, error: 'The sketch already has a ' + name + ' layer.' };
      return Layers.add(f, JSON.parse(JSON.stringify(p)));
    },
    rename: function (f, from, to) {
      var r = layerRec(f, from);
      if (!r) return { ok: false, error: 'Pick a layer to rename (the default layer 0 keeps its name).' };
      var v = validName(f, to, from);
      if (v.error) return { ok: false, error: v.error };
      if (v.name === from) return { ok: true, name: from };
      markDirty();
      r.name = v.name;
      f.entities.forEach(function (e) { if (e.layer === from) e.layer = v.name; });
      if (current[f.id] === from) current[f.id] = v.name;
      return { ok: true, name: v.name };
    },
    remove: function (f, name) {
      if (!layerRec(f, name)) return { ok: false, error: 'The default layer 0 cannot be deleted.' };
      markDirty();
      f.layers = f.layers.filter(function (l) { return l.name !== name; });
      if (!f.layers.length) delete f.layers;
      var moved = 0;
      f.entities.forEach(function (e) { if (e.layer === name) { delete e.layer; moved++; } });
      if (current[f.id] === name) delete current[f.id];
      return { ok: true, moved: moved };
    },
    set: function (f, name, props) {
      var r = layerRec(f, name);
      if (!r) return { ok: false, error: 'The default layer has no properties to change.' };
      markDirty();
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false || (k === 'lineType' && v === 'continuous')) delete r[k]; else r[k] = v;
        if (k === 'color') { delete r.aci; if (v == null) r.color = null; }   // the DXF colour follows a new colour
      });
      return { ok: true };
    },
    move: function (f, idx, name) {
      if (name !== '0' && !layerRec(f, name)) return { ok: false, error: 'No layer ' + name + '.' };
      idx = (idx || []).filter(function (i) { return f.entities[i]; });
      if (!idx.length) return { ok: false, error: 'Select sketch entities first, then Move Selected to Layer.' };
      markDirty();
      idx.forEach(function (i) { if (name === '0') delete f.entities[i].layer; else f.entities[i].layer = name; });
      return { ok: true, moved: idx.length };
    }
  };
  // script / test API on the active sketch: UI.sketchLayerOp('add' | 'preset' | 'rename' | 'remove' | 'set' | 'move', ...)
  UI.sketchLayerOp = function (op) {
    var f = UI.activeSketchFeature();
    if (!f) return { ok: false, error: 'Open a sketch first.' };
    var r = Layers[op].apply(null, [f].concat(Array.prototype.slice.call(arguments, 1)));
    if (r.ok) { refresh(); if (UI.pmTitle && UI.pmTitle() === 'Layers' && pmRender) pmRender(); }
    return r;
  };
  // the layers of the active sketch as listed in the PropertyManager: [{ name, color, hidden, noProfile, lineType, count, current }]
  UI.sketchLayerList = function () {
    var f = UI.activeSketchFeature();
    if (!f) return [];
    var cur = currentLayer(f), counts = {};
    f.entities.forEach(function (e) { var n = entityLayerName(f, e); counts[n] = (counts[n] || 0) + 1; });
    return [{ name: '0', color: null, count: counts['0'] || 0, current: cur === '0' }].concat((f.layers || []).map(function (l) {
      return { name: l.name, color: l.color || null, hidden: !!l.hidden, noProfile: !!l.noProfile, lineType: l.lineType || 'continuous', count: counts[l.name] || 0, current: cur === l.name };
    }));
  };

  // ------------------------------------------------------------------ the Layers PropertyManager (Sketch tab ▸ Layers)
  var pmRender = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cmdSketchLayers() {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    if (App.tool && App.tool !== 'select' && UI.setTool) UI.setTool('select');
    var v = { pick: currentLayer(f), name: '', noProfile: false, lineType: 'continuous' };
    function op(name) {
      var r = Layers[name].apply(null, [f].concat(Array.prototype.slice.call(arguments, 1)));
      if (!r.ok) { UI.setStatus(r.error); UI.toast(r.error); return r; }
      refresh();
      return r;
    }
    function syncPick() {
      var r = layerRec(f, v.pick);
      if (v.pick !== '0' && !r) v.pick = '0';
      v.name = v.pick;
      v.noProfile = !!(r && r.noProfile);
      v.lineType = r && r.lineType === 'dashed' ? 'dashed' : 'continuous';
    }
    var spec = {
      title: 'Layers', icon: 'layers', values: v, noFocus: true, keepSelection: true,
      command: {
        // a click in the graphics area selects (Ctrl / Shift add) for Move Selected to Layer, instead of opening the
        // entity's own PropertyManager
        onSketchPoint: function (raw, mx, my) {
          var hit = UI.pickEntity(mx, my);
          if (!hit) { if (UI.setSelection) UI.setSelection([]); render(); return; }
          var sel = (UI.selection ? UI.selection() : []).filter(function (s) { return s && s.kind === 'entity'; });
          var k = -1;
          sel.forEach(function (s, j) { if (s.index === hit.index) k = j; });
          if (k >= 0) sel.splice(k, 1); else sel.push({ kind: 'entity', index: hit.index });
          if (UI.setSelection) UI.setSelection(sel); else { App.sel = sel[0] || null; UI.updateSketches(); }
          render();
        }
      },
      onChange: function (x, key) {
        if (key === 'noProfile') { op('set', v.pick, { noProfile: !!x.noProfile }); render(); }
        else if (key === 'lineType') { op('set', v.pick, { lineType: x.lineType }); render(); }
      },
      onOK: function () { }, onClose: function () { pmRender = null; }
    };
    function render() {
      syncPick();
      var list = UI.sketchLayerList(), nSel = selectedEntities().length, rec = layerRec(f, v.pick);
      var cur = currentLayer(f);
      spec.message = 'Current layer: <b>' + esc(cur) + '</b>. New entities go on the current layer. ETCH and BEND (Exclude from profiles) make no solid region; every layer goes to the DXF on its own layer.';
      var presets = (K.LAYER_PRESETS || []).filter(function (p) { return !layerRec(f, p.name); });
      spec.groups = [
        { title: 'Layers', fields: [
          { type: 'html', html: '<div class="rel-list" id="lyr-list" role="listbox" aria-label="Layers">' + list.map(function (l) {
            var sw = l.name === '0' ? '<i class="lyr-swatch" style="display:inline-block;flex:none;width:18px;height:14px;border:1px dashed #9aa3ad;box-sizing:border-box" title="Entities keep their usual colour"></i>'
              : '<input type="color" class="lyr-color" value="' + esc(l.color || '#1f5fd0') + '" title="Layer colour" style="flex:none;width:20px;height:18px;padding:0;border:0;background:none">';
            var eye = l.name === '0' ? '<i style="display:inline-block;flex:none;width:18px"></i>' : '<button type="button" class="lyr-eye" title="' + (l.hidden ? 'Hidden: click to show' : 'Visible: click to hide') + '" aria-pressed="' + (!l.hidden) + '" style="flex:none;width:18px;padding:0;border:0;background:none;cursor:pointer;opacity:' + (l.hidden ? 0.35 : 1) + '">' + (l.hidden ? '&#9711;' : '&#9673;') + '</button>';
            return '<div class="rel-row' + (l.name === v.pick ? ' sel' : '') + '" role="option" tabindex="0" data-layer="' + esc(l.name) + '" style="display:flex;align-items:center;gap:6px">' +
              '<input type="radio" name="lyr-current" class="lyr-cur" title="Current layer"' + (l.current ? ' checked' : '') + '>' + sw + eye +
              '<span style="flex:1;text-align:left">' + esc(l.name) + (l.noProfile ? ' <em>no profile</em>' : '') + (l.lineType === 'dashed' ? ' <em>dashed</em>' : '') + '</span><em>' + l.count + '</em></div>';
          }).join('') + '</div>' },
          { type: 'buttons', buttons: [
            { label: 'New', onclick: function () { var r = op('add', {}); if (r.ok) v.pick = r.name; render(); } },
            { label: 'Delete', onclick: function () { var r = op('remove', v.pick); if (r.ok) { UI.setStatus('Layer deleted' + (r.moved ? ': ' + r.moved + ' entit' + (r.moved === 1 ? 'y' : 'ies') + ' moved to layer 0.' : '.')); v.pick = '0'; } render(); } }
          ] }
        ].concat(presets.length ? [{ type: 'buttons', buttons: presets.map(function (p) {
          return { label: 'Add ' + p.name, onclick: function () { var r = op('preset', p.name); if (r.ok) v.pick = r.name; render(); } };
        }) }] : []) },
        { title: 'Layer Properties', show: function () { return !!rec; }, fields: [
          { type: 'text', label: 'Name', key: 'name' },
          { type: 'buttons', buttons: [{ label: 'Rename', onclick: function () { var r = op('rename', v.pick, v.name); if (r.ok) v.pick = r.name; render(); } }] },
          { type: 'check', label: 'Exclude from profiles (marks, bend lines)', key: 'noProfile' },
          { type: 'select', label: 'Line type', key: 'lineType', options: [['continuous', 'Continuous'], ['dashed', 'Dashed']] }
        ] },
        { title: 'Entities', fields: [
          { type: 'static', label: 'Selected', value: nSel ? nSel + ' entit' + (nSel === 1 ? 'y' : 'ies') : 'none (click entities)' },
          { type: 'buttons', buttons: [{ label: 'Move Selected to ' + v.pick, onclick: function () {
            var r = op('move', selectedEntities(), v.pick);
            if (r.ok) UI.setStatus(r.moved + ' entit' + (r.moved === 1 ? 'y' : 'ies') + ' moved to layer ' + v.pick + '.');
            render();
          } }] }
        ] }
      ];
      UI.openPM(spec);
      var box = $('lyr-list');
      if (!box) return;
      Array.prototype.forEach.call(box.querySelectorAll('.rel-row'), function (row) {
        var name = row.getAttribute('data-layer');
        row.addEventListener('click', function (ev) {
          var t = ev.target;
          if (t.classList.contains('lyr-cur')) { current[f.id] = name; v.pick = name; UI.setStatus('Current layer: ' + name + '.'); render(); return; }
          if (t.classList.contains('lyr-eye')) { var r0 = layerRec(f, name); op('set', name, { hidden: !(r0 && r0.hidden) }); render(); return; }
          if (t.classList.contains('lyr-color')) return;
          if (v.pick !== name) { v.pick = name; render(); }
        });
        var c = row.querySelector('.lyr-color');
        if (c) c.addEventListener('change', function () { op('set', name, { color: c.value }); render(); });
      });
    }
    pmRender = render;
    render();
    return spec;
  }
  UI.cmdSketchLayers = cmdSketchLayers;

  // ================================================================== regions and open ends (View ▸ Sketch Regions)
  // The active sketch's profile (Kernel.sketchProfile: the loops a feature would use, nesting odd-even, ETCH / BEND
  // left out) as shaded regions: each loop at an even depth with the loops one deeper inside it as holes, tinted
  // translucent under the lines, not pickable; a hover tints the region under the cursor a little more. Open ends: an
  // end of a line, arc or open curve that no other profile entity's end meets (the profile builder chains ends only),
  // drawn as small red squares. Construction geometry, points and noProfile layers are ignored. Cached by the sketch's
  // content, so a redraw that changes nothing (selection, zoom) costs a string compare.
  var rgCache = { key: null, regions: null, ends: null }, hoverRegion = -1, rgMats = null, rgDrawn = [];
  function regionData(f) {
    var key = f.id + ':' + JSON.stringify(f.entities) + JSON.stringify(f.layers || null) + (K._ && K._.tessKey ? K._.tessKey() : '');
    if (rgCache.key === key) return rgCache;
    var regions = [], ends = [], prof = null;
    try { prof = K.sketchProfile(f); } catch (e) { prof = null; }
    var loops = prof ? prof.loops.filter(function (l) { return !l.cross && l.pts.length >= 3; }) : [];
    function probe(l) { return [(l.pts[0][0] + l.pts[1][0]) / 2, (l.pts[0][1] + l.pts[1][1]) / 2]; }
    loops.forEach(function (l) {
      if (l.depth % 2) return;
      var holes = loops.filter(function (h) { return h.depth === l.depth + 1 && K._.pointInPoly(probe(h), l.pts); });
      var area = Math.abs(K.signedArea(l.pts));
      holes.forEach(function (h) { area -= Math.abs(K.signedArea(h.pts)); });
      regions.push({ outer: l.pts, holes: holes.map(function (h) { return h.pts; }), area: area });
    });
    // open ends: ends of the open pieces the profile builder chains, by its own point key
    var deg = {}, at = {}, key2 = K._.key2;
    f.entities.forEach(function (e) {
      if (!e || e.construction || e.t === 'point' || K.noProfileEntity(f, e)) return;
      K.entityPolylines(e, true).forEach(function (pl) {
        if (pl.closed || pl.pts.length < 2) return;
        [pl.pts[0], pl.pts[pl.pts.length - 1]].forEach(function (q) { var k = key2(q); deg[k] = (deg[k] || 0) + 1; at[k] = q; });
      });
    });
    Object.keys(deg).forEach(function (k) { if (deg[k] === 1) ends.push([at[k][0], at[k][1]]); });
    rgCache = { key: key, regions: regions, ends: ends };
    return rgCache;
  }
  function darkView() { return document.documentElement.dataset.theme === 'dark' || App.view.bg === 'dark'; }
  function regionMats() {
    var dark = darkView();
    if (!rgMats || rgMats.dark !== dark) {
      var col = dark ? 0x6fa8ea : 0x3d7fd6;
      function mk(op) { return new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, depthTest: false, side: THREE.DoubleSide }); }
      rgMats = { dark: dark, base: mk(dark ? 0.16 : 0.11), hover: mk(dark ? 0.3 : 0.22),
        ends: new THREE.PointsMaterial({ color: 0xe0262a, size: 7, sizeAttenuation: false, depthTest: false }) };
    }
    return rgMats;
  }
  function noRaycast() { }
  // updateSketches (ui-core.js): the shaded regions and the open-end markers of the active sketch, as objects to add
  UI.sketchRegionObjects = function (f, pl) {
    rgDrawn = [];
    if (App.view.sketchRegions === false || !window.THREE || !THREE.ShapeUtils) return [];
    var d = regionData(f), M = regionMats(), out = [];
    d.regions.forEach(function (r, ri) {
      var contour = r.outer.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      var holes = r.holes.map(function (h) { return h.map(function (p) { return new THREE.Vector2(p[0], p[1]); }); });
      var tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
      var pos = [];   // the faces index the contour then each hole, as triangulateShape left them
      contour.concat.apply(contour, holes).forEach(function (p) { var q = K.to3D(pl, p.x, p.y); pos.push(q[0], q[1], q[2]); });
      var idx = [];
      tris.forEach(function (t) { idx.push(t[0], t[1], t[2]); });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      var m = new THREE.Mesh(g, ri === hoverRegion ? M.hover : M.base);
      m.renderOrder = 9;
      m.raycast = noRaycast;
      m.userData = { sketchRegion: ri };
      rgDrawn.push(m);
      out.push(m);
    });
    if (d.ends.length) {
      var pos2 = [];
      d.ends.forEach(function (p) { var q = K.to3D(pl, p[0], p[1]); pos2.push(q[0], q[1], q[2]); });
      var g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
      var pts = new THREE.Points(g2, M.ends);
      pts.renderOrder = 12;
      pts.raycast = noRaycast;
      pts.userData = { sketchOpenEnds: true };
      out.push(pts);
    }
    return out;
  };
  // test / script hooks: the regions of the active sketch ([{ area, holes, loops }]) and its open ends ([[x, y]])
  UI.sketchRegions = function () {
    var f = UI.activeSketchFeature();
    return f ? regionData(f).regions.map(function (r) { return { area: r.area, holes: r.holes.length, loops: 1 + r.holes.length, outer: r.outer.length }; }) : [];
  };
  UI.sketchOpenEnds = function () { var f = UI.activeSketchFeature(); return f ? regionData(f).ends.map(function (p) { return p.slice(); }) : []; };
  UI.sketchRegionHover = function () { return hoverRegion; };
  function regionAt(f, uv) {
    var d = regionData(f);
    for (var i = d.regions.length - 1; i >= 0; i--) {
      var r = d.regions[i];
      if (K._.pointInPoly(uv, r.outer) && !r.holes.some(function (h) { return K._.pointInPoly(uv, h); })) return i;
    }
    return -1;
  }
  function setHover(i) {
    if (i === hoverRegion) return;
    hoverRegion = i;
    var M = regionMats();
    rgDrawn.forEach(function (m) { m.material = m.userData.sketchRegion === i ? M.hover : M.base; });
    UI.requestRender();
  }
  // (on the window, as the sketch's own mouse handling: a move over the graphics area, no button held)
  window.addEventListener('mousemove', function (ev) {
    if (App.mode !== 'sketch' || ev.buttons || App.view.sketchRegions === false || !rgDrawn.length) { if (hoverRegion >= 0 && App.mode !== 'sketch') hoverRegion = -1; return; }
    var f = UI.activeSketchFeature();
    if (!f) return;
    var r = UI.viewport.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    if (mx < 0 || my < 0 || mx > r.width || my > r.height) { setHover(-1); return; }
    var uv = UI.screenToPlane(mx, my, UI.activePlane());
    setHover(uv ? regionAt(f, uv) : -1);
  });
  UI.viewport.addEventListener('mouseleave', function () { if (hoverRegion >= 0) setHover(-1); });

  // ================================================================== Copy / Paste sketch entities
  // Ctrl+C in a sketch copies the selected entities with the relations and dimensions among them and their layers to
  // an in-app clipboard (kept in localStorage 'anvil.sketchClipboard' too, so it reaches other documents in this
  // browser). Relations to anything not copied (the origin, other entities, model edges) and Fix / On Edge are dropped.
  // Ctrl+V in any sketch: the copy follows the cursor by its anchor (the middle of its extents; points, curves and
  // alignment snap the anchor as they snap a drawing tool's point), a click places it (one undo step), Esc cancels.
  var CLIP_KEY = 'anvil.sketchClipboard', clip = null;
  function readClip() {
    if (clip) return clip;
    try { var s = localStorage.getItem(CLIP_KEY); if (s) clip = JSON.parse(s); } catch (e) { clip = null; }
    return clip && clip.v === 1 && Array.isArray(clip.entities) && clip.entities.length ? clip : null;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function extents(ents) {
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    ents.forEach(function (e) {
      var pls = e.t === 'point' ? [{ pts: [[e.x, e.y]] }] : K.entityPolylines(e);
      pls.forEach(function (pl) { pl.pts.forEach(function (p) { mn[0] = Math.min(mn[0], p[0]); mn[1] = Math.min(mn[1], p[1]); mx[0] = Math.max(mx[0], p[0]); mx[1] = Math.max(mx[1], p[1]); }); });
    });
    return isFinite(mn[0]) ? [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2] : [0, 0];
  }
  // refs "3", "3.p1" … through map (old index -> new index); null when a ref is not a copied entity
  function mapRefs(refs, map) {
    var out = [];
    for (var i = 0; i < refs.length; i++) {
      var m = /^(\d+)(\..*)?$/.exec(String(refs[i]));
      if (!m || map[+m[1]] == null) return null;
      out.push(map[+m[1]] + (m[2] || ''));
    }
    return out;
  }
  function sketchCopy(list) {
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    var idx = (list || selectedEntities()).filter(function (i) { return f.entities[i]; });
    if (!idx.length) { UI.setStatus('Select sketch entities to copy (Ctrl+C), then Ctrl+V in this or another sketch.'); return null; }
    var map = {};
    idx.forEach(function (i, k) { map[i] = k; });
    var ents = idx.map(function (i) { return clone(f.entities[i]); });
    var rels = [];
    (f.rels || []).forEach(function (r) {
      if (r.type === 'fix' || r.type === 'onEdge') return;
      var refs = mapRefs(r.refs || [], map);
      if (!refs) return;
      var c = clone(r); c.refs = refs; delete c.name;
      rels.push(c);
    });
    var dims = [];
    (f.dims || []).forEach(function (d) { if (map[d.e] == null) return; var c = clone(d); c.e = map[d.e]; delete c.name; dims.push(c); });
    var used = {};
    ents.forEach(function (e) { var l = K.sketchLayer(f, e); if (l) used[l.name] = clone(l); else delete e.layer; });
    clip = { v: 1, units: App.model.units, entities: ents, rels: rels, dims: dims, layers: Object.keys(used).map(function (n) { return used[n]; }), anchor: extents(ents) };
    try { localStorage.setItem(CLIP_KEY, JSON.stringify(clip)); } catch (e) { }
    UI.setStatus('Copied ' + ents.length + ' entit' + (ents.length === 1 ? 'y' : 'ies') + (rels.length ? ', ' + rels.length + ' relation' + (rels.length === 1 ? '' : 's') : '') + (dims.length ? ', ' + dims.length + ' dimension' + (dims.length === 1 ? '' : 's') : '') + '. Ctrl+V pastes in any sketch.');
    return { entities: ents.length, rels: rels.length, dims: dims.length };
  }
  function moved(c, p) {
    var dx = p[0] - c.anchor[0], dy = p[1] - c.anchor[1];
    return c.entities.map(function (e) { return K.translateEntity(e, dx, dy); });
  }
  // puts the clipboard into the active sketch with its anchor at p: -> { first, count } (one undo step)
  function placeClip(c, p) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    markDirty();
    var base = f.entities.length, map = {};
    moved(c, p).forEach(function (e, k) { map[k] = base + k; f.entities.push(e); });
    c.rels.forEach(function (r) { var q = clone(r); q.refs = mapRefs(q.refs, map); if (q.refs) (f.rels = f.rels || []).push(q); });
    c.dims.forEach(function (d) { var q = clone(d); q.e = map[q.e]; (f.dims = f.dims || []).push(q); });
    (c.layers || []).forEach(function (l) { if (!layerRec(f, l.name)) (f.layers = f.layers || []).push(clone(l)); });
    // relations that no longer apply (none should) and exact repeats go, as after any sketch edit
    if (window.SketchSolver) { try { SketchSolver.clean(f); } catch (e) { } }
    var sel = [];
    for (var i = base; i < f.entities.length; i++) sel.push({ kind: 'entity', index: i });
    if (UI.setSelection) UI.setSelection(sel); else App.sel = sel[0] || null;
    refresh();
    UI.setStatus('Pasted ' + c.entities.length + ' entit' + (c.entities.length === 1 ? 'y' : 'ies') + (c.units && c.units !== App.model.units ? ' (copied from a ' + c.units + ' document: sizes kept as numbers)' : '') + '.');
    return { first: base, count: c.entities.length };
  }
  function sketchPaste(at) {
    var f = UI.activeSketchFeature(), c = readClip();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    if (!c) { UI.setStatus('Nothing to paste: select sketch entities and press Ctrl+C first.'); return null; }
    if (at) return placeClip(c, [+at[0], +at[1]]);
    if (App.tool && App.tool !== 'select' && UI.setTool) UI.setTool('select');
    var hint = $('sketch-hint'), hint0 = hint ? hint.innerHTML : null;
    function anchorAt(raw, mx, my) { return UI.sketchInferPoint ? UI.sketchInferPoint(raw, mx, my) : { p: raw, snap: null }; }
    function clearPreview() { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
    UI.openPM({
      title: 'Paste', icon: 'pasteSketch', noFocus: true, keepSelection: true,
      message: '<b>Click where the copy goes.</b> Its centre follows the cursor and snaps to points, curves and alignments. Esc cancels.',
      command: {
        ownHover: true,
        onSketchMove: function (raw, mx, my) {
          var info = anchorAt(raw, mx, my);
          App.tempEntities = moved(c, info.p);
          UI.updateTemp();
          if (UI.sketchFeedbackClear) UI.sketchFeedbackClear();
          if (info.snap && UI.sketchPreview) {
            var ring = [];
            for (var k = 0; k <= 16; k++) { var a = k / 16 * Math.PI * 2, s = UI.cam.scale * 5; ring.push([info.p[0] + s * Math.cos(a), info.p[1] + s * Math.sin(a)]); }
            UI.sketchPreview([ring], 'stroke:#e8891c;stroke-width:1.5;fill:none', 'sk-paste-snap');
          }
        },
        onSketchPoint: function (raw, mx, my) {
          var r = placeClip(c, anchorAt(raw, mx, my).p);
          clearPreview();
          UI.closePM();
          return r;
        }
      },
      groups: [{ title: 'Clipboard', fields: [{ type: 'static', label: 'Entities', value: String(c.entities.length) }, { type: 'static', label: 'Relations / dimensions', value: c.rels.length + ' / ' + c.dims.length }] }],
      onChange: function () { }, onOK: function () { }, onCancel: function () { UI.setStatus('Paste cancelled.'); },
      onClose: function () { clearPreview(); if (hint && hint0 != null) hint.innerHTML = hint0; }
    });
    if (hint) hint.innerHTML = 'Paste: click where the copy goes. Esc cancels.';
    return { placing: true };
  }
  UI.sketchCopy = sketchCopy;
  UI.sketchPaste = sketchPaste;
  UI.sketchClipboard = function () { var c = readClip(); return c ? { entities: c.entities.length, rels: c.rels.length, dims: c.dims.length, layers: (c.layers || []).map(function (l) { return l.name; }), units: c.units } : null; };
  // Ctrl+C / Ctrl+V in a sketch (nothing else binds them; ui-app.js lets every other Ctrl key through)
  document.addEventListener('keydown', function (ev) {
    if (App.mode !== 'sketch' || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
    var k = ev.key, tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (k !== 'c' && k !== 'C' && k !== 'v' && k !== 'V') return;
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ev.target && ev.target.isContentEditable)) return;
    if ($('modal') && !$('modal').hidden) return;
    if (k === 'c' || k === 'C') {
      var txt = window.getSelection ? String(window.getSelection()) : '';
      if (txt && !selectedEntities().length) return;   // text selected on the page: the browser copies it
      if (sketchCopy()) ev.preventDefault();
      return;
    }
    ev.preventDefault();
    sketchPaste();
  });
})(UI);
