# Transform tab audit — used like a Mastercam shop user (2026-10-13, lane BO)

How: every Transform command was driven in headless Chrome over the DevTools protocol with real mouse and key events
(a scratch driver outside the repo, modelled on `anvil/headless/ui-smoke.js`), on inch geometry: a 6 × 4 blank with a
1 × 1 corner notch, four Ø.281 holes and a 2 × ½ slot; a 6-hole bolt circle; the blank's closed profile for nesting.
Each command was tried the obvious way and the awkward ways: select first vs pick in the PM, click vs window
selection, Move / Copy / Join, copies, ✓ vs ✓+, Esc / ✗ mid-way, undo / redo after each, typed fractions (`1/2`, `.25`),
switching commands with a PM open, zoomed in and out, light and dark theme. Each finding was compared with how
Mastercam 2024 behaves (panel layout, defaults, which values persist between uses, preview colour, what stays selected).

## Findings

| # | Severity | Command | Mastercam | Anvil (before) | Repro | Fix |
|---|---|---|---|---|---|---|
| 1 | major | Geometry Nesting | a quantity typed in the part list reads as typed | typing `12` in the quantity box gave `21`: every keystroke re-nested and re-rendered the panel, which put the caret back at the start | Add sketch, click the quantity box, type `12` | the box is a text box (`inputmode=numeric`); the quantity is read as typed, the re-nest waits 350 ms for typing to pause (leaving the box or Enter nests at once). **Fixed** |
| 2 | major | Geometry Nesting | Enter in the dialog applies the values; the nest is made by its own button | Enter in the quantity box (or Part spacing, Sheet margin …) was ✓: it made the Nest document, left the sketch and asked to save the part | type a quantity, Enter | Enter anywhere in the nesting PM nests; only the ✓ button makes the Nest document. **Fixed** |
| 3 | major | Geometry Nesting | each nest session starts from the current geometry | the parts list survived File ▸ New / Open: a new part's nesting PM still listed the old document's parts (one more "Add sketch" nested both) | nest in Part1, New, open Geometry Nesting | the list and the values stay for the document they were made in (re-open to Save DXF again); another document starts empty. **Fixed** |
| 4 | major | all | each function remembers its last-used values (Move / Copy, copies, distances, angles, axis, side, corners, scale …) for the next run | every PM opened with the factory defaults: a shop user doing the same copy on ten parts retyped it ten times | Translate, Copy × 3 at 1.5, ✓, Translate again | every command recalls what it last used (session + `localStorage`); points picked on screen, picked entities and the picked mirror line are asked for again. **Fixed** |
| 5 | major | all (preview) | the result is drawn in the result colour, distinct from the geometry and the selected group | the preview was the same blue as the sketch: an inside offset, a stretched corner or a mirrored slot could not be told from what was already there (light and dark) | Offset Chains inside .5; Stretch a corner | Transform previews are drawn in a magenta result colour (`UI.transformPreviewColor()`, both themes); the sketch tools keep the sketch blue. **Fixed** |
| 6 | minor | Rectangular Array | exact coordinates | direction 2 at 90° put copies at x = 0.5000000000000001 (cos 90° ≈ 6e-17 scaled by the distance): dirt that shows in a DXF | hole at (.5, .5), 3 × 2 at 1.5 / 1 | exact cosine / sine at the right angles and tidied sums: the copies land on (.5, 1.5). **Fixed** |
| 7 | minor | Offset Entity, Offset Chains, Rectangular Array, Distribute | the function reports what it did | after ✓ the status bar said "6 sketch entities selected." instead of "Offset: 1 copy at .250 in." (the selection of the result overwrote the message) | Offset Entity, ✓ | the result line is shown after the selection and wins. **Fixed** |
| 8 | minor | all | leaving the function clears its prompt | after ✗ / Esc the status bar kept the command's prompt ("Rotate: set the transform.") | Rotate, Esc | "Rotate cancelled." (every command; the 3D ones say it again after their close clears the selection). **Fixed** |
| 9 | minor | Translate to Plane, Project, Roll, Stretch, Scale, Offset ×2, Array, Distribute | one ✓+ look | the ✓+ button in these PMs showed a plain ✓ icon (only Translate / Rotate / Mirror / Dynamic had the ✓+ glyph) | open Scale | all use the `okPlus` icon. **Fixed** |
| 10 | QOL | all (transformPM) | the panel says what to do next | with entities selected the status said "Translate: set the transform." | select, Translate | per-command prompts: "Translate: type Delta X / Y (fractions like 1/2 work), or Polar, or pick From / To points; Enter (✓) moves, ✓+ keeps going.", Rotate and Dynamic likewise. **Fixed** |
| 11 | QOL | Geometry Nesting | the nest shows as soon as there is something to nest | after Add sketch nothing happened until the Nest button, below the fold of a long panel, was found and pressed | Add sketch | the first part added is nested at once; later changes re-nest live as before. **Fixed** |
| 12 | QOL | Geometry Nesting | sheet sizes in the drawing's units | an mm document listed the presets as "48 × 96 in" | units mm, open nesting | "1219 × 2438 mm (48 × 96 in)" etc. **Fixed** |
| 13 | QOL | Geometry Nesting | the nest view follows the UI theme | the graphics-area nest overlay was a hard-coded white panel in the dark theme | dark theme, Nest | the overlay is styled by `style.css` from the theme variables. **Fixed** |
| 14 | minor | Translate (any PM) | Mastercam's panel keeps the keyboard | Ctrl+Z with a Transform PM open and nothing changed yet undoes the step before the command (here: the sketch itself was undone and the part left sketch mode) | select, Translate, Ctrl+Z | not changed: a general PropertyManager behaviour (ui-commands.js / ui-app.js, outside this lane). **Not fixed** |
| 15 | minor | selection | a click on a circle selects the circle | a click exactly on a quadrant or end point selects the sketch point, which the Transform box ignores (the count stays 0) | click a hole at 0° | not changed: the sketcher's SolidWorks point picking, outside this lane; click the rim away from the quadrants, or window. **Not fixed** |

