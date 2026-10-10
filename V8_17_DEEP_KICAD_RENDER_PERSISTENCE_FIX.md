# V8.17 — Deep KiCad Rendering / Persistence Fix

## Root causes found

1. **Missing symbol bodies**
   - KiCad `stroke (width 0)` does not mean "no stroke". It means use the schematic default line width.
   - CirZuit's native WebGL conversion treated width 0 as zero pixels, so many rectangles/polyline bodies disappeared.
   - KiCad's documented default schematic line width is 6 mil = 0.1524 mm.

2. **Floating / apparently unconnected pins**
   - The missing body made many pin leads look detached even when the electrical pin endpoint was correct.
   - Native pin geometry and the wire coordinate system are now kept on the same KiCad-origin/bbox contract.
   - The existing native symbol preparation remains symmetric around the KiCad library origin so rotation uses the true electrical anchor.

3. **Top/bottom net labels reversed**
   - KiCad label spin style is not a literal text rotation. A vertical label uses vertical text plus left/right justification.
   - CirZuit's Y-down WebGL scene requires KiCad 90° -> screen -90° and KiCad 270° -> screen +90° for readable glyphs.
   - The label banner itself was still using the raw KiCad angle, which made the top/bottom banner direction disagree with the readable text. V8.17 uses the same screen-space rotation for the banner and glyphs.

4. **Power/reference fields shown when KiCad hides them**
   - Imported instance `Reference` / `Value` properties contain their own `hide` state.
   - V8.17 preserves those states and stops the generic field pass from drawing hidden values/references such as `#PWRxxx` or hidden connector values.

5. **Saved projects losing native KiCad bodies**
   - The runtime native symbol registry was primarily persisted in browser `localStorage`.
   - The importer registers symbols in memory, but `localStorage` can fail silently when the parsed symbol cache exceeds browser quota.
   - A saved project only stored symbol IDs, so reopening could leave `kicad:...` nodes without their parsed native definitions. Re-importing worked because it rebuilt the registry.
   - V8.17 adds a project-owned `kicadSymbolLibrary` cache containing only the exact prepared KiCad symbol variants used by that schematic, hydrates it on project load, and includes it in ZUIT/XML persistence.

## KiCad references

- KiCad schematic file format: `lib_symbols` contains the symbol definitions used by a schematic, and each schematic `symbol` instance references its library identifier.
- KiCad label source defines `SPIN_STYLE` using angle + justification rather than treating 180° as an upside-down text rotation.
- KiCad `SCH_LINE::GetPenWidth()` falls back to the schematic default when stroke width is zero.

## Validation

All modified TypeScript/TSX files pass TypeScript `transpileModule` syntax diagnostics with zero errors.
