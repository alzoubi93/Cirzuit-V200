# Gerber Viewer V23

## Improvements
- Hardened clear-polarity subtraction for the existing polygon-hole model.
- A clear object is only represented as a hole when every vertex and every edge midpoint is inside a copper zone, preventing a partially out-of-bounds clear from incorrectly erasing copper outside that zone.
- Applies contained clear geometry to every containing zone rather than only the most recently-created zone, keeping each zone boundary and its WebGL fill polygons synchronized.
- Added regression tests for overlapping copper zones and for a clear flash crossing the copper boundary.

## Limitations
- This is a safety/correctness improvement for contained clear objects, not a complete polygon Boolean engine. Intersecting clear shapes, arbitrary overlapping dark/clear image compositing, and clears crossing zone boundaries remain unsupported rather than being approximated as invalid holes.
- Full Ucamco Gerber 2026.05 test-file validation and browser/WebGL visual verification have not been run in this environment.
