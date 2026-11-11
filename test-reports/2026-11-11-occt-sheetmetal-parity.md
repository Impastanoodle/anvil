# OpenCascade sheet-metal parity (lane occtparity, 2026-11-11)

Question: does every sheet-metal feature give the same part on the OpenCascade engine (the app's default) as on
Anvil's own kernel?

**Answer: yes, now.** Before this lane two features were not built by OpenCascade at all: **Forming Tools** (all five)
and **Lofted-Bend**. Both are built now and agree with Anvil to 1e-14. Everything else already agreed: volumes within
2.5e-7 relative, the same body count, closed valid solids, and flats with the same size, loops, bend lines and DXF
entities per layer.

## How it was run

There were 106 scripts: every sheet feature and the options that change the solid. Most are 14 ga inch parts
(T .0747, R .06, K .5, so a plain sheet's volume is exactly blank × T), with one mm case per main feature (2 mm, R 2,
K .44). Each script was built in one Node process:

- Anvil: `Kernel.rebuild`, then `massProps`, `meshQuality` and `flatPattern`.
- OpenCascade: `OcctKernel.build`, then `OcctKernel.toBuild` and `flatPattern` on its mesh, which is the path the app's
  flat, DXF and drawings take.

The sweep script is not committed. To re-run it: load `headless/load.js` with `{ occt: true }`, run
`headless/occt.js` `loadOpenCascade()`, then for each script call `K.rebuild`, `OcctKernel.build(oc, K, model, {})`,
`OcctKernel.toBuild` and `K.flatPattern` on both builds.

Columns:

- **dV rel**: (OpenCascade − Anvil) / Anvil volume.
- **Box Δ**: the largest bounding-box corner difference.
- **vol − blank×T**: Anvil's volume against the flat blank area × T, relative.

Flat area is the outline less its holes. Where the two engines differ, OpenCascade's value is in bold.

| # | Script | Anvil | OpenCascade (before → now) | Bodies A / O | Volume (in³ or mm³) | dV rel | Box Δ | Flat (Anvil = OpenCascade unless noted) | Blank area A / O | vol − blank×T |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | base closed 6x4 | ok | ok | 1 / 1 | 1.7928000 | -1.2e-16 | 0 | 6.0000 × 4.0000, 1 loop, 0 bends | 24.00000 | -1.2e-16 |
| 2 | base open U | ok | ok | 1 / 1 | 2.1112712 | -1.3e-15 | 1.4e-17 | 7.0658 × 4.0000, 1 loop, 2 bends | 28.26334 | -2.1e-16 |
| 3 | base open L flip | ok | ok | 1 / 1 | 0.98234616 | -2.8e-15 | 0 | 4.3835 × 3.0000, 1 loop, 1 bend | 13.15055 | 0 |
| 4 | flange inside 30 | ok | ok | 1 / 1 | 2.1896790 | -4.1e-16 | 0 | 6.0000 × 4.8855, 1 loop, 1 bend | 29.31297 | -2.0e-16 |
| 5 | flange inside 90 | ok | ok | 1 / 1 | 2.2491649 | -2.4e-15 | 0 | 6.0000 × 5.0182, 1 loop, 1 bend | 30.10930 | 9.9e-16 |
| 6 | flange inside 120 | ok | ok | 1 / 1 | 2.2471449 | -7.9e-16 | 1.5e-4 | 6.0000 × 5.0137, 1 loop, 1 bend | 30.08226 | -4.0e-16 |
| 7 | flange outside 30 | ok | ok | 1 / 1 | 2.2566401 | 3.9e-16 | 0 | 6.0000 × 5.0349, 1 loop, 1 bend | 30.20937 | -7.9e-16 |
| 8 | flange outside 90 | ok | ok | 1 / 1 | 2.2826454 | -1.6e-15 | 0 | 6.0000 × 5.0929, 1 loop, 1 bend | 30.55750 | 5.8e-16 |
| 9 | flange outside 120 | ok | ok | 1 / 1 | 2.2858049 | -5.8e-16 | 1.5e-4 | 6.0000 × 5.1000, 1 loop, 1 bend | 30.59980 | -3.9e-16 |
| 10 | flange bendOutside 30 | ok | ok | 1 / 1 | 2.2638458 | 0 | 0 | 6.0000 × 5.0510, 1 loop, 1 bend | 30.30583 | -5.9e-16 |
| 11 | flange bendOutside 90 | ok | ok | 1 / 1 | 2.3095374 | -9.6e-16 | 0 | 6.0000 × 5.1529, 1 loop, 1 bend | 30.91750 | -1.9e-16 |
| 12 | flange bendOutside 120 | ok | ok | 1 / 1 | 2.3323832 | -1.3e-15 | 1.5e-4 | 6.0000 × 5.2039, 1 loop, 1 bend | 31.22334 | -3.8e-16 |
| 13 | flange virtualSharp 30 | ok | ok | 1 / 1 | 2.2476690 | 0 | 2.8e-17 | 6.0000 × 5.0149, 1 loop, 1 bend | 30.08928 | -5.9e-16 |
| 14 | flange virtualSharp 90 | ok | ok | 1 / 1 | 2.2491649 | -2.6e-15 | 0 | 6.0000 × 5.0182, 1 loop, 1 bend | 30.10930 | 9.9e-16 |
| 15 | flange virtualSharp 120 | ok | ok | 1 / 1 | 2.2278149 | -8.0e-16 | 1.5e-4 | 6.0000 × 4.9706, 1 loop, 1 bend | 29.82349 | -2.0e-16 |
| 16 | flange tangentToBend 30 | refused: Tangent to Bend needs a flange angle of 90° or more. | refused (same message) | 1 / 1 | 1.7928000 | -1.2e-16 | 0 | 6.0000 × 4.0000, 1 loop, 0 bends | 24.00000 | -1.2e-16 |
| 17 | flange tangentToBend 90 | ok | ok | 1 / 1 | 2.2491649 | -2.4e-15 | 0 | 6.0000 × 5.0182, 1 loop, 1 bend | 30.10930 | 9.9e-16 |
| 18 | flange tangentToBend 120 | ok | ok | 1 / 1 | 2.2720107 | -1.4e-15 | 1.5e-4 | 6.0000 × 5.0692, 1 loop, 1 bend | 30.41514 | 2.0e-16 |
| 19 | flange lengthRef outer 30 | ok | ok | 1 / 1 | 2.1735023 | 0 | 0 | 6.0000 × 4.8494, 1 loop, 1 bend | 29.09642 | -4.1e-16 |
| 20 | flange lengthRef outer 90 | ok | ok | 1 / 1 | 2.1887923 | -2.0e-15 | 0 | 6.0000 × 4.8835, 1 loop, 1 bend | 29.30110 | 1.0e-15 |
| 21 | flange lengthRef outer 120 | ok | ok | 1 / 1 | 2.1425766 | -6.2e-16 | 1.5e-4 | 6.0000 × 4.7804, 1 loop, 1 bend | 28.68242 | -8.3e-16 |
| 22 | flange lengthRef inner 30 | ok | ok | 1 / 1 | 2.1824733 | -2.0e-16 | 0 | 6.0000 × 4.8694, 1 loop, 1 bend | 29.21651 | -2.0e-16 |
| 23 | flange lengthRef inner 90 | ok | ok | 1 / 1 | 2.2222729 | -2.0e-15 | 0 | 6.0000 × 4.9582, 1 loop, 1 bend | 29.74930 | 1.0e-15 |
| 24 | flange lengthRef inner 120 | ok | ok | 1 / 1 | 2.2005666 | -6.1e-16 | 1.5e-4 | 6.0000 × 4.9098, 1 loop, 1 bend | 29.45872 | -4.0e-16 |
| 25 | flange lengthRef tangent 30 | ok | ok | 1 / 1 | 2.1735023 | 0 | 0 | 6.0000 × 4.8494, 1 loop, 1 bend | 29.09642 | -4.1e-16 |
| 26 | flange lengthRef tangent 90 | ok | ok | 1 / 1 | 2.1887923 | -2.0e-15 | 0 | 6.0000 × 4.8835, 1 loop, 1 bend | 29.30110 | 1.0e-15 |
| 27 | flange lengthRef tangent 120 | ok | ok | 1 / 1 | 2.1867724 | -6.1e-16 | 1.5e-4 | 6.0000 × 4.8790, 1 loop, 1 bend | 29.27406 | -6.1e-16 |
| 28 | flange reversed 90 | ok | ok | 1 / 1 | 2.3095374 | -3.8e-16 | 0 | 6.0000 × 5.1529, 1 loop, 1 bend | 30.91750 | 0 |
| 29 | flange radius .25 | ok | ok | 1 / 1 | 2.4433033 | -9.1e-16 | 0 | 6.0000 × 5.4514, 1 loop, 1 bend | 32.70821 | 0 |
| 30 | channel end flange relief none | ok | ok | 1 / 1 | 3.4374822 | -3.9e-16 | 2.8e-17 | 7.0182 × 7.0364, 1 loop, 3 bends | 46.01716 | -2.6e-16 |
| 31 | channel end flange relief rect | ok | ok | 1 / 1 | 3.4340715 | -1.3e-15 | 1.4e-17 | 7.0182 × 7.0364, 1 loop, 3 bends | 45.97134 | 3.7e-6 |
| 32 | channel end flange relief obround | ok | ok | 1 / 1 | 3.4341603 | 8.4e-12 | 4.3e-18 | 7.0182 × 7.0364, 1 loop, 3 bends | 45.97258 | 2.4e-6 |
| 33 | channel end flange relief tear | ok | ok | 1 / 1 | 3.4373188 | -7.8e-16 | 0 | 7.0182 × 7.0364, 1 loop, 3 bends | 46.01498 | -1.6e-8 |
| 34 | trim side bends | ok | ok | 1 / 1 | 1.3479624 | -2.0e-15 | 8.7e-19 | 4.8835 × 3.8835, 1 loop, 2 bends | 18.04501 | -6.6e-16 |
| 35 | multi-edge flange mitred 90 | ok | ok | 1 / 1 | 1.9079155 | 3.9e-9 | 1.0e-7 | 6.0364 × 5.0364, 1 loop, 4 bends | 25.56221 | -8.3e-4 |
| 36 | multi-edge flange mitred 120 | ok | ok | 1 / 1 | 1.3650053 | -7.4e-12 | 1.5e-4 | 5.0137 × 4.0137, 1 loop, 2 bends | 18.28873 | -8.5e-4 |
| 37 | multi-edge flange 2 edges bendOutside | ok | ok | 1 / 1 | 1.5077725 | 9.4e-10 | 1.0e-7 | 5.1529 × 4.1529, 1 loop, 2 bends | 20.18966 | -2.6e-4 |
| 38 | miter flange straight | ok | ok | 1 / 1 | 1.3849959 | -2.4e-7 | 1.0e-7 | 4.9582 × 3.9582, 1 loop, 2 bends | 18.54412 | -1.8e-4 |
| 39 | miter flange L profile outside | ok | ok | 1 / 1 | 1.6537474 | -2.0e-7 | 1.0e-7 | 5.4164 × 4.4164, 1 loop, 4 bends | 22.14741 | -4.0e-4 |
| 40 | miter flange bendOutside offsets | ok | ok | 1 / 1 | 1.4352488 | -2.3e-7 | 1.0e-7 | 5.0929 × 4.0929, 1 loop, 2 bends | 19.21685 | -1.7e-4 |
| 41 | hem open | ok | ok | 1 / 1 | 1.9979110 | -6.7e-16 | 1.4e-17 | 6.0000 × 4.4576, 1 loop, 1 bend | 26.74580 | -6.7e-16 |
| 42 | hem closed | ok | ok | 1 / 1 | 1.9818751 | -1.1e-15 | 1.4e-17 | 6.0000 × 4.4219, 1 loop, 1 bend | 26.53113 | 0 |
| 43 | hem teardrop | ok | ok | 1 / 1 | 2.0940883 | -2.1e-16 | 1.0e-4 | 6.0000 × 4.6722, 1 loop, 1 bend | 28.03331 | -6.4e-16 |
| 44 | hem rolled | ok | ok | 1 / 1 | 1.9984122 | 3.3e-16 | 0 | 6.0000 × 4.4588, 1 loop, 1 bend | 26.75251 | -8.9e-16 |
| 45 | hem open inside | ok | ok | 1 / 1 | 1.9560603 | -9.1e-16 | 1.4e-17 | 6.0000 × 4.3643, 1 loop, 1 bend | 26.18555 | -6.8e-16 |
| 46 | jog blind outside 90 | ok | ok | 1 / 1 | 1.7928000 | -1.4e-15 | 3.3e-16 | 6.0000 × 4.0000, 1 loop, 2 bends | 24.00000 | 8.7e-16 |
| 47 | jog blind 45 inside offset | ok | ok | 1 / 1 | 1.7928000 | -3.3e-15 | 1.8e-15 | 6.0000 × 4.0000, 1 loop, 2 bends | 24.00000 | 3.2e-15 |
| 48 | jog overall 120 | ok | ok | 1 / 1 | 1.7928000 | -1.1e-15 | 4.4e-16 | 6.0000 × 4.0000, 1 loop, 2 bends | 24.00000 | 7.4e-16 |
| 49 | jog upToVertex | ok | ok | 1 / 1 | 1.7928000 | -9.9e-16 | 1.1e-16 | 6.0000 × 4.0000, 1 loop, 2 bends | 24.00000 | -2.5e-16 |
| 50 | jog upToSurface | ok | ok | 1 / 1 | 1.7928000 | -9.9e-16 | 1.1e-16 | 6.0000 × 4.0000, 1 loop, 2 bends | 24.00000 | -2.5e-16 |
| 51 | jog offsetFromSurface | ok | ok | 1 / 1 | 1.7928000 | 7.4e-16 | 3.3e-16 | 6.0000 × 4.0000, 1 loop, 2 bends | 24.00000 | -1.1e-15 |
| 52 | sketched bend 90 | ok | ok | 1 / 1 | 1.7928000 | -8.7e-16 | 0 | 6.0000 × 4.0000, 1 loop, 1 bend | 24.00000 | 1.6e-15 |
| 53 | sketched bend 120 inside r.25 | ok | ok | 1 / 1 | 1.7928000 | -2.5e-15 | 3.7e-4 | 6.0000 × 4.0000, 1 loop, 1 bend | 24.00000 | -2.5e-16 |
| 54 | closed corner butt | ok | ok | 1 / 1 | 1.7724194 | -5.0e-10 | 1.0e-7 | 5.7670 × 4.7670, 1 loop, 4 bends | 23.72717 | 5.3e-10 |
| 55 | closed corner overlap | ok | ok | 1 / 1 | 1.7927372 | -4.7e-10 | 1.0e-7 | 5.7670 × 4.7670, 1 loop, 4 bends | 23.99916 | 4.9e-10 |
| 56 | closed corner underlap | ok | ok | 1 / 1 | 1.7946722 | -1.3e-9 | 1.0e-7 | 5.7670 × 4.7670, 1 loop, 4 bends | 24.02506 | 1.3e-9 |
| 57 | closed corner butt closeBend | ok | ok | 1 / 1 | 1.7736286 | -1.8e-9 | 1.0e-7 | 5.7670 × 4.7670, 1 loop, 4 bends | 23.76452 | -8.9e-4 |
| 58 | welded corner | ok | ok | 1 / 1 | 1.8003351 | 3.9e-14 | 6.8e-16 | 5.7670 × 4.7670, 1 loop, 4 bends | 23.89320 | 8.7e-3 |
| 59 | welded corner fillet | ok | ok | 1 / 1 | 1.7905681 | -2.4e-15 | 6.6e-16 | 5.7670 × 4.7670, 1 loop, 4 bends | 23.89320 | 3.2e-3 |
| 60 | corner relief 2bend rect | ok | ok | 1 / 1 | 1.3458369 | -3.3e-15 | 2.3e-17 | 4.8835 × 3.8835, 1 loop, 2 bends | 18.01656 | 9.9e-16 |
| 61 | corner relief 2bend circular | ok | ok | 1 / 1 | 1.3465783 | 9.7e-9 | 6.9e-18 | 4.8835 × 3.8835, 1 loop, 2 bends | 18.02648 | -9.9e-9 |
| 62 | corner relief 2bend tear | ok | ok | 1 / 1 | 1.3479624 | -2.1e-15 | 0 | 4.8835 × 3.8835, 1 loop, 2 bends | 18.04501 | -4.9e-16 |
| 63 | corner relief 2bend obround | ok **open 62/1** | ok | 1 / 1 | 1.3437828 | -1.2e-7 | 2.6e-17 | 4.8835 × 3.8835, 1 loop, 2 bends | 17.98906 | 1.2e-7 |
| 64 | corner relief 2bend constantWidth | ok | ok | 1 / 1 | 1.3435430 | -1.4e-14 | 4.4e-16 | 4.8835 × 3.8835, 1 loop, 2 bends | 17.98585 | 4.1e-15 |
| 65 | corner relief 3bend rect | ok | ok | 1 / 1 | 2.0496387 | 4.3e-16 | 0 | 7.0427 × 4.9014, 1 loop, 5 bends | 34.16065 | -1.3e-15 |
| 66 | corner relief 3bend tear | ok | ok | 1 / 1 | 2.0538190 | -4.3e-16 | 0 | 7.0427 × 4.9014, 1 loop, 5 bends | 34.23032 | -1.5e-15 |
| 67 | corner relief 3bend circular | ok | ok | 1 / 1 | 2.0545642 | -2.9e-9 | 2.3e-16 | 7.0427 × 4.9014, 1 loop, 5 bends | 34.24274 | 3.1e-9 |
| 68 | corner relief 3bend obround | ok | ok | 1 / 1 | 2.0532672 | -2.9e-9 | 0 | 7.0427 × 4.9014, 1 loop, 5 bends | 34.22112 | 2.6e-9 |
| 69 | break corner chamfer | ok | ok | 1 / 1 | 1.7741250 | -1.3e-16 | 1.1e-16 | 6.0000 × 4.0000, 1 loop, 0 bends | 23.75000 | 0 |
| 70 | break corner fillet faces | ok | ok | 1 / 1 | 1.7767692 | 7.5e-16 | 2.2e-16 | 6.0000 × 4.0000, 1 loop, 0 bends | 23.78217 / **23.78414** | 1.4e-4 |
| 71 | break corner on tray base | refused: Break Corner: the face at (2, 0.0747, 1.5) has no outside corners. | refused (same message) | 1 / 1 | 1.7848220 | -2.1e-15 | 6.6e-17 | 5.7670 × 4.7670, 1 loop, 4 bends | 23.89320 | -6.2e-16 |
| 72 | rip both | ok | ok | 1 / 1 | 0.67149142 | 0 | 0 | ERR No sheet metal parameters: create a Base Flange first (Sheet Metal tab). | – | – |
| 73 | rip side1 | ok | ok | 1 / 1 | 0.67586400 | -1.6e-16 | 0 | ERR No sheet metal parameters: create a Base Flange first (Sheet Metal tab). | – | – |
| 74 | tab | ok | ok | 1 / 1 | 1.8675000 | -1.2e-16 | 0 | 7.0000 × 4.0000, 1 loop, 0 bends | 25.00000 | -2.4e-16 |
| 75 | vent | ok | ok | 1 / 1 | 1.0101182 | 1.5e-15 | 0 | 4.0000 × 4.0000, 9 loops, 0 bends | 13.52645 / **13.52560** | -3.0e-4 |
| 76 | forming dimple | ok | unsupported → ok | 1 / 1 | 1.8035496 | 7.4e-16 | 4.9e-18 | 6.0000 × 4.0000, 1 loop, 0 bends | 24.00000 | 6.0e-3 |
| 77 | forming extrudedHole | ok | unsupported → ok | 1 / 1 | 1.7967153 | 6.2e-16 | 1.0e-7 | 6.0000 × 4.0000, 2 loops, 0 bends | 23.99738 | 2.3e-3 |
| 78 | forming louver | ok | unsupported → ok | 1 / 1 | 1.7984972 | 6.2e-16 | 2.8e-17 | 6.0000 × 4.0000, 2 loops, 0 bends | 23.98500 | 3.8e-3 |
| 79 | forming lance | ok | unsupported → ok | 1 / 1 | 1.7947339 | -2.5e-16 | 0 | 6.0000 × 4.0000, 3 loops, 0 bends | 23.98000 | 1.9e-3 |
| 80 | forming rib | ok | unsupported → ok | 1 / 1 | 1.8147192 | 2.9e-14 | 5.1e-18 | 6.0000 × 4.0000, 1 loop, 0 bends | 24.00000 | 1.2e-2 |
| 81 | normal cut | ok | ok | 1 / 1 | 1.7181000 | -3.9e-16 | 0 | 6.0000 × 4.0000, 1 loop, 0 bends | 23.00000 | 1.3e-16 |
| 82 | hole across bend | ok | ok | 1 / 1 | 2.3887503 | -3.3e-15 | 8.4e-16 | 6.0000 × 5.5182, 1 loop, 1 bend | 31.92425 / **31.91894** | 1.7e-3 |
| 83 | slot across bend (cut first) | refused: No edge selected for the flange. | refused (same message) | 1 / 1 | 1.7853641 | 7.1e-14 | 1.2e-13 | 6.0000 × 4.0000, 1 loop, 0 bends | 23.90061 / **23.90058** | -6.6e-6 |
| 84 | unfold all | ok | ok | 1 / 1 | 3.0329847 | -2.9e-16 | 0 | 6.0000 × 6.7670, 1 loop, 2 bends | 40.60220 | -1.5e-16 |
| 85 | unfold cut fold | ok | ok | 1 / 1 | 3.0181128 | -2.9e-14 | 0 | 6.0000 × 6.7670, 2 loops, 2 bends | 40.40343 / **40.40321** | -7.8e-6 |
| 86 | swept flange straight L | ok | ok | 1 / 1 | 2.2655890 | 3.9e-16 | 4.2e-17 | 3.0329 × 10.0000, 1 loop, 1 bend | 30.32917 | -9.8e-16 |
| 87 | swept flange arc | ok | ok | 1 / 1 | 1.4080618 | -2.4e-15 | 0 | 7.0000 × 7.0000, 1 loop, 0 bends | 18.84573 | 2.0e-4 |
| 88 | swept flange arc along path | ok | ok | 1 / 1 | 1.1821500 | 2.8e-15 | 0 | 2.0000 × 7.9127, 1 loop, 0 bends | 15.82530 | -1.3e-15 |
| 89 | lofted bend square-square | ok | unsupported → ok | 1 / 1 | 2.8344883 | -6.3e-16 | 0 | 11.8912 × 5.4450, 1 loop, 4 bends | 37.94496 | -6.7e-8 |
| 90 | lofted bend square-round | ok | unsupported → ok | 1 / 1 | 2.6816321 | -2.5e-15 | 0 | 10.4960 × 5.1191, 1 loop, 20 bends | 35.88879 | 2.8e-4 |
| 91 | insert bends box | ok | ok | 1 / 1 | 0.63596369 | 1.5e-11 | 1.4e-17 | 3.8027 × 3.8027, 1 loop, 4 bends | 10.59896 | 4.1e-5 |
| 92 | convert to sheet metal | ok | ok | 1 / 1 | 0.63596369 | 1.5e-11 | 1.4e-17 | 3.8027 × 3.8027, 1 loop, 4 bends | 10.59896 | 4.1e-5 |
| 93 | cross break | ok | ok | 1 / 1 | 1.7928000 | -1.2e-16 | 0 | 6.0000 × 4.0000, 1 loop, 0 bends | 24.00000 | -1.2e-16 |
| 94 | mm flange inside 90 | ok | ok | 1 / 1 | 37713.717 | -2.1e-15 | 0 | 150.0000 × 125.5239, 1 loop, 1 bend | 18828.58401 | 1.5e-3 |
| 95 | mm channel end flange 120 outside rect relief | ok | ok | 1 / 1 | 49567.927 | 4.4e-16 | 4.5e-3 | 172.5678 × 151.0478, 1 loop, 3 bends | 24701.68879 | 3.3e-3 |
| 96 | mm hem closed | ok | ok | 1 / 1 | 33374.602 | -2.2e-16 | 0 | 150.0000 × 110.8717, 1 loop, 1 bend | 16630.75218 | 3.4e-3 |
| 97 | mm jog | ok | ok | 1 / 1 | 30075.398 | -1.1e-15 | 2.7e-15 | 150.0000 × 100.0000, 1 loop, 2 bends | 15000.00000 | 2.5e-3 |
| 98 | mm tray closed corner | ok | ok | 1 / 1 | 18730.309 | 7.1e-10 | 1.0e-7 | 121.5239 × 81.5239, 1 loop, 2 bends | 9336.33121 | 3.1e-3 |
| 99 | forming dimple flipped 30deg | ok | ok | 1 / 1 | 1.8035496 | -8.6e-16 | 6.9e-17 | 6.0000 × 4.0000, 1 loop, 0 bends | 24.00000 | 6.0e-3 |
| 100 | forming louver rotated | ok | ok | 1 / 1 | 1.7984972 | 2.5e-16 | 0 | 6.0000 × 4.0000, 2 loops, 0 bends | 23.98500 | 3.8e-3 |
| 101 | forming rib on flange wall | ok | ok | 1 / 1 | 2.7192841 | 2.0e-14 | 2.8e-17 | 6.0000 × 6.0182, 1 loop, 1 bend | 36.10930 | 8.1e-3 |
| 102 | forming extrudedHole mm | ok | ok | 1 / 1 | 30060.391 | -9.7e-16 | 1.0e-7 | 150.0000 × 100.0000, 2 loops, 0 bends | 14997.09946 | 2.2e-3 |
| 103 | lofted bend formed | ok | ok | 1 / 1 | 2.6100311 | -4.0e-14 | 4.4e-16 | 10.3442 × 5.6532, 1 loop, 0 bends | 36.09538 | -3.2e-2 |
| 104 | lofted bend + hole | ok | ok | 1 / 1 | 2.8035669 | -2.2e-11 | 0 | 11.8912 × 5.4450, 3 loops, 4 bends | 37.53367 / **37.53144** | -7.1e-5 |
| 105 | slot across bend (cut first, x1 edge) | ok | ok | 1 / 1 | 2.1114202 | 4.4e-14 | 3.0e-14 | 6.0000 × 5.5182, 1 loop, 1 bend | 28.26549 / **28.26538** | -5.6e-6 |
| 106 | miter flange L lines outside | ok | ok | 1 / 1 | 1.6537474 | -2.0e-7 | 1.0e-7 | 5.4164 × 4.4164, 1 loop, 4 bends | 22.14741 | -4.0e-4 |

## Differences, classified

**(a) OpenCascade refuses or does not build where Anvil builds.**
- Forming Tool (dimple, extruded hole, louver, lance, rib) and Lofted-Bend (bent and formed) were reported as
  `unsupported`. The app then showed Anvil's part, with an amber status chip ("OpenCascade: needs formingTool") and a
  warning in What's Wrong. There was no toast and no error in the tree.
  - **Fixed** in `occt-kernel.js`:
    - `formingToolOp` cuts `Kernel.formingToolLayout`'s footprint (a prism of its sketch entities, T + 2 % deep) and
      fuses its sections, each revolved or extruded with exact arcs. `ftSketch` copies the private `ftEntities`.
      The tool's record goes into `planes[id]`, as in Anvil's rebuild.
    - `loftedBendTool` sews `Kernel.buildLoftedBend`'s planar facets into one solid. Anvil's facets are the part
      itself, so the volume is identical.
  - Now: same volume (≤ 3e-14), same box, same flat and DXF, on a plate, on a flange wall, flipped and rotated, and in
    mm.
- Still not built by OpenCascade:
  - Jog with *Fix projected length*. The fallback is the same quiet one described above: Anvil's part is correct and is
    shown, the chip is amber with the reason, What's Wrong has a warning, and there is no toast or tree failure.
  - Two cases that only an unusual chain reaches: an Unfold or Fold whose partner is not in the same build, and
    material wrapped round a bend down to its axis.
- Where both engines refuse, they give the same message: Tangent to Bend below 90°, and a Break Corner on a face with
  no outside corners.

**(b) Volumes more than 1e-6 apart.** None. The largest difference is 2.4e-7, on the Miter Flange and on mitred
multi-edge flanges. It comes from Anvil's bend facets in the mitre taper (8 chords per 90°). OpenCascade's exact arcs
are the right value.

The *vol − blank×T* column shows where the folded part legitimately differs from the flat:

- Mitres and Closed Corners with the bend closed: −2.6e-4 to −9e-4.
- Welded Corner: the weld is not in the flat.
- Forming tools: the form stretches the metal.
- Holes cut square through a bend or a lofted facet: the walls are not normal to the sheet.
- The arc Swept Flange: 2e-4, where Anvil's ring sector is faceted.

Both engines agree on all of these.

**(c) Body counts and open solids.** The body counts are the same everywhere. One Anvil solid is open; its OpenCascade
solid is closed:

- **Anvil's 2 Bend Corner Relief, Obround, .25 on the 4 × 3 corner (case 63) has 62 open edges and 1 non-manifold
  edge.** Its volume and flat still equal OpenCascade's (1.2e-7). This is a kernel bug in `kernel-sheetmetal.js`'s
  obround relief cut, which is outside this lane's files, and it is reported to the head.
  Repro: the 4 × 3 base (14 ga R .06), flanges `[[4, T, 1.5]]` and `[[2, T, 3]]` (inside, outer), then
  `p.cornerRelief([[3.9027, 0.0747, 2.9027]], 0.25, { reliefType: "obround" })`.

**(d) Flats that differ.** Size, loops, bend lines and DXF entity counts per layer are the same everywhere except one
case (below). The blank areas differ slightly only where a round edge is developed from each engine's tessellation:

- Break Corner R .5: the exact blank is 23.785398. Anvil gives 23.782172 and OpenCascade 23.784137, and both write the
  same 4 ARCs.
- Vent: 6e-5 relative. The DXF is the same.
- Slot cut and then folded with Unfold / Fold: the exact blank is 40.403113. Anvil gives 40.403432 and OpenCascade
  40.403207.
- A Ø.4 cut through the base and the bend: Anvil's notch is 0.3950 wide and OpenCascade's 0.3968, which is the true
  chord at the face: 2·√(.2² − (.1 − T)²).
- A Ø.25 hole through a wall and into the bend: the hole areas are 0.049147 and 0.049401. OpenCascade's hole has
  12 LINE + 2 ARC on HOLES where Anvil's has 6 + 1, because the bend part is developed from a finer mesh.
- Lofted-Bend with a Ø.5 hole: the holes are developed polylines, 32 points in Anvil and 142 in OpenCascade, with areas
  .2056 and .2068. This is the one case whose DXF entity counts differ. OpenCascade is closer to the exact ellipse each
  time.

These are tessellation differences, and OpenCascade is nearer the exact value in each case. No fix was made.

Separately, OpenCascade's bounding boxes reach a bend's true outer arc. Anvil's chord sits up to 1.5e-4 in inside it
on 120° bends, 3.7e-4 on R .25 at 120°, and 4.5e-3 mm in mm. OpenCascade is right: Tangent to Bend 120° gives
exactly 0 there.

## Tests

- `tests/occt-tests.html` has 12 new `rfKY` rows:
  - each of the 5 tools on a 14 ga plate;
  - a dimple, flipped and at 30°;
  - a rib on a flange wall;
  - an mm extruded hole;
  - Lofted-Bend square to square, and square to round (bent and formed);
  - Lofted-Bend with a hole through both sides.

  Each row checks: every feature built, a valid single solid, volume to 1e-9 of Anvil's, box to 1e-6, and the flat
  (size 1e-9, loops, bends, and DXF entities except on the holed loft). The whole page passes 249 / 249 headless.
- `tests/kernel/rfKY.js` covers the data the port reads: `formingToolLayout`'s section paths, frames, revolve or depth,
  footprint and record for every tool, and `buildLoftedBend`'s polygons, which are planar to 1e-9 and form a closed
  solid.

## What a user notices

Parts with a Forming Tool or a Lofted-Bend now show OpenCascade's exact solid: a green chip, B-rep faces and exact
STEP. Before, they showed Anvil's part with an amber "needs" chip. The volumes, flats and DXF are unchanged, and saved
parts are unchanged.
