/**
 * PCB Footprint Scene Graph & Transformation Matrix Architecture
 * 
 * Implements a Parent-Child (Scene Graph) data structure for PCB Footprints:
 * - Parent: Footprint Entity holding its 2D Affine Transformation Matrix (X, Y, Rotation, Side/Flip).
 * - Children: Pads, Silkscreen Lines/Arcs/Polygons, Courtyard, and Fabrication outlines in local coordinate space.
 * 
 * Benefits:
 * - Moving or rotating a footprint on the CPU only updates a single 2D Affine Matrix (6 floats).
 * - The GPU Vertex Shader evaluates `world_pos = ParentMatrix * local_pos` per child vertex in parallel.
 * - Drastically reduces CPU heap allocations and per-frame compute during interactive drags & rotations.
 */

import { PcbFootprint, PcbFootprintPad, PcbLayerId, isCopperLayer, getCopperLayerStandardColor } from "./pcb";
import { KicadFootprintModel, KicadFootprintPad, KicadFootprintGraphic } from "./kicad/footprint/kicadFootprint";

/**
 * 2D Affine Matrix representing:
 * | a  c  tx |
 * | b  d  ty |
 * | 0  0   1 |
 * Stored as a 6-element tuple [a, b, c, d, tx, ty].
 * 
 * Matrix multiplication on a local point (lx, ly):
 * world_x = a * lx + c * ly + tx
 * world_y = b * lx + d * ly + ty
 */
export type AffineMatrix2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number
];

/** Identity affine matrix */
export const IDENTITY_MATRIX_2D: AffineMatrix2D = [1, 0, 0, 1, 0, 0];

/**
 * Checks whether a footprint is placed on the bottom layer
 */
export function isFootprintOnBottomLayer(fp: PcbFootprint): boolean {
  if (fp.isFlippedBottom === true || fp.isFlipped === true) return true;
  if (fp.side === "bottom") return true;
  if (fp.layer === "bottom_copper" || fp.layer === "B.Cu") return true;
  if (fp.nativeKicadFootprint?.layer === "B.Cu") return true;
  if (fp.pads && fp.pads.length > 0) {
    const hasBottom = fp.pads.some((p) => p.layer === "bottom_copper");
    const hasTop = fp.pads.some((p) => p.layer === "top_copper");
    if (hasBottom && !hasTop) return true;
  }
  return false;
}

/**
 * Layer Swapping Matrix / Table for Bottom Layer Mirroring & Flipping
 *
 * Maps top layer identifiers to their corresponding bottom layer identifiers and vice versa:
 * - Top Copper (F.Cu) <-> Bottom Copper (B.Cu)
 * - Top Silkscreen (F.SilkS) <-> Bottom Silkscreen (B.SilkS)
 * - Top Solder Mask (F.Mask) <-> Bottom Solder Mask (B.Mask)
 * - Top Paste (F.Paste) <-> Bottom Paste (B.Paste)
 * - Top Fabrication (F.Fab) <-> Bottom Fabrication (B.Fab)
 * - Multi-layer (*.Cu) remains Multi-layer
 */
export const LAYER_SWAP_MAP: Record<string, PcbLayerId> = {
  top_copper: "bottom_copper",
  bottom_copper: "top_copper",
  "F.Cu": "bottom_copper",
  "B.Cu": "top_copper",
  silkscreen: "bottom_silkscreen",
  bottom_silkscreen: "silkscreen",
  "F.SilkS": "bottom_silkscreen",
  "B.SilkS": "silkscreen",
  solder_mask: "bottom_solder_mask",
  bottom_solder_mask: "solder_mask",
  "F.Mask": "bottom_solder_mask",
  "B.Mask": "solder_mask",
  multi_layer: "multi_layer",
  "*.Cu": "multi_layer",
  outline: "outline",
};

export function getSwappedLayer(layer: string, isFlipped: boolean): PcbLayerId {
  if (!isFlipped) return (layer as PcbLayerId) || "top_copper";
  return LAYER_SWAP_MAP[layer] || (layer as PcbLayerId);
}

/**
 * Creates a 2D affine transformation matrix for a footprint given its position,
 * rotation in degrees, and side (top vs bottom layer flip).
 */
export function createFootprintAffineMatrix(
  x: number,
  y: number,
  rotationDeg: number,
  isFlippedBottom: boolean = false
): AffineMatrix2D {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // If flipped to the bottom copper side, mirror the local X axis
  const flipFactor = isFlippedBottom ? -1 : 1;

  const a = cos * flipFactor;
  const b = sin * flipFactor;
  const c = -sin;
  const d = cos;
  const tx = x;
  const ty = y;

  return [a, b, c, d, tx, ty];
}

/**
 * Multiplies an AffineMatrix2D by a 2D local point to get world coordinates on CPU if needed (e.g. for collision/DRC).
 */
export function applyAffineMatrix(mat: AffineMatrix2D, localX: number, localY: number): { x: number; y: number } {
  const lx = typeof localX === "number" && !isNaN(localX) ? localX : 0;
  const ly = typeof localY === "number" && !isNaN(localY) ? localY : 0;
  return {
    x: mat[0] * lx + mat[2] * ly + mat[4],
    y: mat[1] * lx + mat[3] * ly + mat[5],
  };
}

/**
 * Pad Shape identifier for WebGL SDF rendering
 */
export type FootprintPadShape = 
  | "rect" 
  | "circle" 
  | "roundrect" 
  | "oval" 
  | "chamfered_rect" 
  | "custom";

/**
 * Child Pad node in Footprint local space
 */
export interface FootprintChildPad {
  id: string;
  parentFootprintId: string;
  pinIndex: number;
  number?: string;
  name?: string;
  netId?: number;
  
  // Local coordinate space (relative to footprint origin, in mm)
  localX: number;
  localY: number;
  width: number;
  height: number;
  shape: FootprintPadShape;
  localRotationDeg: number;
  
