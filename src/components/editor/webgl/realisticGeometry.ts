// Pure geometry for the realistic schematic view. No React, no SVG, no GL calls.
//
// Every component is emitted as coloured triangles (x, y, r, g, b, a — premultiplied alpha)
// in the node's LOCAL grid units. Realism comes from per-vertex lighting:
//   * cylinders (resistor bodies, wires, leads…) are drawn as parallel lanes lit with a
//     real diffuse + specular model, so they look round;
//   * spheres / domes (LED lens, solder, knobs…) are stacked shifted discs;
//   * every part casts a soft multi-layer shadow (kept in a separate buffer that is drawn
//     first, so shadows never darken neighbouring parts);
//   * the light direction is fixed in SCREEN space: geometry is lit with the component's
//     rotation taken into account, so rotating a part does not rotate its highlights.

export type RGB = [number, number, number];
type V = [number, number];
export interface PinLike { x: number; y: number; name?: string }
export interface RealisticInput {
  symbolId: string;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  value?: string;
  color?: string;
  glowing?: boolean;
  alpha?: number;
  /** Node metadata — generated connectors carry gender / rows / colour / wire entry here. */
  metadata?: any;
}
export interface Mark { text: string; x: number; y: number; size: number; color: RGB }
export interface RealisticGeometry { main: Float32Array; shadow: Float32Array; marks: Mark[] }

// ---------------------------------------------------------------------------------------------
// colour + lighting
// ---------------------------------------------------------------------------------------------
const NAMED: Record<string, string> = {
  black: "#111827", white: "#f8fafc", red: "#ef4444", green: "#22c55e", blue: "#3b82f6",
  yellow: "#eab308", orange: "#f97316", purple: "#a855f7", gray: "#64748b", grey: "#64748b", cyan: "#06b6d4",
};
export function rgb(hex: string): RGB {
  const h = (NAMED[(hex || "").toLowerCase()] || hex || "#64748b").replace("#", "");
  if (/^[0-9a-f]{3}$/i.test(h)) return [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255];
  if (/^[0-9a-f]{6}$/i.test(h)) return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  return [0.39, 0.45, 0.55];
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mixc = (a: RGB, b: RGB, t: number): RGB => { t = clamp01(t); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
const mulc = (a: RGB, k: number): RGB => [clamp01(a[0] * k), clamp01(a[1] * k), clamp01(a[2] * k)];
const WHITE: RGB = [1, 1, 1];
const BLACK: RGB = [0, 0, 0];

const LN = Math.hypot(-0.45, -0.6, 0.66);
const LX = -0.45 / LN, LY = -0.6 / LN, LZ = 0.66 / LN;
const HN = Math.hypot(LX, LY, LZ + 1);
const HX = LX / HN, HY = LY / HN, HZ = (LZ + 1) / HN;

let ROT = 0; // current instance rotation in radians (lighting is world-fixed)
let OUT: number[] = [];
let SH: number[] = [];
let MK: Mark[] = [];

function lit(base: RGB, nx: number, ny: number, nz: number, spec = 0.5, shin = 30): RGB {
  const c = Math.cos(ROT), s = Math.sin(ROT);
  const wx = nx * c - ny * s, wy = nx * s + ny * c;
  const d = Math.max(0, wx * LX + wy * LY + nz * LZ);
  const k = 0.34 + 0.86 * d;
  const sp = Math.pow(Math.max(0, wx * HX + wy * HY + nz * HZ), shin) * spec;
  return [clamp01(base[0] * k + sp), clamp01(base[1] * k + sp), clamp01(base[2] * k + sp)];
}
// light direction expressed in local (pre-rotation) space
const lightLocal = (): V => { const c = Math.cos(ROT), s = Math.sin(ROT); return [LX * c + LY * s, -LX * s + LY * c]; };

// ---------------------------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------------------------
function vtx(a: number[], p: V, c: RGB, al: number) { a.push(p[0], p[1], c[0] * al, c[1] * al, c[2] * al, al); }
function tri(a: number[], p: V, q: V, r: V, cp: RGB, cq: RGB = cp, cr: RGB = cp, al = 1) { vtx(a, p, cp, al); vtx(a, q, cq, al); vtx(a, r, cr, al); }

function disc(cx: number, cy: number, r: number, c: RGB, al = 1, seg = 28, arr: number[] = OUT) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    tri(arr, [cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r], c, c, c, al);
  }
}
// sphere/dome: stacked discs walking toward the light, hottest disc = specular
function ball(cx: number, cy: number, r: number, base: RGB, spec = 0.85, al = 1) {
  const [lx, ly] = lightLocal();
  const K = 9;
  for (let i = 0; i < K; i++) {
    const t = i / (K - 1);
    const rr = r * (1 - t * 0.9);
    const b = 0.28 + 0.9 * Math.pow(t, 0.9);
    let c = mulc(base, b);
    if (t > 0.75) c = mixc(c, WHITE, ((t - 0.75) / 0.25) * spec);
    disc(cx + lx * r * 0.6 * t, cy + ly * r * 0.6 * t, rr, c, al, 26);
  }
}
// lit tube from a to b (diameter w) made of lanes with per-vertex lighting
function tube(a: V, b: V, w: number, base: RGB, o: { spec?: number; shin?: number; alpha?: number; n?: number; arr?: number[]; t0?: number; t1?: number } = {}) {
  const arr = o.arr ?? OUT, al = o.alpha ?? 1, N = o.n ?? 8, ta = o.t0 ?? -1, tb = o.t1 ?? 1;
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const nx = -dy, ny = dx, hw = w / 2;
  const col = (t: number) => lit(base, nx * t, ny * t, Math.sqrt(Math.max(0, 1 - t * t)), o.spec ?? 0.5, o.shin ?? 30);
  for (let i = 0; i < N; i++) {
    const t0 = ta + ((tb - ta) * i) / N, t1 = ta + ((tb - ta) * (i + 1)) / N;
    const c0 = col(t0), c1 = col(t1);
    const A0: V = [a[0] + nx * hw * t0, a[1] + ny * hw * t0], A1: V = [a[0] + nx * hw * t1, a[1] + ny * hw * t1];
    const B0: V = [b[0] + nx * hw * t0, b[1] + ny * hw * t0], B1: V = [b[0] + nx * hw * t1, b[1] + ny * hw * t1];
    tri(arr, A0, A1, B1, c0, c1, c1, al); tri(arr, A0, B1, B0, c0, c1, c0, al);
  }
}
// flat (unlit) line
function flat(a: V, b: V, w: number, c: RGB, al = 1, arr: number[] = OUT) {
  let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const nx = -dy * w / 2, ny = dx * w / 2;
  const A: V = [a[0] + nx, a[1] + ny], B: V = [b[0] + nx, b[1] + ny], C: V = [b[0] - nx, b[1] - ny], D: V = [a[0] - nx, a[1] - ny];
  tri(arr, A, B, C, c, c, c, al); tri(arr, A, C, D, c, c, c, al);
}
function rrPts(x: number, y: number, w: number, h: number, r: number, seg = 5): V[] {
  r = Math.max(0.0001, Math.min(r, w / 2, h / 2));
  const pts: V[] = [];
  const corners: [number, number, number][] = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= seg; i++) { const a = ((a0 + (90 * i) / seg) * Math.PI) / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
function fanPoly(pts: V[], cf: (p: V) => RGB, al = 1, arr: number[] = OUT) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  const cc = cf([cx, cy]); const cs = pts.map(cf);
  for (let i = 0; i < pts.length; i++) tri(arr, [cx, cy], pts[i], pts[(i + 1) % pts.length], cc, cs[i], cs[(i + 1) % pts.length], al);
}
// Rounded rectangle meshed as a rows x cols grid so gradients stay smooth (a triangle fan
// would show an "X" pattern on large boards / boxes).
function rrMesh(x: number, y: number, w: number, h: number, r: number, cf: (p: V) => RGB, al = 1) {
  r = Math.max(0.0001, Math.min(r, w / 2, h / 2));
  const ys: number[] = [0, r * 0.15, r * 0.5, r];
  const inner = Math.max(1, Math.round((h - 2 * r) / 0.35));
  for (let i = 1; i < inner; i++) ys.push(r + ((h - 2 * r) * i) / inner);
  ys.push(h - r, h - r * 0.5, h - r * 0.15, h);
  const C = 6;
  const row = (dy: number): V[] => {
    const d = Math.min(dy, h - dy);
    const inset = d >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
    const l = x + inset, rr = x + w - inset, out: V[] = [];
    for (let c = 0; c <= C; c++) out.push([l + ((rr - l) * c) / C, y + dy]);
    return out;
  };
  let prev = row(ys[0]), prevC = prev.map(cf);
  for (let k = 1; k < ys.length; k++) {
    if (ys[k] - ys[k - 1] < 1e-6) continue;
    const cur = row(ys[k]), curC = cur.map(cf);
    for (let c = 0; c < C; c++) {
      tri(OUT, prev[c], prev[c + 1], cur[c + 1], prevC[c], prevC[c + 1], curC[c + 1], al);
      tri(OUT, prev[c], cur[c + 1], cur[c], prevC[c], curC[c + 1], curC[c], al);
    }
    prev = cur; prevC = curC;
  }
}
function rrect(x: number, y: number, w: number, h: number, r: number, top: RGB, bottom: RGB, al = 1) {
  rrMesh(x, y, w, h, r, (p) => mixc(top, bottom, (p[1] - y) / h), al);
}
// rounded box with gentle left/top-lit shading + bevel (plastic bodies)
function plastic(x: number, y: number, w: number, h: number, r: number, base: RGB, spec = 0.35) {
  rrMesh(x, y, w, h, r, (p) => {
    const tx = ((p[0] - x) / w) * 2 - 1, ty = ((p[1] - y) / h) * 2 - 1;
    const ex = Math.pow(Math.abs(tx), 6), ey = Math.pow(Math.abs(ty), 6); // only the rim curves
    const nx = Math.sign(tx) * ex * 0.7, ny = Math.sign(ty) * ey * 0.7;
    return lit(base, nx, ny, Math.sqrt(Math.max(0.2, 1 - nx * nx - ny * ny)), spec * (0.4 + 0.6 * (1 - ty) / 2), 22);
  });
  const e = 0.03;
  flat([x + r, y + e], [x + w - r, y + e], 0.03, WHITE, 0.28);
  flat([x + e, y + r], [x + e, y + h - r], 0.03, WHITE, 0.18);
  flat([x + r, y + h - e], [x + w - r, y + h - e], 0.03, BLACK, 0.3);
  flat([x + w - e, y + r], [x + w - e, y + h - r], 0.03, BLACK, 0.22);
}
function shadowRR(x: number, y: number, w: number, h: number, r: number, depth = 1) {
  for (let k = 0; k < 5; k++) {
    const g = k * 0.04 * depth;
    fanPoly(rrPts(x - g + 0.05 * depth, y - g + 0.09 * depth, w + 2 * g, h + 2 * g, r + g, 4), () => BLACK, 0.085, SH);
  }
}
function shadowDisc(cx: number, cy: number, r: number, depth = 1) {
  for (let k = 0; k < 5; k++) disc(cx + 0.05 * depth, cy + 0.09 * depth, r + k * 0.04 * depth, BLACK, 0.085, 22, SH);
}
function shadowLine(a: V, b: V, w: number) { flat([a[0] + 0.04, a[1] + 0.07], [b[0] + 0.04, b[1] + 0.07], w * 1.6, BLACK, 0.16, SH); }
function mark(text: string, x: number, y: number, size: number, c: RGB = [0.93, 0.95, 0.98]) { if (text) MK.push({ text, x, y, size, color: c }); }

function ellipse(cx: number, cy: number, rx: number, ry: number, cf: RGB | ((p: V) => RGB), al = 1, arr: number[] = OUT, seg = 26) {
  const pts: V[] = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  fanPoly(pts, typeof cf === "function" ? cf : () => cf, al, arr);
}
// 0.1" radial legs: two vertical legs drop from the body, then bend out to each pin
function radialLegs(pins: PinLike[], cx: number, yTop: number, spread: number, w = 0.075, base: RGB = STEEL) {
  const seg = (a: V, b: V) => { shadowLine(a, b, w); tube(a, b, w, base, { spec: 0.9, shin: 18, n: 6 }); };
  const sorted = [...pins].sort((a, b) => a.x - b.x);
  sorted.forEach((p, i) => {
    const side = pins.length === 2 ? (i === 0 ? -1 : 1) : p.x < cx ? -1 : 1;
    const lx = cx + (side * spread) / 2;
    seg([lx, yTop], [lx, p.y]);
    if (Math.abs(lx - p.x) > 0.02) { seg([lx, p.y], [p.x, p.y]); ball(lx, p.y, w * 0.55, base, 0.7); }
    ball(p.x, p.y, w * 0.85, base, 0.9);
  });
}
function capCode(value: string): string {
  const m = (value || "").replace(/\s/g, "").match(/^([\d.]+)([pnuµμm]?)/i);
  if (!m) return "104";
  const mul: Record<string, number> = { p: 1, n: 1e3, u: 1e6, "µ": 1e6, "μ": 1e6, m: 1e9 };
  const pf = parseFloat(m[1]) * (mul[(m[2] || "u").toLowerCase()] ?? 1e6);
  if (!Number.isFinite(pf) || pf <= 0) return "104";
  if (pf < 100) return String(Math.round(pf));
  const exp = Math.floor(Math.log10(pf)) - 1;
  return String(Math.round(pf / Math.pow(10, exp))).slice(0, 2) + String(Math.max(0, exp));
}
const cleanTxt = (t: string) => (t || "").replace(/[µμ]/g, "u").replace(/Ω/g, "").trim();

// ---------------------------------------------------------------------------------------------
// materials & shared helpers
// ---------------------------------------------------------------------------------------------
const STEEL = rgb("#cfd6df");
const GOLD = rgb("#e2b33e");
const COPPER = rgb("#d9863f");
const IC_BLACK = rgb("#20242d");
interface Box { x: number; y: number; w: number; h: number }

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// metal lead from each pin to the nearest point of the body — this is what makes wires meet parts
function pinLeads(pins: PinLike[], body: Box, o: { w?: number; base?: RGB; tip?: boolean } = {}) {
  const w = o.w ?? 0.1, base = o.base ?? STEEL;
  const seg = (a: V, b: V) => { shadowLine(a, b, w); tube(a, b, w, base, { spec: 0.9, shin: 18, n: 6 }); };
  for (const p of pins) {
    const tx = Math.min(Math.max(p.x, body.x), body.x + body.w), ty = Math.min(Math.max(p.y, body.y), body.y + body.h);
    const dx = Math.abs(tx - p.x), dy = Math.abs(ty - p.y);
    if (Math.hypot(dx, dy) < 0.03) continue;
    if (dx > 0.15 && dy > 0.15) {
      // bent lead: leaves the body straight, then runs along to the pin
      const elbow: V = [p.x, ty];
      seg(elbow, [tx, ty]); seg([p.x, p.y], elbow);
      ball(elbow[0], elbow[1], w * 0.5, base, 0.8);
    } else seg([p.x, p.y], [tx, ty]);
    if (o.tip !== false) ball(p.x, p.y, w * 0.62, base, 0.9);
  }
}

// ---------------------------------------------------------------------------------------------
// discrete components
// ---------------------------------------------------------------------------------------------
const BAND = ["#0b0b0b", "#7c3f12", "#dc2626", "#f97316", "#facc15", "#16a34a", "#2563eb", "#7c3aed", "#6b7280", "#f8fafc"];
function resistorBands(value: string): string[] {
  const m = (value || "").replace(/[\sΩ]|ohms?/gi, "").match(/^([\d.]+)([kKmMgGrR]?)/);
  let n = m ? parseFloat(m[1]) : 1000;
  if (!m) n = 1000;
  const u = m ? m[2] : "k";
  if (u === "k" || u === "K") n *= 1e3; else if (u === "m" || u === "M" || u === "g" || u === "G") n *= 1e6;
  if (!Number.isFinite(n) || n <= 0) n = 1000;
  let exp = Math.floor(Math.log10(n)), sig = Math.round(n / Math.pow(10, exp - 1));
  if (sig >= 100) { sig = Math.round(sig / 10); exp += 1; }
  const mult = exp - 1;
  const mc = mult >= 0 ? BAND[Math.min(9, mult)] : mult === -1 ? "#c9a227" : "#c0c4cc";
  return [BAND[Math.floor(sig / 10) % 10], BAND[sig % 10], mc, "#c9a227"];
}

