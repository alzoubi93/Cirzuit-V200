import { describe, expect, it } from "vitest";
import { parseGerberFile, parseExcellonFile, detectLayerByFilenameAndContent } from "./importGerber";

describe("Gerber & Excellon Import Parsing", () => {
  it("parses RS-274X tracks and pads correctly", () => {
    const gerberContent = `
%MOMM*%
%FSLAX34Y34*%
%ADD10C,1.5*%
%ADD11R,2.0X1.0*%
D10*
X100000Y200000D03*
X300000Y400000D02*
X500000Y600000D01*
M02*
`;
    const result = parseGerberFile(gerberContent, "top_copper");
    expect(result.pads).toHaveLength(1);
    expect(result.pads[0].x).toBe(10);
    expect(result.pads[0].y).toBe(20);
    expect(result.pads[0].width).toBe(1.5);
    expect(result.pads[0].shape).toBe("circle");
    // Gerber has no component/pin metadata, so the importer must not fabricate
    // global sequential pin numbers.
    expect(result.pads[0].number).toBeUndefined();

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].points).toHaveLength(2);
    expect(result.tracks[0].points[0]).toEqual({ x: 30, y: 40 });
    expect(result.tracks[0].points[1]).toEqual({ x: 50, y: 60 });
  });

  it("parses Excellon drill files correctly", () => {
    const excellonContent = `
M48
METRIC
T01C0.8
T02C1.2
%
T01
X10.0Y20.0
X15.0Y25.0
T02
X30.0Y40.0
M30
`;
    const vias = parseExcellonFile(excellonContent);
    expect(vias).toHaveLength(3);
    expect(vias[0].drill).toBe(0.8);
    expect(vias[0].x).toBe(10);
    expect(vias[0].y).toBe(20);
    expect(vias[2].drill).toBe(1.2);
    expect(vias[2].x).toBe(30);
    expect(vias[2].y).toBe(40);
  });

  it("detects layer types based on filename and content", () => {
    expect(detectLayerByFilenameAndContent("board.GTL", "")).toBe("top_copper");
    expect(detectLayerByFilenameAndContent("board.GBL", "")).toBe("bottom_copper");
    expect(detectLayerByFilenameAndContent("board.GKO", "")).toBe("outline");
    expect(detectLayerByFilenameAndContent("board.GTO", "")).toBe("silkscreen");
    expect(detectLayerByFilenameAndContent("board.DRL", "")).toBe("drill");
  });
});

describe("Gerber coordinate fidelity", () => {
  it("handles trailing-zero suppression from FS and incremental coordinates", () => {
    const gerber = [
      "%MOMM*%",
      "%FSTIX24Y24*%", // trailing-zero suppression, incremental coordinates, 2.4 format
      "%ADD10C,0.8*%",
      "D10*",
      "X10000Y20000D03*", // 10.0, 20.0 mm after expansion
      "X01000Y00000D02*", // +1.0 mm X in incremental mode
      "X01000Y00000D01*", // +1.0 mm X again
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(1);
    expect(result.pads[0].x).toBe(10);
    expect(result.pads[0].y).toBe(20);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].points[0].x).toBe(11);
    expect(result.tracks[0].points[1].x).toBe(12);
  });

  it("respects G70/G71 unit switches for coordinate values", () => {
    const gerber = [
      "%FSLAX24Y24*%",
      "%ADD10C,1.0*%",
      "G70*",
      "D10*",
      "X010000Y020000D03*", // 1.0 x 2.0 inches => 25.4 x 50.8 mm
      "G71*",
      "X010000Y020000D03*", // 1.0 x 2.0 mm
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(2);
    expect(result.pads[0].x).toBeCloseTo(25.4, 4);
    expect(result.pads[0].y).toBeCloseTo(50.8, 4);
    expect(result.pads[1].x).toBeCloseTo(1, 4);
    expect(result.pads[1].y).toBeCloseTo(2, 4);
  });
});

it("preserves obround Gerber flashes as oval pads", () => {
  const gerber = [
    "%MOMM*%",
    "%FSLAX24Y24*%",
    "%ADD10O,2.0X1.0*%",
    "D10*",
    "X010000Y020000D03*",
    "M02*",
  ].join("\n");
  const result = parseGerberFile(gerber, "top_copper");
  expect(result.pads).toHaveLength(1);
  expect(result.pads[0].shape).toBe("oval");
  expect(result.pads[0].width).toBe(2);
  expect(result.pads[0].height).toBe(1);
});


