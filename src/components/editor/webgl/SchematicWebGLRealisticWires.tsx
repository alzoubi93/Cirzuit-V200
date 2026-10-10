// Native WebGL renderer for realistic wires (no SVG involved).
//
// Each wire is a single continuous triangle strip per lane (no overlapping segments), lit like a
// real insulated cable: cylindrical diffuse shading + a specular streak, a soft multi-layer
// contact shadow, exposed copper ferrules and a shiny solder ball at each end.
//
// Geometry is generated once in WORLD units (grid cells) and only re-generated when the wires
// change. Pan / zoom only update two uniforms (u_offset / u_scale), so navigation is free.
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { flattenPath } from "@/lib/svgPathFlatten";
import { GRID } from "@/lib/schematic";

export interface RealisticWireInstance {
  id: string;
  d: string;
  color: string; // hex — the wire's own "sleeve" color
  /** insulated (default) | copper | silver ("معدني" — bare tinned metal) */
  material?: "insulated" | "copper" | "silver";
  /** A highlight color (simulation / snap / net) is active: tint bare metal with `color`. */
  tinted?: boolean;
  /** Wire is plugged into a board/module pin (Arduino, ESP32, …): drawn ABOVE the board body. */
  overBoard?: boolean;
}

export interface SchematicWebGLRealisticWiresProps {
  instances: RealisticWireInstance[];
  view: { x: number; y: number; scale: number };
}

type RGB = [number, number, number];
type P = [number, number];

function hexToRgb(hex: string): RGB {
  const h = (hex || "#64748b").replace("#", "");
  if (h.length === 3) return [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255];
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return [(r || 0) / 255, (g || 0) / 255, (b || 0) / 255];
}

const flattenCache = new Map<string, P[][]>();
function flattenCached(d: string): P[][] {
  const hit = flattenCache.get(d);
  if (hit) return hit;
  const subs = flattenPath(d).map((s) => s.points as P[]);
  if (flattenCache.size > 4000) flattenCache.clear();
  flattenCache.set(d, subs);
  return subs;
}

// ---- lighting -------------------------------------------------------------------------------
const L = (() => { const x = -0.45, y = -0.6, z = 0.66, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
const H = (() => { const x = L[0], y = L[1], z = L[2] + 1, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();

function lit(base: RGB, nx: number, ny: number, nz: number, spec = 0.55, shin = 34): RGB {
  const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const k = 0.34 + 0.86 * d;
  const sp = Math.pow(Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]), shin) * spec;
  return [Math.min(1, base[0] * k + sp), Math.min(1, base[1] * k + sp), Math.min(1, base[2] * k + sp)];
}

// ---- geometry helpers ------------------------------------------------------------------------
function vtx(v: number[], x: number, y: number, c: RGB, a: number) {
  v.push(x, y, c[0] * a, c[1] * a, c[2] * a, a);
}
function tri(v: number[], p: P, q: P, r: P, cp: RGB, cq: RGB, cr: RGB, a: number) {
  vtx(v, p[0], p[1], cp, a); vtx(v, q[0], q[1], cq, a); vtx(v, r[0], r[1], cr, a);
}
function disc(v: number[], cx: number, cy: number, r: number, c: RGB, a = 1, seg = 20) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    tri(v, [cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r], c, c, c, a);
  }
}
// Shaded ball: stacked discs shifted toward the light, brightest disc = specular hot spot.
function ball(v: number[], cx: number, cy: number, r: number, base: RGB, spec = 0.9) {
  const K = 8;
  for (let i = 0; i < K; i++) {
    const t = i / (K - 1);
    const rr = r * (1 - t * 0.9);
    const ox = L[0] * r * 0.5 * t * 1.2, oy = L[1] * r * 0.5 * t * 1.2;
    const b = 0.3 + 0.85 * Math.pow(t, 0.9);
    let c: RGB = [Math.min(1, base[0] * b), Math.min(1, base[1] * b), Math.min(1, base[2] * b)];
    if (t > 0.78) { const w = ((t - 0.78) / 0.22) * spec; c = [c[0] + (1 - c[0]) * w, c[1] + (1 - c[1]) * w, c[2] + (1 - c[2]) * w]; }
    disc(v, cx + ox, cy + oy, rr, c, 1, 20);
  }
}

interface Path {
  pts: P[];
  nx: number[]; // averaged unit normal per point
  ny: number[];
  sc: number[]; // miter scale per point
  dx: number[]; // averaged unit direction
  dy: number[];
}

