# V8.6.2 — Capacitor breathing → WebGL

## What changed
- Capacitors are no longer excluded from the WebGL symbols pass during simulation.
- `SymbolInstance` gained an optional `breathing` flag.
- When `breathing` is set, `SchematicWebGLSymbols` pulses scale 1.0 ↔ 1.08 (~1.5s period)
  using `performance.now()` and a lightweight RAF loop (same pattern as wire pending indicator).
- SVG `framer-motion` scale animation for capacitors was disabled (body is WebGL now).

## Text nodes
- Free-standing text annotations were already drawn via `SchematicWebGLBadges`
  (`webglComponentLabelInstances`). No SVG body remains for `symbol === "text"`.

## Notes
- Two-pin voltage *gradient* fill during simulation is still approximated as a flat mid-tone
  in WebGL (true dual-color gradient would need a second color attribute or texture).
- Per-component CurrentFlow arrows on 2-pin symbols during sim remain SVG for now.
