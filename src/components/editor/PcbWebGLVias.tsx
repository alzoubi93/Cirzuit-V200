import React, { useRef, useMemo } from "react";
import {
  PcbDoc,
  PcbVia,
  PcbLayerId,
  PcbLayer,
  isViaVisible,
  getViaRenderingStyles,
  determineViaType,
  getCopperLayerStandardColor,
  normalizeLayerId,
} from "@/lib/pcb";

import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

export interface PcbWebGLViasProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  selectedId: string | null;
  selection: any;
  groupSelected: { footprints: string[]; tracks: string[]; vias: string[]; pads: string[] } | null;
}

// GLSL Vertex Shader for Instanced SDF Vias
const VIA_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-1, 1] unit quad

// Per-instance attributes (Instanced Arrays)
attribute vec2 a_via_center;        // (x, y) in mm
attribute vec4 a_via_radii;         // (outerRadius, drillRadius, drillOffsetX, drillOffsetY) in mm
attribute vec4 a_via_outer_color;   // RGBA
attribute vec4 a_via_drill_color;   // RGBA
attribute vec4 a_via_stroke_color;  // RGBA
attribute vec4 a_via_params;        // (isSquare, selectionState, viaType, dimAlpha)

uniform vec2 u_resolution; // canvas physical pixels (w * dpr, h * dpr)
uniform vec2 u_pan;        // pan in CSS pixels (x, y)
uniform float u_zoom;      // zoom factor
uniform float u_rotation;  // board rotation in radians
uniform float u_dpr;       // device pixel ratio

varying vec2 v_local_pos;          // position relative to via center in mm
varying vec4 v_radii;              // (outerR, innerR, drillOffX, drillOffY)
varying vec4 v_outer_color;
varying vec4 v_drill_color;
varying vec4 v_stroke_color;
varying vec4 v_params;

