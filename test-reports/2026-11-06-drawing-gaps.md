# Drawing gaps a sheet-metal shop meets — re-score, 2026-11-06 (lane drawgaps, rfJG)

Re-score of the Drawings rows that `2026-10-13-completeness.md` marked missing / partial, against the code at
ba3a747 (grep of `drawing*.js`, the drawing ribbon / menus in `drawing-ui-*.js`), plus the open items of
`2026-11-05-shop-drawing-audit.md` and `2026-11-02-unchecked-items.md` 3b. Ranked by what a sheet-metal shop
drawing needs most.

## Done since 2026-10-13 (no longer gaps)

Removed Section (rfCX), Relative View (rfAO), Empty View (rfHX), Horizontal / Vertical Dimension and Ordinate,
Angular Running, Path Length (lane CT), Autodimension PM (rfGT), Datum Target, Cosmetic Thread on a picked circle,
Dowel Pin Symbol, Multi-jog Leader, numbered / bulleted notes, note borders (rfCU), Weld Symbol, Revision Symbol,
Revision Cloud, Hole Table (rfAN, rfIR, rfJB), Bend Table from Insert ▸ Tables (rfGT), drawing Sketch tab, Line
Format, Hide/Show Edges, Hide/Show Annotations (rfAO, rfHX), Insert menu duplicates (DW2), Center Mark on slots
and bolt circles (circular style with pitch circle; slot / rounded-end marks), Model Items Source (Entire model /
Selected feature) with Hole Wizard locations and callouts. Shop audit: findings 1–8 fixed (rfIR, rfIW, rfJB).

## Gaps left, ranked

| Rank | Gap | Status | Shop value / note |
|---|---|---|---|
| 1 | **Punch Table** (Insert ▸ Tables) | **done here (rfJG)** | Forming Tools exist now (lane forming), so a flat with dimples / louvers / extruded holes needs their positions for the turret: tag per punch ID (A1, A2 … B1), X / Y LOC from a blank vertex, PUNCH ID = the tool's flat note (`DIMPLE Ø.75 X .125 UP`) |
| 2 | **Bend Table's Fixed Face note** (3b) | **done here (rfJG)** | SolidWorks 2024 adds `Fixed Face` at the view centre with the table; Anvil now does, moved off the blank's lines / holes / form marks, draggable and hideable |
| 3 | Flag notes (a note's numbered flag triangle placed on the view, linked to the note bank) | **done (rfJI)** | customer prints use "NOTE 3" flags beside a feature; numbered lists exist, the flag symbol that points at item n does not |
| 4 | View ▸ Hide/Show menu (annotations, sketches, dimension names) | **done for All Annotations, Sketches, Hide/Show Edges (rfJI)**; dimension names, origins, planes have nothing to show on an Anvil drawing | View menu: Zoom to Fit + tangent edge display; Hide/Show Annotations is on the Sketch tab only |
| 5 | Plain-hole callout spacing (`Ø.281 THRU ALL` vs wizard `Ø .28`) | to verify | shop audit 9: needs SolidWorks to read the plain-hole spacing |
| 6 | Alternate Position View | missing, skipped (rfJI) | assemblies only (hinged guards); needs assembly configurations that change mate values / positions, which Anvil's configurations (suppress / hide / part config only) do not have |
| 7 | Predefined View, Block (drawing), hyperlinks in notes | missing | low value |
| 8 | Format Painter, Spell Checker, Design Checker | missing | low value |
| — | Tangent edges Visible on new views (15b) | not changed | a user decision (changes every drawing test) |

Not a gap: a centreline on the bends of a formed view — SolidWorks adds none by default (tangent edges show the
bend), so Anvil's formed views match.

## What rfJG added

- Engine: a hole table record with `punch: true` is a Punch Table (`Drawing.addHoleTable(doc, flatViewId,
  { punch: true, origin: { p }, tagStyle, combineTags, combineSizes, prec }, w)`; refused on a view that is not a flat
  pattern; origin must be a vertex as for hole tables). Rows from `Drawing.viewPunches(w)` (the flat's etch items of
  each forming tool: centre mark middle, flat note). Header PUNCH ID; SVG / DXF / PDF as the hole table.
- UI: Annotation ▸ Punch Table (after Bend Table) and Insert ▸ Tables ▸ Punch Table…; the selected (or only) flat
  view's lower-left blank corner is preselected, a click on another vertex moves it, ✓ places; double-click opens
  its Properties PM (Punch Table title); `anvil.drawing.punchTable(viewId, spec)`.
- Bend Table mode adds a `fixedFace` flat item (`view.flatAnn.fixedFace` for drag / hide; `view.fixedFaceNote =
  false` turns it off).

Open question for SolidWorks: the default punch table template's column names (Anvil uses TAG / X LOC / Y LOC /
PUNCH ID) and whether SolidWorks puts the Fixed Face note on the fixed face or the view's centre for a flat whose
fixed face is not central.

