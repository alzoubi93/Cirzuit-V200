/**
 * Shared KiCad footprint render model.
 *
 * SINGLE SOURCE OF TRUTH for how a KiCad footprint (imported from a KiCad library or produced by the
 * footprint generator) is turned into pixels: body fill, copper pads, drills, pad numbers, silkscreen,
 * fab, courtyard (dashed) and Hershey vector text.
 *
 * It is consumed by BOTH
 *   - the footprint browser / generator preview  (KicadFootprintWebGLCanvas)
 *   - the PCB editor's unified WebGL stage        (PcbWebGLFootprints)
 * so a footprint looks the same in both places by construction. No React and no GL calls in here.
 */
import { kicadGeometryEngine, type KicadGeometryItem } from "@/lib/kicad/footprint/geometry";
import { getKicadLayerColor } from "./KicadFootprintGeometry";
import { resolveKicadDisplayLayer } from "@/lib/kicad/footprint/kicadLayerAdapter";
import { generateHersheyTextStrokes } from "@/lib/kicadHersheyFont";
import earcut from "earcut";

// -----------------------------------------------------------------------------
// 1. FILL SHADERS (Component Body Fill, Pads, Drills, Solid Geometry)
// -----------------------------------------------------------------------------
export const FILL_VS_SOURCE = `
attribute vec2 a_pos;
attribute vec4 a_color;

uniform vec4 u_bounds;     // (minX, minY, width, height)
uniform vec2 u_canvas_res; // (width_px, height_px)

varying vec4 v_color;

void main() {
  float minX = u_bounds.x;
  float minY = u_bounds.y;
  float bWidth = max(u_bounds.z, 0.0001);
  float bHeight = max(u_bounds.w, 0.0001);

  float normX = (a_pos.x - minX) / bWidth;
  float normY = (a_pos.y - minY) / bHeight;

  float clipX = normX * 2.0 - 1.0;
  float clipY = 1.0 - normY * 2.0; // Invert Y for display coords (top-down)

  gl_Position = vec4(clipX, clipY, 0.0, 1.0);
  v_color = a_color;
}
`;

export const FILL_FS_SOURCE = `
precision highp float;

varying vec4 v_color;

void main() {
  if (v_color.a <= 0.001) discard;
  gl_FragColor = v_color;
}
`;

// -----------------------------------------------------------------------------
// 2. STROKE & TEXT SHADERS (Silkscreen Lines, Outlines, Hershey Vector Text)
// -----------------------------------------------------------------------------
export const STROKE_VS_SOURCE = `
attribute vec2 a_quad_pos; // [-1, 1] unit quad corner
attribute vec2 a_seg_p0;   // Start point in footprint world space (mm)
attribute vec2 a_seg_p1;   // End point in footprint world space (mm)
attribute vec4 a_seg_props; // (strokeWidth, dimAlpha, isDashed, startLen)
attribute vec4 a_seg_color; // RGBA color

uniform vec4 u_bounds;     // (minX, minY, width, height)
uniform vec2 u_canvas_res; // (width_px, height_px)

varying vec2 v_world_pos;
varying vec2 v_world_p0;
varying vec2 v_world_p1;
varying vec4 v_props;
varying vec4 v_color;
varying float v_arcLength;

void main() {
  v_world_p0 = a_seg_p0;
  v_world_p1 = a_seg_p1;
  v_props = a_seg_props;
  v_color = a_seg_color;

  float width = a_seg_props.x;
  float radius = width * 0.5;

  float pixelSizeMm = u_bounds.z / max(u_canvas_res.x, 1.0);
  float aaPadding = pixelSizeMm * 1.5;
  float totalR = radius + aaPadding;

  vec2 dir = a_seg_p1 - a_seg_p0;
  float segLen = length(dir);
  vec2 u = segLen > 0.00001 ? (dir / segLen) : vec2(1.0, 0.0);
  vec2 n = vec2(-u.y, u.x);

  vec2 center = (a_seg_p0 + a_seg_p1) * 0.5;
  float halfLen = segLen * 0.5 + totalR;
  float halfWidth = totalR;

  vec2 world_pos = center + u * (a_quad_pos.x * halfLen) + n * (a_quad_pos.y * halfWidth);
  v_world_pos = world_pos;

  float localArcLen = dot(world_pos - a_seg_p0, u);
  v_arcLength = a_seg_props.w + localArcLen;

  // Transform world_pos (mm) to WebGL NDC [-1, 1]
  float minX = u_bounds.x;
  float minY = u_bounds.y;
  float bWidth = max(u_bounds.z, 0.0001);
  float bHeight = max(u_bounds.w, 0.0001);

  float normX = (world_pos.x - minX) / bWidth;
  float normY = (world_pos.y - minY) / bHeight;

  float clipX = normX * 2.0 - 1.0;
  float clipY = 1.0 - normY * 2.0;

  gl_Position = vec4(clipX, clipY, 0.0, 1.0);
}
`;

