// Walks the React element tree that a SymbolDef's draw(stroke) returns (rect/circle/line/
// polygon/polyline/path/g — see src/lib/symbols.tsx) and flattens it into plain geometric
// primitives, in the symbol's own local coordinate space, that a WebGL pass can batch and
// draw directly. Vectorized once per symbol id and cached — symbol glyphs are static data,
// only their instance transform (position/rotation/scale) and color change per node.
import { Fragment, isValidElement } from "react";
import { flattenPath } from "./svgPathFlatten";

export type VecPrimitive =
  | { kind: "stroke"; points: [number, number][]; closed: boolean; color: string; width: number }
  | { kind: "fill"; points: [number, number][]; color: string };

// Sentinel passed as the `stroke` argument when vectorizing: any element whose stroke/fill is
// exactly this string was using the symbol's dynamic color parameter (the common `S(c)` /
// `SF(c)` convention) and gets recolored per-instance; a literal color elsewhere (e.g. a
// hardcoded LED dot) is preserved as authored.
export const VEC_SENTINEL = "\u0000SYMBOL_DYNAMIC_COLOR\u0000";

interface InheritedStyle {
  stroke: string;
  fill: string;
  strokeWidth: number;
}

const DEFAULT_STYLE: InheritedStyle = { stroke: "none", fill: "none", strokeWidth: 0.12 };

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parsePointsAttr(points: unknown): [number, number][] {
  if (typeof points !== "string") return [];
  const nums = points.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function circlePoints(cx: number, cy: number, r: number, segments = 24): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function rectPoints(x: number, y: number, w: number, h: number): [number, number][] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function walk(node: unknown, inherited: InheritedStyle, out: VecPrimitive[]): void {
  if (node === null || node === undefined || node === false || node === true) return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, inherited, out));
    return;
  }
  if (typeof node === "string" || typeof node === "number") return; // text content: not vectorized
  if (!isValidElement(node)) return;

  const props = (node.props ?? {}) as Record<string, unknown>;
  const style: InheritedStyle = {
    stroke: (props.stroke as string) ?? inherited.stroke,
    fill: (props.fill as string) ?? inherited.fill,
    strokeWidth: props.strokeWidth !== undefined ? num(props.strokeWidth, inherited.strokeWidth) : inherited.strokeWidth,
  };

  const type = node.type;

  const addStroke = (points: [number, number][], closed: boolean) => {
    if (style.stroke && style.stroke !== "none" && points.length >= 2) {
      out.push({ kind: "stroke", points, closed, color: style.stroke, width: style.strokeWidth });
    }
  };
  const addFill = (points: [number, number][]) => {
    if (style.fill && style.fill !== "none" && points.length >= 3) {
      out.push({ kind: "fill", points, color: style.fill });
    }
  };

  if (type === "line") {
    addStroke([[num(props.x1), num(props.y1)], [num(props.x2), num(props.y2)]], false);
  } else if (type === "rect") {
    const x = num(props.x), y = num(props.y), w = num(props.width), h = num(props.height);
    const pts = rectPoints(x, y, w, h);
    addFill(pts);
    addStroke(pts, true);
  } else if (type === "circle") {
    const pts = circlePoints(num(props.cx), num(props.cy), num(props.r));
    addFill(pts);
    addStroke(pts, true);
  } else if (type === "polygon") {
    const pts = parsePointsAttr(props.points);
    addFill(pts);
    addStroke(pts, true);
  } else if (type === "polyline") {
    const pts = parsePointsAttr(props.points);
    addStroke(pts, false);
  } else if (type === "path") {
    const subs = flattenPath((props.d as string) ?? "");
    for (const sub of subs) {
      addFill(sub.points);
      addStroke(sub.points, sub.closed);
    }
  } else if (type === "text") {
    // Text labels stay out of the WebGL glyph — rendered separately (or left as SVG) since
    // this is a geometric-primitive vectorizer, not a text/font rasterizer.
  } else if (type === Fragment || typeof type === "string" || typeof type === "function") {
    // "g" and any other wrapper: recurse into children with the (possibly updated) inherited
    // style. Also tolerates custom component types defensively (no-op if they have no
    // children prop), so an unexpected element never throws.
    walk(props.children, style, out);
  }
}

const cache = new Map<string, VecPrimitive[]>();

export function vectorizeSymbol(
  symbolId: string,
  draw: (stroke: string) => JSX.Element
): VecPrimitive[] {
  const cached = cache.get(symbolId);
  if (cached) return cached;
  const out: VecPrimitive[] = [];
  try {
    const tree = draw(VEC_SENTINEL);
    walk(tree, DEFAULT_STYLE, out);
  } catch (err) {
    console.error(`vectorizeSymbol: failed to vectorize "${symbolId}"`, err);
  }
  cache.set(symbolId, out);
  return out;
}

/** Resolve a primitive's authored color to a runtime color, substituting the sentinel. */
export function resolveVecColor(color: string, runtimeColor: string): string {
  return color === VEC_SENTINEL ? runtimeColor : color;
}
