import React, { useRef, useMemo } from "react";
import {
  PcbDoc,
  PcbTrack,
  PcbLayerId,
  PcbLayer,
  getCopperLayerStandardColor,
  isCopperLayer,
  normalizeLayerId,
} from "@/lib/pcb";
import { getTrackArcGeometry } from "@/lib/arcGeometry";
import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

export interface PcbWebGLTracksProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  selectedTrackId: string | null;
  selection: any;
  groupSelected: { footprints: string[]; tracks: string[]; vias: string[]; pads: string[] } | null;
  highlightedNetIds: number[];
  trackNetMap: Map<string, number>;
}

// GLSL Vertex Shader for Instanced Line Segments with Analytical Round Caps & Joins
const TRACK_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-1, 1] unit quad

// Per-instance attributes (Instanced Arrays)
attribute vec2 a_seg_p0;         // Start point (x0, y0) in mm
attribute vec2 a_seg_p1;         // End point (x1, y1) in mm
attribute vec4 a_seg_props;      // (radius in mm, selState, dimAlpha, haloWidth in mm)
attribute vec4 a_seg_color;      // RGBA
attribute vec4 a_seg_halo_color; // RGBA

uniform vec2 u_resolution; // canvas physical pixels (w * dpr, h * dpr)
uniform vec2 u_pan;        // pan in CSS pixels (x, y)
uniform float u_zoom;      // zoom factor
uniform float u_rotation;  // board rotation in radians
uniform float u_dpr;       // device pixel ratio

varying vec2 v_world_pos;
varying vec2 v_p0;
varying vec2 v_p1;
varying vec4 v_props;
varying vec4 v_color;
varying vec4 v_halo_color;

void main() {
  v_p0 = a_seg_p0;
  v_p1 = a_seg_p1;
  v_props = a_seg_props;
  v_color = a_seg_color;
  v_halo_color = a_seg_halo_color;

  float radius = a_seg_props.x;
  float haloWidth = a_seg_props.w;

  // Subpixel AA padding in mm to ensure zero clipping of anti-aliased edges
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

// GLSL Fragment Shader with Signed Distance Field (SDF) Round Caps & Joins
const TRACK_FRAGMENT_SHADER = `
precision highp float;

uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_world_pos;
varying vec2 v_p0;
varying vec2 v_p1;
varying vec4 v_props;      // (radius, selState, dimAlpha, haloWidth)
varying vec4 v_color;
varying vec4 v_halo_color;

void main() {
  float radius = v_props.x;
  float selState = v_props.y; // 0 = normal, 1 = sel, 2 = groupSel, 3 = netHi
  float dimAlpha = v_props.z;
  float haloWidth = v_props.w;

  vec2 ba = v_p1 - v_p0;
  vec2 pa = v_world_pos - v_p0;
  float l2 = dot(ba, ba);
  float t = l2 > 0.000001 ? clamp(dot(pa, ba) / l2, 0.0, 1.0) : 0.0;
  vec2 proj = v_p0 + t * ba;
  float dist = length(v_world_pos - proj);

  // Pixel size in mm for screen-space subpixel anti-aliasing
  float pixelSizeMm = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aa = max(pixelSizeMm * 0.75, 0.0001);

  float d_body = dist - radius;
  float d_total = dist - (radius + haloWidth);

  if (d_total > aa * 2.0) {
    discard;
  }

  // Smoothstep coverage alphas: exact round caps and round joins
  float alpha_total = 1.0 - smoothstep(-aa, aa, d_total);
  float alpha_body = 1.0 - smoothstep(-aa, aa, d_body);

  vec4 finalColor;
  if (selState > 0.5) {
    // When selected or net-highlighted, render a smooth halo glow around the trace
    vec4 mixedColor = mix(v_halo_color, v_color, alpha_body);
    finalColor = vec4(mixedColor.rgb, alpha_total * dimAlpha * mixedColor.a);
  } else {
    finalColor = vec4(v_color.rgb, alpha_body * dimAlpha * v_color.a);
  }

  if (finalColor.a <= 0.001) {
    discard;
  }

  gl_FragColor = finalColor;
}
`;

const colorCache = new Map<string, [number, number, number, number]>();

function parseColorFast(colorStr: string, defaultAlpha = 1.0): [number, number, number, number] {
  if (!colorStr) return [0.93, 0.27, 0.27, defaultAlpha];
  const key = `${colorStr}_${defaultAlpha}`;
  const cached = colorCache.get(key);
  if (cached) return cached;

  const str = colorStr.trim().toLowerCase();
  let result: [number, number, number, number] = [0.93, 0.27, 0.27, defaultAlpha];

  if (str.startsWith("#")) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      result = [r, g, b, defaultAlpha];
    } else if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      result = [r, g, b, defaultAlpha];
    } else if (hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = (parseInt(hex.substring(6, 8), 16) / 255) * defaultAlpha;
      result = [r, g, b, a];
    }
  } else {
    const rgbaMatch = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
      const r = parseFloat(rgbaMatch[1]) / 255;
      const g = parseFloat(rgbaMatch[2]) / 255;
      const b = parseFloat(rgbaMatch[3]) / 255;
      const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) * defaultAlpha : defaultAlpha;
      result = [r, g, b, a];
    }
  }

  colorCache.set(key, result);
  return result;
}