function resistor(w: number, h: number, value: string, pins: PinLike[]) {
  const cy = h / 2, x0 = 0.72, x1 = w - 0.72, R = 0.25;
  shadowRR(x0, cy - R, x1 - x0, 2 * R, 0.22);
  pinLeads(pins, { x: x0, y: cy - 0.04, w: x1 - x0, h: 0.08 });
  const body = rgb("#e4cd9a");
  tube([x0 + 0.2, cy], [x1 - 0.2, cy], R * 1.6, body, { spec: 0.35 });
  tube([x0, cy], [x0 + 0.34, cy], R * 2.05, body, { spec: 0.35 });
  tube([x1 - 0.34, cy], [x1, cy], R * 2.05, body, { spec: 0.35 });
  const b = resistorBands(value), bx = [x0 + 0.5, x0 + 0.72, x0 + 0.94, x1 - 0.55];
  b.forEach((c, i) => tube([bx[i], cy], [bx[i] + (i === 3 ? 0.1 : 0.11), cy], R * 1.66, rgb(c), { spec: 0.3, n: 6 }));
}
// Ceramic disc capacitor, standing upright: dipped disc + two vertical legs
function ceramicCap(w: number, h: number, pins: PinLike[], value: string, base = "#d98b2b", code?: string) {
  const cx = w / 2, cy = h / 2, R = 0.5, dcy = cy - 0.42 - R * 0.95;
  radialLegs(pins, cx, dcy + R * 0.8, 0.62);
  shadowDisc(cx, dcy, R);
  // dipped coating: slightly egg-shaped, thicker at the bottom
  ball(cx, dcy, R, rgb(base), 0.6);
  ellipse(cx, dcy + R * 0.86, R * 0.42, R * 0.13, mulc(rgb(base), 0.62), 0.9);
  disc(cx - R * 0.35, dcy - R * 0.38, R * 0.14, WHITE, 0.55, 14);
  mark(code ?? capCode(value), cx, dcy + 0.02, 0.27, [0.28, 0.14, 0.03]);
}
// Radial aluminium electrolytic: sleeve, cathode stripe with minus signs, vented top, rubber base
function electrolytic(w: number, h: number, pins: PinLike[], color: string, value: string) {
  const cx = w / 2, cy = h / 2, bw = 1.05, bh = 1.3, bot = cy - 0.42, top = bot - bh;
  radialLegs(pins, cx, bot, 0.62);
  shadowRR(cx - bw / 2, top - 0.05, bw, bh + 0.05, 0.1);
  const sleeve = rgb(color);
  tube([cx, top + 0.1], [cx, bot - 0.06], bw, sleeve, { spec: 0.55, shin: 26, n: 14 });
  // cathode stripe (right side) with "−" marks
  tube([cx, top + 0.1], [cx, bot - 0.06], bw, rgb("#dfe4ec"), { spec: 0.35, shin: 24, n: 6, t0: -0.9, t1: -0.42 });
  for (let i = 0; i < 4; i++) flat([cx + 0.2, top + 0.28 + i * 0.26], [cx + 0.34, top + 0.28 + i * 0.26], 0.045, rgb("#1f2937"), 0.9);
  // rubber seal at the base + crimp grooves near the top
  tube([cx, bot - 0.07], [cx, bot], bw * 0.98, rgb("#15171c"), { spec: 0.3, n: 10 });
  tube([cx, top + 0.1], [cx, top + 0.16], bw * 0.99, mulc(sleeve, 0.55), { spec: 0.2, n: 10 });
  // aluminium top: rim + slightly tilted face with a K-shaped vent score
  tube([cx, top + 0.02], [cx, top + 0.1], bw * 1.0, rgb("#c9d0da"), { spec: 0.95, shin: 20, n: 10 });
  ellipse(cx, top + 0.03, bw / 2, 0.14, (p) => { const t = (p[0] - cx) / (bw / 2); return lit(rgb("#c9d0da"), t * 0.5, -0.2, 0.85, 0.9, 16); });
  flat([cx - bw * 0.3, top + 0.03], [cx + bw * 0.3, top + 0.03], 0.02, rgb("#7b8595"), 0.9);
  flat([cx - bw * 0.06, top - 0.06], [cx + bw * 0.06, top + 0.11], 0.02, rgb("#7b8595"), 0.9);
  const t = cleanTxt(value);
  if (t) mark(t.slice(0, 7), cx - 0.16, top + 0.62, 0.2, [0.93, 0.95, 1]);
}
function inductor(w: number, h: number, pins: PinLike[]) {
  const cy = h / 2, x0 = 0.85, x1 = w - 0.85;
  shadowRR(x0, cy - 0.34, x1 - x0, 0.68, 0.3);
  pinLeads(pins, { x: x0, y: cy - 0.05, w: x1 - x0, h: 0.1 });
  tube([x0, cy], [x1, cy], 0.55, rgb("#3b404c"), { spec: 0.4 });
  const n = 8, step = (x1 - x0 - 0.2) / n;
  for (let i = 0; i < n; i++) { const x = x0 + 0.08 + i * step; tube([x, cy - 0.33], [x + step * 0.7, cy + 0.33], 0.12, COPPER, { spec: 0.85, shin: 16, n: 6 }); }
}
const LED_COLORS: Record<string, string> = { red: "#ef4444", green: "#22c55e", blue: "#3b82f6", yellow: "#eab308", white: "#f1f5f9", orange: "#f97316", purple: "#a855f7" };
// 5 mm through-hole LED, upright: epoxy dome + flat-cut flange (cathode side) + two vertical legs
function led(w: number, h: number, color: string, glow: boolean, pins: PinLike[], clear = false) {
  const cx = w / 2, cy = h / 2;
  const key = (color || "").toLowerCase();
  const c0 = rgb(LED_COLORS[key] ?? (/^#[0-9a-f]{6}$/i.test(color || "") && color !== "#111827" ? color : "#ef4444"));
  const c = glow ? mixc(c0, WHITE, 0.3) : c0;
  const bw = 0.82, R = bw / 2, yb = cy - 0.4, yFl = yb - 0.09, yCyl = yFl - 0.42, yDome = yCyl;
  radialLegs(pins, cx, yb, 0.6);
  shadowRR(cx - bw * 0.57, yDome - R, bw * 1.14, yb - yDome + R, 0.12);
  // flange (flat cut on the right = cathode)
  tube([cx - bw * 0.57, yb - 0.045], [cx + bw * 0.5, yb - 0.045], 0.09, mulc(c0, 0.75), { spec: 0.5, n: 4, alpha: 0.95 });
  flat([cx + bw * 0.5, yb - 0.09], [cx + bw * 0.5, yb], 0.025, mulc(c0, 0.3), 0.9);
  // epoxy body: cylinder + dome (translucent-looking, lit)
  const lens = clear ? rgb("#e6ecf4") : c;
  ball(cx, yDome, R, lens, 0.9);
  tube([cx, yDome], [cx, yFl], bw, lens, { spec: 0.75, shin: 26, n: 12 });
  // internal lead frame (visible through the epoxy): post with reflector cup + anvil
  const inner = clear ? 0.75 : 0.32;
  tube([cx - 0.16, yFl], [cx - 0.16, yDome + 0.05], 0.05, rgb("#c9d0da"), { alpha: inner, n: 4 });
  tube([cx + 0.16, yFl], [cx + 0.16, yDome + 0.12], 0.07, rgb("#aab3c0"), { alpha: inner, n: 4 });
  ellipse(cx - 0.16, yDome + 0.05, 0.1, 0.05, rgb("#e6ebf2"), inner, OUT, 14);
  disc(cx - 0.16, yDome + 0.02, 0.028, rgb("#0f172a"), inner + 0.1, 8);
  // speculars
  disc(cx - R * 0.42, yDome - R * 0.45, R * 0.17, WHITE, 0.7, 14);
  flat([cx - R * 0.72, yDome + 0.06], [cx - R * 0.72, yFl - 0.06], 0.05, WHITE, 0.32);
  if (glow) {
    for (let i = 0; i < 6; i++) disc(cx, yDome, R + 0.12 + i * 0.16, c0, 0.07 - i * 0.01, 34);
    disc(cx - 0.02, yDome, R * 0.62, mixc(c0, WHITE, 0.72), 0.4, 24);
  }
}
function axialDiode(w: number, h: number, pins: PinLike[], body: string, band: string, glass = false) {
  const cy = h / 2, x0 = 0.9, x1 = w - 0.9, R = 0.3;
  shadowRR(x0, cy - R, x1 - x0, 2 * R, 0.2);
  pinLeads(pins, { x: x0, y: cy - 0.05, w: x1 - x0, h: 0.1 });
  tube([x0, cy], [x1, cy], R * 2, rgb(body), { spec: glass ? 0.95 : 0.55, shin: glass ? 48 : 26, n: 14 });
  // Real axial zeners use a painted cathode band; keep it narrow and highly visible.
  tube([x1 - 0.38, cy], [x1 - 0.2, cy], R * 2.02, rgb(band), { spec: 0.5, shin: 18, n: 12 });
  if (glass) {
    // Glass DO-35 style: subtle internal axial lead / junction visible through the body.
    tube([x0 + 0.12, cy], [x1 - 0.43, cy], 0.028, rgb("#e2e8f0"), { alpha: 0.72, n: 3 });
    disc(x1 - 0.29, cy, 0.055, rgb("#0b0d10"), 0.78, 10);
    flat([x0 + 0.15, cy - 0.12], [x1 - 0.48, cy - 0.12], 0.018, WHITE, 0.24);
    flat([x0 + 0.15, cy + 0.12], [x1 - 0.48, cy + 0.12], 0.018, WHITE, 0.18);
  }
}
function zenerDiode(w: number, h: number, pins: PinLike[]) {
  // Typical through-hole Zener: hermetically sealed glass axial body with a dark cathode band.
  // The physical DO-35 package is common for low-power Zeners and identifies cathode by the band.
  axialDiode(w, h, pins, "#b87a45", "#17191d", true);
  const cy = h / 2, x0 = 0.9, x1 = w - 0.9;
  // Small reflective shoulders make the glass capsule read as cylindrical rather than a flat bar.
  tube([x0 + 0.04, cy - 0.16], [x1 - 0.48, cy - 0.16], 0.018, WHITE, { alpha: 0.42, n: 3 });
  tube([x0 + 0.04, cy + 0.16], [x1 - 0.48, cy + 0.16], 0.014, rgb("#6b4a35"), { alpha: 0.35, n: 3 });
}
function fuse(w: number, h: number, pins: PinLike[]) {
  const cy = h / 2, x0 = 0.85, x1 = w - 0.85;
  shadowRR(x0, cy - 0.3, x1 - x0, 0.6, 0.2);
  pinLeads(pins, { x: x0, y: cy - 0.05, w: x1 - x0, h: 0.1 });
  const zig: V[] = []; for (let i = 0; i <= 8; i++) zig.push([x0 + 0.3 + ((x1 - x0 - 0.6) * i) / 8, cy + (i % 2 ? 0.05 : -0.05)]);
  for (let i = 0; i < zig.length - 1; i++) flat(zig[i], zig[i + 1], 0.035, rgb("#94a3b8"), 0.95);
  tube([x0, cy], [x1, cy], 0.6, rgb("#dbeafe"), { spec: 0.9, shin: 36, alpha: 0.38, n: 12 });
  tube([x0, cy], [x0 + 0.32, cy], 0.68, STEEL, { spec: 0.9, n: 12 });
  tube([x1 - 0.32, cy], [x1, cy], 0.68, STEEL, { spec: 0.9, n: 12 });
}
function battery(w: number, h: number, pins: PinLike[], kind: string) {
  const cy = h / 2;
  if (kind === "lipo_battery") {
    shadowRR(0.55, 0.25, w - 1.1, h - 0.5, 0.12);
    pinLeads(pins, { x: 0.55, y: cy - 0.05, w: w - 1.1, h: 0.1 }, { w: 0.09, base: rgb("#ef4444") });
    plastic(0.55, 0.25, w - 1.1, h - 0.5, 0.12, rgb("#4f7fd6"), 0.5);
    flat([0.65, 0.25 + 0.14], [w - 0.65, 0.25 + 0.14], 0.03, WHITE, 0.4);
    mark("LiPo", w / 2, cy, 0.34, [0.95, 0.97, 1]);
    return;
  }
  const li = kind === "li_ion_18650";
  const x0 = 0.55, x1 = w - 0.5, R = li ? 0.56 : 0.54;
  shadowRR(x0, cy - R, x1 - x0, 2 * R, 0.25);
  pinLeads(pins, { x: x0, y: cy - 0.05, w: x1 - x0 + 0.15, h: 0.1 });
  tube([x0, cy], [x1, cy], R * 2, rgb(li ? "#16803d" : "#1c2230"), { spec: 0.6, shin: 26, n: 12 });
  if (!li) tube([x0, cy], [x0 + 0.55, cy], R * 2.02, rgb("#c2762c"), { spec: 0.7, n: 12 });
  tube([x0, cy], [x0 + 0.08, cy], R * 2.04, rgb("#cfd6df"), { spec: 0.9, n: 12 });
  tube([x1, cy], [x1 + 0.13, cy], 0.34, rgb("#dfe4ec"), { spec: 0.9, n: 8 });
  mark(li ? "18650" : "1.5V", (x0 + x1) / 2 + 0.2, cy, 0.3, [0.95, 0.95, 0.95]);
}
function pushButton(w: number, h: number, pins: PinLike[], pressed: boolean) {
  const cx = w / 2, cy = h / 2;
  shadowRR(0.75, 0.32, w - 1.5, h - 0.64, 0.16);
  pinLeads(pins, { x: 0.75, y: cy - 0.05, w: w - 1.5, h: 0.1 });
  plastic(0.75, 0.32, w - 1.5, h - 0.64, 0.16, rgb("#2d3440"), 0.4);
  for (const [px, py] of [[0.9, 0.47], [w - 0.9, 0.47], [0.9, h - 0.47], [w - 0.9, h - 0.47]] as V[]) ball(px, py, 0.06, STEEL, 0.9);
  shadowDisc(cx, cy, pressed ? 0.36 : 0.42, pressed ? 0.4 : 1);
  ball(cx, cy, pressed ? 0.36 : 0.42, rgb("#d33a3a"), 0.85);
}
function toggleSwitch(w: number, h: number, pins: PinLike[], on: boolean) {
  const cx = w / 2, cy = h / 2;
  shadowRR(0.75, cy - 0.3, w - 1.5, 0.6, 0.12);
  pinLeads(pins, { x: 0.75, y: cy - 0.05, w: w - 1.5, h: 0.1 });
  plastic(0.75, cy - 0.3, w - 1.5, 0.6, 0.12, rgb("#4b5563"), 0.5);
  ball(cx, cy, 0.24, rgb("#d4dae3"), 0.9);
  const tip: V = on ? [cx + 0.55, cy - 0.15] : [cx + 0.25, cy - 0.75];
  shadowLine([cx, cy], tip, 0.14);
  tube([cx, cy], tip, 0.14, rgb("#d4dae3"), { spec: 0.9, shin: 20, n: 6 });
  ball(tip[0], tip[1], 0.11, rgb("#dc2626"), 0.9);
}
function meter(w: number, h: number, pins: PinLike[], voltage: boolean) {
  const cx = w / 2, cy = h / 2, bw = Math.min(w - 1.2, h - 0.2);
  shadowRR(cx - bw / 2, cy - bw / 2, bw, bw, 0.25);
  pinLeads(pins, { x: cx - bw / 2, y: cy - 0.05, w: bw, h: 0.1 });
  plastic(cx - bw / 2, cy - bw / 2, bw, bw, 0.25, rgb("#242a35"), 0.5);
  const R = bw * 0.42;
  disc(cx, cy, R * 1.04, rgb("#0b0e14"), 1, 40);
  disc(cx, cy, R, rgb("#f0ead2"), 1, 40);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 1.18 + (i * Math.PI * 0.64) / 10, r0 = R * (i % 5 === 0 ? 0.62 : 0.72);
    flat([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 + R * 0.18], [cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * R * 0.84 + R * 0.18], 0.025, rgb("#1f2937"), 0.9);
  }
  flat([cx, cy + R * 0.5], [cx + R * 0.34, cy - R * 0.4], 0.035, rgb("#dc2626"), 1);
  ball(cx, cy + R * 0.5, 0.07, rgb("#111827"), 0.7);
  mark(voltage ? "V" : "A", cx, cy + R * 0.2, 0.3, rgb("#1f2937"));
  disc(cx - R * 0.35, cy - R * 0.45, R * 0.4, WHITE, 0.08, 24); // glass reflection
}
function motor(w: number, h: number, pins: PinLike[], servo: boolean) {
  const cx = w / 2, cy = h / 2;
  if (servo) {
    shadowRR(0.7, 0.4, w - 1.4, h - 0.8, 0.1);
    pinLeads(pins, { x: 0.7, y: 0.4, w: w - 1.4, h: h - 0.8 });
    plastic(0.7, 0.4, w - 1.4, h - 0.8, 0.1, rgb("#2b56b8"), 0.4);
    ball(w - 1.05, cy, 0.3, rgb("#f1f5f9"), 0.7);
    mark("SERVO", cx - 0.2, cy, 0.24);
    return;
  }
  const R = Math.min(h * 0.32, 0.95), x0 = 0.75, x1 = w - 0.75;
  shadowRR(x0, cy - R, x1 - x0, 2 * R, 0.3);
  pinLeads(pins, { x: x0, y: cy - R * 0.5, w: x1 - x0, h: R });
  tube([x0, cy], [x1, cy], R * 2, rgb("#aab4c2"), { spec: 0.85, shin: 20, n: 16 });
  tube([x1 - 0.32, cy], [x1, cy], R * 2.02, rgb("#3a4150"), { spec: 0.5, n: 16 });
  tube([x0, cy], [x0 + 0.1, cy], R * 2.04, rgb("#7b8595"), { spec: 0.6, n: 16 });
  ball(x1 - 0.1, cy, 0.14, rgb("#e5e9ef"), 0.9);
  mark("M", (x0 + x1) / 2 - 0.1, cy, 0.42, [0.15, 0.18, 0.24]);
}
function buzzer(w: number, h: number, pins: PinLike[]) {
  const cx = w / 2, cy = h * 0.46, R = Math.min(w * 0.4, h * 0.42);
  shadowDisc(cx, cy, R, 1.25);

  // Metallic through-hole leads dropping from under the housing to the pin coordinates
  for (const p of pins) {
    const tx = Math.min(Math.max(p.x, cx - R * 0.7), cx + R * 0.7);
    shadowLine([tx, cy + R * 0.4], [p.x, p.y], 0.09);
    tube([tx, cy + R * 0.4], [p.x, p.y], 0.09, STEEL, { spec: 0.95, shin: 24, n: 8 });
    ball(p.x, p.y, 0.075, STEEL, 0.95);
  }

  // Multi-tier cylindrical PBT black plastic casing
  ball(cx, cy, R, rgb("#161a22"), 0.5);
  disc(cx, cy, R * 0.96, rgb("#212632"), 1, 30);
  // Concentric stepped acoustic resonance groove
  disc(cx, cy, R * 0.84, rgb("#101318"), 1, 30);
  disc(cx, cy, R * 0.78, rgb("#1c212c"), 1, 30);
  flat([cx - R * 0.76, cy], [cx + R * 0.76, cy], 0.015, WHITE, 0.08);

  // Iconic yellow peel-off wash seal inspection sticker with pull-tab (seen on real buzzers)
  const tabAng = -Math.PI * 0.25;
  const tx = cx + Math.cos(tabAng) * R * 0.65, ty = cy + Math.sin(tabAng) * R * 0.65;
  const tabW = R * 0.32, tabL = R * 0.45;
  const tabPts: V[] = [
    [tx - 0.08, ty + 0.08],
    [tx + tabL * 0.7, ty - tabL * 0.7],
    [tx + tabL * 0.7 + tabW * 0.7, ty - tabL * 0.7 + tabW * 0.7],
    [tx + tabW * 0.7, ty + tabW * 0.7],
  ];
  fanPoly(tabPts, () => rgb("#eab308"), 1);
  flat(tabPts[1], tabPts[2], 0.02, rgb("#ca8a04"), 0.8);

  // Sticker circular body
  disc(cx, cy, R * 0.68, rgb("#facc15"), 1, 30);
  disc(cx, cy, R * 0.65, rgb("#eab308"), 1, 30);
  disc(cx, cy, R * 0.62, rgb("#facc15"), 1, 30);

  // Recessed central sound port / acoustic horn cut into sticker
  disc(cx, cy, R * 0.26, rgb("#0b0d12"), 1, 24);
  disc(cx, cy, R * 0.18, BLACK, 1, 22);

  // Shimmering brass / nickel piezoelectric transducer diaphragm inside sound hole
  disc(cx - 0.015, cy - 0.015, R * 0.11, GOLD, 0.9, 16);
  ball(cx - 0.02, cy - 0.02, R * 0.07, rgb("#fef08a"), 0.95);

  // Authentic printed sticker markings
  mark("REMOVE SEAL", cx, cy - R * 0.42, Math.max(0.09, R * 0.15), [0.08, 0.08, 0.1]);
  mark("AFTER WASHING", cx, cy + R * 0.42, Math.max(0.085, R * 0.14), [0.08, 0.08, 0.1]);

  // Molded raised polarity + indicator on positive pin side
  const posPin = pins.find((p) => p.name === "+") || (pins.length > 0 ? pins[0] : null);
  const plusX = posPin && posPin.x < cx ? cx - R * 0.78 : cx + R * 0.78;
  disc(plusX, cy - R * 0.35, 0.11, rgb("#ef4444"), 0.9, 14);
  mark("+", plusX, cy - R * 0.35, 0.18, [1, 1, 1]);
}

// transistors ---------------------------------------------------------------------------------
// TO-92 (BC547 / BC557 / 2N3904 / 2N2222 …): a black epoxy half-cylinder with a flat marked face,
// a domed top, a mould-parting seam, ejector dimple and three flat tinned ribbon leads that leave
// the body through small stamped shoulders. Real packages only print the part number and a
// date/lot code on the face (NPN / PNP are NOT printed), so that is all we draw.
function cubicPts(p0: V, c1: V, c2: V, p3: V, n = 16): V[] {
  const out: V[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
function splinePts(ctrl: V[], per = 8): V[] {
  const out: V[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
function to92(w: number, h: number, pins: PinLike[], label: string, isPnp = false) {
  const compact = w <= 2.2;
  const S = compact ? 0.66 : 1;
  const cx = compact ? 0.74 : 1.2;
  const bw = 1.52 * S, bh = 1.58 * S;
  const topY = compact ? 0.26 : 0.5;
  const botY = topY + bh;
  const rx = bw / 2, ry = bw * 0.30;      // dome of the top face seen from above-front
  const arcY = topY + ry;                 // where the dome meets the flat face
  const BODY = rgb("#14171d");

  // soft contact + drop shadow
  shadowRR(cx - rx * 1.08, topY - 0.06, rx * 2.16, bh + 0.16, 0.26 * S, 1.3);

  // --- curved flanks (the half-cylinder wrapping back behind the flat face) ---------------
  tube([cx - rx + 0.02 * S, arcY], [cx - rx + 0.02 * S, botY - 0.03], 0.1 * S, rgb("#2b3340"), { spec: 0.7, shin: 16, n: 6 });
  tube([cx + rx - 0.02 * S, arcY], [cx + rx - 0.02 * S, botY - 0.03], 0.1 * S, rgb("#0b0e13"), { spec: 0.12, shin: 8, n: 4 });

  // --- domed top: half-ellipse lit from the upper left, glossy epoxy ---------------------------
  const cap: V[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) { const a = Math.PI * (i / N); cap.push([cx + Math.cos(a) * rx, arcY - Math.sin(a) * ry]); }
  fanPoly(cap, (q) => {
    const nx = (q[0] - cx) / rx, ny = (q[1] - arcY) / ry;      // ny: -1 (rear) … 0 (front edge)
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx * 0.7 - ny * ny * 0.5));
    return lit(BODY, nx * 0.75, ny * 0.7, nz, 0.55, 22);
  }, 1);
  // moulding gate / ejector dimple on the dome
  ellipse(cx + rx * 0.18, arcY - ry * 0.52, 0.075 * S, 0.05 * S, rgb("#07090c"), 1, OUT, 14);
  ellipse(cx + rx * 0.18 - 0.012, arcY - ry * 0.52 - 0.012, 0.03 * S, 0.02 * S, rgb("#3a4454"), 0.55, OUT, 10);
  // rim specular tracing the rear arc
  for (let i = 3; i < N - 3; i++) {
    const t = Math.cos(Math.PI * (i / N));
    flat(cap[i], cap[i + 1], 0.022, mixc(rgb("#3e4859"), WHITE, Math.max(0, -t * 0.55 + 0.25)), 0.85);
  }

  // --- flat marked face: matte epoxy, very slightly lighter at the top, bevelled edge ------
  rrMesh(cx - rx, arcY, 2 * rx, botY - arcY, 0.05 * S, (q) => {
    const ty = (q[1] - arcY) / (botY - arcY), tx = (q[0] - cx) / rx;
    const k = 1.18 - 0.38 * ty - 0.1 * Math.abs(tx);
    return mulc(rgb("#1c2028"), k);
  }, 1);
  flat([cx - rx + 0.02, arcY + 0.01], [cx + rx - 0.02, arcY + 0.01], 0.022, rgb("#0a0c10"), 0.95);          // top seam
  flat([cx - rx + 0.015, arcY + 0.03], [cx - rx + 0.015, botY - 0.03], 0.02, rgb("#566275"), 0.6);          // lit left bevel
  flat([cx + rx - 0.015, arcY + 0.03], [cx + rx - 0.015, botY - 0.03], 0.02, rgb("#07090c"), 0.8);          // dark right bevel
  flat([cx - rx + 0.03, botY - 0.012], [cx + rx - 0.03, botY - 0.012], 0.026, rgb("#2d3646"), 0.75);        // bottom edge
  flat([cx - rx * 0.97, arcY + 0.05], [cx - rx * 0.97, botY - 0.05], 0.008, WHITE, 0.12);                    // gloss line

  // --- laser marking: part number + lot / date code ----------------------------------------------
  const partName = (label || (isPnp ? "BC557" : "BC547")).toUpperCase();
  const lot = String.fromCharCode(65 + (hash(partName) % 6)) + " " + (200 + (hash(partName + "x") % 80));
  const fsz = Math.min(0.25 * S, (2 * rx * 0.88) / Math.max(4, partName.length * 0.62));
  mark(partName, cx, arcY + (botY - arcY) * 0.36, fsz, [0.88, 0.9, 0.94]);
  mark(lot, cx, arcY + (botY - arcY) * 0.68, 0.115 * S, [0.58, 0.62, 0.7]);

  // --- leads ------------------------------------------------------------------------------------
  const pB = pins.find((p) => p.name === "B") || [...pins].sort((a, b) => a.x - b.x)[0];
  const rest = pins.filter((p) => p !== pB).sort((a, b) => a.y - b.y);
  const pTop = rest[0], pBot = rest[1];
  if (!pB || !pTop || !pBot || w < 1.8 || h < 1.8) {
    pinLeads(pins, { x: cx - rx, y: topY, w: 2 * rx, h: bh }, { w: 0.09, base: STEEL });
    for (const p of pins) ball(p.x, p.y, 0.075, STEEL, 0.95);
    return;
  }
  const sp = 0.38 * S;                       // 1.27 mm pitch
  const lw_ = 0.085 * S + 0.015;             // flat 0.5 mm ribbon
  const ext = 0.2 * S;                       // straight section below the body before the bend
  const leads: { lx: number; pin: PinLike; k1: number; run: number; wrap?: boolean }[] = [
    { lx: cx - sp, pin: pB, k1: 0.3 * S, run: 0.5 * S + 0.1 },
    { lx: cx, pin: pBot, k1: 0.6, run: 0.9 },
    { lx: cx + sp, pin: pTop, k1: 0.6, run: 0.35, wrap: true },
  ];
  // stamped shoulders (the little flat "dam" just under the body)
  for (const L of leads) {
    rrect(L.lx - 0.075 * S, botY - 0.01, 0.15 * S, 0.075 * S, 0.015, rgb("#0b0d11"), rgb("#1e2530"));
    rectF(L.lx - 0.07 * S, botY + 0.075 * S, 0.14 * S, 0.05 * S, mulc(STEEL, 0.95));
  }
  const paths = leads.map((L) => {
    const p3: V = [L.pin.x, L.pin.y];
    if (L.wrap) {
      // right-hand lead swings out beneath the body, then climbs along its right side to the upper pin
      const rightX = cx + rx + 0.3 * S + 0.1;
      const c: V[] = [
        [L.lx, botY], [L.lx, botY + ext],
        [L.lx + (rightX - L.lx) * 0.38, botY + ext + 0.2 * S],
        [rightX, botY + 0.1 * S],
        [rightX + (p3[0] - rightX) * 0.12, botY - (botY - p3[1]) * 0.45],
        [p3[0] - 0.3 * S, p3[1] + 0.12 * S],
        p3,
      ];
      return splinePts(c, 7);
    }
    const p0: V = [L.lx, botY + ext];
    const dirx = L.lx < p3[0] ? -1 : 1;
    const c1: V = [L.lx, p0[1] + L.k1];
    const c2: V = [p3[0] + dirx * L.run, p3[1]];
    return [[L.lx, botY] as V, ...cubicPts(p0, c1, c2, p3, 18)];
  });
  for (const path of paths) for (let i = 0; i < path.length - 1; i++) shadowLine(path[i], path[i + 1], lw_ * 0.85);
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      tube(path[i], path[i + 1], lw_, STEEL, { spec: 0.95, shin: 22, n: 5 });
    }
    // bright centre highlight along the ribbon
    for (let i = 0; i < path.length - 1; i++) flat(path[i], path[i + 1], lw_ * 0.16, WHITE, 0.4);
  }
  for (const L of leads) ball(L.pin.x, L.pin.y, 0.075, STEEL, 0.95);   // attachment point of the wire
  // small pin letters beside each lead tip
  for (const L of leads) {
    const left = L.pin.x < w / 2;
    mark(L.pin.name || "", L.pin.x + (left ? (compact ? 0.12 : 0.3) : -0.3), L.pin.y - 0.2, compact ? 0.12 : 0.15, [0.7, 0.77, 0.88]);
  }
}
function to220(w: number, h: number, pins: PinLike[], label: string) {
  const cx = w / 2, bw = 1.5;
  const top = Math.max(0.1, Math.min(...pins.map((p) => p.y), h * 0.5) - 0.7);
  const tabH = 0.5, bodyH = 1.0;
  shadowRR(cx - bw / 2, top, bw, tabH + bodyH, 0.06);
  pinLeads(pins, { x: cx - bw / 2, y: top + tabH, w: bw, h: bodyH });
  plastic(cx - bw / 2, top, bw, tabH, 0.06, rgb("#c2c9d4"), 0.9);
  disc(cx, top + tabH * 0.5, 0.11, rgb("#0b0e14"), 1, 16);
  plastic(cx - bw / 2, top + tabH, bw, bodyH, 0.06, rgb("#1f232b"), 0.4);
  mark(label, cx, top + tabH + bodyH * 0.55, 0.22, [0.85, 0.88, 0.92]);
}

// ICs / logic ---------------------------------------------------------------------------------
function chipBox(w: number, h: number, pins: PinLike[]): Box {
  let x0 = 0.7, x1 = w - 0.7, y0 = 0.12, y1 = h - 0.12;
  if (pins.length) {
    const ys = pins.map((p) => p.y);
    y0 = Math.max(0.06, Math.min(...ys) - 0.5); y1 = Math.min(h - 0.06, Math.max(...ys) + 0.5);
    if (pins.some((p) => p.y < 0.05)) y0 = 0.6;
    if (pins.some((p) => p.y > h - 0.05)) y1 = h - 0.6;
    if (!pins.some((p) => p.x < 0.05)) x0 = 0.15;
    if (!pins.some((p) => p.x > w - 0.05)) x1 = w - 0.15;
  }
  if (x1 - x0 < 0.4) { x0 = 0.3; x1 = w - 0.3; }
  if (y1 - y0 < 0.4) { y0 = 0.2; y1 = h - 0.2; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function ic(w: number, h: number, pins: PinLike[], label: string, tint = IC_BLACK) {
  const b = chipBox(w, h, pins);
  shadowRR(b.x, b.y, b.w, b.h, 0.14);
  pinLeads(pins, b, { w: 0.09 });
  plastic(b.x, b.y, b.w, b.h, 0.14, tint, 0.4);
  ball(b.x + 0.2, b.y + 0.2, 0.06, rgb("#4a5261"), 0.5);
  disc(b.x, b.y + b.h / 2, 0.12, mulc(tint, 0.4), 1, 14);
  mark(label, b.x + b.w / 2, b.y + b.h / 2, Math.min(0.3, b.w * 0.16), [0.86, 0.89, 0.94]);
}

// other discrete ------------------------------------------------------------------------------
function transformer(w: number, h: number, pins: PinLike[]) {
  const b: Box = { x: 0.95, y: 0.3, w: w - 1.9, h: h - 0.6 };
  shadowRR(b.x, b.y, b.w, b.h, 0.08);
  pinLeads(pins, b, { w: 0.1 });
  plastic(b.x, b.y, b.w, b.h, 0.08, rgb("#6b7686"), 0.5);
  for (let y = b.y + 0.1; y < b.y + b.h - 0.05; y += 0.12) flat([b.x + 0.04, y], [b.x + b.w - 0.04, y], 0.015, BLACK, 0.25);
  for (const cx of [b.x + b.w * 0.28, b.x + b.w * 0.72]) {
    tube([cx, b.y + 0.15], [cx, b.y + b.h - 0.15], 0.5, COPPER, { spec: 0.8, shin: 16, n: 10 });
    for (let y = b.y + 0.25; y < b.y + b.h - 0.2; y += 0.11) flat([cx - 0.25, y], [cx + 0.25, y], 0.012, BLACK, 0.3);
  }
}
function groundSym(w: number, h: number) {
  const x = w / 2;
  tube([x, 0], [x, h * 0.5], 0.12, STEEL, { spec: 0.9, n: 6 });
  for (let i = 0; i < 3; i++) { const half = w * 0.34 * (1 - i * 0.3), y = h * 0.56 + i * h * 0.15; shadowLine([x - half, y], [x + half, y], 0.12); tube([x - half, y], [x + half, y], 0.12, STEEL, { spec: 0.95, n: 6 }); }
}
function powerSym(w: number, h: number, color: string) {
  const x = w / 2, c = rgb(color);
  tube([x, h], [x, h * 0.45], 0.12, STEEL, { spec: 0.9, n: 6 });
  shadowDisc(x, h * 0.36, 0.34);
  ball(x, h * 0.36, 0.34, c, 0.85);
  mark("+", x, h * 0.36, 0.3, [1, 1, 1]);
}
function source(w: number, h: number, pins: PinLike[], ac: boolean) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
  shadowDisc(cx, cy, R);
  pinLeads(pins, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
  ball(cx, cy, R, rgb("#aeb7c4"), 0.9);
  disc(cx, cy, R * 0.8, rgb("#141a24"), 1, 36);
  if (ac) {
    let prev: V | null = null;
    for (let k = 0; k <= 18; k++) { const t = k / 18, p: V = [cx - R * 0.55 + t * R * 1.1, cy - Math.sin(t * Math.PI * 2) * R * 0.28]; if (prev) flat(prev, p, 0.06, rgb("#f8fafc"), 1); prev = p; }
  } else {
    mark("+", cx, cy - R * 0.38, 0.32, rgb("#ef4444"));
    mark("−", cx, cy + R * 0.38, 0.32, rgb("#e5e7eb"));
  }
}
function connectorShell(w: number, h: number, pins: PinLike[], id: string) {
  const b: Box = { x: 0.6, y: 0.2, w: w - 1.2, h: h - 0.4 };
  shadowRR(b.x, b.y, b.w, b.h, 0.1);
  pinLeads(pins, b, { w: 0.09, base: GOLD });
  const dark = id === "dc_jack" || id === "barrel_jack" || id === "jst" || id === "fpc_connector";
  plastic(b.x, b.y, b.w, b.h, 0.1, dark ? rgb("#232730") : rgb("#c3cbd6"), dark ? 0.35 : 0.95);
  const ox = b.x + b.w * 0.18, oy = b.y + b.h * 0.24, ow = b.w * 0.64, oh = b.h * 0.52;
  rrect(ox, oy, ow, oh, 0.05, rgb("#0b0e14"), rgb("#161b24"));
  const n = id === "rj45" ? 8 : id === "hdmi" ? 10 : id === "usb_a" ? 4 : id === "audio_jack" ? 3 : 5;
  for (let i = 0; i < n; i++) flat([ox + ow * ((i + 0.5) / n), oy + oh * 0.55], [ox + ow * ((i + 0.5) / n), oy + oh * 0.9], 0.05, GOLD, 0.95);
  mark(id.replace(/_/g, " ").toUpperCase(), b.x + b.w / 2, b.y + b.h * 0.86, 0.16, [0.2, 0.22, 0.28]);
}
function sevenSeg(w: number, h: number, pins: PinLike[]) {
  const b = chipBox(w, h, pins);
  shadowRR(b.x, b.y, b.w, b.h, 0.08);
  pinLeads(pins, b, { w: 0.09 });
  plastic(b.x, b.y, b.w, b.h, 0.08, rgb("#111318"), 0.3);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, sw = Math.min(b.w, b.h * 0.7) * 0.48, sh = b.h * 0.34, t = 0.13;
  const on = rgb("#ff3b3b"), off = rgb("#4a1414");
  const seg = (x: number, y: number, hz: boolean, lit_: boolean) => {
    const c = lit_ ? on : off;
    if (hz) { rrect(x - sw / 2 + 0.06, y - t / 2, sw - 0.12, t, 0.05, c, c); } else { rrect(x - t / 2, y - sh / 2 + 0.06, t, sh - 0.12, 0.05, c, c); }
    if (lit_) disc(x, y, 0.16, on, 0.12, 12);
  };
  seg(cx, cy - sh, true, true); seg(cx, cy, true, true); seg(cx, cy + sh, true, true);
  seg(cx - sw / 2, cy - sh / 2, false, true); seg(cx + sw / 2, cy - sh / 2, false, true);
  seg(cx - sw / 2, cy + sh / 2, false, true); seg(cx + sw / 2, cy + sh / 2, false, true);
}
function stepper(w: number, h: number, pins: PinLike[]) {
  const b: Box = { x: w * 0.18, y: h * 0.12, w: w * 0.64, h: h * 0.76 };
  shadowRR(b.x, b.y, b.w, b.h, 0.1);
  pinLeads(pins, b);
  plastic(b.x, b.y, b.w, b.h, 0.1, rgb("#8a94a3"), 0.85);
  ball(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * 0.2, rgb("#e6eaf0"), 0.95);
  disc(b.x + b.w / 2, b.y + b.h / 2, 0.05, BLACK, 1, 12);
  mark("STEP", b.x + b.w / 2, b.y + b.h * 0.85, 0.22, [0.1, 0.12, 0.16]);
}
function dht11(w: number, h: number, pins: PinLike[]) {
  const b: Box = { x: w * 0.2, y: h * 0.08, w: w * 0.6, h: h * 0.7 };
  shadowRR(b.x, b.y, b.w, b.h, 0.1);
  pinLeads(pins, b);
  plastic(b.x, b.y, b.w, b.h, 0.1, rgb("#39a7e6"), 0.5);
  for (let y = b.y + 0.15; y < b.y + b.h * 0.65; y += 0.16) flat([b.x + 0.15, y], [b.x + b.w - 0.15, y], 0.05, rgb("#0b4f7a"), 0.9);
  mark("DHT11", b.x + b.w / 2, b.y + b.h * 0.85, 0.2);
}
function varResistor(w: number, h: number, pins: PinLike[]) {
  const b: Box = { x: w * 0.25, y: h * 0.28, w: w * 0.5, h: h * 0.62 };
  shadowRR(b.x, b.y, b.w, b.h, 0.08);
  pinLeads(pins, b);
  plastic(b.x, b.y, b.w, b.h, 0.08, rgb("#2f6fd0"), 0.5);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ball(cx, cy, Math.min(b.w, b.h) * 0.32, rgb("#d9b24a"), 0.95);
  flat([cx - 0.2, cy + 0.03], [cx + 0.2, cy - 0.03], 0.06, rgb("#3b3117"), 0.95);
}
function knob(w: number, h: number, pins: PinLike[]) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32;
  shadowDisc(cx, cy, R * 1.15);
  pinLeads(pins, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
  ball(cx, cy, R * 1.15, rgb("#3f4653"), 0.5);
  ball(cx, cy, R, rgb("#aab3c0"), 0.95);
  flat([cx, cy], [cx + R * 0.75, cy - R * 0.3], 0.09, rgb("#171a21"), 1);
}
function dipSwitch(w: number, h: number, pins: PinLike[]) {
  const b = chipBox(w, h, pins);
  shadowRR(b.x, b.y, b.w, b.h, 0.08);
  pinLeads(pins, b, { w: 0.09 });
  plastic(b.x, b.y, b.w, b.h, 0.08, rgb("#d43a3a"), 0.5);
  const n = Math.max(4, Math.min(8, Math.round(b.w / 0.5)));
  for (let i = 0; i < n; i++) { const x = b.x + (b.w * (i + 0.5)) / n; rrect(x - 0.1, b.y + b.h * 0.3, 0.2, b.h * 0.4, 0.04, rgb("#f3f4f6"), rgb("#c7ccd4")); }
}
function mov(w: number, h: number, pins: PinLike[]) { ceramicCap(w, h, pins, "", "#2b62c8", "MOV"); }
function crystal(w: number, h: number, pins: PinLike[]) {
  const cx = w / 2, cy = h / 2, bw = Math.min(1.8, w * 0.7), bh = Math.min(1.0, h * 0.5);
  shadowRR(cx - bw / 2, cy - bh / 2, bw, bh, 0.35);
  radialLegs(pins, cx, cy + bh / 2, 0.8, 0.08);
  // Shiny metal HC-49 oval package
  rrect(cx - bw / 2, cy - bh / 2, bw, bh, 0.35, STEEL, { spec: 0.95, shin: 30, alpha: 0.98 });
  flat([cx - bw * 0.38, cy - bh * 0.25], [cx + bw * 0.38, cy - bh * 0.25], 0.035, WHITE, 0.4);
  flat([cx - bw * 0.38, cy + bh * 0.25], [cx + bw * 0.38, cy + bh * 0.25], 0.035, rgb("#475569"), 0.5);
  mark("16.000", cx, cy - 0.08, 0.22, [0.18, 0.24, 0.34]);
  mark("MHz", cx, cy + 0.16, 0.14, [0.38, 0.44, 0.54]);
}
function photodiode(w: number, h: number, pins: PinLike[]) {
  const cx = w / 2, cy = h / 2, x0 = 0.9, x1 = w - 0.9, R = 0.3;
  shadowRR(x0, cy - R, x1 - x0, 2 * R, 0.2);
  pinLeads(pins, { x: x0, y: cy - 0.05, w: x1 - x0, h: 0.1 });
  tube([x0, cy], [x1, cy], R * 2, rgb("#0f172a"), { spec: 0.8, shin: 32, n: 12 });
  // dark blue glass sensor window in center
  tube([x0 + 0.3, cy], [x1 - 0.3, cy], R * 2.05, rgb("#1e3a8a"), { spec: 0.95, shin: 40, n: 12 });
  disc(cx, cy, R * 0.45, rgb("#38bdf8"), 0.5, 14);
}
function testPoint(w: number, h: number) {
  const cx = w / 2, cy = h * 0.42;
  tube([cx, h], [cx, cy], 0.1, STEEL, { spec: 0.9, n: 6 });
  shadowDisc(cx, cy, 0.34);
  ball(cx, cy, 0.34, rgb("#eab308"), 0.9);
  disc(cx, cy, 0.16, rgb("#161a22"), 1, 20);
}
function probe(w: number, h: number, pins: PinLike[], color: string) {
  const cy = h / 2, b: Box = { x: w * 0.25, y: cy - 0.22, w: w * 0.5, h: 0.44 };
  shadowRR(b.x, b.y, b.w, b.h, 0.14);
  pinLeads(pins, b, { w: 0.08 });
  tube([b.x, cy], [b.x + b.w, cy], 0.44, rgb(color), { spec: 0.6, n: 10 });
  tube([b.x + b.w, cy], [b.x + b.w + 0.3, cy], 0.09, STEEL, { spec: 0.95, n: 4 });
}

// modules / boards ----------------------------------------------------------------------------
function boardBox(w: number, h: number, pins: PinLike[]): Box {
  const l = pins.some((p) => p.x < 0.05) ? 0.6 : 0.12, r = pins.some((p) => p.x > w - 0.05) ? w - 0.6 : w - 0.12;
  const t = pins.some((p) => p.y < 0.05) ? 0.6 : 0.12, b = pins.some((p) => p.y > h - 0.05) ? h - 0.6 : h - 0.12;
  return { x: l, y: t, w: Math.max(0.5, r - l), h: Math.max(0.5, b - t) };
}
function pcb(id: string, w: number, h: number, pins: PinLike[], base: RGB, label: string): Box {
  const b = boardBox(w, h, pins), R = rng(hash(id));
  shadowRR(b.x, b.y, b.w, b.h, 0.1);
  pinLeads(pins, b, { w: 0.08, base: GOLD });
  rrect(b.x, b.y, b.w, b.h, 0.1, mulc(base, 1.25), mulc(base, 0.7));
  flat([b.x + 0.08, b.y + 0.03], [b.x + b.w - 0.08, b.y + 0.03], 0.03, WHITE, 0.25);
  const tr = mulc(base, 1.45);
  for (let i = 0; i < 7; i++) {
    const x = b.x + 0.25 + R() * (b.w - 0.5), y = b.y + 0.25 + R() * (b.h - 0.5);
    const p1: V = [x, y], p2: V = [x + (R() - 0.5) * 1.4, y], p3: V = [p2[0], y + (R() - 0.5) * 1.2];
    flat(p1, p2, 0.035, tr, 0.35); flat(p2, p3, 0.035, tr, 0.35);
  }
  for (const [hx, hy] of [[b.x + 0.16, b.y + 0.16], [b.x + b.w - 0.16, b.y + 0.16], [b.x + 0.16, b.y + b.h - 0.16], [b.x + b.w - 0.16, b.y + b.h - 0.16]] as V[]) { disc(hx, hy, 0.09, GOLD, 1, 14); disc(hx, hy, 0.05, BLACK, 1, 12); }
  for (const p of pins) {
    const tx = Math.min(Math.max(p.x, b.x + 0.14), b.x + b.w - 0.14), ty = Math.min(Math.max(p.y, b.y + 0.14), b.y + b.h - 0.14);
    disc(tx, ty, 0.1, GOLD, 1, 14); disc(tx, ty, 0.045, rgb("#101216"), 1, 10);
  }
  for (let i = 0; i < 6; i++) {
    const x = b.x + 0.35 + R() * (b.w - 0.7), y = b.y + 0.35 + R() * (b.h - 0.7);
    if (R() > 0.5) rrect(x, y, 0.18, 0.1, 0.02, rgb("#c7b07a"), rgb("#8b7a4a")); else rrect(x, y, 0.16, 0.1, 0.02, rgb("#15181e"), rgb("#0a0c10"));
  }
  if (label) mark(label, b.x + b.w / 2, b.y + b.h * 0.9, Math.min(0.26, b.w * 0.09), [0.95, 0.97, 1]);
  return b;
}
function bigChip(b: Box, fx: number, fy: number, fw: number, fh: number, label: string) {
  const x = b.x + b.w * fx, y = b.y + b.h * fy, cw = b.w * fw, ch = b.h * fh;
  for (let i = 0; i < 7; i++) { const px = x + 0.1 + ((cw - 0.2) * i) / 6; flat([px, y - 0.09], [px, y + 0.05], 0.05, STEEL, 1); flat([px, y + ch - 0.05], [px, y + ch + 0.09], 0.05, STEEL, 1); }
  plastic(x, y, cw, ch, 0.05, IC_BLACK, 0.4);
  mark(label, x + cw / 2, y + ch / 2, Math.min(0.22, cw * 0.14), [0.86, 0.89, 0.94]);
}
function electroCap(cx: number, cy: number, r: number) {
  shadowDisc(cx, cy, r, 0.8);
  ball(cx, cy, r, rgb("#c4ccd8"), 0.95);
  disc(cx, cy, r * 0.86, rgb("#b6bfcc"), 0.9, 28);
  flat([cx - r * 0.5, cy], [cx + r * 0.5, cy], 0.03, rgb("#6b7280"), 0.9);
  flat([cx, cy - r * 0.5], [cx, cy + r * 0.5], 0.03, rgb("#6b7280"), 0.9);
}

function bluetoothHc05(w: number, h: number, pins: PinLike[]) {
  const bx = 0.25, by = 0.25, bw = w - 0.5, bh = h - 0.7;

  // 1. Blue FR-4 Carrier Breakout Board
  shadowRR(bx, by, bw, bh, 0.12, 1.25);
  rrect(bx, by, bw, bh, 0.12, rgb("#1a4ea8"), rgb("#0e2f6c"));

  // Beveled outer sheen
  flat([bx + 0.12, by + 0.03], [bx + bw - 0.12, by + 0.03], 0.025, WHITE, 0.35);
  flat([bx + 0.03, by + 0.12], [bx + 0.03, by + bh - 0.12], 0.025, WHITE, 0.18);
  flat([bx + 0.12, by + bh - 0.03], [bx + bw - 0.12, by + bh - 0.03], 0.025, BLACK, 0.35);

  // 4 corner mounting hole pads with gold rings
  const holes: V[] = [
    [bx + 0.22, by + 0.22],
    [bx + bw - 0.22, by + 0.22],
    [bx + 0.22, by + bh - 0.22],
    [bx + bw - 0.22, by + bh - 0.22],
  ];
  for (const [hx, hy] of holes) {
    disc(hx, hy, 0.12, GOLD, 1, 14);
    disc(hx, hy, 0.06, BLACK, 1, 12);
  }

  // Realistic PCB routing traces (gold with slight translucency)
  flat([bx + 0.5, by + 4.1], [bx + 1.1, by + 3.8], 0.025, GOLD, 0.45);
  flat([bx + 1.1, by + 3.8], [bx + 2.7, by + 3.8], 0.025, GOLD, 0.45);
  flat([bx + 2.7, by + 3.8], [bx + 3.0, by + 4.4], 0.025, GOLD, 0.45);
  disc(bx + 1.1, by + 3.8, 0.045, GOLD, 0.8, 8);
  disc(bx + 2.7, by + 3.8, 0.045, GOLD, 0.8, 8);

  // White silkscreen outline box
  flat([bx + 0.15, by + 0.4], [bx + bw - 0.15, by + 0.4], 0.015, WHITE, 0.35);

  // 2. HC-05 Daughterboard (the soldered Bluetooth core module)
  const dx = bx + 0.35, dy = by + 0.32, dw = bw - 0.7, dh = 3.3;
  shadowRR(dx, dy, dw, dh, 0.05, 0.85);
  rrect(dx, dy, dw, dh, 0.05, rgb("#133e82"), rgb("#0a234f"));

  // Castellated edge solder pads on left and right sides
  const nPads = 9;
  for (let i = 0; i < nPads; i++) {
    const py = dy + 1.15 + (i * (dh - 1.3)) / (nPads - 1);
    rectF(dx - 0.02, py - 0.05, 0.08, 0.1, GOLD);
    rectF(dx + dw - 0.06, py - 0.05, 0.08, 0.1, GOLD);
    disc(dx + 0.02, py, 0.035, STEEL, 1, 8);
    disc(dx + dw - 0.02, py, 0.035, STEEL, 1, 8);
  }
  // Bottom pads
  for (let i = 0; i < 6; i++) {
    const px = dx + 0.3 + (i * (dw - 0.6)) / 5;
    rectF(px - 0.05, dy + dh - 0.06, 0.1, 0.08, GOLD);
    disc(px, dy + dh - 0.02, 0.035, STEEL, 1, 8);
  }

  // Antenna section on daughterboard: bare green substrate + gold serpentine meandering trace
  const antH = 0.85;
  rrect(dx + 0.06, dy + 0.06, dw - 0.12, antH, 0.025, rgb("#1a3c26"), rgb("#0f2617"));
  const ax = dx + 0.16, ay = dy + 0.12, aw = dw - 0.32;
  // Main antenna trace (inverted-F structure)
  flat([ax, ay + antH - 0.2], [ax + aw * 0.95, ay + antH - 0.2], 0.045, GOLD, 1);
  flat([ax + 0.12, ay + antH - 0.2], [ax + 0.12, ay + 0.12], 0.04, GOLD, 1);
  // Meandering periodic teeth
  for (let k = 0; k < 4; k++) {
    const mx0 = ax + 0.35 + k * 0.44;
    flat([mx0, ay + antH - 0.2], [mx0, ay + 0.12], 0.04, GOLD, 1);
    flat([mx0, ay + 0.12], [mx0 + 0.22, ay + 0.12], 0.04, GOLD, 1);
    flat([mx0 + 0.22, ay + 0.12], [mx0 + 0.22, ay + antH - 0.2], 0.04, GOLD, 1);
  }

  // Brushed aluminum RF shielding can
  const sx = dx + 0.14, sy = dy + antH + 0.12, sw = dw - 0.28, sh = dh - antH - 0.22;
  shadowRR(sx, sy, sw, sh, 0.04, 0.65);
  rrect(sx, sy, sw, sh, 0.04, rgb("#d6dde6"), rgb("#98a2b0"));
  flat([sx + 0.05, sy + 0.03], [sx + sw - 0.05, sy + 0.03], 0.02, WHITE, 0.6);

  // Stamped Bluetooth logo disc on shield
  const bx0 = sx + sw / 2, by0 = sy + 0.55;
  disc(bx0, by0, 0.26, rgb("#1d4ed8"), 0.95, 18);
  flat([bx0 - 0.02, by0 - 0.18], [bx0 - 0.02, by0 + 0.18], 0.024, WHITE, 1);
  flat([bx0 - 0.09, by0 - 0.09], [bx0 + 0.08, by0 + 0.07], 0.024, WHITE, 1);
  flat([bx0 + 0.08, by0 + 0.07], [bx0 - 0.02, by0 + 0.16], 0.024, WHITE, 1);
  flat([bx0 - 0.09, by0 + 0.09], [bx0 + 0.08, by0 - 0.07], 0.024, WHITE, 1);
  flat([bx0 + 0.08, by0 - 0.07], [bx0 - 0.02, by0 - 0.16], 0.024, WHITE, 1);

  // Laser-etched shield text
  mark("HC-05", sx + sw / 2, sy + 1.05, 0.22, [0.15, 0.18, 0.24]);
  mark("Bluetooth V2.0+EDR", sx + sw / 2, sy + 1.34, 0.12, [0.32, 0.38, 0.46]);
  mark("CSR  BC417", sx + sw / 2, sy + 1.58, 0.11, [0.42, 0.48, 0.56]);

  // 3. Components on the Carrier Board below daughterboard (y = 3.9 to 5.2)
  // Tactile KEY/Mode push button (left side)
  const kx = bx + 0.35, ky = by + 3.85, kw = 0.55, kh = 0.44;
  shadowRR(kx, ky, kw, kh, 0.03, 0.5);
  rrect(kx, ky, kw, kh, 0.03, rgb("#dfe4ec"), rgb("#9aa3b1"));
  rectF(kx - 0.04, ky + 0.08, 0.05, 0.12, GOLD);
  rectF(kx + kw - 0.01, ky + 0.08, 0.05, 0.12, GOLD);
  ball(kx + kw / 2, ky + kh / 2, 0.12, rgb("#b45309"), 0.85);
  mark("KEY", kx + kw / 2, ky - 0.12, 0.10, [0.95, 0.97, 1]);

  // SOT-23 3.3V Voltage Regulator (right side)
  const rx = bx + 2.45, ry = by + 3.95;
  rrect(rx, ry, 0.44, 0.32, 0.02, rgb("#22262e"), rgb("#111318"));
  flat([rx + 0.08, ry + 0.32], [rx + 0.08, ry + 0.42], 0.05, STEEL, 1);
  flat([rx + 0.36, ry + 0.32], [rx + 0.36, ry + 0.42], 0.05, STEEL, 1);
  flat([rx + 0.22, ry], [rx + 0.22, ry - 0.09], 0.08, STEEL, 1);
  mark("662K", rx + 0.22, ry + 0.16, 0.09, [0.75, 0.78, 0.85]);

  // Status SMD LED (center)
  const lx = bx + 1.35, ly = by + 4.0;
  rrect(lx, ly, 0.32, 0.18, 0.02, rgb("#fca5a5"), rgb("#ef4444"));
  rectF(lx, ly, 0.06, 0.18, STEEL);
  rectF(lx + 0.26, ly, 0.06, 0.18, STEEL);
  ball(lx + 0.16, ly + 0.09, 0.065, rgb("#ff3333"), 0.95);
  mark("LED", lx + 0.16, ly - 0.12, 0.09, [0.95, 0.97, 1]);

  // SMD passives
  bRes(bx + 1.85, by + 4.0, 0.3, 0.16);
  bCap(bx + 1.85, by + 4.35, 0.32, 0.18);
  bRes(bx + 0.45, by + 4.45, 0.28, 0.16);
  bCap(bx + 2.75, by + 4.45, 0.32, 0.18);

  // Silkscreen model markings
  mark("HC-05  V1.0", bx + bw / 2, by + 4.75, 0.15, [0.95, 0.97, 1]);
  mark("3.6V-6V", bx + bw - 0.45, by + 4.75, 0.11, [0.8, 0.85, 0.95]);

  // 4. Header block and 6 pins reaching y = 6.0
  const hx = bx + 0.1, hy = by + bh - 0.36, hw = bw - 0.2, hh = 0.34;
  shadowRR(hx, hy, hw, hh, 0.03, 0.6);
  plastic(hx, hy, hw, hh, 0.03, rgb("#16181f"), 0.35);
  for (let i = 1; i < 6; i++) {
    flat([hx + i * (hw / 6), hy], [hx + i * (hw / 6), hy + hh], 0.015, rgb("#0a0c10"), 0.8);
  }

  const pinLabels = ["STATE", "RXD", "TXD", "GND", "VCC", "EN"];
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    // Golden pin post extending from header to y = 6.0
    shadowLine([p.x, hy + hh], [p.x, p.y], 0.08);
    tube([p.x, hy + hh], [p.x, p.y], 0.08, GOLD, { spec: 0.95, shin: 24, n: 6 });
    ball(p.x, p.y, 0.065, GOLD, 0.95);

    // Annular pad on carrier PCB above header
    disc(p.x, hy - 0.08, 0.075, GOLD, 1, 10);
    disc(p.x, hy - 0.08, 0.04, BLACK, 1, 8);

    // White silkscreen label
    const lbl = pinLabels[i] || p.name || "";
    mark(lbl, p.x, hy - 0.25, 0.12, [0.95, 0.97, 1]);
  }
}

function module(id: string, w: number, h: number, pins: PinLike[], value: string) {
  const i = id;
  if (i.includes("arduino")) {
    const b = pcb(id, w, h, pins, rgb("#007e83"), i === "arduino_nano" ? "NANO" : "ARDUINO UNO");
    bigChip(b, 0.5, 0.35, 0.3, 0.16, "ATMEGA328P");
    rrect(b.x + 0.05, b.y + b.h * 0.1, b.w * 0.16, b.h * 0.3, 0.04, rgb("#dfe4ec"), rgb("#9aa3b1")); // USB-B
    rrect(b.x + 0.05, b.y + b.h * 0.6, b.w * 0.16, b.h * 0.26, 0.04, rgb("#23262e"), rgb("#101216")); // DC jack
    rrect(b.x + b.w * 0.3, b.y + b.h * 0.08, b.w * 0.55, 0.16, 0.03, rgb("#15171d"), rgb("#15171d"));
    rrect(b.x + b.w * 0.3, b.y + b.h * 0.84, b.w * 0.55, 0.16, 0.03, rgb("#15171d"), rgb("#15171d"));
    ball(b.x + b.w * 0.36, b.y + b.h * 0.5, 0.11, rgb("#d33a3a"), 0.8);
    return;
  }
  if (i.startsWith("esp") || i.includes("esp32")) {
    const b = pcb(id, w, h, pins, rgb("#1b1d22"), "ESP32");
    rrect(b.x + b.w * 0.3, b.y + b.h * 0.14, b.w * 0.42, b.h * 0.42, 0.04, rgb("#cdd3dc"), rgb("#8f98a6"));
    mark("ESP-WROOM", b.x + b.w * 0.51, b.y + b.h * 0.35, 0.16, [0.2, 0.22, 0.28]);
    for (let k = 0; k < 6; k++) flat([b.x + b.w * 0.3 + k * 0.16, b.y + b.h * 0.08], [b.x + b.w * 0.3 + k * 0.16 + 0.1, b.y + b.h * 0.13 + (k % 2) * 0.05], 0.04, GOLD, 0.95);
    rrect(b.x + b.w * 0.36, b.y + b.h * 0.86, b.w * 0.24, 0.16, 0.03, rgb("#cdd3dc"), rgb("#8f98a6"));
    return;
  }
  if (i.includes("pico") || i.includes("stm32")) {
    const b = pcb(id, w, h, pins, i.includes("pico") ? rgb("#0f7f4d") : rgb("#1d3f9a"), i.includes("pico") ? "RPi Pico" : "BLUEPILL");
    bigChip(b, 0.36, 0.34, 0.28, 0.2, i.includes("pico") ? "RP2040" : "STM32");
    rrect(b.x + b.w * 0.38, b.y + 0.04, b.w * 0.22, 0.16, 0.03, rgb("#dfe4ec"), rgb("#9aa3b1"));
    return;
  }
  if (i.includes("lcd") || i.includes("oled") || i.includes("tft") || i.includes("display") || i.includes("dot_matrix")) {
    const oled = i.includes("oled"), tft = i.includes("tft");
    const b = pcb(id, w, h, pins, oled ? rgb("#131a2c") : tft ? rgb("#1d3f9a") : rgb("#0c6b3c"), "");
    const sx = b.x + b.w * 0.1, sy = b.y + b.h * 0.2, sw = b.w * 0.8, sh = b.h * 0.6;
    rrect(sx, sy, sw, sh, 0.05, rgb("#0d1016"), rgb("#050609"));
    if (oled || tft) {
      rrect(sx + 0.06, sy + 0.06, sw - 0.12, sh - 0.12, 0.03, rgb("#0a1220"), rgb("#02040a"));
      flat([sx + 0.12, sy + 0.14], [sx + sw * 0.6, sy + 0.14], 0.05, rgb("#8fd3ff"), 0.6);
      flat([sx + 0.12, sy + 0.3], [sx + sw * 0.4, sy + 0.3], 0.05, rgb("#8fd3ff"), 0.45);
    } else {
      rrect(sx + 0.08, sy + 0.08, sw - 0.16, sh - 0.16, 0.03, rgb("#a7d13c"), rgb("#7eaa1f"));
      const rows = i.includes("2004") ? 4 : 2, cols = 16, cw = (sw - 0.3) / cols, ch = (sh - 0.3) / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) rrect(sx + 0.15 + c * cw + 0.01, sy + 0.15 + r * ch + 0.02, cw - 0.03, ch - 0.06, 0.01, rgb("#4f6f10"), rgb("#3f5a0c"), 0.75);
    }
    disc(sx + sw * 0.3, sy + sh * 0.25, sh * 0.35, WHITE, 0.05, 24);
    return;
  }
  if (i.includes("buck") || i.includes("boost") || i.includes("charger") || i.includes("dcdc") || i.startsWith("lm2596") || i.includes("xl4015") || i.includes("mt3608") || i.includes("tp4056")) {
    const b = pcb(id, w, h, pins, i.includes("tp4056") ? rgb("#1e4fb8") : rgb("#1f56c2"), i.replace(/_/g, " ").toUpperCase());
    const cx = b.x + b.w * 0.32, cy = b.y + b.h * 0.42;
    shadowDisc(cx, cy, Math.min(b.w, b.h) * 0.22, 0.8);
    ball(cx, cy, Math.min(b.w, b.h) * 0.22, rgb("#2e333d"), 0.5);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, r0 = Math.min(b.w, b.h) * 0.22; flat([cx + Math.cos(a) * r0 * 0.5, cy + Math.sin(a) * r0 * 0.5], [cx + Math.cos(a) * r0 * 0.95, cy + Math.sin(a) * r0 * 0.95], 0.05, COPPER, 0.9); }
    electroCap(b.x + b.w * 0.72, b.y + b.h * 0.3, Math.min(b.w, b.h) * 0.14);
    rrect(b.x + b.w * 0.6, b.y + b.h * 0.6, 0.3, 0.3, 0.03, rgb("#2f6fd0"), rgb("#1f4fa0"));
    ball(b.x + b.w * 0.6 + 0.15, b.y + b.h * 0.6 + 0.15, 0.09, rgb("#d9b24a"), 0.9);
    return;
  }
  if (i.includes("ultrasonic")) {
    const b = pcb(id, w, h, pins, rgb("#1e56b8"), "HC-SR04");
    for (const fx of [0.28, 0.72]) { const cx = b.x + b.w * fx, cy = b.y + b.h * 0.42, r = Math.min(b.w * 0.2, b.h * 0.3); shadowDisc(cx, cy, r, 0.8); ball(cx, cy, r, rgb("#b8c0cd"), 0.95); disc(cx, cy, r * 0.62, rgb("#161a22"), 1, 26); disc(cx, cy, r * 0.22, rgb("#3a4150"), 1, 18); }
    return;
  }
  if (i.includes("pir")) {
    const b = pcb(id, w, h, pins, rgb("#1f7a48"), "PIR");
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.45, r = Math.min(b.w, b.h) * 0.33;
    shadowDisc(cx, cy, r, 0.8); ball(cx, cy, r, rgb("#f1f4f8"), 0.9);
    for (let k = -2; k <= 2; k++) flat([cx + k * r * 0.3, cy - r * 0.8], [cx + k * r * 0.3, cy + r * 0.8], 0.02, rgb("#c7ced8"), 0.7);
    return;
  }
  if (i.includes("gas")) {
    const b = pcb(id, w, h, pins, rgb("#1e56b8"), "MQ");
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.42, r = Math.min(b.w, b.h) * 0.3;
    shadowDisc(cx, cy, r, 0.8); ball(cx, cy, r, rgb("#c9d0db"), 0.9);
    for (let a = -2; a <= 2; a++) flat([cx - r * 0.8, cy + a * r * 0.3], [cx + r * 0.8, cy + a * r * 0.3], 0.02, rgb("#7b8595"), 0.7);
    return;
  }
  if (i.includes("bluetooth") || i.includes("hc05")) {
    return bluetoothHc05(w, h, pins);
  }
  if (i.includes("nrf24")) {
    const b = pcb(id, w, h, pins, rgb("#1a6c3a"), "nRF24L01");
    rrect(b.x + b.w * 0.25, b.y + b.h * 0.2, b.w * 0.5, b.h * 0.35, 0.03, rgb("#cdd3dc"), rgb("#8f98a6"));
    return;
  }
  const b = pcb(id, w, h, pins, rgb("#14663a"), value ? "" : i.replace(/_/g, " ").toUpperCase());
  bigChip(b, 0.32, 0.32, 0.36, 0.26, i.replace(/_/g, "").toUpperCase().slice(0, 9));
}


