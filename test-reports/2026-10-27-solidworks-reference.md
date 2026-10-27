# SolidWorks reference values for Anvil sheet metal (lane DO, 2026-10-27)

Each part was built in SolidWorks through its COM API from Python (scripts in `head-tools/sw-reference/`), measured,
saved to `C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\` (one `.SLDPRT` per case plus the raw
`jog.json`, `flange.json`, `hem.json`), and then built in Anvil's script API in `anvil/tests/kernel/rfDO.js`.

- **SolidWorks version:** the copy installed here is **SOLIDWORKS 2022 SP5**, not 2024. The numbers below are 2022's.
- **Part:** 16 ga steel, T = R = 0.0598 in, K-factor 0.5, Auto Relief rectangular 0.5; a 4 × 2 base flange on the
  Top plane, x 0..4, z 0..2. SolidWorks thickens a Top-plane base flange to −Y whatever `ThickenDir` says, so every
  SolidWorks Y below is shifted by +T to Anvil's frame (base y 0..T).
- **Match** means within 1e-4 in. Mismatches are `rfDO TODO:` rows in `rfDO.js`: they pass and their detail lists
  each value that is off; once Anvil agrees the detail says to promote the row to a hard test.
- SolidWorks volume always equals the flat volume here (K 0.5 keeps the neutral axis in the middle), so Anvil's
  exact check is blank area × T. Anvil's solid volume (`mp.volume`) is faceted at the bends, about 2e-4 in³ low.

## 1. Jog: line across the plate at x = 3 on the top face, offset 0.5, 90°, Bend Centerline, x < 3 fixed

SolidWorks jogs away from the sketched face (down, Anvil `reverse: true`). Jogged flange = vertices with x > 3.5.

| Dimension position | Fix projected length | flange y (bottom / top) | far end x | flat length | volume | Anvil | |
|---|---|---|---|---|---|---|---|
| Outside Offset | off | −0.5 / −0.4402 | 3.576999 | 4.0 | 0.4784 | same | match |
| Inside Offset | off | −0.5598 / −0.5 | 3.517199 | 4.0 | 0.4784 | same | match |
| Overall Dimension | off | −0.4402 / −0.3804 | 3.636799 | 4.0 | 0.4784 | same | match |
| Outside Offset | on | −0.5 / −0.4402 | 4.0 | 4.423001 | 0.528991 | x 3.577, flat 4 | TODO |
| Inside Offset | on | −0.5598 / −0.5 | 4.0 | 4.482801 | 0.536143 | x 3.517, flat 4 | TODO |
| Overall Dimension | on | −0.4402 / −0.3804 | 4.0 | 4.363201 | 0.521839 | x 3.637, flat 4 | TODO |

**Settled:** Anvil's `jog.offsetRef` already means what SolidWorks means. Outside Offset = face to the same face
(base bottom to jogged-flange bottom); Inside Offset = the clear gap between the facing faces; Overall Dimension =
the outside span (inside + 2T). Fix projected length on keeps the far end where it was and grows the blank by
(4 − far end x); Anvil has no such option (it behaves as "off"). Anvil's faceted solid volume 0.478184 vs 0.4784 is
a TODO row.

## 2. Edge flange 1 in on the z = 2 edge, Material Inside

| angle | Flange Length | tip y | tip z | flat length | volume | Anvil tip z / flat | |
|---|---|---|---|---|---|---|---|
| 90 | Outer Virtual Sharp | 1.0 | 2.0 | 2.901700 | 0.694087 | 2.0 / 2.901700 | match |
| 90 | Tangent | 1.0 | 2.0 | 2.901700 | 0.694087 | 2.0 / 2.901700 | match |
| 120 | Outer Virtual Sharp | 0.866025 | 1.534526 | 2.808086 | 0.671694 | 1.587553 / 2.861114 | tip y match, rest TODO |
| 120 | Tangent | 0.941849 | 1.490749 | 2.895640 | 0.692637 | 1.543777 / 2.948667 | tip y match, rest TODO |
| 135 | Outer Virtual Sharp | 0.707107 | 1.352693 | 2.693671 | 0.644326 | 1.462033 / 2.803011 | tip y match, rest TODO |
| 135 | Tangent | 0.826707 | 1.233093 | 2.862811 | 0.684784 | 1.342433 / 2.972151 | tip y match, rest TODO |

**Settled:** Anvil's `lengthRef: 'tangent'` above 90° measures the same length as SolidWorks (the tip heights agree;
QUEUE 2026-10-07T11 can close on that point). **Mismatch:** where Material Inside puts the flange above 90°.
SolidWorks keeps the flange's outer face running through the base's top outside edge, so the outer virtual sharp is
T·tan(A − 90°) past the end (2.0345 at 120°, 2.0598 at 135°). Anvil puts it (R + T)(tan(A/2) − 1) past (2.0876,
2.1691): the flange stands 0.0530 (120°) / 0.1093 (135°) further out and the flat is that much longer.

## 3. Hems on the z = 2 edge, length 0.5

SolidWorks values; "end z" is the hem's free end, "outer z" the fold's outermost point (IBody2.GetExtremePoint).

| hem | position | top y | outer z | end z | flat length | volume | Anvil | |
|---|---|---|---|---|---|---|---|---|
| Rolled 270°, R = T | Material Inside | 0.2392 | 2.0 | 1.7608 | 2.303101 | 0.550902 | same | match |
| Open, gap 0.03 | Material Inside | 0.1496 | 2.0 | 1.5 | 2.491458 | 0.595957 | end 1.4252, flat 2.566258 | top match, rest TODO |
| Closed | Material Inside | 0.123537 | 2.0 | 1.5 | 2.476581 | 0.592398 | top 0.121992, end 1.439004, flat 2.536695 | TODO |
| Tear Drop 200°, R = T | Material Inside | 0.2392 | 2.0 | 1.528204 | 2.524781 | 0.603928 | end 1.527377, flat 2.525661 | TODO (8.8e-4) |
| Tear Drop 270°, R = T | Material Inside | refused by SolidWorks (`InsertSheetMetalHem2` returned Nothing) | | | | | | n/a |
| Open, gap 0.03 | Material Outside | 0.1496 | 2.0748 | 1.5748 | 2.566258 | 0.613849 | end 1.5, flat 2.641058 | outer z match, rest TODO |
| Closed | Material Outside | 0.123537 | 2.061769 | 1.561769 | 2.538349 | 0.607173 | outer z 2.060996, end 1.5, flat 2.597691 | TODO |

**Mismatches:**
- SolidWorks' hem length is the overall length from the fold's outer face to the free end (inside: the end sits at
  z = 2 − 0.5 = 1.5; outside: outer z − 0.5). Anvil's `length` is the straight leg after the fold, so every Anvil
  open / closed hem is R + T (open: 0.0748) longer.
- SolidWorks' Closed hem keeps a 0.1 mm (0.003937 in) gap between the leaves (radius 0.001969); Anvil uses 0.04·T
  (0.002392 in), so the top and the flat differ.
- Tear drop: Anvil's tail stops 2·0.02·T above the sheet; SolidWorks' tail is about 8.8e-4 shorter.
- Rolled hems agree exactly.

## 4. Miter flange: blocked

`IFeatureManager.InsertSheetMetalMiterFlange` (the only miter call in the 2022 API; `CreateDefinition` has no
miter type) returned Nothing for every selection tried: a 1 in vertical profile on the Right plane at the z = 2
edge's end (checked in the part box), selected with `Select2` or `SelectByID2` by name, then the z = 2 and x = 4 top
edges (or one), marks 0 / 1 / 4, sketch first or edges first, Material Inside and Bend Outside, default or custom
relief and radius. No reference numbers, so no test was written. Next lane: record a macro of the Miter Flange
PropertyManager in SolidWorks (Tools ▸ Macro ▸ Record) to see the selection marks it uses, then run `miter.py`.

## 5. Closed corner: blocked

The tray needs two separate edge flanges on adjacent edges. The second (x = 4 edge, after the z = 2 flange) is
refused by `InsertSheetMetalEdgeFlange2` with every relief type (default, none, rectangular, obround, tear) though
the same flange alone on the plate builds. `corner.py` holds the closed-corner calls from the API help example
(face to extend mark 1, face to match mark 0x40000000, `InsertSheetMetalClosedCorner`, then `IClosedCornerFeatureData`
`CornerType` / `GapDistance` / `OpenBendRegion` / `OverlapUnderlapRatio` + `ModifyDefinition`), untested. Next try:
make the second flange with `CreateDefinition(swFmEdgeFlange)` + `AddEdges` + `CreateFeature`, or make both walls in
one edge-flange feature and cut the corner open.

## API calls that worked (SolidWorks 2022 SP5, pywin32 late binding)

All in `head-tools/sw-reference/swref.py`; run any item with `python head-tools/sw-reference/<item>.py`.

- **New part:** `sw.NewDocument(sw.GetUserPreferenceStringValue(8), 0, 0, 0)`, `SetUnits(3, 0, 0, 0, False)`.
- **Sketch:** select the plane feature (`Select2`) or a face (`SelectByID2("", "FACE", x, y, z, …)`),
  `SketchManager.InsertSketch(True)`, `AddToDB = True`, `CreateLine`, `AddToDB = False`, `InsertSketch(True)`.
  Setting `DisplayWhenAdded = False` hung SolidWorks: leave it. The new sketch is the last `ProfileFeature`, not
  the last feature (Flat-Pattern1 stays last in a sheet-metal tree).
- **Base flange:** `FeatureManager.InsertSheetMetalBaseFlange2(T, ThickenDir, R, 0, 0, False, 0, 0, 0, cba, False,
  1, 0, 0, 0.5, True, False, True, True)` with `cba = FeatureManager.CreateCustomBendAllowance` (`Type = 2`,
  `KFactor = 0.5`). Thickens to −Y on the Top plane either way. Then the SheetMetal feature's definition:
  `UseAutoRelief = True`, `AutoReliefType = 1`, `ReliefRatio = 0.5`, `SetCustomBendAllowance`, `ModifyDefinition`.
- **Jog:** sketch one line on the face, edge to edge (a line past the edges, or on the Top plane, made no jog);
  select the sketch, then the fixed face with mark 0; `ModelDoc2.InsertSheetMetalJog(90.0, R, offset, False, fix,
  dimPos, bendPos)` — **the angle is in degrees** (π/2 made nothing), lengths in metres; it sometimes makes nothing
  the first time, so retry. Its `DimPos` argument is **not** `swJogDimensionPositionType_e` (2 stored Inside, 1
  stored Outside): set `IJogFeatureData.DimensionPositionType` / `JogPositionType` / `FixProjectedLength` after and
  `ModifyDefinition`.
- **Edge flange:** `InsertSketchForEdgeFlange(edge, angle_rad, False)`, `EditSketch`, `SketchUseEdge(False)` on the
  edge, a rectangle square to the converted line (it can come out vertical in the sketch), `InsertSketch(True)`,
  then `InsertSheetMetalEdgeFlange2([edge], [sketch], 1 + 128, angle_rad, R, position, L, …, 1, Nothing)`. The
  profile sketch drives the length and Tangent fails here, so set `IEdgeFlangeFeatureData.OffsetType = 1`,
  `OffsetDimType` (1 Outer Virtual Sharp, 2 Inner, 3 Tangent), `OffsetDistance` and `ModifyDefinition` after.
- **Hem:** select the edge, `FeatureManager.InsertSheetMetalHem2(type, position, False, L, gap, angle_rad, radius,
  0, Nothing, True, 1, 0, True, 0.5, 0, 0)`; `swHemTypes_e` open 0, closed 1, tear drop 2, rolled 3; position
  inside 0, outside 1.
- **Flat pattern:** the `FlatPattern` feature, `SetSuppression2(1, 2, Nothing)` (unsuppress), `ForceRebuild3`,
  `GetPartBox(True)` and `GetMassProperties[3]`, then `SetSuppression2(0, 2, Nothing)`.
- **Measuring:** `GetMassProperties` index 3 = volume; vertices from `Body2.GetVertices` / `Vertex.GetPoint`
  (both properties under late binding); exact extremes on curved faces with `Body2.GetExtremePoint` called through
  `InvokeTypes` with three `VT_R8 | VT_BYREF` out parameters (a plain call fails "Type mismatch").
- Obsolete-but-working members used: `InsertSheetMetalBaseFlange2`, `InsertSheetMetalEdgeFlange2`,
  `GetActiveSketch2`, `ModelDoc2.SketchUseEdge` (`api_audit.py` lists them).
