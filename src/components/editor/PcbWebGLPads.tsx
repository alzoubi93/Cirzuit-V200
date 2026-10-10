import React, { useRef, useMemo } from "react";
import {
  PcbDoc,
  PcbPad,
  PcbFootprint,
  PcbLayerId,
  isCopperLayer,
  getCopperLayerStandardColor,
  normalizeLayerId,
} from "@/lib/pcb";
import {
  createFootprintAffineMatrix,
  applyAffineMatrix,
  AffineMatrix2D,
} from "@/lib/pcbFootprintSceneGraph";
import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

export interface PcbWebGLPadsProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  selectedId: string | null;
  selection: any;
  groupSelected: { footprints: string[]; tracks: string[]; vias: string[]; pads: string[] } | null;
  highlightedNetIds?: number[];
}

// ============================================================================
// GLSL Vertex Shader: Instanced Quad Template with Pad Instance Attributes
// ============================================================================
const PAD_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-1, 1] Master Unit Quad Template

// Instanced Attributes per Pad
attribute vec2 a_pad_pos;          // [X, Y] Center in mm (World coordinates)
attribute float a_pad_rot;         // Rotation angle in radians
attribute vec4 a_pad_type_params;  // [Type (0=Circle, 1=Rect, 2=RoundedRect, 3=Oval, 4=Chamfer), Size_X, Size_Y, Corner_Radius]
attribute vec4 a_pad_layer_drill;  // [Layer_ID (0=Top, 1=Bottom, 2=Multi), Drill_Dia, Drill_OffX, Drill_OffY]
attribute vec4 a_pad_color;        // RGBA Base Copper / Plating Color
attribute vec4 a_pad_drill_color;  // RGBA Drill Hole Color
attribute vec4 a_pad_flags;        // [Is_Selected, Is_Net_Highlighted, Dim_Alpha, Solder_Mask_Clearance]

// Global Camera Uniforms
uniform vec2 u_resolution; // (w * dpr, h * dpr)
uniform vec2 u_pan;        // pan in CSS pixels (x, y)
uniform float u_zoom;      // zoom factor
uniform float u_rotation;  // board rotation in radians
uniform float u_dpr;       // device pixel ratio

// Varyings to Fragment Shader
varying vec2 v_local_pos;          // Local mm coordinates relative to pad center
varying vec4 v_type_params;        // [Type, Size_X, Size_Y, Corner_Radius]
varying vec4 v_layer_drill;        // [Layer_ID, Drill_Dia, Drill_OffX, Drill_OffY]
varying vec4 v_color;
varying vec4 v_drill_color;
varying vec4 v_flags;

void main() {
  v_type_params = a_pad_type_params;
  v_layer_drill = a_pad_layer_drill;
  v_color = a_pad_color;
  v_drill_color = a_pad_drill_color;
  v_flags = a_pad_flags;

  float sizeX = a_pad_type_params.y;
  float sizeY = a_pad_type_params.z;
  float halfW = sizeX * 0.5;
  float halfH = sizeY * 0.5;

  float isSel = a_pad_flags.x;
  float haloWidth = isSel > 0.5 ? 0.65 : 0.25;

  // Sub-pixel anti-aliasing margin
  float pixelSizeMm = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aaMargin = max(pixelSizeMm * 2.5, 0.15);

  float quadHalfW = halfW + haloWidth + aaMargin;
  float quadHalfH = halfH + haloWidth + aaMargin;

  // Expand unit quad to physical pad size
  vec2 local_mm = vec2(a_quad_pos.x * quadHalfW, a_quad_pos.y * quadHalfH);
  v_local_pos = local_mm;

  // Rotate local vertex by pad's rotation angle
  float cos_p = cos(a_pad_rot);
  float sin_p = sin(a_pad_rot);
  vec2 rotated_local = vec2(
    cos_p * local_mm.x - sin_p * local_mm.y,
    sin_p * local_mm.x + cos_p * local_mm.y
  );

  // Pad World Position
  vec2 world_pos = a_pad_pos + rotated_local;

  // Apply Global Board Rotation
  float cos_b = cos(u_rotation);
  float sin_b = sin(u_rotation);
  vec2 rotated_board = vec2(
    cos_b * world_pos.x - sin_b * world_pos.y,
    sin_b * world_pos.x + cos_b * world_pos.y
  );

  // Screen CSS coordinates
  vec2 screen_coord = u_pan + u_zoom * rotated_board;

  // Convert to WebGL NDC [-1, 1]
  vec2 clip_pos = vec2(
    (screen_coord.x * u_dpr / u_resolution.x) * 2.0 - 1.0,
    1.0 - (screen_coord.y * u_dpr / u_resolution.y) * 2.0
  );

  gl_Position = vec4(clip_pos, 0.0, 1.0);
}
`;

// ============================================================================
// GLSL Fragment Shader: Specialized Signed Distance Field (SDF) Rendering
// ============================================================================
const PAD_FRAGMENT_SHADER = `
precision highp float;

uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_local_pos;          // mm from pad center
varying vec4 v_type_params;        // [Type, Size_X, Size_Y, Corner_Radius]
varying vec4 v_layer_drill;        // [Layer_ID, Drill_Dia, Drill_OffX, Drill_OffY]
varying vec4 v_color;
varying vec4 v_drill_color;
varying vec4 v_flags;              // [Is_Selected, Is_Net_Highlighted, Dim_Alpha, Solder_Mask_Clearance]

// 2D Signed Distance to Circle
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// 2D Signed Distance to Rounded Box (IPC-7351 / Modern Standard)
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// 2D Signed Distance to Chamfered Box
float sdChamferBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b;
  float d_box = max(q.x, q.y);
  float d_chamf = (q.x + q.y + r) * 0.70710678;
  return max(d_box, d_chamf);
}

void main() {
  // Screen-space subpixel anti-aliasing delta
  float pixelSize = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aa = pixelSize * 1.5;

  float padType = v_type_params.x;
  float halfW = v_type_params.y * 0.5;
  float halfH = v_type_params.z * 0.5;
  float cornerR = v_type_params.w;

  float d_pad = 0.0;

  // Evaluate exact mathematical SDF based on Pad Type
  if (padType < 0.5) {
    // Type 0: Circular Pad
    float r = min(halfW, halfH);
    d_pad = sdCircle(v_local_pos, r);
  } else if (padType > 0.5 && padType < 1.5) {
    // Type 1: Sharp Rectangular Pad (with microscopic epsilon rounding for subpixel AA)
    d_pad = sdRoundBox(v_local_pos, vec2(halfW, halfH), 0.02);
  } else if (padType > 1.5 && padType < 2.5) {
    // Type 2: Rounded Rectangle (Modern standard, cornerR clamped safely)
    float maxR = min(halfW, halfH) * 0.5;
    float r = clamp(cornerR, 0.05, maxR);
    d_pad = sdRoundBox(v_local_pos, vec2(halfW, halfH), r);
  } else if (padType > 2.5 && padType < 3.5) {
    // Type 3: Oval / Oblong Pad
    float r = min(halfW, halfH);
    d_pad = sdRoundBox(v_local_pos, vec2(halfW, halfH), r);
  } else {
    // Type 4: Chamfered Rectangle Pad
    float chamfR = clamp(cornerR, 0.05, min(halfW, halfH) * 0.5);
    d_pad = sdChamferBox(v_local_pos, vec2(halfW, halfH), chamfR);
  }

  float isSel = v_flags.x;
  float isNetHigh = v_flags.y;
  float dimAlpha = v_flags.z;

  // Selection & Net Highlight Halos
  float haloWidth = (isSel > 0.5 || isNetHigh > 0.5) ? 0.35 : 0.0;
  vec4 haloColor = isSel > 0.5 ? vec4(0.23, 0.51, 0.96, 0.9) : vec4(0.96, 0.62, 0.07, 0.9);

  // Subpixel smooth anti-aliasing
  float padAlpha = 1.0 - smoothstep(-aa, aa, d_pad);
  float haloAlpha = (haloWidth > 0.0) ? (1.0 - smoothstep(haloWidth - aa, haloWidth + aa, d_pad)) : 0.0;

  if (padAlpha <= 0.0 && haloAlpha <= 0.0) {
    discard;
  }

  // Base copper / gold plating finish
  vec4 padColor = v_color;

  // Subtle metallic surface gradient for realistic visual depth
  float surfaceShading = 1.0 - 0.06 * (v_local_pos.y / max(halfH, 0.1));
  padColor.rgb *= clamp(surfaceShading, 0.92, 1.08);

  padColor.a *= dimAlpha;

  vec4 finalCol = padColor;
  if (haloAlpha > 0.0 && padAlpha < 1.0) {
    finalCol = mix(haloColor, padColor, padAlpha);
  }

  // Drill Hole (Through-Hole Technology / THT Pad)
  float drillDia = v_layer_drill.y;
  if (drillDia > 0.0) {
    float drillR = drillDia * 0.5;
    vec2 drillCenter = v_local_pos - v_layer_drill.zw;
    float d_drill = sdCircle(drillCenter, drillR);
    float drillAlpha = 1.0 - smoothstep(-aa, aa, d_drill);

    if (drillAlpha > 0.0) {
      // Internal hole shading (Dark charcoal interior with metallic ring depth)
      vec4 holeCol = v_drill_color;
      
      // Inner rim highlight
      float innerRim = 1.0 - smoothstep(0.0, aa * 2.0, abs(d_drill));
      holeCol.rgb += vec3(0.2, 0.22, 0.25) * innerRim * 0.4;

      finalCol = mix(finalCol, holeCol, drillAlpha);
    }
  }

  gl_FragColor = finalCol;
}
`;

const EMPTY_PAD_BUILD: { padData: Float32Array | null; activeCount: number } = { padData: null, activeCount: 0 };

export const PcbWebGLPads: React.FC<PcbWebGLPadsProps> = ({
  pcb,
  pan,
  zoom,
  boardRotation,
  activeLayer,
  dimInactiveLayers,
  selectedId,
  selection,
  groupSelected,
  highlightedNetIds = [],
}) => {
  const programRef = useRef<WebGLProgram | null>(null);

  const quadBufferRef = useRef<WebGLBuffer | null>(null);
  const instanceBufferRef = useRef<WebGLBuffer | null>(null);
  /** Instance array currently resident in instanceBufferRef (skip re-uploading unchanged data). */
  const uploadedRef = useRef<Float32Array | null>(null);

  // Instance data. Independent of pan / zoom / cursor, so it is rebuilt ONLY when the pads
  // (or their selection / net / layer state) change — not on every frame of the shared canvas.
  const padBuild = useMemo<{ padData: Float32Array | null; activeCount: number }>(() => {
    const layerMap = new Map((pcb.layers || []).map((l) => [normalizeLayerId(l.id), l]));
    const drillLayer = layerMap.get("drill");
    const isDrillVisible = drillLayer?.visible !== false;
    const drillHexCol = drillLayer?.color || "#000000";
    const drillR = parseInt(drillHexCol.slice(1, 3), 16) / 255;
    const drillG = parseInt(drillHexCol.slice(3, 5), 16) / 255;
    const drillB = parseInt(drillHexCol.slice(5, 7), 16) / 255;

    // ------------------------------------------------------------------------
    // Pack Instanced Pad Attributes
    // ------------------------------------------------------------------------
    // Attribute layout per instance:
    // a_pad_pos:          vec2 (2 floats) [X, Y]
    // a_pad_rot:          float (1 float)  Rotation Rad
    // a_pad_type_params:  vec4 (4 floats) [Type, Size_X, Size_Y, Corner_Radius]
    // a_pad_layer_drill:  vec4 (4 floats) [Layer_ID, Drill_Dia, Drill_OffX, Drill_OffY]
    // a_pad_color:        vec4 (4 floats) RGBA
    // a_pad_drill_color:  vec4 (4 floats) RGBA
    // a_pad_flags:        vec4 (4 floats) [Is_Selected, Is_Net_Highlighted, Dim_Alpha, Solder_Mask_Clearance]
    // Total: 23 floats per instance
    const FLOATS_PER_PAD = 23;

    let padCountEstimate = (pcb.pads?.length || 0);
    (pcb.footprints || []).forEach(fp => {
      if (!fp) return;
      padCountEstimate += (fp.nativeKicadFootprint?.pads?.length || fp.pads?.length || 0);
    });

    if (padCountEstimate === 0) return EMPTY_PAD_BUILD;

    const padData = new Float32Array(padCountEstimate * FLOATS_PER_PAD);
    let offset = 0;

    const groupFps = groupSelected?.footprints || [];
    const groupPads = groupSelected?.pads || [];

    // 1. Pack Standalone Board Pads (`pcb.pads`)
    // Gerber flashes are rendered using their parsed physical dimensions. We do
    // not shrink pads to create artificial visual gaps, because that can misstate
    // the actual copper geometry/connectivity. If flashes touch/overlap in the
    // source Gerber, the viewer faithfully shows that; separated source flashes
    // remain separated after parsing.
    if (pcb.pads && pcb.pads.length > 0) {
      for (const pad of pcb.pads) {
        if (!pad) continue;
        const padX = typeof pad.x === "number" ? pad.x : 0;
        const padY = typeof pad.y === "number" ? pad.y : 0;
        const rawPadW = typeof pad.width === "number" ? pad.width : 1.0;
        const rawPadH = typeof pad.height === "number" ? pad.height : 1.0;
        const padW = rawPadW;
        const padH = rawPadH;

        const padLayer = normalizeLayerId(pad.layer || "top_copper");
        const isLayerVis = layerMap.get(padLayer)?.visible !== false;
        if (!isLayerVis) continue;

        const isPadActive = !dimInactiveLayers || padLayer === normalizeLayerId(activeLayer);
        const dimAlpha = isPadActive ? 1.0 : 0.25;

        const isPadSel = (selectedId === pad.id) || (selection?.id === pad.id) || groupPads.includes(pad.id) ? 1.0 : 0.0;
        const isNetHigh = pad.netId !== undefined && highlightedNetIds.includes(pad.netId) ? 1.0 : 0.0;

        const hexCol = layerMap.get(padLayer)?.color || getCopperLayerStandardColor(padLayer);
        const r = parseInt(hexCol.slice(1, 3), 16) / 255;
        const g = parseInt(hexCol.slice(3, 5), 16) / 255;
        const b = parseInt(hexCol.slice(5, 7), 16) / 255;

        const padType = pad.shape === "circle" ? 0.0 : pad.shape === "oval" ? 3.0 : 1.0; // 0=Circle, 1=Rect, 3=Oval

        // a_pad_pos
        padData[offset++] = padX;
        padData[offset++] = padY;

        // a_pad_rot
        padData[offset++] = 0.0;

        // a_pad_type_params
        padData[offset++] = padType;
        padData[offset++] = padW;
        padData[offset++] = padH;
        padData[offset++] = 0.0; // corner radius

        // a_pad_layer_drill
        padData[offset++] = padLayer === "top_copper" ? 0.0 : 1.0;
        padData[offset++] = isDrillVisible ? (pad.drill || 0.0) : 0.0;
        padData[offset++] = 0.0;
        padData[offset++] = 0.0;

        // a_pad_color
        padData[offset++] = r;
        padData[offset++] = g;
        padData[offset++] = b;
        padData[offset++] = 1.0;

        // a_pad_drill_color
        padData[offset++] = drillR;
        padData[offset++] = drillG;
        padData[offset++] = drillB;
        padData[offset++] = 1.0;

        // a_pad_flags
        padData[offset++] = isPadSel;
        padData[offset++] = isNetHigh;
        padData[offset++] = dimAlpha;
        padData[offset++] = 0.0;
      }
    }

    // 2. Pack Footprint Child Pads (both KiCad Native & Synthetic Footprints)
    if (pcb.footprints && pcb.footprints.length > 0) {
      for (const fp of pcb.footprints) {
        if (!fp) continue;
        // KiCad-native footprints (imported or generated) are drawn — pads, drills, numbers and
        // selection halos — by the footprint pass from the shared render model.
        if (fp.nativeKicadFootprint) continue;
        const isParentFlipped = fp.nativeKicadFootprint?.layer === "B.Cu" || false;
        const parentMat = createFootprintAffineMatrix(fp.x, fp.y, fp.rotation || 0, isParentFlipped);
        const parentSel = (selectedId === fp.id) || groupFps.includes(fp.id) ? 1.0 : 0.0;

        const native = fp.nativeKicadFootprint;
        if (native && Array.isArray(native.pads)) {
          // Native KiCad Footprint Pads
          for (let idx = 0; idx < native.pads.length; idx++) {
            const pad = native.pads[idx];
            const isMultiLayer = pad.layers?.includes("*.Cu") || pad.type === "thru_hole" || pad.type === "np_thru_hole" || (pad.drill !== undefined && pad.drill > 0);
            const padLayer: PcbLayerId = isMultiLayer 
              ? normalizeLayerId(activeLayer) 
              : normalizeLayerId((pad.layers?.includes("B.Cu") && !pad.layers?.includes("F.Cu")) ? "bottom_copper" : "top_copper");

            const isLayerVis = isMultiLayer || layerMap.get(padLayer)?.visible !== false;
            if (!isLayerVis) continue;

            const isPadActive = !dimInactiveLayers || isMultiLayer || padLayer === normalizeLayerId(activeLayer);
            const dimAlpha = isPadActive ? 1.0 : 0.25;

            const padId = `${fp.id}_pad_${pad.number || idx}`;
            const isPadSel = parentSel > 0.5 || (selection?.kind === "pad" && selection.id === padId) || groupPads.includes(padId) ? 1.0 : 0.0;
            const netId = fp.pads?.[idx]?.netId;
            const isNetHigh = netId !== undefined && highlightedNetIds.includes(netId) ? 1.0 : 0.0;

            const hexCol = layerMap.get(padLayer)?.color || getCopperLayerStandardColor(padLayer);
            const r = parseInt(hexCol.slice(1, 3), 16) / 255;
            const g = parseInt(hexCol.slice(3, 5), 16) / 255;
            const b = parseInt(hexCol.slice(5, 7), 16) / 255;

            // Transform local center (lx, ly) to world space using Parent Matrix
            const lx = pad.position?.x ?? 0;
            const ly = pad.position?.y ?? 0;
            const worldPos = applyAffineMatrix(parentMat, lx, ly);

            // Calculate total rotation
            const totalRotRad = ((fp.rotation || 0) + (pad.rotation || 0)) * (Math.PI / 180);

            // Shape Mapping: 0=Circle, 1=Rect, 2=RoundedRect, 3=Oval, 4=Chamfer
            let shapeType = 1.0;
            const s = (pad.shape || "").toLowerCase();
            if (s === "circle" || s === "oval_circle") shapeType = 0.0;
            else if (s === "roundrect") shapeType = 2.0;
            else if (s === "oval") shapeType = 3.0;
            else if (s === "chamfered_rect" || s === "chamferrect") shapeType = 4.0;
            else shapeType = 1.0;

            const w = pad.size?.x ?? 1.5;
            const h = pad.size?.y ?? 1.5;
            const cornerR = (pad.roundrectRatio || 0.25) * Math.min(w, h);

            // a_pad_pos
            padData[offset++] = worldPos.x;
            padData[offset++] = worldPos.y;

            // a_pad_rot
            padData[offset++] = totalRotRad;

            // a_pad_type_params
            padData[offset++] = shapeType;
            padData[offset++] = w;
            padData[offset++] = h;
            padData[offset++] = cornerR;

            // a_pad_layer_drill
            padData[offset++] = isMultiLayer ? 2.0 : (padLayer === "top_copper" ? 0.0 : 1.0);
            padData[offset++] = isDrillVisible ? (pad.drill || 0.0) : 0.0;
            padData[offset++] = pad.drillX || 0.0;
            padData[offset++] = pad.drillY || 0.0;

            // a_pad_color
            padData[offset++] = r;
            padData[offset++] = g;
            padData[offset++] = b;
            padData[offset++] = 1.0;

            // a_pad_drill_color
            padData[offset++] = drillR;
            padData[offset++] = drillG;
            padData[offset++] = drillB;
            padData[offset++] = 1.0;

            // a_pad_flags
            padData[offset++] = isPadSel;
            padData[offset++] = isNetHigh;
            padData[offset++] = dimAlpha;
            padData[offset++] = 0.0;
          }
        } else if (Array.isArray(fp.pads)) {
          // Standard / Synthetic Footprint Pads
          for (let idx = 0; idx < fp.pads.length; idx++) {
            const pad = fp.pads[idx];
            if (!pad) continue;
            const padX = typeof pad.x === "number" ? pad.x : 0;
            const padY = typeof pad.y === "number" ? pad.y : 0;
            const padW = typeof pad.width === "number" ? pad.width : 1.0;
            const padH = typeof pad.height === "number" ? pad.height : 1.0;

            const isMultiLayer = pad.layer === "multi_layer";
            const padLayer: PcbLayerId = isMultiLayer 
              ? normalizeLayerId(activeLayer) 
              : normalizeLayerId(pad.layer || (isParentFlipped ? "bottom_copper" : "top_copper"));

            const isLayerVis = isMultiLayer || layerMap.get(padLayer)?.visible !== false;
            if (!isLayerVis) continue;

            const isPadActive = !dimInactiveLayers || isMultiLayer || padLayer === normalizeLayerId(activeLayer);
            const dimAlpha = isPadActive ? 1.0 : 0.25;

            const padId = `${fp.id}_pad_${idx}`;
            const isPadSel = parentSel > 0.5 || (selection?.kind === "pad" && selection.id === padId) || groupPads.includes(padId) ? 1.0 : 0.0;
            const isNetHigh = pad.netId !== undefined && highlightedNetIds.includes(pad.netId) ? 1.0 : 0.0;

            const hexCol = layerMap.get(padLayer)?.color || getCopperLayerStandardColor(padLayer);
            const r = parseInt(hexCol.slice(1, 3), 16) / 255;
            const g = parseInt(hexCol.slice(3, 5), 16) / 255;
            const b = parseInt(hexCol.slice(5, 7), 16) / 255;

            const worldPos = applyAffineMatrix(parentMat, padX, padY);
            const totalRotRad = ((fp.rotation || 0) + (pad.rotation || 0)) * (Math.PI / 180);

            let shapeType = pad.shape === "circle" ? 0.0 : 1.0;
            if (pad.roundrectRatio && pad.roundrectRatio > 0) shapeType = 2.0;

            const w = padW;
            const h = padH;
            const cornerR = (pad.roundrectRatio || 0.25) * Math.min(w, h);

            // a_pad_pos
            padData[offset++] = worldPos.x;
            padData[offset++] = worldPos.y;

            // a_pad_rot
            padData[offset++] = totalRotRad;

            // a_pad_type_params
            padData[offset++] = shapeType;
            padData[offset++] = w;
            padData[offset++] = h;
            padData[offset++] = cornerR;

            // a_pad_layer_drill
            padData[offset++] = isMultiLayer ? 2.0 : (padLayer === "top_copper" ? 0.0 : 1.0);
            padData[offset++] = isDrillVisible ? (pad.drill || 0.0) : 0.0;
            padData[offset++] = pad.drillX || 0.0;
            padData[offset++] = pad.drillY || 0.0;

            // a_pad_color
            padData[offset++] = r;
            padData[offset++] = g;
            padData[offset++] = b;
            padData[offset++] = 1.0;

            // a_pad_drill_color
            padData[offset++] = drillR;
            padData[offset++] = drillG;
            padData[offset++] = drillB;
            padData[offset++] = 1.0;

            // a_pad_flags
            padData[offset++] = isPadSel;
            padData[offset++] = isNetHigh;
            padData[offset++] = dimAlpha;
            padData[offset++] = 0.0;
          }
        }
      }
    }

    const activeCount = offset / FLOATS_PER_PAD;
    if (activeCount === 0) return EMPTY_PAD_BUILD;
    return { padData: padData.subarray(0, offset), activeCount };

  }, [
    pcb.pads,
    pcb.footprints,
    pcb.layers,
    activeLayer,
    dimInactiveLayers,
    selectedId,
    selection?.id,
    selection?.kind,
    groupSelected?.footprints?.join(","),
    groupSelected?.pads?.join(","),
    highlightedNetIds?.join(","),
  ]);

  // Register the pad pass on the unified PCB canvas
  usePcbGLPass(
    "pads",
    PCB_GL_PASS_ORDER.pads,
    // ---- init: compile shaders / create buffers on the shared context
    (gl) => {
      const compileShader = (type: number, source: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Pads WebGL shader compile error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vs = compileShader(gl.VERTEX_SHADER, PAD_VERTEX_SHADER);
      const fs = compileShader(gl.FRAGMENT_SHADER, PAD_FRAGMENT_SHADER);
      if (!vs || !fs) return;

      const prog = gl.createProgram();
      if (!prog) return;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Pads WebGL program link error:", gl.getProgramInfoLog(prog));
        return;
      }
      programRef.current = prog;

      // Master Quad Template [-1, 1]
      const quadVertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);

      const qBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
      quadBufferRef.current = qBuf;

      const iBuf = gl.createBuffer();
      instanceBufferRef.current = iBuf;
      uploadedRef.current = null;

      return () => {
        if (qBuf) gl.deleteBuffer(qBuf);
        if (iBuf) gl.deleteBuffer(iBuf);
        if (prog) gl.deleteProgram(prog);
        programRef.current = null;
        quadBufferRef.current = null;
        instanceBufferRef.current = null;
        uploadedRef.current = null;
      };
    },
    // ---- draw: all pads in ONE instanced draw call
    (frame) => {
      const { gl, ext, physW: w, physH: h, dpr } = frame;
      const prog = programRef.current;
      if (!prog || !quadBufferRef.current || !instanceBufferRef.current) return;

      const { padData, activeCount } = padBuild;
      if (!padData || activeCount === 0) return;

      const FLOATS_PER_PAD = 23;

      gl.useProgram(prog);
      pcbGLEnableStandardBlend(gl);

      // Upload Instanced Pad Buffer (only when the data actually changed)
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBufferRef.current);
      if (uploadedRef.current !== padData) {
        gl.bufferData(gl.ARRAY_BUFFER, padData, gl.DYNAMIC_DRAW);
        uploadedRef.current = padData;
      }

      // Camera Uniforms
      gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), w, h);
      gl.uniform2f(gl.getUniformLocation(prog, "u_pan"), pan.x, pan.y);
      gl.uniform1f(gl.getUniformLocation(prog, "u_zoom"), zoom);
      gl.uniform1f(gl.getUniformLocation(prog, "u_rotation"), (boardRotation * Math.PI) / 180);
      gl.uniform1f(gl.getUniformLocation(prog, "u_dpr"), dpr);

      // Bind Master Unit Quad
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBufferRef.current);
      const locQuad = gl.getAttribLocation(prog, "a_quad_pos");
      gl.enableVertexAttribArray(locQuad);
      gl.vertexAttribPointer(locQuad, 2, gl.FLOAT, false, 0, 0);

      // Bind Instanced Attributes
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBufferRef.current);
      const stride = FLOATS_PER_PAD * 4;

      const locPos = gl.getAttribLocation(prog, "a_pad_pos");
      const locRot = gl.getAttribLocation(prog, "a_pad_rot");
      const locType = gl.getAttribLocation(prog, "a_pad_type_params");
      const locDrill = gl.getAttribLocation(prog, "a_pad_layer_drill");
      const locCol = gl.getAttribLocation(prog, "a_pad_color");
      const locDrillCol = gl.getAttribLocation(prog, "a_pad_drill_color");
      const locFlags = gl.getAttribLocation(prog, "a_pad_flags");

      const setupInstancedAttr = (loc: number, size: number, floatOff: number) => {
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, floatOff * 4);
          ext.vertexAttribDivisorANGLE(loc, 1);
        }
      };

      setupInstancedAttr(locPos, 2, 0);
      setupInstancedAttr(locRot, 1, 2);
      setupInstancedAttr(locType, 4, 3);
      setupInstancedAttr(locDrill, 4, 7);
      setupInstancedAttr(locCol, 4, 11);
      setupInstancedAttr(locDrillCol, 4, 15);
      setupInstancedAttr(locFlags, 4, 19);

      // Single Draw Call for all Pads on the entire Board
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, activeCount);
    },
    [padBuild, pan.x, pan.y, zoom, boardRotation]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
};