// ---------------------------------------------------------------------------------------------
// development boards — REAL proportions, laid out in millimetres.
// The body is NOT stretched to the schematic symbol: it keeps the true aspect ratio and part
// sizes, is centred on the symbol, and thin leads run from every symbol pin to its header hole
// (pins keep their schematic positions so wires still land exactly on them).
// ---------------------------------------------------------------------------------------------
const SILK: RGB = [0.95, 0.97, 1];
interface Frame { x: number; y: number; w: number; h: number; k: number; ky: number }
let F: Frame = { x: 0, y: 0, w: 1, h: 1, k: 1, ky: 1 };
const BX = (m: number) => F.x + m * F.k;
const BY = (m: number) => F.y + m * F.ky; // vertical POSITIONS follow the (possibly taller) body…
const BU = (m: number) => m * F.k; //        …while part SIZES stay true to scale
type Rect = [number, number, number, number]; // portrait mm: x, y, w, h

// Real aspect ratio for the body; it is only made taller (never wider) when needed so that the
// header holes can sit exactly on the schematic pins (1 grid unit pitch).
function bFrame(symW: number, symH: number, Wmm: number, Hmm: number, pins: PinLike[], maxW = 10, fill = 0.8) {
  let bh0 = symH * fill, bw = (bh0 * Wmm) / Hmm;
  if (bw > maxW) { bw = maxW; bh0 = (bw * Hmm) / Wmm; }
  const ys = pins.map((p) => p.y);
  const span = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  const bh = Math.min(Math.max(bh0, span + 1.7), symH - 0.1);
  F = { x: symW / 2 - bw / 2, y: symH / 2 - bh / 2, w: bw, h: bh, k: bw / Wmm, ky: bh / Hmm };
}
function rectF(x: number, y: number, w: number, h: number, c: RGB, al = 1) { rrect(x, y, w, h, Math.min(0.03, w / 3, h / 3), c, c, al); }
function bRect(r: Rect, c: RGB, al = 1) { rectF(BX(r[0]), BY(r[1]), BU(r[2]), BU(r[3]), c, al); }
const lw = (mm: number) => Math.max(0.012, BU(mm));

