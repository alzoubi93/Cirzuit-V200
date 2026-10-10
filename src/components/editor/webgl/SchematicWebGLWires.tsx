// WebGL pass that draws schematic wires — the direct analogue of PcbWebGLTracks.tsx. Reuses
// the project's existing renderWirePath() output (an SVG path 'd' string that already encodes
// straight/curved wire style AND the little semicircle "hop" where one wire crosses another)
// and flattens it with the same svgPathFlatten used for symbol glyphs, so the WebGL line is
// pixel-for-pixel the same shape the old SVG <path> drew — only the rasterizer changed.
//
// Deliberately NOT covered here (left on the existing SVG rendering path, see Canvas.tsx):
//  - "realistic" mode wires (drop-shadow + sleeve + highlight + solder-blob layers)
//  - the dashed selection outline, the blurred "glow" while simulating, and the per-wire
//    voltage tooltip — all thin extra SVG layers drawn on top, left as-is
//  - all pointer interaction (the invisible wide hit-path used for click/drag) — untouched
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { flattenPath } from "@/lib/svgPathFlatten";
import { GRID } from "@/lib/schematic";

export interface WireInstance {
  id: string;
  d: string; // renderWirePath(w) output, in document/grid-unit space
  color: string; // hex
  width: number; // grid-unit stroke width (same units as SchematicWire.width)
  /** Optional opacity for ghost wires. Default 1. */
  alpha?: number;
}

export interface SchematicWebGLWiresProps {
  instances: WireInstance[];
  view: { x: number; y: number; scale: number };
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

function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16) / 255;
    const g = parseInt(h[1] + h[1], 16) / 255;
    const b = parseInt(h[2] + h[2], 16) / 255;
    return [r, g, b, alpha];
  }
  if (h.length >= 6) {
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return [r, g, b, alpha];
  }
  return [0.5, 0.5, 0.5, alpha];
}

const flattenCache = new Map<string, [number, number][][]>();
function flattenCached(d: string): [number, number][][] {
  const hit = flattenCache.get(d);
  if (hit) return hit;
  const subs = flattenPath(d).map((s) => s.points);
  // Bound the cache; wire paths churn constantly while editing, this just avoids unbounded growth.
  if (flattenCache.size > 4000) flattenCache.clear();
  flattenCache.set(d, subs);
  return subs;
}

export function SchematicWebGLWires({ instances, view }: SchematicWebGLWiresProps): null {
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
      const subpaths = flattenCached(inst.d);
      const [r, g, b, a0] = hexToRgba(inst.color, 1);
      const a = a0 * (inst.alpha ?? 1);
      const pr = r * a, pg = g * a, pb = b * a;
      const halfW = Math.max(0.5, (inst.width * worldScale) / 2);

      for (const pts of subpaths) {
        if (pts.length < 2) continue;
        const screenPts = pts.map(
          ([x, y]): [number, number] => [x * worldScale + view.x, y * worldScale + view.y]
        );
        for (let i = 0; i + 1 < screenPts.length; i++) {
          const p1 = screenPts[i];
          const p2 = screenPts[i + 1];
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
          // Round-ish joint: a small square fan at each interior vertex hides the gap/miter
          // between consecutive thick segments (cheap stand-in for strokeLinejoin="round").
          if (i > 0) {
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
      }
    }
    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, view.x, view.y, view.scale]);

  useSchematicGLPass(
    "wires",
    SCHEMATIC_GL_PASS_ORDER.wires,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLWires shader error:", gl.getShaderInfoLog(shader));
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
        console.error("SchematicWebGLWires link error:", gl.getProgramInfoLog(program));
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

  return null;
}
