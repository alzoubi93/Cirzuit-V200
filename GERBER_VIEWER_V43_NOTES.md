# Gerber Viewer V43

## Included
- Cached the clear-polygon bounding box and narrow dimension once per LPC operation instead of rebuilding coordinate arrays for every track.
- Added bounding-box rejection before constructing pad outlines and before running expensive zone-containment checks.
- Kept the existing adaptive partial-track split and conservative full-stroke checks unchanged.

## Known limitation
This is a performance and robustness step, not a full polygon Boolean implementation. Partial intersections of LPC clearances with pads and filled copper zones are still not geometrically clipped in all cases. A full solution needs robust polygon difference with holes and multiple output components.

## Validation
The ZIP archive was checked for integrity. Automated tests and production build were not run in this environment because project dependencies are not installed.
