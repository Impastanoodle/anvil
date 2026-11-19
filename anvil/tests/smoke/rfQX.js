  // --- rfQX (2026-11-19, head; user: "when i add a Sketch picture, when i change zoom the image disappears") --- the
  // zoom redraw (ui-core.js updateGrid -> updateSketches) empties the sketches group with disposeGroup, which popped the
  // children without clearing their parent; the picture group's frame check asked "is my parent still the sketches
  // group?", got yes, and never put the picture back. Looked for here in the group's children, not through the hook.
  (function () {
    function rfQXPng() {
      var cv = D.createElement('canvas'); cv.width = 64; cv.height = 32;
      var g = cv.getContext('2d'); g.fillStyle = '#c03020'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#2040c0'; g.fillRect(8, 8, 20, 12);
      return cv.toDataURL('image/png');
    }
    // the picture meshes really in the scene: under a group that is a child of the sketches group
    function rfQXShown() {
      var n = 0;
      UI.groups.sketches.children.forEach(function (c) { if (c.name === 'sketch-pictures') { assert(c.parent === UI.groups.sketches, 'the group knows its parent'); n += c.children.length; } });
      return n;
    }
    async function rfQXFrames(n) { for (var i = 0; i < (n || 4); i++) await new Promise(function (r) { W.requestAnimationFrame(function () { r(); }); }); await wait(30); }
    step('rfQX: a Sketch Picture stays on screen through zoom — wheel in and out, Zoom to Fit, a zoom redraw of the sketch (the scale changed by more than 1.3) and the same after Exit Sketch with the sketch shown', async function () {
      var errs0 = errors.length;
      await anvil.newPart(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      var f = UI.activeSketchFeature();
      f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 4, y1: 0, x2: 4, y2: 2 });
      UI.App.gridStale = true; UI.updateSketches(); await wait(20);
      var i = await UI.insertSketchPicture(rfQXPng(), 'print.png', { noPM: true });
      assert(i === 0 && f.pictures.length === 1, 'picture inserted');
      await rfQXFrames();
      assert(rfQXShown() === 1, 'shown after insert: ' + rfQXShown());
      // the zoom redraw itself: the scale moves by more than 1.3 and the next frame redraws the sketch lines
      var seen = [];
      for (var k = 0; k < 6; k++) {
        UI.zoomView(k < 3 ? 0.5 : 2); UI.App.gridStale = true; if (UI.requestRender) UI.requestRender();
        await rfQXFrames(6);
        seen.push(rfQXShown());
        assert(rfQXShown() === 1, 'gone after zoom step ' + (k + 1) + ' (scale ' + UI.cam.scale + '): ' + seen.join(' '));
      }
      // the wheel, as the user zooms
      var cvs = $('viewport').querySelector('canvas:not(#triad)') || $('viewport'), r = $('viewport').getBoundingClientRect();
      for (var w = 0; w < 8; w++) {
        cvs.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: w < 4 ? -360 : 360 }));
        await rfQXFrames(6);
        assert(rfQXShown() === 1, 'gone after wheel step ' + (w + 1) + ' (scale ' + UI.cam.scale + ')');
      }
      UI.setView('Front'); await rfQXFrames(6);
      assert(rfQXShown() === 1, 'gone after Zoom to Fit');
      assert(UI.sketchPictureObjects().length === 1, 'the test hook agrees');
      // out of the sketch: the unconsumed sketch is still shown, and so is its picture through a zoom
      UI.exitSketch(true); await idle(); await rfQXFrames();
      assert(UI.App.mode !== 'sketch', 'left the sketch');
      assert(rfQXShown() === 1, 'shown after Exit Sketch: ' + rfQXShown());
      UI.zoomView(0.4); UI.App.gridStale = true; if (UI.requestRender) UI.requestRender(); await rfQXFrames(6);
      assert(rfQXShown() === 1, 'gone after a zoom outside the sketch');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'shown through ' + (seen.length + 8 + 2) + ' zoom changes';
    });
  })();
