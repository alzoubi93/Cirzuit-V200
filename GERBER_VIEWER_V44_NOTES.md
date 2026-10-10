# Gerber Viewer V44

## Added
- Added exact rectangular subtraction for a partially overlapping LPC clearance against a rectangular copper zone.
- When the clear rectangle crosses the zone boundary, the remaining copper is emitted as up to four non-overlapping rectangular zone fragments rather than storing a hole that extends outside the zone.
- Added a regression test for a clearance rectangle that cuts through the right edge of a rectangular copper pour.

## Limits
- This is a targeted boolean operation for axis-aligned rectangular zone/clearance pairs only. Arbitrary concave polygons, diagonal boundaries, and partial pad intersections still require a general polygon Boolean engine.
- Track splitting remains sampling-based and is not a mathematically exact stroke boolean operation.
- Build and tests were not run in this environment because project dependencies are not installed.
