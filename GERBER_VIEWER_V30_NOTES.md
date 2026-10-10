# Gerber Viewer V30

## Changes
- Improved LPC clear-polarity handling for fully covered copper primitives: prior imported pads and tracks are removed when the clear shape fully contains their geometry.
- Track removal checks the centerline points and samples the stroke perimeter, avoiding removal when the track width extends outside the clear shape.
- Existing contained-zone hole behavior is retained.
- Added a regression test for a dark circular pad followed by a larger clear flash.

## Limitations
- Partial intersections are intentionally not clipped; this needs a polygon Boolean/compositing stage to avoid incorrect geometry.
- Full Gerber 2026.05 compliance and runtime/build verification are not claimed.
