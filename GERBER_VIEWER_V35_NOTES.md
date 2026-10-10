# Gerber Viewer V35

- Normalized aperture-macro primitive geometry to flash-local coordinates before applying the outer LM/LR/LS graphics-state transform.
- Applies the transform consistently to positive and exposure-off macro shapes, including Moiré/thermal geometry paths routed through the shared world-coordinate conversion.
- Added a regression test for a 4 x 2 mm macro rectangle flashed with LR90 and LS2, checking the 4 x 8 mm result remains centered on the flash point.
- The viewer still does not perform full polygon Boolean compositing for partial LPC intersections. This stage does not claim full Gerber compliance.
- Build and tests were not run because dependencies are not installed in this environment.
