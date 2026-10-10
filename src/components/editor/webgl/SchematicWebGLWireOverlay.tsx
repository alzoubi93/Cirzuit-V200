// Two small WebGL passes that replace the thin SVG overlays that used to sit on top of
// (or under) the wire body in Canvas.tsx:
//  - SchematicWebGLWireGlow: the low-opacity, widened "energized" halo shown while simulating.
//    The old SVG version additionally used `filter: blur(2px)`; a real gaussian blur isn't
//    worth a multi-pass shader here, so this approximates it with a soft opacity falloff
//    across three progressively wider strokes, which reads the same at schematic zoom levels.
//  - SchematicWebGLWireSelection: the dashed blue outline drawn on top of a selected wire.
//    Dashing is computed on the CPU (arc-length walk over the flattened path) rather than in
//    the fragment shader, which keeps the shader identical to SchematicWebGLWires.
//
// Deliberately still left on SVG (see Canvas.tsx / SchematicWebGLWires.tsx comments):
// realistic-mode wires, the animated CurrentFlow arrows, and the per-wire voltage tooltip text.
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { flattenPath } from "@/lib/svgPathFlatten";
import { GRID } from "@/lib/schematic";

export interface WireOverlayInstance {
  id: string;
  d: string;
  color: string; // hex
  width: number; // grid-unit stroke width of the underlying wire (SchematicWire.width)
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255];
  }
  if (h.length >= 6) {
    return [parseInt(h.substring(0, 2), 16) / 255, parseInt(h.substring(2, 4), 16) / 255, parseInt(h.substring(4, 6), 16) / 255];
  }
  return [0.5, 0.5, 0.5];
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

// Appends a screen-space thick quad (plus a cheap square joint fan) for segment p1->p2 into `verts`.
function pushThickSegment(
  verts: number[],
  p1: [number, number],
  p2: [number, number],
  halfW: number,
  color: RGBA,
  joint: boolean
) {
  const pr = color.r * color.a, pg = color.g * color.a, pb = color.b * color.a, a = color.a;
  let dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const nx = -dy * halfW, ny = dx * halfW;
  const ax = p1[0] + nx, ay = p1[1] + ny;
  const bx = p1[0] - nx, by = p1[1] - ny;
  const cx = p2[0] - nx, cy = p2[1] - ny;
  const dxp = p2[0] + nx, dyp = p2[1] + ny;
  verts.push(
    ax, ay, pr, pg, pb, a, bx, by, pr, pg, pb, a, cx, cy, pr, pg, pb, a,
    ax, ay, pr, pg, pb, a, cx, cy, pr, pg, pb, a, dxp, dyp, pr, pg, pb, a
  );
  if (joint) {
    const jr = halfW;
    verts.push(
      p1[0] - jr, p1[1] - jr, pr, pg, pb, a,
      p1[0] + jr, p1[1] - jr, pr, pg, pb, a,
      p1[0] + jr, p1[1] + jr, pr, pg, pb, a,
      p1[0] - jr, p1[1] - jr, pr, pg, pb, a,
      p1[0] + jr, p1[1] + jr, pr, pg, pb, a,
      p1[0] - jr, p1[1] + jr, pr, pg, pb, a
    );
  }
}

// CPU-side dashing: walks the whole (already-screen-space) polyline by arc length and returns
// only the "on" mini-segments, matching SVG's strokeDasharray semantics closely enough for a
// thin selection outline.
function dashSegments(
  pts: [number, number][],
  dashLen: number,
  gapLen: number
): [[number, number], [number, number]][] {
  const out: [[number, number], [number, number]][] = [];
  const period = dashLen + gapLen;
  let dist = 0;
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
void main() {
  gl_FragColor = v_color;
}
`;

function useSolidLinePass(
  passName: string,
  passOrder: number,
  vertexData: Float32Array
) {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  useSchematicGLPass(
    passName,
    passOrder,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(`${passName} shader error:`, gl.getShaderInfoLog(shader));
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
        console.error(`${passName} link error:`, gl.getProgramInfoLog(program));
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

export interface SchematicWebGLWireGlowProps {
  instances: WireOverlayInstance[];
  view: { x: number; y: number; scale: number };
}

// Widened, low-opacity halo shown while simulating (approximates the old blur(2px) SVG glow).
export function SchematicWebGLWireGlow({ instances, view }: SchematicWebGLWireGlowProps): null {
  const vertexData = useMemo(() => {
    const verts: number[] = [];
    const worldScale = view.scale * GRID;
    // Three layered passes at decreasing opacity/increasing width stand in for a real blur.
    const layers = [
      { mul: 1.4, alpha: 0.1 },
      { mul: 2.0, alpha: 0.07 },
      { mul: 2.6, alpha: 0.045 },
    ];
    for (const inst of instances) {
      const subpaths = flattenCached(inst.d);
      const [r, g, b] = hexToRgb(inst.color);
      for (const layer of layers) {
        const halfW = Math.max(0.75, (inst.width * layer.mul * worldScale) / 2);
        for (const pts of subpaths) {
          if (pts.length < 2) continue;
          const screenPts = pts.map(
            ([x, y]): [number, number] => [x * worldScale + view.x, y * worldScale + view.y]
          );
          for (let i = 0; i + 1 < screenPts.length; i++) {
            pushThickSegment(verts, screenPts[i], screenPts[i + 1], halfW, { r, g, b, a: layer.alpha }, i > 0);
          }
        }
      }
    }
    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, view.x, view.y, view.scale]);

  useSolidLinePass("wireGlow", SCHEMATIC_GL_PASS_ORDER.wireGlow, vertexData);
  return null;
}

export interface SchematicWebGLWireSelectionProps {
  instances: WireOverlayInstance[]; // only the currently-selected wires
  view: { x: number; y: number; scale: number };
}

// Dashed blue outline drawn on top of selected wires (matches the old
// stroke="#2563eb" strokeWidth={0.08} strokeDasharray="0.3,0.2" SVG path).
export function SchematicWebGLWireSelection({ instances, view }: SchematicWebGLWireSelectionProps): null {
  const vertexData = useMemo(() => {
    const verts: number[] = [];
    const worldScale = view.scale * GRID;
    const [r, g, b] = hexToRgb("#2563eb");
    const halfW = Math.max(0.6, (0.08 * worldScale) / 2);
    for (const inst of instances) {
      const subpaths = flattenCached(inst.d);
      for (const pts of subpaths) {
        if (pts.length < 2) continue;
        const screenPts = pts.map(
          ([x, y]): [number, number] => [x * worldScale + view.x, y * worldScale + view.y]
        );
        const dashes = dashSegments(screenPts, 0.3 * worldScale, 0.2 * worldScale);
        for (const [p1, p2] of dashes) {
          pushThickSegment(verts, p1, p2, halfW, { r, g, b, a: 1 }, false);
        }
      }
    }
    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, view.x, view.y, view.scale]);

  useSolidLinePass("wireSelection", SCHEMATIC_GL_PASS_ORDER.wireSelection, vertexData);
  return null;
}
