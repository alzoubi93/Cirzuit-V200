import type { KicadFootprintModel, KicadFootprintPad, KicadFootprintGraphic } from "../../footprint";
import { createSmdPad, createThtPad } from "../core/pads";
import { createSilkLine, createSilkCircle, createSilkPin1Dot } from "../core/silk";
import { createFabRect, createFabCircle } from "../core/fab";
import { createCourtyardRect } from "../core/courtyard";
import { createReferenceText, createValueText } from "../core/text";
import { buildNativeFootprintModel } from "../rules/kicad";
import { KLC_RULES } from "../rules/klc";

export interface CrystalStandardPackage {
  id: string;
  name: string;
  category: "crystal4p" | "crystal2p" | "oscillator" | "resonator" | "tht";
  desc: string;
  mounting: "SMD" | "THT";
}

export const STANDARD_SMD_CRYSTAL_PACKAGES: CrystalStandardPackage[] = [];

export const QUICK_STANDARD_THT_CRYSTAL_PACKAGES = [
  { id: "HC-49/US", name: "HC-49/US", desc: "Low profile 11.5x5mm / Pitch 4.88mm" },
  { id: "HC-49/U", name: "HC-49/U", desc: "Full height 11.5x5mm / Pitch 4.88mm" },
  { id: "TuningFork_2x6", name: "Watch 2x6mm", desc: "32.768kHz Cylindrical / Pitch 2.54mm" },
  { id: "TuningFork_3x8", name: "Watch 3x8mm", desc: "32.768kHz Cylindrical / Pitch 2.54mm" },
  { id: "Resonator_3Pin_P2.54", name: "Resonator 3P", desc: "Ceramic 3-Pin / Built-in Caps" },
  { id: "Oscillator_DIP-8", name: "Osc DIP-8", desc: "Half Size Clock / Pitch 7.62x5.08mm" },
  { id: "Oscillator_DIP-14", name: "Osc DIP-14", desc: "Full Size Clock / Pitch 15.24x7.62mm" },
  { id: "HC-49_Horizontal", name: "HC-49 Horiz", desc: "Laying flat with ground tab" },
];

export const MORE_STANDARD_THT_CRYSTAL_PACKAGES = [
  { id: "TuningFork_1x5", name: "Watch 1.5x5mm" },
  { id: "Resonator_2Pin_P2.54", name: "Resonator 2P" },
  { id: "Resonator_3Pin_P5.0", name: "Resonator 3P (P5.0)" },
  { id: "HC-49/S_H2.5", name: "HC-49/S (H2.5)" },
];

export interface CrystalParams {
  packageType?: string;
  packageSize?: string;
  technologyType?: string;
  mounting?: "SMD" | "THT";
  reference?: string;
  value?: string;
  pitch?: number;
  drill?: number;
  padSize?: number;
  padWidth?: number;
  padHeight?: number;
  bodyLength?: number;
  bodyWidth?: number;
  [key: string]: any;
}

