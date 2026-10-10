# CirZuit V10 — Official KiCad Footprints in Library Tab

## Goal
Replace internal parametric library footprints with **official KiCad geometry** from
[kicad/libraries/kicad-footprints](https://gitlab.com/kicad/libraries/kicad-footprints)
while keeping WebGL rendering and the existing “Customize in Generator” path.

## Architecture (no break of existing WebGL path)

1. **Mapping layer** — `src/lib/kicad/generator/officialFootprintMap.ts`
   - Static map of catalog item IDs → `Library:FootprintName`
   - Covers DIP, SOIC/TSSOP/MSOP, LQFP, QFN, SMD resistors/capacitors, common diodes/LEDs, TO/SOT packages
   - `guessOfficialFootprintRef()` for parametric fallbacks by family + params

2. **Library service** — `KicadFootprintLibraryService`
   - Added `registerCustom(model)` (was called but missing)
   - Added `loadByFullName("Package_DIP:DIP-8_W7.62mm")` for direct official fetch
   - Still uses same-origin `/kicad-gitlab` proxy in dev + GitLab API fallback

3. **Model resolution** — `footprintLibraryData.ts`
   - `buildModelFromLibraryItem()` still builds generator models for instant thumbnails
   - Annotates models with `officialRef` when a mapping exists
   - `resolveOfficialOrGeneratedModel()` loads real `.kicad_mod` geometry via the reader
   - On network/CORS failure → silent fallback to generator (no UI break)

4. **Library UI** — `FootprintLibrarySection.tsx`
   - Pre-indexes mapped official libraries on mount (non-blocking)
   - On preview: async load of official footprint → WebGL canvas shows real pads / F.SilkS / F.Fab / F.CrtYd / Reference / Value
   - Badge: **KiCad Official** when live geometry is used
   - Insert/Assign prefers official model if available
   - **Customize in Generator** unchanged (opens parametric generator)

## Layers preserved
Official footprints are parsed by `readKicadFootprintDefinition` and rendered by the
existing native WebGL path (`KicadFootprintWebGLCanvas` / `PcbWebGLFootprints`), which
already draws:

- F.SilkS / B.SilkS  
- F.Fab / B.Fab  
- F.CrtYd / B.CrtYd  
- Reference & Value text  
- Pads + body fill graphics  

## Stages (continue family by family)
| Stage | Status | Libraries |
|-------|--------|-----------|
| 1 | Done | Package_DIP, Package_SO, Package_QFP, Package_DFN_QFN |
| 2 | Done | Resistor_SMD, Capacitor_SMD |
| 3 | Done | Diode_SMD, LED_SMD, Package_TO_SOT_* |
| 4 | Next | Connector_*, Crystal, Switch, Battery, modules… |

To extend: add entries to `OFFICIAL_FOOTPRINT_MAP` with the exact GitLab file name
(without `.kicad_mod`). Prefer exact names from the repo tree API.

## Non-regression
- Items without a mapping still use the parametric generator (100% offline)
- Placed PCB footprints with `nativeKicadFootprint` are unchanged
- WebGL-only rendering path is preserved
