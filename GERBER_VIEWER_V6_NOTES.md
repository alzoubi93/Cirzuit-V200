# Gerber Viewer V6 — rendering fidelity pass

This pass focuses only on importing and displaying Gerber geometry more faithfully.

## Changes
- Parse the Gerber FS coordinate format including leading/trailing zero suppression, integer/fractional digit counts, and absolute/incremental coordinate mode.
- Honor G70/G71 unit switches and G90/G91 coordinate mode switches.
- Preserve standard circular, rectangular, and obround/oval flash aperture shapes in the 2D pad renderer.
- Compute imported board bounds from physical pad/via/track extents instead of object centers alone, avoiding clipping when an outline file is absent.
- Remove display-only pad shrinking. Gerber copper is now displayed at the parsed physical dimensions rather than modifying its appearance to force gaps.
- Add regression tests for trailing-zero suppression, incremental coordinates, unit switching, and obround flashes.

## Current limitations
This is an incremental improvement, not yet a complete Gerber implementation. Full support for aperture macros, clear polarity, region fills (G36/G37), arcs/interpolation, step-repeat blocks, and complete Excellon zero-suppression formats remains future work. The viewer should not infer pin numbers or electrical connectivity from ordinary Gerber geometry.
