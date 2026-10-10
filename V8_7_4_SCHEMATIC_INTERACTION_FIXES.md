# V8.7.4 — Schematic interaction fixes

- Symbol dragging now gives the symbol body priority over pin picking in Select/Pan mode, allowing a connected symbol to be moved while attached wire endpoints follow/stretch with it.
- Empty-canvas clicks explicitly clear schematic node/wire/pin selection.
- Marquee selection redraws are throttled to one animation frame instead of forcing a React render on every pointermove.
- Large selections (>80 symbols) use compact solid WebGL selection outlines instead of vertex-heavy dashed outlines to prevent UI freezes.
- Pin-name labels are vertically centered on their corresponding pin and offset inward from the symbol body border.
