# V8.7.5 — Native KiCad Schematic Import Foundation

## Goal

Make `.kicad_sch` import consume the embedded KiCad symbol definitions instead of guessing a CirZuit catalog symbol from the reference/value.

## Changes

- Parse the embedded `lib_symbols` section from modern `.kicad_sch` files.
- Resolve KiCad symbol inheritance and electrical units through the existing native KiCad symbol environment.
- Register imported symbols as stable `kicad:<LIB_ID>:u<UNIT>` runtime symbols.
- Preserve the schematic instance's reference, value, footprint, unit, UUID and native placement metadata.
- Normalize the native symbol display bounding box around KiCad's symbol origin so the existing scene graph's centre-based rotation matches KiCad's origin-based placement.
- Preserve exact KiCad schematic coordinates instead of rounding imported wires to half-world-unit increments.
- Preserve wire stroke width and distinguish bus wires from ordinary wires.
- Import local/global schematic labels into the existing net-label model.
- Keep the native KiCad SVG renderer as the authoritative renderer for imported symbols; they are excluded from the legacy WebGL symbol vectorizer to avoid losing native arcs, text, fills and pin typography.
- Add regression tests for embedded symbol parsing, origin-centred placement and exact wire coordinates.

## KiCad reference

The implementation follows the documented KiCad 6+ schematic model: a `.kicad_sch` contains a `lib_symbols` section and schematic `symbol` instances reference those definitions by `lib_id`; coordinates are stored in millimetres. See:

- https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/
- https://dev-docs.kicad.org/en/file-formats/sexpr-symbol-lib/
- https://github.com/KiCad/kicad-source-mirror/tree/master/eeschema

## Current scope / next phase

This is the foundation rather than the final renderer parity pass. The next native-import phases should cover explicit junction/no-connect semantics, symbol mirroring, complete label shapes/effects, hierarchical sheets, graphical schematic objects, and exact KiCad text/font rendering.
