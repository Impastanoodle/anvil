# Solids fidelity 2, lane NC (solidfid2), 2026-11-15 / 16

Continues `2026-11-15-solids-fidelity.md` (lane MP, `bandSnap`). Tests: `anvil/tests/kernel/rfNC.js` (10 hard rows),
rfFT pin 13 promoted. "Closed" is `Evaluate.checkBody` open and non-manifold edges both 0. Every "before / after" below
was measured in one worktree by switching this lane's rules off and on (`CSG.options.band`, `CSG.options.bandWide`,
`K.fitProbe.rim`, `K.shellGuard.hollowRim`, `CSG.prototype.planar`), seed for seed, with status, message and both
volumes compared to 9 decimals; "main" is all of them off and the snap off, "MP" is this lane's four off.

## 0. The row lane MP broke (rfMU, a tube's bore rim rounded R.25): fit check, not the snap

- The snap is right there: the tube's first boolean (cylinder less bore) left a stray point 2.3e-5 from a vertex of
  the bore's top rim (r .7499986 on a .75 circle); the snap moves it onto that vertex. The rim then has 48 vertices,
  not 49.
- The fillet was refused before any boolean, by the fit check (`kernel-mesh.js`, the closed-chain stations): a round
  that uses up the whole face has its setback 1e-4 × size inside the far rim's true circle, which is air between
  that rim's chords everywhere except at their ends. All four stations (every 12th rim vertex) counted as "off the
  plate" and "a whole circle off the plate all the way round" is refused. With 49 vertices there was a fifth station,
  and the indexing put one on a vertex both rims share. The row passed on main by that accident.
- Fix: a setback point between a chord of the face's circular outer rim and that rim's true circle is on the face
  (`rfNCunderArc`); it no longer counts as off the plate. A round truly wider than the face is still refused
  (R.251, R.26, R.3 on the 0.25 face: hard row).
- Sweep, 148 rounds / chamfers on the rims of 7 tubes and 3 discs, sizes 50 % to 100 % of the face:

  | | builds, volume = Pappus to 1e-6 | refused | volume off |
  |---|---|---|---|
  | main | 130 | 10 | 8 |
  | MP | 126 | 14 | 8 |
  | now | 138 | 2 | 8 |

  The 4 MP lost are the tube 1 / 0.75 at 100 % and 99.9 %; the 8 gained over main are tubes 0.5 / 0.375 and 3 / 2.5
  at 100 % and 99.9 %, refused on main by the same accident the other way.
- **Found, not fixed** (the same in all three columns): a round or chamfer from the bore of the tube 0.75 / 0.25
  (bore Ø.5 in a 0.5 wide wall) is 4.5e-4 (R.25) to 8.8e-3 (chamfer .4995) off the closed form in Mass Properties, and
  the full-width one (R.5) is refused. Repro: `p.sketch("Top").circle(0,0,.75).circle(0,0,.25).end().extrude(1);
  p.fillet(.25, [[.25,1,0]])`, want π(.75² − .25²) − 2π(.25 + x̄)·A with A = r²(1 − π/4), x̄ = r(5/6 − π/4)/(1 − π/4).
- The fillet corpus again: round fuzz 1000 has no status or message change from main to MP to now. Volumes: MP's snap
  moved 9 seeds (all ok → ok, largest 2.1e-8, seed 510), this lane 1 more (907, 2.9e-10). MP's "identical seed for
  seed" was status only. Stack fuzz: seed 56's fillet ("could not close the rounded faces" on main) builds since MP;
  11 stack volumes moved with MP (largest 3.0e-8). Sheet fuzz: MP moved one part, seed 279 (polygon volume 5.6e-10,
  Mass Properties 1.785063325 → 1.785064098, 4.3e-7); this lane none but 929.

## 1. Shells

### Why the snap hurts inside a shell: measured on stack fuzz 761 (first shell, 648 booleans, one attempt)

- 8 points move in 6 of the booleans (9e-6 to 8.4e-5). **None is shared with a slab outside its own boolean**: no
  vertex of any of the other 643 slabs lies within 1e-4 of a moved point or of where it went. The report's guess
  (shared corners) is wrong.
- No boolean gets worse by the snap; one gets better: union 180 (two slabs, 183 + 159 polygons) has 6 cracks
  without the snap and 0 with it.
