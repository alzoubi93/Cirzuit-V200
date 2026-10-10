# Gerber Viewer WebGL V14 — development notes

This iteration extends the partial aperture-macro support from V13:

- Exposure-off circle/rectangle/vector-line/polygon primitives are now collected as transparent holes when fully contained inside a supported exposure-on primitive.
- Macro aperture dimensions and coordinates are converted from inches to millimetres while vertex counts and angles remain dimensionless.
- Added a regression test for a rectangular macro aperture with a circular exposure-off hole.

## Known limitations

This is still not full Gerber 2026.05 compliance. The parser does not yet evaluate macro variable assignments or arithmetic expressions, does not implement every macro primitive (including moiré and thermal), and cannot correctly boolean-compose exposure-off shapes that intersect or span multiple positive primitives. Layer polarity and ordered clear/dark compositing also need a broader model than the current zone-hole approximation. The official Ucamco Gerber test files should be used for systematic conformance testing. Tests/build were not run in this environment because project dependencies (`node_modules`) are absent.
