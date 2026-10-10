# CirZuit V8.7.6 — KiCad schematic import phase 2

This release continues the native KiCad schematic import work from V8.7.5.

## Implemented

- Preserve KiCad per-instance `mirror x` / `mirror y` transforms in the native symbol definition.
- Keep mirrored pin positions and pin directions synchronized with the native renderer and netlist.
- Parse and retain explicit KiCad `(junction ...)` objects, including UUID and diameter when present.
- Parse and retain explicit KiCad `(no_connect ...)` markers.
- Render imported no-connect markers in the schematic canvas.
- Render explicit junctions in the existing WebGL junction pass, while retaining derived junctions.
- Make explicit junctions electrically connect crossing/interior wire segments in netlist construction.
- Keep ordinary wire crossings disconnected unless KiCad explicitly contains a junction at the crossing.
- Add regression coverage for mirror transforms, junctions, no-connects, and crossing connectivity.

## KiCad references

The implementation follows the modern `.kicad_sch` object model documented by KiCad: embedded `lib_symbols`, placed `symbol` instances, wires, junctions, no-connect flags, labels, and global labels. See:

- https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/
- https://github.com/KiCad/kicad-source-mirror/tree/master/eeschema

## Validation

The source tree was checked with the available TypeScript compiler. A complete application build cannot be run in this isolated archive because `node_modules` is not included; the compiler therefore reports the project's pre-existing unresolved dependency/type errors in addition to the source checks.
