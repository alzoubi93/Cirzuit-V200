# Gerber Viewer V32

## Change
- Improved conservative `LPC` whole-track erasure checks for concave clear regions.
- Track removal now samples the line segments between stored vertices, including the track-width perimeter at each sample. This prevents a track from being deleted just because its endpoints are inside a concave clear region when the segment between them passes through an area outside that region.
- Added a regression test using a U-shaped clear region and a track crossing its open notch.

## Limitations
- This is still a conservative whole-object erasure test, not general polygon Boolean compositing. Partially intersecting tracks are not split into retained segments, and arbitrary clear/dark intersections still need a robust polygon Boolean implementation.
- Build and Vitest were not run in this environment because project dependencies are not installed.
