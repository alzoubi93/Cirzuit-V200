# Gerber Viewer V18 — Moiré, polarity, and validation

## Implemented
- Added legacy Aperture Macro primitive 6 (Moiré): concentric annular rings and optional perpendicular crosshairs, including rotation and dimension scaling.
- Added ordered clear-polarity handling for contained standard aperture flashes and macro positive shapes by recording them as holes in an earlier containing copper zone. Clear regions use the same helper.
- Kept holes synchronized between `PcbZone.boundary.holes` and `filledPolygons[].holes`, which is the geometry consumed by the existing PCB zone renderer.
- Added focused tests for a Moiré macro and a clear-polarity circular flash inside an existing copper region.
- Updated capability diagnostic wording to describe partial rather than absent macro support.

## Important geometry limits
The current data model can represent a contained clear shape as a hole, but it is not a general Gerber image-compositing engine. Intersecting clears, clear flashes over pads/tracks, shapes spanning multiple zones, nested islands, and exact ordered dark/clear boolean operations still require a polygon boolean library or a dedicated image-compositing stage. Such cases must not be described as fully supported.

Moiré (primitive 6) is deprecated in the official format but is retained for legacy files. The primitive is approximated with 64-point circles and rectangular crosshair polygons.

## Validation status
- `tsc --noEmit` completed without reporting errors in this environment.
- `npm test -- --run` could not run because `vitest` is not installed (`node_modules` is absent).
- Ucamco's official Gerber test ZIP is listed on the official downloads page (revision dated 19 May 2026), but it could not be downloaded in this isolated environment. No claim of passing the official suite is made.
- WebGL routing is through the existing PCB zone geometry path; this change does not assert that every UI layer or every Gerber object in the app has been audited to use WebGL exclusively.

Official reference: https://www.ucamco.com/en/guest/downloads/gerber-format
