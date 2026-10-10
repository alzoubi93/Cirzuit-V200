// Small reusable WebGL "badge": a filled rect with a border and centered text, drawn in world
// space. Currently used for the per-wire voltage tooltip shown while simulating (Canvas.tsx),
// but written generically since the net-label voltage badge is the same shape.
// Rounded corners (rx in the old SVG <rect>) are not replicated — a plain rect reads close
// enough at schematic zoom levels and keeps this to one shader family (see other webgl/* files).
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { GRID } from "@/lib/schematic";
import { getOrCreateFontAtlas, layoutSdfText, type WebGLTextQuad } from "@/lib/webglTextSdf";

export interface BadgeInstance {
  id: string;
  x: number; // world-space anchor/center
  y: number;
  width: number; // world units
  height: number;
  rotationDeg?: number; // text rotation in world/screen coordinates
  mirror?: boolean; // KiCad text justification mirror
  bgColor?: string; // #hex — omit to draw text with no background rect
  borderColor?: string; // #hex
  borderWidth?: number; // world units
  text: string;
  textColor: string; // #hex
  fontSize: number;
  justify?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
}

export interface SchematicWebGLBadgesProps {
  instances: BadgeInstance[];
  view: { x: number; y: number; scale: number };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255];
  }
  return [parseInt(h.substring(0, 2), 16) / 255, parseInt(h.substring(2, 4), 16) / 255, parseInt(h.substring(4, 6), 16) / 255];
}

