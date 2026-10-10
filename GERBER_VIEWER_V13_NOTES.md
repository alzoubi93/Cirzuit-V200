# Gerber Viewer WebGL V13

## Implemented in this step
- Added initial support for numeric, literal Aperture Macro primitives 1 (circle), 5 (regular polygon), 20 (vector line), and 21 (center-line rectangle).
- Macro flashes on copper layers are converted to filled `PcbZone` polygon geometry so they can use the existing WebGL zone rendering path rather than being misrepresented as rectangular pads.
- Added a focused test for a circle macro flash.
- Kept prior Gerber coordinate, arc, SR, oval pad, region and Excellon fixes.

## Important compatibility limits
- This is partial Aperture Macro support, not full Gerber 2026.05 compliance. Macro arithmetic/variables, AD-supplied `$1...$n` parameters, exposure-off primitives and exact boolean compositing are not implemented.
- `%LPC` remains a limited contained-region case; correct ordered boolean compositing for all tracks, flashes, regions and nested polarity changes is not implemented.
- This change routes supported macro geometry through existing WebGL zone rendering; it does not prove that every Gerber-related UI element uses WebGL exclusively. Full rendering-path audit and official Ucamco test-suite validation remain required.
- Automated tests/build were not run in this environment because `node_modules` is absent.