describe("Gerber arc interpolation", () => {
  it("approximates circular interpolation with a smooth track path", () => {
    const gerber = [
      "%MOMM*%",
      "%FSLAX24Y24*%",
      "%ADD10C,0.2*%",
      "D10*",
      "X010000Y000000D02*", // start at (1, 0)
      "G03X000000Y010000I-010000J000000D01*", // CCW quarter circle around (0, 0)
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].points.length).toBeGreaterThan(10);
    expect(result.tracks[0].points[0].x).toBeCloseTo(1, 4);
    expect(result.tracks[0].points[0].y).toBeCloseTo(0, 4);
    expect(result.tracks[0].points[result.tracks[0].points.length - 1].x).toBeCloseTo(0, 4);
    expect(result.tracks[0].points[result.tracks[0].points.length - 1].y).toBeCloseTo(1, 4);
  });
});


describe("Excellon coordinate formats", () => {
  it("uses declared metric format and leading-zero suppression", () => {
    const excellon = [
      "M48",
      "METRIC,LZ,000.000",
      "T01C0.8",
      "%",
      "T01",
      "X001234Y005678",
      "M30",
    ].join("\n");
    const vias = parseExcellonFile(excellon);
    expect(vias).toHaveLength(1);
    expect(vias[0].x).toBeCloseTo(1.234, 4);
    expect(vias[0].y).toBeCloseTo(5.678, 4);
  });
});

describe("Gerber step-and-repeat", () => {
  it("duplicates only geometry inside an SR block with the declared offsets", () => {
    const gerber = [
      "%MOMM*%",
      "%FSLAX24Y24*%",
      "%ADD10C,1.0*%",
      "D10*",
      "%SRX2Y2I10J5*%",
      "X010000Y020000D03*",
      "%SR*%",
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(4);
    const positions = result.pads.map((pad) => [pad.x, pad.y]);
    expect(positions).toContainEqual([1, 2]);
    expect(positions).toContainEqual([11, 2]);
    expect(positions).toContainEqual([1, 7]);
    expect(positions).toContainEqual([11, 7]);
  });
});

describe("Excellon omitted-axis coordinates", () => {
  it("retains the previous absolute coordinate when a drill hit omits an axis", () => {
    const excellon = [
      "M48",
      "METRIC,LZ,000.000",
      "T01C0.8",
      "%",
      "T01",
      "X001000Y002000",
      "X003000",
      "Y004000",
      "M30",
    ].join("\n");
    const vias = parseExcellonFile(excellon);
    expect(vias).toHaveLength(3);
    expect(vias[0].x).toBeCloseTo(1, 4);
    expect(vias[0].y).toBeCloseTo(2, 4);
    expect(vias[1].x).toBeCloseTo(3, 4);
    expect(vias[1].y).toBeCloseTo(2, 4);
    expect(vias[2].x).toBeCloseTo(3, 4);
    expect(vias[2].y).toBeCloseTo(4, 4);
  });
});

import { diagnoseGerberContent } from "./gerberDiagnostics";

describe("Gerber capability diagnostics", () => {
  it("warns when the file uses filled regions and clear polarity", () => {
    const diagnostics = diagnoseGerberContent([
      "%FSLAX24Y24*%",
      "%LPC*%",
      "G36*",
      "X000000Y000000D02*",
      "X010000Y000000D01*",
      "G37*",
      "M02*",
    ].join("\n"));
    expect(diagnostics.map((item) => item.code)).toContain("REGION_FILL_UNSUPPORTED");
    expect(diagnostics.map((item) => item.code)).toContain("CLEAR_POLARITY_UNSUPPORTED");
  });

  it("identifies aperture macros without claiming they were rendered", () => {
    const diagnostics = diagnoseGerberContent("%FSLAX24Y24*%\n%AMROUNDRECT*1,1,2,2*%\nM02*");
    expect(diagnostics.map((item) => item.code)).toContain("APERTURE_MACRO_UNSUPPORTED");
  });
});


describe("Gerber filled regions rendered through PCB WebGL zones", () => {
  it("imports G36/G37 closed copper regions as filled zone geometry", () => {
    const gerber = [
      "%MOMM*%",
      "%FSLAX24Y24*%",
      "%LPD*%",
      "G36*",
      "X000000Y000000D02*",
      "X010000Y000000D01*",
      "X010000Y010000D01*",
      "X000000Y010000D01*",
      "X000000Y000000D01*",
      "G37*",
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.pts.length).toBeGreaterThanOrEqual(4);
    expect(result.zones[0].filledPolygons?.[0].pts).toHaveLength(result.zones[0].boundary.pts.length);
  });

  it("does not incorrectly paint clear-polarity regions as dark copper", () => {
    const gerber = ["%MOMM*%", "%FSLAX24Y24*%", "%LPC*%", "G36*", "X000000Y000000D02*", "X010000Y000000D01*", "X010000Y010000D01*", "G37*"].join("\n");
    expect(parseGerberFile(gerber, "top_copper").zones).toHaveLength(0);
  });
});


describe("Gerber clear polarity in WebGL copper zones", () => {
  it("removes a copper zone when a later clear circular flash covers it completely", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,1.0*%", "%ADD11C,8.0*%", "%LPD*%",
      "G36*", "X-010000Y-010000D02*", "X010000Y-010000D01*",
      "X010000Y010000D01*", "X-010000Y010000D01*", "X-010000Y-010000D01*", "G37*",
      "%LPC*%", "D11*", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(0);
  });

  it("removes an earlier copper zone when an LPC region fully covers it", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%LPD*%",
      "G36*", "X000000Y000000D02*", "X020000Y000000D01*",
      "X020000Y020000D01*", "X000000Y020000D01*", "X000000Y000000D01*", "G37*",
      "%LPC*%", "G36*", "X-005000Y-005000D02*", "X025000Y-005000D01*",
      "X025000Y025000D01*", "X-005000Y025000D01*", "X-005000Y-005000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(0);
  });

  it("encodes a contained LPC region as a hole in the prior dark copper region", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%LPD*%",
      "G36*", "X000000Y000000D02*", "X020000Y000000D01*",
      "X020000Y020000D01*", "X000000Y020000D01*", "X000000Y000000D01*", "G37*",
      "%LPC*%", "G36*", "X005000Y005000D02*", "X015000Y005000D01*",
      "X015000Y015000D01*", "X005000Y015000D01*", "X005000Y005000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.holes).toHaveLength(1);
    expect(result.zones[0].filledPolygons?.[0].holes).toHaveLength(1);
    expect(result.zones[0].boundary.holes?.[0]).toHaveLength(4);
  });
});


