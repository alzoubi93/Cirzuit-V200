# Gerber Viewer WebGL V16

This iteration extends the aperture-macro geometry supported by the importer:

- Primitive 4 (outline): reads the declared vertex count, coordinate pairs, and rotation.
- Primitive 22 (lower-left rectangle): creates a rectangle anchored at its lower-left point, then applies macro rotation.
- Keeps the existing arithmetic expression / AD-parameter support and primitives 1, 5, 20, 21.
- Adds tests for outline and lower-left rectangle flash geometry.

Macro primitive geometry is sent through the existing PCB zone geometry path, which is intended for the WebGL zone renderer. This does **not** establish full Gerber 2026.05 compliance or prove that every Gerber visual in the app is WebGL-only.

Known limitations remain: exact boolean compositing for overlapping dark/clear macro primitives, complete polarity ordering, moire/thermal primitives (6/7), block apertures, and full official Ucamco test-suite validation. Project tests/build have not been run in this environment because dependencies are not installed.
