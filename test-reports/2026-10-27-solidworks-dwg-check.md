# Anvil's flat DXF / DWG in SolidWorks, Miter Flange and Closed Corner reference values (lane DU, 2026-10-27)

SolidWorks 2022 SP5, driven only through its COM API from Python (pywin32). Scripts in `head-tools/sw-reference/`:
`dwg_flats.py` (writes the three new flats), `dxfsum.py` (what a DXF holds, counted as sketch segments),
`dwgcheck.py` (imports every file as a part sketch, reads it back), `unitprobe.py` (the mm / inch cause),
`miter2.py`, `corner2.py`. Everything saved is in `C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\`
(`dwg-check-*.SLDPRT`, `dwgcheck.json`, `miter-*.SLDPRT`, `miter2.json`, `corner-*.SLDPRT`, `corner2.json`; the new
flats, their Anvil scripts and the probe files in `dwg-check\`).

## 1. Anvil's flats opened in SolidWorks

Import: `ISldWorks.GetImportFileData(path)` → `ImportDxfDwgData.ImportMethod("") = 2` (swImportDxfDwg_ImportToPartSketch;
an indexed property: under pywin32 `_oleobj_.Invoke(dispid, 0, DISPATCH_PROPERTYPUT, 0, "", 2)`) →
`ISldWorks.LoadFile4(path, "", data, errors)`. Every file opened with `errors = 0`, no dialog, into one sketch named
`Model` on the Front plane. Read back with `ISketch.GetSketchSegments` (`GetType`, `IsCircle`, `ConstructionGeometry`,
`Layer`, start / end / centre points; sketch text segments carry `Text`).

Expected = the DXF counted with LWPOLYLINEs exploded (a bulge is an arc). Imported = segments in the sketch; "+ n
construction" lines are explained below. Extents in the file's own unit.

| file | made by | DXF opened | DWG opened | expected (line / arc / circle / text) | imported DXF | imported DWG | extents expected | DXF extents | DWG extents |
|---|---|---|---|---|---|---|---|---|---|
| u-bracket-flat (mm) | example 9, 2026-10-26 | yes | yes | 8 / 2 / 6 / 3 | 8 / 2 / 6 / 3 + 2 constr. | same | 210.744 × 60 | **5352.904 × 1524** | 210.744 × 60 |
| normal-cut-bracket-flat (mm) | example 11, 2026-10-26 | yes | yes | 9 / 0 / 2 / 2 | 9 / 0 / 2 / 2 + 1 constr. | same | 135.372 × 60 | **3438.452 × 1524** | 135.372 × 60 |
| hole-across-bend-flat (in) | new: Ø.2 hole + .2 × .3 hole on the bend's trim line, Material Inside flange | yes | yes | 15 / 2 / 0 / 2 | 15 / 2 / 0 / 2 + 1 constr. | same | 5.0213 × 3 | 5.0213 × 3 | 5.0213 × 3 |
| hem-flat (in) | new: closed hem 0.5, Ø.25 hole | yes | yes | 5 / 0 / 1 / 2 | 5 / 0 / 1 / 2 | same | 4 × 2.476581 | 4 × 2.476581 | 4 × 2.476581 |
| etch-text-flat (in) | new: Etch text "PN 123" + ETCH line, flange | yes | yes | 16 / 4 / 0 / 2 | 16 / 4 / 0 / 2 + 1 constr. | same | 5.0213 × 2 | 5.0213 × 2 (2.03 with the constr. line) | same |
| control-ezdxf-mm (mm) | ezdxf, not Anvil (DWG: Anvil's writer) | yes | yes | 5 / 0 / 1 / 1 | 5 / 0 / 1 / 1 | same | 100 × 50 | 100 × 50 | 100 × 50 |

**Every DWG matched its DXF twin entity for entity** (same counts, same construction lines, same text strings), and
every DWG came in at the right size. No entity was dropped or changed type. The hem flat's 2.476581 equals the blank
SolidWorks itself makes for that hem (rfDO). None of the examples has a hem, etch text or a hole across a bend, so the
three new flats come from small scripts (`dwg-check\*.js`, written by `dwg_flats.py`).

**Bug: Anvil's millimetre DXF comes into SolidWorks 25.4 × too big** (read as inches). The DWG twins and an ezdxf mm
DXF are fine. `unitprobe.py` bisected the header variables a fresh ezdxf drawing has and Anvil's lacks: the one that
fixes it is **`$DIMALTF`** (group 40, alternate-units scale factor). SolidWorks 2022 takes a DXF as metric only when
`$DIMALTF` is the metric template's 0.03937…; absent, it takes AutoCAD's imperial default (25.4) and reads the
coordinates as inches, whatever `$INSUNITS` (4) and `$MEASUREMENT` (1) say. `$LIMMIN/$LIMMAX`, `$DIMLUNIT`, `$AUNITS`,
`$DIMALT`, `$DIMSCALE`, metric DIM sizes did not help; an ezdxf re-save of Anvil's file (it keeps the header it read)
did not either. Anvil's `dwg-writer.js` already writes DIMALTF 0.0393700787 for metric (line 488), which is why the
DWGs are right.
- Where: the flat / face DXF header in `anvil/kernel-script.js` (around line 569, `P(9, '$INSUNITS'); P(70, this.insunits)`)
  and the drawing DXF header in `anvil/drawing-render.js` (line 1622). Not fixed here (not this lane's files).
- Fix: next to `$INSUNITS` write `9 $DIMALTF / 40 0.0393700787` when the units are mm and `40 25.4` when inches (the
  inch value is what SolidWorks assumes anyway; writing it keeps the file explicit). Probably the same for R12 output.
  Re-run `python head-tools/sw-reference/dwgcheck.py u-bracket normal-cut-bracket` after the fix: the DXF extents must
  read 210.744 × 60 and 135.372 × 60.

Other observations (SolidWorks' own behaviour, not Anvil bugs; the ezdxf control does the same):
- **Layers are not kept** in a part-sketch import: every segment's `Layer` is empty (OUTLINE / HOLES / BEND / NOTES /
  ETCH all land in the one sketch). BEND lines arrive as ordinary solid lines.
- The **construction lines** are not from the file: SolidWorks adds one per **rotated** TEXT (the bend notes along
  vertical bend lines) as the text's baseline (x of the bend line, as long as the text). The hem's bend note is
  horizontal and got none; the control's text is horizontal too.
- **Text** arrives as sketch text with the string unchanged, including AutoCAD's `%%d` degree code (`UP 90%%d R2`):
  SolidWorks does not translate `%%d` in a part sketch (the control file shows the same). Harmless for cutting; a
  shop that reads the notes in SolidWorks would see `%%d`.
- Anvil's Etch text is written as strokes (lines / arcs on ETCH), so it arrives as geometry, not text.

## 2. Miter Flange (works now)

Lane DO's `InsertSheetMetalMiterFlange` "refusal" was a wrong selection: `SelectByID2("", "EDGE", x, y, z, …)` picks
along the current view direction, and after the profile sketch on the Right plane the view looks along X, so the
point (2, 0, 2) picked the end face's short T-long edge at x = 0 instead of the top z = 2 edge (`miter2.py diag`
prints it). Picking the edges by geometry (walk `Body2.GetEdges`, match the end vertices, `Entity.Select4(True,
SelectData)` with `SelectData.Mark`) makes the same call work with every mark combination tried (sketch mark 0,
edges mark 1 or 0; sketch by `Select2`, by name or its line): `InsertSheetMetalMiterFlange(True, 0, gap, True, False,
0, 0, 0, 1, False, 1 (Material Inside), startOffset, endOffset, Nothing)`.

Part: 4 × 2 base, 16 ga (T = R = 0.0598), K 0.5, Auto Relief rectangular 0.5; profile a 1 in line up from the top
face at the z = 2 edge's x = 0 end (Right plane), along the z = 2 and x = 4 top edges, Material Inside, gap 0.01.
Flat vertices are the blank's top face, x along the base's x, second value along its z.

| case | wall top y | flat | flat volume | solid volume | flat corner (top face) | Anvil |
|---|---|---|---|---|---|---|
| start offset 0 | 1.0598 | 4.961500 × 2.961500 | 0.815429 | 0.815259 | notch from (3.933129, 1.933129) to the corner: each wall end 0.00707 = 0.01/√2 short of the other wall's inside face | wall top, flat size match; blank area × T 0.815091, the notch corner 0.0746 from SolidWorks', solid 0.818628: TODO |
| start offset 0.25 | 1.0598 | 4.961500 × 2.961500 | 0.800787 | 0.800618 | same corner; the z = 2 wall starts at x = 0.25 with a 0.0299 × 0.1495 relief (x 0.2201..0.25, z 1.8505..2) | wall top, flat size match; blank 0.799755, relief position off 0.123: TODO |

## 3. Closed Corner (works now)

The tray (two separate 1 in edge flanges, Material Inside, Outer Virtual Sharp, z = 2 edge then x = 4 edge) builds
once the second edge is picked by geometry (`corner2.py` swaps `swref.entity_at` for a geometric pick; `edge_flange`
itself is unchanged). Corner: face to extend = the x = 4 wall's end face (z = 1.8804) mark 1, face to match = the
z = 2 wall's inside face mark 0x40000000, `ModelDoc2.InsertSheetMetalClosedCorner()`, then
`IClosedCornerFeatureData` `CornerType` / `GapDistance` 0.01 / `OpenBendRegion` / `OverlapUnderlapRatio` 1 +
`ModifyDefinition`. **Trap:** the feature's type name is `CornerFeat` (DO's script looked for `ClosedCorner`, called
again, and the second call crashed the document).

Wall-top corner = the vertices at y = 1 near the corner, (x, z). All flats 4.901700 × 2.901700.

| corner | bend region | wall-top corner (x, z) | solid volume | flat volume | Anvil |
|---|---|---|---|---|---|
| none (tray) | | x = 4 wall ends z 1.8804, z = 2 wall to x = 4 | 0.795481 | 0.795481 | match (hard row) |
| Butt | open | both walls cut back square: z-wall ends x 3.933129, x-wall ends z 1.933129 (0.01 diagonal between the inside corners) | 0.793951 | 0.793951 | Anvil's Butt keeps the z-wall to x = 4 (SolidWorks' Underlap shape): TODO |
| Butt | closed | same | 0.794173 | 0.794451 | TODO |
| Overlap | open | z-wall ends x 3.9302 (gap short of the x-wall's inside), x-wall to z = 2 | 0.797305 | 0.797305 | wall corner matches; blank 0.798103 (bend strip runs on), flat notch: TODO |
| Overlap | closed | same | 0.797808 | 0.798166 | wall corner, flat size, blank match (hard row); outline 0.0213 off at (3.9302, 2), solid: TODO |
| Underlap | open | x-wall ends z 1.9302, z-wall to x = 4 | 0.797599 | 0.797599 | wall corner matches; blank 0.798103, flat notch: TODO |
| Underlap | closed | same | 0.797799 | 0.798166 | all but the faceted solid volume match (hard row) |

With *Open bend region* on, SolidWorks' blank stops the extended bend strip at the bend's start (the flat keeps the
square notch at (3.8804, 1.8804)); Anvil's open-region blank (0.798103) is larger than SolidWorks' in all three types.

## Tests

`anvil/tests/kernel/rfDU.js` (in the `kernel-tests.html` manifest): 2 hard rows (the tray before the corner; miter
wall top / flat size, Underlap closed, Overlap closed where they agree) and 8 `rfDU TODO:` rows that pass and list
each value still off. `node anvil/headless/anvil.js test`: 1363 / 1363.

## API calls that worked (add to the DO list)

- DXF / DWG to a part sketch: `GetImportFileData` + `ImportMethod("") = 2` (indexed property put) + `LoadFile4`; the
  `LengthUnit("")` read back is −1 (from the file). `ISketchSegment.GetType` / `IsCircle` / `GetRadius` /
  `ConstructionGeometry` are properties under late binding (`val()`), as is `ModelDoc2.GetUnits`.
- `SaveAs3` renames the document: close it by the title read after the save (the first `dwgcheck.py` run left its
  imports open until they were closed by title).
- Pick edges / faces by geometry, never `SelectByID2` at a point after a sketch changed the view:
  `Body2.GetEdges` + vertex match, `Face2.GetClosestPointOn`, then `Entity.Select4(append, SelectData)` with
  `SelectionMgr.CreateSelectData` (a property) and `.Mark`.
- Miter flange: sketch selected (mark 0), edges (mark 1), `FeatureManager.InsertSheetMetalMiterFlange(...)`; the
  feature lands before Flat-Pattern1.
- Closed corner: type name `CornerFeat`; call `InsertSheetMetalClosedCorner` once.
