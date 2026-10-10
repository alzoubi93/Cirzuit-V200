// Native WebGL renderer for the realistic schematic view.
// No SVG / React-element dependency: every part is triangle geometry produced by
// ./realisticGeometry.ts (lit cylinders, spheres, soft shadows, real pin leads).
//
// Performance model
//  - Geometry of each part is cached per (symbol, size, rotation, scale, value, colour, state)
//    and is independent of its position, so dragging one part never rebuilds the others.
//  - Pan / zoom only change two uniforms (u_offset / u_scale); nothing is re-uploaded.
//  - All shadows are drawn first (one buffer), then all bodies, so a shadow never darkens a
//    neighbouring part.
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { GRID, type SymbolId } from "@/lib/schematic";
import { SYMBOLS } from "@/lib/symbols";
import { getOrCreateFontAtlas, layoutSdfText, type WebGLTextQuad } from "@/lib/webglTextSdf";
import { buildRealisticSymbol, type RealisticGeometry, type PinLike } from "./realisticGeometry";

export interface RealisticSymbolInstance {
  id: string;
  symbolId: SymbolId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  scale: number;
  value?: string;
  color?: string;
  liveValue?: string;
  /** Node metadata (generated connectors keep gender / colour / entry type here). */
  metadata?: any;
  glowing?: boolean;
  glowColor?: string;
  alpha?: number;
}

