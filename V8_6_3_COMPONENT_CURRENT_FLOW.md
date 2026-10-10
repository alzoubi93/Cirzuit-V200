# V8.6.3 — Component CurrentFlow → WebGL

## What changed
- `webglCurrentFlowInstances` now also includes 2-pin component body flows during
  simulation (pin0 → pin1 in world space), not only wires.
- Realistic-mode wires are included in the WebGL current-flow pass as well.
- SVG `CurrentFlow` on component bodies removed.
- SVG `CurrentFlow` on wires is skipped when the wire is drawn by either plain or
  realistic WebGL wire pass.
- Removed unused framer-motion scale wrapper around symbol bodies (`motion.g` → `g`).

## Result
During simulation, current animation runs entirely on the unified Schematic WebGL stage
for:
- All plain-mode wires
- All realistic-mode wires  
- All 2-pin component bodies (resistor, capacitor, LED, diode, …)

## Remaining SVG (minor)
- Fallback `CurrentFlow` only if a wire is somehow not on any WebGL wire pass
- Probe tooltips / ghost placement overlays
- Hit-target circles for pins (invisible)
