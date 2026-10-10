# V8.7.4 — Wire preview + alignment guides → WebGL

## New
`webgl/SchematicWebGLGuides.tsx`
- **Wire preview** while routing: dashed stroke, solid or curved (sampled quadratic corners)
- **Alignment guides** while dragging a component: full-span dashed H/V lines, connector
  segment, endpoint dots (`#f59e0b`)

Pass order: `SCHEMATIC_GL_PASS_ORDER.selection + 5` (above selection, below badges).

## Canvas
- Computes `webglAlignmentMatches` via `useMemo` (same match logic as the old SVG overlay)
- Mounts `<SchematicWebGLGuides … />` inside `SchematicGLStage`
- Removes SVG `wirePreview` path/polyline and `alignmentOverlay`

## Still on SVG (intentional)
- Drag center crosshair (`dragOverlay`) — thin blue axes at component center
- Distance labels on alignment matches (numeric text) — not ported; dots + lines carry the cue
