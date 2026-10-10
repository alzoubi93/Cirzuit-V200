# V8.15 — KiCad label geometry and pin-text alignment

This update fixes the visual contract for imported KiCad labels and native pin text.

- Preserve KiCad label justification, vertical alignment, font size, mirror flag and UUID.
- Do not rotate horizontal KiCad labels by 180 degrees. KiCad encodes LEFT/RIGHT with justification while text remains horizontal; UP/BOTTOM are vertical.
- Render local/global label interiors transparent; keep only the outline, matching KiCad's schematic label presentation.
- Position label text from the electrical anchor using its actual justification instead of centering it in the flag.
- Pin names/numbers use the same placement rules as the native KiCad renderer.
- Remove duplicate native KiCad property/body text from the generic component-label overlay.
- Rotate native KiCad symbol geometry around the actual library origin (0,0), not the visual bbox center. This is essential for asymmetric symbols such as Conn_02x14_Odd_Even.
- Keep all imported coordinates in the shared KiCad mm -> CirZuit world-unit contract.

Reference: KiCad's SCH_LABEL_BASE/SPIN_STYLE implementation and the official schematic file-format documentation.
