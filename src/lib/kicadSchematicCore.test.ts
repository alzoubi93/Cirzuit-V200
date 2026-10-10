import { describe, expect, it } from "vitest";
import { buildKiCadSchematicModel } from "./kicadSchematicCore";
import { emptyDoc } from "./schematic";

describe("KiCad V9 schematic core", () => {
  it("builds a stable empty semantic model", () => {
    const model = buildKiCadSchematicModel(emptyDoc());
    expect(model.schemaVersion).toBe(2);
    expect(model.sourceFormat).toBe("kicad_sch");
    expect(model.nets).toEqual([]);
  });

  it("preserves wires and labels as semantic inputs", () => {
    const doc = emptyDoc();
    doc.wires = [{ id: "w1", points: [{x: 1, y: 2}, {x: 3, y: 2}], color: "black" }];
    doc.netLabels = [{ id: "l1", text: "DATA", x: 1, y: 2, scope: "local" }];
    const model = buildKiCadSchematicModel(doc);
    expect(model.wires).toHaveLength(1);
    expect(model.labels[0].text).toBe("DATA");
    expect(model.nets[0].name).toBe("DATA");
  });

  it("keeps bare crossings separate", () => {
    const doc = emptyDoc();
    doc.wires = [
      { id: "h", points: [{x:0,y:1},{x:2,y:1}], color:"black" },
      { id: "v", points: [{x:1,y:0},{x:1,y:2}], color:"black" },
    ];
    const model = buildKiCadSchematicModel(doc);
    expect(model.nets.length).toBe(2);
  });

  it("connects crossing wires with a real junction", () => {
    const doc = emptyDoc();
    doc.wires = [
      { id: "h", points: [{x:0,y:1},{x:2,y:1}], color:"black" },
      { id: "v", points: [{x:1,y:0},{x:1,y:2}], color:"black" },
    ];
    doc.junctions = [{ id:"j", x:1, y:1 }];
    const model = buildKiCadSchematicModel(doc);
    expect(model.nets.length).toBe(1);
    expect(model.nets[0].junctionIds).toContain("j");
  });
});
