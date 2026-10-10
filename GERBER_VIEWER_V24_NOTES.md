# Gerber Viewer V24

## Improvements
- Replaced fixed five-degree arc tessellation with adaptive tessellation targeting a maximum chord sagitta of 0.01 mm.
- The adaptive arc sampler is shared by plotted tracks, regions, and board outlines because all use `makeArcPoints`.
- A hard 720-segment cap bounds worst-case import work for large/full-circle arcs.
- Added regression tests for large-radius arc detail and bounded full-circle tessellation.

## Validation status
- Source-level change and tests added. Vitest/build and official Ucamco test files were not run in this environment.
- This improves geometric approximation; it does not implement general polygon Boolean compositing. Clear objects crossing dark-region boundaries still require a proper clipping engine.
