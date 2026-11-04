# Sketch tools vs a live SolidWorks (lane HP, 2026-11-04)

The sketch items QUEUE.md listed as "not yet compared with a live SolidWorks seat", measured on the user's running
SolidWorks 2022 (30.5, PID 2300) over its COM API. Only new throwaway documents were used: 6 in total (5 parts, 1
drawing), each closed with `CloseDoc` without saving. No document was open in SolidWorks at the start. Handle count
13,657 at the start, 34,385 after the last document (limit 250,000). Scripts and raw results:
`C:\Users\Lucas\Desktop\Output\Drawings\Anvil sketch check 2026-11-04\` (`sw_part_checks.py` → `part_checks.json`,
`sw_part_checks2.py` → `part_checks2.json`, `sw_checks3.py` → `checks3.json`, `sw-block-test.dxf`). Option meanings
come from the SolidWorks 2022 help installed on the machine (`sldworks.chm`).

Units: inches. Part template: `Drafting Template.prtdot` (IPS). Tests: kernel group `rfHP` (5), smoke group `rfHP` (3).

## 1. SketchXpert solution count

| Case | SolidWorks | Anvil before | Anvil after | Status |
|---|---|---|---|---|
| Line from the origin, Horizontal, Length 4, plus a horizontal distance origin → end = 5 | no API (SketchXpert is UI only) | 3 solutions: delete the distance / the length / the Coincident | unchanged | needs a person |
| 4-line rectangle with H/V and both horizontal lengths dimensioned (redundant) | no API | 3 solutions: delete Line3 length / one of two Coincidents | unchanged | needs a person |

The help confirms the flow Anvil copies (Diagnose → Results with ◀ ▶, Accept, Manual Repair), but not a count.

## 2. Autodimension / Fully Define Sketch placement

Case: corner rectangle (1, 1)–(5, 3), circle Ø .500 at (3, 2), datum the origin, H + V relations.
SolidWorks `FullyDefineSketch(…, scheme, Nothing, scheme, Nothing, -1 below, -1 left)`; the document's
`swDetailingObjectToDimOffset` = 0.3937 in (10 mm), `swDetailingDimToDimOffset` = 0.2362 in (6 mm).

| Item | SolidWorks | Anvil before | Anvil after | Status |
|---|---|---|---|---|
| Baseline H dims: values / dimension-line y | 1.0, 3.0, 5.0 at −0.3937, −0.6299, −0.8661 | 1, 3, 5 at −0.4, −0.8, −1.2 (8 % of sketch size, equal steps) | −0.3937, −0.6299, −0.8661 | **fixed** |
| Baseline V dims: values / x | 1.0, 2.0, 3.0 at −0.3937, −0.6299, −0.8661 | at −0.4, −0.8, −1.2 | −0.3937, −0.6299, −0.8661 | **fixed** |
| Box measured from | sketch with the origin | sketch with the origin | same | match |
| Order of rows | nearest value first | nearest value first | same | match |
| Ø .500 dimension | yes | yes | yes | match |
| Chain scheme | Ø, H 2.0 (corner → centre), V 1.0, one row at −0.3937; relations 2 Coincident + 2 Equal Length | Ø + 3 H + 3 V in one row at −0.4 | one row at −0.3937 | row distance fixed; SolidWorks' odd set of dimensions needs a person |
| Ordinate scheme | base 0 + 3.0 / 2.0 (circle centre only) at −0.3937 | 3 + 3 ordinates at −0.4 | at −0.3937 | row distance fixed; dimension set needs a person |

Anvil keeps its 34 px floor (labels are screen-size text in Anvil; SolidWorks' are model-size), so when zoomed far out
rows are spaced by the floor instead. Millimetre documents get 10 / 6 mm. Script / API calls without units keep the old
8 % rule. (The API help lists placement 0/1 and Chain = 0; the enums are −1 below / left, +1 above / right and
Chain = 3 — with 0/1 SolidWorks placed the dims above / right.)

## 3. Segment on splines

| Case | SolidWorks | Anvil before | Anvil after | Status |
|---|---|---|---|---|
| Spline through 9 points of y = .5 sin x, x = 0…4 step .5: points | 4 points at 1/5 arc length: (0.7776, 0.3509) (1.6134, 0.4994) (2.4439, 0.3212) (3.2179, −0.0382) | refused ("Segment divides a line, an arc or a circle") | (0.7776, 0.3509) (1.6134, 0.4994) (2.4438, 0.3212) (3.2172, −0.0390), all within .001 | **fixed** |
| Same spline: sketch segments | 4 splines of 1.067135 each, split at x = 0.9810 / 2.0363 / 3.0269 | refused | 4 splines split at 0.9810 / 2.0362 / 3.0267 (within .001) | **fixed** |
| Spline length | 4.26854 | 4.26834 | same | match (2e-4) |
| Ellipses / partial ellipses | help: "splines, parabolas, ellipses, partial ellipses, and conics" | refused | equal arc length; full ellipse 4 → its quadrants | fixed (not measured on SolidWorks) |
| Line 0–4, circle R1, arc 0–90° | API count = number of division points: 3 → 3 points / 4 pieces; circle 4 → 4 points at 90° | PM "Number of instances" = number of pieces: 4 → 3 points | unchanged | API matches positions; **what the PM's Number of instances counts needs a person** |
| Zigzag spline (0,0)(1,1)(2,0)(3,1) | length 4.767891 | 4.423846 | unchanged | **differs: the spline curve itself** (see below) |

## 4. Fit Spline / Simplify Spline tolerances

| Case | SolidWorks | Anvil before | Anvil after | Status |
|---|---|---|---|---|
| Fit Spline on line 1 + tangent arc R.5 + line 1, tol .001 in (Delete geometry) | one spline, **2 spline points** (ends only), length 2.785523 | 13 through-points, length 2.785298, deviation .00056 | unchanged | differs (representation) |
| Same, tol .010 in | 2 spline points, length 2.786010 | 9 through-points, length 2.785414 | unchanged | differs (representation) |
| Fit Spline PM default tolerance | no API | .001 in / .025 mm | unchanged | needs a person |
| Simplify Spline, sine spline (9 pts), tol .001 | 9 points (nothing removed) | 8 (x = .5 removed, deviation .00081) | unchanged | differs |
| tol .010 | 8 (x = 3.0 removed) | 5 (0, 1.5, 2, 3.5, 4) | unchanged | differs |
| tol .050 | 7 (x = 2.5 and 3.5 removed) | 4 (0, 1.5, 3.5, 4) | unchanged | differs |

SolidWorks' fit spline is a B-spline with interior control points but no interior spline points; Anvil's splines are
through-point splines only, so the point count cannot match without a new spline kind. Simplify: SolidWorks keeps a
subset of the original points but refits the curve ("calculates a new curve with fewer spline points"), and the subsets
at .01 and .05 are not nested, so it is not "drop points while within tolerance" as Anvil does. Three samples are not
enough to reproduce its rule: left as is.

The zigzag case shows SolidWorks and Anvil draw a different curve through the same points (SolidWorks 4.7679 long,
Anvil 4.4238); on gentle splines they agree (sine 4.26854 vs 4.26834). Changing Anvil's spline interpolation is a
kernel-wide change (every saved spline would move) and was not done.

## 5. Grid / Angle / Length Quick Snaps

| Item | SolidWorks | Anvil before | Anvil after | Status |
|---|---|---|---|---|
| Snap angle (System Options ▸ Relations/Snaps) | 45° (`swSketchSnapsAngleValue` 0.7854 rad on the seat) | Angle Quick Snap in 15° steps | 45° steps | **fixed** |
| Angle measured from | help: X–Y axes, or the existing line when sketching from its end | always X | the line the point starts at the end of, else X | **fixed** |
| Grid (Document Properties ▸ Grid/Snap) | major 1 in, 4 minor lines per major, 1 snap point per minor (0.25 in), Automatic scaling on, grid hidden | snap = grid / 5 with zoom-chosen grid 1-2-5 steps (0.2 in at a 0.017 in/px zoom) | unchanged | differs; grid lives in ui-core.js (other lane); SolidWorks' step under Automatic scaling at a given zoom needs a person |
| Length snap | help: "increments that are set by the grid, without requiring display of the grid" | the same grid step | unchanged | rule matches; numbers follow the grid row above |
| Grid snap toggles | Grid snap off by default; snaps even with the grid hidden unless "Snap only when grid is displayed" | Quick Snap only | unchanged | match for the Quick Snap |

## 6. Instant2D increments

| Item | SolidWorks | Anvil | Status |
|---|---|---|---|
| Ruler increments while dragging | no API; help only says "Use on-screen rulers to precisely measure" | 1-2-5 steps with ticks ≥ 5 px on the ruler, 14 px near it, 40 px away; angles 5° / 15° / 45° | needs a person |

## 7. Blocks in SolidWorks-written files

Drawing sheet: block "Block1" (2 × 1 rectangle + Ø .5 circle, insertion point at its corner), a second instance at
(8, 4) scaled 1.5 and turned 30°, saved as DXF (R2000, `$INSUNITS` 1).

| Item | SolidWorks DXF | Anvil (DxfImport blocks) | Status |
|---|---|---|---|
| Definitions / instances | 1 BLOCK, 2 INSERT (41/42/43 = 1.5, 50 = 30 on one) | 1 definition, 2 instances | match |
| Instance placement | (8, 4) 1.5 × 30°, (2, 2) | (8, 4) 1.5 × 30°, (2, 2) | match |
| Extents | 2, 2 → 10.598076, 6.799038 | same | match |
| Scaled circle | R .375 at (8.924038, 5.399519) | same | match |
| Units | inches | inches | match |

## Still needs a person at SolidWorks
1. SketchXpert: the number of solutions Diagnose lists for the two cases in section 1.
2. Segment PM: whether "Number of instances" 4 on a line gives 4 pieces (Anvil) or 4 points (what the API's count does).
3. Fit Spline PM: the default Tolerance shown.
4. Grid snap / Length snap step with Automatic scaling on, at two zoom levels (e.g. a 5 in part filling the screen and zoomed out ×4).
5. Instant2D: the ruler's increment when dragging a 4 in line dimension at a normal zoom.
6. Fully Define Sketch with Chain / Ordinate on the section-2 case: what the result looks like (the API returned only the circle located plus 2 Coincident / 2 Equal Length relations).