  layer: "top_copper" | "bottom_copper" | "multi_layer";
  drill?: number;
  drillX?: number;
  drillY?: number;
  roundrectRatio?: number;
  chamferRatio?: number;
}

/**
 * Child Silkscreen or Graphic node in Footprint local space
 */
export interface FootprintChildGraphic {
  id: string;
  parentFootprintId: string;
  kind: "line" | "arc" | "circle" | "rect" | "poly";
  layer: PcbLayerId;
  strokeWidth: number;
  
  // Local coordinate space (relative to footprint origin, in mm)
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  sweepAngle?: number;
  points?: { x: number; y: number }[];
}

export interface GraphicLineSegment {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  strokeWidth: number;
  layer: PcbLayerId;
}

/**
 * Tessellates a circle into an array of line segments
 */
export function tessellateCircle(
  center: { x: number; y: number },
  radius: number,
  segments: number = 24
): { p0: { x: number; y: number }; p1: { x: number; y: number } }[] {
  const cX = center && typeof center.x === "number" ? center.x : 0;
  const cY = center && typeof center.y === "number" ? center.y : 0;
  const result: { p0: { x: number; y: number }; p1: { x: number; y: number } }[] = [];
  const segs = Math.max(8, segments);
  const step = (Math.PI * 2) / segs;
  for (let i = 0; i < segs; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    result.push({
      p0: { x: cX + radius * Math.cos(a0), y: cY + radius * Math.sin(a0) },
      p1: { x: cX + radius * Math.cos(a1), y: cY + radius * Math.sin(a1) },
    });
  }
  return result;
}

/**
 * Tessellates an arc into an array of line segments
 */
export function tessellateArc(
  center: { x: number; y: number },
  radius: number,
  startAngle: number,
  sweepAngle: number,
  segments: number = 16
): { p0: { x: number; y: number }; p1: { x: number; y: number } }[] {
  const cX = center && typeof center.x === "number" ? center.x : 0;
  const cY = center && typeof center.y === "number" ? center.y : 0;
  const result: { p0: { x: number; y: number }; p1: { x: number; y: number } }[] = [];
  const count = Math.max(4, Math.round(segments * (Math.abs(sweepAngle) / (Math.PI * 2))));
  const step = sweepAngle / count;
  for (let i = 0; i < count; i++) {
    const a0 = startAngle + i * step;
    const a1 = startAngle + (i + 1) * step;
    result.push({
      p0: { x: cX + radius * Math.cos(a0), y: cY + radius * Math.sin(a0) },
      p1: { x: cX + radius * Math.cos(a1), y: cY + radius * Math.sin(a1) },
    });
  }
  return result;
}

/**
 * Flattens any graphic primitive into line segments for GPU Instanced Line Rendering
 */
export function flattenGraphicToSegments(g: FootprintChildGraphic): GraphicLineSegment[] {
  if (!g) return [];
  const strokeW = g.strokeWidth || 0.15;
  const layer = g.layer;
  const p0 = { x: g.p0?.x ?? 0, y: g.p0?.y ?? 0 };
  const p1 = { x: g.p1?.x ?? 0, y: g.p1?.y ?? 0 };

  switch (g.kind) {
    case "line":
      return [{ p0, p1, strokeWidth: strokeW, layer }];

    case "rect": {
      const minX = Math.min(p0.x, p1.x);
      const maxX = Math.max(p0.x, p1.x);
      const minY = Math.min(p0.y, p1.y);
      const maxY = Math.max(p0.y, p1.y);
      return [
        { p0: { x: minX, y: minY }, p1: { x: maxX, y: minY }, strokeWidth: strokeW, layer },
        { p0: { x: maxX, y: minY }, p1: { x: maxX, y: maxY }, strokeWidth: strokeW, layer },
        { p0: { x: maxX, y: maxY }, p1: { x: minX, y: maxY }, strokeWidth: strokeW, layer },
        { p0: { x: minX, y: maxY }, p1: { x: minX, y: minY }, strokeWidth: strokeW, layer },
      ];
    }

    case "circle": {
      const c = g.center ? { x: g.center.x ?? 0, y: g.center.y ?? 0 } : p0;
      const r = g.radius || 1.0;
      return tessellateCircle(c, r, 20).map((s) => ({ ...s, strokeWidth: strokeW, layer }));
    }

    case "arc": {
      const c = g.center ? { x: g.center.x ?? 0, y: g.center.y ?? 0 } : p0;
      const r = g.radius || 1.0;
      const start = g.startAngle || 0;
      const sweep = g.sweepAngle || Math.PI / 2;
      return tessellateArc(c, r, start, sweep, 16).map((s) => ({ ...s, strokeWidth: strokeW, layer }));
    }

    case "poly": {
      if (!g.points || g.points.length < 2) return [];
      const segments: GraphicLineSegment[] = [];
      for (let i = 0; i < g.points.length; i++) {
        const pA = g.points[i] ? { x: g.points[i].x ?? 0, y: g.points[i].y ?? 0 } : { x: 0, y: 0 };
        const nextPt = g.points[(i + 1) % g.points.length];
        const pB = nextPt ? { x: nextPt.x ?? 0, y: nextPt.y ?? 0 } : { x: 0, y: 0 };
        segments.push({ p0: pA, p1: pB, strokeWidth: strokeW, layer });
      }
      return segments;
    }

    default:
      return [{ p0, p1, strokeWidth: strokeW, layer }];
  }
}

/**
 * Parent Footprint node in the Scene Graph
 */
export interface FootprintParentNode {
  id: string;
  reference?: string;
  value?: string;
  symbol: string;
  packageId?: string;
  
  // World Transform Matrix & state
  x: number;
  y: number;
  rotationDeg: number;
  isFlippedBottom: boolean;
  matrix: AffineMatrix2D;
  
