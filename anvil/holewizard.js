// holewizard.js — Hole Wizard: standard holes as one 'hole' feature (Counterbore, Countersink, Hole, Straight Tap) in
// two standards, ANSI Inch and ISO. Loaded after kernel.js (app, tests, rebuild worker). No DOM, no three.js.
//
// Feature JSON:
//   { type: 'hole', standard: 'ANSI Inch' | 'ISO', holeType: 'cbore' | 'csk' | 'hole' | 'tap', size, fit: 'close' |
//     'normal' | 'loose', sizeType: 'drill' (ANSI Inch Hole only: size is a drill, '#7', 'F', '17/64'; otherwise a
//     screw clearance), end: 'blind' | 'through', depth, threadDepth (tap, blind), sketch: <id of a sketch of points> }
//   size: ISO 'M8'; ANSI Inch screws '#10', '1/4'; ANSI Inch threads '1/4-20 UNC', '#10-32 UNF'.
// The tables are in each standard's own unit (ISO mm, ANSI inches); spec(f, units) converts to the part's units, so an
// ANSI hole in a metric part and an ISO hole in an inch part come out the right size. Without units each standard
// reads in its own (ANSI inches, ISO mm).
// Each point of the positions sketch is a hole; the hole runs into the face (against the sketch plane's normal).
// The tool is a revolve of the hole's half section about its axis (Kernel.buildTool 'revolve' on a plane through the
// axis), so its walls carry true-curve records: cylinders and the countersink cone are exact. Blind depth is measured
// from the face to the flat bottom (no drill point) and includes the counterbore / countersink.
//
// Script: p.holeWizard({ sketch: f3, type: 'cbore', size: 'M8', fit: 'normal', depth: 20 })            (a points sketch)
//         p.holeWizard({ face: 'Top', offset: 20, points: [[0, 0], [20, 0]], type: 'tap', size: 'M6', depth: 12 })
//         p.holeWizard({ face: 'Top', offset: 0.25, points: [[1, -1]], standard: 'ANSI Inch', type: 'tap', size: '1/4-20 UNC', depth: 0.75, threadDepth: 0.5 })
// callout(f, units) gives the drawing callout lines: 'Ø.281 THRU', '⌴ Ø.438 ↧ .250', '1/4-20 UNC - 2B ↧ .500'.
var HoleWizard = (function () {
  'use strict';
  var K = Kernel, V = K.vec;

  // ---------------------------------------------------------------- ISO metric (mm)
  // ISO metric coarse series. clr: ISO 273 clearance holes [close, normal, loose]; pitch: ISO 261 coarse; tap: tap
  // drill (D - P); cb: counterbore for ISO 4762 socket head cap screws [diameter, depth] (head dk + clearance, depth
  // head k + clearance); csk: countersink diameter for ISO 10642 countersunk screws (head dk max, 90°; M2 / M2.5 from
  // ISO 7046).
  var ISO = [
    { size: 'M2', d: 2, pitch: 0.4, tap: 1.6, clr: [2.2, 2.4, 2.6], cb: [4.4, 2.2], csk: 4.4 },
    { size: 'M2.5', d: 2.5, pitch: 0.45, tap: 2.05, clr: [2.7, 2.9, 3.1], cb: [5.5, 2.7], csk: 5.5 },
    { size: 'M3', d: 3, pitch: 0.5, tap: 2.5, clr: [3.2, 3.4, 3.6], cb: [6.5, 3.3], csk: 6.72 },
    { size: 'M4', d: 4, pitch: 0.7, tap: 3.3, clr: [4.3, 4.5, 4.8], cb: [8, 4.4], csk: 8.96 },
    { size: 'M5', d: 5, pitch: 0.8, tap: 4.2, clr: [5.3, 5.5, 5.8], cb: [10, 5.4], csk: 11.2 },
    { size: 'M6', d: 6, pitch: 1, tap: 5, clr: [6.4, 6.6, 7], cb: [11, 6.5], csk: 13.44 },
    { size: 'M8', d: 8, pitch: 1.25, tap: 6.8, clr: [8.4, 9, 10], cb: [15, 8.6], csk: 17.92 },
    { size: 'M10', d: 10, pitch: 1.5, tap: 8.5, clr: [10.5, 11, 12], cb: [18, 10.8], csk: 22.4 },
    { size: 'M12', d: 12, pitch: 1.75, tap: 10.2, clr: [13, 13.5, 14.5], cb: [20, 13], csk: 26.88 },
    { size: 'M14', d: 14, pitch: 2, tap: 12, clr: [15, 15.5, 16.5], cb: [24, 15], csk: 30.8 },
    { size: 'M16', d: 16, pitch: 2, tap: 14, clr: [17, 17.5, 18.5], cb: [26, 17.5], csk: 33.6 },
    { size: 'M20', d: 20, pitch: 2.5, tap: 17.5, clr: [21, 22, 24], cb: [33, 21.5], csk: 40.32 }
  ];

  // ---------------------------------------------------------------- ANSI Inch (inches)
  // Drill sizes: number drills #1–#60, letter drills A–Z, fractional drills 1/64 apart from 1/16 to 1 in (and the
  // few larger ones the clearance table names). Every hole of the ANSI Inch tables is one of these drills.
  var NUMBER_DRILLS = [0.2280, 0.2210, 0.2130, 0.2090, 0.2055, 0.2040, 0.2010, 0.1990, 0.1960, 0.1935, 0.1910, 0.1890, 0.1850,
    0.1820, 0.1800, 0.1770, 0.1730, 0.1695, 0.1660, 0.1610, 0.1590, 0.1570, 0.1540, 0.1520, 0.1495, 0.1470, 0.1440, 0.1405,
    0.1360, 0.1285, 0.1200, 0.1160, 0.1130, 0.1110, 0.1100, 0.1065, 0.1040, 0.1015, 0.0995, 0.0980, 0.0960, 0.0935, 0.0890,
    0.0860, 0.0820, 0.0810, 0.0785, 0.0760, 0.0730, 0.0700, 0.0670, 0.0635, 0.0595, 0.0550, 0.0520, 0.0465, 0.0430, 0.0420,
    0.0410, 0.0400];   // #1 … #60
  var LETTER_DRILLS = [0.234, 0.238, 0.242, 0.246, 0.250, 0.257, 0.261, 0.266, 0.272, 0.277, 0.281, 0.290, 0.295, 0.302, 0.316,
    0.323, 0.332, 0.339, 0.348, 0.358, 0.368, 0.377, 0.386, 0.397, 0.404, 0.413];   // A … Z
  function fracName(n64) {
    var whole = Math.floor(n64 / 64), num = n64 % 64, den = 64;
    while (num && num % 2 === 0) { num /= 2; den /= 2; }
    return num ? (whole ? whole + '-' : '') + num + '/' + den : String(whole);
  }
  var DRILLS = [], DRILL = {};
  (function () {
    var i;
    for (i = 0; i < NUMBER_DRILLS.length; i++) DRILLS.push({ name: '#' + (i + 1), dia: NUMBER_DRILLS[i], kind: 'number' });
    for (i = 0; i < LETTER_DRILLS.length; i++) DRILLS.push({ name: String.fromCharCode(65 + i), dia: LETTER_DRILLS[i], kind: 'letter' });
    for (i = 4; i <= 64; i++) DRILLS.push({ name: fracName(i), dia: i / 64, kind: 'fraction' });
    [65, 66, 70, 74, 76, 88, 104].forEach(function (n) { DRILLS.push({ name: fracName(n), dia: n / 64, kind: 'fraction' }); });
    DRILLS.forEach(function (d) { DRILL[d.name] = d; });
  })();
  function drill(name) {
    var d = DRILL[String(name).trim()];
    if (!d) throw new Error('Unknown drill size ' + name + '.');
    return d.dia;
  }
  // The drill sizes offered for a plain Hole: fractions, then letters, then numbers, largest first within each
  var DRILL_SIZES = DRILLS.filter(function (d) { return d.kind !== 'fraction' || d.dia <= 1; }).slice().sort(function (a, b) {
    var ka = { fraction: 0, letter: 1, number: 2 }[a.kind], kb = { fraction: 0, letter: 1, number: 2 }[b.kind];
    return ka !== kb ? ka - kb : a.dia - b.dia;
  });

  // Screws: d basic major diameter; clr: clearance drills [close, normal, loose] per ASME B18.2.8; cb: socket head cap
  // screw counterbore per ASME B18.3 (appendix: close and normal drill, counterbore diameter; depth = head height = D);
  // csk: 82° countersink diameter for flat countersunk head machine screws, ASME B18.6.3 head diameter max (theoretical
  // sharp; the countersinks of #2, #3, #5 and 7/16 – 1 are in ANSI_CSK_MORE below).
  // #12 and 9/16 are inside B18.2.8's #0 – 1-1/2 range but not tabulated in it; their clearances follow the table's own
  // steps (#5 – 3/8: close D + 1/64, normal D + 1/32, loose D + 3/64; 1/2 and 5/8: D + 1/32, D + 1/16, D + 7/64), taken
  // up to the next standard drill: #12 (.216) 15/64 .2344, 1/4 .2500, 17/64 .2656; 9/16 19/32, 5/8, 43/64. Neither
  // has a socket head cap screw in ASME B18.3, so neither has a counterbore (no cb; spec says so).
  var ANSI_SCREWS = [
    { size: '#2', d: 0.086, clr: ['3/32', '#38', '#32'], cb: { drills: ['3/32', '#36'], dia: '3/16' } },
    { size: '#3', d: 0.099, clr: ['#36', '#32', '#30'], cb: { drills: ['#36', '#31'], dia: '7/32' } },
    { size: '#4', d: 0.112, clr: ['#31', '#30', '#27'], cb: { drills: ['1/8', '#29'], dia: '7/32' }, csk: 0.225 },
    { size: '#5', d: 0.125, clr: ['9/64', '5/32', '11/64'], cb: { drills: ['9/64', '#23'], dia: '1/4' } },
    { size: '#6', d: 0.138, clr: ['#23', '#18', '#13'], cb: { drills: ['#23', '#18'], dia: '9/32' }, csk: 0.279 },
    { size: '#8', d: 0.164, clr: ['#15', '#9', '#3'], cb: { drills: ['#15', '#10'], dia: '5/16' }, csk: 0.332 },
    { size: '#10', d: 0.190, clr: ['#5', '#2', 'B'], cb: { drills: ['#5', '#2'], dia: '3/8' }, csk: 0.385 },
    { size: '#12', d: 0.216, clr: ['15/64', '1/4', '17/64'], csk: 0.438 },
    { size: '1/4', d: 0.250, clr: ['17/64', '9/32', '19/64'], cb: { drills: ['17/64', '9/32'], dia: '7/16' }, csk: 0.507 },
    { size: '5/16', d: 0.3125, clr: ['21/64', '11/32', '23/64'], cb: { drills: ['21/64', '11/32'], dia: '17/32' }, csk: 0.635 },
    { size: '3/8', d: 0.375, clr: ['25/64', '13/32', '27/64'], cb: { drills: ['25/64', '13/32'], dia: '5/8' }, csk: 0.762 },
    { size: '7/16', d: 0.4375, clr: ['29/64', '15/32', '31/64'], cb: { drills: ['29/64', '15/32'], dia: '23/32' } },
    { size: '1/2', d: 0.500, clr: ['17/32', '9/16', '39/64'], cb: { drills: ['33/64', '17/32'], dia: '13/16' } },
    { size: '9/16', d: 0.5625, clr: ['19/32', '5/8', '43/64'], csk: 1.000 },
    { size: '5/8', d: 0.625, clr: ['21/32', '11/16', '47/64'], cb: { drills: ['41/64', '21/32'], dia: '1' } },
    { size: '3/4', d: 0.750, clr: ['25/32', '13/16', '29/32'], cb: { drills: ['49/64', '25/32'], dia: '1-3/16' } },
    { size: '7/8', d: 0.875, clr: ['29/32', '15/16', '1-1/32'], cb: { drills: ['57/64', '29/32'], dia: '1-3/8' } },
    { size: '1', d: 1.000, clr: ['1-1/32', '1-3/32', '1-5/32'], cb: { drills: ['1-1/64', '1-1/32'], dia: '1-5/8' } }
  ];
  // 82° countersinks for the rows above that carry none: Ø = head diameter max (theoretical sharp) of ASME B18.6.3 flat
  // countersunk head machine screws, as the rows above (#2 .172, #3 .199, #5 .252, 7/16 .812, 1/2 .875, 5/8 1.125,
  // 3/4 1.375; #12 .438 and 9/16 1.000 are in their rows). B18.6.3 stops at 3/4, so 7/8 and 1 take ASME B18.6.2 slotted
  // flat countersunk head cap screws (7/8 1.625, 1 1.875), the same 82° slotted flat head, whose table agrees with
  // B18.6.3 from 7/16 to 3/4. r16/csk: checked 2026-10-12 against ASME B18.3's flat countersunk (82°) socket head cap
  // screws, whose head diameter max (theoretical sharp) is the same 1.625 (7/8) and 1.875 (1); both tables run
  // 2·D − 1/8 from 1/2 up (.875, 1.000, 1.125, 1.375, 1.625, 1.875), so the values stand.
  var ANSI_CSK_MORE = { '#2': 0.172, '#3': 0.199, '#5': 0.252, '7/16': 0.812, '1/2': 0.875, '5/8': 1.125, '3/4': 1.375, '7/8': 1.625, '1': 1.875 };
  ANSI_SCREWS.forEach(function (r) { if (r.csk == null && ANSI_CSK_MORE[r.size] != null) r.csk = ANSI_CSK_MORE[r.size]; });
  // Unified threads (ASME B1.1, class 2B), tap drill for about 75 % thread
  var ANSI_THREADS = [
    ['#2-56 UNC', 0.086, 56, '#50'], ['#2-64 UNF', 0.086, 64, '#50'], ['#3-48 UNC', 0.099, 48, '#47'], ['#3-56 UNF', 0.099, 56, '#45'],
    ['#4-40 UNC', 0.112, 40, '#43'], ['#4-48 UNF', 0.112, 48, '#42'], ['#5-40 UNC', 0.125, 40, '#38'], ['#5-44 UNF', 0.125, 44, '#37'],
    ['#6-32 UNC', 0.138, 32, '#36'], ['#6-40 UNF', 0.138, 40, '#33'], ['#8-32 UNC', 0.164, 32, '#29'], ['#8-36 UNF', 0.164, 36, '#29'],
    ['#10-24 UNC', 0.190, 24, '#25'], ['#10-32 UNF', 0.190, 32, '#21'], ['#12-24 UNC', 0.216, 24, '#16'], ['#12-28 UNF', 0.216, 28, '#14'],
    ['1/4-20 UNC', 0.250, 20, '#7'], ['1/4-28 UNF', 0.250, 28, '#3'], ['5/16-18 UNC', 0.3125, 18, 'F'], ['5/16-24 UNF', 0.3125, 24, 'I'],
    ['3/8-16 UNC', 0.375, 16, '5/16'], ['3/8-24 UNF', 0.375, 24, 'Q'], ['7/16-14 UNC', 0.4375, 14, 'U'], ['7/16-20 UNF', 0.4375, 20, '25/64'],
    ['1/2-13 UNC', 0.500, 13, '27/64'], ['1/2-20 UNF', 0.500, 20, '29/64'], ['9/16-12 UNC', 0.5625, 12, '31/64'], ['9/16-18 UNF', 0.5625, 18, '33/64'],
    ['5/8-11 UNC', 0.625, 11, '17/32'], ['5/8-18 UNF', 0.625, 18, '37/64'], ['3/4-10 UNC', 0.750, 10, '21/32'], ['3/4-16 UNF', 0.750, 16, '11/16'],
    ['7/8-9 UNC', 0.875, 9, '49/64'], ['7/8-14 UNF', 0.875, 14, '13/16'], ['1-8 UNC', 1.000, 8, '7/8'], ['1-12 UNF', 1.000, 12, '59/64']
  ].map(function (r) { return { size: r[0], d: r[1], tpi: r[2], tapDrill: r[3], tap: drill(r[3]) }; });

  var ANSI = 'ANSI Inch';
  var STANDARDS = [[ANSI, 'ANSI Inch'], ['ISO', 'ISO']];
  var TYPES = [['cbore', 'Counterbore'], ['csk', 'Countersink'], ['hole', 'Hole'], ['tap', 'Straight Tap']];
  var FITS = [['close', 'Close'], ['normal', 'Normal'], ['loose', 'Loose']];
  var SIZE_TYPES = [['clearance', 'Screw clearances'], ['drill', 'Drill sizes']];
  var FIT_INDEX = { close: 0, normal: 1, loose: 2 };
  var CSK_ANGLE = 90, ANSI_CSK_ANGLE = 82;
  var TOP = 0.01; // the tool starts this far above the face so the cut never leaves a skin

  // standardOf(f | name) -> 'ANSI Inch' | 'ISO' ('ANSI', 'inch', 'ansi inch' all read as ANSI Inch)
  function standardName(s) { return /ansi|inch/i.test(String(s || '')) ? ANSI : 'ISO'; }
  function standardOf(f) { return f && f.standard ? standardName(f.standard) : (f && f.size && !/^M\d/i.test(String(f.size)) ? ANSI : 'ISO'); }

  function sizeRow(size) {
    for (var i = 0; i < ISO.length; i++) if (ISO[i].size === size) return ISO[i];
    throw new Error('Unknown ISO size ' + size + '.');
  }
  function screwRow(size) {
    for (var i = 0; i < ANSI_SCREWS.length; i++) if (ANSI_SCREWS[i].size === size) return ANSI_SCREWS[i];
    throw new Error('Unknown ANSI Inch screw size ' + size + '.');
  }
  function threadRow(size) {
    var k = String(size || '').replace(/\s+/g, ' ').trim().toUpperCase();
    for (var i = 0; i < ANSI_THREADS.length; i++) if (ANSI_THREADS[i].size.toUpperCase() === k) return ANSI_THREADS[i];
    throw new Error('Unknown ANSI Inch thread ' + size + '.');
  }

  // spec(f, units?) -> { dia, cbore: { dia, depth } | null, csk: { dia, angle } | null, thread: { major, pitch, label }
  // | null, row, standard, drillName (ANSI) } in the part's units (units 'in' | 'mm'; omitted: the standard's own)
  function spec(f, units) {
    var std = standardOf(f), t = f.holeType || 'hole', fi = FIT_INDEX[f.fit] != null ? FIT_INDEX[f.fit] : 1, out;
    if (std === 'ISO') {
      var row = sizeRow(f.size || 'M6');
      out = { dia: t === 'tap' ? row.tap : row.clr[fi], cbore: null, csk: null, thread: null, row: row, standard: 'ISO' };
      if (t === 'cbore') out.cbore = { dia: row.cb[0], depth: row.cb[1] };
      if (t === 'csk') out.csk = { dia: row.csk, angle: CSK_ANGLE };
      if (t === 'tap') out.thread = { major: row.d, pitch: row.pitch, label: row.size + 'x' + row.pitch };
      return scaled(out, units === 'in' ? 1 / 25.4 : 1);
    }
    out = { cbore: null, csk: null, thread: null, standard: ANSI };
    if (t === 'tap') {
      var tr = threadRow(f.size || '1/4-20 UNC');
      out.row = tr; out.dia = tr.tap; out.drillName = tr.tapDrill;
      out.thread = { major: tr.d, pitch: 1 / tr.tpi, tpi: tr.tpi, label: tr.size + ' - 2B' };
    } else if (t === 'hole' && f.sizeType === 'drill') {
      out.dia = drill(f.size); out.drillName = String(f.size).trim(); out.row = DRILL[out.drillName];
    } else {
      var sr = screwRow(f.size || '1/4');
      if (t === 'cbore' && !sr.cb) throw new Error('No counterbore size for a ' + sr.size + ' socket head cap screw (ASME B18.3 has none).');
      out.row = sr;
      out.drillName = t === 'cbore' && fi < 2 ? sr.cb.drills[fi] : sr.clr[fi];
      out.dia = drill(out.drillName);
      if (t === 'cbore') out.cbore = { dia: drill(sr.cb.dia), depth: sr.d };
      if (t === 'csk') {
        if (!sr.csk) throw new Error('No 82° countersink size for a ' + sr.size + ' flat head screw.');
        out.csk = { dia: sr.csk, angle: ANSI_CSK_ANGLE };
      }
    }
    return scaled(out, units === 'mm' ? 25.4 : 1);
  }
  function scaled(s, k) {
    if (k === 1) return s;
    s.dia *= k;
    if (s.cbore) s.cbore = { dia: s.cbore.dia * k, depth: s.cbore.depth * k };
    if (s.csk) s.csk = { dia: s.csk.dia * k, angle: s.csk.angle };
    if (s.thread) { var t = {}; Object.keys(s.thread).forEach(function (key) { t[key] = s.thread[key]; }); t.major *= k; t.pitch *= k; s.thread = t; }
    return s;
  }

  // sizeOptions(standard, holeType, sizeType) -> [[value, label]] for the PropertyManager's Size list
  function sizeOptions(standard, holeType, sizeType) {
    if (standardName(standard) === 'ISO') return ISO.map(function (r) { return [r.size, r.size]; });
    if (holeType === 'tap') return ANSI_THREADS.map(function (r) { return [r.size, r.size]; });
    if (holeType === 'hole' && sizeType === 'drill') return DRILL_SIZES.map(function (d) { return [d.name, d.name + '  (' + inchText(d.dia, 4) + ')']; });
    return ANSI_SCREWS.filter(function (r) { return holeType === 'csk' ? r.csk : holeType === 'cbore' ? r.cb : true; }).map(function (r) { return [r.size, r.size]; });
  }
  function defaultSize(standard, holeType, sizeType) {
    if (standardName(standard) === 'ISO') return 'M6';
    if (holeType === 'tap') return '1/4-20 UNC';
    if (holeType === 'hole' && sizeType === 'drill') return '1/4';
    return '1/4';
  }
  function validSize(standard, holeType, sizeType, size) {
    return sizeOptions(standard, holeType, sizeType).some(function (o) { return o[0] === size; });
  }

  // ---- callout text, ANSI style: inch values with three decimals and no leading zero (.281), mm values trimmed (6.8)
  function inchText(x, dec) { var s = (Math.round(x * Math.pow(10, dec || 3)) / Math.pow(10, dec || 3)).toFixed(dec || 3); return s.replace(/^0\./, '.').replace(/^-0\./, '-.'); }
  function numText(x, units) { return units === 'in' ? inchText(x, 3) : String(Math.round(x * 100) / 100); }
  // callout(f, units?) -> the callout lines of a Hole Wizard feature: 'Ø.281 THRU' | 'Ø.201 ↧ .750', then
  // '⌴ Ø.438 ↧ .250' (counterbore), '⌵ Ø.507 X 82°' (countersink) or '1/4-20 UNC - 2B ↧ .500' (thread)
  function callout(f, units) {
    units = units || (standardOf(f) === ANSI ? 'in' : 'mm');
    var s = spec(f, units), thru = f.end === 'through', lines = [];
    lines.push('Ø' + numText(s.dia, units) + (thru ? ' THRU' : ' ↧ ' + numText(+f.depth, units)));
    if (s.cbore) lines.push('⌴ Ø' + numText(s.cbore.dia, units) + ' ↧ ' + numText(s.cbore.depth, units));
    if (s.csk) lines.push('⌵ Ø' + numText(s.csk.dia, units) + ' X ' + s.csk.angle + '°');
    if (s.thread) lines.push(s.thread.label + (thru ? ' THRU' : ' ↧ ' + numText(+(f.threadDepth || f.depth), units)));
    return lines;
  }

  // half section (r, z) of one hole, z up out of the face, down to z = -L
  function section(s, L) {
    var R = s.dia / 2, pts = [[0, TOP]];
    if (s.cbore) {
      var Rc = s.cbore.dia / 2;
      if (s.cbore.depth >= L) throw new Error('The hole must be deeper than its counterbore.');
      pts.push([Rc, TOP], [Rc, -s.cbore.depth], [R, -s.cbore.depth]);
    } else if (s.csk) {
      var Rs = s.csk.dia / 2, k = Math.tan(s.csk.angle / 2 * Math.PI / 180), h = (Rs - R) / k;
      if (h >= L) throw new Error('The hole must be deeper than its countersink.');
      pts.push([Rs + TOP * k, TOP], [R, -h]);
    } else pts.push([R, TOP]);
    pts.push([R, -L], [0, -L]);
    return pts;
  }

  function positions(f, model, ctx) {
    var sk = (ctx && ctx.sketches && ctx.sketches[f.sketch]) || K.findFeature(model, f.sketch);
    if (!sk || sk.type !== 'sketch') throw new Error('Hole Wizard: select the positions sketch.');
    var plane = K.resolvePlane(sk.plane, model, ctx && ctx.planes);
    var pts = (sk.entities || []).filter(function (e) { return e.t === 'point' && !e.construction && !(K.noProfileEntity && K.noProfileEntity(sk, e)); });
    if (!pts.length) throw new Error('Hole Wizard: place at least one point on the face.');
    return { plane: plane, pts: pts.map(function (e) { return { uv: [e.x, e.y], p: K.to3D(plane, e.x, e.y) }; }) };
  }

  function holeDepth(f, ctx) {
    if (f.end === 'through') {
      var b = ctx && ctx.body && ctx.body.getBounds();
      var diag = b ? Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) : 0;
      return Math.max(ctx && ctx.throughLimit || 0, diag * 2 + 10, 100);
    }
    var d = +f.depth;
    if (!(d > 0)) throw new Error('Hole depth must be greater than 0.');
    return d;
  }
  function modelUnits(model) { return model && model.units === 'in' ? 'in' : 'mm'; }

  function build(f, model, ctx) {
    var s = spec(f, modelUnits(model)), pos = positions(f, model, ctx), L = holeDepth(f, ctx), prof = section(s, L);
    var n = pos.plane.n, x = pos.plane.x, tools = pos.pts.map(function (q) {
      var y = n, nn = V.cross(x, y);
      var rp = { custom: true, origin: q.p, x: x.slice(), y: y.slice(), n: nn, offset: V.dot(nn, q.p) };
      var sk = { id: -1, type: 'sketch', plane: rp, entities: [{ t: 'polyline', pts: prof, closed: true }] };
      return K.buildTool({ id: f.id, type: 'revolve', sketch: -1, axis: { x1: 0, y1: 0, x2: 0, y2: 1 }, angle: 360, cut: true }, model, { sketches: { '-1': sk }, planes: {} });
    });
    var t = tools[0];
    for (var i = 1; i < tools.length; i++) t = t.union(tools[i]);
    return t;
  }

  // threads(model) -> cosmetic threads of every Straight Tap hole: [{ featureId, p, n (into the part), r (major
  // radius), depth (null through), label, drill, standard, size }] in the part's units
  function threads(model) {
    var out = [];
    (model.features || []).forEach(function (f) {
      if (f.type !== 'hole' || f.holeType !== 'tap' || f.suppressed) return;
      try {
        var s = spec(f, modelUnits(model)), pos = positions(f, model, null);
        var depth = f.end === 'through' ? null : +(f.threadDepth || f.depth);
        pos.pts.forEach(function (q) { out.push({ featureId: f.id, p: q.p, n: V.scale(pos.plane.n, -1), r: s.thread.major / 2, depth: depth, label: s.thread.label, drill: s.dia, standard: s.standard, size: f.size }); });
      } catch (e) { }
    });
    return out;
  }

  // the feature's name, SolidWorks style: 'CBORE for M8 Socket Head Cap Screw1', 'M8x1.25 Tapped Hole1',
  // 'CBORE for 1/4 Socket Head Cap Screw1', '1/4-20 UNC Tapped Hole1', 'Ø.281 (1/4) Clearance Hole1', '#7 Drill Hole1'
  function baseName(f) {
    var ansi = standardOf(f) === ANSI, s = spec(f);
    switch (f.holeType) {
      case 'cbore': return 'CBORE for ' + f.size + ' Socket Head Cap Screw';
      case 'csk': return 'CSK for ' + f.size + ' Flat Head Screw';
      case 'tap': return (ansi ? f.size : s.thread.label) + ' Tapped Hole';
    }
    if (ansi && f.sizeType === 'drill') return f.size + ' Drill Hole';
    return 'Ø' + (ansi ? inchText(s.dia, 3) : s.dia) + ' (' + f.size + ') Clearance Hole';
  }
  function holeName(model, f) {
    var base = baseName(f), n = 1;
    (model.features || []).forEach(function (g) { if (g !== f && g.type === 'hole') n++; });
    return base + n;
  }

  // newFeature(o, units?) -> a hole feature from script / PropertyManager options. The standard is o.standard, else
  // the size's (an 'M…' size is ISO, any other ANSI Inch), else ANSI Inch in an inch part and ISO in a metric one.
  function newFeature(o, units) {
    var std = o.standard ? standardName(o.standard) : o.size ? standardOf({ size: o.size }) : units === 'in' ? ANSI : 'ISO';
    var type = o.type || o.holeType || 'hole', sizeType = std === ANSI && type === 'hole' && o.sizeType === 'drill' ? 'drill' : null;
    var f = { type: 'hole', standard: std, holeType: type, size: o.size || defaultSize(std, type, sizeType), fit: o.fit || 'normal',
      end: o.end === 'through' || o.throughAll || o.depth === 'through' ? 'through' : 'blind', depth: o.depth === 'through' ? 0 : +(o.depth || 0) };
    if (sizeType) f.sizeType = sizeType;
    if (std === ANSI && type === 'tap') f.size = threadRow(f.size).size;   // canonical spelling ('1/4-20 unc' -> '1/4-20 UNC')
    if (f.end === 'blind' && !(f.depth > 0)) {
      // two diameters plus a bit, in the part's units
      var mm = std === 'ISO' ? 2 * sizeRow(f.size).d + 5 : 25.4 * (2 * (type === 'tap' ? threadRow(f.size).d : sizeType ? drill(f.size) : screwRow(f.size).d) + 0.25);
      f.depth = units === 'in' ? Math.round(mm / 25.4 * 1000) / 1000 : Math.round(mm * 100) / 100;
    }
    if (f.holeType === 'tap' && f.end === 'blind') f.threadDepth = +(o.threadDepth || f.depth);
    return f;
  }

  K.registerFeature('hole', {
    cut: true,
    build: build,
    script: function (f, v, idVar, optsStr) {
      var o = { sketch: '@' + idVar[f.sketch] };
      if (standardOf(f) === ANSI) o.standard = ANSI;
      o.type = f.holeType;
      if (f.sizeType === 'drill') o.sizeType = 'drill';
      o.size = f.size; o.fit = f.fit;
      if (f.end === 'through') o.end = 'through'; else o.depth = f.depth;
      if (f.holeType === 'tap' && f.end !== 'through' && f.threadDepth !== f.depth) o.threadDepth = f.threadDepth;
      o.name = f.name;
      return 'var ' + v + ' = p.holeWizard(' + optsStr(o) + ').last();';
    }
  });

  if (K.Builder) K.Builder.prototype.holeWizard = function (o) {
    o = o || {};
    var sid = o.sketch;
    if (sid == null) {
      if (!o.points || !o.points.length) throw new Error('holeWizard: give a positions sketch or face + points.');
      var s = this.sketch(o.face || 'Top', o.offset || 0);
      o.points.forEach(function (q) { s.point(q[0], q[1]); });
      s.end();
      sid = this.lastSketchId;
    }
    var f = newFeature(o, this.model.units === 'in' ? 'in' : 'mm');
    f.sketch = sid;
    spec(f);   // an unknown size fails here, at script time
    f.name = o.name || holeName(this.model, f);
    this._add(f);
    return this;
  };

  return { ISO: ISO, ANSI_SCREWS: ANSI_SCREWS, ANSI_THREADS: ANSI_THREADS, DRILLS: DRILLS, DRILL_SIZES: DRILL_SIZES, ANSI: ANSI,
    STANDARDS: STANDARDS, TYPES: TYPES, FITS: FITS, SIZE_TYPES: SIZE_TYPES, CSK_ANGLE: CSK_ANGLE, ANSI_CSK_ANGLE: ANSI_CSK_ANGLE,
    sizeRow: sizeRow, screwRow: screwRow, threadRow: threadRow, drill: drill, standardOf: standardOf, standardName: standardName,
    sizeOptions: sizeOptions, defaultSize: defaultSize, validSize: validSize, spec: spec, callout: callout, section: section,
    threads: threads, positions: positions, holeName: holeName, newFeature: newFeature, build: build };
})();
if (typeof module !== 'undefined') module.exports = HoleWizard;
