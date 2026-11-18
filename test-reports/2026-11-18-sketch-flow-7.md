# Sketch flow audit, round 7 (lane sketchflow7, rfOI)

All flows ran in headless Chrome on an inch part (Tools ▸ Default units ▸ Inches, then File ▸ New), with real mouse and key events. Values were typed the way the shop types them: fractions and mixed numbers in the Modify box and in PropertyManager boxes. After each flow the run undid every step, redid them all, exited the sketch and edited it again. Where the flow makes a part, it was built and checked against a closed form. None of these flows repeats an earlier audit (`2026-11-11-sketch-flow.md`, `2026-11-15-sketch-flow-3/4/5.md`, `2026-11-18-sketch-flow-6.md`).

## The flows

| # | Flow | Steps driven | Defects found | Status |
|---|---|---|---|---|
| 1 | Hinge-side bracket with ordinate dimensions | 6 × 4 plate, six holes in three sizes, each Ø typed. Horizontal and Vertical Ordinate sets from the lower left corner, 14 values typed as the members were clicked. Both 0s clicked and deleted, the sets made again from the top right corner with 14 new values. Boss-Extrude .125 | **The Modify box did not open on an ordinate member.** Each of the 14 values had to be double-clicked afterwards | **fixed**. Fully defined from either datum. The holes stay put when the datum moves. The volume is the closed form |
| 2 | Slotted plate | Straight slot, Centerpoint Arc Slot and 3 Point Arc Slot. The arc slot dragged by its end cap, its centre arc and its side. The straight slot dragged by its side, its centre line and its end. Slot-centre and edge dimensions typed. Length 1 1/2 → 2, width 3/8 → 1/2 and arc slot R → 1 1/8, each by double-click | none. Each slot keeps its shape through every drag. An arc slot pushed past the plate edge is refused with "Sketch contours intersect", as SolidWorks refuses it | clean. The volume is the closed form |
| 3 | Notches and reliefs on a blank | Three Corner Rectangles across an 8 × 5 outline. Power trim (two drags across several entities), Trim to closest, Corner. Sketch Fillet R1/4 on one notch. R1/2 on both inside corners of a notch 1 deep. One notch widened 1 → 1 1/2 by its dimension. The rounded notch window-selected and deleted, the edge healed with Extend | **R equal to what is left of a line was refused** with "Radius too large … (at most R.500)" for R.500. **Extend onto the other piece of a split edge added no join.** The Coincident was dropped as redundant next to the two pieces' Collinear, so the outline only looked closed | **both fixed**. The volume is the closed form |
| 4 | Bolt circle and relations by hand | A circle made construction in its PM, Ø4, located 4 and 3. A Ø3/8 hole on it. Circular Sketch Pattern of 6 about its centre; the pattern centre gets a Coincident to it. The bolt circle moved 4 → 3 1/2 and the holes follow. Horizontal from the context toolbar makes the sketch fully defined. Edit Circular Pattern from the right-click menu: 8 instances, one skipped. Symmetric and Coincident from the toolbar, each dragged. The Symmetric deleted in Display / Delete Relations | none | clean |
| 5 | Copy and edit a dimensioned group | Move (X/Y) without Keep relations: the dimensions to the plate go, the one between the holes stays. Move with Keep relations: refused with the reason. Copy Entities (the copies get no dimensions). Rotate 90°. Scale ×2 (Copy is on by default, as in SolidWorks). Stretch by a crossing box: 6 → 7. Ctrl+drag. Ctrl+C / Ctrl+V into a sketch on Top | **Ctrl+drag did not copy.** It dragged the entity, or reported "did not move" when the entity was dimensioned | **fixed**. The paste keeps the Ø and the 1 between the holes |
| 6 | Sketch on a flange face | 6 × 2 Edge Flange (T .06, R .06), Tangent Edges Visible. A hole located 1 from the flange's side edge and 3/4 from the bend's edge. Then Edge Flange 2 → 3, sheet T → .075 (set on `model.sheet`), and the base outline moved in 1/2 | **The bend's tangent edge could not be picked.** Smart Dimension said "No distance between those two" | **fixed**. The hole follows both references through all three changes. Nothing dangles |
| 7 | Arcs from a print | Line chain with A for a tangent arc. Arc length: the arc, then its two shared end points, typed 3 1/2. A radius on it, which over-defines. Two circles made Equal from the toolbar. Their distance set to Max on the first circle in the Dimension PM | **Arc length on a chained arc made a distance from the arc's centre to the line's end point** (1.000, not ⌒3.142) | **fixed**. The radius is offered as driven. Max reads 2.400 and the circles do not move |
| 8 | Rapid sketching | Corner Rectangle from the origin: Coincident to the origin plus H / V. Smart Dimension twice, with Enter accepting each value and the tool staying. Esc, then Enter. Line typed on screen (2, Tab, 30, Enter). A level line drawn with Ctrl held. S | **Enter did not repeat the last command.** **A line drawn with Ctrl held still got Horizontal** | **both fixed**. The S Shortcut Bar opens |

