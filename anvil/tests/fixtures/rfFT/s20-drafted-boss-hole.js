// rfFT finding: a Ø1.5 boss extruded 1 with 3° draft, Ø0.5 hole through it: 3 open edges on Anvil's engine
p.units("in");
p.sketch("Top").circle(0, 0, 0.75).end().extrude(1, { draft: 3 });
p.sketch("Top", 1).circle(0, 0, 0.25).end().cut("through", { reverse: true });
