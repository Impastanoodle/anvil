// rfGA finding (G46): an Overlap Closed Corner with ratio 0.5 leaves 8 open edges on Anvil's engine (Butt and
// Underlap on the same tray are closed); OpenCascade 1.447207 in³
p.units("in");
p.sheet(0.0598, 0.0598, 0.5);
p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();
p.flange(1, [[2, 0.0598, 0]], { position: "inside", lengthRef: "outer" });
p.flange(1, [[4, 0.0598, 1.5]], { position: "inside", lengthRef: "outer" });
p.flange(1, [[2, 0.0598, 3]], { position: "inside", lengthRef: "outer" });
p.flange(1, [[0, 0.0598, 1.5]], { position: "inside", lengthRef: "outer" });
p.closedCorner([[0.0299, 0.6, 0.1196]], { cornerType: "overlap", ratio: 0.5 });