function bPcb(base: RGB, holes: [number, number][] = [], seedKey = "") {
  const x = F.x, y = F.y, w = F.w, h = F.h, r = BU(1.4);
  shadowRR(x, y, w, h, r, 1.3);
  rrMesh(x, y, w, h, r, (p) => { const ty = (p[1] - y) / h, tx = (p[0] - x) / w - 0.5; return mulc(base, 1.16 - 0.36 * ty - 0.1 * Math.abs(tx)); });
  flat([x + r, y + 0.02], [x + w - r, y + 0.02], 0.025, WHITE, 0.3);
  flat([x + 0.02, y + r], [x + 0.02, y + h - r], 0.025, WHITE, 0.14);
  flat([x + r, y + h - 0.02], [x + w - r, y + h - 0.02], 0.025, BLACK, 0.3);
  const R = rng(hash("pcb" + seedKey)), tr = mulc(base, 1.4);
  for (let i = 0; i < 14; i++) {
    const px = x + w * (0.15 + R() * 0.7), py = y + h * (0.1 + R() * 0.8);
    const q: V = [px + BU((R() - 0.5) * 14), py], e: V = [q[0], py + BU((R() - 0.5) * 14)];
    flat([px, py], q, lw(0.28), tr, 0.32); flat(q, e, lw(0.28), tr, 0.32); disc(e[0], e[1], lw(0.5), tr, 0.4, 8);
  }
  for (const [hx, hy] of holes) { disc(BX(hx), BY(hy), BU(1.7), mulc(GOLD, 0.95), 1, 18); disc(BX(hx), BY(hy), BU(1.05), rgb("#0a0c10"), 1, 14); }
}
function bText(t: string, mx: number, my: number, mm: number, c: RGB = SILK) { mark(t, BX(mx), BY(my), Math.max(0.09, BU(mm)), c); }

