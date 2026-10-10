// Pure (React-free) part of the WebGL fire effect: GLSL sources + CPU particle evaluation.
// Kept separate from SchematicWebGLFire.tsx so it can be unit-tested / rendered without React.
import { GRID } from "@/lib/schematic";

export interface FireInstance {
  id: string;
  /** centre of the burning part, world (grid) units */
  x: number;
  y: number;
  /** half-size of the part, world units — flames scale with it */
  radius: number;
  /** 0..1 */
  severity: number;
  /** performance.now()/1000 at the moment of ignition */
  startSec: number;
  /** stable per-part random seed (integer) */
  seed: number;
}

export const FIRE_VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec4 a_p;
uniform vec2 u_resolution;
uniform float u_dpr;
varying vec2 v_uv;
varying vec4 v_p;
void main() {
  vec2 clip = (a_pos * u_dpr / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_p = a_p;
}
`;

export const FIRE_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
varying vec4 v_p; // x = age (0..1) | y = seed | z = type | w = intensity

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
vec3 blackbody(float h) {
  vec3 c = mix(vec3(0.35, 0.02, 0.0), vec3(0.95, 0.22, 0.02), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(1.0, 0.62, 0.08), smoothstep(0.30, 0.65, h));
  c = mix(c, vec3(1.0, 0.92, 0.55), smoothstep(0.60, 0.88, h));
  c = mix(c, vec3(1.0, 1.0, 0.92), smoothstep(0.86, 1.0, h));
  return c;
}
void main() {
  float age = v_p.x, seed = v_p.y, type = v_p.z, inten = v_p.w;
  vec2 uv = v_uv;
  float r = length(uv);

  if (type < 0.5) {
    // ---------------------------------------------------------------- flame tongue
    float n = fbm(vec2(uv.x * 1.9 + seed * 11.0, uv.y * 1.6 - age * 3.2 + seed * 5.0));
    vec2 q = uv;
    q.x += (n - 0.5) * (0.55 + 0.9 * age);                    // lateral tearing grows with height
    float w = mix(0.18, 1.0, smoothstep(-1.0, 0.55, uv.y));    // wide at the base, pointed at the tip
    float d = length(vec2(q.x / w, (uv.y + 0.12) * 0.82));
    float a = 1.0 - smoothstep(0.45, 1.0, d + (n - 0.5) * 0.42);
    float heat = a * (1.0 - age * 0.9) * (0.5 + 0.28 * inten);
    heat += pow(a, 5.0) * 0.14 * (1.0 - age);                  // small white-hot core only
    vec3 col = blackbody(clamp(heat, 0.0, 1.0));
    float al = a * (1.0 - age) * (1.0 - age * 0.3) * inten * 0.42;
    gl_FragColor = vec4(col * al, al * 0.6);
  } else if (type < 1.5) {
    // ---------------------------------------------------------------- smoke puff
    float n = fbm(uv * 1.7 + vec2(seed * 13.0, age * 1.4));
    float a = 1.0 - smoothstep(0.15, 1.0, r + (n - 0.5) * 0.8);
    float op = a * 0.48 * smoothstep(0.0, 0.18, age) * (1.0 - age) * inten;
    vec3 col = vec3(mix(0.05, 0.42, age)) + vec3(0.10, 0.045, 0.0) * (1.0 - age) * (1.0 - age);
    gl_FragColor = vec4(col * op, op);
  } else if (type < 2.5) {
    // ---------------------------------------------------------------- spark streak
    float core = exp(-uv.x * uv.x * 5.5) * (1.0 - smoothstep(0.55, 1.0, abs(uv.y)));
    vec3 col = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.32, 0.03), age);
    float al = core * (1.0 - age) * inten;
    gl_FragColor = vec4(col * al, al);
  } else if (type < 3.5) {
    // ---------------------------------------------------------------- additive ember / flash glow
    float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.2);
    vec3 col = mix(vec3(1.0, 0.28, 0.03), vec3(1.0, 0.86, 0.5), seed);
    float al = a * inten * (0.65 + 0.35 * age);
    gl_FragColor = vec4(col * al, al * 0.8);
  } else {
    // ---------------------------------------------------------------- soot / char patch
    float n = fbm(uv * 2.6 + vec2(seed * 7.0, 0.0));
    float a = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.7);
    float op = a * 0.78 * inten;
    float edge = smoothstep(0.0, 0.5, a) * (1.0 - smoothstep(0.5, 1.0, a));
    vec3 col = vec3(0.02, 0.016, 0.014) + vec3(0.35, 0.09, 0.0) * edge * 0.25 * (1.0 - age); // glowing ember rim
    gl_FragColor = vec4(col * op, op);
  }
}
`;

export const FIRE_FLOATS = 8; // pos(2) uv(2) p(4)

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x: number) => x - Math.floor(x);
/** deterministic hash -> [0,1) */
function rnd(a: number, b = 0, c = 0): number {
  let h = Math.imul((a * 374761393) | 0, 1) ^ Math.imul((b * 668265263) | 0, 1) ^ Math.imul((c * 2147483647) | 0, 1);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pushQuad(out: number[], cx: number, cy: number, hw: number, hh: number, rot: number, age: number, seed: number, type: number, inten: number) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const corner = (ux: number, uy: number): number[] => {
    const lx = ux * hw, ly = uy * hh;
    return [cx + lx * c - ly * s, cy + lx * s + ly * c, ux, uy, age, seed, type, inten];
  };
  const a = corner(-1, -1), b = corner(1, -1), d = corner(1, 1), e = corner(-1, 1);
  out.push(...a, ...b, ...d, ...a, ...d, ...e);
}