## Works as a Mastercam user expects

- Translate: Delta X / Y, Polar, From / To points (From snaps to the origin and sketch points); Move / Copy / Join; copies with Distance between / Total distance; the preview follows the cursor for the To point; ✓+ applies and keeps the result in the box for the next move; fractions and `.25` in every box; Enter is ✓; undo / redo is one step.
- Rotate: angle, Copy × n with Total sweep (bolt-circle style), Center picked on screen (the slot centre snapped), Rotate vs Translate (keep direction).
- Mirror: about X / Y, a line at an angle, a picked sketch line (excluded from the entities) or two points; Copy by default; the relations to other geometry dropped on Move and counted.
- Move to Origin: nothing selected moves the whole sketch; the click lands the picked point on the origin at once.
- Dynamic: the gnomon's X arrow dragged 1 in (83 px at that zoom) reads exactly 1.000, the value box edits it, ✓ moves the hole to 1.5; the gnomon keeps its screen size when zooming.
- Offset Entity: pick, then side under the cursor with a live preview; Offset Chains: one click takes the whole closed outline, Left is inside, Sharp / All corners.
- Rectangular Array 3 × 2, Distribute three holes evenly (the middle one moves, the ends stay), Scale × 2 about the origin / a point / the selection centre, Stretch with a crossing window (the notch corner moved .5 and the walls followed).
- Translate to Plane: the Top plane chosen from the list, ✓ makes Sketch2 on Top with the slot and opens it (Edit after ✓).
- Switching commands with a PM open replaces the PM and keeps the selection; Esc / ✗ cancels with the preview gone; the result stays selected after ✓.
- Geometry Nesting: 21 blanks on a 48 × 96 sheet at .25 spacing and .5 margin in 9.8 %, tabs per sheet over the graphics area, Save DXF per sheet.

## Regression steps

`anvil/tests/smoke/rfBO.js` (3 steps): remembered values for Translate / Rotate / Mirror / Scale / Offset Entity and what is not remembered; the preview colour vs the sketch tools' colour; ✗ status; Rectangular Array exact coordinates and its status line; the ✓+ icon in the 3D and layout PMs; nesting: nest on Add, a typed `12`, Enter in the quantity and in Part spacing nests without making the Nest document, an empty list in a new document, mm preset names.

Existing groups changed: `rfBJ.js` (`rfBJNew` resets the Transform memory so each step starts from the defaults; rfBK, rfBM and rfBN build on it), `rfBK.js` (the same reset before each `anvil.newPart()`; the Scale step's second run sets Uniform / Move itself, since Scale now remembers XYZ / Copy from its first run), `rfBJ.js` Mirror step (its second run sets Copy, since Mirror remembers the Move from the first), `rfBL.js` (`rfBLNew` resets it; the ✓+ button is found by its new title "OK and keep open (✓+) …", the same in every Transform PM).

Suites: kernel `node anvil/headless/anvil.js test` 1148 / 1148; ui-smoke (headless Chrome) 656 / 656.