// --- SMD / through-hole parts (all sizes in mm) --------------------------------------------
function bRes(mx: number, my: number, w = 2, h = 1.25) { const x = BX(mx), y = BY(my), ww = BU(w), hh = BU(h); rectF(x, y, ww, hh, rgb("#16181d")); rectF(x, y, ww * 0.2, hh, rgb("#cfd6df")); rectF(x + ww * 0.8, y, ww * 0.2, hh, rgb("#cfd6df")); }
function bCap(mx: number, my: number, w = 2, h = 1.25) { const x = BX(mx), y = BY(my), ww = BU(w), hh = BU(h); rrect(x, y, ww, hh, 0.02, rgb("#c9a77a"), rgb("#8c6d45")); rectF(x, y, ww * 0.2, hh, rgb("#cfd6df")); rectF(x + ww * 0.8, y, ww * 0.2, hh, rgb("#cfd6df")); }
function bLed(mx: number, my: number, color: string, on = true, w = 1.8, h = 0.9) {
  const x = BX(mx), y = BY(my), c = rgb(color);
  rrect(x, y, BU(w), BU(h), 0.015, mulc(c, on ? 1.15 : 0.55), mulc(c, on ? 0.8 : 0.35));
  if (on) disc(x + BU(w) / 2, y + BU(h) / 2, BU(2.2), c, 0.13, 16);
}
function bTact(mx: number, my: number, s: number) {
  const x = BX(mx), y = BY(my), z = BU(s);
  shadowRR(x, y, z, z, z * 0.08, 0.5);
  rrect(x, y, z, z, z * 0.08, rgb("#dfe4ec"), rgb("#9aa3b1"));
  for (const [dx, dy] of [[0.06, 0.06], [0.82, 0.06], [0.06, 0.82], [0.82, 0.82]] as V[]) rectF(x + z * dx, y + z * dy, z * 0.12, z * 0.12, GOLD);
  ball(x + z / 2, y + z / 2, z * 0.3, rgb("#20242c"), 0.55);
}
function bQfn(mx: number, my: number, s: number, label = "") {
  const x = BX(mx), y = BY(my), z = BU(s), n = Math.max(6, Math.round(s / 0.5));
  for (let i = 0; i < n; i++) { const t = ((i + 0.5) / n) * z; for (const [a, b] of [[[x + t, y - z * 0.03], [x + t, y + z * 0.06]], [[x + t, y + z * 0.94], [x + t, y + z * 1.03]], [[x - z * 0.03, y + t], [x + z * 0.06, y + t]], [[x + z * 0.94, y + t], [x + z * 1.03, y + t]]] as [V, V][]) flat(a, b, z * 0.035, rgb("#cfd6df"), 0.95); }
  shadowRR(x, y, z, z, 0.03, 0.5); plastic(x, y, z, z, 0.03, IC_BLACK, 0.4);
  disc(x + z * 0.14, y + z * 0.14, z * 0.035, rgb("#6b7280"), 1, 8);
  if (label) mark(label, x + z / 2, y + z / 2, Math.min(BU(1.3), z * 0.16), [0.82, 0.86, 0.92]);
}
function bTqfp(mx: number, my: number, s: number, per: number, label = "") {
  const x = BX(mx), y = BY(my), z = BU(s), L = BU(1.3);
  for (let i = 0; i < per; i++) { const t = ((i + 0.5) / per) * z; for (const [a, b] of [[[x + t, y - L], [x + t, y + z * 0.04]], [[x + t, y + z * 0.96], [x + t, y + z + L]], [[x - L, y + t], [x + z * 0.04, y + t]], [[x + z * 0.96, y + t], [x + z + L, y + t]]] as [V, V][]) flat(a, b, Math.max(0.014, z * 0.03), rgb("#cfd6df"), 0.95); }
  shadowRR(x, y, z, z, 0.03, 0.5); plastic(x, y, z, z, 0.03, IC_BLACK, 0.4);
  disc(x + z * 0.12, y + z * 0.12, z * 0.04, rgb("#6b7280"), 1, 8);
  if (label) mark(label, x + z / 2, y + z / 2, Math.min(BU(1.2), z * 0.13), [0.82, 0.86, 0.92]);
}
function bSoic(mx: number, my: number, w: number, h: number, n: number, label = "") {
  const x = BX(mx), y = BY(my), ww = BU(w), hh = BU(h), per = n / 2, st = hh / per, L = BU(1.0);
  for (let i = 0; i < per; i++) { const yy = y + st * (i + 0.5); flat([x - L, yy], [x + ww * 0.05, yy], Math.max(0.014, st * 0.45), rgb("#cfd6df"), 0.95); flat([x + ww * 0.95, yy], [x + ww + L, yy], Math.max(0.014, st * 0.45), rgb("#cfd6df"), 0.95); }
  shadowRR(x, y, ww, hh, 0.02, 0.5); plastic(x, y, ww, hh, 0.02, IC_BLACK, 0.4);
  disc(x + ww * 0.15, y + hh * 0.07, ww * 0.05, rgb("#6b7280"), 1, 8);
  if (label) mark(label, x + ww / 2, y + hh / 2, Math.min(BU(1.1), ww * 0.22), [0.82, 0.86, 0.92]);
}
function bSot223(mx: number, my: number) {
  const x = BX(mx), y = BY(my), ww = BU(6.5), hh = BU(3.5);
  for (let i = 0; i < 3; i++) flat([x + ww * (0.18 + i * 0.32), y + hh], [x + ww * (0.18 + i * 0.32), y + hh + BU(1.3)], BU(0.95), rgb("#cfd6df"), 1);
  rrect(x + ww * 0.28, y - BU(1.5), ww * 0.44, BU(1.6), 0.02, rgb("#cfd6df"), rgb("#9aa3b1"));
  shadowRR(x, y, ww, hh, 0.02, 0.5); plastic(x, y, ww, hh, 0.02, IC_BLACK, 0.4);
}
function bDip(mx: number, my: number, w: number, h: number, n: number, label: string) {
  const x = BX(mx), y = BY(my), ww = BU(w), hh = BU(h), per = n / 2, st = hh / per;
  shadowRR(x - BU(1.2), y - BU(0.8), ww + BU(2.4), hh + BU(1.6), 0.05, 0.6);
  rrect(x - BU(1.4), y - BU(0.9), ww + BU(2.8), hh + BU(1.8), 0.04, rgb("#3a3f4a"), rgb("#242830"));
  for (let i = 0; i < per; i++) { const yy = y + st * (i + 0.5); for (const lx of [x - BU(1.0), x + ww - BU(0.2)]) rrect(lx, yy - BU(0.3), BU(1.2), BU(0.6), 0.01, rgb("#e6ebf2"), rgb("#9aa3b1")); }
  plastic(x, y, ww, hh, 0.04, IC_BLACK, 0.45);
  ellipse(x + ww / 2, y, ww * 0.16, BU(0.7), rgb("#4a5261"), 1, OUT, 12);
  disc(x + BU(1.5), y + BU(2.2), BU(0.5), rgb("#6b7280"), 1, 8);
  mark(label, x + ww / 2, y + hh / 2, Math.min(BU(2.2), ww * 0.32), [0.86, 0.89, 0.94]);
}
// opening toward the top (dir = -1) or bottom (dir = +1) of the board
function bUsbB(r: Rect, dir: number) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]);
  shadowRR(x, y, w, h, 0.05, 0.8); rrect(x, y, w, h, 0.05, rgb("#e6ebf2"), rgb("#9aa3b1"));
  for (let i = 0; i < 3; i++) flat([x + w * 0.05, y + h * (0.55 + i * 0.1)], [x + w * 0.95, y + h * (0.55 + i * 0.1)], 0.018, WHITE, 0.4);
  const oy = dir < 0 ? y + h * 0.04 : y + h * 0.5;
  rrect(x + w * 0.14, oy, w * 0.72, h * 0.46, 0.04, rgb("#0e1117"), rgb("#1a1f29"));
  rectF(x + w * 0.22, oy + h * 0.2, w * 0.56, h * 0.05, rgb("#3a4150"));
  for (let i = 0; i < 4; i++) flat([x + w * (0.28 + i * 0.15), oy + h * 0.28], [x + w * (0.28 + i * 0.15), oy + h * 0.42], 0.03, GOLD, 0.95);
}
function bBarrel(r: Rect) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]);
  shadowRR(x, y, w, h, 0.05, 0.8); plastic(x, y, w, h, 0.05, rgb("#1d2027"), 0.5);
  rrect(x + w * 0.14, y + h * 0.02, w * 0.72, h * 0.46, 0.04, rgb("#06080b"), rgb("#12151b"));
  tube([x + w / 2, y + h * 0.05], [x + w / 2, y + h * 0.42], w * 0.14, rgb("#aab3c0"), { spec: 0.9, n: 6 });
}
function bMicro(r: Rect, dir: number) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]);
  shadowRR(x, y, w, h, 0.04, 0.7); rrect(x, y, w, h, 0.04, rgb("#e6ebf2"), rgb("#9aa3b1"));
  const sy = dir < 0 ? y + h * 0.05 : y + h * 0.5, sh = h * 0.45;
  rrect(x + w * 0.1, sy, w * 0.8, sh, 0.03, rgb("#0b0e14"), rgb("#1a1f29"));
  for (let i = 0; i < 5; i++) flat([x + w * (0.22 + i * 0.14), sy + sh * 0.25], [x + w * (0.22 + i * 0.14), sy + sh * 0.75], 0.025, GOLD, 0.9);
}
// USB Type-C receptacle (24-pin, mid-mount): stainless shell, stadium-shaped mouth with the
// centre tongue and its two rows of gold contacts. dir = -1 opens toward the top edge, +1 toward the bottom.
function bUsbC(r: Rect, dir: number) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]);
  shadowRR(x, y, w, h, 0.05, 0.9);
  rrect(x, y, w, h, 0.05, rgb("#eef1f6"), rgb("#8f99a8"));
  // brushed-steel highlights + rolled seam
  for (let i = 0; i < 4; i++) flat([x + w * 0.04, y + h * (dir < 0 ? 0.42 + i * 0.1 : 0.08 + i * 0.1)], [x + w * 0.96, y + h * (dir < 0 ? 0.42 + i * 0.1 : 0.08 + i * 0.1)], 0.016, WHITE, 0.35);
  flat([x + w * 0.5, y + h * (dir < 0 ? 0.42 : 0.04)], [x + w * 0.5, y + h * (dir < 0 ? 0.96 : 0.58)], 0.012, rgb("#6b7482"), 0.5);
  // mouth (8.34 x 2.56 stadium) at the open end
  const mw = w * 0.9, mh = h * 0.36, mx = x + (w - mw) / 2, my = dir < 0 ? y + h * 0.03 : y + h - h * 0.03 - mh;
  rrect(mx - 0.012, my - 0.012, mw + 0.024, mh + 0.024, mh / 2, rgb("#aab3c0"), rgb("#6b7482")); // metal lip
  rrect(mx, my, mw, mh, mh / 2, rgb("#05070a"), rgb("#10141b"));
  // centre tongue + 2 x 12 contacts
  const tw = mw * 0.74, th = mh * 0.3, tx = mx + (mw - tw) / 2, ty = my + (mh - th) / 2;
  rectF(tx, ty, tw, th, rgb("#2a303c"));
  for (let i = 0; i < 12; i++) {
    const cx = tx + tw * (0.06 + (i / 11) * 0.88);
    flat([cx, ty + th * 0.08], [cx, ty + th * 0.3], 0.018, GOLD, 0.95);
    flat([cx, ty + th * 0.7], [cx, ty + th * 0.92], 0.018, GOLD, 0.95);
  }
  // shell grounding legs on the sides
  for (const sx of [x - w * 0.02, x + w * 0.96]) rectF(sx, y + h * 0.55, w * 0.06, h * 0.14, mulc(GOLD, 1.1));
}
function bXtal(r: Rect) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]);
  shadowRR(x, y, w, h, 0.03, 0.5); rrect(x, y, w, h, 0.04, rgb("#e6ebf2"), rgb("#a1aab8"));
  const t = Math.min(w, h) * 0.18; rectF(x + w * 0.03, y + h * 0.3, t, h * 0.4, GOLD); rectF(x + w - w * 0.03 - t, y + h * 0.3, t, h * 0.4, GOLD);
}
function bElec(cx: number, cy: number, dia: number) {
  const x = BX(cx), y = BY(cy), r = BU(dia) / 2;
  shadowRR(x - r, y - r, 2 * r, 2 * r, r * 0.3, 0.6);
  rrect(x - r, y - r, 2 * r, 2 * r, r * 0.3, rgb("#20242c"), rgb("#10131a"));
  ball(x, y, r * 0.88, rgb("#c4ccd8"), 0.9);
  flat([x - r * 0.4, y], [x + r * 0.4, y], 0.02, rgb("#6b7280"), 0.9); flat([x, y - r * 0.4], [x, y + r * 0.4], 0.02, rgb("#6b7280"), 0.9);
}
function bIcsp(mx: number, my: number, cols: number, rows: number) {
  const x = BX(mx), y = BY(my), P = BU(2.54), w = cols * P, h = rows * P;
  shadowRR(x, y, w, h, 0.02, 0.5); plastic(x, y, w, h, 0.02, rgb("#1a1d24"), 0.35);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const px = x + P * (c + 0.5), py = y + P * (r + 0.5); rectF(px - P * 0.24, py - P * 0.24, P * 0.48, P * 0.48, mulc(GOLD, 1.1)); disc(px, py, P * 0.08, BLACK, 0.5, 8); }
}
function bMeander(r: Rect, feedAtTop = false) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]), rows = 6, st = h / rows; let prev: V = [x + w * 0.05, feedAtTop ? y : y + h];
  for (let i = 0; i < rows; i++) { const yy = feedAtTop ? y + st * (i + 0.5) : y + h - st * (i + 0.5), xx = i % 2 ? x + w * 0.05 : x + w * 0.95; flat(prev, [prev[0], yy], lw(0.5), rgb("#c9a227"), 0.9); flat([prev[0], yy], [xx, yy], lw(0.5), rgb("#c9a227"), 0.9); prev = [xx, yy]; }
}
function bShield(r: Rect) {
  const x = BX(r[0]), y = BY(r[1]), w = BU(r[2]), h = BU(r[3]);
  shadowRR(x, y, w, h, 0.03, 0.8);
  rrMesh(x, y, w, h, 0.03, (p) => { const tx = ((p[0] - x) / w) * 2 - 1, d = ((p[0] - x) / w + (p[1] - y) / h) / 2; return mixc(lit(rgb("#b9c1cd"), tx * 0.1, -0.05, 1, 0.22, 16), WHITE, 0.16 * Math.max(0, 1 - Math.abs(d - 0.45) * 5)); });
  flat([x + 0.03, y + 0.02], [x + w - 0.03, y + 0.02], 0.02, WHITE, 0.5);
}

