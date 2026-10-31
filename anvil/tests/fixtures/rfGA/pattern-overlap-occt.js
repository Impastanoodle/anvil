// rfGA finding (G30, OpenCascade): an LPattern whose copies overlap loses the base plate on OpenCascade (1.5 in³, bbox
// starts at y 0.25); Anvil = the closed form 1.25 + 3.25 × 0.5 = 2.875
p.units("in");
p.sketch("Top").rect(0, -1, 5, 1).end().extrude(0.25);
p.sketch("Top", 0.25).rect(0.5, -1, 1, 1).end().extrude(0.5);
p.linearPattern({ dir: "x", spacing: 0.75, count: 4 });