const SHAPE_VERTEX_SRC = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec2 u_resolution;
uniform float u_dpr;
varying vec4 v_color;
void main() {
  vec2 phys = a_position * u_dpr;
  vec2 clip = (phys / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}
`;
const SHAPE_FRAGMENT_SRC = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }
`;

function useBadgeShapes(instances: BadgeInstance[], view: { x: number; y: number; scale: number }) {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  const vertexData = useMemo(() => {
    const verts: number[] = [];
    const worldScale = view.scale * GRID;

    for (const inst of instances) {
      if (!inst.bgColor) continue;
      const cx = inst.x * worldScale + view.x;
      const cy = inst.y * worldScale + view.y;
      const hw = (inst.width * worldScale) / 2;
      const hh = (inst.height * worldScale) / 2;
      const bw = Math.max(0.5, ((inst.borderWidth ?? 0.04) * worldScale) / 2);

      const [fr, fg, fb] = hexToRgb(inst.bgColor);
      verts.push(
        cx - hw, cy - hh, fr, fg, fb, 1, cx + hw, cy - hh, fr, fg, fb, 1, cx + hw, cy + hh, fr, fg, fb, 1,
        cx - hw, cy - hh, fr, fg, fb, 1, cx + hw, cy + hh, fr, fg, fb, 1, cx - hw, cy + hh, fr, fg, fb, 1
      );

      if (!inst.borderColor) continue;
      const [sr, sg, sb] = hexToRgb(inst.borderColor);
      const edges: [number, number, number, number][] = [
        [cx - hw, cy - hh, cx + hw, cy - hh],
        [cx + hw, cy - hh, cx + hw, cy + hh],
        [cx + hw, cy + hh, cx - hw, cy + hh],
        [cx - hw, cy + hh, cx - hw, cy - hh],
      ];
      for (const [x1, y1, x2, y2] of edges) {
        let dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const nx = -dy * bw, ny = dx * bw;
        const ax = x1 + nx, ay = y1 + ny;
        const bx = x1 - nx, by = y1 - ny;
        const cx2 = x2 - nx, cy2 = y2 - ny;
        const dxp = x2 + nx, dyp = y2 + ny;
        verts.push(
          ax, ay, sr, sg, sb, 1, bx, by, sr, sg, sb, 1, cx2, cy2, sr, sg, sb, 1,
          ax, ay, sr, sg, sb, 1, cx2, cy2, sr, sg, sb, 1, dxp, dyp, sr, sg, sb, 1
        );
      }
    }
    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, view.x, view.y, view.scale]);

  useSchematicGLPass(
    "badgeShapes",
    SCHEMATIC_GL_PASS_ORDER.symbols + 1,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("badgeShapes shader error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
      const vert = compile(gl.VERTEX_SHADER, SHAPE_VERTEX_SRC);
      const frag = compile(gl.FRAGMENT_SHADER, SHAPE_FRAGMENT_SRC);
      if (!vert || !frag) return;
      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("badgeShapes link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }
      programRef.current = program;
      const buffer = gl.createBuffer();
      bufferRef.current = buffer;
      locsRef.current = {
        aPosition: gl.getAttribLocation(program, "a_position"),
        aColor: gl.getAttribLocation(program, "a_color"),
        uResolution: gl.getUniformLocation(program, "u_resolution"),
        uDpr: gl.getUniformLocation(program, "u_dpr"),
      };
      return () => {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vert);
        gl.deleteShader(frag);
        programRef.current = null;
        bufferRef.current = null;
        locsRef.current = null;
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
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

      const stride = 6 * 4;
      gl.enableVertexAttribArray(locs.aPosition);
      gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(locs.aColor);
      gl.vertexAttribPointer(locs.aColor, 4, gl.FLOAT, false, stride, 2 * 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform1f(locs.uDpr, dpr);

      gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 6);
    },
    [vertexData]
  );
}

const TEXT_VERTEX_SRC = `
attribute vec2 a_quad_pos;
attribute vec4 a_pos_size;
attribute vec4 a_uv_bounds;
attribute float a_rotation;
attribute float a_mirror;
attribute vec4 a_color;
uniform vec2 u_resolution;
uniform float u_dpr;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  v_color = a_color;
  vec2 uv_norm = a_quad_pos + vec2(0.5, 0.5);
  if (a_mirror > 0.5) uv_norm.x = 1.0 - uv_norm.x;
  v_uv = vec2(mix(a_uv_bounds.x, a_uv_bounds.z, uv_norm.x), mix(a_uv_bounds.y, a_uv_bounds.w, uv_norm.y));
  vec2 local = vec2(a_quad_pos.x * a_pos_size.z, a_quad_pos.y * a_pos_size.w);
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 screen = a_pos_size.xy + local;
  vec2 clip = vec2((screen.x * u_dpr / u_resolution.x) * 2.0 - 1.0, 1.0 - (screen.y * u_dpr / u_resolution.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;
const TEXT_FRAGMENT_SRC = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform sampler2D u_font_atlas;
varying vec2 v_uv;
varying vec4 v_color;
float median(float r, float g, float b) { return max(min(r, g), min(max(r, g), b)); }
void main() {
  vec4 texel = texture2D(u_font_atlas, v_uv);
  // +0.12 dilates the glyph so small pin names / labels stay crisp and
  // clearly visible instead of rendering as thin, washed-out strokes.
  float sigDist = texel.a - 0.5 + 0.12;
  vec2 unitRange = vec2(8.0) / vec2(1024.0);
  vec2 screenTexSize = vec2(1.0) / max(fwidth(v_uv), vec2(0.000001));
  float screenPxRange = max(0.5 * (unitRange.x * screenTexSize.x + unitRange.y * screenTexSize.y), 1.0);
  float alpha = clamp(sigDist * screenPxRange + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(v_color.rgb, alpha * v_color.a);
  if (gl_FragColor.a <= 0.005) discard;
}
`;

function toEssl300(vsSrc: string, fsSrc: string): { vs: string; fs: string } {
  const vs = "#version 300 es\n" + vsSrc.trim().replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out");
  let fs = fsSrc.trim()
    .replace(/^#extension[^\n]*\n/m, "")
    .replace(/\bvarying\b/g, "in")
    .replace(/\btexture2D\(/g, "texture(")
    .replace(/\bgl_FragColor\b/g, "outColor");
  fs = fs.replace(/(precision\s+\w+\s+float\s*;)/, "$1\nout vec4 outColor;");
  return { vs, fs: "#version 300 es\n" + fs };
}

const FLOATS_PER_TEXT_QUAD = 14;

function useBadgeText(instances: BadgeInstance[], view: { x: number; y: number; scale: number }) {
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const quadVboRef = useRef<WebGLBuffer | null>(null);
  const instanceVboRef = useRef<WebGLBuffer | null>(null);

  const quads = useMemo(() => {
    const atlas = getOrCreateFontAtlas();
    const worldScale = view.scale * GRID;
    const all: WebGLTextQuad[] = [];
    for (const inst of instances) {
      const [r, g, b] = hexToRgb(inst.textColor);
      const textQuads = layoutSdfText(atlas, {
        text: inst.text,
        x: inst.x,
        y: inst.y,
        size: inst.fontSize,
        rotationDeg: inst.rotationDeg ?? 0,
        mirror: !!inst.mirror,
        color: [r, g, b, 1],
        justify: inst.justify ?? "center",
        verticalAlign: inst.verticalAlign ?? "middle",
      });
      all.push(...textQuads);
    }
    return all.map((q) => ({
      ...q,
      x: q.x * worldScale + view.x,
      y: q.y * worldScale + view.y,
      w: q.w * worldScale,
      h: q.h * worldScale,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, view.x, view.y, view.scale]);

  useSchematicGLPass(
    "badgeText",
    SCHEMATIC_GL_PASS_ORDER.symbols + 2,
    (gl: PcbGL, ext, isGL2) => {
      const { vs, fs } = isGL2 ? toEssl300(TEXT_VERTEX_SRC, TEXT_FRAGMENT_SRC) : { vs: TEXT_VERTEX_SRC, fs: TEXT_FRAGMENT_SRC };
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("badgeText shader error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
      const vert = compile(gl.VERTEX_SHADER, vs);
      const frag = compile(gl.FRAGMENT_SHADER, fs);
      if (!vert || !frag) return;
      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("badgeText link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }
      programRef.current = program;

      const atlas = getOrCreateFontAtlas();
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textureRef.current = tex;

      const quadVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]),
        gl.STATIC_DRAW
      );
      quadVboRef.current = quadVbo;
      instanceVboRef.current = gl.createBuffer();

      return () => {
        gl.deleteTexture(tex);
        gl.deleteBuffer(quadVbo);
        if (instanceVboRef.current) gl.deleteBuffer(instanceVboRef.current);
        gl.deleteProgram(program);
        gl.deleteShader(vert);
        gl.deleteShader(frag);
        programRef.current = null;
        textureRef.current = null;
        quadVboRef.current = null;
        instanceVboRef.current = null;
      };
    },
    (frame: PcbGLFrame) => {
      const { gl, ext, physW, physH, dpr } = frame;
      const program = programRef.current;
      if (!program || !quadVboRef.current || !instanceVboRef.current || !textureRef.current || quads.length === 0) return;

      const data = new Float32Array(quads.length * FLOATS_PER_TEXT_QUAD);
      let o = 0;
      for (const q of quads) {
        data[o++] = q.x; data[o++] = q.y; data[o++] = q.w; data[o++] = q.h;
        data[o++] = q.u0; data[o++] = q.v0; data[o++] = q.u1; data[o++] = q.v1;
        data[o++] = q.rotationRad;
        data[o++] = q.mirror ? 1 : 0;
        data[o++] = q.color[0]; data[o++] = q.color[1]; data[o++] = q.color[2]; data[o++] = q.color[3];
      }

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVboRef.current);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

      const uRes = gl.getUniformLocation(program, "u_resolution");
      const uDpr = gl.getUniformLocation(program, "u_dpr");
      const uAtlas = gl.getUniformLocation(program, "u_font_atlas");
      gl.uniform2f(uRes, physW, physH);
      gl.uniform1f(uDpr, dpr);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
      gl.uniform1i(uAtlas, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadVboRef.current);
      const aQuadPos = gl.getAttribLocation(program, "a_quad_pos");
      gl.enableVertexAttribArray(aQuadPos);
      gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVboRef.current);
      const stride = FLOATS_PER_TEXT_QUAD * 4;
      const aPosSize = gl.getAttribLocation(program, "a_pos_size");
      const aUv = gl.getAttribLocation(program, "a_uv_bounds");
      const aRotation = gl.getAttribLocation(program, "a_rotation");
      const aMirror = gl.getAttribLocation(program, "a_mirror");
      const aColor = gl.getAttribLocation(program, "a_color");
      if (aPosSize >= 0) {
        gl.enableVertexAttribArray(aPosSize);
        gl.vertexAttribPointer(aPosSize, 4, gl.FLOAT, false, stride, 0);
        ext.vertexAttribDivisorANGLE(aPosSize, 1);
      }
      if (aUv >= 0) {
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 4, gl.FLOAT, false, stride, 4 * 4);
        ext.vertexAttribDivisorANGLE(aUv, 1);
      }
      if (aRotation >= 0) {
        gl.enableVertexAttribArray(aRotation);
        gl.vertexAttribPointer(aRotation, 1, gl.FLOAT, false, stride, 8 * 4);
        ext.vertexAttribDivisorANGLE(aRotation, 1);
      }
      if (aMirror >= 0) {
        gl.enableVertexAttribArray(aMirror);
        gl.vertexAttribPointer(aMirror, 1, gl.FLOAT, false, stride, 9 * 4);
        ext.vertexAttribDivisorANGLE(aMirror, 1);
      }
      if (aColor >= 0) {
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 10 * 4);
        ext.vertexAttribDivisorANGLE(aColor, 1);
      }

      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, quads.length);

      if (aPosSize >= 0) ext.vertexAttribDivisorANGLE(aPosSize, 0);
      if (aUv >= 0) ext.vertexAttribDivisorANGLE(aUv, 0);
      if (aRotation >= 0) ext.vertexAttribDivisorANGLE(aRotation, 0);
      if (aMirror >= 0) ext.vertexAttribDivisorANGLE(aMirror, 0);
      if (aColor >= 0) ext.vertexAttribDivisorANGLE(aColor, 0);
    },
    [quads]
  );
}

export function SchematicWebGLBadges({ instances, view }: SchematicWebGLBadgesProps): null {
  useBadgeShapes(instances, view);
  useBadgeText(instances, view);
  return null;
}
