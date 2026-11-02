"""Writes anvil/tests/kernel/rfGD.js from the second SolidWorks reference (lane swref, 2026-11-02): no SolidWorks needed.

    python ref2_make_test.py          reads OUT2\\json\\<section>\\*.json

A row that matches (1e-4 in, 1e-5 relative volume) is hard; a mismatch is an `rfGD TODO:` row that passes and prints both
numbers, or says to promote itself. Refusal rows: both refuse = hard; SolidWorks builds a body its own checker faults =
hard (Anvil's refusal stands); SolidWorks builds a valid body Anvil refuses, or the reverse = TODO.
"""
import json
import os

from ref2 import load_all, HERE

MM3 = 16387.064
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "anvil", "tests", "kernel", "rfGD.js"))
TOL, VREL = 1e-4, 1e-5
# corpus rows whose SolidWorks bbox is another picture of the same part: a hem from a mid-thickness pick folds the other way
NO_BBOX = {"M06", "M22", "G41"}
# Insert Bends after a Rip stays flat in SolidWorks ("Process-Bends1: Warning"): only its flat size is compared
FLAT_ONLY = {"M15", "G42", "ripbends_both_box", "ripbends_side1_box"}
SKIP_CORPUS = {"M10": "edge jog: SolidWorks has no such feature", "M17": "Vent: not in the SolidWorks 2022 API", "M08": None}


def js(x):
    return json.dumps(x, ensure_ascii=False)


def scale(r):
    return MM3 if 'units("mm")' in r.get("code", "") else 1.0


def sw_of(r):
    """SolidWorks' numbers in the script's units."""
    v, s = r.get("volume") or 0, scale(r)
    out = {"v": round(v * s, 7), "n": r.get("bodies", 0)}
    if r.get("bbox"):
        k = 25.4 if s != 1 else 1
        out["b"] = [round(x * k, 6) for x in r["bbox"]]
    f = r.get("flat")
    if f and f.get("size"):
        out["f"] = [round(x, 6) for x in sorted(f["size"], reverse=True)[:2]]
    return out


def off(sw, a, bbox=True, solid=True):
    bad = []
    if solid and abs((a.get("volume") or 0) - sw["v"]) > VREL * max(abs(sw["v"]), 1e-9):
        bad.append("v")
    if bbox and solid and sw.get("b") and a.get("bbox") and any(abs(p - q) > TOL for p, q in zip(sw["b"], a["bbox"])):
        bad.append("b")
    if solid and a.get("bodies") != sw["n"]:
        bad.append("n")
    if sw.get("f"):
        af = sorted((a.get("flat") or {}).get("size", [0, 0]), reverse=True)
        if any(abs(p - q) > TOL for p, q in zip(sw["f"], af)):
            bad.append("f")
    return bad


def text(r):
    log = r.get("log") or []
    for x in reversed(log):
        if not x["built"]:
            ms = [m for m in x["messages"] if "Rebuild Errors" not in m]
            return (ms[0].split(":", 1)[-1].strip() if ms else "(no message, the API returned nothing)")[:150]
    return ""


def refusal_rows():
    rows = []
    for sec in ("refusals", "fuzz"):
        for k, r in load_all(sec).items():
            if "exception" in r or "unmeasured" in r:
                continue
            a = r.get("anvil", {})
            aerr = bool(a.get("errors"))
            log = r.get("log", [])
            mapped = not any("not mapped" in x.get("exception", "") or "no edge at" in x.get("exception", "") or "no face at" in x.get("exception", "") for x in log)
            serr = any(not x["built"] for x in log)
            sw = sw_of(r)
            faulty = bool(r.get("faults"))
            if not mapped:
                continue                     # a stack whose pick or feature has no SolidWorks counterpart proves nothing
            if serr and aerr:
                kind = "both"
            elif not serr and aerr:
                kind = "faulty" if faulty else "swbuilds"
            elif serr and not aerr:
                kind = "anvilbuilds"
            else:
                kind = "same" if not off(sw, a) else "differ"
            rows.append({"id": k, "d": r.get("desc") or r.get("ops", ""), "code": r["code"], "kind": kind, "sw": sw, "text": text(r)})
    return rows


def corpus_rows():
    rows = []
    for k, r in load_all("corpus").items():
        if "exception" in r or k in SKIP_CORPUS and SKIP_CORPUS[k]:
            continue
        a = r.get("anvil", {})
        if not r.get("built"):
            rows.append({"id": k, "d": r.get("desc", ""), "code": r["code"], "kind": "anvilbuilds", "sw": sw_of(r), "text": text(r)})
            continue
        sw = sw_of(r)
        solid = k not in FLAT_ONLY
        bad = off(sw, a, bbox=k not in NO_BBOX, solid=solid)
        rows.append({"id": k, "d": r.get("desc", ""), "code": r["code"], "kind": "differ" if bad else "same", "sw": sw, "bbox": k not in NO_BBOX, "solid": solid, "text": ""})
    return rows


