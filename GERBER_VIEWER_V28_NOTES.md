# Gerber Viewer V28

## Changes
- Added a defensive recursion-depth limit to Gerber aperture-block parsing.
- Recursive block parses now carry their nesting depth forward.
- Added a regression test with cyclic block references to ensure malformed input cannot recurse indefinitely and freeze the browser.
- Preserved V27 nested-block extraction and coordinate-origin handling.

## Important limitations
- This does not implement full Gerber clear-polarity boolean compositing. LPC shapes that cross copper-zone boundaries, overlap prior shapes, or need ordered image compositing still require a proper polygon boolean/raster compositor.
- The parser's recursion cap is defensive; it is not a substitute for full Gerber semantic validation.
- Build and Vitest were not run in this environment because project dependencies are not installed.
