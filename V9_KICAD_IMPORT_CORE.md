# CirZuit V9 — Native KiCad Import Core

This release starts the four-stage KiCad importer architecture using KiCad's documented `.kicad_sch` model as the contract.

## Implemented

1. **Native KiCad model**
   - `src/lib/kicadSchematicCore.ts`
   - Keeps symbol instances, units, transforms, native pins, wires, labels, junctions and no-connects as a semantic model.
   - Uses the same KiCad library-origin/bbox transform contract as the native WebGL renderer.

2. **Connectivity foundation**
   - Builds a persisted net graph from wire endpoints, explicit junctions, pin anchors and label anchors.
   - Reports orphan pins, dangling wires and labels without a wire attachment.
   - Crossing wire interiors are not automatically joined unless KiCad has an endpoint/junction at the crossing.

3. **Rendering contract**
   - Native symbol definitions remain project-owned and are restored before the editor renders.
   - KiCad label kind/shape/justification/font/mirror information is preserved instead of collapsing every label to generic text.
   - This model is the stable contract for the next renderer migration; existing WebGL remains compatible during the transition.

4. **Persistence**
   - `.zuit` now preserves net labels, junctions, no-connects, native symbol library and the normalized `kicadCore` model.
   - XML projects preserve the same data, including native node metadata/unit information.
   - Older projects are migrated on open by rebuilding `kicadCore` after native symbol hydration.

## KiCad reference

The implementation follows the official KiCad schematic format and parser structure. KiCad's current parser explicitly handles `LIB_SYMBOL`, `SCH_SYMBOL`, `SCH_PIN`, `SCH_FIELD`, labels, junctions, no-connects and connection-graph data. See:

- https://dev-docs.kicad.org/en/file-formats/sexpr-schematic/
- https://gitlab.com/kicad/code/kicad/-/blob/HEAD/eeschema/sch_io/kicad_sexpr/sch_io_kicad_sexpr_parser.cpp
- https://docs.kicad.org/doxygen/classSCH__IO__KICAD__SEXPR__PARSER.html