## Follow-up (lane drawgaps-2, rfJI, same day)

- Flag notes: Note ▸ Properties ▸ *Add to Flag Note Bank* makes the note the numbered notes block; *Annotation ▸ Flag
  Note* / *Insert ▸ Annotations ▸ Flag Note…* places numbered flags (Flag Triangle default, any closed border shape,
  leader optional) that follow their item when lines are inserted, keep the number when the text changes, and dangle
  when the bank is deleted. The bank draws each flagged item's number in the flag shape. Border list now has Box
  (SolidWorks' name), Diamond, Pentagon, Flag Pentagon and Underline.
- View ▸ Hide/Show ▸ All Annotations / Sketches (saved with the drawing, undoable, outputs follow) and ▸ Hide/Show
  Edges, beside the existing Hide/Show Annotations tool.
- Alternate Position View: skipped (see row 6).
- To check in SolidWorks: the Flag Pentagon's exact outline (Anvil: a regular pentagon point up) and whether the bank
  shows unflagged items as `1.` as Anvil does.

## Follow-up (lane drawgaps-3, rfJM, same day)

- Autodimension on a flat pattern view: what existed (rfGT) dimensioned the blank's edges and holes but not the bend
  lines and had no Selected entities. Now bend lines are stations (and follow their bend), Ordinate from the blank's
  lower-left is preselected on a flat, *Selected entities* works, and the dimensions go to the side that is clear of
  the title block, tables and other views (the view slides when neither is). Model Items on flats was not changed.
- Merge faces off: the bend-region tangent lines are drawn in the flat view (thin tangent edges, SVG / DXF / PDF).
- Seen, not changed: on a crowded sheet the Bend Table's free-paper search keeps clear of the views' boxes but not of
  their model-item dimensions (a Front view dimension under its view can sit on the table).

## Follow-up (lane drawfix2, rfJR, same day)

- The Bend Table's free-paper search (the "Seen, not changed" item above) and the Hole / Punch Table's now keep clear
  of the sheet's dimensions: the sheet works out where its dimensions go (a dry run of the same placement) before it
  places the tables. The box's flat dragged left of its Front view on ANSI B had the Front 6.000 under its Bend Table;
  now it does not. Sweeps over an ANSI B sheet: 7 Bend Tables and 24 Hole Tables used to sit on a dimension, none now.
- Sheet zones (ASME Y14.1, new): ANSI A 2 × 2, B 4 × 2, C 4 × 4, D 8 × 4, numbers right to left along top and bottom,
  letters bottom to top on both sides, ticks at the zone lines; Sheet Properties ▸ Zones; an item of the sheet format;
  in SVG / DXF / PDF. ISO sheets have none unless asked.
- Revision Table ZONE fills from the Revision Symbols naming the row (e.g. `B3`), follows a moved symbol, a typed ZONE
  wins.
- Already there, not changed: ANSI A–D sheet sizes, the title block (it keeps its size on every sheet), Sheet
  Properties switching the format (standard views re-laid out, placed views keep their paper position), General Table.
- To check in SolidWorks: whether its ANSI sheet formats use these zone counts (taken from ASME Y14.1's 4.25 × 5.5 in
  zone, not measured), the zone label height, and how its Revision Table writes two symbols' zones (Anvil: `A1, B4`).
- Still needs SolidWorks: plain-hole callout spacing (row 5).
