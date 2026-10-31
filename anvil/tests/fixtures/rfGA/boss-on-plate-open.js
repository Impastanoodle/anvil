// rfGA finding (fuzz 69, pin 1): a plain Ø0.75 × 0.25 boss on a 3.5 × 2.75 × 0.5 plate leaves 4 open edges on
// Anvil's engine (at (1, 0.6446) it is closed); OpenCascade is fine
p.units("in");
p.sketch("Top").centerRect(0, 0, 3.5, 2.75).end().extrude(0.5);
p.sketch("Top", 0.5).circle(1.0089, -0.6446, 0.375).end().extrude(0.25);
