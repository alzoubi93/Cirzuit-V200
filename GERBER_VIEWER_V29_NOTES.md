# Gerber Viewer V29

## Changes
- Improved contained-clearance handling for copper zones.
- A clear shape fully inside an existing hole is ignored, preventing redundant nested holes.
- When a later clear shape fully contains earlier holes, those holes are removed and replaced with the larger clearance in both the editable zone boundary and WebGL filled-polygon data.
- Added a regression test for sequential nested clear flashes.

## Limitations
- This is a containment-based improvement, not a general polygon Boolean engine. Partially overlapping clearances and clear shapes crossing copper-zone boundaries still need robust polygon clipping/compositing to match Gerber image semantics.
- Gerber compatibility is not claimed to be complete. Compare against the official Ucamco Gerber test files and reference viewer for broader validation.
- Project build and Vitest were not run in this environment unless dependencies are installed separately.