// Floats per line segment instance:
// 2 (p0) + 2 (p1) + 4 (props: radius, selState, dimAlpha, haloWidth) + 4 (color) + 4 (haloColor) = 16 floats (64 bytes)
const FLOATS_PER_SEGMENT = 16;

const LAYER_RENDER_ORDER: Record<string, number> = {
  bottom_silkscreen: 10,
  "B.SilkS": 10,
  bottom_solder_mask: 20,
  "B.Mask": 20,
  bottom_copper: 30,
  "B.Cu": 30,
  // Inner layers default to 40-75
  top_copper: 80,
  "F.Cu": 80,
  solder_mask: 90,
  "F.Mask": 90,
  silkscreen: 100,
  "F.SilkS": 100,
  outline: 110,
  "Edge.Cuts": 110,
  multi_layer: 120,
  drill: 130,
};

// Helper to get layer order for any layer ID
function getLayerOrder(layerId: string): number {
  if (LAYER_RENDER_ORDER[layerId] !== undefined) return LAYER_RENDER_ORDER[layerId];
  
  // Handle Inner Copper Layers: In1.Cu, In2.Cu, etc.
  const inMatch = layerId.match(/^in(\d+)\.cu$/i);
  if (inMatch) {
    const num = parseInt(inMatch[1], 10);
    // Map In1-In30 to range [75, 40] descending (closer to top is higher)
    return Math.max(40, 76 - num);
  }
  
  return 50; // default
}

