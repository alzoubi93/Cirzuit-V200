# Gerber Viewer V38

- Added conservative partial track erasure for LPC regions and flashes: tracks are sampled along each segment, and intervals whose full sampled stroke cross-section lies inside the clear polygon are removed.
- Preserves the surviving track portions as separate polylines when an LPC shape clears only the middle of a track.
- Added a regression test for a rectangular clear region cutting a straight copper track into two surviving segments.
- This is a conservative sampled approximation, not a general polygon Boolean compositor. Boundary slivers, partial pad intersections, and partial copper-zone intersections still need a robust polygon clipping engine to guarantee exact Gerber compositing.
- Build/tests were not run unless separately verified in the execution environment.
