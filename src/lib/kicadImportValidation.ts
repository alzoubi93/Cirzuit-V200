import type { KiCadSchematicModel } from "./kicadSchematicCore";

export interface KiCadImportValidationReport {
  ok: boolean;
  symbolCount: number;
  pinCount: number;
  wireCount: number;
  labelCount: number;
  junctionCount: number;
  noConnectCount: number;
  netCount: number;
  orphanPins: string[];
  danglingWires: string[];
  labelsWithoutWire: string[];
  issues: string[];
}

/** Lightweight post-import gate. It never mutates the schematic model. */
export function validateKiCadImport(model: KiCadSchematicModel): KiCadImportValidationReport {
  const pinCount = model.symbols.reduce((n, s) => n + s.pins.length, 0);
  const issues: string[] = [];

  if (model.schemaVersion !== 2) issues.push(`Unsupported KiCad core schemaVersion=${model.schemaVersion}`);
  if (model.sourceFormat !== "kicad_sch") issues.push("Core sourceFormat is not kicad_sch");
  if (model.symbols.some(s => !s.libId)) issues.push("One or more native symbols have no libId");
  if (model.symbols.some(s => ![0, 90, 180, 270].includes(s.rotation))) issues.push("A native symbol has an invalid rotation");

  const seenPins = new Set<string>();
  for (const s of model.symbols) for (const p of s.pins) {
    const id = `${p.nodeId}:${p.number}`;
    if (seenPins.has(id)) issues.push(`Duplicate pin reference ${id}`);
    seenPins.add(id);
  }

  const report: KiCadImportValidationReport = {
    ok: issues.length === 0 && model.diagnostics.orphanPins.length === 0,
    symbolCount: model.symbols.length,
    pinCount,
    wireCount: model.wires.length,
    labelCount: model.labels.length,
    junctionCount: model.junctions.length,
    noConnectCount: model.noConnects.length,
    netCount: model.nets.length,
    orphanPins: [...model.diagnostics.orphanPins],
    danglingWires: [...model.diagnostics.danglingWires],
    labelsWithoutWire: [...model.diagnostics.labelsWithoutWire],
    issues,
  };
  return report;
}