export const STROKE_FS_SOURCE = `
precision highp float;

uniform vec4 u_bounds;
uniform vec2 u_canvas_res;
uniform float u_dashSize;  // Dash pattern cycle size in mm
uniform float u_dashRatio; // Dash stroke ratio (0.0 to 1.0)

varying vec2 v_world_pos;
varying vec2 v_world_p0;
varying vec2 v_world_p1;
varying vec4 v_props;
varying vec4 v_color;
varying float v_arcLength;

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float l2 = dot(ba, ba);
  float h = l2 > 0.000001 ? clamp(dot(pa, ba) / l2, 0.0, 1.0) : 0.0;
  return length(pa - ba * h) - r;
}

void main() {
  float strokeWidth = v_props.x;
  float dimAlpha = v_props.y;
  float isDashed = v_props.z;
  float radius = strokeWidth * 0.5;

  // Procedural Dash Fragment Shader for Courtyard Boundaries (F.CrtYd)
  if (isDashed > 0.5) {
    float dashSize = u_dashSize > 0.001 ? u_dashSize : 0.5;
    float dashRatio = u_dashRatio > 0.001 ? u_dashRatio : 0.6;
    float pattern = fract(v_arcLength / dashSize);
    if (pattern > dashRatio) {
      discard; // Gap between dashes
    }
  }

  float dist = sdCapsule(v_world_pos, v_world_p0, v_world_p1, 0.0);

  float pixelSizeMm = u_bounds.z / max(u_canvas_res.x, 1.0);
  float halfPx = 0.5 * pixelSizeMm;

  float d_body = dist - radius;
  if (d_body > halfPx * 1.5) {
    discard;
  }

  float alpha = 1.0 - smoothstep(-halfPx, halfPx, d_body);
  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(v_color.rgb, alpha * v_color.a * dimAlpha);
}
`;

export function parseHexColor(hex: string): [number, number, number, number] {
  if (!hex) return [0.99, 0.88, 0.28, 1.0];
  if (hex.startsWith("rgba")) {
    const match = hex.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      return [
        parseInt(match[1]) / 255,
        parseInt(match[2]) / 255,
        parseInt(match[3]) / 255,
        match[4] !== undefined ? parseFloat(match[4]) : 1.0,
      ];
    }
  }
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((ch) => ch + ch).join("");
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return [0.99, 0.88, 0.28, 1.0];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255, 1.0];
}

export interface SegmentQuadData {
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  strokeWidth: number;
  dimAlpha: number;
  isDashed: number;
  startLen: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FillVertexData {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Vertex range inside `padFillVertices` that belongs to one pad (copper) or its drill. */
export interface PadFillRange {
  padNumber: string;
  kind: "copper" | "drill";
  start: number;
  count: number;
}

/**
 * The reference / value labels are the only per-instance text of a footprint ("REF**" / "VAL**"
 * placeholders replaced by the real designator and value). Callers that draw many instances of the
 * same footprint build these separately from the shared (static) geometry.
 */
export function isReferenceOrValueItem(item: KicadGeometryItem): boolean {
  const p: any = item.primitive;
  return p.kind === "text" && (p.role === "reference" || p.role === "value" || p.text === "REF**" || p.text === "VAL**");
}

/**
 * Expand KiCad text variables. `${REFERENCE}` / `%R` and `${VALUE}` / `%V` are the ones footprints
 * use; anything else is left untouched.
 */
export function resolveFootprintText(text: string, ctx: { reference?: string; value?: string }): string {
  if (!text) return "";
  return text
    .replace(/\$\{REFERENCE\}|%R/g, () => ctx.reference || "REF**")
    .replace(/\$\{VALUE\}|%V/g, () => ctx.value || "VAL**");
}

/**
 * Reconstruct a closed polygon boundary from a list of connected lines and arcs
 */
export function extractClosedBoundaryFromFab(items: KicadGeometryItem[]): { x: number; y: number }[] | null {
  const segments: { start: { x: number; y: number }; end: { x: number; y: number }; arcPts?: { x: number; y: number }[] }[] = [];

  for (const item of items) {
    if (item.layer !== "F.Fab" && item.layer !== "top_fab") continue;
    const p = item.primitive;
    if (p.kind === "line") {
      segments.push({ start: p.start, end: p.end });
    } else if (p.kind === "arc") {
      // Sample arc into 6 points
      const pts: { x: number; y: number }[] = [];
      const steps = 6;
      const a0 = Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x);
      const sweep = p.sweepRadians || 0;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (sweep * i) / steps;
        pts.push({ x: p.center.x + p.radius * Math.cos(a), y: p.center.y + p.radius * Math.sin(a) });
      }
      segments.push({ start: p.start, end: p.end, arcPts: pts });
    }
  }

  if (segments.length < 3) return null;

  // Chain segments into an ordered loop
  const polygon: { x: number; y: number }[] = [];
  const remaining = [...segments];
  const currentSeg = remaining.shift()!;
  if (currentSeg.arcPts) {
    polygon.push(...currentSeg.arcPts);
  } else {
    polygon.push(currentSeg.start, currentSeg.end);
  }

  const eps = 0.05;
  const maxIters = 60;
  let iters = 0;

  while (remaining.length > 0 && iters++ < maxIters) {
    const lastPt = polygon[polygon.length - 1];
    let nextIdx = -1;
    let reverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      if (Math.hypot(seg.start.x - lastPt.x, seg.start.y - lastPt.y) <= eps) {
        nextIdx = i;
        reverse = false;
        break;
      }
      if (Math.hypot(seg.end.x - lastPt.x, seg.end.y - lastPt.y) <= eps) {
        nextIdx = i;
        reverse = true;
        break;
      }
    }

    if (nextIdx === -1) break;