// --- headers: one hole per schematic pin, exactly on the pin; short straight legs -------------
function bHeaders(pins: PinLike[], symW: number, female = false) {
  const P = Math.max(0.5, BU(2.54));
  for (const left of [true, false]) {
    const list = pins.filter((p) => (p.x < symW / 2) === left).sort((a, b) => a.y - b.y);
    if (!list.length) continue;
    const px = list[0].x;
    const hx = left ? Math.min(Math.max(px, F.x + 0.33), F.x + 1.4) : Math.max(Math.min(px, F.x + F.w - 0.33), F.x + F.w - 1.4);
    const y0 = list[0].y - 0.5, y1 = list[list.length - 1].y + 0.5;
    // legs first (the plastic strip covers their inner end), each a straight gold pin
    for (const p of list) {
      if (Math.abs(hx - p.x) > 0.03) { shadowLine([p.x, p.y], [hx, p.y], 0.1); tube([p.x, p.y], [hx, p.y], 0.1, GOLD, { spec: 0.9, shin: 18, n: 6 }); }
    }
    shadowRR(hx - P / 2, y0, P, y1 - y0, 0.04, 0.7);
    plastic(hx - P / 2, y0, P, y1 - y0, 0.04, rgb(female ? "#20232b" : "#16181f"), 0.35);
    for (const p of list) {
      if (female) { rrect(hx - P * 0.3, p.y - P * 0.3, P * 0.6, P * 0.6, 0.02, rgb("#050608"), rgb("#12151a")); disc(hx, p.y, P * 0.14, mulc(GOLD, 0.8), 1, 10); }
      else { shadowDisc(hx, p.y, P * 0.26, 0.4); rrect(hx - P * 0.2, p.y - P * 0.2, P * 0.4, P * 0.4, 0.02, mulc(GOLD, 1.25), mulc(GOLD, 0.7)); disc(hx - P * 0.05, p.y - P * 0.05, P * 0.05, WHITE, 0.6, 8); }
      ball(p.x, p.y, 0.07, GOLD, 0.9); // pin tip = wire attachment point
    }
  }
}

