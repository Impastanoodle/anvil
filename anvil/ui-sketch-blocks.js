// ui-sketch-blocks.js — rfAT: sketch Blocks (Tools ▸ Blocks: Make, Edit, Insert, Explode, Save), as SolidWorks'
// Blocks toolbar. The engine is kernel-sketch.js (Kernel.makeBlock / insertBlock / explodeBlock / redefineBlock /
// syncBlocks, the `.blocks()` script line): an instance is ordinary sketch geometry tagged with its instance id plus an
// insertion point (a sketch point: dimension it, relate it, drag it). rfAU: the solver (sketch-solver.js) holds each
// instance as one rigid body of 3 degrees of freedom (x, y, angle), so a relation or dimension to any of its points
// places or turns the whole instance, one that would bend it is over-defining (reported like any other conflict), and a
// drag of any of its lines moves the whole instance. DXF export writes each definition once as a BLOCK and each
// instance as an INSERT (Kernel.exportDXFSketch opts.explode: the exploded LINE / ARC / CIRCLE instead).
//   UI.cmdMakeBlock()        Make Block PM: the selected entities, Block name, Insertion point X / Y (a click in the
//                            graphics area puts it there); ✓ makes the definition and its first instance (one undo step)
//   UI.cmdInsertBlock(name?) Insert Block PM: Block (this sketch's blocks, or Browse… a saved .sldblk), X / Y, Angle,
//                            Scale; each click places an instance (preview on the cursor), ✓ places one at X / Y when
//                            nothing was clicked. With a block instance selected it opens as Block properties
//                            (Insertion point, Angle, Scale of that instance, live)
//   UI.cmdEditBlock()        Edit Block: the selected instance's geometry becomes ordinary geometry to change with the
//                            sketch tools (what is drawn meanwhile joins the block); Tools ▸ Blocks ▸ Edit Block again
//                            (or leaving the sketch) saves it into the definition and every instance follows
//   UI.cmdExplodeBlock()     Explode Block: the selected instances become ordinary geometry
//   UI.cmdSaveBlock()        Save Block: the selected instance's definition as a .sldblk JSON file
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.openPM || !UI.K || !UI.K.makeBlock) return;
  var App = UI.App, K = UI.K;
  var editing = null;   // { f, id, n0 }: Edit Block in progress

  function sketch() { return UI.activeSketchFeature ? UI.activeSketchFeature() : null; }
  function round4(v) { return Math.round(v * 1e6) / 1e6; }
  // a clicked point rounded to the roundest value inside its pixel (as the sketcher places a free point)
  function roundUV(uv, mx, my) {
    var b = UI.screenToPlane(mx + 1, my, UI.activePlane()), h = b ? 0.5 * Math.hypot(b[0] - uv[0], b[1] - uv[1]) * 1.05 : 0, nr = UI.sketchNiceRound;
    return nr && h > 0 ? [nr(uv[0], h), nr(uv[1], h)] : uv;
  }
  function changed() { App.sel = null; App.sel2 = null; App.gridStale = true; App.dimsStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); }
  // one sketch action, one undo step: fn() returns { ok, error }; a failure puts the sketch back and takes the step off
  function undoStep(f, fn) {
    var was = App.sketchDirty, snap = JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null, b: f.blocks || null }), r;
    UI.pushUndo(); App.sketchDirty = true;
    try { r = fn(); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) {
      var s = JSON.parse(snap);
      f.entities = s.e; if (s.r) f.rels = s.r; else delete f.rels; if (s.d) f.dims = s.d; else delete f.dims; if (s.b) f.blocks = s.b; else delete f.blocks;
      App.undo.pop(); App.sketchDirty = was;
    }
    return r || { ok: false };
  }
  function selected(f) {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.filter(function (i) { return f.entities[i]; }).sort(function (a, b) { return a - b; });
  }
  // the block instances the selection touches (ids), in sketch order
  function selectedInstances(f) {
    var ids = [];
    selected(f).forEach(function (i) { var b = f.entities[i].blk; if (b != null && ids.indexOf(String(b)) < 0) ids.push(String(b)); });
    return ids;
  }
  function instance(f, id) { return K.blockInstances(f).filter(function (r) { return r.id === String(id); })[0] || null; }
  function blockNames(f) { if (K.adoptBlocks) K.adoptBlocks(f); return Object.keys(f.blocks || {}); }   // (rfAU: imported instances' definitions)

  // rfAU: no redraw hook: the solver keeps instances rigid (the instance in Edit Block is marked on the sketch as
  // _blkEdit, non-enumerable so undo snapshots and scripts never carry it, and is ordinary geometry until it is saved)
  function markEdit(f, id) {
    if (!f) return;
    if (id == null) { delete f._blkEdit; return; }
    Object.defineProperty(f, '_blkEdit', { value: String(id), configurable: true, writable: true, enumerable: false });
  }
  UI.syncSketchBlocks = function () { var f = sketch(); return f ? K.syncBlocks(f, editing && editing.f === f ? editing.id : null) : 0; };

  // ------------------------------------------------------------------ Make Block
  function cmdMakeBlock() {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var idx = selected(f).filter(function (i) { return f.entities[i].blk == null; });
    if (!idx.length) { UI.toast('Select the sketch entities for the block first, then Make Block.'); return; }
    var box = null;
    idx.forEach(function (i) {
      K.entityPolylines(f.entities[i]).forEach(function (l) { l.pts.forEach(function (p) { if (!box) box = [p[0], p[1], p[0], p[1]]; box = [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])]; }); });
    });
    var n = 1;
    while (f.blocks && f.blocks['Block' + n]) n++;
    var v = { name: 'Block' + n, x: box ? round4((box[0] + box[2]) / 2) : 0, y: box ? round4((box[1] + box[3]) / 2) : 0 };
    function preview() { App.tempEntities = [{ t: 'point', x: +v.x || 0, y: +v.y || 0 }]; UI.updateTemp(); }
    UI.openPM({
      title: 'Make Block', icon: 'block', values: v, noFocus: true,
      message: 'The selected entities become the block. Click in the graphics area to put the insertion point, or type it.',
      command: {
        onSketchPoint: function (uv, mx, my) {
          if (!uv) uv = UI.screenToPlane(mx, my, UI.activePlane());
          if (!uv) return;
          var snap = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null, S = window.SketchSolver, p = snap && S ? S.refPoint(f, snap) : null;
          uv = p || roundUV(uv, mx, my);
          v.x = round4(uv[0]); v.y = round4(uv[1]);
          UI.renderPM(); preview();
        }
      },
      groups: [
        { title: 'Block Entities', fields: [{ type: 'static', label: 'Entities', value: idx.length + ' entit' + (idx.length === 1 ? 'y' : 'ies') }, { type: 'text', key: 'name', label: 'Block name' }] },
        { title: 'Insertion Point', fields: [{ type: 'number', key: 'x', label: 'X', unit: 'u' }, { type: 'number', key: 'y', label: 'Y', unit: 'u' }] }
      ],
      onChange: preview,
      onOK: function () {
        var r = undoStep(f, function () { return K.makeBlock(f, idx, v.name, [+v.x || 0, +v.y || 0]); });
        if (!r.ok) { UI.toast(r.error || 'The block could not be made.'); return false; }
        App.tempEntities = []; UI.updateTemp();
        changed();
        UI.setStatus('Block ' + r.name + ' made from ' + idx.length + ' entit' + (idx.length === 1 ? 'y' : 'ies') + '.');
      },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    preview();
  }

  // ------------------------------------------------------------------ Insert Block / Block properties
  function pickBlockFile(f, done) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.sldblk,.json'; inp.style.display = 'none';
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () { UI.importBlockText(String(rd.result), file.name.replace(/\.[^.]*$/, ''), done); };
      rd.readAsText(file);
    });
    document.body.appendChild(inp);
    inp.click();
  }
  // a saved block (the .sldblk JSON Save Block writes) into the open sketch's blocks: { ok, name, error }
  UI.importBlockText = function (text, name, done) {
    var f = sketch();
    if (!f) return { ok: false, error: 'Open a sketch first.' };
    var o = null;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    var r = K.addBlockDef(f, o, name || (o && o.name));
    if (!r.ok) UI.toast(r.error); else UI.setStatus('Block ' + r.name + ' loaded: click to place it.');
    if (done) done(r);
    return r;
  };
  function cmdInsertBlock(name) {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var ids = selectedInstances(f);
    if (ids.length === 1 && name == null) { blockProperties(f, ids[0]); return; }
    var names = blockNames(f);
    var v = { block: name != null && f.blocks && f.blocks[name] ? name : names[0] || '', x: 0, y: 0, ang: 0, s: 1 }, placed = 0;
    function place(x, y) {
      if (!v.block) { UI.toast('Make a block first, or Browse… for a saved one.'); return false; }
      var r = undoStep(f, function () { return K.insertBlock(f, v.block, x, y, +v.ang || 0, +v.s); });
      if (!r.ok) { UI.toast(r.error); return false; }
      placed++;
      changed();
      UI.setStatus('Placed ' + v.block + ' (' + placed + ' so far). Click to place another, ✓ to finish.');
      return true;
    }
    function ghost(uv) {
      if (!v.block || !uv || !(f.blocks && f.blocks[v.block])) { App.tempEntities = []; UI.updateTemp(); return; }
      var m = K.blockXf(uv, +v.ang || 0, +v.s > 0 ? +v.s : 1);
      App.tempEntities = f.blocks[v.block].ents.map(function (e) { return K.blockEntity(e, m); }).filter(Boolean);
      UI.updateTemp();
    }
    UI.openPM({
      title: 'Insert Block', icon: 'block', values: v, noFocus: true,
      message: 'Click in the graphics area to place the block; each click places another.',
      command: {
        onSketchMove: function (uv) { ghost(uv); },
        onSketchPoint: function (uv, mx, my) {
          if (!uv) uv = UI.screenToPlane(mx, my, UI.activePlane());
          if (!uv) return;
          var snap = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null, S = window.SketchSolver, p = snap && S ? S.refPoint(f, snap) : null;
          uv = p || roundUV(uv, mx, my);
          v.x = round4(uv[0]); v.y = round4(uv[1]);
          place(v.x, v.y);
          UI.renderPM();
        }
      },
      groups: [
        { title: 'Blocks to Insert', fields: [
          { type: 'select', key: 'block', label: 'Block', options: function () { var o = blockNames(f).map(function (n) { return [n, n]; }); return o.length ? o : [['', '(no blocks in this sketch)']]; } },
          { type: 'buttons', buttons: [{ label: 'Browse…', onclick: function () { pickBlockFile(f, function (r) { if (r.ok) { v.block = r.name; UI.renderPM(); } }); } }] }
        ] },
        { title: 'Parameters', fields: [
          { type: 'number', key: 'x', label: 'Insertion X', unit: 'u' }, { type: 'number', key: 'y', label: 'Insertion Y', unit: 'u' },
          { type: 'number', key: 'ang', label: 'Angle', unit: '°' }, { type: 'number', key: 's', label: 'Scale', min: 0 }
        ] }
      ],
      onOK: function () {
        if (!placed && !place(+v.x || 0, +v.y || 0)) return false;
      },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    UI.setStatus(v.block ? 'Click to place ' + v.block + '.' : 'No block in this sketch yet: Browse… for a saved block, or Make Block first.');
  }
  // Block properties: the selected instance's insertion point, angle and scale, changed live (one undo step for the PM)
  function blockProperties(f, id) {
    var r = instance(f, id);
    if (!r) return;
    var v = { x: r.x, y: r.y, ang: r.ang, s: r.s }, pushed = false, snap = JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null });
    UI.openPM({
      title: 'Block: ' + r.def, icon: 'block', values: v, noFocus: true,
      groups: [
        { title: 'Parameters', fields: [
          { type: 'number', key: 'x', label: 'Insertion X', unit: 'u' }, { type: 'number', key: 'y', label: 'Insertion Y', unit: 'u' },
          { type: 'number', key: 'ang', label: 'Angle', unit: '°' }, { type: 'number', key: 's', label: 'Scale', min: 0 }
        ] },
        { title: 'Block', fields: [{ type: 'buttons', buttons: [
          { label: 'Edit Block', onclick: function () { UI.closePM(); startEdit(f, id); } },
          { label: 'Explode', onclick: function () { UI.closePM(); explode(f, [id]); } },
          { label: 'Save Block…', onclick: function () { saveBlock(f, r.def); } }] }] }
      ],
      onChange: function () {
        if (!(+v.s > 0)) return;
        if (!pushed) { UI.pushUndo(); App.sketchDirty = true; pushed = true; }
        var q = K.setBlockInstance(f, id, { x: +v.x || 0, y: +v.y || 0, ang: +v.ang || 0, s: +v.s });
        if (!q.ok) UI.setStatus(q.error);
        if (window.SketchSolver && (f.rels || f.dims)) window.SketchSolver.solve(f);
        changed();
      },
      onCancel: function () {
        if (!pushed) return;
        var s = JSON.parse(snap);
        f.entities = s.e; if (s.r) f.rels = s.r; else delete f.rels; if (s.d) f.dims = s.d; else delete f.dims;
        App.undo.pop(); changed();
      }
    });
  }

  // ------------------------------------------------------------------ Edit Block
  function startEdit(f, id) {
    if (editing) finishEdit();
    var r = instance(f, id);
    if (!r) return;
    UI.pushUndo(); App.sketchDirty = true;
    editing = { f: f, id: String(id), n0: f.entities.length, name: r.def };
    markEdit(f, id);
    changed();
    UI.setStatus('Editing block ' + r.def + ': change its geometry with the sketch tools; Tools ▸ Blocks ▸ Edit Block again (or exit the sketch) to finish.');
  }
  function finishEdit() {
    if (!editing) return null;
    var e = editing, f = e.f, extra = [];
    editing = null;
    markEdit(f, null);
    for (var i = e.n0; i < f.entities.length; i++) if (f.entities[i] && f.entities[i].blk == null) extra.push(i);
    var r = K.redefineBlock(f, e.id, extra);
    // AZ: the relations and dimensions on the other instances stay; those on a piece the edit took out are reported
    if (!r.ok) UI.toast(r.error);
    else UI.setStatus('Block ' + e.name + ' updated: every instance follows' + (r.dropped ? '; ' + r.dropped + ' relation' + (r.dropped === 1 ? '' : 's') + ' / dimension' + (r.dropped === 1 ? '' : 's') + ' on removed block geometry deleted.' : ', their relations kept.'));
    if (App.mode === 'sketch' && sketch() === f) changed();
    return r;
  }
  function cmdEditBlock() {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    if (editing) { finishEdit(); return; }
    var ids = selectedInstances(f), all = K.blockInstances(f);
    if (!ids.length && all.length === 1) ids = [all[0].id];
    if (ids.length !== 1) { UI.toast(all.length ? 'Select one block instance to edit.' : 'This sketch has no blocks: Make Block first.'); return; }
    startEdit(f, ids[0]);
  }
  UI.blockEditing = function () { return editing ? { id: editing.id, name: editing.name } : null; };
  UI.sketchExitHooks = UI.sketchExitHooks || [];
  UI.sketchExitHooks.push(function (f) { if (editing && editing.f === f) finishEdit(); else if (editing) { markEdit(editing.f, null); editing = null; } });

  // ------------------------------------------------------------------ Explode, Save
  function explode(f, ids) {
    var r = undoStep(f, function () {
      var out = { ok: true };
      ids.forEach(function (id) { var q = K.explodeBlock(f, id); if (!q.ok) out = q; });
      return out;
    });
    if (!r.ok) { UI.toast(r.error); return; }
    changed();
    UI.setStatus('Exploded ' + ids.length + ' block instance' + (ids.length === 1 ? '' : 's') + ' into sketch geometry.');
  }
  function cmdExplodeBlock() {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var ids = selectedInstances(f);
    if (!ids.length) { UI.toast('Select the block instances to explode.'); return; }
    explode(f, ids);
  }
  function saveBlock(f, name) {
    var text = K.blockFile(f, name);
    if (!text) return null;
    if (UI.download) UI.download(name + '.sldblk', text, 'application/json');
    UI.setStatus('Saved block ' + name + ' as ' + name + '.sldblk.');
    return text;
  }
  function cmdSaveBlock() {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first.'); return null; }
    var ids = selectedInstances(f), all = K.blockInstances(f);
    if (!ids.length && all.length) ids = [all[0].id];
    var r = ids.length ? instance(f, ids[0]) : null;
    if (!r) { UI.toast('Select a block instance to save.'); return null; }
    return saveBlock(f, r.def);
  }

  UI.cmdMakeBlock = cmdMakeBlock; UI.cmdInsertBlock = cmdInsertBlock; UI.cmdEditBlock = cmdEditBlock; UI.cmdExplodeBlock = cmdExplodeBlock; UI.cmdSaveBlock = cmdSaveBlock;
  UI.blockProperties = function (id) { var f = sketch(); if (f) blockProperties(f, id); };
})();