  layer: "top_copper" | "bottom_copper";
  selected: boolean;
  highlighted: boolean;
  
  // Child primitive collections (static in local space)
  pads: FootprintChildPad[];
  silkscreenGraphics: FootprintChildGraphic[];
  fabGraphics: FootprintChildGraphic[];
  
  // Bounding box in local space for fast culling
  localBounds: { minX: number; minY: number; maxX: number; maxY: number };

  /**
   * What the child primitives were built from. When any of these changes (a different footprint is
   * assigned, pads are edited, nets are re-assigned ...) the node is rebuilt instead of keeping
   * stale pads / graphics.
   */
  source?: {
    pads: unknown;
    native: unknown;
    symbol: string;
    packageId?: string;
    value?: string;
  };
}

/**
 * PCB Footprint Scene Graph Manager
 * Maintains the hierarchical Parent-Child tree of all board footprints.
 */
export class FootprintSceneGraph {
  private parents: Map<string, FootprintParentNode> = new Map();
  private dirty: boolean = true;

  constructor() {
    // Initialized empty
  }

  /**
   * Clears the scene graph
   */
  public clear(): void {
    this.parents.clear();
    this.dirty = true;
  }

  /**
   * Rebuilds or syncs the scene graph from a list of PCB Footprints
   */
  public syncFromFootprints(
    footprints: PcbFootprint[],
    selectedId: string | null = null,
    groupSelectedFootprints: string[] = []
  ): void {
    if (!Array.isArray(footprints)) return;
    const activeIds = new Set<string>();

    for (const fp of footprints) {
      if (!fp || !fp.id) continue;
      activeIds.add(fp.id);
      const isSelected = fp.id === selectedId || groupSelectedFootprints.includes(fp.id);
      const isBottom = isFootprintOnBottomLayer(fp);
      const matrix = createFootprintAffineMatrix(fp.x, fp.y, fp.rotation || 0, isBottom);

      const existing = this.parents.get(fp.id);
      const src = existing?.source;
      const sourceUnchanged =
        !!src &&
        src.pads === fp.pads &&
        src.native === fp.nativeKicadFootprint &&
        src.symbol === fp.symbol &&
        src.packageId === fp.packageId &&
        // synthetic (non-KiCad) footprints derive their graphics from the value (e.g. polarity marks)
        (fp.nativeKicadFootprint ? true : src.value === fp.value);
      if (existing && existing.isFlippedBottom === isBottom && sourceUnchanged) {
        // Update Parent Transform Matrix & Selection State in O(1) CPU time!
        existing.x = fp.x;
        existing.y = fp.y;
        existing.rotationDeg = fp.rotation || 0;
        existing.isFlippedBottom = isBottom;
        existing.matrix = matrix;
        existing.selected = isSelected;
        existing.reference = fp.reference;
        existing.value = fp.value;
      } else {
        // Create or rebuild full parent node with its child primitives on layer flip
        const parentNode = this.createParentNode(fp, matrix, isBottom, isSelected);
        this.parents.set(fp.id, parentNode);
      }
    }

    // Remove deleted footprints
    for (const [id] of this.parents) {
      if (!activeIds.has(id)) {
        this.parents.delete(id);
      }
    }

    this.dirty = true;
  }

  /**
   * Updates a single footprint's transformation matrix directly on the CPU (e.g. during drag/rotation).
   * Takes O(1) time without rebuilding child geometries.
   */
  public updateParentTransform(
    id: string,
    x: number,
    y: number,
    rotationDeg: number,
    isFlippedBottom: boolean = false
  ): void {
    const parent = this.parents.get(id);
    if (!parent) return;

    parent.x = x;
    parent.y = y;
    parent.rotationDeg = rotationDeg;
    parent.isFlippedBottom = isFlippedBottom;
    parent.matrix = createFootprintAffineMatrix(x, y, rotationDeg, isFlippedBottom);
    this.dirty = true;
  }

  /**
   * Sets selection state on a parent footprint
   */
  public setParentSelected(id: string, selected: boolean): void {
    const parent = this.parents.get(id);
    if (parent) {
      parent.selected = selected;
      this.dirty = true;
    }
  }

  /**
   * Returns all parent footprint nodes
   */
  public getParents(): FootprintParentNode[] {
    return Array.from(this.parents.values());
  }

  /**
   * Returns a specific parent footprint node
   */
  public getParent(id: string): FootprintParentNode | undefined {
    return this.parents.get(id);
  }

