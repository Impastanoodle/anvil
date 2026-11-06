# Checked against SolidWorks: what today's rounds added without a comparison (lane swcheck, 2026-11-02)

SOLIDWORKS 2022 SP5 over COM from Python (`head-tools/sw-reference/ref3_*.py`), the same input in Anvil (`anvil/tests/kernel/rfGW.js`, `smoke/rfGW.js`). Raw JSON, the saved parts and the drawing: `C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\2026-11-02\check-unmeasured\`.

27 rows: **9 match, 7 fixed, 7 differ, 4 need a person.** 54 documents, 12,236 handles at the start, 252,188 at the end, no document left open.

Inches, 16 ga (T = R = .0598, K .5) unless stated. Match = 1e-4 in, 1e-5 relative volume.

| # | input | SolidWorks | Anvil | result |
|---|---|---|---|---|
| 1a | Cross-Break on a 4 × 2 plate | volume .4784, 6 faces, flat 4 × 2, all unchanged; X in a construction sketch, corner to corner | same | match |
| 1b | Cross-Break PM defaults (Anvil 1°, sheet R) | `InsertCrossBreak` requires both values, 0 and 0 are stored as given; `CreateDefinition` returns nothing | 1°, sheet R | **needs a person** |
| 1c | Cross-Break note on the flat | drawing flat view: one note `DOWN 1° R .06` at the crossing, no bend line counted (`GetBendLines` 0) | DXF `CROSS BREAK UP 1° R.060` beside the crossing; no note in the drawing's flat view (known) | differs |
| 2 | Open Base Flange, L, U, Z, each both ways, plus two L with lines not end to end | thickness on the right of the chain in all 8; fixed face = longest flat's face on the sketch line (first of equal), looking away from the material; U reads UP UP, reversed U DOWN DOWN | was the side the chain turns to (L and U volumes wrong, both Z on the wrong side), far face fixed | **fixed** (`openBaseLayout`) |
| 3a | Bend Table, 4 bends, two make orders | `Tag, Direction, Angle, Inner Radius`; the last bend made is A; `0.06` | was upper case, first made is A, `.060` | **fixed** (`flatItems`); 3 places kept, `0.060`; Bend Ded. kept as Anvil's extra column |
| 3b | Bend Table on a view | adds a `Fixed Face` note at the view's centre | none | differs |
| 4 | Flange trim past the sheet end: 5° on .5 wide, 150° on .1 wide; 15° on 1 wide | both refused ("Unable to create the edge flange"); 15° builds .423100665 | both refused; 15° .423100665, same bbox | match |
| 5a | Jog Bend Outside, 90°, 45°, 30°, offsets .5, .2, .1, Fix projected length on / off | `InsertSheetMetalJog` refuses it; made at another position and edited to Bend Outside it builds. 90° fix .528990903, 45° fix .502246731, section x 3.0 / 3.1794 | same volumes and bboxes; all four positions' sections match | match |
| 5b | Butt, Material Outside, wall B's end to wall A | open .822069622, closed .822292261, blanks .822070059, .822570224 | .822070059, .822292202, same blanks to 1e-9 | match |
| 5c | Same corner, wall A's end face picked | builds, .822060435, same blank | refuses: "no flange face across the corner" (the faces are coplanar, d = 0) | **fixed** (lane rfIS, 2026-11-05): `ccSwap` closes wall B's end to A as SolidWorks; blank .822070059 and outline to the digit, folded .822070059 (SolidWorks .822060435, 1.2e-5 under its own blank) |
| 5d | Miters. 120° on a square corner, L .89642; 90° on a trapezoid, L .9402; Miter Flange L profile | folded 2.064856, 1.498330, 1.016735; blank × T 2.065667, 1.498723, 1.017195; flat 7.08429 × 5.08429, 7.04915 × 4.42297, 5.48280 × 3.48280 | folded 2.069402, 1.504754, 1.020509; blank × T 2.065711, 1.499404, 1.016857; flat 7.08429 × 5.08429, 7.05186 × 4.42297, 5.48280 × 3.48280 | differs: SolidWorks runs one straight line from a point past the corner; Anvil's mitre reaches the base corner, and its folded solid is 3.6e-3 to 5.4e-3 over its own blank. The multi-edge lengths above were set to SolidWorks' walls (its profile sketch sets them). **Fixed for the edge flanges** (lane rfIS, 2026-11-05; rfIS.js): default gap .01; walls cut square along the inside-face line; bend ends a helicoid from the base corner; strips' lines run on to meet past the corner. Square 120°: folded 2.064874, blank 2.065667, outline exact; trapezoid: 1.498335, 1.498723 exact (also an overlap-strip sliver at its free acute corner, 3.6e-5, gone). Both engines. **Miter Flange L profile fixed too** (lane rfIZ, rfIZ.js): square first-line strips, later stages joined where the edge lines cross, the second bend's end t − tB = e·(1 − cos θ); blank 1.017194654 and all 10 outline corners exact, folded 1.016752 (SolidWorks 1.016735) |
| 6 | Close Sketch to Model, ends on and off the edges | no API member; `swCommands_Sk_Close_Contour` says "The sketch cannot be closed." for both cases, on a plane and on the face, so it proves nothing | refuses ends off the edges | **needs a person** |
| 7a | Make Path: one entity, a chain, gap, branch, closed triangle | path 1 seg, 3 segs, refused ("do not form a continuous path"), no path, 3 segs | same five | match |
| 7b | Edit Path, Dissolve Path, tangent pick-up of one entity | PropertyManager and right-click only | built | **needs a person** |
| 8 | Derived Sketch, moved end, added line, Underive | same coordinates as parent; follows both; Underive keeps entities, stops following | same | match |
| 9 | Create Sketch from Selections, 2 of 4 entities | new sketch with those 2, source keeps 4, stays in the source | same | match |
| 10 | Autodimension (dimensions only), corner rectangle + circle + slot, baseline | 8 dimensions, 6 linear + 2 radial, fully defined; slot by x 2.5 and its centre 3.0 | 8 too, 6 linear, Ø, slot width; slot by its ends 2.5, 3.5 | differs: second slot dimension. Chain: SolidWorks' listing stopped at 4, not compared |
| 11a | Rollback onto a feature | its sketch is rolled too; `EditRollback` after the sketch still rolls it | sketch stayed above the bar | **fixed** (`rollbarAbsorbed`) |
| 11b | New feature while rolled back | lands at the bar, above the rolled sketch | same | match |
| 12 | Thickness Analysis corner rule | Utilities add-in not loaded; not loaded here, to leave the session as it was | | **needs a person** |
| 13a | Slot mate, slot centres -1.25, .25 | Distance 0: -1.25; Percent 0: -1.25; flip: .25; .3: -.95; 50 %: -.5; 25 % flip: -.125; centre -.5 | same after a fix: a round hole of the slot's width in line with it was taken for the far end | **fixed** (`findSlot`) |
| 13b | Hinge defaults | `CreateMateData`: closest; Define Angle off | was anti-aligned | **fixed** |
| 13c | Symmetric defaults, two free parts | aligned; the first entity's part moves | was closest, second moved | **fixed**, on one sample |
| 13d | Symmetric, parallel faces both one side of the plane | refused: "both on the same side of the symmetry plane" | moves the part across | differs |
| 14 | Hole callouts, read from the sheet as DXF | drill line on top in all: `Ø .27 THRU ALL` over `⌵ Ø .51 X 82°`; `Ø .20 ↧ .75` over `1/4-20 UNC ↧ .50`; `Ø .27 THRU ALL` over `⌴ Ø .44 ↧ .25` | countersink was right; thread and counterbore were upside down, a misread of the API's text slots in the earlier report | **fixed** (`wizardLines`) |
| 15a | Tangent edge modes | Visible, With Font, Removed; `SetDisplayTangentEdges2` takes all three | same three | match (the API's edge count does not change with the mode, so line styles are not compared) |
| 15b | Default on a new view | Visible (this PC's system option 2) | Removed | differs: not changed, every drawing test and new view would move; one line in `addView` if wanted |

Also seen: Slot mate Free rests at x -.2307 in SolidWorks, at the slot end .25 in Anvil, both inside the slot. Hinge's data object starts Angle, Min and Max at 30°; read back as 0 after the mate.

## Corrections to earlier notes

- Report 2 section 5 and rfGT read `GetText(1)` as the top line. It is the Prefix; the drill is in Callout Above, on top.
- The report's "Jog Bend Outside refused" was the API call, as it suspected.
- A closed Base Flange is not a mismatch in UP / DOWN: SolidWorks' sheet lies below the sketch and Anvil's above it, the same rule relative to the sketch. A comparison by world position reads reversed.

## SolidWorks incident

`RunCommand(1048)` raised a modal "The sketch cannot be closed." box and blocked the script; the script timed out with Part41 open. I read the box, pressed its OK, ran two more tries with a watcher that did the same, and closed Part41. No foreign document was ever open.

## Test pins changed outside rfGW

rfGL, rfGV, rfV, rfAN, hole-wizard, p9-bendtable, p9-drawing; smoke rfGL, rfGQ, rfGT, rfAI, rfAJ, p9-bendtable. Each pinned the old behaviour named above.