function buildPath(pts0: P[]): Path | null {
  // remove duplicate points
  const pts: P[] = [];
  for (const p of pts0) {
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) pts.push(p);
  }
  if (pts.length < 2) return null;
  const n = pts.length;
  const nx: number[] = [], ny: number[] = [], sc: number[] = [], dx: number[] = [], dy: number[] = [];
  const seg: P[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const ax = pts[i + 1][0] - pts[i][0], ay = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(ax, ay) || 1;
    seg.push([ax / l, ay / l]);
  }
  for (let i = 0; i < n; i++) {
    const d0 = seg[Math.max(0, i - 1)], d1 = seg[Math.min(seg.length - 1, i)];
    let mx = d0[0] + d1[0], my = d0[1] + d1[1];
    let ml = Math.hypot(mx, my);
    if (ml < 1e-3) { mx = d1[0]; my = d1[1]; ml = 1; }
    mx /= ml; my /= ml;
    dx.push(mx); dy.push(my);
    nx.push(-my); ny.push(mx);
    const cos = Math.max(0.5, -my * -d1[1] + mx * d1[0]); // n · segNormal
    sc.push(1 / cos);
  }
  return { pts, nx, ny, sc, dx, dy };
}

// One lane of the strip: from lateral offset t0 to t1 (in [-1,1] of the half width).
function lane(v: number[], path: Path, half: number, t0: number, t1: number, col: (t: number, nx: number, ny: number) => RGB, a: number, off: P = [0, 0]) {
  const { pts, nx, ny, sc } = path;
  for (let i = 0; i + 1 < pts.length; i++) {
    const j = i + 1;
    const A0: P = [pts[i][0] + nx[i] * sc[i] * half * t0 + off[0], pts[i][1] + ny[i] * sc[i] * half * t0 + off[1]];
    const A1: P = [pts[i][0] + nx[i] * sc[i] * half * t1 + off[0], pts[i][1] + ny[i] * sc[i] * half * t1 + off[1]];
    const B0: P = [pts[j][0] + nx[j] * sc[j] * half * t0 + off[0], pts[j][1] + ny[j] * sc[j] * half * t0 + off[1]];
    const B1: P = [pts[j][0] + nx[j] * sc[j] * half * t1 + off[0], pts[j][1] + ny[j] * sc[j] * half * t1 + off[1]];
    const ca0 = col(t0, nx[i], ny[i]), ca1 = col(t1, nx[i], ny[i]);
    const cb0 = col(t0, nx[j], ny[j]), cb1 = col(t1, nx[j], ny[j]);
    tri(v, A0, A1, B1, ca0, ca1, cb1, a);
    tri(v, A0, B1, B0, ca0, cb1, cb0, a);
  }
}

function round(v: number[], path: Path, half: number, base: RGB) {
  // Round caps + smoothing at joints using shaded discs (cheap and invisible at schematic zoom).
  const ends = [0, path.pts.length - 1];
  for (const i of ends) disc(v, path.pts[i][0], path.pts[i][1], half * 0.98, lit(base, 0, 0, 1, 0.3), 1, 14);
}

const SHADOW: RGB = [0, 0, 0];
const COPPER = hexToRgb("#d9863f");
const SOLDER = hexToRgb("#cbd5e1");
const WHITE3: RGB = [1, 1, 1];

// Metal shading: diffuse body + broad sheen + narrow hot streak + a dim bounce light on the far side,
// which is what makes a bare wire read as polished metal instead of painted plastic.
const B = (() => { const x = 0.5, y = 0.45, z = 0.55, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
function metal(base: RGB, sheen: RGB, nx: number, ny: number, nz: number): RGB {
  const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  const nh = Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]);
  const bounce = Math.max(0, nx * B[0] + ny * B[1] + nz * B[2]);
  const broad = Math.pow(nh, 7) * 0.42, hot = Math.pow(nh, 70) * 0.95;
  const k = 0.2 + 0.62 * d + 0.2 * Math.pow(bounce, 2.2);
  return [
    Math.min(1, base[0] * k + sheen[0] * broad + hot),
    Math.min(1, base[1] * k + sheen[1] * broad + hot),
    Math.min(1, base[2] * k + sheen[2] * broad + hot),
  ];
}
const COPPER_BASE: RGB = [0.86, 0.47, 0.21], COPPER_SHEEN: RGB = [1, 0.72, 0.5];
// Tinned metal ("معدني"): cool neutral body with a faint blue cast in the sheen — like real
// tinned copper / steel wire under daylight, not flat grey paint.
const SILVER_BASE: RGB = [0.74, 0.78, 0.84], SILVER_SHEEN: RGB = [0.96, 0.99, 1];

