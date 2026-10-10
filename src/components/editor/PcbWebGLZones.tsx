import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  PcbDoc,
  PcbZone,
  PcbLayerId,
  PcbLayer,
  getCopperLayerStandardColor,
  isCopperLayer,
  normalizeLayerId,
} from "@/lib/pcb";
import { isZoneVisible, isZoneOnLayer } from "@/lib/zoneGeometry";
import earcut from "earcut";
import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

export interface PcbWebGLZonesProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  selection: any;
  highlightedNetIds: number[];
}

// GLSL Shaders for Copper Zones
const ZONE_VERTEX_SHADER = `
attribute vec2 a_pos;
attribute vec4 a_color;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_rotation;
uniform float u_dpr;

varying vec4 v_color;

void main() {
  v_color = a_color;

  // Apply board rotation
  float cos_r = cos(u_rotation);
  float sin_r = sin(u_rotation);
  vec2 rotated_pos = vec2(
    cos_r * a_pos.x - sin_r * a_pos.y,
    sin_r * a_pos.x + cos_r * a_pos.y
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

const ZONE_FRAGMENT_SHADER = `
precision highp float;
varying vec4 v_color;

void main() {
  gl_FragColor = v_color;
}
`;

const colorCache = new Map<string, [number, number, number, number]>();

function parseColorFast(colorStr: string, defaultAlpha = 0.4): [number, number, number, number] {
  if (!colorStr) return [0.9, 0.2, 0.2, defaultAlpha];
  const key = `${colorStr}_${defaultAlpha}`;
  const cached = colorCache.get(key);
  if (cached) return cached;

  const str = colorStr.trim().toLowerCase();
  let result: [number, number, number, number] = [0.9, 0.2, 0.2, defaultAlpha];

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

// Synchronous fallback triangulation
function triangulateZoneSync(zone: PcbZone): number[] {
  if (!zone) return [];
  const allVertices: number[] = [];
  const polygonsToTriangulate = (zone.filledPolygons && Array.isArray(zone.filledPolygons) && zone.filledPolygons.length > 0)
    ? zone.filledPolygons
    : (zone.boundary ? [zone.boundary] : []);

  for (const poly of polygonsToTriangulate) {
    if (!poly || !poly.pts || !Array.isArray(poly.pts) || poly.pts.length < 3) continue;

    const flatCoords: number[] = [];
    for (const pt of poly.pts) {
      if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
        flatCoords.push(pt.x, pt.y);
      }
    }
    if (flatCoords.length < 6) continue;

    const holeIndices: number[] = [];
    let currentVertexIndex = flatCoords.length / 2;

    if (poly.holes && Array.isArray(poly.holes) && poly.holes.length > 0) {
      for (const hole of poly.holes) {
        if (!hole || !Array.isArray(hole) || hole.length < 3) continue;
        const validHolePts: { x: number; y: number }[] = [];
        for (const pt of hole) {
          if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
            validHolePts.push(pt);
          }
        }
        if (validHolePts.length < 3) continue;

        holeIndices.push(currentVertexIndex);
        for (const pt of validHolePts) {
          flatCoords.push(pt.x, pt.y);
        }
        currentVertexIndex += validHolePts.length;
      }
    }

    try {
      const triangles = earcut(flatCoords, holeIndices, 2);
      if (Array.isArray(triangles)) {
        for (const idx of triangles) {
          if (typeof idx === "number" && idx * 2 + 1 < flatCoords.length) {
            allVertices.push(flatCoords[idx * 2], flatCoords[idx * 2 + 1]);
          }
        }
      }
    } catch (err) {
      console.error("Sync triangulation error for zone:", err);
    }
  }

  return allVertices;
}

export const PcbWebGLZones: React.FC<PcbWebGLZonesProps> = React.memo(({
  pcb,
  pan,
  zoom,
  boardRotation,
  activeLayer,
  dimInactiveLayers,
  selection,
  highlightedNetIds,
}) => {
  const programRef = useRef<WebGLProgram | null>(null);
  const vboRef = useRef<WebGLBuffer | null>(null);
  /** Vertex array currently resident in vboRef (skip re-uploading unchanged data). */
  const uploadedRef = useRef<Float32Array | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Background Web Worker cache for completed triangulation results
  const [workerCache, setWorkerCache] = useState<Record<string, number[]>>({});

  const locationsRef = useRef<{
    aPos: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uPan: WebGLUniformLocation | null;
    uZoom: WebGLUniformLocation | null;
    uRotation: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);

  // 1. Initialize Web Worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL("./zoneTriangulationWorker.ts", import.meta.url),
        { type: "module" }
      );

      workerRef.current.onmessage = (e: MessageEvent<{ results?: Record<string, { vertices: number[] }> }>) => {
        if (!e || !e.data || !e.data.results) return;
        const { results } = e.data;
        const newCacheUpdates: Record<string, number[]> = {};
        for (const id in results) {
          if (results[id] && Array.isArray(results[id].vertices)) {
            newCacheUpdates[id] = results[id].vertices;
          }
        }
        setWorkerCache(prev => ({ ...prev, ...newCacheUpdates }));
      };
    } catch (err) {
      console.warn("Failed to initialize Web Worker for Zone Triangulation, running synchronous fallback only", err);
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // 2. Request Triangulation from background worker when PCB zones update
  //
  // A zone can be assigned to several layers at once (a shared ground-plane pour spanning
  // F.Cu + B.Cu + an inner layer, say), and KiCad computes a *separate* fill shape per layer
  // (clearances/thermal reliefs differ per layer) — each entry in filledPolygons already
  // carries its own `.layer`. Treating a zone like that as one combined shape, colored and
  // gated by only its first assigned layer, meant it always rendered in that one layer's
  // color and stayed visible as long as *any* of its layers was shown (e.g. a shared GND
  // pour always drawing top-copper red even while only B.Cu was visible). Split any zone
  // whose filledPolygons span more than one distinct layer into one synthetic per-layer
  // entry, so color/visibility/active-layer dimming are each evaluated against the specific
  // layer that entry's geometry actually belongs to. Zones with a single layer (the common
  // case) pass through unchanged.
  const expandedZones = useMemo(() => {
    const zones = pcb.zones || [];
    const out: (PcbZone & { originalId?: string })[] = [];
    for (const z of zones) {
      if (!z) continue;
      const fps = z.filledPolygons;
      const distinctLayers = fps && fps.length > 0 ? Array.from(new Set(fps.map((fp) => fp.layer))) : [];
      if (distinctLayers.length > 1) {
        for (const layerId of distinctLayers) {
          out.push({
            ...z,
            id: `${z.id}::${layerId}`,
            originalId: z.id,
            layer: layerId as PcbLayerId,
            layers: undefined,
            filledPolygons: fps!.filter((fp) => fp.layer === layerId),
          });
        }
      } else {
        out.push(z);
      }
    }
    return out;
  }, [pcb.zones]);

  useEffect(() => {
    const zones = expandedZones;
    if (!Array.isArray(zones) || zones.length === 0) return;

    // Filter zones that need triangulation (not already in our worker cache)
    const zonesToTriangulate = zones.filter(Boolean).map(z => ({
      id: z.id,
      layer: z.layer,
      isKeepout: !!z.isKeepout,
      boundary: z.boundary,
      filledPolygons: z.filledPolygons,
    }));

    if (zonesToTriangulate.length > 0) {
      workerRef.current?.postMessage({ zones: zonesToTriangulate });
    }
  }, [expandedZones]);

  // 4. Gather vertices and upload to GPU
  const vertexData = useMemo(() => {
    const zones = expandedZones;
    if (zones.length === 0) return new Float32Array(0);

    const layerMap = new Map<string, PcbLayer>();
    (pcb.layers || []).forEach((l) => layerMap.set(normalizeLayerId(l.id), l));

    const visibleLayersSet = new Set(
      (pcb.layers || []).filter((l) => l.visible).map((l) => l.id)
    );

    const dataList: number[] = [];

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!isZoneVisible(z, visibleLayersSet, pcb.layers)) continue;

      const layer = layerMap.get(normalizeLayerId(z.layer));
      const selId = (z as { originalId?: string }).originalId ?? z.id;
      const isZoneSel = selection?.kind === "zone" && selection.id === selId;
      const isZoneHi = z.netId !== undefined && highlightedNetIds.includes(z.netId);
      const normZoneLayer = normalizeLayerId(z.layer);
      const normActiveLayer = normalizeLayerId(activeLayer);
      const isActive = !dimInactiveLayers || normZoneLayer === normActiveLayer || (z.layers && z.layers.map(normalizeLayerId).includes(normActiveLayer));

      // Retrieve triangulated vertices (Worker cache fallback to synchronous compilation)
      let vertices = workerCache[z.id];
      if (!vertices) {
        vertices = triangulateZoneSync(z);
      }

      if (!vertices || vertices.length === 0) continue;

      // Determine appropriate rendering colors
      let baseColorHex = layer?.color || getCopperLayerStandardColor(normZoneLayer);
      let baseAlpha = z.isKeepout ? 0.12 : 0.38;

      if (isZoneSel) {
        baseColorHex = "#3b82f6"; // Blue selection outline glow
        baseAlpha = 0.55;
      } else if (isZoneHi) {
        baseColorHex = "#ea580c"; // Orange highlighted net
        baseAlpha = 0.5;
      }

      const [r, g, b, origA] = parseColorFast(baseColorHex, baseAlpha);
      const a = isActive ? origA : origA * 0.22;

      // Pack [x, y, r, g, b, a] for each vertex
      for (let j = 0; j < vertices.length; j += 2) {
        dataList.push(vertices[j], vertices[j + 1], r, g, b, a);
      }
    }

    return new Float32Array(dataList);
  }, [expandedZones, pcb.layers, workerCache, selection, highlightedNetIds, activeLayer, dimInactiveLayers]);


  // 3 + 5. Register the zone pass on the unified PCB canvas
  usePcbGLPass(
    "zones",
    PCB_GL_PASS_ORDER.zones,
    // ---- init: compile shaders on the shared context
    (gl) => {
      const compileShader = (type: number, src: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Zone shader compile error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vert = compileShader(gl.VERTEX_SHADER, ZONE_VERTEX_SHADER);
      const frag = compileShader(gl.FRAGMENT_SHADER, ZONE_FRAGMENT_SHADER);
      if (!vert || !frag) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Zone program link error:", gl.getProgramInfoLog(program));
        return;
      }

      programRef.current = program;

      const vbo = gl.createBuffer();
      vboRef.current = vbo;
      uploadedRef.current = null;

      locationsRef.current = {
        aPos: gl.getAttribLocation(program, "a_pos"),
        aColor: gl.getAttribLocation(program, "a_color"),
        uResolution: gl.getUniformLocation(program, "u_resolution"),
        uPan: gl.getUniformLocation(program, "u_pan"),
        uZoom: gl.getUniformLocation(program, "u_zoom"),
        uRotation: gl.getUniformLocation(program, "u_rotation"),
        uDpr: gl.getUniformLocation(program, "u_dpr"),
      };

      return () => {
        if (vbo) gl.deleteBuffer(vbo);
        gl.deleteProgram(program);
        gl.deleteShader(vert);
        gl.deleteShader(frag);
        programRef.current = null;
        vboRef.current = null;
        locationsRef.current = null;
      };
    },
    // ---- draw
    (frame) => {
      const { gl, physW, physH, dpr } = frame;
      const program = programRef.current;
      const vbo = vboRef.current;
      const locs = locationsRef.current;
      if (!program || !vbo || !locs) return;

      const vertexCount = vertexData.length / 6;
      if (vertexCount === 0) return;

      gl.useProgram(program);

      // Alpha blending for semi-transparent zone sheets
      pcbGLEnableStandardBlend(gl);

      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      if (uploadedRef.current !== vertexData) {
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
        uploadedRef.current = vertexData;
      }

      const stride = 6 * 4; // 6 floats * 4 bytes = 24 bytes

      // a_pos: floats index 0, size 2
      gl.enableVertexAttribArray(locs.aPos);
      gl.vertexAttribPointer(locs.aPos, 2, gl.FLOAT, false, stride, 0);

      // a_color: floats index 2, size 4
      gl.enableVertexAttribArray(locs.aColor);
      gl.vertexAttribPointer(locs.aColor, 4, gl.FLOAT, false, stride, 2 * 4);

      // Uniforms
      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform2f(locs.uPan, pan.x, pan.y);
      gl.uniform1f(locs.uZoom, zoom);
      gl.uniform1f(locs.uRotation, (boardRotation * Math.PI) / 180);
      gl.uniform1f(locs.uDpr, dpr);

      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    },
    [pan.x, pan.y, zoom, boardRotation, vertexData]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
});

PcbWebGLZones.displayName = "PcbWebGLZones";
