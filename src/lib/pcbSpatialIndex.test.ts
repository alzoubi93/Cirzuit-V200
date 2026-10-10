import { describe, expect, it } from "vitest";
import { PcbSpatialIndex } from "./pcbSpatialIndex";
import { emptyPcbDoc, PcbDoc } from "./pcb";

describe("PcbSpatialIndex", () => {
  it("indexes footprint pads at world coordinates and hits pad center in route mode", () => {
    const pcb: PcbDoc = {
      ...emptyPcbDoc(),
      footprints: [
        {
          id: "r1",
          reference: "R1",
          footprint: "Resistor_THT",
          x: 20,
          y: 30,
          rotation: 0,
          pads: [
            { pinIndex: 0, number: "1", name: "1", x: -3.81, y: 0, width: 1.8, height: 1.8, shape: "circle", layer: "multi_layer", netId: 0, netName: "N1" },
            { pinIndex: 1, number: "2", name: "2", x: 3.81, y: 0, width: 1.8, height: 1.8, shape: "circle", layer: "multi_layer", netId: 1, netName: "N2" },
          ],
        },
      ],
    };

    const index = new PcbSpatialIndex();
    index.buildIndex(pcb);

    // Pin 1 is at world coordinate: (20 - 3.81, 30) = (16.19, 30)
    // Pin 2 is at world coordinate: (20 + 3.81, 30) = (23.81, 30)

    // Test clicking near pin 1
    const hit1 = index.hitTest(16.19, 30, { mode: "route" });
    expect(hit1.item).toBeDefined();
    expect(hit1.item?.type).toBe("pad");
    expect(hit1.item?.refData?.footprintId).toBe("r1");
    expect(hit1.item?.refData?.pinIndex).toBe(0);
    expect(hit1.hitPoint.x).toBeCloseTo(16.19, 2);
    expect(hit1.hitPoint.y).toBeCloseTo(30, 2);

    // Test clicking near pin 2
    const hit2 = index.hitTest(23.81, 30, { mode: "route" });
    expect(hit2.item).toBeDefined();
    expect(hit2.item?.type).toBe("pad");
    expect(hit2.item?.refData?.footprintId).toBe("r1");
    expect(hit2.item?.refData?.pinIndex).toBe(1);
    expect(hit2.hitPoint.x).toBeCloseTo(23.81, 2);
    expect(hit2.hitPoint.y).toBeCloseTo(30, 2);

    // Test with rotation 90 degrees:
    // Pin 1: local (-3.81, 0) rotated 90 deg -> (0, -3.81) -> world (20, 26.19)
    // Pin 2: local (3.81, 0) rotated 90 deg -> (0, 3.81) -> world (20, 33.81)
    pcb.footprints[0].rotation = 90;
    index.buildIndex(pcb);

    const hitRot1 = index.hitTest(20, 26.19, { mode: "route" });
    expect(hitRot1.item?.type).toBe("pad");
    expect(hitRot1.item?.refData?.pinIndex).toBe(0);
    expect(hitRot1.hitPoint.x).toBeCloseTo(20, 2);
    expect(hitRot1.hitPoint.y).toBeCloseTo(26.19, 2);

    const hitRot2 = index.hitTest(20, 33.81, { mode: "route" });
    expect(hitRot2.item?.type).toBe("pad");
    expect(hitRot2.item?.refData?.pinIndex).toBe(1);
    expect(hitRot2.hitPoint.x).toBeCloseTo(20, 2);
    expect(hitRot2.hitPoint.y).toBeCloseTo(33.81, 2);
  });

  it("selects exact track when clicked without false-triggering nearby footprint bounding box", () => {
    const pcb: PcbDoc = {
      ...emptyPcbDoc(),
      footprints: [
        {
          id: "u1",
          reference: "U1",
          x: 50,
          y: 50,
          rotation: 0,
          layer: "top_copper",
          pads: [
            { pinIndex: 0, number: "1", name: "1", x: -5, y: -5, width: 1.5, height: 1.5, shape: "rect", layer: "top_copper" },
            { pinIndex: 1, number: "2", name: "2", x: 5, y: 5, width: 1.5, height: 1.5, shape: "rect", layer: "top_copper" },
          ],
        },
      ],
      tracks: [
        {
          id: "tr1",
          layer: "top_copper",
          width: 0.3,
          points: [
            { x: 42, y: 48 },
            { x: 48, y: 48 },
          ],
        },
      ],
    };

    const index = new PcbSpatialIndex();
    index.buildIndex(pcb);

    // Clicking directly on the track (x: 45, y: 48) inside the general area near U1
    const hit = index.hitTest(45, 48, { mode: "select", activeLayer: "top_copper" });
    expect(hit.item).toBeDefined();
    expect(hit.item?.type).toBe("track");
    expect(hit.item?.id).toBe("tr1");
  });

  it("prioritizes active layer track over overlapping inactive layer track", () => {
    const pcb: PcbDoc = {
      ...emptyPcbDoc(),
      tracks: [
        {
          id: "top-tr",
          layer: "top_copper",
          width: 0.4,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 10 },
          ],
        },
        {
          id: "bot-tr",
          layer: "bottom_copper",
          width: 0.4,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 10 },
          ],
        },
      ],
    };

    const index = new PcbSpatialIndex();
    index.buildIndex(pcb);

    // When top_copper is active, selecting at (15, 10) selects top-tr
    const hitTop = index.hitTest(15, 10, { mode: "select", activeLayer: "top_copper" });
    expect(hitTop.item?.id).toBe("top-tr");

    // When bottom_copper is active, selecting at (15, 10) selects bot-tr
    const hitBot = index.hitTest(15, 10, { mode: "select", activeLayer: "bottom_copper" });
    expect(hitBot.item?.id).toBe("bot-tr");
  });
});
