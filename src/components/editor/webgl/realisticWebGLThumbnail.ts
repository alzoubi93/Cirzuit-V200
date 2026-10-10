// Native WebGL Thumbnail Renderer for Realistic Components.
// Uses the exact same GPU vertex buffers and shaders as SchematicWebGLRealisticSymbols,
// caching the WebGL-rendered pixels to provide lightweight, 60fps previews without
// exhausting browser WebGL context limits.

import type { SymbolId } from "@/lib/schematic";
import { SYMBOLS } from "@/lib/symbols";
import { buildRealisticSymbol, type PinLike } from "./realisticGeometry";

const thumbnailCache = new Map<string, string>();

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedGL: WebGLRenderingContext | null = null;
let sharedProgram: WebGLProgram | null = null;
let sharedBuffer: WebGLBuffer | null = null;
let sharedAttribs: {
  a_pos: number;
  a_col: number;
  u_scale: WebGLUniformLocation | null;
  u_offset: WebGLUniformLocation | null;
} | null = null;

const VS = `
attribute vec2 a_pos;
attribute vec4 a_col;
uniform vec2 u_scale;
uniform vec2 u_offset;
varying vec4 v_col;
void main() {
  vec2 p = a_pos * u_scale + u_offset;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  v_col = a_col;
}
`;

const FS = `
precision mediump float;
varying vec4 v_col;
void main() {
  gl_FragColor = v_col;
}
`;

function initGL(): boolean {
  if (sharedGL && sharedProgram) return true;
  if (typeof document === "undefined") return false;

  try {
    sharedCanvas = document.createElement("canvas");
    sharedCanvas.width = 160;
    sharedCanvas.height = 160;
    const gl = sharedCanvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) return false;
    sharedGL = gl;

    const compileShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("WebGL shader compile error:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VS);
    const fs = compileShader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;

    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("WebGL program link error:", gl.getProgramInfoLog(prog));
      return false;
    }

    sharedProgram = prog;
    sharedBuffer = gl.createBuffer();
    sharedAttribs = {
      a_pos: gl.getAttribLocation(prog, "a_pos"),
      a_col: gl.getAttribLocation(prog, "a_col"),
      u_scale: gl.getUniformLocation(prog, "u_scale"),
      u_offset: gl.getUniformLocation(prog, "u_offset"),
    };
    return true;
  } catch (e) {
    console.warn("WebGL thumbnail initialization failed:", e);
    return false;
  }
}

export function getRealisticSymbolWebGLDataUrl(id: SymbolId, value?: string, pixelSize = 160): string | null {
  const sym = SYMBOLS[id];
  if (!sym) return null;

  const key = `${id}|${value || sym.defaultValue || ""}|${pixelSize}`;
  if (thumbnailCache.has(key)) return thumbnailCache.get(key)!;

  if (!initGL() || !sharedGL || !sharedCanvas || !sharedProgram || !sharedBuffer || !sharedAttribs) {
    return null;
  }

  const gl = sharedGL;
  const canvas = sharedCanvas;
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }

  const pins = (sym.pins ?? []) as PinLike[];
  const geom = buildRealisticSymbol(
    {
      symbolId: id,
      width: sym.width,
      height: sym.height,
      rotation: 0,
      scale: 1,
      value: value || sym.defaultValue,
    },
    pins
  );

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(sharedProgram);

  const w = sym.width;
  const h = sym.height;
  const pad = 0.45;
  const fitScale = Math.min(1.82 / (w + pad * 2), 1.82 / (h + pad * 2));
  const scaleX = fitScale;
  const scaleY = fitScale;
  const offsetX = -(w / 2) * scaleX;
  const offsetY = -(h / 2) * scaleY;

  gl.uniform2f(sharedAttribs.u_scale, scaleX, scaleY);
  gl.uniform2f(sharedAttribs.u_offset, offsetX, offsetY);

  gl.bindBuffer(gl.ARRAY_BUFFER, sharedBuffer);
  gl.enableVertexAttribArray(sharedAttribs.a_pos);
  gl.enableVertexAttribArray(sharedAttribs.a_col);
  gl.vertexAttribPointer(sharedAttribs.a_pos, 2, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(sharedAttribs.a_col, 4, gl.FLOAT, false, 24, 8);

  // 1. Draw shadow buffer
  if (geom.shadow && geom.shadow.length > 0) {
    gl.bufferData(gl.ARRAY_BUFFER, geom.shadow, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, geom.shadow.length / 6);
  }

  // 2. Draw main body buffer
  if (geom.main && geom.main.length > 0) {
    gl.bufferData(gl.ARRAY_BUFFER, geom.main, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, geom.main.length / 6);
  }

  // 3. Render any laser-etched text markings onto composite
  let finalDataUrl = "";
  if (geom.marks && geom.marks.length > 0) {
    const textCanvas = document.createElement("canvas");
    textCanvas.width = pixelSize;
    textCanvas.height = pixelSize;
    const ctx = textCanvas.getContext("2d");
    if (ctx) {
      // Draw the WebGL-rendered geometry layer
      ctx.drawImage(canvas, 0, 0);

      // World-to-pixel transform
      const toPx = (wx: number, wy: number) => {
        const clipX = wx * scaleX + offsetX;
        const clipY = wy * scaleY + offsetY;
        const px = ((clipX + 1.0) / 2.0) * pixelSize;
        const py = ((clipY + 1.0) / 2.0) * pixelSize;
        return [px, py] as const;
      };

      for (const m of geom.marks) {
        const [px, py] = toPx(m.x, m.y);
        const fontSizePx = Math.max(7, m.size * scaleY * 0.5 * pixelSize);
        ctx.font = `bold ${Math.round(fontSizePx)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const r = Math.round(m.color[0] * 255);
        const g = Math.round(m.color[1] * 255);
        const b = Math.round(m.color[2] * 255);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillText(m.text, px, py);
      }
      finalDataUrl = textCanvas.toDataURL("image/png");
    } else {
      finalDataUrl = canvas.toDataURL("image/png");
    }
  } else {
    finalDataUrl = canvas.toDataURL("image/png");
  }

  thumbnailCache.set(key, finalDataUrl);
  return finalDataUrl;
}
