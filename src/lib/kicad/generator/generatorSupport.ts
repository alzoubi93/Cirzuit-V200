/**
 * Generator ↔ Library bridge.
 *
 * Decides whether the Footprint Generator can open a footprint that comes from
 * the Library tab (or from the KiCad import tab), and in which mode:
 *
 *  - "model"       → the footprint carries real geometry (official KiCad /
 *                    embedded / imported).  The generator opens *that exact
 *                    geometry* in its model editor (display + edit).
 *  - "parametric"  → the footprint is a catalog entry built by one of the
 *                    parametric generator families.  The generator opens the
 *                    family with the catalog parameters.
 *  - "none"        → the generator cannot handle it.  The UI hides the
 *                    "Customize in Generator" button.
 */
import type { KicadFootprintModel } from "../footprint";
import { FOOTPRINT_FAMILIES } from "./registry/footprintFamilies";

/**
 * Families that exist in the registry (for catalog/thumbnail generation) but
 * that the generator UI does not expose parametric controls for.
 */
export const GENERATOR_UNSUPPORTED_FAMILIES: readonly string[] = [
  "test_mechanical",
  "modules",
  "rf_antenna",
  "sensor",
  "display",
  "connector_interface",
];

export type GeneratorSupport = "model" | "parametric" | "none";

export function isGeneratorFamilySupported(familyId?: string | null): boolean {
  if (!familyId) return false;
  if (GENERATOR_UNSUPPORTED_FAMILIES.includes(familyId)) return false;
  return !!FOOTPRINT_FAMILIES[familyId];
}

/** True when the model carries real library geometry (not a parametric build). */
export function isLibraryGeometryModel(model?: KicadFootprintModel | null): boolean {
  if (!model) return false;
  const m = model as any;
  if (m.fromOfficialKiCad || m.embeddedOffline) return true;
  const t = model.source?.type;
  return t === "kicad-official" || t === "imported" || t === "user";
}

export function hasEditablePads(model?: KicadFootprintModel | null): boolean {
  return !!model && Array.isArray(model.pads) && model.pads.length > 0;
}

/**
 * @param familyId       catalog family of the item (if the footprint comes from the catalog)
 * @param model          the footprint model currently shown to the user (may be null while loading)
 * @param officialPending true when official geometry is known to exist but its model is not loaded yet
 */
export function getGeneratorSupport(opts: {
  familyId?: string | null;
  model?: KicadFootprintModel | null;
  officialPending?: boolean;
}): GeneratorSupport {
  const { familyId, model, officialPending } = opts;

  // 1) Real geometry → exact editing in the model editor.
  if (isLibraryGeometryModel(model)) {
    return hasEditablePads(model) ? "model" : "none";
  }
  // Embedded/official geometry exists but isn't in memory yet: it will be
  // resolved on click, so treat as supported.
  if (officialPending) return "model";

  // 2) Parametric catalog entry handled by a supported family.
  if (isGeneratorFamilySupported(familyId)) return "parametric";

  // 3) Anything else cannot be handled by the generator.
  return "none";
}
