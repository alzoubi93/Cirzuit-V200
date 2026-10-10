# KiCad import fix: unit-0 pins, pin-label placement, label weight

1. `resolveKicadUnit` (src/lib/kicadSymbol.tsx): pins stored in the common unit `_0_0`
   (e.g. TXU0102QDCURQ1 / U2) were dropped, so U2 had no pins, no wire attachment and no labels.
   Common-unit pins are now included (no duplication when the selected unit is the common one).
2. Canvas.tsx `transformNativeLocalForNode`: label anchors were computed in local *world* units but
   passed to `transformKiCadLibraryPoint`, which expects KiCad *mm*. Result: labels shrank by 1/2.54,
   were flipped vertically and floated away from their pins. Now converted with `worldPointToKicad` first.
3. SchematicWebGLBadges.tsx: SDF threshold dilated (+0.08) and pin name/number sizes raised so text is bold and clear.

## Round 2 (J4 / TagConnect)
4. `selectKicadUnitParts` (kicadSymbol.tsx): honours KiCad sub-symbols with unit 0 AND body-style 0
   (`X_0_0` pins + `X_0_1` outline). Previously J4's pins were lost because style 0 never matched style 1.
   Default selectedUnit/BodyStyle are now always 1/1.
5. Mirrored symbols (`:mx`/`:my`) are registered pre-mirrored, but connectivity, labels and the WebGL
   renderer mirrored them again. `runtimeKiCadMirror()` returns no runtime mirror for baked symbols.
   J4: all 6 pins now coincide with their wires, 0 orphan pins.

## Round 3 (built-in symbols: ATmega328P, generated headers)
6. Canvas.tsx `webglPinLabelInstances`: the side of a built-in pin was chosen by "nearest edge" of a padded box,
   so the first/last pin rows (y=1 and y=height-1) were classified as top/bottom and their names were pushed
   half a row away. Side is now decided from the pin's real position (x=0 -> left, x=width -> right, ...).
7. Left/right names sit on their pin's row, LEAD(0.5)+FRAME_GAP(0.22) inside the body, with a single shared font
   size per symbol computed from exact SDF glyph advances so the left and right columns never overlap and never touch the frame.
8. Generated headers/sockets (`CONN_*`, not screw terminals): each name is centred directly below its pin.
9. Pin geometry of built-in symbols is untouched, so existing wires stay attached.
Hidden KiCad pin names remain hidden (faithful to `pin_names (hide yes)`).

## Round 4 (rotation + arbitrary lead length)
10. New `src/lib/symbolPinGeometry.ts`: reads each built-in symbol's drawn lead lines and body frame to get the
    real lead length, inward direction and body rectangle per pin (cached). Replaces the fixed LEAD=0.5.
    Verified on all 108 built-in symbols with named pins: 101 derive real geometry (lead lengths 0.5/0.8/1/1.2/2.01 found);
    the 7 odd shapes (opamp4, hdmi, gpio_header, fpc_connector, stm32_chip, npn_2n2222, mosfet_irf540) keep the legacy placement.
11. `pinTextOrientation` / `uprightAxisRotation`: text follows the pin's WORLD direction after node rotation.
    Horizontal pins: horizontal upright text, justification picks the side (never upside-down at 180°).
    Vertical pins (incl. any symbol rotated 90/270): text reads bottom-to-top (KiCad convention), growing into the body.
    Applied to built-in symbols, generated headers/sockets and native KiCad symbols (names and numbers).
12. Native KiCad labels use the same rotation source as the position transform (core rotation), verified
    numerically: 0 direction mismatches over 192 pin/rotation combinations on IC5.

## Round 5 (KiCad-repository symbols, body colour, uniform pin-name text)
13. Symbols placed from the KiCad symbol repository have no `metadata.kicadNative`, so their pin text went
    through the built-in path (rotation about the symbol centre) while the symbol itself is drawn natively
    (rotation about the KiCad anchor). Any `kicad:` symbol with a parsed model now uses the native pin-text
    path, so names/numbers follow the pin direction after rotation exactly like built-in symbols.
14. Body fill: canvas used white/dark-blue for `fill (type background)`; the library preview uses
    `rgba(148,163,184,0.22)`. Both now use `kicadFillCss()` / `KICAD_BODY_FILL` (kicadSymbol.tsx), and
    explicit `fill (type color)` is honoured on the canvas too.
15. Pin-name text: one base size (`PIN_NAME_FONT` = 0.32) for built-in, generated and KiCad symbols; shrinks only
    as needed to avoid overlap (floor `PIN_NAME_MIN_FONT` = 0.20; native symbols now also fit-to-body).
    SDF glyph dilation raised 0.08 -> 0.12 for heavier, sharper text (affects all badge text).
