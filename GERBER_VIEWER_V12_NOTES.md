# CirZuit Gerber Viewer V12 notes

## Implemented in this increment

- Gerber clear-polarity (`%LPC`) closed regions that are fully contained in a previously imported dark copper region are represented as polygon holes on that region.
- The existing WebGL zone renderer triangulates polygon holes with `earcut`, so the supported clear-region case is excluded from the GPU-filled copper triangles rather than painted with a background-colored overlay.
- Dark `G36/G37` regions continue to be imported as filled zones.
- Added a regression test for a clear rectangular region inside a prior dark copper rectangle.

## Important limitations

- This is not a complete Gerber polarity compositor. LPC flashes, strokes, overlapping clear shapes, clear regions crossing the edge of multiple dark objects, and arbitrary multi-object boolean compositing still require a full ordered image-operation model.
- Aperture macros and block apertures are not fully interpreted by this change.
- The parser/renderer has not been certified against the full Ucamco 2026.05 test suite. Run the project's Vitest/build commands and compare real files against the official Ucamco reference viewer before production use.
- The intended renderer for imported zones is the existing WebGL zone renderer; this change does not claim that every Gerber object category in the entire application has been audited to remove SVG/2D-canvas drawing.
