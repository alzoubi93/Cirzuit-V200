// WebGL replacement for the CurrentFlow(...) SVG component in Canvas.tsx: a moving dashed
// line (two layers — a soft outer trail and a bright inner core) that visualizes current
// direction/magnitude on a wire while simulating. The old version drove this with SVG SMIL
// <animate stroke-dashoffset>; here the dash phase is just computed from performance.now()
// each frame and the pass keeps requesting new frames for as long as any instance is active
// (PcbGLStageCore only re-renders on demand, it doesn't run a permanent RAF loop).
//
// Not replicated: the blur(1.5px) / drop-shadow(...) CSS filters on the two layers — approximated
// instead with a wider, lower-opacity under-layer (same approach as SchematicWebGLWireGlow).
import { useEffect, useRef } from "react";
import { useSchematicGLStage, useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { flattenPath } from "@/lib/svgPathFlatten";
import { GRID } from "@/lib/schematic";

export interface CurrentFlowInstance {
  id: string;
  d: string;
  current: number; // signed; sign gives direction, magnitude gives speed
}

export interface SchematicWebGLCurrentFlowProps {
  instances: CurrentFlowInstance[];
  view: { x: number; y: number; scale: number };
}

const flattenCache = new Map<string, [number, number][][]>();
function flattenCached(d: string): [number, number][][] {
  const hit = flattenCache.get(d);
  if (hit) return hit;
  const subs = flattenPath(d).map((s) => s.points);
  if (flattenCache.size > 4000) flattenCache.clear();
  flattenCache.set(d, subs);
  return subs;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16) / 255, parseInt(h.substring(2, 4), 16) / 255, parseInt(h.substring(4, 6), 16) / 255];
}

function pushThickSegment(
  verts: number[],
  p1: [number, number],
  p2: [number, number],
  halfW: number,
  rgb: [number, number, number],
  alpha: number
) {
  const [r, g, b] = rgb;
  const pr = r * alpha, pg = g * alpha, pb = b * alpha;
  let dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const nx = -dy * halfW, ny = dx * halfW;
  const ax = p1[0] + nx, ay = p1[1] + ny;
  const bx = p1[0] - nx, by = p1[1] - ny;
  const cx = p2[0] - nx, cy = p2[1] - ny;
  const dxp = p2[0] + nx, dyp = p2[1] + ny;
  verts.push(
    ax, ay, pr, pg, pb, alpha, bx, by, pr, pg, pb, alpha, cx, cy, pr, pg, pb, alpha,
    ax, ay, pr, pg, pb, alpha, cx, cy, pr, pg, pb, alpha, dxp, dyp, pr, pg, pb, alpha
  );
}

// Dash walk starting at an arbitrary phase offset (world units, wraps mod period) so the
// pattern can be animated by sliding the offset over time — same idea as SVG stroke-dashoffset.
function dashSegmentsWithOffset(
  pts: [number, number][],
  dashLen: number,
  gapLen: number,
  offset: number
): [[number, number], [number, number]][] {
  const out: [[number, number], [number, number]][] = [];
  const period = dashLen + gapLen;
  let dist = ((offset % period) + period) % period;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    if (segLen < 1e-6) continue;
    const ux = (x2 - x1) / segLen, uy = (y2 - y1) / segLen;
    let traveled = 0;
    while (traveled < segLen) {
      const phase = (dist + traveled) % period;
      if (phase < dashLen) {
        const end = Math.min(segLen, traveled + (dashLen - phase));
        out.push([
          [x1 + ux * traveled, y1 + uy * traveled],
          [x1 + ux * end, y1 + uy * end],
        ]);
        traveled = end;
      } else {
        traveled = Math.min(segLen, traveled + (period - phase));
      }
    }
    dist += segLen;
  }
  return out;
}

const VERTEX_SRC = `
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
const FRAGMENT_SRC = `
precision mediump float;
varying vec4 v_color;
void main() { gl_FragColor = v_color; }
`;

const OUTER_RGB = hexToRgb("#eab308");
const INNER_RGB = hexToRgb("#fef08a");

export function SchematicWebGLCurrentFlow({ instances, view }: SchematicWebGLCurrentFlowProps): null {
  const core = useSchematicGLStage();
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  // Only wires that would actually be visible (mirrors the old early-returns).
  const active = instances.filter((i) => Math.abs(i.current) > 1e-6 && view.scale >= 0.4);

  useSchematicGLPass(
    "currentFlow",
    SCHEMATIC_GL_PASS_ORDER.wireSelection + 1, // draw just above the selection outline
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLCurrentFlow shader error:", gl.getShaderInfoLog(shader));
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
        console.error("SchematicWebGLCurrentFlow link error:", gl.getProgramInfoLog(program));
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
      if (!program || !locs || !buffer || active.length === 0) return;

      // Vertex data is rebuilt every frame (dash phase depends on wall-clock time), not memoized.
      const verts: number[] = [];
      const worldScale = view.scale * GRID;
      const cycleLength = 1.2 * worldScale;
      const dashLength = 0.6 * worldScale;
      const gapLength = cycleLength - dashLength;
      const nowSec = performance.now() / 1000;

      for (const inst of instances) {
        const absI = Math.abs(inst.current);
        if (absI <= 1e-6 || view.scale < 0.4) continue;
        const direction = inst.current > 0 ? 1 : -1;
        const v = Math.min(15, Math.max(0.5, absI * 250)) * worldScale;
        const offset = -direction * nowSec * v;
        const subpaths = flattenCached(inst.d);
        for (const pts of subpaths) {
          if (pts.length < 2) continue;
          const screenPts = pts.map(
            ([x, y]): [number, number] => [x * worldScale + view.x, y * worldScale + view.y]
          );
          const dashes = dashSegmentsWithOffset(screenPts, dashLength, gapLength, offset);
          for (const [p1, p2] of dashes) {
            pushThickSegment(verts, p1, p2, Math.max(1.2, (0.2 * worldScale) / 2), OUTER_RGB, 0.4);
          }
          for (const [p1, p2] of dashes) {
            pushThickSegment(verts, p1, p2, Math.max(0.6, (0.08 * worldScale) / 2), INNER_RGB, 0.9);
          }
        }
      }

      const vertexData = new Float32Array(verts);
      if (vertexData.length === 0) return;

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
    [instances, view.x, view.y, view.scale]
  );

  // Keep requesting frames while any wire is actively animating — the stage only re-renders
  // on demand otherwise, so without this the dashes would freeze after the first paint.
  useEffect(() => {
    if (active.length === 0) return;
    let rafId: number;
    const tick = () => {
      core.requestRender();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, active.length > 0]);

  return null;
}