void main() {
  v_radii = a_via_radii;
  v_outer_color = a_via_outer_color;
  v_drill_color = a_via_drill_color;
  v_stroke_color = a_via_stroke_color;
  v_params = a_via_params;

  float outerR = a_via_radii.x;
  float selState = a_via_params.y;
  float haloPad = selState > 0.5 ? 0.6 : 0.25;
  float maxDrillOffset = max(abs(a_via_radii.z), abs(a_via_radii.w));
  float quadHalfSize = outerR + haloPad + maxDrillOffset + max(0.2, 4.0 / max(u_zoom * u_dpr, 0.001));

  vec2 local_mm = a_quad_pos * quadHalfSize;
  v_local_pos = local_mm;

  vec2 world_pos = a_via_center + local_mm;

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

// GLSL Fragment Shader with Signed Distance Field (SDF) Anti-Aliasing
const VIA_FRAGMENT_SHADER = `
precision highp float;

uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_local_pos;          // mm from via center
varying vec4 v_radii;              // (outerR, innerR, drillOffX, drillOffY)
varying vec4 v_outer_color;
varying vec4 v_drill_color;
varying vec4 v_stroke_color;
varying vec4 v_params;             // (isSquare, selectionState, viaType, dimAlpha)

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

void main() {
  float outerR = v_radii.x;
  float innerR = v_radii.y;
  vec2 drillOffset = v_radii.zw;
  float isSquare = v_params.x;
  float selState = v_params.y; // 0 = none, 1 = selected, 2 = group selected
  float viaType = v_params.z;  // 0 = through, 1 = blind, 2 = micro
  float dimAlpha = v_params.w;

  // Pixel size in mm for screen-space subpixel anti-aliasing
  float pixelSizeMm = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aa = max(pixelSizeMm * 0.75, 0.0001);

  // 1. Outer Copper SDF
  float d_outer = (isSquare > 0.5) 
    ? sdBox(v_local_pos, vec2(outerR)) 
    : sdCircle(v_local_pos, outerR);

  // 2. Inner Drill Hole SDF
  vec2 drillPos = v_local_pos - drillOffset;
  float d_drill = sdCircle(drillPos, innerR);

  // Selection halo expansion
  float haloWidth = (selState > 1.5) ? 0.35 : (selState > 0.5) ? 0.28 : 0.0;
  float totalOuterRadius = outerR + haloWidth;
  float d_totalOuter = (isSquare > 0.5) 
    ? sdBox(v_local_pos, vec2(totalOuterRadius)) 
    : sdCircle(v_local_pos, totalOuterRadius);

  if (d_totalOuter > aa * 2.0) {
    discard;
  }

  // Smoothstep coverage alphas
  float alpha_total = 1.0 - smoothstep(-aa, aa, d_totalOuter);
  float alpha_copper_outer = 1.0 - smoothstep(-aa, aa, d_outer);
  float alpha_drill = 1.0 - smoothstep(-aa, aa, d_drill);

  // Stroke width on outer annular ring boundary
  float strokeW = (selState > 0.5) ? 0.15 : 0.08;
  float alpha_stroke = smoothstep(-strokeW - aa, -strokeW + aa, d_outer);

  // Base copper annular color - solid uniform pure orange without border frame
  vec4 copperColor = (selState > 0.5) 
    ? mix(v_outer_color, v_stroke_color, alpha_stroke * 0.85)
    : v_outer_color;

  vec4 resultColor = copperColor;

  // Apply selection halo glow
  if (selState > 0.5) {
    vec4 haloColor = (selState > 1.5) 
      ? vec4(0.23, 0.51, 0.96, 0.95) // Vivid Blue #3b82f6
      : vec4(0.23, 0.51, 0.96, 0.95); // Blue #3b82f6

    resultColor = mix(haloColor, copperColor, alpha_copper_outer);
  }

  // Special Via Type Visual Glyphs inside Copper
  if (viaType > 1.5) {
    // Microvia: concentric high-contrast accent ring
    float midR = (outerR + innerR) * 0.5;
    float d_accent = abs(sdCircle(drillPos, midR)) - 0.04;
    float alpha_accent = 1.0 - smoothstep(-aa, aa, d_accent);
    resultColor.rgb = mix(resultColor.rgb, vec3(1.0, 1.0, 1.0), alpha_accent * 0.85);
  } else if (viaType > 0.5) {
    // Blind/Buried: subtle crosshair glyph
    float d_crossX = max(abs(drillPos.y) - 0.035, abs(drillPos.x) - outerR * 0.7);
    float d_crossY = max(abs(drillPos.x) - 0.035, abs(drillPos.y) - outerR * 0.7);
    float d_cross = min(d_crossX, d_crossY);
    float alpha_cross = 1.0 - smoothstep(-aa, aa, d_cross);
    resultColor.rgb = mix(resultColor.rgb, vec3(0.02, 0.71, 0.83), alpha_cross * 0.75);
  }

  // Drill Hole: sharp, mathematically hollow interior
  float drillDepthShadow = smoothstep(-innerR * 0.4, 0.0, d_drill);
  vec4 drillFinal = vec4(v_drill_color.rgb * mix(0.75, 1.0, drillDepthShadow), v_drill_color.a);
  resultColor = mix(resultColor, drillFinal, alpha_drill);

  float finalAlpha = alpha_total * dimAlpha * resultColor.a;
  if (finalAlpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(resultColor.rgb, finalAlpha);
}
`;

const colorCache = new Map<string, [number, number, number, number]>();

function parseColorFast(colorStr: string, defaultAlpha = 1.0): [number, number, number, number] {
  if (!colorStr) return [1.0, 0.533, 0.0, defaultAlpha];
  const key = `${colorStr}_${defaultAlpha}`;
  const cached = colorCache.get(key);
  if (cached) return cached;

  const str = colorStr.trim().toLowerCase();
  let result: [number, number, number, number] = [1.0, 0.533, 0.0, defaultAlpha];

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

// Floats per via instance:
// 2 (center) + 4 (radii: outerR, innerR, offX, offY) + 4 (outer_col) + 4 (drill_col) + 4 (stroke_col) + 4 (params: isSquare, selState, viaType, dimAlpha) = 22 floats
const FLOATS_PER_INSTANCE = 22;

export const PcbWebGLVias: React.FC<PcbWebGLViasProps> = React.memo(({
  pcb,
  pan,
  zoom,
  boardRotation,
  activeLayer,
  dimInactiveLayers,
  selectedId,
  selection,
  groupSelected,
}) => {
  const programRef = useRef<WebGLProgram | null>(null);
  const quadVboRef = useRef<WebGLBuffer | null>(null);
  const instanceVboRef = useRef<WebGLBuffer | null>(null);
  /** Instance array currently resident in instanceVboRef (skip re-uploading unchanged data). */
  const uploadedRef = useRef<Float32Array | null>(null);

  const locationsRef = useRef<{
    aQuadPos: number;
    aViaCenter: number;
    aViaRadii: number;
    aViaOuterColor: number;
    aViaDrillColor: number;
    aViaStrokeColor: number;
    aViaParams: number;
    uResolution: WebGLUniformLocation | null;
    uPan: WebGLUniformLocation | null;
    uZoom: WebGLUniformLocation | null;
    uRotation: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  // Compute and upload packed instance data for all visible vias
  const instanceData = useMemo(() => {
    const vias = pcb.vias || [];
    if (vias.length === 0) return new Float32Array(0);

    const layerMap = new Map<string, PcbLayer>();
    (pcb.layers || []).forEach((l) => layerMap.set(normalizeLayerId(l.id), l));

    const isLayerVisible = (layerId: string) => {
      const norm = normalizeLayerId(layerId);
      const layer = layerMap.get(norm);
      return layer ? layer.visible : true;
    };

    // If Vias layer is turned off, immediately skip all vias (hide entire via body)
    const viasLayer = (pcb.layers || []).find((l) => {
      const norm = normalizeLayerId(l.id);
      return norm === "vias" || l.id === "vias" || l.id === "via" || l.name?.toLowerCase() === "vias";
    });
    if (viasLayer && viasLayer.visible === false) {
      return new Float32Array(0);
    }

    const visibleLayerIds = new Set(
      (pcb.layers || [])
        .filter((l) => isLayerVisible(l.id))
        .map((l) => l.id)
    );
    if (isLayerVisible("drill")) visibleLayerIds.add("drill");
    if (isLayerVisible("vias")) visibleLayerIds.add("vias");

    const filteredVias: {
      via: PcbVia;
      isViaSel: boolean;
      isGroupSel: boolean;
      dimAlpha: number;
    }[] = [];

    for (let i = 0; i < vias.length; i++) {
      const v = vias[i];
      if (!isViaVisible(v, visibleLayerIds, pcb.layers)) continue;

      const isViaSel = selection?.kind === "via" && selection.id === v.id;
      const isGroupSel = groupSelected?.vias?.includes(v.id) || false;

      let dimAlpha = 1.0;
      if (dimInactiveLayers) {
        const normActive = normalizeLayerId(activeLayer);
        const isActive = normActive === "top_copper" || normActive === "bottom_copper" || normActive === "drill" || normActive === "outline" || normActive === "vias";
        if (!isActive) dimAlpha = 0.25;
      }

      filteredVias.push({ via: v, isViaSel, isGroupSel, dimAlpha });
    }

    const count = filteredVias.length;
    if (count === 0) return new Float32Array(0);

    const buffer = new Float32Array(count * FLOATS_PER_INSTANCE);
    let offset = 0;

    for (let i = 0; i < count; i++) {
      const { via, isViaSel, isGroupSel, dimAlpha } = filteredVias[i];
      const styles = getViaRenderingStyles(via, activeLayer, pcb.layers, isViaSel, isGroupSel);

      const radius = (via.diameter || 0.8) / 2;
      const isDrillVisible = layerMap.get("drill")?.visible !== false;
      const drillRadius = isDrillVisible ? (via.drill || 0.4) / 2 : 0;
      const offX = via.drillOffset?.x || 0;
      const offY = via.drillOffset?.y || 0;

      const outerCol = parseColorFast(styles.outerColor, 1.0);
      const drillCol = parseColorFast(styles.drillColor, 1.0);
      const strokeCol = parseColorFast(styles.strokeColor, 1.0);

      const isSquare = via.shape === "square" ? 1.0 : 0.0;
      const selState = isGroupSel ? 2.0 : isViaSel ? 1.0 : 0.0;
      const viaType = styles.viaType === "micro" ? 2.0 : styles.viaType === "blind" ? 1.0 : 0.0;

      // a_via_center (2 floats)
      buffer[offset++] = via.x;
      buffer[offset++] = via.y;

      // a_via_radii (4 floats: outerR, innerR, offX, offY)
      buffer[offset++] = radius;
      buffer[offset++] = drillRadius;
      buffer[offset++] = offX;
      buffer[offset++] = offY;

      // a_via_outer_color (4 floats)
      buffer[offset++] = outerCol[0];
      buffer[offset++] = outerCol[1];
      buffer[offset++] = outerCol[2];
      buffer[offset++] = outerCol[3];

      // a_via_drill_color (4 floats)
      buffer[offset++] = drillCol[0];
      buffer[offset++] = drillCol[1];
      buffer[offset++] = drillCol[2];
      buffer[offset++] = drillCol[3];

      // a_via_stroke_color (4 floats)
      buffer[offset++] = strokeCol[0];
      buffer[offset++] = strokeCol[1];
      buffer[offset++] = strokeCol[2];
      buffer[offset++] = strokeCol[3];

      // a_via_params (4 floats: isSquare, selState, viaType, dimAlpha)
      buffer[offset++] = isSquare;
      buffer[offset++] = selState;
      buffer[offset++] = viaType;
      buffer[offset++] = dimAlpha;
    }

    return buffer;
  }, [pcb.vias, pcb.layers, activeLayer, dimInactiveLayers, selection, groupSelected]);

  // Register the via pass on the unified PCB canvas
  usePcbGLPass(
    "vias",
    PCB_GL_PASS_ORDER.vias,
    // ---- init: compile shaders / create buffers on the shared context
    (gl) => {
      const compileShader = (type: number, src: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Via shader compile error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertShader = compileShader(gl.VERTEX_SHADER, VIA_VERTEX_SHADER);
      const fragShader = compileShader(gl.FRAGMENT_SHADER, VIA_FRAGMENT_SHADER);
      if (!vertShader || !fragShader) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Via program link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }

      programRef.current = program;

      locationsRef.current = {
        aQuadPos: gl.getAttribLocation(program, "a_quad_pos"),
        aViaCenter: gl.getAttribLocation(program, "a_via_center"),
        aViaRadii: gl.getAttribLocation(program, "a_via_radii"),
        aViaOuterColor: gl.getAttribLocation(program, "a_via_outer_color"),
        aViaDrillColor: gl.getAttribLocation(program, "a_via_drill_color"),
        aViaStrokeColor: gl.getAttribLocation(program, "a_via_stroke_color"),
        aViaParams: gl.getAttribLocation(program, "a_via_params"),
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
    // ---- draw (single instanced draw call for all vias)
    (frame) => {
      const { gl, ext, physW, physH, dpr } = frame;
      const program = programRef.current;
      const locs = locationsRef.current;
      const quadVbo = quadVboRef.current;
      const instanceVbo = instanceVboRef.current;
      if (!program || !locs || !quadVbo || !instanceVbo) return;

      const instanceCount = instanceData.length / FLOATS_PER_INSTANCE;
      if (instanceCount === 0) return;

      gl.useProgram(program);

      // Alpha blending for smooth SDF anti-aliased edges
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

      const stride = FLOATS_PER_INSTANCE * 4; // 22 floats * 4 bytes = 88 bytes

      const setupInstancedAttr = (attrLoc: number, size: number, offsetBytes: number) => {
        if (attrLoc < 0) return;
        gl.enableVertexAttribArray(attrLoc);
        gl.vertexAttribPointer(attrLoc, size, gl.FLOAT, false, stride, offsetBytes);
        ext.vertexAttribDivisorANGLE(attrLoc, 1);
      };

      setupInstancedAttr(locs.aViaCenter, 2, 0);       // a_via_center (vec2)
      setupInstancedAttr(locs.aViaRadii, 4, 8);        // a_via_radii (vec4)
      setupInstancedAttr(locs.aViaOuterColor, 4, 24);  // a_via_outer_color (vec4)
      setupInstancedAttr(locs.aViaDrillColor, 4, 40);  // a_via_drill_color (vec4)
      setupInstancedAttr(locs.aViaStrokeColor, 4, 56); // a_via_stroke_color (vec4)
      setupInstancedAttr(locs.aViaParams, 4, 72);      // a_via_params (vec4)

      // Uniforms
      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform2f(locs.uPan, pan.x, pan.y);
      gl.uniform1f(locs.uZoom, zoom);
      gl.uniform1f(locs.uRotation, (boardRotation * Math.PI) / 180);
      gl.uniform1f(locs.uDpr, dpr);

      // SINGLE DRAW CALL FOR ALL INSTANCED VIAS
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, instanceCount);
    },
    [pan.x, pan.y, zoom, boardRotation, instanceData]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
});

PcbWebGLVias.displayName = "PcbWebGLVias";
