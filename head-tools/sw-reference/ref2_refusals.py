"""Section 1 of the second SolidWorks reference (lane swref, 2026-11-02): everything Anvil refuses, the same part in
SolidWorks. A case is one Anvil script; ref2_script.py replays it. Writes OUT2\\json\\refusals\\<id>.json with SolidWorks'
result (feature by feature, its message text, volume, bodies) and Anvil's.

    python ref2_refusals.py [ids] [--force]     then   python ref2_refusals.py --table
"""
import json
import sys

from ref2 import *  # noqa: F401,F403
from ref2_script import record, evaluate, replay_case

U = 'p.units("in");\n'
MM = 'p.units("mm");\n'
BLOCK = U + 'p.sketch("Top").rect(0, -3, 4, 3).end().extrude(2);\n'
SHELLBOX = MM + 'p.box(40, 20, 30);\np.shell(2, [[20, 30, 10]]);\n'
PLATE = U + 'p.sketch("Top").rect(0, -4, 3.75, 4).end().extrude(0.25);\np.fillet(0.03, [[0, 0.125, 4]]);\n'
DISK = U + 'p.sketch("Front").polyline([[0, 0], [1.5, 0], [1.5, 0.5], [0, 0.5]]).end().revolve(360);\n'
HOLEB = MM + 'p.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 10).extrude(15);\np.sketch("Top", 10).circle(45, -30, 3).end().cut("through", { reverse: true });\n'
TEE = MM + 'p.cylinder(15, 80, { axis: "x", at: [-40, 0, 0] });\np.cylinder(10, 40, { at: [0, 0, 0] });\n'
Q2 = U + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\n'
CASES = {
    # zero thickness
    "R01a_outlines_touch_at_corner": ("two rectangles sharing one corner, extruded together: the solid touches itself along an edge",
                                      U + 'p.sketch("Front").rect(0, 0, 1, 1).rect(1, 1, 1, 1).end().extrude(0.5);\n'),
    "R01b_boss_meets_on_one_edge": ("a second block that meets the first along one edge only",
                                    U + 'p.sketch("Front").rect(0, 0, 1, 1).end().extrude(0.5);\np.sketch("Front", 0.5).rect(1, 0, 1, 1).end().extrude(0.5);\n'),
    "R01c_tangent_holes_pattern": ("LPattern of Ø0.5 through holes exactly tangent: the wall between them goes to a line",
                                   BLOCK + 'p.sketch("Top", 2).circle(1, -1.5, 0.25).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 0.5, count: 2 });\n'),
    "R01d_cut_leaves_edge_contact": ("two diagonal quadrants cut out of a block: the two that stay touch along the vertical edge",
                                     Q2 + 'p.sketch("Top", 0.5).rect(0, 0, 3, 3).rect(-3, -3, 3, 3).end().cut("through", { reverse: true });\n'),
    "R02a_boss_meets_at_a_point": ("a second block that meets the first at one corner point only",
                                   U + 'p.sketch("Top").rect(0, -1, 1, 1).end().extrude(1);\np.sketch("Top", 1).rect(1, -2, 1, 1).end().extrude(1);\n'),
    "R02b_cone_tip_on_face": ("a cone (draft) whose tip just touches a plate: point contact",
                              U + 'p.sketch("Top").centerRect(0, 0, 3, 3).end().extrude(0.25);\np.sketch("Top", 0.75).circle(0, 0, 0.5).end().extrude(0.5, { draft: 45, reverse: true });\n'),
    "R01e_two_cuts_leave_edge_contact": ("two diagonal quadrants cut out by two separate cuts: the two that stay touch along the vertical edge",
                                         Q2 + 'p.sketch("Top", 0.5).rect(0, 0, 3, 3).end().cut("through", { reverse: true });\np.sketch("Top", 0.5).rect(-3, -3, 3, 3).end().cut("through", { reverse: true });\n'),
    "R18a_draft_collapses_exact": ("Ø1 boss, 45° draft, depth exactly the 0.5 where the profile collapses to a point", U + 'p.sketch("Top").circle(0, 0, 0.5).end().extrude(0.5, { draft: 45 });\n'),
    "R18b_draft_collapses_past": ("Ø1 boss, 45° draft, depth 1: past the collapse at 0.5", U + 'p.sketch("Top").circle(0, 0, 0.5).end().extrude(1, { draft: 45 });\n'),
    "R18c_draft_rect_collapses": ("2 × 1 rectangle boss, 45° draft, depth 1: past where the short side collapses at 0.5", U + 'p.sketch("Top").centerRect(0, 0, 2, 1).end().extrude(1, { draft: 45 });\n'),
    "R19a_miter_gap_zero": ("Miter Flange on two edges with gap 0", U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(-2, 0.0598, -2, 1.0598).end();\np.miterFlange([[2, 0.0598, 2], [4, 0.0598, 1]], { position: "inside", miterGap: 0, relief: "rect" });\n'),
    "R19b_teardrop_270": ("Tear Drop hem 270°, radius = T (Anvil's default; SolidWorks: the angle must be between 180 and 270)", U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.hem(0.5, [[2, 0.0598, 2]], { hemType: "teardrop", hemPosition: "inside", hemAngle: 270, hemRadius: 0.0598 });\n'),
    # all material
    "R03_cut_removes_everything": ("a Through All cut bigger than the block", BLOCK + 'p.sketch("Top", 2).rect(-1, -4, 6, 5).end().cut("through", { reverse: true });\n'),
    # 0 degree revolve
    "R04_revolve_zero": ("revolve of 0 degrees", U + 'p.sketch("Front").rect(0.5, 0, 1, 1).end().revolve(0);\n'),
    # cut that misses
    "R05a_miss_blind_wrong_way": ("Blind cut on the top face going away from the part", BLOCK + 'p.sketch("Top", 2).circle(1, -1, 0.25).end().cut(0.5, { reverse: false });\n'),
    "R05b_miss_through_wrong_way": ("Through All cut on the top face going away from the part", BLOCK + 'p.sketch("Top", 2).circle(1, -1, 0.25).end().cut("through", { reverse: false });\n'),
    "R05c_miss_blind_off_side": ("Blind cut whose sketch is beside the part", BLOCK + 'p.sketch("Top", 2).circle(8, -1, 0.25).end().cut(0.5, { reverse: true });\n'),
    "R05d_miss_through_off_side": ("Through All cut whose sketch is beside the part", BLOCK + 'p.sketch("Top", 2).circle(8, -1, 0.25).end().cut("through", { reverse: true });\n'),
    "R05e_pattern_of_cut_runs_off": ("LPattern of a hole with its second instance off the part",
                                     BLOCK + 'p.sketch("Top", 2).circle(1, -1, 0.25).end().cut("through", { reverse: true });\np.linearPattern({ dir: "x", spacing: 10, count: 2 });\n'),
    # lofts
    "R06_loft_coplanar": ("loft between two circles in one plane", U + 'var a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top").circle(0, 0, 1).id();\np.loft([a, b]);\n'),
    "R07a_loft_crossing_planes": ("a Top rectangle lofted to a Front octagon centred on the Top plane: each profile lies on both sides of the other's plane (rfFN2)",
                                  U + 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Front").polygon(0, 0, 1, 8, 22.5).id();\np.loft([a, b]);\n'),
    "R07c_loft_elbow_ok": ("a Top square lofted to a Front square that only touches the Top plane (an elbow, Anvil builds)",
                           U + 'var a = p.sketch("Top").rect(-1, 0, 2, 2).id();\nvar b = p.sketch("Front").rect(-1, 0, 2, 2).id();\np.loft([a, b]);\n'),
    "R07b_loft_out_of_order": ("loft through three parallel profiles picked out of order: heights 0, 2, 1 (the loft doubles back)",
                               U + 'var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 2).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 1).centerRect(0, 0, 1, 1).id();\np.loft([a, b, c]);\n'),
    # sweeps
    "R08a_sweep_path_back": ("sweep along a path that doubles back on its own line", U + 'p.sketch("Front").circle(0, 0, 0.3);\np.sweep({ path: [[0, 0, 0], [0, 0, 1], [0, 0, 0]] });\n'),
    "R08b_sweep_tight_corner": ("sweep Ø1 profile round a sharp corner with only 0.1 of path after it", U + 'p.sketch("Front").circle(0, 0, 0.5);\np.sweep({ path: [[0, 0, 0], [0, 0, 2], [0.1, 0, 2]] });\n'),
    "R08c_sweep_arc_tighter_than_profile": ("sweep R 0.5 profile along an arc of R 0.3", U + 'var prof = p.sketch("Top").circle(0, 0, 0.5).id();\nvar path = p.sketch("Front").arc(0.3, 0, 0.3, 90, 180).id();\np.sweep({ profile: prof, path: path });\n'),
    "R08d_sweep_u_narrower_than_profile": ("sweep R 0.5 profile round a U path whose legs are 0.8 apart: the legs overlap",
                                           U + 'var prof = p.sketch("Top").circle(0, 0, 0.5).id();\nvar path = p.sketch("Front").line(0, 0, 0, 3).arc(0.8, 3, 0.8, 90, 180).arc(0.8, 3, 0.8, 0, 90).line(1.6, 3, 1.6, 0).id();\np.sweep({ profile: prof, path: path });\n'),
    # shell
    "R09a_shell_over_convex_round": ("shell 0.0625 open top, Ø3 × 0.5 disk with a R 0.03 rim round (rfGB pin)", DISK + 'p.fillet(0.03, [[1.5, 0.5, 0]]);\np.shell(0.0625, [[1.4, 0.5, 0]]);\n'),
    "R09b_shell_closed_over_round": ("shell 0.0625, no face removed, same disk", DISK + 'p.fillet(0.03, [[1.5, 0.5, 0]]);\np.shell(0.0625, []);\n'),
    "R09c_shell_box_over_round": ("shell 0.5 open top, 4 × 3 × 2 box with R 0.25 vertical edges", U + 'p.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(2);\np.fillet(0.25, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.shell(0.5, [[0, 2, 0]]);\n'),
    "R09d_shell_under_round_ok": ("shell 0.0625 open top, disk with a R 0.1 rim round (thinner than the round, Anvil builds)", DISK + 'p.fillet(0.1, [[1.5, 0.5, 0]]);\np.shell(0.0625, [[1.0, 0.5, 0]]);\n'),
    # draft
    "R10a_draft_tangent_round": ("Draft 1° of two opposite side faces, one tangent to an undrafted R 0.25 corner round (rfGB fuzz pin 6)",
                                 U + 'p.sketch("Top").centerRect(0, 0, 5.5, 3.25).end().extrude(0.5);\np.fillet(0.25, [[2.75, 0.25, 1.625]]);\np.draft(1, [0, 0, 0], [[0, 0.25, -1.625], [0, 0.25, 1.625]]);\n'),
    "R10b_draft_one_tangent_face": ("Draft 1° of only the +z side face, tangent to the round", U + 'p.sketch("Top").centerRect(0, 0, 5.5, 3.25).end().extrude(0.5);\np.fillet(0.25, [[2.75, 0.25, 1.625]]);\np.draft(1, [0, 0, 0], [[0, 0.25, 1.625]]);\n'),
    "R10c_draft_along_tangent": ("Draft 1° of the +z side face with Along Tangent: the corner round drafts with it (SolidWorks builds; volume with the taper inward)",
                                 U + 'p.sketch("Top").centerRect(0, 0, 5.5, 3.25).end().extrude(0.5);\np.fillet(0.25, [[2.75, 0.25, 1.625]]);\np.draft(1, [0, 0, 0], [[0, 0.25, 1.625]], { propagate: "tangent" });\n'),
    # fillet larger than the corner round it runs into
    "R11a_fillet_over_corner_round": ("R 0.0625 along a top edge with tangent propagation round a R 0.03 corner (rfFY)", PLATE + 'p.fillet(0.0625, [[1.875, 0.25, 4]]);\n'),
    "R11b_chamfer_over_corner_round": ("chamfer 0.0625 along the same edge", PLATE + 'p.chamfer(0.0625, [[1.875, 0.25, 4]]);\n'),
    "R11c_fillet_equal_corner_round": ("R 0.03 along the same edge (Anvil builds, sphere corner)", PLATE + 'p.fillet(0.03, [[1.875, 0.25, 4]]);\n'),
    # shelled box
    "R12a_R9_shelled_box_outer_edge": ("R9 on a 2 mm shelled box's bottom outer edge (rfFP)", SHELLBOX + 'p.fillet(9, [[0, 0, 10]]);\n'),
    "R12b_R7p2_shelled_box_rim": ("R7.2 round the 2 mm rim of a shelled box, outer edges (rfFM)", SHELLBOX + 'p.fillet(7.2, [[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20]]);\n'),
    "R12c_R1p9_shelled_box_rim": ("R1.9 round the same rim: under the wall (control)", SHELLBOX + 'p.fillet(1.9, [[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20]]);\n'),
    "R12d_R2p5_shelled_box_rim": ("R2.5 round the same rim: just over the 2 mm wall", SHELLBOX + 'p.fillet(2.5, [[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20]]);\n'),
    "R12e_R3_shelled_box_outer_edge": ("R3 on the shelled box's bottom outer edge: inside corner of the wall at R1 offset", SHELLBOX + 'p.fillet(3, [[0, 0, 10]]);\n'),
    # rounds over a hole / off the plate
    "R14a_concave_over_hole": ("concave R 0.4 at a boss root, a hole 0.25 from the boss", Q2 + 'p.sketch("Top", 0.5).circle(0, 0, 0.5).end().extrude(1);\np.sketch("Top", 0.5).circle(1, 0, 0.25).end().cut("through", { reverse: true });\np.fillet(0.4, [[0.5, 0.5, 0]]);\n'),
    "R14b_concave_off_plate": ("concave R 0.4 at a boss root, boss 0.25 from the plate's edge", Q2 + 'p.sketch("Top", 0.5).circle(1.25, 0, 0.5).end().extrude(1);\np.fillet(0.4, [[1.75, 0.5, 0]]);\n'),
    "R14c_convex_hole_rim_runs_under_boss": ("R3.981 on a hole rim, the setback under a boss (Anvil builds; rfFR)", HOLEB + 'p.fillet(3.981, [[47.971178, 10, 29.707365]]);\n'),
    "R14d_convex_hole_rim_off_plate": ("R16 on the same hole rim: runs off the plate and under the boss (Anvil refuses; rfFR)", HOLEB + 'p.fillet(16, [[47.971178, 10, 29.707365]]);\n'),
    # saddle
    "R15a_tee_saddle_fillet": ("R3 on the saddle edge of a pipe tee, Ø30 × Ø20 (rfFP)", TEE + 'p.fillet(3, [[0, 11.18033988749895, 10]]);\n'),
    "R15b_tee_saddle_chamfer": ("chamfer 3 on the same saddle edge", TEE + 'p.chamfer(3, [[0, 11.18033988749895, 10]]);\n'),
    "R15c_tee_saddle_inch": ("R 0.0625 on the saddle of a Ø2 × Ø1 tee in inches", U + 'p.cylinder(1, 6, { axis: "x", at: [-3, 0, 0] });\np.cylinder(0.5, 3, { at: [0, 0, 0] });\np.fillet(0.0625, [[0, 0.8660254037844387, 0.5]]);\n'),
    # ribs (Anvil builds, the fuzz stacks' ribs were refused by SolidWorks)
    "R20a_rib_normal_free_ends": ("Rib, Normal to Sketch: a 3 long line on a plane 1 above a 4 × 2 × 0.25 plate grows down to it, 0.2 thick (rfGA G24)",
                                  U + 'p.sketch("Top").centerRect(0, 0, 4, 2).end().extrude(0.25);\np.sketch("Top", 1).line(-1.5, 0, 1.5, 0).end().rib(0.2, { direction: "normal" });\n'),
    "R20b_rib_normal_edge_to_edge": ("Rib, Normal to Sketch: the line runs past both plate edges", U + 'p.sketch("Top").centerRect(0, 0, 4, 2).end().extrude(0.25);\np.sketch("Top", 1).line(-2.5, 0, 2.5, 0).end().rib(0.2, { direction: "normal" });\n'),
    # mirror of an edge feature
    "R16_mirror_fillet_edge_off_part": ("Mirror of a round whose mirrored edge is not on the part (rfGB)", U + 'p.sketch("Top").rect(1, -1, 3, 2).end().extrude(0.5);\np.fillet(0.25, [[4, 0.5, 0]]);\np.mirror("Right");\n'),
    "R17_pattern_block_about_edge": ("CirPattern ×2 of a whole block about an axis through its corner edge: the copies touch along the edge", U + 'p.sketch("Top").rect(0, -3, 4, 3).end().extrude(2);\np.circularPattern({ axis: "y", center: [0, 0, 0], count: 2 });\n'),
}


def run():
    ids = [k for k, v in CASES.items() if v[1]]
    cases = [{"id": k, "code": CASES[k][1]} for k in ids]
    chains = record(cases)
    anvil = evaluate(cases)

    def mk(k):
        def fn(ses):
            r = replay_case(ses, chains[k], k)
            r["desc"] = CASES[k][0]
            r["code"] = CASES[k][1]
            r["anvil"] = anvil[k]
            return r
        return fn
    run_cases("refusals", {k: mk(k) for k in ids}, pause=0.5)


def table():
    res = load_all("refusals")
    for k, r in res.items():
        a = r.get("anvil", {})
        print(k, "|", (r.get("desc") or "")[:60])
        if "exception" in r:
            print("   SW EXCEPTION", r["exception"][:200])
            continue
        for row in r.get("log", []):
            if not row["built"] or row.get("wrong") or row["messages"]:
                print("   SW %s built=%s %s %s" % (row["op"], row["built"], row.get("exception", ""), [m[:150] for m in row["messages"]]), row.get("wrong", ""))
        print("   SW  vol %s bodies %s | Anvil vol %s bodies %s errors %s" % (r.get("volume"), r.get("bodies"), a.get("volume"), a.get("bodies"), [e[:110] for e in a.get("errors", [])]))


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
