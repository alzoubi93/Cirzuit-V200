import React, { useRef, useMemo } from "react";
import {
  PcbDoc,
  PcbLayerId,
  PcbFootprint,
} from "@/lib/pcb";
import {
  getOrCreateFontAtlas,
  layoutSdfText,
  WebGLTextQuad,
  FontAtlasData,
} from "@/lib/webglTextSdf";
import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

/**
 * The text shaders are written in GLSL ES 1.00 and rely on OES_standard_derivatives (fwidth). On the
 * unified stage's WebGL2 context that extension does not exist, so the same sources are translated
 * to GLSL ES 3.00 (where derivatives are core).
 */
function toEssl300(vsSrc: string, fsSrc: string): { vs: string; fs: string } {
  const vs = "#version 300 es\n" + vsSrc.trim().replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out");
  let fs = fsSrc.trim()
    .replace(/^#extension[^\n]*\n/m, "")
    .replace(/\bvarying\b/g, "in")
    .replace(/\btexture2D\(/g, "texture(")
    .replace(/\bgl_FragColor\b/g, "outColor");
  fs = fs.replace(/(precision\s+\w+\s+float\s*;)/, "$1\nout vec4 outColor;");
  return { vs: "#version 300 es\n" + vs.slice("#version 300 es\n".length), fs: "#version 300 es\n" + fs };
}

export interface PcbWebGLTextProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  selectedId: string | null;
  selection: any;
  groupSelected: { footprints: string[]; tracks: string[]; vias: string[]; pads: string[]; texts?: string[] } | null;
}

const TEXT_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-0.5, 0.5] unit quad

// Instanced Character Quad Attributes
attribute vec4 a_pos_size;       // (world_x, world_y, width_mm, height_mm)
attribute vec4 a_uv_bounds;      // (u0, v0, u1, v1)
attribute float a_rotation;      // character rotation radians
attribute vec4 a_color;          // RGBA
attribute vec4 a_halo_color;     // RGBA halo
attribute vec4 a_props;          // (dimAlpha, isSelected, unused, unused)

// Global Uniforms
uniform vec2 u_resolution; // (w * dpr, h * dpr)
uniform vec2 u_pan;        // pan in CSS pixels (x, y)
uniform float u_zoom;      // zoom factor
uniform float u_rotation;  // board rotation in radians
uniform float u_dpr;       // device pixel ratio

varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_halo_color;
varying vec4 v_props;