  /**
   * Extracts and normalizes child pads and graphics into footprint local space
   */
  private createParentNode(
    fp: PcbFootprint,
    matrix: AffineMatrix2D,
    isFlippedBottom: boolean,
    selected: boolean
  ): FootprintParentNode {
    const pads: FootprintChildPad[] = [];
    const silkscreenGraphics: FootprintChildGraphic[] = [];
    const fabGraphics: FootprintChildGraphic[] = [];

    let minX = -1;
    let minY = -1;
    let maxX = 1;
    let maxY = 1;

    // 1. Process KiCad native footprint if available
    if (fp.nativeKicadFootprint) {
      const native = fp.nativeKicadFootprint;

      // Extract Native Pads
      if (Array.isArray(native.pads)) {
        native.pads.forEach((pad, idx) => {
          const padShape = mapNativePadShape(pad.shape);
          const isThruHole = pad.type === "thru_hole" || pad.type === "np_thru_hole" || (pad.drill !== undefined && pad.drill > 0);
          const rawPadLayer: PcbLayerId = (pad.layers?.includes("*.Cu") || isThruHole)
            ? "multi_layer" 
            : (pad.layers?.includes("B.Cu") && !pad.layers?.includes("F.Cu")) 
            ? "bottom_copper" 
            : "top_copper";
          const padLayer = getSwappedLayer(rawPadLayer, isFlippedBottom);
          
          const lx = pad.position?.x ?? 0;
          const ly = pad.position?.y ?? 0;
          const w = pad.size?.x ?? 1.5;
          const h = pad.size?.y ?? 1.5;

          minX = Math.min(minX, lx - w / 2);
          minY = Math.min(minY, ly - h / 2);
          maxX = Math.max(maxX, lx + w / 2);
          maxY = Math.max(maxY, ly + h / 2);

          pads.push({
            id: `${fp.id}_pad_${pad.number || idx}`,
            parentFootprintId: fp.id,
            pinIndex: idx,
            number: pad.number,
            name: pad.name,
            netId: fp.pads?.[idx]?.netId,
            localX: lx,
            localY: ly,
            width: w,
            height: h,
            shape: padShape,
            localRotationDeg: pad.rotation || 0,
            layer: padLayer,
            drill: pad.drill,
            drillX: pad.drillX,
            drillY: pad.drillY,
            roundrectRatio: pad.roundrectRatio,
            chamferRatio: pad.chamferRatio,
          });
        });
      }

      // Extract Native Silkscreen and Graphic Lines/Arcs
      if (Array.isArray(native.graphics)) {
        native.graphics.forEach((g, gIdx) => {
          const isSilk = g.layer?.includes("SilkS") || g.layer === "silkscreen";
          const isFab = g.layer?.includes("Fab") || g.layer?.includes("CrtYd");
          const targetLayer: PcbLayerId = isSilk 
            ? (isFlippedBottom ? "bottom_silkscreen" : "silkscreen") 
            : "outline";

          const strokeW = g.width || 0.15;

          if (g.type === "line" && g.start && g.end) {
            const childG: FootprintChildGraphic = {
              id: `${fp.id}_g_${gIdx}`,
              parentFootprintId: fp.id,
              kind: "line",
              layer: targetLayer,
              strokeWidth: strokeW,
              p0: { x: g.start.x, y: g.start.y },
              p1: { x: g.end.x, y: g.end.y },
            };
            if (isSilk) silkscreenGraphics.push(childG);
            else if (isFab) fabGraphics.push(childG);
          } else if (g.type === "arc" && g.start && g.end) {
            const childG: FootprintChildGraphic = {
              id: `${fp.id}_g_${gIdx}`,
              parentFootprintId: fp.id,
              kind: "arc",
              layer: targetLayer,
              strokeWidth: strokeW,
              p0: { x: g.start.x, y: g.start.y },
              p1: { x: g.end.x, y: g.end.y },
              center: g.center,
              radius: g.radius,
              startAngle: g.startAngle,
              sweepAngle: g.angle ? (g.angle * Math.PI) / 180 : Math.PI / 2,
            };
            if (isSilk) silkscreenGraphics.push(childG);
            else if (isFab) fabGraphics.push(childG);
          } else if (g.type === "circle" && g.center) {
            const childG: FootprintChildGraphic = {
              id: `${fp.id}_g_${gIdx}`,
              parentFootprintId: fp.id,
              kind: "circle",
              layer: targetLayer,
              strokeWidth: strokeW,
              p0: { x: g.center.x, y: g.center.y },
              p1: { x: g.center.x, y: g.center.y },
              center: g.center,
              radius: g.radius || 1.0,
            };
            if (isSilk) silkscreenGraphics.push(childG);
            else if (isFab) fabGraphics.push(childG);
          } else if (g.type === "rect" && g.start && g.end) {
            const childG: FootprintChildGraphic = {
              id: `${fp.id}_g_${gIdx}`,
              parentFootprintId: fp.id,
              kind: "rect",
              layer: targetLayer,
              strokeWidth: strokeW,
              p0: { x: g.start.x, y: g.start.y },
              p1: { x: g.end.x, y: g.end.y },
            };
            if (isSilk) silkscreenGraphics.push(childG);
            else if (isFab) fabGraphics.push(childG);
          }
        });
      }
    } else if (Array.isArray(fp.pads)) {
      // 2. Process Standard / Synthetic Footprint Pads
      fp.pads.forEach((p, idx) => {
        const lx = p.x;
        const ly = p.y;
        const w = p.width;
        const h = p.height;

        minX = Math.min(minX, lx - w / 2);
        minY = Math.min(minY, ly - h / 2);
        maxX = Math.max(maxX, lx + w / 2);
        maxY = Math.max(maxY, ly + h / 2);

        pads.push({
          id: `${fp.id}_pad_${idx}`,
          parentFootprintId: fp.id,
          pinIndex: p.pinIndex,
          number: p.number || `${p.pinIndex + 1}`,
          name: p.name,
          netId: p.netId,
          localX: lx,
          localY: ly,
          width: w,
          height: h,
          shape: p.shape === "circle" ? "circle" : "rect",
          localRotationDeg: p.rotation || 0,
          layer: p.layer === "multi_layer" ? "multi_layer" : getSwappedLayer(p.layer || "top_copper", isFlippedBottom),
          drill: p.drill,
          drillX: p.drillX,
          drillY: p.drillY,
          roundrectRatio: p.roundrectRatio,
          chamferRatio: p.chamferRatio,
        });
      });

      // 3. Generate Rich Component-Specific Silkscreen & Assembly Outlines (WebGL Ready)
      const generated = generateSyntheticFootprintGraphics(fp, isFlippedBottom, { minX, minY, maxX, maxY });
      silkscreenGraphics.push(...generated.silkscreen);
      fabGraphics.push(...generated.fab);
    }

    return {
      id: fp.id,
      reference: fp.reference,
      value: fp.value,
      symbol: fp.symbol,
      packageId: fp.packageId,
      x: fp.x,
      y: fp.y,
      rotationDeg: fp.rotation || 0,
      isFlippedBottom,
      matrix,
      layer: isFlippedBottom ? "bottom_copper" : "top_copper",
      selected,
      highlighted: false,
      pads,
      silkscreenGraphics,
      fabGraphics,
      localBounds: { minX, minY, maxX, maxY },
      source: {
        pads: fp.pads,
        native: fp.nativeKicadFootprint,
        symbol: fp.symbol,
        packageId: fp.packageId,
        value: fp.value,
      },
    };
  }
}

