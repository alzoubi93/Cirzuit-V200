# Gerber Viewer V10 — WebGL-first development checkpoint

Reference: Ucamco Gerber Layer Format Specification Revision 2026.05 and its official test files (published 19 May 2026).

## This checkpoint
- Adds `src/lib/gerberDiagnostics.ts`, a conservative diagnostic helper for unsupported Gerber constructs. It explicitly warns about region fills (`G36/G37`), clear polarity (`%LPC`), aperture macros (`%AM`) and block apertures (`%AB`) instead of silently implying that these are faithfully rendered.
- Adds tests for region/clear-polarity and aperture-macro diagnostics.
- Preserves previous importer fixes for coordinate formats, arc interpolation, basic step-repeat, oval flashes, drill coordinates and not inventing pad pin numbers.
- Existing PCB WebGL render passes remain the intended rendering path for imported tracks, pads, vias and related geometry. This checkpoint does **not** claim full Gerber compliance or full rendering of all Gerber primitives.

## Important limitations
- The diagnostic helper is not a replacement for actual geometry support. Region fills, subtractive polarity, aperture macros and block apertures still require a geometry model that preserves operation order and dark/clear compositing, then a WebGL implementation that renders those operations correctly.
- Gerber has image semantics: simply drawing LPC objects in a different color is incorrect. Clear operations must subtract from prior image content within the image/polarity rules.
- Arc interpolation is currently approximated with line segments.
- Full WebGL-only verification must include tracing the complete imported-layer display path and checking that no SVG/Canvas 2D layer renderer is used for Gerber geometry.

## Validation
Tests were added but not executed in this environment because dependencies are not installed. Do not treat this ZIP as a verified production build.