function buildWire(v: number[], sub: P[], sleeve: RGB, material: "insulated" | "copper" | "silver" = "insulated", tint?: RGB) {
  const path = buildPath(sub);
  if (!path) return;
  const bare = material !== "insulated";
  const W = bare ? 0.17 : 0.22, half = W / 2;

  // 1. contact shadow: 5 growing translucent strips, offset away from the light
  for (let k = 0; k < 5; k++) {
    const g = 1 + k * 0.32;
    lane(v, path, half * g, -1, 1, () => SHADOW, bare ? 0.075 : 0.085, [0.055 + k * 0.012, 0.085 + k * 0.016]);
  }

  // 2. body: per-vertex cylindrical lighting (plastic sleeve or polished metal)
  const N = bare ? 14 : 10;
  const mBase = material === "copper" ? COPPER_BASE : SILVER_BASE, mSheen = material === "copper" ? COPPER_SHEEN : SILVER_SHEEN;
  const tb: RGB = tint ? [mBase[0] * 0.65 + tint[0] * 0.35, mBase[1] * 0.65 + tint[1] * 0.35, mBase[2] * 0.65 + tint[2] * 0.35] : mBase;
  const col = (t: number, nx: number, ny: number): RGB => {
    const z = Math.sqrt(Math.max(0, 1 - t * t));
    return bare ? metal(tb, mSheen, nx * t, ny * t, z) : lit(sleeve, nx * t, ny * t, z, 0.5, 30);
  };
  for (let i = 0; i < N; i++) lane(v, path, half, -1 + (2 * i) / N, -1 + (2 * (i + 1)) / N, col, 1);

  // 3. thin specular streak riding on the light-facing side of a plastic sleeve
  if (!bare) {
    lane(v, path, half, -0.55, -0.4, (_t, nx, ny) => {
      const s = Math.abs(nx * L[0] + ny * L[1]);
      const g = 0.1 + 0.9 * s;
      return [g, g, g] as RGB;
    }, 0.28);
  } else {
    // Bare metal realism: a stranded / drawn-wire surface. Fine longitudinal grooves at fixed
    // lateral positions (they follow the cable like real strands), a bright ridge between the
    // grooves on the light side, and darkened rims so the round section reads in silhouette.
    const groove = (t: number, nx: number, ny: number): RGB => {
      const c = metal(tb, mSheen, nx * t, ny * t, Math.sqrt(Math.max(0, 1 - t * t)));
      return [c[0] * 0.42, c[1] * 0.42, c[2] * 0.42];
    };
    for (const g of [-0.62, -0.18, 0.3, 0.68]) {
      lane(v, path, half, g - 0.045, g + 0.045, groove, 0.5);
    }
    // bright ridge highlight between strands on the light-facing side
    lane(v, path, half, -0.44, -0.36, (t, nx, ny) => {
      const c = metal(tb, mSheen, nx * t, ny * t, Math.sqrt(Math.max(0, 1 - t * t)));
      return [Math.min(1, c[0] * 1.35 + 0.18), Math.min(1, c[1] * 1.35 + 0.18), Math.min(1, c[2] * 1.35 + 0.18)] as RGB;
    }, 0.85);
    lane(v, path, half, 0.06, 0.14, (t, nx, ny) => {
      const c = metal(tb, mSheen, nx * t, ny * t, Math.sqrt(Math.max(0, 1 - t * t)));
      return [Math.min(1, c[0] * 1.25 + 0.1), Math.min(1, c[1] * 1.25 + 0.1), Math.min(1, c[2] * 1.25 + 0.1)] as RGB;
    }, 0.6);
    // rim darkening (Fresnel-ish edge falloff)
    const rim = (t: number, nx: number, ny: number): RGB => {
      const c = metal(tb, mSheen, nx * t, ny * t, Math.sqrt(Math.max(0, 1 - t * t)));
      return [c[0] * 0.5, c[1] * 0.5, c[2] * 0.55];
    };
    lane(v, path, half, -1, -0.9, rim, 0.55);
    lane(v, path, half, 0.9, 1, rim, 0.55);
  }

  round(v, path, half, bare ? tb : sleeve);

  // 4. ends: insulated wires show a stripped copper ferrule; every wire gets a solder ball
  const P0 = path.pts[0], P1 = path.pts[path.pts.length - 1];
  const D0: P = [path.dx[0], path.dy[0]], D1: P = [path.dx[path.pts.length - 1], path.dy[path.pts.length - 1]];
  const ferrule = (p: P, d: P, dir: number) => {
    const a: P = p, b: P = [p[0] + d[0] * dir * 0.16, p[1] + d[1] * dir * 0.16];
    const nx = -d[1], ny = d[0];
    const cc = (t: number): RGB => lit(COPPER, nx * t, ny * t, Math.sqrt(Math.max(0, 1 - t * t)), 0.8, 24);
    const M = 6;
    for (let i = 0; i < M; i++) {
      const t0 = -1 + (2 * i) / M, t1 = -1 + (2 * (i + 1)) / M, h = 0.075;
      const A0: P = [a[0] + nx * h * t0, a[1] + ny * h * t0], A1: P = [a[0] + nx * h * t1, a[1] + ny * h * t1];
      const B0: P = [b[0] + nx * h * t0, b[1] + ny * h * t0], B1: P = [b[0] + nx * h * t1, b[1] + ny * h * t1];
      tri(v, A0, A1, B1, cc(t0), cc(t1), cc(t1), 1); tri(v, A0, B1, B0, cc(t0), cc(t1), cc(t0), 1);
    }
  };
  if (!bare) { ferrule(P0, D0, -1); ferrule(P1, D1, 1); }
  for (const p of [P0, P1]) {
    disc(v, p[0] + 0.02, p[1] + 0.035, bare ? 0.12 : 0.14, SHADOW, 0.25, 18); // ball shadow
    ball(v, p[0], p[1], bare ? 0.105 : 0.125, SOLDER, 1);
  }
  void WHITE3;
}

