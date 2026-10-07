// ui-levels.js — Levels Manager (Mastercam): part-wide numbered levels for the 2D entities of every sketch, built on
// the sketch layers of ui-sketch-layers.js / kernel-sketch.js. Loaded after ui-sketch-layers.js.
//
// Data. The master table lives on the model: model.levels = [{ number, name, color, hidden, noProfile, lineType, aci,
// set }] (sorted by number; level 1 always exists) and model.mainLevel (the number new geometry goes on). The kernel
// and the worker keep reading each sketch's own layer table, which this file keeps in step with the levels:
//   - an entity on level 1 has no `layer` (the kernel's default layer "0"); level 1 has no colour / profile / line
//     type of its own, and goes to the DXF on OUTLINE / HOLES as before;
//   - an entity on any other level has `layer` = the level's key: its name when it has one, else its number as a
//     string ("7"). Names are unique (ignoring case) and never all digits, so a key names one level. Renaming a level
//     re-keys its entities in every sketch (one undo step); the DXF writes each entity on its key, so a sketch DXF
//     carries the level names (Mastercam writes level names as DXF layers) and the number for an unnamed level;
//   - every sketch has a layer record { name: key, color, hidden, noProfile, lineType, aci } for each level its
//     entities are on (plus any it had); while level 1 is hidden a record named "1" marks it (no entity has key "1").
// Migration (sync, idempotent): a sketch layer that is not yet a level becomes one — matched to an existing level by
// name (ignoring case: "etch" joins ETCH and its entities are re-keyed) or by number, else a new level with the
// lowest free number and the layer's properties. An entity whose key has no record joins the level of that name, else
// level 1. A record edited outside this file (the Layers PropertyManager, a script's .layers(), a DXF import) passes
// its properties to its level; otherwise the level's properties are written to every sketch's record.
// Sync runs before every rebuild and load, on every sketch redraw and status-bar refresh, and around every operation
// here; each operation of the manager is one undo step (making a level main is a setting and is not).
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

  // ================================================================== the level table
  var PROPS = ['color', 'hidden', 'noProfile', 'lineType', 'aci'];
  function isPart(m) { return !!(m && m.type !== 'assembly' && Array.isArray(m.features)); }
  function sketches(m) { return m.features.filter(function (f) { return f && f.type === 'sketch' && Array.isArray(f.entities); }); }
  function normLevel(L) {
    var n = Math.round(+L.number);
    return {
      number: n, name: L.name == null ? '' : String(L.name).trim(), color: L.color || null, hidden: !!L.hidden,
      noProfile: n !== 1 && !!L.noProfile, lineType: n !== 1 && L.lineType === 'dashed' ? 'dashed' : 'continuous',
      aci: n !== 1 && L.aci > 0 ? L.aci | 0 : null, set: L.set == null ? '' : String(L.set).trim()
    };
  }
  // the model's table, made valid in place: numbers ≥ 1, no repeats, level 1 present, sorted; a valid main level
  function table(m) {
    var seen = {}, out = [];
    (Array.isArray(m.levels) ? m.levels : []).forEach(function (L) {
      if (!L || !(Math.round(+L.number) >= 1) || seen[Math.round(+L.number)]) return;
      var n = normLevel(L);
      if (n.number === 1) n.color = null;
      seen[n.number] = true;
      out.push(n);
    });
    if (!seen[1]) out.push(normLevel({ number: 1 }));
    out.sort(function (a, b) { return a.number - b.number; });
    // keep the stored objects when nothing needed fixing (a rewrite every call would churn undo snapshots for nothing)
    if (!Array.isArray(m.levels) || JSON.stringify(m.levels) !== JSON.stringify(out)) m.levels = out;
    if (!byNumber(m, m.mainLevel)) m.mainLevel = 1;
    return m.levels;
  }
  function byNumber(m, n) { n = +n; var L = m.levels || []; for (var i = 0; i < L.length; i++) if (L[i].number === n) return L[i]; return null; }
  function keyOf(L) { return L.number === 1 ? null : (L.name ? L.name : String(L.number)); }
  function byKey(m, key) { var L = m.levels || []; for (var i = 0; i < L.length; i++) if (L[i].number !== 1 && keyOf(L[i]) === key) return L[i]; return null; }
  function byName(m, name) {
    var u = String(name).toUpperCase(), L = m.levels || [];
    for (var i = 0; i < L.length; i++) if (L[i].name && L[i].name.toUpperCase() === u) return L[i];
    return null;
  }
  function lowestFree(m) { for (var n = 2; ; n++) if (!byNumber(m, n)) return n; }
  function isDigits(s) { return /^\d+$/.test(String(s)); }
  // the level a sketch layer name stands for (create: make a new level when none does)
  function resolve(m, name, create, rec) {
    name = String(name);
    var L = byKey(m, name) || byName(m, name) || (isDigits(name) ? byNumber(m, +name) : null);
    if (L || !create) return L;
    var n = isDigits(name) ? Math.max(1, +name) : lowestFree(m), props = rec ? propsOf(rec) : {};
    L = normLevel({ number: n, name: isDigits(name) ? '' : name, color: props.color, hidden: props.hidden, noProfile: props.noProfile, lineType: props.lineType, aci: props.aci });
    m.levels.push(L);
    m.levels.sort(function (a, b) { return a.number - b.number; });
    return L;
  }
  // a layer record's / level's properties, normalised (records keep only what is set, as ui-sketch-layers writes them)
  function propsOf(o) { return { color: o.color || null, hidden: !!o.hidden, noProfile: !!o.noProfile, lineType: o.lineType === 'dashed' ? 'dashed' : 'continuous', aci: o.aci > 0 ? o.aci | 0 : null }; }
  function sig(o) { var p = propsOf(o); return [p.color, p.hidden, p.noProfile, p.lineType, p.aci].join('|'); }
  function writeRec(rec, L) {
    if (sig(rec) === sig(L)) return false;
    rec.color = L.color || null;
    if (L.hidden) rec.hidden = true; else delete rec.hidden;
    if (L.noProfile) rec.noProfile = true; else delete rec.noProfile;
    if (L.lineType === 'dashed') rec.lineType = 'dashed'; else delete rec.lineType;
    if (L.aci) rec.aci = L.aci; else delete rec.aci;
    return true;
  }
  function recIn(f, name) { var L = f.layers || []; for (var i = 0; i < L.length; i++) if (L[i] && L[i].name === name) return L[i]; return null; }
  function ensureRec(f, L) {
    var key = keyOf(L);
    if (key == null) return null;
    var r = recIn(f, key);
    if (!r) { r = { name: key, color: null }; writeRec(r, L); (f.layers = f.layers || []).push(r); }
    return r;
  }
  function entityKey(e) { var k = e && e.layer; return k == null || k === '' || k === '0' ? null : String(k); }
  // the level number an entity of sketch f is on (after a sync)
  function levelOfEntity(m, f, e) {
    var k = entityKey(e);
    if (k == null || !recIn(f, k)) return 1;
    var L = byKey(m, k);
    return L ? L.number : 1;
  }
  // re-key every entity and record of every sketch from one key to another (to: null = level 1)
  function rekeyAll(m, from, to) {
    if (from === to) return;
    sketches(m).forEach(function (f) {
      f.entities.forEach(function (e) { if (e && entityKey(e) === from) { if (to == null) delete e.layer; else e.layer = to; } });
      if (!f.layers) return;
      var had = recIn(f, to);
      f.layers = f.layers.filter(function (r) {
        if (!r || r.name !== from) return true;
        if (to == null || had) return false;
        r.name = to;
        return true;
      });
      if (!f.layers.length) delete f.layers;
    });
  }

  // ------------------------------------------------------------------ sync (see the header)
  var synced = {};   // sketch id -> { record name: sig } as the last sync left them (an edit elsewhere shows as a change)
  function sync(m) {
    if (!isPart(m)) return false;
    var before = JSON.stringify(m.levels || null) + '|' + m.mainLevel;
    table(m);
    var changed = false, all = sketches(m);
    // 1. every record is a level: migrate names, pull properties edited outside the manager
    all.forEach(function (f) {
      if (f.layers != null && !Array.isArray(f.layers)) { delete f.layers; changed = true; }
      var last = synced[f.id] || {}, out = [];
      (f.layers || []).forEach(function (rec) {
        if (!rec || rec.name == null || String(rec.name) === '' || String(rec.name) === '0') { changed = true; return; }
        var name = String(rec.name);
        if (name === '1') {   // level 1's hidden marker
          var L1 = byNumber(m, 1);
          if (last[name] != null && last[name] !== sig(rec)) L1.hidden = !!rec.hidden;
          f.entities.forEach(function (e) { if (e && entityKey(e) === '1') { delete e.layer; changed = true; } });
          out.push(rec);
          return;
        }
        var L = resolve(m, name, true, rec), key = keyOf(L);
        if (key == null) {   // a layer named as level 1: its entities join level 1
          f.entities.forEach(function (e) { if (e && entityKey(e) === name) delete e.layer; });
          changed = true;
          return;
        }
        if (key !== name) {
          f.entities.forEach(function (e) { if (e && entityKey(e) === name) e.layer = key; });
          rec.name = key;
          changed = true;
        } else if (last[name] != null && last[name] !== sig(rec) && sig(rec) !== sig(L)) {
          var p = propsOf(rec);   // edited in the sketch since the last sync: the level takes it
          PROPS.forEach(function (k) { L[k] = p[k]; });
        }
        if (out.some(function (r) { return r.name === key; })) { changed = true; return; }
        out.push(rec);
      });
      if (f.layers && out.length !== f.layers.length) f.layers = out;
      // keys with no record: the level of that name, else level 1
      f.entities.forEach(function (e) {
        var k = entityKey(e);
        if (k == null || recIn(f, k) || k === '1') { if (k === '1') { delete e.layer; changed = true; } return; }
        var L = resolve(m, k, false);
        changed = true;
        if (!L || L.number === 1) { delete e.layer; return; }
        e.layer = keyOf(L);
        ensureRec(f, L);
      });
      if (f.layers && !f.layers.length) delete f.layers;
    });
    // 2. the main level is always visible (Mastercam); a main level hidden from elsewhere hands over to a visible one
    var main = byNumber(m, m.mainLevel);
    if (main.hidden) {
      var vis = m.levels.filter(function (L) { return !L.hidden; })[0];
      if (!vis) { vis = byNumber(m, 1); vis.hidden = false; }
      m.mainLevel = vis.number;
    }
    // 3. the levels' properties into every record; level 1's hidden marker where it is hidden
    var L1h = byNumber(m, 1).hidden;
    all.forEach(function (f) {
      var s = {};
      if (L1h && !recIn(f, '1')) { (f.layers = f.layers || []).push({ name: '1', color: null, hidden: true }); changed = true; }
      if (f.layers) {
        f.layers = f.layers.filter(function (rec) {
          if (rec.name === '1') {
            if (!L1h) { changed = true; return false; }
            if (writeRec(rec, { hidden: true })) changed = true;
          } else {
            var L = byKey(m, rec.name);
            if (L && writeRec(rec, L)) changed = true;
          }
          s[rec.name] = sig(rec);
          return true;
        });
        if (!f.layers.length) delete f.layers;
      }
      synced[f.id] = s;
    });
    return changed || before !== JSON.stringify(m.levels) + '|' + m.mainLevel;
  }

  // ------------------------------------------------------------------ queries
  function counts(m) {
    var c = {};
    sketches(m).forEach(function (f) { f.entities.forEach(function (e) { if (!e) return; var n = levelOfEntity(m, f, e); c[n] = (c[n] || 0) + 1; }); });
    return c;
  }
  // [{ number, name, key, color, hidden, noProfile, lineType, aci, set, count, main, used, named }]
  function levelList(m) {
    m = m || App.model;
    if (!isPart(m)) return [];
    sync(m);
    var c = counts(m);
    return m.levels.map(function (L) {
      return { number: L.number, name: L.name, key: keyOf(L), color: L.color, hidden: L.hidden, noProfile: L.noProfile, lineType: L.lineType, aci: L.aci, set: L.set,
        count: c[L.number] || 0, main: L.number === m.mainLevel, used: !!c[L.number], named: !!L.name };
    });
  }
  function mainLevel(m) { m = m || App.model; if (!isPart(m)) return null; table(m); return byNumber(m, m.mainLevel); }
  function label(L) { return L.number + (L.name ? ' ' + L.name : ''); }
  function selectedEntities() {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s && s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.sort(function (a, b) { return a - b; });
  }
  function validName(m, name, except) {
    name = String(name == null ? '' : name).trim();
    if (!name) return { name: '' };
    if (isDigits(name)) return { error: 'A level name cannot be only digits (it would read as a level number).' };
    var o = byName(m, name);
    if (o && o !== except) return { error: 'Level ' + o.number + ' is already named ' + o.name + '.' };
    return { name: name };
  }

  // ================================================================== operations (each one undo step)
  // Every op takes the model and returns { ok, error?, geom? (the solid may change), … }; run() wraps it.
  function begin() { UI.pushUndo(); if (App.mode === 'sketch') App.sketchDirty = true; }
  function need(m, n) { var L = byNumber(m, n); return L ? { L: L } : { error: 'There is no level ' + n + '.' }; }
  function activeSketch() { return App.mode === 'sketch' && UI.activeSketchFeature ? UI.activeSketchFeature() : null; }
  var Ops = {
    // create(number?, { name, color, noProfile, lineType, aci, set }?) -> { number }
    create: function (m, n, props) {
      props = props || {};
      n = n == null || n === '' ? lowestFree(m) : Math.round(+n);
      if (!(n >= 1 && n <= 65535)) return { ok: false, error: 'Level numbers run from 1 to 65535.' };
      if (byNumber(m, n)) return { ok: false, error: 'Level ' + n + ' already exists.' };
      var v = validName(m, props.name);
      if (v.error) return { ok: false, error: v.error };
      begin();
      var L = normLevel({ number: n, name: v.name, color: props.color, noProfile: props.noProfile, lineType: props.lineType, aci: props.aci, set: props.set });
      m.levels.push(L);
      m.levels.sort(function (a, b) { return a.number - b.number; });
      return { ok: true, number: n };
    },
    // preset('CUT' | 'ETCH' | 'BEND', number?): a new level with the shop preset's colour, profile and line type
    preset: function (m, name, n) {
      var p = (K.LAYER_PRESETS || []).filter(function (x) { return x.name === name; })[0];
      if (!p) return { ok: false, error: 'No preset ' + name + '.' };
      if (byName(m, name)) return { ok: false, error: 'Level ' + byName(m, name).number + ' is already ' + name + '.' };
      return Ops.create(m, n, { name: p.name, color: p.color, noProfile: p.noProfile, lineType: p.lineType, aci: p.aci });
    },
    // makeMain(number): new geometry goes on it; a number with no level creates it (Mastercam); a hidden level is shown
    makeMain: function (m, n) {
      n = Math.round(+n);
      var L = byNumber(m, n);
      if (!L) { var r = Ops.create(m, n); if (!r.ok) return r; L = byNumber(m, n); }
      else if (L.hidden) { begin(); L.hidden = false; }
      m.mainLevel = n;
      return { ok: true, number: n };
    },
    setVisible: function (m, n, on) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      if (!on && n === m.mainLevel) return { ok: false, error: 'The main level is always visible. Make another level main first.' };
      if (q.L.hidden === !on) return { ok: true };
      begin();
      q.L.hidden = !on;
      return { ok: true };
    },
    allOn: function (m) {
      if (!m.levels.some(function (L) { return L.hidden; })) return { ok: true };
      begin();
      m.levels.forEach(function (L) { L.hidden = false; });
      return { ok: true };
    },
    // all off but the main level
    allOff: function (m) {
      if (!m.levels.some(function (L) { return !L.hidden && L.number !== m.mainLevel; })) return { ok: true };
      begin();
      m.levels.forEach(function (L) { L.hidden = L.number !== m.mainLevel; });
      return { ok: true };
    },
    hideOthers: function (m, n) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      begin();
      m.levels.forEach(function (L) { L.hidden = L.number !== n && L.number !== m.mainLevel; });
      return { ok: true };
    },
    // a level set's levels all on, or all off when they are all on (the main level stays on)
    toggleSet: function (m, set, on) {
      set = String(set || '').trim().toUpperCase();
      var mem = m.levels.filter(function (L) { return L.set && L.set.toUpperCase() === set; });
      if (!set || !mem.length) return { ok: false, error: 'No level set ' + set + '.' };
      if (on == null) on = mem.some(function (L) { return L.hidden; });
      begin();
      mem.forEach(function (L) { L.hidden = !on && L.number !== m.mainLevel; });
      return { ok: true, visible: !!on, levels: mem.map(function (L) { return L.number; }) };
    },
    rename: function (m, n, name) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      var v = validName(m, name, q.L);
      if (v.error) return { ok: false, error: v.error };
      if (v.name === q.L.name) return { ok: true };
      begin();
      var from = keyOf(q.L);
      q.L.name = v.name;
      if (from != null) rekeyAll(m, from, keyOf(q.L));
      return { ok: true };
    },
    setSet: function (m, n, set) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      set = String(set == null ? '' : set).trim();
      if (set === q.L.set) return { ok: true };
      begin();
      q.L.set = set;
      return { ok: true };
    },
    // setProps(number, { color, noProfile, lineType }): not on level 1 (the default level keeps the entities' own look)
    setProps: function (m, n, props) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      if (n === 1) return { ok: false, error: 'Level 1 is the default level: its entities keep their own colour, line type and profile.' };
      begin();
      var geom = false;
      Object.keys(props || {}).forEach(function (k) {
        var v = props[k];
        if (k === 'color') { q.L.color = v || null; q.L.aci = null; }   // the DXF colour follows a new colour
        else if (k === 'noProfile') { geom = geom || q.L.noProfile !== !!v; q.L.noProfile = !!v; }
        else if (k === 'lineType') q.L.lineType = v === 'dashed' ? 'dashed' : 'continuous';
        else if (k === 'aci') q.L.aci = v > 0 ? v | 0 : null;
      });
      return { ok: true, geom: geom };
    },
    // remove(number): its entities go to level 1
    remove: function (m, n) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      if (n === 1) return { ok: false, error: 'Level 1 cannot be deleted.' };
      var moved = counts(m)[n] || 0;
      begin();
      rekeyAll(m, keyOf(q.L), null);
      m.levels = m.levels.filter(function (L) { return L !== q.L; });
      if (m.mainLevel === n) m.mainLevel = 1;
      return { ok: true, moved: moved, geom: true };
    },
    // levels with no entities, other than level 1 and the main level
    clearUnused: function (m) {
      var c = counts(m), gone = m.levels.filter(function (L) { return L.number !== 1 && L.number !== m.mainLevel && !c[L.number]; });
      if (!gone.length) return { ok: true, removed: 0 };
      begin();
      gone.forEach(function (L) { rekeyAll(m, keyOf(L), null); });
      m.levels = m.levels.filter(function (L) { return gone.indexOf(L) < 0; });
      return { ok: true, removed: gone.length, geom: true };
    },
    // move(number, indices?) / copy(number, indices?): entities of the open sketch (default: the selection)
    move: function (m, n, idx) { return moveCopy(m, n, idx, false); },
    copy: function (m, n, idx) { return moveCopy(m, n, idx, true); },
    // the entities of the open sketch on a level, selected
    selectAll: function (m, n) {
      var q = need(m, n); if (q.error) return { ok: false, error: q.error };
      var f = activeSketch();
      if (!f) return { ok: false, error: 'Open a sketch to select its entities on a level.' };
      if (q.L.hidden) return { ok: false, error: 'Level ' + n + ' is hidden: show it first.' };
      var sel = [];
      f.entities.forEach(function (e, i) { if (e && levelOfEntity(m, f, e) === n) sel.push({ kind: 'entity', index: i }); });
      if (UI.setSelection) UI.setSelection(sel); else App.sel = sel[0] || null;
      return { ok: true, count: sel.length, noUndo: true };
    }
  };
  function moveCopy(m, n, idx, copy) {
    var q = need(m, n); if (q.error) return { ok: false, error: q.error };
    var f = activeSketch();
    if (!f) return { ok: false, error: 'Open a sketch, select its entities, then ' + (copy ? 'Copy' : 'Move') + ' to a level.' };
    idx = (idx || selectedEntities()).filter(function (i) { return f.entities[i]; });
    if (!idx.length) return { ok: false, error: 'Select sketch entities first, then ' + (copy ? 'Copy' : 'Move') + ' selected entities to this level.' };
    begin();
    var key = keyOf(q.L), first = f.entities.length;
    if (key != null) ensureRec(f, q.L);
    idx.forEach(function (i) {
      var e = copy ? JSON.parse(JSON.stringify(f.entities[i])) : f.entities[i];
      if (key == null) delete e.layer; else e.layer = key;
      if (copy) f.entities.push(e);
    });
    if (copy && UI.setSelection) { var sel = []; for (var i = first; i < f.entities.length; i++) sel.push({ kind: 'entity', index: i }); UI.setSelection(sel); }
    return { ok: true, count: idx.length, first: copy ? first : undefined, geom: true };
  }
  // run(op, ...): sync, the op, sync again (the new table into every sketch), redraw; a failure leaves a message
  function run(name) {
    var m = App.model;
    if (!isPart(m)) return { ok: false, error: 'Levels belong to part documents.' };
    if (!Ops[name]) return { ok: false, error: 'No level operation ' + name + '.' };
    sync(m);
    var r = Ops[name].apply(null, [m].concat(Array.prototype.slice.call(arguments, 1)));
    if (!r.ok) { UI.setStatus(r.error); return r; }
    sync(m);
    App.gridStale = true;
    UI.updateSketches();
    if (UI.refreshTree) UI.refreshTree();
    UI.refreshStatus();
    if (r.geom && App.mode !== 'sketch') UI.rebuild();
    renderPane(true);
    return r;
  }
  function fail(r) { if (r && !r.ok && r.error) UI.toast(r.error); return r; }

  // ================================================================== hooks into the sketch layers and the app
  // new geometry goes on the main level (ui-sketch.js calls UI.sketchLayerNew for every new entity)
  var baseLayerNew = UI.sketchLayerNew;
  UI.sketchLayerNew = function (f, e) {
    var m = App.model;
    if (!isPart(m)) { if (baseLayerNew) baseLayerNew(f, e); return; }
    if (!f || !e || e.layer != null) return;
    var L = mainLevel(m);
    if (!L || L.number === 1) return;
    e.layer = keyOf(L);
    ensureRec(f, L);
  };
  // ui-sketch-layers.js asks these for its current layer: the main level's key ("0" for level 1), and sets it
  UI.levelCurrentKey = function () { var L = mainLevel(); return L && L.number !== 1 ? keyOf(L) : '0'; };
  UI.levelSetCurrentKey = function (f, name) {
    var m = App.model;
    if (!isPart(m)) return;
    sync(m);
    var L = String(name) === '0' ? byNumber(m, 1) : resolve(m, name, false);
    if (!L) return;
    if (L.hidden) { L.hidden = false; sync(m); UI.updateSketches(); }
    m.mainLevel = L.number;
    UI.refreshStatus();
    renderPane(true);
  };
  // hidden levels: not drawn (sketchLayerStyle), not picked, snapped to or box-selected (entityLayerHidden). Levels
  // other than 1 are hidden through their layer records; level 1's entities have no record, so the table answers.
  var baseHidden = UI.entityLayerHidden, baseStyle = UI.sketchLayerStyle;
  function level1Hidden() { var m = App.model; if (!isPart(m) || !m.levels) return false; var L = byNumber(m, 1); return !!(L && L.hidden); }
  UI.entityLayerHidden = function (f, e) {
    if (baseHidden && baseHidden(f, e)) return true;
    return !K.sketchLayer(f, e) && level1Hidden();
  };
  UI.sketchLayerStyle = function (f, e, active) {
    var s = baseStyle ? baseStyle(f, e, active) : null;
    if (s || K.sketchLayer(f, e)) return s;
    return level1Hidden() ? { hidden: true, mat: null, dashed: false } : null;
  };
  // sync before every rebuild and load, on every redraw of the sketches and every status refresh (cheap: one pass
  // over the entities, and nothing is written when all is in step)
  function quiet(m) { try { return sync(m); } catch (err) { if (window.console) console.warn('levels sync', err); return false; } }
  var baseRebuild = UI.rebuild;
  UI.rebuild = function () { if (isPart(App.model)) quiet(App.model); return baseRebuild.apply(this, arguments); };
  var baseLoad = UI.loadModel;
  UI.loadModel = function (model) { synced = {}; if (isPart(model)) quiet(model); return baseLoad.apply(this, arguments); };
  var baseUpdateSketches = UI.updateSketches;
  UI.updateSketches = function () { if (isPart(App.model)) quiet(App.model); return baseUpdateSketches.apply(this, arguments); };
  var baseRefreshStatus = UI.refreshStatus;
  UI.refreshStatus = function () {
    if (App.model && isPart(App.model)) quiet(App.model);
    var r = baseRefreshStatus.apply(this, arguments);
    renderPane(false);
    return r;
  };

  // ================================================================== the Levels Manager pane (FeatureManager tab)
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var DISPLAY = [['all', 'All'], ['used', 'Used'], ['named', 'Named'], ['usedNamed', 'Used or named']];
  var display = 'all', editing = null;
  try { var d0 = localStorage.getItem('anvil.levelsDisplay'); if (DISPLAY.some(function (d) { return d[0] === d0; })) display = d0; } catch (e) { }
  function shown(l) {
    if (l.main || display === 'all') return true;
    if (display === 'used') return l.used;
    if (display === 'named') return l.named;
    return l.used || l.named;
  }
  function levelSets(list) {
    var sets = {};
    list.forEach(function (l) { if (!l.set) return; var k = l.set.toUpperCase(); (sets[k] = sets[k] || { name: l.set, levels: [], on: 0 }).levels.push(l.number); if (!l.hidden) sets[k].on++; });
    return Object.keys(sets).sort().map(function (k) { return sets[k]; });
  }
  var panel = el('div', { id: 'levels-panel', role: 'region', 'aria-label': 'Levels Manager' });
  panel.hidden = true;
  (function mount() {
    var left = $('left'), pm = $('pm');
    if (left) left.insertBefore(panel, pm || null);
  })();
  function renderPane(force) {
    if (panel.hidden || editing) return;
    var m = App.model;
    if (!isPart(m)) {
      if (panel._sig !== 'asm') { panel._sig = 'asm'; panel.innerHTML = head() + '<div class="lvl-empty">Levels belong to part documents: open a part to manage the levels of its sketches.</div>'; }
      return;
    }
    var list = levelList(m), sets = levelSets(list), f = activeSketch();
    var s = JSON.stringify([list, display, !!f, f && f.id]);
    if (!force && s === panel._sig) return;
    panel._sig = s;
    var main = mainLevel(m), rows = list.filter(shown);
    var h = head() +
      '<div class="lvl-tools">' +
        '<button type="button" data-act="new" title="Add a new level (the lowest free number)">New</button>' +
        '<button type="button" data-act="allOn" title="Make every level visible">All on</button>' +
        '<button type="button" data-act="allOff" title="Hide every level but the main level">All off</button>' +
        '<select id="lvl-sets" title="Level sets: show or hide all the levels of a set at once"' + (sets.length ? '' : ' disabled') + '>' +
          '<option value="">Level sets…</option>' + sets.map(function (st) {
            return '<option value="' + esc(st.name) + '">' + esc(st.name) + ' (' + st.levels.join(', ') + ') ' + (st.on === st.levels.length ? '— on' : st.on ? '— partly on' : '— off') + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div id="lvl-grid" role="grid" aria-label="Levels">' +
        '<div class="lvl-row lvl-hdr" role="row"><span>Number</span><span>Visible</span><span></span><span>Name</span><span>Entities</span><span>Level Set</span></div>' +
        rows.map(function (l) {
          var sw = l.number === 1 ? '<i class="lvl-nocolor" title="Level 1 entities keep their own colour"></i>'
            : '<input type="color" class="lvl-color" value="' + esc(l.color || '#1f5fd0') + '" title="Level colour' + (l.color ? '' : ' (none: the entities keep their own colour)') + '"' + (l.color ? '' : ' data-none="1"') + '>';
          // compact marks after the name: ⊘ excluded from profiles (makes no solid), ┄ dashed line type
          var tags = (l.noProfile ? ' <em title="Excluded from profiles: makes no solid">⊘</em>' : '') + (l.lineType === 'dashed' ? ' <em title="Dashed line type">┄</em>' : '');
          return '<div class="lvl-row' + (l.main ? ' main' : '') + (l.hidden ? ' off' : '') + '" role="row" data-level="' + l.number + '">' +
            '<span class="lvl-num" title="' + (l.main ? 'Main level' : 'Click to make level ' + l.number + ' the main level') + '">' + l.number + '</span>' +
            '<span class="lvl-vis" role="checkbox" aria-checked="' + !l.hidden + '" title="' + (l.main ? 'The main level is always visible' : l.hidden ? 'Hidden: click to show' : 'Visible: click to hide') + '">' + (l.hidden ? '' : 'X') + '</span>' +
            sw +
            '<span class="lvl-name" title="Click to rename">' + esc(l.name) + tags + '</span>' +
            '<span class="lvl-count">' + l.count + '</span>' +
            '<span class="lvl-set" title="Click to edit the level set">' + esc(l.set) + '</span></div>';
        }).join('') +
      '</div>' +
      '<div class="lvl-main">' +
        '<div class="lvl-sec">Main level</div>' +
        '<label>Number <input id="lvl-main-num" type="number" min="1" max="65535" step="1" value="' + main.number + '" title="Type a level number: a new number creates the level (Mastercam)"></label>' +
        '<label>Name <input id="lvl-main-name" type="text" value="' + esc(main.name) + '" spellcheck="false"></label>' +
        '<label>Level Set <input id="lvl-main-set" type="text" value="' + esc(main.set) + '" spellcheck="false"></label>' +
        '<label>Display <select id="lvl-display">' + DISPLAY.map(function (d) { return '<option value="' + d[0] + '"' + (d[0] === display ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select></label>' +
        '<div class="lvl-foot">' + (f ? 'Open sketch: ' + esc(f.name) + '. New entities go on the main level.' : 'New sketch entities go on the main level. Right-click a level for more.') + '</div>' +
      '</div>';
    panel.innerHTML = h;
  }
  function head() { return '<div class="lvl-head"><span>' + Icons('levels', 16) + '</span><span>Levels Manager</span></div>'; }
  UI.refreshLevelsPanel = function () { renderPane(true); };

  // ------------------------------------------------------------------ pane events (delegated: the pane redraws often)
  function rowOf(t) { var r = t && t.closest ? t.closest('.lvl-row[data-level]') : null; return r ? +r.getAttribute('data-level') : null; }
  panel.addEventListener('click', function (ev) {
    var t = ev.target, n = rowOf(t), act = t.closest && t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'new') fail(run('create'));
      else fail(run(a));
      return;
    }
    if (n == null) return;
    if (t.closest('.lvl-num')) { fail(run('makeMain', n)); return; }
    if (t.closest('.lvl-vis')) { var l = byNumber(App.model, n); fail(run('setVisible', n, !!(l && l.hidden))); return; }
    if (t.closest('.lvl-name')) { startEdit(t.closest('.lvl-name'), n, 'name'); return; }
    if (t.closest('.lvl-set')) { startEdit(t.closest('.lvl-set'), n, 'set'); return; }
  });
  panel.addEventListener('change', function (ev) {
    var t = ev.target, n = rowOf(t), main = mainLevel();
    if (t.classList.contains('lvl-color') && n != null) { fail(run('setProps', n, { color: t.value })); return; }
    if (t.id === 'lvl-sets') { var v = t.value; t.value = ''; if (v) { var r = fail(run('toggleSet', v)); if (r.ok) UI.setStatus('Level set ' + v + ' ' + (r.visible ? 'shown' : 'hidden') + '.'); } return; }
    if (t.id === 'lvl-display') { display = t.value; try { localStorage.setItem('anvil.levelsDisplay', display); } catch (e) { } renderPane(true); return; }
    if (t.id === 'lvl-main-num') { var num = Math.round(+t.value); if (!(num >= 1)) { renderPane(true); return; } fail(run('makeMain', num)); renderPane(true); return; }
    if (t.id === 'lvl-main-name' && main) { fail(run('rename', main.number, t.value)); renderPane(true); return; }
    if (t.id === 'lvl-main-set' && main) { fail(run('setSet', main.number, t.value)); renderPane(true); return; }
  });
  // Enter in the main-level boxes commits them (change fires on blur otherwise)
  panel.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.key === 'Enter' && t && /^lvl-main-/.test(t.id || '')) { ev.preventDefault(); t.blur(); }
  });
  // in-place edit of a Name / Level Set cell: Enter or leaving the box commits, Esc cancels
  function startEdit(cell, n, field) {
    var L = byNumber(App.model, n);
    if (!L) return;
    editing = { n: n, field: field };
    var inp = el('input', { type: 'text', class: 'lvl-edit', value: L[field] || '', spellcheck: 'false', 'aria-label': field === 'name' ? 'Level name' : 'Level set' });
    cell.innerHTML = '';
    cell.appendChild(inp);
    var done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      editing = null;
      if (commit) fail(run(field === 'name' ? 'rename' : 'setSet', n, inp.value));
      renderPane(true);
    }
    inp.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', function () { finish(true); });
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
    inp.focus(); inp.select();
  }
  UI.levelsEdit = function (n, field) {   // test / script hook: the in-place editor of a cell
    var c = panel.querySelector('.lvl-row[data-level="' + n + '"] .lvl-' + (field === 'set' ? 'set' : 'name'));
    if (c) startEdit(c, n, field === 'set' ? 'set' : 'name');
    return panel.querySelector('input.lvl-edit');
  };
  function presetItems(m) {
    return (K.LAYER_PRESETS || []).filter(function (p) { return !byName(m, p.name); }).map(function (p) {
      return { label: 'Add preset level ' + p.name, action: function () { var r = fail(run('preset', p.name)); if (r.ok) UI.setStatus('Level ' + r.number + ' ' + p.name + ' added.'); } };
    });
  }
  // the right-click menus (Mastercam's Levels Manager menu)
  function rowMenu(n) {
    var m = App.model, L = byNumber(m, n);
    if (!L) return [];
    var f = activeSketch(), nSel = f ? selectedEntities().length : 0, isMain = n === m.mainLevel;
    function say(r, ok) { if (r && r.ok && ok) UI.setStatus(ok(r)); }
    var items = [
      { label: 'Make main', disabled: isMain, action: function () { fail(run('makeMain', n)); } },
      { label: L.hidden ? 'Show' : 'Hide', disabled: isMain && !L.hidden, action: function () { fail(run('setVisible', n, L.hidden)); } },
      { label: 'Select all entities on this level', disabled: !f, action: function () { say(fail(run('selectAll', n)), function (r) { return r.count + ' entit' + (r.count === 1 ? 'y' : 'ies') + ' on level ' + n + ' selected.'; }); } },
      { label: 'Move selected entities to this level', disabled: !nSel, action: function () { say(fail(run('move', n)), function (r) { return r.count + ' entit' + (r.count === 1 ? 'y' : 'ies') + ' moved to level ' + label(L) + '.'; }); } },
      { label: 'Copy selected entities to this level', disabled: !nSel, action: function () { say(fail(run('copy', n)), function (r) { return r.count + ' entit' + (r.count === 1 ? 'y' : 'ies') + ' copied to level ' + label(L) + '.'; }); } },
      { label: 'Rename', action: function () { var c = panel.querySelector('.lvl-row[data-level="' + n + '"] .lvl-name'); if (c) startEdit(c, n, 'name'); } },
      { label: 'Delete', disabled: n === 1, action: function () { say(fail(run('remove', n)), function (r) { return 'Level ' + n + ' deleted' + (r.moved ? ': ' + r.moved + ' entit' + (r.moved === 1 ? 'y' : 'ies') + ' moved to level 1.' : '.'); }); } },
      { label: 'Hide all others', action: function () { fail(run('hideOthers', n)); } },
      { label: 'Clear unused levels', action: function () { say(fail(run('clearUnused')), function (r) { return r.removed + ' unused level' + (r.removed === 1 ? '' : 's') + ' deleted.'; }); } }
    ];
    if (n !== 1) items.push({ sep: true },
      { label: 'Exclude from profiles (marks, bend lines)', checked: L.noProfile, action: function () { fail(run('setProps', n, { noProfile: !L.noProfile })); } },
      { label: 'Dashed line type', checked: L.lineType === 'dashed', action: function () { fail(run('setProps', n, { lineType: L.lineType === 'dashed' ? 'continuous' : 'dashed' })); } },
      { label: 'No colour (entities keep their own)', disabled: !L.color, action: function () { fail(run('setProps', n, { color: null })); } });
    var pre = presetItems(m);
    items.push({ sep: true }, { label: 'Add new level', action: function () { fail(run('create')); } });
    return items.concat(pre);
  }
  function paneMenu() {
    var m = App.model;
    return [{ label: 'Add new level', action: function () { fail(run('create')); } }].concat(presetItems(m), [{ sep: true },
      { label: 'All on', action: function () { fail(run('allOn')); } },
      { label: 'All off', action: function () { fail(run('allOff')); } },
      { label: 'Clear unused levels', action: function () { fail(run('clearUnused')); } }]);
  }
  panel.addEventListener('contextmenu', function (ev) {
    if (!isPart(App.model) || !UI.showMenu) return;
    var n = rowOf(ev.target);
    if (ev.target.closest && ev.target.closest('input, select')) return;
    ev.preventDefault();
    UI.showMenu(ev.clientX, ev.clientY, n != null ? rowMenu(n) : paneMenu());
  });
  UI.levelsMenu = function (n) { return (n != null ? rowMenu(n) : paneMenu()).filter(function (i) { return !i.sep; }); };   // test hook
  // the ribbon's Levels button (ui-panels.js) and scripts: show the Levels Manager tab
  UI.showLevelsManager = function () {
    var b = document.querySelector('#fm-tabs button[data-tab="levels"]');
    if (b) b.click();
    return !panel.hidden;
  };

  // ================================================================== status bar: "Level: 3 ETCH" (click to change)
  UI.levelStatusHtml = function () {
    var L = mainLevel();
    if (!L) return '';
    return '<span class="lvl-chip" data-lvl="main" title="Main level (new sketch entities go on it): click to change">Level: ' + esc(label(L)) + '</span>';
  };
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(anchor) {
    closePop();
    var m = App.model;
    if (!isPart(m)) return null;
    var list = levelList(m);
    pop = el('div', { class: 'lvl-pop', role: 'dialog', 'aria-label': 'Main level' });
    pop.innerHTML = '<div class="lvl-pop-title">Main level</div><div class="lvl-pop-list">' + list.filter(shown).map(function (l) {
      return '<div class="lvl-pop-row' + (l.main ? ' main' : '') + (l.hidden ? ' off' : '') + '" data-num="' + l.number + '"><b>' + l.number + '</b> ' + esc(l.name) + '<em>' + l.count + '</em></div>';
    }).join('') + '</div><label class="lvl-pop-num">Number <input type="number" min="1" max="65535" step="1" value="' + m.mainLevel + '"></label>';
    document.body.appendChild(pop);
    var r = anchor ? anchor.getBoundingClientRect() : { left: 8, top: window.innerHeight - 24 };
    pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - pop.offsetWidth - 4)) + 'px';
    pop.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    pop.addEventListener('click', function (ev) {
      var row = ev.target.closest && ev.target.closest('.lvl-pop-row');
      if (!row) return;
      fail(run('makeMain', +row.getAttribute('data-num')));
      closePop();
    });
    var inp = pop.querySelector('input');
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { var n = Math.round(+inp.value); if (n >= 1) fail(run('makeMain', n)); closePop(); }
      else if (ev.key === 'Escape') closePop();
    });
    return pop;
  }
  document.addEventListener('click', function (ev) {
    var chip = ev.target && ev.target.closest && ev.target.closest('#status-right [data-lvl]');
    if (chip) { if (pop) closePop(); else openPop(chip); return; }
    if (pop && !pop.contains(ev.target)) closePop();
  });
  document.addEventListener('keydown', function (ev) { if (pop && ev.key === 'Escape') closePop(); });
  UI.levelsPopup = function () { var c = document.querySelector('#status-right [data-lvl]'); return openPop(c); };   // test hook

  // ================================================================== API (scripts, tests): UI.levels and anvil.levels
  UI.levels = {
    list: function () { return levelList(App.model); },
    // op('create' | 'preset' | 'makeMain' | 'setVisible' | 'allOn' | 'allOff' | 'hideOthers' | 'toggleSet' | 'rename' |
    //    'setSet' | 'setProps' | 'remove' | 'clearUnused' | 'move' | 'copy' | 'selectAll', ...) -> { ok, error?, … }
    op: function () { return run.apply(null, arguments); },
    main: function () { var L = mainLevel(); return L ? L.number : null; },
    levelOf: function (f, i) { var m = App.model; if (!isPart(m)) return null; sync(m); var e = f && f.entities[i]; return e ? levelOfEntity(m, f, e) : null; },
    keyOf: function (n) { var m = App.model; if (!isPart(m)) return null; table(m); var L = byNumber(m, n); return L ? keyOf(L) : null; },
    sync: function () { return isPart(App.model) ? sync(App.model) : false; },
    display: function (mode) { if (mode != null && DISPLAY.some(function (d) { return d[0] === mode; })) { display = mode; renderPane(true); } return display; },
    visibleRows: function () { return Array.prototype.map.call(panel.querySelectorAll('.lvl-row[data-level]'), function (r) { return +r.getAttribute('data-level'); }); }
  };
  if (window.anvil) window.anvil.levels = function (op) { return op ? run.apply(null, arguments) : levelList(App.model); };

  // ------------------------------------------------------------------ styles (kept here so style.css stays untouched)
  var css = [
    '#levels-panel{display:flex;flex-direction:column;min-height:0;flex:1;font-size:12px}',
    '#levels-panel[hidden],#app.drawing-mode #levels-panel{display:none!important}',
    '#levels-panel{--lvl-main:#ffe680;--lvl-main-text:#3d3000}',
    ':root[data-theme="dark"] #levels-panel{--lvl-main:#6b5a17;--lvl-main-text:#fff4c2}',
    '.lvl-head{display:flex;align-items:center;gap:6px;padding:5px 8px;font-weight:600;border-bottom:1px solid var(--line-2);background:var(--panel-2);white-space:nowrap}',
    '.lvl-head svg{display:block}',
    '.lvl-tools{display:flex;flex-wrap:wrap;gap:4px;padding:5px 6px;border-bottom:1px solid var(--line-2)}',
    '.lvl-tools button{padding:2px 8px;border:1px solid var(--line);border-radius:3px;background:var(--input-bg);color:var(--text)}',
    '.lvl-tools button:hover{background:var(--hover);border-color:var(--blue-line)}',
    '.lvl-tools select{flex:1;min-width:0;max-width:100%;background:var(--input-bg);color:var(--text);border:1px solid var(--input-line);border-radius:3px}',
    '#lvl-grid{overflow:auto;flex:1;min-height:60px;padding-bottom:12px}',
    '.lvl-row{display:grid;grid-template-columns:40px 38px 18px minmax(40px,1fr) 44px minmax(50px,.9fr);align-items:center;min-height:21px;column-gap:3px;padding:0 4px;white-space:nowrap;cursor:default}',
    '.lvl-row:not(.lvl-hdr):hover{background:var(--hover)}',
    '.lvl-hdr{position:sticky;top:0;z-index:1;background:var(--panel-2);border-bottom:1px solid var(--line-2);color:var(--muted);font-size:11px}',
    '.lvl-row.main{background:var(--lvl-main);color:var(--lvl-main-text);font-weight:700}',
    '.lvl-row.main:hover{background:var(--lvl-main)}',
    '.lvl-row.off:not(.main) .lvl-name,.lvl-row.off:not(.main) .lvl-num{color:var(--muted)}',
    '.lvl-num{text-align:right;padding-right:6px;cursor:pointer}',
    '.lvl-num:hover{text-decoration:underline}',
    '.lvl-vis{text-align:center;font-weight:700;cursor:pointer;border:1px solid var(--line-2);border-radius:2px;height:15px;line-height:15px;margin:0 8px}',
    '.lvl-row.main .lvl-vis{cursor:not-allowed}',
    '.lvl-color{width:16px;height:15px;padding:0;border:0;background:none;cursor:pointer}',
    '.lvl-color[data-none]{opacity:.35}',
    '.lvl-nocolor{display:inline-block;width:14px;height:12px;border:1px dashed var(--modal-line);box-sizing:border-box}',
    '.lvl-name,.lvl-set{overflow:hidden;text-overflow:ellipsis;cursor:text;min-height:15px}',
    '.lvl-name em{font-style:normal;font-weight:400;font-size:10px;color:var(--muted)}',
    '.lvl-row.main .lvl-name em{color:inherit;opacity:.75}',
    '.lvl-count{text-align:right;padding-right:6px;font-variant-numeric:tabular-nums}',
    '.lvl-edit{width:100%;box-sizing:border-box;font:inherit;font-weight:400;padding:0 2px;border:1px solid var(--blue);background:var(--input-bg);color:var(--text)}',
    '.lvl-main{border-top:1px solid var(--line);padding:6px 8px 8px;display:grid;grid-template-columns:1fr;gap:4px;background:var(--panel-2)}',
    '.lvl-sec{font-weight:600}',
    '.lvl-main label{display:grid;grid-template-columns:72px 1fr;align-items:center;gap:4px}',
    '.lvl-main input,.lvl-main select{min-width:0;font:inherit;background:var(--input-bg);color:var(--text);border:1px solid var(--input-line);border-radius:3px;padding:1px 3px}',
    '.lvl-foot{color:var(--muted);font-size:11px;line-height:1.35;white-space:normal}',
    '.lvl-empty{margin:8px;color:var(--muted);line-height:1.4}',
    '#status-right .lvl-chip{cursor:pointer}',
    '#status-right .lvl-chip:hover{text-decoration:underline}',
    '.lvl-pop{position:fixed;z-index:60;min-width:170px;max-width:280px;background:var(--menu-bg);border:1px solid var(--menu-line);box-shadow:0 3px 10px var(--menu-shadow);font-size:12px;color:var(--text)}',
    '.lvl-pop-title{padding:4px 8px;font-weight:600;border-bottom:1px solid var(--line-2)}',
    '.lvl-pop-list{max-height:240px;overflow:auto}',
    '.lvl-pop-row{display:flex;gap:6px;padding:2px 8px;cursor:pointer;white-space:nowrap}',
    '.lvl-pop-row b{min-width:28px;text-align:right}',
    '.lvl-pop-row em{margin-left:auto;padding-left:10px;font-style:normal;color:var(--muted)}',
    '.lvl-pop-row:hover{background:var(--hover)}',
    '.lvl-pop-row.main{background:var(--lvl-main,#ffe680);color:var(--lvl-main-text,#3d3000);font-weight:700}',
    '.lvl-pop-row.off{color:var(--muted)}',
    '.lvl-pop-num{display:flex;align-items:center;gap:6px;padding:4px 8px;border-top:1px solid var(--line-2)}',
    '.lvl-pop-num input{width:70px;font:inherit;background:var(--input-bg);color:var(--text);border:1px solid var(--input-line)}'
  ].join('\n');
  document.head.appendChild(el('style', { id: 'levels-css', text: css }));
})(UI);
