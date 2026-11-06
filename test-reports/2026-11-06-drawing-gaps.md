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
| 3 | Flag notes (a note's numbered flag triangle placed on the view, linked to the note bank) | missing | customer prints use "NOTE 3" flags beside a feature; numbered lists exist, the flag symbol that points at item n does not |
| 4 | View ▸ Hide/Show menu (annotations, sketches, dimension names) | partial | View menu: Zoom to Fit + tangent edge display; Hide/Show Annotations is on the Sketch tab only |
| 5 | Plain-hole callout spacing (`Ø.281 THRU ALL` vs wizard `Ø .28`) | to verify | shop audit 9: needs SolidWorks to read the plain-hole spacing |
| 6 | Alternate Position View | missing | assemblies only (hinged guards); low for a parts shop |
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