export function generateCrystal(params: CrystalParams): KicadFootprintModel {
  const pkg = (params.packageSize || params.packageType || "HC-49/US").trim();
  const isTht = true;
  const pads: KicadFootprintPad[] = [];
  const graphics: KicadFootprintGraphic[] = [];
  const ref = params.reference || (pkg.toLowerCase().includes("osc") ? "U" : "Y");

  // ==========================================
  // THT Packages
  // ==========================================
  if (isTht) {
    // 1. HC-49/US or HC-49/U Vertical (Pitch 4.88mm standard)
    if (pkg === "HC-49/US" || pkg === "HC-49/U" || pkg === "HC-49/S_H2.5" || pkg === "Custom_THT_HC49") {
      const pitch = typeof params.pitch === "number" ? params.pitch : 4.88;
      const drill = typeof params.drill === "number" ? params.drill : 0.8;
      const padSize = typeof params.padSize === "number" ? params.padSize : 1.8;
      const bodyL = typeof params.bodyLength === "number" ? params.bodyLength : 11.4;
      const bodyW = typeof params.bodyWidth === "number" ? params.bodyWidth : 4.8;

      pads.push(createThtPad({ number: "1", x: -pitch / 2, y: 0, width: padSize, height: padSize, shape: "rect", drill }));
      pads.push(createThtPad({ number: "2", x: pitch / 2, y: 0, width: padSize, height: padSize, shape: "oval", drill }));

      graphics.push(...createFabRect(-bodyL / 2, -bodyW / 2, bodyL / 2, bodyW / 2));
      graphics.push(createSilkLine(-bodyL / 2 - 0.1, -bodyW / 2 - 0.1, bodyL / 2 + 0.1, -bodyW / 2 - 0.1));
      graphics.push(createSilkLine(bodyL / 2 + 0.1, -bodyW / 2 - 0.1, bodyL / 2 + 0.1, bodyW / 2 + 0.1));
      graphics.push(createSilkLine(bodyL / 2 + 0.1, bodyW / 2 + 0.1, -bodyL / 2 - 0.1, bodyW / 2 + 0.1));
      graphics.push(createSilkLine(-bodyL / 2 - 0.1, bodyW / 2 + 0.1, -bodyL / 2 - 0.1, -bodyW / 2 - 0.1));
      graphics.push(createSilkPin1Dot(-pitch / 2 - 1.2, 0));

      graphics.push(createReferenceText(0, -bodyW / 2 - 1.2));
      graphics.push(createValueText(0, bodyW / 2 + 1.2, params.value || pkg));
      graphics.push(createCourtyardRect(pads, graphics, KLC_RULES.clearance.courtyardTht));

      return buildNativeFootprintModel({
        name: `Crystal_${pkg}_Vertical`,
        referencePrefix: ref,
        value: params.value || pkg,
        description: `Crystal Resonator ${pkg} Through-Hole`,
        tags: ["Crystal", "Resonator", "HC-49", "THT"],
        pads,
        graphics,
        mountingType: "THT",
        generatorFamily: "crystal",
        generatorParams: params,
      });
    }

    // 2. HC-49 Horizontal (Laying down)
    if (pkg === "HC-49_Horizontal") {
      const pitch = 4.88;
      const drill = 0.8;
      const padSize = 1.8;

      pads.push(createThtPad({ number: "1", x: -pitch / 2, y: 0, width: padSize, height: padSize, shape: "rect", drill }));
      pads.push(createThtPad({ number: "2", x: pitch / 2, y: 0, width: padSize, height: padSize, shape: "oval", drill }));
      // Optional grounding strap pad
      pads.push(createThtPad({ number: "3", x: 0, y: 8.5, width: 2.2, height: 1.6, shape: "oval", drill: 1.0 }));

      graphics.push(...createFabRect(-2.4, 0, 2.4, 11.5));
      graphics.push(createSilkLine(-2.5, 0, -2.5, 11.6));
      graphics.push(createSilkLine(-2.5, 11.6, 2.5, 11.6));
      graphics.push(createSilkLine(2.5, 11.6, 2.5, 0));
      graphics.push(createSilkLine(2.5, 0, -2.5, 0));

      graphics.push(createReferenceText(0, -2.2));
      graphics.push(createValueText(0, 13.0, params.value || "HC-49_Horizontal"));
      graphics.push(createCourtyardRect(pads, graphics, KLC_RULES.clearance.courtyardTht));

      return buildNativeFootprintModel({
        name: "Crystal_HC49_Horizontal",
        referencePrefix: ref,
        value: params.value || "HC-49_Horizontal",
        description: "Crystal Resonator HC-49 Horizontal Laying Down",
        tags: ["Crystal", "HC-49", "Horizontal", "THT"],
        pads,
        graphics,
        mountingType: "THT",
        generatorFamily: "crystal",
        generatorParams: params,
      });
    }

    // 3. Tuning Fork Cylindrical (2x6mm or 3x8mm or 1.5x5mm)
    if (pkg.includes("TuningFork") || pkg.includes("Watch")) {
      const is3x8 = pkg.includes("3x8");
      const pitch = typeof params.pitch === "number" ? params.pitch : (is3x8 ? 2.54 : 2.0);
      const drill = typeof params.drill === "number" ? params.drill : 0.7;
      const padSize = typeof params.padSize === "number" ? params.padSize : 1.5;
      const radius = is3x8 ? 1.5 : 1.0;
      const len = is3x8 ? 8.0 : 6.0;

      pads.push(createThtPad({ number: "1", x: -pitch / 2, y: 0, width: padSize, height: padSize, shape: "rect", drill }));
      pads.push(createThtPad({ number: "2", x: pitch / 2, y: 0, width: padSize, height: padSize, shape: "oval", drill }));

      graphics.push(createFabCircle(0, 0, radius));
      graphics.push(...createFabRect(-radius, 0, radius, len));
      graphics.push(createSilkLine(-radius - 0.1, 0, -radius - 0.1, len + 0.1));
      graphics.push(createSilkLine(radius + 0.1, 0, radius + 0.1, len + 0.1));
      graphics.push(createSilkLine(-radius - 0.1, len + 0.1, radius + 0.1, len + 0.1));

      graphics.push(createReferenceText(0, -2.0));
      graphics.push(createValueText(0, len + 1.8, params.value || "32.768kHz"));
      graphics.push(createCourtyardRect(pads, graphics, KLC_RULES.clearance.courtyardTht));

      return buildNativeFootprintModel({
        name: `Crystal_${pkg}`,
        referencePrefix: ref,
        value: params.value || "32.768kHz",
        description: "Cylindrical Tuning Fork Watch Crystal 32.768 kHz",
        tags: ["Crystal", "TuningFork", "32.768kHz", "THT"],
        pads,
        graphics,
        mountingType: "THT",
        generatorFamily: "crystal",
        generatorParams: params,
      });
    }

    // 4. Ceramic Resonator 3-Pin (Murata CSTNE style)
    if (pkg.includes("Resonator_3Pin") || pkg.includes("Resonator")) {
      const pitch = typeof params.pitch === "number" ? params.pitch : 2.54;
      const drill = typeof params.drill === "number" ? params.drill : 0.8;
      const padSize = typeof params.padSize === "number" ? params.padSize : 1.6;

      pads.push(createThtPad({ number: "1", x: -pitch, y: 0, width: padSize, height: padSize, shape: "rect", drill })); // In
      pads.push(createThtPad({ number: "2", x: 0, y: 0, width: padSize, height: padSize, shape: "oval", drill }));      // GND
      pads.push(createThtPad({ number: "3", x: pitch, y: 0, width: padSize, height: padSize, shape: "oval", drill }));  // Out

      graphics.push(...createFabRect(-pitch * 1.5, -1.8, pitch * 1.5, 1.8));
      graphics.push(createSilkLine(-pitch * 1.5, -1.9, pitch * 1.5, -1.9));
      graphics.push(createSilkLine(pitch * 1.5, -1.9, pitch * 1.5, 1.9));
      graphics.push(createSilkLine(pitch * 1.5, 1.9, -pitch * 1.5, 1.9));
      graphics.push(createSilkLine(-pitch * 1.5, 1.9, -pitch * 1.5, -1.9));
      graphics.push(createSilkPin1Dot(-pitch - 1.2, 0));

      graphics.push(createReferenceText(0, -2.8));
      graphics.push(createValueText(0, 2.8, params.value || "Resonator_3Pin"));
      graphics.push(createCourtyardRect(pads, graphics, KLC_RULES.clearance.courtyardTht));

      return buildNativeFootprintModel({
        name: "Resonator_3Pin_Ceramic_P2.54mm",
        referencePrefix: "Y",
        value: params.value || "Resonator_3P",
        description: "Ceramic Resonator 3-Pin with built-in load capacitors",
        tags: ["Resonator", "Ceramic", "3Pin", "THT"],
        pads,
        graphics,
        mountingType: "THT",
        generatorFamily: "crystal",
        generatorParams: params,
      });
    }

    // 5. Oscillator DIP-8 (Half-Size) or DIP-14 (Full-Size)
    if (pkg.includes("DIP-8") || pkg.includes("DIP-14")) {
      const isDip14 = pkg.includes("DIP-14");
      const pitchX = isDip14 ? 15.24 : 7.62;
      const pitchY = 7.62;
      const bodyW = isDip14 ? 20.8 : 13.2;
      const bodyH = 13.2;
      const drill = 0.8;
      const padSize = 1.8;

      // 4 active pins at the corners: Pin 1 (Tri-state/NC), Pin 7/4 (GND), Pin 8/5 (OUT), Pin 14/8 (VCC)
      pads.push(createThtPad({ number: "1", x: -pitchX / 2, y: pitchY / 2, width: padSize, height: padSize, shape: "rect", drill }));
      pads.push(createThtPad({ number: isDip14 ? "7" : "4", x: pitchX / 2, y: pitchY / 2, width: padSize, height: padSize, shape: "oval", drill }));
      pads.push(createThtPad({ number: isDip14 ? "8" : "5", x: pitchX / 2, y: -pitchY / 2, width: padSize, height: padSize, shape: "oval", drill }));
      pads.push(createThtPad({ number: isDip14 ? "14" : "8", x: -pitchX / 2, y: -pitchY / 2, width: padSize, height: padSize, shape: "oval", drill }));

      graphics.push(...createFabRect(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2));
      graphics.push(createSilkLine(-bodyW / 2, -bodyH / 2, bodyW / 2, -bodyH / 2));
      graphics.push(createSilkLine(bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2));
      graphics.push(createSilkLine(bodyW / 2, bodyH / 2, -bodyW / 2, bodyH / 2));
      graphics.push(createSilkLine(-bodyW / 2, bodyH / 2, -bodyW / 2, -bodyH / 2));
      graphics.push(createSilkPin1Dot(-pitchX / 2 - 1.2, pitchY / 2));

      graphics.push(createReferenceText(0, -bodyH / 2 - 1.2));
      graphics.push(createValueText(0, bodyH / 2 + 1.2, params.value || pkg));
      graphics.push(createCourtyardRect(pads, graphics, KLC_RULES.clearance.courtyardTht));

      return buildNativeFootprintModel({
        name: `Oscillator_${pkg}`,
        referencePrefix: "U",
        value: params.value || pkg,
        description: `Crystal Clock Oscillator ${pkg} Metal Can Through-Hole`,
        tags: ["Oscillator", "Clock", pkg, "THT"],
        pads,
        graphics,
        mountingType: "THT",
        generatorFamily: "crystal",
        generatorParams: params,
      });
    }

    // Default Fallback / Custom THT
    const pitch = typeof params.pitch === "number" ? params.pitch : 5.08;
    const drill = typeof params.drill === "number" ? params.drill : 0.8;
    const padSize = typeof params.padSize === "number" ? params.padSize : 1.8;
    const bodyL = typeof params.bodyLength === "number" ? params.bodyLength : 10.0;
    const bodyW = typeof params.bodyWidth === "number" ? params.bodyWidth : 4.5;

    pads.push(createThtPad({ number: "1", x: -pitch / 2, y: 0, width: padSize, height: padSize, shape: "rect", drill }));
    pads.push(createThtPad({ number: "2", x: pitch / 2, y: 0, width: padSize, height: padSize, shape: "oval", drill }));

    graphics.push(...createFabRect(-bodyL / 2, -bodyW / 2, bodyL / 2, bodyW / 2));
    graphics.push(createSilkLine(-bodyL / 2, -bodyW / 2, bodyL / 2, -bodyW / 2));
    graphics.push(createSilkLine(bodyL / 2, -bodyW / 2, bodyL / 2, bodyW / 2));
    graphics.push(createSilkLine(bodyL / 2, bodyW / 2, -bodyL / 2, bodyW / 2));
    graphics.push(createSilkLine(-bodyL / 2, bodyW / 2, -bodyL / 2, -bodyW / 2));
    graphics.push(createReferenceText(0, -bodyW / 2 - 1.2));
    graphics.push(createValueText(0, bodyW / 2 + 1.2, params.value || "Crystal_Custom"));
    graphics.push(createCourtyardRect(pads, graphics, KLC_RULES.clearance.courtyardTht));

    return buildNativeFootprintModel({
      name: "Crystal_Custom_THT",
      referencePrefix: ref,
      value: params.value || "Crystal",
      description: "Custom Parametric Crystal Through-Hole",
      tags: ["Crystal", "Custom", "THT"],
      pads,
      graphics,
      mountingType: "THT",
      generatorFamily: "crystal",
      generatorParams: params,
    });
  }
}
