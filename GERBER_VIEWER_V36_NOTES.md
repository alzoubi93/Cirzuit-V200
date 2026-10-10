# Gerber Viewer V36

- Improved clear-polarity (`LPC`) handling when a clear region fully contains an earlier copper zone: the erased zone is now removed rather than left visible.
- Kept the existing contained-clearance-to-hole path for clear regions fully inside copper zones.
- Added a regression test for a clear region that fully covers and erases a prior copper region.
- Partial polygon intersections remain unsupported by this change; a robust polygon Boolean clipper is still required for those cases.
- Build and tests were not run because dependencies are not installed in this environment.