def generic_rows(sec, label):
    rows = []
    for k, r in load_all(sec).items():
        if "exception" in r or "unmeasured" in r:
            continue
        a = r.get("anvil", {})
        sw = sw_of(r)
        serr = any(not x["built"] for x in r.get("log", []))
        aerr = bool(a.get("errors"))
        solid = k not in FLAT_ONLY
        if serr and aerr:
            kind = "both"
        elif serr:
            kind = "anvilbuilds"
        elif aerr:
            kind = "swbuilds"
        else:
            kind = "differ" if off(sw, a, solid=solid) else "same"
        rows.append({"id": label + " " + k, "d": "", "code": r["code"], "kind": kind, "sw": sw, "solid": solid, "bbox": True, "text": text(r)})
    return rows


HEAD = r"""  // --- rfGD (2026-11-02, lane swref: SolidWorks reference, second pass) --- generated by
  // head-tools/sw-reference/ref2_make_test.py from SolidWorks 2022 SP5 over COM (ref2*.py; parts and raw JSON in
  // Output\SolidWorks Models\Anvil reference\2026-11-02; write-up test-reports/2026-11-02-solidworks-reference-2.md).
  // Each row is one Anvil script and what SolidWorks made of the same part. Match = 1e-4 in, 1e-5 relative volume. Hard
  // rows hold every match. 'rfGD TODO:' rows hold a mismatch: they pass and print both numbers, or say to promote them.
  // kind: both (both refuse), faulty (SolidWorks builds a body its own check faults: Anvil's refusal stands), same
  // (both build, equal), differ (both build, not equal), swbuilds (Anvil refuses a valid SolidWorks body), anvilbuilds
  // (SolidWorks refuses what Anvil builds).
  (function () {
    group('rfGD: SolidWorks reference, second pass (refusals, gauges, hems, jogs, corners, corpus, lofts)');
    var TOL = 1e-4, VREL = 1e-5;
    function rfGDerrs(r) { return Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }); }
    function rfGDnums(row) {
      var r = build(row.code), e = rfGDerrs(r), o = { errs: e, v: r.mp ? r.mp.volume : 0, n: r.build && r.build.bodies ? r.build.bodies.length : 0, b: null, f: null };
      if (r.mp && r.mp.bbox) o.b = r.mp.bbox.min.concat(r.mp.bbox.max);
      if (row.sw.f && r.mesh) { var fl = K.flatPattern(r.model, r.build, r.mesh); o.f = fl.size.slice().sort(function (a, b) { return b - a; }); }
      return o;
    }
    function rfGDoff(row, a) {
      var s = row.sw, bad = [], solid = row.solid !== false;
      if (solid && !(Math.abs(a.v - s.v) <= VREL * Math.max(Math.abs(s.v), 1e-9))) bad.push('volume Anvil ' + a.v.toFixed(6) + ' / SolidWorks ' + s.v);
      if (solid && a.n !== s.n) bad.push('bodies Anvil ' + a.n + ' / SolidWorks ' + s.n);
      if (solid && row.bbox !== false && s.b && a.b) s.b.forEach(function (q, i) { if (!(Math.abs(a.b[i] - q) <= TOL)) bad.push('bbox[' + i + '] Anvil ' + a.b[i].toFixed(6) + ' / SolidWorks ' + q); });
      if (s.f) s.f.forEach(function (q, i) { if (!a.f || !(Math.abs(a.f[i] - q) <= TOL)) bad.push('flat[' + i + '] Anvil ' + (a.f ? a.f[i].toFixed(6) : 'none') + ' / SolidWorks ' + q); });
      return bad;
    }
    function rfGDrow(row) {
      var name = row.id + (row.d ? ' (' + row.d + ')' : '');
      if (row.kind === 'both') test('rfGD: both refuse: ' + name + (row.text ? '; SolidWorks: ' + row.text : ''), function () {
        var a = rfGDnums(row);
        assert(a.errs.length, 'Anvil refuses too');
        return a.errs[0];
      });
      else if (row.kind === 'faulty') test('rfGD: SolidWorks builds a body its own check faults, Anvil\'s refusal stands: ' + name, function () {
        var a = rfGDnums(row);
        assert(a.errs.length, 'Anvil refuses');
        return 'SolidWorks ' + row.sw.v + ' with faults; Anvil: ' + a.errs[0];
      });
      else if (row.kind === 'same') test('rfGD: = SolidWorks: ' + name, function () {
        var a = rfGDnums(row), bad = rfGDoff(row, a);
        assert(!a.errs.length, 'errors: ' + a.errs.join(' | '));
        assert(!bad.length, bad.join('; '));
        return 'volume ' + row.sw.v;
      });
      else test('rfGD TODO: ' + row.kind + ': ' + name, function () {
        var a = rfGDnums(row);
        if (row.kind === 'swbuilds') return a.errs.length ? 'TODO Anvil refuses (' + a.errs[0] + ') / SolidWorks builds volume ' + row.sw.v + ', ' + row.sw.n + ' bodies' : 'builds now: compare, then promote to a hard test';
        if (row.kind === 'anvilbuilds') return a.errs.length ? 'refuses now: promote to a hard test' : 'TODO Anvil builds volume ' + a.v.toFixed(6) + ' / SolidWorks refuses: ' + row.text;
        var bad = rfGDoff(row, a);
        return bad.length ? 'TODO ' + bad.slice(0, 8).join('; ') : 'matches SolidWorks now: promote to a hard test';
      });
    }
"""

