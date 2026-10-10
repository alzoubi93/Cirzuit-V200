import React, { useRef } from "react";
import { usePcbGLPass, PCB_GL_PASS_ORDER } from "./webgl/PcbGLStage";

export interface PcbWebGLGridProps {
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  boardWidth: number;
  boardHeight: number;
  gridMm: number;
  outlineColor?: string;
  outlineVisible?: boolean;
  outlineWidth?: number;
  bgColor?: string;
  gridColor?: string;
  gridOpacity?: number;
}

// GLSL Vertex Shader
const VERTEX_SHADER_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// GLSL Fragment Shader
const FRAGMENT_SHADER_SRC = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_rotation;
uniform vec2 u_board_size;
uniform float u_grid_step;
uniform float u_dpr;
uniform vec4 u_bg_color;
uniform vec4 u_grid_color;
uniform vec4 u_outline_color;
uniform float u_outline_visible;
uniform float u_outline_width;

void main() {
  // Current screen pixel coordinate in CSS pixels (origin at top-left)
  vec2 css_coord = vec2(gl_FragCoord.x / u_dpr, (u_resolution.y - gl_FragCoord.y) / u_dpr);

  // Transform screen coordinate to board space in millimeters:
  // screen_coord = pan + zoom * R(rotation) * board_pos
  // board_pos = R(-rotation) * (screen_coord - pan) / zoom
  vec2 delta = (css_coord - u_pan) / u_zoom;
  float cos_r = cos(-u_rotation);
  float sin_r = sin(-u_rotation);
  vec2 board_pos = vec2(
    cos_r * delta.x - sin_r * delta.y,
    sin_r * delta.x + cos_r * delta.y
  );

  // Check board boundaries (0.0 to u_board_size.x, 0.0 to u_board_size.y)
  if (board_pos.x < 0.0 || board_pos.x > u_board_size.x ||
      board_pos.y < 0.0 || board_pos.y > u_board_size.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // Base background color (#121214)
  vec4 result = u_bg_color;

  // 1. Precise Grid calculation with subpixel antialiasing
  float screen_grid_step = u_grid_step * u_zoom;
  if (screen_grid_step >= 4.0 && u_grid_step > 0.0) {
    vec2 g_mod = mod(board_pos, u_grid_step);
    vec2 dist_mm = min(g_mod, vec2(u_grid_step) - g_mod);
    vec2 dist_px = dist_mm * u_zoom;
    float min_dist_px = min(dist_px.x, dist_px.y);

    // Adaptive stroke width in CSS pixels (matching CAD precision)
    float stroke_w_px = max(0.04 * u_zoom, 0.4 * min(u_zoom, 1.0));
    float half_w = max(0.4, stroke_w_px * 0.5);

    // Smoothstep anti-aliasing for crisp GLSL grid lines
    float line_alpha = 1.0 - smoothstep(half_w - 0.75, half_w + 0.75, min_dist_px);
    
    // Smooth fade when zooming out
    float fade = clamp((screen_grid_step - 4.0) / 4.0, 0.0, 1.0);
    float final_grid_alpha = line_alpha * fade * u_grid_color.a;

    // Alpha blend grid line over background
    result.rgb = mix(result.rgb, u_grid_color.rgb, final_grid_alpha);
  }

  // 2. Board outline (Edge.Cuts) frame rendering
  if (u_outline_visible > 0.5) {
    float edge_x = min(board_pos.x, u_board_size.x - board_pos.x);
    float edge_y = min(board_pos.y, u_board_size.y - board_pos.y);
    float min_edge_mm = min(edge_x, edge_y);
    float min_edge_px = min_edge_mm * u_zoom;

    float outline_half_w = max(0.5, (u_outline_width * 0.5) * u_zoom);
    float outline_alpha = 1.0 - smoothstep(outline_half_w - 0.75, outline_half_w + 0.75, min_edge_px);
    outline_alpha *= u_outline_color.a;

    result.rgb = mix(result.rgb, u_outline_color.rgb, outline_alpha);
  }

  gl_FragColor = result;
}
`;

function parseColorToVec4(colorStr: string, defaultAlpha = 1.0): [number, number, number, number] {
  if (!colorStr) return [1, 1, 1, defaultAlpha];
  
  // Clean string
  const str = colorStr.trim().toLowerCase();
  
  // Hex formats: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (str.startsWith("#")) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b, defaultAlpha];
    }
    if (hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      const a = (parseInt(hex[3] + hex[3], 16) / 255) * defaultAlpha;
      return [r, g, b, a];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      return [r, g, b, defaultAlpha];
    }
    if (hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = (parseInt(hex.substring(6, 8), 16) / 255) * defaultAlpha;
      return [r, g, b, a];
    }
  }

  // rgb/rgba formats
  const rgbaMatch = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = parseFloat(rgbaMatch[1]) / 255;
    const g = parseFloat(rgbaMatch[2]) / 255;
    const b = parseFloat(rgbaMatch[3]) / 255;
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) * defaultAlpha : defaultAlpha;
    return [r, g, b, a];
  }

  return [1, 1, 1, defaultAlpha];
}

export const PcbWebGLGrid: React.FC<PcbWebGLGridProps> = React.memo(({
  pan,
  zoom,
  boardRotation,
  boardWidth,
  boardHeight,
  gridMm,
  outlineColor = "#facc15",
  outlineVisible = true,
  outlineWidth = 0.2,
  bgColor = "#121214",
  gridColor = "#ffffff",
  gridOpacity = 0.35,
}) => {
  const programRef = useRef<WebGLProgram | null>(null);
  const locationsRef = useRef<{
    aPosition: number;
    uResolution: WebGLUniformLocation | null;
    uPan: WebGLUniformLocation | null;
    uZoom: WebGLUniformLocation | null;
    uRotation: WebGLUniformLocation | null;
    uBoardSize: WebGLUniformLocation | null;
    uGridStep: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
    uBgColor: WebGLUniformLocation | null;
    uGridColor: WebGLUniformLocation | null;
    uOutlineColor: WebGLUniformLocation | null;
    uOutlineVisible: WebGLUniformLocation | null;
    uOutlineWidth: WebGLUniformLocation | null;
  } | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);

  usePcbGLPass(
    "grid",
    PCB_GL_PASS_ORDER.grid,
    // ---- init: compile shaders on the shared context
    (gl) => {
      const compileShader = (type: number, src: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Shader compile error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fragShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      if (!vertShader || !fragShader) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("WebGL program link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }

      programRef.current = program;

      // Cache uniform and attribute locations
      locationsRef.current = {
        aPosition: gl.getAttribLocation(program, "a_position"),
        uResolution: gl.getUniformLocation(program, "u_resolution"),
        uPan: gl.getUniformLocation(program, "u_pan"),
        uZoom: gl.getUniformLocation(program, "u_zoom"),
        uRotation: gl.getUniformLocation(program, "u_rotation"),
        uBoardSize: gl.getUniformLocation(program, "u_board_size"),
        uGridStep: gl.getUniformLocation(program, "u_grid_step"),
        uDpr: gl.getUniformLocation(program, "u_dpr"),
        uBgColor: gl.getUniformLocation(program, "u_bg_color"),
        uGridColor: gl.getUniformLocation(program, "u_grid_color"),
        uOutlineColor: gl.getUniformLocation(program, "u_outline_color"),
        uOutlineVisible: gl.getUniformLocation(program, "u_outline_visible"),
        uOutlineWidth: gl.getUniformLocation(program, "u_outline_width"),
      };

      // Fullscreen quad [-1, -1] to [1, 1]
      const quadVertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
      bufferRef.current = buffer;

      return () => {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        if (vertShader) gl.deleteShader(vertShader);
        if (fragShader) gl.deleteShader(fragShader);
        programRef.current = null;
        locationsRef.current = null;
        bufferRef.current = null;
      };
    },
    // ---- draw: first pass of the frame. It paints the board background + grid + outline;
    // outside the board it writes transparent pixels so the editor background shows through.
    // Blending is off here (state was reset by the stage) so it *replaces* the cleared pixels.
    (frame) => {
      const { gl, physW, physH, dpr } = frame;
      const program = programRef.current;
      const locs = locationsRef.current;
      if (!program || !locs) return;

      gl.useProgram(program);

      // Setup vertex attributes
      if (bufferRef.current) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferRef.current);
        gl.enableVertexAttribArray(locs.aPosition);
        gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);
      }

      // Set Uniforms
      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform2f(locs.uPan, pan.x, pan.y);
      gl.uniform1f(locs.uZoom, zoom);
      gl.uniform1f(locs.uRotation, (boardRotation * Math.PI) / 180);
      gl.uniform2f(locs.uBoardSize, boardWidth, boardHeight);
      gl.uniform1f(locs.uGridStep, gridMm);
      gl.uniform1f(locs.uDpr, dpr);

      // Parse and set colors
      const bgVec = parseColorToVec4(bgColor, 1.0);
      gl.uniform4f(locs.uBgColor, bgVec[0], bgVec[1], bgVec[2], bgVec[3]);

      const gridVec = parseColorToVec4(gridColor, gridOpacity);
      gl.uniform4f(locs.uGridColor, gridVec[0], gridVec[1], gridVec[2], gridVec[3]);

      const outlineVec = parseColorToVec4(outlineColor, 1.0);
      gl.uniform4f(locs.uOutlineColor, outlineVec[0], outlineVec[1], outlineVec[2], outlineVec[3]);

      gl.uniform1f(locs.uOutlineVisible, outlineVisible ? 1.0 : 0.0);
      gl.uniform1f(locs.uOutlineWidth, outlineWidth);

      // Draw full-screen quad through fragment shader
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    [
      pan.x,
      pan.y,
      zoom,
      boardRotation,
      boardWidth,
      boardHeight,
      gridMm,
      bgColor,
      gridColor,
      gridOpacity,
      outlineColor,
      outlineVisible,
      outlineWidth,
    ]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
});

PcbWebGLGrid.displayName = "PcbWebGLGrid";
