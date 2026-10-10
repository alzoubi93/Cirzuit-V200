/**
 * SchematicWebGLGuides — wire-routing preview + drag alignment guides.
 * Replaces the SVG wirePreview polyline/path and alignmentOverlay in Canvas.tsx.
 */
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { GRID } from "@/lib/schematic";

export interface WirePreviewGuide {
  /** Document/grid points along the preview route. */
  points: { x: number; y: number }[];
  color: string; // hex
  /** When true and points >= 3, use the same rounded-corner path as the SVG curved style. */
  curved?: boolean;
}

export interface AlignmentMatchGuide {
  axis: "h" | "v";
  my: { x: number; y: number };
  other: { x: number; y: number };
}

export interface SchematicWebGLGuidesProps {
  wirePreview: WirePreviewGuide | null;
  alignments: AlignmentMatchGuide[];
  view: { x: number; y: number; scale: number };
  /** Canvas CSS size — full-span alignment guides stretch across it. */
  canvasSize: { w: number; h: number };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16) / 255,
      parseInt(h[1] + h[1], 16) / 255,
      parseInt(h[2] + h[2], 16) / 255,
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.substring(0, 2), 16) / 255,
      parseInt(h.substring(2, 4), 16) / 255,
      parseInt(h.substring(4, 6), 16) / 255,
    ];
  }
  return [0.5, 0.5, 0.5];
}

function pushThickSegment(
  verts: number[],
  p1: [number, number],
  p2: [number, number],
  halfW: number,
  r: number,
  g: number,
  b: number,
  a: number
) {
  const pr = r * a, pg = g * a, pb = b * a;
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
}

function pushDisk(
  verts: number[],
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
  segments = 12
) {
  const pr = r * a, pg = g * a, pb = b * a;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    verts.push(
      cx, cy, pr, pg, pb, a,
      cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, pr, pg, pb, a,
      cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, pr, pg, pb, a
    );
  }
}

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

/** Build screen-space polyline for curved wire preview (same geometry as former SVG path). */
function curvedScreenPoints(
  pts: { x: number; y: number }[],
  worldScale: number,
  view: { x: number; y: number }
): [number, number][] {
  if (pts.length < 2) return [];
  const out: [number, number][] = [];
  const toS = (p: { x: number; y: number }): [number, number] => [
    p.x * worldScale + view.x,
    p.y * worldScale + view.y,
  ];
  out.push(toS(pts[0]));
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const dirA = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    const dirC = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
    const rr = Math.min(
      0.35,
      Math.hypot(b.x - a.x, b.y - a.y) / 2,
      Math.hypot(c.x - b.x, c.y - b.y) / 2
    );
    // Approximate Q with a few samples
    const pStart = { x: b.x - dirA.x * rr, y: b.y - dirA.y * rr };
    const pEnd = { x: b.x + dirC.x * rr, y: b.y + dirC.y * rr };
    out.push(toS(pStart));
    for (let s = 1; s <= 4; s++) {
      const t = s / 4;
      const omt = 1 - t;
      const qx = omt * omt * pStart.x + 2 * omt * t * b.x + t * t * pEnd.x;
      const qy = omt * omt * pStart.y + 2 * omt * t * b.y + t * t * pEnd.y;
      out.push([qx * worldScale + view.x, qy * worldScale + view.y]);
    }
  }
  out.push(toS(pts[pts.length - 1]));
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

export function SchematicWebGLGuides({
  wirePreview,
  alignments,
  view,
  canvasSize,
}: SchematicWebGLGuidesProps): null {
  const vertexData = useMemo(() => {
    const verts: number[] = [];
    const worldScale = view.scale * GRID;

    // --- Wire preview (dashed) ---
    if (wirePreview && wirePreview.points.length > 1) {
      const [r, g, b] = hexToRgb(wirePreview.color);
      const a = 0.85;
      const halfW = Math.max(0.5, (0.1 * worldScale) / 2);
      let screenPts: [number, number][];
      if (wirePreview.curved && wirePreview.points.length >= 3) {
        screenPts = curvedScreenPoints(wirePreview.points, worldScale, view);
      } else {
        screenPts = wirePreview.points.map(
          (p): [number, number] => [p.x * worldScale + view.x, p.y * worldScale + view.y]
        );
      }
      const dashes = dashSegments(screenPts, 0.3 * worldScale, 0.2 * worldScale);
      for (const [p1, p2] of dashes) {
        pushThickSegment(verts, p1, p2, halfW, r, g, b, a);
      }
    }

    // --- Alignment guides ---
    const guide: [number, number, number] = [0.96, 0.62, 0.04]; // #f59e0b
    const maxMatches = 6;
    for (const m of alignments.slice(0, maxMatches)) {
      const sx = m.my.x * worldScale + view.x;
      const sy = m.my.y * worldScale + view.y;
      const ox = m.other.x * worldScale + view.x;
      const oy = m.other.y * worldScale + view.y;
      // Full-span dashed guide line across the canvas
      const spanHalfW = 0.35;
      if (m.axis === "h") {
        const dashes = dashSegments(
          [[0, sy], [Math.max(canvasSize.w, 1), sy]],
          5,
          3
        );
        for (const [p1, p2] of dashes) {
          pushThickSegment(verts, p1, p2, spanHalfW, guide[0], guide[1], guide[2], 0.7);
        }
      } else {
        const dashes = dashSegments(
          [[sx, 0], [sx, Math.max(canvasSize.h, 1)]],
          5,
          3
        );
        for (const [p1, p2] of dashes) {
          pushThickSegment(verts, p1, p2, spanHalfW, guide[0], guide[1], guide[2], 0.7);
        }
      }
      // Solid connector between matched points
      pushThickSegment(verts, [sx, sy], [ox, oy], 0.6, guide[0], guide[1], guide[2], 0.95);
      pushDisk(verts, sx, sy, 3, guide[0], guide[1], guide[2], 1);
      pushDisk(verts, ox, oy, 3, guide[0], guide[1], guide[2], 1);
    }

    return new Float32Array(verts);
  }, [wirePreview, alignments, view.x, view.y, view.scale, canvasSize.w, canvasSize.h]);

  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  useSchematicGLPass(
    "guides",
    SCHEMATIC_GL_PASS_ORDER.selection + 5,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("guides shader error:", gl.getShaderInfoLog(shader));
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
        console.error("guides link error:", gl.getProgramInfoLog(program));
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
