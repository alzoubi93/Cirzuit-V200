# V9.1 changes
- Realistic view: ESP32 DevKit / ESP32 / NodeMCU rotated 180° (USB Type-C now on top, antenna at the bottom).
- Realistic view: NPN/PNP (TO-92) redrawn: epoxy body, domed top, part number + lot code only, flat tinned bent leads.
- Simulation: new diode/LED model (series resistance, per-colour Vf) – no more 0.8 V clamp; sources get 0.02 Ω internal resistance so shorts are finite.
- New `lib/damage.ts` (LED > 30 mA or > 5 V reverse, resistor power, diode > 1 A, source > 10 A).
- New WebGL fire (`webgl/fireParticles.ts`, `SchematicWebGLFire.tsx`): flames, sparks, smoke, glow, soot. No SVG.
