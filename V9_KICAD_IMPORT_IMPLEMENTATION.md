# CirZuit V9 — KiCad Import Core

This release continues the V9 architecture instead of adding isolated renderer patches.

## Phase 1 — Native KiCad core
- Separate library symbol definitions from placed schematic instances.
- Preserve unit, mirror, rotation, anchor and pin metadata.
- Persist `kicadCore` and the project-owned KiCad symbol library.

## Phase 2 — KiCad schematic semantics
- Distinguish local/global/hierarchical labels.
- Preserve label shape, justification, mirror and font information.
- Preserve wires, explicit junctions and no-connect markers with stable UUIDs.
- Add first-class buses, bus entries, schematic text and text boxes to the normalized model.
- Preserve wire UUIDs instead of replacing them with random IDs.
- KiCad `stroke width = 0` is treated as the KiCad default stroke, not as invisible geometry.

## Phase 3 — Connectivity
- Consecutive points of the same wire are connected.
- Separate wires connect only at shared endpoints or explicit junctions.
- A bare visual crossing is not automatically a connection.
- Pins, labels, junctions and no-connects are mapped to the graph.
- Diagnostics expose orphan pins, dangling wires and unattached labels.
- A no-connect marker suppresses the corresponding orphan-pin diagnostic.

## Phase 4 — Persistence and rendering contract
- Native KiCad symbol geometry is self-contained in the project.
- Symbol instances use the KiCad library-origin anchor, not the visual bbox center.
- Asymmetric symbols such as connector headers therefore rotate around the correct electrical origin.
- Placed Reference/Value fields are rendered from the instance field coordinates rather than library defaults.
- Hidden Reference/Value fields are not rendered.
- Saved projects are migrated to the V9 core schema when older V8 data is opened.

## Validation
The modified TypeScript/TSX files were parsed with the installed TypeScript compiler API with zero syntax diagnostics.

A full Vite build could not be executed in the supplied ZIP environment because dependencies (`vite`) are not installed there.

The architecture follows the current KiCad schematic parser/model split: `LIB_SYMBOL`, `SCH_SYMBOL`, `SCH_PIN`, fields, labels, junctions, no-connects, buses and connection graph are separate concepts in KiCad's own source.
