# CirZuit V8.7.7 — KiCad WebGL Phase 3

## Goal
Move the visual rendering of native `.kicad_sch` symbols from the SVG path into the existing WebGL schematic pipeline while preserving KiCad symbol geometry and text semantics as far as the current renderer supports them.

## Changes

- Native `kicad:*` symbol instances now participate in `SchematicWebGLSymbols` instead of being excluded from the WebGL body pass.
- The existing KiCad-native `SymbolDef.draw()` is vectorized once and then rendered as batched WebGL triangles. This keeps arcs, polylines, circles, rectangles, bezier geometry, fills, pin leads, and pin markers on the GPU.
- KiCad `Reference`, `Value`, custom visible properties, symbol text, and text boxes are emitted through the WebGL SDF text pass rather than SVG `<text>`.
- KiCad pin names and pin numbers are emitted through the same WebGL SDF text pass.
- KiCad text rotation is now carried through the WebGL text vertex shader.
- KiCad text `justify mirror` is implemented in the SDF shader by mirroring glyph UVs.
- `rgba(...)` fills used by native KiCad background fills are decoded correctly by the WebGL symbol pass.
- Native KiCad visual elements no longer need the old SVG symbol body renderer in the normal schematic view; SVG remains only for interaction/hit targets and non-WebGL fallback paths.

## Coordinate model

KiCad schematic coordinates remain millimetres. CirZuit continues to use the established `1 / 2.54` world-units-per-mm mapping. Native symbol geometry is transformed around the same normalized symbol origin used by the importer, then the schematic instance rotation/scale is applied by WebGL.

## References

The implementation follows the KiCad S-expression schematic documentation for symbol instances, properties, text effects, pin definitions, units, and coordinates:

- https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/
- https://dev-docs.kicad.org/en/file-formats/sexpr-intro/
- https://github.com/KiCad/kicad-source-mirror/tree/master/eeschema

## Validation

- TypeScript/TSX syntax transpilation was run against all modified TypeScript/TSX files using the installed TypeScript compiler.
- A complete application build was not run because the supplied project archive does not contain `node_modules` and the execution environment does not have the project's dependency tree installed.