TAIL = r"""    // the gauge sweep, one row per group: [T, R, K, angle, position, length type, flat length, volume]
    function rfGDsweepCode(q) { return 'p.units("in");\np.sheet(' + q[0] + ', ' + q[1] + ', ' + q[2] + ');\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[2, ' + q[0] + ', 2]], { angle: ' + q[3] + ', position: "' + q[4] + '", lengthRef: "' + q[5] + '" });\n'; }
    function rfGDsweepOff(q) {
      var r = build(rfGDsweepCode(q)), e = rfGDerrs(r);
      if (e.length) return 'refused: ' + e[0];
      var f = K.flatPattern(r.model, r.build, r.mesh), L = Math.max(f.size[0], f.size[1]) === 4 ? Math.min(f.size[0], f.size[1]) : Math.max(f.size[0], f.size[1]);
      if (!(Math.abs(L - q[6]) <= TOL)) return 'flat Anvil ' + L.toFixed(6) + ' / SolidWorks ' + q[6];
      if (!(Math.abs(r.mp.volume - q[7]) <= VREL * q[7])) return 'volume Anvil ' + r.mp.volume.toFixed(6) + ' / SolidWorks ' + q[7];
      return '';
    }
    Object.keys(SWEEP).forEach(function (g) {
      var rows = SWEEP[g].rows;
      if (SWEEP[g].ok) test('rfGD: gauge sweep = SolidWorks (flat, volume): ' + g + ', ' + rows.length + ' parts', function () {
        rows.forEach(function (q) { var o = rfGDsweepOff(q); assert(!o, JSON.stringify(q.slice(0, 6)) + ': ' + o); });
        return rows.length + ' parts';
      });
      else test('rfGD TODO: gauge sweep: ' + g + ', ' + rows.length + ' parts', function () {
        var off = [];
        rows.forEach(function (q) { var o = rfGDsweepOff(q); if (o) off.push('T ' + q[0] + ' R ' + q[1] + ' K ' + q[2] + ': ' + o); });
        return off.length ? 'TODO ' + off.length + ' of ' + rows.length + ': ' + off.slice(0, 4).join('; ') : 'matches SolidWorks now: promote to a hard test';
      });
    });
  })();
"""


def sweep_groups():
    groups = {}
    for k, r in load_all("sweep").items():
        if "exception" in r or "unmeasured" in r or not r.get("flat"):
            continue
        s = r["spec"]
        fl = [x for x in sorted(r["flat"]["size"], reverse=True) if abs(x - s["T"]) > 1e-9]
        L = fl[1] if abs(fl[0] - 4) < 1e-9 else fl[0]
        a = r["anvil"]
        af = sorted((a.get("flat") or {}).get("size", [0, 0]), reverse=True)
        aL = af[1] if abs(af[0] - 4) < 1e-9 else af[0]
        ok = not a.get("errors") and abs(L - aL) <= TOL and abs((a.get("volume") or 0) - r["volume"]) <= VREL * r["volume"]
        g = "%g° %s %s" % (s["A"], s["pos"], s["ref"])
        groups.setdefault(g, {"ok": [], "bad": []})["ok" if ok else "bad"].append([s["T"], s["R"], s["K"], s["A"], s["pos"], s["ref"], round(L, 6), round(r["volume"], 7)])
    out = {}
    for g, d in groups.items():
        if d["ok"]:
            out[g + " (match)"] = {"ok": True, "rows": d["ok"]}
        if d["bad"]:
            out[g + " (off)"] = {"ok": False, "rows": d["bad"]}
    return out


def main():
    rows = refusal_rows() + corpus_rows() + generic_rows("hemjog", "hem/jog") + generic_rows("corners", "corner") + generic_rows("loft", "loft")
    body = HEAD + "    var ROWS = " + json.dumps(rows, ensure_ascii=False) + ";\n    ROWS.forEach(rfGDrow);\n"
    body += "    var SWEEP = " + json.dumps(sweep_groups(), ensure_ascii=False) + ";\n" + TAIL
    with open(OUT, "w", encoding="utf8", newline="\n") as fh:
        fh.write(body)
    c = {}
    for r in rows:
        c[r["kind"]] = c.get(r["kind"], 0) + 1
    print(len(rows), "rows", c, "sweep groups", {k: len(v["rows"]) for k, v in sweep_groups().items()})


if __name__ == "__main__":
    main()
