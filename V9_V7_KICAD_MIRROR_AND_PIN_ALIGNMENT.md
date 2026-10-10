# V9 V7 — KiCad mirror and pin alignment fix

KiCad source uses `SYM_MIRROR_Y` for horizontal mirroring (flip X) and `SYM_MIRROR_X` for vertical mirroring (flip Y).

This release corrects that convention consistently in:
- kicadSymbol.tsx
- kicadCoordinateSystem.ts
- kicadSchematicCore.ts
- SchematicWebGLSymbols.tsx
- Canvas.tsx pin label placement

This is especially important for `(mirror y)` connector instances such as J4 in `dut.kicad_sch`: their right-side library pins must appear on the left side of the body and meet the existing wire endpoints.
