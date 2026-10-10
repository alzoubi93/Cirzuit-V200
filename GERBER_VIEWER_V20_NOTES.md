# Gerber Viewer V20

## Combined changes
- Added initial support for Gerber Block Apertures (`%ABDnn*% ... %AB*%`). The parser captures the block body and, on a dark-polarity flash, parses its child commands with the file's format, unit, aperture, and macro definitions, then translates the generated tracks, pads, zones, holes, and outline segments to the flash location.
- Added a regression test for a block aperture containing a circular flash.
- Kept existing macro arithmetic and supported primitives, including legacy vector line, outline, Moire, and approximate thermal support.

## Limitations
- Nested block apertures are not fully supported.
- Clear-polarity block flashes are skipped rather than incorrectly painted as dark copper; polarity toggling inside blocks needs ordered boolean compositing.
- This is not full Gerber 2026.05 compliance. Official Ucamco test files and visual comparison against the reference viewer are still required.
- Tests/build were not run in the editing environment because dependencies are not installed.
