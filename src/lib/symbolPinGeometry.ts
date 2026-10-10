/**
 * Pin geometry for built-in / generated symbols, derived from what the symbol
 * actually draws (its lead lines and body rectangle) instead of assuming a fixed
 * lead length. This is what lets pin names sit just inside the body, opposite
 * their pin and clear of the frame for ANY lead length or body size.
 *
 * Coordinates are symbol-local schematic units (Y down). `inward` is the axis
 * unit vector pointing from the pin's connection point into the body.
 */
export interface PinGeoInput {
  width: number;
  height: number;
  pins: { x: number; y: number; hide?: boolean }[];
  draw?: (color: string) => unknown;
}

export interface PinGeo {
  inward: { x: number; y: number };   // (±1,0) or (0,±1)
  innerEnd: { x: number; y: number };  // where the lead meets the body
  lead: number;                        // lead length
  confident: boolean;                  // derived from real drawn geometry
}

export interface SymbolPinGeometry {
  pins: PinGeo[];
  /** Inner body rectangle (from the drawn frame, else from the lead ends). */
  body: { x0: number; y0: number; x1: number; y1: number };
}

interface Ln { x1: number; y1: number; x2: number; y2: number }
interface Rc { x0: number; y0: number; x1: number; y1: number }

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : d;
};

function walk(node: any, lines: Ln[], rects: Rc[], depth = 0): void {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return;
  if (depth > 12) return;
  if (Array.isArray(node)) { for (const c of node) walk(c, lines, rects, depth + 1); return; }
  const props = node.props ?? node.p;
  const type = node.type ?? node.t;
  if (!props) return;
  if (type === "line") {
    lines.push({ x1: num(props.x1), y1: num(props.y1), x2: num(props.x2), y2: num(props.y2) });
  } else if (type === "rect") {
    const x = num(props.x), y = num(props.y), w = num(props.width), h = num(props.height);
    if (w > 0 && h > 0) rects.push({ x0: x, y0: y, x1: x + w, y1: y + h });
  }
  if (props.children !== undefined) walk(props.children, lines, rects, depth + 1);
}

const EPS = 0.03;
const near = (a: number, b: number, e = EPS) => Math.abs(a - b) <= e;
const cache = new Map<string, SymbolPinGeometry>();

function sideDir(sym: PinGeoInput, p: { x: number; y: number }) {
  const dl = p.x, dr = sym.width - p.x, dt = p.y, db = sym.height - p.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: 1, y: 0 };
  if (m === dr) return { x: -1, y: 0 };
  if (m === dt) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