describe("Gerber aperture macro basic primitives", () => {
  it("renders a numeric circle macro as WebGL zone geometry instead of a rectangular pad", () => {
    const gerber = [
      "%MOMM*%",
      "%FSLAX34Y34*%",
      "%AMMACROCIRCLE*1,1,1.2,0,0,0*%",
      "%ADD10MACROCIRCLE*%",
      "D10*",
      "X100000Y200000D03*",
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].filledPolygons?.[0].pts.length).toBeGreaterThanOrEqual(32);
    expect(result.zones[0].layer).toBe("top_copper");
  });
});


describe("Gerber aperture macro exposure-off primitives", () => {
  it("preserves a contained exposure-off circle as a transparent hole", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROHOLE*21,1,10,10,0,0,0*1,0,5,0,0*%",
      "%ADD10MACROHOLE*%", "D10*", "X100000Y100000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.holes).toHaveLength(1);
    expect(result.zones[0].filledPolygons?.[0].holes).toHaveLength(1);
  });
});

describe("Gerber aperture macro expressions", () => {
  it("evaluates AD parameters, variable assignments, and arithmetic expressions", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX34Y34*%",
      "%AMMACROEXPR*$1=$1*2*1,1,$1,0,0,0*%",
      "%ADD10MACROEXPR,1.5*%", "D10*", "X100000Y200000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones).toHaveLength(1);
    const points = result.zones[0].boundary.pts;
    const xs = points.map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3, 1);
  });

  it("ignores unsupported or invalid macro expressions without throwing", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROBAD*1,1,$9,0,0,0*%", "%ADD10MACROBAD*%",
      "D10*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    expect(() => parseGerberFile(gerber, "top_copper")).not.toThrow();
  });
});