// --- Arduino Uno R3: 68.6 x 53.4 mm, drawn portrait (landscape layout rotated 90° clockwise) --
function arduinoUno(w: number, h: number, pins: PinLike[]) {
  const W = 53.4, H = 68.6;
  bFrame(w, h, W, H, pins, 8.4);
  // landscape (lx along the 68.6 mm edge, ly from the top edge) -> portrait mm
  const LR = (lx: number, ly: number, lw_: number, lh_: number): Rect => [W - (ly + lh_), lx, lh_, lw_];
  const LP = (lx: number, ly: number): V => [W - ly, lx];
  bPcb(rgb("#00878f"), [LP(14, 2.5), LP(15.3, 50.7), LP(66.1, 7.6), LP(66.1, 35.5)], "uno");
  bHeaders(pins, w, true);
  bBarrel(LR(-6.5, 33.5, 14.2, 9));
  bUsbB(LR(-6.2, 8.9, 16.5, 12.2), -1);
  bSot223(12.4, 12.5);
  bElec(24, 17, 6.3); bElec(24, 24.2, 6.3);
  bRect(LR(9, 44.5, 5.2, 2.6), rgb("#15171d")); bText("D1", 7.6, 16.4, 1.6);
  bTact(42.4, 11.2, 6); bText("RESET", 45.4, 18.6, 1.3);
  bQfn(32.4, 19, 5, "16U2");
  const dip = LR(27, 33.5, 34.8, 7.4);
  bDip(dip[0], dip[1], dip[2], dip[3], 28, "ATMEGA328P");
  bXtal(LR(31, 44, 11.4, 4.6));
  bIcsp(23.3, 61.5, 3, 2);
  bIcsp(36.8, 23.5, 2, 3);
  for (const [k, c, on, px, py] of [["L", "#f59e0b", true, 46.4, 46], ["TX", "#eab308", false, 48.4, 21], ["RX", "#eab308", false, 45.8, 21], ["ON", "#22c55e", true, 40.4, 52]] as [string, string, boolean, number, number][]) {
    bLed(px - 0.9, py, c, on); bText(k, px, py + 2, 1.3);
  }
  for (let i = 0; i < 6; i++) { bRes(38, 36 + i * 3); bCap(41.2, 36 + i * 3); }
  const lgx = 27, lgy = 47;
  for (const dx of [-3.4, 3.4]) { disc(BX(lgx + dx), BY(lgy), BU(3.6), rgb("#e6f4f5"), 0.9, 26); disc(BX(lgx + dx), BY(lgy), BU(2.7), rgb("#00878f"), 1, 26); }
  flat([BX(lgx - 5.2), BY(lgy)], [BX(lgx - 1.6), BY(lgy)], lw(0.8), rgb("#e6f4f5"), 0.95); flat([BX(lgx + 1.6), BY(lgy)], [BX(lgx + 5.2), BY(lgy)], lw(0.8), rgb("#e6f4f5"), 0.95);
  bText("ARDUINO", lgx, lgy + 6, 3.4); bText("UNO", lgx, lgy + 10.5, 3.4);
}
function arduinoNano(w: number, h: number, pins: PinLike[]) {
  const W = 18, H = 43.2; bFrame(w, h, W, H, pins);
  bPcb(rgb("#1a56b0"), [], "nano");
  bHeaders(pins, w);
  bMicro([5.25, -1.6, 7.5, 6.3], -1);
  bTact(11.8, 6.4, 3.6);
  for (let i = 0; i < 4; i++) bLed(3.9, 6.5 + i * 1.7, ["#22c55e", "#f59e0b", "#eab308", "#ef4444"][i], i === 0);
  bSoic(6.6, 8.6, 3.9, 9.9, 16, "CH340");
  bSot223(11.2, 20.5); bXtal([11.5, 12.2, 3.4, 4.6]);
  bTqfp(5.5, 22.4, 7, 8, "ATMEGA328");
  for (let i = 0; i < 4; i++) { bRes(3.7, 20 + i * 1.7); bCap(13, 20 + i * 1.7); }
  bIcsp(5.2, 36.6, 3, 2);
  bText("NANO", 9, 33, 3.4);
}
function esp32Board(w: number, h: number, pins: PinLike[], variant: "esp32" | "esp8266", name: string) {
  // Orientation: USB connector on the TOP edge (as the board is normally held), antenna end at the
  // BOTTOM. Every y below is the mirror image (y' = H - y - height) of the old bottom-USB layout.
  const W = 25.4, H = 48.3; bFrame(w, h, W, H, pins);
  const my_ = (y0: number, hh = 0) => H - y0 - hh;
  bPcb(rgb("#181a20"), [], "esp" + variant);
  bHeaders(pins, w);
  const isC = variant === "esp32";
  const mw = isC ? 18 : 16, mh = isC ? 25.5 : 24, mx = (W - mw) / 2, ant = isC ? 6.3 : 5.2;
  rrect(BX(mx), BY(my_(0.6, ant + 0.4)), BU(mw), BU(ant + 0.4), 0.03, rgb("#22252d"), rgb("#101217"));
  bMeander([mx + 1.5, my_(1.4, ant - 1.4), mw - 3, ant - 1.4], true);
  bShield([mx, my_(0.6 + ant, mh - ant), mw, mh - ant]);
  const t1 = isC ? "ESP32-WROOM-32" : "ESP-12E", t2 = isC ? "ESP32-D0WDQ6" : "ESP8266MOD";
  const sy0 = 0.6 + ant, sh = mh - ant;
  bText(t1, W / 2, my_(sy0 + sh * 0.72), Math.min(2.5, mw / (t1.length * 0.62)), rgb("#1f2937"));
  bText(t2, W / 2, my_(sy0 + sh * 0.5), 1.3, rgb("#4b5563"));
  bText("FCC ID  CE", W / 2, my_(sy0 + sh * 0.3), 1.1, rgb("#6b7280"));
  const y2 = 0.6 + mh + 3;
  bQfn(4.2, my_(y2, 5), 5, "CP2102"); bSot223(13.8, my_(y2 + 1.2, 3.5));
  for (let i = 0; i < 4; i++) { bCap(4.4 + i * 2.6, my_(y2 + 6.5, 1.25)); bRes(4.4 + i * 2.6, my_(y2 + 8.5, 1.25)); }
  bCap(17.6, my_(y2 + 7.2, 1.6), 2.6, 1.6);
  bTact(3.4, my_(H - 10.5, 4.6), 4.6); bText(isC ? "EN" : "RST", 5.7, my_(H - 4.8), 1.6);
  bTact(W - 8, my_(H - 10.5, 4.6), 4.6); bText(isC ? "BOOT" : "FLASH", W - 5.7, my_(H - 4.8), 1.6);
  bLed(W / 2 - 0.9, my_(H - 12, 0.9), "#ef4444"); bLed(W / 2 - 0.9, my_(H - 14, 0.9), "#3b82f6", false);
  if (isC) bUsbC([(W - 9) / 2, -1.6, 9, 7.3], -1);
  else bMicro([(W - 8) / 2, -1.3, 8, 5.9], -1);
  bText(name, W / 2, 20.5, 2.6);
}
function bluePill(w: number, h: number, pins: PinLike[]) {
  const W = 22.5, H = 53; bFrame(w, h, W, H, pins);
  bPcb(rgb("#1e3fae"), [], "bp");
  bHeaders(pins, w);
  bMicro([7.5, -1.6, 7.5, 6.3], -1);
  bTact(15.6, 9, 4); bText("RESET", 17.6, 14.4, 1.3);
  for (let i = 0; i < 2; i++) { bRect([5.6 + i * 3.6, 6.4, 3, 2.2], rgb("#facc15")); bRect([6.4 + i * 3.6, 5.9, 1.4, 3.2], rgb("#20242c"), 0.9); }
  bText("BOOT", 9.4, 10.4, 1.3);
  bSot223(5.6, 13.8);
  bTqfp(7.75, 23.2, 7, 12, "STM32F103");
  bXtal([7.2, 35.2, 6.4, 3.6]); bText("8M", 10.4, 41, 1.4); bXtal([15, 33.8, 3.4, 1.9]);
  bLed(16.5, 22.4, "#22c55e"); bText("PC13", 16.6, 25.2, 1.2);
  bIcsp(6.2, H - 4.4, 4, 1);
  bText("STM32", W / 2, 19.6, 2.6); bText("BLUE PILL", W / 2, 45.5, 1.8);
}
function picoBoard(w: number, h: number, pins: PinLike[]) {
  const W = 21, H = 51; bFrame(w, h, W, H, pins);
  bPcb(rgb("#0f7a3e"), [], "pico");
  bHeaders(pins, w);
  bMicro([6.75, -1.4, 7.5, 6], -1);
  rrect(BX(4.2), BY(6.6), BU(4.6), BU(3.6), 0.03, rgb("#f1f5f9"), rgb("#cbd5e1")); disc(BX(6.5), BY(8.4), BU(1.2), rgb("#94a3b8"), 1, 14); bText("BOOTSEL", 6.5, 11.6, 1.2);
  bLed(14, 7.4, "#22c55e");
  bQfn(7, 17, 7, "RP2040");
  bSoic(13.2, 26, 4.1, 5.2, 8, ""); bXtal([5.2, 27.6, 4.2, 3.2]);
  for (let i = 0; i < 4; i++) { bCap(4.2 + i * 3, 33.5); bRes(4.2 + i * 3, 35.5); }
  bIcsp(6.7, H - 4.2, 3, 1); bText("SWD", W / 2, H - 5.8, 1.2);
  bText("Raspberry Pi", W / 2, 39.4, 2.2); bText("Pico", W / 2, 42.6, 2.8);
}
function esp32Module(w: number, h: number, pins: PinLike[]) {
  const W = 18, H = 25.5; bFrame(w, h, W, H, pins, 6.4, 0.6);
  const x = F.x, y = F.y, bw = F.w, bh = F.h;
  shadowRR(x, y, bw, bh, 0.05, 1);
  rrect(x, y, bw, bh, 0.05, rgb("#232630"), rgb("#12141a"));
  for (const p of pins) {
    const left = p.x < w / 2, edgeX = left ? x : x + bw, padC = left ? x + 0.2 : x + bw - 0.2;
    if (Math.abs(padC - p.x) > 0.03) { shadowLine([p.x, p.y], [padC, p.y], 0.08); tube([p.x, p.y], [padC, p.y], 0.08, GOLD, { spec: 0.9, n: 6 }); }
    rectF(left ? edgeX : edgeX - 0.4, p.y - 0.2, 0.4, 0.4, mulc(GOLD, 1.1));
    ball(p.x, p.y, 0.07, GOLD, 0.9);
  }
  bMeander([2, 0.8, 14, 4.6]);
  bShield([1, 6.3, 16, 18.2]);
  bText("ESP32-WROOM-32", W / 2, 13, 1.7, rgb("#1f2937")); bText("FCC ID  CE", W / 2, 16, 1.1, rgb("#6b7280"));
}
function drawBoard(id: string, w: number, h: number, pins: PinLike[]): boolean {
  switch (id) {
    case "arduino_uno": arduinoUno(w, h, pins); return true;
    case "arduino_nano": arduinoNano(w, h, pins); return true;
    case "esp32_devkit": esp32Board(w, h, pins, "esp32", "ESP32 DevKit"); return true;
    case "esp32": esp32Board(w, h, pins, "esp32", "ESP32"); return true;
    case "esp8266_nodemcu": esp32Board(w, h, pins, "esp8266", "NodeMCU"); return true;
    case "esp32_wroom": esp32Module(w, h, pins); return true;
    case "stm32_bluepill": bluePill(w, h, pins); return true;
    case "rpi_pico": picoBoard(w, h, pins); return true;
    default: return false;
  }
}

