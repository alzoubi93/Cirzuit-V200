# Gerber Viewer V25

## Combined clear-polarity improvements
- Standard circular, rectangular, and obround aperture flashes under LPC are no longer incorrectly appended as positive copper pads.
- Clear-polarity copper strokes are approximated as swept segment polygons and subtracted from prior zones when fully contained.
- Added regression tests ensuring clear flashes and clear strokes are not emitted as positive copper geometry.
- Preserves the existing contained-region hole model consumed by the WebGL zone renderer.

## Important limits
- This does not implement general polygon Boolean clipping. Clear objects crossing dark-zone boundaries are deliberately not clipped and are not subtracted by the contained-hole path.
- LPC operations over already-rendered tracks and pads outside zone geometry are not fully composited. A robust implementation needs ordered image compositing or a polygon-boolean engine.
- Obround stroke geometry is an approximation; verify with Ucamco's official Gerber test set before relying on fabrication output.
- Tests/build were not run here because project dependencies are unavailable. Only archive integrity and source-level checks can be performed in this environment.
