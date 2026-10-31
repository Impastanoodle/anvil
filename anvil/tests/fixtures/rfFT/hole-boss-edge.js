// rfFT finding (fuzz round 73): a Ø0.5 hole through the edge of a Ø0.5 × 1 boss on a 0.25 plate: 3 open edges
p.units("in");
p.sketch("Top").rect(0, -4.5, 4, 4.5).end().extrude(0.25);
p.sketch("Top", 0.25).circle(1.33, -3.1532, 0.25).end().extrude(1);
p.sketch("Top", 1.25).circle(0.9453, -2.9922, 0.25).end().cut("through", { reverse: true });