export function getSymbolPinGeometry(id: string, sym: PinGeoInput): SymbolPinGeometry {
  const hit = cache.get(id);
  if (hit) return hit;

  const lines: Ln[] = [];
  const rects: Rc[] = [];
  try { walk(sym.draw?.("#000"), lines, rects); } catch { /* draw is best-effort */ }

  const pins: PinGeo[] = sym.pins.map((p) => {
    // 1) A drawn lead line that starts at the pin.
    let best: { end: { x: number; y: number }; len: number } | null = null;
    for (const l of lines) {
      const a = near(l.x1, p.x) && near(l.y1, p.y);
      const b = near(l.x2, p.x) && near(l.y2, p.y);
      if (!a && !b) continue;
      const end = a ? { x: l.x2, y: l.y2 } : { x: l.x1, y: l.y1 };
      const len = Math.hypot(end.x - p.x, end.y - p.y);
      if (len < 0.05) continue;
      if (!best || len > best.len) best = { end, len };
    }
    if (best) {
      const dx = best.end.x - p.x, dy = best.end.y - p.y;
      const inward = Math.abs(dx) >= Math.abs(dy)
        ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
      return { inward, innerEnd: best.end, lead: best.len, confident: true };
    }
    // 2) No lead drawn: nearest body frame edge ahead of the pin.
    const inward = sideDir(sym, p);
    let bestEdge: number | null = null;
    for (const r of rects) {
      if (inward.x !== 0) {
        if (p.y < r.y0 - EPS || p.y > r.y1 + EPS) continue;
        const edge = inward.x > 0 ? r.x0 : r.x1;
        const d = (edge - p.x) * inward.x;
        if (d >= -EPS && (bestEdge === null || d < bestEdge)) bestEdge = d;
      } else {
        if (p.x < r.x0 - EPS || p.x > r.x1 + EPS) continue;
        const edge = inward.y > 0 ? r.y0 : r.y1;
        const d = (edge - p.y) * inward.y;
        if (d >= -EPS && (bestEdge === null || d < bestEdge)) bestEdge = d;
      }
    }
    const lead = bestEdge !== null ? Math.max(0, bestEdge) : 0.5;
    return {
      inward,
      innerEnd: { x: p.x + inward.x * lead, y: p.y + inward.y * lead },
      lead,
      confident: bestEdge !== null,
    };
  });

  // Body rectangle: the drawn frame that contains most lead ends, else bbox of lead ends.
  let body: SymbolPinGeometry["body"] | null = null;
  let bestScore = 0;
  for (const r of rects) {
    let score = 0;
    for (const g of pins) {
      const e = g.innerEnd;
      if (e.x >= r.x0 - EPS && e.x <= r.x1 + EPS && e.y >= r.y0 - EPS && e.y <= r.y1 + EPS) score++;
    }
    const area = (r.x1 - r.x0) * (r.y1 - r.y0);
    if (score > bestScore || (score === bestScore && score > 0 && body && area > (body.x1 - body.x0) * (body.y1 - body.y0))) {
      bestScore = score; body = { ...r };
    }
  }
  if (!body) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of pins) {
      x0 = Math.min(x0, g.innerEnd.x); x1 = Math.max(x1, g.innerEnd.x);
      y0 = Math.min(y0, g.innerEnd.y); y1 = Math.max(y1, g.innerEnd.y);
    }
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = sym.width; y1 = sym.height; }
    body = { x0, y0, x1, y1 };
  }

  const out = { pins, body };
  cache.set(id, out);
  return out;
}

/** Text placement for a pin name/number given the pin's inward axis after rotation. */
export function pinTextOrientation(
  inwardLocal: { x: number; y: number },
  rotationDeg: number,
  mirrorX = false,
  mirrorY = false,
): { rotationDeg: 0 | -90; justify: "left" | "right"; vertical: boolean } {
  let dx = inwardLocal.x, dy = inwardLocal.y;
  if (mirrorY) dx = -dx;
  if (mirrorX) dy = -dy;
  const r = (rotationDeg * Math.PI) / 180;
  const wx = dx * Math.cos(r) - dy * Math.sin(r);
  const wy = dx * Math.sin(r) + dy * Math.cos(r);
  // Horizontal pin: text stays horizontal and always reads left-to-right.
  if (Math.abs(wx) >= Math.abs(wy)) return { rotationDeg: 0, justify: wx >= 0 ? "left" : "right", vertical: false };
  // Vertical pin: text reads bottom-to-top (KiCad convention). Inward-up starts at the
  // anchor (left-justified); inward-down ends at the anchor (right-justified).
  return { rotationDeg: -90, justify: wy < 0 ? "left" : "right", vertical: true };
}

/** Upright rotation for text that runs along an axis (numbers, centred names). */
export function uprightAxisRotation(axisIsVerticalLocal: boolean, rotationDeg: number): 0 | -90 {
  const total = (((rotationDeg + (axisIsVerticalLocal ? 90 : 0)) % 180) + 180) % 180;
  return Math.abs(total - 90) < 45 ? -90 : 0;
}

/** One pin-name size for built-in, generated and KiCad-repository symbols (world units). */
export const PIN_NAME_FONT = 0.32;
/** Smallest size a pin name may shrink to before we prefer keeping it legible. */
export const PIN_NAME_MIN_FONT = 0.2;
