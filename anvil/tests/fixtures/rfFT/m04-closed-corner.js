// rfFT finding: two 1 in flanges at a corner of a 4 × 3 16 ga blank, Closed Corner (Butt): 7 open edges
p.units("in");
p.sheet(0.0598, 0.0598, 0.5);
p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();
p.flange(1, [[2, 0.0598, 0]], { position: "inside", lengthRef: "outer" });
p.flange(1, [[0, 0.0598, 1.5]], { position: "inside", lengthRef: "outer" });
p.closedCorner([[0.0299, 0.6, 0.1196]]);
