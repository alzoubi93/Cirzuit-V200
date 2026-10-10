import type { KicadFootprintPad, KicadFootprintGraphic, KicadFootprintRect, KicadFootprintCircle } from "../../footprint";
import { KLC_RULES, roundToGrid } from "../rules/klc";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Compute the bounding box of a collection of pads and graphics */
export function computeEnvelope(
  pads: KicadFootprintPad[],
  graphics: KicadFootprintGraphic[] = []
): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pad of pads) {
    const px = Number.isFinite((pad as any).position?.x) ? (pad as any).position.x : Number.isFinite((pad as any).x) ? (pad as any).x : 0;
    const py = Number.isFinite((pad as any).position?.y) ? (pad as any).position.y : Number.isFinite((pad as any).y) ? (pad as any).y : 0;
    const sx = Number.isFinite((pad as any).size?.x)
      ? (pad as any).size.x
      : Number.isFinite((pad as any).size?.width)
      ? (pad as any).size.width
      : Number.isFinite((pad as any).width)
      ? (pad as any).width
      : 1.2;
    const sy = Number.isFinite((pad as any).size?.y)
      ? (pad as any).size.y
      : Number.isFinite((pad as any).size?.height)
      ? (pad as any).size.height
      : Number.isFinite((pad as any).height)
      ? (pad as any).height
      : 1.2;

    const hw = sx / 2;
    const hh = sy / 2;
    minX = Math.min(minX, px - hw);
    maxX = Math.max(maxX, px + hw);
    minY = Math.min(minY, py - hh);
    maxY = Math.max(maxY, py + hh);
  }

  for (const g of graphics) {
    // Only consider F.SilkS and F.Fab for courtyard envelope (ignore F.CrtYd or texts)
    if (g.layer !== "F.SilkS" && g.layer !== "F.Fab") continue;
    if (g.kind === "line") {
      minX = Math.min(minX, g.start.x, g.end.x);
      maxX = Math.max(maxX, g.start.x, g.end.x);
      minY = Math.min(minY, g.start.y, g.end.y);
      maxY = Math.max(maxY, g.start.y, g.end.y);
    } else if (g.kind === "circle") {
      const r = Math.hypot(g.end.x - g.center.x, g.end.y - g.center.y);
      minX = Math.min(minX, g.center.x - r);
      maxX = Math.max(maxX, g.center.x + r);
      minY = Math.min(minY, g.center.y - r);
      maxY = Math.max(maxY, g.center.y + r);
    } else if (g.kind === "poly") {
      for (const pt of g.points) {
        minX = Math.min(minX, pt.x);
        maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      }
    } else if (g.kind === "arc") {
      minX = Math.min(minX, g.start.x, g.end.x);
      maxX = Math.max(maxX, g.start.x, g.end.x);
      minY = Math.min(minY, g.start.y, g.end.y);
      maxY = Math.max(maxY, g.start.y, g.end.y);
      if (g.mid) {
        minX = Math.min(minX, g.mid.x);
        maxX = Math.max(maxX, g.mid.x);
        minY = Math.min(minY, g.mid.y);
        maxY = Math.max(maxY, g.mid.y);
      }
    } else if (g.kind === "rect") {
      minX = Math.min(minX, g.start.x, g.end.x);
      maxX = Math.max(maxX, g.start.x, g.end.x);
      minY = Math.min(minY, g.start.y, g.end.y);
      maxY = Math.max(maxY, g.start.y, g.end.y);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -2;
    maxX = 2;
    minY = -2;
    maxY = 2;
  }

  return { minX, minY, maxX, maxY };
}

/** Create standard rectangular courtyard around pads and graphics */
export function createCourtyardRect(
  pads: KicadFootprintPad[],
  graphics: KicadFootprintGraphic[] = [],
  clearance: number = KLC_RULES.clearance.courtyardSmd
): KicadFootprintRect {
  const env = computeEnvelope(pads, graphics);
  const minX = roundToGrid(env.minX - clearance);
  const maxX = roundToGrid(env.maxX + clearance);
  const minY = roundToGrid(env.minY - clearance);
  const maxY = roundToGrid(env.maxY + clearance);

  return {
    kind: "rect",
    layer: KLC_RULES.layers.courtyard,
    start: { x: minX, y: minY },
    end: { x: maxX, y: maxY },
    stroke: { width: KLC_RULES.strokeWidth.courtyard },
  };
}

/** Create standard circular courtyard (for radial electrolytic caps, circular transistors, etc.) */
export function createCourtyardCircle(
  cx: number,
  cy: number,
  radius: number,
  clearance: number = KLC_RULES.clearance.courtyardTht
): KicadFootprintCircle {
  const totalR = roundToGrid(radius + clearance);
  return {
    kind: "circle",
    layer: KLC_RULES.layers.courtyard,
    center: { x: cx, y: cy },
    end: { x: cx + totalR, y: cy },
    stroke: { width: KLC_RULES.strokeWidth.courtyard },
  };
}