    const nextSeg = remaining.splice(nextIdx, 1)[0];
    if (nextSeg.arcPts) {
      const pts = reverse ? [...nextSeg.arcPts].reverse() : nextSeg.arcPts;
      polygon.push(...pts.slice(1));
    } else {
      polygon.push(reverse ? nextSeg.start : nextSeg.end);
    }
  }

  return polygon.length >= 3 ? polygon : null;
}

export function buildWebGLGeometryForFootprint(
  items: KicadGeometryItem[],
  reference: string,
  value: string,
  activeLayer: string,
  layerColors: Record<string, string>,
  layerVisibility: Record<string, boolean>,
  dimInactiveLayers: boolean
): {
  bodyFillVertices: FillVertexData[];
  padFillVertices: FillVertexData[];
  segments: SegmentQuadData[];
  padRanges: PadFillRange[];
} {
  const bodyFillVertices: FillVertexData[] = [];
  const padFillVertices: FillVertexData[] = [];
  const segments: SegmentQuadData[] = [];
  const padRanges: PadFillRange[] = [];


  const isSideLayer = (l: string) => l.startsWith("F.") || l.startsWith("B.");

  // Helper: Add triangle for filled geometry
  const addFillTriangle = (
    targetList: FillVertexData[],
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    fr: number,
    fg: number,
    fb: number,
    fa: number
  ) => {
    targetList.push({ x: p0.x, y: p0.y, r: fr, g: fg, b: fb, a: fa });
    targetList.push({ x: p1.x, y: p1.y, r: fr, g: fg, b: fb, a: fa });
    targetList.push({ x: p2.x, y: p2.y, r: fr, g: fg, b: fb, a: fa });
  };

  // Helper: Add stroke segment
  const addSeg = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    width = 0.12,
    startLen = 0,
    segR = 1.0,
    segG = 1.0,
    segB = 1.0,
    segA = 1.0,
    isDashed = 0.0,
    dimAlpha = 1.0
  ) => {
    segments.push({
      p0x: p0.x,
      p0y: p0.y,
      p1x: p1.x,
      p1y: p1.y,
      strokeWidth: width,
      dimAlpha,
      isDashed,
      startLen,
      r: segR,
      g: segG,
      b: segB,
      a: segA,
    });
    return Math.hypot(p1.x - p0.x, p1.y - p0.y);
  };

  // =========================================================================
  // 1. COMPONENT BODY FILL (Drawn in background layer of footprint)
  // =========================================================================
  const allowBodyFill =
    layerVisibility["body fill"] !== false &&
    layerVisibility["body_fill"] !== false &&
    layerVisibility["F.fab"] !== false;

  if (allowBodyFill) {
    // Elegant Dark Slate/Charcoal IC Package body color: rgba(24, 34, 52, 0.75)
    const bodyR = 0.10;
    const bodyG = 0.14;
    const bodyB = 0.22;
    const bodyA = 0.75;

    let bodyFilled = false;

    // Strategy 1: explicit closed polygons / rects / circles on F.Fab. Overlapping shapes would blend
    // twice (a visible diagonal seam), so shapes are filled largest-first and any shape that overlaps
    // one that is already filled is skipped.
    type Pt = { x: number; y: number };
    const candidates: { pts: Pt[]; area: number; minX: number; minY: number; maxX: number; maxY: number }[] = [];
    const addCandidate = (pts: Pt[]) => {
      if (pts.length < 3) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const q of pts) { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y); }
      candidates.push({ pts, area: (maxX - minX) * (maxY - minY), minX, minY, maxX, maxY });
    };
    for (const item of items) {
      if (item.layer !== "F.Fab" && item.layer !== "top_fab") continue;
      const p = item.primitive;
      if (p.kind === "polygon" && p.points && p.points.length >= 3) {
        addCandidate(p.points.map((pt) => ({ x: pt.x, y: pt.y })));
      } else if (p.kind === "rect") {
        const x1 = Math.min(p.start.x, p.end.x);
        const x2 = Math.max(p.start.x, p.end.x);
        const y1 = Math.min(p.start.y, p.end.y);
        const y2 = Math.max(p.start.y, p.end.y);
        let pts = [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ];
        if (p.rotation) {
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const rad = (p.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          pts = pts.map((pt) => {
            const dx = pt.x - cx;
            const dy = pt.y - cy;
            return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
          });
        }
        addCandidate(pts);
      } else if (p.kind === "circle") {
        const steps = 32;
        const pts: Pt[] = [];
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * Math.PI * 2;
          pts.push({ x: p.center.x + Math.cos(a0) * p.radius, y: p.center.y + Math.sin(a0) * p.radius });
        }
        addCandidate(pts);
      }
    }
    candidates.sort((a, b) => b.area - a.area);
    const filledBoxes: typeof candidates = [];
    for (const c of candidates) {
      const overlaps = filledBoxes.some((f) => c.minX < f.maxX && c.maxX > f.minX && c.minY < f.maxY && c.maxY > f.minY);
      if (overlaps) continue;
      filledBoxes.push(c);
      const flatCoords: number[] = [];
      for (const pt of c.pts) flatCoords.push(pt.x, pt.y);
      const triIndices = earcut(flatCoords);
      for (let i = 0; i < triIndices.length; i += 3) {
        addFillTriangle(bodyFillVertices, c.pts[triIndices[i]], c.pts[triIndices[i + 1]], c.pts[triIndices[i + 2]], bodyR, bodyG, bodyB, bodyA);
      }
      bodyFilled = true;
    }

    // Strategy 2: If F.Fab is defined as a series of connected lines/arcs (e.g. DIP, SOIC, QFP, Resistors)
    if (!bodyFilled) {
      const fabPolygon = extractClosedBoundaryFromFab(items);
      if (fabPolygon && fabPolygon.length >= 3) {
        const flatCoords: number[] = [];
        for (const pt of fabPolygon) flatCoords.push(pt.x, pt.y);
        const triIndices = earcut(flatCoords);
        for (let i = 0; i < triIndices.length; i += 3) {
          addFillTriangle(
            bodyFillVertices,
            fabPolygon[triIndices[i]],
            fabPolygon[triIndices[i + 1]],
            fabPolygon[triIndices[i + 2]],
            bodyR,
            bodyG,
            bodyB,
            bodyA
          );
        }
        bodyFilled = true;
      }
    }

    // Strategy 3: Synthesize body fill between pads if no Fab outline was closed
    if (!bodyFilled) {
      const padItemsList = items.filter((i) => i.source === "pad" || i.source === "custom-pad");
      if (padItemsList.length >= 2) {
        const padBounds = kicadGeometryEngine.bounds(padItemsList);
        const w = padBounds.maxX - padBounds.minX;
        const h = padBounds.maxY - padBounds.minY;
        const insetX = Math.min(0.2, w * 0.1);
        const insetY = Math.min(0.2, h * 0.1);
        const bx1 = padBounds.minX + insetX;
        const by1 = padBounds.minY + insetY;
        const bx2 = padBounds.maxX - insetX;
        const by2 = padBounds.maxY - insetY;
        if (bx2 > bx1 && by2 > by1) {
          addFillTriangle(bodyFillVertices, { x: bx1, y: by1 }, { x: bx2, y: by1 }, { x: bx2, y: by2 }, bodyR, bodyG, bodyB, bodyA);
          addFillTriangle(bodyFillVertices, { x: bx1, y: by1 }, { x: bx2, y: by2 }, { x: bx1, y: by2 }, bodyR, bodyG, bodyB, bodyA);
        }
      }
    }
  }

  // =========================================================================
  // 2. COPPER PADS, DRILLS, SILKSCREEN & VECTOR TEXT
  // =========================================================================
  for (const item of items) {
    const displayLayer = resolveKicadDisplayLayer(item.layer, activeLayer);

    const isFab = displayLayer === "top_fab" || displayLayer === "bottom_fab" || item.layer === "F.Fab" || item.layer === "B.Fab";
    const isSilkscreen = displayLayer === "silkscreen" || displayLayer === "bottom_silkscreen" || item.layer === "F.SilkS" || item.layer === "B.SilkS";
    const isCourtyard = displayLayer === "top_courtyard" || displayLayer === "bottom_courtyard" || item.layer === "F.CrtYd" || item.layer === "B.CrtYd" || item.layer === "courtyard" || item.layer === "F.courtyard";
    const isCopper = displayLayer === "top_copper" || displayLayer === "bottom_copper" || item.layer === "F.Cu" || item.layer === "B.Cu" || item.layer === "*.Cu";
    const isDrill = item.layer === "drill" || item.source === "drill";
    const isOtherGraphic = !isCopper && !isDrill && !isSilkscreen && !isFab && !isCourtyard;

    // Visibility layer filtering
    // Generic PCB layer visibility (editor passes PCB layer ids such as "silkscreen" / "bottom_copper").
    if (layerVisibility[displayLayer] === false) continue;

    // Handle drill hole visibility specifically as it might be nested under various keys
    if (isDrill && (layerVisibility["drill"] === false || layerVisibility["Drill Holes"] === false)) continue;

    const isBottomItem = displayLayer.startsWith("bottom_") || item.layer.startsWith("B.");
    if (!isBottomItem && isSilkscreen && (layerVisibility["F.silkscreen"] === false || layerVisibility["silkscreen"] === false || layerVisibility["F.SilkS"] === false)) continue;
    if (!isBottomItem && isFab && (layerVisibility["F.fab"] === false || layerVisibility["top_fab"] === false || layerVisibility["F.Fab"] === false)) continue;
    if (!isBottomItem && isCourtyard && (layerVisibility["F.courtyard"] === false || layerVisibility["top_courtyard"] === false || layerVisibility["F.CrtYd"] === false)) continue;
    if (isCopper && (layerVisibility["F.Cu"] === false || layerVisibility["top_copper"] === false) && displayLayer !== "bottom_copper") continue;
    if (displayLayer === "bottom_copper" && (layerVisibility["B.Cu"] === false || layerVisibility["bottom_copper"] === false)) continue;
    if (displayLayer === "bottom_silkscreen" && (layerVisibility["bottom_silkscreen"] === false || layerVisibility["B.SilkS"] === false)) continue;
    if (displayLayer === "bottom_fab" && (layerVisibility["bottom_fab"] === false || layerVisibility["B.Fab"] === false)) continue;
    if (displayLayer === "bottom_courtyard" && (layerVisibility["bottom_courtyard"] === false || layerVisibility["B.CrtYd"] === false)) continue;

    // Only dim a side's silkscreen/fab/courtyard/text when the OTHER outer copper side is the
    // one being focused on (F. dims for bottom_copper, B. dims for top_copper). Selecting an
    // inner layer (In1.Cu, In2.Cu, ...) — or anything else — isn't "the other side" for either
    // face, so it must not dim either one; comparing with `!== "top_copper"` / `!== "bottom_copper"`
    // (as this used to) makes every inner-layer selection count as "wrong side" for the front,
    // dimming front silkscreen/reference/value text any time an inner layer is active.
    const inactiveSide = isSideLayer(item.layer) && ((item.layer.startsWith("F.") && activeLayer === "bottom_copper") || (item.layer.startsWith("B.") && activeLayer === "top_copper"));
    const dimAlpha = dimInactiveLayers && inactiveSide ? 0.35 : 1.0;

    const colorHex = getKicadLayerColor(displayLayer, layerColors);
    const [r, g, b, a] = parseHexColor(colorHex);

    const p = item.primitive;
    // KiCad properties/fp_text can explicitly hide fields (Datasheet, Description, user text, etc.).
    // Hidden graphics must remain in the model for editing/export, but must never reach the GPU.
    if (p.kind === "text" && (p as any).visible === false) continue;
    const defaultWidth = isSilkscreen ? 0.12 : isFab ? 0.10 : isCourtyard ? 0.05 : isOtherGraphic ? 0.10 : 0.12;
    const strokeW = p.stroke?.width ? Math.max(0.05, p.stroke.width) : defaultWidth;
    const isDashed = isCourtyard ? 1.0 : 0.0;

    // -------------------------------------------------------------------------
    // A. COPPER PADS & DRILL HOLES (Middle Layer)
    // -------------------------------------------------------------------------
    if (isCopper || isDrill) {
      const copperA = (isDrill ? 1.0 : 0.95) * dimAlpha;
      const copperR = r;
      const copperG = g;
      const copperB = b;
      const rangeStart = padFillVertices.length;

      switch (p.kind) {
        case "rect": {
          const x1 = Math.min(p.start.x, p.end.x);
          const x2 = Math.max(p.start.x, p.end.x);
          const y1 = Math.min(p.start.y, p.end.y);
          const y2 = Math.max(p.start.y, p.end.y);
          let pts = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ];
          if (p.rotation) {
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const rad = (p.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            pts = pts.map((pt) => {
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
            });
          }
          addFillTriangle(padFillVertices, pts[0], pts[1], pts[2], copperR, copperG, copperB, copperA);
          addFillTriangle(padFillVertices, pts[0], pts[2], pts[3], copperR, copperG, copperB, copperA);
          break;
        }
        case "roundrect": {
          const cx = p.center.x, cy = p.center.y;
          const hx = p.size.x / 2, hy = p.size.y / 2;
          const rad = p.radii?.topLeft || Math.min(hx, hy) * 0.25;
          const steps = 6;
          const corners = [
            { cx: cx + hx - rad, cy: cy - hy + rad, startA: -Math.PI / 2, endA: 0 },
            { cx: cx + hx - rad, cy: cy + hy - rad, startA: 0, endA: Math.PI / 2 },
            { cx: cx - hx + rad, cy: cy + hy - rad, startA: Math.PI / 2, endA: Math.PI },
            { cx: cx - hx + rad, cy: cy - hy + rad, startA: Math.PI, endA: (3 * Math.PI) / 2 },
          ];
          let allPts: { x: number; y: number }[] = [];
          for (const c of corners) {
            for (let i = 0; i <= steps; i++) {
              const ang = c.startA + (i / steps) * (c.endA - c.startA);
              allPts.push({ x: c.cx + Math.cos(ang) * rad, y: c.cy + Math.sin(ang) * rad });
            }
          }
          if (p.rotation) {
            const radRot = (p.rotation * Math.PI) / 180;
            const cosR = Math.cos(radRot);
            const sinR = Math.sin(radRot);
            allPts = allPts.map((pt) => {
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              return { x: cx + dx * cosR - dy * sinR, y: cy + dx * sinR + dy * cosR };
            });
          }
          const cCenter = { x: cx, y: cy };
          for (let i = 0; i < allPts.length; i++) {
            addFillTriangle(padFillVertices, cCenter, allPts[i], allPts[(i + 1) % allPts.length], copperR, copperG, copperB, copperA);
          }
          break;
        }
        case "chamferrect": {
          const cx = p.center.x, cy = p.center.y;
          const hx = p.size.x / 2, hy = p.size.y / 2;
          const c = p.chamfers || {};
          let pts = [
            { x: cx - hx + (c.topLeft || 0), y: cy - hy },
            { x: cx + hx - (c.topRight || 0), y: cy - hy },
            { x: cx + hx, y: cy - hy + (c.topRight || 0) },
            { x: cx + hx, y: cy + hy - (c.bottomRight || 0) },
            { x: cx + hx - (c.bottomRight || 0), y: cy + hy },
            { x: cx - hx + (c.bottomLeft || 0), y: cy + hy },
            { x: cx - hx, y: cy + hy - (c.bottomLeft || 0) },
            { x: cx - hx, y: cy - hy + (c.topLeft || 0) },
          ];
          if (p.rotation) {
            const radRot = (p.rotation * Math.PI) / 180;
            const cosR = Math.cos(radRot);
            const sinR = Math.sin(radRot);
            pts = pts.map((pt) => {
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              return { x: cx + dx * cosR - dy * sinR, y: cy + dx * sinR + dy * cosR };
            });
          }
          const cCenter = { x: cx, y: cy };
          for (let i = 0; i < pts.length; i++) {
            addFillTriangle(padFillVertices, cCenter, pts[i], pts[(i + 1) % pts.length], copperR, copperG, copperB, copperA);
          }
          break;
        }
        case "circle": {
          const steps = 32;
          const cx = p.center.x, cy = p.center.y, rad = p.radius;
          const cCenter = { x: cx, y: cy };
          for (let i = 0; i < steps; i++) {
            const a0 = (i / steps) * Math.PI * 2;
            const a1 = ((i + 1) / steps) * Math.PI * 2;
            addFillTriangle(
              padFillVertices,
              cCenter,
              { x: cx + Math.cos(a0) * rad, y: cy + Math.sin(a0) * rad },
              { x: cx + Math.cos(a1) * rad, y: cy + Math.sin(a1) * rad },
              copperR,
              copperG,
              copperB,
              copperA
            );
          }
          break;
        }
        case "hole": {
          const cx = p.center.x, cy = p.center.y;
          const hx = p.size.x / 2, hy = p.size.y / 2;
          const isSlot = Math.abs(hx - hy) > 0.001;
          const rad = Math.min(hx, hy);
          const cCenter = { x: cx, y: cy };

          if (isSlot) {
            const halfStraight = Math.max(0, Math.max(hx, hy) - rad);
            const horizontal = hx >= hy;
            let p0 = horizontal ? { x: cx - halfStraight, y: cy } : { x: cx, y: cy - halfStraight };
            let p1 = horizontal ? { x: cx + halfStraight, y: cy } : { x: cx, y: cy + halfStraight };
            if (p.rotation) {
              const radRot = (p.rotation * Math.PI) / 180;
              const cosR = Math.cos(radRot), sinR = Math.sin(radRot);
              const rot = (pt: { x: number; y: number }) => ({
                x: cx + (pt.x - cx) * cosR - (pt.y - cy) * sinR,
                y: cy + (pt.x - cx) * sinR + (pt.y - cy) * cosR,
              });
              p0 = rot(p0);
              p1 = rot(p1);
            }
            const dir = { x: p1.x - p0.x, y: p1.y - p0.y };
            const len = Math.hypot(dir.x, dir.y);
            const u = len > 0.0001 ? { x: dir.x / len, y: dir.y / len } : { x: 1, y: 0 };
            const n = { x: -u.y, y: u.x };

            const quad0 = { x: p0.x + n.x * rad, y: p0.y + n.y * rad };
            const quad1 = { x: p1.x + n.x * rad, y: p1.y + n.y * rad };
            const quad2 = { x: p1.x - n.x * rad, y: p1.y - n.y * rad };
            const quad3 = { x: p0.x - n.x * rad, y: p0.y - n.y * rad };

            addFillTriangle(padFillVertices, quad0, quad1, quad2, 0.04, 0.06, 0.12, 1.0);
            addFillTriangle(padFillVertices, quad0, quad2, quad3, 0.04, 0.06, 0.12, 1.0);

            const steps = 12;
            for (let i = 0; i < steps; i++) {
              const ang0 = -Math.PI / 2 + (i / steps) * Math.PI;
              const ang1 = -Math.PI / 2 + ((i + 1) / steps) * Math.PI;
              addFillTriangle(
                padFillVertices,
                p1,
                { x: p1.x + u.x * Math.cos(ang0) * rad + n.x * Math.sin(ang0) * rad, y: p1.y + u.y * Math.cos(ang0) * rad + n.y * Math.sin(ang0) * rad },
                { x: p1.x + u.x * Math.cos(ang1) * rad + n.x * Math.sin(ang1) * rad, y: p1.y + u.y * Math.cos(ang1) * rad + n.y * Math.sin(ang1) * rad },
                0.04,
                0.06,
                0.12,
                1.0
              );
              addFillTriangle(
                padFillVertices,
                p0,
                { x: p0.x - u.x * Math.cos(ang0) * rad + n.x * Math.sin(ang0) * rad, y: p0.y - u.y * Math.cos(ang0) * rad + n.y * Math.sin(ang0) * rad },
                { x: p0.x - u.x * Math.cos(ang1) * rad + n.x * Math.sin(ang1) * rad, y: p0.y - u.y * Math.cos(ang1) * rad + n.y * Math.sin(ang1) * rad },
                0.04,
                0.06,
                0.12,
                1.0
              );
            }
          } else {
            const steps = 32;
            for (let i = 0; i < steps; i++) {
              const a0 = (i / steps) * Math.PI * 2;
              const a1 = ((i + 1) / steps) * Math.PI * 2;
              addFillTriangle(
                padFillVertices,
                cCenter,
                { x: cx + Math.cos(a0) * rad, y: cy + Math.sin(a0) * rad },
                { x: cx + Math.cos(a1) * rad, y: cy + Math.sin(a1) * rad },
                0.04,
                0.06,
                0.12,
                1.0
              );
            }
          }
          break;
        }
        case "capsule": {
          const rad = p.radius;
          const dir = { x: p.end.x - p.start.x, y: p.end.y - p.start.y };
          const len = Math.hypot(dir.x, dir.y);
          if (len < 0.0001) {
            // Circular pad (equal width & height)
            const steps = 32;
            const cx = p.start.x;
            const cy = p.start.y;
            const cCenter = { x: cx, y: cy };
            for (let i = 0; i < steps; i++) {
              const a0 = (i / steps) * Math.PI * 2;
              const a1 = ((i + 1) / steps) * Math.PI * 2;
              addFillTriangle(
                padFillVertices,
                cCenter,
                { x: cx + Math.cos(a0) * rad, y: cy + Math.sin(a0) * rad },
                { x: cx + Math.cos(a1) * rad, y: cy + Math.sin(a1) * rad },
                copperR,
                copperG,
                copperB,
                copperA
              );
            }
          } else {
            // Elongated oval / capsule pad
            const u = { x: dir.x / len, y: dir.y / len };
            const n = { x: -u.y, y: u.x };

            const p0 = { x: p.start.x + n.x * rad, y: p.start.y + n.y * rad };
            const p1 = { x: p.end.x + n.x * rad, y: p.end.y + n.y * rad };
            const p2 = { x: p.end.x - n.x * rad, y: p.end.y - n.y * rad };
            const p3 = { x: p.start.x - n.x * rad, y: p.start.y - n.y * rad };

            addFillTriangle(padFillVertices, p0, p1, p2, copperR, copperG, copperB, copperA);
            addFillTriangle(padFillVertices, p0, p2, p3, copperR, copperG, copperB, copperA);

            const steps = 16;
            for (let i = 0; i < steps; i++) {
              const ang0 = -Math.PI / 2 + (i / steps) * Math.PI;
              const ang1 = -Math.PI / 2 + ((i + 1) / steps) * Math.PI;
              // End cap semicircle
              addFillTriangle(
                padFillVertices,
                p.end,
                { x: p.end.x + u.x * Math.cos(ang0) * rad + n.x * Math.sin(ang0) * rad, y: p.end.y + u.y * Math.cos(ang0) * rad + n.y * Math.sin(ang0) * rad },
                { x: p.end.x + u.x * Math.cos(ang1) * rad + n.x * Math.sin(ang1) * rad, y: p.end.y + u.y * Math.cos(ang1) * rad + n.y * Math.sin(ang1) * rad },
                copperR,
                copperG,
                copperB,
                copperA
              );
              // Start cap semicircle
              addFillTriangle(
                padFillVertices,
                p.start,
                { x: p.start.x - u.x * Math.cos(ang0) * rad + n.x * Math.sin(ang0) * rad, y: p.start.y - u.y * Math.cos(ang0) * rad + n.y * Math.sin(ang0) * rad },
                { x: p.start.x - u.x * Math.cos(ang1) * rad + n.x * Math.sin(ang1) * rad, y: p.start.y - u.y * Math.cos(ang1) * rad + n.y * Math.sin(ang1) * rad },
                copperR,
                copperG,
                copperB,
                copperA
              );
            }
          }
          break;
        }
        case "polygon": {
          if (p.points && p.points.length >= 3) {
            const flatCoords: number[] = [];
            for (const pt of p.points) flatCoords.push(pt.x, pt.y);
            const triIndices = earcut(flatCoords);
            for (let i = 0; i < triIndices.length; i += 3) {
              addFillTriangle(
                padFillVertices,
                p.points[triIndices[i]],
                p.points[triIndices[i + 1]],
                p.points[triIndices[i + 2]],
                copperR,
                copperG,
                copperB,
                copperA
              );
            }
          }
          break;
        }
      }

      if (item.metadata?.padNumber !== undefined && padFillVertices.length > rangeStart) {
        padRanges.push({
          padNumber: String(item.metadata.padNumber),
          kind: isDrill ? "drill" : "copper",
          start: rangeStart,
          count: padFillVertices.length - rangeStart,
        });
      }

      // Render crisp vector pad numbers on pads
      if (
        (item.source === "pad" || item.source === "custom-pad") &&
        item.metadata?.padNumber &&
        layerVisibility["pad_numbers"] !== false &&
        layerVisibility["padNumbers"] !== false
      ) {
        const padNumStr = String(item.metadata.padNumber);
        let padCx = 0,
          padCy = 0,
          padDim = 1.0;
        if ("center" in p && p.center) {
          padCx = p.center.x;
          padCy = p.center.y;
          if ("size" in p && p.size) padDim = Math.max(p.size.x, p.size.y);
          else if ("radius" in p && p.radius) padDim = p.radius * 2;
        } else if ("start" in p && "end" in p) {
          padCx = (p.start.x + p.end.x) / 2;
          padCy = (p.start.y + p.end.y) / 2;
          const len = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y);
          const rad = "radius" in p && p.radius ? p.radius : 0.4;
          padDim = Math.max(len, rad * 2);
        } else if ("points" in p && p.points && p.points.length > 0) {
          padCx = p.points.reduce((acc, pt) => acc + pt.x, 0) / p.points.length;
          padCy = p.points.reduce((acc, pt) => acc + pt.y, 0) / p.points.length;
        }

        const numSize = Math.max(0.45, Math.min(0.85, padDim * 0.45));
        const numThickness = Math.max(0.06, numSize * 0.16);

        const fontStrokes = generateHersheyTextStrokes({
          text: padNumStr,
          x: padCx,
          y: padCy,
          size: numSize,
          thickness: numThickness,
          rotation: 0,
          layer: "drill",
          justify: "center",
          verticalAlign: "middle",
        });
        for (const stroke of fontStrokes) {
          addSeg(stroke.p0, stroke.p1, stroke.strokeWidth || numThickness, 0, 1.0, 1.0, 1.0, 0.95, 0.0, dimAlpha);
        }
      }
    }

    // -------------------------------------------------------------------------
    // B. SILKSCREEN, FAB OUTLINES & PROCEDURAL COURTYARD (Strokes)
    // -------------------------------------------------------------------------
    if (isSilkscreen || isFab || isCourtyard || isOtherGraphic) {
      switch (p.kind) {
        case "line": {
          addSeg(p.start, p.end, strokeW, 0, r, g, b, a, isDashed, dimAlpha);
          break;
        }
        case "rect": {
          const x1 = Math.min(p.start.x, p.end.x);
          const x2 = Math.max(p.start.x, p.end.x);
          const y1 = Math.min(p.start.y, p.end.y);
          const y2 = Math.max(p.start.y, p.end.y);
          let pts = [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ];
          if (p.rotation) {
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const rad = (p.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            pts = pts.map((pt) => {
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
            });
          }
          let len = 0;
          len += addSeg(pts[0], pts[1], strokeW, len, r, g, b, a, isDashed, dimAlpha);
          len += addSeg(pts[1], pts[2], strokeW, len, r, g, b, a, isDashed, dimAlpha);
          len += addSeg(pts[2], pts[3], strokeW, len, r, g, b, a, isDashed, dimAlpha);
          addSeg(pts[3], pts[0], strokeW, len, r, g, b, a, isDashed, dimAlpha);
          break;
        }
        case "circle": {
          const steps = 36;
          const cx = p.center.x, cy = p.center.y, rad = p.radius;
          let len = 0;
          for (let i = 0; i < steps; i++) {
            const a0 = (i / steps) * Math.PI * 2;
            const a1 = ((i + 1) / steps) * Math.PI * 2;
            const p0 = { x: cx + Math.cos(a0) * rad, y: cy + Math.sin(a0) * rad };
            const p1 = { x: cx + Math.cos(a1) * rad, y: cy + Math.sin(a1) * rad };
            len += addSeg(p0, p1, strokeW, len, r, g, b, a, isDashed, dimAlpha);
          }
          break;
        }
        case "arc": {
          const steps = 24;
          const cx = p.center.x, cy = p.center.y, rad = p.radius;
          const startA = Math.atan2(p.start.y - cy, p.start.x - cx);
          const sweep = p.sweepRadians || 0;
          let len = 0;
          for (let i = 0; i < steps; i++) {
            const a0 = startA + (i / steps) * sweep;
            const a1 = startA + ((i + 1) / steps) * sweep;
            const p0 = { x: cx + Math.cos(a0) * rad, y: cy + Math.sin(a0) * rad };
            const p1 = { x: cx + Math.cos(a1) * rad, y: cy + Math.sin(a1) * rad };
            len += addSeg(p0, p1, strokeW, len, r, g, b, a, isDashed, dimAlpha);
          }
          break;
        }
        case "polygon": {
          if (p.points && p.points.length > 1) {
            let len = 0;
            for (let i = 0; i < p.points.length; i++) {
              const p0 = p.points[i];
              const p1 = p.points[(i + 1) % p.points.length];
              len += addSeg(p0, p1, strokeW, len, r, g, b, a, isDashed, dimAlpha);
            }
          }
          break;
        }
        case "text": {
          // Property / fp_text "reference" and "value" carry placeholders ("REF**", "VAL**"); KiCad shows
          // the real reference designator / value instead. Every other text (including fab-layer user
          // text such as "${REFERENCE}") is drawn too, with its variables expanded, in its own layer colour.
          const isRef = p.role === "reference" || p.text === "REF**";
          const isVal = p.role === "value" || p.text === "VAL**";

          if (isRef && layerVisibility["Reference"] === false) break;
          if (isVal && layerVisibility["Value"] === false) break;

          let displayStr = p.text || "";
          if (isRef) displayStr = reference || "REF**";
          else if (isVal) displayStr = value || "VAL**";
          else displayStr = resolveFootprintText(displayStr, { reference, value });
          if (!displayStr) break;

          const fontStrokes = generateHersheyTextStrokes({
            text: displayStr,
            x: p.position.x,
            y: p.position.y,
            size: p.size?.y || 1.0,
            thickness: p.thickness || 0.15,
            rotation: p.rotation || 0,
            layer: item.layer,
            justify: p.anchor === "start" ? "left" : p.anchor === "end" ? "right" : "center",
            verticalAlign: "middle",
            bold: !!(p as any).bold,
            italic: !!(p as any).italic,
            mirror: !!(p as any).mirror,
          });

          let textR = r, textG = g, textB = b;
          if (isRef) {
            const silkColorHex = getKicadLayerColor("silkscreen", layerColors);
            const [sr, sg, sb] = parseHexColor(silkColorHex);
            textR = sr; textG = sg; textB = sb;
          } else if (isVal) {
            const fabColorHex = getKicadLayerColor("top_fab", layerColors);
            const [fr, fg, fb] = parseHexColor(fabColorHex);
            textR = fr; textG = fg; textB = fb;
          }

          for (const stroke of fontStrokes) {
            addSeg(stroke.p0, stroke.p1, stroke.strokeWidth || p.thickness || 0.15, 0, textR, textG, textB, 1.0, 0.0, dimAlpha);
          }
          break;
        }
      }
    }
  }

  return {
    bodyFillVertices,
    padFillVertices,
    segments,
    padRanges,
  };
}