void main() {
  v_color = a_color;
  v_halo_color = a_halo_color;
  v_props = a_props;

  // 1. Calculate UV mapping from unit quad [-0.5, 0.5] to [u0, v0, u1, v1]
  vec2 uv_norm = a_quad_pos + vec2(0.5, 0.5);
  v_uv = vec2(
    mix(a_uv_bounds.x, a_uv_bounds.z, uv_norm.x),
    mix(a_uv_bounds.y, a_uv_bounds.w, uv_norm.y)
  );

  // 2. Character quad vertex in character local space
  float cos_ch = cos(a_rotation);
  float sin_ch = sin(a_rotation);
  vec2 local_char_offset = vec2(
    a_quad_pos.x * a_pos_size.z,
    a_quad_pos.y * a_pos_size.w
  );

  vec2 char_rotated = vec2(
    cos_ch * local_char_offset.x - sin_ch * local_char_offset.y,
    sin_ch * local_char_offset.x + cos_ch * local_char_offset.y
  );

  vec2 world_pos = a_pos_size.xy + char_rotated;

  // 3. Board rotation & camera transform
  float cos_b = cos(u_rotation);
  float sin_b = sin(u_rotation);
  vec2 board_rotated = vec2(
    cos_b * world_pos.x - sin_b * world_pos.y,
    sin_b * world_pos.x + cos_b * world_pos.y
  );

  vec2 screen_coord = u_pan + u_zoom * board_rotated;

  // Convert to WebGL NDC [-1, 1]
  vec2 clip_pos = vec2(
    (screen_coord.x * u_dpr / u_resolution.x) * 2.0 - 1.0,
    1.0 - (screen_coord.y * u_dpr / u_resolution.y) * 2.0
  );

  gl_Position = vec4(clip_pos, 0.0, 1.0);
}
`;

const TEXT_FRAGMENT_SHADER = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D u_font_atlas;
uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_halo_color;
varying vec4 v_props; // (dimAlpha, isSelected, unused, unused)

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec4 texel = texture2D(u_font_atlas, v_uv);

  float boldnessOffset = v_props.z;

  // MSDF: median distance from RGB
  float sigDist = texel.a - 0.5 + (boldnessOffset * 0.5);

  // Resolution-independent screen-space edge filtering (smoothstep with fwidth)
  vec2 unitRange = vec2(8.0) / vec2(1024.0);
  vec2 screenTexSize = vec2(1.0) / max(fwidth(v_uv), vec2(0.000001));
  float screenPxRange = max(0.5 * (unitRange.x * screenTexSize.x + unitRange.y * screenTexSize.y), 1.0);
  float pxDist = sigDist * screenPxRange;

  float alpha = clamp(pxDist + 0.5, 0.0, 1.0);

  float dimAlpha = v_props.x;
  float isSelected = v_props.y;

  // Outer halo / glow for selected elements
  if (isSelected > 0.5) {
    float haloDist = (texel.a - 0.3) * screenPxRange * 1.5;
    float haloAlpha = clamp(haloDist + 0.5, 0.0, 1.0);
    vec4 mixedCol = mix(v_halo_color, v_color, alpha);
    float finalAlpha = max(alpha, haloAlpha * 0.75) * dimAlpha * mixedCol.a;
    gl_FragColor = vec4(mixedCol.rgb, finalAlpha);
  } else {
    gl_FragColor = vec4(v_color.rgb, alpha * dimAlpha * v_color.a);
  }

  if (gl_FragColor.a <= 0.005) discard;
}
`;

// 22 Floats per Instanced Character Quad:
// [0..3]: pos_size (worldX, worldY, widthMm, heightMm)
// [4..7]: uv_bounds (u0, v0, u1, v1)
// [8]:    rotation (radians)
// [9..12]: color RGBA
// [13..16]: haloColor RGBA
// [17..20]: props (dimAlpha, isSelected, 0, 0)
// Padding: 1 float for 22 floats total
const FLOATS_PER_QUAD = 22;

function parseColorToRgba(hexOrRgba: string): [number, number, number, number] {
  if (!hexOrRgba) return [1, 1, 1, 1];
  if (hexOrRgba.startsWith("#")) {
    const hex = hexOrRgba.slice(1);
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        1.0,
      ];
    } else if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        parseInt(hex.slice(6, 8), 16) / 255,
      ];
    }
  } else if (hexOrRgba.startsWith("rgb")) {
    const parts = hexOrRgba.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      return [
        parseFloat(parts[0]) / 255,
        parseFloat(parts[1]) / 255,
        parseFloat(parts[2]) / 255,
        parts[3] !== undefined ? parseFloat(parts[3]) : 1.0,
      ];
    }
  }
  return [1, 1, 1, 1];
}