// ---- shaders ----------------------------------------------------------------------------------
const VERTEX_SRC = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec2 u_resolution;
uniform float u_dpr;
uniform vec2 u_offset;
uniform float u_scale;
varying vec4 v_color;
void main() {
  vec2 css = a_position * u_scale + u_offset;
  vec2 clip = (css * u_dpr / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}`;
const FRAGMENT_SRC = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }`;

// One registered GL pass that draws a prebuilt wire vertex buffer. Used twice: once under the
// components (normal routing) and once above board/module bodies (wires plugged into board pins).
function useWirePass(name: string, order: number, vertexData: Float32Array, view: { x: number; y: number; scale: number }) {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const uploadedRef = useRef<Float32Array | null>(null);
  const locsRef = useRef<{
    aPosition: number; aColor: number;
    uResolution: WebGLUniformLocation | null; uDpr: WebGLUniformLocation | null;
    uOffset: WebGLUniformLocation | null; uScale: WebGLUniformLocation | null;
  } | null>(null);

  useSchematicGLPass(
    name,
    order,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(name, "shader error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
      const vert = compile(gl.VERTEX_SHADER, VERTEX_SRC);
      const frag = compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
      if (!vert || !frag) return;
      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(name, "link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }
      programRef.current = program;
      const buffer = gl.createBuffer();
      bufferRef.current = buffer;
      uploadedRef.current = null;
      locsRef.current = {
        aPosition: gl.getAttribLocation(program, "a_position"),
        aColor: gl.getAttribLocation(program, "a_color"),
        uResolution: gl.getUniformLocation(program, "u_resolution"),
        uDpr: gl.getUniformLocation(program, "u_dpr"),
        uOffset: gl.getUniformLocation(program, "u_offset"),
        uScale: gl.getUniformLocation(program, "u_scale"),
      };
      return () => {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vert);
        gl.deleteShader(frag);
        programRef.current = null;
        bufferRef.current = null;
        locsRef.current = null;
        uploadedRef.current = null;
      };
    },
    (frame: PcbGLFrame) => {
      const { gl, physW, physH, dpr } = frame;
      const program = programRef.current;
      const locs = locsRef.current;
      const buffer = bufferRef.current;
      if (!program || !locs || !buffer || vertexData.length === 0) return;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (uploadedRef.current !== vertexData) {
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
        uploadedRef.current = vertexData;
      }
      const stride = 6 * 4;
      gl.enableVertexAttribArray(locs.aPosition);
      gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(locs.aColor);
      gl.vertexAttribPointer(locs.aColor, 4, gl.FLOAT, false, stride, 2 * 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform1f(locs.uDpr, dpr);
      gl.uniform2f(locs.uOffset, view.x, view.y);
      gl.uniform1f(locs.uScale, view.scale * GRID);
      gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 6);
    },
    [vertexData, view.x, view.y, view.scale]
  );
}

export function SchematicWebGLRealisticWires({ instances, view }: SchematicWebGLRealisticWiresProps): null {
  // World-space geometry: independent of pan / zoom. Split into two batches — wires that end
  // on a board/module pin (Arduino, ESP32, …) are rendered ABOVE the board body so the wire
  // visibly lands on the pin, exactly like a real jumper pushed into a header hole.
  const { normalData, overData } = useMemo(() => {
    const normal: number[] = [];
    const over: number[] = [];
    for (const inst of instances) {
      const sleeve = hexToRgb(inst.color);
      const material = inst.material ?? "insulated";
      const tint = material !== "insulated" && inst.tinted ? sleeve : undefined;
      const target = inst.overBoard ? over : normal;
      for (const sub of flattenCached(inst.d)) buildWire(target, sub, sleeve, material, tint);
    }
    return { normalData: new Float32Array(normal), overData: new Float32Array(over) };
  }, [instances]);

  useWirePass("realisticWires", SCHEMATIC_GL_PASS_ORDER.wires, normalData, view);
  // Above realistic symbol bodies, just under the solder blobs (symbols + 2).
  useWirePass("realisticWiresOverBoard", SCHEMATIC_GL_PASS_ORDER.symbols + 1, overData, view);

  return null;
}
