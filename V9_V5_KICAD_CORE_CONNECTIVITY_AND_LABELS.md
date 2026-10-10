# V9 V5 — KiCad Core connectivity and label orientation

This revision continues the native KiCad model instead of adding another renderer-only patch.

## Changes

- Net-label banner rotation is now independent from glyph rotation. A KiCad 180° label points its banner in the opposite direction while the text remains readable; 90°/270° labels use the screen-space vertical transform.
- Wire endpoint-to-segment T connections are included in the connectivity graph. Interior wire crossings remain disconnected unless represented by a junction.
- Connectivity registration is normalized across all points of a wire so pins and labels cannot create duplicate nets when they attach through a wire endpoint.
- The existing KiCad Core remains the persistence source for native symbol transforms and pin connectivity.
