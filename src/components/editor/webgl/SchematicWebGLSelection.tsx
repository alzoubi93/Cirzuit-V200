// WebGL pass for:
//  - Selection outlines (dashed blue rect around selected symbols)
//  - Pin markers (normal / selected / net-highlighted / floating)
//  - Wire-tool hover pin indicator (green ring + fill)
//  - Wire-tool pending start point (blue pulsing ring + fill)
//
// Replaces the corresponding SVG elements that used to live in Canvas.tsx.
// Interaction (pointer events) stays on invisible SVG hit targets.
import { useMemo, useRef, useEffect, useState } from "react";
import { useSchematicGLPass, useSchematicGLStage, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { GRID } from "@/lib/schematic";

export interface SelectionRectInstance {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  rotation: 0 | 90 | 180 | 270;
  scale: number;
}

export interface PinMarkerInstance {
  x: number;
  y: number;
  kind: "normal" | "selected" | "net" | "floating";
  color: string;
}

/** Optional single-point indicators used while the wire tool is active. */
export interface WireToolIndicator {
  x: number;
  y: number;
  /** "hover" = green snap target; "pending" = blue start point */
  kind: "hover" | "pending";
}

/** Soft glow discs (LED halo, heat). Drawn as layered filled circles. */
export interface GlowInstance {
  x: number;
  y: number;
  /** Base radius in world units */
  r: number;
  color: string;
  /** Peak alpha of the innermost disc (outer layers fade out) */
  alpha: number;
  /** Number of soft layers (default 4) */
  layers?: number;
}

export interface MarqueeBoxInstance {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SchematicWebGLSelectionProps {
  rects: SelectionRectInstance[];
  pins: PinMarkerInstance[];
  /** Wire-tool hover / pending indicators (may be empty). */
  wireIndicators?: WireToolIndicator[];
  /** LED / heat soft glows */
  glows?: GlowInstance[];
  /** Active marquee selection box while dragging in group select mode */
  marqueeBox?: MarqueeBoxInstance | null;
  view: { x: number; y: number; scale: number };
  /** Optional time in seconds for simple pulse animation on pending. */
  timeSec?: number;
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

function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16) / 255,
      parseInt(h[1] + h[1], 16) / 255,
      parseInt(h[2] + h[2], 16) / 255,
      alpha,
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.substring(0, 2), 16) / 255,
      parseInt(h.substring(2, 4), 16) / 255,
      parseInt(h.substring(4, 6), 16) / 255,
      alpha,
    ];
  }
  return [0.5, 0.5, 0.5, alpha];
}

function circleFan(cx: number, cy: number, r: number, segments = 20): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function pushFilledCircle(
  verts: number[],
  sx: number,
  sy: number,
  r: number,
  color: string,
  alpha = 1
) {
  const [rr, gg, bb, aa] = hexToRgba(color, alpha);
  const pr = rr * aa, pg = gg * aa, pb = bb * aa;
  const pts = circleFan(sx, sy, r);
  for (let i = 1; i + 1 < pts.length; i++) {
    verts.push(
      pts[0][0], pts[0][1], pr, pg, pb, aa,
      pts[i][0], pts[i][1], pr, pg, pb, aa,
      pts[i + 1][0], pts[i + 1][1], pr, pg, pb, aa
    );
  }
}

function pushStrokedCircle(
  verts: number[],
  sx: number,
  sy: number,
  r: number,
  strokeW: number,
  color: string,
  alpha = 1
) {
  const [rr, gg, bb, aa] = hexToRgba(color, alpha);
  const pr = rr * aa, pg = gg * aa, pb = bb * aa;
  const outer = circleFan(sx, sy, r + strokeW * 0.5);
  const inner = circleFan(sx, sy, Math.max(0.01, r - strokeW * 0.5));
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    verts.push(
      outer[i][0], outer[i][1], pr, pg, pb, aa,
      inner[i][0], inner[i][1], pr, pg, pb, aa,
      inner[j][0], inner[j][1], pr, pg, pb, aa,
      outer[i][0], outer[i][1], pr, pg, pb, aa,
      inner[j][0], inner[j][1], pr, pg, pb, aa,
      outer[j][0], outer[j][1], pr, pg, pb, aa
    );
  }
}

