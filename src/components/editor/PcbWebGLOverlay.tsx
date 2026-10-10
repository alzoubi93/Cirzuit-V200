import React, { useRef, useMemo } from "react";
import {
  PcbDoc,
  PcbLayerId,
  PcbUnit,
  PcbDimension,
  PcbMeasure,
  PcbGraphic,
  PcbTarget,
  fmt,
} from "@/lib/pcb";
import { generateHersheyTextStrokes } from "@/lib/kicadHersheyFont";
import { compute3PointArc } from "@/lib/arcGeometry";
import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

export interface PcbWebGLOverlayProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  selectedId: string | null;
  selection: any;
  groupSelected: any;
  marqueeStart?: { x: number; y: number } | null;
  marqueeEnd?: { x: number; y: number } | null;
  unit: PcbUnit;
  measureA: { x: number; y: number } | null;
  cursor: { x: number; y: number } | null;
  isDraggingMeasure: boolean;
  textFontMode?: "vector" | "msdf";
  lang?: string;
}

// ============================================================================
// GLSL Shaders: Overlay Render Pass (Measures, Dimensions, Graphic Lines & Arrows)
// ============================================================================

const OVERLAY_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-1, 1] Unit Quad

// Instanced Line Segment Attributes
attribute vec2 a_seg_p0;         // Start point (x0, y0) in mm
attribute vec2 a_seg_p1;         // End point (x1, y1) in mm
attribute vec4 a_seg_props;      // (width in mm, isSelected, dimAlpha, haloWidth in mm)
attribute vec2 a_seg_style;      // (dashPeriod in mm, dashLength in mm)
attribute vec4 a_seg_color;      // RGBA
attribute vec4 a_seg_halo_color; // RGBA

// Camera Uniforms
uniform vec2 u_resolution; // Canvas physical pixels (w * dpr, h * dpr)
uniform vec2 u_pan;        // Pan in CSS pixels (x, y)
uniform float u_zoom;      // Zoom factor
uniform float u_rotation;  // Board rotation in radians
uniform float u_dpr;       // Device pixel ratio

varying vec2 v_world_pos;
varying vec2 v_p0;
varying vec2 v_p1;
varying vec4 v_props;
varying vec2 v_style;
varying vec4 v_color;
varying vec4 v_halo_color;

void main() {
  v_p0 = a_seg_p0;
  v_p1 = a_seg_p1;
  v_props = a_seg_props;
  v_style = a_seg_style;
  v_color = a_seg_color;
  v_halo_color = a_seg_halo_color;

  float width = a_seg_props.x;
  float haloWidth = a_seg_props.w;
  float radius = width * 0.5;

  // Subpixel AA padding in mm to guarantee zero clipping of anti-aliased edges
  float pixelSizeMm = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aaPadding = max(pixelSizeMm * 2.0, 0.05);
  float totalR = radius + haloWidth + aaPadding;

  vec2 dir = a_seg_p1 - a_seg_p0;
  float segLen = length(dir);
  vec2 u = segLen > 0.00001 ? (dir / segLen) : vec2(1.0, 0.0);
  vec2 n = vec2(-u.y, u.x);

  vec2 center = (a_seg_p0 + a_seg_p1) * 0.5;
  float halfLen = segLen * 0.5 + totalR;
  float halfWidth = totalR;

  vec2 localOffset = u * (a_quad_pos.x * halfLen) + n * (a_quad_pos.y * halfWidth);
  vec2 world_pos = center + localOffset;
  v_world_pos = world_pos;

  // Apply board rotation
  float cos_r = cos(u_rotation);
  float sin_r = sin(u_rotation);
  vec2 rotated_pos = vec2(
    cos_r * world_pos.x - sin_r * world_pos.y,
    sin_r * world_pos.x + cos_r * world_pos.y
  );

  // Screen CSS coordinates
  vec2 screen_coord = u_pan + u_zoom * rotated_pos;

  // Convert to WebGL NDC [-1, 1]
  vec2 clip_pos = vec2(
    (screen_coord.x * u_dpr / u_resolution.x) * 2.0 - 1.0,
    1.0 - (screen_coord.y * u_dpr / u_resolution.y) * 2.0
  );

  gl_Position = vec4(clip_pos, 0.0, 1.0);
}
`;

const OVERLAY_FRAGMENT_SHADER = `
precision highp float;

uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_world_pos;
varying vec2 v_p0;
varying vec2 v_p1;
varying vec4 v_props;      // (width, isSelected, dimAlpha, haloWidth)
varying vec2 v_style;      // (dashPeriod, dashLength)
varying vec4 v_color;
varying vec4 v_halo_color;

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float l2 = dot(ba, ba);
  float h = l2 > 0.000001 ? clamp(dot(pa, ba) / l2, 0.0, 1.0) : 0.0;
  return length(pa - ba * h) - r;
}

