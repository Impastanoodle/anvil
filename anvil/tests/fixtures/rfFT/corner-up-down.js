// rfFT finding (fuzz sheet 132): back flange folded down, left flange up, 0.0359 sheet R 0.0718: 10 open edges
p.units("in");
p.sheet(0.0359, 0.0718, 0.5);
p.sketch("Top").rect(0, -5.75, 6, 5.75).end().baseFlange();
p.flange(1.25, [[3, 0.0359, 5.75]], { position: "inside", lengthRef: "outer", reverse: true });
p.flange(0.875, [[0, 0.0359, 2.875]], { position: "inside", lengthRef: "outer" });
