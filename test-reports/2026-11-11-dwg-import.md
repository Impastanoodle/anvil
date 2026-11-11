# DWG import — 2026-11-11 (lane dwgin, group rfKW)

Goal: a customer DWG opens as the right sketch whatever AutoCAD version wrote it.
Tests: `anvil/tests/kernel/rfKW.js` (10 rows), `anvil/tests/smoke/rfKW.js` (2 steps).

## The import path (was not documented; now in `docs/areas/sketch.md`)

There is no DWG reader in the page. A .dwg goes to `api/dwg2dxf` and its DXF comes back into the DXF import
(`DxfImport.parse` / `prepare`, the DXF/DWG Import PM):

| Where | Who converts | Notes |
|---|---|---|
| Browser app, local server | `serve.ps1` `Convert-DwgToDxf` | ODA File Converter (ACAD2018 DXF) when installed, else LibreDWG `vendor/libredwg/dwg2dxf.exe` (`$ANVIL_LIBREDWG`); 30 s limit, 200 MB cap |
| Installed desktop app | `desktop/converters.js` `dwg2dxf` (app://anvil/api/dwg2dxf) | same converters, LibreDWG bundled when present at build time |
| Headless runner | `anvil.js dxf2sketch x.dwg` → `headless/dwg.js toDxf` | prints units, layers, entities, Check Sketch, warnings |

The converter runs without `--as`, so the DXF keeps the DWG's version (DXF before AC1021 is decoded as Windows-1252,
later as UTF-8). What the user sees without a converter: 503 → a toast naming `get-libredwg.ps1` / the ODA converter;
no server (published copy, file://, a static host that answers with a page) → "DWG needs the local Anvil server; save
the file as DXF or run Anvil from the desktop shortcut."; bytes that do not start `AC` → refused before any request.

## What was tried

1. **464 real shop DWGs** (the user's local DWG folders, read only, converted into the scratchpad): 154 AutoCAD 2000
   (AC1015), 23 AutoCAD 2010 (AC1024), 287 AutoCAD 2018 (AC1032). All converted by LibreDWG `dwg2dxf` (exit 0, at most
   0.36 s each) and all parsed, prepared and profiled without an error (13 s for the lot). Cross-check: ezdxf 1.4.4 with
   every INSERT exploded and every polyline split, on the 310 files ezdxf can open (154 LibreDWG outputs trip ezdxf's
   handle check): the same LINE / ARC / CIRCLE / SPLINE / POINT / ELLIPSE counts in 302; in the other 8 the line sets
   were compared endpoint by endpoint: identical, except zero-length polyline segments (Anvil drops them), the frame of
   spline-fit POLYLINEs (AutoCAD hides it, Anvil skips it, ezdxf draws it), empty ATTRIBs, and 3D lines (finding 1).
   118 mirrored INSERTs (negative scale) and 425 SPLINEs (degree 2 and 3, one rational) among them.
2. **The twelve rfKS customer-style files plus two new ones** (13: a drawing's worth: XDATA, HATCH, a real linear
   DIMENSION with its `*D1` block, a frozen title frame, a paper-space title block with a VIEWPORT, a mirrored
   attributed INSERT; 14: 3D: a tilted LINE, a LINE at z 5, a CIRCLE at elevation 2, a 3DFACE). LibreDWG's dxf2dwg
   reads only complete DXF (handles, BLOCK_RECORDs), so each was first written by ezdxf as AutoCAD R2000 … R2018 DXF,
   then by dxf2dwg as DWG **R14, 2000 and 2004** (the versions its writer has; R12 and 2007+ are refused), then back by
   dwg2dxf (and `--as r2018`). The ezdxf R2000–R2018 DXFs themselves also went through the import: all 84 right.
3. **Anvil's own flat and drawing DWGs** (dwg-writer.js, AC1015) through dwg2dxf: same entities, layers and area as the
   DXF they came from (flat 24.002768 in², 2 loops; drawing sheet 236 entities).

LibreDWG's *writer* loses data on the way in, which is not an import fault: R2004 DWGs come back with no entities,
R14 drops polylines, R2000 drops POLYLINE bulges, a SPLINE's fit points and a rational SPLINE's weights, nested block
contents, an MTEXT's height and a mirrored INSERT's Y scale (written 0); `dwg2dxf --as r2018` of an R2000 DWG writes an
empty ENTITIES section. The real files show none of this (their weights, bulges and scales are all there), so the
fixtures are the R2000 round trips that kept their geometry, plus the zero-scale and no-height cases as defences.

## Findings, by shop impact

1. **3D entities came in silently (fixed).** Two real DWGs have 16 / 14 entities off z = 0;
   a LINE whose ends differ in z was projected (shorter) without a word. Now `parse` counts per record: different z
   values along it → `tilted` ("not parallel to the XY plane (3D): projected onto it"), one z ≠ 0 (the INSERTs' z
   included) → `offZ` ("lie off z = 0 (3D, at another elevation): placed on the sketch plane"), in the PM message and
   `dxf2sketch`'s warnings. Geometry unchanged.
2. **Bend lines on BEND_UP / BEND_DOWN were imported as outline (fixed).** DXF/DWG Output's *bend layers split* writes
   them; the import made only CONSTRUCTION / BEND construction, so an Anvil flat read back had four lines across the
   blank touching the outline (Check Sketch: open ends, T-junctions). Now BEND_UP, BEND_DOWN, BEND LINES / BEND_LINES
   and BENDLINES come in as construction too.
3. **Units assumed without saying (fixed).** `$INSUNITS` 0 with `$MEASUREMENT` 0 (2 of the 464; AutoCAD's default for
   a drawing started from acad.dwt) was taken as inches silently. Still inches (mm for `$MEASUREMENT` 1), now said:
   PM *File units* "Inches (assumed: no $INSUNITS, $MEASUREMENT 0)" and the message "No units in the file ($INSUNITS 0):
   taken as inches from $MEASUREMENT 0 (English)." `parsed.unitsFrom` is 'INSUNITS', 'MEASUREMENT' or null.
4. **An INSERT with a 0 scale became zero-length lines (fixed, defensive).** AutoCAD never writes it; a converter can.
   The 0 takes the other scale's size, with a warning.
5. **Text with no height was skipped (fixed, defensive).** A TEXT / MTEXT whose height is 0 takes its STYLE's fixed
   height, else `$TEXTSIZE`. Empty ATTRIBs (a title block's unfilled fields) no longer count as "skipped text" (one
   real drawing warned about 19 of them).
6. Nothing else: handles, AcDb markers, XDATA (1000–1071), 210 on every entity, empty group values, HATCH, DIMENSION
   and its `*D` block, LEADER / MULTILEADER / SOLID (counted, skipped), VIEWPORT, paper space (`67 1`), frozen / off
   layers, UTF-8 text in 2010 / 2018 files: none breaks the import or leaves stray geometry.

## Left / notes

- A title block drawn in **model space** on an ordinary layer still comes in (paper-space title blocks and frozen /
  off layers stay out). No reliable rule tells it from the part; the layer box in the PM takes it out.
- Writing DWG test files from hand-made DXF needs ezdxf first; LibreDWG cannot write 2007+ DWGs, so 2010 / 2018 are
  covered by the real files only (not committed: customer data). With the ODA File Converter installed, the same
  check could add 2007–2018 fixtures.
- `anvil.js dxf2sketch` (not in this lane's files) could print `unitsFrom`; the warning already says it.
