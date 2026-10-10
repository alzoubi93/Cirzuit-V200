# Gerber Viewer V48

- Increased the polygon sampling density used to determine whether circular and obround (oval) pads are fully covered by an LPC clear shape. This reduces the chance that a curved pad is incorrectly treated as fully erased based on a coarse contour.
- Added a regression test for a fully covered oval pad.
- This stage improves full-coverage classification only. Partial intersections with circular/oval pads and through-hole pads are still not Boolean-clipped; the existing exact rectangular clipping path remains limited to non-drilled rectangular pads with rectangular LPC regions.
- Build and automated tests were not run in this environment because project dependencies are not installed.
