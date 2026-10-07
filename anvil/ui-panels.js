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
    var html = skTxt + (UI.occtStatusHtml ? UI.occtStatusHtml() : '') + (UI.rebuildStatusHtml ? UI.rebuildStatusHtml() : '<span>' + (errs ? errs + ' rebuild error' + (errs > 1 ? 's' : '') : 'Fully rebuilt') + '</span>') + (UI.levelStatusHtml && !asm ? UI.levelStatusHtml() : '') + '<span>' + mode + '</span><span>' + units + '</span><span class="st-ms">' + (App.lastRebuildMs != null ? UI.fmtNum(App.lastRebuildMs, 0) + ' ms' : '') + '</span>';
    var sr = $('status-right');
    if (sr._html !== html) { sr.innerHTML = html; sr._html = html; }
    var title = App.model.name + (App.mode === 'sketch' ? '  —  sketch' : '');
    if ($('doc-title').textContent !== title) $('doc-title').textContent = title;
  }

  // ------------------------------------------------------------------ ribbon
  var RIBBON = {
    Features: [
      { id: 'extrude', label: 'Extruded\nBoss/Base', run: function () { UI.cmdExtrude(false); } },
      { id: 'revolve', label: 'Revolved\nBoss/Base', run: function () { UI.cmdRevolve(false); } },
      { stack: [{ id: 'sweep', label: 'Swept Boss/Base', run: function () { UI.cmdSweep(false); } }, { id: 'loft', label: 'Lofted Boss/Base', run: function () { UI.cmdLoft(false); } }, { id: 'loft', label: 'Boundary Boss/Base' }] },
      { sep: true },
      { id: 'cut', label: 'Extruded\nCut', run: function () { UI.cmdExtrude(true); } },
      { id: 'holeWizard', label: 'Hole\nWizard', run: function () { (UI.cmdHoleWizard || UI.cmdHole)(); } },
      { id: 'revolveCut', label: 'Revolved\nCut', run: function () { UI.cmdRevolve(true); } },
      { stack: [{ id: 'sweep', label: 'Swept Cut', run: function () { UI.cmdSweep(true); } }, { id: 'loft', label: 'Lofted Cut', run: function () { UI.cmdLoft(true); } }, { id: 'loft', label: 'Boundary Cut' }] },
      { sep: true },
      // r14/commands14: flyout buttons (SolidWorks): the face runs the last command used from the ▾ list
      { fly: 'fillet', items: [{ id: 'fillet', label: 'Fillet', run: function () { UI.cmdFillet(); } }, { id: 'chamfer', label: 'Chamfer', run: function () { UI.cmdChamfer(); } }] },
      { fly: 'pattern', items: [{ id: 'lpattern', label: 'Linear\nPattern', run: function () { UI.cmdLinearPattern(); } }, { id: 'cpattern', label: 'Circular\nPattern', run: function () { UI.cmdCircularPattern(); } }, { id: 'mirror', label: 'Mirror', run: function () { UI.cmdMirror(); } }] },
      { sep: true },
      { id: 'shell', label: 'Shell', run: function () { UI.cmdShell(); } },
      { id: 'draft', label: 'Draft' }, { id: 'intersect', label: 'Intersect' }, { id: 'rib', label: 'Rib' }, { id: 'wrap', label: 'Wrap' },
      { sep: true },
      { fly: 'refgeo', label: 'Reference\nGeometry', items: [{ id: 'plane', label: 'Plane', run: function () { UI.cmdPlane(); } }, { id: 'refAxis', label: 'Axis' }, { id: 'csys', label: 'Coordinate\nSystem' }, { id: 'refPoint', label: 'Point', help: 'Create a reference point' }] },
      { id: 'curves', label: 'Curves' },
      { id: 'instant', label: 'Instant3D', run: function () { if (UI.toggleInstant3D) UI.toggleInstant3D(); }, active: function () { return !!(UI.instant3DOn && UI.instant3DOn()); } }
    ],
    Sketch: [
      { id: 'sketch', label: 'Sketch', run: function () { UI.cmdSketch(); }, dyn: function () { return App.mode === 'sketch' ? { id: 'exitSketch', label: 'Exit\nSketch' } : null; } },
      // sketch-ordinate: the Smart Dimension flyout (SolidWorks): Horizontal / Vertical Dimension and Horizontal / Vertical
      // Ordinate Dimension (ui-sketch-dims.js)
      { fly: 'dim', items: [{ id: 'dim', label: 'Smart\nDimension', tool: 'dimension' },
        { id: 'horizDim', label: 'Horizontal\nDimension', help: 'Dimension the horizontal distance between two points or vertical lines', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdHorizontalDim(); } },
        { id: 'vertDim', label: 'Vertical\nDimension', help: 'Dimension the vertical distance between two points or horizontal lines', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdVerticalDim(); } },
        { id: 'ordinateH', label: 'Horizontal Ordinate\nDimension', help: 'Dimension points, holes and edges horizontally from one zero, the values on one line', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdOrdinateDim('x'); } },
        { id: 'ordinateV', label: 'Vertical Ordinate\nDimension', help: 'Dimension points, holes and edges vertically from one zero, the values on one line', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdOrdinateDim('y'); } }] },
      { sep: true },
      // p9-sketchtab: the Line flyout (Line, Centerline, Midpoint Line, Parallel Line) and all five rectangle types, as
      // SolidWorks (ui-sketch-lines.js: UI.lineMode, UI.cmdMidpointLine, UI.cmdParallelLine, the rect3 / crect3 /
      // parallelogram tools)
      { fly: 'line', items: [{ id: 'line', label: 'Line', tool: 'line', active: function () { return !UI.lineMode || UI.lineMode() === 'line'; } },
        { id: 'centerline', label: 'Centerline', tool: 'line', run: function () { UI.cmdCenterline(); }, active: function () { return !!(UI.lineMode && UI.lineMode() === 'centerline'); } },
        { id: 'midline', label: 'Midpoint\nLine', tool: 'line', help: 'Draw a line symmetric about its first point', run: function () { if (UI.cmdMidpointLine) UI.cmdMidpointLine(); }, active: function () { return !!(UI.lineMode && UI.lineMode() === 'midline'); } },
        { id: 'parallelLine', label: 'Parallel\nLine', help: 'Draw a line parallel to a line or edge: through a point, at a distance or tangent to an arc', run: function () { if (UI.cmdParallelLine) UI.cmdParallelLine(); }, active: function () { return !!(UI.parallelLineActive && UI.parallelLineActive()); } },
        // ui-sketch-construct.js: Tangent Line, Perpendicular Line, Bisector (Mastercam / AutoCAD construction lines)
        { id: 'tangentLine', label: 'Tangent\nLine', help: 'Draw a line tangent to two circles or arcs, or to one at an angle', run: function () { if (UI.cmdTangentLine) UI.cmdTangentLine(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('tangentLine')); } },
        { id: 'perpLine', label: 'Perpendicular\nLine', help: 'Draw a line square to a line or edge through a point', run: function () { if (UI.cmdPerpendicularLine) UI.cmdPerpendicularLine(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('perpLine')); } },
        { id: 'bisectorLine', label: 'Bisector', help: 'Draw the line bisecting the angle between two lines', run: function () { if (UI.cmdBisectorLine) UI.cmdBisectorLine(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('bisectorLine')); } }] },
      { fly: 'rect', items: [{ id: 'rect', label: 'Corner\nRectangle', tool: 'rect' }, { id: 'crect', label: 'Center\nRectangle', tool: 'crect' },
        { id: 'rect3', label: '3 Point Corner\nRectangle', tool: 'rect3', help: 'Rectangle at any angle from two corners and its height' },
        { id: 'crect3', label: '3 Point Center\nRectangle', tool: 'crect3', help: 'Rectangle at any angle from its center, a side midpoint and its height' },
        { id: 'parallelogram', label: 'Parallelogram', tool: 'parallelogram', help: 'Parallelogram from three corners' }] },
      // the Circle flyout: Circle, Perimeter Circle (ui-sketch-curves.js) and Tangent Circle (ui-sketch-construct.js)
      { fly: 'circle', items: [{ id: 'circle', label: 'Circle', tool: 'circle' }, { id: 'pcircle', label: 'Perimeter\nCircle', tool: 'pcircle', help: 'Circle through three points on it' },
        { id: 'tangentCircle', label: 'Tangent\nCircle', help: 'Circle tangent to two entities with a radius, or to three', run: function () { if (UI.cmdTangentCircle) UI.cmdTangentCircle(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('tangentCircle')); } }] },
      { fly: 'arc', items: [{ id: 'arc', label: 'Centerpoint\nArc', tool: 'arc' }, { id: 'arc3', label: '3 Point\nArc', tool: 'arc3' }] },
      { id: 'polygon', label: 'Polygon', tool: 'polygon' },
      { id: 'slot', label: 'Straight\nSlot', tool: 'slot' },
      { id: 'point', label: 'Point', tool: 'point' },
      // ui-sketch-spline: Spline, the Ellipse ▸ Partial Ellipse flyout (small, inside the stack) and Text
      { stack: [{ id: 'spline', label: 'Spline', tool: 'spline' }, { fly: 'ellipse', items: [{ id: 'ellipse', label: 'Ellipse', tool: 'ellipse' }, { id: 'pellipse', label: 'Partial Ellipse', tool: 'pellipse' }] }, { id: 'text', label: 'Text', tool: 'text' }] },
      { sep: true },
      // sketch tools (ui-sketch-tools.js), as SolidWorks 2024 groups them: Sketch Fillet ▸ Sketch Chamfer, Trim ▸ Extend,
      // Convert Entities ▸ Intersection Curve, Offset Entities, and the small Mirror / Sketch Pattern / Move Entities flyouts
      { fly: 'skFillet', items: [{ id: 'fillet', label: 'Sketch\nFillet', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdSketchFillet(); } }, { id: 'skChamfer', label: 'Sketch\nChamfer', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdSketchChamfer(); } }] },
      { fly: 'trim', items: [{ id: 'trim', label: 'Trim\nEntities', run: function () { UI.cmdTrimEntities(); } }, { id: 'extend', label: 'Extend\nEntities', run: function () { UI.cmdExtendEntities(); } },
        { id: 'splitEnt', label: 'Split\nEntities', help: 'Split a line, arc or circle at a point, or everything at its intersections', run: function () { if (UI.cmdSplitEntities) UI.cmdSplitEntities(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('splitEnt')); } },
        { id: 'joinEnt', label: 'Join\nEntities', help: 'Join collinear lines, or arcs on one circle, into one', run: function () { if (UI.cmdJoinEntities) UI.cmdJoinEntities(); }, active: function () { return !!(UI.sketchConstructActive && UI.sketchConstructActive('joinEnt')); } }] },
      { fly: 'convert', items: [{ id: 'convert', label: 'Convert\nEntities', run: function () { UI.cmdConvertEntities(); } }, { id: 'intersectCurve', label: 'Intersection\nCurve', run: function () { if (UI.cmdIntersectionCurve) UI.cmdIntersectionCurve(); }, active: function () { return !!(UI.intersectionCurveOpen && UI.intersectionCurveOpen()); } }] },
      { id: 'offset', label: 'Offset\nEntities', run: function () { UI.cmdOffsetEntities(); } },
      { stack: [{ fly: 'mirrorEnt', items: [{ id: 'mirrorEnt', label: 'Mirror Entities', run: function () { UI.cmdMirrorEntities(); } }, { id: 'dynMirror', label: 'Dynamic Mirror', run: function () { if (UI.cmdDynamicMirror) UI.cmdDynamicMirror(); }, active: function () { return !!(UI.dynamicMirrorOn && UI.dynamicMirrorOn()); } }] },
        { fly: 'skPattern', items: [{ id: 'sketchPattern', label: 'Linear Sketch Pattern', run: function () { UI.cmdSketchPattern(); } }, { id: 'cSketchPattern', label: 'Circular Sketch Pattern', run: function () { UI.cmdCircularSketchPattern(); } }] },
        { fly: 'moveEnt', items: [{ id: 'moveEnt', label: 'Move Entities', run: function () { UI.cmdMoveEntities(); } }, { id: 'copyEnt', label: 'Copy Entities', run: function () { UI.cmdCopyEntities(); } }, { id: 'rotateEnt', label: 'Rotate Entities', run: function () { UI.cmdRotateEntities(); } }, { id: 'scaleEnt', label: 'Scale Entities', run: function () { UI.cmdScaleEntities(); } }, { id: 'stretchEnt', label: 'Stretch Entities', run: function () { UI.cmdStretchEntities(); } }] }] },
      { stack: [{ id: 'relations', label: 'Display/Delete Relations', run: function () { UI.cmdDisplayRelations(); } }] },
      { stack: [{ id: 'addRelation', label: 'Add Relation', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdAddRelations(); } },
        { id: 'construction', label: 'Construction Geometry', run: function () { UI.toggleConstruction(); } },
        { id: 'centerline', label: 'Centerline', run: function () { UI.cmdCenterline(); } }] },
      { stack: [{ id: 'fullyDefine', label: 'Fully Define Sketch', run: function () { if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; } UI.cmdFullyDefineSketch(); } }] },   // sketchdims
      // sketch-layers / levels: the Levels Manager tab (ui-levels.js, Mastercam's part-wide levels: CUT, ETCH and BEND
      // with their own colours, shown or hidden, written to the DXF on their names); the sketch's Layers PM without it
      { id: 'levels', label: 'Levels', help: 'Levels Manager: numbered part-wide levels (CUT, ETCH, BEND …) with their own colours, shown or hidden, written to the DXF on their names', run: function () { if (UI.showLevelsManager) UI.showLevelsManager(); else if (UI.cmdSketchLayers) UI.cmdSketchLayers(); } },
      { sep: true },
      { id: 'plane', label: 'Plane', run: function () { UI.cmdPlane(); } },
      { id: 'dxf', label: 'Sketch\nto DXF', run: function () { UI.exportSketchDXF(); } },
      // dxf-import: Insert DXF, Check Sketch for Feature, Repair Sketch (ui-sketch-import.js)
      { id: 'importDxf', label: 'Insert\nDXF / DWG', help: 'Import a DXF or DWG file into the sketch (a new sketch on the Top Plane when none is open; DWG through the local Anvil server)', run: function () { UI.cmdInsertDXF(); } },
      { stack: [{ id: 'checkSketch', label: 'Check Sketch for Feature', help: 'Find open endpoints, gaps, duplicates and crossings that keep the sketch from making a feature', run: function () { UI.cmdCheckSketch(); } },
        { id: 'repairSketch', label: 'Repair Sketch', help: 'Close small gaps, merge duplicate and overlapping entities, join collinear lines and remove tiny entities', run: function () { UI.cmdRepairSketch(); } }] }
    ],
    Evaluate: [
      { id: 'measure', label: 'Measure', run: function () { UI.cmdMeasure(); } },
      { id: 'mass', label: 'Mass\nProperties', run: function () { UI.showMassProperties(); } },
      { id: 'sectionProps', label: 'Section\nProperties', run: function () { UI.cmdSectionProperties(); } },
      { id: 'section', label: 'Section\nView', run: function () { UI.cmdSection(); } },
      { sep: true },
      { id: 'dxf', label: 'Face\nto DXF', run: function () { UI.exportFaceDXF(); } },
      { id: 'check', label: 'Check', run: function () { UI.cmdCheck(); } }, { id: 'sensor', label: 'Sensor' },
      { id: 'zebra', label: 'Zebra\nStripes', run: function () { UI.cmdZebra(); }, active: function () { return !!(UI.evaluate && UI.evaluate.zebra.state().on); } },
      { id: 'draftAnalysis', label: 'Draft\nAnalysis', run: function () { UI.cmdDraftAnalysis(); } },
      { id: 'clearance', label: 'Clearance\nVerification', run: function () { UI.cmdClearance(); } },
      { stack: [{ id: 'generic', label: 'Undercut Analysis' }, { id: 'generic', label: 'Thickness Analysis' }] },
      { sep: true },
      { id: 'generic', label: 'Compare\nDocuments' }, { id: 'generic', label: 'Performance\nEvaluation' }, { id: 'generic', label: 'Costing' }
    ],
    'Sheet Metal': [
      { id: 'flange', label: 'Base\nFlange/Tab', run: function () { UI.cmdBaseFlange(); } },
      { id: 'generic', label: 'Convert to\nSheet Metal' }, { id: 'loft', label: 'Lofted-\nBend' },
      { sep: true },
      { id: 'bend', label: 'Edge\nFlange', run: function () { UI.cmdEdgeFlange(); } }, { id: 'miter', label: 'Miter\nFlange', run: function () { UI.cmdMiterFlange(); } }, { id: 'hem', label: 'Hem', run: function () { UI.cmdHem(); } }, { id: 'jog', label: 'Jog', run: function () { UI.cmdJog(); } }, { id: 'sketchedBend', label: 'Sketched\nBend', run: function () { UI.cmdSketchedBend(); } },
      { stack: [{ id: 'generic', label: 'Cross-Break' }, { id: 'generic', label: 'Corners' }, { id: 'generic', label: 'Forming Tool' }] },
      { sep: true },
      { id: 'cut', label: 'Extruded\nCut', run: function () { UI.cmdExtrude(true); } }, { id: 'hole', label: 'Simple\nHole', run: function () { UI.cmdHole(); } }, { id: 'generic', label: 'Vent' },
      { sep: true },
      { id: 'flatten', label: 'Flatten', run: function () { UI.cmdFlatten(); } }, { id: 'dxf', label: 'Flat to\nDXF', run: function () { UI.exportFlatDXF(); } }, { id: 'generic', label: 'Unfold' }, { id: 'generic', label: 'Fold' }, { id: 'generic', label: 'Rip' }
    ]
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
      { id: 'generic', label: 'Exploded\nView' },
      { stack: [{ id: 'generic', label: 'Smart Fasteners' }, { id: 'generic', label: 'Bill of Materials' }, { id: 'generic', label: 'Instant3D' }] }
    ],
    Evaluate: [
      { id: 'measure', label: 'Measure', run: function () { UI.cmdMeasure(); } },
      { id: 'mass', label: 'Mass\nProperties', run: function () { UI.showMassProperties(); } },
      { id: 'sectionProps', label: 'Section\nProperties', run: function () { UI.cmdSectionProperties(); } },
      { id: 'section', label: 'Section\nView', run: function () { UI.cmdSection(); } },
      { sep: true },
      { id: 'interference', label: 'Interference\nDetection', run: function () { UI.cmdInterference(); } }, { id: 'clearance', label: 'Clearance\nVerification', run: function () { UI.cmdClearance(); } }, { id: 'generic', label: 'Hole Alignment' },
      { sep: true },
      { id: 'check', label: 'Check', run: function () { UI.cmdCheck(); } },
      { id: 'zebra', label: 'Zebra\nStripes', run: function () { UI.cmdZebra(); }, active: function () { return !!(UI.evaluate && UI.evaluate.zebra.state().on); } },
      { id: 'draftAnalysis', label: 'Draft\nAnalysis', run: function () { UI.cmdDraftAnalysis(); } }
    ]
  };
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function ribbonSet() { return isAsm() ? ASM_RIBBON : RIBBON; }
  function ribbonTabs() { return Object.keys(ribbonSet()); }

  // One-line descriptions for the ribbon tooltips, keyed by the button label (ids such as 'bend' are shared by several buttons).
  var RIBBON_HELP = {
    'Extruded Boss/Base': 'Extrude a closed sketch profile into a solid', 'Revolved Boss/Base': 'Revolve a sketch profile about an axis line',
    'Swept Boss/Base': 'Sweep a profile sketch along a path', 'Lofted Boss/Base': 'Loft a solid through two or more section sketches',
    'Extruded Cut': 'Remove material by extruding a sketch profile', 'Hole Wizard': 'Counterbore, countersink, hole or straight tap holes (ANSI Inch or ISO) at points on a face', 'Revolved Cut': 'Remove material by revolving a sketch profile',
    'Swept Cut': 'Remove material along a path', 'Lofted Cut': 'Remove material lofted through section sketches',
    'Fillet': 'Round the selected edges', 'Chamfer': 'Bevel the selected edges', 'Linear Pattern': 'Repeat a feature along one or two directions', 'Circular Pattern': 'Repeat a feature about an axis', 'Mirror': 'Mirror a feature or the body about a plane',
    'Shell': 'Hollow the body, removing the selected faces', 'Reference Geometry': 'Create an offset reference plane',
    'Sketch': 'Start a sketch on the selected plane or face', 'Exit Sketch': 'Close the sketch and return to the part', 'Smart Dimension': 'Dimension sketch entities',
    'Line': 'Draw a line', 'Corner Rectangle': 'Rectangle from two corners', 'Center Rectangle': 'Rectangle from its center', 'Circle': 'Circle from center and radius', 'Centerpoint Arc': 'Arc from center, start and end', '3 Point Arc': 'Arc from its start, end and a point on it', 'Polygon': 'Regular polygon', 'Straight Slot': 'Slot from two centers and a width', 'Point': 'Sketch point',
    'Sketch Fillet': 'Round a sketch corner', 'Sketch Chamfer': 'Bevel a sketch corner', 'Intersection Curve': 'Sketch where a plane or face crosses the model', 'Trim Entities': 'Trim or extend sketch entities', 'Convert Entities': 'Project model edges into the sketch', 'Offset Entities': 'Offset sketch entities by a distance',
    'Plane': 'Create an offset reference plane', 'Sketch to DXF': 'Export the active sketch as DXF',
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
    'Spline': 'Draw a smooth curve through points', 'Ellipse': 'Ellipse from center and two radii', 'Text': 'Sketch text along a line or curve',
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
    'Convert to Sheet Metal': 'Turn a solid into sheet metal', 'Lofted- Bend': 'Sheet metal lofted between two open profiles', 'Sketched Bend': 'Bend the sheet along a sketch line',
    'Cross-Break': 'Stiffening cross-break on a face', 'Corners': 'Close, break or relieve sheet-metal corners', 'Forming Tool': 'Press a formed shape into the sheet',
    'Vent': 'Vent openings from a sketch', 'Unfold': 'Flatten selected bends', 'Fold': 'Fold unfolded bends back', 'Rip': 'Rip the edges of a hollow part so it can be unfolded',
    'Linear Component Pattern': 'Repeat components along one or two directions', 'Circular Component Pattern': 'Repeat components about an axis',
    'Mirror Components': 'Mirror components about a plane', 'Exploded View': 'Pull the components apart in steps', 'Bill of Materials': 'Parts list with quantities',
    'Smart Fasteners': 'Add fasteners to holes', 'Hole Alignment': 'Find holes that do not line up across components'
  };
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
    'Document Properties': 'Drafting standard, fonts and arrows'
  };
  // r14/commands14: tooltips in SolidWorks' two-line style: the name in bold (with its shortcut), a description under it,
  // and a third, muted line for why a button is greyed (setTip, below). An item's own `help` wins over the tables.
  function ribbonTip(id, label, enabled, needsSketch, help) {
    var key = UI.shortcutFor ? UI.shortcutFor(id) : null;
    var desc = help || (UI.drawingActive && UI.drawingActive() && DRAW_HELP[label]) || RIBBON_HELP[label] || '';
    if (!enabled) return { name: label, key: '', desc: desc, note: 'Not available in this build yet' };
    return { name: label, key: key || '', desc: desc, note: needsSketch ? 'Open a sketch first' : '' };
  }
  // the state a ribbon item shows now: { id, label, flat, disabled, active, tip }
  function itemState(item) {
    var d = item.dyn && item.dyn();
    var id = d ? d.id : item.id, label = d ? d.label : item.label, flat = label.replace(/\n/g, ' ');
    var enabled = !!(item.run || item.tool), needsSketch = !!item.tool && App.mode !== 'sketch', active = false;
    if (item.tool) active = App.mode === 'sketch' && App.tool === item.tool && (!item.active || !!item.active());   // p9-sketchtab: Line / Centerline / Midpoint Line share the line tool
    else if (item.run) active = !!((item.id === 'sketch' && App.mode === 'sketch') || (item.active && item.active()));
    return { id: id, label: label, flat: flat, disabled: !enabled || needsSketch, active: active, tip: ribbonTip(id, flat, enabled, needsSketch, item.help) };
  }
  function runItem(item) {
    if (item.tool && !item.run) UI.setTool(itemState(item).active ? 'select' : item.tool);
    else if (item.run) { item.run(); refreshRibbon(); }
  }
  // A ribbon button's look follows the app state (sketch mode, active tool, toggles). sync() applies it in place, so
  // refreshing the ribbon (after every command, tool change and PropertyManager close) does not replace the button
  // under the mouse: no hover flicker, and the tooltip stays up.
  function ribbonButton(item, small) {
    var b = el('button', { class: 'rb' }), shown = null;
    function sync() {
      var s = itemState(item);
      var face = s.id + '|' + s.label;
      if (face !== shown) {
        shown = face;
        b.innerHTML = Icons(s.id, small ? 18 : 32) + '<span>' + (small ? item.label : s.label) + '</span>';
        b.setAttribute('aria-label', s.flat); b.dataset.icon = s.id;
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
      return { label: s.flat, icon: s.id, key: s.tip.key, checked: s.active, disabled: s.disabled, action: function () { setFlyFace(item, i); runItem(it); refreshRibbon(); } };
    });
  }
  function ribbonFlyout(item, small) {
    var wrap = el('div', { class: 'rb-fly' + (small ? ' rb-fly-small' : '') }), b = el('button', { class: 'rb rb-face' }), shown = null, wasOpen = false;
    var c = el('button', { class: 'rb-caret', html: '<span>▾</span>' });
    function sync() {
      var i = flyCurrent(item), s = itemState(item.items[i]);
      var label = item.label || (small ? s.flat : s.label), face = s.id + '|' + label;
      if (face !== shown) {
        var refit = shown !== null;
        shown = face;
        b.innerHTML = Icons(s.id, small ? 18 : 32) + '<span>' + (small ? s.flat : label) + '</span>';
        b.setAttribute('aria-label', item.label ? item.label.replace(/\n/g, ' ') : s.flat); b.dataset.icon = s.id;
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
    var tabNames = Object.keys(set), extraTabs = isAsm() ? ['Layout', 'Sketch', 'Markup', 'SOLIDWORKS Add-Ins'] : ['Surfaces', 'Weldments', 'Mold Tools', 'Direct Editing', 'MBD Dimensions'];
    // another document type (drawing.js) may swap the tab set: UI.ribbonTabsFor(names, extra) -> [names, extra]
    if (UI.ribbonTabsFor) { var tf = UI.ribbonTabsFor(tabNames, extraTabs); tabNames = tf[0]; extraTabs = tf[1]; }
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
  function refreshRibbon() {
    var bar = $('ribbon-buttons');
    var set = ribbonSet();
    if (!set[App.ribbonTab]) App.ribbonTab = Object.keys(set)[0];
    var shape = ribbonShape();
    if (sameShape(ribbonBuilt, shape) && bar.children.length) {
      Array.prototype.forEach.call(bar.querySelectorAll('.rb'), function (b) { if (b._sync) b._sync(); });
      return;
    }
    ribbonBuilt = shape;
    var frag = document.createDocumentFragment();
    shape.items.forEach(function (item) {
      if (item.sep) { frag.appendChild(el('div', { class: 'rb-sep' })); return; }
      if (item.stack) {
        var st = el('div', { class: 'rb-stack' });
        item.stack.forEach(function (s) { st.appendChild(s.fly ? ribbonFlyout(s, true) : ribbonButton(s, true)); });   // a small flyout in a stack (Ellipse)
        frag.appendChild(st);
        return;
      }
      if (item.fly) { frag.appendChild(ribbonFlyout(item)); return; }   // r14/commands14
      frag.appendChild(ribbonButton(item));
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
      tfrag.appendChild(el('button', { class: 'rtab' + (name === App.ribbonTab ? ' active' : ''), text: name, onclick: function () { if (App.mode !== 'sketch') tabBeforeSketch = null; setRibbonTab(name); } }));
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
  var tabBeforeSketch = null;
  function setRibbonTab(name) {
    if (name === 'Sketch' && App.mode === 'sketch') { if (App.ribbonTab !== 'Sketch' && tabBeforeSketch == null) tabBeforeSketch = App.ribbonTab; }
    else if (name === 'Features' && App.mode !== 'sketch' && tabBeforeSketch != null) {
      var back = App.ribbonTab === 'Sketch' ? tabBeforeSketch : App.ribbonTab;
      tabBeforeSketch = null;
      if (ribbonSet()[back]) name = back;
    }
    App.ribbonTab = name; refreshRibbon();
  }

  // r12/chrome12: the CommandManager fits the window as in SolidWorks. Level 1 drops the labels of the small stacked
  // buttons, level 2 the labels of the large ones; whatever still does not fit moves, from the right end, into a »
  // menu. Nothing scrolls. The buttons stay in the DOM (hidden ones only get .rb-over), so lookups by label still work.
  function fitRibbon() {
    var rib = $('ribbon'), bar = $('ribbon-buttons');
    if (!rib || !bar) return;
    // the tab strip: greyed-out tabs that do not fit whole are left out rather than cut in half
    var tabs = $('ribbon-tabs');
    if (tabs) {
      var offs = Array.prototype.filter.call(tabs.children, function (t) { if (t.style.display) t.style.display = ''; return t.classList.contains('off'); });
      for (var k = offs.length - 1; k >= 0 && tabs.scrollWidth > tabs.clientWidth + 1; k--) offs[k].style.display = 'none';
    }
    var more = bar.querySelector('.rb-more');
    if (!more) {
      var wasOpen = false;
      more = el('button', { class: 'rb-more', text: '»', title: 'More commands', 'aria-label': 'More commands',
        onmousedown: function () { wasOpen = more.classList.contains('open'); },
        onclick: function () { if (wasOpen) { wasOpen = false; return; } showRibbonOverflow(more); } });
    }
    if (bar.lastChild !== more) bar.appendChild(more);
    rib.classList.remove('fit-1', 'fit-2');
    var kids = Array.prototype.filter.call(bar.children, function (c) { return c !== more; });
    kids.forEach(function (c) { if (c.classList.contains('rb-over')) c.classList.remove('rb-over'); });
    more.hidden = true;
    function fits() { return bar.scrollWidth <= bar.clientWidth + 1; }
    if (fits()) return 0;
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
  function showRibbonOverflow(anchor) {
    var items = [];
    Array.prototype.forEach.call($('ribbon-buttons').children, function (c) {
      if (!c.classList.contains('rb-over')) return;
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

  // r12/chrome12: FeatureManager and Task Pane widths. Each has a drag handle on its inner edge (double-click: default
  // width); the width a user sets is kept in localStorage, and the shown width is clamped so the graphics area keeps
  // at least max(320 px, 35 % of the window): the Task Pane gives way first, then the FeatureManager.
  var PANES = {
    fm: { key: 'anvil.fmWidth', def: 296, min: 200, max: 640, css: '--fm-w', pref: null, shown: null },
    tp: { key: 'anvil.tpWidth', def: 340, min: 240, max: 720, css: '--tp-w', pref: null, shown: null }
  };
  function panePref(p) {
    if (p.pref == null) { var n = NaN; try { n = parseFloat(localStorage.getItem(p.key)); } catch (e) { } p.pref = n >= p.min && n <= p.max ? Math.round(n) : p.def; }
    return p.pref;
  }
  function paneWidths() {
    var W = document.documentElement.clientWidth || window.innerWidth, strip = ($('tp-strip') && $('tp-strip').offsetWidth) || 35;
    var tpOpen = $('tp-panel') && !$('tp-panel').hidden;
    var fm = panePref(PANES.fm), tp = panePref(PANES.tp), minVp = Math.max(320, Math.round(W * 0.35)), overlay = false;
    var spare = W - strip - minVp - fm;
    if (spare < 0) fm = Math.max(PANES.fm.min, fm + spare);
    if (tpOpen) {
      spare = W - strip - minVp - fm - tp;
      if (spare < 0 && tp + spare >= PANES.tp.min) tp += spare;
      // too narrow to dock it: the Task Pane slides out over the graphics area, as SolidWorks' unpinned Task Pane does
      else if (spare < 0) { overlay = true; tp = Math.max(Math.min(PANES.tp.min, W - strip - 8), Math.min(tp, W - strip - 48)); }
    }
    return { fm: fm, tp: tp, W: W, strip: strip, minVp: minVp, tpOpen: tpOpen, overlay: overlay };
  }
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
      start = { x: e.clientX, w: p.shown || panePref(p) };
      try { s.setPointerCapture(e.pointerId); } catch (er) { }
      s.classList.add('dragging'); document.body.classList.add('splitting');
    });
    s.addEventListener('pointermove', function (e) {
      if (!start) return;
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
      try { localStorage.setItem(p.key, String(p.pref)); } catch (er) { }
      fitPanels(true);
    }
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('lostpointercapture', end);
    s.addEventListener('dblclick', function () { p.pref = p.def; try { localStorage.removeItem(p.key); } catch (er) { } fitPanels(true); });
    host.appendChild(s);
  }
  function fitWorkspace() { fitPanels(true); fitRibbon(); }
  (function initFit() {
    addSplitter($('left'), PANES.fm, 1);
    addSplitter($('tp-panel'), PANES.tp, -1);
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
      var b = el('button', { html: Icons(t[1], 18), title: t[2], onclick: function () { if (t[0] === 'levels') { if (!$('levels-panel')) { toast('The Levels Manager did not load.'); return; } levelsSticky = true; setFmTab('levels'); return; } if (t[0] === 'pm' && !UI.hasPM()) { toast('The PropertyManager opens when a command is active.'); return; } if (t[0] === 'pm') { setFmTab('pm'); return; } if (t[0] === 'tree' || t[0] === 'config') { if (!UI.hasPM()) { levelsSticky = false; setFmTab(t[0]); } else toast('Finish or cancel the active command first (✓ or ✗).'); return; } if (t[0] !== 'pm') toast(t[2] + ' is not available in this build.'); } });
      b.dataset.tab = t[0];
      bar.appendChild(b);
    });
    setFmTab('tree');
  }
  // setFmTab('tree' | 'config' | 'pm'): marks the tab and shows its pane. The PropertyManager (ui-commands openPM /
  // closePM) shows and hides #pm and #fm-tree itself; here 'pm' only hides the ConfigurationManager.
  function setFmTab(name) {
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
      return;
    }
    if (name === 'pm' && UI.hasPM && UI.hasPM()) $('pm').hidden = false;
    Array.prototype.forEach.call($('fm-tabs').children, function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    App.fmTab = name;
    var cp = $('config-panel');
    if (name === 'tree') { $('fm-tree').hidden = false; if (cp) cp.hidden = true; }
    else if (name === 'config') { $('fm-tree').hidden = true; if (cp) { cp.hidden = false; refreshConfigPanel(); } }
    else if (cp) cp.hidden = true;
  }

  // ------------------------------------------------------------------ feature tree
  var expanded = {};
  var FEATURE_ICON = { sketch: 'sketch', plane: 'planeSmall', extrude: 'extrude', revolve: 'revolve', lpattern: 'lpattern', cpattern: 'cpattern', mirror: 'mirror', chamfer: 'chamfer', fillet: 'fillet', flange: 'bend', jog: 'bend', sweep: 'sweep', loft: 'loft', shell: 'shell', import: 'imported', hole: 'holeWizard' };
  function featureIcon(f) {
    if (f.type === 'extrude') return f.cut ? 'cut' : (f.sheetBase ? 'flange' : 'extrude');
    if (f.type === 'revolve') return f.cut ? 'revolveCut' : 'revolve';
    if (f.type === 'flange') return f.miter ? 'miter' : (f.hem ? 'hem' : 'bend');
    if (f.type === 'jog') return 'jog';
    if (f.type === 'sketchedBend') return 'sketchedBend';
    return FEATURE_ICON[f.type] || 'generic';
  }
  function treeItem(opts) {
    var row = el('div', { class: 'ti' + (opts.cls ? ' ' + opts.cls : '') });
    row.style.paddingLeft = (6 + (opts.depth || 0) * 14) + 'px';
    var tw = el('span', { class: 'tw' + (opts.children ? '' : ' leaf'), text: opts.open ? '▾' : '▸' });
    row.appendChild(tw);
    var ic = el('span');
    ic.appendChild(Icons.node ? Icons.node(opts.icon, 16) : el('span', { html: Icons(opts.icon, 16) }));
    row.appendChild(ic);
    row.appendChild(el('span', { class: 'nm', text: opts.name, title: opts.title || opts.name }));
    if (opts.badge) row.appendChild(el('span', { class: 'badge', text: opts.badge }));
    if (opts.children) tw.addEventListener('click', function (e) { e.stopPropagation(); opts.toggle(); });
    return row;
  }
  function refreshTree() {
    syncStdToolbar();
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
    [['folder', 'History'], ['sensor', 'Sensors'], ['annotations', 'Annotations']].forEach(function (s) { tree.appendChild(treeItem({ icon: s[0], name: s[1], depth: 1, cls: 'dim' })); });
    appendEquationsFolder(tree, filter);
    appendBodiesFolder(tree, filter);
    // Material row (ui-materials.js: name, Edit Material on double-click, favourites on right-click)
    tree.appendChild(UI.materialTreeRow ? UI.materialTreeRow(treeItem) : treeItem({ icon: 'material', name: (m.materialName || 'Material <not specified>') + '  ·  ' + m.density + ' kg/m³', depth: 1, cls: 'dim' }));
    ['Front', 'Top', 'Right'].forEach(function (r) {
      var row = treeItem({ icon: 'planeSmall', name: r + ' Plane', depth: 1, cls: App.sel && App.sel.kind === 'plane' && App.sel.ref === r ? 'selected' : '' });
      row.addEventListener('click', function () { App.sel = { kind: 'plane', ref: r, plane: K.makePlane(r, 0), name: r + ' Plane' }; App.sel2 = null; UI.updatePlanes(); UI.updateHighlights(); refreshTree(); });
      row.addEventListener('dblclick', function () { UI.newSketchOnPlane(r); });
      row.addEventListener('contextmenu', function (e) { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Sketch on ' + r + ' Plane', action: function () { UI.newSketchOnPlane(r); } }, { label: 'Normal To', action: function () { UI.viewNormalTo(K.makePlane(r, 0)); } }, { label: (App.view.showPlanes ? 'Hide' : 'Show') + ' planes', action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } }]); });
      tree.appendChild(row);
    });
    tree.appendChild(treeItem({ icon: 'origin', name: 'Origin', depth: 1, cls: 'dim' }));

    function childSketchIds(f) {
      var ids = [];
      if (f.sketch != null) ids.push(f.sketch);
      if (f.profile != null) ids.push(f.profile);
      if (f.path != null && !Array.isArray(f.path)) ids.push(f.path);
      if (f.sketches) ids = ids.concat(f.sketches);
      return ids;
    }
    var consumedBy = {};
    m.features.forEach(function (f) { childSketchIds(f).forEach(function (id) { if (consumedBy[id] == null) consumedBy[id] = f.id; }); });
    m.features.forEach(function (f) {
      if (f.type === 'sketch' && consumedBy[f.id] != null) return; // shown under its feature
      if (filter && f.name.toLowerCase().indexOf(filter) < 0) return;
      var kids = childSketchIds(f).filter(function (id) { return consumedBy[id] === f.id; }).map(function (id) { return K.findFeature(m, id); }).filter(Boolean);
      var isOpen = !!expanded[f.id];
      var row = featureRow(f, 1, kids.length ? { open: isOpen, toggle: function () { expanded[f.id] = !expanded[f.id]; refreshTree(); } } : null, errors, warnings);
      tree.appendChild(row);
      if (kids.length) {
        var box = el('div', { class: 'tc' + (isOpen ? ' open' : '') });
        kids.forEach(function (k) { box.appendChild(featureRow(k, 2, null, errors, warnings)); });
        tree.appendChild(box);
      }
    });
    if (App.sel && (App.sel.kind === 'feature' || App.sel.kind === 'body')) {
      // a row selected elsewhere (the viewport) scrolls into view by the least amount, as in SolidWorks; a visible
      // row leaves the list where it is
      var selRow = tree.querySelector('.ti.selected');
      if (selRow) revealRow(tree, selRow);
    }
    refreshConfigPanel();   // every rebuild, undo and load refreshes the tree; keep the ConfigurationManager in step
  }
  function revealRow(box, row) {
    if (!row.getClientRects().length) return;   // inside a collapsed folder
    var r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop += r.top - b.top;
    else if (r.bottom > b.top + box.clientHeight) box.scrollTop += r.bottom - b.top - box.clientHeight;
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
    if (b.featureId != null && K.findFeature(App.model, b.featureId)) {
      items.push({ sep: true });
      items.push({ label: 'Edit Feature', action: function () { UI.editFeature(K.findFeature(App.model, b.featureId)); } });
    }
    return items;
  }
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
    var rolled = App.rollback != null && !active && App.model.features.indexOf(f) >= App.rollback;
    var row = treeItem({ icon: err ? 'error' : (warn ? 'warn' : featureIcon(f)), name: (f.type === 'sketch' && UI.sketchTreePrefix ? UI.sketchTreePrefix(f) : '') + f.name + (active ? '  (editing)' : ''), depth: depth, children: !!kids, open: kids && kids.open, toggle: kids && kids.toggle, cls: (selected ? 'selected' : '') + (err ? ' err' : '') + (warn ? ' warn' : '') + (rolled ? ' rolled' : ''), title: (err || warn || featureTitle(f)) + (rolled ? ' (rolled back)' : ''), badge: f.type === 'sketch' && f.entities ? f.entities.length + ' ent.' : '' });
    row.setAttribute('data-fid', String(f.id));   // selection sync (ui-select.js)
    if (UI.rebuildMarkRow) UI.rebuildMarkRow(row, f, err, warn, featureIcon(f));   // r12/occtui12: own icon + error / warning badge, tooltip
    row.addEventListener('click', function (e) {
      // slow double-click (SolidWorks): a second, unhurried click on the name of the selected feature renames it;
      // a real double-click within the delay cancels it and edits the feature instead
      if (selected && e.isTrusted && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.target.classList && e.target.classList.contains('nm')) slowRename(f);
      App.sel = { kind: 'feature', id: f.id }; App.sel2 = null; UI.updateHighlights(); UI.updateSketches(); refreshTree(); if (UI.onSelectionChanged) UI.onSelectionChanged(); setStatus(f.name + (err ? ': ' + err : ''));
    });
    row.addEventListener('dblclick', function (e) { e.stopPropagation(); cancelSlowRename(); UI.editFeature(f); });
    row.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); App.sel = { kind: 'feature', id: f.id }; UI.updateHighlights(); refreshTree(); showMenu(e.clientX, e.clientY, featureMenu(f)); });
    return row;
  }
  function featureTitle(f) {
    switch (f.type) {
      case 'extrude': return (f.cut ? 'Cut' : 'Boss') + ' extrude, ' + (f.end === 'through' ? 'through all' : f.end === 'mid' ? 'mid plane ' + f.depth : 'blind ' + f.depth) + (f.draft ? ', draft ' + f.draft + '°' + (f.draftOut ? ' outward' : '') : '') + (f.normalCut ? ', normal cut' : '');
      case 'revolve': return (f.cut ? 'Cut' : 'Boss') + ' revolve ' + f.angle + '°';
      case 'lpattern': return 'Linear pattern ' + f.n1 + ' × ' + f.s1 + ' along ' + f.d1 + (f.d2 ? ', ' + f.n2 + ' × ' + f.s2 + ' along ' + f.d2 : '');
      case 'cpattern': return 'Circular pattern ' + f.n + ' about ' + f.axis;
      case 'mirror': return 'Mirror about ' + f.plane + (f.body ? ' (body)' : '');
      case 'plane': return 'Plane parallel to ' + f.ref + ' at ' + f.offset;
      case 'chamfer': return 'Chamfer ' + f.d + ' on ' + (f.edges || []).length + ' edge pick' + ((f.edges || []).length === 1 ? '' : 's');
      case 'fillet': return 'Fillet R' + f.r + ' on ' + (f.edges || []).length + ' edge pick' + ((f.edges || []).length === 1 ? '' : 's');
      case 'sketchedBend': return 'Sketched bend ' + f.angle + '°, ' + ({ inside: 'material inside', outside: 'material outside', bendOutside: 'bend outside' }[f.position] || 'bend centerline') + (f.reverse ? ', reversed' : '') + (f.fixed ? ', fixed face picked' : '');
      case 'jog': return 'Jog ' + f.height + ' high, ' + f.length + ' flat, ' + f.angle + '°, ' + (f.edges || []).length + ' edge' + ((f.edges || []).length === 1 ? '' : 's');
      case 'flange': return (f.hem ? 'Hem gap ' + Math.round(f.radius * 2 * 1e4) / 1e4 + ', ' : f.miter ? 'Miter flange ' : 'Edge flange ') + f.length + ' long, ' + f.angle + '°, ' + (f.edges || []).length + ' edge' + ((f.edges || []).length === 1 ? '' : 's') + (f.position === 'inside' ? ', material inside' : f.position === 'outside' ? ', material outside' : '') +
        (f.miter ? ', mitred' + (f.miterGap > 0 ? ' (gap ' + f.miterGap + ')' : '') : '') + (f.relief && f.relief !== 'none' ? ', relief ' + (f.relief === 'rect' ? 'rectangle' : f.relief) : '');
      case 'shell': return 'Shell, walls ' + f.thickness + ' thick, ' + ((f.faces || []).length ? (f.faces || []).length + ' face' + ((f.faces || []).length === 1 ? '' : 's') + ' removed' : 'closed');
      case 'sweep': return (f.cut ? 'Cut' : 'Boss') + ' sweep along ' + (Array.isArray(f.path) ? f.path.length + ' points' : 'a path sketch');
      case 'loft': return (f.cut ? 'Cut' : 'Boss') + ' loft through ' + (f.sketches || []).length + ' sections';
      case 'import': return 'Imported ' + String(f.format || 'mesh').toUpperCase() + (f.file ? ' from ' + f.file : '') + ', ' + (f.solids || []).length + ' solid' + ((f.solids || []).length === 1 ? '' : 's') + (f.merge ? ', merged' : '');
      case 'hole': return 'Hole Wizard: ' + ({ cbore: 'Counterbore', csk: 'Countersink', hole: 'Hole', tap: 'Straight Tap' }[f.holeType] || f.holeType) + ' ' + (typeof HoleWizard !== 'undefined' && HoleWizard.standardOf ? HoleWizard.standardOf(f) : 'ISO') + ' ' + f.size + (f.holeType !== 'tap' ? ' ' + (f.fit || 'normal') + ' fit' : '') + ', ' + (f.end === 'through' ? 'through all' : 'blind ' + f.depth);
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
    if (f.type === 'sketch' && UI.editSketchPlane) items.push({ label: 'Edit Sketch Plane', action: function () { UI.editSketchPlane(f.id); } });   // r11/faceref11
    if (f.type === 'sketch') items.push({ label: 'Export sketch as DXF', action: function () { UI.exportSketchDXF(f); } });
    if (f.type === 'sketch') items.push({ label: f.hidden ? 'Show' : 'Hide', action: function () { f.hidden = !f.hidden; UI.updateSketches(); } });
    items.push({ label: 'Rename (F2)', action: function () { startRename(f); } });
    items.push({ sep: true });
    items.push({ label: 'Delete', action: function () { UI.deleteFeature(f.id); } });
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
  $('tree-filter-input').addEventListener('input', refreshTree);

  // ------------------------------------------------------------------ menus (popup + menu bar)
  var openMenu = null;
  function closeMenus() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    Array.prototype.forEach.call(document.querySelectorAll('#menus > li.open, .rb-more.open, .rb-fly.open'), function (li) { li.classList.remove('open'); });
  }
  function showMenu(x, y, items, anchorLi) {
    closeMenus();
    var m = el('div', { class: 'menu' });
    items.forEach(function (it) {
      if (it.sep) { m.appendChild(el('div', { class: 'sep' })); return; }
      var row = el('div', { class: 'mi' + (it.disabled ? ' disabled' : '') });
      row.appendChild(el('span', { class: 'chk', text: it.checked ? '✓' : '' }));
      if (it.icon) row.appendChild(el('span', { class: 'mi-ico', html: Icons(it.icon, 16) }));   // r12/chrome12: ribbon overflow rows
      row.appendChild(el('span', { text: it.label }));
      if (it.key) row.appendChild(el('span', { class: 'key', text: it.key }));
      if (!it.disabled) {
        // p9-pm: a row runs on the release of the button over it (a Windows menu: press on File, drag, release on the
        // item also works) and the click that ends the same press is swallowed, so it never lands on the ribbon button
        // that was under the menu; click alone (keyboard, scripted) still runs it, once
        var ran = false;
        var run = function () { if (ran) return; ran = true; closeMenus(); it.action(); };
        row.addEventListener('mouseup', function (e) { if (e.button !== 0) return; e.stopPropagation(); if (e.detail > 0) guardClick(e); run(); });
        row.addEventListener('click', run);
      }
      m.appendChild(row);
    });
    document.body.appendChild(m);
    var mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(0, Math.min(x, window.innerWidth - mw - 4)) + 'px';
    // p9-pm: a menu taller than the room below its title scrolls instead of moving up over the menu bar (where the next
    // click on File would land on one of its rows) or past the top of the window
    var room = window.innerHeight - 4 - (anchorLi ? y : 0);
    if (anchorLi && mh > room) { m.style.maxHeight = Math.max(80, room) + 'px'; m.style.overflowY = 'auto'; mh = m.offsetHeight; }
    m.style.top = (anchorLi ? y : Math.max(0, Math.min(y, window.innerHeight - mh - 4))) + 'px';
    openMenu = m;
    if (anchorLi) anchorLi.classList.add('open');
  }
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
        { label: 'Undo', key: 'Ctrl+Z', action: UI.undo, disabled: !App.undo.length },
        { label: 'Redo', key: 'Ctrl+Y', action: UI.redo, disabled: !App.redo.length },
        { sep: true }
      ].concat(App.mode === 'sketch' && UI.sketchCopy ? [   // sketch-layers: copy / paste sketch entities (ui-sketch-layers.js)
        { label: 'Copy', key: 'Ctrl+C', action: function () { UI.sketchCopy(); } },
        { label: 'Paste', key: 'Ctrl+V', action: function () { UI.sketchPaste(); }, disabled: !UI.sketchClipboard() },
        { sep: true }
      ] : []).concat([
        { label: 'Delete', key: 'Del', action: UI.deleteSelection, disabled: !App.sel },
        { label: 'Rebuild', key: 'Ctrl+B', action: function () { UI.rebuild().then(function () { toast('Rebuilt in ' + UI.fmtNum(App.lastRebuildMs, 0) + ' ms'); }); } },
        { label: 'Rebuild in background (Web Worker)', checked: App.workerOn, action: function () { UI.setWorkerOn(!App.workerOn); toast(App.workerOn ? 'Rebuilds run in a Web Worker' : 'Rebuilds run on the main thread'); } },
        { label: 'Clear selection', key: 'Esc', action: function () { App.sel = null; App.sel2 = null; UI.updateHighlights(); refreshTree(); } }
      ]) },
      { label: 'View', items: [
        { label: 'Zoom to Fit', key: 'F', action: UI.zoomToFit },
        { label: 'Zoom to Area', action: function () { App.zoomAreaMode = true; refreshHud(); } },
        { label: 'Selection Filter', key: 'F5', checked: !!(UI.selectionFilterBarShown && UI.selectionFilterBarShown()), action: function () { if (UI.toggleSelectionFilterBar) UI.toggleSelectionFilterBar(); } },
        { label: 'Previous View', key: 'Shift+Ctrl+Z', action: UI.previousView },
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
        { label: 'All Sketches', checked: v.showSketches, action: function () { v.showSketches = !v.showSketches; UI.updateSketches(); } },
        { label: 'Sketch Grid', checked: v.showGrid, action: function () { v.showGrid = !v.showGrid; App.gridStale = true; } },
        { label: 'Sketch Regions', checked: v.sketchRegions !== false, action: function () { v.sketchRegions = v.sketchRegions === false; UI.updateSketches(); UI.setStatus(v.sketchRegions ? 'Closed regions of the sketch are shaded and open ends marked.' : 'Sketch regions and open ends not shown.'); } },   // sketch-layers
        { label: 'Snap to Model', checked: v.snapModel !== false, action: function () { v.snapModel = v.snapModel === false; UI.setStatus(v.snapModel ? 'Sketch points snap to model vertices, edges, centres and faces.' : 'Sketch points snap to sketch geometry only.'); } },   // p9-modelsnap
        { label: 'Sketch Relations', checked: v.showRelations !== false, action: function () { v.showRelations = v.showRelations === false; App.dimsStale = true; UI.setStatus(v.showRelations ? 'Relation icons shown next to sketch entities.' : 'Relation icons hidden.'); } },
        { label: 'Sketch Dimensions', checked: v.showDims, action: function () { v.showDims = !v.showDims; App.dimsStale = true; UI.setStatus(v.showDims ? 'Driven dimensions shown on every sketch entity. Click a value to change it.' : 'Only placed dimensions are shown.'); } },
        { label: 'Section View', checked: !!v.section, action: UI.cmdSection },
        { sep: true },
        { label: 'Theme ▸ Light', checked: UI.theme() === 'light', action: function () { UI.setTheme('light'); toast('Light theme'); } },
        { label: 'Theme ▸ Dark', checked: UI.theme() === 'dark', action: function () { UI.setTheme('dark'); toast('Dark theme'); } },
        // r14/viewui14: View ▸ Background, remembered per browser (UI.setBackground, ui-core.js)
        { label: 'Background ▸ Gradient', checked: v.bg === 'gradient', action: function () { setBg('gradient'); } },
        { label: 'Background ▸ Plain', checked: v.bg === 'plain', action: function () { setBg('plain'); } },
        { label: 'Background ▸ Dark', checked: v.bg === 'dark', action: function () { setBg('dark'); } }
      ] },
      { label: 'Insert', items: isAsm() ? [
        { label: 'Component ▸ Existing Part…', action: function () { UI.cmdInsertComponent(); } },
        { label: 'Mate…', action: function () { UI.cmdMate(); } }
      ] : [
        { label: 'Boss/Base ▸ Extrude', action: function () { UI.cmdExtrude(false); } },
        { label: 'Boss/Base ▸ Revolve', action: function () { UI.cmdRevolve(false); } },
        { label: 'Boss/Base ▸ Sweep', action: function () { UI.cmdSweep(false); } },
        { label: 'Boss/Base ▸ Loft', action: function () { UI.cmdLoft(false); } },
        { label: 'Cut ▸ Extrude', action: function () { UI.cmdExtrude(true); } },
        { label: 'Cut ▸ Revolve', action: function () { UI.cmdRevolve(true); } },
        { label: 'Cut ▸ Sweep', action: function () { UI.cmdSweep(true); } },
        { label: 'Cut ▸ Loft', action: function () { UI.cmdLoft(true); } },
        { label: 'Features ▸ Hole Wizard', action: function () { (UI.cmdHoleWizard || UI.cmdHole)(); } },
        { label: 'Features ▸ Fillet', action: function () { UI.cmdFillet(); } },
        { label: 'Features ▸ Chamfer', action: function () { UI.cmdChamfer(); } },
        { label: 'Features ▸ Shell', action: function () { UI.cmdShell(); } },
        { label: 'Features ▸ Imported…', action: function () { UI.cmdInsertImported(); } },
        { sep: true },
        { label: 'Pattern/Mirror ▸ Linear Pattern', action: function () { UI.cmdLinearPattern(); } },
        { label: 'Pattern/Mirror ▸ Circular Pattern', action: function () { UI.cmdCircularPattern(); } },
        { label: 'Pattern/Mirror ▸ Mirror', action: function () { UI.cmdMirror(); } },
        { sep: true },
        { label: 'Sketch', action: UI.cmdSketch },
        { label: 'Reference Geometry ▸ Plane', action: function () { UI.cmdPlane(); } },
        { label: 'Sheet Metal ▸ Base Flange', action: UI.cmdBaseFlange },
        { label: 'Sheet Metal ▸ Edge Flange', action: function () { UI.cmdEdgeFlange(); } },
        { label: 'Sheet Metal ▸ Miter Flange', action: function () { UI.cmdMiterFlange(); } },
        { label: 'Sheet Metal ▸ Hem', action: function () { UI.cmdHem(); } },
        { label: 'Sheet Metal ▸ Jog', action: function () { UI.cmdJog(); } },
        { label: 'Sheet Metal ▸ Flatten', action: function () { UI.cmdFlatten(); } }
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
        { label: 'Relations ▸ Add…', action: function () { if (App.mode !== 'sketch') toast('Open a sketch first.'); else UI.cmdAddRelations(); }, disabled: App.mode !== 'sketch' },
        { label: 'Relations ▸ Display/Delete…', action: function () { UI.cmdDisplayRelations(); }, disabled: App.mode !== 'sketch' },
        { label: 'Dimensions ▸ Fully Define Sketch…', action: function () { if (UI.cmdFullyDefineSketch) UI.cmdFullyDefineSketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdFullyDefineSketch },   // sketchdims
        // dxf-import: Tools ▸ Sketch Tools, as SolidWorks has them (ui-sketch-import.js)
        { label: 'Sketch Tools ▸ Check Sketch for Feature…', action: function () { UI.cmdCheckSketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdCheckSketch },
        { label: 'Sketch Tools ▸ Repair Sketch…', action: function () { UI.cmdRepairSketch(); }, disabled: App.mode !== 'sketch' || !UI.cmdRepairSketch },
        { label: 'Sketch Tools ▸ Insert DXF / DWG…', action: function () { UI.cmdInsertDXF(); }, disabled: isAsm() || !UI.cmdInsertDXF },
        { label: 'Sketch Settings ▸ Enable on-screen numeric input on entity creation', checked: !!(UI.sketchNumericInput && UI.sketchNumericInput()), disabled: !UI.sketchNumericInput, action: function () { var on = UI.sketchNumericInput(!UI.sketchNumericInput()); toast(on ? 'Every entity you sketch gets its dimensions' : 'On-screen numeric input on entity creation off'); } },
        { label: 'Equations…', action: function () { if (isAsm()) toast('Equations belong to parts: open the part to edit them.'); else showEquations(); }, disabled: isAsm() },
        { sep: true },
        { label: 'Units: millimeters (MMGS)', checked: App.model.units !== 'in', action: function () { App.model.units = 'mm'; UI.rebuild(); } },
        { label: 'Units: inches (IPS)', checked: App.model.units === 'in', action: function () { App.model.units = 'in'; UI.rebuild(); } },
        { label: 'Default units for new documents ▸ Inches (IPS)', checked: UI.defaultUnits() === 'in', action: function () { UI.setDefaultUnits('in'); toast('New parts and assemblies start in inches (IPS).'); } },
        { label: 'Default units for new documents ▸ Millimeters (MMGS)', checked: UI.defaultUnits() === 'mm', action: function () { UI.setDefaultUnits('mm'); toast('New parts and assemblies start in millimeters (MMGS).'); } },
        { label: 'Options…', action: function () { UI.openTaskPane('props'); } },
        { label: 'Options ▸ Image Quality…', action: function () { UI.openTaskPane('props'); var q = document.querySelector('[data-role="image-quality"]'); if (q) q.focus(); } },
        { sep: true }
      ].concat(UI.occtMenuItems ? UI.occtMenuItems() : []) },   // r12/occtui12: Tools ▸ OpenCascade kernel ▸ … (ui-occt.js)
      { label: 'Window', items: [
        { label: 'Task Pane', checked: !$('tp-panel').hidden, action: function () { if ($('tp-panel').hidden) UI.openTaskPane('home'); else UI.closeTaskPane(); } }
      ] },
      { label: 'Help', items: [
        { label: 'Scripting reference', action: function () { UI.openTaskPane('macro'); } },
        { label: 'Keyboard shortcuts', action: UI.showShortcuts },
        { label: 'About Anvil', action: UI.showAbout }
      ] }
    ];
  }
  // ------------------------------------------------------------------ Standard toolbar: Undo / Redo next to the menus
  // SolidWorks keeps Undo and Redo on the Standard toolbar at the top left; here they sit right after the menus
  // (#std-toolbar in index.html). Built once by renderMenuBar; syncStdToolbar greys each button when its stack is
  // empty and is called from refreshTree, which every rebuild, undo, redo and rename reaches.
  var stdBuilt = false;
  function renderStdToolbar() {
    var u = $('std-undo'), r = $('std-redo');
    if (!u || !r || stdBuilt) return;
    stdBuilt = true;
    u.innerHTML = Icons('undo', 16); r.innerHTML = Icons('redo', 16);
    u.addEventListener('click', function () { if (App.undo.length) UI.undo(); });
    r.addEventListener('click', function () { if (App.redo.length) UI.redo(); });
    syncStdToolbar();
  }
  function syncStdToolbar() {
    var u = $('std-undo'), r = $('std-redo');
    if (!u || !r) return;
    var cu = App.undo.length > 0, cr = App.redo.length > 0;
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
  function setStyle(s) { App.view.style = s; UI.applyDisplayStyle(); refreshHud(); }
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

  // ------------------------------------------------------------------ heads-up view toolbar
  // Built once; later calls only move the active marks (the buttons stay under the mouse, tooltips do not flicker).
  // Drop-down items are made when the menu opens, so their check marks are always current.
  var hudActive = null;
  // r14/viewui14: the View Selector cube (UI.showViewSelector, ui-core.js) comes up with this menu; a pick in the menu closes both
  function hideVS() { if (UI.hideViewSelector) UI.hideViewSelector(); }
  function orientItems() { return Object.keys(UI.VIEWS).map(function (n) { return { label: n, action: function () { hideVS(); UI.setView(n); } }; }).concat([{ sep: true }, { label: 'Normal To (Ctrl+8)', action: function () { hideVS(); normalToSelection(); } }]); }
  function refreshHud() {
    var hud = $('hud');
    if (hudActive && hud.children.length) { hudActive.forEach(function (a) { var on = !!a[1](); if (a[0].classList.contains('active') !== on) a[0].classList.toggle('active', on); }); return; }
    hud.innerHTML = '';
    hudActive = [];
    function btn(icon, title, action, active, caret) {
      var b = el('button', { html: Icons(icon, 22) + (caret ? '<span class="caret">▾</span>' : ''), title: title, onclick: action });
      if (active) { hudActive.push([b, active]); if (active()) b.classList.add('active'); }
      hud.appendChild(b);
      return b;
    }
    function dd(icon, title, items) { var b = btn(icon, title, function () { var r = b.getBoundingClientRect(); showMenu(r.left, r.bottom + 2, items()); }, null, true); }
    btn('fit', 'Zoom to Fit (F)', UI.zoomToFit);
    btn('zoomArea', 'Zoom to Area', function () { App.zoomAreaMode = !App.zoomAreaMode; refreshHud(); }, function () { return App.zoomAreaMode; });
    btn('prevView', 'Previous View', UI.previousView);
    btn('section', 'Section View', UI.cmdSection, function () { return !!App.view.section; });
    hud.appendChild(el('span', { class: 'sep' }));
    var ob = btn('orient', 'View Orientation (Space)', function () { var r = ob.getBoundingClientRect(); showMenu(r.left, r.bottom + 2, orientItems()); if (UI.showViewSelector) UI.showViewSelector(); }, null, true);   // r14/viewui14: with the View Selector
    dd('display', 'Display Style', function () { return [['shadedEdges', 'Shaded With Edges'], ['shaded', 'Shaded'], ['hlr', 'Hidden Lines Removed'], ['hlv', 'Hidden Lines Visible'], ['wireframe', 'Wireframe']].map(function (s) { return { label: s[1], checked: App.view.style === s[0], action: function () { setStyle(s[0]); } }; }); });
    dd('hideshow', 'Hide/Show Items', function () { return [
      { label: 'Planes', checked: App.view.showPlanes, action: function () { App.view.showPlanes = !App.view.showPlanes; UI.updatePlanes(); } },
      { label: 'Origins', checked: App.view.showOrigin, action: function () { App.view.showOrigin = !App.view.showOrigin; UI.updateOrigin(); } },
      { label: 'Sketches', checked: App.view.showSketches, action: function () { App.view.showSketches = !App.view.showSketches; UI.updateSketches(); } },
      { label: 'Sketch grid', checked: App.view.showGrid, action: function () { App.view.showGrid = !App.view.showGrid; App.gridStale = true; } },
      { label: 'Snap to model', checked: App.view.snapModel !== false, action: function () { App.view.snapModel = App.view.snapModel === false; } }   // p9-modelsnap
    ]; });
    hud.appendChild(el('span', { class: 'sep' }));
    btn('appearance', 'Edit Appearance', function () { UI.openTaskPane('appearance'); });
    dd('scene', 'Apply Scene', function () { return [['gradient', 'Gradient'], ['plain', 'Plain'], ['dark', 'Dark']].map(function (s) { return { label: s[1], checked: App.view.bg === s[0], action: function () { setBg(s[0]); } }; }); });
    btn('settings', 'View Settings', function () { UI.openTaskPane('props'); });
  }
  // Space (ui-app.js): the View Orientation menu at the mouse pointer when it is over the graphics area, else under
  // the heads-up button
  var lastPointer = null;
  document.addEventListener('mousemove', function (e) { lastPointer = [e.clientX, e.clientY, e.target]; }, { passive: true });
  function showOrientationMenu() {
    var vp = UI.viewport || $('viewport');
    // r14/viewui14: Space again closes the View Selector and the menu (SolidWorks toggles it)
    if (UI.viewSelectorShown && UI.viewSelectorShown()) { hideVS(); closeMenus(); return; }
    if (UI.showViewSelector) UI.showViewSelector();
    if (lastPointer && vp && vp.contains(lastPointer[2])) { showMenu(lastPointer[0], lastPointer[1], orientItems()); return; }
    var b = $('hud').children[5];
    if (b) b.click();
  }

  // ------------------------------------------------------------------ modal
  function showModal(opts) {
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
  function cfgCopy(c) { return { name: String(c.name), values: JSON.parse(JSON.stringify(c.values || {})) }; }
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
      m.configurations.push({ name: chk.name, values: values });
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
      out.push({ name: n, values: vals });
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
      el('button', { id: 'cfg-activate', text: 'Show', title: 'Show Configuration: make the selected configuration active', onclick: function () { var n = cfgNeedSelection(); if (n) cfgRun(cfgActivate(n)); } })
    ]));
    var box = el('div', { id: 'cfg-list' });
    box.addEventListener('contextmenu', function (e) { if (e.target !== box) return; e.preventDefault(); showMenu(e.clientX, e.clientY, cfgMenu(null)); });
    if (!list.length) {
      var eqs = currentEquations().length;
      box.appendChild(el('div', { class: 'cfg-empty', text: eqs ? 'No configurations yet: the part uses its base equation values. Add… stores them as "Default" and starts a new configuration you can change in Tools ▸ Equations.' : 'Configurations are named sets of global-variable values. Add global variables in Tools ▸ Equations first, then Add… a configuration for each variant.' }));
    }
    list.forEach(function (c) {
      var isActive = c.name === active, vals = cfgValuesText(c.values);
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
      'Convert Entities', 'Mirror Entities', 'Add Relation', 'Construction Geometry'],
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
    for (var t = 0; t < tabs.length; t++) {
      var list = set[tabs[t]] || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i], cands = it && (it.stack ? [].concat.apply([], it.stack.map(function (x) { return x.items || [x]; })) : it.items || [it]);
        for (var j = 0; cands && j < cands.length; j++) {
          var c = cands[j], d = c && c.dyn && c.dyn();
          if (c && c.label && (flat(c.label) === name || (d && flat(d.label) === name))) return c;
        }
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
      var s = itemState(it), b = el('button', { class: 'sc-btn' + (s.active ? ' active' : ''), html: Icons(s.id, 20), 'aria-label': s.flat });
      b.dataset.icon = s.id;
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
  UI.showShortcutBar = showShortcutBar; UI.closeShortcutBar = closeShortcutBar;
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
  UI.fitWorkspace = fitWorkspace;   // r12/chrome12: panel widths and the CommandManager fitted to the window now
  UI.refreshRibbon = refreshRibbon; UI.setRibbonTab = setRibbonTab; UI.renderFmTabs = renderFmTabs; UI.setFmTab = setFmTab;
  UI.refreshTree = refreshTree; UI.startRename = startRename; UI.renderMenuBar = renderMenuBar; UI.syncStdToolbar = syncStdToolbar; UI.closeMenus = closeMenus; UI.showMenu = showMenu; UI.menuOpen = menuOpen;
  UI.refreshHud = refreshHud; UI.showOrientationMenu = showOrientationMenu; UI.showModal = showModal; UI.closeModal = closeModal; UI.modalDefault = modalDefault; UI.confirmDialog = confirmDialog; UI.promptDialog = promptDialog; UI.setStyle = setStyle; UI.setBg = setBg; UI.normalToSelection = normalToSelection;
  UI.showEquations = showEquations; UI.setEquations = setEquations; UI.normalizeEquations = normalizeEquations;
  UI.refreshConfigPanel = refreshConfigPanel;
  UI.configurations = { list: cfgList, active: cfgActiveName, add: cfgAdd, rename: cfgRename, remove: cfgRemove, activate: cfgActivate, set: cfgSet };
})(UI);
