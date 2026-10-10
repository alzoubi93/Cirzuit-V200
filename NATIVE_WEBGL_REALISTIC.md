# Native WebGL realistic rendering

The realistic schematic view now renders component bodies directly as WebGL geometry.
- No React SVG tree is created for realistic components.
- The old `svgWebglRasterize.ts` adapter is removed.
- Realistic wires continue to use the native WebGL wire pass.
- Component transforms (position, rotation, scale), live meter values, LED/switch glow, and component families are handled by the WebGL renderer.
- The existing SVG/normal schematic path remains available for non-realistic mode.
