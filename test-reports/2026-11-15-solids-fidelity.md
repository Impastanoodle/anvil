# Solids fidelity, lane MP (solidfid), 2026-11-15

Task 1 of the lane: the boolean split point that leaves needle holes. Tests: `anvil/tests/kernel/rfMP.js` (6 hard rows).
"Closed" means `Evaluate.checkBody` open and non-manifold edges are both 0; the fuzz harness also checks mesh volume
against polygon volume. Baselines were measured on an untouched copy of main (919faf5) on the same machine.

## 1. What was measured before changing anything

The diagnosis in the last report is right in kind, and the two fuzz parts showed two forms of it:

- **Seed 773** (plate, boss, Cut-Revolve groove; the subtract of the groove, 107 − 224 polygons, both closed): a BSP
  cut line across the plate's top (the trace of a far groove facet's plane) crosses a tile edge at P2, which lies
  4.6e-6 from the plane of the nearest groove facet. P2 is taken as on that facet's plane, so the top is cut through
  P2. The groove wall is cut at the true crossing P3, 7.4e-6 from P2. Neither point is an original vertex: both are
  split points of this one boolean.
- **Seed 829** (disk, holes, a second body, Intersect; subtract 13 of the build): a tile edge of the disk's top crosses
  one hole facet 2.7e-5 from the corner it shares with the next facet (11° apart), so the crossing lies 5.3e-6 from
  the next facet's plane and is taken as on it. The top is cut through that point, the hole wall ends at its own
  corner. That boolean still reads closed; the union eight booleans later gives 2 open + 1 non-manifold.
- With `CSG.options.heal` off, 773's subtract reads **closed**: the mesh's `fillSliverLoops` (exchange.js) faces over
  any clean loop of up to 6 open edges under 5e-5 wide. So a needle hole is hidden until `healCracks` puts one of the
  two points into the other side's edge, which turns the hole into a flap on an edge used three times. "Closed" by
  `checkBody` therefore does not mean the two sides hold the same points.
- **The G13 union on the 1f42c07 kernel** (`repros/g13-union-options.js`) is the same defect in a harder place: its two
  shell halves already carry points 9e-6 apart and true features of 4e-5 to 2e-4 (slab steps), so a pair that
  stands for one point cannot be told from a real feature by distance. See 3.

## 2. The fix (csg.js `bandSnap`, section "a band vertex and its split points: one point")

At the cause, in the split, not a wider weld:

1. While one operand is clipped by the other's tree, `splitPolygon` notes every vertex it takes as on a plane while it
   is off it (with the plane), and every split point it makes (with the plane that made it and the plane of the polygon
   it was made in). Nothing is noted in a tree build or an exact retry.
2. Points that stand for one point are grouped: a split point of one solid with a band vertex of the other, when the
   split point is within 1e-5 of the plane the vertex was taken as on, the vertex within 1e-5 of the plane that made
   the split point and of the split polygon's plane, and the two are 1e-6 to 1e-4 apart; and a band vertex that is
   itself a split point with an original vertex of the other solid on the same terms.
