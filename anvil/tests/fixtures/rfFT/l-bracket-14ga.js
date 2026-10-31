// rfFT finding (fuzz sheet 221): a plain 14 ga L bracket, 7.75 × 4 base, 1.5 flange: 13 open + 1 non-manifold edge
// (6 wide, or 16 ga, is closed)
p.units("in");
p.sheet(0.0747, 0.0747, 0.4);
p.sketch("Top").rect(0, -4, 7.75, 4).end().baseFlange();
p.flange(1.5, [[3.875, 0.0747, 0]], { position: "inside", lengthRef: "outer" });
