# KiCad PCB import fidelity work — CirZuit

## Test board inspected

- File: `dut_hub.kicad_pcb`
- KiCad file format: `version 20241229`
- Generator: `pcbnew`
- Generator version: `9.0`
- File size: ~4.2 MiB
- Footprints: 158
- Footprint graphics: 979 `fp_line`, 193 `fp_rect`, 54 `fp_circle`, plus arcs/polygons/curves and user-layer graphics
- Pads: 886
- Segments: 1,918
- Vias: 523
- Zones: 32 top-level zones
- Board text: 54 `gr_text`
- Groups: 8
- No board images, dimensions, targets, or text boxes were present in this test file.

## Main changes

1. Imported KiCad footprints are now normalized through the same native KiCad footprint reader used by CirZuit's KiCad footprint environment.
2. Native footprint geometry is retained instead of flattening imported footprints into the legacy PCB graphics representation.
3. Reference and Value properties, their layers, font size, thickness, bold/italic state, justification, mirror state, and hidden properties are preserved.
4. Native F.Fab / F.CrtYd / F.SilkS / B.* geometry, pads, custom pad primitives, and footprint text are sent through the existing unified WebGL renderer.
5. Hidden KiCad text fields remain in the model but are filtered before GPU geometry generation.
6. KiCad user/auxiliary footprint layers that occur in a board but are absent from the declared board layer list are preserved and rendered instead of being silently discarded.
7. KiCad PCB v9 arbitrary `gr_text` rotation is preserved; text thickness/bold/italic/mirror/justification are imported.
8. Imported-board layer colors were aligned with the KiCad 9 built-in PCB color theme values used by the source project, including copper, silkscreen, mask, paste, courtyard, fabrication, Edge.Cuts, and user layers.
9. Imported KiCad boards use a black PCB background and dark-gray grid, closer to KiCad's PCB canvas presentation.
10. A regression test was added for KiCad v9 native footprint properties/graphics and arbitrary board-text effects.

## Rendering architecture

CirZuit already has the important performance foundation: the PCB editor uses one unified WebGL canvas/stage rather than a separate WebGL context for every PCB layer. The stage also contains context-loss/context-restore handling. The changes above feed native KiCad geometry into that single stage rather than introducing additional canvases.

## Validation

- TypeScript transpilation/syntax validation passed for all modified TypeScript/TSX files.
- Full dependency-based build/test could not be executed in this environment because the project's npm dependency installation did not finish within the available execution window.
- The inspected board itself is a KiCad 9-format board and was used to identify the importer coverage gaps above.

## Important scope note

This work targets faithful 2D import/rendering of `.kicad_pcb` files. It does not claim that CirZuit has become a byte-for-byte replacement for KiCad's full PCB renderer. Features such as advanced DRC visualization, 3D rendering, interactive editing semantics, and every future KiCad file-format extension remain separate concerns.

## Follow-up fix — footprint placement rotation direction (this pass)

### Symptom
Footprints placed at 90°/270° in the source `.kicad_pcb` rendered with their pads/silkscreen/fab shifted away from their real board location by a multiple of the footprint's own size; footprints at 0°/180° were unaffected. Clicking the footprint's real (correct) location and clicking its wrongly-rendered outline both reported the same Properties-panel X/Y — expected, since that panel reads the footprint's own placement anchor (`fp.x`/`fp.y`), which was never wrong; only the rotation of everything else around that anchor was.

### Root cause
`src/lib/importKiCadPcb.ts` copied a footprint's raw KiCad `(at x y angle)` value straight into `fp.rotation`. KiCad's file-format angle is clockwise-positive; CirZuit's own footprint affine matrix (`createFootprintAffineMatrix` in `pcbFootprintSceneGraph.ts`) and every consumer of `fp.rotation` (rendering, hit-testing in `pcbSpatialIndex.ts`, Gerber/PDF/image export, DRC, ratsnest) rotate counter-clockwise-positive. The two conventions are the same rotation with an opposite sign, so at 0°/180° (self-mirroring angles) the bug was invisible; at 90°/270° everything after this footprint's anchor point rotated the wrong way.

A second, smaller issue in the same code path: KiCad's board file bakes the footprint's own placement angle into each **pad's** `(at x y angle)` as an absolute angle (placement + the pad's own local angle), while graphic primitives (`fp_line`/`fp_rect`/...) stay footprint-local. `readKicadFootprintDefinition` (the native KiCad footprint reader, also used by the footprint browser/generator) expects footprint-local pad angles, so this absolute value was rotating non-square pad shapes (rectangular/roundrect pads) an extra `frot` degrees at 90°/270° placements.

A third issue found while tracing this: the importer pushed every footprint's own silkscreen/fab/courtyard graphics into the shared board-level `graphics`/`tracks` arrays *in addition to* building the native KiCad footprint model, and both were rendered — every native-modeled footprint's outline was drawn twice, once correctly (native path) and once via the (also sign-affected) flat path.

