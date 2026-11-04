// rfHR: a narrowed PropertyManager as Mastercam's (user 2026-11-04, screenshots of Mastercam's Rectangle panel next to
// Anvil's): every label stays on one line and the value boxes give up their width; check box / radio texts end in an
// ellipsis; an icon row wraps its buttons under its label; nothing scrolls sideways. The default width is unchanged.
(function () {
  step('rfHR: narrowing the PropertyManager keeps labels on one line (Mastercam), shrinks the value boxes, wraps icon rows and never scrolls sideways; the default panel keeps 136 px boxes in one column', async function () {
    var main = $('left').parentElement, cols0 = main.style.gridTemplateColumns;
    try {
      await anvil.newPart(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      UI.setTool('crect'); await idle();
      assert(UI.hasPM() && UI.pmTitle() === 'Rectangle', 'the Rectangle PropertyManager: ' + (UI.hasPM() && UI.pmTitle()));
      var wraps = Array.prototype.slice.call(D.querySelectorAll('#pm .pm-row.pm-field .pm-num-wrap'));
      assert(wraps.length >= 8, 'the corner value boxes: ' + wraps.length);
      var lefts = wraps.map(function (w) { return Math.round(w.getBoundingClientRect().left); });
      assert(wraps.every(function (w) { return Math.abs(w.getBoundingClientRect().width - 136) < 1; }) && lefts.every(function (x) { return x === lefts[0]; }), 'default panel: 136 px boxes in one column: ' + lefts.join(','));
      main.style.gridTemplateColumns = '150px 1fr 35px';
      await wait(50);
      var pm = $('pm');
      assert(pm.scrollWidth <= pm.clientWidth + 1, 'no sideways scroll: ' + pm.scrollWidth + ' > ' + pm.clientWidth);
      var labels = Array.prototype.slice.call(D.querySelectorAll('#pm .pm-row.pm-field:not(.pm-row-static) > label, #pm .pm-row.check > label'));
      var tall = labels.filter(function (l) { return l.offsetParent && l.getBoundingClientRect().height > 22 && !l.querySelector('.static'); });
      assert(!tall.length, 'labels on one line: ' + tall.map(function (l) { return l.textContent + ' ' + l.getBoundingClientRect().height; }).join(' | '));
      var corner = wraps[0].parentNode.querySelector('label');
      assert(corner.scrollWidth <= corner.clientWidth + 1, '"' + corner.textContent + '" shown whole: ' + corner.scrollWidth + ' / ' + corner.clientWidth);
      assert(wraps[0].getBoundingClientRect().width < 100, 'the value box gave up its width: ' + wraps[0].getBoundingClientRect().width);
      var icons = D.querySelector('#pm .pm-row-icons .pm-icons');
      assert(!icons || icons.getBoundingClientRect().right <= pm.getBoundingClientRect().right + 1, 'the icon buttons wrap inside the panel');
      return 'box ' + Math.round(wraps[0].getBoundingClientRect().width) + ' px at 150 px';
    } finally { main.style.gridTemplateColumns = cols0; UI.setTool('select'); if (UI.exitSketch) UI.exitSketch(true); await idle(); }
  });

  // (user 2026-11-04, Boss-Extrude narrowed: "Start" broke as St / ar / t and End condition read "B…")
  step('rfHR: Boss-Extrude narrowed: "Start" stays whole, a drop-down list keeps 84 px (else drops under its label, right-aligned) and the Reverse Direction button stays inside; at the default width the list is 136 px with the button 4 px before it', async function () {
    var main = $('left').parentElement, cols0 = main.style.gridTemplateColumns;
    try {
      await anvil.newPart(); await idle();
      await anvil.run("p.sketch('Front').rect(0, 0, 60, 40)"); await idle();
      UI.cmdExtrude(); await idle(); await wait(30);
      assert(UI.pmTitle() === 'Boss-Extrude', 'Boss-Extrude open: ' + UI.pmTitle());
      var pm = $('pm'), endRow = D.querySelector('#pm .pm-row-select.pm-has-rev'), sel = endRow.querySelector('select'), rev = endRow.querySelector('.pm-rev');
      var s = sel.getBoundingClientRect(), r = rev.getBoundingClientRect();
      assert(Math.abs(s.width - 136) < 1 && Math.abs(s.left - 4 - r.right) < 1.5 && Math.abs(s.top - r.top) < 6, 'default: End condition 136 px, the button 4 px before it: ' + Math.round(s.width) + ' / ' + Math.round(s.left - r.right));
      var out = [];
      for (var w of [230, 200, 160, 150]) {
        main.style.gridTemplateColumns = w + 'px 1fr 35px'; await wait(50);
        var p = pm.getBoundingClientRect(), start = D.querySelector('#pm .pm-row-static > label');
        assert(start.getBoundingClientRect().height <= 22, w + ' px: "Start" on one line: ' + start.getBoundingClientRect().height);
        assert(pm.scrollWidth <= pm.clientWidth + 1, w + ' px: no sideways scroll');
        Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-row-select select'), function (x) {
          var b = x.getBoundingClientRect();
          if (!x.offsetParent) return;
          assert(b.width >= 83.5 && b.right <= p.right + 1, w + ' px: a list at least 84 px and inside: ' + Math.round(b.width) + ' / ' + Math.round(b.right) + ' > ' + Math.round(p.right));
        });
        r = rev.getBoundingClientRect();
        assert(r.right <= p.right + 1, w + ' px: the Reverse Direction button inside the panel');
        out.push(w + ':' + Math.round(sel.getBoundingClientRect().width));
      }
      return out.join(' ');
    } finally { main.style.gridTemplateColumns = cols0; if (UI.hasPM()) UI.closePM(); await idle(); }
  });
})();
