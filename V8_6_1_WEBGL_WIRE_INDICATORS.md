# V8.6.1 — Wire-tool indicators → WebGL

## Added
- Hover pin indicator (green ring + fill) while the wire tool is active
- Pending wire start point (blue pulsing ring + fill)
- Both drawn by the existing `SchematicWebGLSelection` pass

## Canvas cleanup
- Removed the SVG `<g>` blocks for `hoverPin` and `pendingWire`
- Indicators driven by `webglWireIndicators` + `performance.now()` pulse

## Animation
- While a pending indicator exists, a lightweight `requestAnimationFrame` loop
  bumps an internal tick and requests stage re-renders so the pulse stays smooth
  even when the simulation clock is not advancing.

## Cumulative WebGL progress (Schematic)
- Grid, wires, realistic wires, symbols, realistic symbols
- Junctions, net labels, badges, current flow, wire glow/selection
- **Selection outlines, pin markers, wire-tool hover/pending** ← this release