### Fix
- Added `kicadDegToAppDeg`/`kicadLocalToBoard` helpers that apply the sign flip in exactly one place, and routed every footprint-local→board-space transform in the importer (pad position, custom-pad primitives, footprint text, silkscreen/fab/courtyard graphics, and the final `fp.rotation`) through them.
- The native-footprint normalization (`readKicadFootprintDefinition`) now runs *before* the per-child loop instead of after, on a cloned node with each pad's `at` angle corrected from absolute to footprint-local (`padAbsAngle - frot`) first.
- The flat `tracks`/`graphics` pushes for a footprint's own `fp_line`/`fp_rect`/`fp_circle`/`fp_poly`/`fp_arc` (and custom-pad copper primitives) now only run when native-footprint normalization *failed* for that footprint (`!hasNativeModel`) — removing the duplicate-draw path. Board bounding-box tracking (`registerPoint`) still runs unconditionally so overall board framing/margins are unaffected.

### Validation
- Confirmed against `dut_hub.kicad_pcb` (158 footprints, 64 at 90°/270°): matching each pad's board-space position (via the same affine transform the renderer uses) against nearby track/via endpoints on the same net went from 1/235 and 1/188 matches (90°/270°) to 155/188 and 176/235 (~75–82%, in line with the ~75–80% baseline already seen at 0°/180°, which was never broken).
- Confirmed a previously-contaminated pad on a rotated SOP footprint (`IC6`) now reads its native local pad rotation as `0` instead of the absolute `90`.
- `npx tsc --noEmit` on `src/lib/importKiCadPcb.ts` reports no new errors.
- Not yet validated: a full visual re-render inside the running app (only the importer's output data was checked headlessly), and pad-shape orientation for KiCad's text-angle "keep upright" normalization, which was intentionally left untouched (see below).

### Known remaining gap
`property`/`fp_text` (Reference/Value/user-text) `at` angles were *not* corrected the same way as pad angles. Empirically these don't follow the same simple `absolute = placement + local` rule pads do — KiCad applies its own "keep upright" normalization to text angles — so a naive `angle - frot` correction risked making text orientation wrong in new cases rather than fixing it. Text position (not angle) is already correct via `kicadLocalToBoard`. If mis-rotated Reference/Value text is spotted on 90°/270° footprints after this fix, that normalization is the next thing to model.

## Follow-up fix #2 — mixed reference/value text orientation on rotated footprints

### Symptom
After the placement-rotation fix above, most footprints render correctly, but some reference/value silkscreen text (e.g. `C34`, `C12`, `C14`, a crystal's value) still renders upside-down/mirrored on 90°/270°-placed footprints, while other text on the same kind of footprint (e.g. `C35`) renders correctly.

### Root cause
KiCad's board file bakes the footprint's placement angle into `property`/`fp_text` `at` angles too (like pads — see fix #1), but on top of that, KiCad's own "keep text upright" behavior means the stored angle is *not* simply `placement + local`: for the common case (no per-field manual rotation) it's that sum reduced to whichever of {θ, θ+180} keeps the text within a readable range, and for text a person has individually rotated in KiCad it can be a different, unwrapped value. The previous fix only stripped the placement angle from `pad` `at` angles, leaving `property`/`fp_text` (Reference, Value, user text) using the raw file angle unmodified — correct by coincidence whenever that wrap happened to be a no-op, wrong otherwise (matching "some show correctly, some don't").

### Fix
Extended the same node-mutation step from fix #1 (which already runs once, before native-footprint normalization) to also cover `property`, `fp_text`, and `fp_text_box` nodes, using `local = frot − storedAngle (mod 360)`. This is an exact algebraic inverse of the scene graph's own composition (`total = frot − local`, given this renderer's rotation direction relative to KiCad's — see fix #1's comment for the derivation), so it reproduces the file's stored angle exactly on render regardless of *why* that angle has the value it does — no need to separately model KiCad's upright-wrap logic.

### Validation
Checked all 316 Reference/Value text angles in `dut_hub.kicad_pcb`, including the 12 that have an individually-customized (non-default) local rotation (e.g. `IC7`'s Reference, stored file angle 180° at a 90°-placed footprint): recomputing `frot − local` for every one exactly reproduces the file's stored angle, confirming the round-trip holds for both the common (upright-wrapped) case and the individually-rotated case.

## Investigated, not changed — "Inner Copper 1/2" dimming silkscreen text

A person reported that showing the Inner Copper 1/2 layers seems to dim silkscreen reference text. Traced every `dimAlpha`/`dimInactiveLayers` code path that touches footprint or board silkscreen (`KicadFootprintRenderShared.ts`, `PcbWebGLSilkscreen.tsx`, `PcbWebGLFootprints.tsx`, `PcbCanvasLayer.tsx`): none of them key dimming off an inner-copper layer specifically — the only per-side dimming check compares `activeLayer` against the literal strings `"top_copper"`/`"bottom_copper"`, which an inner-copper layer id (`"In1.Cu"`, `"In2.Cu"`) never matches, and native footprints (all of them, on this board) skip every *other* dimAlpha path entirely (they're gated behind `!sourceFp?.nativeKicadFootprint`).

What *is* real, and fixed here: the layers panel row's `onClick` sets that row's layer as the "active" layer for the whole row (`setActiveLayer(l.id)`), and only the small eye icon inside it (`stopPropagation`) is meant to toggle visibility instead. On a touch screen a tap aimed at the icon can miss and land on the row, silently making that layer "active" as a side effect of what looked like just a visibility toggle — and if "Focus Active Layer & Dim Rest" (`dimInactiveLayers`) happens to be on, *other* layers then dim by design. Widened the eye button's hit target (`p-2 -m-2`, matching hit area without shifting layout) in `PcbEditor.tsx` to make that mis-tap less likely.

If dimming persists with "Focus Active Layer & Dim Rest" confirmed off, the more likely explanation is visual contrast, not a transparency bug: Inner Copper 1/2 default to bright, saturated colors (`#f59e0b` amber / `#06b6d4` cyan) that can visually compete with silkscreen text sitting over a large filled zone on those layers, without the text's own alpha changing at all.

## Follow-up fix #3 — duplicate/garbled silkscreen text, and wrong-element selection

### Symptom 1: reference text doubled ("R24" inside the body, truncated, and outside, complete)
### Symptom 2: some text still looks scrambled/mirrored with overlapping strokes (e.g. `Y1`'s "Crystal" text)

### Root cause
Both turned out to be the same underlying issue, not a rotation bug: KiCad footprints commonly carry extra text fields beyond the visible Reference/Value the importer already draws —
- a `(fp_text user "${REFERENCE}" ...)` (or legacy `%R`/`%V`) field: a literal, unsubstituted placeholder that KiCad's own editor substitutes with the real reference/value at display time. This importer doesn't substitute it, so it rendered as a second, redundant label — small, usually centered under the part's own body/pads (hence "truncated-looking"). Present on **150 of 158** footprints in `dut_hub.kicad_pcb`.
- the `ki_fp_filters` property (a footprint-library search-filter pattern like `"Crystal*"`, `"R_*"` — internal KiCad metadata, never meant to be shown) has no `layer`/`at`/`hide` of its own in the file, so it was being read as ordinary text and defaulting to visible, at the footprint's local origin, rotation 0.

On `Y1` (crystal, placed at 180°) these combined: the `${REFERENCE}` placeholder (correctly rotated to 180° by fix #2, so upside-down-if-literal) and `"Crystal*"` (rotation 0, never corrected since it's not really a display field) both sat at the same local point, overlapping the real Value text ("Crystal_Small") at two different angles — several overlapping strings, not one mis-rotated one. That reads as "mirrored with a star" when strokes cross like that, even though no single piece of text was actually mirrored.

### Fix
- `kicadFootprintReader.ts` (shared by board import, the footprint browser, and the generator): `ki_fp_filters` (and `ki_locked`, same family of internal KiCad metadata) is no longer turned into a graphic at all — never rendered, in any context.
- `importKiCadPcb.ts`: after native-footprint normalization, drop any `role: "user"` text item whose content is exactly `${REFERENCE}`, `${VALUE}`, `${REF}`, `%R`, or `%V` (case-insensitive). Scoped to board import only, since this is about not re-showing a redundant copy of a reference the importer already places — the browser/generator's library-preview context is untouched.
- Genuinely hidden fields (`hide: yes` in the file — e.g. `Datasheet`, `Description` on these same footprints) were already being parsed with `visible: false` and were already excluded at render time; that path needed no change.

### Symptom 3: clicking selects a different element than the one clicked
### Root cause
`PcbSpatialIndex.hitTest`'s footprint branch scored *any* click inside a footprint's bounding box as an equally-good "direct hit" (`d = 0`). On a dense board, bounding boxes of nearby footprints routinely overlap — a large connector's courtyard box, for instance, can easily cover a smaller neighboring passive — so when a click landed inside more than one footprint's box, the winner was whichever the R-tree query happened to return first, not necessarily the one actually under the cursor. (Fix #1's placement correction likely made this more noticeable, not less: footprints that used to render in the wrong spot — sometimes off in empty space — now sit correctly adjacent to their real neighbors, which is exactly where overlapping bounding boxes become common.)

### Fix
`pcbSpatialIndex.ts`: a direct hit inside a footprint's bounding box is now scored as the box's own area times `1e-7` instead of a flat `0` — far too small to ever beat a real distance-based candidate or shift the type-priority ordering, but enough to deterministically break footprint-vs-footprint ties toward the smaller (more specific) one, instead of array/R-tree traversal order.

### Validation
- Re-ran the full board through the importer: 0 placeholder-pattern text items and 0 `ki_fp_filters`-pattern text items remain anywhere (previously 150 and 158 respectively); 298 genuinely-visible text items remain, matching Reference + Value (+ any real custom user text) per footprint.
- Re-confirmed the fix #1 pad/track net-match rates are unchanged (these are text/hit-test-only changes, not position changes).
- `npx tsc --noEmit` reports the same 4 pre-existing, unrelated errors as the unmodified project (verified identical against the original zip) and no new ones across all four touched files.
- Not yet validated: an actual click-test in the running app (no browser available here) — the hit-test change is validated by reading the scoring logic, not by reproducing a click.

## Follow-up fix #4 — multi-layer zone color/visibility, plus three questions answered

### Question: does F.Cu/B.Cu really fill the whole board, and why does the fill's color change per layer?
Confirmed with real data: `dut_hub.kicad_pcb` has a single GND-net copper pour zone assigned to **three layers at once** (F.Cu + B.Cu + In1.Cu), covering nearly the full board outline. KiCad computes a separate fill shape per layer for a zone like this (different routing/clearances per layer — 45 fill islands on F.Cu, 9 on B.Cu, 5 on In1.Cu here), and each is tagged with its own `(layer ...)` in `filled_polygon`. This is genuine, intentional board data (a shared ground plane), not an import artifact.

### Root cause of the color/visibility bug
`PcbWebGLZones.tsx` treated a multi-layer zone as one shape: colored using only its *first* assigned layer (`getCopperLayerStandardColor(z.layer)`, where `z.layer` is simply `zoneLayers[0]`), and visible as long as *any* one of its layers was shown (`isZoneVisible`'s OR-across-`zone.layers` check). So the GND pour always rendered in `top_copper`'s red (`#ef4444`) — even while looking at B.Cu alone — and toggling any single one of its three layers off never fully hid it. (`isZoneOnLayer` in `zoneGeometry.ts`, apparently written for exactly this per-layer check, was imported but never actually called.)

### Fix
`PcbWebGLZones.tsx`: added an `expandedZones` step that splits any zone whose `filledPolygons` span more than one distinct layer into one synthetic entry per layer (unique id, that layer's own `filledPolygons` subset, `layers` cleared so `isZoneVisible` checks only that one layer). Both the worker-triangulation request and the vertex/color pass now iterate this expanded list instead of the raw zones, so color, "active layer" dimming, and visibility are each evaluated against the specific layer that geometry belongs to. Selection (`selection.id === z.id`) now also matches a split entry's `originalId`, so clicking/highlighting the original zone still works. Zones with a single assigned layer (30 of 32 here) pass through unchanged.

### Validation
Re-ran the expansion logic (mirrored 1:1 from the component) against the imported board: 32 zones → 34 render entries; the GND zone correctly splits into three (`top_copper`: 45 polys, `bottom_copper`: 9 polys, `In1.Cu`: 5 polys), each independently gated by its own layer's visibility from here on. Could not visually re-render (no browser/GPU in this environment) — validated the data transformation only.

### Question: general slowness despite WebGL
Found one concrete contributor in this same file: the vertex buffer for **all** zones was fully rebuilt (every zone re-triangulated if not cached, every vertex's color recomputed) on *every* selection change, net highlight, active-layer change, or layer-visibility toggle — not just the one zone actually affected. That's now somewhat larger in vertex count after the multi-layer split (34 vs. 32 draw entries), so I want to flag rather than understate it. I did not attempt a broader performance pass — separating rarely-changing geometry from frequently-changing color/selection state into their own buffers would be the natural next step, but that's a larger, riskier change I'd want to do deliberately (and ideally measure, which needs a browser) rather than guess at in one pass. Happy to take this on as a focused follow-up if useful.

### Question: F.Fab Value text — any remaining duplication, and the "close/touching" text
Re-checked the whole board after fix #3: **zero** footprints have more than one visible Reference or Value text item — the duplication is fully gone. 142 footprints do have their Value field on F.Fab by design (a common modern KiCad library convention for small parts — F.Fab is assembly documentation, not printed silkscreen). Separately, 15 footprints — including `C34`, the one originally reported — have their Reference and Value text anchored **very** close together in the footprint library data itself (e.g. `C34`: 0.07 mm apart, `R15`: 0.01 mm), before any transform. That's tight-but-intentional placement from the original KiCad footprint for small passives, not a duplicate or a bug; moving it would mean deviating from the source design rather than fixing an import defect.
