# Gerber Viewer V41

- Made partial LPC track sampling adaptive to the clear polygon's narrowest bounding-box dimension instead of relying only on a fixed 0.05 mm step.
- Added a regression case for a very narrow clear region positioned between the old fixed-grid sample positions.
- This remains an approximate track-stroke clipping method with binary-refined transitions; it is not a general polygon Boolean engine and does not solve partial pad/filled-zone intersections.
- Build and tests were not run in this environment because dependencies are not installed.