describe("Gerber aperture macro outline and lower-left rectangle", () => {
  it("renders an outline primitive as polygon geometry", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROOUTLINE*4,1,4,-2,-2,2,-2,2,2,-2,2,0*%",
      "%ADD10MACROOUTLINE*%", "D10*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.pts).toHaveLength(4);
  });

  it("renders primitive 22 from its lower-left anchor", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROLOWERLEFT*22,1,4,2,1,1,0*%",
      "%ADD10MACROLOWERLEFT*%", "D10*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    const xs = result.zones[0].boundary.pts.map(point => point.x);
    const ys = result.zones[0].boundary.pts.map(point => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 3);
  });
});


describe("Gerber aperture macro thermal primitive", () => {
  it("imports a thermal primitive as zone geometry with a center opening and gap cuts", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROTHERMAL*7,1,0,0,4,2,0.5,0*%",
      "%ADD10MACROTHERMAL*%", "D10*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.zones[0].boundary.pts.length).toBeGreaterThanOrEqual(48);
    expect(result.zones[0].boundary.holes?.length).toBeGreaterThanOrEqual(1);
  });
});


describe("Gerber Moire macro and clear-polarity geometry", () => {
  it("renders legacy Moire rings and crosshairs as WebGL zone geometry", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMOIRE*6,1,1,5,0.5,0.5,3,0.2,6,0*%",
      "%ADD10MOIRE*%", "D10*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones.length).toBeGreaterThanOrEqual(3); // rings and crosshairs
    expect(result.zones.some((zone) => (zone.boundary?.holes?.length || 0) > 0)).toBe(true);
  });

  it("removes a previously flashed copper pad when a later clear flash fully covers it", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,1*%", "%ADD11C,2*%",
      "D10*", "X050000Y050000D03*", "%LPC*%", "D11*", "X050000Y050000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
  });

  it("removes an oval copper pad when a later rectangular LPC region fully covers its curved outline", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10O,4X2*%", "%ADD11R,8X6*%",
      "D10*", "X050000Y050000D03*",
      "%LPC*%", "D11*", "X050000Y050000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
  });

  it("splits a rectangular copper pad around a partially overlapping rectangular LPC clearance", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10R,10X10*%",
      "D10*", "X050000Y050000D03*",
      // Clear area crosses the right edge of the pad and removes a 2 mm-high strip.
      "%LPC*%", "G36*", "X080000Y040000D02*", "X120000Y040000D01*",
      "X120000Y060000D01*", "X080000Y060000D01*", "X080000Y040000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads.length).toBeGreaterThan(1);
    expect(new Set(result.pads.map((pad) => pad.id)).size).toBe(result.pads.length);
    for (const pad of result.pads) {
      const minX = pad.x - pad.width / 2, maxX = pad.x + pad.width / 2;
      const minY = pad.y - pad.height / 2, maxY = pad.y + pad.height / 2;
      expect(!(minX < 10 && maxX > 8 && minY < 6 && maxY > 4)).toBe(true);
    }
  });

  it("applies successive rectangular LPC clearances to previously split copper pad fragments", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10R,10X10*%",
      "D10*", "X050000Y050000D03*",
      // First clearance cuts a horizontal band from the pad's right edge.
      "%LPC*%", "G36*", "X080000Y040000D02*", "X120000Y040000D01*",
      "X120000Y060000D01*", "X080000Y060000D01*", "X080000Y040000D01*", "G37*",
      // The next clearance removes the left 6 mm from the remaining fragments.
      "G36*", "X000000Y000000D02*", "X060000Y000000D01*",
      "X060000Y100000D01*", "X000000Y100000D01*", "X000000Y000000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads.length).toBeGreaterThan(0);
    expect(new Set(result.pads.map((pad) => pad.id)).size).toBe(result.pads.length);
    for (const pad of result.pads) {
      const minX = pad.x - pad.width / 2, maxX = pad.x + pad.width / 2;
      const minY = pad.y - pad.height / 2, maxY = pad.y + pad.height / 2;
      // No remaining copper fragment may overlap either of the two clear regions.
      expect(!(minX < 12 && maxX > 8 && minY < 6 && maxY > 4)).toBe(true);
      expect(!(minX < 6 && maxX > 0 && minY < 10 && maxY > 0)).toBe(true);
    }
  });

  it("clips a partially overlapping rectangular LPC clearance out of a rectangular copper zone", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      // Dark copper rectangle from (0,0) to (10,10).
      "LPD*", "G36*", "X000000Y000000D02*", "X100000Y000000D01*",
      "X100000Y100000D01*", "X000000Y100000D01*", "X000000Y000000D01*", "G37*",
      // This clear rectangle extends beyond the right edge of the copper zone.
      "%LPC*%", "G36*", "X080000Y040000D02*", "X120000Y040000D01*",
      "X120000Y060000D01*", "X080000Y060000D01*", "X080000Y040000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(3);
    for (const zone of result.zones) {
      expect(zone.boundary.holes || []).toHaveLength(0);
      const xs = zone.boundary.pts.map((point) => point.x);
      const ys = zone.boundary.pts.map((point) => point.y);
      expect(!(Math.min(...xs) < 8 && Math.max(...xs) > 8 && Math.min(...ys) < 6 && Math.max(...ys) > 4)).toBe(true);
    }
  });

  it("subtracts a rectangular LPC clearance from a partially intersected triangular copper zone", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      // Dark triangular copper region.
      "LPD*", "G36*", "X000000Y000000D02*", "X100000Y000000D01*",
      "X050000Y100000D01*", "X000000Y000000D01*", "G37*",
      // Rectangular clearance crosses the triangle's sloped right edge.
      "%LPC*%", "G36*", "X040000Y030000D02*", "X080000Y030000D01*",
      "X080000Y060000D01*", "X040000Y060000D01*", "X040000Y030000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones.length).toBeGreaterThan(1);
    for (const zone of result.zones) {
      expect(zone.boundary.holes || []).toHaveLength(0);
      // No resulting trapezoid vertex may lie strictly inside the erased box.
      for (const point of zone.boundary.pts) {
        expect(point.x > 4 + 1e-7 && point.x < 8 - 1e-7 && point.y > 3 + 1e-7 && point.y < 6 - 1e-7).toBe(false);
      }
    }
  });

  it("subtracts a partially overlapping triangular LPC clearance from a triangular copper zone", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      // Dark copper triangle.
      "LPD*", "G36*", "X000000Y000000D02*", "X100000Y000000D01*",
      "X050000Y100000D01*", "X000000Y000000D01*", "G37*",
      // A triangular clearance crosses the right sloping edge of the copper.
      "%LPC*%", "G36*", "X040000Y020000D02*", "X090000Y040000D01*",
      "X040000Y060000D01*", "X040000Y020000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones.length).toBeGreaterThan(1);
    for (const zone of result.zones) {
      expect(zone.boundary.holes || []).toHaveLength(0);
      expect(zone.boundary.pts.length).toBeGreaterThanOrEqual(3);
      // The centroid of each decomposed trapezoid must not fall in the clear triangle.
      const points = zone.boundary.pts;
      const centroid = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      };
      const clear = [{ x: 4, y: 2 }, { x: 9, y: 4 }, { x: 4, y: 6 }];
      let inside = false;
      for (let i = 0, j = clear.length - 1; i < clear.length; j = i++) {
        const a = clear[i], b = clear[j];
        if (((a.y > centroid.y) !== (b.y > centroid.y)) &&
            centroid.x < ((b.x - a.x) * (centroid.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      expect(inside).toBe(false);
    }
  });

  it("does not erase a track whose endpoints are inside a concave clear region but whose segment crosses outside it", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.2*%",
      // A dark track crosses the open notch of the U-shaped clearance.
      "D10*", "X010000Y080000D02*", "X090000Y080000D01*",
      // U-shaped clear region: both endpoints are inside, but the middle is not.
      "%LPC*%", "G36*", "X000000Y000000D02*", "X100000Y000000D01*",
      "X100000Y100000D01*", "X070000Y100000D01*", "X070000Y030000D01*",
      "X030000Y030000D01*", "X030000Y100000D01*", "X000000Y100000D01*",
      "X000000Y000000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(1);
  });

  it("splits a track when a clear region erases only its middle section", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.2*%",
      "D10*", "X000000Y050000D02*", "X100000Y050000D01*",
      "%LPC*%", "G36*", "X040000Y040000D02*", "X060000Y040000D01*",
      "X060000Y060000D01*", "X040000Y060000D01*", "X040000Y040000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].points[0].x).toBeCloseTo(0, 1);
    expect(result.tracks[1].points[result.tracks[1].points.length - 1].x).toBeCloseTo(10, 1);
    // The cut edges should be refined to the track-width-adjusted clearance
    // boundary, rather than remaining quantized to the 0.05 mm sample grid.
    expect(result.tracks[0].points[result.tracks[0].points.length - 1].x).toBeCloseTo(3.9, 2);
    expect(result.tracks[1].points[0].x).toBeCloseTo(6.1, 2);
    expect(result.tracks.every((track) => track.points.length >= 2)).toBe(true);
  });

  it("applies successive LPC clearances to already-split track fragments", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.2*%",
      "D10*", "X000000Y050000D02*", "X100000Y050000D01*",
      "%LPC*%", "G36*", "X030000Y040000D02*", "X040000Y040000D01*",
      "X040000Y060000D01*", "X030000Y060000D01*", "X030000Y040000D01*", "G37*",
      "G36*", "X060000Y040000D02*", "X070000Y040000D01*",
      "X070000Y060000D01*", "X060000Y060000D01*", "X060000Y040000D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(3);
    expect(result.tracks.every((track) => track.points.length >= 2)).toBe(true);
    expect(new Set(result.tracks.map((track) => track.id)).size).toBe(3);
    expect(result.tracks.every((track) => track.points.every((point) =>
      !(point.x > 2.9 && point.x < 4.1) && !(point.x > 5.9 && point.x < 7.1)
    ))).toBe(true);
  });

  it("detects a narrow LPC clearance that falls between fixed-grid samples", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.005*%",
      "D10*", "X000000Y050000D02*", "X100000Y050000D01*",
      // 0.02 mm-wide clearance positioned between 0.05 mm sample locations.
      "%LPC*%", "G36*", "X050100Y049900D02*", "X050300Y049900D01*",
      "X050300Y050100D01*", "X050100Y050100D01*", "X050100Y049900D01*", "G37*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks.length).toBeGreaterThan(1);
    expect(result.tracks.every((track) => track.points.length >= 2)).toBe(true);
  });

  it("represents a contained clear-polarity circular flash as a hole in prior copper", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,10*%", "%ADD11C,2*%",
      "D10*", "G36*", "X000000Y000000D02*", "X100000Y000000D01*",
      "X100000Y100000D01*", "X000000Y100000D01*", "X000000Y000000D01*", "G37*",
      "%LPC*%", "D11*", "X050000Y050000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary?.holes).toHaveLength(1);
    expect(result.zones[0].filledPolygons?.[0].holes).toHaveLength(1);
    expect(result.pads).toHaveLength(0);
  });
});


