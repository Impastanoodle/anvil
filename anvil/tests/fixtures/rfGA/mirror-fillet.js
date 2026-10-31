// rfGA finding (G10): Mirror (feature) of a fillet. Closed form 4 − 2·(1 − π/4)·0.0625·2 = 3.946350; Anvil gives
// 3.975439 with the bbox grown to x −2.002, y 0.502, z ±1.01 (the round's material is added on the mirrored side);
// OpenCascade refuses ("Mirror source feature has no geometry.")
p.units("in");
p.sketch("Top").centerRect(0, 0, 4, 2).end().extrude(0.5);
p.fillet(0.25, [[2, 0.5, 0]]);
p.mirror("Right");
