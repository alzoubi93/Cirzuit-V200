# V8.12 — KiCad schematic import/render fix

This update targets the actual `dut.kicad_sch` fixture.

## Fixes
- Native KiCad WebGL symbol rendering no longer depends exclusively on the mutable `SYMBOLS` compatibility catalog.
- Fresh imports and HMR can render parsed KiCad symbols directly from `KiCadParsedSymbol`.
- Native pin fallback geometry is derived from the parsed KiCad pins.
- Fixed the native pin dynamic-color sentinel so it is an actual sentinel string rather than a literal `\\u0000` sequence.
- Kept the KiCad origin/rotation contract unchanged: the schematic `(at x y angle)` remains the instance anchor and geometry is transformed around that anchor.
- Added the supplied `dut.kicad_sch` as a regression fixture for future importer work.

The supplied schematic is a KiCad 9 schematic (`version 20250114`, `generator_version 9.0`) and contains embedded `lib_symbols`; the importer must therefore render those definitions rather than infer generic R/C/U symbols.