- The 8 cracks of the attempt with the snap are born in two unions the snap does not touch (no group there at all):
  union 323 (2676 + 2558 polygons, 4 cracks, 9.4e-3 from the nearest moved point) and union 646 (4656 + 4313, 0.87
  away). Union 323 replayed alone, operands as made with and without the snap:

  | operand B | first run (heal's count / mesh cracks) | exact retry | taken | result |
  |---|---|---|---|---|
  | made without the snap (6 cracks of its own) | 97 / 3 | 89 / 0 | the retry | closed |
  | made with the snap (clean) | 99 / 4 | 103 / 10 | the first run | 4 cracks |

  Both runs of that union are imperfect either way; which one is clean is decided by a one-polygon difference in an
  operand. The crack itself is the known one: two slab caps 7.5° apart meet on a line, and a cap is cut 1e-4 past
  it (1e-5 / sin 7.5°). The snap cannot repair it: no point there stands for another by its three-plane rule.
- So a shell must stay without the snap because repairing an early union re-rolls later ones that are a coin toss
  with or without it, and the guard's five attempts are tuned on the unrepaired sequence. Corpus, this lane's state,
  snap on inside shells (`K.shellGuard.band = true`): stack fuzz 1000 = 646 ok, 352 refused, **2 open** (761: 3 + 1,
  870: 5 + 0) against 646 / 354 / 0 without, no seed better, 10 more volumes moved (up to 3.2e-7).

### Stack 665 (6 open + 1 non-manifold): the boss's root fillet beside the opening. Closed at its cause

- `buildShell`'s `mixedSurf` counted the removed top face as a "faceted face" beside the fillet's torus (the first
  chord's tilt makes their edge concave), so the torus stayed at depth T and out of `ringSolids`. Its facets got
  slabs: a lip under the opening (the last slab grown T·tan(φ/2) past the tangent edge), a wall end leaning inward
  (it needs d·tan φ, twice that), and a slab assembly that cracked on every attempt (7, 9, 708, 146).
- Now: a removed plane the surface meets tangentially is not mixed; a hollow round tangent to a removed face is one
  solid (`ringSolid`) from the first attempt, its wall under the opening the surface normal at the tangent edge;
  its outer side goes out half the tube radius at most (T / 2 past a tube of R.03 turned it inside out). The slab
  path (trimmed by the opening, grown 2·d·tan φ) stays as the fallback when `ringSolid` gives null.
- A 4 × 3 × .375 plate, Ø.5 boss, root fillet R .03 / .0625 / .1, top removed, shell .02 / .04 / .0625 (9 shells):

  | | closed on attempt 1 | closed later | open | refused | volume against the closed form |
  |---|---|---|---|---|---|
  | before | 4 | 1 | 2 (11 + 6, 9 + 0) | 2 | 9e-5 to 1.3e-4 (the lip) |
  | now | 9 | | | | 9e-16 to 1e-14 |

  Closed form: tray + boss cap + tube + the quarter ring between the fillet and its offset, ending straight down
  from the tangent circle (the rule SolidWorks was measured on for a convex rim, rfGH; **not measured in SolidWorks
  for a hollow one**).
- Fuzz shells with such a round: 665, 763, 862 close on the first attempt (were 5 attempts each: 17 s, 21 s, 28 s;
  now 0.2 s, 2.2 s, 0.6 s). Their volumes move with the lip: 763 −4.6e-4, 862 −9.0e-5, and 469 / 811 (second shell of
  a shelled part) 2e-5.

### Stack 908 (4 open + 2 non-manifold): not a shell. The mirror's union. Closed at its cause

- Its shell closes on the first attempt. The cracks come from the last feature, Mirror Body onto itself 1 in off
  centre: union of 8025 + 1811 polygons, both closed.
- The copy's bottom rim crosses the original's coplanar bottom. A split point of the original's bottom, made by the
  plane of one rim facet (the R.03 round's first chord, 11.5° off the bottom), lay within 1e-5 of the next facet's
  plane, 2.17e-4 from the rim vertex where the three planes meet (1e-5 / (sin 11.5° · sin 5.4°)). Two needles,
  2.17e-4 and 6.7e-5 wide. The snap passed both by: the polygon is within 20° of the plane (`bandCos`), and the first
  is past `bandReach` (1e-4).
- Fix (`bandSnap`, the wide rule): a band vertex that is itself a split point goes to an **original vertex of the
  other solid that lies exactly (1e-9) on all three planes** (the one it was taken as on, the one that made it, its
  polygon's), up to `bandWide` 1e-3 away and whatever the angle. Vertices of polygons within 20° are noted apart
  and take part in nothing else. 908's union: 10 points move, 0 cracks; the volume is the same to 1e-8.

### Acceptance

| | MP | now |
|---|---|---|
| stack fuzz 1000 | 645 ok, 353 refused, 2 open | **646 ok, 354 refused, 0 open** |
| rfGA table (47 built rows) | 0 open, 2 refused | the same; no row's status or volume (9 decimals) differs |
| rfFT table (69) | 0 open | the same; no row differs |
| examples (23 parts) | | polygons and `massProps` of all 23 **bit-identical** with this lane's rules on and off (Mug, Funnel, Enclosure lid included) |
| round fuzz 1000 | 967 ok, 33 refused | the same; 1 volume moved 2.9e-10 |
| sheet fuzz 1000 | 911 ok, 87 refused, 2 open | 912 ok, 87 refused, 1 open (91, see 2) |

Stack seeds whose status changed: 665 open → ok, 908 open → closed (its two rib refusals stay). No seed that was
closed is open. Volume only: 469, 763, 811, 862 (above).

Still refused in the corpus for a shell: 484, 866 ("Failed to shell the part"), not looked at. A Ø1 boss with a root
fillet R.0625 on a 0.5 plate, shell .05, is also refused, before and now (its cracks are where the boss's tube meets
its cap, not at the fillet).

## 2. The two open sheet-metal fuzz parts

### Sheet 929 = rfFT pin 13 (7 open + 2 non-manifold): closed, pin 13 is a hard row

Chain, each link measured on the saved operands:
1. The second cut across the unfolded bend (body 114 − hole 92 polygons) leaves two true points 2.17e-5 apart: a
   facet line of the unfolded bend passes that close to a vertex of the hole. No defect yet.
2. The Fold takes "before − after" as the cut-out. `healCracks` puts the near point into the neighbouring wall's
   edge, which it is 4.2e-6 off: that wall polygon is now 4.2e-6 off flat. Inside the splitter's 1e-5, harmless.
3. `smBool` (kernel-sheetmetal.js) does the Fold's booleans at 16× on 14 ga. There the wall is 6.8e-5 off flat, past
   1e-5: the subtract (614 − 63) reads it as bent and leaves 9 cracks. That is why MP found no band vertex and
   points "6.8e-4 mm apart": the numbers were at 16×.

Fix: `CSG.prototype.planar()` (csg.js): a polygon with a vertex more than 5e-6 off its plane is fanned into triangles
from that vertex; `smBool`'s `sc()` calls it on what it scales up. **That is one line in kernel-sheetmetal.js, lane
MY's file** (`function sc` inside `smBool`, about line 3609; nothing else there is touched). Sheet fuzz 1000: only
929 changes.

### Sheet 91 = rfFT pin 6 (0 open, 9 non-manifold): the part, not the boolean. Left as it is

All 9 edges are used four times and lie on one line, x = 2.6726497, y = T: the tangent line of the x = 3.25 flange's
bend. That 120° flange is mitred past the corner, and the inside of its bend leaves the sheet's top face
tangentially. The cut starts on the top face and goes down, so above it a cusp of that bend is left touching the
other bend's end along that line. A true line of contact. `kernel-rebuild.js` already warns ("The cut leaves two
walls of the part touching along a line (zero-thickness geometry at a bend) …", lane MQ). The fuzz harness
(`compare.js`) counts it open because it does not read warnings; it should count a warned line contact apart.
Hard row in rfNC: 0 open, every such edge on that line, the warning present.

## 3. Fillets that could not close: not reached

Stack 226 and round 259 are still refused ("could not close the rounded faces"), as are the rfFV and rfGB TODO rows.
Only looked at 259: a boss whose root circle is cut by a Ø.5 hole .49 from its axis, rounded R.225.

## 4. What `bandSnap` costs

Only a boolean that moves points pays. Per boolean (sums over 10 runs after warm-up, ms):

| | total off / on | second heal | `bandSnap` | the two meshes |
|---|---|---|---|---|
| 908's union (9836 polygons, 10 points) | 200 / 244 | 20 | 11 | 6 |
| 829's subtract (934, 2 points) | 12.8 / 17.0 | 2.2 | 0.5 | 1.0 |
| 773's groove cut (331, 1 point) | 9.4 / 13.2 | 0 | 0.3 | 1.2 |

How often: 150 stack parts make 28 such booleans (13 kept, 2 undone, 13 lost to a retry) and 1236 exact retries, each
a whole second boolean. Tried: heal the snapped list first and skip the other heal and the retry when nothing is
left open. The result is provably the same, but the snapped list's own count was never 0 in 600 fuzz parts, so it
skipped nothing; taken out again. Nothing cut.

## Existing tests changed

- `rfFT.js`: pin 13 into `HARD` (it is closed). No expectation weakened.
- `kernel-tests.html`: one manifest line.

## Suite

- Kernel, in the worktree (MP + this lane): **2958 / 2958** (2948 + 10 rfNC rows), 159 s on 8 workers.
- Examples: 29 / 29 on Anvil's engine, 29 / 29 with `--occt`.
- Not run: `occt-tests.html`, ui-smoke.
- The first full run had 2 failures of my own making (rfFR and rfGG, "R16 on that hole rim": refused): the fit
  check's new line sat between `if (I.conv) { … }` and its `else`, which then belonged to the new `if`. Moved inside
  the braces; both rows pass. The corpora were run again on the final code, the baselines too (the misplaced line
  was in them as well; it changed one seed, stack 611, two fillet refusals instead of one).

## Harness (all in the worktree's `.scratch/`, not committed; the switches are in the engine)

`CSG.options.bandWide = 0`, `K.fitProbe.rim = false`, `K.shellGuard.hollowRim = false`, `K.shellGuard.band = true`
(the snap inside shells), `CSG.options.bandLog(fn)` (the moved points of each snap, from / to), `CSG.options
.retryLog(fn)` (both runs of an exact retry with their counts). A boolean's operands replay exactly through
`CSG.pack` / `unpack` (planes included).