3. Each group goes to its fixed point (an original vertex, or a vertex the solid's own tree build made); with none, to
   the split point that lies on the plane exactly. The move is made by position in every polygon of both solids, so
   both sides of every edge get the bitwise-same point. A polygon left with under three points goes (the needle).
4. A point that sits inside an edge of a face the boolean left whole (a T-junction) stays unless it moves along that
   edge.
5. Never worse: the snapped list is dropped when the welded mesh round the moved points has more open / non-manifold
   edges than the list as it was (`CSG.options.cracks`, set by kernel-mesh.js). `retryExact` decides between the first
   run and the exact retry exactly as before, then takes the snapped list in place of the first run.
6. A boolean with no such group returns bitwise what it returned.

What I tried first and dropped, with the numbers:

| version | rule | result |
|---|---|---|
| 1 | any split point within 1e-4 of a band vertex on one shared plane | 773, 829 and sheet 929 closed, but stack 166 and 428 opened (closed before), 665 went 6 → 21 open; it collapsed true 4e-5 features in shell slabs |
| 3 | the three-plane rule above, groups, T-junction guard | 773, 829 closed; stack 763 and 862 opened (closed before), 761 / 866 / 870 went from refused to open: all shells |
| 4 | + never worse by the mesh count per boolean | the same shells still opened: no single boolean got worse, the slab assembly as a whole did (761: 0 cracks on the first attempt without the snap, 8 with; 862: 28 / 53) |
| final | + shell slab assembly without the snap, + `retryExact` left to decide as before | below |

The shell exclusion (kernel-features.js `buildShell` turns `CSG.options.band` off for its own booleans) is a measured
limit, not a fix: slabs touch along edges and facets by design, nearly every boolean of the assembly has band vertices
(862: 147 000 noted in one shell), and the assembly is a lottery that the shell guard's retries already play. Over the
116 shells of stack fuzz 1–250 and 750–1000, with the snap on inside the shell: 106 closed on the first attempt
against 108 without, 627 first-attempt cracks in total against 590 (better in seeds 113 and 763, worse in 202, 761
and 862).

The `retryExact` change of version "final" came from the kernel suite: with the snapped list feeding the retry's
decision, `rfGI` "G18 cut flat at 20 heights" opened at one height (34 open + 11 non-manifold: the retry that used to
win there was no longer run). With the decision left as it was, the row passes.

## 3. Acceptance

| | before | after |
|---|---|---|
| rfGA G13 on main | closes on the shell guard's first attempt | the same (`tries: 1, open: [0]`; its shell is assembled without the snap, so it is the same solid; hard row in rfMP and rfMJ) |
| stack fuzz 773 | 2 open + 1 non-manifold | closed (1 point moved, 7.4e-6); closed-form volume to 1e-9 (hard row) |
| stack fuzz 829 | 2 open + 1 non-manifold, 2 bodies | closed, 1 body (the two kept regions make up the whole disk; the piece with the flap had stayed a body of its own) (hard row) |
| rfGA table (48 rows) | 0 open, 2 refused | 0 open, 2 refused; every volume the same to 9 decimals |
| rfFT table (69 parts) | 0 open | 0 open; one volume moved: S20 (drafted boss hole) 9.352014843 → 9.352014842 (1.1e-10 relative, polygon volume 4.5e-9) |
| stack fuzz 1000 | 643 ok, 352 refused, 5 open | 645 ok, 353 refused, 2 open |
| sheet fuzz 1000 | 911 ok, 87 refused, 2 open | the same, seed for seed |
| round fuzz 1000 | 967 ok, 33 refused | the same, seed for seed |
| examples (29) | | 29 / 29; polygons and mass properties of all 29 **bit-identical** (hash of every vertex and plane, `JSON` of `massProps`) |

Every seed whose state changed (all stack; none in sheet or round):

| seed | before | after | why |
|---|---|---|---|
| 203 | 0 open, 1 non-manifold | closed (its Cut-Extrude refusal was there before too) | the last Combine: 5 points moved |
| 773 | 2 open, 1 non-manifold | closed (its two rib refusals were there before too) | the groove cut: 1 point |
| 829 | 2 open, 1 non-manifold | ok | the Intersect: 24 points over 12 booleans |
| 880 | refused: "Failed to shell the part" | ok | the body going into the shell differs by 14 moved points and the shell then closes; the shell itself is assembled as before |
| 908 | 6 open, 3 non-manifold | 4 open, 2 non-manifold | still open (shell), see 4 |

No seed that was closed is open.

**The G13 union on the 1f42c07 kernel is not closed by this.** `repros/g13-union-options.js` with the final csg.js:
10 open + 2 non-manifold, unchanged (9 points would move in that union; the snapped list is dropped every time
because the mesh round them counts more cracks). Without the "never worse" and T-junction rules (version 3) the same
union went 12 → 4 in situ, and on the two halves as main's csg.js makes them 6 → 9 after healing but 16 → 6 before
it: the snap closes the sites where one point stands for another and opens others where a half already holds two
vertices 9e-6 apart on one edge (a wall's edge passing a corner it should end on). Those halves are made by the
slab assembly; on main the shell no longer makes them.

Speed (same machine, five other agents running, each timed twice, interleaved; boolean time is the time inside
top-level `union` / `subtract` / `intersect`):

| | before | after |
|---|---|---|
| Funnel, boolean ms (median of 5) | 416, 317 | 325, 274 |
| 600-hole panel through the BSP (`plateOptions.on = false`), boolean ms | 808, 788 | 802, 743 |
| 600-hole panel, plate fast path, rebuild ms | 204, 187 | 178, 188 |

No slowdown outside run-to-run noise (the spread between two runs of one build is up to 25 % on this shared machine,
so these numbers cannot show a 5 % change either way). Neither part has a band vertex outside its shell (`bandStats`
calls 0), so the added work there is three array pushes per split point.

A boolean that does have points to move pays for a second `healCracks` and two small meshes (medians, snap on / off
in one process): 773's groove cut 12.8 / 11.1 ms, 829's subtract 4.8 / 3.4 ms, the G13 union of the repro (5000
polygons, 9 points, the snapped list dropped) 246 / 165 ms. The healing is most of it (42 ms a pass on that union).
The whole kernel suite on 8 workers, same machine, on two copies that differ only in this lane's files: 125.9 s
without (2913 rows), 119.3 s with (2915 rows) one after the other; 202.1 s and 201.1 s side by side. No measurable
difference.

## Suite

- Kernel, in the worktree (919faf5 + this lane): **2915 / 2915** (2909 + 6 rfMP rows), 140 s. Main has since moved to
  5c96046 (2942 rows); this lane was not rebased onto it, as the head asked.
- Examples: 29 / 29 on Anvil's engine, 29 / 29 with `--occt`.
- Not run: `occt-tests.html`, ui-smoke.
- A note on the baseline: the untouched copy lived in the session's scratchpad, which the six agents share; at 21:18
  another lane unpacked its own tree over it (it gained `kernel/rfMU.js`, 4 rows, and that lane's `occt-kernel.js`).
  The fuzz baselines were run before that. For everything measured after it I checked that the copy's `csg.js`,
  `kernel-mesh.js` and `kernel-features.js` are byte-identical to 919faf5 and that no other engine file differs from
  the worktree except `occt-kernel.js`, which Anvil's own engine does not load.

## 4. Still open, one line each

- **Stack 665** (plate, chamfer, mirror, boss, fillet, shell: 6 open + 1 non-manifold) and **908** (4 + 2): both crack
  inside the shell's slab assembly. Not touched (task 2). `compare.js --table rfGA --fuzz 1 --seed 665`.
- **Sheet 929 = rfFT pin 13** (7 open + 2 non-manifold): the subtract that opens (614 − 63 polygons, both closed) has
  **no** band vertex at all (`bandStats` calls 0), and its open edges run between points 6.8e-4 mm apart, seven times
  the snap's reach. So this is not the needle-hole cause. I did not trace where those points come from; the operand
  is the part after the first Unfold / cut / Fold, so the fold (kernel-sheetmetal.js, lane MQ's file this round) is
  the place to look. Version 1's loose rule closed it only by welding across that distance.
- **Sheet 91** (0 open, 9 non-manifold): not looked at.
- **Task 3** (fillets rfFT 259 / rfGA 226, the R2 round on a spline's end-face edge, the rfGB TODO row): not reached.
  No TODO or pin row was promoted: none of the rows the last report names is closed by this change.
- The shell's slab assembly is where the remaining booleans crack, and it is where the snap could not be used. A
  shell built without unions of touching slabs (one offset solid) would remove the class; that is a larger piece of
  work than this lane.

## 5. Existing tests changed

None. `anvil/tests/kernel-tests.html` gains one manifest line (`kernel/rfMP.js`).

## 6. Harness

```
node anvil/tests/fixtures/rfFT/compare.js --table rfGA --fuzz 500 --seed 1      (and --seed 501; 4 processes at most)
node anvil/tests/fixtures/rfFT/compare.js --fuzz 500 --seed 1                   (sheet and round)
node anvil/tests/fixtures/rfFT/compare.js [--table rfGA]                        (the two tables)
node anvil/headless/anvil.js test --only rfMP
```
`CSG.options.band = false` gives main's booleans back; `CSG.bandStats` counts events, pairs, moved, blocked (T-junction),
kept, undone (mesh count), lost (an exact retry won).
