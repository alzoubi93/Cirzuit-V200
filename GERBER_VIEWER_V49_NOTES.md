# Gerber Viewer V49

- Added a regression test for sequential LPC rectangular clearances where the second clearance acts on copper fragments created by the first clearance.
- The test checks that fragment identifiers remain unique and that no retained rectangular copper fragment overlaps either clear region.
- This stage hardens the existing sequential-clearance behavior; it does not add general Boolean clipping for partially intersected circular/oval pads or drilled pads.
- Build and automated tests were not run in this environment because project dependencies are not installed.
