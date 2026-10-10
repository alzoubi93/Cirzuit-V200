# PCB Footprint WebGL Rendering

The PCB editor now uses a unified WebGL footprint path.

## Rendering contract

- No SVG footprint renderer is used by `PcbEditor`.
- Native KiCad footprints are read through the canonical KiCad geometry runtime.
- Internal/CirZuit footprints are synchronized through `FootprintSceneGraph`.
- `F.Silkscreen`, `F.Fab`, `F.Courtyard`, `Reference`, `Value`, and filled technical geometry are rasterized on WebGL.
- Reference/Value text uses the same Hershey vector stroke engine used by the PCB text WebGL pass.
- KiCad courtyard dashes are generated as WebGL line segments instead of SVG dash arrays.
- Footprint pads remain in the existing WebGL pad pass, avoiding duplicate copper geometry.
- The board PCB footprint path uses a single WebGL context/canvas for these footprint layers; it does not create one WebGL context per footprint.

## Geometry fidelity

The renderer consumes the KiCad semantic geometry (`line`, `rect`, `roundrect`, `chamferrect`, `circle`, `arc`, `polygon`, `bezier`, `capsule`, and `text`) instead of rebuilding footprints from package-name heuristics. The footprint transform is synchronized with the same scene-graph transform used by pads.

## SVG removal

`KicadFootprintGeometry.ts` contains only geometry extraction, layer colors, and bounds. The former SVG rendering component was removed. `PcbEditor` no longer mounts `KicadFootprintRenderer` or an SVG footprint tree.
