import { describe, expect, it } from "vitest";
import { buildKiCadSchematicModel } from "./kicadSchematicCore";
import { validateKiCadImport } from "./kicadImportValidation";
import { emptyDoc } from "./schematic";

describe("KiCad import validation", () => {
  it("accepts an empty normalized schematic", () => {
    const report = validateKiCadImport(buildKiCadSchematicModel(emptyDoc()));
    expect(report.ok).toBe(true);
    expect(report.symbolCount).toBe(0);
    expect(report.netCount).toBe(0);
  });

  it("reports an unattached label", () => {
    const doc = emptyDoc();
    doc.netLabels = [{ id: "l", text: "GND", x: 10, y: 10, scope: "local" }];
    const report = validateKiCadImport(buildKiCadSchematicModel(doc));
    expect(report.labelsWithoutWire).toContain("l");
  });
});
