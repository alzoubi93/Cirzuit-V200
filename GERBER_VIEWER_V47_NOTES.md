# Gerber Viewer V47

- Added rectangular `LPC` subtraction for partially intersected rectangular copper pads without drill metadata. Residual copper is represented as up to four non-overlapping rectangular pads.
- Kept through-hole pads out of this splitting path to avoid duplicating or losing drill semantics.
- Added a regression test for a rectangular clearance crossing the edge of a rectangular copper flash.
- This is a constrained exact case; circular/oval pads, through-hole pads, arbitrary clearance shapes, and partial track-stroke clipping still need a general polygon boolean/stroke engine.
- Build and tests were not run in this environment because project dependencies are not installed.