// ---------------------------------------------------------------------------------------------
// connectors: pin headers, sockets, shrouded headers, DIP sockets, screw terminals
// Top view, hand-modelled: chamfered gold pins (pyramid facets), black housings with per-pin
// segments, funnel-shaped socket entries, keyed shrouds, screw heads with Phillips slots.
// ---------------------------------------------------------------------------------------------
const GOLD_PIN: RGB = [0.95, 0.74, 0.22];
// gold square pin seen from above: four lit facets + flat tip
function goldPin(cx: number, cy: number, sz: number) {
  const h = sz / 2, t = sz * 0.26 / 2;
  shadowRR(cx - h, cy - h, sz, sz, sz * 0.12, 0.35);
  const facet = (a: V, b: V, c: V, d: V, nx: number, ny: number) => {
    const col = lit(GOLD_PIN, nx, ny, 0.62, 0.9, 22);
    tri(OUT, a, b, c, col, col, col, 1); tri(OUT, a, c, d, col, col, col, 1);
  };
  facet([cx - h, cy - h], [cx + h, cy - h], [cx + t, cy - t], [cx - t, cy - t], 0, -0.7);   // top (faces the light)
  facet([cx + h, cy - h], [cx + h, cy + h], [cx + t, cy + t], [cx + t, cy - t], 0.7, 0);    // right
  facet([cx + h, cy + h], [cx - h, cy + h], [cx - t, cy + t], [cx + t, cy + t], 0, 0.7);    // bottom
  facet([cx - h, cy + h], [cx - h, cy - h], [cx - t, cy - t], [cx - t, cy + t], -0.7, 0);   // left
  const tip = lit(GOLD_PIN, 0, 0, 1, 0.9, 30);
  tri(OUT, [cx - t, cy - t], [cx + t, cy - t], [cx + t, cy + t], tip); tri(OUT, [cx - t, cy - t], [cx + t, cy + t], [cx - t, cy + t], tip);
  disc(cx - t * 0.4, cy - t * 0.4, t * 0.3, WHITE, 0.7, 8);
}
// funnel-shaped socket entry: chamfered walls leading to a deep hole with two gold spring contacts
function socketHole(cx: number, cy: number, sz: number) {
  const o = sz / 2, i = sz * 0.2;
  // stamped metal bezel around the entry: four bright steel edges + corner glints
  const bezel = rgb("#b9c2cf");
  flat([cx - o * 1.06, cy - o * 1.06], [cx + o * 1.06, cy - o * 1.06], sz * 0.055, lit(bezel, 0, -0.8, 0.6, 0.9, 24), 0.95);
  flat([cx - o * 1.06, cy + o * 1.06], [cx + o * 1.06, cy + o * 1.06], sz * 0.055, lit(bezel, 0, 0.8, 0.6, 0.9, 24), 0.95);
  flat([cx - o * 1.06, cy - o * 1.06], [cx - o * 1.06, cy + o * 1.06], sz * 0.055, lit(bezel, -0.8, 0, 0.6, 0.9, 24), 0.95);
  flat([cx + o * 1.06, cy - o * 1.06], [cx + o * 1.06, cy + o * 1.06], sz * 0.055, lit(bezel, 0.8, 0, 0.6, 0.9, 24), 0.95);
  disc(cx - o * 1.06, cy - o * 1.06, sz * 0.05, WHITE, 0.65, 8);
  const wall = (a: V, b: V, c: V, d: V, nx: number, ny: number) => {
    // inward-facing walls: the wall on the far side from the light is lit
    const col = lit(rgb("#3a3e48"), nx, ny, 0.55, 0.45, 18);
    tri(OUT, a, b, c, col, col, col, 1); tri(OUT, a, c, d, col, col, col, 1);
  };
  wall([cx - o, cy - o], [cx + o, cy - o], [cx + i, cy - i], [cx - i, cy - i], 0, 0.7);    // top wall faces down (dim)
  wall([cx + o, cy - o], [cx + o, cy + o], [cx + i, cy + i], [cx + i, cy - i], -0.7, 0);   // right wall faces left
  wall([cx + o, cy + o], [cx - o, cy + o], [cx - i, cy + i], [cx + i, cy + i], 0, -0.7);   // bottom wall faces up (lit)
  wall([cx - o, cy + o], [cx - o, cy - o], [cx - i, cy - i], [cx - i, cy + i], 0.7, 0);    // left wall faces right (lit)
  rectF(cx - i, cy - i, 2 * i, 2 * i, rgb("#050608"));
  for (const sx of [-1, 1]) flat([cx + sx * i * 0.85, cy - i * 0.8], [cx + sx * i * 0.85, cy + i * 0.8], sz * 0.05, mulc(GOLD_PIN, 0.85), 0.9);
  flat([cx - o * 0.95, cy - o * 0.95], [cx + o * 0.95, cy - o * 0.95], 0.012, WHITE, 0.12);
}
interface HeaderOpts { female: boolean; cellW: number; cellH: number; anchor?: V | null; rightAngle?: boolean }
// One housing built from per-pin segments; `anchor` moves the cells away from the pins (library
// headers whose pins sit on the housing edge) — otherwise each pin sits in the middle of its cell.
function pinHeader(pins: PinLike[], o: HeaderOpts) {
  if (!pins.length) return;
  const cells = pins.map((p) => [o.anchor ? (o.anchor[0] >= 0 ? o.anchor[0] : p.x) : p.x, o.anchor ? (o.anchor[1] >= 0 ? o.anchor[1] : p.y) : p.y] as V);
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const x0 = Math.min(...xs) - o.cellW / 2, x1 = Math.max(...xs) + o.cellW / 2, y0 = Math.min(...ys) - o.cellH / 2, y1 = Math.max(...ys) + o.cellH / 2;
  // legs from the schematic pin to its cell (hidden under the housing where they overlap)
  pins.forEach((p, i) => { const c = cells[i]; if (Math.hypot(c[0] - p.x, c[1] - p.y) > 0.05) { shadowLine([p.x, p.y], c, 0.1); tube([p.x, p.y], c, 0.1, GOLD, { spec: 0.9, n: 6 }); } });
  shadowRR(x0, y0, x1 - x0, y1 - y0, 0.05, 0.9);
  plastic(x0, y0, x1 - x0, y1 - y0, 0.05, rgb(o.female ? "#1f222a" : "#17191f"), 0.4);
  // per-pin segment grooves
  const colsX = [...new Set(xs.map((x) => Math.round(x * 1000)))].sort((a, b) => a - b).map((v) => v / 1000);
  const rowsY = [...new Set(ys.map((y) => Math.round(y * 1000)))].sort((a, b) => a - b).map((v) => v / 1000);
  for (let i = 0; i + 1 < colsX.length; i++) { const gx = (colsX[i] + colsX[i + 1]) / 2; flat([gx, y0 + 0.03], [gx, y1 - 0.03], 0.02, BLACK, 0.55); flat([gx + 0.02, y0 + 0.03], [gx + 0.02, y1 - 0.03], 0.012, WHITE, 0.1); }
  for (let i = 0; i + 1 < rowsY.length; i++) { const gy = (rowsY[i] + rowsY[i + 1]) / 2; flat([x0 + 0.03, gy], [x1 - 0.03, gy], 0.02, BLACK, 0.55); flat([x0 + 0.03, gy + 0.02], [x1 - 0.03, gy + 0.02], 0.012, WHITE, 0.1); }
  const ps = Math.min(o.cellW, o.cellH) * 0.3;
  cells.forEach((c, ci) => {
    if (o.female) {
      // raised per-cell collar: each socket sits in its own moulded square, like a real
      // female header strip, with a chamfer glint on the light-facing edges
      const cw = o.cellW * 0.46, ch = o.cellH * 0.46;
      rrect(c[0] - cw, c[1] - ch, cw * 2, ch * 2, 0.03, rgb("#2a2e37"), rgb("#14161c"));
      flat([c[0] - cw, c[1] - ch + 0.01], [c[0] + cw, c[1] - ch + 0.01], 0.018, WHITE, 0.14);
      flat([c[0] - cw + 0.01, c[1] - ch], [c[0] - cw + 0.01, c[1] + ch], 0.018, WHITE, 0.1);
      socketHole(c[0], c[1], Math.min(o.cellW, o.cellH) * 0.74);
      if (ci === 0) disc(c[0] - cw * 0.62, c[1] - ch * 0.62, 0.045, rgb("#e8ecf2"), 0.9, 10); // pin-1 dot
    } else {
      rectF(c[0] - ps * 0.95, c[1] - ps * 0.95, ps * 1.9, ps * 1.9, rgb("#08090c"), 0.85); // recess around the pin
      if (o.rightAngle) { tube([c[0], c[1]], [c[0], y0 - 0.55], ps * 0.9, GOLD, { spec: 0.95, shin: 20, n: 6 }); ball(c[0], y0 - 0.55, ps * 0.5, GOLD, 0.9); }
      goldPin(c[0], c[1], ps * (o.rightAngle ? 1.2 : 1.45));
      if (ci === 0) disc(c[0] - ps * 1.5, c[1] - ps * 1.5, 0.045, rgb("#e8ecf2"), 0.9, 10); // pin-1 dot
    }
  });
  for (const p of pins) ball(p.x, p.y, 0.05, GOLD, 0.8); // pin tip = wire attachment point
}
// boxed (shrouded / IDC) header: walled shroud, keying notch, gold pins on a dark floor
function shroudedHeader(pins: PinLike[], cellW: number, cellH: number) {
  const xs = pins.map((p) => p.x), ys = pins.map((p) => p.y);
  const x0 = Math.min(...xs) - cellW / 2 - 0.2, x1 = Math.max(...xs) + cellW / 2 + 0.2, y0 = Math.min(...ys) - cellH / 2 - 0.2, y1 = Math.max(...ys) + cellH / 2 + 0.2;
  shadowRR(x0, y0, x1 - x0, y1 - y0, 0.06, 1);
  plastic(x0, y0, x1 - x0, y1 - y0, 0.06, rgb("#1b1e25"), 0.45);
  const fx = x0 + 0.2, fy = y0 + 0.2, fw = x1 - x0 - 0.4, fh = y1 - y0 - 0.4;
  rrect(fx, fy, fw, fh, 0.03, rgb("#07080b"), rgb("#101319"));
  flat([fx, fy + 0.02], [fx + fw, fy + 0.02], 0.1, BLACK, 0.5); flat([fx + 0.02, fy], [fx + 0.02, fy + fh], 0.1, BLACK, 0.4); // inner wall shadow
  const nw = Math.min(0.7, fw * 0.3); // keying notch in the top wall
  rectF((x0 + x1) / 2 - nw / 2, y0 - 0.005, nw, 0.24, rgb("#07080b")); rectF((x0 + x1) / 2 - nw / 2, y0, nw, 0.04, rgb("#2a2e38"));
  for (const p of pins) goldPin(p.x, p.y, Math.min(cellW, cellH) * 0.34);
  ball(x0 + 0.5, y1 - 0.12, 0.04, rgb("#4a5261"), 0.5);
  for (const p of pins) ball(p.x, p.y, 0.05, GOLD, 0.8);
}
// DIP / IC socket: grey body, centre notch, a pair of contacts per pin
function dipSocket(pins: PinLike[], cellW: number, cellH: number) {
  const xs = pins.map((p) => p.x), ys = pins.map((p) => p.y);
  const x0 = Math.min(...xs) - cellW / 2, x1 = Math.max(...xs) + cellW / 2, y0 = Math.min(...ys) - cellH / 2 - 0.1, y1 = Math.max(...ys) + cellH / 2 + 0.1;
  shadowRR(x0, y0, x1 - x0, y1 - y0, 0.04, 0.9);
  plastic(x0, y0, x1 - x0, y1 - y0, 0.04, rgb("#2c3038"), 0.4);
  rrect(x0 + 0.12, y0 + 0.12, x1 - x0 - 0.24, y1 - y0 - 0.24, 0.03, rgb("#14171c"), rgb("#1b1f26")); // recess for the chip
  ellipse(x0 + 0.02, (y0 + y1) / 2, 0.14, 0.12, rgb("#0b0d11"), 1, OUT, 14); // notch
  for (const p of pins) {
    rectF(p.x - 0.1, p.y - 0.13, 0.2, 0.26, rgb("#050608"));
    flat([p.x - 0.07, p.y - 0.1], [p.x - 0.07, p.y + 0.1], 0.04, mulc(GOLD_PIN, 0.9), 0.95); flat([p.x + 0.07, p.y - 0.1], [p.x + 0.07, p.y + 0.1], 0.04, mulc(GOLD_PIN, 0.9), 0.95);
    ball(p.x, p.y, 0.05, GOLD, 0.8);
  }
}
// screw terminal block. Poles run along `axis`; the body sits on the far side of the pin legs.
function screwTerminalBlock(pins: PinLike[], axis: "x" | "y", color: string, topEntry: boolean, pitch: number) {
  if (!pins.length) return;
  const along = (p: PinLike) => (axis === "x" ? p.x : p.y), across = (p: PinLike) => (axis === "x" ? p.y : p.x);
  const a0 = Math.min(...pins.map(along)) - pitch / 2 - 0.05, a1 = Math.max(...pins.map(along)) + pitch / 2 + 0.05;
  const baseAcross = across(pins[0]);
  const depth = Math.max(1.5, Math.min(2.3, pitch * 1.45)), leg = 0.42;
  // axis-x: body above the pins (y decreasing); axis-y: body to the right of the pins (x increasing)
  const R_ = (u0: number, v0: number, du: number, dv: number): Rect => axis === "x" ? [u0, baseAcross - leg - v0 - dv, du, dv] : [baseAcross + leg + v0, u0, dv, du];
  const P_ = (u: number, v: number): V => (axis === "x" ? [u, baseAcross - leg - v] : [baseAcross + leg + v, u]);
  const body = rgb(/^#[0-9a-f]{6}$/i.test(color) ? color : "#00a859");
  const rc = R_(a0, 0, a1 - a0, depth);
  // tinned legs from the body to each schematic pin
  for (const p of pins) { const q = P_(along(p), 0.05); shadowLine([p.x, p.y], q, 0.12); tube([p.x, p.y], q, 0.12, rgb("#d3d9e1"), { spec: 0.95, n: 6 }); ball(p.x, p.y, 0.07, rgb("#d3d9e1"), 0.9); }
  shadowRR(rc[0], rc[1], rc[2], rc[3], 0.08, 1);
  plastic(rc[0], rc[1], rc[2], rc[3], 0.08, body, 0.55);
  // raised divider walls between poles
  for (let i = 0; i + 1 < pins.length; i++) { const u = (along(pins[i]) + along(pins[i + 1])) / 2; const [ax, ay] = P_(u, 0.06), [bx, by] = P_(u, depth - 0.06); flat([ax, ay], [bx, by], 0.05, mulc(body, 0.45), 0.9); flat([ax + (axis === "x" ? 0.035 : 0), ay + (axis === "x" ? 0 : 0.035)], [bx + (axis === "x" ? 0.035 : 0), by + (axis === "x" ? 0 : 0.035)], 0.02, WHITE, 0.2); }
  for (const p of pins) {
    const u = along(p);
    // wire entry: dark opening at the back (side entry) or a square hole on top (top entry)
    if (topEntry) { const [hx, hy] = P_(u, depth * 0.72); rectF(hx - 0.2, hy - 0.2, 0.4, 0.4, rgb("#07080b")); rectF(hx - 0.2, hy - 0.2, 0.4, 0.05, rgb("#2a2e38")); tube([hx - 0.17, hy], [hx + 0.17, hy], 0.1, rgb("#c9d0da"), { spec: 0.9, n: 4, alpha: 0.8 }); }
    else { const q = R_(u - pitch * 0.3, depth - 0.2, pitch * 0.6, 0.24); rectF(q[0], q[1], q[2], q[3], rgb("#07080b")); const m = P_(u, depth - 0.06); flat([m[0] - (axis === "x" ? pitch * 0.22 : 0), m[1] - (axis === "x" ? 0 : pitch * 0.22)], [m[0] + (axis === "x" ? pitch * 0.22 : 0), m[1] + (axis === "x" ? 0 : pitch * 0.22)], 0.05, rgb("#aab3c0"), 0.9); }
    // screw: recessed ring, domed metal head, Phillips cross (angle varies per screw)
    const [sx, sy] = P_(u, depth * 0.34), sr = Math.min(0.36, pitch * 0.26);
    shadowDisc(sx, sy, sr, 0.5);
    disc(sx, sy, sr * 1.18, mulc(body, 0.45), 1, 24);
    ball(sx, sy, sr, rgb("#c4cbd6"), 0.95);
    const ang = (hash(String(Math.round(sx * 100) + "," + Math.round(sy * 100))) % 90) * Math.PI / 180;
    for (const da of [0, Math.PI / 2]) flat([sx - Math.cos(ang + da) * sr * 0.7, sy - Math.sin(ang + da) * sr * 0.7], [sx + Math.cos(ang + da) * sr * 0.7, sy + Math.sin(ang + da) * sr * 0.7], sr * 0.17, rgb("#3a404c"), 0.95);
  }
}
function parseConnectorId(id: string) {
  if (id.startsWith("CONN_SCREW_")) {
    const parts = id.split("_");
    return { kind: "screw" as const, poles: parseInt((parts[2] || "2").replace("P", ""), 10) || 2, pitchMm: parseFloat((parts[3] || "5.08").replace("MM", "")) || 5.08, top: parts[4] === "TOP" };
  }
  const parts = id.split("_");
  const rc = (parts[2] || "1x1").split("x");
  return { kind: "header" as const, gender: parts[1] || "MALE", rows: parseInt(rc[0], 10) || 1, cols: parseInt(rc[1], 10) || 1, rightAngle: id.includes("RIGHT_ANGLE") };
}
function drawGeneratedConnector(id: string, pins: PinLike[], md: any) {
  const c = parseConnectorId(id);
  if (c.kind === "screw") { screwTerminalBlock(pins, "x", md?.color || "#00A859", c.top || String(md?.wireEntry || "").includes("Top"), 1.5); return; }
  const cellW = c.cols > 1 ? 1.5 : 1.0, cellH = c.rows > 1 ? 1.0 : 1.4;
  const g = String(md?.gender || c.gender).toUpperCase();
  if (g === "FEMALE") pinHeader(pins, { female: true, cellW, cellH });
  else if (g === "SHROUDED") shroudedHeader(pins, cellW, cellH);
  else if (g === "DIP") dipSocket(pins, cellW, cellH);
  else pinHeader(pins, { female: false, cellW, cellH, rightAngle: c.rightAngle || String(md?.orientation || "").includes("RIGHT") });
}

// ---------------------------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------------------------
const GATE_LABEL: Record<string, string> = {
  not: "7404", not_gate: "7404", and_gate: "7408", nand_gate: "7400", or_gate: "7432", nor_gate: "7402",
  xor_gate: "7486", xnor_gate: "74266", buffer_gate: "7407", schmitt_trigger: "7414", tristate_buffer: "74125",
};
const TO220 = new Set(["regulator_7805", "regulator_7812", "regulator_lm317", "ams1117", "lm1117", "mosfet", "nmosfet", "pmosfet", "mosfet_irf540"]);
const TO92 = new Set(["npn", "pnp", "transistor", "npn_2n2222"]);

function drawSymbol(inst: RealisticInput, pins: PinLike[]) {
  const id = String(inst.symbolId), w = inst.width, v = inst.value || "";
  if (drawBoard(id, w, inst.height, pins)) return;
  if (id.startsWith("CONN_")) { drawGeneratedConnector(id, pins, inst.metadata); return; }
  // Parts whose pins sit on one horizontal line are drawn centred on that line, so the metal
  // leads meet the pins exactly (e.g. an LED symbol taller than its pin height).
  let h = inst.height;
  if (pins.length >= 2 && pins.every((p) => Math.abs(p.y - pins[0].y) < 1e-6) && new Set(pins.map((p) => p.x)).size === pins.length && pins[0].y > 0.05 && pins[0].y < inst.height - 0.05) h = pins[0].y * 2;
  const cx = w / 2, cy = h / 2;
  switch (id) {
    case "resistor": return resistor(w, h, v, pins);
    case "var_resistor": return varResistor(w, h, pins);
    case "capacitor": return ceramicCap(w, h, pins, v);
    case "capacitor_polar": return electrolytic(w, h, pins, "#1d3fa8", v);
    case "inductor": return inductor(w, h, pins);
    case "led": return led(w, h, inst.color || "red", !!inst.glowing, pins);
    case "photodiode": return photodiode(w, h, pins);
    case "diode": case "diode2": case "diode3": case "tvs": return axialDiode(w, h, pins, "#1b1d24", "#e5e7eb");
    case "zener": return zenerDiode(w, h, pins);
    case "fuse": return fuse(w, h, pins);
    case "transformer": return transformer(w, h, pins);
    case "gnd": return groundSym(w, h);
    case "vcc": return powerSym(w, h, "#ef4444");
    case "vdd": return powerSym(w, h, "#f97316");
    case "power_flag": return powerSym(w, h, "#22c55e");
    case "dc_source": return source(w, h, pins, false);
    case "ac_source": return source(w, h, pins, true);
    case "battery": case "lipo_battery": case "li_ion_18650": return battery(w, h, pins, id);
    case "push_button": return pushButton(w, h, pins, !!inst.glowing);
    case "switch": return toggleSwitch(w, h, pins, !!inst.glowing);
    case "rotary_switch": return knob(w, h, pins);
    case "dip_switch": return dipSwitch(w, h, pins);
    case "voltmeter": return meter(w, h, pins, true);
    case "ammeter": return meter(w, h, pins, false);
    case "dc_motor": return motor(w, h, pins, false);
    case "servo_motor": return motor(w, h, pins, true);
    case "stepper_motor": return stepper(w, h, pins);
    case "buzzer_piezo": return buzzer(w, h, pins);
    case "crystal_hc49": return crystal(w, h, pins);
    case "mov": return mov(w, h, pins);
    case "test_point": return testPoint(w, h);
    case "voltage_probe": return probe(w, h, pins, "#d33a3a");
    case "ground_probe": return probe(w, h, pins, "#1f2530");
    case "oscilloscope_probe": return probe(w, h, pins, "#d4a017");
    case "logic_analyzer_probe": return probe(w, h, pins, "#1f9d55");
    case "current_probe": return probe(w, h, pins, "#2f6fd0");
    case "dht11": return dht11(w, h, pins);
    case "screw_terminal": return screwTerminalBlock(pins, "y", "#2f66c9", false, 1.0);
    case "seven_segment": return sevenSeg(w, h, pins);
    case "header": case "pin_header": return pinHeader(pins, { female: false, cellW: 1.2, cellH: 1.0, anchor: [1.25, -1] });
    case "gpio_header": return pinHeader(pins, { female: false, cellW: 0.4, cellH: 1.1, anchor: [-1, 0.95] });
    case "usb_a": case "usb_c": case "micro_usb": case "rj45": case "hdmi": case "audio_jack": case "dc_jack": case "barrel_jack": case "jst": case "fpc_connector":
      return connectorShell(w, h, pins, id);
    case "bluetooth_hc05": return bluetoothHc05(w, h, pins);
    default: break;
  }
  if (TO92.has(id)) {
    const isPnp = id === "pnp";
    const defVal = id === "npn_2n2222" ? "2N2222" : isPnp ? "BC557" : "BC547";
    return to92(w, h, pins, v || defVal, isPnp);
  }
  if (TO220.has(id)) return to220(w, h, pins, id === "regulator_7805" ? "7805" : id === "regulator_7812" ? "7812" : id === "regulator_lm317" ? "LM317" : id === "mosfet_irf540" ? "IRF540" : id.includes("1117") ? "1117" : "MOSFET");
  if (GATE_LABEL[id]) return ic(w, h, pins, GATE_LABEL[id]);
  if (id.includes("opamp") || id === "comparator" || id.includes("amplifier")) return ic(w, h, pins, id === "comparator" ? "LM393" : id.includes("quad") || id === "opamp4" ? "LM324" : id.includes("dual") ? "LM358" : id.includes("audio") ? "LM386" : id.includes("power") ? "TDA2030" : id.includes("instr") ? "INA128" : "LM741");
  if (/^(ic|mcu)\d+$/.test(id) || id === "atmega328p" || id === "attiny85" || id === "pic16f877a" || id === "ne555" || id === "stm32_chip" || id === "esp12f") {
    return ic(w, h, pins, id === "atmega328p" ? "ATMEGA328P" : id === "attiny85" ? "ATTINY85" : id === "pic16f877a" ? "PIC16F877A" : id === "ne555" ? "NE555" : id === "stm32_chip" ? "STM32" : id === "esp12f" ? "ESP-12F" : id.startsWith("mcu") ? "MCU" : "IC");
  }
  if (/arduino|esp|stm32|pico|lcd|oled|tft|display|dot_matrix|buck|boost|charger|dcdc|lm2596|ultrasonic|pir|gas|nrf24|bluetooth|hc05|sensor/.test(id)) return module(id, w, h, pins, v);
  // unknown symbol: generic moulded black body with leads
  const b: Box = { x: 0.5, y: 0.25, w: w - 1, h: h - 0.5 };
  shadowRR(b.x, b.y, b.w, b.h, 0.12);
  pinLeads(pins, b);
  plastic(b.x, b.y, b.w, b.h, 0.12, rgb("#2b303a"), 0.4);
  mark(id.replace(/_/g, " ").toUpperCase().slice(0, 12), cx, cy, 0.2);
}

function toWorld(p: V, cx: number, cy: number, s: number, rotRad: number): V {
  const c = Math.cos(rotRad), si = Math.sin(rotRad), x = p[0] - cx, y = p[1] - cy;
  return [(x * c - y * si) * s, (x * si + y * c) * s];
}

/**
 * Builds the geometry of one component. Positions in the result are relative to the node's
 * (x, y) origin, already rotated and scaled — add the node position to place it.
 */
export function buildRealisticSymbol(inst: RealisticInput, pins: PinLike[]): RealisticGeometry {
  OUT = []; SH = []; MK = [];
  const rot = ((inst.rotation || 0) * Math.PI) / 180;
  ROT = rot;
  drawSymbol(inst, pins);
  const w = inst.width, h = inst.height, s = inst.scale || 1, al = inst.alpha ?? 1;
  const fin = (arr: number[]) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i += 6) {
      const q = toWorld([arr[i], arr[i + 1]], w / 2, h / 2, s, rot);
      out[i] = w / 2 + q[0]; out[i + 1] = h / 2 + q[1];
      out[i + 2] = arr[i + 2] * al; out[i + 3] = arr[i + 3] * al; out[i + 4] = arr[i + 4] * al; out[i + 5] = arr[i + 5] * al;
    }
    return out;
  };
  const marks = MK.map((m) => { const q = toWorld([m.x, m.y], w / 2, h / 2, s, rot); return { ...m, x: w / 2 + q[0], y: h / 2 + q[1], size: m.size * s }; });
  const res = { main: fin(OUT), shadow: fin(SH), marks };
  OUT = []; SH = []; MK = [];
  return res;
}
