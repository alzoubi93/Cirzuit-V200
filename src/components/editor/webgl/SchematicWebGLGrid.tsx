// WebGL replacement for the old SVG <SmartGrid>. Registered as a pass on the shared
// SchematicGLStage (same engine — PcbGLStageCore — that already drives the PCB editor's
// grid/tracks/pads), so context creation, sizing and the render loop are the exact code
// path already proven to work, instead of a one-off canvas lifecycle.
import { useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";

// Kept for type compatibility with existing call sites; the renderer always draws a square grid.
export type GridStyle = "dots" | "square" | "hybrid";

export interface SchematicWebGLGridProps {
  gridSize: number;
  offsetX: number;
  offsetY: number;
  isDark: boolean;
  style?: GridStyle;
  /** 0..1 */
  opacity?: number;
  zoom?: number;
  isSimulating?: boolean;
  /** Realistic (wooden table) view: very faint, warm, wood-tinted lines. */
  realistic?: boolean;
}

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Draws two square line-grids (minor + major), major over minor, straight onto a transparent
// background — output is premultiplied alpha (rgb already scaled by each pixel's own alpha),
// matching this stage's premultipliedAlpha:true canvas.
const FRAGMENT_SRC = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_dpr;

uniform float u_show_minor;
uniform float u_minor_step;
uniform vec2 u_minor_offset;
uniform float u_minor_width;
uniform vec4 u_minor_color; // .a already includes overall opacity

uniform float u_major_step;
uniform vec2 u_major_offset;
uniform float u_major_width;
uniform vec4 u_major_color; // .a already includes overall opacity

float lineCoverage(vec2 p, vec2 offset, float step, float strokeWidth) {
  vec2 local = mod(p - offset, step);
  vec2 dist = min(local, step - local);
  float d = min(dist.x, dist.y);
  float halfW = max(0.5, strokeWidth * 0.5);
  return 1.0 - smoothstep(halfW - 0.75, halfW + 0.75, d);
}

void main() {
  // CSS-pixel coordinate, origin top-left (matches the old SVG coordinate space).
  vec2 p = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) / u_dpr;

  vec4 result = vec4(0.0);

  if (u_show_minor > 0.5) {
    float a = lineCoverage(p, u_minor_offset, u_minor_step, u_minor_width) * u_minor_color.a;
    result = result * (1.0 - a) + vec4(u_minor_color.rgb * a, a);
  }

  float aMaj = lineCoverage(p, u_major_offset, u_major_step, u_major_width) * u_major_color.a;
  result = result * (1.0 - aMaj) + vec4(u_major_color.rgb * aMaj, aMaj);

  gl_FragColor = result;
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b];
}

export function SchematicWebGLGrid({
  gridSize,
  offsetX,
  offsetY,
  isDark,
  opacity = 1,
  isSimulating = false,
  realistic = false,
}: SchematicWebGLGridProps): null {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
    uShowMinor: WebGLUniformLocation | null;
    uMinorStep: WebGLUniformLocation | null;
    uMinorOffset: WebGLUniformLocation | null;
    uMinorWidth: WebGLUniformLocation | null;
    uMinorColor: WebGLUniformLocation | null;
    uMajorStep: WebGLUniformLocation | null;
    uMajorOffset: WebGLUniformLocation | null;
    uMajorWidth: WebGLUniformLocation | null;
    uMajorColor: WebGLUniformLocation | null;
  } | null>(null);

  useSchematicGLPass(
    "grid",
    SCHEMATIC_GL_PASS_ORDER.grid,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLGrid shader error:", gl.getShaderInfoLog(shader));
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
        console.error("SchematicWebGLGrid link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }
      programRef.current = program;

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      bufferRef.current = buffer;

      const uniform = (n: string) => gl.getUniformLocation(program, n);
      locsRef.current = {
        aPosition: gl.getAttribLocation(program, "a_position"),
        uResolution: uniform("u_resolution"),
        uDpr: uniform("u_dpr"),
        uShowMinor: uniform("u_show_minor"),
        uMinorStep: uniform("u_minor_step"),
        uMinorOffset: uniform("u_minor_offset"),
        uMinorWidth: uniform("u_minor_width"),
        uMinorColor: uniform("u_minor_color"),
        uMajorStep: uniform("u_major_step"),
        uMajorOffset: uniform("u_major_offset"),
        uMajorWidth: uniform("u_major_width"),
        uMajorColor: uniform("u_major_color"),
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
      if (!program || !locs || !buffer) return;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(locs.aPosition);
      gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // Wood view: dark warm-brown lines at a very low alpha so the grain stays the star.
      const minorColor = realistic ? "#4a2c14" : isSimulating ? "#0a0f1d" : isDark ? "#1f2a44" : "#dde3ec";
      const majorColor = realistic ? "#3d230f" : isSimulating ? "#162035" : isDark ? "#33446b" : "#b8c2d1";
      const lineAlpha = realistic ? 0.11 : 1; // multiplies the user's grid opacity
      const majorEvery = isSimulating ? 10 : 5;
      const majorSize = gridSize * majorEvery;
      const showMinor = isSimulating ? false : gridSize >= 6;

      const safeGrid = Math.max(gridSize, 0.0001);
      const safeMajor = Math.max(majorSize, 0.0001);
      const ox = ((offsetX % safeGrid) + safeGrid) % safeGrid;
      const oy = ((offsetY % safeGrid) + safeGrid) % safeGrid;
      const oxM = ((offsetX % safeMajor) + safeMajor) % safeMajor;
      const oyM = ((offsetY % safeMajor) + safeMajor) % safeMajor;

      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform1f(locs.uDpr, dpr);

      gl.uniform1f(locs.uShowMinor, showMinor ? 1 : 0);
      gl.uniform1f(locs.uMinorStep, safeGrid);
      gl.uniform2f(locs.uMinorOffset, ox, oy);
      gl.uniform1f(locs.uMinorWidth, 0.6);
      const [mr, mg, mb] = hexToRgb(minorColor);
      gl.uniform4f(locs.uMinorColor, mr, mg, mb, opacity * (realistic ? lineAlpha * 0.8 : 1));

      gl.uniform1f(locs.uMajorStep, safeMajor);
      gl.uniform2f(locs.uMajorOffset, oxM, oyM);
      gl.uniform1f(locs.uMajorWidth, 1.0);
      const [Mr, Mg, Mb] = hexToRgb(majorColor);
      gl.uniform4f(locs.uMajorColor, Mr, Mg, Mb, opacity * (realistic ? lineAlpha * 1.5 : 1));

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    [gridSize, offsetX, offsetY, isDark, opacity, isSimulating, realistic]
  );

  return null;
}