const geomCache = new Map<string, RealisticGeometry>();
function geometryFor(inst: RealisticSymbolInstance): RealisticGeometry {
  const md = inst.metadata ? [inst.metadata.gender, inst.metadata.color, inst.metadata.wireEntry, inst.metadata.orientation, inst.metadata.rows, inst.metadata.pinsPerRow].join(",") : "";
  const key = [inst.symbolId, inst.width, inst.height, inst.rotation, inst.scale, inst.value ?? "", inst.color ?? "", inst.glowing ? 1 : 0, inst.alpha ?? 1, md].join("|");
  const hit = geomCache.get(key);
  if (hit) return hit;
  const pins = ((SYMBOLS as Record<string, { pins?: PinLike[] }>)[inst.symbolId as string]?.pins ?? []) as PinLike[];
  const g = buildRealisticSymbol(
    { symbolId: inst.symbolId as string, width: inst.width, height: inst.height, rotation: inst.rotation ?? 0, scale: inst.scale || 1, value: inst.value, color: inst.color, glowing: inst.glowing, alpha: inst.alpha, metadata: inst.metadata },
    pins
  );
  if (geomCache.size > 3000) geomCache.clear();
  geomCache.set(key, g);
  return g;
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
const TVS = `attribute vec2 a_quad_pos; attribute vec4 a_pos_size; attribute vec4 a_uv_bounds; attribute vec4 a_color; uniform vec2 u_resolution; uniform float u_dpr; varying vec2 v_uv; varying vec4 v_color;
void main(){v_color=a_color; vec2 uv=a_quad_pos+vec2(.5); v_uv=vec2(mix(a_uv_bounds.x,a_uv_bounds.z,uv.x),mix(a_uv_bounds.y,a_uv_bounds.w,uv.y)); vec2 p=a_pos_size.xy+a_quad_pos*a_pos_size.zw; gl_Position=vec4((p.x*u_dpr/u_resolution.x)*2.0-1.0,1.0-(p.y*u_dpr/u_resolution.y)*2.0,0.0,1.0);}`;
const TFS = `precision highp float; uniform sampler2D u_font_atlas; varying vec2 v_uv; varying vec4 v_color; void main(){vec4 t=texture2D(u_font_atlas,v_uv); float a=smoothstep(.35,.65,t.a); gl_FragColor=vec4(v_color.rgb,a*v_color.a); if(gl_FragColor.a<.005) discard;}`;

function compile(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
  return s;
}

const LIVE_TEXT = /voltmeter|ammeter|mcu|arduino|esp|stm32|display/;

export function SchematicWebGLRealisticSymbols({ instances, view }: { instances: RealisticSymbolInstance[]; view: { x: number; y: number; scale: number } }): null {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locRef = useRef<any>(null);
  const uploadedRef = useRef<Float32Array | null>(null);

  // Geometry (world units, position included) — independent of pan / zoom.
  const { vertexData, marks } = useMemo(() => {
    const geoms = instances.map((inst) => ({ inst, g: geometryFor(inst) }));
    let total = 0;
    for (const { g } of geoms) total += g.shadow.length + g.main.length;
    const out = new Float32Array(total);
    let o = 0;
    const copy = (src: Float32Array, ox: number, oy: number) => {
      for (let i = 0; i < src.length; i += 6) {
        out[o++] = src[i] + ox; out[o++] = src[i + 1] + oy;
        out[o++] = src[i + 2]; out[o++] = src[i + 3]; out[o++] = src[i + 4]; out[o++] = src[i + 5];
      }
    };
    for (const { inst, g } of geoms) copy(g.shadow, inst.x, inst.y);
    for (const { inst, g } of geoms) copy(g.main, inst.x, inst.y);
    const mk: { inst: RealisticSymbolInstance; text: string; x: number; y: number; size: number; color: [number, number, number] }[] = [];
    for (const { inst, g } of geoms) {
      for (const m of g.marks) mk.push({ inst, text: m.text, x: inst.x + m.x, y: inst.y + m.y, size: m.size, color: m.color });
    }
    return { vertexData: out, marks: mk };
  }, [instances]);

  // Text (part markings + live meter readings) — depends on view because SDF quads are in pixels.
  const textQuads = useMemo(() => {
    const tq: WebGLTextQuad[] = [];
    const ws = view.scale * GRID;
    const atlas = getOrCreateFontAtlas();
    for (const m of marks) {
      const rot = m.inst.rotation === 180 ? 0 : m.inst.rotation || 0;
      tq.push(...layoutSdfText(atlas, { text: m.text, x: m.x * ws + view.x, y: m.y * ws + view.y, size: Math.max(0.05, m.size) * ws, rotationDeg: rot, color: [m.color[0], m.color[1], m.color[2], 0.95], justify: "center", verticalAlign: "middle" }));
    }
    for (const inst of instances) {
      const text = (inst.liveValue || "").trim();
      if (!text || !LIVE_TEXT.test(String(inst.symbolId))) continue;
      const a = ((inst.rotation || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const dx = 0, dy = inst.height * 0.5 + 0.35;
      const px = inst.x + inst.width / 2 + (dx * c - dy * s), py = inst.y + inst.height / 2 + (dx * s + dy * c);
      tq.push(...layoutSdfText(atlas, { text, x: px * ws + view.x, y: py * ws + view.y, size: 0.42 * ws, rotationDeg: inst.rotation === 180 ? 0 : inst.rotation || 0, color: [0.55, 1, 0.6, 1], justify: "center", verticalAlign: "middle" }));
    }
    return tq;
  }, [marks, instances, view.x, view.y, view.scale]);

  useSchematicGLPass(
    "realisticSymbols",
    SCHEMATIC_GL_PASS_ORDER.symbols - 2,
    (gl: PcbGL) => {
      const vs = compile(gl, gl.VERTEX_SHADER, VS), fs = compile(gl, gl.FRAGMENT_SHADER, FS);
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

  const tpRef = useRef<WebGLProgram | null>(null), tbRef = useRef<WebGLBuffer | null>(null), tiRef = useRef<WebGLBuffer | null>(null), ttRef = useRef<WebGLTexture | null>(null);
  useSchematicGLPass(
    "realisticSymbolText",
    SCHEMATIC_GL_PASS_ORDER.symbols - 1.5,
    (gl: PcbGL) => {
      const vs = compile(gl, gl.VERTEX_SHADER, TVS), fs = compile(gl, gl.FRAGMENT_SHADER, TFS);
      if (!vs || !fs) return;
      const p = gl.createProgram();
      if (!p) return;
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      const tex = gl.createTexture();
      if (!tex) return;
      const atlas = getOrCreateFontAtlas();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      tpRef.current = p; ttRef.current = tex; tbRef.current = gl.createBuffer(); tiRef.current = gl.createBuffer();
      return () => {
        if (ttRef.current) gl.deleteTexture(ttRef.current);
        if (tbRef.current) gl.deleteBuffer(tbRef.current);
        if (tiRef.current) gl.deleteBuffer(tiRef.current);
        gl.deleteProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
      };
    },
    (frame: PcbGLFrame) => {
      const gl = frame.gl, ext = frame.ext, p = tpRef.current, tex = ttRef.current, qb = tbRef.current, ib = tiRef.current;
      if (!p || !tex || !qb || !ib || !textQuads.length) return;
      const data = new Float32Array(textQuads.length * 12);
      let o = 0;
      for (const q of textQuads) { data[o++] = q.x; data[o++] = q.y; data[o++] = q.w; data[o++] = q.h; data[o++] = q.u0; data[o++] = q.v0; data[o++] = q.u1; data[o++] = q.v1; data[o++] = q.color[0]; data[o++] = q.color[1]; data[o++] = q.color[2]; data[o++] = q.color[3]; }
      gl.useProgram(p);
      gl.uniform2f(gl.getUniformLocation(p, "u_resolution"), frame.physW, frame.physH);
      gl.uniform1f(gl.getUniformLocation(p, "u_dpr"), frame.dpr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(p, "u_font_atlas"), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), gl.STATIC_DRAW);
      const ap = gl.getAttribLocation(p, "a_quad_pos");
      gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const stride = 48;
      const pos = gl.getAttribLocation(p, "a_pos_size"), uv = gl.getAttribLocation(p, "a_uv_bounds"), co = gl.getAttribLocation(p, "a_color");
      gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 4, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 4, gl.FLOAT, false, stride, 16);
      gl.enableVertexAttribArray(co); gl.vertexAttribPointer(co, 4, gl.FLOAT, false, stride, 32);
      ext.vertexAttribDivisorANGLE(pos, 1); ext.vertexAttribDivisorANGLE(uv, 1); ext.vertexAttribDivisorANGLE(co, 1);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, textQuads.length);
      ext.vertexAttribDivisorANGLE(pos, 0); ext.vertexAttribDivisorANGLE(uv, 0); ext.vertexAttribDivisorANGLE(co, 0);
    },
    [textQuads]
  );
  return null;
}
