# OpenCascade experiment (2026-09-26, run local-2026-09-26h)

Question: can Anvil use OpenCascade (a real B-rep kernel) in the browser, fully offline, instead of growing its own
mesh-based kernel toward NURBS? Page: `experiments/occt-lab.html` (fetch the engine first with `get-occt.ps1`).

## Package

- `opencascade.js` 2.0.0-beta.b5ff984 (OpenCascade 7.6, Emscripten), LGPL-2.1. `opencascade.full.wasm` 50.3 MB,
  `opencascade.full.js` 0.4 MB, TypeScript typings 9.4 MB (the only reliable map of overload numbers: `gp_Pnt_3`,
  `BRepAlgoAPI_Cut_3`, ...). Loads offline from `localhost` in 0.9-1.9 s.
- 1.1.1 (the "stable" tag, 2020) is unusable: `TopTools_ListOfShape.Append` loses its `this` binding, so shell,
  loft options and anything taking a shape list fail.
- LGPL: fine as a separate, replaceable `.wasm`; ship the licence text with it.
- 50 MB is over the Claude artifact limit (15 MB per file): the published web copy cannot carry it.

## Results (same parts, both engines, medians of 5, 0.05 mm chord)

| Part | Anvil build ms | OCCT build + mesh ms | Anvil volume | OCCT volume | Diff | Anvil mesh faces | OCCT B-rep faces |
|---|---|---|---|---|---|---|---|
| Plate with bolt holes | 3.5 | 67 + 13 | 46391.5 | 46391.5 | 0 (both exact to 1e-14) | 102 | 10 |
| Bushing | 0.9 | 2 + 13 | 11061.5 | 11061.5 | 0 (both exact) | 147 | 6 |
| Rounded handle | 60 | 41 + 31 | 30788.9 | 30788.3 | +0.002 % | 332 | 16 |
| Mug | 46 | 198 + 41 | 85618.3 | 85024.4 | +0.70 % (Anvil's sweep is faceted, mitred) | 851 | 8 |
| Funnel | 369 | 37 + 45 | 12190.5 | 12184.0 | +0.05 % | 258 | 6 |

Overall about the same total time (Anvil 390-480 ms, OCCT 487 ms with meshing): OCCT is slower on simple booleans
and the sweep, 5-10x faster on loft + shell.

OpenCascade only (Anvil cannot do these today), all results checked valid with `BRepCheck_Analyzer`:
- Fillet R1 on all 24 edges of the plate, straight edges and round hole rims: 58 ms.
- Fillet R2 where the Mug handle meets the curved wall: 70 ms.
- STEP export of the Mug with exact CYLINDRICAL / TOROIDAL surfaces: 20 ms, 39 KB.

## Gotchas

- OCCT can return an invalid shape without an error: shell with `GeomAbs_Arc` joins on the lofted Funnel gave a
  2.4x volume. `GeomAbs_Intersection` (sharp inner corners, as SolidWorks' Shell) is valid. Run a validity check
  after every feature and report a feature error instead of showing garbage.
- Embind objects must be `.delete()`d or the WASM heap grows; the lab page does not bother.
- Overloads are numbered: read them from `opencascade.full.d.ts`, never guess.

## Recommendation

Go, behind a switch, one layer at a time:
1. Run OCCT inside `worker.js` (rebuilds are already off the main thread there), mapping Anvil's feature tree
   (sketch profiles, extrude, revolve, holes, patterns, fillet / chamfer, shell, sweep, loft) to OCCT operations.
   Anvil's point-based picks (`{ at: [x, y, z] }`) find faces and edges on either kernel.
2. Mesh with face ids from `BRepMesh` so picking, drawings and exports see true faces.
3. Drawings: exact hidden lines with `HLRBRep`; STEP / IGES read and write through OCCT.
4. Keep Anvil's kernel as the fallback and as the cross-check in the tests (volumes must agree) until OCCT covers
   every feature.
