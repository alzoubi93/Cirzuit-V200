# Gerber Viewer V27 — combined parser improvements

This stage combines several related improvements to Gerber block-aperture handling:

1. **Nested AB block extraction:** replaced the non-greedy AB regular expression with a stack-based scanner that matches nested `%ABD...*%` / `%AB*%` pairs and preserves each nested block body.
2. **Safe main-stream removal:** removes complete outer block-definition ranges from the ordinary command stream, preventing nested close commands from leaking block contents into the top-level parser.
3. **Nested aperture lookup during instantiation:** includes the known block-aperture dictionary in the isolated child stream so nested block flashes can resolve D-codes defined elsewhere in the same Gerber file.
4. **Regression coverage:** added a nested-block test with an inner block flash instantiated through an outer block, checking the resulting geometry position.

## Scope and limitations

- This is not a claim of complete Gerber specification compliance. In particular, clear-polarity compositing remains approximate where the PCB document model only supports contained polygon holes; general overlapping/crossing clear geometry still needs a proper polygon boolean engine.
- Circular contours and complex mixed-polarity nested blocks may still need further conformance work.
- Tests and production build have not been run in this environment because project dependencies are not installed. The ZIP archive is integrity-checked only.
