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
    if (UI.levelCurrentKey) return UI.levelCurrentKey(f);   // levels (ui-levels.js): the part's main level
    var n = f ? current[f.id] : null;
    return n && layerRec(f, n) ? n : '0';
  }
  // levels (ui-levels.js): making a layer current makes its level the part's main level
  function setCurrentLayer(f, name) {
    if (UI.levelSetCurrentKey) UI.levelSetCurrentKey(f, name);
    current[f.id] = name;
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
      setCurrentLayer(f, String(name));
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
      // levels (ui-levels.js): a layer is a part-wide level, so renaming it renames the level in every sketch (one
      // undo step), exactly as the Levels Manager does; the two never disagree
      if (UI.levelRenameKey) {
        var lr = UI.levelRenameKey(f, from, v.name);
        if (lr) { if (lr.ok && current[f.id] === from) current[f.id] = lr.name; return lr; }
      }
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
            var sw = l.name === '0' ? '<i class="lyr-swatch" style="display:inline-block;flex:none;width:18px;height:14px;border:1px dashed #a0a0a0;box-sizing:border-box" title="Entities keep their usual colour"></i>'
              : '<input type="color" class="lyr-color" value="' + esc(l.color || '#ffffff') + '" title="Layer colour" style="flex:none;width:20px;height:18px;padding:0;border:0;background:none">';
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
          if (t.classList.contains('lyr-cur')) { setCurrentLayer(f, name); v.pick = name; UI.setStatus('Current layer: ' + name + '.'); render(); return; }
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
    // (rfOG: one string per entity, kept, so a drag can tell which entities moved since the regions were worked out)
    var ej = f.entities.map(function (e) { return JSON.stringify(e); }), tail = JSON.stringify(f.layers || null) + (K._ && K._.tessKey ? K._.tessKey() : '');
    var key = f.id + ':[' + ej.join(',') + ']' + tail;
    var vers = UI.sketchEntityVersions && UI.activeSketchFeature && UI.activeSketchFeature() === f ? UI.sketchEntityVersions(f).slice() : null;   // rfPA: an entity at the version it had here is unchanged (no text compare in a drag frame)
    if (rgCache.key === key) { rgCache.ver = UI.sketchSceneVersion ? UI.sketchSceneVersion() : null; rgCache.vers = vers; if (!App.sketchDragging && !(rgWarm && rgWarm.key === key)) rgWarmSoon(f); return rgCache; }
    var regions = [], ends = [], prof = null, t0 = performance.now();
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
      // sketch-text: etched (single-stroke) text is open on purpose; an infinite line has no ends
      if (!e || e.construction || e.t === 'point' || e.t === 'text' || (e.t === 'line' && e.infinite) || K.noProfileEntity(f, e)) return;
      K.entityPolylines(e, true).forEach(function (pl) {
        if (pl.closed || pl.pts.length < 2) return;
        [pl.pts[0], pl.pts[pl.pts.length - 1]].forEach(function (q) { var k = key2(q); deg[k] = (deg[k] || 0) + 1; at[k] = q; });
      });
    });
    Object.keys(deg).forEach(function (k) { if (deg[k] === 1) ends.push([at[k][0], at[k][1]]); });
    var kept = rgAdopt(regions);   // (what the kept triangles cost to make still counts as this sketch's cost)
    rgRelease(rgCache);
    rgCache = { key: key, vers: vers, regions: regions, ends: ends, fid: f.id, ej: ej, tail: tail, cost: performance.now() - t0 + kept, ver: UI.sketchSceneVersion ? UI.sketchSceneVersion() : null };
    rgFast = null;
    rgWarmSoon(f);
    return rgCache;
  }
  // ---- rfOG (lane dragsnap): the regions while the sketch is dragged
  // Every redraw of the sketch triangulated every region again, also when the regions had not changed (a selection, a
  // hover, a zoom step), and a drag worked the whole profile out again on every frame: 18 ms a frame on a 200-entity
  // sketch, 650 ms on a plate with 1,600 holes (ear clipping one outline with 1,600 holes), so a dragged point followed
  // the mouse at one or two frames a second. Now (1) a region's triangles are kept with the region data (r.g: positions,
  // indices, one BufferGeometry marked userData.keep, which ui-core's disposeGroup leaves alone) and made again only
  // when the regions change; (2) while a drag is on (App.sketchDragging) and the last full build cost more than
  // rgBudget ms, the profile is not worked out again: the entities that changed since the build are found by their
  // strings, the vertices their old points gave are moved to their new points in place (same triangles), and the
  // region is checked (no triangle turned over). A region that cannot be followed that way (the entity's points
  // changed in number, a shared point came apart, a triangle turned over) is not drawn for the rest of the drag; the
  // release redraws from the full profile as before. Sketches whose full build is under the budget are built in full on
  // every frame as before.
  var rgFast = null, rgBudget = 3, rgStats = { full: 0, fast: 0, tri: 0, broken: 0, adopted: 0, cavity: 0 };
  // A new region whose points are those of a kept one, in the same order (an edit elsewhere in the sketch, or the release
  // of a drag that followed the region in place), takes over its triangles: the plate with 1,600 holes cost 1.1 s to
  // triangulate again at every release and every edit. Points may differ by the profile's own merge distance where two
  // ends meet (key2: 1e-4); the positions are then set from the new points and the triangles checked (rgGeometry).
  function rgAdopt(regions) {
    var by = {}, F = rgFast && rgFast.key === rgCache.key ? rgFast : null, ms = 0;
    (rgCache.regions || []).forEach(function (r, ri) { if (r.g && !(F && F.broken[ri])) (by[r.g.uv.length] = by[r.g.uv.length] || []).push(r); });
    regions.forEach(function (r) {
      var loops = [r.outer].concat(r.holes), n = 0, c, cands;
      loops.forEach(function (l) { n += 2 * l.length; });
      cands = by[n];
      for (c = 0; cands && c < cands.length; c++) {
        var uv = cands[c].g.uv, k = 0, ok = true, exact = true;
        for (var a = 0; ok && a < loops.length; a++) for (var q = 0, l = loops[a]; q < l.length; q++, k += 2) {
          var dx = Math.abs(uv[k] - l[q][0]), dy = Math.abs(uv[k + 1] - l[q][1]);
          if (dx > 1.5e-4 || dy > 1.5e-4) { ok = false; break; }
          if (dx || dy) exact = false;
        }
        if (!ok) continue;
        r.g = cands[c].g; cands[c].g = null; cands.splice(c, 1);
        r.g.cav = null; ms += r.g.ms || 0;
        if (!exact || F) { k = 0; loops.forEach(function (l) { l.forEach(function (p) { r.g.uv[k++] = p[0]; r.g.uv[k++] = p[1]; }); }); r.g.stale = true; }
        rgStats.adopted++;
        break;
      }
    });
    return ms;
  }
  function rgRelease(c) { ((c && c.regions) || []).forEach(function (r) { if (r.g) { r.g.geo.dispose(); r.g = null; } }); }
  function rgPlaneKey(pl) { return [pl.origin, pl.x, pl.y].join(';'); }
  function rgProfilePolys(f, e) {
    if (!e || e.construction || e.t === 'point' || (e.t === 'line' && e.infinite) || (e.t === 'text' && e.mode !== 'outline') || K.noProfileEntity(f, e)) return null;
    try { return K.entityPolylines(e, true); } catch (err) { return null; }
  }
  // the kept triangles of region r on plane pl (made when missing or for another plane)
  function rgGeometry(d, r, pl, plKey) {
    if (r.g && r.g.plKey === plKey && r.g.stale) {
      // adopted triangles on new points: positions from the points, and no triangle may have turned over
      var G = r.g, bad = false, sumA = 0;
      for (var v = 0, nv = G.uv.length / 2; v < nv; v++) { var w = K.to3D(pl, G.uv[2 * v], G.uv[2 * v + 1]); G.pos[3 * v] = w[0]; G.pos[3 * v + 1] = w[1]; G.pos[3 * v + 2] = w[2]; }
      for (var t = 0; !bad && t < G.idx.length; t += 3) { var ar = rgArea(G.uv, G.idx[t], G.idx[t + 1], G.idx[t + 2]) * G.sign; bad = ar < -1e-12; sumA += ar / 2; }
      if (!bad && r.area != null) bad = Math.abs(sumA - r.area) > 1e-7 * Math.max(1, r.area);   // (and they cover exactly the region)
      G.stale = false; G.cav = null;
      if (!bad) G.geo.index.needsUpdate = true;
      if (!bad) { G.geo.attributes.position.needsUpdate = true; G.geo.boundingSphere = null; G.geo.boundingBox = null; return G; }
      G.plKey = null;
    }
    if (r.g && r.g.plKey === plKey) return r.g;
    if (r.g) { r.g.geo.dispose(); r.g = null; }
    var t0 = performance.now();
    var contour = r.outer.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var holes = r.holes.map(function (h) { return h.map(function (p) { return new THREE.Vector2(p[0], p[1]); }); });
    var tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return null; }
    var all = contour.concat.apply(contour, holes), n = all.length, uv = new Float64Array(n * 2), pos = new Float32Array(n * 3);   // the faces index the contour then each hole, as triangulateShape left them
    all.forEach(function (p, i) { var q = K.to3D(pl, p.x, p.y); uv[2 * i] = p.x; uv[2 * i + 1] = p.y; pos[3 * i] = q[0]; pos[3 * i + 1] = q[1]; pos[3 * i + 2] = q[2]; });
    var idx = n > 65535 ? new Uint32Array(tris.length * 3) : new Uint16Array(tris.length * 3), sign = 0;
    tris.forEach(function (t, k) {
      idx[3 * k] = t[0]; idx[3 * k + 1] = t[1]; idx[3 * k + 2] = t[2];
      if (!sign) { var a = rgArea(uv, t[0], t[1], t[2]); if (Math.abs(a) > 1e-14) sign = a > 0 ? 1 : -1; }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.userData.keep = true;
    rgStats.tri++;
    var dt = performance.now() - t0;
    d.cost = (d.cost || 0) + dt;
    return (r.g = { plKey: plKey, uv: uv, pos: pos, idx: idx, geo: g, sign: sign || 1, ms: dt });
  }
  // The triangles of kept region g that touch the moved vertices mv, with the vertices where they are now (g.uv). While
  // none of them has turned over they stand as they are. Otherwise they are made again inside the gap they leave (the
  // cavity: its outline is the edges only one of them has; the moved loops lie in it as holes or run along it), a few
  // dozen points instead of the whole region, and written into the same places of the index list. False when that
  // cannot be done (the cavity pinches, the moved shape has left it or crosses it): the caller stops drawing the region.
  // Every triangle the same way round and the outline simple means the triangles cover the region exactly once.
  function rgCavity(g, mv) {
    if (rgCavityTry(g, mv)) return true;
    if (!g.cav || g.cav.box || g.cav.grow || UI.sketchRegionGrow === false) return false;
    g.cav.grow = true;
    rgStats.grown = (rgStats.grown || 0) + 1;
    return rgCavityTry(g, mv);
  }
  function rgCavityTry(g, mv) {
    var C = g.cav, n = g.uv.length / 2, uv = g.uv, sg = g.sign, mark = new Uint8Array(n), cnt = 0, i, k, t;
    for (i = 0; i < mv.length; i++) if (!mark[mv[i]]) { mark[mv[i]] = 1; cnt++; }
    // rfPA (lane dragfeel): the gap also takes every triangle whose box meets where the moved points are now (their
    // box grown by its own size), so a hole dragged across its neighbours, or a hole dragged larger by its edge, stays
    // inside it; made again when the moved points leave the box it was made for (C.box)
    var mb = [Infinity, Infinity, -Infinity, -Infinity];
    for (i = 0; i < mv.length; i++) { var x = uv[2 * mv[i]], y = uv[2 * mv[i] + 1]; if (x < mb[0]) mb[0] = x; if (y < mb[1]) mb[1] = y; if (x > mb[2]) mb[2] = x; if (y > mb[3]) mb[3] = y; }
    var inBox = C && C.box && mb[0] >= C.box[0] && mb[1] >= C.box[1] && mb[2] <= C.box[2] && mb[3] <= C.box[3];
    if (!C || C.cnt !== cnt || !mv.every(function (v) { return C.mark[v]; }) || (C.box && !inBox) || (!C.box && C.grow)) {
      var idx0 = C ? C.idx0 : g.idx.slice(), slots = [], edges = new Map(), next = new Map(), loops = [], bad = false, box = null;
      g.idx.set(idx0);
      if (C && (C.grow || C.box) && UI.sketchRegionGrow !== false) {
        var gx = Math.max(mb[2] - mb[0], mb[3] - mb[1]);
        box = [mb[0] - gx, mb[1] - gx, mb[2] + gx, mb[3] + gx];
      }
      for (t = 0; t < idx0.length; t += 3) {
        var a0 = idx0[t], a1 = idx0[t + 1], a2 = idx0[t + 2];
        if (mark[a0] || mark[a1] || mark[a2]) { slots.push(t); continue; }
        if (box && !(Math.max(uv[2 * a0], uv[2 * a1], uv[2 * a2]) < box[0] || Math.min(uv[2 * a0], uv[2 * a1], uv[2 * a2]) > box[2] ||
            Math.max(uv[2 * a0 + 1], uv[2 * a1 + 1], uv[2 * a2 + 1]) < box[1] || Math.min(uv[2 * a0 + 1], uv[2 * a1 + 1], uv[2 * a2 + 1]) > box[3])) slots.push(t);
      }
      slots.forEach(function (t) { for (var e = 0; e < 3; e++) edges.set(idx0[t + e] * n + idx0[t + (e + 1) % 3], 1); });
      edges.forEach(function (one, ek) { var a = Math.floor(ek / n), b = ek % n; if (a === b || edges.has(b * n + a)) return; if (next.has(a)) bad = true; next.set(a, b); });
      while (!bad && next.size) {
        var s = next.keys().next().value, L = [], v = s;
        do { L.push(v); var w = next.get(v); if (w === undefined) { bad = true; break; } next.delete(v); v = w; } while (v !== s);
        loops.push(L);
      }
      C = g.cav = { mark: mark, cnt: cnt, idx0: idx0, slots: slots, loops: bad ? null : loops, own: false, box: box, grow: !!(C && C.grow) };
      g.geo.index.needsUpdate = true;
    }
    if (!C.loops) return false;
    var same = !C.box;   // (a grown gap holds triangles the moved points may now lie over: always made again)
    for (k = 0; same && k < C.slots.length; k++) { t = C.slots[k]; same = rgArea(uv, C.idx0[t], C.idx0[t + 1], C.idx0[t + 2]) * sg >= -1e-12; }
    if (same) {
      if (C.own) { C.slots.forEach(function (t) { g.idx[t] = C.idx0[t]; g.idx[t + 1] = C.idx0[t + 1]; g.idx[t + 2] = C.idx0[t + 2]; }); C.own = false; g.geo.index.needsUpdate = true; }
      return true;
    }
    var outers = [], holes = [], tris = [];
    function vec(v) { return new THREE.Vector2(uv[2 * v], uv[2 * v + 1]); }
    for (k = 0; k < C.loops.length; k++) {
      var Lk = C.loops[k], a2 = 0;
      for (i = 0; i < Lk.length; i++) { var p = Lk[i], q = Lk[(i + 1) % Lk.length]; a2 += uv[2 * p] * uv[2 * q + 1] - uv[2 * q] * uv[2 * p + 1]; }
      if (Math.abs(a2) < 1e-14) return false;
      (a2 * sg > 0 ? outers : holes).push({ L: Lk, a: Math.abs(a2) / 2, used: false });
    }
    if (!outers.length) return false;
    for (k = 0; k < outers.length; k++) {
      var O = outers[k], poly = O.L.map(function (v) { return [uv[2 * v], uv[2 * v + 1]]; }), ids = O.L.slice(), area = O.a, sum = 0, tr;
      var mine = holes.filter(function (h) { return !h.used && (outers.length === 1 || K._.pointInPoly([uv[2 * h.L[0]], uv[2 * h.L[0] + 1]], poly)); });
      mine.forEach(function (h) { h.used = true; ids = ids.concat(h.L); area -= h.a; });
      try { tr = THREE.ShapeUtils.triangulateShape(O.L.map(vec), mine.map(function (h) { return h.L.map(vec); })); } catch (err) { return false; }
      for (i = 0; i < tr.length; i++) {
        var A = ids[tr[i][0]], B = ids[tr[i][1]], D = ids[tr[i][2]], ar = rgArea(uv, A, B, D) * sg;
        if (ar < -1e-12) return false;
        sum += ar / 2; tris.push(A, B, D);
      }
      if (Math.abs(sum - area) > 1e-9 * Math.max(1, area)) return false;
    }
    if (holes.some(function (h) { return !h.used; }) || tris.length > 3 * C.slots.length) return false;
    for (k = 0; k < C.slots.length; k++) {
      t = C.slots[k]; i = 3 * k;
      if (i < tris.length) { g.idx[t] = tris[i]; g.idx[t + 1] = tris[i + 1]; g.idx[t + 2] = tris[i + 2]; }
      else g.idx[t] = g.idx[t + 1] = g.idx[t + 2] = C.idx0[t];
    }
    C.own = true; g.geo.index.needsUpdate = true;
    rgStats.cavity++;
    return true;
  }
  // rfPA (lane dragfeel): a drag that changes how many points an entity's outline has (a hole dragged by its edge: its
  // radius sets its segment count) stopped the region from being drawn until the release. The new outline is put on
  // the old count instead (points evenly along its length from the same start; an open piece keeps its two ends
  // exactly), so the region's vertices move in place and its triangles follow; the release draws the true count.
  function rgResampleLike(o, n) {
    if (!o || !n || o.length !== n.length) return null;
    var out = [];
    for (var a = 0; a < o.length; a++) {
      if (!!o[a].closed !== !!n[a].closed || o[a].pts.length < 2 || n[a].pts.length < 2) return null;
      out.push(o[a].pts.length === n[a].pts.length ? n[a] : { closed: n[a].closed, pts: rgResample(n[a].pts, !!n[a].closed, o[a].pts.length) });
    }
    return out;
  }
  function rgResample(P, closed, k) {
    var m = P.length, segs = closed ? m : m - 1, cum = [0], i;
    for (i = 0; i < segs; i++) { var A = P[i], B = P[(i + 1) % m]; cum.push(cum[i] + Math.hypot(B[0] - A[0], B[1] - A[1])); }
    var L = cum[segs], out = [], s = 0;
    for (var j = 0; j < k; j++) {
      if (!closed && j === k - 1) { out.push(P[m - 1].slice()); break; }
      var t = L * j / (closed ? k : k - 1);
      while (s < segs - 1 && cum[s + 1] < t) s++;
      var A2 = P[s], B2 = P[(s + 1) % m], d = cum[s + 1] - cum[s], u = d > 0 ? (t - cum[s]) / d : 0;
      out.push(j === 0 ? P[0].slice() : [A2[0] + (B2[0] - A2[0]) * u, A2[1] + (B2[1] - A2[1]) * u]);
    }
    return out;
  }
  function rgArea(uv, a, b, c) { return (uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * c] - uv[2 * a]) * (uv[2 * b + 1] - uv[2 * a + 1]); }
  function rgFastWanted(f) {
    var c = rgCache;
    return !!(App.sketchDragging && c.regions && c.fid === f.id && c.ej && c.ej.length === f.entities.length && c.cost > rgBudget &&
      c.tail === JSON.stringify(f.layers || null) + (K._ && K._.tessKey ? K._.tessKey() : ''));
  }
  // the first fast frame after a full build: which vertices and open ends each point gave, and which entities have a point there
  // rfPA (lane dragfeel): that map costs 60 ms on the 1,600-hole plate, paid by the first move of the first drag; it
  // is made while the app is idle after the regions are worked out (rgWarm), and a drag's first frame takes it from there
  var rgWarm = null, rgWarmT = 0;
  function rgWarmSoon(f) {
    if (rgWarmT || !(rgCache.cost > rgBudget) || UI.sketchRegionWarm === false) return;
    var go = function () { rgWarmT = 0; var a = UI.activeSketchFeature && UI.activeSketchFeature(); if (a === f && rgCache.fid === f.id && !App.sketchDragging && !(rgWarm && rgWarm.key === rgCache.key)) { try { rgWarm = rgFastMaps(f); rgStats.warm = (rgStats.warm || 0) + 1; } catch (e) { rgWarm = null; } } };
    rgWarmT = window.requestIdleCallback ? requestIdleCallback(go, { timeout: 400 }) : setTimeout(go, 50);
  }
  function rgFastInit(f) {
    var m = rgWarm && rgWarm.key === rgCache.key ? rgWarm : rgFastMaps(f);
    rgWarm = null;
    rgFast = { key: m.key, vmap: m.vmap, use: m.use, endAt: m.endAt, old: {}, patched: {}, broken: {}, touched: {}, ends: rgCache.ends.map(function (p) { return p.slice(); }) };
  }
  function rgFastMaps(f) {
    var key2 = K._.key2, vmap = new Map(), use = new Map(), endAt = new Map();
    rgCache.regions.forEach(function (r, ri) {
      var vi = 0;
      [r.outer].concat(r.holes).forEach(function (loop) { loop.forEach(function (p) { var k = key2(p), l = vmap.get(k); if (!l) vmap.set(k, l = []); l.push(ri, vi++); }); });
    });
    f.entities.forEach(function (e, i) {
      var pls = rgProfilePolys(f, JSON.stringify(e) === rgCache.ej[i] ? e : JSON.parse(rgCache.ej[i]));
      (pls || []).forEach(function (pl) { pl.pts.forEach(function (p) { var k = key2(p), l = use.get(k); if (!l) use.set(k, l = []); if (l[l.length - 1] !== i) l.push(i); }); });
    });
    rgCache.ends.forEach(function (p, k) { endAt.set(key2(p), k); });
    return { key: rgCache.key, vmap: vmap, use: use, endAt: endAt };
  }
  // move what the changed entities gave to where they are now; marks the regions that cannot be followed
  function rgFastPatch(f, pl, plKey) {
    if (!rgFast || rgFast.key !== rgCache.key) rgFastInit(f);
    var F = rgFast, key2 = K._.key2, todo = {}, list = [], moves = new Map(), mvBy = {}, i;
    var vers = rgCache.vers && UI.sketchEntityVersions ? UI.sketchEntityVersions(f) : null, v0 = vers && vers.length === rgCache.vers.length ? rgCache.vers : null;
    for (i = 0; i < f.entities.length; i++) if (F.patched[i] || (!(v0 && vers[i] === v0[i]) && JSON.stringify(f.entities[i]) !== rgCache.ej[i])) { todo[i] = true; list.push(i); }
    var cav = F.cavOnly || (F.cavOnly = {});   // rfPA: regions hidden because the gap failed this frame: still followed, shown again when it works
    function breakKey(k, why) { var l = F.vmap.get(k); if (l) for (var q = 0; q < l.length; q += 2) if (!F.broken[l[q]] || cav[l[q]]) { if (!F.broken[l[q]]) rgStats.broken++; F.broken[l[q]] = true; delete cav[l[q]]; rgStats.why = why; } }
    function breakAll(pls) { (pls || []).forEach(function (p) { p.pts.forEach(function (q) { breakKey(key2(q), 'points'); }); }); }
    list.forEach(function (i) {
      var o = F.old[i];
      if (o === undefined) { try { o = F.old[i] = rgProfilePolys(f, JSON.parse(rgCache.ej[i])); } catch (err) { o = F.old[i] = null; } }
      var n = rgProfilePolys(f, f.entities[i]);
      F.patched[i] = true;
      if (!o && !n) return;
      var same = !!(o && n && o.length === n.length);
      for (var a = 0; same && a < o.length; a++) same = o[a].pts.length === n[a].pts.length && !!o[a].closed === !!n[a].closed;
      if (!same && UI.sketchRegionResample !== false) { var n2 = rgResampleLike(o, n); if (n2) { n = n2; same = true; rgStats.resampled = (rgStats.resampled || 0) + 1; } }
      if (!same) { breakAll(o); return; }
      for (a = 0; a < o.length; a++) for (var b = 0; b < o[a].pts.length; b++) {
        var k = key2(o[a].pts[b]), p = n[a].pts[b], mv = moves.get(k);
        if (mv && key2(mv) !== key2(p)) breakKey(k, 'apart');
        else if (!mv) moves.set(k, p);
      }
    });
    moves.forEach(function (p, k) {
      // a point an entity that stayed still has too: the contour comes apart there (or another shape merely touched it)
      var u = F.use.get(k), l = F.vmap.get(k), q;
      if (u && key2(p) !== k) for (q = 0; q < u.length; q++) if (!todo[u[q]]) { breakKey(k, 'held'); break; }
      if (l) for (q = 0; q < l.length; q += 2) {
        var ri = l[q], vi = l[q + 1], r = rgCache.regions[ri], g = (!F.broken[ri] || cav[ri]) && rgGeometry(rgCache, r, pl, plKey);
        if (!g) continue;
        var w = K.to3D(pl, p[0], p[1]);
        g.uv[2 * vi] = p[0]; g.uv[2 * vi + 1] = p[1]; g.pos[3 * vi] = w[0]; g.pos[3 * vi + 1] = w[1]; g.pos[3 * vi + 2] = w[2];
        F.touched[ri] = 2;
        (mvBy[ri] = mvBy[ri] || []).push(vi);
      }
      var ei = F.endAt.get(k);
      if (ei != null) F.ends[ei] = [p[0], p[1]];
    });
    Object.keys(F.touched).forEach(function (ri) {
      if (F.touched[ri] !== 2) return;
      F.touched[ri] = 1;
      var g = rgCache.regions[ri].g;
      if (!g || (F.broken[ri] && !cav[ri])) return;
      if (!rgCavity(g, mvBy[ri] || [])) { if (!F.broken[ri]) rgStats.broken++; F.broken[ri] = true; cav[ri] = true; rgStats.why = 'cavity'; return; }
      if (cav[ri]) { delete F.broken[ri]; delete cav[ri]; rgStats.back = (rgStats.back || 0) + 1; }
      g.geo.attributes.position.needsUpdate = true;
      g.geo.boundingSphere = null; g.geo.boundingBox = null;
    });
    rgStats.fast++;
  }
  // test hooks: the budget (ms; 0 = always follow a drag the fast way, Infinity = never) and what was done
  UI.sketchRegionBudget = function (ms) { if (ms != null) rgBudget = ms; return rgBudget; };
  UI.sketchRegionStats = function () { return { full: rgStats.full, fast: rgStats.fast, tri: rgStats.tri, broken: rgStats.broken, adopted: rgStats.adopted, cavity: rgStats.cavity, warm: rgStats.warm || 0, resampled: rgStats.resampled || 0, grown: rgStats.grown || 0, back: rgStats.back || 0, why: rgStats.why || '', cost: rgCache.cost || 0, dragging: !!rgFast, hidden: rgFast ? Object.keys(rgFast.broken).length : 0 }; };
  function darkView() { return true; }   // rfBR: the graphics area is grey-black in every theme and background
  function regionMats() {
    var dark = darkView();
    if (!rgMats || rgMats.dark !== dark) {
      var col = 0xb4b4b4;   // rfBR: a light grey wash (was blue)
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
    // rfOG: mid-drag on a sketch whose regions are dear, follow the changed entities in place; else the full profile
    var fast = rgFastWanted(f), plKey = rgPlaneKey(pl), d, M = regionMats(), out = [];
    if (fast) { d = rgCache; rgFastPatch(f, pl, plKey); }
    else {
      var was = rgFast && rgFast.key === rgCache.key ? rgFast : null;
      d = regionData(f);
      // the same sketch as before the drag (it was put back): the regions the drag moved or dropped are made again
      if (was && d.key === was.key) Object.keys(was.touched).concat(Object.keys(was.broken)).forEach(function (ri) { var r = d.regions[ri]; if (r && r.g) { r.g.geo.dispose(); r.g = null; } });
      rgFast = null;
      rgStats.full++;
    }
    d.regions.forEach(function (r, ri) {
      if (fast && rgFast.broken[ri]) return;
      var rg = rgGeometry(d, r, pl, plKey);
      if (!rg) return;
      var m = new THREE.Mesh(rg.geo, ri === hoverRegion ? M.hover : M.base);
      m.renderOrder = 9;
      m.raycast = noRaycast;
      m.userData = { sketchRegion: ri };
      rgDrawn.push(m);
      out.push(m);
    });
    var ends = fast ? rgFast.ends : d.ends;
    if (ends.length) {
      var pos2 = [];
      ends.forEach(function (p) { var q = K.to3D(pl, p[0], p[1]); pos2.push(q[0], q[1], q[2]); });
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
    // (rfOG: the hover asks on every mouse move; the regions of the sketch as last drawn need no new key)
    var d = rgCache.regions && rgCache.fid === f.id && rgCache.ver != null && rgCache.ver === UI.sketchSceneVersion() && !rgFast ? rgCache : regionData(f);
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
    var r = UI.viewportRect ? UI.viewportRect() : UI.viewport.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;   // rfOG: no layout per move
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
  // ---- paste between unit systems: a copy from an inch document pasted into a mm one (or back) is scaled about the
  // sketch origin by 25.4 (1 / 25.4) so it keeps its real size: entity lengths and positions, driving distance values,
  // dimension placements and tolerances; angles (arc ends, rotations, angle dimensions, spline tangent directions) and
  // counts are kept. unitsOf: Anvil documents are 'in' or else millimetres.
  function unitsOf(u) { return u === 'in' ? 'in' : 'mm'; }
  function clipScale(c) { var a = unitsOf(c.units), b = unitsOf(App.model.units); return a === b ? 1 : a === 'in' ? 25.4 : 1 / 25.4; }
  var LEN_KEYS = ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'size', 'height'];
  function scaleEntity(e, s) {
    // rfCY: a Sketch Text scales as Scale Entities scales it (letter height, outline stroke width, stencil bridges, the
    // curve it runs along), about the origin
    if (e.t === 'text' && K.transformText) return K.transformText(e, { s: s, cx: 0, cy: 0 });   // (a pasted text keeps its curve's shape, path.g, scaled: K.translateEntity unlinks it anyway)
    var o = clone(e);
    LEN_KEYS.forEach(function (k) { if (typeof o[k] === 'number') o[k] *= s; });
    if (Array.isArray(o.pts)) o.pts = o.pts.map(function (p) { return [p[0] * s, p[1] * s]; });
    if (o.fit && typeof o.fit.tol === 'number') { o.fit.tol *= s; delete o.fit.sig; }   // fitspline2: a fit spline's tolerance is a length
    // rfCY: a spline's curvature control (tans[k][3], 1 / R) scales as 1 / s; the tangent directions and weights stay
    if (Array.isArray(o.tans)) o.tans = o.tans.map(function (tg) { if (!tg) return tg; var t = tg.slice(); if (t[3] != null && isFinite(+t[3])) t[3] = +t[3] / s; return t; });
    return o;
  }
  function scaleTol(t, s) { if (t && typeof t === 'object') { if (typeof t.plus === 'number') t.plus *= s; if (typeof t.minus === 'number') t.minus *= s; } }
  // the clipboard in the active document's units: -> { clip, scale }
  function scaledClip(c) {
    var s = clipScale(c);
    if (s === 1) return { clip: c, scale: 1 };
    var out = clone(c);
    out.entities = c.entities.map(function (e) { return scaleEntity(e, s); });
    out.rels.forEach(function (r) {
      // (rfCY: every length-valued dimension relation: distance, arc length, path length, chamfer distance)
      if (/^(distance|arclength|pathlength|chamfer)$/.test(r.type) && typeof r.v === 'number') { r.v *= s; scaleTol(r.tol, s); }
      if (typeof r.off === 'number') r.off *= s;
      if (typeof r.tx === 'number') r.tx *= s;
    });
    out.dims.forEach(function (d) { if (typeof d.off === 'number') d.off *= s; scaleTol(d.tol, s); });
    out.anchor = [c.anchor[0] * s, c.anchor[1] * s];
    out.units = unitsOf(App.model.units);
    out.scale = s;   // placeClip reports it
    return { clip: out, scale: s };
  }
  function scaleNote(c, s) { return s === 1 ? '' : ' (scaled × ' + UI.fmtNum(s, 6) + ': ' + (unitsOf(c.units) === 'in' ? 'inches to millimeters' : 'millimeters to inches') + ')'; }
  function moved(c, p) {
    var dx = p[0] - c.anchor[0], dy = p[1] - c.anchor[1];
    return c.entities.map(function (e) { return K.translateEntity(e, dx, dy); });
  }
  // puts the clipboard into the active sketch with its anchor at p: -> { first, count } (one undo step)
  function placeClip(c, p, note) {
    var f = UI.activeSketchFeature();
    if (!f) return null;
    markDirty();
    var base = f.entities.length, map = {};
    moved(c, p).forEach(function (e, k) { map[k] = base + k; f.entities.push(e); });
    if (K.relinkFitCopies) K.relinkFitCopies(f, base, c.entities.length);   // fitspline2: a copied Constrained fit spline follows its copied chain
    c.rels.forEach(function (r) { var q = clone(r); q.refs = mapRefs(q.refs, map); if (q.refs) (f.rels = f.rels || []).push(q); });
    c.dims.forEach(function (d) { var q = clone(d); q.e = map[q.e]; (f.dims = f.dims || []).push(q); });
    (c.layers || []).forEach(function (l) { if (!layerRec(f, l.name)) (f.layers = f.layers || []).push(clone(l)); });
    // relations that no longer apply (none should) and exact repeats go, as after any sketch edit
    if (window.SketchSolver) { try { SketchSolver.clean(f); } catch (e) { } }
    var sel = [];
    for (var i = base; i < f.entities.length; i++) sel.push({ kind: 'entity', index: i });
    if (UI.setSelection) UI.setSelection(sel); else App.sel = sel[0] || null;
    refresh();
    UI.setStatus('Pasted ' + c.entities.length + ' entit' + (c.entities.length === 1 ? 'y' : 'ies') + (note || '') + '.');
    return { first: base, count: c.entities.length, scale: c.scale || 1 };
  }
  function sketchPaste(at) {
    var f = UI.activeSketchFeature(), c = readClip();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    if (!c) { UI.setStatus('Nothing to paste: select sketch entities and press Ctrl+C first.'); return null; }
    var sc = scaledClip(c), note = scaleNote(c, sc.scale);   // a copy from a document in other units keeps its real size
    c = sc.clip;
    if (at) return placeClip(c, [+at[0], +at[1]], note);
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
          var r = placeClip(c, anchorAt(raw, mx, my).p, note);
          clearPreview();
          UI.closePM();
          return r;
        }
      },
      groups: [{ title: 'Clipboard', fields: [{ type: 'static', label: 'Entities', value: String(c.entities.length) }, { type: 'static', label: 'Relations / dimensions', value: c.rels.length + ' / ' + c.dims.length }]
        .concat(sc.scale !== 1 ? [{ type: 'static', label: 'Scale', value: note.replace(/^ \(scaled |\)$/g, '') }] : []) }],
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