/**
 * Checks if a footprint is a polarized capacitor
 */
function checkIfPolarCapacitor(fp: PcbFootprint): boolean {
  const sym = (fp.symbol || "").toLowerCase();
  const val = (fp.value || (fp as any).val || "").toLowerCase();
  const pkg = (fp.packageId || "").toLowerCase();
  return (
    sym.includes("polar") ||
    sym.includes("electrolytic") ||
    sym.includes("tantalum") ||
    val.includes("uf") ||
    val.includes("µf") ||
    pkg.includes("c_radial") ||
    pkg.includes("cap_elec") ||
    pkg.includes("c_elec")
  );
}

/**
 * Generates accurate, component-specific IPC silkscreen & assembly graphics
 * in footprint local coordinates.
 */
export function generateSyntheticFootprintGraphics(
  fp: PcbFootprint,
  isFlippedBottom: boolean,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): { silkscreen: FootprintChildGraphic[]; fab: FootprintChildGraphic[] } {
  const silkscreen: FootprintChildGraphic[] = [];
  const fab: FootprintChildGraphic[] = [];
  const targetLayer: PcbLayerId = isFlippedBottom ? "bottom_silkscreen" : "silkscreen";
  const fabLayer: PcbLayerId = "outline";

  const sym = (fp.symbol || "").toLowerCase();
  const ref = (fp.reference || "").toUpperCase();
  const val = (fp.value || (fp as any).val || "").toLowerCase();
  const pkg = (fp.packageId || "").toLowerCase();

  const minPX = bounds.minX;
  const maxPX = bounds.maxX;
  const minPY = bounds.minY;
  const maxPY = bounds.maxY;

  const borderOffset = 0.5;
  const rectW = maxPX - minPX + borderOffset * 2;
  const rectH = maxPY - minPY + borderOffset * 2;
  const rectX = minPX - borderOffset;
  const rectY = minPY - borderOffset;

  const nonPolarCx = (minPX + maxPX) / 2;
  const nonPolarCy = (minPY + maxPY) / 2;

  const pad0 = fp.pads && fp.pads.length > 0 ? fp.pads[0] : undefined;
  const pad1 = fp.pads && fp.pads.length > 1 ? fp.pads[1] : undefined;
  const padCount = fp.pads?.length || 0;

  let angle = 0;
  let padDist = 5.08;
  if (pad0 && pad1 && typeof pad0.x === "number" && typeof pad1.x === "number") {
    padDist = Math.hypot(pad1.x - pad0.x, pad1.y - pad0.y);
    angle = Math.atan2(pad1.y - pad0.y, pad1.x - pad0.x);
  }

  // Component Classification
  const isResistor = sym.includes("resistor") || ref.startsWith("R") || sym.includes("potentiometer") || sym.includes("trimmer");
  const isPolarCap = checkIfPolarCapacitor(fp);
  const isNonPolarCap = (sym.includes("capacitor") || ref.startsWith("C") || sym.includes("cap")) && !isPolarCap;
  const isDiode = sym.includes("diode") || sym.includes("zener") || sym.includes("schottky") || sym.includes("1n4148") || sym.includes("1n4007") || ref.startsWith("D");
  const isLED = sym.includes("led") || (isDiode && (sym.includes("light") || val.includes("led") || ref.startsWith("LED")));
  const isTransistor = sym.includes("transistor") || sym.includes("npn") || sym.includes("pnp") || sym.includes("mosfet") || sym.includes("fet") || ref.startsWith("Q") || pkg.includes("to92") || pkg.includes("to220") || pkg.includes("sot23") || pkg.includes("sot223") || pkg.includes("dpak");
  const isRegulator = sym.includes("regulator") || sym.includes("7805") || sym.includes("7812") || sym.includes("lm317") || sym.includes("ams1117");
  const isCrystal = sym.includes("crystal") || sym.includes("oscillator") || sym.includes("xtal") || ref.startsWith("Y") || ref.startsWith("X");
  const isInductor = sym.includes("inductor") || sym.includes("choke") || ref.startsWith("L");
  const isConnector = sym.includes("conn") || sym.includes("header") || sym.includes("terminal") || sym.includes("jack") || sym.includes("usb") || ref.startsWith("J") || ref.startsWith("HDR");
  const isSwitch = sym.includes("switch") || sym.includes("button") || sym.includes("tact") || ref.startsWith("SW") || ref.startsWith("BTN");
  const isRelay = sym.includes("relay") || ref.startsWith("K") || ref.startsWith("RLY");
  const isIC = (sym.includes("ic") || sym.includes("dip") || sym.includes("soic") || sym.includes("qfp") || sym.includes("tssop") || sym.includes("bga") || sym.includes("ne555") || sym.includes("atmega") || sym.includes("opamp") || ref.startsWith("U")) && padCount >= 4;

  let gId = 0;
  const addLine = (p0: { x: number; y: number }, p1: { x: number; y: number }, strokeW = 0.15, layer = targetLayer) => {
    silkscreen.push({
      id: `${fp.id}_sg_${gId++}`,
      parentFootprintId: fp.id,
      kind: "line",
      layer,
      strokeWidth: strokeW,
      p0,
      p1,
    });
  };

  const addCircle = (center: { x: number; y: number }, radius: number, strokeW = 0.15, layer = targetLayer) => {
    silkscreen.push({
      id: `${fp.id}_sg_${gId++}`,
      parentFootprintId: fp.id,
      kind: "circle",
      layer,
      strokeWidth: strokeW,
      p0: center,
      p1: center,
      center,
      radius,
    });
  };

  const addArc = (center: { x: number; y: number }, radius: number, startAngle: number, sweepAngle: number, strokeW = 0.15, layer = targetLayer) => {
    silkscreen.push({
      id: `${fp.id}_sg_${gId++}`,
      parentFootprintId: fp.id,
      kind: "arc",
      layer,
      strokeWidth: strokeW,
      p0: center,
      p1: center,
      center,
      radius,
      startAngle,
      sweepAngle,
    });
  };

  const addRect = (p0: { x: number; y: number }, p1: { x: number; y: number }, strokeW = 0.15, layer = targetLayer) => {
    silkscreen.push({
      id: `${fp.id}_sg_${gId++}`,
      parentFootprintId: fp.id,
      kind: "rect",
      layer,
      strokeWidth: strokeW,
      p0,
      p1,
    });
  };

  // --------------------------------------------------------------------------
  // 1. DIODE / LED (Cathode notch, rectangular body, diode symbol, light rays)
  // --------------------------------------------------------------------------
  if (isDiode || isLED) {
    const isSMD = pad0?.shape === "rect";
    const bodyL = isSMD ? Math.max(1.6, padDist - 0.6) : Math.max(2.4, padDist - 1.8);
    const bodyH = isSMD ? Math.max(1.2, rectH - 0.4) : 1.8;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const uX = cosA, uY = sinA;
    const nX = -sinA, nY = cosA;

    // Body rectangle corners
    const c0 = { x: nonPolarCx - (uX * bodyL) / 2 - (nX * bodyH) / 2, y: nonPolarCy - (uY * bodyL) / 2 - (nY * bodyH) / 2 };
    const c1 = { x: nonPolarCx + (uX * bodyL) / 2 - (nX * bodyH) / 2, y: nonPolarCy + (uY * bodyL) / 2 - (nY * bodyH) / 2 };
    const c2 = { x: nonPolarCx + (uX * bodyL) / 2 + (nX * bodyH) / 2, y: nonPolarCy + (uY * bodyL) / 2 + (nY * bodyH) / 2 };
    const c3 = { x: nonPolarCx - (uX * bodyL) / 2 + (nX * bodyH) / 2, y: nonPolarCy - (uY * bodyL) / 2 + (nY * bodyH) / 2 };

    addLine(c0, c1, 0.15);
    addLine(c1, c2, 0.15);
    addLine(c2, c3, 0.15);
    addLine(c3, c0, 0.15);

    // Cathode notch / bar across body on cathode side (near pad 1 or pad 0)
    const cathodeSide = pad1 ? 1 : -1;
    const cathX = nonPolarCx + uX * (bodyL * 0.35 * cathodeSide);
    const cathY = nonPolarCy + uY * (bodyL * 0.35 * cathodeSide);
    const k0 = { x: cathX - (nX * bodyH * 0.45), y: cathY - (nY * bodyH * 0.45) };
    const k1 = { x: cathX + (nX * bodyH * 0.45), y: cathY + (nY * bodyH * 0.45) };
    addLine(k0, k1, 0.35); // Thick cathode stripe

    // Internal diode triangle
    const triVertex = { x: nonPolarCx + uX * (bodyL * 0.25 * cathodeSide), y: nonPolarCy + uY * (bodyL * 0.25 * cathodeSide) };
    const triBaseA = { x: nonPolarCx - uX * (bodyL * 0.25 * cathodeSide) - nX * (bodyH * 0.35), y: nonPolarCy - uY * (bodyL * 0.25 * cathodeSide) - nY * (bodyH * 0.35) };
    const triBaseB = { x: nonPolarCx - uX * (bodyL * 0.25 * cathodeSide) + nX * (bodyH * 0.35), y: nonPolarCy - uY * (bodyL * 0.25 * cathodeSide) + nY * (bodyH * 0.35) };
    addLine(triBaseA, triVertex, 0.12);
    addLine(triVertex, triBaseB, 0.12);
    addLine(triBaseB, triBaseA, 0.12);

    // If LED: draw light emission arrows
    if (isLED) {
      const rayStart1 = { x: nonPolarCx - uX * 0.4 + nX * (bodyH / 2 + 0.2), y: nonPolarCy - uY * 0.4 + nY * (bodyH / 2 + 0.2) };
      const rayEnd1 = { x: rayStart1.x + uX * 0.6 + nX * 0.7, y: rayStart1.y + uY * 0.6 + nY * 0.7 };
      addLine(rayStart1, rayEnd1, 0.12);
      // Arrowhead
      addLine(rayEnd1, { x: rayEnd1.x - uX * 0.25, y: rayEnd1.y - uY * 0.25 }, 0.12);
      addLine(rayEnd1, { x: rayEnd1.x - nX * 0.25, y: rayEnd1.y - nY * 0.25 }, 0.12);

      const rayStart2 = { x: nonPolarCx + uX * 0.3 + nX * (bodyH / 2 + 0.2), y: nonPolarCy + uY * 0.3 + nY * (bodyH / 2 + 0.2) };
      const rayEnd2 = { x: rayStart2.x + uX * 0.6 + nX * 0.7, y: rayStart2.y + uY * 0.6 + nY * 0.7 };
      addLine(rayStart2, rayEnd2, 0.12);
      addLine(rayEnd2, { x: rayEnd2.x - uX * 0.25, y: rayEnd2.y - uY * 0.25 }, 0.12);
      addLine(rayEnd2, { x: rayEnd2.x - nX * 0.25, y: rayEnd2.y - nY * 0.25 }, 0.12);
    }
  }

  // --------------------------------------------------------------------------
  // 2. RESISTOR / POTENTIOMETER (Rectangular body, lead lines)
  // --------------------------------------------------------------------------
  else if (isResistor && padCount === 2) {
    const isSMD = pad0?.shape === "rect";
    const bodyW = isSMD ? Math.max(1.6, padDist - 0.4) : Math.max(2.4, padDist - 1.6);
    const bodyH = isSMD ? Math.max(1.0, rectH - 0.4) : 1.6;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const uX = cosA, uY = sinA;
    const nX = -sinA, nY = cosA;

    // Resistor Box
    const c0 = { x: nonPolarCx - (uX * bodyW) / 2 - (nX * bodyH) / 2, y: nonPolarCy - (uY * bodyW) / 2 - (nY * bodyH) / 2 };
    const c1 = { x: nonPolarCx + (uX * bodyW) / 2 - (nX * bodyH) / 2, y: nonPolarCy + (uY * bodyW) / 2 - (nY * bodyH) / 2 };
    const c2 = { x: nonPolarCx + (uX * bodyW) / 2 + (nX * bodyH) / 2, y: nonPolarCy + (uY * bodyW) / 2 + (nY * bodyH) / 2 };
    const c3 = { x: nonPolarCx - (uX * bodyW) / 2 + (nX * bodyH) / 2, y: nonPolarCy - (uY * bodyW) / 2 + (nY * bodyH) / 2 };

    addLine(c0, c1, 0.15);
    addLine(c1, c2, 0.15);
    addLine(c2, c3, 0.15);
    addLine(c3, c0, 0.15);

    // Lead lines for THT
    if (!isSMD && pad0 && pad1 && typeof pad0.x === "number" && typeof pad1.x === "number") {
      addLine(pad0, { x: nonPolarCx - (uX * bodyW) / 2, y: nonPolarCy - (uY * bodyW) / 2 }, 0.15);
      addLine(pad1, { x: nonPolarCx + (uX * bodyW) / 2, y: nonPolarCy + (uY * bodyW) / 2 }, 0.15);
    }
  }

  // --------------------------------------------------------------------------
  // 3. POLARIZED CAPACITOR (Can Circle, Positive '+' Cross, Negative Stripe)
  // --------------------------------------------------------------------------
  else if (isPolarCap) {
    const canRadius = Math.max(2.5, padDist * 0.65);
    addCircle({ x: nonPolarCx, y: nonPolarCy }, canRadius, 0.18);

    // Plus '+' symbol near Pin 1 / positive pad
    const plusDist = canRadius + 0.6;
    const plusX = pad0 && typeof pad0.x === "number" ? pad0.x : nonPolarCx - plusDist;
    const plusY = pad0 && typeof pad0.y === "number" ? pad0.y - 1.0 : nonPolarCy;
    addLine({ x: plusX - 0.4, y: plusY }, { x: plusX + 0.4, y: plusY }, 0.2);
    addLine({ x: plusX, y: plusY - 0.4 }, { x: plusX, y: plusY + 0.4 }, 0.2);

    // Negative polarity stripe on negative pad side
    if (pad1 && typeof pad1.x === "number" && typeof pad1.y === "number") {
      const negAngle = Math.atan2(pad1.y - nonPolarCy, pad1.x - nonPolarCx);
      const perpAngle = negAngle + Math.PI / 2;
      const stripeLen = canRadius * 0.7;
      const sx = nonPolarCx + Math.cos(negAngle) * (canRadius - 0.4);
      const sy = nonPolarCy + Math.sin(negAngle) * (canRadius - 0.4);
      addLine(
        { x: sx - Math.cos(perpAngle) * stripeLen, y: sy - Math.sin(perpAngle) * stripeLen },
        { x: sx + Math.cos(perpAngle) * stripeLen, y: sy + Math.sin(perpAngle) * stripeLen },
        0.3
      );
    }
  }

  // --------------------------------------------------------------------------
  // 4. NON-POLARIZED CAPACITOR (Rounded Capsule, Parallel Plate Lines)
  // --------------------------------------------------------------------------
  else if (isNonPolarCap) {
    addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.15);

    // Parallel plate lines in the center
    const plateH = rectH * 0.55;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const nX = -sinA, nY = cosA;

    const pA1 = { x: nonPolarCx - cosA * 0.4 - nX * (plateH / 2), y: nonPolarCy - sinA * 0.4 - nY * (plateH / 2) };
    const pA2 = { x: nonPolarCx - cosA * 0.4 + nX * (plateH / 2), y: nonPolarCy - sinA * 0.4 + nY * (plateH / 2) };
    const pB1 = { x: nonPolarCx + cosA * 0.4 - nX * (plateH / 2), y: nonPolarCy + sinA * 0.4 - nY * (plateH / 2) };
    const pB2 = { x: nonPolarCx + cosA * 0.4 + nX * (plateH / 2), y: nonPolarCy + sinA * 0.4 + nY * (plateH / 2) };

    addLine(pA1, pA2, 0.15);
    addLine(pB1, pB2, 0.15);
  }

  // --------------------------------------------------------------------------
  // 5. TRANSISTOR / REGULATOR (TO-92 D-shape, TO-220 Heatsink tab, SOT-23)
  // --------------------------------------------------------------------------
  else if (isTransistor || isRegulator) {
    if (pkg.includes("to92") || (padCount === 3 && !pad0?.shape)) {
      // TO-92 D-shaped curved envelope
      const dWidth = Math.max(3.5, rectW);
      const dHeight = Math.max(3.2, rectH);
      const flatY = nonPolarCy + dHeight * 0.35;
      addLine({ x: nonPolarCx - dWidth * 0.45, y: flatY }, { x: nonPolarCx + dWidth * 0.45, y: flatY }, 0.18);
      addArc({ x: nonPolarCx, y: flatY }, dWidth * 0.45, Math.PI, Math.PI, 0.18);
    } else if (pkg.includes("to220") || isRegulator) {
      // TO-220 body + top metal tab
      const tabH = 2.5;
      addRect({ x: rectX, y: rectY + tabH }, { x: rectX + rectW, y: rectY + rectH }, 0.18);
      // Metal tab outline
      addRect({ x: rectX + 0.4, y: rectY }, { x: rectX + rectW - 0.4, y: rectY + tabH }, 0.15);
      addCircle({ x: nonPolarCx, y: rectY + tabH / 2 }, 1.0, 0.15);
    } else {
      // SOT-23 / SOT-223 / DPAK
      addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.18);
      // Pin 1 chamfer
      if (pad0 && typeof pad0.x === "number" && typeof pad0.y === "number") {
        addCircle({ x: pad0.x - 0.6, y: pad0.y }, 0.25, 0.2);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. INTEGRATED CIRCUIT (DIP / SOIC / QFP with U-notch & Pin 1 Index Dot)
  // --------------------------------------------------------------------------
  else if (isIC) {
    const isDip = sym.includes("dip") || pkg.includes("dip");
    const dX = isDip ? minPX - 0.8 : rectX;
    const dY = isDip ? minPY - 0.8 : rectY;
    const dW = isDip ? maxPX - minPX + 1.6 : rectW;
    const dH = isDip ? maxPY - minPY + 1.6 : rectH;

    addRect({ x: dX, y: dY }, { x: dX + dW, y: dY + dH }, 0.18);

    // Top Notch / Index indentation
    const isHoriz = dW > dH;
    if (isHoriz) {
      addArc({ x: dX, y: nonPolarCy }, 0.8, -Math.PI / 2, Math.PI, 0.18);
    } else {
      addArc({ x: nonPolarCx, y: dY }, 0.8, 0, Math.PI, 0.18);
    }

    // Pin 1 dot
    if (pad0 && typeof pad0.x === "number" && typeof pad0.y === "number") {
      addCircle({ x: isHoriz ? dX + 1.0 : pad0.x - 0.6, y: isHoriz ? pad0.y - 0.6 : dY + 1.0 }, 0.3, 0.25);
    }
  }

  // --------------------------------------------------------------------------
  // 7. CONNECTORS / PIN HEADERS / SCREW TERMINALS
  // --------------------------------------------------------------------------
  else if (isConnector) {
    addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.18);

    // Individual frame around Pin 1 (IPC square convention)
    if (pad0 && typeof pad0.x === "number" && typeof pad0.y === "number") {
      const p1W = (pad0.width || 1) + 0.4;
      const p1H = (pad0.height || 1) + 0.4;
      addRect({ x: pad0.x - p1W / 2, y: pad0.y - p1H / 2 }, { x: pad0.x + p1W / 2, y: pad0.y + p1H / 2 }, 0.15);
    }
  }

  // --------------------------------------------------------------------------
  // 8. BUTTON / SWITCH / RELAY
  // --------------------------------------------------------------------------
  else if (isSwitch || isRelay) {
    addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.18);
    if (isSwitch) {
      // Pushbutton central actuator ring
      const btnR = Math.min(rectW, rectH) * 0.28;
      addCircle({ x: nonPolarCx, y: nonPolarCy }, btnR, 0.15);
    }
  }

  // --------------------------------------------------------------------------
  // 9. CRYSTAL / OSCILLATOR
  // --------------------------------------------------------------------------
  else if (isCrystal) {
    addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.18);
    // Crystal canister inner marks
    addLine({ x: nonPolarCx - 0.8, y: rectY + 0.5 }, { x: nonPolarCx - 0.8, y: rectY + rectH - 0.5 }, 0.15);
    addLine({ x: nonPolarCx + 0.8, y: rectY + 0.5 }, { x: nonPolarCx + 0.8, y: rectY + rectH - 0.5 }, 0.15);
    addRect({ x: nonPolarCx - 0.4, y: rectY + 0.8 }, { x: nonPolarCx + 0.4, y: rectY + rectH - 0.8 }, 0.15);
  }

  // --------------------------------------------------------------------------
  // 10. INDUCTOR
  // --------------------------------------------------------------------------
  else if (isInductor) {
    addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.18);
    // Central coil core lines
    addLine({ x: rectX + 0.8, y: nonPolarCy }, { x: rectX + rectW - 0.8, y: nonPolarCy }, 0.18);
  }

  // --------------------------------------------------------------------------
  // 11. GENERAL / SYNTHETIC COMPONENT FALLBACK
  // --------------------------------------------------------------------------
  else {
    addRect({ x: rectX, y: rectY }, { x: rectX + rectW, y: rectY + rectH }, 0.15);
    if (pad0 && typeof pad0.x === "number" && typeof pad0.y === "number") {
      addCircle({ x: pad0.x - 0.6, y: pad0.y }, 0.25, 0.2);
    }
  }

  // Fabrication / Assembly outline (F.Fab)
  fab.push({
    id: `${fp.id}_fab_body`,
    parentFootprintId: fp.id,
    kind: "rect",
    layer: fabLayer,
    strokeWidth: 0.12,
    p0: { x: minPX - 0.2, y: minPY - 0.2 },
    p1: { x: maxPX + 0.2, y: maxPY + 0.2 },
  });

  return { silkscreen, fab };
}

/**
 * Maps a KiCad native pad shape string to a normalized FootprintPadShape
 */
function mapNativePadShape(shape?: string): FootprintPadShape {
  if (!shape) return "rect";
  const s = shape.toLowerCase();
  if (s === "circle" || s === "oval_circle") return "circle";
  if (s === "oval") return "oval";
  if (s === "roundrect") return "roundrect";
  if (s === "chamfered_rect" || s === "chamferrect") return "chamfered_rect";
  if (s === "rect" || s === "rectangle") return "rect";
  return "rect";
}
