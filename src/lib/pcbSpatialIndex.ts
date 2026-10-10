import RBush from "rbush";
import {
  PcbDoc,
  PcbTrack,
  PcbVia,
  PcbPad,
  PcbFootprint,
  PcbZone,
  PcbText,
  PcbMeasure,
  PcbDimension,
  PcbTarget,
  PcbLayerId,
} from "./pcb";
import { getTrackArcGeometry } from "./arcGeometry";
import { getZoneBoundingBox, isPointInPolygon, isPointInZone } from "./zoneGeometry";
import { footprintBBox } from "./pcbSync";

export type SpatialItemType =
  | "track"
  | "via"
  | "pad"
  | "footprint"
  | "zone"
  | "text"
  | "measure"
  | "dimension"
  | "target"
  | "graphic";

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  type: SpatialItemType;
  id: string;
  layer?: PcbLayerId | string;
  netId?: number;
  refData: any;
}

/**
 * Local Math API for Sub-level Pad Hit Testing inside a Footprint.
 * Handles footprint position (x, y), rotation, and layer mirroring (isFlipped).
 */
export function hitTestFootprintPad(
  fp: PcbFootprint,
  worldX: number,
  worldY: number,
  toleranceMm: number = 0.5
): { pad: PcbPad; distance: number; localPoint: { x: number; y: number } } | null {
  if (!fp || !fp.pads || fp.pads.length === 0) return null;

  const isFlipped = fp.layer === "bottom_copper" || fp.layer === "B.Cu" || fp.flipped === true;
  const flipX = isFlipped ? -1 : 1;
  const rad = (-fp.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = worldX - fp.x;
  const dy = worldY - fp.y;

  // Transform world point to unrotated local footprint space (with X flip if bottom layer)
  const localX = (dx * cos - dy * sin) * flipX;
  const localY = dx * sin + dy * cos;

  let bestPad: PcbPad | null = null;
  let minDistance = Infinity;

  for (const pad of fp.pads) {
    if (!pad) continue;
    const w = Math.max(0.3, pad.width || pad.size?.x || 1.0);
    const h = Math.max(0.3, pad.height || pad.size?.y || 1.0);
    const halfW = w / 2 + toleranceMm;
    const halfH = h / 2 + toleranceMm;

    const pdx = Math.abs(localX - pad.x);
    const pdy = Math.abs(localY - pad.y);

    if (pdx <= halfW && pdy <= halfH) {
      const dist = Math.hypot(localX - pad.x, localY - pad.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestPad = pad;
      }
    }
  }

  return bestPad ? { pad: bestPad, distance: minDistance, localPoint: { x: localX, y: localY } } : null;
}

// Distance from point (px, py) to line segment (x1, y1)-(x2, y2)
export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { dist: number; t: number; projX: number; projY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    const d = Math.hypot(px - x1, py - y1);
    return { dist: d, t: 0, projX: x1, projY: y1 };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dist = Math.hypot(px - projX, py - projY);
  return { dist, t, projX, projY };
}

// Distance from point to circular arc
export function distToArc(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweepAngle: number
): number {
  const dx = px - cx;
  const dy = py - cy;
  const angle = Math.atan2(dy, dx);
  let relAngle = angle - startAngle;
  // Normalize into [-PI, PI]
  while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
  while (relAngle > Math.PI) relAngle -= 2 * Math.PI;

  const minA = Math.min(0, sweepAngle);
  const maxA = Math.max(0, sweepAngle);

  if (relAngle >= minA && relAngle <= maxA) {
    // Within arc sweep
    const distToCenter = Math.hypot(dx, dy);
    return Math.abs(distToCenter - radius);
  }

  // Check endpoints
  const p0x = cx + radius * Math.cos(startAngle);
  const p0y = cy + radius * Math.sin(startAngle);
  const p1x = cx + radius * Math.cos(startAngle + sweepAngle);
  const p1y = cy + radius * Math.sin(startAngle + sweepAngle);
  const d0 = Math.hypot(px - p0x, py - p0y);
  const d1 = Math.hypot(px - p1x, py - p1y);
  return Math.min(d0, d1);
}

export class PcbSpatialIndex {
  private tree: RBush<SpatialItem>;
  private itemMap: Map<string, SpatialItem>;

  constructor() {
    this.tree = new RBush<SpatialItem>(16);
    this.itemMap = new Map();
  }

  public clear() {
    this.tree.clear();
    this.itemMap.clear();
  }

  // Build the complete R-Tree index from a PCB document
  public buildIndex(pcb: PcbDoc): void {
    this.clear();
    const items: SpatialItem[] = [];

    // 1. Index Tracks & Arcs
    (pcb.tracks || []).forEach((tr) => {
      if (!tr) return;
      const halfW = Math.max(0.2, (tr.width || 0.4) / 2);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      const arc = getTrackArcGeometry(tr);
      if (arc) {
        minX = arc.center.x - arc.radius - halfW;
        maxX = arc.center.x + arc.radius + halfW;
        minY = arc.center.y - arc.radius - halfW;
        maxY = arc.center.y + arc.radius + halfW;
      } else if (tr.points && tr.points.length > 0) {
        tr.points.forEach((p) => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
        minX -= halfW;
        maxX += halfW;
        minY -= halfW;
        maxY += halfW;
      } else if (tr.start && tr.end) {
        minX = Math.min(tr.start.x, tr.end.x) - halfW;
        maxX = Math.max(tr.start.x, tr.end.x) + halfW;
        minY = Math.min(tr.start.y, tr.end.y) - halfW;
        maxY = Math.max(tr.start.y, tr.end.y) + halfW;
      }

      if (minX !== Infinity) {
        const item: SpatialItem = {
          minX,
          minY,
          maxX,
          maxY,
          type: "track",
          id: tr.id,
          layer: tr.layer,
          netId: tr.netId,
          refData: tr,
        };
        items.push(item);
        this.itemMap.set(`track:${tr.id}`, item);
      }
    });

    // 2. Index Vias
    (pcb.vias || []).forEach((v) => {
      if (!v || typeof v.x !== "number" || typeof v.y !== "number") return;
      const r = Math.max(0.3, (v.diameter || 0.8) / 2);
      const item: SpatialItem = {
        minX: v.x - r,
        minY: v.y - r,
        maxX: v.x + r,
        maxY: v.y + r,
        type: "via",
        id: v.id,
        layer: "multi_layer",
        netId: v.netId,
        refData: v,
      };
      items.push(item);
      this.itemMap.set(`via:${v.id}`, item);
    });

    // 3. Index Standalone & Footprint Pads
    const indexPad = (p: PcbPad, footprintId?: string) => {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      const w = Math.max(0.3, p.width || p.size?.x || 1.0);
      const h = Math.max(0.3, p.height || p.size?.y || 1.0);
      const halfMax = Math.max(w, h) / 2;
      const item: SpatialItem = {
        minX: p.x - halfMax,
        minY: p.y - halfMax,
        maxX: p.x + halfMax,
        maxY: p.y + halfMax,
        type: "pad",
        id: p.id,
        layer: p.layer || "multi_layer",
        netId: p.netId,
        refData: { ...p, footprintId },
      };
      items.push(item);
      this.itemMap.set(`pad:${p.id}`, item);
    };

    (pcb.pads || []).forEach((p) => indexPad(p));

    // 4. Index Footprints and their embedded pads/shapes
    (pcb.footprints || []).forEach((fp) => {
      if (!fp || typeof fp.x !== "number" || typeof fp.y !== "number") return;
      const bb = footprintBBox(fp);
      const item: SpatialItem = {
        minX: bb.x,
        minY: bb.y,
        maxX: bb.x + bb.w,
        maxY: bb.y + bb.h,
        type: "footprint",
        id: fp.id,
        layer: fp.layer || "top_copper",
        refData: fp,
      };
      items.push(item);
      this.itemMap.set(`footprint:${fp.id}`, item);

      // Index embedded pads as sub-level items tagged with footprintId in world coordinates
      if (fp.pads && fp.pads.length > 0) {
        const rad = ((fp.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const isFlipped = fp.layer === "bottom_copper" || fp.layer === "B.Cu" || (fp as any).flipped === true || (fp as any).isFlippedBottom === true;
        const flipX = isFlipped ? -1 : 1;
        fp.pads.forEach((p, pIdx) => {
          if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
          const lx = p.x * flipX;
          const ly = p.y;
          const worldX = fp.x + (lx * cos - ly * sin);
          const worldY = fp.y + (lx * sin + ly * cos);
          const w = Math.max(0.3, p.width || p.size?.x || 1.0);
          const h = Math.max(0.3, p.height || p.size?.y || 1.0);
          const halfMax = Math.max(w, h) / 2;
          const padId = p.id || `${fp.id}-pad-${p.pinIndex ?? pIdx}`;
          const padItem: SpatialItem = {
            minX: worldX - halfMax,
            minY: worldY - halfMax,
            maxX: worldX + halfMax,
            maxY: worldY + halfMax,
            type: "pad",
            id: padId,
            layer: p.layer || "multi_layer",
            netId: p.netId,
            refData: {
              ...p,
              id: padId,
              footprintId: fp.id,
              localX: p.x,
              localY: p.y,
              worldX,
              worldY,
            },
          };
          items.push(padItem);
          this.itemMap.set(`pad:${padId}`, padItem);
        });
      }
    });

    // 5. Index Zones / Copper Pours
    (pcb.zones || []).forEach((z) => {
      if (!z) return;
      const bbox = getZoneBoundingBox(z);
      const item: SpatialItem = {
        minX: bbox.minX,
        minY: bbox.minY,
        maxX: bbox.maxX,
        maxY: bbox.maxY,
        type: "zone",
        id: z.id,
        layer: z.layer,
        netId: z.netId,
        refData: z,
      };
      items.push(item);
      this.itemMap.set(`zone:${z.id}`, item);
    });

    // 6. Index Texts
    (pcb.texts || []).forEach((t) => {
      if (!t || typeof t.x !== "number" || typeof t.y !== "number") return;
      const len = (t.text || "").length;
      const size = t.size || 1.5;
      const w = Math.max(size, len * size * 0.6);
      const h = size;
      const item: SpatialItem = {
        minX: t.x - w / 2,
        minY: t.y - h / 2,
        maxX: t.x + w / 2,
        maxY: t.y + h / 2,
        type: "text",
        id: t.id,
        layer: t.layer,
        refData: t,
      };
      items.push(item);
      this.itemMap.set(`text:${t.id}`, item);
    });

    // 7. Index Measures
    (pcb.measures || []).forEach((m) => {
      if (!m || !m.a || !m.b || typeof m.a.x !== "number" || typeof m.b.x !== "number") return;
      const minX = Math.min(m.a.x, m.b.x) - 1.0;
      const maxX = Math.max(m.a.x, m.b.x) + 1.0;
      const minY = Math.min(m.a.y, m.b.y) - 1.0;
      const maxY = Math.max(m.a.y, m.b.y) + 1.0;
      const item: SpatialItem = {
        minX,
        minY,
        maxX,
        maxY,
        type: "measure",
        id: m.id,
        refData: m,
      };
      items.push(item);
      this.itemMap.set(`measure:${m.id}`, item);
    });

    // 8. Index Dimensions
    (pcb.dimensions || []).forEach((d) => {
      if (!d || !d.start || !d.end || typeof d.start.x !== "number" || typeof d.end.x !== "number") return;
      const minX = Math.min(d.start.x, d.end.x) - 1.0;
      const maxX = Math.max(d.start.x, d.end.x) + 1.0;
      const minY = Math.min(d.start.y, d.end.y) - 1.0;
      const maxY = Math.max(d.start.y, d.end.y) + 1.0;
      const item: SpatialItem = {
        minX,
        minY,
        maxX,
        maxY,
        type: "dimension",
        id: d.id,
        layer: d.layer,
        refData: d,
      };
      items.push(item);
      this.itemMap.set(`dimension:${d.id}`, item);
    });

    // 9. Index Optical Targets
    (pcb.targets || []).forEach((tg) => {
      if (!tg || typeof tg.x !== "number" || typeof tg.y !== "number") return;
      const r = Math.max(1.0, (tg.diameter || 3.0) / 2);
      const item: SpatialItem = {
        minX: tg.x - r,
        minY: tg.y - r,
        maxX: tg.x + r,
        maxY: tg.y + r,
        type: "target",
        id: tg.id,
        layer: tg.layer,
        refData: tg,
      };
      items.push(item);
      this.itemMap.set(`target:${tg.id}`, item);
    });

    // 10. Index Graphics
    (pcb.graphics || []).forEach((g) => {
      if (!g || !g.start || !g.end || typeof g.start.x !== "number" || typeof g.end.x !== "number") return;
      const minX = Math.min(g.start.x, g.end.x) - 0.5;
      const maxX = Math.max(g.start.x, g.end.x) + 0.5;
      const minY = Math.min(g.start.y, g.end.y) - 0.5;
      const maxY = Math.max(g.start.y, g.end.y) + 0.5;
      const item: SpatialItem = {
        minX,
        minY,
        maxX,
        maxY,
        type: "graphic",
        id: g.id,
        layer: g.layer,
        refData: g,
      };
      items.push(item);
      this.itemMap.set(`graphic:${g.id}`, item);
    });

    // Load bulk items into RBush R-Tree for maximum O(N log N) initialization speed
    if (items.length > 0) {
      this.tree.load(items);
    }
  }

  // Fast Bounding Box Window Search
  public searchBox(box: { minX: number; minY: number; maxX: number; maxY: number }): SpatialItem[] {
    return this.tree.search(box);
  }

  // Mode-Aware & Hierarchical Hit Testing at point (x, y)
  public hitTest(
    x: number,
    y: number,
    options: {
      mode?: "select" | "route";
      toleranceMm?: number;
      activeLayer?: PcbLayerId;
      visibleLayerIds?: Set<string>;
      filterTypes?: SpatialItemType[];
    } = {}
  ): {
    item: SpatialItem | null;
    distance: number;
    hitPoint: { x: number; y: number };
  } {
    const tolerance = options.toleranceMm !== undefined ? options.toleranceMm : 0.8;
    const mode = options.mode || "select";
    const queryBox = {
      minX: x - tolerance,
      minY: y - tolerance,
      maxX: x + tolerance,
      maxY: y + tolerance,
    };

    const candidates = this.tree.search(queryBox);
    if (candidates.length === 0) {
      return { item: null, distance: Infinity, hitPoint: { x, y } };
    }

    let bestItem: SpatialItem | null = null;
    let minDistance = Infinity;
    let bestHitPoint = { x, y };

    for (const candidate of candidates) {
      // Filter by visible layers
      if (
        options.visibleLayerIds &&
        candidate.layer &&
        candidate.layer !== "multi_layer" &&
        !options.visibleLayerIds.has(candidate.layer)
      ) {
        continue;
      }

      // Filter by type if requested
      if (options.filterTypes && !options.filterTypes.includes(candidate.type)) {
        continue;
      }

      // In "select" mode, embedded pads inside a footprint belong to the Footprint component entity.
      // Top-level footprint selection takes precedence over individual component pads unless a track or via is clicked.

      let d = Infinity;
      let hitPt = { x, y };

      if (candidate.type === "via") {
        const v = candidate.refData as PcbVia;
        d = Math.max(0, Math.hypot(x - v.x, y - v.y) - (v.diameter || 0.8) / 2);
        hitPt = { x: v.x, y: v.y };
      } else if (candidate.type === "pad") {
        const p = candidate.refData as any;
        const padX = typeof p.worldX === "number" ? p.worldX : p.x;
        const padY = typeof p.worldY === "number" ? p.worldY : p.y;
        const halfW = (p.width || p.size?.x || 1.0) / 2;
        const halfH = (p.height || p.size?.y || 1.0) / 2;
        let dx = Math.abs(x - padX);
        let dy = Math.abs(y - padY);
        const rot = typeof p.rotation === "number" ? p.rotation : 0;
        if (rot !== 0) {
          const rad = (-rot * Math.PI) / 180;
          const c = Math.cos(rad), s = Math.sin(rad);
          const lx = (x - padX) * c - (y - padY) * s;
          const ly = (x - padX) * s + (y - padY) * c;
          dx = Math.abs(lx);
          dy = Math.abs(ly);
        }
        d = Math.max(0, Math.max(dx - halfW, dy - halfH));
        hitPt = { x: padX, y: padY };
      } else if (candidate.type === "track") {
        const tr = candidate.refData as PcbTrack;
        const halfW = (tr.width || 0.4) / 2;
        const arc = getTrackArcGeometry(tr);
        if (arc) {
          const distArc = distToArc(x, y, arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.sweepAngle);
          d = Math.max(0, distArc - halfW);
        } else if (tr.points && tr.points.length >= 2) {
          let segMinD = Infinity;
          for (let i = 0; i < tr.points.length - 1; i++) {
            const p0 = tr.points[i];
            const p1 = tr.points[i + 1];
            const res = distToSegment(x, y, p0.x, p0.y, p1.x, p1.y);
            if (res.dist < segMinD) {
              segMinD = res.dist;
              hitPt = { x: res.projX, y: res.projY };
            }
          }
          d = Math.max(0, segMinD - halfW);
        } else if (tr.start && tr.end) {
          const res = distToSegment(x, y, tr.start.x, tr.start.y, tr.end.x, tr.end.y);
          d = Math.max(0, res.dist - halfW);
          hitPt = { x: res.projX, y: res.projY };
        }
      } else if (candidate.type === "text") {
        const t = candidate.refData as PcbText;
        d = Math.max(0, Math.hypot(x - t.x, y - t.y) - (t.size || 1.5) * 0.5);
        hitPt = { x: t.x, y: t.y };
      } else if (candidate.type === "footprint") {
        const fp = candidate.refData as PcbFootprint;
        // Check if cursor hits any pad inside this footprint directly
        let minPadDist = Infinity;
        if (fp.pads && fp.pads.length > 0) {
          const rad = ((fp.rotation || 0) * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const isFlipped = fp.layer === "bottom_copper" || fp.layer === "B.Cu" || (fp as any).flipped === true || (fp as any).isFlippedBottom === true;
          const flipX = isFlipped ? -1 : 1;
          for (const p of fp.pads) {
            if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
            const lx = p.x * flipX;
            const ly = p.y;
            const wx = fp.x + (lx * cos - ly * sin);
            const wy = fp.y + (lx * sin + ly * cos);
            const halfW = (p.width || p.size?.x || 1.0) / 2;
            const halfH = (p.height || p.size?.y || 1.0) / 2;
            const pdx = Math.max(0, Math.abs(x - wx) - halfW);
            const pdy = Math.max(0, Math.abs(y - wy) - halfH);
            const pDist = Math.hypot(pdx, pdy);
            if (pDist < minPadDist) minPadDist = pDist;
          }
        }

        const insideX = x >= candidate.minX && x <= candidate.maxX;
        const insideY = y >= candidate.minY && y <= candidate.maxY;

        if (minPadDist <= 0.05) {
          // Direct hit on footprint pad
          d = 0;
        } else if (insideX && insideY) {
          // Inside footprint bounding box: baseline offset so direct hits on tracks/vias take precedence
          d = Math.min(minPadDist, 0.35 + Math.hypot(x - fp.x, y - fp.y) * 0.01);
        } else {
          const dx = Math.max(candidate.minX - x, 0, x - candidate.maxX);
          const dy = Math.max(candidate.minY - y, 0, y - candidate.maxY);
          d = Math.max(minPadDist, Math.hypot(dx, dy));
        }
        hitPt = { x: fp.x, y: fp.y };
      } else if (candidate.type === "zone") {
        const z = candidate.refData as PcbZone;
        if (!z) continue;
        const inPoly = isPointInZone({ x, y }, z);
        if (inPoly) {
          // Zones have high baseline distance in select mode so they do not shadow tracks/pads
          d = mode === "select" ? 0.7 : 0;
          hitPt = { x, y };
        } else {
          // Distance to polygon perimeter
          let minDistToEdge = Infinity;
          const pts = z.boundary?.pts || [];
          if (pts.length >= 2) {
            for (let i = 0; i < pts.length; i++) {
              const p0 = pts[i];
              const p1 = pts[(i + 1) % pts.length];
              if (!p0 || !p1) continue;
              const res = distToSegment(x, y, p0.x, p0.y, p1.x, p1.y);
              if (res.dist < minDistToEdge) minDistToEdge = res.dist;
            }
          }
          d = minDistToEdge + (mode === "select" ? 0.7 : 0);
          hitPt = { x, y };
        }
      } else if (candidate.type === "measure") {
        const m = candidate.refData as PcbMeasure;
        if (m && m.a && m.b) {
          const res = distToSegment(x, y, m.a.x, m.a.y, m.b.x, m.b.y);
          d = res.dist;
          hitPt = { x: res.projX, y: res.projY };
        }
      } else if (candidate.type === "dimension") {
        const dim = candidate.refData as PcbDimension;
        if (dim && Array.isArray(dim.points) && dim.points.length >= 2 && dim.points[0] && dim.points[1]) {
          const res = distToSegment(x, y, dim.points[0].x, dim.points[0].y, dim.points[1].x, dim.points[1].y);
          d = res.dist;
          hitPt = { x: res.projX, y: res.projY };
        }
      } else if (candidate.type === "target") {
        const tg = candidate.refData as PcbTarget;
        if (tg && typeof tg.x === "number" && typeof tg.y === "number") {
          d = Math.max(0, Math.hypot(x - tg.x, y - tg.y) - (tg.diameter || 3.0) / 2);
          hitPt = { x: tg.x, y: tg.y };
        }
      }

      if (d <= tolerance) {
        // Preference score for active layer elements
        const isActiveLayer = options.activeLayer && (
          candidate.layer === options.activeLayer ||
          candidate.layer === "multi_layer" ||
          candidate.type === "via"
        );
        const layerPenalty = isActiveLayer ? 0 : 0.15;

        // Type priority per mode:
        // In "route" mode: via (0) > pad (1) > track (2) > text (3) > footprint (4) > zone (5)
        // In "select" mode: via (0) > track (1) > pad (1) > footprint (2) > text (3) > graphic (4) > zone (5)
        let typePriority = 2;
        if (mode === "route") {
          typePriority =
            candidate.type === "via"
              ? 0
              : candidate.type === "pad"
              ? 1
              : candidate.type === "track"
              ? 2
              : candidate.type === "text"
              ? 3
              : candidate.type === "footprint"
              ? 4
              : 5;
        } else {
          typePriority =
            candidate.type === "via"
              ? 0
              : candidate.type === "track"
              ? 1
              : candidate.type === "pad"
              ? 1
              : candidate.type === "footprint"
              ? 2
              : candidate.type === "text"
              ? 3
              : candidate.type === "graphic"
              ? 4
              : 5; // zone
        }

        const score = d + layerPenalty + typePriority * 0.03;

        if (score < minDistance) {
          minDistance = score;
          bestItem = candidate;
          bestHitPoint = hitPt;
        }
      }
    }

    return {
      item: bestItem,
      distance: minDistance,
      hitPoint: bestHitPoint,
    };
  }
}

// Global Singleton or Hook instance helper
export const globalPcbSpatialIndex = new PcbSpatialIndex();
