# V8.7.4 — Schematic Pin Label / KiCad Pin Name Fix

## Changes

- Pin names are rendered in the dedicated WebGL text pass for **all** schematic symbols, including imported KiCad symbols.
- Imported KiCad symbols no longer depend on the old SVG text path for pin names.
- KiCad native pin direction (`at.angle`) is used when available, instead of assuming the pin connection point is at `x=0` or `x=width`.
- For native KiCad symbols, the body bounds are calculated from the actual KiCad body graphics, excluding pin leads. This gives a real safe interior area for pin names.
- A fixed interior clearance prevents glyphs from touching the symbol frame.
- Long pin names are automatically reduced in size when necessary so their text remains inside the safe body area.
- Schematic pin-name fallback order is: explicit node pin name override → symbol pin name → pin number.
- Pin label positions are transformed with the symbol's rotation and scale, so the label remains directly opposite its pin after rotation.
- Generated/local symbols also use the same safe interior placement logic.

## KiCad behavior reference

The placement model follows KiCad's documented concept of placing pin names inside the symbol body with a configurable offset from the pin/body end.
