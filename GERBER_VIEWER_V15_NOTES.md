# Gerber Viewer WebGL V15 — development notes

This iteration combines several parser improvements:

- Aperture macro bodies are retained as templates and instantiated at `%ADD` time.
- Supports `$1..$n` parameters supplied by `%ADD`, ordered variable assignments, and arithmetic expressions using numeric constants, `+`, `-`, `*`, `/`, and parentheses.
- Existing WebGL zone geometry path continues to render supported macro primitives 1 (circle), 5 (regular polygon), 20 (vector line), and 21 (center-line rectangle), including contained exposure-off shapes as holes.
- Adds regression tests for macro parameter substitution/arithmetic and graceful handling of invalid expressions.

## Limitations

This is still partial Gerber support, not a claim of full Ucamco 2026.05 compliance. Unsupported macro primitives (including moiré and thermal), comments beyond simple `0...` lines, full ordered dark/clear boolean compositing, overlapping subtractive geometry, and robust diagnostics remain future work. Macro expression evaluation is deliberately limited to arithmetic operators and numeric constants/previously defined variables. The official Ucamco test files and Reference Gerber Viewer should be used for conformance checks.

Project tests/build were not run because `node_modules` is absent in the current environment.