export const PcbWebGLText: React.FC<PcbWebGLTextProps> = React.memo(({
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
  const atlasTextureRef = useRef<WebGLTexture | null>(null);
  const quadVboRef = useRef<WebGLBuffer | null>(null);
  const instanceVboRef = useRef<WebGLBuffer | null>(null);
  const fontAtlasRef = useRef<FontAtlasData | null>(null);

  // Layer lookups
  const layerMap = useMemo(() => {
    const map = new Map<string, { visible: boolean; color: string }>();
    (pcb.layers || []).forEach((l) => {
      map.set(l.id, { visible: l.visible !== false, color: l.color });
    });
    return map;
  }, [pcb.layers]);

  // Register the text pass on the unified PCB canvas
  usePcbGLPass(
    "text",
    PCB_GL_PASS_ORDER.text,
    // ---- init: compile shaders / create buffers / upload the font atlas on the shared context
    (gl, _ext, isWebGL2) => {
    // WebGL1 keeps the extension; WebGL2 gets the translated GLSL ES 3.00 sources
    if (!isWebGL2) gl.getExtension("OES_standard_derivatives");
    const sources = isWebGL2
      ? toEssl300(TEXT_VERTEX_SHADER, TEXT_FRAGMENT_SHADER)
      : { vs: TEXT_VERTEX_SHADER, fs: TEXT_FRAGMENT_SHADER };

    // Compile Shaders
    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, sources.vs);
    const fs = createShader(gl.FRAGMENT_SHADER, sources.fs);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(prog));
      return;
    }
    programRef.current = prog;

    // Master Unit Quad: 6 vertices (2 triangles) centered at 0 [-0.5, 0.5]
    const unitQuad = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
      -0.5,  0.5,
      -0.5,  0.5,
       0.5, -0.5,
       0.5,  0.5,
    ]);
    const qVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qVbo);
    gl.bufferData(gl.ARRAY_BUFFER, unitQuad, gl.STATIC_DRAW);
    quadVboRef.current = qVbo;

    // Instance buffer
    const iVbo = gl.createBuffer();
    instanceVboRef.current = iVbo;

    // Initialize MSDF Font Atlas & GPU Texture
    const atlas = getOrCreateFontAtlas();
    fontAtlasRef.current = atlas;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    atlasTextureRef.current = tex;

    return () => {
      if (prog) gl.deleteProgram(prog);
      if (qVbo) gl.deleteBuffer(qVbo);
      if (iVbo) gl.deleteBuffer(iVbo);
      if (tex) gl.deleteTexture(tex);
      programRef.current = null;
      quadVboRef.current = null;
      instanceVboRef.current = null;
      atlasTextureRef.current = null;
    };
    },
    // ---- draw
    (frame) => {
      const { gl, ext, dpr } = frame;
      const prog = programRef.current;
      const fontAtlas = fontAtlasRef.current;
      if (!prog || !fontAtlas) return;

      pcbGLEnableStandardBlend(gl);

      const isLayerVisible = (layerId: PcbLayerId) => layerMap.get(layerId)?.visible !== false;
      const getLayerColor = (layerId: PcbLayerId, defaultHex = "#fde047") => {
        return layerMap.get(layerId)?.color || defaultHex;
      };

      const quads: WebGLTextQuad[] = [];

      // 1. Standalone PCB Board Texts (`pcb.texts`)
      if (Array.isArray(pcb.texts)) {
        for (const t of pcb.texts) {
          if (!t || !isLayerVisible(t.layer)) continue;

          const isLayerActive = activeLayer === t.layer;
          const isSel = selection?.kind === "text" && selection.id === t.id;
          const isGroupSel = Boolean(groupSelected?.texts?.includes(t.id));
          const dimAlpha = dimInactiveLayers && !isLayerActive && !isSel && !isGroupSel ? 0.25 : 1.0;

          const defaultCol = t.layer === "bottom_silkscreen" ? "#fef08a" : t.layer.includes("copper") ? "#22c55e" : "#fde047";
          const baseColor = isGroupSel ? "#f59e0b" : isSel ? "#3b82f6" : getLayerColor(t.layer, defaultCol);
          const [r, gCol, b, a] = parseColorToRgba(baseColor);
          const haloColor: [number, number, number, number] = isGroupSel ? [0.96, 0.62, 0.07, 0.85] : [0.23, 0.51, 0.96, 0.85];

          const textQuads = layoutSdfText(fontAtlas, {
            text: t.text,
            x: t.x,
            y: t.y,
            size: t.size || 1.2,
            rotationDeg: t.rotation || 0,
            color: [r, gCol, b, a],
            haloColor,
            dimAlpha,
            isSelected: isSel || isGroupSel,
            justify: (t.justify?.[0] as any) || "center",
            verticalAlign: "middle",
            mirror: t.mirror || t.layer.includes("bottom"),
          });

          quads.push(...textQuads);
        }
      }

      // 2. Footprint Reference & Value Labels (`fp.reference`, `fp.value`)
      if (Array.isArray(pcb.footprints)) {
        for (const fp of pcb.footprints) {
          if (!fp) continue;

          const isBottom = fp.nativeKicadFootprint?.layer === "B.Cu" || false;
          const silkLayerId: PcbLayerId = isBottom ? "bottom_silkscreen" : "silkscreen";
          if (!isLayerVisible(silkLayerId)) continue;

          const isFpActive = !dimInactiveLayers || (isBottom ? activeLayer.includes("bottom") : !activeLayer.includes("bottom"));
          const isFpSel = (selectedId === fp.id) || Boolean(groupSelected?.footprints.includes(fp.id));
          const dimAlpha = isFpActive || isFpSel ? 1.0 : 0.25;

          const [r, gCol, b, a] = parseColorToRgba(getLayerColor(silkLayerId, "#fde047"));
          const haloColor: [number, number, number, number] = isFpSel ? [0.23, 0.51, 0.96, 0.85] : [0.96, 0.62, 0.07, 0.85];

          // Reference label (for standard non-KiCad footprints)
          const refStr = fp.reference || fp.nativeKicadFootprint?.properties?.Reference;
          if (refStr && !fp.nativeKicadFootprint) {
            const refY = fp.y - 1.6;
            const refQuads = layoutSdfText(fontAtlas, {
              text: refStr,
              x: fp.x,
              y: refY,
              size: 1.0,
              rotationDeg: fp.rotation || 0,
              color: [r, gCol, b, a],
              haloColor,
              dimAlpha,
              isSelected: isFpSel,
              justify: "center",
              verticalAlign: "middle",
              mirror: isBottom,
              thickness: 0,
            });
            quads.push(...refQuads);
          }

          // Value label (for standard non-KiCad footprints)
          const valStr = fp.value || fp.nativeKicadFootprint?.properties?.Value;
          if (valStr && valStr !== refStr && valStr !== "~" && !fp.nativeKicadFootprint) {
            const valY = fp.y + 1.6;
            const valQuads = layoutSdfText(fontAtlas, {
              text: valStr,
              x: fp.x,
              y: valY,
              size: 0.85,
              rotationDeg: fp.rotation || 0,
              color: [r, gCol, b, a],
              haloColor,
              dimAlpha,
              isSelected: isFpSel,
              justify: "center",
              verticalAlign: "middle",
              mirror: isBottom,
            });
            quads.push(...valQuads);
          }

          // Native KiCad Footprint Text Graphics (including Reference and Value labels at exact spatial coordinates, font size, and color)
          if (fp.nativeKicadFootprint?.graphics) {
            for (const g of fp.nativeKicadFootprint.graphics) {
              if (g.type === "text" && g.text) {
                const cleanTxt = g.text.trim();
                const isRef = g.role === "reference" || /^(REF\*\*|\$\{REFERENCE\}|%R)$/i.test(cleanTxt) || cleanTxt === refStr;
                const isVal = g.role === "value" || /^(VAL\*\*|\$\{VALUE\}|%V)$/i.test(cleanTxt) || cleanTxt === valStr;

                if (isRef && (isLayerVisible("reference" as PcbLayerId) === false || isLayerVisible("Reference" as PcbLayerId) === false)) continue;
                if (isVal && (isLayerVisible("value" as PcbLayerId) === false || isLayerVisible("Value" as PcbLayerId) === false)) continue;

                let textToDraw = g.text;
                if (isRef) {
                  textToDraw = refStr || "REF**";
                } else if (isVal) {
                  textToDraw = valStr || "";
                } else {
                  textToDraw = textToDraw
                    .replace(/\$\{REFERENCE\}|%R|REF\*\*/gi, refStr || "REF**")
                    .replace(/\$\{VALUE\}|%V|VAL\*\*/gi, valStr || "");
                }

                if (!textToDraw || textToDraw === "~") continue;

                const isFabLayer = g.layer?.includes("Fab") || g.layer === "F.Fab" || g.layer === "B.Fab";
                const gLayerId: PcbLayerId = isFabLayer
                  ? (isBottom ? "bottom_fab" : ("fab" as PcbLayerId))
                  : (g.layer?.includes("SilkS") ? (isBottom ? "bottom_silkscreen" : "silkscreen") : "silkscreen");

                if (!isLayerVisible(gLayerId)) continue;

                const layerHex = getLayerColor(gLayerId, isFabLayer ? "#9ca3af" : "#fde047");
                const [rG, gG, bG] = parseColorToRgba(layerHex);

                const gPos = g.position || { x: 0, y: 0 };
                const rotRad = ((fp.rotation || 0) * Math.PI) / 180;
                const wx = fp.x + (gPos.x * Math.cos(rotRad) - gPos.y * Math.sin(rotRad));
                const wy = fp.y + (gPos.x * Math.sin(rotRad) + gPos.y * Math.cos(rotRad));

                const fontSize = g.size?.y ? Math.max(0.35, g.size.y) : (isRef || isVal ? 0.75 : 0.6);
                const justify = g.anchor === "start" ? "left" : g.anchor === "end" ? "right" : "center";

                const gQuads = layoutSdfText(fontAtlas, {
                  text: textToDraw,
                  x: wx,
                  y: wy,
                  size: fontSize,
                  rotationDeg: (fp.rotation || 0) + (g.rotation || 0),
                  color: [rG, gG, bG, 1.0],
                  haloColor,
                  dimAlpha,
                  isSelected: isFpSel,
                  justify,
                  verticalAlign: "middle",
                  mirror: isBottom || !!g.mirror,
                  thickness: g.bold ? 0.12 : 0,
                });
                quads.push(...gQuads);
              }
            }
          }
        }
      }

      if (quads.length === 0) return;

      // Pack into GPU Instance Buffer
      const instanceData = new Float32Array(quads.length * FLOATS_PER_QUAD);
      let offset = 0;

      for (const q of quads) {
        // 0..3: a_pos_size (worldX, worldY, w, h)
        instanceData[offset++] = q.x;
        instanceData[offset++] = q.y;
        instanceData[offset++] = q.w;
        instanceData[offset++] = q.h;

        // 4..7: a_uv_bounds (u0, v0, u1, v1)
        instanceData[offset++] = q.u0;
        instanceData[offset++] = q.v0;
        instanceData[offset++] = q.u1;
        instanceData[offset++] = q.v1;

        // 8: a_rotation
        instanceData[offset++] = q.rotationRad;

        // 9..12: a_color
        instanceData[offset++] = q.color[0];
        instanceData[offset++] = q.color[1];
        instanceData[offset++] = q.color[2];
        instanceData[offset++] = q.color[3];

        // 13..16: a_halo_color
        instanceData[offset++] = q.haloColor[0];
        instanceData[offset++] = q.haloColor[1];
        instanceData[offset++] = q.haloColor[2];
        instanceData[offset++] = q.haloColor[3];

        // 17..20: a_props
        instanceData[offset++] = q.dimAlpha;
        instanceData[offset++] = q.isSelected;
        instanceData[offset++] = q.thickness || 0;
        instanceData[offset++] = 0;

        // 21: padding
        instanceData[offset++] = 0;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVboRef.current);
      gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

      gl.useProgram(prog);

      // Uniforms
      const uRes = gl.getUniformLocation(prog, "u_resolution");
      const uPan = gl.getUniformLocation(prog, "u_pan");
      const uZoom = gl.getUniformLocation(prog, "u_zoom");
      const uRot = gl.getUniformLocation(prog, "u_rotation");
      const uDpr = gl.getUniformLocation(prog, "u_dpr");
      const uAtlas = gl.getUniformLocation(prog, "u_font_atlas");

      gl.uniform2f(uRes, frame.physW, frame.physH);
      gl.uniform2f(uPan, pan.x, pan.y);
      gl.uniform1f(uZoom, zoom);
      gl.uniform1f(uRot, (boardRotation * Math.PI) / 180);
      gl.uniform1f(uDpr, dpr);

      // Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTextureRef.current);
      gl.uniform1i(uAtlas, 0);

      // Bind Geometry (Master Unit Quad)
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVboRef.current);
      const aQuadPos = gl.getAttribLocation(prog, "a_quad_pos");
      gl.enableVertexAttribArray(aQuadPos);
      gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, 0, 0);

      // Bind Instanced Attributes
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceVboRef.current);
      const stride = FLOATS_PER_QUAD * 4;

      const aPosSize = gl.getAttribLocation(prog, "a_pos_size");
      const aUvBounds = gl.getAttribLocation(prog, "a_uv_bounds");
      const aRot = gl.getAttribLocation(prog, "a_rotation");
      const aColor = gl.getAttribLocation(prog, "a_color");
      const aHaloCol = gl.getAttribLocation(prog, "a_halo_color");
      const aProps = gl.getAttribLocation(prog, "a_props");

      if (aPosSize >= 0) {
        gl.enableVertexAttribArray(aPosSize);
        gl.vertexAttribPointer(aPosSize, 4, gl.FLOAT, false, stride, 0);
        ext.vertexAttribDivisorANGLE(aPosSize, 1);
      }
      if (aUvBounds >= 0) {
        gl.enableVertexAttribArray(aUvBounds);
        gl.vertexAttribPointer(aUvBounds, 4, gl.FLOAT, false, stride, 4 * 4);
        ext.vertexAttribDivisorANGLE(aUvBounds, 1);
      }
      if (aRot >= 0) {
        gl.enableVertexAttribArray(aRot);
        gl.vertexAttribPointer(aRot, 1, gl.FLOAT, false, stride, 8 * 4);
        ext.vertexAttribDivisorANGLE(aRot, 1);
      }
      if (aColor >= 0) {
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 9 * 4);
        ext.vertexAttribDivisorANGLE(aColor, 1);
      }
      if (aHaloCol >= 0) {
        gl.enableVertexAttribArray(aHaloCol);
        gl.vertexAttribPointer(aHaloCol, 4, gl.FLOAT, false, stride, 13 * 4);
        ext.vertexAttribDivisorANGLE(aHaloCol, 1);
      }
      if (aProps >= 0) {
        gl.enableVertexAttribArray(aProps);
        gl.vertexAttribPointer(aProps, 4, gl.FLOAT, false, stride, 17 * 4);
        ext.vertexAttribDivisorANGLE(aProps, 1);
      }

      // Draw all character quads
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, quads.length);

      // Reset divisors
      if (aPosSize >= 0) ext.vertexAttribDivisorANGLE(aPosSize, 0);
      if (aUvBounds >= 0) ext.vertexAttribDivisorANGLE(aUvBounds, 0);
      if (aRot >= 0) ext.vertexAttribDivisorANGLE(aRot, 0);
      if (aColor >= 0) ext.vertexAttribDivisorANGLE(aColor, 0);
      if (aHaloCol >= 0) ext.vertexAttribDivisorANGLE(aHaloCol, 0);
      if (aProps >= 0) ext.vertexAttribDivisorANGLE(aProps, 0);
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
      layerMap,
    ]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
});
