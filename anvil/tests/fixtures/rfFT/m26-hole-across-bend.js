// rfFT finding: an L bracket (16 ga) unfolded, a Ø0.5 hole cut across the bend, folded: 61 open + 3 non-manifold edges
p.units("in");
p.sheet(0.0598, 0.0598, 0.5);
p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();
p.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });
p.unfold([3, 0.0598, 2], null);
p.sketch("Top", 0.0598).circle(3, 0.05, 0.25).end().cut("through", { reverse: true });
p.fold(null);
