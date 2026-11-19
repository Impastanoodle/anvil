# Sketch tools one by one (lane sketchtools, round local-2026-11-18b)

Started from 3eb0119. Every tool was opened from its Sketch tab ribbon button or flyout row (caret, then row) and driven with
real mouse and key events on an inch part, Front plane: clicks and drags in the graphics area, PM boxes typed and clicked,
Esc, Ctrl+Z. Smoke group `rfQT` (9 steps, one per family) pins what was measured.

For each tool: the PM groups and boxes, the geometry, the relations added, the degrees of freedom, one undo step, Esc
mid-tool leaves nothing (no entity, no preview, tool down, PM closed), and whether the tool stays.

## Measured, right already

| Tool | Driven | Measured |
|---|---|---|
| Line | 4 clicks; click-drag; back over the end; A key | Insert Line PM (Orientation, Options: For construction, Infinite length, Midpoint line). Chain: Horizontal, Vertical, Coincident only, DOF 6. Ctrl+Z takes one segment. Click-drag makes one line, the next click starts a new one. Back over the end: tangent arc (centre (2, .5), R .5), then back to line. A: arc, Tangent, DOF 5. |
| Centerline | 2 clicks | For construction checked. The line is construction, Vertical + Coincident to the origin. |
| Midpoint Line | 2 clicks | (3,1) to (4,1.02) gives (2,1)-(4,1), Horizontal, 3 DOF. |
| Infinite length | check box, 2 clicks | Infinite line, DOF 2. |
| Corner / Center / 3 Point Corner / 3 Point Center / Parallelogram | 2-3 clicks | DOF 4 / 4 / 5 / 5 / 6. Relations: H/V + 4 corner Coincident; Center: two construction diagonals and a point with Midpoint (from midpoints: 4 side Midpoints); 3 point: 2 Parallel + Perpendicular; parallelogram: 2 Parallel. A corner on the origin: DOF 2. |
| Circle, Perimeter Circle | 2 / 3 clicks | R .5, DOF 3. Parameters show Radius and Diameter. On the origin: Coincident, DOF 1. For construction works. |
| Centerpoint, 3 Point, Tangent Arc | 3 / 3 / 2 clicks | DOF 5. 3 point arc R 17/15. Tangent arc off a line end: Tangent + Coincident, centre exact. |
| Ellipse, Partial Ellipse | 3 / 4 clicks | DOF 5 / 7. |
| 4 slots | 3-4 clicks, with and without Add dimensions, Overall Length | DOF 4 / 4 / 6 / 6, and 2 / 2 / 4 / 4 with Add dimensions. Width .600, centre to centre 2. Overall Length shows 2.600. |
| Polygon | sides typed first, Inscribed / Circumscribed | Polygon relation, DOF 4. Inscribed: the circle is tangent to the sides. Circumscribed: the corners lie on the circle. |
| Spline | 3 clicks + double-click; Esc after 2 | 4 through points, DOF 8. Esc keeps the 2 points placed. |
| Point | 2 clicks | The tool stays. |
| Sketch Fillet | R .25, 2 corners, then ✓ | Equal, Tangent ×4, one R dimension. The width 3 stays on the virtual sharp. DOF 1. Ctrl+Z gives the rectangle back with its dimension. |
| Sketch Chamfer | equal / angle-distance / distance-distance + Esc | Distance rels .375 ×2, or .375 with 45°. Esc after a pick leaves the corner as it was. |
| Trim | Power (drag), Corner, Inside, Outside, Closest | Each trims to the right intersection and adds Coincident on the cutting line. Ctrl+Z undoes one trim. |
| Extend | click near the end | Extends to the next entity, adds Coincident. Ctrl+Z works. |
| Offset | click one side | Previews the whole chain. Offset relation and distance .375 outward. |
| Mirror Entities | nothing selected, 2 picks, Mirror about box, centerline | The PM opens empty. Adds Symmetric, DOF unchanged. |
| Linear / Circular Sketch Pattern | nothing selected | The PM opens empty and takes clicks. 3 circles 0.75 apart, Pattern relation, DOF unchanged. |
| Move / Copy | pick, Start point box, 2 clicks | Moved / copied exactly. The command ends at the to point. |
| Rotate | 90° about a corner | Rotated exactly. |
| Scale | 2 about a corner | Exact, relations kept. |
| Stretch | window, 2 clicks | The side in the window moves 1; the side outside stays. |
| Dynamic Mirror | centerline selected, toggle, line | A mirrored copy with Symmetric. The toggle turns it off. |
| Convert Entities | a block edge, sketch on its face | On Edge, DOF 0, length 2. |
| Construction Geometry | side selected | One undo step. With nothing selected the status asks for a selection. |
| Fully Define Sketch | Calculate, ✓ | Fully defined. Ctrl+Z is one step. |
| Display/Delete Relations | open | Delete, Replace, Delete All. |
| Quick Snaps (Point Snap) | no tool active | Starts Line and snaps to the corner (Coincident). |
| Repair Sketch | two collinear lines with a 0.0005 gap | Joined into one line. |
| Ribbon button clicked again | Line, Rect, Circle, Arc, Slot | The tool goes off, as in SolidWorks. Clicking it mid-chain keeps the segments already made. |

## Fixed

- **Sketch Fillet / Sketch Chamfer: the status line kept "Pick another vertex or two entities, or press ✓." after ✓.**
  ui-sketch-tools.js `cornerTool` onOK now writes the result, for example "Fillet R.250 in at 2 corners.". Pinned in rfQT 6.

## Left, with reproduction

- None found broken inside the brief's list.
- Partial Ellipse: the third click sets the minor radius as its distance square to the major axis. The arc start is then the
  parameter angle of that point, so it is not on the clicked point. Example: centre (1,1), major end (2.5,1), click (2,1.5)
  gives ry .5 and a start at (1.83, 1.42). Check in SolidWorks whether the ellipse should pass through the click.
- Extend Entities opens a PM with an empty Options group. SolidWorks shows no options there.

## Missing against SolidWorks 2024's Sketch tab (listed, not built)

- **Silhouette Entities**: not in the Convert Entities flyout.
- **Spline on Surface**: not in the Spline flyout. It is a 3D sketch tool.

## To check in SolidWorks 2024

- Whether Insert Line's For construction / Infinite length, and the Circle PM's For construction, stay checked the next
  time the tool opens. Anvil clears them.
- Whether the Center Rectangle's centre point gets Midpoint on both diagonals. Anvil adds it on one; the other is implied.
- Whether Scale Entities starts with Copy checked. Anvil does.
- The Partial Ellipse third click (above).
