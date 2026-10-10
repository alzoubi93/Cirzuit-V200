# V8.6.4 — LED & Heat glow → WebGL

## What changed
- Extended `SchematicWebGLSelection` with `GlowInstance` (layered soft discs).
- LED glow during simulation drawn in WebGL (color follows LED color).
- Component heat glow (from power dissipation) drawn in WebGL.
- Removed corresponding SVG blur circles / heat rects from the per-node loop.

## Why
These effects used heavy CSS `filter: blur(...)` on many SVG elements and ran every
frame during simulation. WebGL layered discs are cheaper and stay on the unified stage.

## Remaining SVG (intentionally light)
- Ghost placement overlay (temporary while placing)
- Probe tooltips
- Locate-signal pulse / damage 🔥 emoji
- Invisible pin hit-targets
- Fallback wire CurrentFlow (only if a wire is not on any WebGL pass)
