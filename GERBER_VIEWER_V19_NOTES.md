# Gerber Viewer V19 — legacy macro compatibility

## Implemented
- Added support for deprecated Gerber Aperture Macro primitive 2 (legacy vector line), routed through the same polygon-generation path as primitive 20.
- Kept primitive 2 dimensional scaling consistent with primitive 20 and retained the macro rotation handling.
- Added a focused parser test that verifies the legacy primitive produces a four-point WebGL-zone polygon with the expected approximate extent.

## Scope and limitations
- This is an incremental compatibility improvement, not full Gerber 2026.05 compliance.
- Primitive 2 support follows the vector-line parameter layout; malformed or non-standard macros are not guaranteed to render.
- General dark/clear boolean compositing, full exposure-off macro composition, block apertures, and official Ucamco test-suite validation remain outstanding.
- Generated geometry is routed into the existing PCB zone renderer. No claim is made that every Gerber UI element has been audited to use WebGL exclusively.

## Validation
- Source and test edits were inspected, but project tests/build were not run in this environment because dependencies are not installed.
- Official format and test resources: https://www.ucamco.com/en/guest/downloads/gerber-format
