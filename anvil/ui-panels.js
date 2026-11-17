// ui-panels.js — ribbon (CommandManager), menu bar, FeatureManager tree, heads-up toolbar, status bar, modal dialogs.
(function (UI) {
  'use strict';
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

  // ------------------------------------------------------------------ status & toast
  function setStatus(msg) { var s = $('status-msg'), t = msg == null ? '' : String(msg); if (s.textContent !== t) s.textContent = t; }
  var toastTimer = null;
  // one toast at a time: a new message replaces the text of the one showing (no blink); it fades in and out
  function toast(msg) {
    var t = document.querySelector('.toast');
    if (t) { t.textContent = msg; t.classList.remove('out'); }
    else { t = el('div', { class: 'toast', text: msg }); document.body.appendChild(t); }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.add('out');
      toastTimer = setTimeout(function () { t.remove(); }, 180);
    }, 2420);
  }
  var lastDocType = null;
  function refreshStatus() {
    var asm = isAsm();
    // switching between a part and an assembly document swaps the CommandManager tabs
    if (lastDocType !== (asm ? 'assembly' : 'part')) {
      lastDocType = asm ? 'assembly' : 'part';
      if (ribbonTabs().indexOf(App.ribbonTab) < 0) App.ribbonTab = ribbonTabs()[0];
      refreshRibbon();
    }
    var mode = App.mode === 'sketch' ? 'Editing ' + (UI.activeSketchFeature() || {}).name : asm ? 'Editing Assembly' : 'Editing Part';
    var units = App.model.units === 'in' ? 'IPS' : 'MMGS';
    var errs = App.build ? Object.keys(App.build.errors).length : 0;
    // sketch mode: the active sketch's definition state (SolidWorks' Under Defined / Fully Defined / Over Defined)
    var sk = App.mode === 'sketch' && App.sketchState ? App.sketchState : null;
    var skTxt = sk ? '<span class="sk-state ' + sk.status + '" title="Degrees of freedom: ' + sk.dof + '">' + (window.SketchSolver ? SketchSolver.STATUS_TEXT[sk.status] : sk.status) + '</span>' : '';
    // written only when it changed (refreshStatus runs on every solve and rebuild); the last span has a fixed width so
    // a rebuild time growing from "9 ms" to "120 ms" does not shift the rest of the bar; levels (ui-levels.js): the main
    // level chip "Level: 3 ETCH" (a click opens the main-level picker)
    var html = (UI.profileStatusHtml ? UI.profileStatusHtml() : '') + skTxt + (UI.occtStatusHtml ? UI.occtStatusHtml() : '') + (UI.rebuildStatusHtml ? UI.rebuildStatusHtml() : '<span>' + (errs ? errs + ' rebuild error' + (errs > 1 ? 's' : '') : 'Fully rebuilt') + '</span>') + (UI.levelStatusHtml && !asm ? UI.levelStatusHtml() : '') + '<span>' + mode + '</span><span>' + units + '</span><span class="st-ms">' + (App.lastRebuildMs != null ? UI.fmtNum(App.lastRebuildMs, 0) + ' ms' : '') + '</span>';
    var sr = $('status-right');
    if (sr._html !== html) { sr.innerHTML = html; sr._html = html; }
    if (frame) frameStatusSync();   // lane mcframe
    var title = App.model.name + (App.mode === 'sketch' ? '  —  sketch' : '');
    if ($('doc-title').textContent !== title) $('doc-title').textContent = title;
  }

  // ------------------------------------------------------------------ ribbon
  var RIBBON = {
    Features: [
      { id: 'extrude', label: 'Extruded\nBoss/Base', run: function () { UI.cmdExtrude(false); } },
      { id: 'revolve', label: 'Revolved\nBoss/Base', run: function () { UI.cmdRevolve(false); } },
      { stack: [{ id: 'sweep', label: 'Swept Boss/Base', run: function () { UI.cmdSweep(false); } }, { id: 'loft', label: 'Lofted Boss/Base', run: function () { UI.cmdLoft(false); } }, 
      { id: 'boundary', label: 'Boundary Boss/Base', run: function () { UI.cmdBoundary(false); } }   // rfFB
    ] },
      { sep: true },
      { id: 'cut', label: 'Extruded\nCut', run: function () { UI.cmdExtrude(true); } },
      { id: 'holeWizard', label: 'Hole\nWizard', run: function () { (UI.cmdHoleWizard || UI.cmdHole)(); } },
      { id: 'revolveCut', label: 'Revolved\nCut', run: function () { UI.cmdRevolve(true); } },
      { stack: [{ id: 'sweep', cmd: 'sweptCut', label: 'Swept Cut', run: function () { UI.cmdSweep(true); } }, { id: 'loft', cmd: 'loftedCut', label: 'Lofted Cut', run: function () { UI.cmdLoft(true); } }, 
      { id: 'boundaryCut', label: 'Boundary Cut', run: function () { UI.cmdBoundary(true); } }   // rfFB
    ] },
      { sep: true },
      // r14/commands14: flyout buttons (SolidWorks): the face runs the last command used from the ▾ list
      { fly: 'fillet', items: [{ id: 'fillet', label: 'Fillet', run: function () { UI.cmdFillet(); } }, { id: 'chamfer', label: 'Chamfer', run: function () { UI.cmdChamfer(); } }] },
      { fly: 'pattern', items: [{ id: 'lpattern', label: 'Linear\nPattern', run: function () { UI.cmdLinearPattern(); } }, { id: 'cpattern', label: 'Circular\nPattern', run: function () { UI.cmdCircularPattern(); } }, { id: 'mirror', label: 'Mirror', run: function () { UI.cmdMirror(); } }] },
      { sep: true },
      { id: 'shell', label: 'Shell', run: function () { UI.cmdShell(); } },
      { id: 'draft', label: 'Draft', run: function () { UI.cmdDraft(); } },   // rfDX
      { id: 'intersect', label: 'Intersect', help: 'Intersect solids and planes: keep or exclude the regions they make', run: function () { UI.cmdIntersect(); } },   // rfDY
      { id: 'rib', label: 'Rib', help: 'Add a rib from an open sketch: thickened and extended until it meets the part', run: function () { UI.cmdRib(); } },   // rfDY
      { id: 'wrap', label: 'Wrap', run: function () { UI.cmdWrap(); } },   // rfDZ
      { sep: true },
      { fly: 'refgeo', label: 'Reference\nGeometry', items: [{ id: 'plane', label: 'Plane', run: function () { UI.cmdPlane(); } }, { id: 'refAxis', label: 'Axis', help: 'Create a reference axis: a line, edge, two planes, two points, a cylindrical face, or a point and a face', run: function () { UI.cmdRefAxis(); } }, { id: 'csys', label: 'Coordinate\nSystem', help: 'Create a coordinate system: an origin and X / Y / Z directions', run: function () { UI.cmdCsys(); } }, { id: 'refPoint', label: 'Point', help: 'Create a reference point: arc centre, face centre, intersection, projection, on a point, or along a curve', run: function () { UI.cmdRefPoint(); } }] },   // lane CZ
      { fly: 'curves', label: 'Curves', items: [{ id: 'splitLine', label: 'Split Line', help: 'Split faces into separate faces: by a projected sketch, a plane or a silhouette', run: function () { UI.cmdSplitLine(); } }, { id: 'projCurve', label: 'Projected\nCurve', help: 'Project a sketch onto faces, or make the 3D curve where two sketches’ extrusions meet', run: function () { UI.cmdProjectedCurve(); } }, { id: 'compositeCurve', label: 'Composite\nCurve', help: 'Join connected edges, sketch entities and curves into one curve', run: function () { UI.cmdCompositeCurve(); } }, { id: 'xyzCurve', label: 'Curve Through\nXYZ Points', help: 'A spline through points typed in a table or read from a .sldcrv / .txt file', run: function () { UI.cmdCurveXYZ(); } }, { id: 'refPtCurve', label: 'Curve Through\nReference Points', help: 'A spline through picked sketch points, vertices and reference points', run: function () { UI.cmdCurveRefPoints(); } }, { id: 'helix', label: 'Helix and\nSpiral', help: 'A helix or spiral from a sketched circle: pitch, revolutions, height, taper', run: function () { UI.cmdHelix(); } }] },   // rfFA: SolidWorks' order
      { id: 'instant', label: 'Instant3D', run: function () { if (UI.toggleInstant3D) UI.toggleInstant3D(); }, active: function () { return !!(UI.instant3DOn && UI.instant3DOn()); } }
    ],
    // rfC: the Sketch tab as SolidWorks 2024's CommandManager lays it out: Sketch ▾ (3D Sketch) and Smart Dimension ▾
    // large; the sketch entities as a grid of small icon buttons, three rows filled column by column (Line ▾ / Rectangle ▾ /
    // Slot ▾, Circle ▾ / Arc ▾ / Polygon, Spline ▾ / Ellipse ▾ / Sketch Fillet ▾, Plane / Text / Point); Trim
    // Entities ▾, Convert Entities ▾ and Offset Entities large; the Mirror Entities ▾ / Linear Sketch Pattern ▾ / Move
    // Entities ▾ column; Display/Delete Relations ▾ (Add Relation, Fully Define Sketch) large; the Repair Sketch / Quick
    // Snaps / Rapid Sketch column and Construction Geometry / Shaded Sketch Contours / Sketch Picture; then Anvil's own
    // sheet-metal-shop commands after a separator (Levels, Sketch to DXF, Insert DXF / DWG, Check Sketch for Feature).
    // Every item keeps its id / tool / run (other files and the tests find them by id and label); `icon` names the glyph
    // when the id is shared with another command; an item with neither run nor tool is SolidWorks' and greyed.
    Sketch: [
      { fly: 'sketch', items: [{ id: 'sketch', label: 'Sketch', run: function () { UI.cmdSketch(); }, dyn: function () { return App.mode === 'sketch' ? { id: 'exitSketch', label: 'Exit\nSketch' } : null; } },
        { id: 'sketch3d', label: '3D Sketch', help: 'Sketch lines, splines and points in space, not on a plane', run: function () { if (UI.cmdSketch3D) UI.cmdSketch3D(); } },   // rfLQ: ui-sketch-3d.js
        { id: 'sketch3dPlane', label: '3D Sketch On Plane', help: 'Sketch on a plane inside a 3D sketch', run: function () { if (UI.cmdSketch3DOnPlane) UI.cmdSketch3DOnPlane(); } }] },
      // sketch-ordinate: the Smart Dimension flyout (SolidWorks): Horizontal / Vertical Dimension and Horizontal / Vertical
      // Ordinate Dimension (ui-sketch-dims.js)
      { fly: 'dim', items: [{ id: 'dim', label: 'Smart\nDimension', tool: 'dimension' },
        { id: 'horizDim', label: 'Horizontal\nDimension', help: 'Dimension the horizontal distance between two points or vertical lines', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdHorizontalDim(); } },
        { id: 'vertDim', label: 'Vertical\nDimension', help: 'Dimension the vertical distance between two points or horizontal lines', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdVerticalDim(); } },
        // rfAQ: Ordinate Dimension (the direction follows where the values go), SolidWorks' flyout order
        { id: 'ordinateDim', label: 'Ordinate\nDimension', help: 'Dimension points, holes and edges from one zero; placing the values above / below or beside it picks the direction', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdOrdinateFree(); } },
        { id: 'ordinateH', label: 'Horizontal Ordinate\nDimension', help: 'Dimension points, holes and edges horizontally from one zero, the values on one line', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdOrdinateDim('x'); } },
        { id: 'ordinateV', label: 'Vertical Ordinate\nDimension', help: 'Dimension points, holes and edges vertically from one zero, the values on one line', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdOrdinateDim('y'); } },
        // rfAQ: Chamfer, Angular Running and Path Length Dimension, and Autodimension (ui-sketch-dims.js)
        { id: 'chamferDim', label: 'Chamfer\nDimension', help: 'Dimension a chamfer line: its distance along the line next to it and its angle (0.100 X 45°)', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdChamferDim(); } },
        { id: 'angRunDim', label: 'Angular Running\nDimension', help: 'Angles from one 0° line round a vertex to other lines and points, counter-clockwise', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdAngularRunningDim(); } },
        { id: 'pathLengthDim', label: 'Path Length\nDimension', help: 'The total length of a chain of lines and arcs, driving it', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdPathLengthDim(); } },
        { id: 'autodim', label: 'Autodimension', help: 'Dimension the sketch from a datum: baseline, chain or ordinate, horizontal and vertical', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdAutodimension(); } }] },
      { sep: true },
      { grid: true, stack: [
        // p9-sketchtab: the Line flyout (Line, Centerline, Midpoint Line, Parallel Line; ui-sketch-lines.js) with the
        // construction lines of ui-sketch-construct.js (Tangent Line, Perpendicular Line, Bisector)
        { fly: 'line', items: [{ id: 'line', label: 'Line', tool: 'line', active: function () { return !UI.lineMode || UI.lineMode() === 'line'; } },
          { id: 'centerline', label: 'Centerline', tool: 'line', run: function () { UI.cmdCenterline(); }, active: function () { return !!(UI.lineMode && UI.lineMode() === 'centerline'); } },
          { id: 'midline', label: 'Midpoint Line', tool: 'line', help: 'Draw a line symmetric about its first point', run: function () { if (UI.cmdMidpointLine) UI.cmdMidpointLine(); }, active: function () { return !!(UI.lineMode && UI.lineMode() === 'midline'); } },
          { id: 'parallelLine', label: 'Parallel Line', help: 'Draw a line parallel to a line or edge: through a point, at a distance or tangent to an arc', run: function () { if (UI.cmdParallelLine) UI.cmdParallelLine(); }, active: function () { return !!(UI.parallelLineActive && UI.parallelLineActive()); } },
          { id: 'tangentLine', label: 'Tangent Line', help: 'Draw a line tangent to two circles or arcs, or to one at an angle', run: function () { if (UI.cmdTangentLine) UI.cmdTangentLine(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('tangentLine')); } },
          { id: 'perpLine', label: 'Perpendicular Line', help: 'Draw a line square to a line or edge through a point', run: function () { if (UI.cmdPerpendicularLine) UI.cmdPerpendicularLine(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('perpLine')); } },
          { id: 'bisectorLine', label: 'Bisector', help: 'Draw the line bisecting the angle between two lines', run: function () { if (UI.cmdBisectorLine) UI.cmdBisectorLine(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('bisectorLine')); } }] },   // rfAP
        // all five rectangle types (ui-sketch-lines.js: the rect3 / crect3 / parallelogram tools)
        { fly: 'rect', items: [{ id: 'rect', label: 'Corner Rectangle', tool: 'rect' }, { id: 'crect', label: 'Center Rectangle', tool: 'crect' },
          { id: 'rect3', label: '3 Point Corner Rectangle', tool: 'rect3', help: 'Rectangle at any angle from two corners and its height' },
          { id: 'crect3', label: '3 Point Center Rectangle', tool: 'crect3', help: 'Rectangle at any angle from its center, a side midpoint and its height' },
          { id: 'parallelogram', label: 'Parallelogram', tool: 'parallelogram', help: 'Parallelogram from three corners' }] },
        // the Slot flyout: the four slot types (ui-sketch-curves.js)
        { fly: 'slot', items: [{ id: 'slot', label: 'Straight Slot', tool: 'slot' }, { id: 'cslot', label: 'Centerpoint Straight Slot', tool: 'cslot', help: 'Slot from its center, one end and a width' },
          { id: 'aslot3', label: '3 Point Arc Slot', tool: 'aslot3', help: 'Curved slot from three points on its centerline and a width' },
          { id: 'aslot', label: 'Centerpoint Arc Slot', tool: 'aslot', help: 'Curved slot from an arc center, its start and end and a width' }] },
        // the Circle flyout: Circle, Perimeter Circle (ui-sketch-curves.js) and Tangent Circle (ui-sketch-construct.js)
        { fly: 'circle', items: [{ id: 'circle', label: 'Circle', tool: 'circle' }, { id: 'pcircle', label: 'Perimeter Circle', tool: 'pcircle', help: 'Circle through three points on it' },
          { id: 'tangentCircle', label: 'Tangent Circle', help: 'Circle tangent to two entities with a radius, or to three', run: function () { if (UI.cmdTangentCircle) UI.cmdTangentCircle(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('tangentCircle')); } }] },
        // the Arc flyout: Centerpoint Arc, Tangent Arc, 3 Point Arc (ui-sketch-curves.js)
        { fly: 'arc', items: [{ id: 'arc', label: 'Centerpoint Arc', tool: 'arc' }, { id: 'tarc', label: 'Tangent Arc', tool: 'tarc', help: 'Arc tangent to the end of a line or arc' }, { id: 'arc3', label: '3 Point Arc', tool: 'arc3' }] },
        { id: 'polygon', label: 'Polygon', tool: 'polygon' },
        // ui-sketch-spline: Spline and Style Spline (rfAH); Equation Driven Curve (rfAP, ui-sketch-tools.js)
        { fly: 'spline', items: [{ id: 'spline', label: 'Spline', tool: 'spline' },
          { id: 'styleSpline', label: 'Style Spline', tool: 'styleSpline', help: 'A single Bézier curve shaped by its control polygon' },
          { id: 'eqnCurve', label: 'Equation Driven Curve', help: 'A curve from an equation y = f(x) or x(t), y(t)', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdEquationCurve(); } }] },
        // the Ellipse flyout: Ellipse, Partial Ellipse, Parabola, Conic (ui-sketch-spline.js)
        { fly: 'ellipse', items: [{ id: 'ellipse', label: 'Ellipse', tool: 'ellipse' }, { id: 'pellipse', label: 'Partial Ellipse', tool: 'pellipse' },
          { id: 'parabola', label: 'Parabola', tool: 'parabola', help: 'A parabolic arc from its focus, apex and ends' }, { id: 'conic', label: 'Conic', tool: 'conic', help: 'A conic arc from its ends, the apex and a rho value' }] },
        // ui-sketch-tools.js: Sketch Fillet ▸ Sketch Chamfer
        { fly: 'skFillet', items: [{ id: 'fillet', cmd: 'skFillet', icon: 'skFillet', label: 'Sketch Fillet', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdSketchFillet(); } }, { id: 'skChamfer', label: 'Sketch Chamfer', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdSketchChamfer(); } }] },
        { id: 'plane', label: 'Plane', run: function () { UI.cmdPlane(); } },
        { id: 'text', label: 'Text', tool: 'text' },
        { id: 'point', label: 'Point', tool: 'point' }] },
      { sep: true },
      // sketch tools (ui-sketch-tools.js, ui-sketch-construct.js), as SolidWorks 2024 groups them: Trim ▸ Extend / Split /
      // Join, Convert Entities ▸ Intersection Curve, Offset Entities, and the small Mirror / Sketch Pattern / Move flyouts
      { fly: 'trim', items: [{ id: 'trim', label: 'Trim\nEntities', run: function () { UI.cmdTrimEntities(); } }, { id: 'extend', label: 'Extend\nEntities', run: function () { UI.cmdExtendEntities(); } },
        { id: 'splitEnt', label: 'Split\nEntities', help: 'Split a line, arc or circle at a point, or everything at its intersections', run: function () { if (UI.cmdSplitEntities) UI.cmdSplitEntities(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('splitEnt')); } },
        { id: 'joinEnt', label: 'Join\nEntities', help: 'Join collinear lines, or arcs on one circle, into one', run: function () { if (UI.cmdJoinEntities) UI.cmdJoinEntities(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('joinEnt')); } }] },
      { fly: 'convert', items: [{ id: 'convert', label: 'Convert\nEntities', run: function () { UI.cmdConvertEntities(); } }, { id: 'intersectCurve', label: 'Intersection\nCurve', run: function () { if (UI.cmdIntersectionCurve) UI.cmdIntersectionCurve(); }, active: function () { return !!(UI.intersectionCurveOpen && UI.intersectionCurveOpen()); } }] },
      { id: 'offset', label: 'Offset\nEntities', run: function () { UI.cmdOffsetEntities(); } },
      { id: 'offsetSurface', icon: 'offset', swIcon: 'offsetSurface', label: 'Offset\nOn Surface', help: 'Offset the edges of a face or surface along it (3D)', run: function () { if (UI.cmdOffsetOnSurface) UI.cmdOffsetOnSurface(); } },   // rfLQ: ui-sketch-3d.js
      { stack: [{ fly: 'mirrorEnt', items: [{ id: 'mirrorEnt', label: 'Mirror Entities', run: function () { UI.cmdMirrorEntities(); } }, { id: 'dynMirror', label: 'Dynamic Mirror', run: function () { if (UI.cmdDynamicMirror) UI.cmdDynamicMirror(); }, active: function () { return !!(UI.dynamicMirrorOn && UI.dynamicMirrorOn()); } }] },
        { fly: 'skPattern', items: [{ id: 'sketchPattern', label: 'Linear Sketch Pattern', run: function () { UI.cmdSketchPattern(); } }, { id: 'cSketchPattern', label: 'Circular Sketch Pattern', run: function () { UI.cmdCircularSketchPattern(); } }] },
        { fly: 'moveEnt', items: [{ id: 'moveEnt', label: 'Move Entities', run: function () { UI.cmdMoveEntities(); } }, { id: 'copyEnt', label: 'Copy Entities', run: function () { UI.cmdCopyEntities(); } }, { id: 'rotateEnt', label: 'Rotate Entities', run: function () { UI.cmdRotateEntities(); } }, { id: 'scaleEnt', label: 'Scale Entities', run: function () { UI.cmdScaleEntities(); } }, { id: 'stretchEnt', label: 'Stretch Entities', run: function () { UI.cmdStretchEntities(); } }] }] },
      // lane BS: Mastercam's Close Arc (ui-sketch-tools.js), an Anvil extra beside the modify tools
      { extra: true, id: 'closeArc', label: 'Close\nArc', help: 'Close the selected arcs into full circles (same centre and radius); relations on their end points are removed', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdCloseArc(); } },
      { sep: true },
      // the Display/Delete Relations flyout (SolidWorks): Display/Delete Relations, Add Relation, Fully Define Sketch
      // (ui-relations.js, ui-sketch-dims.js)
      { fly: 'relations', items: [{ id: 'relations', label: 'Display/Delete\nRelations', run: function () { UI.cmdDisplayRelations(); } },
        { id: 'addRelation', label: 'Add\nRelation', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdAddRelations(); } },
        { id: 'fullyDefine', label: 'Fully Define\nSketch', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdFullyDefineSketch(); } }] },
      // dxf-import: Repair Sketch (ui-sketch-import.js), large beside Display/Delete Relations as SolidWorks 2024 has it
      { id: 'repairSketch', label: 'Repair\nSketch', help: 'Close small gaps, merge duplicate and overlapping entities, join collinear lines and remove tiny entities', run: function () { UI.cmdRepairSketch(); } },
      { sep: true },
      // rfAR: Quick Snaps (ui-sketch.js UI.quickSnap): the next point snaps to that one kind of geometry only
      { fly: 'quickSnaps', label: 'Quick\nSnaps', items: (UI.QUICK_SNAPS || []).map(function (q) {
          return { id: 'qs-' + q[0], icon: 'quickSnaps', swIcon: 'qs' + q[0].charAt(0).toUpperCase() + q[0].slice(1), label: q[1] + ' Snap', help: 'Quick Snaps: snap the next point to ' + q[1].toLowerCase() + ' only, then snap as usual',
            run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.quickSnap(App.quickSnap === q[0] ? null : q[0]); },
            active: function () { return App.quickSnap === q[0]; } };
        }) },
      { sep: true },
      // rfAY: Rapid Sketch (ui-sketch.js); rfAV: Instant2D (ui-sketch-dims.js); Shaded Sketch Contours is View ▸ Sketch
      // Regions (ui-sketch-layers.js): three large toggles, as SolidWorks 2024
      { id: 'rapidSketch', label: 'Rapid\nSketch', help: 'Sketch on any plane or planar face without opening a sketch on it first: pick a sketch tool, then click the plane or face; click another one between entities to move there', run: function () { if (UI.toggleRapidSketch) UI.toggleRapidSketch(); }, active: function () { return !!(UI.rapidSketchOn && UI.rapidSketchOn()); } },
      { id: 'instant2D', label: 'Instant2D', help: 'Hover a sketch dimension and drag the ball at its arrow to change the value on a ruler', run: function () { if (UI.toggleInstant2D) UI.toggleInstant2D(); }, active: function () { return !!(UI.instant2DOn && UI.instant2DOn()); } },
      { id: 'shadedContours', wide: true, label: 'Shaded Sketch\nContours', help: 'Shade the closed regions of the sketch and mark its open ends (View ▸ Sketch Regions)', run: function () { toggleSketchRegions(); }, active: function () { return App.view.sketchRegions !== false; } },
      { sep: true, extra: true },
      // Anvil's own: Construction Geometry (ui-relations.js) and Sketch Picture (rfAW: ui-sketch-picture.js), then the
      // sheet-metal-shop commands; `extra`: these go to the » menu first when the ribbon is too narrow, so the SolidWorks
      // buttons keep their labels
      { extra: true, stack: [{ id: 'construction', label: 'Construction Geometry', run: function () { UI.toggleConstruction(); } },
        { id: 'sketchPicture', label: 'Sketch Picture', help: 'Place a picture (PNG, JPG, BMP) on the sketch plane to trace over', run: function () { if (UI.cmdSketchPicture) UI.cmdSketchPicture(); } }] },
      // sketch-layers / levels: the Levels Manager tab (ui-levels.js, Mastercam's part-wide levels: CUT, ETCH and BEND
      // with their own colours, shown or hidden, written to the DXF on their names); the sketch's Layers PM without it
      { extra: true, id: 'levels', label: 'Levels', help: 'Levels Manager: numbered part-wide levels (CUT, ETCH, BEND …) with their own colours, shown or hidden, written to the DXF on their names', run: function () { if (UI.showLevelsManager) UI.showLevelsManager(); else if (UI.cmdSketchLayers) UI.cmdSketchLayers(); } },
      { extra: true, id: 'dxf', cmd: 'sketchDxf', label: 'Sketch\nto DXF', run: function () { UI.exportSketchDXF(); } },
      // dxf-import: Insert DXF / DWG, Check Sketch for Feature (ui-sketch-import.js)
      { extra: true, stack: [{ id: 'importDxf', label: 'Insert DXF / DWG', help: 'Import a DXF or DWG file into the sketch (a new sketch on the Top Plane when none is open; DWG through the local Anvil server)', run: function () { UI.cmdInsertDXF(); } },
        { id: 'checkSketch', label: 'Check Sketch for Feature', help: 'Find open endpoints, gaps, duplicates and crossings that keep the sketch from making a feature', run: function () { UI.cmdCheckSketch(); } }] }
    ],
    Evaluate: [
      { id: 'measure', label: 'Measure', run: function () { UI.cmdMeasure(); } },
      { id: 'mass', label: 'Mass\nProperties', run: function () { UI.showMassProperties(); } },
      { id: 'sectionProps', label: 'Section\nProperties', run: function () { UI.cmdSectionProperties(); } },
      { id: 'section', label: 'Section\nView', run: function () { UI.cmdSection(); } },
      { sep: true },
      { id: 'dxf', cmd: 'faceDxf', label: 'Face\nto DXF', run: function () { UI.exportFaceDXF(); } },
      { id: 'check', label: 'Check', run: function () { UI.cmdCheck(); } }, { id: 'sensor', label: 'Sensor', help: 'Watch mass, volume, a dimension or a measurement after every rebuild, with an alert when it passes a limit', run: function () { UI.cmdSensor(); } },   // lane evalgrey
      { id: 'zebra', label: 'Zebra\nStripes', run: function () { UI.cmdZebra(); }, active: function () { return !!(UI.evaluate && UI.evaluate.zebra.state().on); } },
      { id: 'draftAnalysis', label: 'Draft\nAnalysis', run: function () { UI.cmdDraftAnalysis(); } },
      { id: 'clearance', label: 'Clearance\nVerification', run: function () { UI.cmdClearance(); } },
      { stack: [{ id: 'generic', icon: 'undercut', label: 'Undercut Analysis', help: 'Colour the faces a two-plate mold opening along a direction can or cannot release', run: function () { UI.cmdUndercut(); } }, { id: 'generic', icon: 'thickness', label: 'Thickness Analysis', run: function () { UI.cmdThickness(); } }] },
      { sep: true },
      { id: 'generic', icon: 'compareDocs', label: 'Compare\nDocuments', help: 'Compare this part with a saved part: features added, removed and changed, volume and the faces only in one', run: function () { UI.cmdCompare(); } },   // lane evalgrey
      { id: 'generic', icon: 'perfEval', label: 'Performance\nEvaluation', help: 'Rebuild time of each feature, slowest first, the triangle count and the engine', run: function () { UI.cmdPerformance(); } },
      { id: 'generic', icon: 'costing', label: 'Costing', help: 'Quote the part: material, laser cut, pierces, bends, setup and markup (sheet metal), or stock and removal (machined)', run: function () { UI.cmdCosting(); } }
    ],
    'Sheet Metal': [
      { id: 'flange', label: 'Base\nFlange/Tab', run: function () { UI.cmdBaseFlange(); } },
      { id: 'convertSM', label: 'Convert to\nSheet Metal', help: 'Turn a solid into sheet metal: a fixed face and the edges that become bends; the other faces are removed and the corners ripped', run: function () { UI.cmdConvertSheetMetal(); } }, { id: 'loft', cmd: 'loftedBend', label: 'Lofted-Bend', help: 'Sheet metal lofted between two open profiles (square to round, transitions): Bent facets with bend lines, or Formed', run: function () { UI.cmdLoftedBend(); } },
      { id: 'sweptFlange', label: 'Swept\nFlange', help: 'Sweep an open profile along a path (a sketch, or edges of the part) into sheet metal; its bends unbend in the flat', run: function () { UI.cmdSweptFlange(); } },
      { sep: true },
      { id: 'bend', label: 'Edge\nFlange', run: function () { UI.cmdEdgeFlange(); } }, { id: 'miter', label: 'Miter\nFlange', run: function () { UI.cmdMiterFlange(); } }, { id: 'hem', label: 'Hem', run: function () { UI.cmdHem(); } }, { id: 'jog', label: 'Jog', run: function () { UI.cmdJog(); } }, { id: 'sketchedBend', label: 'Sketched\nBend', run: function () { UI.cmdSketchedBend(); } },
      { stack: [{ id: 'crossBreak', icon: 'crossBreak', label: 'Cross-Break', help: 'Mark a stiffening X on a flat sheet face, corner to corner (cosmetic: the solid and the blank stay)', run: function () { UI.cmdCrossBreak(); } }, { fly: 'corners', items: [{ id: 'breakCorner', label: 'Break-Corner/Corner-Trim', help: 'Round or chamfer outside corners of the sheet (Corners ▸ Break-Corner/Corner-Trim)', run: function () { UI.cmdBreakCorner(); } }, { id: 'closedCorner', label: 'Closed Corner', help: 'Extend the end faces of a flange to close the gap at a box corner (Corners ▸ Closed Corner)', run: function () { UI.cmdClosedCorner(); } }, { id: 'weldedCorner', label: 'Welded Corner', help: 'Fill the gap at a box corner with weld metal; the flat pattern leaves it out (Corners ▸ Welded Corner)', run: function () { UI.cmdWeldedCorner(); } }, { id: 'cornerRelief', label: 'Corner Relief', help: 'Cut a relief where two bends meet at a corner (Corners ▸ Corner Relief)', run: function () { UI.cmdCornerRelief(); } }] }, { fly: 'forming', label: 'Forming Tool', items: [['dimple', 'Dimple', 'Press a round dimple (emboss) into a sheet face'], ['extrudedHole', 'Extruded Hole', 'A formed collar round a hole (extruded flange)'], ['louver', 'Louver', 'A vent hood lanced along one side'], ['lance', 'Lance', 'A bridge lance: cut along both sides, pressed up'], ['rib', 'Rib', 'A straight stiffening rib with round ends']].map(function (t) { return { id: 'ft' + t[0].charAt(0).toUpperCase() + t[0].slice(1), label: t[1], help: t[2], run: function () { UI.cmdFormingTool(t[0]); } }; }) }] },   // lane forming
      { sep: true },
      { id: 'cut', label: 'Extruded\nCut', run: function () { UI.cmdExtrude(true); } }, { id: 'hole', label: 'Simple\nHole', run: function () { UI.cmdHole(); } }, { id: 'vent', label: 'Vent', run: function () { UI.cmdVent(); } },
      { sep: true },
      // lane DL (fidelity #12): SolidWorks 2024's order Unfold, Fold, Flatten, No Bends, Insert Bends, Rip; Flat to DXF (Anvil's) last
      { id: 'unfold', label: 'Unfold', help: 'Unfold bends about a fixed face to cut across them flat', run: function () { UI.cmdUnfold(); } }, { id: 'fold', label: 'Fold', help: 'Fold back the bends an Unfold unfolded, with the cuts made across them', run: function () { UI.cmdFold(); } }, { id: 'flatten', label: 'Flatten', run: function () { UI.cmdFlatten(); } },
      { id: 'noBends', label: 'No\nBends', help: 'Show the part as it was before its bends were inserted (a part converted from a solid)', run: function () { UI.toggleNoBends(); }, active: function () { return !!(App.model && App.model.noBends); } }, { id: 'insertBends', label: 'Insert\nBends', help: 'Turn a thin-walled solid with sharp corners into sheet metal by inserting bends', run: function () { UI.cmdInsertBends(); } },{ id: 'rip', icon: 'rip', label: 'Rip', help: 'Rip the edges of a hollow part so it can be unfolded', run: function () { UI.cmdRipFeature(); } },
      { extra: true, id: 'dxf', cmd: 'flatDxf', label: 'Flat to\nDXF', run: function () { UI.exportFlatDXF(); } }
    ],
    // lane BJ: Mastercam 2024's Transform tab, groups Position | Offset | Layout | Size with their captions under the
    // buttons (ui-transform.js lays them out from `group`). Each button runs UI['cmdT' + name] (ui-transform.js,
    // ui-transform-3d.js, ui-transform-layout.js, ui-nesting.js) and toasts when that command is not loaded.
    Transform: (function () {
      function t(name, id, label, group, help) {
        var flat = label.replace(/\n/g, ' ');
        return { id: id, label: label, group: group, help: help, run: function () { var fn = UI['cmdT' + name]; if (typeof fn === 'function') fn(); else UI.toast(flat + ' is not available yet.'); } };
      }
      return [
        t('Dynamic', 'tDynamic', 'Dynamic', 'Position', 'Move or rotate sketch geometry by dragging the arrows and ring of an on-screen gnomon, or typing values'),
        t('Translate', 'tTranslate', 'Translate', 'Position', 'Move or copy sketch geometry by Delta X / Y, a length at an angle, or from one point to another'),
        t('TranslateToPlane', 'tTranslatePlane', 'Translate\nto Plane', 'Position', 'Move or copy sketch geometry from one plane to another'),
        t('Rotate', 'tRotate', 'Rotate', 'Position', 'Rotate or copy sketch geometry round a point by an angle, as many copies as you like'),
        t('Project', 'tProject', 'Project', 'Position', 'Project sketch geometry onto a plane, a depth or a surface'),
        t('MoveToOrigin', 'tMoveOrigin', 'Move to\nOrigin', 'Position', 'Move the sketch (or the selection) so the point you pick lands on the origin'),
        t('Mirror', 'tMirror', 'Mirror', 'Position', 'Mirror sketch geometry about the X or Y axis, a line at an angle, a picked line or two points'),
        t('Roll', 'tRoll', 'Roll', 'Position', 'Roll (wrap) sketch geometry round a cylinder, or unroll it flat'),
        { sep: true },
        t('OffsetEntity', 'tOffsetEntity', 'Offset\nEntity', 'Offset', 'Offset one sketch entity by a distance, to one side or both'),
        t('OffsetChains', 'tOffsetChains', 'Offset\nChains', 'Offset', 'Offset chains of sketch entities, with sharp, round or no corners'),
        { sep: true },
        t('Nesting', 'tNesting', 'Geometry\nNesting', 'Layout', 'Nest flat parts on sheets to use the least material'),
        { group: 'Layout', stack: [t('RectArray', 'tRectArray', 'Rectangular Array', 'Layout', 'Copy sketch geometry in rows and columns'),
          t('Distribute', 'tDistribute', 'Distribute', 'Layout', 'Space sketch geometry evenly between two points or along a direction')] },
        { sep: true },
        t('Stretch', 'tStretch', 'Stretch', 'Size', 'Move the sketch geometry inside a window, stretching what crosses it'),
        t('Scale', 'tScale', 'Scale', 'Size', 'Scale sketch geometry about a point, evenly or by X / Y factors')
      ];
    })(),
    // lane CC: Mastercam's View tab with the view commands Anvil has (viewTab, below the heads-up toolbar)
    View: viewTab(false)
  };

  // Assembly documents get their own CommandManager: the Assembly tab plus Evaluate (the part-only tabs are hidden).
  var ASM_RIBBON = {
    Assembly: [
      { id: 'insertComponent', label: 'Insert\nComponents', run: function () { UI.cmdInsertComponent(); } },
      { id: 'mate', label: 'Mate', run: function () { UI.cmdMate(); } },
      { sep: true },
      { id: 'fix', label: 'Fix', run: function () { UI.cmdFixComponent(true); } },
      { id: 'float', label: 'Float', run: function () { UI.cmdFixComponent(false); } },
      { sep: true },
      { id: 'hideshow', label: 'Hide/Show\nComponents', run: function () { UI.cmdHideShowComponents(); } },
      { sep: true },
      { id: 'lpattern', label: 'Linear Component\nPattern' },
      { id: 'moveComponent', label: 'Move\nComponent', run: function () { UI.cmdMoveComponent(); } },
      { id: 'rotateComponent', label: 'Rotate\nComponent', run: function () { UI.cmdRotateComponent(); } },
      { id: 'generic', icon: 'explode', label: 'Exploded\nView' },
      { stack: [{ id: 'generic', icon: 'smartFasteners', label: 'Smart Fasteners', help: 'Add Design Library hex bolts, washers and nuts sized to every hole stack', run: function () { UI.cmdSmartFasteners(); } }, /* lane evalgrey */ { id: 'generic', icon: 'bom', label: 'Bill of Materials' }, { id: 'generic', icon: 'instant', label: 'Instant3D' }] }
    ],
    Evaluate: [
      { id: 'measure', label: 'Measure', run: function () { UI.cmdMeasure(); } },
      { id: 'mass', label: 'Mass\nProperties', run: function () { UI.showMassProperties(); } },
      { id: 'sectionProps', label: 'Section\nProperties', run: function () { UI.cmdSectionProperties(); } },
      { id: 'section', label: 'Section\nView', run: function () { UI.cmdSection(); } },
      { sep: true },
      { id: 'interference', label: 'Interference\nDetection', run: function () { UI.cmdInterference(); } }, { id: 'clearance', label: 'Clearance\nVerification', run: function () { UI.cmdClearance(); } }, { id: 'generic', icon: 'holeAlignment', label: 'Hole Alignment', help: 'Find holes in different components that are off each other\'s axis', run: function () { UI.cmdHoleAlignment(); } },   // lane evalgrey
      { sep: true },
      { id: 'check', label: 'Check', run: function () { UI.cmdCheck(); } },
      { id: 'zebra', label: 'Zebra\nStripes', run: function () { UI.cmdZebra(); }, active: function () { return !!(UI.evaluate && UI.evaluate.zebra.state().on); } },
      { id: 'draftAnalysis', label: 'Draft\nAnalysis', run: function () { UI.cmdDraftAnalysis(); } }
    ],
    View: viewTab(true)   // lane CC: the part's View tab without the Levels Manager (levels belong to parts)
  };
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  // D1 (shop-flow 4): Tools ▸ Units (and Document Properties ▸ Units) changes the units the part shows and takes, as
  // SolidWorks does: every stored length is converted (Assembly.convertUnits), so a 100 mm bracket reads 3.937 in and
  // stays the same size. One undo step. The converted part is rebuilt and its volume checked against the old one; a
  // part Anvil cannot convert, or whose size would change, keeps its units with a message. An empty part or assembly
  // just takes the new units; an assembly with components is refused (its parts keep their own units).
  function setDocumentUnits(to) {
    var m = App.model, from = m && m.units === 'in' ? 'in' : 'mm', name = to === 'in' ? 'inches (IPS)' : 'millimeters (MMGS)';
    if (!m || from === to) return Promise.resolve(true);
    function refuse(msg) { toast(msg); setStatus(msg); if (UI.refreshTaskPane) UI.refreshTaskPane(); return Promise.resolve(false); }
    if (isAsm() ? (m.components || []).length : false) return refuse('Units of an assembly with components cannot be changed here yet: each part keeps its own units. Open a part to change its units.');
    if (isAsm() || !(m.features || []).length) { m.units = to; return Promise.resolve(UI.rebuild()).then(function () { return true; }); }
    var r = typeof Assembly !== 'undefined' && Assembly.convertUnits ? Assembly.convertUnits(m, to) : { ok: false, msg: 'Unit conversion is not loaded.' };
    if (!r.ok) return refuse(r.msg);
    function volOf(b) { try { return b && b.body ? K.massProps(K.meshFromBody(b.body), 1).volume : 0; } catch (e) { return 0; } }
    var v0 = volOf(App.build), errs0 = Object.keys((App.build && App.build.errors) || {}).length;
    UI.pushUndo();
    Object.keys(m).forEach(function (k) { delete m[k]; });
    Object.keys(r.model).forEach(function (k) { m[k] = r.model[k]; });
    return Promise.resolve(UI.rebuild()).then(function () {
      var v1 = volOf(App.build), errs1 = Object.keys((App.build && App.build.errors) || {}).length, f3 = Math.pow(r.factor, 3);
      if (errs1 > errs0 || (v0 > 0 && !(Math.abs(v1 / f3 - v0) <= 1e-4 * v0))) {
        UI.undo();
        return refuse('The part keeps its units: converted to ' + name + ' it would not rebuild to the same size.');
      }
      var msg = 'Units: ' + name + '. The part keeps its size; every dimension now reads in ' + (to === 'in' ? 'inches' : 'millimeters') + '.';
      toast(msg); setStatus(msg);
      return true;
    });
  }
  UI.setDocumentUnits = setDocumentUnits;
  // lane profiles: an interface profile (ui-profiles.js) may lay the CommandManager out like another program; with the
  // SolidWorks profile (the default) profileSet() is null and the tables above are used as they are
  function ribbonSet() { return profileSet() || (isAsm() ? ASM_RIBBON : RIBBON); }
  function ribbonTabs() { return Object.keys(ribbonSet()); }

  // ------------------------------------------------------------------ command registry (lane profiles)
  // Every ribbon button, stack item and flyout item has one stable command id per document type: `cmd`, else the item's
  // id (its icon key), else for a SolidWorks command not built yet (id 'generic') its icon. Ids that two different
  // commands share carry their own `cmd` (Swept Cut, Sketch Fillet, the three "to DXF" buttons …). The same command on
  // two tabs (Extruded Cut on Features and Sheet Metal, Section View on Evaluate and View) is one cmd.
  // UI.Commands.get(cmd[, docType]) -> { cmd, id, label (SolidWorks' name, one line), run, tab, docType };
  // UI.Commands.list(docType) -> the same for every command of 'part' | 'assembly' | 'drawing', in ribbon order.
  var PROFILE_DRAW_TABS = ['View Layout', 'Annotation', 'Sketch', 'Sheet Format'];
  function cmdOf(it) { return it.cmd || (it.id === 'generic' ? it.icon || it.id : it.id); }
  function flatLabel(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }
  function docTypeNow() { return UI.drawingActive && UI.drawingActive() ? 'drawing' : isAsm() ? 'assembly' : 'part'; }
  // RIBBON.Sketch is a getter in drawings (drawing-ui-sketch.js: the drawing's sketch tools while a drawing is open):
  // read a document type's tabs with the drawing flag as that type has it
  function withDrawingFlag(on, fn) {
    var D = UI.drawingInternal && UI.drawingInternal.D;
    if (!D || !!D.active === on) return fn();
    var was = D.active; D.active = on;
    try { return fn(); } finally { D.active = was; }
  }
  // the SolidWorks tabs of a document type: [{ name, items }]
  function swTabsOf(docType) {
    return withDrawingFlag(docType === 'drawing', function () {
      var set = docType === 'assembly' ? ASM_RIBBON : RIBBON, names;
      if (docType === 'drawing') names = PROFILE_DRAW_TABS.filter(function (n) { return !!set[n]; });
      else names = Object.keys(set).filter(function (n) { return PROFILE_DRAW_TABS.indexOf(n) < 0 || n === 'Sketch'; });
      return names.map(function (n) { return { name: n, items: set[n] || [] }; });
    });
  }
  function commandList(docType) {
    var out = [], seen = {};
    swTabsOf(docType || docTypeNow()).forEach(function (t) {
      ribbonLeaves(t.items).forEach(function (it) {
        var c = cmdOf(it);
        if (seen[c]) { seen[c].items.push(it); return; }
        var e = { cmd: c, id: it.id, label: flatLabel(it.label), tab: t.name, docType: docType || docTypeNow(), item: it, items: [it] };
        e.run = function () { runItem(it); refreshRibbon(); };
        seen[c] = e; out.push(e);
      });
    });
    return out;
  }
  function publicCmd(e) { return e ? { cmd: e.cmd, id: e.id, label: e.label, run: e.run, tab: e.tab, docType: e.docType } : null; }
  UI.Commands = {
    list: function (docType) { return commandList(docType).map(publicCmd); },
    get: function (cmd, docType) { var l = commandList(docType); for (var i = 0; i < l.length; i++) if (l[i].cmd === cmd) return publicCmd(l[i]); return null; },
    // every (cmd, label) pair as it appears on the tabs, duplicates included (tests: one cmd, one name)
    occurrences: function (docType) { var o = []; commandList(docType).forEach(function (e) { e.items.forEach(function (it) { o.push({ cmd: e.cmd, label: flatLabel(it.label) }); }); }); return o; },
    cmdOf: cmdOf, docType: docTypeNow,
    run: function (cmd, docType) { var c = UI.Commands.get(cmd, docType); if (!c) return false; c.run(); return true; }
  };

  // ------------------------------------------------------------------ the CommandManager of a profile (lane profiles)
  // UI.Profiles.active() is JSON: tabs per document type made of groups of cmds, labels by cmd. profileSet() turns it
  // into a ribbon set like RIBBON (tab name -> items) whose buttons are the SolidWorks items themselves, or a thin
  // Object.create() over one when the profile renames it or puts it under a group caption (so run / tool / active /
  // dyn are the SolidWorks item's). A command the profile does not place goes on the last tab, More, grouped by its
  // SolidWorks tab. The set is cached per profile and document type, so refreshRibbon's identity checks hold.
  var profCache = {};
  function profileDef() { var P = UI.Profiles; var p = P && P.active ? P.def(P.active()) : null; return p && p.id !== 'solidworks' ? p : null; }
  function profileSet(docType) {
    var p = profileDef();
    if (!p) return null;
    docType = docType || docTypeNow();
    var reg = commandList(docType), sig = p.id + '|' + (p.rev || 0) + '|' + docType + '|' + reg.length + '|' + reg.reduce(function (n, e) { return n + e.items.length; }, 0);
    if (profCache[docType] && profCache[docType].sig === sig) return profCache[docType].set;
    var set = buildProfileSet(p, docType, reg);
    profCache[docType] = { sig: sig, set: set };
    return set;
  }
  function buildProfileSet(p, docType, reg) {
    var labels = p.labels || {}, tabsDef = p.tabs && p.tabs[docType], byCmd = {}, placed = {};
    reg.forEach(function (e) { byCmd[e.cmd] = e; });
    if (!tabsDef && !reg.some(function (e) { return labels[e.cmd]; })) return null;
    function wrap(leaf, group) {
      var c = cmdOf(leaf), lab = labels[c];
      placed[c] = true;
      if (!lab && !group) return leaf;
      var w = Object.create(leaf);
      if (lab) {
        var sw = flatLabel(leaf.label), desc = leaf.help || RIBBON_HELP[sw] || DRAW_HELP[sw] || '';
        w.label = lab; w.swLabel = sw;
        w.help = (desc ? desc + ' ' : '') + '(SolidWorks: ' + sw + ')';
      }
      if (group) w.group = group;
      return w;
    }
    // a SolidWorks item list with the profile's names (the layout, flyout memory and captions unchanged); lane mcframe:
    // with a frame that captions every group, a run between separators without one gets captions[i] or the tab's name
    var capAll = !!(p.frame && p.frame.ribbon && p.frame.ribbon.captions);
    function mapItems(list, tabName, caps) {
      var run = 0, cap = function () { return (caps && caps[run]) || tabName; };
      return list.map(function (it) {
        if (!it || it.sep) { if (it && it.sep) run++; return it; }
        var g = capAll && tabName && !it.group ? cap() : null;
        if (it.stack) { var s = Object.create(it); s.stack = mapItems(it.stack); if (g) s.group = g; return s; }
        if (it.fly) { var f = Object.create(it); f.items = mapItems(it.items); if (g) f.group = g; return f; }
        return wrap(it, g);
      });
    }
    function leafOf(c) { var e = byCmd[c]; return e ? e.item : null; }
    function profItem(x, group) {
      if (typeof x === 'string') { var l = leafOf(x); return l ? wrap(l, group) : null; }
      if (!x) return null;
      if (x.menu || x.fn) return frameItem(x, group);   // lane mcframe: a menu row or a frame function as a button
      var list = (x.stack || x.grid || x.items || []).map(function (c) {
        if (c && typeof c === 'object' && (c.menu || c.fn)) return frameItem(c, null);
        if (c && typeof c === 'object' && c.fly && c.items) return profItem(c, null);   // lane mcribbon: a split button in a stack (Mastercam's Line Closest ˅)
        var l = leafOf(c); return l ? wrap(l, null) : null;
      }).filter(Boolean);
      if (!list.length) return null;
      if (x.items) return { fly: 'p-' + p.id + '-' + x.fly, label: x.label, items: list, group: group };
      return { stack: list, grid: !!x.grid, group: group };
    }
    var set = {};
    if (!tabsDef) {
      swTabsOf(docType).forEach(function (t) { set[t.name] = mapItems(t.items, t.name); });
      frameMenusTab(p, set);
      return set;
    }
    var sw = {};
    swTabsOf(docType).forEach(function (t) { sw[t.name] = t.items; });
    tabsDef.forEach(function (tab) {
      if (tab.sw) { if (sw[tab.sw]) set[tab.name] = mapItems(sw[tab.sw], tab.name, tab.captions); return; }   // a SolidWorks tab kept whole (Sheet Metal, Transform)
      var out = [];
      (tab.groups || []).forEach(function (g) {
        var items = (g.items || []).map(function (x) { return profItem(x, g.name); }).filter(Boolean);
        if (!items.length) return;
        if (out.length) out.push({ sep: true });
        out.push.apply(out, items);
      });
      set[tab.name] = out;
    });
    // nothing is ever unreachable: the commands the profile does not place, on More, by their SolidWorks tab
    var rest = {}, order = [];
    reg.forEach(function (e) { if (placed[e.cmd]) return; if (!rest[e.tab]) { rest[e.tab] = []; order.push(e.tab); } rest[e.tab].push(e.item); });
    if (order.length) {
      var more = [];
      order.forEach(function (t) {
        if (more.length) more.push({ sep: true });
        more.push({ stack: rest[t].map(function (l) { return wrap(l, t); }), grid: true, group: t });
      });
      set[p.moreTab || 'More'] = more;
    }
    frameMenusTab(p, set);
    return set;
  }
  // a SolidWorks tab name (Sketch, Features …: ui-sketch.js, drawing-ui.js and others ask for these) as the active
  // profile names it (profile.tabAlias); a name the set has is kept
  function tabName(name) {
    var p = profileDef();
    if (!p) return name;
    var set = ribbonSet();
    if (set[name]) return name;
    var a = p.tabAlias && p.tabAlias[docTypeNow()] && p.tabAlias[docTypeNow()][name];
    return a && set[a] ? a : name;
  }
  UI.profileRibbon = function (docType) { return profileSet(docType); };
  UI.profileTabName = tabName;
  UI.profileRibbonReset = function () { profCache = {}; ribbonBuilt = null; };

  // ------------------------------------------------------------------ the window frame of a profile (lane mcframe)
  // User 2026-11-11: choosing Mastercam should turn the whole window into Mastercam's. profile.frame (ui-profiles.js,
  // schema there) is read here only: UI.setFrame(frame | null) on every profile change. null = SolidWorks' window, which
  // is what the page was before this lane (nothing below runs, nothing is left in the DOM). Pieces, each optional:
  //  ribbon   tabs above the buttons (#app.mc-tabs-top), a File tab (#mc-file) opening the backstage (#mc-backstage),
  //           the title-row Quick Access Toolbar (#app.mc-qat), a caption under every group of every tab and document
  //           type (.mc-captions, laid out here; ui-transform.js's .rb-captions are hidden under the frame)
  //  menubar  false: #menus hidden (#app.mc-no-menubar); File rows live in the backstage, the other menus are buttons
  //           in the More tab's Menus group (frameMenusTab), so every menu row stays reachable
  //  managers the left column as a manager panel: #mc-mgr-head (big title, tool row), #mc-solids / #mc-planes /
  //           #mc-recent (and ui-levels.js's #levels-panel), #mc-mgr-tabs at the bottom; an open PropertyManager is
  //           the function panel (#left.mc-fn, its title from functionTitles / the profile's label)
  //  status   #mc-status in the status bar (SECTION VIEW, SELECTED ENTITIES, X Y Z, CPLANE, TPLANE, WCS, styles)
  //  theme    html[data-profile] + the profile's colours as --mc-l-* / --mc-d-* on <html> (style.css "lane mcframe")
  var frame = null, frameDoc = null, frameCapObs = null, frameMgr = 'solids', frameRecent = [], frameLastRun = null, framePmObs = null, frameCapFrame = 0;
  var framePlanes = { g: 'Top', wcs: 'Top', c: 'Top', t: 'Top' };
  var FRAME_MENUS = [['Edit', 'undo'], ['View', 'display'], ['Insert', 'extrude'], ['Tools', 'settings'], ['Window', 'palette'], ['Help', 'home']];
  function frameRibbon(k) { return !!(frame && frame.ribbon && frame.ribbon[k]); }
  function frameMgrOn() { return !!(frame && frame.managers); }
  // a menu row by its menu and label, as the menus of the open document have it now
  function menuRow(menu, label) {
    var ms = MENUS();
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].label !== menu) continue;
      var items = ms[i].items || [];
      for (var j = 0; j < items.length; j++) if (items[j] && items[j].label === label) return items[j];
    }
    return null;
  }
  // a profile item that is not a SolidWorks command: { menu, row } runs a menu row, { fn } a frame function
  // rfNG uisense: a frame item's id is only its icon's name, so its tooltip showed the key of another command with that
  // icon (the Edit menu button "Ctrl+Z", Insert "E", Level: "Alt+Z"); it shows the key of what it runs, or none
  var FRAME_ROW_KEYS = { 'Edit/Delete': 'Del', 'Edit/Copy': 'Ctrl+C', 'Edit/Paste': 'Ctrl+V' };
  var FRAME_MGR = {
    solids: { key: 'vFeatureTree', help: 'Show the Solids Manager: the solid and its operations in build order' },
    planes: { help: 'Show the Planes Manager: the views and planes, which one is the construction plane (C) and the tool plane (T)' },
    levels: { key: 'levels', help: 'Show the Levels Manager: the levels, their colours, which are shown, and the main level' },
    recent: { help: 'Show Recent Functions: the last ten commands; a click runs one again' }
  };
  function frameItem(x, group) {
    var it = { id: x.icon || 'generic', icon: x.icon || 'generic', label: x.label, help: x.help || '', noKey: true };
    if (group) it.group = group;
    if (x.menu) {
      it.cmd = 'menu:' + x.menu + '/' + x.row;
      // the row's key while the row can run (Del with something selected, Ctrl+V with entities copied …)
      if (FRAME_ROW_KEYS[x.menu + '/' + x.row]) Object.defineProperty(it, 'key', { enumerable: true, get: function () { var r = menuRow(x.menu, x.row); return r && !r.disabled ? FRAME_ROW_KEYS[x.menu + '/' + x.row] : ''; } });
      it.run = function () {
        var r = menuRow(x.menu, x.row);
        if (r && !r.disabled && r.action) r.action();
        else toast(flatLabel(x.label) + ' is not available now' + (/^(Copy|Paste)$/.test(x.row) ? ': open a sketch and select entities first.' : '.'));
      };
    } else if (x.fn === 'manager') {
      it.cmd = 'manager:' + x.arg;
      var mg = FRAME_MGR[x.arg];
      if (mg) { if (!it.help) it.help = mg.help; if (mg.key) it.keyCmd = mg.key; }
      it.run = function () { frameShowManager(x.arg, true); };
      it.active = function () { return !!frame && frameMgr === x.arg && $('pm').hidden; };
    } else if (x.fn === 'search') {
      it.cmd = 'search';
      it.run = function () { var s = $('cmd-search'); if (s) { s.focus(); s.select(); } };
    } else if (x.fn === 'action') {   // lane mcpolish
      return frameActionItem(x.arg, x, group);
    } else if (x.fn === 'menu') {
      it.cmd = 'menu:' + x.arg;
      it.help = x.help || 'The ' + x.arg + ' menu (Mastercam has no menu bar: its rows are here)';
      it.run = function () { frameOpenMenu(x.arg); };
    }
    return it;
  }
  // menubar: false — the menus other than File as buttons on More (File is the backstage)
  function frameMenusTab(p, set) {
    if (!p.frame || p.frame.menubar !== false) return;
    var key = p.moreTab || 'More', more = set[key] || (set[key] = []);
    var btns = FRAME_MENUS.map(function (m) { return frameItem({ fn: 'menu', arg: m[0], label: m[0], icon: m[1] }, null); });
    // first on More, so a narrow window's » never hides them
    more.unshift({ stack: btns.slice(0, 3), group: 'Menus' }, { stack: btns.slice(3), group: 'Menus' }, { sep: true });
    if (more[more.length - 1].sep) more.pop();
  }
  function frameOpenMenu(label) {
    var m = MENUS().filter(function (x) { return x.label === label; })[0];
    if (!m || !(m.items || []).length) { toast('The ' + label + ' menu has nothing for this document.'); return; }
    var b = Array.prototype.filter.call(document.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === label && x.offsetWidth; })[0];
    var r = b ? b.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: 120 };
    showMenu(r.left, r.bottom + 1, m.items);
  }
  // Recent Functions: the last ten commands run from the ribbon (a click runs one again)
  function frameNoteRun(item) {
    if (!frame) return;
    var c = cmdOf(item);
    if (!c || /^(manager:|menu:|action:|search$)/.test(c)) return;
    var s = itemState(item), label = flatLabel(item.label || s.label);
    frameLastRun = { cmd: c, title: (frame.functionTitles && frame.functionTitles[c]) || label, t: Date.now() };
    frameRecent = frameRecent.filter(function (r) { return r.cmd !== c; });
    frameRecent.unshift({ cmd: c, label: label, icon: s.icon, item: item });
    if (frameRecent.length > 10) frameRecent.length = 10;
    if (frameMgr === 'recent') frameRecentRender();
  }

  // ---- File: the backstage
  var BS_NAV = [['info', 'Info'], ['new', 'New'], ['open', 'Open'], ['save', 'Save'], ['saveas', 'Save As'], ['export', 'Convert / Export'], ['print', 'Print'], ['recent', 'Recent'], ['options', 'Options'], ['help', 'Help']];
  var bs = null;
  function fileRows() {
    var f = MENUS().filter(function (m) { return m.label === 'File'; })[0];
    return f ? (f.items || []).filter(function (it) { return it && !it.sep && it.label; }) : [];
  }
  // which page offers which File row (every row is on one page): New…, Open…, Save As…, recent documents, Properties…,
  // the rest (imports, exports, Pack and Go, screenshots) on Convert / Export
  function bsPartition() {
    var out = { info: [], new: [], open: [], save: [], saveas: [], export: [], print: [], recent: [] };
    fileRows().forEach(function (r) {
      var l = r.label;
      if (r.recent || /^Browse Recent/.test(l)) out.recent.push(r);
      else if (/^New\b/.test(l)) out.new.push(r);
      else if (/^Open\b/.test(l)) out.open.push(r);
      else if (l === 'Save') out.save.push(r);
      else if (/^Save .*As\b|^Save As\b/.test(l) && !/DXF|DWG/.test(l)) out.saveas.push(r);
      else if (/^Print/.test(l)) out.print.push(r);
      else if (/^Properties|Properties…$/.test(l) && !/Sheet/.test(l)) out.info.push(r);
      else out.export.push(r);
    });
    return out;
  }
  function bsRowButton(r, big) {
    var b = el('button', { class: 'bs-row' + (big ? ' bs-big' : '') + (r.dimmed ? ' mi-dim' : ''), 'data-row': r.label });
    b.innerHTML = (r.icon ? Icons(r.icon, big ? 32 : 16) : '') + '<span>' + escHtml(r.label) + '</span>' + (r.key ? '<small>' + escHtml(r.key) + '</small>' : '');
    if (r.disabled) b.disabled = true;
    b.addEventListener('click', function () { bsClose(); if (r.action) r.action(); });
    return b;
  }
  function bsRun(label, fallback) { var r = menuRow('File', label); bsClose(); if (r && !r.disabled && r.action) r.action(); else if (fallback) fallback(); }
  function bsOpen(page) {
    if (!frameRibbon('fileTab')) return false;
    if (!bs) {
      closeMenus();
      bs = { el: el('div', { id: 'mc-backstage', role: 'dialog', 'aria-label': 'File' }), page: null, focus: document.activeElement, tpProps: false };
      var nav = el('nav', { class: 'bs-nav', 'aria-label': 'File' });
      nav.appendChild(el('button', { class: 'bs-back', title: 'Back (Esc)', 'aria-label': 'Back', html: '<svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.5 4.8 L6.3 8 L9.5 11.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', onclick: function () { bsClose(); } }));
      BS_NAV.forEach(function (n) { nav.appendChild(el('button', { class: 'bs-nav-item', 'data-page': n[0], text: n[1], onclick: function () { bsPage(n[0]); } })); });
      bs.el.appendChild(nav);
      bs.el.appendChild(el('div', { class: 'bs-page' }));
      document.body.appendChild(bs.el);
      document.addEventListener('keydown', bsKey, true);
      var fb = $('mc-file'); if (fb) fb.classList.add('active');
    }
    bsPage(page || 'info');
    var back = bs && bs.el.querySelector('.bs-back');
    if (back && !(page === 'options')) back.focus();
    return true;
  }
  function bsKey(e) { if (bs && e.key === 'Escape' && !(document.getElementById('modal') && !$('modal').hidden)) { e.preventDefault(); e.stopPropagation(); bsClose(); } }
  function bsClose() {
    if (!bs) return;
    var b = bs;
    bs = null;
    document.removeEventListener('keydown', bsKey, true);
    b.el.remove();
    var fb = $('mc-file'); if (fb) fb.classList.remove('active');
    if (b.tpProps && UI.openTaskPane) UI.openTaskPane('props');   // the Task Pane's Options went to the backstage meanwhile
    var f = b.focus && b.focus.isConnected && b.focus !== document.body ? b.focus : $('mc-file');
    try { if (f && f.focus) f.focus(); else if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { }
  }
  function bsPage(page) {
    if (!bs) return;
    if (page === 'save') { bsRun('Save', UI.fileSave); return; }
    bs.page = page;
    Array.prototype.forEach.call(bs.el.querySelectorAll('.bs-nav-item'), function (b) { b.classList.toggle('active', b.getAttribute('data-page') === page); });
    var body = bs.el.querySelector('.bs-page'), part = bsPartition(), title = (BS_NAV.filter(function (n) { return n[0] === page; })[0] || [0, ''])[1];
    body.innerHTML = '';
    body.setAttribute('data-page', page);
    body.appendChild(el('h2', { text: page === 'options' ? 'Configuration' : title }));
    function list(rows, big) { var w = el('div', { class: 'bs-list' + (big ? ' bs-tiles' : '') }); rows.forEach(function (r) { w.appendChild(bsRowButton(r, big)); }); body.appendChild(w); return w; }
    if (page === 'info') {
      var m = App.model || {}, units = m.units === 'in' ? 'Inches (IPS)' : 'Millimeters (MMGS)';
      var kind = UI.drawingActive && UI.drawingActive() ? 'Drawing' : isAsm() ? 'Assembly' : 'Part';
      var facts = [['Name', m.name || ''], ['Type', kind], ['File', App.filePath || App.fileName || '(not saved yet)'], ['Units', units], [isAsm() ? 'Components' : 'Features', String(((isAsm() ? m.components : m.features) || []).length)], ['Changes', App.dirty ? 'Not saved' : 'Saved']];
      body.appendChild(el('div', { class: 'bs-facts', html: facts.map(function (f) { return '<span>' + escHtml(f[0]) + '</span><b>' + escHtml(f[1]) + '</b>'; }).join('') }));
      list(part.info);
    } else if (page === 'new') list(part.new, true);
    else if (page === 'open') { list(part.open, true); body.appendChild(el('h3', { text: 'Recent' })); list(part.recent); }
    else if (page === 'saveas') list(part.saveas, true);
    else if (page === 'export') list(part.export);
    else if (page === 'print') {
      list(part.print, true);
      if (!part.print.length) list([{ label: 'Print', icon: 'printDoc', action: function () { if (UI.reports && UI.reports.print) UI.reports.print(); else window.print(); } }], true);
    } else if (page === 'recent') {
      var w = list(part.recent);
      if (!part.recent.length) w.appendChild(el('p', { class: 'bs-note', text: 'No recent documents yet: the files you open and save are listed here.' }));
    } else if (page === 'options') {
      var host = el('div', { class: 'bs-options' });
      body.appendChild(host);
      if (UI.taskPaneContent) {
        if (!$('tp-panel').hidden && UI.taskPaneCurrent && UI.taskPaneCurrent() === 'props') { bs.tpProps = true; UI.closeTaskPane(); }   // one Options at a time (ids)
        UI.taskPaneContent('props', host);
      }
      var r = host.querySelector('[data-role="interface-profiles"] input:checked');
      if (r) r.focus();
    } else if (page === 'help') {
      var hm = MENUS().filter(function (x) { return x.label === 'Help'; })[0];
      list(((hm && hm.items) || []).filter(function (it) { return it && !it.sep; }));
    }
  }
  UI.frameBackstage = {
    has: function () { return frameRibbon('fileTab'); },
    open: bsOpen, close: bsClose, isOpen: function () { return !!bs; }, page: function () { return bs ? bs.page : null; },
    // the File rows each page offers: { page: [labels] } (tests: every File row is on one page)
    rows: function () { var p = bsPartition(), o = {}; Object.keys(p).forEach(function (k) { o[k] = p[k].map(function (r) { return r.label; }); }); return o; }
  };

  // ---- the manager panel
  var MGR_TOOLS = {
    // lane mcpolish: Mastercam's Solids tool row (regenerate all / selected, undo, redo, move up / down, delete)
    solids: [['rebuild', 'Regenerate all (Ctrl+B)', function () { var r = menuRow('Edit', 'Rebuild'); if (r) r.action(); }],
      ['rebuild', 'Regenerate the selected operation', function () { if (!App.sel || App.sel.kind !== 'feature') { toast('Select an operation first.'); return; } var f = K.findFeature(App.model, App.sel.id); UI.rebuild({ card: true }).then(function () { var er = App.build && App.build.errors && App.build.errors[f.id]; setStatus(f.name + (er ? ': ' + er : ' regenerated.')); }); }, 'rebuildSel'],   // rfLX: the 4th entry is the icon an icon set may have for it
      ['undo', 'Undo (Ctrl+Z)', function () { (UI.undoCommand || UI.undo)(); }], ['redo', 'Redo (Ctrl+Y)', function () { (UI.redoCommand || UI.redo)(); }],
      ['moveUp', 'Move the selected operation up', function () { frameMoveOp(-1); }], ['moveDown', 'Move the selected operation down', function () { frameMoveOp(1); }],
      ['deleteEnt', 'Delete the selected operation (Del)', function () { var r = menuRow('Edit', 'Delete'); if (r && !r.disabled) r.action(); else toast('Select an operation first.'); }]],
    // lane mcpolish: Planes tool row (new plane from geometry, from the graphics view, find, reset)
    planes: [['plane', 'New plane from geometry (Plane PropertyManager)', function () { if (UI.cmdPlane) UI.cmdPlane(); }], ['planeView', 'New plane from the graphics view (looking along Top / Front / Right, at the Z depth)', function () { frameNewPlaneFromView(); }],
      ['search', 'Find a plane by name', function () { var b = $('mc-planes'); if (b) frameFind(b); }],
      ['back', 'Reset: Top as the graphics view, WCS, construction and tool plane', function () { framePlaneSet('g', 'Top'); framePlaneSet('wcs', 'Top'); framePlaneSet('c', 'Top'); framePlaneSet('t', 'Top'); }]],
    levels: [],   // the Levels manager's own tool row (new, all on, all off, level sets) is in its pane (ui-levels.js)
    config: [],   // the ConfigurationManager's buttons (Add, Rename, Delete, Show, Design Table) are in its pane
    recent: [['cancel', 'Clear the list', function () { frameRecent = []; frameRecentRender(); }]]
  };
  function mgrTitle(n) { return (frame && frame.managers && frame.managers.titles && frame.managers.titles[n]) || n; }
  function mgrBuild() {
    var left = $('left');
    if (!left || $('mc-mgr-head')) return;
    var head = el('div', { id: 'mc-mgr-head' });
    head.appendChild(el('div', { class: 'mc-mgr-titlebar', html: '<span class="mc-mgr-title"></span>' }));
    head.firstChild.appendChild(el('button', { class: 'mc-mgr-close', title: 'Close the manager panel (the pull tab on the graphics area brings it back)', 'aria-label': 'Close the manager panel', text: '✕', onclick: function () { UI.setFeatureManagerHidden(true); } }));
    head.appendChild(el('div', { class: 'mc-mgr-tools', role: 'toolbar' }));
    left.insertBefore(head, left.firstChild);
    var pmEl = $('pm');
    ['mc-solids', 'mc-planes', 'mc-recent'].forEach(function (id) { var d = el('div', { id: id, class: 'mc-mgr-pane' }); d.hidden = true; left.insertBefore(d, pmEl); });
    var tabs = el('div', { id: 'mc-mgr-tabs', role: 'tablist', 'aria-label': 'Managers' });
    (frame.managers.tabs || []).forEach(function (n) {
      tabs.appendChild(el('button', { role: 'tab', 'data-mgr': n, text: mgrTitle(n), onclick: function () { frameShowManager(n, true); } }));
    });
    left.appendChild(tabs);
    $('mc-planes').addEventListener('click', framePlanesClick);
    $('mc-planes').addEventListener('change', function (e) {   // lane mcpolish: the selected plane's comment
      var t = e.target; if (!t.classList || !t.classList.contains('mc-pl-comment')) return;
      var n = t.closest('.mc-pl-lower').getAttribute('data-plane'); planeInfo.comments[n] = t.value;
    });
    $('mc-planes').addEventListener('keydown', function (e) { if (e.target && e.target.classList && e.target.classList.contains('mc-pl-comment')) e.stopPropagation(); });
    framePmObs = new MutationObserver(framePmDecorate);
    framePmObs.observe(pmEl, { childList: true });
  }
  function mgrTeardown() {
    ['mc-mgr-head', 'mc-solids', 'mc-planes', 'mc-recent', 'mc-mgr-tabs'].forEach(function (id) { var e = $(id); if (e) e.remove(); });
    if (framePmObs) { framePmObs.disconnect(); framePmObs = null; }
    var t = document.querySelector('#pm .mc-fn-title'); if (t) t.remove();
    var pmEl = $('pm'); if (pmEl) { pmEl._mcTitle = null; pmEl._mcAt = 0; }
    $('left').classList.remove('mc-fn');
  }
  // the manager shown (or the function panel while a PropertyManager is open); `user`: picked by a click
  // lane mcpolish: the ConfigurationManager's tab shows while the document has configurations (a part with any, an
  // assembly always: its Default and exploded views); the drawing has none
  function frameHasConfigs() {
    if (UI.drawingActive && UI.drawingActive()) return false;
    if (isAsm()) return !!UI.asmConfigPanel;
    return cfgList().length > 0;
  }
  function frameShowManager(name, user) {
    if (!frameMgrOn()) return;
    if (name && (frame.managers.tabs || []).indexOf(name) >= 0) frameMgr = name;
    var hasCfg = frameHasConfigs();
    if (frameMgr === 'config' && !hasCfg) frameMgr = 'solids';
    var left = $('left'), pmOpen = !$('pm').hidden;
    frameDoc = docTypeNow();
    if (user && pmOpen) { toast('Finish or cancel the active function first (OK or Cancel).'); }
    left.classList.toggle('mc-fn', pmOpen);
    if (!pmOpen) { $('pm')._mcTitle = null; $('pm')._mcAt = 0; }
    var part = !isAsm() && !(UI.drawingActive && UI.drawingActive());
    var showTree = !pmOpen && (frameMgr === 'solids' && !part);
    $('fm-tree').hidden = !showTree;
    var cfgBtn = document.querySelector('#mc-mgr-tabs [data-mgr="config"]'); if (cfgBtn) cfgBtn.hidden = !hasCfg;
    var cp = $('config-panel');
    if (cp) { var showCfg = !pmOpen && frameMgr === 'config'; cp.hidden = !showCfg; if (showCfg) refreshConfigPanel(); }
    var lp = $('levels-panel'); if (lp) lp.hidden = pmOpen || frameMgr !== 'levels';
    ['solids', 'planes', 'recent'].forEach(function (n) { var d = $('mc-' + n); if (d) d.hidden = pmOpen || frameMgr !== n || (n === 'solids' && !part); });
    App.fmTab = pmOpen ? 'pm' : frameMgr === 'levels' ? 'levels' : frameMgr === 'config' ? 'config' : 'tree';
    levelsSticky = frameMgr === 'levels';
    Array.prototype.forEach.call(document.querySelectorAll('#mc-mgr-tabs [data-mgr]'), function (b) { var on = b.getAttribute('data-mgr') === frameMgr; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    var t = document.querySelector('#mc-mgr-head .mc-mgr-title'); if (t && t.textContent !== mgrTitle(frameMgr)) t.textContent = mgrTitle(frameMgr);
    var tools = document.querySelector('#mc-mgr-head .mc-mgr-tools');
    if (tools && tools.getAttribute('data-mgr') !== frameMgr) {
      tools.setAttribute('data-mgr', frameMgr); tools.innerHTML = '';
      (MGR_TOOLS[frameMgr] || []).forEach(function (d) { var b = el('button', { class: 'mc-tool', 'aria-label': d[1], html: Icons(d[3] && Icons.has(d[3]) ? d[3] : d[0], 16), onclick: d[2] }); setTip(b, { name: d[1] }); tools.appendChild(b); });
    }
    if (frameMgr === 'levels' && !pmOpen && UI.refreshLevelsPanel) UI.refreshLevelsPanel();
    if (frameMgr === 'solids') frameSolidsRender();
    if (frameMgr === 'planes') framePlanesRender();
    if (frameMgr === 'recent') frameRecentRender();
    if (pmOpen) framePmDecorate();
    syncViewTab();
    if (ribbonBuilt) Array.prototype.forEach.call($('ribbon-buttons').querySelectorAll('.rb'), function (b) { if (b._sync) b._sync(); });
  }
  // Solids: the solid, then its operations in order (a sketch under the operation that uses it)
  function frameSolidsRender() {
    var box = $('mc-solids');
    if (!box || box.hidden) return;
    var m = App.model, feats = (m && m.features) || [], used = {};
    feats.forEach(function (f) { if (f.sketch != null) used[f.sketch] = f.id; (f.sketches || []).forEach(function (s) { used[s] = f.id; }); });
    var errs = (App.build && App.build.errors) || {};
    var sig = JSON.stringify([m && m.name, feats.map(function (f) { return [f.id, f.name, f.type, !!f.suppressed, !!errs[f.id]]; }), App.sel && App.sel.kind === 'feature' ? App.sel.id : null, App.build && App.build.bodies ? App.build.bodies.length : 0]);
    if (box._sig === sig) return;
    box._sig = sig;
    box.innerHTML = '';
    var nb = App.build && App.build.bodies ? App.build.bodies.length : 1;
    box.appendChild(el('div', { class: 'mc-sol-row mc-sol-body', html: Icons('body', 16) + '<span>Solid' + (nb > 1 ? 's (' + nb + ')' : '') + ' — ' + escHtml(m.name || '') + '</span>' }));
    function row(f, depth) {
      var sel = App.sel && App.sel.kind === 'feature' && App.sel.id === f.id;
      var r = el('div', { class: 'mc-sol-row' + (sel ? ' selected' : '') + (errs[f.id] ? ' err' : '') + (f.suppressed ? ' suppressed' : ''), 'data-fid': String(f.id), style: 'padding-left:' + (8 + depth * 18) + 'px', title: featureTitle(f) });
      r.innerHTML = Icons(errs[f.id] ? 'error' : featureIcon(f), 16) + '<span>' + escHtml(f.name) + '</span>';
      r.addEventListener('click', function () { App.sel = { kind: 'feature', id: f.id }; App.sel2 = null; UI.updateHighlights(); UI.updateSketches(); refreshTree(); if (UI.onSelectionChanged) UI.onSelectionChanged(); setStatus(f.name); });
      r.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.editFeature(f); });
      r.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); App.sel = { kind: 'feature', id: f.id }; UI.updateHighlights(); refreshTree(); showMenu(e.clientX, e.clientY, featureMenu(f)); });
      box.appendChild(r);
    }
    feats.forEach(function (f) {
      if (f.type === 'sketch' && used[f.id] != null) return;
      if (f.type === 'plane') return;   // planes: the Planes manager
      row(f, 1);
      if (f.sketch != null) { var s = K.findFeature(m, f.sketch); if (s) row(s, 2); }
      (f.sketches || []).forEach(function (id) { var s2 = K.findFeature(m, id); if (s2) row(s2, 2); });
    });
  }
  // Planes: Top … Isometric and every reference plane; G sets the graphics view, WCS / C / T mark the plane
  var STD_PLANE_ROWS = ['Top', 'Front', 'Right', 'Back', 'Bottom', 'Left', 'Isometric'];
  function framePlaneRows() {
    var rows = STD_PLANE_ROWS.slice();
    ((App.model && App.model.features) || []).forEach(function (f) { if (f.type === 'plane' && !isAsm()) rows.push(f.name); });
    return rows;
  }
  function framePlaneOf(name) {
    var base = { Back: 'Front', Bottom: 'Top', Left: 'Right', Isometric: 'Top' }[name] || name;
    if (STD_PLANE_ROWS.indexOf(name) >= 0) return K.makePlane(base, 0);
    var f = ((App.model && App.model.features) || []).filter(function (x) { return x.type === 'plane' && x.name === name; })[0];
    var pl = f && App.build && App.build.planes ? App.build.planes[f.id] : null;
    return pl || K.makePlane('Top', 0);
  }
  function frameCplane() { return UI.cplaneLabel ? (UI.cplaneLabel() || framePlanes.c) : framePlanes.c; }   // lane mcdirect2: by name (a plane feature's id reads as its name)
  function framePlaneSet(col, name) {
    if (col === 'g') {
      if (STD_PLANE_ROWS.indexOf(name) >= 0) UI.setView(name);
      else UI.viewNormalTo(framePlaneOf(name));
    } else if (col === 'c' && UI.setCplane) { UI.setCplane(name); }   // lane mcdirect's construction plane (ui-core.js)
    framePlanes[col] = name;
    framePlanesRender(true); frameStatusSync();
  }
  function framePlanesRender(force) {
    var box = $('mc-planes');
    if (!box || box.hidden) return;
    framePlanes.c = frameCplane();
    var q = planeInfo.find.trim().toLowerCase();
    var rows = framePlaneRows().filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; }), sig = JSON.stringify([rows, framePlanes, planeInfo.sel, q]);
    if (!force && box._sig === sig) return;
    box._sig = sig;
    var findEl = box.querySelector('.mc-find'), hadFocus = findEl && document.activeElement === findEl;
    var cols = [['g', 'G', 'Graphics view: click to look at the model along this plane'], ['wcs', 'WCS', 'Work coordinate system'], ['c', 'C', 'Construction plane: wireframe is drawn on it'], ['t', 'T', 'Tool plane']];
    box.innerHTML = '<table class="mc-planes" role="grid" aria-label="Planes"><thead><tr><th></th><th>Name</th>' + cols.map(function (c) { return '<th title="' + c[2] + '">' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (n) {
        var cur = framePlanes.c === n;
        return '<tr class="' + (cur ? 'current' : '') + (planeInfo.sel === n ? ' picked' : '') + '" data-plane="' + escHtml(n) + '"><td class="mc-pl-chk">' + (cur ? '✓' : '') + '</td><td class="mc-pl-name">' + escHtml(n) + '</td>' +
          cols.map(function (c) { return '<td class="mc-pl-cell" data-col="' + c[0] + '" title="' + c[2] + '">' + (framePlanes[c[0]] === n ? c[1] : '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      '<p class="mc-pl-note">' + (UI.setCplane ? 'C sets the construction plane the wireframe tools draw on.' : 'C and T mark the plane only: this build has no construction-plane drawing yet.') + ' G sets the graphics view.</p>' +
      planesLowerHtml();
    if (findEl) { box.insertBefore(findEl, box.firstChild); if (hadFocus) findEl.focus(); }
  }
  function framePlanesClick(e) {
    var td = e.target.closest && e.target.closest('td'), tr = td && td.closest('tr[data-plane]');
    if (!tr) return;
    var name = tr.getAttribute('data-plane'), col = td.getAttribute('data-col') || 'g';
    planeInfo.sel = name;   // lane mcpolish: the lower part shows the row clicked last
    framePlaneSet(col, name);
  }
  function frameRecentRender() {
    var box = $('mc-recent');
    if (!box || box.hidden) return;
    box.innerHTML = '';
    if (!frameRecent.length) { box.appendChild(el('p', { class: 'mc-pl-note', text: 'The functions you run from the ribbon are listed here, newest first. Click one to run it again.' })); return; }
    frameRecent.forEach(function (r) {
      var b = el('button', { class: 'mc-recent-row', 'data-cmd': r.cmd, html: Icons(r.icon, 16) + '<span>' + escHtml(r.label) + '</span>' });
      b.addEventListener('click', function () { runItem(r.item); refreshRibbon(); });
      box.appendChild(b);
    });
  }
  // the function panel: an open PropertyManager titled with the Mastercam function's name
  function framePmDecorate() {
    var pmEl = $('pm');
    if (!frameMgrOn() || !pmEl || pmEl.hidden) return;
    var head = pmEl.querySelector('.pm-head');
    if (!head) return;
    if (frameLastRun && Date.now() - frameLastRun.t < 3000 && frameLastRun.t > (pmEl._mcAt || 0)) { pmEl._mcTitle = frameLastRun.title; pmEl._mcAt = frameLastRun.t; }
    if (!pmEl._mcTitle) { pmEl._mcTitle = UI.pmTitle ? UI.pmTitle() : ''; pmEl._mcAt = Date.now(); }
    var span = head.querySelector('.mc-fn-title');
    if (!span) { span = el('span', { class: 'mc-fn-title' }); head.insertBefore(span, head.firstChild); }
    if (span.textContent !== pmEl._mcTitle) span.textContent = pmEl._mcTitle;
    if (!$('left').classList.contains('mc-fn')) $('left').classList.add('mc-fn');
  }
  UI.frameFunctionTitle = function () { var s = document.querySelector('#pm:not([hidden]) .mc-fn-title'); return s ? s.textContent : null; };

  // ---- the status bar
  var FRAME_STYLES = [['wireframe', 'dsWireframe', 'Wireframe'], ['hlr', 'dsHLR', 'Hidden lines removed'], ['shaded', 'dsShaded', 'Shaded'], ['shadedEdges', 'dsShadedEdges', 'Shaded with edges (Outline Shaded)'], ['material', 'dsMaterial', 'Material (shaded with the material, RealView)']];   // lane mcpolish: Material
  var frameXYZ = [0, 0, 0];
  function frameStatusBuild() {
    var bar = $('statusbar');
    if (!bar || $('mc-status')) return;
    var box = el('div', { id: 'mc-status' });
    (frame.status || []).forEach(function (k) {
      if (k === 'section') box.appendChild(el('button', { class: 'mc-st', 'data-mc': 'section', title: 'Section View: click to turn it on or off', onclick: function () { UI.cmdSection(); setTimeout(frameStatusSync, 0); } }));
      else if (k === 'selected') box.appendChild(el('span', { class: 'mc-st', 'data-mc': 'selected' }));
      else if (k === 'mode') box.appendChild(el('button', { class: 'mc-st mc-mode', 'data-mc': 'mode', title: '3D / 2D: click to switch. 2D draws wireframe flat on the construction plane at its Z depth (Home ▸ Organize ▸ Z)', onclick: function () { FRAME_ACTIONS.mode3d.run(); frameStatusSync(); } }));   // lane mcpolish
      else if (k === 'xyz') ['x', 'y', 'z'].forEach(function (a) { box.appendChild(el('span', { class: 'mc-st mc-xyz', 'data-mc': a })); });
      else if (k === 'cplane') box.appendChild(el('button', { class: 'mc-st', 'data-mc': 'cplane', title: 'Construction plane: click for the list', onclick: function (e) { var r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.top - 4, framePlaneRows().map(function (n) { return { label: n, checked: frameCplane() === n, action: function () { framePlaneSet('c', n); } }; })); } }));
      else if (k === 'tplane' || k === 'wcs') box.appendChild(el('span', { class: 'mc-st', 'data-mc': k, title: k === 'wcs' ? 'Work coordinate system (Planes manager, WCS column)' : 'Tool plane (Planes manager, T column)' }));
      else if (k === 'styles') {
        var g = el('span', { class: 'mc-styles', 'data-mc': 'styles' });
        FRAME_STYLES.forEach(function (s) { var b = el('button', { class: 'mc-style', 'data-style': s[0], 'aria-label': s[2], html: Icons(s[1], 16), onclick: function () { if (s[0] === 'material') frameMaterial(); else { if (frameMaterialOn() && UI.setRealView) UI.setRealView(false); setStyle(s[0]); } frameStatusSync(); } }); setTip(b, { name: s[2] }); g.appendChild(b); });
        box.appendChild(g);
      }
    });
    bar.insertBefore(box, $('status-right'));
    $('viewport').addEventListener('mousemove', frameMouse, { passive: true });
    frameStatusSync();
  }
  function frameStatusTeardown() {
    var dw = $('dw-status'), bar = $('statusbar');   // lane mcpolish: the drawing's items back where drawing-ui.js puts them
    if (dw && bar && dw.parentNode && dw.parentNode.id === 'mc-status') { dw.classList.remove('mc-st'); bar.insertBefore(dw, $('status-right')); }
    var b = $('mc-status'); if (b) b.remove(); var v = $('viewport'); if (v) v.removeEventListener('mousemove', frameMouse);
    var vs = $('mc-viewsheets'); if (vs) vs.remove(); if (v) v.classList.remove('mc-vs-on');
  }
  var frameMouseRaf = 0, frameMouseAt = null;
  function frameMouse(e) {
    frameMouseAt = e;
    if (frameMouseRaf) return;
    frameMouseRaf = requestAnimationFrame(function () {
      frameMouseRaf = 0;
      if (!frame || !frameMouseAt) return;
      var r = $('viewport').getBoundingClientRect(), pl = framePlaneOf(frameCplane()), uv = null;
      try { uv = UI.screenToPlane(frameMouseAt.clientX - r.left, frameMouseAt.clientY - r.top, pl); } catch (er) { uv = null; }
      if (uv) frameXYZ = K.to3D(pl, uv[0], uv[1]);
      frameStatusSync();
    });
  }
  function frameSet(k, html) { var e = document.querySelector('#mc-status [data-mc="' + k + '"]'); if (e && e._h !== html) { e.innerHTML = html; e._h = html; } }
  function frameStatusSync() {
    if (!frame || !$('mc-status')) return;
    var n = UI.selection ? UI.selection().length : App.sel ? 1 : 0;
    frameSet('section', 'SECTION VIEW: <b>' + (App.view.section ? 'ON' : 'OFF') + '</b>');
    frameSet('selected', 'SELECTED ENTITIES: <b>' + n + '</b>');
    ['x', 'y', 'z'].forEach(function (a, i) { frameSet(a, a.toUpperCase() + ': <b>' + (Math.abs(frameXYZ[i]) < 5e-6 ? 0 : frameXYZ[i]).toFixed(5) + '</b>'); });
    frameSet('cplane', 'CPLANE: <b>' + escHtml(frameCplane()) + '</b>');
    frameSet('tplane', 'TPLANE: <b>' + escHtml(framePlanes.t) + '</b>');
    frameSet('wcs', 'WCS: <b>' + escHtml(framePlanes.wcs) + '</b>');
    frameSet('mode', '<b>' + (UI.cplaneMode ? UI.cplaneMode() : '3D') + '</b>');   // lane mcpolish
    var mat = frameMaterialOn();
    Array.prototype.forEach.call(document.querySelectorAll('#mc-status .mc-style'), function (b) { var s = b.getAttribute('data-style'), on = s === 'material' ? mat : !mat && App.view.style === s; if (b.classList.contains('active') !== on) b.classList.toggle('active', on); });
    // lane mcpolish: a drawing's own status items (Editing Sheet1, scale, units: drawing-ui.js #dw-status) go into the bar
    var dw = $('dw-status'), box = $('mc-status');
    if (dw && box && dw.parentNode !== box) { dw.classList.add('mc-st'); box.insertBefore(dw, box.firstChild); }
    vsRender();
  }
  UI.frameStatus = function () { var o = {}; Array.prototype.forEach.call(document.querySelectorAll('#mc-status [data-mc]'), function (e) { o[e.getAttribute('data-mc')] = e.textContent; }); return o; };

  // ---- group captions under every group (any tab, any document type)
  function frameCaptionsSoon() { if (!frameCapFrame) frameCapFrame = requestAnimationFrame(function () { frameCapFrame = 0; frameCaptions(); }); }
  function frameCaptions() {
    var rib = $('ribbon'), bar = $('ribbon-buttons'), layer = rib && rib.querySelector(':scope > .mc-captions');
    if (!frameRibbon('captions') || !ribbonBuilt) { if (layer) layer.remove(); return; }
    if (!layer) { layer = el('div', { class: 'mc-captions', 'aria-hidden': 'true' }); rib.insertBefore(layer, bar.nextSibling); }
    var items = ribbonBuilt.items, kids = Array.prototype.filter.call(bar.children, function (c) { return !c.classList.contains('rb-more') && !c.classList.contains('mc-colbtn'); });   // lane mcribbon: a collapsed group's button stands for its nodes
    // the bar is between two builds: look again on the next frames (a few times), so no tab is left without captions
    if (kids.length !== items.length || !bar.getBoundingClientRect().width) { if ((frameCaptions.retry = (frameCaptions.retry || 0) + 1) < 30) frameCaptionsSoon(); return; }
    frameCaptions.retry = 0;
    var rr = rib.getBoundingClientRect(), br = bar.getBoundingClientRect(), groups = [], cur = null;
    items.forEach(function (it, i) {
      if (it.sep || !it.group) { cur = null; return; }
      var n = kids[i]; if (n.classList.contains('mc-col') && n._mcCol) n = n._mcCol;   // lane mcribbon
      var r = n.getBoundingClientRect();
      if (n.classList.contains('rb-over') || !r.width) return;
      if (!cur || cur.name !== it.group) { cur = { name: it.group, l: r.left, r: r.right }; groups.push(cur); }
      cur.l = Math.min(cur.l, r.left); cur.r = Math.max(cur.r, r.right);
    });
    var prevR = -Infinity;
    groups.forEach(function (g, k) {
      var need = String(g.name).length * 6 + 10, w = g.r - g.l;
      if (w >= need) { prevR = g.r; return; }
      var nextL = k + 1 < groups.length ? groups[k + 1].l : rr.right, l = (g.l + g.r) / 2 - need / 2;
      l = Math.max(prevR + 2, Math.min(nextL - 2 - need, l));
      g.l = l; g.r = l + need; prevR = g.r;
    });
    var html = groups.map(function (g) { return '<span class="mc-caption" style="left:' + Math.round(g.l - rr.left) + 'px;width:' + Math.round(g.r - g.l) + 'px">' + escHtml(g.name) + '</span>'; }).join('');
    var capOff = parseFloat(window.getComputedStyle(layer).getPropertyValue('--mc-cap-off')) || 15;   // lane mcribbon: style.css sets the caption's place
    layer.style.top = Math.round(br.bottom - rr.top - capOff) + 'px';
    if (layer._html !== html) { layer.innerHTML = html; layer._html = html; }
  }
  UI.frameCaptions = function () { frameCaptions(); var l = document.querySelector('#ribbon > .mc-captions'); return l ? Array.prototype.map.call(l.children, function (c) { return c.textContent; }) : []; };
  // the File tab at the head of the tab row (refreshRibbon puts it back when the tab strip is rebuilt)
  function frameFileTab() {
    var tabs = $('ribbon-tabs'), fb = $('mc-file');
    if (!frameRibbon('fileTab')) { if (fb) fb.remove(); if ($('mc-tabtools')) $('mc-tabtools').remove(); return; }
    if (!fb) { fb = el('button', { id: 'mc-file', class: 'mc-file', text: 'File', 'aria-haspopup': 'dialog', onclick: function () { if (bs) bsClose(); else bsOpen('info'); } }); setTip(fb, { name: 'File', desc: 'Info, New, Open, Save, Save As, Convert / Export, Print, Recent, Options (Configuration), Help' }); }
    if (tabs.firstChild !== fb) tabs.insertBefore(fb, tabs.firstChild);
    frameTabTools(tabs);
  }
  // lane mctheme: Mastercam's small buttons at the right end of the tab row: Options (File ▸ Options) and Help. Like
  // #mc-file it has no .rtab, so the tab lists do not see it; removed with the File tab on teardown.
  function frameTabTools(tabs) {
    var tt = $('mc-tabtools');
    if (!tt) {
      tt = el('div', { id: 'mc-tabtools', role: 'toolbar', 'aria-label': 'Options and Help' });
      var ico = function (name, fb) { return window.Icons && (!Icons.has || Icons.has(name)) ? Icons(name, 16) : fb; };
      var help = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6.1 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.7.6-.7 1.1v.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="11.6" r=".85" fill="currentColor"/></svg>';
      var ob = el('button', { class: 'mc-tt', 'data-tt': 'options', 'aria-label': 'Options', html: ico('options', ''), onclick: function () { if (bs && bs.page === 'options') bsClose(); else bsOpen('options'); } });
      var hb = el('button', { class: 'mc-tt', 'data-tt': 'help', 'aria-label': 'Help', html: ico('help', help), onclick: function () { bsOpen('help'); } });
      setTip(ob, { name: 'Options', desc: 'File ▸ Options: interface profile, units, image quality, dimensions, OpenCascade, sheet metal' });
      setTip(hb, { name: 'Help', desc: 'File ▸ Help' });
      tt.appendChild(ob); tt.appendChild(hb);
    }
    if (tabs.lastChild !== tt) tabs.appendChild(tt);
  }

  // ---- UI.setFrame(frame | null)
  var FRAME_CLASSES = ['mc-tabs-top', 'mc-qat', 'mc-no-menubar', 'mc-managers', 'mc-status', 'mc-ribbon-caps'];
  function frameThemeVars(on) {
    var root = document.documentElement, th = on && frame.theme;
    var old = root._mcVars || [];
    old.forEach(function (k) { root.style.removeProperty(k); });
    root._mcVars = [];
    if (th && th.name) root.setAttribute('data-profile', th.name); else root.removeAttribute('data-profile');
    if (th && th.vars) ['light', 'dark'].forEach(function (mode) {
      var v = th.vars[mode] || {};
      Object.keys(v).forEach(function (k) { var n = k.replace(/^--mc-/, '--mc-' + mode.charAt(0) + '-'); root.style.setProperty(n, v[k]); root._mcVars.push(n); });
    });
    if (!root.getAttribute('style')) root.removeAttribute('style');
  }
  UI.setFrame = function (f) {
    var was = frame;
    if (!was && !f) return null;
    // tear the old frame down completely first (switching between two framed profiles rebuilds it)
    if (was) {
      bsClose();
      if (UI.closeMenus) closeMenus();
      mgrTeardown(); frameStatusTeardown();
      var fb = $('mc-file'); if (fb) fb.remove();
      var tt = $('mc-tabtools'); if (tt) tt.remove();   // lane mctheme
      var cl =document.querySelector('#ribbon > .mc-captions'); if (cl) cl.remove();
      if (frameCapObs) { frameCapObs.disconnect(); frameCapObs = null; }
      FRAME_CLASSES.forEach(function (c) { $('app').classList.remove(c); });
      frame = null;
      frameThemeVars(false);
      // back to SolidWorks' FeatureManager tabs: the tree (or the PropertyManager still open)
      var lp = $('levels-panel'); if (lp && App.fmTab !== 'levels') lp.hidden = true;
      if ($('pm').hidden) { levelsSticky = App.fmTab === 'levels'; setFmTab(App.fmTab === 'levels' ? 'levels' : 'tree'); }
      else { $('fm-tree').hidden = true; setFmTab('pm'); }
    }
    frame = f || null;
    try { chromeIconsSync(); } catch (e) { console.warn('chromeIconsSync', e); }   // lane swribbon: the chrome icons' size follows the frame
    if (frame) {
      var app = $('app'), r = frame.ribbon || {};
      app.classList.toggle('mc-tabs-top', !!r.tabsOnTop);
      app.classList.toggle('mc-qat', !!r.qat);
      app.classList.toggle('mc-ribbon-caps', !!r.captions);
      app.classList.toggle('mc-no-menubar', frame.menubar === false);
      if (r.captions && window.MutationObserver) { frameCapObs = new MutationObserver(frameCaptionsSoon); frameCapObs.observe($('ribbon-buttons'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
      frameThemeVars(true);
      if (frame.managers) {
        app.classList.add('mc-managers');
        mgrBuild();
        frameMgr = App.fmTab === 'levels' ? 'levels' : (frame.managers.tabs || ['solids'])[0];
        frameShowManager(frameMgr);
      }
      if (frame.status) { app.classList.add('mc-status'); frameStatusBuild(); }
      vsRender();   // lane mcpolish: viewsheets
      var dm = document.activeElement; if (dm && dm.closest && dm.closest('#menus')) dm.blur();
    }
    UI.profileRibbonReset();
    if (UI.fitWorkspace) UI.fitWorkspace();
    if (UI.resize) setTimeout(UI.resize, 0);
    return frame;
  };
  // lane mcpolish: the profile's window frame (was UI.frame, which is ui-core.js's render loop again)
  UI.frameDef = function () { return frame; };
  var frameSoonRaf = 0;
  function frameSoon() { if (!frameSoonRaf) frameSoonRaf = requestAnimationFrame(function () { frameSoonRaf = 0; if (!frame) return; if (frameMgrOn() && frameDoc !== docTypeNow()) frameShowManager(null); else if (frameMgrOn()) { var cb = document.querySelector('#mc-mgr-tabs [data-mgr="config"]'); if (cb && cb.hidden !== !frameHasConfigs()) frameShowManager(null); } frameSolidsRender(); framePlanesRender(); frameStatusSync(); }); }
  ['mouseup', 'keyup'].forEach(function (t) { document.addEventListener(t, function () { if (frame) frameSoon(); }, true); });
  window.addEventListener('resize', function () { if (frame) frameCaptionsSoon(); });
  UI.frameManager = function (name) { if (name) frameShowManager(name, true); return frameMgrOn() ? frameMgr : null; };
  UI.framePlanes = function () { return { g: framePlanes.g, wcs: framePlanes.wcs, c: frameCplane(), t: framePlanes.t }; };
  UI.frameRecent = function () { return frameRecent.map(function (r) { return r.cmd; }); };
  if (UI.onCplane) { try { UI.onCplane(function () { framePlanesRender(true); frameStatusSync(); }); } catch (e) { } }   // lane mcdirect

  // ---- lane mcpolish: frame actions. Mastercam commands Anvil gained that are not SolidWorks ribbon commands: a
  // profile places one as { fn: 'action', arg: name } (label, icon and help come from here); the SolidWorks menus run the
  // same functions where SolidWorks has a row for them (partMenus). Each either changes state (active()) or opens a
  // dialog / menu, or says why it cannot run now.
  function selEntities() { return (UI.selection ? UI.selection() : []).filter(function (s) { return s && s.kind === 'entity'; }); }
  function sketchCut() {
    if (App.mode !== 'sketch' || !UI.sketchCopy) { toast('Cut: open a sketch and select entities first.'); return; }
    if (!selEntities().length) { toast('Cut: select sketch entities first.'); return; }
    UI.sketchCopy(); UI.deleteSelection();
    setStatus('Cut: the entities are on the clipboard (Paste puts them back).');
  }
  function numPrompt(title, msg, val, fn) {
    promptDialog(title, msg, String(val), function (t) {
      var v = UI.parseLength ? UI.parseLength(t) : parseFloat(t);
      if (v == null || !isFinite(v)) { v = parseFloat(t); }
      if (!isFinite(v)) { toast(title + ': "' + t + '" is not a number.'); return; }
      fn(v);
    });
  }
  function fmtZ(z) { return UI.fmtNum ? UI.fmtNum(z, 4) : String(z); }
  var FRAME_ACTIONS = {
    cut: { label: 'Cut', icon: 'cutEnt', help: 'Cut the selected sketch entities to the clipboard (in a sketch)', run: sketchCut },
    copyImage: { label: 'Copy Image', icon: 'copyImage', help: 'Copy the graphics window to the clipboard as an image', run: function () { UI.copyImage(); } },
    undelete: { label: 'Undelete\nEntity', icon: 'undeleteEnt', help: 'Bring back the sketch entities deleted last (again for the ones before)', run: function () { UI.undeleteEntities(); } },
    zDepth: { label: function () { return 'Z: ' + fmtZ(UI.cplaneZ ? UI.cplaneZ() : 0); }, icon: 'zDepth', help: 'Z depth of the construction plane: 2D wireframe is drawn at this depth (click to type it)',
      run: function () { numPrompt('Z Depth', 'Depth of the construction plane (' + (UI.cplaneLabel ? UI.cplaneLabel() : 'Top') + ') for 2D wireframe:', UI.cplaneZ(), function (v) { UI.setCplaneZ(v); setStatus('Z depth ' + fmtZ(v) + ': wireframe is drawn flat on ' + UI.cplaneLabel() + ' at that depth (2D).'); refreshRibbon(); }); } },
    level: { label: function () { return 'Level: ' + (UI.levels && UI.levels.main ? UI.levels.main() || 1 : 1); }, icon: 'levels', swIcon: 'levelMain', help: 'The main level new wireframe goes on (click to type a number; a new number makes the level)',
      run: function () { if (!UI.levels || isAsm()) { toast('Levels belong to part documents.'); return; } numPrompt('Main Level', 'Level number new entities go on:', UI.levels.main() || 1, function (v) { var r = UI.levels.op('makeMain', Math.round(v)); if (r && !r.ok && r.error) toast(r.error); refreshRibbon(); }); } },
    mode3d: { label: function () { return UI.cplaneMode && UI.cplaneMode() === '2D' ? '2D' : '3D'; }, icon: 'mode3d', help: '3D / 2D: 2D draws wireframe flat on the construction plane at its Z depth; 3D does not use the Z depth',
      run: function () { var m = UI.cplaneMode() === '2D' ? '3D' : '2D'; UI.setCplaneMode(m); setStatus(m === '2D' ? '2D: wireframe is drawn on ' + UI.cplaneLabel() + ' at Z ' + fmtZ(UI.cplaneZ()) + '.' : '3D: the Z depth is not used.'); refreshRibbon(); }, active: function () { return !!UI.cplaneMode && UI.cplaneMode() === '2D'; } },
    blank: { label: 'Blank', icon: 'blankEnt', help: 'Hide the selected entities or bodies (Unblank shows them again)', run: function () { UI.blankSelection(); } },
    unblank: { label: 'Unblank', icon: 'unblankEnt', help: 'Show every blanked entity and body again', run: function () { UI.unblank(); } },
    hideUnhide: { label: 'Hide/Unhide', icon: 'hideUnhide', help: 'Show only the selection; click again to show everything', run: function () { UI.hideUnhide(); }, active: function () { return !!(UI.hideUnhideOn && UI.hideUnhideOn()); } },
    unzoom50: { label: 'Unzoom 50%', icon: 'unzoom50', help: 'Zoom out: the model shows at half its size', run: function () { UI.unzoom(0.5); } },
    unzoom80: { label: 'Unzoom 80%', icon: 'unzoom80', help: 'Zoom out: the model shows at 80 % of its size', run: function () { UI.unzoom(0.8); } },
    translucency: { label: 'Translucency', icon: 'translucency', help: 'Make the whole model see-through (click again for solid)', run: function () { UI.translucency(!UI.translucency()); }, active: function () { return !!UI.translucency(); } },
    material: { label: 'Material', icon: 'dsMaterial', help: 'Shade the model with its material (RealView); click again for plain shading', run: function () { frameMaterial(); }, active: function () { return frameMaterialOn(); } },
    showAxes: { label: 'Show Axes', icon: 'worldAxes', help: 'Show the X, Y and Z axes through the origin', run: function () { UI.showWorldAxes(!UI.showWorldAxes()); }, active: function () { return !!UI.showWorldAxes(); } },
    showGnomons: { label: 'Show Gnomons', icon: 'gnomon', help: 'Show the axis gnomon and the view names in the graphics window', run: function () { UI.showGnomons(!UI.showGnomons()); }, active: function () { return !!UI.showGnomons(); } },
    showGrid: { label: 'Show\nGrid', icon: 'vGrid', help: 'Show the grid on the plane you draw on (snapping is Snap to Grid)', run: function () { UI.gridShown(!UI.gridShown()); }, active: function () { return !!UI.gridShown(); } },
    snapGrid: { label: 'Snap to Grid', icon: 'snapGrid', help: 'Points you draw snap to the grid', run: function () { UI.gridSnap(!UI.gridSnap()); }, active: function () { return !!UI.gridSnap(); } },
    vsOnOff: { label: 'On/Off', icon: 'viewsheetOn', help: 'Show or hide the viewsheet tabs under the graphics window', run: function () { vsShow(!vsState.on); }, active: function () { return !!vsState.on; } },
    vsNew: { label: 'New', icon: 'viewsheetNew', help: 'A new viewsheet with the current view, construction plane and levels', run: function () { vsAdd(); } },
    vsSave: { label: 'Save Bookmark', icon: 'bookmarkSave', help: 'Keep the current view, plane and levels as the active viewsheet’s bookmark', run: function () { vsBookmark(true); } },
    vsRestore: { label: 'Restore Bookmark', icon: 'bookmarkRestore', help: 'Go back to the active viewsheet’s bookmark', run: function () { vsBookmark(false); } }
  };
  function frameActionItem(name, x, group) {
    var a = FRAME_ACTIONS[name], it = { id: (x && x.icon) || (a && a.icon) || 'generic', icon: (x && x.icon) || (a && a.icon) || 'generic', cmd: 'action:' + name, help: (x && x.help) || (a && a.help) || '', noKey: true, swIcon: a && a.swIcon };   // rfNG: swIcon = its own picture when the set draws it (Level: levelMain)
    if (group) it.group = group;
    if (!a) { it.label = (x && x.label) || name; return it; }
    if (x && x.label) it.label = x.label;
    else if (typeof a.label === 'function') Object.defineProperty(it, 'label', { get: a.label, enumerable: true });
    else it.label = a.label;
    it.run = a.run;
    if (a.active) it.active = a.active;
    return it;
  }
  UI.frameActions = function () { return Object.keys(FRAME_ACTIONS); };
  UI.frameAction = function (name) { var a = FRAME_ACTIONS[name]; if (!a) return false; a.run(); refreshRibbon(); return true; };
  // Material: RealView over plain shading (Mastercam's Material display); the other styles leave RealView as it is
  function frameMaterialOn() { return !!(UI.realView && UI.realView()) && App.view.style === 'shaded'; }
  function frameMaterial() {
    if (!UI.setRealView) { toast('Material shading is not available.'); return; }
    if (frameMaterialOn()) { UI.setRealView(false); setStatus('Plain shading.'); }
    else { UI.setRealView(true); setStyle('shaded'); setStatus('Material shading (RealView).'); }
    frameStatusSync(); refreshRibbon();
  }

  // ---- lane mcpolish: viewsheets (the strip under the graphics window). Each sheet keeps a graphics view (camera and
  // zoom), the construction plane, its Z and 3D / 2D, and which levels are hidden (UI.viewState, ui-core.js); "+" adds
  // one, a click switches, right-click renames / deletes / saves or restores the bookmark. Kept per document for the
  // session (not saved). View ▸ Viewsheets: On/Off, New, Save Bookmark, Restore Bookmark.
  var vsState = { on: true, docs: {} };
  function vsDocKey() { var m = App.model || {}; return docTypeNow() + '|' + (App.filePath || App.fileName || m.name || ''); }
  function vsDoc() {
    var k = vsDocKey(), d = vsState.docs[k];
    if (!d) d = vsState.docs[k] = { sheets: [{ name: 'Viewsheet-1', state: null, bookmark: null }], active: 0, n: 1 };
    return d;
  }
  function vsSaveActive() { var d = vsDoc(), s = d.sheets[d.active]; if (s && UI.viewState) s.state = UI.viewState(); }
  function vsSwitch(i) {
    var d = vsDoc();
    if (i < 0 || i >= d.sheets.length) return false;
    if (i !== d.active) {
      vsSaveActive();
      d.active = i;
      var s = d.sheets[i];
      if (s.state && UI.setViewState) UI.setViewState(s.state);
    }
    vsRender(); frameStatusSync(); refreshRibbon();
    setStatus(d.sheets[i].name + '.');
    return true;
  }
  function vsAdd() {
    var d = vsDoc();
    vsSaveActive();
    d.n = Math.max(d.n, d.sheets.length) + 1;
    d.sheets.push({ name: 'Viewsheet-' + d.n, state: UI.viewState ? UI.viewState() : null, bookmark: null });
    d.active = d.sheets.length - 1;
    if (!vsState.on) vsShow(true);
    vsRender(); refreshRibbon();
    setStatus(d.sheets[d.active].name + ' added: it keeps its own view, plane and levels.');
    return d.active;
  }
  function vsRename(i) {
    var d = vsDoc(), s = d.sheets[i];
    if (!s) return;
    promptDialog('Rename Viewsheet', 'Name:', s.name, function (t) { t = String(t || '').trim(); if (!t) return; s.name = t; vsRender(); });
  }
  function vsDelete(i) {
    var d = vsDoc();
    if (d.sheets.length < 2) { toast('The last viewsheet cannot be deleted.'); return false; }
    d.sheets.splice(i, 1);
    if (d.active >= d.sheets.length || i < d.active) d.active = Math.max(0, d.active - (i <= d.active ? 1 : 0));
    if (d.active >= d.sheets.length) d.active = d.sheets.length - 1;
    var s = d.sheets[d.active];
    if (s.state && UI.setViewState) UI.setViewState(s.state);
    vsRender(); refreshRibbon();
    return true;
  }
  function vsBookmark(save) {
    var d = vsDoc(), s = d.sheets[d.active];
    if (save) { s.bookmark = UI.viewState(); setStatus('Bookmark saved for ' + s.name + '.'); return true; }
    if (!s.bookmark) { toast(s.name + ' has no bookmark yet: Save Bookmark first.'); return false; }
    UI.setViewState(s.bookmark); frameStatusSync();
    setStatus(s.name + ': bookmark restored.');
    return true;
  }
  function vsShow(on) { vsState.on = !!on; vsRender(); refreshRibbon(); }
  function vsRender() {
    var vp = $('viewport'), bar = $('mc-viewsheets');
    var want = !!frame && !!frame.viewsheets && !(UI.drawingActive && UI.drawingActive());
    if (!want) { if (bar) bar.remove(); if (vp) vp.classList.remove('mc-vs-on'); return; }
    if (!bar) {
      bar = el('div', { id: 'mc-viewsheets', role: 'tablist', 'aria-label': 'Viewsheets' });
      bar.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-vs]'), add = e.target.closest && e.target.closest('.vs-add');
        if (add) vsAdd(); else if (t) vsSwitch(+t.getAttribute('data-vs'));
      });
      bar.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        var t = e.target.closest && e.target.closest('[data-vs]');
        if (!t) { showMenu(e.clientX, e.clientY, [{ label: 'New Viewsheet', action: vsAdd }]); return; }
        var i = +t.getAttribute('data-vs'), d = vsDoc();
        showMenu(e.clientX, e.clientY, [
          { label: 'Rename…', action: function () { vsRename(i); } },
          { label: 'Delete', disabled: d.sheets.length < 2, action: function () { vsDelete(i); } },
          { sep: true },
          { label: 'Save Bookmark', action: function () { if (i !== d.active) vsSwitch(i); vsBookmark(true); } },
          { label: 'Restore Bookmark', disabled: !d.sheets[i].bookmark, action: function () { if (i !== d.active) vsSwitch(i); vsBookmark(false); } }
        ]);
      });
      bar.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      vp.appendChild(bar);
    }
    vp.classList.toggle('mc-vs-on', vsState.on);
    bar.hidden = !vsState.on;
    var d = vsDoc(), sig = JSON.stringify([d.sheets.map(function (s) { return s.name; }), d.active]);
    if (bar._sig === sig) return;
    bar._sig = sig;
    bar.innerHTML = d.sheets.map(function (s, i) { return '<button role="tab" class="vs-tab' + (i === d.active ? ' active' : '') + '" data-vs="' + i + '" aria-selected="' + (i === d.active) + '" title="' + escHtml(s.name) + ': click to show it, right-click to rename, delete or bookmark">' + escHtml(s.name) + '</button>'; }).join('') +
      '<button class="vs-add" title="New viewsheet" aria-label="New viewsheet">+</button>';
  }
  UI.viewsheets = {
    list: function () { var d = vsDoc(); return d.sheets.map(function (s, i) { return { name: s.name, active: i === d.active, bookmark: !!s.bookmark }; }); },
    active: function () { return vsDoc().active; }, add: vsAdd, switchTo: vsSwitch, rename: function (i, name) { var s = vsDoc().sheets[i]; if (!s) return false; s.name = String(name); vsRender(); return true; },
    remove: vsDelete, bookmark: vsBookmark, shown: function () { return !!vsState.on && !!$('mc-viewsheets'); }, show: vsShow, reset: function () { vsState.docs = {}; vsState.on = true; vsRender(); }
  };

  // ---- lane mcpolish: the Solids manager moves an operation up or down past its neighbour (its sketches move with it);
  // a move that breaks the part (a rebuild with more errors) is undone and refused
  function opIndexOf(id) { var fs = App.model.features; for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return i; return -1; }
  function isOp(f) { return f && f.type !== 'sketch' && f.type !== 'plane'; }
  function frameMoveOp(dir) {
    var s = App.sel, m = App.model;
    if (isAsm() || !s || s.kind !== 'feature') { toast('Select an operation in the Solids manager first.'); return false; }
    var fs = m.features, i = opIndexOf(s.id), f = fs[i];
    if (!isOp(f)) { toast('Select an operation (not a sketch) to move.'); return false; }
    var j = i + dir;
    while (j >= 0 && j < fs.length && !isOp(fs[j])) j += dir;
    if (j < 0 || j >= fs.length) { toast('It is already ' + (dir < 0 ? 'first' : 'last') + '.'); return false; }
    var errs0 = Object.keys((App.build && App.build.errors) || {}).length;
    UI.pushUndo();
    fs.splice(i, 1);
    var k = opIndexOf(fs[dir < 0 ? j : j - 1].id);
    fs.splice(dir < 0 ? k : k + 1, 0, f);
    // its own sketches stay before it
    var own = [f.sketch].concat(f.sketches || []).filter(function (x) { return x != null; });
    own.forEach(function (sid) { var a = opIndexOf(sid), b = opIndexOf(f.id); if (a > b) { var sk = fs.splice(a, 1)[0]; fs.splice(b, 0, sk); } });
    return Promise.resolve(UI.rebuild()).then(function () {
      var errs1 = Object.keys((App.build && App.build.errors) || {}).length;
      if (errs1 > errs0) { (UI.undo)(); toast(f.name + ' cannot move ' + (dir < 0 ? 'up' : 'down') + ': the part would not rebuild.'); return false; }
      App.sel = { kind: 'feature', id: f.id }; refreshTree(); frameSolidsRender();
      setStatus(f.name + ' moved ' + (dir < 0 ? 'up' : 'down') + '.');
      return true;
    });
  }
  UI.frameMoveOp = frameMoveOp;

  // ---- lane mcpolish: the lower part of the Planes manager (the selected plane's origin, comment) and its find box
  var planeInfo = { sel: null, find: '', comments: {} };
  function planeOrigin(name) {
    var pl = null;
    try { pl = framePlaneOf(name); } catch (e) { pl = null; }
    return pl && pl.origin ? pl.origin : [0, 0, 0];
  }
  function frameNewPlaneFromView() {
    if (isAsm()) { toast('Planes belong to part documents.'); return false; }
    var v = UI.viewportLabels ? null : null, name = null, dir = UI.cam.dir;
    var STD = { Top: ['Top', 1], Bottom: ['Top', -1], Front: ['Front', 1], Back: ['Front', -1], Right: ['Right', 1], Left: ['Right', -1] };
    Object.keys(STD).forEach(function (n) { var w = UI.VIEWS[n]; if (!w) return; var d = new THREE.Vector3(w[0][0], w[0][1], w[0][2]).normalize(); if (d.dot(dir) > 1 - 1e-6) name = n; });
    if (!name) { toast('New plane from the graphics view: look along Top, Front, Right or their opposites first (Anvil’s planes are offsets of those).'); return false; }
    var z = UI.cplaneZ ? UI.cplaneZ() : 0, ref = STD[name][0], off = z * STD[name][1];
    UI.pushUndo();
    var f = { id: App.model.nextId++, type: 'plane', ref: ref, offset: off };
    f.name = K.featureName(App.model, 'plane');
    App.model.features.push(f);
    return Promise.resolve(UI.rebuild()).then(function () { refreshTree(); framePlanesRender(true); setStatus(f.name + ': ' + ref + ' at ' + fmtZ(off) + ' (from the ' + name + ' view).'); if (UI.autosave) UI.autosave(); return f.id; });
  }
  UI.frameNewPlaneFromView = frameNewPlaneFromView;
  function planesLowerHtml() {
    var n = planeInfo.sel || frameCplane(), o = planeOrigin(n), c = planeInfo.comments[n] || '';
    function num(v) { return UI.fmtNum ? UI.fmtNum(Math.abs(v) < 5e-9 ? 0 : v, 4) : String(v); }
    return '<div class="mc-pl-lower" data-plane="' + escHtml(n) + '"><div class="mc-pl-sel">' + escHtml(n) + '</div>' +
      ['X', 'Y', 'Z'].map(function (a, i) { return '<label>' + a + ' Origin <input type="text" readonly data-origin="' + a + '" value="' + num(o[i]) + '" title="Where the plane’s origin is (Anvil’s planes are offsets of Top / Front / Right: change one in its Plane PropertyManager)"></label>'; }).join('') +
      '<label>Comment <input type="text" class="mc-pl-comment" value="' + escHtml(c) + '" spellcheck="false" title="A note about this plane (kept for the session)"></label></div>';
  }
  function frameFind(box) {
    var inp = box.querySelector('.mc-find');
    if (!inp) {
      inp = el('input', { type: 'search', class: 'mc-find', placeholder: 'Find…', 'aria-label': 'Find' });
      inp.addEventListener('input', function () { planeInfo.find = inp.value; framePlanesRender(true); });
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') { inp.value = ''; planeInfo.find = ''; inp.remove(); framePlanesRender(true); } });
      box.insertBefore(inp, box.firstChild);
    }
    inp.focus();
  }

  // One-line descriptions for the ribbon tooltips, keyed by the button label (ids such as 'bend' are shared by several buttons).
  var RIBBON_HELP = {
    'Extruded Boss/Base': 'Extrude a closed sketch profile into a solid', 'Revolved Boss/Base': 'Revolve a sketch profile about an axis line',
    'Swept Boss/Base': 'Sweep a profile sketch along a path', 'Lofted Boss/Base': 'Loft a solid through two or more section sketches',
    'Extruded Cut': 'Remove material by extruding a sketch profile', 'Hole Wizard': 'Counterbore, countersink, hole or straight tap holes (ANSI Inch or ISO) at points on a face', 'Revolved Cut': 'Remove material by revolving a sketch profile',
    'Swept Cut': 'Remove material along a path', 'Lofted Cut': 'Remove material lofted through section sketches',
    'Fillet': 'Round the selected edges', 'Chamfer': 'Bevel the selected edges', 'Linear Pattern': 'Repeat a feature along one or two directions', 'Circular Pattern': 'Repeat a feature about an axis', 'Mirror': 'Mirror a feature or the body about a plane',
    'Shell': 'Hollow the body, removing the selected faces', 'Reference Geometry': 'Create an offset reference plane',
    'Sketch': 'Start a sketch on the selected plane or face', 'Exit Sketch': 'Close the sketch and return to the part', 'Smart Dimension': 'Dimension sketch entities, or with no sketch open the model’s edges, faces and vertices: click an item (or two), then where the value goes',
    'Line': 'Draw lines: click point after point, or press and drag for one', 'Corner Rectangle': 'Rectangle from two corners', 'Center Rectangle': 'Rectangle from its center', 'Circle': 'Circle from center and radius', 'Centerpoint Arc': 'Arc from center, start and end', '3 Point Arc': 'Arc from its start, end and a point on it', 'Polygon': 'Regular polygon from its center and a side or corner', 'Straight Slot': 'Slot from two centers and a width', 'Point': 'Place a sketch point',
    'Sketch Fillet': 'Round a sketch corner with a tangent arc', 'Sketch Chamfer': 'Bevel a sketch corner', 'Intersection Curve': 'Sketch where a plane or face crosses the model', 'Trim Entities': 'Trim or extend sketch entities to where they cross', 'Convert Entities': 'Project model edges into the sketch', 'Offset Entities': 'Offset sketch entities by a distance',
    'Plane': 'Create an offset reference plane', 'Sketch to DXF': 'Export the active sketch as DXF (layers, colours and line types kept)',
    'Measure': 'Measure distances, lengths and areas', 'Mass Properties': 'Volume, mass, centroid and bounding box', 'Section View': 'Cut the view with a section plane', 'Face to DXF': 'Export the selected face outline as DXF',
    'Base Flange/Tab': 'Turn a sketch into the first sheet-metal body and set the sheet parameters', 'Edge Flange': 'Bend a wall from a straight edge of the sheet',
    'Miter Flange': 'Bend walls from adjacent edges and join them at the corner', 'Hem': 'Fold the sheet back over itself along an edge', 'Jog': 'Step the sheet up or down with two bends',
    'Flatten': 'Show the flat pattern with bend lines', 'Flat to DXF': 'Export the flat pattern as DXF or DWG (DXF/DWG Output)', 'Simple Hole': 'Cut a simple hole through the sheet',
    'Insert Components': 'Add a part to the assembly', 'Mate': 'Position components relative to each other (Coincident, Concentric, Distance, Angle)',
    'Move Component': 'Drag a floating component; its mates are solved again when you drop it', 'Rotate Component': 'Turn a floating component about its centre by dragging',
    'Interference Detection': 'Find selected components (or all) whose solids overlap and the overlapping volume',
    'Check': 'Validate the geometry: open and non-manifold edges, zero-area faces, self-intersections', 'Zebra Stripes': 'Show reflected stripes to judge smoothness and tangency (click again to turn off)',
    'Section Properties': 'Area, centroid and moments of area of a planar face or a sketch', 'Draft Analysis': 'Colour faces by their draft angle relative to a direction of pull',
    'Clearance Verification': 'Minimum distance between selected bodies or components, with the closest points',
    'Instant3D': 'Drag arrows on a selected extrude or revolve face, and its sketch dimensions, to change them in the viewport',
    'Fix': 'Fix the selected component where it is', 'Float': 'Let the selected component move so mates can position it', 'Hide/Show Components': 'Hide the selected component, or show hidden ones',
    // r14/commands14: every ribbon command has its line now
    'Boundary Boss/Base': 'Add material between profiles in two directions', 'Boundary Cut': 'Remove material between profiles in two directions',
    'Draft': 'Taper faces by an angle to a neutral plane', 'Intersect': 'Intersect solids, surfaces or planes to keep or remove regions',
    'Rib': 'Add a thin wall from an open sketch', 'Wrap': 'Wrap a sketch onto a face', 'Curves': 'Helix, projected and composite curves',
    'Axis': 'Create a reference axis', 'Coordinate System': 'Create a reference coordinate system',
    'Spline': 'Draw a smooth curve through points', 'Ellipse': 'Ellipse from center and two radii', 'Text': 'Single-stroke etch text or cut outlines, straight or along a line or arc',
    'Partial Ellipse': 'Elliptical arc from center, two radii, start and end',
    'Extend Entities': 'Lengthen a sketch entity to the next entity in its way', 'Mirror Entities': 'Mirror sketch entities about a centerline',
    'Linear Sketch Pattern': 'Repeat sketch entities in rows and columns', 'Circular Sketch Pattern': 'Repeat sketch entities round a centre', 'Dynamic Mirror': 'Mirror sketch entities as you draw them',
    'Move Entities': 'Move sketch entities', 'Copy Entities': 'Copy sketch entities', 'Rotate Entities': 'Turn sketch entities about a point', 'Scale Entities': 'Scale sketch entities about a point', 'Stretch Entities': 'Move sketch entities, stretching what is joined to them', 'Display/Delete Relations': 'List the sketch relations, and delete them',
    'Add Relation': 'Add a geometric relation (horizontal, coincident, tangent…) between the selected entities',
    'Fully Define Sketch': 'Add the relations and dimensions that fully define the sketch (baseline or chain, from the origin)',
    'Construction Geometry': 'Turn the selected entities into construction geometry, or back', 'Centerline': 'Draw a construction centerline',
    'Sensor': 'Watch a value such as mass or a dimension', 'Undercut Analysis': 'Find trapped areas that block a mold from opening',
    'Thickness Analysis': 'Show thin and thick regions of the part', 'Compare Documents': 'Compare two versions of a document',
    'Performance Evaluation': 'Rebuild time of each feature', 'Costing': 'Estimate the manufacturing cost',
    'Convert to Sheet Metal': 'Turn a solid into sheet metal', 'Lofted-Bend': 'Sheet metal lofted between two open profiles', 'Sketched Bend': 'Bend the sheet along a sketch line',
    'Cross-Break': 'Stiffening cross-break on a face', 'Corners': 'Close, break or relieve sheet-metal corners', 'Forming Tool': 'Press a formed shape into the sheet',
    'Vent': 'Vent openings from a sketch', 'Unfold': 'Flatten selected bends', 'Fold': 'Fold unfolded bends back', 'Rip': 'Rip the edges of a hollow part so it can be unfolded',
    'Linear Component Pattern': 'Repeat components along one or two directions', 'Circular Component Pattern': 'Repeat components about an axis',
    'Mirror Components': 'Mirror components about a plane', 'Exploded View': 'Pull the components apart in steps', 'Bill of Materials': 'Parts list with quantities',
    'Smart Fasteners': 'Add fasteners to holes', 'Hole Alignment': 'Find holes that do not line up across components'
  };
  RIBBON_HELP['Boundary Boss/Base'] = 'A solid bounded by profiles (Direction 1), its sides shaped by curves that touch every profile (Direction 2)'; RIBBON_HELP['Boundary Cut'] = 'Remove material bounded by profiles and the curves between them';   // rfFB
  // Drawing commands have their own lines (Section View, Smart Dimension … mean other things in a part)
  var DRAW_HELP = {
    'Standard 3 View': 'Front, Top and Right views of the model on the sheet', 'Model View': 'Place a view of the model in any orientation',
    'Projected View': 'Project a view from an existing one', 'Section View': 'Cut a view with a section line and place the section',
    'Detail View': 'Enlarge a region of a view in a circle', 'Smart Dimension': 'Dimension the drawing views',
    'Model Items': "Show the model's dimensions in the views", 'Auto Balloon': 'Balloon every component in a view',
    'Bill of Materials': 'Parts list with item numbers and quantities', 'Sheet Properties': 'Sheet size, scale and format',
    'Save as SVG': 'Export the sheet as SVG', 'Save as DXF': 'Export the sheet as DXF', 'Save as PDF': 'Export the sheet as PDF',
    'Close Drawing': 'Return to the model', 'Ordinate Dimension': 'Dimensions measured from one zero line', 'Baseline Dimension': 'Dimensions measured from one baseline',
    'Chamfer Dimension': 'Length and angle of a chamfer', 'Balloon': 'Item number of a component', 'Stacked Balloon': 'Several item numbers in one stack',
    'Hole Callout': 'Size and depth note of a hole', 'Center Mark': 'Cross at the centre of a circle or arc', 'Centerline': 'Centerline between two edges',
    'Document Properties': 'Drafting standard, fonts and arrows',
    // rfNG uisense: every drawing command has its line (they showed the name alone)
    'Auxiliary View': 'Project a view square to a slanted edge of an existing view', 'Removed Section': 'A section cut across a view between two edges, placed beside the view',
    'Broken-out Section': 'Cut away part of a view inside a closed outline, to a depth, to show what is inside', 'Break': 'Shorten a long view between two break lines',
    'Crop View': 'Keep only the part of a view inside a closed outline', 'Horizontal Dimension': 'The horizontal distance between two points or edges in a view',
    'Vertical Dimension': 'The vertical distance between two points or edges in a view', 'Horizontal Ordinate Dimension': 'Horizontal ordinate dimensions from one zero line, the values on one line',
    'Vertical Ordinate Dimension': 'Vertical ordinate dimensions from one zero line, the values on one line', 'Chain Dimension': 'Dimensions end to end along a row of points or edges',
    'Angular Running Dimension': 'Angles from one 0° edge round a vertex to other edges', 'Path Length Dimension': 'The total length of a chain of edges',
    'Magnetic Line': 'A line the balloons snap to, spaced evenly along it', 'Note': 'Text on the sheet, with or without a leader',
    'Multi-jog Leader': 'A leader with several bends, from a note or symbol to an edge', 'Flag Note': 'A numbered flag symbol that points to a note of the Flag Note Bank',
    'Surface Finish': 'Surface texture symbol on an edge or face', 'Datum Feature': 'Datum letter in a box, attached to an edge or face',
    'Geometric Tolerance': 'Feature control frame: tolerance symbol, value and datums', 'Weld Symbol': 'Weld symbol with its arrow, side and size',
    'Revision Symbol': 'Revision letter in a triangle, from the revision table', 'Revision Cloud': 'A cloud round a changed area of the sheet',
    'Datum Target': 'Datum target symbol and the point or area it names', 'Cosmetic Thread': 'Show a thread on a hole or shaft as thin lines with its callout',
    'Dowel Pin Symbol': 'Dowel pin symbol on a hole, at its size', 'Revision Table': 'Table of the revisions: zone, description, date and approval',
    'General Table': 'A blank table to fill in', 'Hole Table': 'Table of the holes: position from a datum and size',
    'Bend Table': 'Table of the bends of a flat pattern view: direction, angle and radius', 'Punch Table': 'Table of the forming tools in a flat pattern view and their positions',
    'Area Hatch/Fill': 'Hatch or fill a closed region or a face of a view', 'Edit Sheet Format': 'Edit the border and title block: their lines and notes',
    'Save Sheet Format': 'Save the border and title block as a sheet format file', 'Save as Template': 'Save this drawing as a template for new drawings',
    'Drawing Templates': 'Choose the template (sheet size and format) new drawings start from', 'Reset Format': 'Put back the built-in border and title block of this sheet size'
  };
  // rfNG uisense: the drawing's Sketch tab draws sketch geometry on the sheet; its Centerline is a sketch line, not the
  // Annotation tab's centerline between two edges
  // rfNG uisense: the status-bar help line of the menu rows that are not ribbon commands (menuRowHelp, below), by the
  // whole row ('New ▸ Part') or its last name ('Part'); a menu group name ('Sketch Settings') prefixes its rows' names
  // ('=Name': the line of the ribbon command Name)
  var MENU_HELP = {
    // File
    'New': 'Make a new document: a part, an assembly or a drawing', 'New ▸ Part': 'A new, empty part', 'New ▸ Assembly': 'A new, empty assembly',
    'Open': 'Open a saved document: a part, assembly or drawing, or a STEP, DXF / DWG or STL file', 'Browse Recent Documents': 'The documents you opened last',
    'Import DXF / DWG into Sketch': 'Bring a DXF or DWG file into a sketch (a new sketch on the Top Plane when none is open)', 'Save': 'Save the document', 'Save As': 'Save the document under another name or as another file type',
    'Save As DXF / DWG': 'Write the flat pattern, a face or a sketch as DXF or DWG (DXF/DWG Output)', 'Pack and Go': 'Save the document with every file it uses, in one folder',
    'Make Drawing from Part': 'Open a new drawing of this part', 'Make Drawing from Assembly': 'Open a new drawing of this assembly', 'New Drawing': 'A new drawing: choose its template and the model',
    'Export STEP AP214': 'Write the solid as a STEP AP214 file for other CAD programs', 'Export 3MF': 'Write the solid as a 3MF file for 3D printing', 'Export OBJ': 'Write the shaded mesh as an OBJ file',
    'Export STL': 'Write the shaded mesh as an STL file for 3D printing', 'Export selected face as DXF': '=Face to DXF', 'Export sketch as DXF': '=Sketch to DXF',
    'Export model as script': 'Save the model as an Anvil script that rebuilds it', 'Export model as JSON': 'Save the model (features, sketches, dimensions) as a JSON file',
    'Screenshot (PNG)': 'Save the graphics area as a PNG picture', 'Properties': 'Custom properties of the document: part number, description, material …',
    // Edit
    'Undo': 'Undo the last change', 'Redo': 'Redo the change you undid', 'Cut': 'Cut the selected sketch entities to the clipboard', 'Copy': 'Copy the selected sketch entities to the clipboard',
    'Paste': 'Paste the copied sketch entities into the open sketch', 'Suppress': 'Turn the selected features off: the part rebuilds without them', 'Unsuppress': 'Turn the selected suppressed features back on',
    'Delete': 'Delete the selection', 'Rebuild': 'Rebuild the model', 'Rebuild in background (Web Worker)': 'Rebuild in a background thread so the window keeps answering while a big part rebuilds',
    'Clear selection': 'Select nothing', 'Appearance': 'Colour and finish of the part or the selected faces',
    // View
    'Modify ▸ Zoom Out': 'Zoom out about the middle of the graphics area', 'Modify ▸ Zoom In': 'Zoom in about the middle of the graphics area',
    'Axes': 'Show or hide the reference axes', 'Points': 'Show or hide the reference points', 'Coordinate Systems': 'Show or hide the coordinate systems',
    'Change Transparency': 'Make the selected body see-through, or solid again', 'Tangent Edges Visible': 'Draw the edges between tangent faces as solid lines',
    'Tangent Edges As Phantom': 'Draw the edges between tangent faces as thin dashed lines', 'Tangent Edges Removed': 'Do not draw the edges between tangent faces',
    'RealView Graphics': 'Realistic shading: the material’s reflections (drawn while the view is still)', 'Shadows In Shaded Mode': 'Cast the model’s shadow on the floor under it',
    'Ambient Occlusion': 'Darken corners and creases so the shapes read better', 'Model Dimensions': 'Show the dimensions of the features in the graphics area',
    'Theme': 'Colours of the window', 'Theme ▸ Light': 'Light window colours', 'Theme ▸ Dark': 'Dark window colours',
    'Background ▸ Gradient': 'Graphics-area background: a grey gradient', 'Background ▸ Plain': 'Graphics-area background: plain white', 'Background ▸ Dark': 'Graphics-area background: dark grey',
    // Insert
    'Boss/Base ▸ Extrude': '=Extruded Boss/Base', 'Boss/Base ▸ Revolve': '=Revolved Boss/Base', 'Boss/Base ▸ Sweep': '=Swept Boss/Base', 'Boss/Base ▸ Loft': '=Lofted Boss/Base', 'Boss/Base ▸ Boundary': '=Boundary Boss/Base',
    'Cut ▸ Extrude': '=Extruded Cut', 'Cut ▸ Revolve': '=Revolved Cut', 'Cut ▸ Sweep': '=Swept Cut', 'Cut ▸ Loft': '=Lofted Cut', 'Cut ▸ Boundary': '=Boundary Cut',
    'Delete/Keep Body': 'Delete bodies from a multibody part, or keep only the ones you pick', 'Imported': 'Insert a STEP or other CAD file as a body of this part',
    'Derived Sketch': 'A copy of the selected sketch that follows its changes, on another plane or face',
    'Curve ▸ Split Line': '=Split Line', 'Curve ▸ Projected': '=Projected Curve', 'Curve ▸ Composite': '=Composite Curve', 'Curve ▸ Curve Through XYZ Points': '=Curve Through XYZ Points',
    'Curve ▸ Curve Through Reference Points': '=Curve Through Reference Points', 'Curve ▸ Helix/Spiral': '=Helix and Spiral',
    'Sheet Metal ▸ Base Flange': '=Base Flange/Tab', 'Design Table': 'Configurations in a table: one row per configuration, one column per dimension or suppression',
    // Tools
    'Macro ▸ Run script': 'Run an Anvil script on the model (the Automation / Script pane)', 'Sensor': '=Sensor', 'Segment': 'Points that divide a sketch entity into equal segments',
    'Jog Line': 'Put a rectangular jog in a sketch line', 'SketchXpert': 'Find and fix over-defined relations and dimensions in the sketch',
    'Modify': 'Move, rotate or scale the whole sketch', 'Grid/Origin': 'Line the sketch up with its origin or the grid', 'Replace Entity': 'Replace a sketch entity with another and keep what refers to it',
    'Close Sketch to Model': 'Close an open profile against the model’s edges', 'Create Sketch from Selections': 'A new sketch made of the selected entities',
    'Make Path': 'Join a chain of sketch entities into a path that moves as one', 'Repair Sketch': '=Repair Sketch',
    'Insert Spline Point': 'Add a point to a spline where you click', 'Simplify Spline': 'Make a spline smoother with fewer points', 'Fit Spline': 'Replace a chain of entities with one spline through them',
    'Show Spline Handles': 'Show the tangency handles at the spline’s points', 'Show Curvature': 'Show the curvature comb of a spline or arc', 'Relax Spline': 'Smooth a spline you dragged out of shape',
    'Add Tangency Control': 'Add a tangency handle to the spline where you click', 'Add Curvature Control': 'Add a curvature handle to the spline where you click',
    'Show Inflection Points': 'Mark where the spline’s curvature changes side', 'Show Minimum Radius': 'Mark the tightest radius of the spline',
    'Blocks ▸ Make': 'Make a block of the selected sketch entities: they move and copy as one', 'Blocks ▸ Edit Block': 'Edit the entities of the selected block',
    'Blocks ▸ Insert': 'Insert a saved block into the sketch', 'Blocks ▸ Add/Remove': 'Add sketch entities to the block, or take them out',
    'Blocks ▸ Rebuild': 'Rebuild the blocks of the sketch', 'Blocks ▸ Explode': 'Turn the selected block back into plain sketch entities', 'Blocks ▸ Save': 'Save the selected block to a file',
    'Relations ▸ Add': '=Add Relation', 'Relations ▸ Display/Delete': '=Display/Delete Relations', 'Constrain All': 'Add every relation the sketch’s geometry already follows',
    'Scan Equal': 'Find lines and arcs of equal size and make them equal', 'Fully Define Sketch': '=Fully Define Sketch',
    'Sketch Settings': 'Sketch setting', 'Equations': 'Global variables and equations that drive the dimensions',
    'Units: millimeters (MMGS)': 'This document in millimeters, grams, seconds', 'Units: inches (IPS)': 'This document in inches, pounds, seconds',
    'Default units for new documents ▸ Inches (IPS)': 'New parts and assemblies start in inches', 'Default units for new documents ▸ Millimeters (MMGS)': 'New parts and assemblies start in millimeters',
    'Options': 'System options and document properties (Tools ▸ Options)', 'Image Quality': 'How finely curved faces are drawn and exported',
    'Display/Selection ▸ Select hidden entities': 'A box or lasso also selects edges and faces hidden behind the part',
    'OpenCascade kernel ▸ Use OpenCascade (exact solids)': 'Rebuild with the OpenCascade engine: exact curved faces for STEP and drawings',
    'OpenCascade kernel ▸ Show the quick result first': 'Show Anvil’s own quick result while OpenCascade works on the exact solid',
    'OpenCascade kernel ▸ Wait for the exact solid': 'Show nothing new until OpenCascade’s exact solid is ready', 'OpenCascade kernel ▸ Engine file': 'Where the OpenCascade engine file is loaded from',
    // assembly, drawing
    'Component ▸ Existing Part': '=Insert Components', 'Save Drawing As': 'Save the drawing under another name', 'Save Drawing as SVG': '=Save as SVG',
    'Save Drawing as DXF': '=Save as DXF', 'Save Drawing as DWG': 'Export the sheet as DWG', 'Save Drawing as PDF': '=Save as PDF',
    'Tangent Edges With Font': 'Draw the edges between tangent faces in the tangent-edge line font', 'Hide/Show Annotations': 'Click annotations to hide them, or hidden ones to show them',
    'Hide/Show ▸ All Annotations': 'Show or hide every annotation on the sheet', 'Hide/Show ▸ Sketches': 'Show or hide the sketches of the views',
    'Sheet': 'Add a sheet to the drawing', 'Drawing View ▸ Model': '=Model View', 'Drawing View ▸ Relative To Model': '=Relative View', 'Drawing View ▸ Empty': 'An empty view to sketch in',
    'Drawing View ▸ Projected': '=Projected View', 'Drawing View ▸ Auxiliary': '=Auxiliary View', 'Drawing View ▸ Section': '=Section View', 'Drawing View ▸ Detail': '=Detail View',
    'Drawing View ▸ Crop': '=Crop View', 'Drawing View ▸ Flat Pattern': 'A view of the sheet-metal part flat, with its bend lines',
    'Surface Finish Symbol': '=Surface Finish', 'Dimensions ▸ Ordinate': '=Ordinate Dimension', 'Dimensions ▸ Baseline': '=Baseline Dimension',
    'Tables ▸ Add Revision': 'Add a row to the revision table', 'Dimensions ▸ Autodimension': 'Dimension the selected view from a datum: baseline, chain or ordinate',
    // Window, Help
    'Task Pane': 'Show or hide the Task Pane at the right', 'Scripting reference': 'The Anvil script API: every command a script can call',
    'Keyboard shortcuts': 'Every keyboard shortcut', 'Report a Problem': 'Save a report of what went wrong for Claude to read', 'About Anvil': 'Anvil’s version and where it runs'
  };
  var DRAW_SKETCH_HELP = { 'Centerline': 'Draw a construction centerline on the sheet' };
  // the sheet's sketch tools have no keys (the drawing takes the keyboard: L, R, C, A did nothing there although the
  // tooltips showed them); Smart Dimension's D works in a drawing
  var DRAW_SKETCH_KEYLESS = { line: 1, rect: 1, circle: 1, arc: 1, arc3: 1, polygon: 1, slot: 1 };
  var drawSketchCache = { list: null, leaves: [] };
  function inDrawingSketch(item) {
    if (!(UI.drawingActive && UI.drawingActive())) return false;
    var list = RIBBON.Sketch;
    if (drawSketchCache.list !== list) drawSketchCache = { list: list, leaves: ribbonLeaves(list || []) };
    return drawSketchCache.leaves.some(function (x) { return x === item || (x && typeof x === 'object' && x.isPrototypeOf(item)); });
  }
  // r14/commands14: tooltips in SolidWorks' two-line style: the name in bold (with its shortcut), a description under it,
  // and a third, muted line for why a button is greyed (setTip, below). An item's own `help` wins over the tables.
  function ribbonTip(id, label, enabled, needsSketch, help, ownKey) {
    var key = UI.activeKey ? UI.activeKey(id, ownKey) : ownKey || (UI.shortcutFor ? UI.shortcutFor(id) : null);   // lane CC: an item's own `key` (View tab: Ctrl+1 …); lane profiles: the active profile's key
    var desc = help || (UI.drawingActive && UI.drawingActive() && DRAW_HELP[label]) || RIBBON_HELP[label] || '';
    if (!enabled) return { name: label, key: '', desc: desc, note: 'Not available in Anvil yet' };   // rfC: SolidWorks' command, greyed
    return { name: label, key: key || '', desc: desc, note: needsSketch ? 'Open a sketch first' : '' };
  }
  // the state a ribbon item shows now: { id, icon, label, flat, disabled, active, tip }; `icon` is the glyph drawn (an
  // item's own `icon` when its id is shared with another command, such as Sketch Fillet and the Fillet feature)
  // rfMD: a name the icon set in use draws itself and the built-in icons do not have (Swept Cut, a History folder)
  function setIcon(name) { var id = window.Icons && Icons.sets && Icons.sets.active(), set = id ? Icons.sets.get(id) : null; return !!(name && set && set.has && set.has(name)); }
  // rfNG (for lane swsketchicons): a menu row's own picture when the icon set in use draws it, else the shared one
  function own(name, fallback) { return setIcon(name) ? name : fallback; }
  function itemState(item) {
    var d = item.dyn && item.dyn();
    var id = d ? d.id : item.id, label = d ? d.label : item.label, flat = label.replace(/\n/g, ' ');
    // rfAY: with Rapid Sketch on, the sketch-entity tools work with no sketch open (armed until a plane / face is clicked)
    var rapid = !!item.tool && item.tool !== 'dimension' && App.mode !== 'sketch' && !!(UI.rapidSketchOn && UI.rapidSketchOn());
    // lane model-dims: Smart Dimension with no sketch open dimensions the part's solid (ui-model-dims.js)
    var modelDim = item.tool === 'dimension' && App.mode !== 'sketch' && !!UI.modelDimOn && !(UI.isAssembly && UI.isAssembly());
    // lane mcdirect (user 2026-11-11: "update all the greyed out settings to actually work"): with no sketch open a
    // drawing tool starts one (ui-sketch.js UI.sketchToolStart: the SolidWorks Edit Sketch prompt, or under a profile
    // with wireframe.direct the construction plane at once), so it is never greyed in a part
    var starts = !!item.tool && item.tool !== 'dimension' && App.mode !== 'sketch' && !!UI.sketchToolStart && !isAsm() && !(UI.drawingActive && UI.drawingActive());
    var enabled = !!(item.run || item.tool), needsSketch = !!item.tool && App.mode !== 'sketch' && !rapid && !modelDim && !starts, active = false;
    if (item.tool) active = (App.mode === 'sketch' && App.tool === item.tool && (!item.active || !!item.active())) || (rapid && UI.rapidSketchArmed() === item) || (modelDim && UI.modelDimOn());   // p9-sketchtab: Line / Centerline / Midpoint Line share the line tool
    else if (item.run) active = !!((item.id === 'sketch' && App.mode === 'sketch') || (item.active && item.active()));
    return { id: id, icon: (d && d.icon) || (d ? id : (item.swIcon && setIcon(item.swIcon) ? item.swIcon : item.icon || (setIcon(item.cmd) ? item.cmd : id))), label: label, flat: flat, disabled: !enabled || needsSketch, active: active, tip: ribbonTip(item.noKey || (id !== 'dim' && DRAW_SKETCH_KEYLESS[id] && inDrawingSketch(item)) ? '' : id, flat, enabled, needsSketch, item.help || (DRAW_SKETCH_HELP[flat] && inDrawingSketch(item) ? DRAW_SKETCH_HELP[flat] : ''), item.keyCmd ? (UI.activeKey ? UI.activeKey(item.keyCmd) : '') || '' : item.key) };
  }
  function runItem(item) {
    if (UI.reports) UI.reports.crumb('command: ' + (item.cmd || item.id || item.icon || '?') + (item.label ? ' (' + String(item.label).replace(/\s+/g, ' ') + ')' : ''));   // lane reports
    if (frame) frameNoteRun(item);   // lane mcframe: Recent Functions, the function panel's title
    if (item.tool && item.tool !== 'dimension' && App.mode !== 'sketch' && UI.rapidSketchOn && UI.rapidSketchOn()) { UI.rapidSketchArm(item); refreshRibbon(); return; }   // rfAY: Rapid Sketch
    if (item.tool && !item.run) UI.setTool(itemState(item).active ? 'select' : item.tool);
    else if (item.run) { item.run(); refreshRibbon(); }
  }
  // A ribbon button's look follows the app state (sketch mode, active tool, toggles). sync() applies it in place, so
  // refreshing the ribbon (after every command, tool change and PropertyManager close) does not replace the button
  // under the mouse: no hover flicker, and the tooltip stays up.
  function ribbonButton(item, small) {
    var b = el('button', { class: 'rb' + (item.wide && !small ? ' rb-wide' : '') }), shown = null;   // wide: a long two-line label (Shaded Sketch Contours)
    function sync() {
      var s = itemState(item);
      var face = s.id + '|' + s.icon + '|' + s.label + '|' + rbIcon(small);   // rfIA: the CommandManager's size redraws the icon
      if (face !== shown) {
        shown = face;
        b.innerHTML = Icons(s.icon, rbIcon(small)) + '<span>' + (small ? item.label : s.label) + '</span>';
        b.setAttribute('aria-label', s.flat); b.dataset.icon = s.icon;
      }
      setTip(b, s.tip);
      if (b.disabled !== s.disabled) b.disabled = s.disabled;
      if (b.classList.contains('active') !== s.active) b.classList.toggle('active', s.active);
    }
    sync();
    if (item.tool || item.run) b.addEventListener('click', function () { runItem(item); });
    b._sync = sync;
    return b;
  }

  // r14/commands14: a flyout button, as SolidWorks groups Fillet / Chamfer, the patterns, the rectangle and arc types,
  // Trim / Extend, Convert / Offset and Reference Geometry. The face runs the command last picked from its ▾ list
  // (remembered per group in localStorage 'anvil.fly.<group>'); while one of the group's sketch tools is on, the face
  // shows that tool. The ▾ opens the whole group as a menu with icons, shortcuts and check marks.
  var flyFaces = {};
  function flyFace(item) {
    if (flyFaces[item.fly] == null) {
      var n = NaN;
      try { n = parseInt(localStorage.getItem('anvil.fly.' + item.fly), 10); } catch (e) { }
      flyFaces[item.fly] = n >= 0 && n < item.items.length && (item.items[n].run || item.items[n].tool) ? n : 0;
    }
    return Math.min(flyFaces[item.fly], item.items.length - 1);
  }
  function setFlyFace(item, i) {
    if (flyFaces[item.fly] === i) return;
    flyFaces[item.fly] = i;
    try { localStorage.setItem('anvil.fly.' + item.fly, String(i)); } catch (e) { }
  }
  function flyCurrent(item) {
    for (var i = 0; i < item.items.length; i++) if (item.items[i].tool && itemState(item.items[i]).active) return i;
    return flyFace(item);
  }
  function flyMenuItems(item) {
    return item.items.map(function (it, i) {
      var s = itemState(it);
      return { label: s.flat, icon: s.icon, key: s.tip.key, checked: s.active, disabled: s.disabled, help: s.tip.desc, why: s.tip.note, action: function () { setFlyFace(item, i); runItem(it); refreshRibbon(); } };   // rfNG: help / why for the status-bar help line
    });
  }
  function ribbonFlyout(item, small) {
    var wrap = el('div', { class: 'rb-fly' + (small ? ' rb-fly-small' : '') }), b = el('button', { class: 'rb rb-face' }), shown = null, wasOpen = false;
    var c = el('button', { class: 'rb-caret', html: '<span>▾</span>' });
    function sync() {
      var i = flyCurrent(item), s = itemState(item.items[i]);
      var fic = item.label && !small && setIcon(item.fly) ? item.fly : s.icon;   // rfMD: a captioned group (Reference Geometry, Curves) keeps its own icon when the set draws one
      var label = item.label || (small ? s.flat : s.label), face = s.id + '|' + fic + '|' + label + '|' + rbIcon(small);
      if (face !== shown) {
        var refit = shown !== null && shown.split('|').pop() === String(rbIcon(small));   // not on a size change (rbApply fits once)
        shown = face;
        b.innerHTML = Icons(fic, rbIcon(small)) + '<span>' + (small ? s.flat : label) + '</span>';
        b.setAttribute('aria-label', item.label ? item.label.replace(/\n/g, ' ') : s.flat); b.dataset.icon = s.icon;
        c.setAttribute('aria-label', (item.label ? item.label.replace(/\n/g, ' ') : s.flat) + ' options');
        if (refit && wrap.isConnected) fitRibbon();   // a longer label may need the room of another button
      }
      var tip = item.label ? { name: item.label.replace(/\n/g, ' ') + ': ' + s.flat, key: s.tip.key, desc: s.tip.desc, note: s.tip.note } : s.tip;
      setTip(b, tip);
      setTip(c, { name: (item.label ? item.label.replace(/\n/g, ' ') : s.flat) + ' ▾', desc: item.items.map(function (x) { return x.label.replace(/\n/g, ' '); }).join(', ') });
      if (b.disabled !== s.disabled) b.disabled = s.disabled;
      var cd = item.items.every(function (x) { return itemState(x).disabled; });
      if (c.disabled !== cd) c.disabled = cd;
      if (b.classList.contains('active') !== s.active) b.classList.toggle('active', s.active);
    }
    b.addEventListener('click', function () { var i = flyCurrent(item); setFlyFace(item, i); runItem(item.items[i]); });
    c.addEventListener('mousedown', function () { wasOpen = wrap.classList.contains('open'); });
    c.addEventListener('click', function () {
      if (wasOpen) { wasOpen = false; return; }
      var r = wrap.getBoundingClientRect();
      showMenu(r.left, r.bottom + 1, flyMenuItems(item), wrap);
    });
    wrap.appendChild(b); wrap.appendChild(c);
    sync();
    b._sync = sync; wrap._fly = item;
    return wrap;
  }
  // What the ribbon was last built from: the tab, its item list (compared item by item: ui-assembly / drawing.js edit
  // the lists in place) and the tab names. While these hold, refreshRibbon only re-syncs the buttons' states.
  var ribbonBuilt = null;
  function ribbonShape() {
    var set = ribbonSet();
    var tabNames = Object.keys(set), extraTabs = isAsm() ? ['Layout', 'Sketch', 'Markup', 'SOLIDWORKS Add-Ins'] : [];   // the part's greyed SolidWorks tabs (Surfaces, Weldments, Mold Tools, Direct Editing, MBD Dimensions) removed at the user's request (2026-10-13)
    // another document type (drawing.js) may swap the tab set: UI.ribbonTabsFor(names, extra) -> [names, extra]
    if (UI.ribbonTabsFor) { var tf = UI.ribbonTabsFor(tabNames, extraTabs); tabNames = tf[0]; extraTabs = tf[1]; }
    if (set === profileSet()) tabNames = Object.keys(set);   // lane profiles: a profile's set is already this document's tabs
    var items = (set[App.ribbonTab] || []).slice();
    return { set: set, tab: App.ribbonTab, items: items, stacks: items.map(function (it) { return it.stack ? it.stack.slice() : it.fly ? it.items.slice() : null; }), tabs: tabNames.join('\u0001') + '\u0002' + extraTabs.join('\u0001'), tabNames: tabNames, extraTabs: extraTabs };
  }
  function sameShape(a, b) {
    if (!a || a.set !== b.set || a.tab !== b.tab || a.tabs !== b.tabs || a.items.length !== b.items.length) return false;
    for (var i = 0; i < a.items.length; i++) {
      if (a.items[i] !== b.items[i]) return false;
      var sa = a.stacks[i], sb = b.stacks[i];
      if (sa || sb) { if (!sa || !sb || sa.length !== sb.length) return false; for (var j = 0; j < sa.length; j++) if (sa[j] !== sb[j]) return false; }
    }
    return true;
  }
  // lane mcframe: the frame's File tab and group captions follow every refresh
  function refreshRibbon() { refreshRibbon0(); if (frame) { frameFileTab(); frameCaptionsSoon(); frameSoon(); } }
  function refreshRibbon0() {
    var bar = $('ribbon-buttons');
    var set = ribbonSet();
    if (!set[App.ribbonTab]) App.ribbonTab = set[tabName(App.ribbonTab)] ? tabName(App.ribbonTab) : Object.keys(set)[0];
    var shape = ribbonShape();
    if (sameShape(ribbonBuilt, shape) && bar.children.length) {
      Array.prototype.forEach.call(bar.querySelectorAll('.rb'), function (b) { if (b._sync) b._sync(); });
      return;
    }
    ribbonBuilt = shape;
    var frag = document.createDocumentFragment();
    shape.items.forEach(function (item) {
      if (item.sep) { frag.appendChild(el('div', { class: 'rb-sep' + (item.extra ? ' rb-extra' : '') })); return; }
      if (item.stack) {
        // rfC: a grid stack (the sketch entities) shows icons only, three rows filled column by column, as SolidWorks
        // does; its labels stay in the buttons (hidden) for the accessible names, the » menu and lookups by label
        var st = el('div', { class: 'rb-stack' + (item.grid ? ' rb-grid' : '') + (item.cls ? ' ' + item.cls : '') + (item.extra ? ' rb-extra' : '') });
        item.stack.forEach(function (s) { st.appendChild(s.fly ? ribbonFlyout(s, true) : ribbonButton(s, true)); });   // a small flyout in a stack (Ellipse)
        frag.appendChild(st);
        return;
      }
      var node = item.fly ? ribbonFlyout(item) : ribbonButton(item);   // r14/commands14: a flyout button
      if (item.extra) node.classList.add('rb-extra');
      frag.appendChild(node);
    });
    bar.innerHTML = '';
    bar.appendChild(frag);
    fitRibbon();   // r12/chrome12
    var tabs = $('ribbon-tabs');
    // switching tabs keeps the tab strip (and the hover on it): only the active mark moves
    if (tabs.getAttribute('data-shape') === shape.tabs && tabs.children.length) {
      Array.prototype.forEach.call(tabs.children, function (t) { if (!t.classList.contains('off')) t.classList.toggle('active', t.textContent === App.ribbonTab); });
      return;
    }
    tabs.setAttribute('data-shape', shape.tabs);
    var tfrag = document.createDocumentFragment();
    shape.tabNames.forEach(function (name) {
      tfrag.appendChild(el('button', { class: 'rtab' + (name === App.ribbonTab ? ' active' : ''), text: name, onclick: function () { if (App.mode !== 'sketch') tabBeforeSketch = null; else if (name !== tabName('Sketch')) tabBeforeSketch = name; setRibbonTab(name); } }));
    });
    shape.extraTabs.forEach(function (name) {
      tfrag.appendChild(el('button', { class: 'rtab off', text: name, title: 'Not available in this build', style: 'opacity:.5' }));
    });
    tabs.innerHTML = '';
    tabs.appendChild(tfrag);
    fitRibbon();   // r12/chrome12: the tab strip changed
  }
  // p9-pm: the CommandManager stays on the tab the user was on, as in SolidWorks. Opening a sketch shows the Sketch tab
  // (ui-sketch.js enterSketch); closing it asks for Features (exitSketch), which goes back to the tab the sketch was
  // started from instead (Sheet Metal ▸ Base Flange or Extruded Cut return to Sheet Metal). A tab the user clicks
  // while sketching is where the sketch leaves them.
  // lane DL (fidelity #13): a non-Sketch tab clicked while sketching becomes tabBeforeSketch, so a sketch started from
  // the Sketch tab and finished by Sheet Metal > Extruded Cut (or any command on that tab) comes back to Sheet Metal.
  var tabBeforeSketch = null;
  function setRibbonTab(name) {
    // lane profiles: Sketch / Features are the profile's sketch and solids tabs (Mastercam: Wireframe / Solids)
    var skTab = tabName('Sketch'), ftTab = tabName('Features');
    name = tabName(name);
    if (name === skTab && App.mode === 'sketch') { if (App.ribbonTab !== skTab && tabBeforeSketch == null) tabBeforeSketch = App.ribbonTab; }
    else if (name === ftTab && App.mode !== 'sketch' && tabBeforeSketch != null) {
      var back = App.ribbonTab === skTab ? tabBeforeSketch : App.ribbonTab;
      tabBeforeSketch = null;
      if (ribbonSet()[back]) name = back;
    }
    App.ribbonTab = name; refreshRibbon();
  }

  // r12/chrome12: the CommandManager fits the window as in SolidWorks. Level 1 drops the labels of the small stacked
  // buttons, level 2 the labels of the large ones; whatever still does not fit moves, from the right end, into a »
  // menu. Nothing scrolls. The buttons stay in the DOM (hidden ones only get .rb-over), so lookups by label still work.
  function fitRibbon() { var r = fitRibbonLevels(); rbSnap(); return r; }
  function fitRibbonLevels() {
    var rib = $('ribbon'), bar = $('ribbon-buttons');
    if (!rib || !bar) return;
    // the tab strip: greyed-out tabs that do not fit whole are left out rather than cut in half
    var tabs = $('ribbon-tabs');
    if (tabs) {
      var offs = Array.prototype.filter.call(tabs.children, function (t) { if (t.style.display) t.style.display = ''; return t.classList.contains('off'); });
      for (var k = offs.length - 1; k >= 0 && tabs.scrollWidth > tabs.clientWidth + 1; k--) offs[k].style.display = 'none';
    }
    longLabels(bar);
    var more = bar.querySelector('.rb-more');
    if (!more) {
      var wasOpen = false;
      more = el('button', { class: 'rb-more', text: '»', title: 'More commands', 'aria-label': 'More commands',
        onmousedown: function () { wasOpen = more.classList.contains('open'); },
        onclick: function () { if (wasOpen) { wasOpen = false; return; } showRibbonOverflow(more); } });
    }
    if (bar.lastChild !== more) bar.appendChild(more);
    frameUncollapse(bar);
    if (frame && frameRibbon('captions')) return frameFit(rib, bar, more);   // lane mcribbon: Mastercam's way
    rib.classList.remove('fit-1', 'fit-2');
    var kids = Array.prototype.filter.call(bar.children, function (c) { return c !== more; });
    kids.forEach(function (c) { if (c.classList.contains('rb-over')) c.classList.remove('rb-over'); });
    more.hidden = true;
    function fits() { return bar.scrollWidth <= bar.clientWidth + 1; }
    if (fits()) return 0;
    // Anvil's own commands after SolidWorks' (`extra` items) go to the » menu before any SolidWorks button loses its label
    var extras = kids.filter(function (c) { return c.classList.contains('rb-extra'); });
    if (extras.length) {
      extras.forEach(function (c) { c.classList.add('rb-over'); });
      more.hidden = false;
      if (fits()) return 0;
      extras.forEach(function (c) { c.classList.remove('rb-over'); });
      more.hidden = true;
    }
    rib.classList.add('fit-1');
    if (fits()) return 1;
    // a few buttons in the » menu are better than no labels at all: keep the labels while at most 4 buttons overflow
    more.hidden = false;
    if (overflow() <= 4) return 2;
    kids.forEach(function (c) { c.classList.remove('rb-over'); });
    more.hidden = true;
    rib.classList.add('fit-2');
    if (fits()) return 3;
    more.hidden = false;
    overflow();
    return 4;
    function overflow() {
      for (var i = kids.length - 1; i > 0 && !fits(); i--) kids[i].classList.add('rb-over');
      // never end the visible row on a separator
      for (var j = kids.length - 1; j >= 0; j--) { if (kids[j].classList.contains('rb-over')) continue; if (kids[j].classList.contains('rb-sep')) kids[j].classList.add('rb-over'); else break; }
      return bar.querySelectorAll(':scope > .rb-over.rb, :scope > .rb-over .rb').length;
    }
  }
  // rfLF: the CommandManager keeps one height on every tab (rfGX pins it): a large button's label is two lines at most.
  // A line that would wrap again inside the 64 px button (Linear Component / Pattern made three lines and the bar grew
  // 13 px) widens that button instead (.rb-long: its \n lines kept whole), as SolidWorks sizes a button to its label.
  function longLabels(bar) {
    Array.prototype.forEach.call(bar.querySelectorAll(':scope > .rb, :scope > .rb-fly:not(.rb-fly-small) > .rb'), function (b) {
      var s = b.querySelector(':scope > span');
      if (b.classList.contains('rb-long')) b.classList.remove('rb-long');
      if (!s || !s.offsetHeight) return;
      var lh = parseFloat(window.getComputedStyle(s).lineHeight) || 13;
      if (s.scrollHeight > lh * (frame ? 2.5 : 3.5)) b.classList.add('rb-long');   // lane swribbon: SolidWorks' 117 px CommandManager has room for three lines (Convert / to Sheet / Metal)
    });
  }
  // lane mcribbon: under a frame with captions (Mastercam) small buttons keep their labels whenever the tab fits; when it
  // does not, whole groups collapse into one button (the group's name and first icon, ▾ lists its commands), the last
  // group first, as Mastercam's ribbon does; only when every group is collapsed and it still does not fit does the »
  // menu take the rest. Collapsed nodes keep their place in the bar (.mc-col, hidden), so ribbonBuilt.items still lines
  // up with the bar's children once the .mc-colbtn buttons are left out.
  function frameUncollapse(bar) {
    Array.prototype.slice.call(bar.querySelectorAll(':scope > .mc-colbtn')).forEach(function (b) { b.remove(); });
    Array.prototype.forEach.call(bar.querySelectorAll(':scope > .mc-col'), function (c) { c.classList.remove('mc-col'); c._mcCol = null; });
  }
  function frameCollapse(bar, g) {
    var w0 = 0;
    g.nodes.forEach(function (n) { w0 += n.getBoundingClientRect().width; });
    var first = g.nodes[0], fb = first.matches('.rb') ? first : first.querySelector('.rb');
    var b = el('button', { class: 'rb mc-colbtn', 'aria-label': g.name, 'aria-haspopup': 'menu', 'data-group': g.name });
    b.innerHTML = (fb && fb.dataset.icon ? Icons(fb.dataset.icon, rbIcon()) : '') + '<span>' + escHtml(g.name) + '<i class="mc-caret" aria-hidden="true"></i></span>';
    b._nodes = g.nodes;
    b.addEventListener('click', function () {
      var items = ribbonMenuItems(b._nodes), r = b.getBoundingClientRect();
      if (items.length) showMenu(r.left, r.bottom + 1, items, b);
    });
    setTip(b, { name: g.name, desc: 'The ' + g.name + ' group: the window is too narrow to show its buttons' });
    bar.insertBefore(b, first);
    g.nodes.forEach(function (n) { n.classList.add('mc-col'); n._mcCol = b; });
    if (b.getBoundingClientRect().width >= w0) { b.remove(); g.nodes.forEach(function (n) { n.classList.remove('mc-col'); }); return false; }
    return true;
  }
  function frameFit(rib, bar, more) {
    rib.classList.remove('fit-1', 'fit-2');
    var kids = Array.prototype.filter.call(bar.children, function (c) { return c !== more; });
    kids.forEach(function (c) { if (c.classList.contains('rb-over')) c.classList.remove('rb-over'); });
    more.hidden = true;
    function fits() { return bar.scrollWidth <= bar.clientWidth + 1; }
    if (fits()) return 0;
    var items = ribbonBuilt && ribbonBuilt.items;
    if (items && items.length === kids.length) {
      var groups = [], cur = null;
      items.forEach(function (it, i) {
        if (it.sep || !it.group) { cur = null; return; }
        if (!cur || cur.name !== it.group) { cur = { name: it.group, nodes: [] }; groups.push(cur); }
        cur.nodes.push(kids[i]);
      });
      for (var g = groups.length - 1; g >= 0; g--) { frameCollapse(bar, groups[g]); if (fits()) return 1; }
    }
    // still too wide: the » menu takes the rest from the right (collapsed groups as one entry each)
    var all = Array.prototype.filter.call(bar.children, function (c) { return c !== more && !c.classList.contains('mc-col'); });
    more.hidden = false;
    for (var i = all.length - 1; i > 0 && !fits(); i--) all[i].classList.add('rb-over');
    for (var j = all.length - 1; j >= 0; j--) { if (all[j].classList.contains('rb-over')) continue; if (all[j].classList.contains('rb-sep')) all[j].classList.add('rb-over'); else break; }
    return 4;
  }
  UI.frameRibbonCollapsed = function () { return Array.prototype.map.call(document.querySelectorAll('#ribbon-buttons > .mc-colbtn:not(.rb-over)'), function (b) { return b.getAttribute('data-group'); }); };
  // the menu entries of ribbon nodes (buttons, flyouts, stacks): the » menu and a collapsed group's ▾
  function ribbonMenuItems(nodes) {
    var items = [];
    nodes.forEach(function (c) {
      if (c.classList.contains('rb-sep')) { if (items.length && !items[items.length - 1].sep) items.push({ sep: true }); return; }
      if (c._nodes) { items.push.apply(items, ribbonMenuItems(c._nodes)); return; }
      if (c._fly) { items.push.apply(items, flyMenuItems(c._fly)); return; }
      var btns = c.classList.contains('rb') ? [c] : Array.prototype.slice.call(c.querySelectorAll(':scope > .rb, :scope > .rb-fly'));
      btns.forEach(function (b) { if (b._fly) { items.push.apply(items, flyMenuItems(b._fly)); return; } items.push({ label: b.getAttribute('aria-label') || b.textContent, icon: b.dataset.icon, checked: b.classList.contains('active'), disabled: b.disabled, action: function () { b.click(); } }); });
    });
    while (items.length && items[items.length - 1].sep) items.pop();
    return items;
  }
  function showRibbonOverflow(anchor) {
    var items = [];
    Array.prototype.forEach.call($('ribbon-buttons').children, function (c) {
      if (!c.classList.contains('rb-over')) return;
      if (c._nodes) { items.push.apply(items, ribbonMenuItems(c._nodes)); return; }   // lane mcribbon: a collapsed group
      if (c.classList.contains('rb-sep')) { if (items.length && !items[items.length - 1].sep) items.push({ sep: true }); return; }
      if (c._fly) { items.push.apply(items, flyMenuItems(c._fly)); return; }   // r14/commands14: a flyout lists its whole group
      var btns = c.classList.contains('rb') ? [c] : Array.prototype.slice.call(c.querySelectorAll(':scope > .rb, :scope > .rb-fly'));
      btns.forEach(function (b) { if (b._fly) { items.push.apply(items, flyMenuItems(b._fly)); return; } items.push({ label: b.getAttribute('aria-label') || b.textContent, icon: b.dataset.icon, checked: b.classList.contains('active'), disabled: b.disabled, action: function () { b.click(); } }); });
    });
    while (items.length && items[items.length - 1].sep) items.pop();
    if (!items.length) return;
    var r = anchor.getBoundingClientRect();
    showMenu(r.right, r.bottom + 1, items, anchor);
    if (openMenu) openMenu.style.left = Math.max(4, r.right - openMenu.offsetWidth) + 'px';
  }

  // rfIA (user 2026-11-05: "make the top menu able to be enlarged by dragging downwards, the icons have to keep their
  // sharpness"): the CommandManager's size. A grip along its bottom edge (#ribbon-grip) drags it taller; everything in it
  // grows with it: buttons, captions, stacks, the » and ▾, the tab strip. No transform / zoom: every ribbon rule of the
  // style sheets is copied into one <style id="ribbon-scale"> with its px lengths (and px var() tokens) times the scale,
  // rounded to whole px (hairlines of 1 px stay 1 px), and the icons are drawn again at the new size (icons.js weighs the
  // strokes for it). Scale 1 = no sheet at all, so the default look is exactly the old one. The flyout / » menus keep
  // their size. Kept in localStorage 'anvil.ribbonScale' (a ui-smoke frame uses its own key, so neither leaks).
  var RB_MIN = 1, RB_MAX = 2.5, rbScale = 1, rbStyle = null, rbRules = null, rbSheetCount = -1;
  var RB_KEY = (function () { var t = false; try { t = !!(window.frameElement && /\/tests\//.test(window.parent.location.pathname)); } catch (e) { } return t ? 'anvil.test.ribbonScale' : 'anvil.ribbonScale'; })();
  function rbClamp(s) { s = +s; if (!(s > RB_MIN)) return RB_MIN; return Math.round(Math.min(RB_MAX, s) * 1000) / 1000; }
  try { rbScale = rbClamp(parseFloat(localStorage.getItem(RB_KEY))); } catch (e) { }
  // the icon sizes: large 32 px, small (stacks, grid) 16 px boxes (drawn at 18 at scale 1, as before); lane swribbon:
  // without a frame (SolidWorks, large buttons as the user runs it) small buttons are 32 px too
  // lane swribbon: the chrome's own icons (Quick Access toolbar, FeatureManager tabs, Heads-up View toolbar, Task Pane
  // tabs) are 32 px in SolidWorks' large-button look and keep their small size under a profile's frame (Mastercam)
  function swIcon(small) { return frame ? small : 32; }
  UI.chromeIconSize = swIcon;
  function chromeIconsSync() {
    var px = swIcon(16);
    if (stdBuilt) {
      var u = $('std-undo'), r = $('std-redo');
      if (u) u.innerHTML = Icons('undo', px);
      if (r) r.innerHTML = Icons('redo', px);
      STD_BUTTONS.forEach(function (d) { var b = $(d[0]); if (b) b.innerHTML = Icons(d[1], px); });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#fm-tabs button[data-tab]'), function (b) {
      var t = FM_TABS.filter(function (x) { return x[0] === b.dataset.tab; })[0];
      if (t) b.innerHTML = Icons(t[1], px);
    });
    fitFmTabs();
    if (UI.syncTaskStripIcons) UI.syncTaskStripIcons();
    refreshHud();
  }
  function rbIcon(small) { if (small && !frame) return Math.round(32 * rbScale); return small ?(rbScale === 1 ? 18 : Math.round(16 * rbScale)) : Math.round(32 * rbScale); }   // lane mcribbon: Mastercam's large icons are 32 px too (measured; rfLX had 24 under a frame with captions)
  var RB_SEL = /#ribbon(?!-grip)|\.rtab(?![\w-])|\.rb(?![\w-])|\.rb-(?:stack|sep|fly|caret|more|grid|vgrid|wide|long|face|over|extra|caption|has-captions)/;
  function rbSplitSel(t) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // every style rule (in document order) that styles the CommandManager: { sel (its ribbon selectors only), text, wrap }
  function rbCollect() {
    var out = [];
    function walk(rules, wrap) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.selectorText != null) {
          var parts = rbSplitSel(r.selectorText).filter(function (p) { return RB_SEL.test(p); });
          if (parts.length && r.style && r.style.cssText) out.push({ sel: parts.join(', '), text: r.style.cssText, wrap: wrap });
        } else if (r.cssRules && r.conditionText != null) walk(r.cssRules, (r.media ? '@media ' : '@supports ') + r.conditionText);
      }
    }
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      if (rbStyle && sheets[i].ownerNode === rbStyle) continue;
      try { walk(sheets[i].cssRules, null); } catch (e) { }
    }
    return out;
  }
  function rbScaled(text, s, cs) {
    text = text.replace(/var\(\s*(--[\w-]+)\s*\)/g, function (all, v) { var x = cs.getPropertyValue(v).trim(); return /^-?[\d.]+px$/.test(x) ? x : all; });
    return text.replace(/(-?\d*\.?\d+)px\b/g, function (all, n) { var v = parseFloat(n); return Math.abs(v) <= 1 ? all : Math.round(v * s) + 'px'; });
  }
  function rbSheetText(s) {
    if (s === 1) return '';
    var count = document.styleSheets.length - (rbStyle ? 1 : 0);
    if (!rbRules || count !== rbSheetCount) { rbRules = rbCollect(); rbSheetCount = count; }
    var cs = getComputedStyle($('ribbon') || document.documentElement);
    var css = rbRules.map(function (r) { var t = r.sel + ' { ' + rbScaled(r.text, s, cs) + ' }'; return r.wrap ? r.wrap + ' { ' + t + ' }' : t; });
    // ui-transform.js puts the group captions 15 px above the bottom of the buttons (16 px padding - 1): keep them in
    // their own (scaled) padding band
    css.push('#ribbon .rb-captions { margin-top: ' + (16 - Math.round(16 * s)) + 'px; }');
    return css.join('\n');
  }
  function rbApply(atBoot) {
    var text = rbSheetText(rbScale);
    if (!rbStyle && text) { rbStyle = document.createElement('style'); rbStyle.id = 'ribbon-scale'; }
    if (rbStyle) {
      if (rbStyle.textContent !== text) rbStyle.textContent = text;
      // after every other style sheet, so each copy wins over its original (same selector, later in the document)
      var all = document.querySelectorAll('style, link[rel="stylesheet"]'), last = all[all.length - 1];
      if (text && last !== rbStyle) (last && last.parentNode === document.body ? document.body : document.head).appendChild(rbStyle);
      if (!text && rbStyle.parentNode) rbStyle.parentNode.removeChild(rbStyle);
    }
    var rib = $('ribbon');
    if (rib) rib.classList.toggle('rb-scaled', rbScale !== 1);
    var bar = $('ribbon-buttons');
    if (bar) Array.prototype.forEach.call(bar.querySelectorAll('.rb'), function (b) { if (b._sync) b._sync(); });
    if (atBoot) return;
    fitRibbon();
    if (UI.resize) UI.resize();   // the graphics area got shorter / taller: the 3D view follows at once
  }
  // an enlarged ribbon's boxes are whole px but centring can leave an icon on a half pixel (blurred): shift each icon
  // (position: relative, no layout change, no transform) onto whole device pixels. Run after every fit (fitRibbon).
  function rbSnap() {
    var rib = $('ribbon');
    if (!rib) return;
    var icons = rib.querySelectorAll('.rb svg.ico'), dpr = window.devicePixelRatio || 1, moves = [], i;
    for (i = 0; i < icons.length; i++) {
      var ic = icons[i];
      if (rbScale === 1) { if (ic.style.position) moves.push([ic, null]); continue; }
      var r = ic.getBoundingClientRect();
      if (!r.width) continue;
      var x = r.left - (parseFloat(ic.style.left) || 0), y = r.top - (parseFloat(ic.style.top) || 0);
      moves.push([ic, (Math.round(x * dpr) - x * dpr) / dpr, (Math.round(y * dpr) - y * dpr) / dpr]);
    }
    for (i = 0; i < moves.length; i++) {
      var m = moves[i], st = m[0].style;
      if (m[1] === null || (Math.abs(m[1]) < 0.005 && Math.abs(m[2]) < 0.005)) { if (st.position) { st.position = ''; st.left = ''; st.top = ''; } continue; }
      st.position = 'relative'; st.left = (Math.round(m[1] * 1000) / 1000) + 'px'; st.top = (Math.round(m[2] * 1000) / 1000) + 'px';
    }
  }
  // UI.setRibbonScale(s[, noSave]) -> the scale shown (1 .. 2.5); UI.ribbonScale() -> the scale
  function setRibbonScale(s, noSave) {
    s = rbClamp(s);
    var changed = s !== rbScale;
    rbScale = s;
    if (changed) rbApply();
    if (!noSave) try { if (s === 1) localStorage.removeItem(RB_KEY); else localStorage.setItem(RB_KEY, String(s)); } catch (e) { }
    return rbScale;
  }
  // the scale that makes the CommandManager h px tall (heights are close to proportional; two corrections)
  function rbScaleToHeight(h, from) {
    var rib = $('ribbon'), s = rbClamp(from.s * h / from.h);
    for (var k = 0; k < 3; k++) {
      setRibbonScale(s, true);
      var got = rib.getBoundingClientRect().height;
      if (Math.abs(got - h) < 1 || !got) break;
      var next = rbClamp(s * h / got);
      if (next === s) break;
      s = next;
    }
  }
  function addRibbonGrip() {
    var rib = $('ribbon');
    if (!rib || $('ribbon-grip')) return;
    var g = el('div', { id: 'ribbon-grip', title: 'Drag down to enlarge the CommandManager; double-click for the default size' });
    var start = null;
    g.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      start = { y: e.clientY, h: rib.getBoundingClientRect().height, s: rbScale };
      try { g.setPointerCapture(e.pointerId); } catch (er) { }
      g.classList.add('dragging'); document.body.classList.add('splitting-v');
    });
    g.addEventListener('pointermove', function (e) { if (start) rbScaleToHeight(start.h + e.clientY - start.y, start); });
    function end() {
      if (!start) return;
      start = null;
      g.classList.remove('dragging'); document.body.classList.remove('splitting-v');
      setRibbonScale(rbScale);   // keep it
      fitWorkspace();
    }
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('lostpointercapture', end);
    g.addEventListener('dblclick', function () { setRibbonScale(1); fitWorkspace(); });
    rib.appendChild(g);
  }
  UI.ribbonScale = function () { return rbScale; };
  UI.setRibbonScale = function (s, noSave) { var r = setRibbonScale(s, noSave); fitWorkspace(); return r; };
  UI.ribbonScaleLimits = { min: RB_MIN, max: RB_MAX, key: RB_KEY };

  // r12/chrome12: FeatureManager and Task Pane widths. Each has a drag handle on its inner edge (double-click: default
  // width); the width a user sets is kept in localStorage, and the shown width is clamped so the graphics area keeps
  // at least max(320 px, 35 % of the window): the Task Pane gives way first, then the FeatureManager.
  var PANES = {
    // (user 2026-11-04: "the left panel ... not locked at a minimum size, rather able to be completely hidden with a pull
    // tab always extruded") a drag goes down to dragMin; past it (FM_COLLAPSE) the FeatureManager hides completely, and
    // the pull tab on the graphics area's left edge (#fm-tab) shows it again (click, or drag it out); F9 toggles it as in
    // SolidWorks. min stays the width the window fit gives way to on its own.
    fm: { key: 'anvil.fmWidth', def: 296, min: 200, dragMin: 140, max: 640, css: '--fm-w', pref: null, shown: null },
    tp: { key: 'anvil.tpWidth', def: 340, min: 240, max: 720, css: '--tp-w', pref: null, shown: null }
  };
  function panePref(p) {
    if (p.pref == null) { var n = NaN; try { n = parseFloat(localStorage.getItem(p.key)); } catch (e) { } p.pref = n >= (p.dragMin || p.min) && n <= p.max ? Math.round(n) : p.def; }
    return p.pref;
  }
  function paneWidths() {
    var W = document.documentElement.clientWidth || window.innerWidth, strip = ($('tp-strip') && $('tp-strip').offsetWidth) || 35;
    var tpOpen = $('tp-panel') && !$('tp-panel').hidden;
    var fm = panePref(PANES.fm), tp = panePref(PANES.tp), minVp = Math.max(320, Math.round(W * 0.35)), overlay = false;
    var spare = W - strip - minVp - fm;
    if (fmHidden) fm = 0;
    else if (spare < 0) fm = Math.max(Math.min(fm, PANES.fm.min), fm + spare);
    if (tpOpen) {
      spare = W - strip - minVp - fm - tp;
      if (spare < 0 && tp + spare >= PANES.tp.min) tp += spare;
      // too narrow to dock it: the Task Pane slides out over the graphics area, as SolidWorks' unpinned Task Pane does
      else if (spare < 0) { overlay = true; tp = Math.max(Math.min(PANES.tp.min, W - strip - 8), Math.min(tp, W - strip - 48)); }
    }
    return { fm: fm, tp: tp, W: W, strip: strip, minVp: minVp, tpOpen: tpOpen, overlay: overlay };
  }
  var FM_COLLAPSE = 100, fmHidden = false;
  try { fmHidden = localStorage.getItem('anvil.fmHidden') === '1'; } catch (e) { }
  function syncFmHidden() {
    var main = $('main'), tab = $('fm-tab');
    if (main) main.classList.toggle('fm-hidden', fmHidden);
    if (tab) { tab.classList.toggle('collapsed', fmHidden); tab.title = (fmHidden ? 'Show' : 'Hide') + ' FeatureManager (F9) — click, or drag to resize'; tab.setAttribute('aria-expanded', String(!fmHidden)); }
  }
  // UI.setFeatureManagerHidden(true|false), no argument toggles; returns the new hidden state
  function setFeatureManagerHidden(h, keep) {
    h = h === undefined ? !fmHidden : !!h;
    if (h !== fmHidden) { fmHidden = h; if (!keep) try { localStorage.setItem('anvil.fmHidden', h ? '1' : '0'); } catch (e) { } }
    syncFmHidden(); fitPanels(true);
    return fmHidden;
  }
  // a drag of the FeatureManager's edge or of the pull tab to raw width w: past FM_COLLAPSE it hides, else at least dragMin
  function dragFmTo(raw) {
    var w = paneWidths(), room = w.W - w.strip - w.minVp - (w.tpOpen && !w.overlay ? w.tp : 0), p = PANES.fm;
    if (raw < FM_COLLAPSE) { if (!fmHidden) { fmHidden = true; syncFmHidden(); fitPanels(true); } return; }
    var nw = Math.round(Math.max(p.dragMin, Math.min(p.max, room, raw)));
    p.pref = nw;
    if (fmHidden) { fmHidden = false; syncFmHidden(); }
    if (setPaneWidth(p, nw) && UI.resize) UI.resize();
  }
  function saveFm() { try { localStorage.setItem(PANES.fm.key, String(PANES.fm.pref)); localStorage.setItem('anvil.fmHidden', fmHidden ? '1' : '0'); } catch (e) { } }
  function setPaneWidth(p, w) {
    if (p.shown === w) return false;
    p.shown = w;
    document.documentElement.style.setProperty(p.css, w + 'px');
    return true;
  }
  function fitPanels(redraw) {
    var w = paneWidths(), tpBox = $('taskpane');
    var a = setPaneWidth(PANES.fm, w.fm), b = setPaneWidth(PANES.tp, w.tp), c = false;
    if (tpBox && tpBox.classList.contains('tp-overlay') !== w.overlay) { tpBox.classList.toggle('tp-overlay', w.overlay); c = true; }
    if ((a || b || c) && redraw && UI.resize) UI.resize();
    return w;
  }
  function addSplitter(host, p, sign) {
    if (!host || host.querySelector(':scope > .split')) return;
    var s = el('div', { class: 'split', title: 'Drag to resize; double-click for the default width' });
    var start = null;
    s.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      start = { x: e.clientX, w: p === PANES.fm && fmHidden ? 0 : p.shown || panePref(p) };
      try { s.setPointerCapture(e.pointerId); } catch (er) { }
      s.classList.add('dragging'); document.body.classList.add('splitting');
    });
    s.addEventListener('pointermove', function (e) {
      if (!start) return;
      if (p === PANES.fm) { dragFmTo(start.w + sign * dockSign() * (e.clientX - start.x)); return; }
      var w = paneWidths(), other = p === PANES.fm ? (w.tpOpen && !w.overlay ? w.tp : 0) : w.fm;
      var room = p === PANES.tp && w.overlay ? w.W - w.strip - 48 : w.W - w.strip - w.minVp - other;
      var nw = Math.round(Math.max(p.min, Math.min(p.max, room, start.w + sign * (e.clientX - start.x))));
      p.pref = nw;
      if (setPaneWidth(p, nw) && UI.resize) UI.resize();
    });
    function end() {
      if (!start) return;
      start = null;
      s.classList.remove('dragging'); document.body.classList.remove('splitting');
      if (p === PANES.fm) saveFm(); else try { localStorage.setItem(p.key, String(p.pref)); } catch (er) { }
      fitPanels(true);
    }
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('lostpointercapture', end);
    s.addEventListener('dblclick', function () { if (p === PANES.fm && fmHidden) { fmHidden = false; syncFmHidden(); saveFm(); } p.pref = p.def; try { localStorage.removeItem(p.key); } catch (er) { } fitPanels(true); });
    host.appendChild(s);
  }
  // the pull tab: always out on the graphics area's left edge, beside the FeatureManager or where it was when hidden;
  // a click hides / shows it, a drag pulls it out (or in) to the width under the pointer
  function addFmTab() {
    var vp = $('viewport');
    if (!vp || $('fm-tab')) return;
    var t = el('button', { id: 'fm-tab', type: 'button', 'aria-label': 'FeatureManager', html: '<svg viewBox="0 0 6 10" width="6" height="10" aria-hidden="true"><path d="M5 1 1 5l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    var start = null;
    t.addEventListener('mousedown', function (e) { e.stopPropagation(); });   // not a press in the graphics area
    t.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      start = { x: e.clientX, w: fmHidden ? 0 : PANES.fm.shown || panePref(PANES.fm), moved: false };
      try { t.setPointerCapture(e.pointerId); } catch (er) { }
    });
    t.addEventListener('pointermove', function (e) {
      if (!start) return;
      if (!start.moved && Math.abs(e.clientX - start.x) < 4) return;
      if (!start.moved) { start.moved = true; document.body.classList.add('splitting'); t.classList.add('dragging'); }
      dragFmTo(start.w + dockSign() * (e.clientX - start.x));
    });
    function end() {
      if (!start) return;
      var moved = start.moved; start = null;
      document.body.classList.remove('splitting'); t.classList.remove('dragging');
      if (moved) { saveFm(); fitPanels(true); } else setFeatureManagerHidden();
    }
    t.addEventListener('pointerup', end);
    t.addEventListener('pointercancel', end);
    t.addEventListener('lostpointercapture', end);
    t.addEventListener('click', function (e) { if (e.detail === 0) setFeatureManagerHidden(); });   // keyboard (Enter / Space on the focused tab)
    vp.appendChild(t);
    syncFmHidden();
  }
  UI.setFeatureManagerHidden = setFeatureManagerHidden;
  UI.featureManagerHidden = function () { return fmHidden; };
  // lane profiles: the FeatureManager / PropertyManager column left (SolidWorks) or right of the graphics area
  // (#main.dock-right, style.css); a drag of its edge or pull tab then widens it to the left
  function dockSign() { var m = $('main'); return m && m.classList.contains('dock-right') ? -1 : 1; }
  UI.setTreeDock = function (side) {
    var m = $('main'), right = side === 'right';
    if (!m) return 'left';
    if (m.classList.contains('dock-right') !== right) { m.classList.toggle('dock-right', right); fitPanels(true); if (UI.resize) UI.resize(); }
    return right ? 'right' : 'left';
  };
  UI.treeDock = function () { var m = $('main'); return m && m.classList.contains('dock-right') ? 'right' : 'left'; };
  function fitWorkspace() { fitPanels(true); fitRibbon(); }
  (function initFit() {
    addSplitter($('left'), PANES.fm, 1);
    addFmTab();
    addSplitter($('tp-panel'), PANES.tp, -1);
    addRibbonGrip();   // rfIA
    if (rbScale !== 1) rbApply(true);
    fitPanels(false);
    var queued = false;
    window.addEventListener('resize', function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; fitWorkspace(); }); });
    if (window.MutationObserver && $('tp-panel')) new MutationObserver(function () { fitPanels(true); }).observe($('tp-panel'), { attributes: true, attributeFilter: ['hidden'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitRibbon(); });
  })();

  // ------------------------------------------------------------------ FeatureManager tabs
  // levels: the Levels Manager (ui-levels.js, #levels-panel) is available at any time, also beside an open
  // PropertyManager (the PM tab brings the PM back); while it is the tab in use, a PropertyManager that closes returns
  // to it rather than to the tree (levelsSticky, cleared by picking the tree or ConfigurationManager)
  var FM_TABS = [['tree', 'tree', 'FeatureManager Design Tree'], ['pm', 'pm', 'PropertyManager'], ['config', 'config', 'ConfigurationManager'], ['dimx', 'dimx', 'DimXpertManager'], ['dispman', 'dispman', 'DisplayManager'], ['levels', 'levels', 'Levels Manager']];
  var levelsSticky = false;
  function renderFmTabs() {
    var bar = $('fm-tabs');
    bar.innerHTML = '';
    FM_TABS.forEach(function (t) {
      var b = el('button', { html: Icons(t[1], swIcon(16)), title: t[2], onclick: function () { if (t[0] === 'levels') { if (!$('levels-panel')) { toast('The Levels Manager did not load.'); return; } levelsSticky = true; setFmTab('levels'); return; } if (t[0] === 'pm' && !UI.hasPM()) { toast('The PropertyManager opens when a command is active.'); return; } if (t[0] === 'pm') { setFmTab('pm'); return; } if (t[0] === 'tree' || t[0] === 'config') { if (!UI.hasPM()) { levelsSticky = false; setFmTab(t[0]); } else toast('Finish or cancel the active command first (✓ or ✗).'); return; } if (t[0] !== 'pm') toast(t[2] + ' is not available in this build.'); } });
      b.dataset.tab = t[0];
      bar.appendChild(b);
    });
    // lane swribbon: SolidWorks' chevron at the right of the tab row lists the tabs that do not fit
    var more = el('button', { class: 'fm-more', title: 'More tabs', 'aria-label': 'More tabs', onclick: function () {
      var r = more.getBoundingClientRect();
      showMenu(r.left, r.bottom + 2, Array.prototype.filter.call(bar.querySelectorAll('button.fm-hide[data-tab]'), function () { return true; }).map(function (h) {
        return { label: h.title, checked: h.classList.contains('active'), action: function () { h.click(); } };
      }));
    } });
    more.hidden = true;
    bar.appendChild(more);
    if (window.ResizeObserver && !bar._fmFit) { bar._fmFit = new ResizeObserver(function () { fitFmTabs(); }); bar._fmFit.observe(bar); }
    setFmTab('tree');
    fitFmTabs();
  }
  // lane swribbon: the FeatureManager's large tabs (52 px) keep their size; the ones past the pane's width hide behind
  // the chevron (SolidWorks shows five of them in its default width). Under a frame nothing is hidden.
  function fitFmTabs() {
    var bar = $('fm-tabs'); if (!bar) return;
    var more = bar.querySelector('.fm-more'), tabs = bar.querySelectorAll('button[data-tab]');
    Array.prototype.forEach.call(tabs, function (b) { if (b.classList.contains('fm-hide')) b.classList.remove('fm-hide'); });
    if (more) more.hidden = true;
    if (frame || !more || !bar.clientWidth) return;
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    more.hidden = false;
    for (var i = tabs.length - 1; i > 0 && bar.scrollWidth > bar.clientWidth + 1; i--) tabs[i].classList.add('fm-hide');
  }
  // setFmTab('tree' | 'config' | 'pm'): marks the tab and shows its pane. The PropertyManager (ui-commands openPM /
  // closePM) shows and hides #pm and #fm-tree itself; here 'pm' only hides the ConfigurationManager.
  function setFmTab(name) {
    // lane mcframe: under a frame with managers the left column is the manager panel (or the function panel)
    // lane mcpolish: the ConfigurationManager is a manager tab too (when the profile lists 'config')
    if (frameMgrOn() && (name !== 'config' || (frame.managers.tabs || []).indexOf('config') >= 0)) {
      if (name === 'levels') frameMgr = 'levels';
      if (name === 'config') frameMgr = 'config';
      frameShowManager(null);
      return;
    }
    // levels: a PropertyManager closing (pm -> tree) goes back to the Levels Manager while that is the tab in use
    if (name === 'tree' && levelsSticky && (App.fmTab === 'pm' || App.fmTab === 'levels') && $('levels-panel')) name = 'levels';
    var lp = $('levels-panel');
    if (lp) lp.hidden = name !== 'levels';
    if (name === 'levels') {
      Array.prototype.forEach.call($('fm-tabs').children, function (b) { b.classList.toggle('active', b.dataset.tab === name); });
      App.fmTab = name;
      $('fm-tree').hidden = true; $('pm').hidden = true;
      if ($('config-panel')) $('config-panel').hidden = true;
      if (UI.refreshLevelsPanel) UI.refreshLevelsPanel();
      syncViewTab();   // lane CC: the View tab's FeatureManager / Levels Manager buttons
      return;
    }
    if (name === 'pm' && UI.hasPM && UI.hasPM()) $('pm').hidden = false;
    Array.prototype.forEach.call($('fm-tabs').children, function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    App.fmTab = name;
    var cp = $('config-panel');
    if (name === 'tree') { $('fm-tree').hidden = false; if (cp) cp.hidden = true; }
    else if (name === 'config') { $('fm-tree').hidden = true; if (cp) { cp.hidden = false; refreshConfigPanel(); } }
    else if (cp) cp.hidden = true;
    syncViewTab();
  }

  // ------------------------------------------------------------------ feature tree
  var expanded = {};
  // lane DC (finding #9): Sheet Metal ▸ Flatten toggles the part's flat state (pressed while flat); the Flat Pattern
  // dialog stays UI.cmdFlatten (the tree's Flat-Pattern1 ▸ Flat Pattern…)
  (function walk(list) { (list || []).forEach(function (it) { if (it && (it.stack || it.items)) walk(it.stack || it.items); else if (it) flattenItem(it); }); })(RIBBON['Sheet Metal']);
  function flattenItem(it) {
    if (it.id !== 'flatten') return;
    it.run = function () { (UI.flattenWithBar || UI.toggleFlatten)(); };   // lane progress
    it.active = function () { return !!(App.model && App.model.flatState); };
    it.help = 'Show the part flat with its bend lines; click again to fold it (Flat-Pattern1)';
  }
  // lane DC (finding #8): a sheet part's FeatureManager as SolidWorks shows it: a Sheet-Metal row (the sheet's
  // parameters: double-click / Edit Feature opens the Sheet-Metal PropertyManager) just above the Base Flange, and a
  // Flat-Pattern folder at the end holding Flat-Pattern1 (greyed while the part is folded, i.e. suppressed; Flatten
  // unsuppresses it). DOM: .ti.sm-folder, .ti.fp-folder, .ti.fp-row (.suppressed while folded, .err when the flat
  // fails).
  function sheetMetalRow() {
    var sh = App.model.sheet, units = UI.unitLabel ? UI.unitLabel() : '';
    var row = treeItem({ icon: 'flange', name: 'Sheet-Metal', depth: 1, cls: 'sm-folder', title: 'Sheet-Metal: T ' + sh.thickness + ' ' + units + ', R ' + sh.bendRadius + (K.sheetNote ? ' · ' + K.sheetNote(sh) : '') + ' — double-click to edit' });
    row.addEventListener('click', function () { setStatus('Sheet-Metal: ' + (K.sheetNote ? K.sheetNote(sh) : 'T ' + sh.thickness) + '. Double-click to edit the sheet parameters.'); });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.cmdSheetMetal(); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Edit Feature', action: function () { UI.cmdSheetMetal(); } }]); });
    return row;
  }
  function flatPatternMenu() {
    var flat = !!App.model.flatState;
    return [
      { label: 'Edit Feature', action: function () { UI.cmdFlatPatternEdit(); } },
      { label: flat ? 'Suppress' : 'Unsuppress', action: function () { (UI.flattenWithBar || UI.toggleFlatten)(!flat); } },
      { sep: true },
      { label: 'Flat Pattern…', action: function () { UI.cmdFlatten(); } },
      { label: 'Export DXF…', action: function () { UI.exportFlatDXF(); } }
    ];
  }
  function appendFlatPatternFolder(tree) {
    var flat = !!App.model.flatState, err = flat ? App.flatError : null, open = expanded.flatPattern !== false;
    var folder = treeItem({ icon: 'folder', name: 'Flat-Pattern', depth: 1, cls: 'fp-folder', children: true, open: open, toggle: function () { expanded.flatPattern = !open; refreshTree(); } });
    folder.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, flatPatternMenu()); });
    tree.appendChild(folder);
    var box = el('div', { class: 'tc' + (open ? ' open' : '') });
    var row = treeItem({ icon: err ? 'error' : 'flatten', name: 'Flat-Pattern1', depth: 2, cls: 'fp-row' + (flat ? '' : ' suppressed dim') + (err ? ' err' : ''),
      title: err ? 'Flat-Pattern1: ' + err : flat ? 'Flat-Pattern1: the part is shown flat (click Flatten to fold)' : 'Flat-Pattern1 (suppressed): Flatten shows the flat pattern' });
    if (!flat) { var nm = row.querySelector('.nm'); if (nm) nm.style.textDecoration = 'none'; var ic = row.querySelector('svg'); if (ic) ic.style.opacity = '0.45'; }
    row.addEventListener('click', function () { setStatus(err ? 'Flat-Pattern1: ' + err : 'Flat-Pattern1' + (flat ? ': flattened' + (App.flat ? ', ' + UI.fmtNum(App.flat.size[0], 4) + ' × ' + UI.fmtNum(App.flat.size[1], 4) + ' ' + UI.unitLabel() : '') : ' (suppressed)')); });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.cmdFlatPatternEdit(); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, flatPatternMenu()); });
    box.appendChild(row);
    // rfNR3: Flat-Pattern1's children as SolidWorks lists them: the Bend-Lines and Bounding-Box sketches (Show / Hide
    // in the flat view; the bounding box hidden by default) and one row per bend of the flat
    var kids = flatPatternKids(flat), fpOpen = expanded.flatPattern1 === true;
    var tw = row.querySelector('.tw');
    if (tw) { tw.classList.remove('leaf'); tw.textContent = fpOpen ? '▾' : '▸'; tw.addEventListener('click', function (e) { e.stopPropagation(); expanded.flatPattern1 = !fpOpen; refreshTree(); }); }
    var kb = el('div', { class: 'tc' + (fpOpen ? ' open' : '') });
    kids.forEach(function (k) {
      var r = treeItem({ icon: k.icon, name: k.name, depth: 3, cls: 'fp-kid' + (flat ? '' : ' suppressed dim') + (k.hidden ? ' hidden-item' : ''), title: k.title });
      if (k.kind) r.setAttribute('data-fp', k.kind);
      r.addEventListener('click', function () { setStatus(k.title); });
      r.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, k.menu ? k.menu() : [{ label: 'Flat Pattern…', action: function () { UI.cmdFlatten(); } }]); });
      kb.appendChild(r);
    });
    box.appendChild(kb);
    tree.appendChild(box);
    applyFlatShow();
  }
  // what the flat view shows of Flat-Pattern1's sketches (per session, as SolidWorks keeps it per document)
  App.flatHide = App.flatHide || { bendLines: false, bbox: true };
  var BEND_KIND = { flange: 'EdgeBend', sketchedBend: 'SketchBend', jog: 'JogBend', loftedBend: 'LoftedBend', sweptFlange: 'SweptBend', insertBends: 'Bend', convertSM: 'Bend' };
  function flatPatternKids(flat) {
    var F = App.flat, units = UI.unitLabel ? UI.unitLabel() : '', out = [];
    function fmt(v) { return UI.fmtNum ? UI.fmtNum(v, 4) : String(+(+v).toFixed(4)); }
    function showMenu1(key, label) {
      return function () {
        var hidden = !!App.flatHide[key];
        return [{ label: hidden ? 'Show' : 'Hide', help: (hidden ? 'Show ' : 'Hide ') + label + ' in the flat pattern', disabled: !flat, why: 'Flatten the part to see it', action: function () { App.flatHide[key] = !hidden; applyFlatShow(); refreshTree(); } }, { label: 'Flat Pattern…', action: function () { UI.cmdFlatten(); } }];
      };
    }
    var nb = F ? F.bends.length : 0;
    out.push({ kind: 'bendLines', icon: 'sketch', name: 'Bend-Lines1', hidden: App.flatHide.bendLines, title: flat ? 'Bend-Lines1: ' + nb + ' bend line' + (nb === 1 ? '' : 's') + (App.flatHide.bendLines ? ' (hidden)' : '') : 'Bend-Lines1: the bend lines of the flat (Flatten shows them)', menu: showMenu1('bendLines', 'the bend lines') });
    out.push({ kind: 'bbox', icon: 'sketch', name: 'Bounding-Box1', hidden: App.flatHide.bbox, title: flat && F ? 'Bounding-Box1: ' + fmt(F.size[0]) + ' × ' + fmt(F.size[1]) + ' ' + units + (App.flatHide.bbox ? ' (hidden; right-click ▸ Show)' : '') : 'Bounding-Box1: the smallest rectangle round the flat (Flatten shows it)', menu: showMenu1('bbox', 'the bounding box') });
    var count = {};
    (F ? F.bends : []).forEach(function (bd) {
      var fid = bd.id != null ? +String(bd.id).split(':')[0] : null, g = fid != null ? K.findFeature(App.model, fid) : null;
      var kind = g ? (g.hem ? 'HemBend' : g.miter ? 'MiterBend' : BEND_KIND[g.type] || (g.sheetBase ? 'Bend' : 'Bend')) : 'Bend';
      count[kind] = (count[kind] || 0) + 1;
      out.push({ kind: 'bend', icon: 'bend', name: kind + count[kind], title: kind + count[kind] + (g ? ' (' + g.name + ')' : '') + ': ' + (bd.label || (bd.angle + '°')) + (bd.ba != null ? ', BA ' + fmt(bd.ba) : '') + (bd.bd != null ? ', BD ' + fmt(bd.bd) : '') + ' ' + units });
    });
    return out;
  }
  // the flat view follows App.flatHide: the bend lines' visibility, the bounding box drawn on the flat's top face
  function applyFlatShow() {
    var grp = UI.flatGroup;
    if (!grp || typeof THREE === 'undefined') return;
    var kids = grp.children, bb = null, bl = null;
    kids.forEach(function (c) { if (c.userData.flatBends) bl = c; if (c.userData.flatBBox) bb = c; });
    if (bl && bl.visible === !!App.flatHide.bendLines) { bl.visible = !App.flatHide.bendLines; if (UI.requestRender) UI.requestRender(); }
    var want = !App.flatHide.bbox && !!App.flatBounds && !!App.flat;
    if (!want && bb) { grp.remove(bb); bb.geometry.dispose(); if (UI.requestRender) UI.requestRender(); }
    if (want && !bb) {
      var lo = App.flatBounds.min, hi = App.flatBounds.max, ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      var t = ext.indexOf(Math.min.apply(null, ext)), a = (t + 1) % 3, b = (t + 2) % 3, h = hi[t] + 1e-3 * (ext[t] || 1);
      function P(u, v) { var p = [0, 0, 0]; p[t] = h; p[a] = u; p[b] = v; return p; }
      var c = [P(lo[a], lo[b]), P(hi[a], lo[b]), P(hi[a], hi[b]), P(lo[a], hi[b])], seg = [];
      for (var i = 0; i < 4; i++) Array.prototype.push.apply(seg, c[i].concat(c[(i + 1) % 4]));
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
      bb = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a7bd5 }));
      bb.userData.flatBBox = true;
      grp.add(bb);
      if (UI.requestRender) UI.requestRender();
    }
  }
  UI.applyFlatShow = applyFlatShow;
  var FEATURE_ICON = { sketch: 'sketch', plane: 'planeSmall', extrude: 'extrude', revolve: 'revolve', lpattern: 'lpattern', cpattern: 'cpattern', mirror: 'mirror', chamfer: 'chamfer', fillet: 'fillet', flange: 'bend', jog: 'bend', sweep: 'sweep', loft: 'loft', shell: 'shell', import: 'imported', hole: 'holeWizard' };
  FEATURE_ICON.refaxis = 'refAxis'; FEATURE_ICON.refpoint = 'refPoint'; FEATURE_ICON.csys = 'csys';   // lane CZ: reference geometry
  FEATURE_ICON.rip = 'rip';   // lane DI
  FEATURE_ICON.vent = 'vent';   // lane DT
  FEATURE_ICON.crossBreak = 'crossBreak';   // lane cross-break
  FEATURE_ICON.cornerRelief = 'cornerRelief';   // lane smtrim (Corners flyout)
  FEATURE_ICON.loftedBend = 'loft';   // lane dxfout-2 (Lofted-Bend)
  FEATURE_ICON.weldedCorner = 'weldedCorner';   // lane smcorner (Corners flyout)
  FEATURE_ICON.sweptFlange = 'sweptFlange';   // lane sweptflange (Swept Flange)
  FEATURE_ICON.formingTool = 'formingTool';   // lane forming
  FEATURE_ICON.draft = 'draft';   // rfDX
  FEATURE_ICON.splitLine = 'splitLine'; FEATURE_ICON.sketch3d = 'sketch3d';   // rfLQ
  FEATURE_ICON.helix = 'helix'; FEATURE_ICON.projCurve = 'projCurve'; FEATURE_ICON.compositeCurve = 'compositeCurve'; FEATURE_ICON.xyzCurve = 'xyzCurve'; FEATURE_ICON.refPtCurve = 'refPtCurve';   // rfFA
  FEATURE_ICON.wrap = 'wrap';   // rfDZ
  FEATURE_ICON.insertBends = 'insertBends'; FEATURE_ICON.convertSM = 'convertSM';   // lane DQ
  FEATURE_ICON.rib = 'rib'; FEATURE_ICON.intersect = 'intersect';   // rfDY
  FEATURE_ICON.deleteBody = 'deleteBody';   // rfHT: Body-Delete/Keep
  FEATURE_ICON.boundary = 'boundary';   // rfFB (a Boundary Cut: featureIcon)
  function featureIcon(f) {
    if (f.type === 'loftedBend' && setIcon('loftedBend')) return 'loftedBend';   // rfNG (lane swparticons): its own picture when the set draws it, else Loft's
    if (f.type === 'extrude') return f.cut ? 'cut' : (f.sheetBase ? 'flange' : 'extrude');
    if (f.type === 'revolve') return f.cut ? 'revolveCut' : 'revolve';
    if (f.type === 'boundary') return f.cut ? 'boundaryCut' : 'boundary';   // rfFB
    if (f.type === 'flange') return f.miter ? 'miter' : (f.hem ? 'hem' : 'bend');
    if (f.type === 'jog') return 'jog';
    if (f.type === 'sketchedBend') return 'sketchedBend';
    if (f.type === 'breakCorner') return 'breakCorner';   // lane CP
    if (f.type === 'closedCorner') return 'closedCorner';   // lane CS
    if (f.type === 'formingTool' && f.tool && Icons.has && Icons.has('ft' + f.tool.charAt(0).toUpperCase() + f.tool.slice(1))) return 'ft' + f.tool.charAt(0).toUpperCase() + f.tool.slice(1);   // lane forming
    if (f.type === 'unfold' || f.type === 'fold') return f.type;   // lane DB
    return FEATURE_ICON[f.type] || 'generic';
  }
  function treeItem(opts) {
    var row = el('div', { class: 'ti' + (opts.cls ? ' ' + opts.cls : '') });
    row.style.paddingLeft = (6 + (opts.depth || 0) * (frame ? 14 : 22)) + 'px';   // lane swribbon: SolidWorks indents a level by 22 px (a child's icon under its parent's, the arrow beside)
    var tw = el('span', { class: 'tw' + (opts.children ? '' : ' leaf'), text: opts.open ? '▾' : '▸' });
    row.appendChild(tw);
    var ic = el('span');
    var icn = opts.icon === 'folder' && setIcon('folder' + String(opts.name).replace(/[^A-Za-z].*$/, '')) ? 'folder' + String(opts.name).replace(/[^A-Za-z].*$/, '') : opts.icon;   // rfMD: History, Solid Bodies, Cut list, Flat-Pattern
    ic.appendChild(Icons.node ? Icons.node(icn, 16) : el('span', { html: Icons(icn, 16) }));
    row.appendChild(ic);
    var nm = el('span', { class: 'nm', text: opts.name, title: opts.title || opts.name });
    // rfBG: a sketch's definition prefix ("(-) ", "(+) ", "(?) ") in its own span, coloured by the stylesheet; the
    // name's text is unchanged
    var pf = /^\((-|\+|\?)\) /.exec(opts.name);
    if (pf && opts.prefix) {
      nm.textContent = opts.name.slice(pf[0].length);
      nm.insertBefore(el('span', { class: 'ti-pfx ' + ({ '-': 'under', '+': 'over', '?': 'conflict' }[pf[1]]), text: pf[0] }), nm.firstChild);
    }
    row.appendChild(nm);
    if (opts.badge) row.appendChild(el('span', { class: 'badge', text: opts.badge }));
    if (opts.children) tw.addEventListener('click', function (e) { e.stopPropagation(); opts.toggle(); });
    return row;
  }
  function refreshTree() {
    syncStdToolbar();
    if (frame) frameSoon();   // lane mcframe: the Solids / Planes managers and the status bar follow the tree
    if (isAsm()) { refreshAssemblyTree(); return; }
    var tree = $('tree');
    tree.innerHTML = '';
    var m = App.model, filter = ($('tree-filter-input').value || '').toLowerCase();
    var errors = App.build ? App.build.errors : {}, warnings = App.build ? App.build.warnings : {};
    var ac = K.activeConfiguration ? K.activeConfiguration(m) : null;
    var root = treeItem({ icon: 'part', name: m.name + (ac ? ' (' + ac.name + ')' : ''), children: true, open: true, toggle: function () { } });
    if (UI.rebuildMarkRoot) UI.rebuildMarkRoot(root);   // r12/occtui12: badge, right-click ▸ What's Wrong?
    root.addEventListener('dblclick', function () { renameInline(root, m.name, function (n) { m.name = n; UI.rebuild(); }); });
    tree.appendChild(root);
    // rfNR2: with a filter, the fixed rows show only when their name matches (SolidWorks)
    function fixedHit(name) { return !filter || String(name).toLowerCase().indexOf(filter) >= 0; }
    [['folder', 'History'], ['sensor', 'Sensors'], ['annotations', 'Annotations']].forEach(function (s) { if (fixedHit(s[1])) tree.appendChild(treeItem({ icon: s[0], name: s[1], depth: 1, cls: 'dim' })); });
    appendEquationsFolder(tree, filter);
    if (m.sheet && !filter) appendCutListFolder(tree);   // lane flatopts-2
    appendBodiesFolder(tree, filter);
    // Material row (ui-materials.js: name, Edit Material on double-click, favourites on right-click)
    var matRow = UI.materialTreeRow ? UI.materialTreeRow(treeItem) : treeItem({ icon: 'material', name: (m.materialName || 'Material <not specified>') + '  ·  ' + m.density + ' kg/m³', depth: 1, cls: 'dim' });
    if (fixedHit(matRow.textContent)) tree.appendChild(matRow);
    ['Front', 'Top', 'Right'].filter(function (r) { return fixedHit(r + ' Plane'); }).forEach(function (r) {
      var row = treeItem({ icon: 'planeSmall', name: r + ' Plane', depth: 1, cls: App.sel && App.sel.kind === 'plane' && App.sel.ref === r ? 'selected' : '' });
      row.addEventListener('click', function () { App.sel = { kind: 'plane', ref: r, plane: K.makePlane(r, 0), name: r + ' Plane' }; App.sel2 = null; UI.updatePlanes(); UI.updateHighlights(); refreshTree(); });
      row.addEventListener('dblclick', function () { UI.newSketchOnPlane(r); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Sketch on ' + r + ' Plane', action: function () { UI.newSketchOnPlane(r); } }, { label: 'Normal To', action: function () { UI.viewNormalTo(K.makePlane(r, 0)); } }, { label: (App.view.showPlanes ? 'Hide' : 'Show') + ' planes', action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } }]); });
      tree.appendChild(row);
    });
    if (fixedHit('Origin')) {
      // rfNR3: SolidWorks' Origin row: a click says what it is, right-click Show / Hide (View ▸ Origins)
      var orow = treeItem({ icon: 'origin', name: 'Origin', depth: 1, cls: 'dim origin-row', title: 'Origin: the part\'s 0, 0, 0' });
      orow.addEventListener('click', function () { setStatus('Origin: 0, 0, 0 of the part (View ▸ Origins shows or hides it).'); });
      orow.addEventListener('contextmenu', function (e) {
        e.preventDefault(); e.stopPropagation();
        var on = !!App.view.showOrigin;
        showMenu(e.clientX, e.clientY, [{ label: on ? 'Hide' : 'Show', help: (on ? 'Hide' : 'Show') + ' the origin in the graphics area (View ▸ Origins)', action: function () { App.view.showOrigin = !on; UI.updateOrigin(); } }]);
      });
      tree.appendChild(orow);
    }

    function childSketchIds(f) {
      var ids = [];
      if (f.sketch != null) ids.push(f.sketch);
      if (f.profile != null) ids.push(f.profile);
      if (f.path != null && !Array.isArray(f.path)) ids.push(f.path);
      if (f.sketches) ids = ids.concat(f.sketches);
      return ids;
    }
    var consumedBy = {};
    // rfGQ: a feature below the rollback bar gives its sketch back: the sketch stands on its own above the bar
    UI.rollbarSync();
    m.features.forEach(function (f) { var low = UI.rollbarRolled(f); childSketchIds(f).forEach(function (id) { if (consumedBy[id] == null && !(low && !UI.rollbarRolled(K.findFeature(m, id)))) consumedBy[id] = f.id; }); });
    var smBase = m.sheet ? m.features.filter(function (f) { return f.sheetBase; })[0] || null : null;   // lane DC: Sheet-Metal row above it
    if (m.sheet && !smBase && !filter) tree.appendChild(sheetMetalRow());
    // rfNR2: the filter keeps a feature whose name or an absorbed sketch's name matches (the sketch shown under it);
    // folders (model.treeFolders) hold a run of top-level features, drawn at the first one's place
    function hit(s) { return String(s).toLowerCase().indexOf(filter) >= 0; }
    var folders = normalizeFolders(m, consumedBy), folderOf = {}, curFo = null, curBox = null;
    folders.forEach(function (fo) { fo.ids.forEach(function (id) { folderOf[id] = fo; }); });
    m.features.forEach(function (f) {
      if (f.type === 'sketch' && consumedBy[f.id] != null) return; // shown under its feature
      if (f === smBase && !filter) tree.appendChild(sheetMetalRow());
      var fo = folderOf[f.id] || null;
      if (fo !== curFo) {
        curFo = fo; curBox = null;
        if (fo) {
          var foHit = filter && hit(fo.name);
          var anyHit = !filter || foHit || fo.ids.some(function (id) { var g = K.findFeature(m, id); return g && (hit(g.name) || childSketchIds(g).some(function (k) { var s = consumedBy[k] === g.id && K.findFeature(m, k); return s && hit(s.name); })); });
          if (anyHit) {
            var fOpen = filter ? true : fo.open !== false;
            tree.appendChild(folderRow(fo, fOpen, errors));
            curBox = el('div', { class: 'tc fold-box' + (fOpen ? ' open' : '') });
            curBox.setAttribute('data-folder', String(fo.id));
            curBox._foHit = foHit;
            tree.appendChild(curBox);
          }
        }
      }
      if (fo && !curBox) return;   // a folder with no match
      var host = curBox || tree, depth = curBox ? 2 : 1;
      var kids = childSketchIds(f).filter(function (id) { return consumedBy[id] === f.id; }).map(function (id) { return K.findFeature(m, id); }).filter(Boolean);
      var selfHit = !filter || hit(f.name) || (curBox && curBox._foHit);
      if (filter && !selfHit) { kids = kids.filter(function (k) { return hit(k.name); }); if (!kids.length) return; }
      var isOpen = filter && !selfHit ? true : !!expanded[f.id];
      var row = featureRow(f, depth, kids.length ? { open: isOpen, toggle: function () { expanded[f.id] = !expanded[f.id]; refreshTree(); } } : null, errors, warnings);
      host.appendChild(row);
      if (kids.length) {
        var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
        kids.forEach(function (k) { box.appendChild(featureRow(k, depth + 1, null, errors, warnings)); });
        host.appendChild(box);
      }
    });
    if (m.sheet && !filter) appendFlatPatternFolder(tree);   // lane DC
    // rfBG: SolidWorks' rollback bar, under the last feature, or above the first rolled-back one;
    // rfGQ: drag it, right-click it (rollbarDrag, rollbarMenu)
    var bar = el('div', { class: 'rollbar', title: 'Rollback bar: drag it up or down the tree to roll the part back; right-click for Roll Forward, Roll to Previous, Roll to End' });
    bar.addEventListener('mousedown', function (e) { rollbarDrag(e, bar); });
    bar.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, rollbarMenu(null)); });
    var firstRolled = tree.querySelector('.ti.rolled');
    if (firstRolled && !isUnitRow(firstRolled)) firstRolled = firstRolled.parentNode.previousElementSibling;   // a sketch in its feature's folder
    if (firstRolled && firstRolled.parentNode !== tree && firstRolled.parentNode.firstElementChild === firstRolled) firstRolled = firstRolled.parentNode.previousElementSibling;   // rfNR2: a whole folder rolled: the bar above its row
    if (!filter) (firstRolled ? firstRolled.parentNode : tree).insertBefore(bar, firstRolled || null);
    if (App.sel && (App.sel.kind === 'feature' || App.sel.kind === 'body')) {
      // a row selected elsewhere (the viewport) scrolls into view by the least amount, as in SolidWorks; a visible
      // row leaves the list where it is
      var selRow = tree.querySelector('.ti.selected');
      if (selRow) revealRow(tree, selRow);
    }
    revealOwnerSoon();   // rfNR3
    refreshConfigPanel();   // every rebuild, undo and load refreshes the tree; keep the ConfigurationManager in step
  }
  // rfGQ: the bar moves between the top-level feature rows and the part rolls when the mouse is released; Esc cancels.
  // A tree that scrolls follows the mouse near its top and bottom edges.
  function rollbarDrag(e, bar) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (App.mode === 'sketch' || UI.hasPM()) { setStatus('Close the open command or sketch before moving the rollback bar.'); return; }
    var tree = $('tree'), rows = Array.prototype.slice.call(tree.querySelectorAll(':scope > .ti[data-fid]')), moved = false, target = null;
    function gapAt(y) {
      for (var i = 0; i < rows.length; i++) { var r = rows[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return rows[i]; }
      return null;
    }
    function end() {
      document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); document.removeEventListener('keydown', key, true);
      document.body.classList.remove('rollbar-dragging'); bar.classList.remove('dragging');
    }
    function move(ev) {
      var b = tree.getBoundingClientRect();
      if (ev.clientY < b.top + 14) tree.scrollTop -= 12; else if (ev.clientY > b.bottom - 14) tree.scrollTop += 12;
      target = gapAt(ev.clientY); moved = true;
      if (bar.nextSibling !== target) tree.insertBefore(bar, target);
    }
    function up() {
      end();
      if (!moved) return;
      var f = target ? K.findFeature(App.model, +target.getAttribute('data-fid')) : null;
      if (!UI.rollbarTo(f ? App.model.features.indexOf(f) : App.model.features.length)) refreshTree();
    }
    function key(ev) { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(); refreshTree(); } }
    document.body.classList.add('rollbar-dragging'); bar.classList.add('dragging');
    document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true); document.addEventListener('keydown', key, true);
  }
  // Rollback (on a feature: the bar goes right above it), Roll Forward (one feature), Roll to Previous (where the bar
  // was before its last move), Roll to End
  function rollbarMenu(f) {
    var at = UI.rollbarIndex(), len = App.model.features.length, items = [];
    // rfNR3: a greyed row says why (rfNG)
    if (f) items.push({ label: 'Rollback', help: 'Move the rollback bar to just above this feature', disabled: App.model.features.indexOf(f) === at, why: 'The rollback bar is already above ' + f.name, action: function () { UI.rollbarTo(App.model.features.indexOf(f)); } });
    items.push({ label: 'Roll Forward', help: 'Move the rollback bar down one feature', disabled: at >= len, why: 'The rollback bar is at the end', action: function () { UI.rollbarForward(); } });
    items.push({ label: 'Roll to Previous', help: 'Move the rollback bar back to where it was before its last move', disabled: UI.rollbarPrevIndex() < 0, why: 'The rollback bar has not been moved yet', action: function () { UI.rollbarPrevious(); } });
    items.push({ label: 'Roll to End', help: 'Move the rollback bar below the last feature', disabled: at >= len, why: 'The rollback bar is at the end', action: function () { UI.rollbarEnd(); } });
    return items;
  }
  // ---- rfNR: reorder features by dragging their rows, as SolidWorks. Press on a feature row and move past 5 px: a drop
  // line shows between the top-level rows; the pointer is "not allowed" where the move would put a feature above
  // something it is built on or below something built on it (status bar names it), above the origin / planes, below
  // the rollback bar, or a solid / sheet-metal feature above a sheet part's base flange (Sheet-Metal stays first; the
  // Flat-Pattern folder is not a feature and stays last). A feature moves with the sketches absorbed under it; an
  // absorbed sketch dragged alone moves alone. The drop is one undo step and one rebuild; the selection is kept.
  // A move that only makes a later feature fail is allowed (its row shows the error mark, as in SolidWorks).
  // Parents: Kernel.featureParents (sketch, plane / face, pattern seeds, reference geometry), pickRefs (on / fids),
  // the faces under a feature's edge / face picks in the body before it (as Kernel.suppressionChildren), an Unfold for
  // the Fold after it.
  var REORDER_REF = { sketch: 1, plane: 1, refaxis: 1, refpoint: 1, csys: 1, sketch3d: 1 };
  function reorderPickPoints(g) {
    var pts = [];
    function pt(a) { if (Array.isArray(a) && a.length === 3 && a.every(function (n) { return typeof n === 'number' && isFinite(n); })) pts.push(a); }
    ['edges', 'faces', 'ripEdges', 'bendEdges', 'bends'].forEach(function (k) { if (Array.isArray(g[k])) g[k].forEach(function (e) { if (Array.isArray(e)) pt(e); else if (e && e.at) pt(e.at); }); });
    pt(g.fixedFace);
    return pts;
  }
  // the feature ids (polygon.shared) of the body's faces through point p
  function reorderFacesAt(body, p, tol, out) {
    (body && body.polygons || []).forEach(function (poly) {
      var n = poly.plane.normal, dd = n.x * p[0] + n.y * p[1] + n.z * p[2] - poly.plane.w;
      if (Math.abs(dd) > tol || poly.shared == null) return;
      var vs = poly.vertices, inside = true;
      for (var i = 0; i < vs.length && inside; i++) {
        var a = vs[i].pos, b = vs[(i + 1) % vs.length].pos;
        var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, px = p[0] - a.x, py = p[1] - a.y, pz = p[2] - a.z;
        var cx = ey * pz - ez * py, cy = ez * px - ex * pz, cz = ex * py - ey * px;
        var l = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
        if ((cx * n.x + cy * n.y + cz * n.z) / l < -tol) inside = false;
      }
      if (inside) out[+poly.shared] = true;
    });
  }
  // reorderParents(model) -> { id: [parent id] } (direct parents only; the check walks every pair)
  function reorderParents(m) {
    var map = {}, ids = {}, lastUnfold = null;
    m.features.forEach(function (f) { ids[f.id] = true; });
    m.features.forEach(function (f) {
      var ps = K.featureParents ? K.featureParents(f).slice() : [];
      var pr = f.pickRefs;
      if (pr && typeof pr === 'object') Object.keys(pr).forEach(function (k) { var r = pr[k]; if (r && r.on != null) ps.push(r.on); if (r && Array.isArray(r.fids)) Array.prototype.push.apply(ps, r.fids); });
      if (f.type === 'fold' && lastUnfold != null) ps.push(lastUnfold);
      if (f.type === 'unfold') lastUnfold = f.id;
      var seen = {};
      map[f.id] = ps.filter(function (p) { if (!ids[p] || p === f.id || seen[p]) return false; seen[p] = true; return true; });
    });
    if (!m.features.some(function (f) { return reorderPickPoints(f).length; })) return map;
    try {
      var copy = JSON.parse(JSON.stringify(m)), b = K.rebuild(copy);
      var steps = (b && b.cache && b.cache.steps) || [], tol = K.pickTol ? K.pickTol(copy.units || 'mm') * 0.02 : 1e-3;
      copy.features.forEach(function (g, gi) {
        var pts = reorderPickPoints(g), before = gi > 0 && steps[gi - 1] ? steps[gi - 1].body : null;
        if (!pts.length || !before) return;
        var hit = {};
        pts.forEach(function (p) { reorderFacesAt(before, p, tol, hit); });
        Object.keys(hit).forEach(function (k) { k = +k; if (ids[k] && k !== g.id && map[g.id].indexOf(k) < 0) map[g.id].push(k); });
      });
    } catch (e) { }
    return map;
  }
  // a row that stands for a top-level feature: in the tree itself or in a folder's box (not a sketch absorbed under
  // a feature)
  function isUnitRow(row) {
    var p = row && row.parentNode;
    return !!p && (p === $('tree') || (p.classList && p.classList.contains('fold-box')));
  }
  // the sketches shown under a top-level row (its .tc folder)
  function absorbedIds(row) {
    var box = isUnitRow(row) ? row.nextElementSibling : null;
    if (!box || !box.classList.contains('tc') || box.classList.contains('fold-box')) return [];
    return Array.prototype.map.call(box.querySelectorAll('.ti[data-fid]'), function (r) { return +r.getAttribute('data-fid'); });
  }
  function unitRowOf(id) {
    return Array.prototype.filter.call($('tree').querySelectorAll('.ti[data-fid="' + id + '"]'), isUnitRow)[0] || null;
  }
  function folderOfId(m, id) {
    var list = Array.isArray(m.treeFolders) ? m.treeFolders : [];
    for (var i = 0; i < list.length; i++) if (list[i] && Array.isArray(list[i].ids) && list[i].ids.indexOf(id) >= 0) return list[i];
    return null;
  }
  // a folder's features in model order
  function folderMembers(m, fo) {
    return fo.ids.map(function (id) { return K.findFeature(m, id); }).filter(Boolean).sort(function (a, c) { return m.features.indexOf(a) - m.features.indexOf(c); });
  }
  // the first feature after the dragged block (null: the end)
  function nextAfter(d) {
    var fs = App.model.features, i = fs.indexOf(d.f);
    for (i = i + 1; i < fs.length; i++) if (d.ids.indexOf(fs[i].id) < 0 && !UI.rollbarRolled(fs[i])) return fs[i].id;
    return null;
  }
  function findFolder(m, fid) { return (Array.isArray(m.treeFolders) ? m.treeFolders : []).filter(function (fo) { return fo && fo.id === fid; })[0] || null; }
  // reorderPlan(d, spot) -> { ok, msg, noop, order, before, folder }: the block d.ids goes right above feature
  // spot.before (and the sketches absorbed under it that sit just before it), right after spot.after, or to the end of
  // the unrolled features (both null). spot.folder: the folder id it joins (null: none; undefined: membership as is).
  // A number for spot is spot.before (the first form).
  function reorderPlan(d, spot) {
    if (spot == null || typeof spot !== 'object') spot = { before: spot == null ? null : spot };
    var m = App.model, feats = m.features, inB = {};
    d.ids.forEach(function (id) { inB[id] = true; });
    var block = feats.filter(function (f) { return inB[f.id]; }), rest = feats.filter(function (f) { return !inB[f.id]; });
    var idx, before = null, i;
    if (spot.after != null) {
      var af = K.findFeature(m, spot.after);
      idx = rest.indexOf(af) + 1;
      if (idx <= 0) return { ok: false, msg: '' };
      before = rest[idx] || null;
    } else if (spot.before == null) {
      idx = rest.length;
      for (i = 0; i < rest.length; i++) if (UI.rollbarRolled(rest[i])) { idx = i; break; }
    } else {
      before = K.findFeature(m, spot.before);
      idx = rest.indexOf(before);
      if (idx < 0) return { ok: false, msg: '' };
      var under = absorbedIds(unitRowOf(spot.before));
      while (idx > 0 && under.indexOf(rest[idx - 1].id) >= 0) idx--;
    }
    if (rest[idx - 1] && UI.rollbarRolled(rest[idx - 1])) return { ok: false, msg: 'Cannot move ' + d.f.name + ' below the rollback bar.' };
    var order = rest.slice(0, idx).concat(block, rest.slice(idx));
    var fo0 = folderOfId(m, d.f.id), folder = spot.folder === undefined || d.sketchAlone ? undefined : spot.folder;
    var sameFolder = folder === undefined || (fo0 ? fo0.id : null) === folder;
    var into = folder != null ? findFolder(m, folder) : null;
    if (order.every(function (f, k) { return feats[k] === f; }) && sameFolder) return { ok: true, noop: true, order: order };
    var pos = {}, name = d.f.name;
    order.forEach(function (f, k) { pos[f.id] = k; });
    for (var k = 0; k < order.length; k++) {
      var g = order[k], ps = d.parents[g.id] || [];
      for (var j = 0; j < ps.length; j++) {
        var p = K.findFeature(m, ps[j]);
        if (!p || pos[p.id] < k) continue;
        if (inB[g.id] && !inB[p.id]) return { ok: false, msg: 'Cannot move ' + name + ' above ' + p.name + ', which it is built on.' };
        if (inB[p.id] && !inB[g.id]) return { ok: false, msg: 'Cannot move ' + name + ' below ' + g.name + ', which is built on it.' };
      }
    }
    var smBase = m.sheet ? feats.filter(function (f) { return f.sheetBase; })[0] : null;
    if (smBase) {
      var solidsAbove = function (list) { var n = 0; for (var q = 0; q < list.length && list[q] !== smBase; q++) if (!REORDER_REF[list[q].type]) n++; return n; };
      if (solidsAbove(order) > solidsAbove(feats)) return { ok: false, msg: inB[smBase.id] ? 'Cannot move ' + name + ' below other features: Sheet-Metal and its base flange stay first.' : 'Cannot move ' + name + ' above Sheet-Metal: sheet-metal features come after ' + smBase.name + '.' };
    }
    return { ok: true, order: order, before: before, folder: folder, into: into, out: !sameFolder && !into ? fo0 : null };
  }
  function reorderBegin(f, row) {
    if (App.mode === 'sketch' || UI.hasPM()) { setStatus('Close the open command or sketch before moving a feature.'); return null; }
    if (UI.rollbarRolled(f)) { setStatus('Roll forward before moving ' + f.name + ': it is below the rollback bar.'); return null; }
    if ($('tree-filter-input').value) { setStatus('Clear the filter before moving a feature.'); return null; }
    var top = isUnitRow(row);
    var ids = [f.id].concat(top ? absorbedIds(row) : []);
    var d = { f: f, ids: ids, row: row, sketchAlone: !top && row.parentNode != null && !!row.parentNode.classList, parents: reorderParents(App.model), res: null, line: el('div', { class: 'tree-drop-line' }) };
    document.body.appendChild(d.line);
    document.body.classList.add('tree-reordering');
    row.classList.add('drag-src');
    return d;
  }
  function reorderOver(d, y) {
    var tree = $('tree'), b = tree.getBoundingClientRect();
    if (y < b.top + 14) tree.scrollTop -= 12; else if (y > b.bottom - 14) tree.scrollTop += 12;
    // the places a drop can go: before a feature row (top level or in a folder), before a folder row, onto a folder
    // row (the end of that folder), the end
    var units = Array.prototype.filter.call(tree.querySelectorAll('.ti[data-fid], .ti.fold-row'), function (r) {
      return (isUnitRow(r) || r.classList.contains('fold-row')) && r.getClientRects().length && !r.classList.contains('rolled');
    });
    var bar = tree.querySelector('.rollbar'), rolled = tree.querySelector('.ti.rolled');
    var res, lineY = null, spot = null, onto = null;
    Array.prototype.forEach.call(tree.querySelectorAll('.ti.drop-into'), function (r) { r.classList.remove('drop-into'); });
    if (!units.length) res = { ok: false, msg: '' };
    else if (y < units[0].getBoundingClientRect().top - 3) res = { ok: false, msg: 'Cannot move ' + d.f.name + ' above the origin and the planes.' };
    else if (rolled && bar && y > bar.getBoundingClientRect().bottom + 2) res = { ok: false, msg: 'Cannot move ' + d.f.name + ' below the rollback bar.' };
    else {
      for (var i = 0; i < units.length && !spot; i++) {
        var u = units[i], r = u.getBoundingClientRect(), fo = u.classList.contains('fold-row') ? findFolder(App.model, +u.getAttribute('data-folder')) : null;
        if (fo && !d.sketchAlone && y >= r.top + r.height * 0.3 && y <= r.bottom - r.height * 0.3) {
          var mem = folderMembers(App.model, fo).filter(function (g) { return g !== d.f; });
          spot = mem.length ? { after: mem[mem.length - 1].id, folder: fo.id } : { before: fo.ids[0], folder: fo.id };
          onto = u;
        } else if (y < r.top + r.height / 2) {
          lineY = r.top;
          if (fo) {
            // above a folder row: out of the folder, before its first member (its own member: where it is)
            var others = folderMembers(App.model, fo).filter(function (g) { return d.ids.indexOf(g.id) < 0; });
            spot = { before: others.length ? others[0].id : nextAfter(d), folder: null };
          } else { var box = u.parentNode; spot = { before: +u.getAttribute('data-fid'), folder: box !== tree ? +box.getAttribute('data-folder') : null }; }
        }
      }
      if (!spot) {
        var last = units[units.length - 1], nx = last.nextElementSibling;
        while (last.parentNode !== tree) { last = last.parentNode; nx = null; }
        var e = nx && nx.classList.contains('tc') ? nx : last;
        lineY = e.getBoundingClientRect().bottom;
        spot = { before: null, folder: null };
      }
      if (d.sketchAlone) spot.folder = undefined;
      res = reorderPlan(d, spot);
    }
    d.res = res;
    var bad = !res.ok;
    document.body.classList.toggle('tree-reorder-no', bad);
    if (onto && !bad) onto.classList.add('drop-into');
    d.line.style.display = bad || lineY == null || onto ? 'none' : 'block';
    if (!bad && lineY != null) { d.line.style.left = (b.left + 22) + 'px'; d.line.style.width = Math.max(20, b.width - 30) + 'px'; d.line.style.top = (lineY - 1) + 'px'; }
    if (bad && res.msg) setStatus(res.msg);
    else if (!bad) setStatus(res.noop ? d.f.name : reorderSays(d, res, 'Move'));
  }
  function reorderSays(d, res, verb) {
    return verb + ' ' + d.f.name + (res.into ? ' into ' + res.into.name : res.before ? ' above ' + res.before.name : ' to the end') + (res.out ? ' (out of ' + res.out.name + ')' : '') + '.';
  }
  function reorderEnd(d) {
    if (d.line.parentNode) d.line.parentNode.removeChild(d.line);
    document.body.classList.remove('tree-reordering', 'tree-reorder-no');
    d.row.classList.remove('drag-src');
    Array.prototype.forEach.call($('tree').querySelectorAll('.ti.drop-into'), function (r) { r.classList.remove('drop-into'); });
  }
  // reorderFeature(id, beforeId | null | spot, folderId?) -> the rebuild Promise, or false (refused: the status bar
  // says why). The drag's drop, also for scripts and tests; beforeId null: to the end (above the rollback bar).
  // folderId: the folder it joins (null: out of any folder; omitted: its folder as is).
  function reorderFeature(id, beforeId, folderId) {
    var f = K.findFeature(App.model, id);
    if (!f || isAsm()) return false;
    var row = unitRowOf(id) || $('tree').querySelector('.ti[data-fid="' + id + '"]') || el('div');
    var d = reorderBegin(f, row);
    if (!d) return false;
    reorderEnd(d);
    var spot = beforeId != null && typeof beforeId === 'object' ? beforeId : { before: beforeId == null ? null : beforeId };
    if (arguments.length > 2) spot.folder = folderId;
    return reorderApply(d, reorderPlan(d, spot));
  }
  function reorderApply(d, res) {
    if (!res || !res.ok) { if (res && res.msg) setStatus(res.msg); refreshTree(); return false; }
    if (res.noop) { refreshTree(); return false; }
    UI.pushUndo();
    var m = App.model;
    m.features.length = 0; Array.prototype.push.apply(m.features, res.order);
    if (res.folder !== undefined) {
      (m.treeFolders || []).forEach(function (fo) { fo.ids = fo.ids.filter(function (id) { return id !== d.f.id; }); });
      if (res.into) res.into.ids.push(d.f.id);
    }
    var said = reorderSays(d, res, 'Moved');
    return UI.afterRebuild(UI.rebuild(), function (bd) { setStatus(said); return bd; });
  }
  UI.reorderFeature = reorderFeature;
  // ---- rfNR2: FeatureManager folders (SolidWorks Add to New Folder). Stored as model.treeFolders = [{ id, name, ids:
  // [top-level feature ids], open }]: plain JSON beside model.features, so Save / Open, undo and AutoRecover keep it;
  // nothing in the kernel, the worker, OpenCascade or generateScript reads it, and an old file simply has none. A
  // folder holds a run of neighbouring top-level features (sketches absorbed under a feature go with it); the tree
  // draws it at its first feature's place. normalizeFolders drops ids of deleted features and members cut off from
  // the run (a feature moved away), and empty folders.
  function normalizeFolders(m, consumedBy) {
    if (!Array.isArray(m.treeFolders)) return [];
    var top = m.features.filter(function (f) { return !(f.type === 'sketch' && consumedBy[f.id] != null); });
    var at = {}, taken = {};
    top.forEach(function (f, i) { at[f.id] = i; });
    m.treeFolders = m.treeFolders.filter(function (fo) {
      if (!fo || !Array.isArray(fo.ids)) return false;
      var idx = fo.ids.filter(function (id) { return at[id] != null && !taken[id]; }).map(function (id) { return at[id]; }).sort(function (a, b) { return a - b; });
      var run = idx.length ? [idx[0]] : [];
      for (var k = 1; k < idx.length && idx[k] === run[run.length - 1] + 1; k++) run.push(idx[k]);
      fo.ids = run.map(function (i) { return top[i].id; });
      fo.ids.forEach(function (id) { taken[id] = true; });
      return fo.ids.length > 0;
    });
    if (!m.treeFolders.length) delete m.treeFolders;
    return m.treeFolders || [];
  }
  function folderRow(fo, open, errors) {
    var m = App.model, mem = folderMembers(m, fo);
    var allSup = mem.length && mem.every(function (g) { return UI.isSuppressed && UI.isSuppressed(g.id); });
    var bad = mem.some(function (g) { return errors && errors[g.id]; });
    var allRolled = mem.length && mem.every(function (g) { return UI.rollbarRolled(g); });
    var row = treeItem({ icon: 'folder', name: fo.name, depth: 1, children: true, open: open, cls: 'fold-row' + (allSup ? ' suppressed' : '') + (bad ? ' warn' : '') + (allRolled ? ' rolled' : ''),
      title: fo.name + ': ' + mem.map(function (g) { return g.name; }).join(', '), toggle: function () { fo.open = !open; refreshTree(); } });
    row.setAttribute('data-folder', String(fo.id));
    row.addEventListener('click', function () { setStatus(fo.name + ': ' + mem.length + ' feature' + (mem.length === 1 ? '' : 's') + '.'); });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); renameFolder(fo); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, folderMenu(fo)); });
    return row;
  }
  function folderMenu(fo) {
    var ids = fo.ids.slice(), sup = ids.length && ids.every(function (id) { return UI.isSuppressed && UI.isSuppressed(id); });
    var items = [{ label: 'Rename tree item', help: 'Type a new name for the folder', action: function () { renameFolder(fo); } }];
    if (UI.setSuppression) items.push({ label: sup ? 'Unsuppress' : 'Suppress', help: (sup ? 'Unsuppress' : 'Suppress') + ' every feature in the folder', action: function () { UI.setSuppression(ids, !sup); } });
    items.push({ sep: true }, { label: 'Delete', key: 'Del', help: 'Delete the folder (its features stay unless you tick the box)', action: function () { deleteFolder(fo); } });
    return items;
  }
  function renameFolder(fo) {
    var row = $('tree').querySelector('.ti.fold-row[data-folder="' + fo.id + '"]');
    if (!row) return;
    revealRow($('tree'), row);
    renameInline(row, fo.name, function (n) { UI.pushUndo(); fo.name = n; refreshTree(); });
  }
  UI.renameTreeFolder = function (id) { var fo = findFolder(App.model, id); if (fo) renameFolder(fo); };
  // Add to New Folder: the right-clicked feature, or the selected top-level features when they are neighbours in the
  // tree (Ctrl / Shift selection), go in a new folder at their place; the name is edited at once (SolidWorks)
  function addToNewFolder(f) {
    var m = App.model, sel = (UI.selection ? UI.selection() : []).filter(function (s) { return s && s.kind === 'feature'; }).map(function (s) { return s.id; });
    if (sel.indexOf(f.id) < 0) sel = [f.id];
    var units = Array.prototype.filter.call($('tree').querySelectorAll('.ti[data-fid]'), isUnitRow).map(function (r) { return +r.getAttribute('data-fid'); });
    var pos = sel.map(function (id) { return units.indexOf(id); });
    if (pos.some(function (p) { return p < 0; })) { setStatus('Add to New Folder takes features from the top of the tree, not sketches inside a feature.'); return null; }
    pos.sort(function (a, b) { return a - b; });
    for (var i = 1; i < pos.length; i++) if (pos[i] !== pos[i - 1] + 1) { setStatus('Select features that are next to each other in the tree to put them in one folder.'); return null; }
    if (sel.some(function (id) { return UI.rollbarRolled(K.findFeature(m, id)); })) { setStatus('Roll forward before putting rolled-back features in a folder.'); return null; }
    UI.pushUndo();
    var list = m.treeFolders = Array.isArray(m.treeFolders) ? m.treeFolders : [];
    list.forEach(function (fo) { fo.ids = fo.ids.filter(function (id) { return sel.indexOf(id) < 0; }); });
    var n = 1, names = {}, maxId = 0;
    list.forEach(function (fo) { names[fo.name] = true; maxId = Math.max(maxId, fo.id | 0); });
    while (names['Folder' + n]) n++;
    var fo = { id: maxId + 1, name: 'Folder' + n, ids: pos.map(function (p) { return units[p]; }), open: true };
    list.push(fo);
    refreshTree();
    setStatus('Added ' + fo.ids.length + ' feature' + (fo.ids.length === 1 ? '' : 's') + ' to ' + fo.name + '.');
    renameFolder(fo);
    return fo;
  }
  UI.addToNewFolder = function (ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    if (UI.setSelection) UI.setSelection(ids.map(function (id) { return { kind: 'feature', id: id }; }), { quiet: true });
    var fo = addToNewFolder(K.findFeature(App.model, ids[0]));
    var inp = $('tree').querySelector('input.ti-rename');
    if (inp) inp.blur();
    return fo;
  };
  // Delete on a folder: SolidWorks asks, and keeps the features (they move out to its place) unless told otherwise
  function deleteFolder(fo) {
    var m = App.model, mem = folderMembers(m, fo);
    var msg = 'Delete the folder <b>' + fo.name + '</b>?' + (mem.length ? '<br><label class="del-kids"><input type="checkbox" id="del-folder-features"> Also delete its ' + mem.length + ' feature' + (mem.length === 1 ? '' : 's') + ' (' + mem.map(function (g) { return g.name; }).join(', ') + ') and what is built on them</label>' : '');
    UI.confirmDialog('Confirm Delete', msg, function () {
      var box = document.getElementById('del-folder-features'), all = !!(box && box.checked);
      UI.pushUndo();
      m.treeFolders = (m.treeFolders || []).filter(function (x) { return x !== fo; });
      if (!all) { refreshTree(); setStatus('Deleted ' + fo.name + '; its features stay in the tree.'); return; }
      var doomed = mem.map(function (g) { return g.id; });
      // their own sketches (used by nothing else) and every feature built on them
      mem.forEach(function (g) {
        [g.sketch, g.profile, g.path].concat(g.sketches || []).forEach(function (s) {
          if (typeof s !== 'number' || doomed.indexOf(s) >= 0) return;
          var users = m.features.filter(function (h) { return h.sketch === s || h.profile === s || h.path === s || (h.sketches || []).indexOf(s) >= 0; });
          if (users.every(function (h) { return doomed.indexOf(h.id) >= 0; })) doomed.push(s);
        });
      });
      doomed.slice().forEach(function (id) { (K.featureChildren ? K.featureChildren(m, id) : []).forEach(function (k) { if (doomed.indexOf(k) < 0) doomed.push(k); }); });
      (UI.faceChildren ? UI.faceChildren(doomed) : []).forEach(function (k) { if (doomed.indexOf(k) < 0) doomed.push(k); });
      m.features = m.features.filter(function (g) { return doomed.indexOf(g.id) < 0; });
      App.sel = null; App.sel2 = null;
      UI.afterRebuild(UI.rebuild(), function () { setStatus('Deleted ' + fo.name + ' and ' + doomed.length + ' feature' + (doomed.length === 1 ? '' : 's') + '.'); });
    }, 'Delete');
  }
  UI.deleteTreeFolder = function (id) { var fo = findFolder(App.model, id); if (fo) deleteFolder(fo); };
  function treeRowPress(e, f, row) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || isAsm()) return;
    if (e.target.closest && (e.target.closest('.tw') || e.target.closest('input'))) return;
    var x0 = e.clientX, y0 = e.clientY, d = null, done = false;
    function off() {
      done = true;
      document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); document.removeEventListener('keydown', key, true);
    }
    function move(ev) {
      if (done) return;
      if (!d) {
        if (Math.max(Math.abs(ev.clientX - x0), Math.abs(ev.clientY - y0)) < 5) return;
        cancelSlowRename();
        d = reorderBegin(f, row);
        if (!d) { off(); return; }
      }
      ev.preventDefault();
      reorderOver(d, ev.clientY);
    }
    function up() {
      off();
      if (!d) return;
      reorderEnd(d);
      // the click that follows this release is the drop's, not a click on a row
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', eat, true);
      setTimeout(function () { document.removeEventListener('click', eat, true); }, 0);
      reorderApply(d, d.res);
    }
    function key(ev) {
      if (ev.key !== 'Escape') return;
      ev.preventDefault(); ev.stopPropagation(); off();
      if (d) { reorderEnd(d); setStatus('Move cancelled.'); }
    }
    document.addEventListener('mousemove', move, true); document.addEventListener('mouseup', up, true); document.addEventListener('keydown', key, true);
  }
  function revealRow(box, row) {
    if (!row.getClientRects().length) return;   // inside a collapsed folder
    var r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop += r.top - b.top;
    else if (r.bottom > b.top + box.clientHeight) box.scrollTop += r.bottom - b.top - box.clientHeight;
  }
  // ---- rfNR3: the tree as SolidWorks drives it from the mouse and the keyboard. The tree takes the keyboard focus when
  // pressed; with it focused Up / Down select the row above / below (as a click on it), Right / Left open / close a
  // row's folder (Left on a closed child row goes to its parent), Enter edits (as a double-click). F2, Del and Esc are
  // the global keys (rename, Confirm Delete, clear). Shift+click selects the range of shown rows from the last row
  // clicked (inside and across folders); a click on empty tree space clears the selection. A face picked in the
  // graphics area scrolls its feature's row (marked .sel-owner by ui-select.js) into view.
  var TREE_ROWS = '.ti[data-fid], .ti.component-row[data-comp], .ti[data-body], .ti.fold-row';
  var treeAnchor = null;
  (function () {
    var tree = $('tree'), host = tree.parentNode;
    tree.tabIndex = 0;
    function shownRows() { return Array.prototype.filter.call(tree.querySelectorAll(TREE_ROWS), function (r) { return r.getClientRects().length; }); }
    function rowKey(r) { return r.getAttribute('data-fid') ? 'f' + r.getAttribute('data-fid') : r.getAttribute('data-comp') ? 'c' + r.getAttribute('data-comp') : r.getAttribute('data-body') ? 'b' + r.getAttribute('data-body') : 'o' + r.getAttribute('data-folder'); }
    function rowByKey(k) { return shownRows().filter(function (r) { return rowKey(r) === k; })[0] || null; }
    function clickRow(r) {
      var nm = r.querySelector('.nm') || r, b = nm.getBoundingClientRect();
      // a keyboard move is not a slow second click: the row's own click handler with a plain (untrusted) event
      nm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: b.left + 2, clientY: b.top + 2, detail: 1 }));
    }
    host.addEventListener('mousedown', function (e) {
      if (!tree.contains(e.target) || (e.target.closest && e.target.closest('input, .rollbar'))) return;
      if (document.activeElement !== tree) tree.focus({ preventScroll: true });
    });
    host.addEventListener('click', function (e) {
      if (!tree.contains(e.target)) return;
      var row = e.target.closest && e.target.closest(TREE_ROWS);
      if (!row) {
        // empty tree space (not a header row such as Origin or a folder's box)
        if (e.target === tree && !UI.hasPM() && App.mode !== 'sketch' && (App.sel || App.sel2) && UI.setSelection) UI.setSelection([]);
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && treeAnchor && !isAsm() && row.hasAttribute('data-fid')) {
        var rows = shownRows().filter(function (r) { return r.hasAttribute('data-fid'); }), a = rows.indexOf(rowByKey(treeAnchor)), b = rows.indexOf(row);
        if (a >= 0 && b >= 0 && UI.setSelection) {
          e.stopPropagation(); e.preventDefault();
          var lo = Math.min(a, b), hi = Math.max(a, b), list = [];
          rows.slice(lo, hi + 1).forEach(function (r) { list.push({ kind: 'feature', id: +r.getAttribute('data-fid') }); });
          // the anchor first, so it stays the main selection as in SolidWorks
          if (b < a) list.reverse();
          UI.setSelection(list);
          return;
        }
      }
      if (!e.shiftKey) treeAnchor = rowKey(row);
    }, true);
    tree.addEventListener('keydown', function (e) {
      if (e.target !== tree || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key;
      if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Enter' && k !== 'Home' && k !== 'End') return;
      var rows = shownRows(), cur = tree.querySelector('.ti.selected') || tree.querySelector('.ti.sel-owner'), i = cur ? rows.indexOf(cur) : -1;
      e.preventDefault(); e.stopPropagation();
      if (!rows.length) return;
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End') {
        var n = k === 'Home' ? 0 : k === 'End' ? rows.length - 1 : i < 0 ? (k === 'ArrowDown' ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
        var key = rowKey(rows[n]);
        clickRow(rows[n]); treeAnchor = key;
        var now = rowByKey(key); if (now) revealRow(tree, now);
        return;
      }
      if (!cur) return;
      var tw = cur.querySelector('.tw'), hasKids = tw && !tw.classList.contains('leaf'), open = hasKids && tw.textContent === '▾';
      if (k === 'ArrowRight' && hasKids && !open) tw.click();
      else if (k === 'ArrowLeft' && hasKids && open) tw.click();
      else if (k === 'ArrowLeft') {
        var box = cur.parentNode, parent = box && box !== tree && box.classList.contains('tc') ? box.previousElementSibling : null;
        if (parent && parent.matches(TREE_ROWS)) { var pk = rowKey(parent); clickRow(parent); treeAnchor = pk; }
      } else if (k === 'Enter') cur.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
    });
  })();
  // ---- rfNR3: the flyout FeatureManager. While a PropertyManager covers the tree, SolidWorks shows the part's tree at
  // the top left of the graphics area: a title row (click to open / close) and below it the planes and features. A
  // click on a row feeds the PropertyManager's active box exactly as a graphics pick would: a plane row the plane, a
  // feature row the feature (a box that takes faces gets one of the feature's faces); a box that takes neither
  // gets it as a tree selection (the PM's onSelection), and a plane row also sets a Front / Top / Right plane list.
  var flyOpen = false, flySig = '';
  function flyoutPicks(item) {
    var m = App.model, out = [];
    if (item.std) { out.push({ kind: 'plane', ref: item.std, plane: K.makePlane(item.std, 0), name: item.std + ' Plane', point: [0, 0, 0] }); return out; }
    var f = K.findFeature(m, item.id);
    if (!f) return out;
    var bp = App.build && App.build.planes ? App.build.planes[f.id] : null;
    if (f.type === 'plane' && bp) out.push({ kind: 'plane', ref: f.id, plane: bp, name: f.name, point: (bp.origin || [0, 0, 0]).slice() });
    out.push({ kind: 'feature', id: f.id });
    if (App.mesh && App.mesh.faces && App.triShared) {
      for (var i = 0; i < App.mesh.faces.length; i++) {
        var fc = App.mesh.faces[i];
        if (App.triShared[fc.start] === f.id) { out.push({ kind: 'face', index: i, point: (fc.centroid || [0, 0, 0]).slice(), normal: fc.normal }); break; }
      }
    }
    return out;
  }
  function flyoutFeed(item) {
    var cmd = App.command, picks = flyoutPicks(item), name = item.name;
    if (cmd && cmd.onPick) for (var i = 0; i < picks.length; i++) { if (cmd.onPick(picks[i]) !== false) { setStatus(name + ' picked from the flyout FeatureManager.'); refreshFlyout(true); return true; } }
    // a Front / Top / Right list in the PropertyManager (Mirror's plane)
    var sp = UI.pmSpec && UI.pmSpec(), std = item.std;
    if (sp && std) {
      var fld = null;
      (sp.groups || []).forEach(function (g) { (g.fields || []).forEach(function (fd) { if (!fld && fd.type === 'select' && Array.isArray(fd.options) && fd.options.indexOf(std) >= 0 && fd.options.indexOf(std === 'Front' ? 'Top' : 'Front') >= 0) fld = fd; }); });
      if (fld) { sp.values[fld.key] = std; UI.renderPM(); if (sp.onChange) sp.onChange(sp.values, fld.key); setStatus(fld.label + ': ' + name + '.'); return true; }
    }
    if (sp && sp.onSelection && UI.setSelection) {
      var s = picks[0];
      UI.setSelection([s.kind === 'plane' && item.std ? s : { kind: 'feature', id: item.id }]);
      return true;
    }
    setStatus('The open command does not take ' + name + '.');
    return false;
  }
  function flyoutItems() {
    var m = App.model, items = ['Front', 'Top', 'Right'].map(function (r) { return { std: r, name: r + ' Plane', icon: 'planeSmall', depth: 1 }; });
    m.features.forEach(function (f) {
      if (UI.rollbarRolled(f) || (App.rollback != null && m.features.indexOf(f) >= App.rollback)) return;
      items.push({ id: f.id, name: f.name, icon: featureIcon(f), depth: 1 });
    });
    return items;
  }
  function refreshFlyout(force) {
    var vp = $('viewport');
    if (!vp) return;
    var want = !isAsm() && UI.hasPM && UI.hasPM() && App.fmTab === 'pm' && App.mode !== 'sketch' && !!(App.model && App.model.features);
    var box = $('fm-flyout');
    if (!want) { if (box) box.remove(); flyOpen = false; flySig = ''; return; }
    var sig = JSON.stringify([flyOpen, App.model.name, App.model.features.map(function (f) { return f.id + f.name; }), App.rollback]);
    if (box && sig === flySig && !force) return;
    flySig = sig;
    if (!box) {
      box = el('div', { id: 'fm-flyout', class: 'fm-flyout' });
      ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu'].forEach(function (t) { box.addEventListener(t, function (e) { e.stopPropagation(); if (t === 'contextmenu') e.preventDefault(); }); });
      vp.appendChild(box);
    }
    box.innerHTML = '';
    var head = treeItem({ icon: 'part', name: App.model.name || 'Part', children: true, open: flyOpen, cls: 'fly-head', title: 'Flyout FeatureManager: click to ' + (flyOpen ? 'close' : 'open') + '; a click on a row picks it for the open command', toggle: function () { flyOpen = !flyOpen; refreshFlyout(true); } });
    head.addEventListener('click', function () { flyOpen = !flyOpen; refreshFlyout(true); });
    box.appendChild(head);
    if (!flyOpen) return;
    var list = el('div', { class: 'fly-list' });
    flyoutItems().forEach(function (it) {
      var r = treeItem({ icon: it.icon, name: it.name, depth: it.depth, cls: 'fly-row' });
      if (it.id != null) r.setAttribute('data-fid', String(it.id)); else r.setAttribute('data-plane', it.std);
      r.addEventListener('click', function (e) { e.stopPropagation(); flyoutFeed(it); });
      list.appendChild(r);
    });
    box.appendChild(list);
  }
  UI.refreshFlyout = refreshFlyout;
  UI.flyoutFeed = function (idOrPlane) { return flyoutFeed(typeof idOrPlane === 'string' ? { std: idOrPlane, name: idOrPlane + ' Plane' } : { id: idOrPlane, name: (K.findFeature(App.model, idOrPlane) || {}).name }); };
  setInterval(function () { if (!document.hidden) { refreshFlyout(false); if (App.flat) applyFlatShow(); } }, 250);
  // a face or edge picked in the graphics area: its feature's row comes into view (once per new selection)
  var ownerShown = '';
  function revealOwnerSoon() {
    setTimeout(function () {
      var tree = $('tree'), s = App.sel, key = s ? JSON.stringify([s.kind, s.index, s.id, s.point]) : '';
      if (!s || s.kind === 'feature' || key === ownerShown) { ownerShown = key; return; }
      var row = tree.querySelector('.ti.sel-owner');
      if (!row) return;
      ownerShown = key;
      revealRow(tree, row);
    }, 0);
  }
  // ---- assembly FeatureManager: "Assem1", origin planes, one row per component ("(f) Plate<1>" fixed, "(-) Pin<1>"
  // still free to move, red on a build error) and the Mates folder ("Coincident1 (Plate<1>, Pin<1>)", red with the
  // message in the tooltip when the mate fails, grey when suppressed).
  // DOM: .ti.asm-root, .ti.component-row[data-comp=id], .ti.mates-folder, .ti.mate-row[data-mate=id].
  function refreshAssemblyTree() {
    var tree = $('tree');
    tree.innerHTML = '';
    var m = App.model, filter = ($('tree-filter-input').value || '').toLowerCase();
    var errors = (App.build && App.build.errors) || {};
    var root = treeItem({ icon: 'assembly', name: m.name, children: true, open: true, cls: 'asm-root', toggle: function () { } });
    root.addEventListener('dblclick', function () { renameInline(root, m.name, function (n) { UI.pushUndo(); m.name = n; UI.rebuild(); }); });
    tree.appendChild(root);
    [['folder', 'History'], ['sensor', 'Sensors'], ['annotations', 'Annotations']].forEach(function (s) { tree.appendChild(treeItem({ icon: s[0], name: s[1], depth: 1, cls: 'dim' })); });
    ['Front', 'Top', 'Right'].forEach(function (r) {
      var row = treeItem({ icon: 'planeSmall', name: r + ' Plane', depth: 1, cls: App.sel && App.sel.kind === 'plane' && App.sel.ref === r ? 'selected' : '' });
      row.addEventListener('click', function () { App.sel = { kind: 'plane', ref: r, plane: K.makePlane(r, 0), name: r + ' Plane' }; App.sel2 = null; UI.updatePlanes(); UI.updateHighlights(); refreshTree(); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Normal To', action: function () { UI.viewNormalTo(K.makePlane(r, 0)); } }, { label: (App.view.showPlanes ? 'Hide' : 'Show') + ' planes', action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } }]); });
      tree.appendChild(row);
    });
    tree.appendChild(treeItem({ icon: 'origin', name: 'Origin', depth: 1, cls: 'dim' }));
    // pattern instances are listed in their pattern's folder (ui-assembly.js, UI.asmTreeExtras), after the Mates
    // helpers for the rows ui-assembly.js adds (pattern folders, the rows inside a sub-assembly)
    var helpers = { treeItem: treeItem, componentRow: componentRow, expanded: expanded, showMenu: showMenu, filter: filter, refresh: refreshTree };
    (m.components || []).forEach(function (c, i) { if (c.pattern == null || !UI.asmTreeExtras) componentRow(c, i, 1); });
    function componentRow(c, i, depth, parent) {
      var label = UI.compLabel ? UI.compLabel(c) : c.name;
      if (filter && label.toLowerCase().indexOf(filter) < 0) return;
      var st = UI.compStatus ? UI.compStatus(c.id) : null;
      var err = (st && st.error) || errors[c.id] || null;
      var selected = App.sel && App.sel.kind === 'body' && App.sel.index === i;
      var hidden = isBodyHidden(i);
      var tip = err ? c.name + ': ' + err : c.name + (c.fixed ? ' (fixed)' : st && st.overDefined ? ' (over defined: ' + st.overMate + ' cannot be satisfied)' : st ? (st.underDefined ? ' (under defined: ' + st.dof + ' degree' + (st.dof === 1 ? '' : 's') + ' of freedom left)' : ' (fully defined)') : '') + (hidden ? ' (hidden)' : '') + (UI.componentMaterial ? ' — ' + UI.componentMaterial(c) : '');
      // a sub-assembly / linked / suppressed component (ui-assembly.js): its icon, tooltip and the rows inside it
      var dec = UI.asmRowDecor ? UI.asmRowDecor(c, st, helpers) : null;
      if (dec && dec.tip) tip = dec.tip(tip);
      var row = treeItem({ icon: (dec && dec.icon) || 'component', name: label + ((dec && dec.suffix) || ''), depth: depth, cls: 'component-row' + (selected ? ' selected' : '') + (err ? ' err' : '') + (hidden ? ' hidden' : '') + (dec && dec.cls ? ' ' + dec.cls : ''), title: tip,
        children: !!(dec && dec.children), open: !!(dec && dec.open), toggle: dec && dec.toggle });
      row.setAttribute('data-comp', String(c.id));
      row.title = tip;
      row.addEventListener('click', function () { if (UI.selectComponent) UI.selectComponent(c.id); else selectBody(i); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); if (UI.selectComponent) UI.selectComponent(c.id); showMenu(e.clientX, e.clientY, componentMenu(c)); });
      (parent || tree).appendChild(row);
      if (dec && dec.children && dec.open) dec.children(parent || tree, depth + 1);
    }
    var mates = m.mates || [];
    var shown = mates.filter(function (mt) { return !filter || (UI.mateLabel ? UI.mateLabel(mt) : mt.name).toLowerCase().indexOf(filter) >= 0; });
    var isOpen = expanded.mates == null ? true : !!expanded.mates;
    var anyErr = mates.some(function (mt) { return UI.mateStatus && UI.mateStatus(mt).error && !mt.suppressed; });
    var folder = treeItem({ icon: 'matesFolder', name: 'Mates', depth: 1, cls: 'mates-folder' + (anyErr ? ' err' : '') + (mates.length ? '' : ' dim'), children: mates.length > 0, open: isOpen, title: mates.length + ' mate' + (mates.length === 1 ? '' : 's'), toggle: function () { expanded.mates = !isOpen; refreshTree(); } });
    folder.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Add Mate…', action: function () { UI.cmdMate(); } }]); });
    tree.appendChild(folder);
    // component pattern / mirror folders come after the Mates folder, as in SolidWorks
    function extras() { if (UI.asmTreeExtras) UI.asmTreeExtras(tree, { treeItem: treeItem, componentRow: componentRow, expanded: expanded, showMenu: showMenu, filter: filter, refresh: refreshTree }); if (UI.asmTreeMarks) UI.asmTreeMarks(tree, root); }   // r13/asmui13: badges, hover / owner marks
    if (!mates.length) { extras(); return; }
    var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
    shown.forEach(function (mt) {
      var st = UI.mateStatus ? UI.mateStatus(mt) : { error: null };
      var err = mt.suppressed ? null : st.error, off = mt.suppressed || st.suppressed;
      var row = treeItem({ icon: ({ concentric: 'concentric', distance: 'distance', angle: 'angle', parallel: 'parallel', perpendicular: 'perpendicular', tangent: 'tangent', width: 'width', gear: 'gear', limitdistance: 'limitDistance', limitangle: 'limitAngle' }[mt.type] || 'coincident'), name: UI.mateLabel ? UI.mateLabel(mt) : mt.name, depth: 2, cls: 'mate-row' + (err ? ' err' : '') + (off ? ' suppressed' : '') });
      row.setAttribute('data-mate', String(mt.id));
      row.title = err ? mt.name + ': ' + err : mt.name + (mt.suppressed ? ' (suppressed)' : st.warning ? ' (suppressed: ' + st.warning + ')' : '') + ' — double-click to edit';
      row.addEventListener('click', function () { if (UI.showMate) UI.showMate(mt); setStatus(err ? mt.name + ': ' + err : (UI.mateLabel ? UI.mateLabel(mt) : mt.name) + (mt.suppressed ? ' (suppressed)' : '')); });   // r4/asm4: showMate selects its faces
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); UI.editMate(mt); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, mateMenu(mt)); });
      box.appendChild(row);
    });
    tree.appendChild(box);
    extras();
  }
  function asmRun(p) { if (p && p.catch) p.catch(function (e) { toast(e.message || String(e)); }); }
  function componentMenu(c) {
    var i = UI.componentIndex ? UI.componentIndex(c.id) : -1, hidden = i >= 0 && isBodyHidden(i);
    return [
      c.fixed ? { label: 'Float', action: function () { asmRun(UI.asm.fix(c.id, false)); } } : { label: 'Fix', action: function () { asmRun(UI.asm.fix(c.id, true)); } },
      { label: hidden ? 'Show' : 'Hide', action: function () { UI.asm.setHidden(c.id, !hidden); } },
      { label: 'Mass Properties', action: function () { UI.showMassProperties(); } },
      { label: 'Add Mate…', action: function () { UI.cmdMate(); } }
    ].concat(UI.asmComponentMenuExtras ? UI.asmComponentMenuExtras(c) : [], [   // Open Part, Edit Part, Solve as… (ui-assembly.js)
      { sep: true },
      { label: 'Delete', action: function () { UI.confirmRemoveComponent(c); } }
    ]);
  }
  function mateMenu(mt) {
    return [
      { label: 'Edit Feature', action: function () { UI.editMate(mt); } },
      mt.suppressed ? { label: 'Unsuppress', action: function () { asmRun(UI.asm.suppressMate(mt.id, false)); } } : { label: 'Suppress', action: function () { asmRun(UI.asm.suppressMate(mt.id, true)); } }
    ].concat(UI.asmMateMenuExtras ? UI.asmMateMenuExtras(mt) : [], [   // Flip Mate Alignment (ui-assembly.js)
      { sep: true },
      { label: 'Delete', action: function () { UI.confirmRemoveMate(mt); } }
    ]);
  }
  // Solid Bodies(n) folder: one row per separate solid (App.build.bodies, described by Kernel.bodyInfo through
  // UI.bodyInfos). Expanded by default on a multi-body part; the user's toggle is remembered in expanded.bodies.
  function isBodyHidden(i) { return UI.isBodyHidden ? !!UI.isBodyHidden(i) : !!(App.hiddenBodies && App.hiddenBodies[i]); }
  function setBodyHidden(i, hidden) {
    if (UI.setBodyHidden) { UI.setBodyHidden(i, hidden); return; }
    App.hiddenBodies = App.hiddenBodies || {};
    if (hidden) App.hiddenBodies[i] = true; else delete App.hiddenBodies[i];
    UI.updateHighlights(); refreshTree();
  }
  function selectBody(i) {
    if (typeof UI.selectBody === 'function') UI.selectBody(i);
    else if (UI.selectBodyRow) UI.selectBodyRow(i);
    else { App.sel = { kind: 'body', index: i }; App.sel2 = null; UI.updateHighlights(); refreshTree(); }
  }
  function bodyTitle(b) { return UI.bodyTitle ? UI.bodyTitle(b) : b.name + ': volume ' + UI.fmtNum(b.volume, 2) + ' ' + UI.unitLabel() + '³'; }
  function bodyMenu(b) {
    var hidden = isBodyHidden(b.index);
    var items = [
      { label: hidden ? 'Show' : 'Hide', action: function () { setBodyHidden(b.index, !hidden); } },
      { label: 'Mass Properties', action: function () { UI.showMassProperties(); } }
    ];
    // Zoom to Selection frames just this body when ui-core has UI.zoomToBody, else the whole model
    if (UI.zoomToBody || UI.zoomToFit) items.push({ label: 'Zoom to Selection', action: function () { if (!(UI.zoomToBody && UI.zoomToBody(b.index)) && UI.zoomToFit) UI.zoomToFit(); } });
    if (UI.bodyMaterialMenu) items = items.concat([{ sep: true }], UI.bodyMaterialMenu(b));
    if (UI.cmdDeleteBody) items.push({ sep: true }, { label: 'Delete/Keep Body…', icon: 'deleteBody', action: function () { UI.cmdDeleteBody(null, [b.index]); } });   // rfHT
    if (b.featureId != null && K.findFeature(App.model, b.featureId)) {
      items.push({ sep: true });
      items.push({ label: 'Edit Feature', action: function () { UI.editFeature(K.findFeature(App.model, b.featureId)); } });
    }
    return items;
  }
  // lane flatopts-2 (rfJK): a sheet part's Cut list(1) folder holding Sheet<1>, as SolidWorks shows it; right-click
  // either ▸ Properties… (or double-click Sheet<1>) opens Cut-List Properties: Kernel.sheetCutList's rows (Bounding
  // Box Length / Width, Sheet Metal Thickness, Bend Radius, K-Factor…, Bends, Cutting Length-Outer / -Inner, Cut Outs,
  // Bounding Box Area (-Blank), Sheet Metal Gauge, Material, Mass, Description), recomputed from the current build every
  // time the tree refreshes while it is open. DOM: .ti.cl-folder, .ti.cl-row, #cutlist-dialog with tr.cl-row[data-name]
  // (td.cl-name, td.cl-expr, td.cl-val).
  function cutListMenu() { return [{ label: 'Properties…', action: function () { cmdCutListProperties(); } }]; }
  function appendCutListFolder(tree) {
    var open = expanded.cutList !== false;
    var folder = treeItem({ icon: 'folder', name: 'Cut list(1)', depth: 1, cls: 'cl-folder', children: true, open: open, toggle: function () { expanded.cutList = !open; refreshTree(); } });
    folder.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, cutListMenu()); });
    tree.appendChild(folder);
    var box = el('div', { class: 'tc' + (open ? ' open' : '') });
    var row = treeItem({ icon: 'flange', name: 'Sheet<1>(1)', depth: 2, cls: 'cl-row', title: 'Sheet<1>: right-click ▸ Properties… for the Cut-List Properties (bounding box, cutting lengths, bends)' });
    row.addEventListener('click', function () { setStatus('Sheet<1>: right-click ▸ Properties… (or double-click) for the Cut-List Properties.'); });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); cmdCutListProperties(); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, cutListMenu()); });
    box.appendChild(row);
    tree.appendChild(box);
    if (!$('modal').hidden && $('cutlist-dialog')) fillCutList($('cutlist-dialog'));   // a rebuild refreshes the open dialog
  }
  function fillCutList(box) {
    var r;
    try { r = K.sheetCutList(App.model, App.build, App.mesh); } catch (e) { r = { rows: [], error: e.message }; }
    box.innerHTML = '';
    var tb = el('tbody');
    r.rows.forEach(function (x) {
      tb.appendChild(el('tr', { class: 'cl-row', 'data-name': x.name }, [el('td', { class: 'cl-name', text: x.name }), el('td', { class: 'cl-expr', text: '"SW-' + x.name + '@@@Sheet<1>"' }),
        el('td', { class: 'cl-val', text: x.text + (x.unit ? ' ' + x.unit : '') })]));
    });
    box.appendChild(el('table', { class: 'cl-table', style: 'border-collapse: collapse; width: 100%' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Property Name' }), el('th', { text: 'Value / Text Expression' }), el('th', { text: 'Evaluated Value' })])]), tb]));
    if (r.error) box.appendChild(el('p', { class: 'cl-err', style: 'color: #b00', text: r.error }));
  }
  function cmdCutListProperties() {
    if (!App.model.sheet) { toast('Cut-List Properties: not a sheet metal part.'); return; }
    var box = el('div', { id: 'cutlist-dialog', style: 'max-height: 60vh; overflow: auto' });
    fillCutList(box);
    showModal({ title: 'Cut-List Properties — Sheet<1>', body: box, buttons: [{ label: 'OK', primary: true, action: closeModal }] });
  }
  UI.cmdCutListProperties = cmdCutListProperties;
  function appendBodiesFolder(tree, filter) {
    var infos = [];
    try { infos = UI.bodyInfos ? UI.bodyInfos() : []; } catch (e) { infos = []; }
    var isOpen = expanded.bodies == null ? infos.length > 1 : !!expanded.bodies;
    var shown = infos.filter(function (b) { return !filter || b.name.toLowerCase().indexOf(filter) >= 0; });
    if (filter && shown.length) isOpen = true;   // a filter hit inside the folder opens it
    var folder = treeItem({ icon: 'folder', name: 'Solid Bodies(' + infos.length + ')', depth: 1, cls: 'bodies-folder' + (infos.length ? '' : ' dim'), children: infos.length > 0, open: isOpen, toggle: function () { expanded.bodies = !isOpen; refreshTree(); } });
    folder.addEventListener('click', function () { if (infos.length) { expanded.bodies = !isOpen; refreshTree(); } });
    tree.appendChild(folder);
    if (!infos.length) return;
    var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
    shown.forEach(function (b) {
      var selected = App.sel && App.sel.kind === 'body' && App.sel.index === b.index;
      var hidden = isBodyHidden(b.index);
      var row = treeItem({ icon: 'body', name: b.name, depth: 2, cls: 'body-row' + (selected ? ' selected' : '') + (hidden ? ' hidden' : ''), title: bodyTitle(b) + (hidden ? ' (hidden)' : '') });
      row.setAttribute('data-body', String(b.index));
      row.title = bodyTitle(b) + (hidden ? ' (hidden)' : '');
      row.addEventListener('click', function () { selectBody(b.index); if (typeof UI.selectBody !== 'function') setStatus(bodyTitle(b)); });
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); var f = b.featureId != null ? K.findFeature(App.model, b.featureId) : null; if (f) UI.editFeature(f); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); selectBody(b.index); setStatus(bodyTitle(b)); showMenu(e.clientX, e.clientY, bodyMenu(b)); });
      box.appendChild(row);
    });
    tree.appendChild(box);
  }
  // Equations folder (SolidWorks shows it near the top of the tree once the part has global variables): one
  // "T = 10" row per model.equations entry; double-click opens Tools ▸ Equations. Open by default.
  function appendEquationsFolder(tree, filter) {
    var list = currentEquations();   // with the active configuration's values
    if (!list.length) return;
    var vars = (App.build && App.build.equations) || {}, errs = (App.build && App.build.equationErrors) || {};
    var shown = list.filter(function (q) { return !filter || String(q.name).toLowerCase().indexOf(filter) >= 0; });
    var isOpen = expanded.equations == null ? true : !!expanded.equations;
    if (filter && shown.length) isOpen = true;
    var anyErr = list.some(function (q) { return errs[q.name]; });
    var folder = treeItem({ icon: 'equations', name: 'Equations', depth: 1, cls: 'eq-folder' + (anyErr ? ' err' : ''), children: true, open: isOpen, title: list.length + ' global variable' + (list.length === 1 ? '' : 's') + (K.activeConfiguration && K.activeConfiguration(App.model) ? ' (configuration ' + K.activeConfiguration(App.model).name + ')' : '') + ' — double-click to manage', toggle: function () { expanded.equations = !isOpen; refreshTree(); } });
    folder.addEventListener('dblclick', function (e) { e.stopPropagation(); showEquations(); });
    folder.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Manage Equations…', action: showEquations }]); });
    tree.appendChild(folder);
    var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
    shown.forEach(function (q) {
      var err = errs[q.name], val = vars[q.name];
      var plain = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(String(q.expr));
      var row = treeItem({ icon: err ? 'error' : 'equations', name: q.name + ' = ' + q.expr + (!err && !plain && val != null ? '  (' + UI.fmtNum(val, 4) + ')' : ''), depth: 2, cls: 'eq-row' + (err ? ' err' : ''), title: err ? q.name + ': ' + err : q.name + ' = ' + q.expr + (val != null ? ' = ' + val : '') });
      row.setAttribute('data-eq', String(q.name));
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); showEquations(q.name); });
      row.addEventListener('click', function () { setStatus(err ? q.name + ': ' + err : q.name + ' = ' + q.expr + (val != null ? ' = ' + UI.fmtNum(val, 6) : '')); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [{ label: 'Manage Equations…', action: function () { showEquations(q.name); } }]); });
      box.appendChild(row);
    });
    tree.appendChild(box);
  }
  function featureRow(f, depth, kids, errors, warnings) {
    var err = errors[f.id], warn = warnings[f.id];
    var selected = App.sel && App.sel.kind === 'feature' && App.sel.id === f.id;
    var active = App.activeSketch === f.id;
    // r10/editpreview10: features after the rollback point of an Edit Sketch / Edit Feature are greyed (SolidWorks)
    var rolled = !active && ((App.rollback != null && App.model.features.indexOf(f) >= App.rollback) || UI.rollbarRolled(f));   // rfGQ: below the rollback bar
    var shownSuppressed = !UI.rollbarRolled(f) && UI.isSuppressed && UI.isSuppressed(f.id);
    var row = treeItem({ icon: err ? 'error' : (warn ? 'warn' : featureIcon(f)), name: (f.type === 'sketch' && UI.sketchTreePrefix ? UI.sketchTreePrefix(f) : '') + f.name + (active ? '  (editing)' : ''), depth: depth, children: !!kids, open: kids && kids.open, toggle: kids && kids.toggle, cls: (selected ? 'selected' : '') + (err ? ' err' : '') + (warn ? ' warn' : '') + (rolled ? ' rolled' : '') + (shownSuppressed ? ' suppressed' : ''), title: (err || warn || featureTitle(f)) + (rolled ? ' (rolled back)' : '') + (shownSuppressed ? ' (suppressed)' : ''), badge: f.type === 'sketch' && f.entities ? f.entities.length + ' ent.' : '', prefix: f.type === 'sketch' });
    row.setAttribute('data-fid', String(f.id));   // selection sync (ui-select.js)
    if (UI.rebuildMarkRow) UI.rebuildMarkRow(row, f, err, warn, featureIcon(f));   // r12/occtui12: own icon + error / warning badge, tooltip
    row.addEventListener('click', function (e) {
      // slow double-click (SolidWorks): a second, unhurried click on the name of the selected feature renames it;
      // a real double-click within the delay cancels it and edits the feature instead
      if (selected && e.isTrusted && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.target.classList && e.target.classList.contains('nm')) slowRename(f);
      App.sel = { kind: 'feature', id: f.id }; App.sel2 = null; UI.updateHighlights(); UI.updateSketches(); refreshTree(); if (UI.onSelectionChanged) UI.onSelectionChanged(); setStatus(f.name + (err ? ': ' + err : ''));
    });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); cancelSlowRename(); UI.editFeature(f); });
    row.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();
      // rfNR2: a right-click on one of several selected features keeps them selected (Add to New Folder takes them all)
      var cur = UI.selection ? UI.selection() : [];
      if (!(cur.length > 1 && cur.some(function (s) { return s && s.kind === 'feature' && s.id === f.id; }))) App.sel = { kind: 'feature', id: f.id };
      UI.updateHighlights(); refreshTree(); showMenu(e.clientX, e.clientY, featureMenu(f));
    });
    row.addEventListener('mousedown', function (e) { treeRowPress(e, f, row); });   // rfNR: drag to reorder
    return row;
  }
  function featureTitle(f) {
    switch (f.type) {
      case 'extrude': return (f.cut ? 'Cut' : 'Boss') + ' extrude, ' + (f.end === 'through' ? 'through all' : f.end === 'mid' ? 'mid plane ' + f.depth : 'blind ' + f.depth) + (f.draft ? ', draft ' + f.draft + '°' + (f.draftOut ? ' outward' : '') : '') + (f.normalCut ? ', normal cut' : '');
      case 'revolve': return (f.cut ? 'Cut' : 'Boss') + ' revolve ' + f.angle + '°';
      case 'lpattern': return 'Linear pattern ' + f.n1 + ' × ' + f.s1 + ' along ' + f.d1 + (f.d2 ? ', ' + f.n2 + ' × ' + f.s2 + ' along ' + f.d2 : '');
      case 'cpattern': return 'Circular pattern ' + f.n + ' about ' + (f.axisRef != null ? ((K.findFeature(App.model, f.axisRef) || {}).name || 'a reference axis') : f.axis);
      case 'mirror': return 'Mirror about ' + f.plane + (f.body ? ' (body)' : '');
      case 'plane': return 'Plane parallel to ' + f.ref + ' at ' + f.offset;
      case 'refaxis': return 'Reference axis: ' + ({ line: 'one line / edge / axis', planes: 'two planes', points: 'two points / vertices', cyl: 'cylindrical / conical face', pointFace: 'point and face / plane' }[f.kind] || f.kind);   // lane CZ
      case 'refpoint': return 'Reference point: ' + ({ arc: 'arc center', face: 'center of face', intersect: 'intersection', project: 'projection', on: 'on point', along: 'along curve ' + f.distance + (f.percent ? ' %' : '') }[f.kind] || f.kind);
      case 'csys': return 'Coordinate system' + (f.origin ? '' : ' at the origin');
      case 'chamfer': return 'Chamfer ' + f.d + ' on ' + (f.edges || []).length + ' edge pick' + ((f.edges || []).length === 1 ? '' : 's');
      case 'fillet': return 'Fillet R' + f.r + ' on ' + (f.edges || []).length + ' edge pick' + ((f.edges || []).length === 1 ? '' : 's');
      case 'sketchedBend': return 'Sketched bend ' + f.angle + '°, ' + ({ inside: 'material inside', outside: 'material outside', bendOutside: 'bend outside' }[f.position] || 'bend centerline') + (f.reverse ? ', reversed' : '') + (f.fixed ? ', fixed face picked' : '');
      case 'jog': return 'Jog ' + f.height + ' high, ' + f.length + ' flat, ' + f.angle + '°, ' + (f.edges || []).length + ' edge' + ((f.edges || []).length === 1 ? '' : 's');
      case 'flange': return (f.miterFlange ? 'Miter flange from a profile sketch, ' : (f.hem ? 'Hem gap ' + Math.round(f.radius * 2 * 1e4) / 1e4 + ', ' : f.miter ? 'Miter flange ' : 'Edge flange ') + f.length + ' long, ' + f.angle + '°, ') + (f.edges || []).length + ' edge' + ((f.edges || []).length === 1 ? '' : 's') + (f.position === 'inside' ? ', material inside' : f.position === 'outside' ? ', material outside' : '') +
        (f.miter ? ', mitred' + (f.miterGap > 0 ? ' (gap ' + f.miterGap + ')' : '') : '') + (f.relief && f.relief !== 'none' ? ', relief ' + (f.relief === 'rect' ? 'rectangle' : f.relief) : '');
      case 'shell': return 'Shell, walls ' + f.thickness + ' thick, ' + ((f.faces || []).length ? (f.faces || []).length + ' face' + ((f.faces || []).length === 1 ? '' : 's') + ' removed' : 'closed');
      case 'sweep': return (f.cut ? 'Cut' : 'Boss') + ' sweep along ' + (Array.isArray(f.path) ? f.path.length + ' points' : 'a path sketch');
      case 'loft': return (f.cut ? 'Cut' : 'Boss') + ' loft through ' + (f.sketches || []).length + ' sections';
      case 'boundary': return 'Boundary ' + (f.cut ? 'cut' : 'boss') + ': ' + (f.dir1 || []).length + ' profiles' + ((f.dir2 || []).length ? ', ' + f.dir2.length + ' Direction 2 curve' + (f.dir2.length === 1 ? '' : 's') : '') + (f.thin ? ', thin ' + f.thin.t : '');   // rfFB
      case 'import': return 'Imported ' + String(f.format || 'mesh').toUpperCase() + (f.file ? ' from ' + f.file : '') + ', ' + (f.solids || []).length + ' solid' + ((f.solids || []).length === 1 ? '' : 's') + (f.merge ? ', merged' : '');
      case 'hole': return 'Hole Wizard: ' + ({ cbore: 'Counterbore', csk: 'Countersink', hole: 'Hole', tap: 'Straight Tap' }[f.holeType] || f.holeType) + ' ' + (typeof HoleWizard !== 'undefined' && HoleWizard.standardOf ? HoleWizard.standardOf(f) : 'ISO') + ' ' + f.size + (f.holeType !== 'tap' ? ' ' + (f.fit || 'normal') + ' fit' : '') + ', ' + (f.end === 'through' ? 'Through All' : 'Blind ' + f.depth) + (function () { try { return ': ' + HoleWizard.callout(f, App.model && App.model.units === 'in' ? 'in' : 'mm').join(' · '); } catch (e) { return ''; } })();   // rfOD: the callout's wording (THRU ALL) as the PM and the drawing
      case 'sketch': return 'Sketch on ' + (f.plane.custom ? 'face' + (f.plane.face && K.findFeature(App.model, f.plane.face.feature) ? ' of ' + K.findFeature(App.model, f.plane.face.feature).name : '') : f.plane.featureId != null ? 'Plane' + f.plane.featureId : f.plane.ref + (f.plane.offset ? ' + ' + f.plane.offset : ''));
    }
    return f.type;
  }
  function featureMenu(f) {
    var items = [];
    if (UI.whatsWrong && App.build && ((App.build.errors || {})[f.id] || (App.build.warnings || {})[f.id])) items.push({ label: 'What\'s Wrong?', action: function () { UI.whatsWrong(f.id); } }, { sep: true });   // r12/occtui12
    if (f.type === 'sketch') items.push({ label: 'Edit Sketch', action: function () { UI.editSketch(f.id); } });
    else items.push({ label: 'Edit Feature', action: function () { UI.editFeature(f); } });
    if (f.sketch != null) items.push({ label: 'Edit Sketch', action: function () { UI.editSketch(f.sketch); } });
    if (f.type === 'sketch' && f.derived && UI.cmdUnderiveSketch) items.push({ label: 'Underive', action: function () { UI.cmdUnderiveSketch(f.id); } });   // rfGS
    if (f.type === 'sketch' && UI.editSketchPlane) items.push({ label: 'Edit Sketch Plane', action: function () { UI.editSketchPlane(f.id); } });   // r11/faceref11
    if (f.type === 'sketch') items.push({ label: 'Export sketch as DXF', action: function () { UI.exportSketchDXF(f); } });
    if (f.type === 'sketch') items.push({ label: f.hidden ? 'Show' : 'Hide', action: function () { f.hidden = !f.hidden; UI.updateSketches(); } });
    if (f.type === 'refaxis' || f.type === 'refpoint' || f.type === 'csys') items.push({ label: f.hidden ? 'Show' : 'Hide', action: function () { UI.pushUndo(); f.hidden = !f.hidden; UI.updatePlanes(); refreshTree(); } });   // lane CZ
    if (UI.suppressMenuItems && !UI.rollbarRolled(f)) Array.prototype.push.apply(items, UI.suppressMenuItems(f));   // rfFC: Suppress / Unsuppress
    items.push({ sep: true });
    Array.prototype.push.apply(items, rollbarMenu(f));   // rfGQ
    items.push({ sep: true });
    items.push({ label: 'Rename tree item', key: 'F2', help: 'Type a new name for the feature in the tree', action: function () { startRename(f); } });   // rfNG: SolidWorks' name, the key in the key column (it was in the label)
    items.push({ label: 'Add to New Folder', help: 'Put this feature (or the selected neighbouring features) in a new folder in the tree', action: function () { addToNewFolder(f); } });   // rfNR2
    items.push({ sep: true });
    items.push({ label: 'Delete', key: 'Del', action: function () { UI.deleteFeature(f.id); } });
    return items;
  }
  var slowTimer = null;
  function cancelSlowRename() { clearTimeout(slowTimer); slowTimer = null; }
  function slowRename(f) {
    cancelSlowRename();
    slowTimer = setTimeout(function () {
      slowTimer = null;
      if (App.sel && App.sel.kind === 'feature' && App.sel.id === f.id && !UI.hasPM() && K.findFeature(App.model, f.id) === f) startRename(f);
    }, 520);
  }
  // F2 / slow double-click / the context menu: the row is found by its feature id (a name prefix could match
  // "Sketch10" for "Sketch1"); a sketch inside a collapsed feature opens its folder first
  function startRename(f) {
    if (!f) return;
    cancelSlowRename();
    var tree = $('tree');
    var row = tree.querySelector('.ti[data-fid="' + f.id + '"]');
    if (row && !row.getClientRects().length) {
      var owner = null;
      App.model.features.forEach(function (g) { if (owner == null && g !== f && (g.sketch === f.id || g.profile === f.id || g.path === f.id || (g.sketches || []).indexOf(f.id) >= 0)) owner = g.id; });
      if (owner != null && !expanded[owner]) { expanded[owner] = true; refreshTree(); row = tree.querySelector('.ti[data-fid="' + f.id + '"]'); }
    }
    if (!row || !row.getClientRects().length) return;
    revealRow(tree, row);
    renameInline(row, f.name, function (n) { UI.pushUndo(); f.name = n; refreshTree(); });
  }
  // The name becomes a text box in place (same row height, the icon and badge stay put): Enter or a click elsewhere
  // keeps the new name, Esc restores the old one.
  function renameInline(row, current, done) {
    var nm = row.querySelector('.nm');
    if (!nm) return;
    var inp = el('input', { type: 'text', value: current, class: 'ti-rename', spellcheck: 'false', 'aria-label': 'Name' });
    nm.replaceWith(inp);
    row.classList.add('renaming');
    inp.focus({ preventScroll: true }); inp.select();
    var finished = false;
    function finish(ok) {
      if (finished) return;
      finished = true;
      var v = inp.value.trim();
      row.classList.remove('renaming');
      if (inp.parentNode) inp.replaceWith(nm);
      if (ok && v && v !== current) done(v);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); finish(false); } e.stopPropagation(); });
    inp.addEventListener('blur', function () { finish(true); });
    ['mousedown', 'click', 'dblclick'].forEach(function (t) { inp.addEventListener(t, function (e) { e.stopPropagation(); }); });
  }
  $('tree-filter-input').addEventListener('input', function () { syncFilterClear(); refreshTree(); });
  // rfNR2: SolidWorks' filter box: Esc or the x clears it (the x shows only while there is text)
  var filterClear = el('button', { class: 'tree-filter-clear', type: 'button', title: 'Clear the filter (Esc)', 'aria-label': 'Clear filter', text: '×' });
  filterClear.hidden = true;
  $('tree-filter-input').parentNode.appendChild(filterClear);
  function syncFilterClear() { filterClear.hidden = !$('tree-filter-input').value; }
  function clearTreeFilter() {
    var inp = $('tree-filter-input');
    if (!inp.value) return false;
    inp.value = ''; syncFilterClear(); refreshTree();
    return true;
  }
  filterClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
  filterClear.addEventListener('click', function (e) { e.stopPropagation(); clearTreeFilter(); $('tree-filter-input').focus(); });
  $('tree-filter-input').addEventListener('keydown', function (e) { if (e.key === 'Escape' && clearTreeFilter()) { e.preventDefault(); e.stopPropagation(); } });
  UI.clearTreeFilter = clearTreeFilter;

  // ------------------------------------------------------------------ menus (popup + menu bar)
  var openMenu = null;
  function closeMenus() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    menuHelpRestore();
    Array.prototype.forEach.call(document.querySelectorAll('#menus > li.open, .rb-more.open, .rb-fly.open'), function (li) { li.classList.remove('open'); });
  }
  // rfC: the sketch's shortcut menu as SolidWorks 2024 has it (right-click with the Select tool). On sketch entities:
  // Construction Geometry, Smart Dimension, Add Relation, Display/Delete Relations, Trim / Offset / Mirror Entities,
  // Properties… (one entity: its PropertyManager), Delete; on empty space: Smart Dimension and the common entities with
  // their keys, Convert / Trim Entities, the relation commands, Zoom to Fit; always Exit Sketch and Discard Changes and
  // Exit. ui-sketch.js's sketchMenu selects the entity under the pointer and builds a shorter menu; showMenu takes its
  // Exit Sketch / Discard rows' actions and shows this list instead (UI.sketchMenuItems(orig) for ui-sketch.js to call).
  function sketchMenuItems(orig) {
    orig = orig || [];
    var f = UI.activeSketchFeature ? UI.activeSketchFeature() : null;
    function act(label, fallback) { for (var i = 0; i < orig.length; i++) if (orig[i] && orig[i].label === label && orig[i].action) return orig[i].action; return fallback; }
    function tool(t) { return function () { UI.setTool(t); }; }
    function inSketch(fn) { return function () { if (App.mode !== 'sketch') return; fn(); }; }
    var sel = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && sel.indexOf(s.index) < 0) sel.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && sel.indexOf(App.sel.index) < 0) sel.push(App.sel.index);
    sel = sel.filter(function (i) { return f && f.entities[i]; });
    var items = [];
    if (sel.length) {
      var allCon = sel.every(function (i) { return f.entities[i].construction; });
      items.push({ label: 'Construction Geometry', icon: 'construction', checked: allCon, action: act('Construction Geometry', function () { UI.toggleConstruction(sel); }) });
      items.push({ sep: true });
      items.push({ label: 'Smart Dimension', key: 'D', icon: 'dim', action: tool('dimension') });
      items.push({ label: 'Add Relation…', icon: 'addRelation', action: inSketch(function () { UI.cmdAddRelations(); }) });
      items.push({ label: 'Display/Delete Relations…', icon: 'relations', action: function () { UI.cmdDisplayRelations('selected'); } });
      items.push({ sep: true });
      items.push({ label: 'Trim Entities', icon: 'trim', action: function () { UI.cmdTrimEntities(); } });
      items.push({ label: 'Offset Entities…', icon: 'offset', action: function () { UI.cmdOffsetEntities(); } });
      items.push({ label: 'Mirror Entities…', icon: 'mirrorEnt', action: function () { UI.cmdMirrorEntities(); } });
      items.push({ sep: true });
      if (sel.length === 1 && UI.splineMenuItems) items = items.concat(UI.splineMenuItems(f, sel[0]));   // rfAS: Spline Tools on a spline
      if (sel.length === 1 && UI.openEntityPM) items.push({ label: 'Properties…', icon: 'props', action: function () { UI.openEntityPM(sel[0]); } });
      items.push({ label: 'Delete', key: 'Del', icon: 'cancel', action: act('Delete', function () { UI.deleteSelection(); }) });
    } else {
      if (UI.sketchPictureMenuItems) items = items.concat(UI.sketchPictureMenuItems());   // rfAW: on a sketch picture: Edit Sketch Picture, Delete
      items.push({ label: 'Smart Dimension', key: 'D', icon: 'dim', action: tool('dimension') });
      items.push({ label: 'Line', key: 'L', icon: 'line', action: tool('line') });
      items.push({ label: 'Corner Rectangle', key: 'R', icon: 'rect', action: tool('rect') });
      items.push({ label: 'Circle', key: 'C', icon: 'circle', action: tool('circle') });
      items.push({ sep: true });
      items.push({ label: 'Convert Entities…', icon: 'convert', action: function () { UI.cmdConvertEntities(); } });
      items.push({ label: 'Trim Entities', icon: 'trim', action: function () { UI.cmdTrimEntities(); } });
      items.push({ sep: true });
      items.push({ label: 'Add Relation…', icon: 'addRelation', action: inSketch(function () { UI.cmdAddRelations(); }) });
      items.push({ label: 'Display/Delete Relations…', icon: 'relations', action: function () { UI.cmdDisplayRelations(); } });
      items.push({ label: 'Fully Define Sketch…', icon: 'fullyDefine', action: inSketch(function () { UI.cmdFullyDefineSketch(); }) });
      if (UI.cmdConstrainAll) items.push({ label: 'Constrain All', icon: 'fullyDefine', action: inSketch(function () { UI.cmdConstrainAll(); }) });   // rfAP
      if (UI.cmdModifySketch) items.push({ label: 'Modify Sketch…', icon: own('modifySketch', 'moveEnt'), action: inSketch(function () { UI.cmdModifySketch(); }) });   // rfAP
      items.push({ sep: true });
      items.push({ label: 'Zoom to Fit', key: 'F', icon: 'fit', action: function () { UI.zoomToFit(); } });
      if (UI.selectionModeMenuItems) items = items.concat([{ sep: true }], UI.selectionModeMenuItems());   // rfFD: Box / Lasso Selection
    }
    items.push({ sep: true });
    items.push({ label: 'Exit Sketch', icon: 'exitSketch', action: act('Exit Sketch', function () { UI.exitSketch(); }) });
    items.push({ label: 'Discard Changes and Exit', icon: 'cancel', action: act('Discard Changes and Exit', function () { UI.confirmCancelSketch(); }) });
    items.sketchMenu = true;
    return items;
  }
  function isSketchMenu(items) {
    function has(l) { return items.some(function (it) { return it && it.label === l; }); }
    return !items.sketchMenu && App.mode === 'sketch' && has('Exit Sketch') && has('Discard Changes and Exit');
  }
  // rfNG uisense: SolidWorks writes a line of help in the status bar for the menu row under the pointer (and, for a
  // greyed row, why it is greyed); the status line comes back when the menu closes. `help` / `why` on a row win;
  // else the row's last name (after ▸, without …) is looked up in MENU_HELP, the ribbon's lines and the ribbon items.
  var menuHelpSaved = null;
  function menuRowName(label) { return String(label || '').split('▸').pop().replace(/…\s*$/, '').trim(); }
  var cmdHelpCache = { n: -1, map: null };
  function commandHelp(name) {
    var tabs = [RIBBON, ASM_RIBBON], n = 0;
    tabs.forEach(function (t) { Object.keys(t).forEach(function (k) { n += (t[k] || []).length + 1; }); });
    if (cmdHelpCache.n !== n || !cmdHelpCache.map) {
      var map = {};
      tabs.forEach(function (t) { Object.keys(t).forEach(function (k) { ribbonLeaves(t[k]).forEach(function (it) { var f = flatLabel(it.label); if (it.help && !map[f]) map[f] = it.help; }); }); });
      cmdHelpCache = { n: n, map: map };
    }
    return cmdHelpCache.map[name] || '';
  }
  function menuRowHelp(it) {
    if (!it || it.sep) return '';
    if (it.help) return it.help;
    var full = String(it.label || '').replace(/…\s*$/, '').trim(), name = menuRowName(it.label);
    function ref(h) { return h && h.charAt(0) === '=' ? RIBBON_HELP[h.slice(1)] || DRAW_HELP[h.slice(1)] || commandHelp(h.slice(1)) || '' : h; }
    var group = / ▸ /.test(full) ? full.split(' ▸ ')[0] : '';
    return ref(MENU_HELP[full]) || ref(MENU_HELP[name]) || (UI.drawingActive && UI.drawingActive() && DRAW_HELP[name]) || RIBBON_HELP[name] || TIP_HELP[name] || commandHelp(name) ||
      (group && MENU_HELP[group] ? MENU_HELP[group] + ': ' + name.charAt(0).toLowerCase() + name.slice(1) : '') ||
      (/\((part|assembly|drawing|nest)\)$/i.test(full) || / - Sheet\d+$/.test(full) ? 'Switch to this open document' : '') ||
      (/^\d+\s/.test(full) ? (/\(not found\)$/.test(full) ? 'A recent document that is not there any more: click to remove it from the list or keep it' : 'Open this recent document') : '');
  }
  function menuRowWhy(it) {
    if (!it || !it.disabled) return '';
    if (it.why) return it.why;
    var l = String(it.label || '');
    if (/^(Sketch Entities|Sketch Tools|Spline Tools|Blocks|Relations|Dimensions) ▸/.test(l) && App.mode !== 'sketch') return 'Open a sketch first';
    if (/^Undo$/.test(l)) return 'Nothing to undo';
    if (/^Redo$/.test(l)) return 'Nothing to redo';
    if (/^(Suppress|Unsuppress)/.test(l)) return 'Select a feature in the FeatureManager first';
    if (/^Delete/.test(l)) return 'Select something to delete first';
    if (/^(Cut|Copy)$/.test(l)) return 'Select sketch entities first';
    if (/^Paste$/.test(l)) return 'Copy sketch entities first';
    if (isAsm()) return 'Not used in an assembly';
    return 'Not available now';
  }
  function menuHelpShow(it) {
    var s = $('status-msg');
    if (!s) return;
    if (menuHelpSaved === null) menuHelpSaved = s.textContent;
    var h = menuRowHelp(it), why = menuRowWhy(it);
    setStatus(why ? (h ? h + ' (' + why + ')' : why) : h);
  }
  function menuHelpRestore() {
    if (menuHelpSaved === null) return;
    var t = menuHelpSaved; menuHelpSaved = null;
    setStatus(t);
  }
  // rfNG uisense: a right-click on a face of the part gave only Select Other (and Clear Selection); SolidWorks selects
  // the face and offers what is done with it: Edit Feature / Edit Sketch of the feature that made it, Sketch on it,
  // Normal To, Measure, Appearance, Zoom to Fit. ui-select.js builds the short menu; showMenu adds these rows to it.
  function isFaceMenu(items) {
    return !items.faceMenu && App.mode === 'part' && !isAsm() && !(UI.drawingActive && UI.drawingActive()) && items.length && items[0] && items[0].label === 'Select Other' &&
      items.every(function (it) { return it && (it.label === 'Select Other' || it.label === 'Clear Selection'); });
  }
  function faceMenuItems(items, x, y) {
    var vp = (UI.viewport || $('viewport')).getBoundingClientRect(), faces = UI.pickFacesAll ? UI.pickFacesAll(x - vp.left, y - vp.top) : [];
    var fc = faces[0], i = fc ? fc.index : null, mf = i != null && App.mesh ? App.mesh.faces[i] : null;
    var ft = mf && App.triShared ? K.findFeature(App.model, App.triShared[mf.start]) : null;
    if (i == null) return items;
    function pick() { if (UI.setSelection) UI.setSelection([{ kind: 'face', index: i }]); else App.sel = { kind: 'face', index: i }; UI.updateHighlights(); }
    var out = items.slice();
    out.push({ sep: true });
    if (ft && ft.type !== 'sketch') out.push({ label: 'Edit Feature', icon: 'editFeature', help: 'Edit ' + ft.name + ', the feature that made this face', action: function () { UI.editFeature(ft); } });
    if (ft && ft.sketch != null && K.findFeature(App.model, ft.sketch)) out.push({ label: 'Edit Sketch', icon: 'sketch', help: 'Edit the sketch of ' + ft.name, action: function () { UI.editSketch(ft.sketch); } });
    out.push({ label: 'Sketch', icon: 'sketch', help: 'Start a sketch on this face', action: function () { pick(); UI.cmdSketch(); refreshRibbon(); } });
    out.push({ sep: true });
    out.push({ label: 'Normal To', key: 'Ctrl+8', icon: 'vNormalTo', help: 'Look straight at this face', action: function () { pick(); UI.normalToSelection(); } });
    out.push({ label: 'Measure', icon: 'measure', action: function () { pick(); UI.cmdMeasure(); } });
    out.push({ label: 'Appearance', icon: 'appearance', help: 'Colour and finish of the part (Task Pane ▸ Appearances, Scenes)', action: function () { pick(); UI.openTaskPane('appearance'); } });
    out.push({ sep: true });
    out.push({ label: 'Zoom to Fit', key: 'F', icon: 'fit', action: function () { UI.zoomToFit(); } });
    out.faceMenu = true;
    pick();
    return out;
  }
  function showMenu(x, y, items, anchorLi) {
    closeMenus();
    if (!anchorLi && isSketchMenu(items)) items = sketchMenuItems(items);
    if (!anchorLi && isFaceMenu(items)) items = faceMenuItems(items, x, y);
    var m = menuBox(items);
    document.body.appendChild(m);
    var mw = m.offsetWidth, mh = m.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    // p9-pm: a menu taller than the room below its title scrolls instead of moving up over the menu bar (where the next
    // click on File would land on one of its rows) or past the top of the window
    var room = H - 4 - (anchorLi ? y : 0);
    if (anchorLi && mh > room) { menuScroll(m, Math.max(80, room)); mh = m.offsetHeight; mw = m.offsetWidth; }
    if (anchorLi) { m.style.left = Math.max(0, Math.min(x, W - mw - 4)) + 'px'; m.style.top = y + 'px'; }
    else {
      // rfC: a context menu opens beside the clicked point and never over it (as Windows menus do): below and to the
      // right when there is room, else to the left and / or above it; one taller than the window scrolls (the point
      // stays clear, the menu being beside it)
      if (mh > H - 8) { menuScroll(m, H - 8); mh = m.offsetHeight; mw = m.offsetWidth; }
      var left = x + 1, top = y + 1;
      if (left + mw > W - 4) left = Math.max(0, x - mw - 1);
      if (top + mh > H - 4) top = Math.max(4, Math.min(y - mh - 1, H - 4 - mh));
      m.style.left = left + 'px'; m.style.top = top + 'px';
    }
    openMenu = m;
    if (anchorLi) anchorLi.classList.add('open');
  }
  // the rows of a menu (or a submenu): { label, action, key, icon, checked, disabled, dimmed, sep, items }
  function menuBox(items, sub) {
    // rfHF: a menu with icons is marked (and so is each row with one), so the check column and the icon column are laid
    // out side by side by plain CSS (style.css "rfHF menus"), never on top of each other
    var withIcons = items.some(function (it) { return it && !it.sep && it.icon; });
    var m = el('div', { class: 'menu' + (withIcons ? ' mi-icons' : '') + (sub ? ' menu-sub' : '') });
    items.forEach(function (it) {
      if (!it) return;
      if (it.sep) { m.appendChild(el('div', { class: 'sep' })); return; }
      // rfIP: `dimmed` greys a row that still runs (a recent document that is not found: the click offers Remove / Keep)
      var row = el('div', { class: 'mi' + (it.icon ? ' mi-has-ico' : '') + (it.disabled ? ' disabled' : '') + (it.dimmed && !it.disabled ? ' mi-dim' : '') });
      row.appendChild(el('span', { class: 'chk', text: it.checked ? '✓' : '' }));
      if (it.icon) row.appendChild(el('span', { class: 'mi-ico', html: Icons(it.icon, 16) }));   // r12/chrome12: ribbon overflow rows
      row.appendChild(el('span', { text: it.label }));
      var shownKey = it.key && UI.menuKeyText ? UI.menuKeyText(it.key) : it.key;   // lane profiles: the active profile's key
      if (shownKey) row.appendChild(el('span', { class: 'key', text: shownKey }));
      row.addEventListener('mouseenter', function () { menuHelpShow(it); });   // rfNG uisense: the help line
      row._menuItem = it;
      if (it.items && it.items.length) {
        // rfLF: a row with `items` opens them as a submenu beside it (on hover, or a click)
        row.classList.add('mi-subhost');
        row.appendChild(el('span', { class: 'mi-arrow', text: '▸' }));
        if (!it.disabled) {
          row.addEventListener('mouseenter', function () { openSubmenu(m, row, it.items); });
          row.addEventListener('click', function () { openSubmenu(m, row, it.items); });
        }
      } else {
        row.addEventListener('mouseenter', function () { closeSubmenu(m); });
        if (!it.disabled) {
          // p9-pm: a row runs on the release of the button over it (a Windows menu: press on File, drag, release on the
          // item also works) and the click that ends the same press is swallowed, so it never lands on the ribbon button
          // that was under the menu; click alone (keyboard, scripted) still runs it, once
          var ran = false;
          var run = function () { if (ran) return; ran = true; closeMenus(); if (UI.reports) UI.reports.crumb('menu: ' + it.label); it.action(); syncViewTab(); };   // lane CC: View tab toggles follow the menus
          row.addEventListener('mouseup', function (e) { if (e.button !== 0) return; e.stopPropagation(); if (e.detail > 0) guardClick(e); run(); });
          row.addEventListener('click', run);
        }
      }
      m.appendChild(row);
    });
    return m;
  }
  // rfLF: a submenu opens to the right of its row, level with it; one that would run off the right edge flips to the
  // left of its menu, one that would run off the bottom moves up, one taller than the window scrolls. It is a child of
  // its menu (position: fixed), so a press in it counts as inside the menu and closeMenus takes it with the menu.
  function closeSubmenu(m) { if (m._sub) { m._sub.remove(); m._sub = null; } if (m._subRow) { m._subRow.classList.remove('open'); m._subRow = null; } }
  function openSubmenu(m, row, items) {
    if (m._subRow === row && m._sub) return;
    closeSubmenu(m);
    var s = menuBox(items, true), W = window.innerWidth, H = window.innerHeight;
    s.style.left = '0px'; s.style.top = '0px';
    m.appendChild(s);
    var sw = s.offsetWidth, sh = s.offsetHeight;
    if (sh > H - 8) { menuScroll(s, H - 8); sh = s.offsetHeight; sw = s.offsetWidth; }
    var r = row.getBoundingClientRect(), mr = m.getBoundingClientRect();
    var left = mr.right - 2, top = r.top - 5;
    if (left + sw > W - 4) left = mr.left - sw + 2;   // flips to the left of its menu
    left = Math.max(0, Math.min(left, W - sw));
    if (top + sh > H - 4) top = H - 4 - sh;
    top = Math.max(4, top);
    s.style.left = left + 'px'; s.style.top = top + 'px';
    m._sub = s; m._subRow = row; row.classList.add('open');
  }
  // rfLF: a menu taller than the room it has scrolls as SolidWorks' do: the wheel, and a small arrow at the top and at
  // the bottom that scrolls while the pointer rests on it (faster while pressed); an arrow with nothing more that way is
  // greyed. The arrows stay put (position: sticky) while the rows move under them.
  var MENU_STEP = 24;
  function menuScroll(m, maxH) {
    if (m._scroll) return;
    m._scroll = true;
    m.classList.add('menu-scroll');
    m.style.maxHeight = Math.round(maxH) + 'px'; m.style.overflowY = 'auto';
    var up = el('div', { class: 'mi-scroll mi-scroll-up', html: '<span>▲</span>', 'aria-label': 'Scroll up' }), down = el('div', { class: 'mi-scroll mi-scroll-down', html: '<span>▼</span>', 'aria-label': 'Scroll down' });
    m.insertBefore(up, m.firstChild); m.appendChild(down);
    function sync() {
      var top = m.scrollTop <= 0, end = m.scrollTop + m.clientHeight >= m.scrollHeight - 1;
      if (up.classList.contains('off') !== top) up.classList.toggle('off', top);
      if (down.classList.contains('off') !== end) down.classList.toggle('off', end);
    }
    function by(d) { m.scrollTop += d; sync(); }
    [[up, -1], [down, 1]].forEach(function (a) {
      var b = a[0], dir = a[1], timer = 0, fast = false;
      function stop() { if (timer) { clearInterval(timer); timer = 0; } fast = false; }
      function start() { if (timer) return; timer = setInterval(function () { if (!m.isConnected) { stop(); return; } by(dir * (fast ? MENU_STEP : MENU_STEP / 3)); }, 40); }
      b.addEventListener('mouseenter', function () { closeSubmenu(m); start(); });
      b.addEventListener('mouseleave', stop);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); fast = true; by(dir * MENU_STEP); start(); });
      b.addEventListener('mouseup', function (e) { e.stopPropagation(); fast = false; });
      b.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    m.addEventListener('scroll', sync);
    m.addEventListener('wheel', function (e) {
      if (e.target.closest && e.target.closest('.menu') !== m) return;   // a submenu's own wheel
      e.preventDefault(); e.stopPropagation();
      closeSubmenu(m);
      by(e.deltaMode === 1 ? e.deltaY * MENU_STEP : e.deltaMode === 2 ? e.deltaY * m.clientHeight : e.deltaY);
    }, { passive: false });
    sync();
  }
  UI.menuScrollBy = function (d) { if (openMenu) { openMenu.scrollTop += d; openMenu.dispatchEvent(new Event('scroll')); } };   // test hook
  // p9-pm: the click that completes a press which ran a menu row, or which closed a menu-bar menu by pressing outside
  // it, goes nowhere (as in Windows): it never starts the ribbon command under the pointer. Matched by position, so a
  // later click elsewhere is not affected; any new press clears it.
  var clickGuard = null;
  function guardClick(e) { clickGuard = { x: e.clientX, y: e.clientY, t: performance.now() }; }
  document.addEventListener('mousedown', function (e) {
    clickGuard = null;
    // (detail: a press of the mouse; a scripted mousedown without it closes the menu but guards nothing)
    if (openMenu && e.button === 0 && e.detail > 0 && document.querySelector('#menus > li.open') && !openMenu.contains(e.target) && !(e.target.closest && e.target.closest('#menus'))) guardClick(e);
  }, true);
  document.addEventListener('click', function (e) {
    var g = clickGuard;
    if (!g) return;
    clickGuard = null;
    if (performance.now() - g.t > 1500 || Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 8) return;
    e.stopPropagation(); e.preventDefault();
  }, true);
  document.addEventListener('mousedown', function (e) { if (openMenu && !openMenu.contains(e.target) && !(e.target.closest && e.target.closest('#menus'))) closeMenus(); });
  // a menu left open would float over the wrong place once the window is resized: close it, as Windows menus do
  window.addEventListener('resize', function () { if (openMenu) closeMenus(); });
  function menuOpen() { return !!openMenu; }

  // UI.menuHook(menus) -> menus lets another document type (drawing.js) add or replace menu items
  function MENUS() { var m = partMenus(); return UI.menuHook ? UI.menuHook(m) : m; }
  // every ribbon item of a list (flyouts, stacks and the entity grid opened up), in order
  function ribbonLeaves(list) {
    var out = [];
    (list || []).forEach(function walk(it) {
      if (!it || it.sep) return;
      if (it.stack) it.stack.forEach(walk);
      else if (it.items) it.items.forEach(walk);
      else if (it.label) out.push(it);
    });
    return out;
  }
  // rfAP: Tools-menu rows for Sketch tab items, by id ('fillet:skFillet' = id fillet with icon skFillet): the row runs
  // the item as its ribbon button does; greyed outside a sketch, and for SolidWorks' commands Anvil does not have
  function sketchMenuRows(group, ids) {
    var leaves = ribbonLeaves(RIBBON.Sketch);
    return ids.map(function (spec) {
      var id = spec.split(':')[0], icon = spec.split(':')[1];
      var it = leaves.filter(function (x) { return x.id === id && (!icon || x.icon === icon); })[0];
      if (!it) return null;
      var has = !!(it.run || it.tool), flat = it.label.replace(/\s*\n\s*/g, ' ');
      // lane mcdirect2: a drawing tool starts a sketch with none open (UI.sketchToolStart), as its ribbon button does
      var starts = !!it.tool && it.tool !== 'dimension' && !!UI.sketchToolStart && !isAsm();
      var needs = id !== 'plane' && id !== 'sketch' && !starts;
      return { label: group + ' ▸ ' + flat, icon: it.icon || it.id, disabled: !has || (needs && App.mode !== 'sketch'), action: function () { if (it.tool && !it.run) UI.setTool(it.tool); else it.run(); refreshRibbon(); } };
    }).filter(Boolean);
  }
  function partMenus() {
    var v = App.view;
    return [
      { label: 'File', items: [
        { label: 'New…', key: 'Ctrl+N', action: UI.fileNew },
        { label: 'New ▸ Part', action: function () { UI.newPart(); } },
        { label: 'New ▸ Assembly', action: function () { UI.newAssembly(); } },
        { label: 'Open…', key: 'Ctrl+O', action: UI.fileOpen },
        { label: 'Import DXF / DWG into Sketch…', action: function () { UI.cmdInsertDXF(); } },   // dxf-import, dwg-import
        { label: 'Save', key: 'Ctrl+S', action: UI.fileSave },
        { label: 'Save As…', action: function () { UI.fileSaveAs(); } },
        { label: 'Save As DXF / DWG…', action: function () { UI.cmdDxfOutput(); } },
        { label: 'Pack and Go…', action: function () { if (UI.packAndGo) UI.packAndGo(); } },
        { sep: true },
        { label: 'Export STEP AP214…', action: function () { UI.fileSaveAs('step'); } },
        { label: 'Export 3MF…', action: function () { UI.fileSaveAs('3mf'); } },
        { label: 'Export OBJ…', action: function () { UI.fileSaveAs('obj'); } },
        { label: 'Export STL…', action: UI.exportSTL },
        { label: 'Export selected face as DXF…', action: UI.exportFaceDXF },
        { label: 'Export sketch as DXF…', action: function () { UI.exportSketchDXF(); } },
        { label: 'Export model as script…', action: UI.exportScript },
        { label: 'Export model as JSON…', action: UI.exportJSON },
        { sep: true },
        { label: 'Screenshot (PNG)…', action: UI.screenshot },
        { label: 'Properties…', action: function () { if (UI.fileProperties) UI.fileProperties(); else UI.openTaskPane('props'); } }
      ] },
      { label: 'Edit', items: [
        // lane BY: with a command's PropertyManager open, Undo / Redo cancel the command first (ui-app.js undoCommand)
        { label: 'Undo', key: 'Ctrl+Z', action: function () { (UI.undoCommand || UI.undo)(); }, disabled: !App.undo.length && !(UI.undoCancelsPM && UI.undoCancelsPM()) },
        { label: 'Redo', key: 'Ctrl+Y', action: function () { (UI.redoCommand || UI.redo)(); }, disabled: !App.redo.length && !(UI.undoCancelsPM && UI.undoCancelsPM()) },
        { sep: true }
      ].concat(App.mode === 'sketch' && UI.sketchCopy ? [   // sketch-layers: copy / paste sketch entities (ui-sketch-layers.js)
        { label: 'Cut', key: 'Ctrl+X', action: sketchCut, disabled: !selEntities().length },   // lane mcpolish
        { label: 'Copy', key: 'Ctrl+C', action: function () { UI.sketchCopy(); } },
        { label: 'Paste', key: 'Ctrl+V', action: function () { UI.sketchPaste(); }, disabled: !UI.sketchClipboard() },
        { sep: true }
      ] : []).concat(UI.suppressEditItems ? UI.suppressEditItems() : []).concat([   // rfFC: Suppress / Unsuppress
        { label: 'Delete', key: 'Del', action: UI.deleteSelection, disabled: !App.sel },
        { label: 'Rebuild', key: 'Ctrl+B', action: function () { UI.rebuild({ card: true }).then(function () { toast('Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms'); }); } },
        { label: 'Rebuild in background (Web Worker)', checked: App.workerOn, action: function () { UI.setWorkerOn(!App.workerOn); toast(App.workerOn ? 'Rebuilds run in a Web Worker' : 'Rebuilds run on the main thread'); } },
        { label: 'Clear selection', key: 'Esc', disabled: !App.sel && !(UI.selection && UI.selection().length), why: 'Nothing is selected', action: function () { App.sel = null; App.sel2 = null; UI.updateHighlights(); refreshTree(); } }
      ]) },
      { label: 'View', items: [
        { label: 'Zoom to Fit', key: 'F', action: UI.zoomToFit },
        { label: 'Zoom to Area', action: function () { App.zoomAreaMode = true; refreshHud(); } },
        { label: 'Selection Filter', key: 'F5', checked: !!(UI.selectionFilterBarShown && UI.selectionFilterBarShown()), action: function () { if (UI.toggleSelectionFilterBar) UI.toggleSelectionFilterBar(); } },
        { label: 'Previous View', key: 'Shift+Ctrl+Z', action: UI.previousView },
        { label: 'Modify ▸ Zoom Out', icon: 'unzoom80', action: function () { UI.unzoom(0.8); } },   // lane mcpolish (Mastercam: Unzoom 80%)
        { sep: true },
        { label: 'Front', key: 'Ctrl+1', action: function () { UI.setView('Front'); } },
        { label: 'Back', key: 'Ctrl+2', action: function () { UI.setView('Back'); } },
        { label: 'Left', key: 'Ctrl+3', action: function () { UI.setView('Left'); } },
        { label: 'Right', key: 'Ctrl+4', action: function () { UI.setView('Right'); } },
        { label: 'Top', key: 'Ctrl+5', action: function () { UI.setView('Top'); } },
        { label: 'Bottom', key: 'Ctrl+6', action: function () { UI.setView('Bottom'); } },
        { label: 'Isometric', key: 'Ctrl+7', action: function () { UI.setView('Isometric'); } },
        { label: 'Normal To', key: 'Ctrl+8', action: normalToSelection },
        { sep: true },
        { label: 'Shaded With Edges', checked: v.style === 'shadedEdges', action: function () { setStyle('shadedEdges'); } },
        { label: 'Shaded', checked: v.style === 'shaded', action: function () { setStyle('shaded'); } },
        { label: 'Hidden Lines Removed', checked: v.style === 'hlr', action: function () { setStyle('hlr'); } },
        { label: 'Hidden Lines Visible', checked: v.style === 'hlv', action: function () { setStyle('hlv'); } },   // r13/lines13
        { label: 'Wireframe', checked: v.style === 'wireframe', action: function () { setStyle('wireframe'); } },
        { sep: true },
        { label: 'Planes', checked: v.showPlanes, action: function () { v.showPlanes = !v.showPlanes; UI.updatePlanes(); } },
        { label: 'Origins', checked: v.showOrigin, action: function () { v.showOrigin = !v.showOrigin; UI.updateOrigin(); } },
        { label: 'Axes', checked: v.showAxes !== false, action: function () { v.showAxes = v.showAxes === false; UI.updatePlanes(); } },   // lane CZ
        { label: 'Points', checked: v.showPoints !== false, action: function () { v.showPoints = v.showPoints === false; UI.updatePlanes(); } },
        { label: 'Coordinate Systems', checked: v.showCsys !== false, action: function () { v.showCsys = v.showCsys === false; UI.updatePlanes(); } },
        { label: 'All Sketches', checked: v.showSketches, action: function () { v.showSketches = !v.showSketches; UI.updateSketches(); } },
        { label: 'Sketch Grid', checked: v.showGrid, action: function () { v.showGrid = !v.showGrid; App.gridStale = true; } },
        { label: 'Sketch Regions', checked: v.sketchRegions !== false, action: toggleSketchRegions },   // sketch-layers
        { label: 'Snap to Model', checked: v.snapModel !== false, action: function () { v.snapModel = v.snapModel === false; UI.setStatus(v.snapModel ? 'Sketch points snap to model vertices, edges, centres and faces.' : 'Sketch points snap to sketch geometry only.'); } },   // p9-modelsnap
        { label: 'Display ▸ Arc Center Points', icon: 'showArcCenters', checked: v.showArcCenters !== false, action: function () { toggleArcCenters(); } },   // lane arccenters
        { label: 'Display ▸ Show Endpoints', icon: 'showEndpoints', checked: v.showEndpoints !== false, action: function () { toggleShowEndpoints(); } },   // lane BS
        { label: 'Display ▸ Change Transparency', icon: 'translucency', checked: !!(UI.translucency && UI.translucency()), action: function () { UI.translucency(!UI.translucency()); } }   // lane mcpolish (Mastercam: Translucency)
      ].concat(UI.tangentEdgesMenuItems ? UI.tangentEdgesMenuItems('Display ▸ ') : [],   // rfHL: Tangent Edges Visible / As Phantom / Removed
        UI.depthFxMenuItems ? UI.depthFxMenuItems('Display ▸ ') : [], [   // rfHD: RealView, Shadows In Shaded Mode, Ambient Occlusion
        { label: 'Sketch Dimensions', checked: v.showDims, action: function () { v.showDims = !v.showDims; App.dimsStale = true; UI.setStatus(v.showDims ? 'Driven dimensions shown on every sketch entity. Click a value to change it.' : 'Only placed dimensions are shown.'); } },
        { label: 'Model Dimensions', checked: !!(UI.modelDimsShown && UI.modelDimsShown()), disabled: !UI.toggleModelDims, action: function () { UI.toggleModelDims(); } },   // lane model-dims
        { label: 'Section View', checked: !!v.section, action: UI.cmdSection },
        { sep: true },
        { label: 'Theme ▸ Light', checked: UI.theme() === 'light', action: function () { UI.setTheme('light'); toast('Light theme'); } },
        { label: 'Theme ▸ Dark', checked: UI.theme() === 'dark', action: function () { UI.setTheme('dark'); toast('Dark theme'); } },
        // r14/viewui14: View ▸ Background, remembered per browser (UI.setBackground, ui-core.js)
        { label: 'Background ▸ Gradient', checked: v.bg === 'gradient', action: function () { setBg('gradient'); } },
        { label: 'Background ▸ Plain', checked: v.bg === 'plain', action: function () { setBg('plain'); } },
        { label: 'Background ▸ Dark', checked: v.bg === 'dark', action: function () { setBg('dark'); } }
      ]) },
      { label: 'Insert', items: isAsm() ? [
        { label: 'Component ▸ Existing Part…', action: function () { UI.cmdInsertComponent(); } },
        { label: 'Mate…', action: function () { UI.cmdMate(); } }
      ] : [
        { label: 'Boss/Base ▸ Extrude', action: function () { UI.cmdExtrude(false); } },
        { label: 'Boss/Base ▸ Revolve', action: function () { UI.cmdRevolve(false); } },
        { label: 'Boss/Base ▸ Sweep', action: function () { UI.cmdSweep(false); } },
        { label: 'Boss/Base ▸ Loft', action: function () { UI.cmdLoft(false); } },
        { label: 'Boss/Base ▸ Boundary', action: function () { UI.cmdBoundary(false); } },   // rfFB
        { label: 'Cut ▸ Extrude', action: function () { UI.cmdExtrude(true); } },
        { label: 'Cut ▸ Revolve', action: function () { UI.cmdRevolve(true); } },
        { label: 'Cut ▸ Sweep', action: function () { UI.cmdSweep(true); } },
        { label: 'Cut ▸ Loft', action: function () { UI.cmdLoft(true); } },
        { label: 'Cut ▸ Boundary', action: function () { UI.cmdBoundary(true); } },   // rfFB
        { label: 'Features ▸ Hole Wizard', action: function () { (UI.cmdHoleWizard || UI.cmdHole)(); } },
        { label: 'Features ▸ Fillet', action: function () { UI.cmdFillet(); } },
        { label: 'Features ▸ Chamfer', action: function () { UI.cmdChamfer(); } },
        { label: 'Features ▸ Shell', action: function () { UI.cmdShell(); } },
        { label: 'Features ▸ Draft', icon: 'draft', action: function () { UI.cmdDraft(); } },   // rfDX
        { label: 'Features ▸ Rib', icon: 'rib', action: function () { UI.cmdRib(); } },   // rfDY
        { label: 'Features ▸ Intersect', icon: 'intersect', action: function () { UI.cmdIntersect(); } },   // rfDY
        { label: 'Features ▸ Delete/Keep Body…', icon: 'deleteBody', action: function () { UI.cmdDeleteBody(); } },   // rfHT
        { label: 'Features ▸ Imported…', action: function () { UI.cmdInsertImported(); } },
        { label: 'Features ▸ Fastening Features ▸ Vent', icon: 'vent', action: function () { UI.cmdVent(); } },   // lane DT2
        { label: 'Features ▸ Wrap', icon: 'wrap', action: function () { UI.cmdWrap(); } },   // rfDZ
        { sep: true },
        { label: 'Pattern/Mirror ▸ Linear Pattern', action: function () { UI.cmdLinearPattern(); } },
        { label: 'Pattern/Mirror ▸ Circular Pattern', action: function () { UI.cmdCircularPattern(); } },
        { label: 'Pattern/Mirror ▸ Mirror', action: function () { UI.cmdMirror(); } },
        { sep: true },
        { label: 'Sketch', action: UI.cmdSketch },
        { label: '3D Sketch', icon: 'sketch3d', action: function () { UI.cmdSketch3D(); } }, { label: '3D Sketch On Plane', icon: 'sketch3dPlane', action: function () { UI.cmdSketch3DOnPlane(); } },   // rfLQ
        { label: 'Derived Sketch', action: function () { UI.cmdDerivedSketch(); }, disabled: !UI.cmdDerivedSketch },   // rfGS
        { label: 'Reference Geometry ▸ Plane', action: function () { UI.cmdPlane(); } },
        { label: 'Curve ▸ Split Line…', icon: 'splitLine', action: function () { UI.cmdSplitLine(); } }, { label: 'Curve ▸ Projected…', icon: 'projCurve', action: function () { UI.cmdProjectedCurve(); } }, { label: 'Curve ▸ Composite…', icon: 'compositeCurve', action: function () { UI.cmdCompositeCurve(); } }, { label: 'Curve ▸ Curve Through XYZ Points…', icon: 'xyzCurve', action: function () { UI.cmdCurveXYZ(); } }, { label: 'Curve ▸ Curve Through Reference Points…', icon: 'refPtCurve', action: function () { UI.cmdCurveRefPoints(); } }, { label: 'Curve ▸ Helix/Spiral…', icon: 'helix', action: function () { UI.cmdHelix(); } },   // rfFA
        { label: 'Sheet Metal ▸ Base Flange', action: UI.cmdBaseFlange },
        { label: 'Sheet Metal ▸ Edge Flange', action: function () { UI.cmdEdgeFlange(); } },
        { label: 'Sheet Metal ▸ Miter Flange', action: function () { UI.cmdMiterFlange(); } },
        { label: 'Sheet Metal ▸ Hem', action: function () { UI.cmdHem(); } },
        { label: 'Sheet Metal ▸ Jog', action: function () { UI.cmdJog(); } },
        { label: 'Sheet Metal ▸ Flatten', checked: !!(App.model && App.model.flatState), action: function () { (UI.flattenWithBar || UI.toggleFlatten)(); } },
        { label: 'Tables ▸ Design Table…', action: function () { showDesignTable(); } }   // rfFC
      ] },
      { label: 'Tools', items: [
        { label: 'Macro ▸ Run script…', action: function () { UI.openTaskPane('macro'); } },
        { label: 'Measure', action: UI.cmdMeasure },
        { label: 'Mass Properties', action: UI.showMassProperties },
        { label: 'Evaluate ▸ Section Properties', action: function () { UI.cmdSectionProperties(); } },
        { label: 'Evaluate ▸ Check', action: function () { UI.cmdCheck(); } },
        { label: 'Evaluate ▸ Draft Analysis', action: function () { UI.cmdDraftAnalysis(); } },
        { label: 'Evaluate ▸ Clearance Verification', action: function () { UI.cmdClearance(); } },
        { label: 'Evaluate ▸ Interference Detection', action: function () { UI.cmdInterference(); }, disabled: !isAsm() },
        { label: 'Evaluate ▸ Sensor…', action: function () { UI.cmdSensor(); } },   // lane evalgrey: the Evaluate commands that were greyed
        { label: isAsm() ? 'Evaluate ▸ Hole Alignment…' : 'Evaluate ▸ Undercut Analysis…', action: function () { if (isAsm()) UI.cmdHoleAlignment(); else UI.cmdUndercut(); } },
        { label: 'Evaluate ▸ Compare Documents…', action: function () { UI.cmdCompare(); }, disabled: isAsm() },
        { label: 'Evaluate ▸ Performance Evaluation…', action: function () { UI.cmdPerformance(); }, disabled: isAsm() },
        { label: 'Evaluate ▸ Costing', action: function () { UI.cmdCosting(); }, disabled: isAsm() },
        { sep: true },
        // rfAP: Tools ▸ Sketch Entities / Sketch Tools / Relations / Dimensions with every sketch command, in
        // SolidWorks 2024's order (the rows run the Sketch tab's own items: sketchMenuRows)
      ].concat(sketchMenuRows('Sketch Entities', ['line', 'rect', 'crect', 'rect3', 'crect3', 'parallelogram', 'slot', 'cslot', 'aslot3', 'aslot', 'polygon', 'circle', 'pcircle', 'arc', 'tarc', 'arc3', 'ellipse', 'pellipse', 'parabola', 'conic', 'spline', 'styleSpline', 'eqnCurve', 'point', 'centerline', 'midline', 'parallelLine', 'tangentLine', 'perpLine', 'bisectorLine', 'tangentCircle', 'text', 'plane', 'fillet:skFillet', 'skChamfer']),
        // lane CV: Tools ▸ Sketch Tools in SolidWorks 2024's order — Convert Entities, Intersection Curve, Segment, Offset,
        // Trim, Extend, Split (Join, Close Arc: Anvil's), Jog Line, Construction Geometry, Mirror, Dynamic Mirror, Stretch,
        // Move, Rotate, Scale, Copy, Linear / Circular Pattern, Repair Sketch, SketchXpert, Modify (Replace Entity), Check
        // Sketch for Feature, Sketch Picture (Insert DXF / DWG: Anvil's). Fillet / Chamfer are under Sketch Entities.
        sketchMenuRows('Sketch Tools', ['convert', 'intersectCurve']), [
        { label: 'Sketch Tools ▸ Segment…', icon: own('segment', 'point'), action: function () { UI.cmdSegment(); }, disabled: App.mode !== 'sketch' || !UI.cmdSegment }
      ], sketchMenuRows('Sketch Tools', ['offset', 'trim', 'extend', 'splitEnt', 'joinEnt', 'closeArc']), [
        { label: 'Sketch Tools ▸ Jog Line', icon: 'jogLine', action: function () { UI.cmdJogLine(); }, disabled: App.mode !== 'sketch' || !UI.cmdJogLine }
      ], sketchMenuRows('Sketch Tools', ['construction', 'mirrorEnt', 'dynMirror', 'stretchEnt', 'moveEnt', 'rotateEnt', 'scaleEnt', 'copyEnt', 'sketchPattern', 'cSketchPattern']), [
        { label: 'Sketch Tools ▸ Repair Sketch…', action: function () { UI.cmdRepairSketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdRepairSketch },
        { label: 'Sketch Tools ▸ SketchXpert…', icon: own('sketchXpert', 'relations'), action: function () { UI.cmdSketchXpert(); }, disabled: App.mode !== 'sketch' || !UI.cmdSketchXpert },
        { label: 'Sketch Tools ▸ Modify…', icon: own('modifySketch', 'moveEnt'), action: function () { UI.cmdModifySketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdModifySketch },
        { label: 'Sketch Tools ▸ Align ▸ Grid/Origin…', icon: own('alignGrid', 'moveEnt'), action: function () { UI.cmdAlignGrid(); }, disabled: App.mode !== 'sketch' || !UI.cmdAlignGrid },   // lane rfIX
        { label: 'Sketch Tools ▸ Replace Entity…', icon: own('replaceEnt', 'moveEnt'), action: function () { UI.cmdReplaceEntity(); }, disabled: App.mode !== 'sketch' || !UI.cmdReplaceEntity },   // rfCR: ui-sketch-tools.js
        { label: 'Sketch Tools ▸ Close Sketch to Model…', icon: own('closeToModel', 'closeArc'), action: function () { UI.cmdCloseSketchToModel(); }, disabled: App.mode !== 'sketch' || !UI.cmdCloseSketchToModel },   // lane sketch-path: ui-sketch-tools.js
        { label: 'Sketch Tools ▸ Create Sketch from Selections', action: function () { UI.cmdSketchFromSelections(); }, disabled: App.mode !== 'sketch' || !UI.cmdSketchFromSelections },   // rfGS
        { label: 'Sketch Tools ▸ Make Path…', icon: own('makePath', 'pathLengthDim'), action: function () { UI.cmdMakePath(); }, disabled: App.mode !== 'sketch' || !UI.cmdMakePath },   // lane sketch-path: ui-sketch-tools.js
        { label: 'Sketch Tools ▸ Check Sketch for Feature…', action: function () { UI.cmdCheckSketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdCheckSketch },   // dxf-import (ui-sketch-import.js)
        { label: 'Sketch Tools ▸ Sketch Picture…', icon: 'sketchPicture', action: function () { UI.cmdSketchPicture(); }, disabled: App.mode !== 'sketch' || !UI.cmdSketchPicture },   // rfAW: ui-sketch-picture.js
        { label: 'Sketch Tools ▸ Insert DXF / DWG…', action: function () { UI.cmdInsertDXF(); }, disabled: isAsm() || !UI.cmdInsertDXF },
        // rfAS: Tools ▸ Spline Tools (ui-sketch-spline.js)
        { label: 'Spline Tools ▸ Insert Spline Point', icon: own('splInsertPt', 'spline'), action: function () { UI.cmdInsertSplinePoint(); }, disabled: App.mode !== 'sketch' || !UI.cmdInsertSplinePoint },
        { label: 'Spline Tools ▸ Simplify Spline…', icon: own('splSimplify', 'spline'), action: function () { UI.cmdSimplifySpline(); }, disabled: App.mode !== 'sketch' || !UI.cmdSimplifySpline },
        { label: 'Spline Tools ▸ Fit Spline…', icon: own('splFit', 'spline'), action: function () { UI.cmdFitSpline(); }, disabled: App.mode !== 'sketch' || !UI.cmdFitSpline },
        { label: 'Spline Tools ▸ Show Spline Handles', icon: own('splHandles', 'spline'), checked: !!(UI.splineView && UI.splineView.handles), action: function () { UI.cmdShowSplineHandles(); }, disabled: App.mode !== 'sketch' || !UI.cmdShowSplineHandles },
        { label: 'Spline Tools ▸ Show Curvature', icon: own('splCurvature', 'spline'), action: function () { UI.cmdShowCurvature(); }, disabled: App.mode !== 'sketch' || !UI.cmdShowCurvature },
        { label: 'Spline Tools ▸ Relax Spline', icon: own('splRelax', 'spline'), action: function () { UI.cmdRelaxSpline(); }, disabled: App.mode !== 'sketch' || !UI.cmdRelaxSpline },
        // rfAW: Add Tangency / Curvature Control, Show Inflection Points (ui-sketch-spline.js)
        { label: 'Spline Tools ▸ Add Tangency Control', icon: own('splTangency', 'spline'), action: function () { UI.cmdAddTangencyControl(); }, disabled: App.mode !== 'sketch' || !UI.cmdAddTangencyControl },
        { label: 'Spline Tools ▸ Add Curvature Control', icon: own('splCurvCtrl', 'spline'), action: function () { UI.cmdAddCurvatureControl(); }, disabled: App.mode !== 'sketch' || !UI.cmdAddCurvatureControl },
        { label: 'Spline Tools ▸ Show Inflection Points', icon: own('splInflection', 'spline'), action: function () { UI.cmdShowInflectionPoints(); }, disabled: App.mode !== 'sketch' || !UI.cmdShowInflectionPoints },
        { label: 'Spline Tools ▸ Show Minimum Radius', icon: own('splMinRadius', 'spline'), action: function () { UI.cmdShowMinimumRadius(); }, disabled: App.mode !== 'sketch' || !UI.cmdShowMinimumRadius },   // lane CV
        // rfAT: Tools ▸ Blocks (ui-sketch-blocks.js)
        { label: 'Blocks ▸ Make…', icon: own('blockMake', 'block'), action: function () { UI.cmdMakeBlock(); }, disabled: App.mode !== 'sketch' || !UI.cmdMakeBlock },
        { label: 'Blocks ▸ Edit Block', icon: own('blockEdit', 'block'), checked: !!(UI.blockEditing && UI.blockEditing()), action: function () { UI.cmdEditBlock(); }, disabled: App.mode !== 'sketch' || !UI.cmdEditBlock },
        { label: 'Blocks ▸ Insert…', icon: own('blockInsert', 'block'), action: function () { UI.cmdInsertBlock(); }, disabled: App.mode !== 'sketch' || !UI.cmdInsertBlock },
        { label: 'Blocks ▸ Add/Remove', icon: own('blockAddRemove', 'block'), action: function () { UI.cmdBlockAddRemove(); }, disabled: App.mode !== 'sketch' || !UI.cmdBlockAddRemove },   // lane sketchgaps
        { label: 'Blocks ▸ Rebuild', icon: own('blockRebuild', 'block'), action: function () { UI.cmdRebuildBlocks(); }, disabled: App.mode !== 'sketch' || !UI.cmdRebuildBlocks },
        { label: 'Blocks ▸ Explode', icon: own('blockExplode', 'block'), action: function () { UI.cmdExplodeBlock(); }, disabled: App.mode !== 'sketch' || !UI.cmdExplodeBlock },
        { label: 'Blocks ▸ Save…', icon: own('blockSave', 'block'), action: function () { UI.cmdSaveBlock(); }, disabled: App.mode !== 'sketch' || !UI.cmdSaveBlock },
        { label: 'Relations ▸ Add…', icon: 'addRelation', action: function () { if (App.mode !== 'sketch') toast('Open a sketch first.'); else UI.cmdAddRelations(); }, disabled: App.mode !== 'sketch' },
        { label: 'Relations ▸ Display/Delete…', icon: 'relations', action: function () { UI.cmdDisplayRelations(); }, disabled: App.mode !== 'sketch' },
        { label: 'Relations ▸ Constrain All', icon: 'fullyDefine', action: function () { UI.cmdConstrainAll(); }, disabled: App.mode !== 'sketch' || !UI.cmdConstrainAll },
        // rfAR: Scan Equal (ui-relations.js; SketchXpert is with the Sketch Tools above)
        { label: 'Relations ▸ Scan Equal…', icon: own('relEqual', 'relations'), action: function () { UI.cmdScanEqual(); }, disabled: App.mode !== 'sketch' || !UI.cmdScanEqual }
      ], sketchMenuRows('Dimensions', ['dim', 'horizDim', 'vertDim', 'ordinateDim', 'ordinateH', 'ordinateV', 'chamferDim', 'pathLengthDim', 'angRunDim', 'autodim']), [   // rfAQ
        { label: 'Dimensions ▸ Fully Define Sketch…', icon: 'fullyDefine', action: function () { if (UI.cmdFullyDefineSketch) UI.cmdFullyDefineSketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdFullyDefineSketch },   // sketchdims
        { sep: true },
        { label: 'Sketch Settings ▸ Enable on-screen numeric input on entity creation', checked: !!(UI.sketchNumericInput && UI.sketchNumericInput()), disabled: !UI.sketchNumericInput, action: function () { var on = UI.sketchNumericInput(!UI.sketchNumericInput()); toast(on ? 'Every entity you sketch gets its dimensions' : 'On-screen numeric input on entity creation off'); } },
        // lane CV: SolidWorks' sub-option of the numeric input (ui-sketch.js UI.sketchSettings 'dimOnlyTyped')
        { label: 'Sketch Settings ▸ Create dimension only when value is entered', checked: !!(UI.sketchSettings && UI.sketchSettings.get('dimOnlyTyped')), disabled: !UI.sketchSettings || !(UI.sketchNumericInput && UI.sketchNumericInput()), action: function () { var on = UI.sketchSettings.toggle('dimOnlyTyped'); toast(on ? 'Only the values you type become dimensions' : 'Every value of a new entity becomes a dimension'); } }
      ].concat(['autoRelations', 'autoSolve', 'noSolveMove', 'snapping', 'detachOnDrag', 'ghostOnDrag', 'overrideDims'].map(function (k) {   // rfAR (ui-sketch.js UI.sketchSettings); rfAY: Ghost image on drag
        var SSet = UI.sketchSettings, name = SSet ? SSet.NAMES[k] : k;
        return { label: 'Sketch Settings ▸ ' + name, checked: !!(SSet && SSet.get(k)), disabled: !SSet, action: function () { var on = SSet.toggle(k); toast(name + (on ? ' on' : ' off')); } };
      }), [
        { label: 'Equations…', action: function () { if (isAsm()) toast('Equations belong to parts: open the part to edit them.'); else showEquations(); }, disabled: isAsm() },
        { sep: true },
        { label: 'Units: millimeters (MMGS)', checked: App.model.units !== 'in', action: function () { setDocumentUnits('mm'); } },
        { label: 'Units: inches (IPS)', checked: App.model.units === 'in', action: function () { setDocumentUnits('in'); } },
        { label: 'Default units for new documents ▸ Inches (IPS)', checked: UI.defaultUnits() === 'in', action: function () { UI.setDefaultUnits('in'); toast('New parts and assemblies start in inches (IPS).'); } },
        { label: 'Default units for new documents ▸ Millimeters (MMGS)', checked: UI.defaultUnits() === 'mm', action: function () { UI.setDefaultUnits('mm'); toast('New parts and assemblies start in millimeters (MMGS).'); } },
        { label: 'Options…', action: function () { showOptionsDialog(); } },   // rfNG: SolidWorks' System Options dialog (it opened the Task Pane)
        { label: 'Options ▸ Image Quality…', action: function () { showOptionsDialog('image-quality'); } },
        // rfFD: System Options ▸ Display/Selection ▸ Select hidden entities (off: a box / lasso in a shaded view takes only visible edges)
        { label: 'Options ▸ Display/Selection ▸ Select hidden entities', checked: !!(UI.selectHidden && UI.selectHidden()), disabled: !UI.selectHidden, action: function () { var on = UI.selectHidden(!UI.selectHidden()); toast('Select hidden entities ' + (on ? 'on: a box or lasso selects through the part.' : 'off: a box or lasso in a shaded view selects only what can be seen.')); } },
        { sep: true }
      ].concat(UI.occtMenuItems ? UI.occtMenuItems() : []))) },   // r12/occtui12: Tools ▸ OpenCascade kernel ▸ … (ui-occt.js)
      { label: 'Window', items: [
        { label: 'Task Pane', checked: !$('tp-panel').hidden, action: function () { if ($('tp-panel').hidden) UI.openTaskPane('home'); else UI.closeTaskPane(); } }
      ] },
      { label: 'Help', items: [
        { label: 'Scripting reference', action: function () { UI.openTaskPane('macro'); } },
        { label: 'Keyboard shortcuts', action: UI.showShortcuts },
        { label: 'Report a Problem…', action: function () { if (UI.reports) UI.reports.dialog(); } },   // lane reports
        { label: 'About Anvil', action: UI.showAbout }
      ] }
    ];
  }
  // ------------------------------------------------------------------ Standard toolbar: Undo / Redo next to the menus
  // SolidWorks keeps Undo and Redo on the Standard toolbar at the top left; here they sit right after the menus
  // (#std-toolbar in index.html). Built once by renderMenuBar; syncStdToolbar greys each button when its stack is
  // empty and is called from refreshTree, which every rebuild, undo, redo and rename reaches.
  // rfBF: the whole quick-access toolbar of SolidWorks 2024 (New, Open, Save, Print | Undo, Redo | Select | Rebuild,
  // File Properties, Options). Each button runs the menu command of the same name (looked up in MENUS() when clicked,
  // so a drawing's own File menu is used in a drawing); Print opens the browser's print dialog.
  var stdBuilt = false;
  function menuCommand(label) {
    var menus = MENUS();
    for (var i = 0; i < menus.length; i++) {
      var items = menus[i].items || [];
      for (var j = 0; j < items.length; j++) if (items[j] && items[j].label === label && items[j].action) return items[j];
    }
    return null;
  }
  function runMenuCommand(label) { var it = menuCommand(label); if (it && !it.disabled) it.action(); }
  var STD_BUTTONS = [
    ['std-new', 'newDoc', 'New', 'Ctrl+N', 'Create a new part or assembly', function () { runMenuCommand('New…'); }],
    ['std-open', 'openDoc', 'Open', 'Ctrl+O', 'Open an existing document', function () { runMenuCommand('Open…'); }],
    ['std-save', 'saveDoc', 'Save', 'Ctrl+S', 'Save the active document', function () { runMenuCommand('Save'); }],
    ['std-print', 'printDoc', 'Print', '', 'Print the active document', function () { if (UI.reports && UI.reports.print) UI.reports.print(); else window.print(); }],
    ['std-select', 'select', 'Select', '', 'Select sketch entities, edges, faces and features', function () { if (App.mode === 'sketch' && UI.setTool) UI.setTool('select'); }],
    ['std-rebuild', 'rebuild', 'Rebuild', 'Ctrl+B', 'Rebuild the part', function () { runMenuCommand('Rebuild'); }],
    ['std-fileprops', 'fileProps', 'File Properties', '', 'Summary information and custom properties of the document', function () { runMenuCommand('Properties…'); }],
    ['std-options', 'options', 'Options', '', 'Change settings for Anvil', function () { runMenuCommand('Options…'); }]
  ];
  function renderStdToolbar() {
    var u = $('std-undo'), r = $('std-redo');
    if (!u || !r || stdBuilt) return;
    stdBuilt = true;
    u.innerHTML = Icons('undo', swIcon(16)); r.innerHTML = Icons('redo', swIcon(16));
    u.addEventListener('click', function () { (UI.undoCommand || UI.undo)(); });   // lane BY: cancels an open command first
    r.addEventListener('click', function () { (UI.redoCommand || UI.redo)(); });
    STD_BUTTONS.forEach(function (d) {
      var b = $(d[0]);
      if (!b) return;
      b.innerHTML = Icons(d[1], swIcon(16)); b.dataset.icon = d[1];
      setTip(b, { name: d[2], key: d[3], desc: d[4] });
      b.addEventListener('click', d[5]);
    });
    syncStdToolbar();
  }
  function syncStdToolbar() {
    var u = $('std-undo'), r = $('std-redo');
    if (!u || !r) return;
    var cmd = !!(UI.undoCancelsPM && UI.undoCancelsPM()), cu = App.undo.length > 0 || cmd, cr = App.redo.length > 0 || cmd;   // lane BY
    if (u.disabled === cu) u.disabled = !cu;
    if (r.disabled === cr) r.disabled = !cr;
    setTip(u, { name: 'Undo', key: 'Ctrl+Z', desc: 'Reverse the last change', note: cu ? '' : 'Nothing to undo' });
    setTip(r, { name: 'Redo', key: 'Ctrl+Y', desc: 'Repeat the change that was undone', note: cr ? '' : 'Nothing to redo' });
  }
  function renderMenuBar() {
    var ul = $('menus');
    ul.innerHTML = '';
    renderStdToolbar();
    MENUS().forEach(function (menu, i) {
      var li = el('li', { text: menu.label });
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (li.classList.contains('open')) { closeMenus(); return; }
        var r = li.getBoundingClientRect();
        showMenu(r.left, r.bottom, MENUS()[i].items, li);
      });
      li.addEventListener('mouseenter', function () { if (openMenu && !li.classList.contains('open') && document.querySelector('#menus > li.open')) { var r = li.getBoundingClientRect(); showMenu(r.left, r.bottom, MENUS()[i].items, li); } });
      ul.appendChild(li);
    });
  }
  // View ▸ Sketch Regions and the Sketch tab's Shaded Sketch Contours (SolidWorks' name for the same toggle)
  function toggleSketchRegions() {
    var v = App.view;
    v.sketchRegions = v.sketchRegions === false;
    UI.updateSketches(); refreshRibbon();
    UI.setStatus(v.sketchRegions ? 'Closed regions of the sketch are shaded and open ends marked.' : 'Sketch regions and open ends not shown.');
  }
  // lane BS: Show Endpoints (Mastercam's Display Endpoints; the Heads-up toolbar and View ▸ Display): the end-point
  // dots of the sketch being edited shown or hidden (ui-sketch.js takes them off; centres, sketch points, the origin and
  // snaps stay, and an end still selects and snaps). App.view.showEndpoints, remembered per browser, on by default.
  UI.showEndpointsPref = function () { try { return window.localStorage.getItem('anvil.showEndpoints') !== '0'; } catch (e) { return true; } };
  App.view.showEndpoints = UI.showEndpointsPref();   // (read once at start, as a reload does)
  function toggleShowEndpoints(on) {
    App.view.showEndpoints = on == null ? App.view.showEndpoints === false : !!on;
    try { window.localStorage.setItem('anvil.showEndpoints', App.view.showEndpoints ? '1' : '0'); } catch (e) { /* storage blocked */ }
    UI.updateSketches(); refreshHud();
    UI.setStatus(App.view.showEndpoints ? 'Sketch end points shown.' : 'Sketch end points hidden: they still select and snap.');
  }
  UI.toggleShowEndpoints = toggleShowEndpoints;
  // lane arccenters (rfMB, user 2026-11-12 "how do i remove the green dots in the center of circles"; Mastercam's Home ▸
  // Display ▸ Arc Center Points): the centre dots of circles, arcs, ellipses, slots and polygons shown or hidden in the
  // sketch being edited (ui-core.js / ui-sketch.js skip them, UI.isArcCenterRef). A centre still snaps, selects,
  // takes relations and dimensions; selected or pre-highlighted it shows (the selection dot and the hover ring are
  // drawn on their own). Sketch points and the origin are not centres. App.view.showArcCenters, remembered per browser,
  // on by default.
  UI.showArcCentersPref = function () { try { return window.localStorage.getItem('anvil.showArcCenters') !== '0'; } catch (e) { return true; } };
  App.view.showArcCenters = UI.showArcCentersPref();
  function toggleArcCenters(on) {
    App.view.showArcCenters = on == null ? App.view.showArcCenters === false : !!on;
    try { window.localStorage.setItem('anvil.showArcCenters', App.view.showArcCenters ? '1' : '0'); } catch (e) { /* storage blocked */ }
    UI.updateSketches(); App.dimsStale = true; refreshHud(); refreshRibbon();
    UI.setStatus(App.view.showArcCenters ? 'Arc center points shown.' : 'Arc center points hidden: they still select and snap.');
    return App.view.showArcCenters;
  }
  UI.toggleArcCenters = toggleArcCenters;
  function setStyle(s) { App.view.style = s; UI.applyDisplayStyle(); refreshHud(); if (frame) frameStatusSync(); }
  function setBg(b) { return UI.setBackground(b); }   // r14/viewui14: keeps the viewport's other classes (was className =), remembered
  function normalToSelection() {
    if (App.sel && App.sel.kind === 'face' && App.mesh) { var f = App.mesh.faces[App.sel.index]; UI.viewNormalTo(K.planeFromFace(f.normal, f.centroid)); }
    else if (App.sel && App.sel.kind === 'plane') UI.viewNormalTo(App.sel.plane || K.makePlane(App.sel.ref, 0));
    else if (App.sel && App.sel.kind === 'edge') {
      // look along the mean normal of the edge's faces with the edge horizontal
      var e = App.sel.edge, V = UI.V, n = V.norm(e.normals.reduce(function (s, q) { return V.add(s, q); }, [0, 0, 0]));
      if (V.len(n) < 1e-6) n = e.normals[0];
      var x = V.norm(V.sub(e.dir, V.scale(n, V.dot(e.dir, n))));
      UI.viewNormalTo({ origin: e.mid, x: x, y: V.cross(n, x), n: n });
    }
    else if (App.mode === 'sketch') UI.viewNormalTo(UI.activePlane());
    else toast('Select a face or plane first.');
  }

  // ------------------------------------------------------------------ the View tab (lane CC)
  // Mastercam's View tab with the view commands Anvil already has, in groups with their captions under them
  // (ui-transform.js lays the captions out from `group`): Zoom | Orientation (Mastercam's Graphics View) | Appearance |
  // Show / Hide (Mastercam's Display) | Section | Managers. Each button calls what the View menu or the heads-up toolbar
  // calls; a toggle is pressed while it is on (the menu and the HUD keep their own copies of these commands). The
  // Managers go to the » menu first when the ribbon is narrow (`extra`). An assembly gets it without the Levels Manager.
  function viewTab(asm) {
    function orient(name, key, help) { return { id: 'v' + (name === 'Isometric' ? 'Iso' : name), label: name, key: key, help: help, run: function () { UI.setView(name); } }; }
    function style(s, id, label, help) { return { id: id, label: label, help: help, run: function () { setStyle(s); }, active: function () { return App.view.style === s; } }; }
    function bg(b, label) { return { id: 'vBackground', cmd: 'vBg' + b.charAt(0).toUpperCase() + b.slice(1), label: label, help: 'Graphics-area background: ' + label.toLowerCase() + ' (View ▸ Background)', run: function () { setBg(b); }, active: function () { return App.view.bg === b; } }; }
    function show(id, label, help, on, flip) { return { id: id, label: label, help: help, run: flip, active: on }; }
    var managers = [
      { id: 'vFeatureTree', label: 'FeatureManager', help: 'FeatureManager design tree: show the features of the document in the left pane', run: function () { if (frameMgrOn()) { frameShowManager('solids', true); return; } var b = document.querySelector('#fm-tabs button[data-tab="tree"]'); if (b) b.click(); }, active: function () { return frameMgrOn() ? frameMgr === 'solids' && $('pm').hidden : App.fmTab === 'tree'; } },   // lane mcpolish: under a frame, the Solids manager
      { id: 'levels', cmd: 'vLevels', label: 'Levels Manager', help: 'Numbered part-wide levels (CUT, ETCH, BEND …) with their own colours, shown or hidden, in the left pane', run: function () { if (UI.showLevelsManager) UI.showLevelsManager(); else toast('The Levels Manager did not load.'); }, active: function () { return App.fmTab === 'levels'; } },
      { id: 'filter', label: 'Selection Filter', key: 'F5', help: 'Show or hide the Selection Filter toolbar: pick only the kinds of geometry switched on', run: function () { if (UI.toggleSelectionFilterBar) UI.toggleSelectionFilterBar(); }, active: function () { return !!(UI.selectionFilterBarShown && UI.selectionFilterBarShown()); } }
    ];
    if (asm) managers.splice(1, 1);
    return [
      { id: 'vZoomFit', label: 'Zoom to\nFit', key: 'F', group: 'Zoom', help: 'Zoom so the whole model fits the graphics area', run: function () { UI.zoomToFit(); } },
      { group: 'Zoom', stack: [
        { id: 'zoomArea', label: 'Zoom to Area', help: 'Drag a box round the area to zoom to (click again to cancel)', run: function () { App.zoomAreaMode = !App.zoomAreaMode; refreshHud(); }, active: function () { return !!App.zoomAreaMode; } },
        { id: 'prevView', label: 'Previous View', key: 'Shift+Ctrl+Z', help: 'Go back to the view before the last view change', run: function () { UI.previousView(); } }] },
      { sep: true },
      { group: 'Orientation', grid: true, cls: 'rb-vgrid', stack: [
        orient('Front', 'Ctrl+1', 'Look at the model from the front'), orient('Back', 'Ctrl+2', 'Look at the model from the back'),
        orient('Left', 'Ctrl+3', 'Look at the model from the left'), orient('Right', 'Ctrl+4', 'Look at the model from the right'),
        orient('Top', 'Ctrl+5', 'Look down on the model from the top'), orient('Bottom', 'Ctrl+6', 'Look up at the model from the bottom'),
        orient('Isometric', 'Ctrl+7', 'Isometric view: the three axes at equal angles'),
        { id: 'vNormalTo', label: 'Normal To', key: 'Ctrl+8', help: 'Look straight at the selected face, plane or edge, or at the open sketch', run: function () { normalToSelection(); } }] },
      { sep: true },
      { group: 'Appearance', stack: [style('shadedEdges', 'dsShadedEdges', 'Shaded With Edges', 'Shade the model and draw its edges'), style('shaded', 'dsShaded', 'Shaded', 'Shade the model without its edges'),
        style('hlr', 'dsHLR', 'Hidden Lines Removed', 'Draw only the edges you can see')] },
      { group: 'Appearance', stack: [style('hlv', 'dsHLV', 'Hidden Lines Visible', 'Draw the visible edges, and the hidden ones dashed'), style('wireframe', 'dsWireframe', 'Wireframe', 'Draw every edge, hidden or not, with no shading')] },
      { id: 'appearance', label: 'Edit\nAppearance', group: 'Appearance', help: 'Change the part colour (Task Pane ▸ Appearances, Scenes)', run: function () { UI.openTaskPane('appearance'); } },
      { group: 'Appearance', stack: [
        { id: 'scene', label: 'Apply Scene', help: 'Pick the graphics-area scene: Gradient, Plain or Dark', run: applySceneMenu },
        { fly: 'vBackground', items: [bg('gradient', 'Gradient Background'), bg('plain', 'Plain Background'), bg('dark', 'Dark Background')] },
        { id: 'vTheme', label: 'Dark Theme', help: 'Switch the window between the light and the dark theme (View ▸ Theme)', run: function () { var d = UI.theme() !== 'dark'; UI.setTheme(d ? 'dark' : 'light'); toast(d ? 'Dark theme' : 'Light theme'); }, active: function () { return !!(UI.theme && UI.theme() === 'dark'); } }] },
      { sep: true },
      { group: 'Show / Hide', stack: [
        show('vPlanes', 'Planes', 'Show or hide the reference planes', function () { return !!App.view.showPlanes; }, function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); }),
        show('vOrigins', 'Origins', 'Show or hide the origin', function () { return !!App.view.showOrigin; }, function () { App.view.showOrigin = !App.view.showOrigin; UI.updateOrigin(); }),
        show('vSketches', 'All Sketches', 'Show or hide the sketches that are not being edited', function () { return !!App.view.showSketches; }, function () { App.view.showSketches = !App.view.showSketches; UI.updateSketches(); })] },
      { group: 'Show / Hide', stack: [
        show('vGrid', 'Sketch Grid', 'Show or hide the grid on the sketch plane', function () { return !!App.view.showGrid; }, function () { App.view.showGrid = !App.view.showGrid; App.gridStale = true; }),
        show('vRegions', 'Sketch Regions', 'Shade the closed regions of the sketch and mark its open ends', function () { return App.view.sketchRegions !== false; }, function () { toggleSketchRegions(); }),
        show('vSketchDims', 'Sketch Dimensions', 'Show the driven dimensions on every sketch entity, or only the placed ones', function () { return !!App.view.showDims; }, function () { var v = App.view; v.showDims = !v.showDims; App.dimsStale = true; UI.setStatus(v.showDims ? 'Driven dimensions shown on every sketch entity. Click a value to change it.' : 'Only placed dimensions are shown.'); })] },
      { group: 'Show / Hide', stack: [
        show('showArcCenters', 'Arc Center Points', 'Show or hide the centre dots of circles, arcs, ellipses and slots (they still select and snap)', function () { return App.view.showArcCenters !== false; }, function () { toggleArcCenters(); }),
        show('showEndpoints', 'Show Endpoints', 'Show or hide the end-point dots of sketch entities (they still select and snap)', function () { return App.view.showEndpoints !== false; }, function () { toggleShowEndpoints(); }),
        show('vSnapModel', 'Snap to Model', 'Let sketch points snap to model vertices, edges, centres and faces', function () { return App.view.snapModel !== false; }, function () { var v = App.view; v.snapModel = v.snapModel === false; UI.setStatus(v.snapModel ? 'Sketch points snap to model vertices, edges, centres and faces.' : 'Sketch points snap to sketch geometry only.'); })] },
      { sep: true },
      { id: 'section', label: 'Section\nView', group: 'Section', help: 'Cut the view with a section plane (click again to turn it off)', run: function () { UI.cmdSection(); }, active: function () { return !!App.view.section; } },
      { sep: true, extra: true },
      { group: 'Managers', extra: true, stack: managers }
    ];
  }
  // Apply Scene: the heads-up toolbar's scene list, under the View tab's button (or the HUD's when the tab is not shown)
  function sceneItems() { return [['gradient', 'Gradient'], ['plain', 'Plain'], ['dark', 'Dark']].map(function (s) { return { label: s[1], checked: App.view.bg === s[0], action: function () { setBg(s[0]); } }; }); }
  function applySceneMenu() {
    var b = document.querySelector('#ribbon-buttons .rb[aria-label="Apply Scene"]');
    if (!b || !b.offsetWidth) b = document.querySelector('#hud [data-hud="Apply Scene"]');
    var r = b ? b.getBoundingClientRect() : { left: window.innerWidth / 2, bottom: 120 };
    showMenu(r.left, r.bottom + 1, sceneItems());
  }
  // the View tab's pressed states follow changes made from the View menu, the heads-up toolbar and the FeatureManager tabs
  function syncViewTab() { if (ribbonBuilt && App.ribbonTab === 'View') refreshRibbon(); }

  // ------------------------------------------------------------------ heads-up view toolbar
  // Built once; later calls only move the active marks (the buttons stay under the mouse, tooltips do not flicker).
  // Drop-down items are made when the menu opens, so their check marks are always current.
  var hudActive = null;
  // r14/viewui14: the View Selector cube (UI.showViewSelector, ui-core.js) comes up with this menu; a pick in the menu closes both
  function hideVS() { if (UI.hideViewSelector) UI.hideViewSelector(); }
  function orientItems() { return Object.keys(UI.VIEWS).map(function (n) { return { label: n, action: function () { hideVS(); UI.setView(n); } }; }).concat([{ sep: true }, { label: 'Normal To (Ctrl+8)', action: function () { hideVS(); normalToSelection(); } }]); }
  function refreshHud() {
    var hud = $('hud');
    syncViewTab();   // lane CC
    var hudPx = swIcon(16);   // lane swribbon: 32 px under SolidWorks' large buttons, 16 under a frame
    if (hudActive && hud.children.length && hud.dataset.px === String(hudPx)) { hudActive.forEach(function (a) { var on = !!a[1](); if (a[0].classList.contains('active') !== on) a[0].classList.toggle('active', on); }); return; }
    hud.innerHTML = '';
    hud.dataset.px = String(hudPx);
    hudActive = [];
    // rfBH: SolidWorks 2024's Heads-up View toolbar: Zoom to Fit, Zoom to Area, Previous View, Section View, Dynamic
    // Annotation Views, then six drop-downs (View Orientation, Display Style, Hide/Show Items, Edit Appearance, Apply
    // Scene, View Settings), each a small icon with its caret beside it; no separators, on a transparent bar.
    // children[5] stays View Orientation (showOrientationMenu clicks it); data-hud names each button (UI.HUD_ORDER).
    function btn(icon, title, action, active, caret) {
      // rfHA: the flyout arrow is a crisp 7 x 4 SVG chevron on whole pixels (the ▾ text glyph sat soft and off centre)
      var b = el('button', { class: caret ? 'hud-dd' : '', html: Icons(icon, hudPx) + (caret ? '<span class="caret"><svg viewBox="0 0 7 4" width="7" height="4" aria-hidden="true"><path d="M0 0h7L3.5 4z" fill="currentColor"/></svg></span>' : ''), title: title, onclick: action });
      b.setAttribute('data-hud', title.replace(/ \(.*$/, '').replace(/ — [\s\S]*$/, ''));
      if (active) { hudActive.push([b, active]); if (active()) b.classList.add('active'); }
      hud.appendChild(b);
      return b;
    }
    function dd(icon, title, items) { var b = btn(icon, title, function () { var r = b.getBoundingClientRect(); showMenu(r.left, r.bottom + 2, items()); }, null, true); return b; }
    btn('fit', 'Zoom to Fit (F)', UI.zoomToFit);
    btn('zoomArea', 'Zoom to Area', function () { App.zoomAreaMode = !App.zoomAreaMode; refreshHud(); }, function () { return App.zoomAreaMode; });
    btn('prevView', 'Previous View', UI.previousView);
    btn('section', 'Section View', UI.cmdSection, function () { return !!App.view.section; });
    // Anvil has no 3D annotation views yet: greyed, as SolidWorks shows a command that cannot run (a click says why)
    var da = btn('annotations', 'Dynamic Annotation Views — Show annotations only in the view they belong to. Not available in this build yet', function () { toast('Dynamic Annotation Views is not available in this build yet.'); });
    da.classList.add('off'); da.setAttribute('aria-disabled', 'true');
    var ob = btn('orient', 'View Orientation (Space)', function () { var r = ob.getBoundingClientRect(); showMenu(r.left, r.bottom + 2, orientItems()); if (UI.showViewSelector) UI.showViewSelector(); }, null, true);   // r14/viewui14: with the View Selector
    dd('display', 'Display Style', function () { return [['shadedEdges', 'Shaded With Edges'], ['shaded', 'Shaded'], ['hlr', 'Hidden Lines Removed'], ['hlv', 'Hidden Lines Visible'], ['wireframe', 'Wireframe']].map(function (s) { return { label: s[1], checked: App.view.style === s[0], action: function () { setStyle(s[0]); } }; }); });
    dd('hideshow', 'Hide/Show Items', function () { return [
      { label: 'Planes', checked: App.view.showPlanes, action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } },
      { label: 'Origins', checked: App.view.showOrigin, action: function () { App.view.showOrigin = !App.view.showOrigin; UI.updateOrigin(); } },
      { label: 'Axes', checked: App.view.showAxes !== false, action: function () { App.view.showAxes = App.view.showAxes === false; UI.updatePlanes(); } },   // lane CZ
      { label: 'Points', checked: App.view.showPoints !== false, action: function () { App.view.showPoints = App.view.showPoints === false; UI.updatePlanes(); } },
      { label: 'Coordinate Systems', checked: App.view.showCsys !== false, action: function () { App.view.showCsys = App.view.showCsys === false; UI.updatePlanes(); } },
      { label: 'Sketches', checked: App.view.showSketches, action: function () { App.view.showSketches = !App.view.showSketches; UI.updateSketches(); } },
      { label: 'Sketch grid', checked: App.view.showGrid, action: function () { App.view.showGrid = !App.view.showGrid; App.gridStale = true; } },
      { label: 'Arc Center Points', icon: 'showArcCenters', checked: App.view.showArcCenters !== false, action: function () { toggleArcCenters(); } },   // lane arccenters
      { label: 'Snap to model', checked: App.view.snapModel !== false, action: function () { App.view.snapModel = App.view.snapModel === false; } }   // p9-modelsnap
    ]; });
    dd('appearance', 'Edit Appearance', function () { return [{ label: 'Edit Appearance…', action: function () { UI.openTaskPane('appearance'); } }]; });
    dd('scene', 'Apply Scene', function () { return [['gradient', 'Gradient'], ['plain', 'Plain'], ['dark', 'Dark']].map(function (s) { return { label: s[1], checked: App.view.bg === s[0], action: function () { setBg(s[0]); } }; }); });
    btn('showEndpoints', 'Show Endpoints — Show or hide the end-point dots of sketch entities', function () { toggleShowEndpoints(); }, function () { return App.view.showEndpoints !== false; });   // lane BS
    // rfHD: SolidWorks' View Settings flyout starts with RealView Graphics, Shadows In Shaded Mode, Ambient Occlusion
    dd('settings', 'View Settings', function () { return (UI.depthFxMenuItems ? UI.depthFxMenuItems().concat([{ sep: true }]) : []).concat(UI.tangentEdgesMenuItems ? UI.tangentEdgesMenuItems().concat([{ sep: true }]) : [], [   // rfHL: tangent edge display
      { label: 'Options…', action: function () { showOptionsDialog(); } },
      { sep: true },
      { label: 'Light Theme', checked: !!UI.theme && UI.theme() === 'light', action: function () { UI.setTheme('light'); } },
      { label: 'Dark Theme', checked: !!UI.theme && UI.theme() === 'dark', action: function () { UI.setTheme('dark'); } }
    ]); });
    fitHud();
    if (window.ResizeObserver && !hud._fit) { hud._fit = new ResizeObserver(function () { fitHud(); }); hud._fit.observe($('viewport')); }
  }
  // lane swribbon: in a graphics area narrower than the toolbar (32 px icons) the buttons that do not fit are left out
  // from the right end, as SolidWorks' Heads-up View toolbar does; they come back when the area widens
  function fitHud() {
    var hud = $('hud'), vp = $('viewport');
    if (!hud || !vp) return;
    var kids = Array.prototype.slice.call(hud.children);
    kids.forEach(function (b) { if (b.classList.contains('hud-over')) b.classList.remove('hud-over'); });
    var room = vp.clientWidth - 12;
    for (var i = kids.length - 1; i > 0 && hud.scrollWidth > room + 0.5; i--) kids[i].classList.add('hud-over');
  }
  UI.HUD_ORDER = ['Zoom to Fit', 'Zoom to Area', 'Previous View', 'Section View', 'Dynamic Annotation Views', 'View Orientation', 'Display Style', 'Hide/Show Items', 'Edit Appearance', 'Apply Scene', 'Show Endpoints', 'View Settings'];
  // the last pointer position (used below to place a popup at the pointer)
  var lastPointer = null;
  document.addEventListener('mousemove', function (e) { lastPointer = [e.clientX, e.clientY, e.target]; }, { passive: true });
  // (user 2026-11-04: "when i click the spacebar the only thing that should pop up is the square view selection") Space
  // shows the View Selector cube alone; the list of views stays on the heads-up View Orientation button's drop-down.
  function showOrientationMenu() {
    // r14/viewui14: Space again closes the View Selector (SolidWorks toggles it)
    if (UI.viewSelectorShown && UI.viewSelectorShown()) { hideVS(); closeMenus(); return; }
    closeMenus();
    if (UI.showViewSelector) UI.showViewSelector();
  }

  // ------------------------------------------------------------------ modal
  // rfNG uisense (head, from lane pmsense): Tools ▸ Options… opens a dialog as SolidWorks' System Options does (it
  // opened the Task Pane's Options page); the dialog holds that same page (ui-app.js tpProps: document properties,
  // interface profile, image quality …), changes apply at once, OK closes it. One Options at a time: the Task Pane's
  // page is closed while the dialog is up. `role` focuses a section ([data-role="image-quality"]).
  function showOptionsDialog(role) {
    if (!UI.taskPaneContent) { UI.openTaskPane('props'); return; }
    if (!$('tp-panel').hidden && UI.taskPaneCurrent && UI.taskPaneCurrent() === 'props') UI.closeTaskPane();
    var host = el('div', { class: 'opt-dialog', id: 'options-dialog' });
    UI.taskPaneContent('props', host);
    showModal({ title: 'System Options', body: host, buttons: [{ label: 'OK', primary: true, action: closeModal }] });
    $('modal').classList.add('modal-options');
    var s = role ? host.querySelector('[data-role="' + role + '"]') : null;
    if (s) { if (s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); if (s.focus) s.focus(); }
  }
  UI.showOptionsDialog = showOptionsDialog;
  function showModal(opts) {
    $('modal').classList.remove('modal-options');
    $('modal-title').innerHTML = '';
    $('modal-title').appendChild(el('span', { text: opts.title }));
    $('modal-title').appendChild(el('button', { text: '✕', title: 'Close', onclick: closeModal }));
    var body = $('modal-body');
    body.innerHTML = '';
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else body.appendChild(opts.body);
    var btns = $('modal-buttons');
    btns.innerHTML = '';
    (opts.buttons || [{ label: 'Close', primary: true, action: closeModal }]).forEach(function (b) {
      var bt = el('button', { class: 'btn' + (b.primary ? ' primary' : ''), text: b.label, onclick: function () { if (b.action) b.action(); if (b.close !== false && !b.action) closeModal(); } });
      if (b.id) bt.id = b.id;
      btns.appendChild(bt);
    });
    $('modal').hidden = false;
    var first = body.querySelector('textarea, input, button');
    if (first) first.focus();
  }
  function closeModal() { $('modal').hidden = true; $('modal-card').classList.remove('wide'); }
  // Enter in a dialog (ui-app.js keydown) presses its primary button
  function modalDefault() { var b = $('modal-buttons').querySelector('.btn.primary'); if (b && !b.disabled) b.click(); }

  // ------------------------------------------------------------------ Tools ▸ Equations
  // "Equations, Global Variables, and Dimensions": edits a working copy of model.equations ([{ name, expr }], in
  // order, each may use the ones above it; expr is stored without the leading "="). Every keystroke re-evaluates the
  // whole list with Kernel.resolveEquations and shows the value, or the error in red, per row. OK applies the list as
  // one undoable change and rebuilds (setEquations); Cancel discards it.
  // DOM: #eq-dialog, table #eq-table, rows tr.eq-row[data-index] with input.eq-name, input.eq-expr, td.eq-val (.err),
  // buttons .eq-up / .eq-down / .eq-del; #eq-add adds a row; #eq-msg; modal buttons #eq-ok and #eq-cancel.
  // Normalise any accepted form to [{ name, expr }]: a list of { name, expr|value }, or an object { T: 10, W: '=T*2' }.
  function normalizeEquations(spec) {
    var out = [];
    function exprText(v) { return v == null ? '' : String(v).replace(/^\s*=\s*/, '').trim(); }
    if (Array.isArray(spec)) spec.forEach(function (q) { if (q && q.name != null && String(q.name).trim() !== '') out.push({ name: String(q.name).trim(), expr: exprText(q.expr != null ? q.expr : q.value) }); });
    else if (spec && typeof spec === 'object') Object.keys(spec).forEach(function (k) { out.push({ name: k, expr: exprText(spec[k]) }); });
    return out;
  }
  // currentEquations() -> [{ name, expr }] as the model resolves them now (the active configuration's values applied)
  function currentEquations() {
    if (K.effectiveEquations) return normalizeEquations(K.effectiveEquations(App.model));
    return normalizeEquations(App.model.equations || []);
  }
  // setEquations(list) -> the rebuild Promise. An empty list removes model.equations. With a configuration active,
  // Kernel.applyEquations writes a variable that configuration sets into it only; everything else goes to the base.
  function setEquations(spec) {
    var list = normalizeEquations(spec);
    UI.pushUndo();
    if (K.applyEquations) K.applyEquations(App.model, list);
    else if (list.length) App.model.equations = list; else delete App.model.equations;
    return UI.afterRebuild(UI.rebuild(), function () { refreshTree(); refreshStatus(); });
  }
  function evaluateEquations(list) {
    if (!K.resolveEquations) return { vars: {}, errors: {} };
    try { return K.resolveEquations({ equations: list }); } catch (e) { return { vars: {}, errors: {} }; }
  }
  function showEquations(focusName) {
    var rows = currentEquations();
    var acfg = K.activeConfiguration ? K.activeConfiguration(App.model) : null;
    var wrap = el('div', { id: 'eq-dialog' });
    if (acfg) wrap.appendChild(el('p', { id: 'eq-config', class: 'eq-config', text: 'Configuration: ' + acfg.name, title: 'Values of variables this configuration sets are changed in it only; the other configurations keep theirs.' }));
    var table = el('table', { id: 'eq-table', class: 'eq-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Name' }), el('th', { text: 'Value / Equation' }), el('th', { text: 'Evaluates to' }), el('th', { text: '' })])]));
    var tbody = el('tbody');
    table.appendChild(tbody);
    var msg = el('div', { id: 'eq-msg', class: 'eq-msg' });
    var help = el('p', { class: 'eq-help', html: 'Global variables are evaluated top to bottom; each may use the ones above it. Use them in any PropertyManager number field by typing <kbd>=</kbd>, e.g. <kbd>=T*2</kbd>. Operators <kbd>+ - * / ^</kbd>, parentheses, <kbd>pi</kbd>, and functions such as <kbd>sqrt()</kbd>, <kbd>sind()</kbd>, <kbd>min()</kbd>, <kbd>max()</kbd>.' });
    var addBtn = el('button', { id: 'eq-add', class: 'btn', text: '+ Add global variable', onclick: function () { rows.push({ name: nextName(), expr: '0' }); render(rows.length - 1, 'name'); } });
    wrap.appendChild(table);
    wrap.appendChild(el('div', { class: 'eq-bar' }, [addBtn, msg]));
    wrap.appendChild(help);
    function nextName() {
      var used = {}; rows.forEach(function (q) { used[q.name] = true; });
      for (var i = 1; ; i++) if (!used['D' + i]) return 'D' + i;
    }
    function evaluate() {
      var live = rows.filter(function (q) { return q.name !== '' || q.expr !== ''; });
      var r = evaluateEquations(live);
      var bad = 0;
      Array.prototype.forEach.call(tbody.querySelectorAll('tr.eq-row'), function (tr) {
        var q = rows[+tr.getAttribute('data-index')], td = tr.querySelector('.eq-val');
        var err = null;
        if (q.name === '' && q.expr === '') err = null;
        else if (q.name === '') err = 'Enter a name';
        else if (q.expr === '') err = 'Enter a value or equation';
        else if (r.errors[q.name]) err = r.errors[q.name];
        else if (r.vars[q.name] == null) err = 'Not evaluated';
        td.classList.toggle('err', !!err);
        tr.classList.toggle('err', !!err);
        td.textContent = err ? err : (q.name === '' ? '' : UI.fmtNum(r.vars[q.name], 6));
        td.title = err || '';
        if (err) bad++;
      });
      msg.textContent = bad ? bad + ' equation' + (bad === 1 ? '' : 's') + ' with errors' : (rows.length ? rows.length + ' global variable' + (rows.length === 1 ? '' : 's') : 'No global variables yet');
      msg.classList.toggle('err', bad > 0);
      return bad;
    }
    function render(focusIndex, focusField) {
      tbody.innerHTML = '';
      rows.forEach(function (q, i) {
        var tr = el('tr', { class: 'eq-row', 'data-index': String(i) });
        var name = el('input', { type: 'text', class: 'eq-name', spellcheck: 'false', 'aria-label': 'Name' });
        name.value = q.name;
        var expr = el('input', { type: 'text', class: 'eq-expr', spellcheck: 'false', 'aria-label': 'Value or equation' });
        expr.value = q.expr === '' ? '' : '= ' + q.expr;
        name.addEventListener('input', function () { q.name = name.value.trim(); evaluate(); });
        expr.addEventListener('input', function () { q.expr = expr.value.replace(/^\s*=\s*/, '').trim(); evaluate(); });
        [name, expr].forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyAndClose(); } else if (e.key !== 'Escape') e.stopPropagation(); }); });
        var tools = el('td', { class: 'eq-tools' }, [
          el('button', { class: 'eq-up', title: 'Move up', text: '▲', onclick: function () { if (i > 0) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); render(i - 1, 'name'); } } }),
          el('button', { class: 'eq-down', title: 'Move down', text: '▼', onclick: function () { if (i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); render(i + 1, 'name'); } } }),
          el('button', { class: 'eq-del', title: 'Delete', text: '✕', onclick: function () { rows.splice(i, 1); render(Math.min(i, rows.length - 1), 'name'); } })
        ]);
        if (i === 0) tools.firstChild.disabled = true;
        if (i === rows.length - 1) tools.children[1].disabled = true;
        tr.appendChild(el('td', {}, [name]));
        tr.appendChild(el('td', {}, [expr]));
        tr.appendChild(el('td', { class: 'eq-val' }));
        tr.appendChild(tools);
        tbody.appendChild(tr);
      });
      evaluate();
      if (focusIndex != null && focusIndex >= 0) {
        var t = tbody.querySelectorAll('tr.eq-row')[focusIndex];
        var inp = t && t.querySelector(focusField === 'expr' ? '.eq-expr' : '.eq-name');
        if (inp) setTimeout(function () { inp.focus(); inp.select(); }, 0);
      }
    }
    function applyAndClose() {
      if (evaluate()) { msg.textContent = 'Fix the equations shown in red first.'; msg.classList.add('err'); return null; }
      var list = rows.filter(function (q) { return q.name !== '' && q.expr !== ''; }).map(function (q) { return { name: q.name, expr: q.expr }; });
      var before = JSON.stringify(currentEquations());
      closeModal();
      if (JSON.stringify(list) === before) return UI.whenIdle();
      var p = setEquations(list);
      UI.lastEquationsApply = p;
      p.then(function () {
        var n = App.build && App.build.errors ? Object.keys(App.build.errors).length : 0;
        setStatus('Equations applied: ' + list.length + ' global variable' + (list.length === 1 ? '' : 's') + '. ' + (n ? n + ' rebuild error' + (n > 1 ? 's' : '') + '.' : 'Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms.'));
      });
      return p;
    }
    showModal({ title: 'Equations, Global Variables, and Dimensions', body: wrap, buttons: [
      { id: 'eq-ok', label: 'OK', primary: true, action: applyAndClose },
      { id: 'eq-cancel', label: 'Cancel', action: closeModal }
    ] });
    $('modal-card').classList.add('wide');
    var fi = -1;
    rows.forEach(function (q, i) { if (focusName != null && q.name === focusName) fi = i; });
    render(fi >= 0 ? fi : null, 'expr');
    if (!rows.length) setTimeout(function () { addBtn.focus(); }, 0);
    UI.equationsDialog = { rows: rows, evaluate: evaluate, apply: applyAndClose, render: render };
  }

  // ------------------------------------------------------------------ ConfigurationManager
  // Configurations are named sets of global-variable values (Kernel: model.configurations [{ name, values }],
  // model.activeConfiguration). The panel #config-panel replaces #fm-tree while its tab is active: a header, the
  // buttons #cfg-add / #cfg-rename / #cfg-delete / #cfg-activate, and #cfg-list with one .cfg-row[data-name] per
  // configuration (.active = the one shown, .selected = the one the buttons act on). Double-click a row to show it.
  // Every operation is one undo step followed by a rebuild; UI.configurations exposes them for scripts and tests.
  var cfgSelected = null;
  function cfgCopy(c) { var o = { name: String(c.name), values: JSON.parse(JSON.stringify(c.values || {})) }; if (c.suppressed) o.suppressed = JSON.parse(JSON.stringify(c.suppressed)); return o; }   // rfFC: suppression states
  function cfgList() { return (K.configurationList ? K.configurationList(App.model) : []).map(cfgCopy); }
  function cfgActiveName() { var ac = K.activeConfiguration ? K.activeConfiguration(App.model) : null; return ac ? String(ac.name) : null; }
  function cfgValuesText(values) {
    var keys = Object.keys(values || {});
    var txt = keys.map(function (k) { return k + '=' + values[k]; }).join(', ');
    return txt.length > 40 ? txt.slice(0, 38) + '…' : txt;
  }
  function nextConfigName() {
    for (var i = cfgList().length + 1; ; i++) if (!K.findConfiguration(App.model, 'Config' + i)) return 'Config' + i;
  }
  function cfgFail(msg) { return Promise.reject(new Error(msg)); }
  function cfgCheckName(name, except) {
    var n = name == null ? '' : String(name).trim();
    if (!n) return { error: 'A configuration needs a name.' };
    if (n !== except && K.findConfiguration(App.model, n)) return { error: 'A configuration named "' + n + '" already exists.' };
    return { name: n };
  }
  // one undoable change: snapshot, mutate App.model, rebuild, refresh tree / status / panel
  function cfgCommit(mutate, message) {
    UI.pushUndo();
    mutate(App.model);
    return UI.afterRebuild(UI.rebuild(), function () { refreshTree(); refreshStatus(); if (message) setStatus(message); });
  }
  function cfgAdd(name) {
    var chk = cfgCheckName(name == null ? nextConfigName() : name);
    if (chk.error) return cfgFail(chk.error);
    var values = K.captureConfiguration(App.model);
    var first = !K.configurationList(App.model).length;
    if (first && chk.name === 'Default') return cfgFail('A configuration named "Default" already exists.');
    cfgSelected = chk.name;
    return cfgCommit(function (m) {
      if (!Array.isArray(m.configurations)) m.configurations = [];
      if (first) m.configurations.push({ name: 'Default', values: JSON.parse(JSON.stringify(values)) });
      var ac0 = K.activeConfiguration(m), nc = { name: chk.name, values: values };
      if (ac0 && ac0.suppressed) nc.suppressed = JSON.parse(JSON.stringify(ac0.suppressed));   // rfFC: starts as the active one shows
      m.configurations.push(nc);
      m.activeConfiguration = chk.name;
    }, 'Added configuration "' + chk.name + '" (now active).');
  }
  function cfgRename(oldName, newName) {
    var c = K.findConfiguration(App.model, oldName);
    if (!c) return cfgFail('No configuration named "' + oldName + '".');
    var chk = cfgCheckName(newName, String(c.name));
    if (chk.error) return cfgFail(chk.error);
    if (chk.name === String(c.name)) return Promise.resolve();
    var from = String(c.name);
    if (cfgSelected === from) cfgSelected = chk.name;
    return cfgCommit(function (m) {
      var cc = K.findConfiguration(m, from);
      if (String(m.activeConfiguration) === from) m.activeConfiguration = chk.name;
      cc.name = chk.name;
    }, 'Renamed configuration "' + from + '" to "' + chk.name + '".');
  }
  function cfgRemove(name) {
    var c = K.findConfiguration(App.model, name);
    if (!c) return cfgFail('No configuration named "' + name + '".');
    var gone = String(c.name);
    if (cfgSelected === gone) cfgSelected = null;
    return cfgCommit(function (m) {
      var wasActive = cfgActiveName() === gone;
      m.configurations = m.configurations.filter(function (x) { return !(x && String(x.name) === gone); });
      var left = K.configurationList(m);
      if (!left.length) { delete m.configurations; delete m.activeConfiguration; }
      else if (wasActive || !K.activeConfiguration(m)) m.activeConfiguration = String(left[0].name);
    }, 'Deleted configuration "' + gone + '".');
  }
  function cfgActivate(name) {
    var c = K.findConfiguration(App.model, name);
    if (!c) return cfgFail('No configuration named "' + name + '".');
    if (cfgActiveName() === String(c.name)) return Promise.resolve();
    var to = String(c.name);
    return cfgCommit(function (m) { m.activeConfiguration = to; }, 'Configuration "' + to + '" is active.');
  }
  // cfgSet(list, active?): replace every configuration at once. list = [{ name, values: { T: 6 | '6' | '=W/2' } }];
  // active defaults to the current one when it survives, else the first. An empty list removes configurations.
  function cfgSet(list, active) {
    list = Array.isArray(list) ? list : [];
    var out = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {}, n = c.name == null ? '' : String(c.name).trim();
      if (!n) return cfgFail('Configuration ' + (i + 1) + ' needs a name.');
      if (seen[n]) return cfgFail('A configuration named "' + n + '" already exists.');
      seen[n] = true;
      var vals = {};
      Object.keys(c.values || {}).forEach(function (k) { vals[k] = String(c.values[k] == null ? '' : c.values[k]).replace(/^\s*=\s*/, '').trim(); });
      var oc = K.findConfiguration(App.model, n), sp = c.suppressed !== undefined ? c.suppressed : oc && oc.suppressed;   // rfFC: keeps its suppression states
      out.push(sp && Object.keys(sp).length ? { name: n, values: vals, suppressed: JSON.parse(JSON.stringify(sp)) } : { name: n, values: vals });
    }
    var act = null;
    if (out.length) {
      if (active != null) { if (!seen[String(active)]) return cfgFail('No configuration named "' + active + '".'); act = String(active); }
      else act = seen[cfgActiveName()] ? cfgActiveName() : out[0].name;
    }
    if (cfgSelected && !seen[cfgSelected]) cfgSelected = null;
    return cfgCommit(function (m) {
      if (out.length) { m.configurations = out; m.activeConfiguration = act; }
      else { delete m.configurations; delete m.activeConfiguration; }
    }, out.length ? out.length + ' configuration' + (out.length === 1 ? '' : 's') + ', "' + act + '" active.' : 'Configurations removed.');
  }
  // UI entry points: report a refusal as a toast instead of an unhandled rejection
  function cfgRun(p) { return p.catch(function (e) { toast(e.message || String(e)); }); }
  function cfgNeedSelection() {
    var n = cfgSelected && K.findConfiguration(App.model, cfgSelected) ? cfgSelected : null;
    if (!n) toast('Select a configuration first.');
    return n;
  }
  function cfgPromptAdd() {
    promptDialog('Add Configuration', 'Configuration name:', nextConfigName(), function (v) { cfgRun(cfgAdd(v)); });
  }
  function cfgPromptRename(name) {
    name = name || cfgNeedSelection();
    if (!name) return;
    promptDialog('Rename Configuration', 'New name for "' + name + '":', name, function (v) { cfgRun(cfgRename(name, v)); });
  }
  function cfgConfirmDelete(name) {
    name = name || cfgNeedSelection();
    if (!name) return;
    confirmDialog('Delete Configuration', 'Delete configuration "' + escHtml(name) + '"? Its variable values are lost (Undo brings them back).', function () { cfgRun(cfgRemove(name)); }, 'Delete');
  }
  function escHtml(t) { return String(t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function cfgMenu(name) {
    var items = [];
    if (name) {
      items.push({ label: 'Show Configuration', action: function () { cfgRun(cfgActivate(name)); } });
      items.push({ label: 'Rename…', action: function () { cfgPromptRename(name); } });
      items.push({ label: 'Delete', action: function () { cfgConfirmDelete(name); } });
      items.push({ sep: true });
    }
    items.push({ label: 'Add Configuration…', action: cfgPromptAdd });
    items.push({ label: 'Manage Equations…', action: function () { showEquations(); } });
    items.push({ label: 'Design Table…', action: function () { showDesignTable(); } });   // rfFC
    return items;
  }
  function refreshConfigPanel() {
    var panel = $('config-panel');
    if (!panel || panel.hidden || !App.model) return;
    // an assembly's ConfigurationManager (Default with its exploded views) is drawn by ui-assembly.js
    if (isAsm() && UI.asmConfigPanel) { panel.innerHTML = ''; UI.asmConfigPanel(panel); return; }
    var list = cfgList(), active = cfgActiveName();
    if (cfgSelected && !list.some(function (c) { return c.name === cfgSelected; })) cfgSelected = null;
    panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'cfg-head', title: App.model.name + ' Configuration(s)' }, [el('span', { html: Icons('config', 16) }), el('span', { class: 'cfg-title', text: App.model.name + ' Configuration(s)' })]));
    panel.appendChild(el('div', { class: 'cfg-tools' }, [
      el('button', { id: 'cfg-add', text: 'Add\u2026', title: 'Add Configuration: a copy of the current variable values, made active', onclick: cfgPromptAdd }),
      el('button', { id: 'cfg-rename', text: 'Rename\u2026', title: 'Rename the selected configuration', onclick: function () { cfgPromptRename(); } }),
      el('button', { id: 'cfg-delete', text: 'Delete', title: 'Delete the selected configuration', onclick: function () { cfgConfirmDelete(); } }),
      el('button', { id: 'cfg-activate', text: 'Show', title: 'Show Configuration: make the selected configuration active', onclick: function () { var n = cfgNeedSelection(); if (n) cfgRun(cfgActivate(n)); } }),
      el('button', { id: 'cfg-table', text: 'Design Table…', title: 'Design Table: every configuration’s variables, dimensions and suppression states in one grid', onclick: function () { showDesignTable(); } })   // rfFC
    ]));
    var box = el('div', { id: 'cfg-list' });
    box.addEventListener('contextmenu', function (e) { if (e.target !== box) return; e.preventDefault(); showMenu(e.clientX, e.clientY, cfgMenu(null)); });
    if (!list.length) {
      var eqs = currentEquations().length;
      box.appendChild(el('div', { class: 'cfg-empty', text: eqs ? 'No configurations yet: the part uses its base equation values. Add… stores them as "Default" and starts a new configuration you can change in Tools ▸ Equations.' : 'Configurations are named sets of global-variable values. Add global variables in Tools ▸ Equations first, then Add… a configuration for each variant.' }));
    }
    list.forEach(function (c) {
      var isActive = c.name === active, vals = cfgValuesText(c.values);
      var nsup = K.suppressedIds ? Object.keys(K.suppressedIds(App.model, c.name)).length : 0;   // rfFC: features suppressed in it
      if (nsup) vals = (vals ? vals + '; ' : '') + nsup + ' suppressed';
      var row = el('div', { class: 'cfg-row' + (isActive ? ' active' : '') + (c.name === cfgSelected ? ' selected' : ''), 'data-name': c.name, title: c.name + (isActive ? ' (active)' : '') + (vals ? ': ' + Object.keys(c.values).map(function (k) { return k + ' = ' + c.values[k]; }).join(', ') : '') + ' — double-click to show' }, [
        el('span', { class: 'cfg-mark', text: isActive ? '\u2713' : '' }),
        el('span', { html: Icons('config', 16) }),
        el('span', { class: 'cfg-name', text: c.name }),
        el('span', { class: 'cfg-vals', text: vals })
      ]);
      row.addEventListener('click', function () { cfgSelected = c.name; refreshConfigPanel(); setStatus('Configuration "' + c.name + '"' + (vals ? ': ' + vals : '') + (isActive ? ' (active)' : '')); });
      row.addEventListener('dblclick', function (e) { e.stopPropagation(); cfgSelected = c.name; cfgRun(cfgActivate(c.name)); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); cfgSelected = c.name; refreshConfigPanel(); showMenu(e.clientX, e.clientY, cfgMenu(c.name)); });
      box.appendChild(row);
    });
    panel.appendChild(box);
  }

  // Modal replacements for window.confirm / window.prompt (native dialogs are blocked in sandboxed hosts).
  function confirmDialog(title, message, onYes, yesLabel) {
    showModal({ title: title, body: '<p>' + message + '</p>', buttons: [
      { label: yesLabel || 'OK', primary: true, action: function () { closeModal(); onYes(); } },
      { label: 'Cancel', action: closeModal }
    ] });
  }
  function promptDialog(title, message, initial, onOk) {
    var inp = el('input', { type: 'text', value: initial || '', style: 'width:100%' });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); closeModal(); onOk(inp.value); } e.stopPropagation(); });
    showModal({ title: title, body: el('div', {}, [el('p', { text: message }), inp]), buttons: [
      { label: 'OK', primary: true, action: function () { closeModal(); onOk(inp.value); } },
      { label: 'Cancel', action: closeModal }
    ] });
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  }
  $('modal').addEventListener('mousedown', function (e) { if (e.target === $('modal')) closeModal(); });

  // ------------------------------------------------------------------ r14/commands14: tooltips
  // SolidWorks' tooltip: the command name in bold with its shortcut, a one-line description under it, and (greyed
  // buttons) why it cannot run now. Ribbon, flyout and Shortcut Bar buttons call setTip; the other toolbars (heads-up
  // view toolbar, Task Pane strip, FeatureManager tabs, PropertyManager ✓ / ✗, the confirmation corner) keep their
  // title attribute in the code, which is turned into the same tooltip the first time the pointer reaches the button
  // (the text moves to aria-label, so the button keeps its accessible name, and the browser's own tooltip never shows).
  var TIP_SEL = '#ribbon-buttons button, #hud button, #tp-strip button, #fm-tabs button, #scbar button, .pm-actions button, .cc-exit, #exit-sketch button';
  var TIP_HELP = {
    'Zoom to Fit': 'Zoom the model to fill the graphics area', 'Zoom to Area': 'Drag a box around the region to zoom into',
    'Previous View': 'Go back to the last view', 'View Orientation': 'Standard views, Normal To and the view selector',
    'Display Style': 'Shaded, shaded with edges, hidden lines or wireframe', 'Hide/Show Items': 'Show or hide planes, origins, sketches and the sketch grid',
    'Edit Appearance': 'Colour and finish of the part', 'Apply Scene': 'Background of the graphics area', 'View Settings': 'Display and document properties',
    'FeatureManager Design Tree': 'The features of the part, in build order', 'PropertyManager': 'Options of the active command',
    'ConfigurationManager': 'Configurations and their variable values', 'Anvil Resources': 'Getting started, examples and help',
    'Design Library': 'Standard parts and features', 'File Explorer': 'Documents saved in this browser', 'View Palette': 'Drag views onto a drawing sheet',
    'Appearances, Scenes': 'Colours, materials and backgrounds', 'Custom Properties': 'Part number, description, material and other properties',
    'Automation / Script': 'The model as a script: run, edit and export it', 'OK': 'Accept the command and close the PropertyManager',
    'Cancel': 'Close the PropertyManager without changes', 'Exit Sketch': 'Keep the changes and rebuild', 'More commands': 'The commands that do not fit the window'
  };
  var TIP_KEYS = { 'Exit Sketch': 'exitSketch', 'Zoom to Fit': 'fit', 'View Orientation': 'orient' };
  var tipEl = null, tipTarget = null, tipTimer = 0, tipHiddenAt = 0;
  function setTip(node, t) {
    var sig = t.name + '\u0001' + (t.key || '') + '\u0001' + (t.desc || '') + '\u0001' + (t.note || '');
    if (node.hasAttribute('title')) node.removeAttribute('title');
    if (node._tipSig === sig) return;
    node._tipSig = sig; node._tip = t;
    if (tipTarget === node && tipEl && !tipEl.hidden) renderTip(node);
  }
  // 'Zoom to Fit (F)', 'OK (Enter) — fix the equation first: …', 'Exit Sketch (S): keep the changes' → { name, key, desc }
  function parseTitle(s) {
    var m = /^(.*?)(?: \(([^()]{1,14})\))?(?:\s*(?:—|:)\s+([\s\S]*))?$/.exec(s) || [s, s];
    var name = m[1] || s, key = m[2] || '', desc = m[3] || '';
    if (key && !/^(?:(?:Ctrl|Shift|Alt)\+.+|[A-Z0-9](?:, [A-Z0-9])*|F\d+|Space|Esc|Enter|Del|Tab)$/.test(key)) { name += ' (' + key + ')'; key = ''; }
    if (TIP_KEYS[name] && UI.shortcutFor && UI.shortcutFor(TIP_KEYS[name])) key = UI.shortcutFor(TIP_KEYS[name]);
    desc = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : (RIBBON_HELP[name] || TIP_HELP[name] || '');
    return { name: name, key: key, desc: desc, note: '' };
  }
  function adoptTitle(node) {
    var s = node.getAttribute('title');
    node.removeAttribute('title');
    if (!s) return;
    if (!node.hasAttribute('aria-label') || node._tipAria) { node.setAttribute('aria-label', s); node._tipAria = true; }
    node._tipSig = null;
    setTip(node, parseTitle(s));
  }
  function renderTip(node) {
    var t = node._tip;
    tipEl.innerHTML = '';
    var head = el('div', { class: 'tip-head' }, [el('b', { text: t.name })]);
    if (t.key) head.appendChild(el('span', { class: 'tip-key', text: t.key }));
    tipEl.appendChild(head);
    if (t.desc) tipEl.appendChild(el('div', { class: 'tip-desc', text: t.desc }));
    if (t.note) tipEl.appendChild(el('div', { class: 'tip-note', text: t.note }));
  }
  function showTip(node) {
    if (!node.isConnected || !node._tip) return;
    if (!tipEl) { tipEl = el('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
    renderTip(node);
    tipEl.hidden = false;
    var bar = node.closest('#scbar'), r = node.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    // Shortcut Bar: under (or over) the whole bar, never over its other buttons
    var below = bar ? bar.getBoundingClientRect().bottom : r.bottom, above = bar ? bar.getBoundingClientRect().top : r.top;
    var x = Math.min(Math.max(4, r.left), W - w - 4), y = below + 4;
    if (y + h > H - 4) y = Math.max(4, above - h - 4);
    // a vertical strip at the window's right edge (Task Pane): beside the button rather than over its neighbours
    if (!bar && r.right > W - 60 && r.height < 60) { x = Math.max(4, r.left - w - 6); y = Math.min(Math.max(4, r.top), H - h - 4); }
    tipEl.style.left = Math.round(x) + 'px'; tipEl.style.top = Math.round(y) + 'px';
  }
  function hideTip() {
    clearTimeout(tipTimer); tipTimer = 0;
    if (tipEl && !tipEl.hidden) { tipEl.hidden = true; tipHiddenAt = performance.now(); }
    tipTarget = null;
  }
  // disabled buttons get no pointer events of their own in some browsers: the hover is also tracked on the document
  function tipHover(e) {
    var t = e.target && e.target.closest ? e.target.closest(TIP_SEL) : null;
    if (!t && document.elementFromPoint) { var at = document.elementFromPoint(e.clientX, e.clientY); t = at && at.closest ? at.closest(TIP_SEL) : null; }
    if (t === tipTarget) return;
    hideTip();
    if (!t) return;
    if (t.hasAttribute('title')) adoptTitle(t);
    if (!t._tip) return;
    tipTarget = t;
    // moving along a toolbar shows the next tooltip at once, as Windows does
    tipTimer = setTimeout(function () { if (tipTarget === t) showTip(t); }, performance.now() - tipHiddenAt < 600 ? 40 : 500);
  }
  document.addEventListener('mouseover', tipHover, true);
  document.addEventListener('mousemove', function (e) { if (tipTarget || (e.target && e.target.closest && e.target.closest('#ribbon, #hud, #scbar'))) tipHover(e); }, { passive: true, capture: true });
  document.addEventListener('mousedown', function () { hideTip(); tipHiddenAt = 0; }, true);
  document.addEventListener('wheel', hideTip, { passive: true, capture: true });
  window.addEventListener('keydown', function () { hideTip(); }, true);
  window.addEventListener('blur', hideTip);

  // ------------------------------------------------------------------ r14/commands14: Shortcut Bar (S)
  // S shows SolidWorks' Shortcut Bar at the pointer: a small toolbar of the common commands for what is being edited
  // (part, sketch, assembly or drawing). A click runs the command and closes the bar; Esc or a click elsewhere closes
  // it. The keys keep working: the arrows move the highlight, Enter runs it, and S again runs the first button, which
  // is Sketch in a part and Exit Sketch in a sketch (so "S, S" starts or ends a sketch); any other key closes the bar
  // and goes on to its own shortcut (L starts a line). The buttons are the ribbon's own items, found by their labels.
  var SC_SETS = {
    part: ['Sketch', 'Extruded Boss/Base', 'Revolved Boss/Base', 'Extruded Cut', 'Hole Wizard', 'Fillet', 'Chamfer', 'Shell',
      'Linear Pattern', 'Circular Pattern', 'Mirror', 'Plane', 'Measure', 'Mass Properties', 'Section View', 'Instant3D'],
    sketch: ['Exit Sketch', 'Smart Dimension', 'Line', 'Corner Rectangle', 'Center Rectangle', 'Circle', 'Centerpoint Arc', '3 Point Arc',
      'Polygon', 'Straight Slot', 'Point', 'Spline', 'Ellipse', 'Centerline', 'Sketch Fillet', 'Trim Entities', 'Extend Entities', 'Offset Entities',
      'Convert Entities', 'Mirror Entities', 'Add Relation', 'Construction Geometry', 'Display/Delete Relations', 'Text'],
    assembly: ['Insert Components', 'Mate', 'Move Component', 'Rotate Component', 'Linear Component Pattern', 'Hide/Show Components',
      'Exploded View', 'Interference Detection', 'Measure', 'Mass Properties', 'Section View'],
    drawing: ['Model View', 'Projected View', 'Section View', 'Detail View', 'Smart Dimension', 'Model Items', 'Balloon', 'Auto Balloon',
      'Hole Callout', 'Center Mark', 'Centerline', 'Bill of Materials']
  };
  var SC_TABS = { part: ['Features', 'Sketch', 'Evaluate', 'Sheet Metal'], sketch: ['Sketch', 'Features'], assembly: ['Assembly', 'Evaluate'], drawing: ['View Layout', 'Annotation'] };
  var SC_COLS = 8;
  var sc = null;   // the open bar: { el, buttons, items, idx, ctx }
  function scContext() {
    if (UI.drawingActive && UI.drawingActive()) return 'drawing';
    if (App.mode === 'sketch') return 'sketch';
    return isAsm() ? 'assembly' : 'part';
  }
  function scFind(ctx, name) {
    var set = ribbonSet(), tabs = SC_TABS[ctx];
    function flat(s) { return String(s || '').replace(/\s*\n\s*/g, ' '); }
    // rfNG uisense: under a profile the tabs have other names and the items other labels (Mastercam: Solids ▸ Extrude),
    // so the bar found almost nothing; the profile's tabs are searched too, by each item's SolidWorks name
    if (profileSet()) tabs = tabs.map(tabName).concat(Object.keys(set));
    for (var t = 0; t < tabs.length; t++) {
      var list = ribbonLeaves(set[tabs[t]] || []);
      for (var j = 0; j < list.length; j++) {
        var c = list[j], d = c && c.dyn && c.dyn();
        if (c && c.label && (flat(c.swLabel || c.label) === name || (d && flat(d.label) === name))) return c;
      }
    }
    return null;
  }
  function shortcutBarItems(ctx) {
    ctx = ctx || scContext();
    return SC_SETS[ctx].map(function (n) { return scFind(ctx, n); }).filter(function (it) { return it && (it.run || it.tool); });
  }
  function closeShortcutBar() {
    if (!sc) return;
    sc.el.remove(); sc = null;
    hideTip();
  }
  function scMark(i) {
    if (!sc) return;
    sc.idx = Math.max(0, Math.min(sc.buttons.length - 1, i));
    sc.buttons.forEach(function (b, k) { b.classList.toggle('kbd', k === sc.idx); });
  }
  function scPress(i) {
    if (!sc) return;
    var it = sc.items[i], b = sc.buttons[i];
    if (!it || !b || b.disabled) return;
    closeShortcutBar();
    runItem(it);
    refreshRibbon();
  }
  // UI.showShortcutBar(clientX?, clientY?): at the pointer when it is over the graphics area, else in its middle
  function showShortcutBar(x, y) {
    closeShortcutBar(); closeMenus(); hideTip();
    var ctx = scContext(), items = shortcutBarItems(ctx);
    if (!items.length) return null;
    var vp = (UI.viewport || $('viewport')).getBoundingClientRect();
    if (x == null || y == null) {
      if (lastPointer && lastPointer[0] >= vp.left && lastPointer[0] <= vp.right && lastPointer[1] >= vp.top && lastPointer[1] <= vp.bottom) { x = lastPointer[0]; y = lastPointer[1]; }
      else { x = vp.left + vp.width / 2; y = vp.top + vp.height / 2; }
    }
    var bar = el('div', { id: 'scbar', class: 'scbar', role: 'toolbar', 'aria-label': 'Shortcut Bar' });
    bar.style.gridTemplateColumns = 'repeat(' + Math.min(SC_COLS, items.length) + ', auto)';
    var buttons = items.map(function (it, i) {
      var s = itemState(it), b = el('button', { class: 'sc-btn' + (s.active ? ' active' : ''), html: Icons(s.icon, 16), 'aria-label': s.flat });
      b.dataset.icon = s.icon;
      b.disabled = s.disabled;
      setTip(b, s.tip);
      b.addEventListener('click', function () { scPress(i); });
      b.addEventListener('mouseenter', function () { scMark(i); });
      bar.appendChild(b);
      return b;
    });
    ['mousedown', 'mouseup', 'dblclick', 'wheel', 'contextmenu'].forEach(function (t) { bar.addEventListener(t, function (e) { e.stopPropagation(); if (t === 'contextmenu') e.preventDefault(); }); });
    document.body.appendChild(bar);
    // the pointer lands on the first button (Sketch / Exit Sketch), the bar kept inside the graphics area
    var w = bar.offsetWidth, h = bar.offsetHeight;
    var left = Math.min(Math.max(vp.left + 2, x - 17), Math.max(vp.left + 2, vp.right - w - 2));
    var top = Math.min(Math.max(vp.top + 2, y - 16), Math.max(vp.top + 2, vp.bottom - h - 2));
    bar.style.left = Math.round(left) + 'px'; bar.style.top = Math.round(top) + 'px';
    sc = { el: bar, buttons: buttons, items: items, idx: 0, ctx: ctx };
    scMark(0);
    return bar;
  }
  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
    if (!$('modal').hidden) { closeShortcutBar(); return; }
    var k = e.key;
    if (sc) {
      if (e.ctrlKey || e.metaKey || e.altKey) { closeShortcutBar(); return; }
      var take = true;
      if (k === 'Escape') closeShortcutBar();
      else if (k === 'Enter') scPress(sc.idx);
      else if (k === 's' || k === 'S') { if (!e.repeat) scPress(0); }
      else if (k === 'ArrowRight') scMark(sc.idx + 1);
      else if (k === 'ArrowLeft') scMark(sc.idx - 1);
      else if (k === 'ArrowDown') scMark(sc.idx + SC_COLS);
      else if (k === 'ArrowUp') scMark(sc.idx - SC_COLS);
      else if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') take = false;
      else { closeShortcutBar(); take = false; }   // the key goes on to its own shortcut
      if (take) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if ((k === 's' || k === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) showShortcutBar();
    }
  }, true);   // capture on window: ahead of drawing.js, which takes every key while a drawing is open
  document.addEventListener('mousedown', function (e) { if (sc && !sc.el.contains(e.target)) closeShortcutBar(); }, true);
  document.addEventListener('wheel', function (e) { if (sc && !sc.el.contains(e.target)) closeShortcutBar(); }, { passive: true, capture: true });
  window.addEventListener('resize', closeShortcutBar);
  window.addEventListener('blur', closeShortcutBar);
  UI.showShortcutBar = showShortcutBar; UI.closeShortcutBar = closeShortcutBar; UI.sketchMenuItems = sketchMenuItems;
  UI.shortcutBar = {
    open: showShortcutBar, close: closeShortcutBar, isOpen: function () { return !!sc; },
    context: function () { return sc ? sc.ctx : scContext(); },
    labels: function (ctx) { return (sc && !ctx ? sc.items : shortcutBarItems(ctx)).map(function (it) { return itemState(it).flat; }); },
    press: function (label) { if (!sc) return false; for (var i = 0; i < sc.items.length; i++) if (itemState(sc.items[i]).flat === label) { scPress(i); return true; } return false; }
  };
  // UI.ribbonFlyFace(group[, index]): the flyout's face (index into its items); with an index, sets and remembers it
  UI.ribbonFlyFace = function (group, i) {
    if (i != null) { flyFaces[group] = i; try { localStorage.setItem('anvil.fly.' + group, String(i)); } catch (e) { } refreshRibbon(); }
    return flyFaces[group];
  };

  UI.setStatus = setStatus; UI.toast = toast; UI.refreshStatus = refreshStatus;
  UI.RIBBON = RIBBON; UI.ASM_RIBBON = ASM_RIBBON;   // drawing.js adds its Drawing tab to both (a drawing of a part or of an assembly)
  // lane CC: the items the CommandManager shows now, one per child of #ribbon-buttons (the group captions read them)
  UI.ribbonShownItems = function () { return ribbonBuilt ? ribbonBuilt.items : null; };
  UI.fitWorkspace = fitWorkspace;   // r12/chrome12: panel widths and the CommandManager fitted to the window now
  UI.refreshRibbon = refreshRibbon; UI.setRibbonTab = setRibbonTab; UI.renderFmTabs = renderFmTabs; UI.setFmTab = setFmTab;
  UI.menuModel = MENUS; UI.ribbonLeaves = ribbonLeaves; UI.ribbonItemState = itemState;   // rfAP: Search Commands (ui-app.js)
  UI.menuRowHelp = menuRowHelp; UI.menuRowWhy = menuRowWhy;   // rfNG uisense: the status-bar help line of a menu row
  UI.refreshTree = refreshTree; UI.startRename = startRename; UI.renderMenuBar = renderMenuBar; UI.syncStdToolbar = syncStdToolbar; UI.closeMenus = closeMenus; UI.showMenu = showMenu; UI.menuOpen = menuOpen;
  UI.refreshHud = refreshHud; UI.showOrientationMenu = showOrientationMenu; UI.showModal = showModal; UI.closeModal = closeModal; UI.modalDefault = modalDefault; UI.confirmDialog = confirmDialog; UI.promptDialog = promptDialog; UI.setStyle = setStyle; UI.setBg = setBg; UI.normalToSelection = normalToSelection;
  UI.showEquations = showEquations; UI.setEquations = setEquations; UI.normalizeEquations = normalizeEquations;
  UI.refreshConfigPanel = refreshConfigPanel;
  UI.configurations = { list: cfgList, active: cfgActiveName, add: cfgAdd, rename: cfgRename, remove: cfgRemove, activate: cfgActivate, set: cfgSet };

  // ------------------------------------------------------------------ rfFC: Design Table (Insert ▸ Tables ▸ Design Table)
  // A modal grid: rows = configurations, columns = global variables, feature dimensions (D1@Boss-Extrude1) and
  // suppression states ($STATE@Cut-Extrude1, S / U). Every cell and header is an input; × deletes a row / column;
  // Add Row, Add Column (a list of what can be configured, or a typed header); Copy / Paste as tab-separated text
  // (Excel); a paste of several cells into a cell fills the grid from there. Apply checks the grid on a copy
  // (Kernel.applyDesignTable): any bad cell is marked red with its message and nothing changes; a good grid is written
  // as one undo step and the part rebuilt. DOM: #dt-dialog, table #dt-grid, td[data-r][data-c] > input, .dt-err cells,
  // #dt-msg, #dt-add-row, #dt-add-col (select) , #dt-copy, #dt-paste, modal buttons #dt-apply, #dt-ok, #dt-cancel.
  var dtGrid = null;
  // rfOD: Kernel.designTableColumns: the variables, then per feature its dimensions and state, a sketch's dimensions
  // (D1@Sketch1) under the feature built from it; rows it cannot drive (a Base Flange's D1, Thickness@Sheet-Metal)
  // are listed greyed with the reason
  function dtColumnChoices() {
    var used = {};
    (dtGrid ? dtGrid[0] : []).forEach(function (h) { used[h] = true; });
    return K.designTableColumns(App.model, used);
  }
  function showDesignTable() {
    if (!App.model || isAsm()) { toast('Design tables are for parts.'); return; }
    dtGrid = K.designTable(App.model);
    var wrap = el('div', { id: 'dt-dialog' });
    var msg = el('div', { id: 'dt-msg', class: 'eq-msg' });
    var table = el('table', { id: 'dt-grid', class: 'eq-table dt-grid' });
    var colSel = el('select', { id: 'dt-add-col', title: 'Add Column: a global variable, a feature or sketch dimension, or a suppression state' });
    function fillColSel() {
      colSel.innerHTML = '';
      colSel.appendChild(el('option', { value: '', text: 'Add column…' }));
      var grp = null, gname = null;
      dtColumnChoices().forEach(function (c) {
        if (c.group !== gname) { gname = c.group; grp = el('optgroup', { label: gname || 'Global variables' }); colSel.appendChild(grp); }
        var o = el('option', { value: c.label, text: c.label + (c.disabled ? ' (' + c.reason + ')' : '') });
        if (c.disabled) { o.disabled = true; o.title = c.reason; }
        grp.appendChild(o);
      });
      colSel.appendChild(el('option', { value: '*', text: 'Blank column (type a header)' }));
    }
    colSel.addEventListener('change', function () {
      var v = colSel.value;
      if (!v) return;
      dtGrid.forEach(function (r, i) {
        if (i === 0) { r.push(v === '*' ? '' : v); return; }
        var val = '';   // a known column starts with each configuration's value now
        if (v !== '*') try { val = K.designTableCell(App.model, v, K.findConfiguration(App.model, r[0]) ? r[0] : null); } catch (e) { val = ''; }
        r.push(val);
      });
      render();
    });
    function render(errs) {
      table.innerHTML = '';
      var bad = {};
      (errs || []).forEach(function (e) { bad[e.row + ':' + e.col] = e.message; });
      dtGrid.forEach(function (r, ri) {
        var tr = el('tr', { class: ri === 0 ? 'dt-head' : 'dt-row' });
        r.forEach(function (v, ci) {
          var td = el(ri === 0 ? 'th' : 'td', { 'data-r': String(ri), 'data-c': String(ci) });
          if (ri === 0 && ci === 0) { td.appendChild(el('span', { text: 'Configuration' })); tr.appendChild(td); return; }
          var inp = el('input', { type: 'text', value: v, spellcheck: 'false' });
          inp.addEventListener('input', function () { dtGrid[ri][ci] = inp.value; });
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); var nx = table.querySelector('[data-r="' + (ri + 1) + '"][data-c="' + ci + '"] input'); if (nx) nx.focus(); } });
          inp.addEventListener('paste', function (e) {
            var t = e.clipboardData && e.clipboardData.getData('text/plain');
            if (!t || !/[\t\n]/.test(t)) return;   // one value: the input takes it
            e.preventDefault();
            pasteAt(K.tsvToGrid(t), ri, ci);
          });
          td.appendChild(inp);
          if ((ri === 0 && ci > 0) || (ci === 0 && ri > 0)) td.appendChild(el('button', { class: 'dt-del', text: '×', title: ri === 0 ? 'Delete this column' : 'Delete this configuration', onclick: function () { if (ri === 0) dtGrid.forEach(function (x) { x.splice(ci, 1); }); else dtGrid.splice(ri, 1); render(); } }));
          if (bad[ri + ':' + ci]) { td.classList.add('dt-err'); td.title = bad[ri + ':' + ci]; }
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      fillColSel();
      if (!errs) { msg.textContent = (dtGrid.length - 1) + ' configuration' + (dtGrid.length === 2 ? '' : 's') + ', ' + (dtGrid[0].length - 1) + ' column' + (dtGrid[0].length === 2 ? '' : 's'); msg.classList.remove('err'); }
    }
    function pasteAt(g, r0, c0) {
      g.forEach(function (row, i) {
        var r = r0 + i;
        while (dtGrid.length <= r) dtGrid.push(dtGrid[0].map(function () { return ''; }));
        row.forEach(function (v, j) {
          var c = c0 + j;
          if (c >= dtGrid[0].length) dtGrid.forEach(function (x) { while (x.length <= c) x.push(''); });
          if (!(r === 0 && c === 0)) dtGrid[r][c] = v;
        });
      });
      render();
    }
    function apply(close) {
      var trial = JSON.parse(JSON.stringify(App.model, function (k, v) { return k === 'profile' ? undefined : v; }));
      var res = K.applyDesignTable(trial, dtGrid);
      if (!res.ok) {
        render(res.errors);
        msg.textContent = res.errors.length + ' cell' + (res.errors.length === 1 ? '' : 's') + ' with errors: ' + res.errors[0].message;
        msg.classList.add('err');
        return Promise.resolve(false);
      }
      UI.pushUndo();
      K.applyDesignTable(App.model, dtGrid);
      if (close) closeModal();
      return UI.afterRebuild(UI.rebuild(), function () {
        refreshTree(); refreshStatus(); refreshConfigPanel();
        setStatus('Design table applied: ' + (dtGrid.length - 1) + ' configuration' + (dtGrid.length === 2 ? '' : 's') + (res.created.length ? '; new variable' + (res.created.length === 1 ? ' ' : 's ') + res.created.join(', ') : '') + '.');
        if (!close) { dtGrid = K.designTable(App.model); render(); }
      }).then(function () { return true; });
    }
    function copyText() {
      var t = K.gridToTSV(dtGrid);
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(function () { }); } catch (e) { }
      UI.designTableClipboard = t;
      setStatus('Design table copied as tab-separated text: paste it into Excel.');
      return t;
    }
    function pasteText() {
      var box = el('textarea', { id: 'dt-paste-text', rows: '8', style: 'width:100%;font-family:monospace', placeholder: 'Paste cells copied from Excel (tab-separated), header row first' });
      var back = function () { showModal(spec); $('modal-card').classList.add('wide'); render(); };
      showModal({ title: 'Paste Design Table', body: el('div', {}, [el('p', { text: 'Paste the whole table here (Ctrl+V), header row first:' }), box]), buttons: [
        { id: 'dt-paste-ok', label: 'OK', primary: true, action: function () { var g = K.tsvToGrid(box.value); if (g.length) dtGrid = g; back(); } },
        { label: 'Cancel', action: back }
      ] });
      $('modal-card').classList.add('wide');
      setTimeout(function () { box.focus(); }, 0);
    }
    var bar = el('div', { class: 'eq-bar dt-bar' }, [
      el('button', { id: 'dt-add-row', class: 'btn', text: '+ Add configuration', onclick: function () {
        var n = 1, names = dtGrid.map(function (r) { return r[0]; });
        while (names.indexOf('Config' + n) >= 0) n++;
        var src = dtGrid.length > 1 ? dtGrid[dtGrid.length - 1] : dtGrid[0].map(function () { return ''; });
        dtGrid.push(src.map(function (v, i) { return i === 0 ? 'Config' + n : v; }));
        render();
      } }),
      colSel,
      el('button', { id: 'dt-copy', class: 'btn', text: 'Copy', title: 'Copy the table as tab-separated text (pastes into Excel)', onclick: copyText }),
      el('button', { id: 'dt-paste', class: 'btn', text: 'Paste…', title: 'Paste a table copied from Excel', onclick: pasteText }),
      msg
    ]);
    wrap.appendChild(table);
    wrap.appendChild(bar);
    wrap.appendChild(el('p', { class: 'eq-help', html: 'Rows are configurations. A column is a global variable (<kbd>W</kbd>), a feature dimension (<kbd>D1@Boss-Extrude1</kbd>) or a sketch dimension (<kbd>D1@Sketch1</kbd>: the sketch is solved again in each configuration), driven through a global variable Apply makes, or a suppression state (<kbd>$STATE@Cut-Extrude1</kbd>: <kbd>S</kbd> suppressed, <kbd>U</kbd> unsuppressed). Values may be equations of the variables above them.' }));
    var spec = { title: 'Design Table', body: wrap, buttons: [
      { id: 'dt-ok', label: 'OK', primary: true, action: function () { apply(true); } },
      { id: 'dt-apply', label: 'Apply', action: function () { apply(false); } },
      { id: 'dt-cancel', label: 'Cancel', action: closeModal }
    ] };
    showModal(spec);
    $('modal-card').classList.add('wide');
    render();
    UI.designTableState = { grid: function () { return dtGrid; }, set: function (g) { dtGrid = g; render(); }, apply: apply, copy: copyText, pasteText: function (t) { var g = K.tsvToGrid(t); if (g.length) { dtGrid = g; render(); } } };
  }
  UI.showDesignTable = showDesignTable;
})(UI);
