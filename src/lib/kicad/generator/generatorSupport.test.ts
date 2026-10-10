import { describe, expect, it } from "vitest";
import type { KicadFootprintModel } from "../footprint";
import {
  GENERATOR_UNSUPPORTED_FAMILIES,
  getGeneratorSupport,
  isGeneratorFamilySupported,
} from "./generatorSupport";

const pad = { number: "1", type: "smd", shape: "rect", position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, rotation: 0, layers: [] };
const model = (over: Record<string, any> = {}) =>
  ({ pads: [pad], source: { type: "generated" }, ...over }) as unknown as KicadFootprintModel;

describe("getGeneratorSupport", () => {
  it("opens real library geometry in model mode", () => {
    const m = model({ source: { type: "kicad-official" }, fromOfficialKiCad: true });
    expect(getGeneratorSupport({ familyId: "modules", model: m })).toBe("model");
  });

  it("hides the button for library geometry with no pads", () => {
    const m = model({ pads: [], source: { type: "kicad-official" } });
    expect(getGeneratorSupport({ familyId: "dip", model: m })).toBe("none");
  });

  it("uses parametric mode for generated models of supported families", () => {
    expect(getGeneratorSupport({ familyId: "dip", model: model() })).toBe("parametric");
  });

  it("returns none for unsupported families without library geometry", () => {
    for (const fam of GENERATOR_UNSUPPORTED_FAMILIES) {
      expect(isGeneratorFamilySupported(fam)).toBe(false);
      expect(getGeneratorSupport({ familyId: fam, model: model() })).toBe("none");
    }
  });

  it("treats not-yet-loaded official geometry as supported", () => {
    expect(getGeneratorSupport({ familyId: "modules", model: model(), officialPending: true })).toBe("model");
  });
});
