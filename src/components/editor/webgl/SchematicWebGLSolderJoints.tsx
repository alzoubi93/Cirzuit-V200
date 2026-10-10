// Realistic view: a shiny solder joint drawn ON TOP of every pin / leg that has a wire connected.
// Rendered above the symbol pass so it sits over module legs (Arduino, ESP32, headers, ICs…).
// World-space geometry + uniforms: pan / zoom never rebuild or re-upload anything.
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { GRID } from "@/lib/schematic";

export interface SolderJointInstance {
  x: number;
  y: number;
  /** Ball radius in grid units (default 0.15). */
  radius?: number;
}

type RGB = [number, number, number];

const L = (() => { const x = -0.45, y = -0.6, z = 0.66, n = Math.hypot(x, y, z); return [x / n, y / n]; })();

function push(v: number[], x: number, y: number, c: RGB, a: number) { v.push(x, y, c[0] * a, c[1] * a, c[2] * a, a); }
function disc(v: number[], cx: number, cy: number, r: number, c: RGB, a: number, seg = 18) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    push(v, cx, cy, c, a);
    push(v, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, c, a);
    push(v, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, c, a);
  }
}
// Shaded metal ball: stacked discs walking toward the light; the hottest disc is the specular spot.
function ball(v: number[], cx: number, cy: number, r: number, base: RGB, spec = 1) {
  const K = 9;
  for (let i = 0; i < K; i++) {
    const t = i / (K - 1);
    const b = 0.3 + 0.9 * Math.pow(t, 0.9);
    let c: RGB = [Math.min(1, base[0] * b), Math.min(1, base[1] * b), Math.min(1, base[2] * b)];
    if (t > 0.76) { const w = ((t - 0.76) / 0.24) * spec; c = [c[0] + (1 - c[0]) * w, c[1] + (1 - c[1]) * w, c[2] + (1 - c[2]) * w]; }
    disc(v, cx + L[0] * r * 0.62 * t, cy + L[1] * r * 0.62 * t, r * (1 - t * 0.9), c, 1, 20);
  }
}

function hash(x: number, y: number): number {
  let h = 2166136261;
  for (const n of [Math.round(x * 100), Math.round(y * 100)]) { h ^= n & 0xffff; h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const SOLDER: RGB = [0.88, 0.92, 0.98]; // Bright shiny metallic silver
const FLUX: RGB = [0.85, 0.55, 0.12]; // Golden amber rosin flux

export function buildSolderJoint(v: number[], x: number, y: number, R: number) {
  const r1 = hash(x, y), r2 = hash(y, x + 3.1);
  const a1 = r1 * Math.PI * 2, a2 = r2 * Math.PI * 2;
  // Rosin flux residue ring around joint
  disc(v, x, y, R * 1.6, FLUX, 0.12, 22);
  disc(v, x, y, R * 1.3, FLUX, 0.15, 22);
  // Contact shadow
  for (let k = 0; k < 4; k++) disc(v, x + 0.04, y + 0.07, R * (1.12 + k * 0.1), [0, 0, 0], 0.12, 20);
  // Dark copper/pad fillet
  disc(v, x, y, R * 1.15, [0.3, 0.33, 0.4], 1, 22);
  disc(v, x + Math.cos(a1) * R * 0.2, y + Math.sin(a1) * R * 0.2, R * 1.0, [0.3, 0.33, 0.4], 1, 18);
  // Shiny solder ball + merged side lobes
  ball(v, x + Math.cos(a2) * R * 0.18, y + Math.sin(a2) * R * 0.18, R * 0.65, SOLDER, 1.0);
  ball(v, x - Math.cos(a1) * R * 0.22, y - Math.sin(a1) * R * 0.22, R * 0.68, SOLDER, 1.0);
  ball(v, x, y, R * 0.95, SOLDER, 1.0);
  // Crisp double specular glints for ultra-shiny metallic reflection
  disc(v, x - R * 0.32, y - R * 0.36, R * 0.22, [1, 1, 1], 0.95, 14);
  disc(v, x - R * 0.22, y - R * 0.26, R * 0.12, [1, 1, 1], 1.0, 10);
  disc(v, x + R * 0.38, y + R * 0.4, R * 0.28, [1, 1, 1], 0.12, 12); // Bounce ambient light
}

const VS = `attribute vec2 a_position; attribute vec4 a_color;
uniform vec2 u_resolution; uniform float u_dpr; uniform vec2 u_offset; uniform float u_scale;
varying vec4 v_color;
void main(){
  vec2 css = a_position * u_scale + u_offset;
  vec2 clip = (css * u_dpr / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}`;
const FS = `precision mediump float; varying vec4 v_color; void main(){gl_FragColor=v_color;}`;

export function SchematicWebGLSolderJoints({ instances, view }: { instances: SolderJointInstance[]; view: { x: number; y: number; scale: number } }): null {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const uploadedRef = useRef<Float32Array | null>(null);
  const locRef = useRef<any>(null);

  const vertexData = useMemo(() => {
    const v: number[] = [];
    for (const j of instances) buildSolderJoint(v, j.x, j.y, j.radius ?? 0.15);
    return new Float32Array(v);
  }, [instances]);

  useSchematicGLPass(
    "solderJoints",
    SCHEMATIC_GL_PASS_ORDER.symbols + 2,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
        return s;
      };
      const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return;
      const p = gl.createProgram();
      if (!p) return;
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return; }
      programRef.current = p; bufferRef.current = gl.createBuffer(); uploadedRef.current = null;
      locRef.current = {
        a: gl.getAttribLocation(p, "a_position"), c: gl.getAttribLocation(p, "a_color"),
        r: gl.getUniformLocation(p, "u_resolution"), d: gl.getUniformLocation(p, "u_dpr"),
        o: gl.getUniformLocation(p, "u_offset"), s: gl.getUniformLocation(p, "u_scale"),
      };
      return () => {
        if (bufferRef.current) gl.deleteBuffer(bufferRef.current);
        gl.deleteProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
        programRef.current = null; bufferRef.current = null; uploadedRef.current = null;
      };
    },
    (frame: PcbGLFrame) => {
      const gl = frame.gl, loc = locRef.current, b = bufferRef.current, p = programRef.current;
      if (!p || !loc || !b || !vertexData.length) return;
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      if (uploadedRef.current !== vertexData) { gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW); uploadedRef.current = vertexData; }
      gl.enableVertexAttribArray(loc.a); gl.vertexAttribPointer(loc.a, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 4, gl.FLOAT, false, 24, 8);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(loc.r, frame.physW, frame.physH); gl.uniform1f(loc.d, frame.dpr);
      gl.uniform2f(loc.o, view.x, view.y); gl.uniform1f(loc.s, view.scale * GRID);
      gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 6);
    },
    [vertexData, view.x, view.y, view.scale]
  );
  return null;
}