## The fixes

1. **Ordinate members** (`ui-sketch-dims.js` `cmdOrdinateDim` → `click`). After a driving member is added, the Modify box opens on it (`UI.openRelDimEdit`). Enter sets the value (only that member moves) and the ordinate tool stays open for the next click.
2. **Full-round fillet** (`sketch-solver.js` `filletPair`, `filletPlan`, `reshapeOpts`, `reshapeTo(…, consume)`). When no plan fits and both entities are lines at a corner, the plan is tried again with `consume`. A line whose remaining length is the tangent length (within 1e-7) is used up:
   - the line is deleted;
   - its far end's joins move to the fillet's end;
   - a Tangent it had to an arc becomes arc-to-arc.
   No virtual sharp is kept for that corner. If both lines would be used up, it is still refused.
3. **Extend onto a Collinear piece** (`sketch-solver.js` `extendEntity`). When the new Coincident is redundant and the two lines are held Collinear, the Collinear becomes Parallel. If Parallel is still redundant (both lines Vertical / Horizontal), the Collinear is removed. The join is kept.
4. **Ctrl+drag copy** (`ui-relations.js` `ctrlCopyDrag`, called from `sketchDragHook` when Ctrl is down and the press is on an entity, not on an end point). The copy is the pressed entity, or the selection when the pressed entity is part of it. The copy previews as it moves and is made on release with `transformEntities({ copy: true })`, in one undo step. A Ctrl+click with no move still adds to the selection. A Ctrl-drag of an end point still means "no snap".
5. **Tangent edges in a sketch** (`ui-core.js` `pickEdge`, `edgeGridFor`). In an open sketch, with tangent edges displayed (Visible or As Phantom), the drawn tangent edges (`tangentEdgeList`) can be picked as model references. Seams and facet chords never can. With Tangent Edges Removed nothing changes.
6. **Arc length on a chain** (`ui-sketch-dims.js` `arcEnd`, `arcEndAt`, `UI.dimPickNeed`). A point that lies on the arc's end counts as that end, whichever entity's point it is.
7. **Enter repeats the last command** (`ui-sketch.js` `lastSketchTool`, sketch keydown). This applies with the Select tool, no PropertyManager open, no modal open and focus not in a field.
8. **Ctrl suppresses automatic Horizontal / Vertical** (`ui-sketch.js` `inferOpts` → `opts.noHV`, `sketch-solver.js` `inferCandidates`). Parallel and perpendicular locks are dropped too. Point joins are unchanged.

## Not checked on a SolidWorks seat
- That SolidWorks makes the full round and deletes the used-up line (fix 2) instead of refusing it. Anvil now builds the obround.
- Copy Entities makes copies with no dimensions, while Paste keeps the Ø and the distance between the holes. Which of these SolidWorks does was not checked.
- Move Entities without Keep relations deletes the dimensions to unselected geometry. Not checked.
- The typed Line angle (rfPR follow-up) on a line started at a rectangle's corner gave a 150° dimension to the rectangle side. Which reference SolidWorks uses was not checked.
- Dragging an arc slot by its end cap moves the slot's centre and radius rather than sweeping the end round. Not checked.
- After sheet T .06 → .075 set on `model.sheet` directly, the Base Flange kept its own .06 depth while the Edge Flange took .075. A Base Flange PM edit was not driven; this may belong to the sheet-metal lane.

## Not driven (for a fresh agent)
- **Confirmation corner and the D key.** Anvil has no confirmation corner, and D is bound to Smart Dimension (`ui-app.js` KEY_DEFAULTS). Other lanes' files.
- **Flow 6, dangling reference.** The case where an edit of the base sketch removes a referenced edge (red handle, repair by drag or delete) was not driven here; rfLW covers it for a vertex.
- **Flow 7 extras.** An arc dimensioned by its angle, 3 Point Arc with a typed radius, and an R change that flips a tangent arc.
- **Report 6 leftover.** A trimmed **dimensioned** first copy of an Offset Entities chain still drops the chain relation (`sketch-solver.js` `afterTrim` / `trimChain`).
- **D-name order.** D1, D2 … still number Smart Dimensions first, then distance relations; SolidWorks numbers them in creation order (`ui-sketch-dims.js` `UI.sketchDimItems` / `UI.sketchDimShortName`). New dimensions only should take the next number, so old documents keep their names.
- A stray text "Circle" appears among the `#dim-layer` texts after some hovers (seen in flows 5 and 7). Not chased.

## Tests
- Smoke `anvil/tests/smoke/rfOI.js`: 8 steps, one per flow. Each fix is pinned in its flow: 1 (ordinate Modify box), 3 (full round, Extend join), 5 (Ctrl+drag), 6 (bend edge), 7 (arc length), 8 (Enter, Ctrl).
- Kernel `anvil/tests/kernel/rfOI.js`: 2 tests. The full round (and R.6 still refused). Extend onto a Collinear piece, joined through a drag.