function pushSolidRect(
  verts: number[],
  x: number, y: number, w: number, h: number,
  strokeW: number, color: string, alpha = 1,
  rotDeg = 0, cx = 0, cy = 0
) {
  const [rr, gg, bb, aa] = hexToRgba(color, alpha);
  const pr = rr * aa, pg = gg * aa, pb = bb * aa;
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = (px: number, py: number): [number, number] => {
    const dx = px - cx, dy = py - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  };
  const c = [rot(x, y), rot(x + w, y), rot(x + w, y + h), rot(x, y + h)];
  const half = strokeW * 0.5;
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy * half, ny = dx * half;
    verts.push(
      a[0] + nx, a[1] + ny, pr, pg, pb, aa,
      a[0] - nx, a[1] - ny, pr, pg, pb, aa,
      b[0] - nx, b[1] - ny, pr, pg, pb, aa,
      a[0] + nx, a[1] + ny, pr, pg, pb, aa,
      b[0] - nx, b[1] - ny, pr, pg, pb, aa,
      b[0] + nx, b[1] + ny, pr, pg, pb, aa
    );
  }
}

function pushDashedRect(
  verts: number[],
  x: number, y: number, w: number, h: number,
  strokeW: number,
  dash: number, gap: number,
  color: string,
  alpha = 1,
  rotDeg = 0, cx = 0, cy = 0
) {
  const [rr, gg, bb, aa] = hexToRgba(color, alpha);
  const pr = rr * aa, pg = gg * aa, pb = bb * aa;
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  const rot = (px: number, py: number): [number, number] => {
    const dx = px - cx, dy = py - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  };

  const corners: [number, number][] = [
    rot(x, y),
    rot(x + w, y),
    rot(x + w, y + h),
    rot(x, y + h),
  ];

  const edges: [[number, number], [number, number]][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  const halfW = strokeW * 0.5;

  for (const [p1, p2] of edges) {
    let dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy * halfW, ny = dx * halfW;

    let dist = 0;
    let drawing = true;
    while (dist < len) {
      const segLen = drawing ? dash : gap;
      const end = Math.min(dist + segLen, len);
      if (drawing) {
        const ax = p1[0] + dx * dist, ay = p1[1] + dy * dist;
        const bx = p1[0] + dx * end, by = p1[1] + dy * end;
        verts.push(
          ax + nx, ay + ny, pr, pg, pb, aa,
          ax - nx, ay - ny, pr, pg, pb, aa,
          bx - nx, by - ny, pr, pg, pb, aa,
          ax + nx, ay + ny, pr, pg, pb, aa,
          bx - nx, by - ny, pr, pg, pb, aa,
          bx + nx, by + ny, pr, pg, pb, aa
        );
      }
      dist = end;
      drawing = !drawing;
    }
  }
}

function pushFilledRect(
  verts: number[],
  x: number, y: number, w: number, h: number,
  color: string, alpha = 0.25
) {
  const [rr, gg, bb, aa] = hexToRgba(color, alpha);
  const pr = rr * aa, pg = gg * aa, pb = bb * aa;
  const x2 = x + w, y2 = y + h;
  verts.push(
    x, y, pr, pg, pb, aa,
    x2, y, pr, pg, pb, aa,
    x2, y2, pr, pg, pb, aa,
    x, y, pr, pg, pb, aa,
    x2, y2, pr, pg, pb, aa,
    x, y2, pr, pg, pb, aa
  );
}

export function SchematicWebGLSelection({
  rects,
  pins,
  wireIndicators = [],
  glows = [],
  marqueeBox = null,
  view,
  timeSec = 0,
}: SchematicWebGLSelectionProps): null {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);
  // Bumps every animation frame while a pending indicator is active so useMemo rebuilds.
  const [animTick, setAnimTick] = useState(0);

  const vertexData = useMemo(() => {
    const verts: number[] = [];
    const worldScale = view.scale * GRID;
    const toScreen = (x: number, y: number): [number, number] => [
      x * worldScale + view.x,
      y * worldScale + view.y,
    ];

    // --- Selection rectangles ---
    // Dashed outlines are useful for small selections, but become very expensive when
    // a marquee contains hundreds of symbols. Above 80 selected symbols use a compact
    // solid outline so group selection remains responsive.
    const manySelected = rects.length > 80;
    for (const r of rects) {
      const [sx, sy] = toScreen(r.x, r.y);
      const sw = r.w * worldScale;
      const sh = r.h * worldScale;
      const [scx, scy] = toScreen(r.cx, r.cy);
      const strokeW = Math.max(1.2, 0.08 * worldScale / Math.max(0.01, r.scale));
      if (manySelected) {
        pushSolidRect(verts, sx, sy, sw, sh, strokeW, "#2563eb", 1, r.rotation, scx, scy);
      } else {
        const dash = Math.max(3, 0.3 * worldScale / Math.max(0.01, r.scale));
        const gap = Math.max(2, 0.2 * worldScale / Math.max(0.01, r.scale));
        pushDashedRect(
          verts, sx, sy, sw, sh,
          strokeW, dash, gap, "#2563eb", 1,
          r.rotation, scx, scy
        );
      }
    }

    // --- Active Marquee Selection Box (Drag-to-select in WebGL / Realistic Mode) ---
    if (marqueeBox) {
      const minX = Math.min(marqueeBox.x1, marqueeBox.x2);
      const maxX = Math.max(marqueeBox.x1, marqueeBox.x2);
      const minY = Math.min(marqueeBox.y1, marqueeBox.y2);
      const maxY = Math.max(marqueeBox.y1, marqueeBox.y2);

      const [sx1, sy1] = toScreen(minX, minY);
      const [sx2, sy2] = toScreen(maxX, maxY);
      const sw = Math.abs(sx2 - sx1);
      const sh = Math.abs(sy2 - sy1);

      if (sw > 1 || sh > 1) {
        const left = Math.min(sx1, sx2);
        const top = Math.min(sy1, sy2);
        // Translucent blue shading fill
        pushFilledRect(verts, left, top, sw, sh, "#2563eb", 0.22);
        // Dashed blue border
        const strokeW = Math.max(1.5, 0.08 * worldScale);
        pushDashedRect(verts, left, top, sw, sh, strokeW, 6, 4, "#2563eb", 1.0);
      }
    }

    // --- Pin markers ---
    for (const p of pins) {
      const [sx, sy] = toScreen(p.x, p.y);
      const baseR = 0.12 * worldScale;
      if (p.kind === "selected") {
        pushFilledCircle(verts, sx, sy, 0.22 * worldScale, p.color, 1);
        pushStrokedCircle(verts, sx, sy, 0.22 * worldScale, 0.06 * worldScale, "#fca5a5", 1);
      } else if (p.kind === "net") {
        pushFilledCircle(verts, sx, sy, 0.18 * worldScale, p.color, 1);
        pushStrokedCircle(verts, sx, sy, 0.18 * worldScale, 0.05 * worldScale, "#93c5fd", 1);
      } else if (p.kind === "floating") {
        const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
        const pulse = 0.85 + 0.15 * Math.sin(t * (Math.PI * 2 / 1.5));
        const pulseAlpha = 0.55 + 0.3 * Math.sin(t * (Math.PI * 2 / 1.5));
        
        pushFilledCircle(verts, sx, sy, baseR, p.color, 1);
        pushStrokedCircle(verts, sx, sy, 0.28 * worldScale * pulse, 0.05 * worldScale, "#f97316", pulseAlpha);
      } else {
        pushFilledCircle(verts, sx, sy, baseR, p.color, 1);
      }
    }

    // --- Soft glows (LED / heat) ---
    for (const g of glows) {
      const [sx, sy] = toScreen(g.x, g.y);
      const layers = g.layers ?? 4;
      for (let i = layers; i >= 1; i--) {
        const t = i / layers;
        const rr = g.r * worldScale * (0.4 + 1.6 * t);
        const aa = g.alpha * (1 - t) * 0.55;
        if (aa < 0.02) continue;
        pushFilledCircle(verts, sx, sy, rr, g.color, aa);
      }
    }

    // --- Wire-tool indicators (hover + pending) ---
    for (const ind of wireIndicators) {
      const [sx, sy] = toScreen(ind.x, ind.y);
      if (ind.kind === "hover") {
        // Green outer ring + solid center (matches old SVG)
        pushStrokedCircle(verts, sx, sy, 0.35 * worldScale, 0.08 * worldScale, "#16a34a", 1);
        pushFilledCircle(verts, sx, sy, 0.15 * worldScale, "#16a34a", 1);
      } else {
        // Pending: blue pulsing ring (radius oscillates via performance.now) + solid center
        const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
        const pulse = 0.5 + 0.1 * Math.sin(t * (Math.PI * 2 / 1.4));
        const r = pulse * worldScale;
        pushStrokedCircle(verts, sx, sy, r, 0.08 * worldScale, "#2563eb", 0.9);
        pushFilledCircle(verts, sx, sy, 0.18 * worldScale, "#2563eb", 1);
      }
    }

    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rects, pins, wireIndicators, glows, view.x, view.y, view.scale, timeSec, animTick]);

  useSchematicGLPass(
    "selection",
    SCHEMATIC_GL_PASS_ORDER.selection,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLSelection shader error:", gl.getShaderInfoLog(shader));
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
        console.error("SchematicWebGLSelection link error:", gl.getProgramInfoLog(program));
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

  // Keep animating the pending-wire pulse or floating pins while present.
  const core = useSchematicGLStage();
  useEffect(() => {
    const hasPending = wireIndicators.some((i) => i.kind === "pending");
    const hasFloating = pins.some((p) => p.kind === "floating");
    if (!hasPending && !hasFloating) return;
    let rafId = 0;
    const tick = () => {
      setAnimTick((t) => t + 1);
      core.requestRender();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [core, wireIndicators, pins]);

  return null;
}