export const PcbWebGLTracks: React.FC<PcbWebGLTracksProps> = React.memo(({
  pcb,
  pan,
  zoom,
  boardRotation,
  activeLayer,
  dimInactiveLayers,
  selectedTrackId,
  selection,
  groupSelected,
  highlightedNetIds,
  trackNetMap,
}) => {
  const programRef = useRef<WebGLProgram | null>(null);
  const quadVboRef = useRef<WebGLBuffer | null>(null);
  const instanceVboRef = useRef<WebGLBuffer | null>(null);
  /** Instance array currently resident in instanceVboRef (skip re-uploading unchanged data). */
  const uploadedRef = useRef<Float32Array | null>(null);

  const locationsRef = useRef<{
    aQuadPos: number;
    aSegP0: number;
    aSegP1: number;
    aSegProps: number;
    aSegColor: number;
    aSegHaloColor: number;
    uResolution: WebGLUniformLocation | null;
    uPan: WebGLUniformLocation | null;
    uZoom: WebGLUniformLocation | null;
    uRotation: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  // Tessellate tracks & arcs into instanced segments with variable thickness, round caps & joins
  const instanceData = useMemo(() => {
    const tracks = pcb.tracks || [];
    if (tracks.length === 0) return new Float32Array(0);

    const layerMap = new Map<string, PcbLayer>();
    (pcb.layers || []).forEach((l) => layerMap.set(normalizeLayerId(l.id), l));

    const isLayerVisible = (layerId: string) => {
      const norm = normalizeLayerId(layerId);
      const layer = layerMap.get(norm);
      return layer ? layer.visible : true;
    };

    const getLayerColor = (layerId: string) => {
      const norm = normalizeLayerId(layerId);
      const layer = layerMap.get(norm);
      if (layer?.color) return layer.color;
      return getCopperLayerStandardColor(norm);
    };

    // Fast pre-pass segment collector with layer-order awareness
    const segments: {
      layerOrder: number;
      p0: { x: number; y: number };
      p1: { x: number; y: number };
      radius: number;
      selState: number;
      dimAlpha: number;
      haloWidth: number;
      color: [number, number, number, number];
      haloColor: [number, number, number, number];
    }[] = [];

    for (let i = 0; i < tracks.length; i++) {
      const tr = tracks[i];
      if (!isLayerVisible(tr.layer)) continue;

      const isSel = selectedTrackId === tr.id || (selection?.kind === "track" && selection.id === tr.id);
      const isGroupSel = groupSelected?.tracks?.includes(tr.id) || false;
      const trackNetId = trackNetMap.get(tr.id);
      const isNetHi = trackNetId !== undefined && highlightedNetIds.includes(trackNetId);

      const selState = isGroupSel ? 2 : isNetHi ? 3 : isSel ? 1 : 0;
      const normTrLayer = normalizeLayerId(tr.layer);
      const normActiveLayer = normalizeLayerId(activeLayer);
      const isActive = normTrLayer === normActiveLayer || normTrLayer === "multi_layer";

      let dimAlpha = 1.0;
      if (dimInactiveLayers) {
        if (!isActive) dimAlpha = 0.28;
      }

      // Calculate layered stacking order:
      // Inactive bottom layers -> Inactive inner layers -> Inactive top layers -> Active layer -> Selected/Highlighted
      let baseZ = getLayerOrder(tr.layer);
      if (isActive) baseZ += 200;
      if (isSel || isGroupSel || isNetHi) baseZ += 500;

      const trWidth = Math.max(0.08, tr.width || 0.4);
      const radius = trWidth / 2;

      let baseColorHex = getLayerColor(tr.layer);
      if (isGroupSel) {
        baseColorHex = "#3b82f6";
      } else if (isSel) {
        baseColorHex = "#3b82f6";
      } else if (isNetHi) {
        baseColorHex = "#2563eb";
      }

      const color = parseColorFast(baseColorHex, 1.0);

      let haloWidth = 0.0;
      let haloColor: [number, number, number, number] = [0, 0, 0, 0];

      if (isGroupSel) {
        haloWidth = Math.max(0.35, radius * 0.9);
        haloColor = [0.23, 0.51, 0.96, 0.9]; // Vivid Blue #3b82f6
      } else if (isNetHi) {
        haloWidth = Math.max(0.4, radius * 1.1);
        haloColor = [0.15, 0.45, 0.95, 0.95]; // Bright Blue
      } else if (isSel) {
        haloWidth = Math.max(0.3, radius * 0.8);
        haloColor = [0.23, 0.51, 0.96, 0.95]; // Selection Blue
      }

      // Check if native arc geometry exists for this track
      const arc = getTrackArcGeometry(tr);
      if (arc) {
        const sweepAbs = Math.abs(arc.sweepAngle);
        // Adaptive polyline tessellation for CAD curved tracks
        const numSteps = Math.max(4, Math.min(48, Math.ceil(sweepAbs / (Math.PI / 18))));
        for (let s = 0; s < numSteps; s++) {
          const a0 = arc.startAngle + arc.sweepAngle * (s / numSteps);
          const a1 = arc.startAngle + arc.sweepAngle * ((s + 1) / numSteps);
          const p0 = {
            x: arc.center.x + arc.radius * Math.cos(a0),
            y: arc.center.y + arc.radius * Math.sin(a0),
          };
          const p1 = {
            x: arc.center.x + arc.radius * Math.cos(a1),
            y: arc.center.y + arc.radius * Math.sin(a1),
          };
          segments.push({
            layerOrder: baseZ,
            p0,
            p1,
            radius,
            selState,
            dimAlpha,
            haloWidth,
            color,
            haloColor,
          });
        }
      } else if (tr.points && tr.points.length >= 2) {
        for (let p = 0; p < tr.points.length - 1; p++) {
          const rawP0 = tr.points[p];
          const rawP1 = tr.points[p + 1];
          if (!rawP0 || !rawP1) continue;
          const p0 = { x: rawP0.x ?? 0, y: rawP0.y ?? 0 };
          const p1 = { x: rawP1.x ?? 0, y: rawP1.y ?? 0 };
          // Skip zero-length points
          if (Math.abs(p1.x - p0.x) < 1e-5 && Math.abs(p1.y - p0.y) < 1e-5) continue;

          segments.push({
            layerOrder: baseZ,
            p0,
            p1,
            radius,
            selState,
            dimAlpha,
            haloWidth,
            color,
            haloColor,
          });
        }
      } else if (tr.start && tr.end) {
        const p0 = { x: tr.start.x ?? 0, y: tr.start.y ?? 0 };
        const p1 = { x: tr.end.x ?? 0, y: tr.end.y ?? 0 };
        segments.push({
          layerOrder: baseZ,
          p0,
          p1,
          radius,
          selState,
          dimAlpha,
          haloWidth,
          color,
          haloColor,
        });
      }
    }

    // Sort segments deterministically by layer stack order
    segments.sort((a, b) => a.layerOrder - b.layerOrder);

    const count = segments.length;
    if (count === 0) return new Float32Array(0);

    const buffer = new Float32Array(count * FLOATS_PER_SEGMENT);
    let offset = 0;

    for (let i = 0; i < count; i++) {
      const seg = segments[i];
      if (!seg) continue;

      const p0x = seg.p0?.x ?? 0;
      const p0y = seg.p0?.y ?? 0;
      const p1x = seg.p1?.x ?? 0;
      const p1y = seg.p1?.y ?? 0;

      // a_seg_p0 (2 floats)
      buffer[offset++] = isNaN(p0x) ? 0 : p0x;
      buffer[offset++] = isNaN(p0y) ? 0 : p0y;

      // a_seg_p1 (2 floats)
      buffer[offset++] = isNaN(p1x) ? 0 : p1x;
      buffer[offset++] = isNaN(p1y) ? 0 : p1y;

      // a_seg_props (4 floats: radius, selState, dimAlpha, haloWidth)
      buffer[offset++] = isNaN(seg.radius) ? 0.1 : seg.radius;
      buffer[offset++] = seg.selState || 0;
      buffer[offset++] = isNaN(seg.dimAlpha) ? 1.0 : seg.dimAlpha;
      buffer[offset++] = isNaN(seg.haloWidth) ? 0 : seg.haloWidth;

      // a_seg_color (4 floats)
      buffer[offset++] = seg.color[0];
      buffer[offset++] = seg.color[1];
      buffer[offset++] = seg.color[2];
      buffer[offset++] = seg.color[3];

      // a_seg_halo_color (4 floats)
      buffer[offset++] = seg.haloColor[0];
      buffer[offset++] = seg.haloColor[1];
      buffer[offset++] = seg.haloColor[2];
      buffer[offset++] = seg.haloColor[3];
    }

    return buffer;
  }, [
    pcb.tracks,
    pcb.layers,
    activeLayer,
    dimInactiveLayers,
    selectedTrackId,
    selection,
    groupSelected,
    highlightedNetIds,
    trackNetMap,
  ]);

  // Register the track pass on the unified PCB canvas
  usePcbGLPass(
    "tracks",
    PCB_GL_PASS_ORDER.tracks,
    // ---- init: compile shaders / create buffers on the shared context
    (gl) => {
      const compileShader = (type: number, src: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Track shader compile error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertShader = compileShader(gl.VERTEX_SHADER, TRACK_VERTEX_SHADER);
      const fragShader = compileShader(gl.FRAGMENT_SHADER, TRACK_FRAGMENT_SHADER);
      if (!vertShader || !fragShader) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Track program link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }

      programRef.current = program;

      locationsRef.current = {
        aQuadPos: gl.getAttribLocation(program, "a_quad_pos"),
        aSegP0: gl.getAttribLocation(program, "a_seg_p0"),
        aSegP1: gl.getAttribLocation(program, "a_seg_p1"),
        aSegProps: gl.getAttribLocation(program, "a_seg_props"),
        aSegColor: gl.getAttribLocation(program, "a_seg_color"),
        aSegHaloColor: gl.getAttribLocation(program, "a_seg_halo_color"),
        uResolution: gl.getUniformLocation(program, "u_resolution"),
        uPan: gl.getUniformLocation(program, "u_pan"),
        uZoom: gl.getUniformLocation(program, "u_zoom"),
        uRotation: gl.getUniformLocation(program, "u_rotation"),
        uDpr: gl.getUniformLocation(program, "u_dpr"),
      };

      // Unit Quad [-1, -1] to [1, 1] (2 triangles = 6 vertices)
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

      const instanceVbo = gl.createBuffer();
      instanceVboRef.current = instanceVbo;
      uploadedRef.current = null;

      return () => {
        if (quadVbo) gl.deleteBuffer(quadVbo);
        if (instanceVbo) gl.deleteBuffer(instanceVbo);
        if (program) gl.deleteProgram(program);
        if (vertShader) gl.deleteShader(vertShader);
        if (fragShader) gl.deleteShader(fragShader);
        programRef.current = null;
        locationsRef.current = null;
        quadVboRef.current = null;
        instanceVboRef.current = null;
      };
    },
    // ---- draw (single instanced draw call for all tracks)
    (frame) => {
      const { gl, ext, physW, physH, dpr } = frame;
      const program = programRef.current;
      const locs = locationsRef.current;
      const quadVbo = quadVboRef.current;
      const instanceVbo = instanceVboRef.current;
      if (!program || !locs || !quadVbo || !instanceVbo) return;

      const instanceCount = instanceData.length / FLOATS_PER_SEGMENT;
      if (instanceCount === 0) return;

      gl.useProgram(program);

      // Alpha blending for smooth SDF anti-aliased edges and round joins
      pcbGLEnableStandardBlend(gl);

      // Bind base Quad VBO
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.enableVertexAttribArray(locs.aQuadPos);
      gl.vertexAttribPointer(locs.aQuadPos, 2, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(locs.aQuadPos, 0);

      // Bind and upload Instance Data Buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
      if (uploadedRef.current !== instanceData) {
        gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
        uploadedRef.current = instanceData;
      }

      const stride = FLOATS_PER_SEGMENT * 4; // 16 floats * 4 bytes = 64 bytes

      const setupInstancedAttr = (attrLoc: number, size: number, offsetBytes: number) => {
        if (attrLoc < 0) return;
        gl.enableVertexAttribArray(attrLoc);
        gl.vertexAttribPointer(attrLoc, size, gl.FLOAT, false, stride, offsetBytes);
        ext.vertexAttribDivisorANGLE(attrLoc, 1);
      };

      setupInstancedAttr(locs.aSegP0, 2, 0);        // a_seg_p0 (vec2)
      setupInstancedAttr(locs.aSegP1, 2, 8);        // a_seg_p1 (vec2)
      setupInstancedAttr(locs.aSegProps, 4, 16);    // a_seg_props (vec4)
      setupInstancedAttr(locs.aSegColor, 4, 32);    // a_seg_color (vec4)
      setupInstancedAttr(locs.aSegHaloColor, 4, 48); // a_seg_halo_color (vec4)

      // Uniforms
      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform2f(locs.uPan, pan.x, pan.y);
      gl.uniform1f(locs.uZoom, zoom);
      gl.uniform1f(locs.uRotation, (boardRotation * Math.PI) / 180);
      gl.uniform1f(locs.uDpr, dpr);

      // SINGLE DRAW CALL FOR ALL INSTANCED TRACK SEGMENTS WITH ROUND CAPS & JOINS
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, instanceCount);
    },
    [pan.x, pan.y, zoom, boardRotation, instanceData]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
});

PcbWebGLTracks.displayName = "PcbWebGLTracks";
