import { describe, expect, it } from "vitest";
import { buildNetIndex } from "./netlist";
import { emptyDoc } from "./schematic";
import { parseKiCadSch } from "./importSchematicFormats";
import {
  getImportedKiCadParsedSymbol,
  parseKiCadEmbeddedSymbolLib,
  prepareKiCadSymbolForSchematic,
} from "./kicadSymbol";

const EMBEDDED_SCHEMATIC = `
(kicad_sch (version 20231120) (generator eeschema)
  (uuid 00000000-0000-0000-0000-000000000001)
  (lib_symbols
    (symbol "Device:R"
      (pin_names (offset 0.5))
      (property "Reference" "R" (at 0 2 0) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 -2 0) (effects (font (size 1.27 1.27))))
      (symbol "Device:R_0_1"
        (rectangle (start -1.27 0.5) (end 1.27 -0.5)
          (stroke (width 0.15) (type default))
          (fill (type background)))
      )
      (symbol "Device:R_1_1"
        (pin passive line (at -3.81 0 0) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 3.81 0 180) (length 2.54)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol "Device:R" (at 100 80 90) (unit 1)
    (in_bom yes) (on_board yes)
    (uuid 00000000-0000-0000-0000-000000000002)
    (property "Reference" "R1" (at 102 80 90) (effects (font (size 1.27 1.27))))
    (property "Value" "10k" (at 98 80 90) (effects (font (size 1.27 1.27))))
  )
  (wire (pts (xy 96.19 80) (xy 90 80))
    (stroke (width 0.1) (type default))
    (uuid 00000000-0000-0000-0000-000000000003))
)
`;


const MIRROR_AND_MARKERS_SCHEMATIC = `
(kicad_sch (version 20231120) (generator eeschema)
  (uuid 00000000-0000-0000-0000-000000000011)
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (at 0 2 0) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 -2 0) (effects (font (size 1.27 1.27))))
      (symbol "Device:R_0_1"
        (rectangle (start -1.27 0.5) (end 1.27 -0.5) (stroke (width 0.15) (type default)) (fill (type background)))
      )
      (symbol "Device:R_1_1"
        (pin passive line (at -3.81 0 0) (length 2.54) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 3.81 0 180) (length 2.54) (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (symbol "Device:R" (at 100 80 0) (unit 1) (mirror x)
    (uuid 00000000-0000-0000-0000-000000000012)
    (property "Reference" "R2" (at 100 82 0) (effects (font (size 1.27 1.27))))
    (property "Value" "20k" (at 100 78 0) (effects (font (size 1.27 1.27))))
  )
  (junction (at 90 80) (diameter 0) (uuid 00000000-0000-0000-0000-000000000013))
  (no_connect (at 110 80) (uuid 00000000-0000-0000-0000-000000000014))
  (wire (pts (xy 80 80) (xy 100 80)) (stroke (width 0) (type default)) (uuid 00000000-0000-0000-0000-000000000015))
  (wire (pts (xy 90 70) (xy 90 90)) (stroke (width 0) (type default)) (uuid 00000000-0000-0000-0000-000000000016))
)`;

describe("Native KiCad schematic import", () => {
  it("reads embedded lib_symbols instead of guessing R/C/U symbols", () => {
    const embedded = parseKiCadEmbeddedSymbolLib(EMBEDDED_SCHEMATIC, "embedded");
    expect(embedded).toHaveLength(1);
    expect(embedded[0].name).toBe("Device:R");
    expect(embedded[0].pins).toHaveLength(2);
  });

  it("normalizes the native symbol bbox around the KiCad placement origin", () => {
    const embedded = parseKiCadEmbeddedSymbolLib(EMBEDDED_SCHEMATIC, "embedded");
    const prepared = prepareKiCadSymbolForSchematic(embedded[0], 1);
    expect(prepared.bbox.minX).toBeCloseTo(-prepared.bbox.maxX);
    expect(prepared.bbox.minY).toBeCloseTo(-prepared.bbox.maxY);
    expect(prepared.pins[0].at.x).toBeCloseTo(-3.81);
  });

  it("creates a native kicad: node at the KiCad anchor and preserves exact wire coordinates", () => {
    const doc = parseKiCadSch(EMBEDDED_SCHEMATIC);
    expect(doc).not.toBeNull();
    expect(doc?.nodes).toHaveLength(1);
    expect(doc?.nodes[0].symbol).toMatch(/^kicad:Device:R:u1$/);
    expect(doc?.nodes[0].metadata?.kicadNative).toBe(true);
    expect(doc?.nodes[0].rotation).toBe(90);
    expect(doc?.nodes[0].reference).toBe("R1");
    expect(doc?.wires[0].points[0].x).toBeCloseTo(96.19 / 2.54);
    expect(doc?.wires[0].points[0].y).toBeCloseTo(80 / 2.54);
    expect(getImportedKiCadParsedSymbol(doc!.nodes[0].symbol)).toBeDefined();
  });
  it("preserves instance mirroring in both native pins and the registered symbol", () => {
    const doc = parseKiCadSch(MIRROR_AND_MARKERS_SCHEMATIC);
    expect(doc?.nodes).toHaveLength(1);
    expect(doc?.nodes[0].symbol).toMatch(/:mx$/);
    const parsed = getImportedKiCadParsedSymbol(doc!.nodes[0].symbol);
    expect(parsed).toBeDefined();
    expect(parsed!.pins[0].at.x).toBeCloseTo(3.81);
    expect(parsed!.pins[1].at.x).toBeCloseTo(-3.81);
    expect(doc?.junctions).toHaveLength(1);
    expect(doc?.noConnects).toHaveLength(1);
  });

  it("uses explicit junctions for crossing wires, but does not connect a plain crossing", () => {
    const crossing = emptyDoc();
    crossing.wires = [
      { id: "h", points: [{ x: 0, y: 1 }, { x: 2, y: 1 }], color: "black" },
      { id: "v", points: [{ x: 1, y: 0 }, { x: 1, y: 2 }], color: "black" },
    ];
    const without = buildNetIndex(crossing);
    expect(without.wireNet.get("h")).not.toBe(without.wireNet.get("v"));

    crossing.junctions = [{ id: "j", x: 1, y: 1 }];
    const withJunction = buildNetIndex(crossing);
    expect(withJunction.wireNet.get("h")).toBe(withJunction.wireNet.get("v"));
  });

});
