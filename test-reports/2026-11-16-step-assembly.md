# STEP assemblies in and out (lane NV stepasm, 2026-11-16)

Tests: kernel `anvil/tests/kernel/rfNV.js` (4), smoke `anvil/tests/smoke/rfNV.js` (2). Every number below was measured
(Node, and headless Chrome for the screen), on the enclosure of lane NO (16 ga box with four flanges, a lid with an open
hem, the same bracket twice) with the second bracket turned by a general rotation (0.7 rad about (1, 2, 3)) at
(5.123456789, 0.3, 3).

## 1. File ▸ Open of a STEP assembly opens an assembly

Before: one part with one body per instance. Now (`Exchange.importFile(name, text, { assembly: true })` gives
`result.assembly`, `Exchange.newAssemblyFromImport(result)` builds the document; `ui-app.js` `importIntoNew` →
`openImportedAssembly`):

- One component per NEXT_ASSEMBLY_USAGE_OCCURRENCE, named by the NAUO's name (Anvil writes the component's name
  there); a blank name, a bare `NAUO<n>` id or an OpenCascade label path gives `<product><n>` (SolidWorks' naming).
- One **part document per product**, saved in the document store (`Assembly.Documents`, this browser's saved files,
  as SolidWorks writes a part file per product) and linked by `{ file }`: the bracket used twice is one document. A
  name already saved with other content gets `-2`; the same content is reused (the same file opened twice makes no
  new documents). `{ store: false }` embeds `{ model }` instead (also the fallback when the store refuses one).
- A nested STEP sub-assembly becomes a **sub-assembly document** (rigid), used by `{ file }` as often as the file uses
  it. A product with solids of its own and children gets a part `<name> (own bodies)` at its origin.
- Units: one per file (the first length unit of the geometric context), applied to solids and placements alike.
- The first component is fixed, the others float where the file put them (Anvil's insert rule), so mates can be
  added (rfNV: concentric + coincident between the two brackets, both satisfied, holes meet to 1e-9).
- Insert into a part (no `assembly` option) keeps one body per instance, as before.
- With Tools ▸ OpenCascade kernel on, a file holding NAUOs is still read by Anvil's reader (OpenCascade hands the
  solids over already placed); if Anvil's reader refuses it, OpenCascade reads it flat with a warning saying so. The
  imported parts then carry no `brep` text (no exact OpenCascade rebuild of each part).

| Check | Measured |
|---|---|
| components / part documents | 4 / 3 (`Box`, `Lid`, `Bracket` shared) |
| placement (max over R and P, vs the built assembly) | 5.0e-16 (general rotation), 0 elsewhere |
| part frames (centroid, box of each part vs its source) | 4.7e-15 |
| volume per part / whole | 3.7e-15 / 1.9e-15 |
| Save / Open (the JSON reopened and rebuilt) | volume 1.9e-15 |
| every instance against the flat reading of the same file | 4.7e-10 (the reader's 1e-9 rounding) |
| OpenCascade's own assembly (fixture, a bar at 30°), mm | 3 components, volume 69600 to 1e-9, 3.7e-10 |
| SolidWorks layout (assembly first in the relationship, items swapped, blank NAUO names) | 4.7e-10, names `<product><n>` |
| sub-assembly (box + lid turned 90°) used twice, second at a general rotation | 2 x `Unit` (one document), 4.4e-16, volume 0 |
| re-export, read by OpenCascade (XCAF) against the first export | 4 solids / 4 components, valid; lid and brackets 0 – 1.1e-15 (centroid, inertia); box volume 7.6e-11 (its faces are written again from the re-read mesh) |

**No component is lost silently.** The instances the structure places are counted against the flat reading of the
same file; if they differ the file is read flat (one part) with a warning. An occurrence of a product that holds no
solid is left out with a warning and counted (`components` + `skipped` = the file's occurrences, else a warning); an
occurrence without a placement is put at the origin with a warning. MAPPED_ITEM instancing reads flat, as before.

## 2. Colours

- Assembly: each part document takes the file's colour when its solids share one (as lane NO's reader kept it), and
  the viewer draws each component in its part's colour: smoke rfNV reads the body mesh's vertex colours exactly
  `#3366cc / #cc3333 / #33aa55 / #33aa55` and counts the three hues on the canvas (9831 / 7364 / 4711 px).
- A part whose imported solids differ in colour: `Exchange.importedBodyColors(model, build)` gives one colour per body,
  drawn through a wrapper of `UI.bodyColors` (ui-assembly.js, end; a body with its own material keeps it). Per **body**,
  not per face: Anvil's appearance model has no face colour, and the reader keeps a solid's STYLED_ITEM only.
- Written back: per solid (`STYLED_ITEM` → `COLOUR_RGB`), in a part and now in an assembly too (`asmBodyMat`).
  OpenCascade's XCAF read-back of the re-export: `#3366cc`, `#cc3333`, `#33aa55` x 2, exact to 1/255.
- Handed on (materials lane): the wrapper belongs in `ui-materials.js` `bodyColors` (one line: when
  `Exchange.importedBodyColors` returns a list, use it for every body without its own material).

## 3. Anvil's own loft, re-read, drilled, re-read: 9 open edges (traced, not fixed)

Repro (Node): the rfNO loft (`centerRect` 4 → 2 → 4, three sections), `exportSTEP`, `importFile`,
`newPartFromImport`, two equal crossing holes (`p.sketch("Right").circle(0, 0.6, 0.25)` and the same on Front, cut both
ways), `exportSTEP` (192 faces, 4 B-spline), `importFile` → **9 open edges** (the drilled body itself has 0).

Cause (exchange.js, both ends): the holes' rims on the four B-spline faces are written as polygon loops (`polyLoop`,
lane NO2) taken straight from the drilled mesh: 77 – 90 points that zig-zag (a rim point 3e-3 past its neighbours,
then back), and three of the four loops **cross themselves in (u, v)** once (A.uv of the points; the points lie up to
1.9e-4 off the surface). Two faces also get 3-point hole loops (slivers of the cut kept as faces of their own). The
reader's `paramPatch` ear-clips such a loop into folded triangles: one face's patch has 2963 of 6565 triangles turned
the other way in (u, v), and the open edges are where those triangles and the wall facets use an edge the same way.
OpenCascade reads the same file as one valid solid. Proposed fix, writer side (`holeLoops` / `polyLoop`): drop rim
points that make a spike (a point whose two neighbours are closer to each other than to it by a factor, within the
part's tolerance) and refuse the B-spline face (keep facets) when the (u, v) loop still crosses itself; reader side:
`paramPatch` should refuse a self-crossing ring rather than ear-clip it. Not done here (time).

## 4. IGES

- Anvil writes IGES only for a part built by OpenCascade (`File ▸ Save As` lists IGES when `occtExports()`); an assembly
  is never offered IGES.
- OpenCascade's IGES of this assembly (IGESCAFControl_Writer, default mode) is 208 KB of trimmed surfaces with ten
  402 group entities named after the instances, no 308/408 instancing and no 186 solids. Anvil's only IGES path
  (OpenCascade `importFile`) refuses it: "The file has no solid bodies (surfaces only?)". Handed on (occt lane,
  `occt-kernel.js solidsOf`): sew the faces (`BRepBuilderAPI_Sewing`) into shells before making solids, per IGES group.