describe("Gerber aperture macro outer transformations", () => {
  it("applies LR and LS to a macro flash around its flash point", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROT*21,1,4,2,0,0,0*%", "%ADD10MACROT*%",
      "%LR90*%", "%LS2*%", "D10*", "X100000Y100000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    const points = result.zones[0].boundary.pts;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(8, 1);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(10, 1);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(10, 1);
  });
});

describe("Gerber legacy aperture macro vector line", () => {
  it("imports deprecated primitive 2 using vector-line geometry", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%",
      "%AMMACROLEGACYLINE*2,1,0.4,-1,0,1,0,0*%",
      "%ADD10MACROLEGACYLINE*%", "D10*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.pts).toHaveLength(4);
    const xs = result.zones[0].boundary.pts.map(point => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2.4, 1);
  });
});


describe("Gerber block apertures", () => {
  it("renders child objects at the block flash position", () => {
    const gerber = [
      "%MOMM*%",
      "%FSLAX24Y24*%",
      "%ADD10C,1.0*%",
      "%ABD11*%",
      "D10*",
      "X000000Y000000D03*",
      "%AB*%",
      "D11*",
      "X010000Y020000D03*",
      "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(1);
    expect(result.pads[0].x).toBeCloseTo(1, 4);
    expect(result.pads[0].y).toBeCloseTo(2, 4);
    expect(result.pads[0].width).toBeCloseTo(1, 4);
  });
});


describe("Gerber nested block apertures", () => {
  it("resolves a block aperture used inside another block aperture", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.5*%",
      "%ABD11*%", "D10*", "X010000Y000000D03*", "%AB*%",
      "%ABD12*%", "D11*", "X020000Y000000D03*", "%AB*%",
      "D10*", "X000000Y000000D03*",
      "D12*", "X100000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(2);
    const xs = result.pads.map((pad) => pad.x).sort((a, b) => a - b);
    // The anchor at zero establishes the normalization offset (+0.25 mm).
    expect(xs[0]).toBeCloseTo(0.25, 3);
    expect(xs[1]).toBeCloseTo(13.25, 3);
  });
});

