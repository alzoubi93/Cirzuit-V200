# V8.6.5 — Ghost placement → WebGL (final cleanup pass)

## What changed
- Placement ghost (single symbol + multi paste) drawn on the WebGL stage:
  - Symbols via `SchematicWebGLSymbols` with `alpha: 0.5–0.55`
  - Wires via `SchematicWebGLWires` with `alpha: 0.5`
  - Dashed outline via `SchematicWebGLSelection` rects
- Removed the large SVG `ghostOverlay` IIFE and its JSX mount.
- `SymbolInstance` and `WireInstance` gained optional `alpha` for translucent ghosts.

## Canvas SVG surface area
Intentionally remaining (lightweight / interactive UI only):
- Probe tooltips
- Locate-signal pulse animation
- Damage 🔥 emoji
- Invisible pin hit-target circles
- Alignment guides while dragging
- Wire preview while routing
- Fallback CurrentFlow if a wire is not on any WebGL pass

## Cumulative Schematic WebGL coverage
Grid, wires (plain + realistic), symbols (plain + realistic), junctions, net labels,
badges, selection, pins, wire-tool indicators, capacitor breathing, current flow,
LED/heat glow, **ghost placement**.