/** Build the vertex data of one frame. `back` = normal-blended (soot, smoke), `front` = additive (glow, flames, sparks). */
export function buildFireVertices(inst: FireInstance, view: { x: number; y: number; scale: number }, nowSec: number, back: number[], front: number[]) {
  const ws = view.scale * GRID;
  const cx = inst.x * ws + view.x, cy = inst.y * ws + view.y;
  const R = Math.max(inst.radius * ws, 8);
  const T = Math.max(0, nowSec - inst.startSec);
  const sev = clamp01(inst.severity);
  const ramp = smooth(0, 1.1, T);
  const fireAmt = clamp01((sev - 0.2) / 0.3);          // 0 = smoke only
  const seed = inst.seed;

  // soot on the body
  if (ramp > 0.02) pushQuad(back, cx, cy, R * 1.05, R * 0.95, 0, clamp01(1 - ramp), seed, 4, ramp * (0.55 + 0.45 * sev));

  // smoke
  const nSmoke = Math.round(8 + 16 * sev);
  const smokeOn = smooth(0.15, 1.3, T);
  if (smokeOn > 0) {
    for (let i = 0; i < nSmoke; i++) {
      const life = 2.4 + 1.8 * rnd(i, seed, 1);
      const u = fract(T / life + rnd(i, seed, 2));
      const rise = R * (2.6 + 2.4 * sev) * (0.8 + 0.4 * rnd(i, seed, 3));
      const x = cx + (rnd(i, seed, 4) - 0.5) * R * 0.8 + Math.sin(T * 0.7 + rnd(i, seed, 5) * 6.28) * R * 0.55 * u + R * 0.7 * u * u;
      const y = cy - R * 0.2 - rise * Math.pow(u, 0.8);
      const sz = R * (0.55 + 1.5 * u) * (0.8 + 0.4 * rnd(i, seed, 6));
      pushQuad(back, x, y, sz, sz, rnd(i, seed, 7) * 6.28, u, rnd(i, seed, 8), 1, smokeOn * (0.55 + 0.45 * sev));
    }
  }

  // ember glow (always while burning / overheating)
  const flick = 0.78 + 0.14 * Math.sin(T * 17.3 + seed * 9) + 0.08 * Math.sin(T * 31.1 + seed * 3);
  pushQuad(front, cx, cy, R * (1.7 + 1.2 * sev), R * (1.7 + 1.2 * sev), 0, 0.5 + 0.5 * Math.sin(T * 9), 0.15 + 0.5 * fireAmt, 3, ramp * flick * (0.3 + 0.55 * sev));
  // ignition flash
  if (T < 0.45) {
    const f = T / 0.45;
    pushQuad(front, cx, cy, R * (1.5 + 3.4 * f), R * (1.5 + 3.4 * f), 0, 0.2, 1, 3, (1 - f) * (1 - f) * 1.4);
  }

  // flames
  if (fireAmt > 0) {
    const nFlame = Math.round(fireAmt * (18 + 34 * sev));
    const H = R * (1.35 + 1.9 * sev) * (0.35 + 0.65 * ramp);
    for (let i = 0; i < nFlame; i++) {
      const life = 0.5 + 0.55 * rnd(i, seed, 11);
      const u = fract(T * 1.15 / life + rnd(i, seed, 12));
      const spread = R * (0.38 + 0.34 * sev);
      const x = cx + (rnd(i, seed, 13) - 0.5) * 2 * spread * (1 - 0.55 * u) +
        Math.sin(T * (3.2 + rnd(i, seed, 14) * 3.5) + rnd(i, seed, 15) * 6.28) * R * 0.22 * u;
      const y = cy + R * 0.32 - H * Math.pow(u, 0.85) * (0.7 + 0.55 * rnd(i, seed, 16));
      const w = R * (0.5 + 0.5 * rnd(i, seed, 17)) * (1 - 0.5 * u) * (0.55 + 0.5 * ramp);
      pushQuad(front, x, y, w, w * 1.95, (Math.sin(T * 5 + i) * 0.08), u, rnd(i, seed, 18), 0, ramp * (0.65 + 0.4 * sev));
    }
    // bright hot base that stays put
    for (let k = 0; k < 2; k++) {
      const w = R * (0.55 - k * 0.12) * (0.6 + 0.4 * ramp), fl = 0.9 + 0.1 * Math.sin(T * (13 + k * 4.7) + seed);
      pushQuad(front, cx + Math.sin(T * (5 + k) + seed) * R * 0.08, cy + R * 0.3 - k * R * 0.12, w, w * 1.7, 0, 0.18 + k * 0.1, rnd(k, seed, 19), 0, ramp * fl * 0.8);
    }
  }

  // sparks
  const nSpark = Math.round(5 + 14 * sev * (0.4 + 0.6 * fireAmt));
  for (let i = 0; i < nSpark; i++) {
    const life = 0.45 + 0.8 * rnd(i, seed, 21);
    const tt = T / life + rnd(i, seed, 22);
    const cyc = Math.floor(tt), u = fract(tt);
    if (cyc < 0) continue;
    const ang = -Math.PI / 2 + (rnd(i, seed, 23 + cyc) - 0.5) * 2.1;
    const speed = R * (2.4 + 3.8 * rnd(i, seed, 24 + cyc)) * (0.5 + 0.7 * ramp);
    const g = R * 5.5, t = u * life;
    const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed + g * t;
    const px = cx + (rnd(i, seed, 25 + cyc) - 0.5) * R * 0.6 + Math.cos(ang) * speed * t;
    const py = cy + Math.sin(ang) * speed * t + 0.5 * g * t * t;
    const len = 3 + Math.min(14, Math.hypot(vx, vy) * 0.028) , rot = Math.atan2(vy, vx) - Math.PI / 2;
    pushQuad(front, px, py, Math.max(1.2, R * 0.06), len, rot, u, rnd(i, seed, 26), 2, ramp * (0.6 + 0.4 * sev));
  }
}