describe("Gerber block aperture transformations", () => {
  it("applies scale and rotation to block geometry at each flash", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,1.0*%",
      "%ABD11*%", "D10*", "X010000Y000000D03*", "%AB*%",
      "%LS2*%", "%LR90*%", "D11*", "X100000Y100000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(1);
    expect(result.pads[0].x).toBeCloseTo(10, 3);
    expect(result.pads[0].y).toBeCloseTo(12, 3);
    expect(result.pads[0].width).toBeCloseTo(2, 3);
    expect(result.pads[0].height).toBeCloseTo(2, 3);
  });

  it("preserves the Gerber origin while transforming block flashes", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.4*%",
      "%ABD11*%", "D10*", "X025000Y010000D03*", "%AB*%",
      "D10*", "X000000Y000000D03*",
      "%LR90*%", "D11*", "X100000Y100000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(2);
    // The child flash at (2.5, 1) rotates to (-1, 2.5), then translates to (9, 12.5).
    // The anchor pad makes the top-level normalization offset (+0.2, +0.2).
    expect(result.pads[1].x).toBeCloseTo(9.2, 3);
    expect(result.pads[1].y).toBeCloseTo(12.7, 3);
  });

  it("mirrors block coordinates before applying rotation", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.5*%",
      "%ABD11*%", "D10*", "X010000Y000000D03*", "%AB*%",
      "%LMX*%", "D11*", "X100000Y100000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(1);
    expect(result.pads[0].x).toBeCloseTo(9, 3);
    expect(result.pads[0].y).toBeCloseTo(10, 3);
  });
});

