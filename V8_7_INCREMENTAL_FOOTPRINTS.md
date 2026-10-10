# V8.7 — Incremental native footprint scene updates (PCB)

## Problem
Moving or rotating one KiCad-native footprint rebuilt **world-space** GPU arrays for
**every** footprint on the board (local geom was already cached; packing was not).

## Solution
`nativeFootprintScene.ts` now exposes:

- `NativeStaticSceneCache` — persistent per-editor cache of packed ranges
- `buildNativeStaticSceneCached(input, cache)` — full rebuild **or** in-place patch

### Patch path (typical drag / rotate)
When style, footprint id order, and local geometry **sizes** are unchanged:
- Only footprints whose matrix or label buffer changed are re-transformed
- Writes into existing `bodyFill` / `padFill` / `strokes` Float32Arrays
- `contentVersion++` so GL `bufferData` still runs (same array reference)

### Full rebuild
When footprints are added/removed, style/layers change, or local geom size changes
(e.g. longer reference text).

## Integration
`PcbWebGLFootprints` keeps a `nativeSceneCacheRef` and always builds through the cached API.
Upload paths watch `contentVersion` so in-place CPU patches still reach the GPU.

## API compatibility
`buildNativeStaticScene(input)` still exists and delegates to
`buildNativeStaticSceneCached(input, null)` (always full rebuild).

## Expected impact
Board with many native footprints: interactive move/rotate should scale closer to
O(dirty) packing work instead of O(all footprints) allocation + transform.
