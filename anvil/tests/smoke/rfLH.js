// rfLH (2026-11-11, lane profiles): interface profiles (ui-profiles.js). The user: "a setting that rearranges the ui
// to be similar to different softwares i.e. click this setting if you are used to mastercam click this setting if you
// are used to solidworks". The command registry (UI.Commands: one stable cmd per ribbon command, a snapshot so a rename
// is a decision), SolidWorks' ribbon byte for byte before and after a Mastercam round trip, Mastercam chosen in Tools ▸
// Options by mouse (its tabs, Line Endpoints draws a line, Solids ▸ Extrude builds the same boss, the status bar names
// it), its keys (a rebound key runs, the SolidWorks key it took does not, others still work), every command reachable,
// the choice kept over a reload, and a right-docked FeatureManager with picking still right. The profile is reset.
(function () {
  // the command ids of each document type, in ribbon order (a change here is a decision: tests, profiles and keys use them)
  var RFLH_IDS = {
    part: 'extrude,revolve,sweep,loft,boundary,cut,holeWizard,revolveCut,sweptCut,loftedCut,boundaryCut,fillet,chamfer,lpattern,cpattern,mirror,shell,draft,intersect,rib,wrap,plane,refAxis,csys,refPoint,splitLine,projCurve,compositeCurve,xyzCurve,refPtCurve,helix,instant,' +
      'sketch,sketch3d,sketch3dPlane,dim,horizDim,vertDim,ordinateDim,ordinateH,ordinateV,chamferDim,angRunDim,pathLengthDim,autodim,line,centerline,midline,parallelLine,tangentLine,perpLine,bisectorLine,rect,crect,rect3,crect3,parallelogram,slot,cslot,aslot3,aslot,circle,pcircle,tangentCircle,arc,tarc,arc3,polygon,spline,styleSpline,eqnCurve,ellipse,pellipse,parabola,conic,skFillet,skChamfer,text,point,trim,extend,splitEnt,joinEnt,convert,intersectCurve,offset,offsetSurface,mirrorEnt,dynMirror,sketchPattern,cSketchPattern,moveEnt,copyEnt,rotateEnt,scaleEnt,stretchEnt,closeArc,relations,addRelation,fullyDefine,repairSketch,' +
      'qs-point,qs-center,qs-midpoint,qs-quadrant,qs-intersection,qs-nearest,qs-tangent,qs-perpendicular,qs-parallel,qs-hvLines,qs-hvPoints,qs-length,qs-grid,qs-angle,rapidSketch,instant2D,shadedContours,construction,sketchPicture,levels,sketchDxf,importDxf,checkSketch,' +
      'measure,mass,sectionProps,section,faceDxf,check,sensor,zebra,draftAnalysis,clearance,undercut,thickness,compareDocs,perfEval,costing,' +
      'flange,convertSM,loftedBend,sweptFlange,bend,miter,hem,jog,sketchedBend,crossBreak,breakCorner,closedCorner,weldedCorner,cornerRelief,ftDimple,ftExtrudedHole,ftLouver,ftLance,ftRib,hole,vent,unfold,fold,flatten,noBends,insertBends,rip,flatDxf,' +
      'tDynamic,tTranslate,tTranslatePlane,tRotate,tProject,tMoveOrigin,tMirror,tRoll,tOffsetEntity,tOffsetChains,tNesting,tRectArray,tDistribute,tStretch,tScale,' +
      'vZoomFit,zoomArea,prevView,vFront,vBack,vLeft,vRight,vTop,vBottom,vIso,vNormalTo,dsShadedEdges,dsShaded,dsHLR,dsHLV,dsWireframe,appearance,scene,vBgGradient,vBgPlain,vBgDark,vTheme,vPlanes,vOrigins,vSketches,vGrid,vRegions,vSketchDims,showEndpoints,vSnapModel,vFeatureTree,vLevels,filter',
    assembly: 'insertComponent,mate,lpatternComp,cpatternComp,mirrorComp,moveComponent,rotateComponent,hideshow,explode,smartFasteners,bom,instant,fix,float,measure,mass,sectionProps,section,interference,clearance,holeAlignment,check,zebra,draftAnalysis,' +
      'vZoomFit,zoomArea,prevView,vFront,vBack,vLeft,vRight,vTop,vBottom,vIso,vNormalTo,dsShadedEdges,dsShaded,dsHLR,dsHLV,dsWireframe,appearance,scene,vBgGradient,vBgPlain,vBgDark,vTheme,vPlanes,vOrigins,vSketches,vGrid,vRegions,vSketchDims,showEndpoints,vSnapModel,vFeatureTree,filter',
    drawing: 'std3view,modelView,relativeView,projView,auxView,sectionView,removedSection,detailView,brokenOut,breakView,cropView,dim,horizDim,vertDim,baselineDim,ordinateDim,ordinateH,ordinateV,angRunDim,chamferDim,pathLengthDim,modelItems,balloon,autoBalloon,magLine,stackBalloon,holeCallout,note,multiJogLeader,flagNote,' +
      'surfaceFinish,datumFeature,gtol,weldSymbol,revisionSymbol,revisionCloud,datumTarget,cosmeticThread,dowelPin,bom,revTable,generalTable,holeTable,bendTable,punchTable,centerMark,centerline,areaHatch,docProps,line,rect,circle,arc,spline,point,text,relHorizontal,relVertical,relCoincident,lineFormat,hideShowEdges,' +
      'editSheetFormat,fmtLine,fmtNote,saveSheetFormat,saveTemplate,drawingTemplates,resetFormat'
  };
  var RFLH_DOCS = ['part', 'assembly', 'drawing'];
  var RFLH_BOX = "p.sketch('Front').rect(0, 0, 60, 40).extrude(20)";
  function rfLHTabs() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }); }
  function rfLHTabNames() { return rfLHTabs().map(function (t) { return t.textContent; }); }
  // a real click on a tab of the CommandManager
  async function rfLHTab(name) {
    var t = rfLHTabs().filter(function (x) { return x.textContent === name; })[0];
    assert(t, 'no tab ' + name + ' (have ' + rfLHTabNames().join(', ') + ')');
    t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    t.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    t.click(); await wait(30);
  }
  // the button of the CommandManager whose name is `label` (a flyout's face or a plain / stacked button)
  function rfLHBtn(label) {
    return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === label; })[0] || null;
  }
  function rfLHClickBtn(label) {
    var b = rfLHBtn(label);
    assert(b, 'no ribbon button ' + label + ' on ' + UI.App.ribbonTab);
    assert(!b.disabled, label + ' is greyed');
    b.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    b.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    b.click();
  }
  // every tab of the open document: the tab strip and each tab's buttons as HTML (tab clicks by mouse)
  async function rfLHCaptureDoc() {
    var out = { tabs: $('ribbon-tabs').innerHTML, by: {} }, back = UI.App.ribbonTab;
    var names = rfLHTabNames();
    for (var i = 0; i < names.length; i++) { await rfLHTab(names[i]); out.by[names[i]] = $('ribbon-buttons').innerHTML; }
    await rfLHTab(back);
    return out;
  }
  // part, sketch, assembly and drawing
  async function rfLHCapture() {
    var cap = {};
    await anvil.newPart(); await idle();
    await anvil.run(RFLH_BOX); await idle();
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    cap.part = await rfLHCaptureDoc();
    await UI.newSketchOnPlane('Top'); await idle(); await wait(30);
    assert(UI.App.mode === 'sketch', 'no sketch');
    cap.sketch = await rfLHCaptureDoc();
    UI.exitSketch(); await idle();
    UI.makeDrawing({ fresh: true }); await wait(300); await idle();
    assert(UI.drawingActive(), 'no drawing');
    cap.drawing = await rfLHCaptureDoc();
    UI.closeDrawing(); await idle();
    await anvil.newAssembly(); await idle();
    cap.assembly = await rfLHCaptureDoc();
    await anvil.newPart(); await idle();
    return cap;
  }
  function rfLHSame(a, b) {
    var diff = [];
    Object.keys(a).forEach(function (doc) {
      if (a[doc].tabs !== b[doc].tabs) diff.push(doc + ' tab strip');
      Object.keys(a[doc].by).forEach(function (t) { if (a[doc].by[t] !== (b[doc].by || {})[t]) diff.push(doc + ' ' + t); });
      if (Object.keys(a[doc].by).join() !== Object.keys(b[doc].by).join()) diff.push(doc + ' tabs ' + Object.keys(b[doc].by).join());
    });
    return diff;
  }
  function rfLHKey(key, mods) {
    var ev = new W.KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}));
    (D.activeElement && D.activeElement !== D.body ? D.activeElement : D.body).dispatchEvent(ev);
    return ev;
  }
  function rfLHSpy(name) {
    var orig = UI[name], calls = [];
    UI[name] = function () { calls.push(Array.prototype.slice.call(arguments)); return orig.apply(this, arguments); };
    return { calls: calls, restore: function () { UI[name] = orig; } };
  }
  function rfLHEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  async function rfLHClick(p) { rfLHEv('mousemove', p); await wait(10); rfLHEv('mousedown', p, $('viewport')); rfLHEv('mouseup', p); await idle(); await wait(20); }
  function rfLHScr(uv) { return UI.worldToScreen(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfLHLeaves(list) { return UI.ribbonLeaves(list).map(function (it) { return UI.Commands.cmdOf(it); }); }
  var rfLH0 = null;

  step('rfLH: the command registry: one stable cmd per command on every document type, one SolidWorks name per cmd, the id list as pinned; get() / list() fields; the Mastercam profile names only commands that exist', async function () {
    anvil.profile('solidworks');
    await anvil.newPart(); await idle();
    var msg = [];
    RFLH_DOCS.forEach(function (dt) {
      var ids = UI.Commands.list(dt).map(function (c) { return c.cmd; }), seen = {};
      ids.forEach(function (c) { assert(!seen[c], dt + ': ' + c + ' twice in list()'); seen[c] = 1; });
      var names = {};
      UI.Commands.occurrences(dt).forEach(function (o) { assert(!names[o.cmd] || names[o.cmd] === o.label, dt + ': cmd ' + o.cmd + ' names two commands: ' + names[o.cmd] + ' / ' + o.label); names[o.cmd] = o.label; });
      assert(ids.join(',') === RFLH_IDS[dt], dt + ' ids changed:\n' + ids.join(','));
      msg.push(dt + ' ' + ids.length);
    });
    var e = UI.Commands.get('extrude', 'part');
    assert(e && e.cmd === 'extrude' && e.id === 'extrude' && e.label === 'Extruded Boss/Base' && e.tab === 'Features' && e.docType === 'part' && typeof e.run === 'function', 'get(extrude) ' + JSON.stringify(e));
    assert(UI.Commands.get('sweptCut', 'part').label === 'Swept Cut' && UI.Commands.get('sweptCut', 'part').id === 'sweep', 'Swept Cut keeps its icon id');
    assert(UI.Commands.get('skFillet', 'part').label === 'Sketch Fillet' && UI.Commands.get('fillet', 'part').label === 'Fillet', 'Fillet / Sketch Fillet');
    assert(UI.Commands.get('flatDxf', 'part').tab === 'Sheet Metal' && UI.Commands.get('mate', 'part') === null && UI.Commands.get('mate', 'assembly').tab === 'Assembly', 'tabs / document types');
    var lst = UI.Profiles.list();
    assert(lst[0].id === 'solidworks' && lst.some(function (p) { return p.id === 'mastercam' && p.name === 'Mastercam' && p.note; }), 'profiles ' + JSON.stringify(lst));
    var bad = UI.Profiles.check('mastercam');
    assert(!bad.length, 'Mastercam names unknown commands: ' + bad.join('; '));
    assert(UI.Profiles.active() === 'solidworks' && anvil.profile() === 'solidworks', 'not SolidWorks at the start');
    return msg.join(', ') + ' cmds';
  });

  step('rfLH: (a) the SolidWorks CommandManager of every tab of a part, a sketch, a drawing and an assembly is captured (tab clicks by mouse) before any other profile is set', async function () {
    rfLH0 = await rfLHCapture();
    var n = 0; Object.keys(rfLH0).forEach(function (d) { n += Object.keys(rfLH0[d].by).length; });
    assert(Object.keys(rfLH0.part.by).join() === 'Features,Sketch,Evaluate,Sheet Metal,Transform,View', 'part tabs ' + Object.keys(rfLH0.part.by).join());
    return n + ' tabs captured';
  });

  step('rfLH: (b) Mastercam chosen in Tools > Options by mouse: the part tabs are Mastercam\'s, the status bar names it; Wireframe > Line Endpoints draws a line in a sketch and the sketch brings Wireframe forward; Solids > Extrude builds the same boss as Features > Extruded Boss/Base', async function () {
    await anvil.newPart(); await idle();
    var tools = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (li) { return /^Tools/.test(li.textContent.trim()); })[0];
    assert(tools, 'no Tools menu');
    tools.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    var row = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /^\s*Options…/.test(m.textContent) && m.textContent.indexOf('▸') < 0; })[0];
    assert(row, 'no Tools > Options… row');
    row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    await wait(60);
    var sec = D.querySelector('[data-role="interface-profiles"]');
    assert(sec && !$('tp-panel').hidden, 'Options has no Interface group');
    assert(/Lay out Anvil like/.test(sec.textContent), 'Interface wording: ' + sec.textContent.slice(0, 80));
    var rows = Array.prototype.map.call(sec.querySelectorAll('label[data-profile]'), function (l) { return l.getAttribute('data-profile'); });
    assert(rows[0] === 'solidworks' && /SolidWorks \(default\)/.test(sec.querySelector('label[data-profile="solidworks"]').textContent) && rows.indexOf('mastercam') > 0, 'rows ' + rows);
    assert(sec.querySelector('input[data-profile="solidworks"]').checked, 'SolidWorks not checked');
    var mc = sec.querySelector('input[data-profile="mastercam"]');
    mc.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    mc.click(); await wait(60);
    assert(UI.Profiles.active() === 'mastercam', 'profile ' + UI.Profiles.active());
    assert(rfLHTabNames().join() === 'Wireframe,Solids,Sheet Metal,Drafting,Transform,View,More', 'Mastercam tabs ' + rfLHTabNames().join());
    var chip = D.querySelector('#status-right .st-profile');
    assert(chip && chip.textContent === 'Mastercam', 'status bar ' + $('status-right').textContent);
    try { assert(W.localStorage.getItem(UI.Profiles.storageKey) === 'mastercam', 'not kept'); } catch (e) { if (/kept/.test(e.message)) throw e; }
    // Wireframe: the line tool under its Mastercam name, captions under its groups
    await rfLHTab('Wireframe');
    var le = rfLHBtn('Line Endpoints');
    assert(le, 'no Line Endpoints on Wireframe');
    await wait(80);
    var caps = Array.prototype.map.call(D.querySelectorAll('#ribbon .rb-captions > *'), function (c) { return c.textContent; });
    assert(['Points', 'Lines', 'Arcs', 'Shapes', 'Modify'].every(function (g) { return caps.indexOf(g) >= 0; }), 'group captions ' + caps.join(', '));
    await UI.newSketchOnPlane('Front'); await idle(); await wait(30);
    assert(UI.App.ribbonTab === 'Wireframe', 'the sketch brought ' + UI.App.ribbonTab + ' forward');
    rfLHClickBtn('Line Endpoints'); await wait(20);
    assert(UI.App.tool === 'line', 'tool ' + UI.App.tool);
    await rfLHClick(rfLHScr([5, 5])); await rfLHClick(rfLHScr([35, 5]));
    rfLHKey('Escape'); await wait(20);
    var ents = UI.activeSketchFeature().entities.filter(function (x) { return x.t === 'line'; });
    assert(ents.length === 1, 'lines drawn: ' + ents.length);
    var ln = ents[0];
    near(Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1), 30, 1.5, 'line length');
    UI.exitSketch(); await idle();
    assert(UI.App.ribbonTab === 'Solids', 'after the sketch: ' + UI.App.ribbonTab);
    // the same boss from Solids > Extrude and from SolidWorks' Features > Extruded Boss/Base
    async function boss(tab, label) {
      await anvil.newPart(); await idle();
      await anvil.run("p.sketch('Front').rect(0, 0, 60, 40)"); await idle();
      var sk = UI.App.model.features[UI.App.model.features.length - 1];
      UI.App.sel = { kind: 'feature', id: sk.id }; UI.refreshTree();
      await rfLHTab(tab);
      rfLHClickBtn(label); await wait(40);
      assert(UI.hasPM(), label + ': no PropertyManager');
      await UI.pmOK(); await idle();
      var f = UI.App.model.features[UI.App.model.features.length - 1];
      assert(f.type === 'extrude' && !f.cut, label + ' made ' + f.type);
      return anvil.summary().volume;
    }
    var vM = await boss('Solids', 'Extrude');
    assert(vM > 0, 'no boss');
    anvil.profile('solidworks');
    var vS = await boss('Features', 'Extruded Boss/Base');
    anvil.profile('mastercam');
    near(vM, vS, 1e-6, 'Mastercam Extrude vs SolidWorks Extruded Boss/Base volume');
    return 'tabs ' + rfLHTabNames().join(' | ') + '; line 30, boss ' + vM;
  });

  step('rfLH: switching the profile keeps the open document, the selection and a running command (its PropertyManager stays open and still applies)', async function () {
    anvil.profile('solidworks');
    await anvil.newPart(); await idle(); await anvil.run(RFLH_BOX); await idle();
    var name = UI.App.model.name, nf = UI.App.model.features.length;
    var top = faceWithNormal([0, 0, 1]);
    UI.App.sel = { kind: 'face', index: top }; UI.updateHighlights();
    UI.cmdShell(); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Shell', 'no Shell PM: ' + (UI.hasPM() && UI.pmTitle()));
    anvil.profile('mastercam'); await wait(40);
    assert(UI.hasPM() && UI.pmTitle() === 'Shell', 'the switch closed the command');
    assert(UI.App.model.name === name && UI.App.model.features.length === nf, 'document changed');
    await UI.pmOK(); await idle();
    var f = UI.App.model.features[UI.App.model.features.length - 1];
    assert(f.type === 'shell', 'shell not applied: ' + f.type);
    UI.App.sel = { kind: 'face', index: faceWithNormal([0, 0, 1]) }; UI.updateHighlights();
    var s0 = JSON.stringify(UI.App.sel);
    anvil.profile('solidworks'); await wait(20);
    assert(JSON.stringify(UI.App.sel) === s0, 'selection lost');
    anvil.profile('mastercam'); await wait(20);
    assert(JSON.stringify(UI.App.sel) === s0, 'selection lost (2)');
    return 'Shell PM kept across the switch and applied; selection kept';
  });

  step('rfLH: (c) Mastercam keys: Alt+F1 fits, Alt+2 is Front, F9 shows / hides the origin and no longer hides the FeatureManager (SolidWorks F9); untouched SolidWorks keys (Z, Ctrl+1) still work; tooltips and menus show the active key', async function () {
    assert(UI.Profiles.active() === 'mastercam', 'not Mastercam');
    await anvil.newPart(); await idle(); await anvil.run(RFLH_BOX); await idle();
    var fit = rfLHSpy('zoomToFit'), view = rfLHSpy('setView'), zoom = rfLHSpy('zoomView');
    try {
      rfLHKey('F1', { altKey: true }); await wait(20);
      assert(fit.calls.length === 1, 'Alt+F1 did not fit (' + fit.calls.length + ')');
      rfLHKey('2', { altKey: true }); await wait(20);
      assert(view.calls.length && view.calls[view.calls.length - 1][0] === 'Front', 'Alt+2: ' + JSON.stringify(view.calls));
      var fmHidden = UI.featureManagerHidden(), origin = !!UI.App.view.showOrigin;
      rfLHKey('F9'); await wait(30);
      assert(UI.featureManagerHidden() === fmHidden, 'F9 still toggles the FeatureManager');
      assert(!!UI.App.view.showOrigin === !origin, 'F9 did not toggle the origin');
      rfLHKey('F9'); await wait(30);
      assert(!!UI.App.view.showOrigin === origin, 'F9 back');
      rfLHKey('z'); await wait(10);
      assert(zoom.calls.length === 1 && zoom.calls[0][0] === 1.25, 'Z: ' + JSON.stringify(zoom.calls));
      rfLHKey('PageDown'); await wait(10);
      assert(zoom.calls.length === 2 && zoom.calls[1][0] === 1.25, 'PageDown (Mastercam: zooms out, as Z; lane profnav2 fixed the swapped zoomIn / zoomOut): ' + JSON.stringify(zoom.calls));
      var n = view.calls.length;
      rfLHKey('1', { ctrlKey: true }); await wait(20);
      assert(view.calls.length === n + 1 && view.calls[n][0] === 'Front', 'Ctrl+1: ' + JSON.stringify(view.calls.slice(n)));
      rfLHKey('f'); await wait(10);
      assert(fit.calls.length === 2, 'F (not taken by Mastercam) no longer fits');
    } finally { fit.restore(); view.restore(); zoom.restore(); }
    // displayed keys: the View tab's Zoom to Fit (Fit) tooltip, View menu rows
    assert(UI.activeKey('vZoomFit', 'F') === 'Alt+F1' && UI.activeKey('fit') === 'Alt+F1', 'Fit key shown ' + UI.activeKey('vZoomFit', 'F'));
    assert(UI.activeKey('vFront', 'Ctrl+1') === 'Alt+2', 'Front key shown ' + UI.activeKey('vFront', 'Ctrl+1'));
    assert(UI.menuKeyText('F') === 'Alt+F1' && UI.menuKeyText('F9') === '' && UI.menuKeyText('Ctrl+S') === 'Ctrl+S', 'menu keys ' + [UI.menuKeyText('F'), UI.menuKeyText('F9'), UI.menuKeyText('Ctrl+S')].join(' / '));
    await rfLHTab('View');
    var fitItem = UI.ribbonLeaves(UI.profileRibbon('part').View).filter(function (it) { return UI.Commands.cmdOf(it) === 'vZoomFit'; })[0];
    var st = UI.ribbonItemState(fitItem);
    assert(st.flat === 'Fit' && st.tip.key === 'Alt+F1', 'Fit button ' + st.flat + ' key ' + st.tip.key);
    var rowsV = menuRows('Zoom to Fit');
    var keyTxt = rowsV.length ? (rowsV[0].row.querySelector('.key') || {}).textContent : null;
    if (UI.closeMenus) UI.closeMenus();
    assert(!rowsV.length || keyTxt === 'Alt+F1', 'View menu Zoom to Fit key ' + keyTxt);
    // SolidWorks: the same keys as before
    anvil.profile('solidworks');
    assert(UI.activeKey('vZoomFit', 'F') === 'F' && UI.menuKeyText('F9') === 'F9' && UI.keys.actionFor({ key: 'F9' }) === 'toggleTree', 'SolidWorks keys back');
    anvil.profile('mastercam');
    return 'Alt+F1 fit, Alt+2 Front, F9 origin, Z / Ctrl+1 / F kept; menu ' + keyTxt;
  });

  step('rfLH: (d) every command of every document type is on some tab under every profile (More holds what a profile does not place, by SolidWorks tab); the Mastercam drawing has Drafting and the assembly keeps its tabs with Mastercam names', async function () {
    var msg = [];
    for (var pi = 0; pi < UI.Profiles.list().length; pi++) {
      var pid = UI.Profiles.list()[pi].id;
      anvil.profile(pid);
      RFLH_DOCS.forEach(function (dt) {
        var set = UI.profileRibbon(dt), have = {};
        if (set) Object.keys(set).forEach(function (t) { rfLHLeaves(set[t]).forEach(function (c) { have[c] = t; }); });
        else UI.Commands.list(dt).forEach(function (c) { have[c.cmd] = c.tab; });
        var missing = UI.Commands.list(dt).filter(function (c) { return !have[c.cmd]; }).map(function (c) { return c.cmd; });
        assert(!missing.length, pid + ' ' + dt + ': unreachable ' + missing.join(', '));
        msg.push(pid + ' ' + dt + (set ? ' ' + Object.keys(set).join('/') : ' SolidWorks tabs'));
      });
    }
    anvil.profile('mastercam');
    var part = UI.profileRibbon('part');
    var moreGroups = part.More.filter(function (it) { return it.group; }).map(function (it) { return it.group; });
    assert(moreGroups.indexOf('Evaluate') >= 0 && moreGroups.indexOf('Sketch') >= 0, 'More groups ' + moreGroups.join(', '));
    assert(Object.keys(UI.profileRibbon('drawing')).join() === 'View Layout,Drafting,Sketch,Sheet Format', 'drawing tabs ' + Object.keys(UI.profileRibbon('drawing')).join());
    var asm = UI.profileRibbon('assembly');
    assert(Object.keys(asm).join() === 'Assembly,Evaluate,View', 'assembly tabs ' + Object.keys(asm).join());
    assert(UI.ribbonLeaves(asm.Evaluate).some(function (it) { return UI.ribbonItemState(it).flat === 'Analyze Distance'; }), 'assembly Measure not renamed');
    // the drawing document: Annotation (SolidWorks) lands on Drafting
    await anvil.newPart(); await idle(); await anvil.run(RFLH_BOX); await idle();
    UI.makeDrawing({ fresh: true }); await wait(300); await idle();
    try {
      assert(rfLHTabNames().join() === 'View Layout,Drafting,Sketch,Sheet Format', 'drawing tab strip ' + rfLHTabNames().join());
      UI.setRibbonTab('Annotation'); await wait(20);
      assert(UI.App.ribbonTab === 'Drafting', 'Annotation -> ' + UI.App.ribbonTab);
      assert(rfLHBtn('Smart Dimension'), 'no Smart Dimension on Drafting');
    } finally { UI.closeDrawing(); await idle(); }
    return msg.length + ' profile / document pairs; More: ' + moreGroups.join(', ');
  });

  step('rfLH: (e) the profile survives a reload (a second app frame starts in Mastercam); anvil.profile(\'solidworks\') puts the SolidWorks CommandManager back exactly as captured, the status bar chip and the stored choice go', async function () {
    assert(UI.Profiles.active() === 'mastercam', 'not Mastercam');
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-2000px;top:0;width:1200px;height:700px;border:0;';
    f.src = '../index.html';
    document.body.appendChild(f);
    var got = null;
    try {
      var t0 = Date.now(), w2 = null;
      while (Date.now() - t0 < 25000) {
        await wait(200);
        w2 = f.contentWindow;
        if (w2 && w2.UI && w2.UI.Profiles && w2.document.querySelector('#ribbon-tabs .rtab') && w2.UI.Profiles.active() === 'mastercam') break;
      }
      assert(w2 && w2.UI && w2.UI.Profiles, 'the second frame did not boot');
      got = Array.prototype.map.call(w2.document.querySelectorAll('#ribbon-tabs .rtab:not(.off)'), function (t) { return t.textContent; }).join();
      assert(w2.UI.Profiles.active() === 'mastercam' && got === 'Wireframe,Solids,Sheet Metal,Drafting,Transform,View,More', 'reloaded: ' + w2.UI.Profiles.active() + ' ' + got);
      assert(w2.document.querySelector('#status-right .st-profile'), 'reloaded status bar');
    } finally { f.src = 'about:blank'; await wait(50); f.remove(); }
    assert(anvil.profile('solidworks') === 'solidworks', 'anvil.profile(solidworks)');
    assert(!D.querySelector('#status-right .st-profile'), 'status chip left');
    var kept = 'x'; try { kept = W.localStorage.getItem(UI.Profiles.storageKey); } catch (e) { kept = null; }
    assert(kept === null, 'stored choice left: ' + kept);
    var now = await rfLHCapture();
    var diff = rfLHSame(rfLH0, now);
    assert(!diff.length, 'SolidWorks ribbon differs after Mastercam -> SolidWorks: ' + diff.join('; '));
    return 'reloaded ' + got + '; SolidWorks identical on ' + Object.keys(now).length + ' documents';
  });

  step('rfLH: (f) a profile with dock.tree right puts the FeatureManager right of the graphics area, picking a face still selects it, the edge drag widens it to the left; back on SolidWorks it is on the left', async function () {
    UI.Profiles.register({ id: 'rflh-right', name: 'Right dock (test)', dock: { tree: 'right' } });
    try {
      await anvil.newPart(); await idle(); await anvil.run(RFLH_BOX); await idle();
      anvil.profile('rflh-right'); await wait(80);
      var L = $('left').getBoundingClientRect(), V = $('viewport').getBoundingClientRect();
      assert(L.left >= V.right - 1 && L.width > 100, 'tree at ' + L.left + ' viewport ends ' + V.right);
      assert(V.left < 30, 'viewport starts at ' + V.left);
      UI.setView('Front'); UI.zoomToFit(); await wait(400); await idle();
      var c = UI.worldToScreen([30, 20, 20]);
      UI.App.sel = null; UI.updateHighlights();
      await rfLHClick(c);
      var sel = UI.App.sel;
      assert(sel && sel.kind === 'face', 'pick: ' + JSON.stringify(sel));
      var face = UI.App.mesh.faces[sel.index];
      assert(face && Math.abs(face.normal[2] - 1) < 1e-6, 'picked face normal ' + (face && face.normal));
      // the splitter on its left edge: dragging left widens it
      var sp = $('left').querySelector('.split'), sr = sp.getBoundingClientRect(), w0 = L.width;
      assert(Math.abs(sr.left + sr.width / 2 - L.left) < 6, 'splitter at ' + sr.left + ' tree at ' + L.left);
      var x = sr.left + sr.width / 2, y = sr.top + 200;
      sp.dispatchEvent(new W.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: x, clientY: y }));
      sp.dispatchEvent(new W.PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: x - 40, clientY: y }));
      sp.dispatchEvent(new W.PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: x - 40, clientY: y }));
      await wait(40);
      var w1 = $('left').getBoundingClientRect().width;
      near(w1 - w0, 40, 2, 'widened by the left-edge drag');
      sp.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await wait(40);
    } finally {
      anvil.profile('solidworks'); await wait(60);
      UI.Profiles.unregister('rflh-right');
    }
    var L2 = $('left').getBoundingClientRect(), V2 = $('viewport').getBoundingClientRect();
    assert(L2.right <= V2.left + 1, 'tree back on the left: ' + L2.right + ' / ' + V2.left);
    return 'tree right ' + Math.round(L.left) + ' px, face picked, drag 40 px';
  });

  step('rfLH: reset (SolidWorks profile, nothing stored, test profile gone)', async function () {
    anvil.profile('solidworks');
    try { W.localStorage.removeItem(UI.Profiles.storageKey); } catch (e) { }
    assert(UI.Profiles.active() === 'solidworks' && !UI.Profiles.get('rflh-right'), 'not reset');
    assert(UI.treeDock() === 'left', 'dock ' + UI.treeDock());
  });
})();