describe("Gerber clear-polarity standard strokes", () => {
  it("does not import an LPC copper stroke as a new positive track", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.5*%", "D10*",
      "%LPC*%", "X000000Y000000D02*", "X010000Y000000D01*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(0);
    expect(result.pads).toHaveLength(0);
  });

  it("applies LR rotation and LS scale to a clear rectangular flash", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10R,10X10*%", "%ADD11R,4X2*%",
      "D10*", "G36*", "X-100000Y-100000D02*", "X100000Y-100000D01*",
      "X100000Y100000D01*", "X-100000Y100000D01*", "X-100000Y-100000D01*", "G37*",
      "%LPC*%", "%LR90*%", "%LS2*%", "D11*", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    const hole = result.zones[0]?.boundary?.holes?.[0];
    expect(hole).toBeDefined();
    const xs = hole!.map((point) => point.x);
    const ys = hole!.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(8, 1);
  });

  it("preserves rotation of a positive rectangular flash as polygon geometry", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10R,4X2*%", "%LR90*%",
      "D10*", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
    expect(result.zones).toHaveLength(1);
    const points = result.zones[0].boundary.pts;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 1);
  });

  it("does not import an LPC rectangular flash as a positive pad", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10R,2X1*%", "D10*",
      "%LPC*%", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.pads).toHaveLength(0);
  });
});

