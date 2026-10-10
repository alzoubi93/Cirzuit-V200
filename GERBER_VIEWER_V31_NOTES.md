# Gerber Viewer V31

## Changes
- Hardened the polygon-containment check used when representing clear-polarity (`LPC`) operations as holes in existing copper zones.
- The containment check now rejects proper crossings between the clear contour and the containing copper contour and samples inner edges at 25%, 50%, and 75%, in addition to checking vertices.
- This reduces false holes when a clearance contour crosses a concave zone boundary between vertices.
- Preserved the existing block-aperture nesting and recursion-depth safeguards.

## Limitations
- This is a conservative containment improvement, not a full polygon Boolean compositor. Partially overlapping clear/dark objects still require a proper polygon clipping engine for spec-compliant image compositing.
- Build and Vitest were not run in this environment because dependencies are not installed.
