# Gerber Viewer V45

## Added
- Extended LPC subtraction beyond axis-aligned rectangular zones for the specific case of an axis-aligned rectangular clearance crossing a simple, non-rectangular copper zone without existing holes.
- Decomposes the residual polygon into non-overlapping trapezoidal fragments using vertical slabs split at every polygon vertex and clearance x-edge.
- Preserves the original zone if decomposition produces no fragments, avoiding destructive fallback behavior.
- Added a regression test for a rectangular clearance crossing the sloped edge of a triangular copper region.

## Limits
- This is not a general-purpose polygon Boolean engine. Clear polygons that are non-rectangular, and zones with existing holes, still use the existing conservative path.
- Partial pad intersections and exact track-stroke clipping are not solved by this stage; track clipping remains sampling-based.
- Build and tests were not run in this environment because dependencies are not installed.