describe("Gerber clear block apertures", () => {
  it("subtracts a contained clear block pad from every overlapping copper zone", () => {
    const region = [
      "G36*", "X-020000Y-020000D02*", "X020000Y-020000D01*", "X020000Y020000D01*", "X-020000Y020000D01*", "X-020000Y-020000D01*", "G37*",
    ];
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.5*%",
      ...region, ...region,
      "%ABD12*%", "D10*", "X000000Y000000D03*", "%AB*%",
      "%LPC*%", "D12*", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(2);
    expect(result.zones.every((zone) => (zone.boundary.holes || []).length === 1)).toBe(true);
    expect(result.zones.every((zone) => (zone.filledPolygons?.[0].holes || []).length === 1)).toBe(true);
  });

  it("does not create a hole that extends outside a copper region", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,1*%",
      "G36*", "X-020000Y-020000D02*", "X020000Y-020000D01*", "X020000Y020000D01*", "X-020000Y020000D01*", "X-020000Y-020000D01*", "G37*",
      "%LPC*%", "D10*", "X022000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.holes || []).toHaveLength(0);
  });

  it("avoids overlapping nested holes when a later clearance fully covers an earlier one", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.5*%", "%ADD11C,1.0*%",
      "G36*", "X-030000Y-030000D02*", "X030000Y-030000D01*", "X030000Y030000D01*", "X-030000Y030000D01*", "X-030000Y-030000D01*", "G37*",
      "%LPC*%", "D10*", "X000000Y000000D03*", "D11*", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones).toHaveLength(1);
    expect(result.zones[0].boundary.holes || []).toHaveLength(1);
    expect(result.zones[0].filledPolygons?.[0].holes || []).toHaveLength(1);
  });

  it("subtracts a contained clear block pad from an existing copper zone", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.5*%",
      "G36*", "X-020000Y-020000D02*", "X020000Y-020000D01*", "X020000Y020000D01*", "X-020000Y020000D01*", "X-020000Y-020000D01*", "G37*",
      "%ABD12*%", "D10*", "X000000Y000000D03*", "%AB*%",
      "%LPC*%", "D12*", "X000000Y000000D03*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.zones.length).toBeGreaterThan(0);
    expect(result.zones.some((zone) => (zone.boundary.holes || []).length > 0)).toBe(true);
  });
});

describe("Gerber adaptive arc tessellation", () => {
  it("uses more points for a large-radius arc to preserve geometric accuracy", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.2*%", "G75*", "G03*",
      "X100000Y000000D02*", "X000000Y100000I-100000J000000D01*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].points.length).toBeGreaterThan(10);
    expect(result.tracks[0].points[0].x).toBeCloseTo(10, 3);
    expect(result.tracks[0].points[result.tracks[0].points.length - 1].y).toBeCloseTo(10, 3);
  });

  it("keeps full-circle arcs bounded when start and end points match", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.2*%", "G75*", "G02*",
      "X100000Y000000D02*", "X100000Y000000I-100000J000000D01*", "M02*",
    ].join("\n");
    const result = parseGerberFile(gerber, "top_copper");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].points.length).toBeGreaterThan(20);
    expect(result.tracks[0].points.length).toBeLessThanOrEqual(721);
    expect(result.tracks[0].points[result.tracks[0].points.length - 1].x).toBeCloseTo(10, 3);
  });
});


describe("Gerber malformed block recursion", () => {
  it("bounds cyclic aperture-block references instead of recursing forever", () => {
    const gerber = [
      "%MOMM*%", "%FSLAX24Y24*%", "%ADD10C,0.4*%",
      "%ABD11*%", "D12*", "X000000Y000000D03*", "%AB*%",
      "%ABD12*%", "D11*", "X000000Y000000D03*", "%AB*%",
      "D11*", "X010000Y010000D03*", "M02*",
    ].join("\n");
    expect(() => parseGerberFile(gerber, "top_copper")).not.toThrow();
  });
});

describe("assignDrillsToPads", () => {
  it("attaches drill hits to the pads they pass through and keeps unmatched hits as vias", async () => {
    const { assignDrillsToPads } = await import("./importGerber");
    const pads: any[] = [
      { id: "t", x: 10, y: 10, width: 2, height: 2, shape: "circle", layer: "top_copper" },
      { id: "b", x: 10.01, y: 10, width: 2, height: 2, shape: "circle", layer: "bottom_copper" },
    ];
    const drills: any[] = [
      { id: "d1", x: 10.013, y: 10.01, drill: 0.8, diameter: 1.2 },
      { id: "d2", x: 30, y: 30, drill: 0.6, diameter: 1.0 },
    ];
    const rest = assignDrillsToPads(pads, drills);
    expect(pads[0].drill).toBe(0.8);
    expect(pads[1].drill).toBe(0.8);
    expect(rest.map((v) => v.id)).toEqual(["d2"]);
  });
});
