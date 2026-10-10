# V8.7.3 — Schematic voltage gradient on WebGL symbols

## Before
During simulation, 2-pin components with different pin voltages used a flat mid-tone
`#79c29e` in WebGL (SVG path still had a real linearGradient, but the body was drawn by WebGL).

## After
`SymbolInstance` may carry:
- `color` / `color2` — voltage colors at pin0 / pin1 (`#4ade80` high, `#94a3b8` low/gnd)
- `gradP0` / `gradP1` — local-space pin positions

`SchematicWebGLSymbols` blends per-vertex (fills) or per-segment midpoint (strokes) along
that axis with a smoothstep matching the old SVG 20%–80% stops. Only dynamic (sentinel)
glyph colors are graded; hardcoded parts of a symbol stay as authored.

## Files
- `webgl/SchematicWebGLSymbols.tsx` — gradient sampling
- `Canvas.tsx` — builds color2 + axis when sim voltages disagree on a 2-pin symbol