void main() {
  float width = v_props.x;
  float isSelected = v_props.y;
  float dimAlpha = v_props.z;
  float haloWidth = v_props.w;
  float radius = width * 0.5;

  // Analytical dash / dot pattern clipping along the segment
  float dashPeriod = v_style.x;
  float dashLength = v_style.y;
  if (dashPeriod > 0.001) {
    vec2 dir = v_p1 - v_p0;
    float len = length(dir);
    if (len > 0.0001) {
      vec2 u = dir / len;
      float t = dot(v_world_pos - v_p0, u);
      float modT = mod(t, dashPeriod);
      if (modT > dashLength) {
        discard;
      }
    }
  }

  float dist = sdCapsule(v_world_pos, v_p0, v_p1, 0.0);

  // Subpixel AA in mm
  float pixelSizeMm = 1.0 / max(u_zoom * u_dpr, 0.001);
  float halfPx = 0.5 * pixelSizeMm;

  float d_body = dist - radius;
  float d_total = dist - (radius + haloWidth);

  if (d_total > halfPx * 1.5) {
    discard;
  }

  float alpha_total = 1.0 - smoothstep(-halfPx, halfPx, d_total);
  float alpha_body = 1.0 - smoothstep(-halfPx, halfPx, d_body);

  vec4 finalColor;
  if (isSelected > 0.5 && haloWidth > 0.0) {
    vec4 mixedColor = mix(v_halo_color, v_color, alpha_body);
    finalColor = vec4(mixedColor.rgb, alpha_total * dimAlpha * mixedColor.a);
  } else {
    finalColor = vec4(v_color.rgb, alpha_body * dimAlpha * v_color.a);
  }

  if (finalColor.a <= 0.001) discard;
  gl_FragColor = finalColor;
}
`;

// Helper for parsing Hex or RGBA color strings
function parseHexOrRgba(colorStr: string, defaultAlpha: number = 1.0): [number, number, number, number] {
  if (!colorStr) return [1.0, 0.65, 0.0, defaultAlpha];

  if (colorStr.startsWith("#")) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b, defaultAlpha];
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255, defaultAlpha];
    }
    if (hex.length === 8) {
      const num = parseInt(hex, 16);
      return [
        ((num >> 24) & 255) / 255,
        ((num >> 16) & 255) / 255,
        ((num >> 8) & 255) / 255,
        (num & 255) / 255,
      ];
    }
  }

  if (colorStr.startsWith("rgba") || colorStr.startsWith("rgb")) {
    const parts = colorStr.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      const r = parseFloat(parts[0]) / 255;
      const g = parseFloat(parts[1]) / 255;
      const b = parseFloat(parts[2]) / 255;
      const a = parts.length >= 4 ? parseFloat(parts[3]) : defaultAlpha;
      return [r, g, b, a];
    }
  }

  return [1.0, 0.65, 0.0, defaultAlpha];
}

// 18 floats per line segment instance
const FLOATS_PER_INSTANCE = 18;

function addSegment(
  instances: number[],
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  width: number,
  color: [number, number, number, number],
  dashPeriod: number = 0,
  dashLength: number = 0,
  isSelected: boolean = false,
  haloWidth: number = 0,
  haloColor: [number, number, number, number] = [0.23, 0.51, 0.96, 0.6],
  dimAlpha: number = 1.0
) {
  instances.push(
    p0x, p0y,                                         // a_seg_p0 (2)
    p1x, p1y,                                         // a_seg_p1 (2)
    width, isSelected ? 1.0 : 0.0, dimAlpha, haloWidth, // a_seg_props (4)
    dashPeriod, dashLength,                           // a_seg_style (2)
    color[0], color[1], color[2], color[3],           // a_seg_color (4)
    haloColor[0], haloColor[1], haloColor[2], haloColor[3] // a_seg_halo_color (4)
  );
}

// Draw a solid/hollow CAD dimension arrow head at tip pointing along dir
function addDimensionArrow(
  instances: number[],
  tip: { x: number; y: number },
  dir: { x: number; y: number }, // normalized direction vector pointing towards tip
  length: number,
  halfWidth: number,
  width: number,
  color: [number, number, number, number],
  isSelected: boolean,
  dimAlpha: number
) {
  const nx = -dir.y;
  const ny = dir.x;
  const baseCenter = {
    x: tip.x - dir.x * length,
    y: tip.y - dir.y * length,
  };
  const w1 = {
    x: baseCenter.x + nx * halfWidth,
    y: baseCenter.y + ny * halfWidth,
  };
  const w2 = {
    x: baseCenter.x - nx * halfWidth,
    y: baseCenter.y - ny * halfWidth,
  };

  const selHalo = isSelected ? 0.35 : 0;
  const selColor: [number, number, number, number] = [0.23, 0.51, 0.96, 0.7];

  // Outer barb lines
  addSegment(instances, tip.x, tip.y, w1.x, w1.y, width, color, 0, 0, isSelected, selHalo, selColor, dimAlpha);
  addSegment(instances, tip.x, tip.y, w2.x, w2.y, width, color, 0, 0, isSelected, selHalo, selColor, dimAlpha);
  addSegment(instances, w1.x, w1.y, w2.x, w2.y, width, color, 0, 0, isSelected, selHalo, selColor, dimAlpha);

  // Interior solid fan lines for a solid filled arrowhead
  const fanCount = 5;
  for (let i = 1; i < fanCount; i++) {
    const f = i / fanCount;
    const fx = w1.x + (w2.x - w1.x) * f;
    const fy = w1.y + (w2.y - w1.y) * f;
    addSegment(instances, tip.x, tip.y, fx, fy, width, color, 0, 0, isSelected, 0, selColor, dimAlpha);
  }
}

// Generate circular ring segments
function addCircleSegments(
  instances: number[],
  cx: number,
  cy: number,
  radius: number,
  width: number,
  color: [number, number, number, number],
  steps: number = 24,
  isSelected: boolean = false,
  dimAlpha: number = 1.0,
  dashPeriod: number = 0,
  dashLength: number = 0
) {
  const angleStep = (Math.PI * 2) / steps;
  for (let i = 0; i < steps; i++) {
    const a0 = i * angleStep;
    const a1 = (i + 1) * angleStep;
    const p0x = cx + radius * Math.cos(a0);
    const p0y = cy + radius * Math.sin(a0);
    const p1x = cx + radius * Math.cos(a1);
    const p1y = cy + radius * Math.sin(a1);
    addSegment(
      instances,
      p0x, p0y, p1x, p1y,
      width, color, dashPeriod, dashLength,
      isSelected, isSelected ? 0.35 : 0, [0.23, 0.51, 0.96, 0.7], dimAlpha
    );
  }
}

export const PcbWebGLOverlay: React.FC<PcbWebGLOverlayProps> = ({
  pcb,
  pan,
  zoom,
  boardRotation,
  activeLayer,
  dimInactiveLayers,
  selectedId,
  selection,
  groupSelected,
  marqueeStart,
  marqueeEnd,
  unit,
  measureA,
  cursor,
  isDraggingMeasure,
  lang = "en",
}) => {
  const progRef = useRef<WebGLProgram | null>(null);

  const quadVboRef = useRef<WebGLBuffer | null>(null);
  const instanceVboRef = useRef<WebGLBuffer | null>(null);

  // Register the overlay pass on the unified PCB canvas (always the last pass = on top of everything)
  usePcbGLPass(
    "overlay",
    PCB_GL_PASS_ORDER.overlay,
    // ---- init: compile shaders / create buffers on the shared context
    (gl) => {
    const createShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Overlay Shader Error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, OVERLAY_VERTEX_SHADER);
    const fs = createShader(gl.FRAGMENT_SHADER, OVERLAY_FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Overlay Link Error:", gl.getProgramInfoLog(prog));
      return;
    }
    progRef.current = prog;

    // Master Quad Buffer [-1, 1]
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    const quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    quadVboRef.current = quadVbo;

    // Instanced VBO
    const instanceVbo = gl.createBuffer();
    instanceVboRef.current = instanceVbo;

    return () => {
      if (quadVboRef.current) gl.deleteBuffer(quadVboRef.current);
      if (instanceVboRef.current) gl.deleteBuffer(instanceVboRef.current);
      if (progRef.current) gl.deleteProgram(progRef.current);
      quadVboRef.current = null;
      instanceVboRef.current = null;
      progRef.current = null;
    };
    },
    // ---- draw
    (frame) => {
      const { gl, ext, physW: displayWidth, physH: displayHeight, dpr } = frame;
      const prog = progRef.current;
      if (!prog || !quadVboRef.current || !instanceVboRef.current) return;

      pcbGLEnableStandardBlend(gl);

      gl.useProgram(prog);

      // Uniforms
      gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), displayWidth, displayHeight);
      gl.uniform2f(gl.getUniformLocation(prog, "u_pan"), pan.x, pan.y);
      gl.uniform1f(gl.getUniformLocation(prog, "u_zoom"), zoom);
      gl.uniform1f(gl.getUniformLocation(prog, "u_rotation"), (boardRotation * Math.PI) / 180);
      gl.uniform1f(gl.getUniformLocation(prog, "u_dpr"), dpr);

      const instances: number[] = [];

      // Layer lookup
      const layerMap = new Map((pcb.layers || []).map((l) => [l.id, l]));

      // ========================================================================
      // 0. MARQUEE SELECTION BOX SHADING (Multi-Selection / Group Select Tool)
      // ========================================================================
      if (
        marqueeStart &&
        marqueeEnd &&
        typeof marqueeStart.x === "number" &&
        typeof marqueeEnd.x === "number" &&
        typeof marqueeStart.y === "number" &&
        typeof marqueeEnd.y === "number"
      ) {
        const minX = Math.min(marqueeStart.x, marqueeEnd.x);
        const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
        const minY = Math.min(marqueeStart.y, marqueeEnd.y);
        const maxY = Math.max(marqueeStart.y, marqueeEnd.y);
        const boxW = maxX - minX;
        const boxH = maxY - minY;

        if (boxW > 0.001 || boxH > 0.001) {
          const blueCol: [number, number, number, number] = [0.23, 0.51, 0.96, 1.0]; // Vivid CAD Blue #3b82f6
          const fillCol: [number, number, number, number] = [0.23, 0.51, 0.96, 0.40]; // Vivid Blue Translucent Shading
          const haloCol: [number, number, number, number] = [0.37, 0.65, 0.98, 0.85];
          const strokeW = Math.max(0.28, 1.0 / zoom);

          // A. Dashed Selection Box Border with WebGL Outer Glow
          addSegment(instances, minX, minY, maxX, minY, strokeW, blueCol, 1.0, 0.5, true, 0.35, haloCol);
          addSegment(instances, maxX, minY, maxX, maxY, strokeW, blueCol, 1.0, 0.5, true, 0.35, haloCol);
          addSegment(instances, maxX, maxY, minX, maxY, strokeW, blueCol, 1.0, 0.5, true, 0.35, haloCol);
          addSegment(instances, minX, maxY, minX, minY, strokeW, blueCol, 1.0, 0.5, true, 0.35, haloCol);

          // B. Interior Semi-Transparent Vivid Blue WebGL Shading Fill
          const hatchStep = strokeW * 0.85;
          for (let y = minY + hatchStep; y < maxY; y += hatchStep) {
            addSegment(instances, minX, y, maxX, y, strokeW, fillCol, 0, 0, false, 0, fillCol);
          }
        }
      }

      // ========================================================================
      // 1. SAVED MEASURES (pcb.measures)
      // ========================================================================
      (pcb.measures || []).forEach((m) => {
        if (!m || !m.a || !m.b) return;
        if (typeof m.a.x !== "number" || typeof m.b.x !== "number" || typeof m.a.y !== "number" || typeof m.b.y !== "number") return;

        const isSel = (selection?.kind === "measure" && selection.id === m.id) || selectedId === m.id;
        const color: [number, number, number, number] = isSel ? [0.23, 0.51, 0.96, 1.0] : [0.92, 0.35, 0.05, 1.0]; // Blue or CAD Orange
        const haloWidth = isSel ? 0.35 : 0;
        const haloColor: [number, number, number, number] = [0.23, 0.51, 0.96, 0.6];

        const dx = m.b.x - m.a.x;
        const dy = m.b.y - m.a.y;
        const dist = Math.hypot(dx, dy);

        // A. Dashed Measurement Line
        addSegment(instances, m.a.x, m.a.y, m.b.x, m.b.y, 0.16, color, 0.8, 0.4, isSel, haloWidth, haloColor);

        // B. Start Point Crosshair (Compact Precision Plus Sign)
        const crossArm = 1.0;
        const crossW = 0.15;
        const crossDotR = 0.25;
        addSegment(instances, m.a.x - crossArm, m.a.y, m.a.x + crossArm, m.a.y, crossW, color, 0, 0, isSel, haloWidth, haloColor);
        addSegment(instances, m.a.x, m.a.y - crossArm, m.a.x, m.a.y + crossArm, crossW, color, 0, 0, isSel, haloWidth, haloColor);
        addCircleSegments(instances, m.a.x, m.a.y, crossDotR, 0.15, color, 12, isSel);

        // C. End Point Crosshair (Compact Precision Plus Sign)
        addSegment(instances, m.b.x - crossArm, m.b.y, m.b.x + crossArm, m.b.y, crossW, color, 0, 0, isSel, haloWidth, haloColor);
        addSegment(instances, m.b.x, m.b.y - crossArm, m.b.x, m.b.y + crossArm, crossW, color, 0, 0, isSel, haloWidth, haloColor);
        addCircleSegments(instances, m.b.x, m.b.y, crossDotR, 0.15, color, 12, isSel);

        // D. Measurement Value Text (Hershey Vector Strokes at midpoint)
        const distStr = fmt(dist, unit);
        const midX = (m.a.x + m.b.x) / 2;
        const midY = (m.a.y + m.b.y) / 2 - 1.5;
        const textStrokes = generateHersheyTextStrokes({
          text: distStr,
          x: midX,
          y: midY,
          size: 1.6,
          thickness: 0.18,
          bold: true,
          justify: "center",
          verticalAlign: "bottom",
        });

        textStrokes.forEach((st) => {
          addSegment(instances, st.p0.x, st.p0.y, st.p1.x, st.p1.y, st.strokeWidth || 0.18, color, 0, 0, isSel, haloWidth, haloColor);
        });
      });

      // ========================================================================
      // 2. LIVE INTERACTIVE MEASUREMENT PREVIEW (measureA -> cursor)
      // ========================================================================
      if (measureA && typeof measureA.x === "number" && typeof measureA.y === "number") {
        const orange: [number, number, number, number] = [0.92, 0.35, 0.05, 1.0];
        const crossArm = 1.0;
        const crossW = 0.15;
        const crossDotR = 0.25;

        // A. Start Anchor Crosshair (Compact Precision Plus Sign)
        addSegment(instances, measureA.x - crossArm, measureA.y, measureA.x + crossArm, measureA.y, crossW, orange);
        addSegment(instances, measureA.x, measureA.y - crossArm, measureA.x, measureA.y + crossArm, crossW, orange);
        addCircleSegments(instances, measureA.x, measureA.y, crossDotR, 0.15, orange, 12);

        // B. Live Drag Line & Cursor Target Crosshair
        if (cursor && typeof cursor.x === "number" && typeof cursor.y === "number" && isDraggingMeasure) {
          // Real-time dashed line
          addSegment(instances, measureA.x, measureA.y, cursor.x, cursor.y, 0.16, orange, 0.8, 0.4);

          // Real-time end crosshair at cursor
          addSegment(instances, cursor.x - crossArm, cursor.y, cursor.x + crossArm, cursor.y, crossW, orange);
          addSegment(instances, cursor.x, cursor.y - crossArm, cursor.x, cursor.y + crossArm, crossW, orange);
          addCircleSegments(instances, cursor.x, cursor.y, crossDotR, 0.15, orange, 12);

          // Real-time distance text
          const liveDist = Math.hypot(cursor.x - measureA.x, cursor.y - measureA.y);
          const liveDistStr = fmt(liveDist, unit);
          const midX = (measureA.x + cursor.x) / 2;
          const midY = (measureA.y + cursor.y) / 2 - 1.5;

          const liveTextStrokes = generateHersheyTextStrokes({
            text: liveDistStr,
            x: midX,
            y: midY,
            size: 1.6,
            thickness: 0.18,
            bold: true,
            justify: "center",
            verticalAlign: "bottom",
          });
          liveTextStrokes.forEach((st) => {
            addSegment(instances, st.p0.x, st.p0.y, st.p1.x, st.p1.y, st.strokeWidth || 0.18, orange);
          });
        }
      }

      // ========================================================================
      // 3. DIMENSIONS (pcb.dimensions) with Authentic Arrows & Dimension Grid
      // ========================================================================
      (pcb.dimensions || []).forEach((dim) => {
        const layer = layerMap.get(dim.layer);
        if (layer && !layer.visible) return;

        const isSel = (selection?.kind === "dimension" && selection.id === dim.id) || selectedId === dim.id;
        const isGroupSel = groupSelected?.dimensions?.includes(dim.id) || false;
        const baseColor = isGroupSel ? "#f59e0b" : isSel ? "#3b82f6" : (layer?.color || "#06b6d4");
        const col = parseHexOrRgba(baseColor);
        const selHalo = isSel ? 0.35 : isGroupSel ? 0.25 : 0;
        const haloCol: [number, number, number, number] = isGroupSel ? [0.96, 0.62, 0.04, 0.6] : [0.23, 0.51, 0.96, 0.7];
        const dimAlpha = !dimInactiveLayers || dim.layer === activeLayer ? 1.0 : 0.35;

        const pts = dim.points || [];
        if (pts.length < 2) return;

        const p1 = pts[0];
        const p2 = pts[1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return;

        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;

        const offsetH = typeof dim.height === "number" ? dim.height : 0;

        // Offset dimension line points
        const dL1 = { x: p1.x + nx * offsetH, y: p1.y + ny * offsetH };
        const dL2 = { x: p2.x + nx * offsetH, y: p2.y + ny * offsetH };

        // A. Extension / Witness Lines (Leader Lines from feature to dimension line)
        if (Math.abs(offsetH) > 0.05) {
          const signH = Math.sign(offsetH);
          const gap = signH * 0.4;
          const overshoot = signH * 0.8;

          // Witness Line 1
          addSegment(
            instances,
            p1.x + nx * gap,
            p1.y + ny * gap,
            dL1.x + nx * overshoot,
            dL1.y + ny * overshoot,
            0.15,
            col,
            0, 0,
            isSel,
            selHalo,
            haloCol,
            dimAlpha
          );

          // Witness Line 2
          addSegment(
            instances,
            p2.x + nx * gap,
            p2.y + ny * gap,
            dL2.x + nx * overshoot,
            dL2.y + ny * overshoot,
            0.15,
            col,
            0, 0,
            isSel,
            selHalo,
            haloCol,
            dimAlpha
          );
        }

        // B. Dimension Line (Main span)
        const strokeW = dim.style?.thickness || 0.18;
        addSegment(
          instances,
          dL1.x, dL1.y,
          dL2.x, dL2.y,
          strokeW,
          col,
          0, 0,
          isSel,
          selHalo,
          haloCol,
          dimAlpha
        );

        // C. Dimension Arrows (KiCad Style Arrow Heads at both endpoints)
        const arrowLen = Math.min(dim.style?.arrowLength || 1.8, len * 0.35);
        const arrowHalfW = arrowLen * 0.35;

        // Arrow 1 at dL1 pointing toward dL1
        addDimensionArrow(
          instances,
          dL1,
          { x: -ux, y: -uy },
          arrowLen,
          arrowHalfW,
          strokeW,
          col,
          isSel,
          dimAlpha
        );

        // Arrow 2 at dL2 pointing toward dL2
        addDimensionArrow(
          instances,
          dL2,
          { x: ux, y: uy },
          arrowLen,
          arrowHalfW,
          strokeW,
          col,
          isSel,
          dimAlpha
        );

        // D. Dimension Grid & Subdivision Ticks along the Dimension Axis
        // Renders authentic CAD ruler ticks along the dimension span
        if (len > arrowLen * 2.5) {
          const availableStart = arrowLen * 1.1;
          const availableEnd = len - arrowLen * 1.1;
          const availableSpan = availableEnd - availableStart;

          // Determine appropriate tick step
          let tickStep = 5.0; // 5mm default
          if (len > 30.0) tickStep = 10.0;
          else if (len < 10.0) tickStep = 1.0;
          else if (len < 5.0) tickStep = 0.5;

          const firstTickIndex = Math.ceil(availableStart / tickStep);
          const lastTickIndex = Math.floor(availableEnd / tickStep);

          for (let tIdx = firstTickIndex; tIdx <= lastTickIndex; tIdx++) {
            const tDist = tIdx * tickStep;
            const isMajor = tIdx % 2 === 0;
            const tickHalfLen = isMajor ? 0.45 : 0.25;
            const tickCenter = {
              x: dL1.x + ux * tDist,
              y: dL1.y + uy * tDist,
            };

            addSegment(
              instances,
              tickCenter.x - nx * tickHalfLen,
              tickCenter.y - ny * tickHalfLen,
              tickCenter.x + nx * tickHalfLen,
              tickCenter.y + ny * tickHalfLen,
              0.12,
              col,
              0, 0,
              false,
              0,
              haloCol,
              dimAlpha * 0.7
            );
          }
        }

        // E. Dimension Text (Hershey Vector Font rendered along or above dimension line)
        const textVal = dim.text || fmt(len, unit);
        const midX = (dL1.x + dL2.x) / 2;
        const midY = (dL1.y + dL2.y) / 2;

        // Text offset above the dimension line
        const textOffsetDist = Math.max(0.7, strokeW * 2 + 0.4);
        const textPos = {
          x: midX + nx * textOffsetDist,
          y: midY + ny * textOffsetDist,
        };

        // Calculate readable text rotation
        let textAngle = (Math.atan2(uy, ux) * 180) / Math.PI;
        if (textAngle > 90 || textAngle < -90) {
          textAngle += 180;
        }

        const dimTextStrokes = generateHersheyTextStrokes({
          text: textVal,
          x: textPos.x,
          y: textPos.y,
          size: 1.3,
          thickness: 0.16,
          rotation: textAngle,
          justify: "center",
          verticalAlign: "bottom",
        });

        dimTextStrokes.forEach((st) => {
          addSegment(
            instances,
            st.p0.x, st.p0.y,
            st.p1.x, st.p1.y,
            st.strokeWidth || 0.16,
            col,
            0, 0,
            isSel,
            selHalo,
            haloCol,
            dimAlpha
          );
        });
      });

      // ========================================================================
      // 4. GRAPHIC LINES & TECHNICAL DRAWINGS (pcb.graphics)
      // ========================================================================
      (pcb.graphics || []).forEach((g: PcbGraphic) => {
        const layer = layerMap.get(g.layer);
        if (layer && !layer.visible) return;

        const isSel = (selection?.kind === "graphic" && selection.id === g.id) || selectedId === g.id;
        const isGroupSel = g.groupId ? groupSelected?.tracks?.includes(g.id) || false : false;
        const baseColor = isGroupSel ? "#f59e0b" : isSel ? "#3b82f6" : (layer?.color || "#ffd166");
        const col = parseHexOrRgba(baseColor);
        const strokeW = g.stroke?.width || g.width || 0.2;
        const selHalo = isSel ? 0.35 : 0;
        const haloCol: [number, number, number, number] = [0.23, 0.51, 0.96, 0.7];
        const dimAlpha = !dimInactiveLayers || g.layer === activeLayer ? 1.0 : 0.3;

        // Dash styling
        let dashPeriod = 0;
        let dashLength = 0;
        if (g.stroke?.type === "dash") {
          dashPeriod = 1.2;
          dashLength = 0.7;
        } else if (g.stroke?.type === "dot") {
          dashPeriod = 0.5;
          dashLength = 0.2;
        }

        switch (g.kind) {
          case "line": {
            addSegment(
              instances,
              g.start.x, g.start.y,
              g.end.x, g.end.y,
              strokeW,
              col,
              dashPeriod, dashLength,
              isSel, selHalo, haloCol, dimAlpha
            );
            break;
          }
          case "rect": {
            const minX = Math.min(g.start.x, g.end.x);
            const maxX = Math.max(g.start.x, g.end.x);
            const minY = Math.min(g.start.y, g.end.y);
            const maxY = Math.max(g.start.y, g.end.y);

            // 4 Boundary segments
            addSegment(instances, minX, minY, maxX, minY, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);
            addSegment(instances, maxX, minY, maxX, maxY, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);
            addSegment(instances, maxX, maxY, minX, maxY, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);
            addSegment(instances, minX, maxY, minX, minY, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);

            // Solid fill hatching
            if (g.fill === "solid") {
              const hatchStep = Math.max(strokeW * 0.9, 0.15);
              for (let y = minY + hatchStep; y < maxY; y += hatchStep) {
                addSegment(instances, minX, y, maxX, y, strokeW, col, 0, 0, isSel, 0, haloCol, dimAlpha);
              }
            }
            break;
          }
          case "circle": {
            const r = g.radius || Math.hypot(g.end.x - g.center.x, g.end.y - g.center.y);
            addCircleSegments(instances, g.center.x, g.center.y, r, strokeW, col, 36, isSel, dimAlpha, dashPeriod, dashLength);

            if (g.fill === "solid") {
              const hatchStep = Math.max(strokeW * 0.9, 0.15);
              for (let dy = -r + hatchStep; dy < r; dy += hatchStep) {
                const span = Math.sqrt(Math.max(0, r * r - dy * dy));
                addSegment(instances, g.center.x - span, g.center.y + dy, g.center.x + span, g.center.y + dy, strokeW, col, 0, 0, isSel, 0, haloCol, dimAlpha);
              }
            }
            break;
          }
          case "arc": {
            if (g.mid) {
              const arc = compute3PointArc(g.start, g.mid, g.end);
              if (arc && arc.radius > 0.001) {
                const steps = 24;
                for (let i = 0; i < steps; i++) {
                  const a0 = arc.startAngle + (arc.sweepAngle * i) / steps;
                  const a1 = arc.startAngle + (arc.sweepAngle * (i + 1)) / steps;
                  const p0x = arc.center.x + arc.radius * Math.cos(a0);
                  const p0y = arc.center.y + arc.radius * Math.sin(a0);
                  const p1x = arc.center.x + arc.radius * Math.cos(a1);
                  const p1y = arc.center.y + arc.radius * Math.sin(a1);
                  addSegment(instances, p0x, p0y, p1x, p1y, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);
                }
              } else {
                addSegment(instances, g.start.x, g.start.y, g.end.x, g.end.y, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);
              }
            } else {
              addSegment(instances, g.start.x, g.start.y, g.end.x, g.end.y, strokeW, col, dashPeriod, dashLength, isSel, selHalo, haloCol, dimAlpha);
            }
            break;
          }
          case "poly":
          case "curve": {
            const pts = g.points || [];
            for (let i = 0; i < pts.length - 1; i++) {
              addSegment(
                instances,
                pts[i].x, pts[i].y,
                pts[i + 1].x, pts[i + 1].y,
                strokeW,
                col,
                dashPeriod, dashLength,
                isSel, selHalo, haloCol, dimAlpha
              );
            }
            break;
          }
          case "text":
          case "textbox": {
            if (!g.text) break;
            const textSize = (g as any).size?.y || (g as any).size?.x || 1.2;
            const textStrokes = generateHersheyTextStrokes({
              text: g.text,
              x: g.position.x,
              y: g.position.y,
              size: textSize,
              thickness: strokeW,
              rotation: g.rotation || 0,
              bold: (g as any).bold,
              italic: (g as any).italic,
              justify: (g as any).justify?.[0] as any || "left",
            });

            textStrokes.forEach((st) => {
              addSegment(instances, st.p0.x, st.p0.y, st.p1.x, st.p1.y, st.strokeWidth || strokeW, col, 0, 0, isSel, selHalo, haloCol, dimAlpha);
            });
            break;
          }
        }
      });

      // ========================================================================
      // 5. TARGETS & OPTICAL FIDUCIALS (pcb.targets)
      // ========================================================================
      (pcb.targets || []).forEach((tg: PcbTarget) => {
        const layer = layerMap.get(tg.layer);
        if (layer && !layer.visible) return;

        const isSel = (selection?.kind === "target" && selection.id === tg.id) || selectedId === tg.id;
        const col = parseHexOrRgba(layer?.color || "#e11d48");
        const r = (tg.size || 3.0) / 2;
        const strokeW = tg.width || 0.18;
        const selHalo = isSel ? 0.35 : 0;
        const haloCol: [number, number, number, number] = [0.23, 0.51, 0.96, 0.7];
        const dimAlpha = !dimInactiveLayers || tg.layer === activeLayer ? 1.0 : 0.3;

        // Outer & Inner concentric circles
        addCircleSegments(instances, tg.x, tg.y, r, strokeW, col, 24, isSel, dimAlpha);
        addCircleSegments(instances, tg.x, tg.y, r * 0.5, strokeW, col, 16, isSel, dimAlpha);

        // Crosshair lines
        addSegment(instances, tg.x - r * 1.35, tg.y, tg.x + r * 1.35, tg.y, strokeW, col, 0, 0, isSel, selHalo, haloCol, dimAlpha);
        addSegment(instances, tg.x, tg.y - r * 1.35, tg.x, tg.y + r * 1.35, strokeW, col, 0, 0, isSel, selHalo, haloCol, dimAlpha);
      });

      // ========================================================================
      // Upload Buffer & Execute Draw Call
      // ========================================================================
      const instanceCount = instances.length / FLOATS_PER_INSTANCE;
      if (instanceCount === 0) return;

      const dataArray = new Float32Array(instances);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVboRef.current);
      gl.bufferData(gl.ARRAY_BUFFER, dataArray, gl.DYNAMIC_DRAW);

      // Bind Quad VBO (Attribute 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVboRef.current);
      const locQuad = gl.getAttribLocation(prog, "a_quad_pos");
      gl.enableVertexAttribArray(locQuad);
      gl.vertexAttribPointer(locQuad, 2, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(locQuad, 0);

      // Bind Instance VBO
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVboRef.current);
      const stride = FLOATS_PER_INSTANCE * 4;

      const setupInstancedAttr = (name: string, size: number, offsetFloats: number) => {
        const loc = gl.getAttribLocation(prog, name);
        if (loc !== -1) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offsetFloats * 4);
          ext.vertexAttribDivisorANGLE(loc, 1);
        }
      };

      setupInstancedAttr("a_seg_p0", 2, 0);
      setupInstancedAttr("a_seg_p1", 2, 2);
      setupInstancedAttr("a_seg_props", 4, 4);
      setupInstancedAttr("a_seg_style", 2, 8);
      setupInstancedAttr("a_seg_color", 4, 10);
      setupInstancedAttr("a_seg_halo_color", 4, 14);

      // Single Hardware Accelerated Instanced Draw Call for all Overlay elements
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, instanceCount);
    },
    [
      pcb,
      pan,
      zoom,
      boardRotation,
      activeLayer,
      dimInactiveLayers,
      selectedId,
      selection,
      groupSelected,
      unit,
      measureA,
      cursor,
      isDraggingMeasure,
      lang,
    ]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
};
