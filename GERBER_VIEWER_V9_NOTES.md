# Gerber Viewer V9 notes

## Excellon partial-coordinate records

Drill hit records that omit X or Y now retain the prior absolute coordinate for the omitted axis, rather than resetting it to zero. Added a regression test for X-only and Y-only drill hits.

## Important remaining limitations

This is an incremental improvement, not a complete RS-274X implementation. Region fills (`G36/G37`), clear polarity (`%LPC`), aperture macros (`%AM`), and complete aperture transformations are not fully represented by the current PCB geometry model. They must not be approximated as ordinary tracks/pads if exact copper geometry is required. Verify imported files against the source CAD/export and a trusted Gerber viewer before fabrication.

The automated tests were not run in the packaging environment because project dependencies (`node_modules`) were not installed.
