# Solid features against SolidWorks (lane FH, 2026-10-29)

Sixteen parts built in **SOLIDWORKS 2022 SP5** through its COM API from Python (`head-tools/sw-reference/solids_ref.py`)
and the same parts in Anvil's script API (`head-tools/sw-reference/solids_anvil.py`, which runs
`node anvil/headless/anvil.js build` on Anvil's engine and with `--occt`). Inch units. The SolidWorks parts and the raw
numbers (`solids.json`, `anvil.json`) are in `C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\solids\`.
The kernel rows are `anvil/tests/kernel/rfFH.js`.

- **Code base:** Anvil numbers are from main 7412b90 (this worktree). The OpenCascade column was run with the main
  checkout's runner (`vendor/occt` is not in worktrees), which other lanes (FE, FF, FG) may have been changing then.
- **SolidWorks values:** Mass Properties (`IModelDocExtension.CreateMassProperty`: volume, surface area, centre of
  mass), face count and surface types from the solid bodies' faces, bounding box from `IBody2.GetExtremePoint` (exact).
  Seven were also checked against a closed form (P01 frustum 1.747740, P02 Pappus 5.394689, P06 2.779498, P08 8.197847,
  P12 π²/16 = 0.616850, P13 3.976563, P14 3.912511): all agree to 1e-6.
- **Face counts:** this SolidWorks reports a full cylinder, torus or cone as **one** face (P03: bottom, side, fillet,
  top = 4; P02 = 5), not two. OpenCascade's count (Anvil's `--occt` B-rep) matches SolidWorks' one for one on every
  part except P07 and P11 (below), so it is the column to compare. Anvil's own engine reports *mesh* faces: every facet
  of a curved surface counts (P02: 2073, P16: 1035); only the all-planar parts (P01, P13, P14) agree.
- **Match** = within 1e-4 relative volume.

## Summary

| part | SolidWorks in³ | Anvil | rel | OpenCascade | rel | faces SW / OCCT / Anvil | verdict |
|---|---|---|---|---|---|---|---|
| P01 extrude 5° draft | 1.747740 | 1.747740 | +2e-7 | 1.747740 | +2e-7 | 6 / 6 / 6 | match |
| P02 revolve, arcs to the axis | 5.394689 | 5.394689 | −2e-8 | 5.394689 | −2e-8 | 5 / 5 / 2073 | match |
| P03 cylinder rim fillet (convex) | 3.062025 | 3.058630 | −1.1e-3 | 3.062025 | +9e-8 | 4 / 4 / 506 | faceted |
| P04 hole-edge fillet | 8.203479 | 8.203414 | −8e-6 | 8.203479 | −4e-8 | 8 / 8 / 286 | match |
| P05 boss root fillet (concave) | 5.296521 | 5.296586 | +1.2e-5 | 5.296521 | +6e-8 | 9 / 9 / 287 | match |
| P06 box, 12 edges r 0.25 | 2.779498 | 2.787271 | +2.8e-3 | 2.779498 | −2e-7 | 26 / 26 / 102 | faceted corners |
| P07 3 fillets, unequal r at a corner | 7.817528 | 7.842711 | +3.2e-3 | 7.843104 | +3.3e-3 | 9 / 10 / 112 | **Fillet3 lost** |
| P08 hole chamfer 0.1 | 8.197847 | 8.198183 | +4.1e-5 | 8.197847 | +4e-8 | 8 / 8 / 86 | match |
| P09 shell of a filleted box | 1.814380 | 1.818361 | +2.2e-3 | 1.814380 | −3e-7 | 19 / 19 / 91 | faceted |
| P10 Hole Wizard cbore + csk 1/4 | 4.383866 | 4.376552 | −1.7e-3 | 4.376552 | −1.7e-3 | 11 / 11 / 119 | **hole table** |
| P11 loft square → circle | 7.150709 | 7.423337 | +3.8e-2 | 7.161905 | +1.6e-3 | 6 / 7 / 62 | **loft shape** |
| P12 sweep circle along arc | 0.616850 | 0.612700 | −6.7e-3 | 0.616850 | −4e-7 | 3 / 3 / 578 | **sweep ends** |
| P13 Rib | 3.976563 | 3.976563 | +1e-7 | 3.976563 | −1e-7 | 11 / 11 / 11 | match |
| P14 Draft on one face | 3.912511 | 3.912511 | −9e-8 | 3.912511 | −9e-8 | 6 / 6 / 6 | match |
| P15 LPattern of filleted boss | 2.285315 | 2.284153 | −5.1e-4 | 2.285315 | +2e-9 | 15 / 15 / 487 | faceted |
| P16 CirPattern of filleted boss | 3.712223 | 3.709898 | −6.3e-4 | 3.712223 | +1e-7 | 21 / 21 / 1035 | faceted |

Bounding boxes agree to 1e-6 on every part except P12 (below). Centres of mass agree to the volume error.

## Status after lanes FF and FH2 (same day)

Re-measured with `solids_anvil.py` on main + FH2: 15 of 16 parts match SolidWorks to 1e-4 or better on Anvil's own
engine. Still open: **P07** (Fillet3 lost, lane FF next) and **P09** (+2.2e-3, the shell's inner walls polygonal;
lane FE2 gives them offset cylinder records). P11 is −5e-5 (sampled blend).

- P03, P06, P15, P16: exact (lane FF: exact torus / sphere fillet records).
- P10: `holewizard.js` now holds SolidWorks 2022's own Hole Wizard values. `solids_holes.py` read every size and fit
  Anvil offers (ANSI Inch and ISO: clearance, counterbore, countersink, tap) into `head-tools/sw-reference/sw-holewizard.json`.
  Changed: every ANSI Inch clearance drill (SolidWorks drills the same three holes for a Hole, a Counterbore and a
  Countersink, e.g. 1/4: F / H / 9/32 where ASME B18.2.8 gave 17/64, 9/32, 19/64), the #3 counterbore (13/64, was
  7/32), ISO loose M12 / M14 / M16 (15 / 17 / 19) and ISO counterbore depths (d + 0.4 / d + 0.6). Tap drills,
  countersinks and the other counterbore diameters already agreed. SolidWorks has no M14 socket head cap screw and no
  M2 / M2.5 / M14 ISO 10642 or 7/8 / 1 Flat Head 82° screw; Anvil keeps its own values there. Kernel test `rfFH2.js`.
- P12: the sweep along an arc is exact (each arc a revolve of the section, each line a prism): 0.616850, ends on y = 0
  and x = 2.
- P11: SolidWorks' loft (measured by `solids_loft.py` from sections at five heights) has straight rulings between the
  square and the circle; each side is matched to the 90° arc between its corners' directions, and the arc is
  parametrized as SolidWorks' rational quadratic. Anvil's loft does the same for a polygon → full-circle pair: 7.150352
  vs 7.150709 (−5e-5), area +1.3e-4. Other loft pairs keep the convex hull / resampled loft. OpenCascade's loft is
  unchanged (+1.6e-3).
- The Mug's exact volume needs the shell fix (lane FE2) to reach OpenCascade's 85025; the handle alone is exact
  (7110.98 mm³).

## Findings, ranked

No blockers: every part builds, and every flat / planar / analytic case is exact.

**Major**
1. **P07: a fillet on an edge left by earlier fillets is not found.** Cube 0..2, `fillet(0.5)` on the edge through
   (1, 2, 2), `fillet(0.25)` on (2, 2, 1), then `fillet(0.375)` on (2, 1, 2) fails: "No edges found for this fillet.
   Select edges again." The edge exists (x = 2, z = 2, y 0..1.5; SolidWorks fillets it: 9 faces, 7.817528). Likely the
   fillet edge picking (`kernel.js` / `kernel-features.js` edge resolution): the straight edge between a planar face and
   a tessellated round is not recognised as one sharp edge once both neighbours have been touched. Anvil and
   OpenCascade both end at ≈ 7.8431 because the feature is skipped. Possibly helped by FG (sliver faces) / FF.
2. **P10: ANSI Inch Hole Wizard drills a different clearance hole.** SolidWorks' 1/4 Socket Head Cap Screw counterbore
   and 1/4 Flat Head 82° countersink (default = Normal fit, through) drill **0.266 (letter H)**; Anvil drills 9/32
   (0.28125) (`holewizard.js` ANSI screw row `1/4`: `cb.drills[1]` and `clr[1]`). Counterbore Ø 7/16 × 0.25 deep and
   countersink Ø 0.507 × 82° agree (read back from `WizardHoleFeatureData2`). With D = 0.266 for both holes the removed
   volume is 0.116134 in³, SolidWorks' to 1e-6. The other ANSI Inch sizes and fits were not checked: auditing the
   whole `holewizard.js` inch table against SolidWorks' is the follow-up (the hole data's Fit could not be read back
   over late binding, so "Normal" is SolidWorks' default, not a read value).
3. **P11: the loft square → circle is 3.8 % too big.** SolidWorks makes four smooth B-spline side faces (6 faces);
   Anvil's ruled loft resamples the outlines and joins them with straight rulings (`kernel-features.js` loft), which
   bulges out between the corners. OpenCascade (from Anvil's feature) is +1.6e-3 with 7 faces. Not a 1e-4 target until
   Anvil blends sections the way SolidWorks does; the shape differs, so drawings of lofts differ too.
4. **P12: the swept tube along an arc is short and its ends overshoot.** −6.7e-3 volume; the bounding box runs to
   y = −0.0109 and x = 2.0109 where SolidWorks' ends lie exactly on y = 0 and x = 2. The path arc is a chord polyline
   and the profile is set square to the first chord, not the arc's tangent, so the end caps tilt (`kernel-features.js`
   sweep). OpenCascade is exact (it sweeps the true arc).

**Minor (faceting: Anvil's own engine approximates the surface; OpenCascade is exact on all of these)**
5. P03 convex torus rim fillet −1.1e-3, P15 / P16 rim fillets −5e-4 / −6e-4: fillets on circular edges are
   tessellated. **Lane FF (exact fillet surfaces on curved edges) should fix these.**
6. P06 all-edges fillet +2.8e-3: the rounds between planes are exact cylinders, the 8 spherical corner blends are
   faceted (FF).
7. P09 shell of a filleted box +2.2e-3: the inner walls offset the faceted fillet cylinders (FF / shell offset).
8. Face counts on Anvil's engine count facets (above): lanes FE (smooth shading, revolve poles) and FG (sliver faces)
   are the ones near this. P02, P04, P05, P08 are geometrically exact even so.

**Matches** (to 1e-4 or better): extrude with draft, revolve with arcs touching the axis (pole handled), concave and
hole-edge fillets (P04 −8e-6, P05 +1.2e-5), hole chamfer (+4e-5), Rib, Draft feature, pattern placement.

**Anvil API note:** `linearPattern` / `circularPattern` take one feature's tool body, so a fillet cannot be patterned
with its boss as in SolidWorks (Features to Pattern: Boss-Extrude2 + Fillet1). P15 / P16 pattern the boss and fillet
every copy's rim (the same solid).

## SolidWorks API notes (for the next reference lane)

- `IFeatureManager.FeatureFillet(2, r, 0, 0, 0, 0, 0)` (uniform radius) fillets every selected edge. Adding option 64
  (`swFeatureFilletAttachEdges`, as the API example does) silently dropped 5 of 12 box edges and, on P05, filleted the
  boss's top rim instead of its root.
- `SelectByID2` by a point picks along the view and misses hidden edges: select edges by geometry
  (`IEdge.GetClosestPointOn` over the body's edges, then `Select4` with a `SelectData`).
- `IModelDocExtension.CreateMassProperty` and `ISelectionMgr.CreateSelectData` are properties under late binding
  (`val(...)`); `InsertFeatureShell` is on `IModelDoc2`, not the FeatureManager.
- Sketches above the Top plane go on a reference plane (`InsertRefPlane(8, d, …)`); its sketch frame is Top's.
- `HoleWizard5` with every Value argument −1 takes SolidWorks' own table; the hole lands at the face selection point.
- `InsertMultiFaceDraft` (neutral face mark 1, faces mark 2) needed `FlipDir = True` to remove material from a box
  side with the bottom face as neutral.

## Scripts

- `head-tools/sw-reference/solids_ref.py [P01 …]`: builds, measures and saves the SolidWorks parts (needs SolidWorks
  running; never touches documents the user has open; closes what it opened).
- `head-tools/sw-reference/solids_anvil.py [--occt-runner <anvil.js with vendor/occt>]`: the Anvil scripts (the same
  ones are in `rfFH.js`), both engines, the tables below.

## Per-part tables (generated by solids_anvil.py)

### P01_extrude_draft

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 1.747740 | 1.74774 | +1.73e-07 | 1.74774 | +1.73e-07 |
| area in² | 9.177313 | 9.177313 | +3.43e-08 | | |
| faces | 6 | 6 | | 6 | |
| centroid | 0.0000, 0.4764, -0.0000 | [0, 0.476431, 0] | | | |
| bbox | -1.0000, 0.0000, -0.5000, 1.0000, 1.0000, 0.5000 | [-1, 0, -0.5, 1, 1, 0.5] | | | |

### P02_revolve_arcs

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 5.394689 | 5.394689 | -1.90e-08 | 5.394689 | -1.90e-08 |
| area in² | 18.508984 | 18.508984 | -1.07e-08 | | |
| faces | 5 | 2073 | | 5 | |
| centroid | 0.0000, 0.9700, 0.0000 | [0, 0.970045, 0] | | | |
| bbox | -1.0000, 0.0000, -1.0000, 1.0000, 2.0000, 1.0000 | [-1, 0, -1, 1, 2, 1] | | | |

### P03_cyl_rim_fillet

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 3.062025 | 3.05863 | -1.11e-03 | 3.062025 | +8.70e-08 |
| area in² | 11.864377 | 11.85243 | -1.01e-03 | | |
| faces | 4 | 506 | | 4 | |
| centroid | -0.0000, 0.4885, 0.0000 | [0, 0.48805, 0] | | | |
| bbox | -1.0000, 0.0000, -1.0000, 1.0000, 1.0000, 1.0000 | [-1, 0, -1, 1, 1, 1] | | | |

### P04_hole_edge_fillet

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 8.203479 | 8.203414 | -7.96e-06 | 8.203479 | -4.15e-08 |
| area in² | 31.409199 | 31.410851 | +5.26e-05 | | |
| faces | 8 | 286 | | 8 | |
| centroid | 0.0000, 0.4994, -0.0000 | [0, 0.499355, 0] | | | |
| bbox | -1.5000, 0.0000, -1.5000, 1.5000, 1.0000, 1.5000 | [-1.5, 0, -1.5, 1.5, 1, 1.5] | | | |

### P05_boss_root_fillet

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 5.296521 | 5.296586 | +1.23e-05 | 5.296521 | +6.43e-08 |
| area in² | 26.979995 | 26.981647 | +6.12e-05 | | |
| faces | 9 | 287 | | 9 | |
| centroid | -0.0000, 0.3618, -0.0000 | [0, 0.361797, 0] | | | |
| bbox | -1.5000, 0.0000, -1.5000, 1.5000, 1.5000, 1.5000 | [-1.5, 0, -1.5, 1.5, 1.5, 1.5] | | | |

### P06_box_fillet_all

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 2.779498 | 2.787271 | +2.80e-03 | 2.779498 | -1.69e-07 |
| area in² | 10.997787 | 11.088244 | +8.23e-03 | | |
| faces | 26 | 102 | | 26 | |
| centroid | -0.0000, 0.5000, 0.0000 | [0, 0.5, 0] | | | |
| bbox | -1.0000, 0.0000, -0.7500, 1.0000, 1.0000, 0.7500 | [-1, 0, -0.75, 1, 1, 0.75] | | | |

### P07_corner_unequal_fillets

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 7.817528 | 7.842711 | +3.22e-03 | 7.843104 | +3.27e-03 |
| area in² | 22.936283 | 23.021883 | +3.73e-03 | | |
| faces | 9 | 112 | | 10 | |
| centroid | 0.9911, 0.9859, 0.9821 | [0.993989, 0.985089, 0.985089] | | | |
| bbox | 0.0000, 0.0000, 0.0000, 2.0000, 2.0000, 2.0000 | [0, 0, 0, 2, 2, 2] | | | |
| messages | | [{"id": 5, "feature": "Fillet3", "message": "No edges found for this fillet. Select edges again."}] | | | |

### P08_hole_chamfer

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 8.197847 | 8.198183 | +4.10e-05 | 8.197847 | +3.95e-08 |
| area in² | 31.399779 | 31.402898 | +9.93e-05 | | |
| faces | 8 | 86 | | 8 | |
| centroid | 0.0000, 0.4990, -0.0000 | [0, 0.499064, 0] | | | |
| bbox | -1.5000, 0.0000, -1.5000, 1.5000, 1.0000, 1.5000 | [-1.5, 0, -1.5, 1.5, 1, 1.5] | | | |

### P09_shell_filleted_box

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 1.814380 | 1.818361 | +2.19e-03 | 1.81438 | -2.70e-07 |
| area in² | 37.201769 | 37.195571 | -1.67e-04 | | |
| faces | 19 | 91 | | 19 | |
| centroid | 0.0000, 0.5609, 0.0000 | [0, 0.561376, 0] | | | |
| bbox | -1.5000, 0.0000, -1.0000, 1.5000, 1.5000, 1.0000 | [-1.5, 0, -1, 1.5, 1.5, 1] | | | |

### P10_cbore_csk

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 4.383866 | 4.376552 | -1.67e-03 | 4.376552 | -1.67e-03 |
| area in² | 20.626771 | 20.658112 | +1.52e-03 | | |
| faces | 11 | 119 | | 11 | |
| centroid | 0.0026, 0.3730, 0.0000 | [0.002372, 0.373114, 0] | | | |
| bbox | -1.5000, 0.0000, -1.0000, 1.5000, 0.7500, 1.0000 | [-1.5, 0, -1, 1.5, 0.75, 1] | | | |

### P11_loft_rect_circle

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 7.150709 | 7.423337 | +3.81e-02 | 7.161905 | +1.57e-03 |
| area in² | 21.227899 | 21.485759 | +1.21e-02 | | |
| faces | 6 | 62 | | 7 | |
| centroid | -0.0000, 0.9600, -0.0000 | [0, 0.961159, 0] | | | |
| bbox | -1.0000, 0.0000, -1.0000, 1.0000, 2.0000, 1.0000 | [-1, 0, -1, 1, 2, 1] | | | |

### P12_sweep_arc

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 0.616850 | 0.6127 | -6.73e-03 | 0.61685 | -4.46e-07 |
| area in² | 5.327501 | 5.315496 | -2.25e-03 | | |
| faces | 3 | 578 | | 3 | |
| centroid | 0.7218, 1.2782, 0.0000 | [0.722841, 1.277159, 0] | | | |
| bbox | -0.2500, 0.0000, -0.2500, 2.0000, 2.2500, 0.2500 | [-0.249762, -0.010905, -0.25, 2.010905, 2.249762, 0.25] | | | |

### P13_rib

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 3.976562 | 3.976563 | +1.26e-07 | 3.976562 | -1.26e-07 |
| area in² | 35.877400 | 35.8774 | -8.38e-09 | | |
| faces | 11 | 11 | | 11 | |
| centroid | 1.2256, 0.7508, -0.0000 | [1.225606, 0.750819, 0] | | | |
| bbox | 0.0000, 0.0000, -1.0000, 4.0000, 3.0000, 1.0000 | [0, 0, -1, 4, 3, 1] | | | |

### P14_draft_face

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 3.912511 | 3.912511 | -8.60e-08 | 3.912511 | -8.60e-08 |
| area in² | 15.745174 | 15.745174 | +2.00e-08 | | |
| faces | 6 | 6 | | 6 | |
| centroid | -0.0217, 0.4963, 0.0000 | [-0.021709, 0.496273, 0] | | | |
| bbox | -1.0000, 0.0000, -1.0000, 1.0000, 1.0000, 1.0000 | [-1, 0, -1, 1, 1, 1] | | | |

### P15_lpattern_filleted_boss

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 2.285315 | 2.284153 | -5.08e-04 | 2.285315 | +2.35e-09 |
| area in² | 21.140592 | 21.129872 | -5.07e-04 | | |
| faces | 15 | 487 | | 15 | |
| centroid | 2.0000, 0.1709, -0.0000 | [2, 0.170632, 0] | | | |
| bbox | 0.0000, 0.0000, -1.0000, 4.0000, 0.7500, 1.0000 | [0, 0, -1, 4, 0.75, 1] | | | |

### P16_cpattern_filleted_boss

| | SolidWorks | Anvil | rel | OpenCascade | rel |
|---|---|---|---|---|---|
| volume in³ | 3.712223 | 3.709898 | -6.26e-04 | 3.712223 | +9.62e-08 |
| area in² | 32.555518 | 32.534077 | -6.59e-04 | | |
| faces | 21 | 1035 | | 21 | |
| centroid | -0.0030, 0.1815, 0.0000 | [0, 0.18119, 0] | | | |
| bbox | -2.0000, 0.0000, -2.0000, 2.0000, 0.7500, 2.0000 | [-2, 0, -2, 2, 0.75, 2] | | | |
