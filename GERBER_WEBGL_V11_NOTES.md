# Gerber WebGL Import — V11

## Implemented in this pass
- `G36/G37` dark copper regions are collected as polygon geometry and stored as `PcbZone` / `filledPolygons`.
- Imported region geometry is sent to the existing `PcbWebGLZones` rendering path, which triangulates zone polygons and renders them through WebGL.
- Region bounds participate in board bounds/centering, and region coordinates are translated with imported tracks/pads/vias.
- Step-and-repeat now duplicates simple imported region polygons alongside tracks and flashes.
- Tests added for basic region import and for not painting clear-polarity regions as dark copper.

## Important limits
- This is a first-pass implementation for simple dark, single-contour regions. It does not yet implement full Gerber boolean compositing for `LPC`, nested contours/holes, aperture macros, aperture blocks, or all `LM/LR/LS` transformations.
- Clear-polarity operations are not subtracted from prior dark geometry; such files must be treated as not faithfully rendered. The diagnostics warning remains important.
- Gerber copper geometry uses the existing WebGL PCB zone pass; this change does not claim that every other UI element (text/UI chrome) is WebGL-rendered.
- Build/tests were not run in this environment because `node_modules` is absent.
