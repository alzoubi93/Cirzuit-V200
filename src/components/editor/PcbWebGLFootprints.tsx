import React, { useLayoutEffect, useRef, useMemo } from "react";
import earcut from "earcut";
import type { KicadGeometryItem, KicadGeometryPrimitive, GeoText } from "@/lib/kicad/footprint/geometry";
import { buildKicadFootprintItems, getKicadLayerColor } from "./KicadFootprintGeometry";
import { resolveKicadDisplayLayer, isKicadLayerVisible } from "@/lib/kicad/footprint/kicadLayerAdapter";
import { generateHersheyTextStrokes } from "@/lib/kicadHersheyFont";
import {
  PcbDoc,
  PcbFootprint,
  PcbLayerId,
  isCopperLayer,
  getCopperLayerStandardColor,
  normalizeLayerId,
} from "@/lib/pcb";
import {
  FootprintSceneGraph,
  FootprintParentNode,
  FootprintChildPad,
  FootprintChildGraphic,
} from "@/lib/pcbFootprintSceneGraph";

import { usePcbGLPass, pcbGLEnableStandardBlend, PCB_GL_PASS_ORDER, type PcbGLFrame } from "./webgl/PcbGLStage";
import { buildNativeStaticSceneCached, buildNativeHalos, NativeStaticSceneCache, type NativeStaticScene } from "./webgl/nativeFootprintScene";
import { STROKE_FS_SOURCE } from "./KicadFootprintRenderShared";

export interface PcbWebGLFootprintsProps {
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
  layerColors?: Record<string,string>;
  layerVisibility?: Record<string,boolean>;
}

// ============================================================================
// GLSL Vertex Shader: Instanced Footprint Pads via Parent Transformation Matrix
// ============================================================================
const PAD_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-1, 1] unit quad

// Parent Transformation Matrix (Passed per-instance from CPU Scene Graph)
// Col 0 & 1: (a, b, c, d), Col 2: (tx, ty)
attribute vec4 a_parent_mat_col01; // [a, b, c, d]
attribute vec2 a_parent_mat_col2;  // [tx, ty]
attribute vec2 a_parent_state;     // (isSelected, isFlipped)

// Child Pad Local Attributes (in Footprint local space, mm)
attribute vec2 a_pad_local_pos;    // (lx, ly) relative to footprint origin
attribute vec4 a_pad_dim_rot;      // (width, height, localRotRad, padShapeId)
attribute vec4 a_pad_drill_props;  // (drillDia, drillOffX, drillOffY, roundrectRatio)
attribute vec4 a_pad_color;        // Base Pad RGBA
attribute vec4 a_pad_drill_color;  // Drill hole RGBA
attribute vec4 a_pad_params;       // (layerId, isSelected, netHighlight, dimAlpha)

// Global Camera Uniforms
uniform vec2 u_resolution; // (w * dpr, h * dpr)
uniform vec2 u_pan;        // pan in CSS pixels (x, y)
uniform float u_zoom;      // zoom factor
uniform float u_rotation;  // board rotation in radians
uniform float u_dpr;       // device pixel ratio

// Varyings to Fragment Shader
varying vec2 v_local_pad_pos;      // Local coords in mm inside pad's own bounding box
varying vec4 v_pad_dim_shape;      // (width, height, shapeId, roundrectRatio)
varying vec4 v_drill_props;        // (drillDia, drillOffX, drillOffY, hasDrill)
varying vec4 v_pad_color;
varying vec4 v_drill_color;
varying vec4 v_params;             // (layerId, isSelected, netHighlight, dimAlpha)

void main() {
  v_pad_dim_shape = vec4(a_pad_dim_rot.x, a_pad_dim_rot.y, a_pad_dim_rot.w, a_pad_drill_props.w);
  v_drill_props = vec4(a_pad_drill_props.xyz, a_pad_drill_props.x > 0.0 ? 1.0 : 0.0);
  v_pad_color = a_pad_color;
  v_drill_color = a_pad_drill_color;
  v_params = a_pad_params;

  float halfW = a_pad_dim_rot.x * 0.5;
  float halfH = a_pad_dim_rot.y * 0.5;
  float selState = max(a_parent_state.x, a_pad_params.y);
  float haloPad = selState > 0.5 ? 0.6 : 0.25;

  // Quad half-size in pad's own coordinate space (with AA/halo padding)
  float quadHalfW = halfW + haloPad + max(0.15, 3.0 / max(u_zoom * u_dpr, 0.001));
  float quadHalfH = halfH + haloPad + max(0.15, 3.0 / max(u_zoom * u_dpr, 0.001));

  vec2 pad_box_pos = vec2(a_quad_pos.x * quadHalfW, a_quad_pos.y * quadHalfH);
  v_local_pad_pos = pad_box_pos;

  // 1. Rotate vertex by child pad's local rotation
  float padRot = a_pad_dim_rot.z;
  float cos_p = cos(padRot);
  float sin_p = sin(padRot);
  vec2 rotated_pad_vertex = vec2(
    cos_p * pad_box_pos.x - sin_p * pad_box_pos.y,
    sin_p * pad_box_pos.x + cos_p * pad_box_pos.y
  );

  // 2. Add child local offset to get footprint-space coordinate
  vec2 fp_local_pos = a_pad_local_pos + rotated_pad_vertex;

  // 3. Apply Parent Transformation Matrix (M_parent * p_local) completely on GPU!
  // a_parent_mat_col01 = (a, b, c, d), a_parent_mat_col2 = (tx, ty)
  vec2 world_pos = vec2(
    a_parent_mat_col01.x * fp_local_pos.x + a_parent_mat_col01.z * fp_local_pos.y + a_parent_mat_col2.x,
    a_parent_mat_col01.y * fp_local_pos.x + a_parent_mat_col01.w * fp_local_pos.y + a_parent_mat_col2.y
  );

  // 4. Apply Board Global Transform (Rotation + Pan + Zoom)
  float cos_b = cos(u_rotation);
  float sin_b = sin(u_rotation);
  vec2 rotated_board_pos = vec2(
    cos_b * world_pos.x - sin_b * world_pos.y,
    sin_b * world_pos.x + cos_b * world_pos.y
  );

  vec2 screen_coord = u_pan + u_zoom * rotated_board_pos;

  vec2 clip_pos = vec2(
    (screen_coord.x * u_dpr / u_resolution.x) * 2.0 - 1.0,
    1.0 - (screen_coord.y * u_dpr / u_resolution.y) * 2.0
  );

  gl_Position = vec4(clip_pos, 0.0, 1.0);
}
`;

// ============================================================================
// GLSL Fragment Shader: Instanced SDF Pad Rendering
// ============================================================================
const PAD_FRAGMENT_SHADER = `
precision highp float;

uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_local_pad_pos;
varying vec4 v_pad_dim_shape;  // (width, height, shapeId, roundrectRatio)
varying vec4 v_drill_props;    // (drillDia, drillOffX, drillOffY, hasDrill)
varying vec4 v_pad_color;
varying vec4 v_drill_color;
varying vec4 v_params;         // (layerId, isSelected, netHighlight, dimAlpha)

// 2D Signed Distance to Rounded Box
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// 2D Signed Distance to Circle
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

void main() {
  float pixelSize = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aa = pixelSize * 1.5;

  float width = v_pad_dim_shape.x;
  float height = v_pad_dim_shape.y;
  float shapeId = v_pad_dim_shape.z; // 0=rect, 1=circle, 2=roundrect, 3=oval
  float roundRatio = v_pad_dim_shape.w;

  float halfW = width * 0.5;
  float halfH = height * 0.5;

  float d_pad = 0.0;
  if (shapeId > 0.5 && shapeId < 1.5) {
    // Circle
    d_pad = sdCircle(v_local_pad_pos, min(halfW, halfH));
  } else if (shapeId > 1.5 && shapeId < 2.5) {
    // Roundrect
    float r = min(halfW, halfH) * max(roundRatio, 0.25);
    d_pad = sdRoundBox(v_local_pad_pos, vec2(halfW, halfH), r);
  } else if (shapeId > 2.5) {
    // Oval
    float r = min(halfW, halfH);
    vec2 b = vec2(halfW, halfH);
    d_pad = sdRoundBox(v_local_pad_pos, b, r);
  } else {
    // Sharp rectangle with microscopic corner rounding for pristine AA
    d_pad = sdRoundBox(v_local_pad_pos, vec2(halfW, halfH), 0.03);
  }

  // Check selection halo
  float isSel = v_params.y;
  float isNetHigh = v_params.z;
  float dimAlpha = v_params.w;

  float haloWidth = (isSel > 0.5 || isNetHigh > 0.5) ? 0.35 : 0.0;
  vec4 haloColor = isSel > 0.5 ? vec4(0.23, 0.51, 0.96, 0.85) : vec4(0.96, 0.62, 0.07, 0.85);

  float padAlpha = 1.0 - smoothstep(-aa, aa, d_pad);
  float haloAlpha = (haloWidth > 0.0) ? (1.0 - smoothstep(haloWidth - aa, haloWidth + aa, d_pad)) : 0.0;

  if (padAlpha <= 0.0 && haloAlpha <= 0.0) {
    discard;
  }

  vec4 col = v_pad_color;
  col.a *= dimAlpha;

  if (haloAlpha > 0.0 && padAlpha < 1.0) {
    col = mix(haloColor, col, padAlpha);
  }

  // Handle Drill hole if Through-Hole pad
  if (v_drill_props.w > 0.5) {
    float drillR = v_drill_props.x * 0.5;
    vec2 drillPos = v_local_pad_pos - v_drill_props.yz;
    float d_drill = sdCircle(drillPos, drillR);
    float drillAlpha = 1.0 - smoothstep(-aa, aa, d_drill);
    
    if (drillAlpha > 0.0) {
      // Internal hole shading for mechanical realism
      vec4 holeCol = v_drill_color;
      col = mix(col, holeCol, drillAlpha);
    }
  }

  gl_FragColor = col;
}
`;

// ============================================================================
// GLSL Vertex & Fragment Shaders for Silkscreen Lines via Parent Transform
// ============================================================================
const SILK_VERTEX_SHADER = `
attribute vec2 a_quad_pos; // [-1, 1]

// Parent Matrix
attribute vec4 a_parent_mat_col01; // [a, b, c, d]
attribute vec2 a_parent_mat_col2;  // [tx, ty]

// Child Local Segment
attribute vec2 a_silk_p0;          // Local start point (lx, ly)
attribute vec2 a_silk_p1;          // Local end point (lx, ly)
attribute vec4 a_silk_props;       // (strokeWidth, isSelected, dimAlpha, unused)
attribute vec4 a_silk_color;       // RGBA

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_rotation;
uniform float u_dpr;

varying vec2 v_local_silk_p;
varying float v_seg_len;
varying float v_radius;
varying vec4 v_silk_color;
varying float v_dim_alpha;

void main() {
  v_radius = a_silk_props.x * 0.5;
  v_silk_color = a_silk_color;
  v_dim_alpha = a_silk_props.z;

  // 1. Transform p0 and p1 from local footprint space to world space on GPU
  vec2 w_p0 = vec2(
    a_parent_mat_col01.x * a_silk_p0.x + a_parent_mat_col01.z * a_silk_p0.y + a_parent_mat_col2.x,
    a_parent_mat_col01.y * a_silk_p0.x + a_parent_mat_col01.w * a_silk_p0.y + a_parent_mat_col2.y
  );

  vec2 w_p1 = vec2(
    a_parent_mat_col01.x * a_silk_p1.x + a_parent_mat_col01.z * a_silk_p1.y + a_parent_mat_col2.x,
    a_parent_mat_col01.y * a_silk_p1.x + a_parent_mat_col01.w * a_silk_p1.y + a_parent_mat_col2.y
  );

  vec2 dir = w_p1 - w_p0;
  float len = length(dir);
  v_seg_len = len;
  vec2 u = len > 0.0001 ? (dir / len) : vec2(1.0, 0.0);
  vec2 n = vec2(-u.y, u.x);

  float pixelSize = 1.0 / max(u_zoom * u_dpr, 0.001);
  float totalR = v_radius + max(pixelSize * 2.0, 0.05);

  vec2 center = (w_p0 + w_p1) * 0.5;
  float halfLen = len * 0.5 + totalR;
  float halfWidth = totalR;

  vec2 world_pos = center + u * (a_quad_pos.x * halfLen) + n * (a_quad_pos.y * halfWidth);
  v_local_silk_p = vec2(a_quad_pos.x * halfLen, a_quad_pos.y * halfWidth);

  // Apply Board Rotation
  float cos_b = cos(u_rotation);
  float sin_b = sin(u_rotation);
  vec2 rot_pos = vec2(
    cos_b * world_pos.x - sin_b * world_pos.y,
    sin_b * world_pos.x + cos_b * world_pos.y
  );

  vec2 screen_coord = u_pan + u_zoom * rot_pos;
  vec2 clip_pos = vec2(
    (screen_coord.x * u_dpr / u_resolution.x) * 2.0 - 1.0,
    1.0 - (screen_coord.y * u_dpr / u_resolution.y) * 2.0
  );

  gl_Position = vec4(clip_pos, 0.0, 1.0);
}
`;

const SILK_FRAGMENT_SHADER = `
precision highp float;

uniform float u_zoom;
uniform float u_dpr;

varying vec2 v_local_silk_p;
varying float v_seg_len;
varying float v_radius;
varying vec4 v_silk_color;
varying float v_dim_alpha;

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

void main() {
  float pixelSize = 1.0 / max(u_zoom * u_dpr, 0.001);
  float aa = pixelSize * 1.5;

  vec2 p0 = vec2(-v_seg_len * 0.5, 0.0);
  vec2 p1 = vec2(v_seg_len * 0.5, 0.0);

  float d = sdCapsule(v_local_silk_p, p0, p1, v_radius);
  float alpha = 1.0 - smoothstep(-aa, aa, d);

  if (alpha <= 0.0) discard;

  vec4 col = v_silk_color;
  col.a *= (alpha * v_dim_alpha);
  gl_FragColor = col;
}
`;


// -----------------------------------------------------------------------------
// Unified KiCad technical-layer fill renderer.
// Fills are triangulated once on the CPU and rasterized by the same WebGL
// context as pads/silkscreen/text. No SVG path/fill is used on the PCB canvas.
// -----------------------------------------------------------------------------
const TECH_FILL_VS = `
attribute vec2 a_world;
attribute vec4 a_color;
uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_rotation;
uniform float u_dpr;
varying vec4 v_color;
void main() {
  float c = cos(u_rotation), s = sin(u_rotation);
  vec2 p = vec2(c*a_world.x-s*a_world.y, s*a_world.x+c*a_world.y);
  vec2 screen = u_pan + u_zoom*p;
  vec2 clip = vec2((screen.x*u_dpr/u_resolution.x)*2.0-1.0,
                   1.0-(screen.y*u_dpr/u_resolution.y)*2.0);
  gl_Position = vec4(clip,0.0,1.0);
  v_color = a_color;
}`;
const TECH_FILL_FS = `
precision highp float;
varying vec4 v_color;
void main(){ if(v_color.a<=0.001) discard; gl_FragColor=v_color; }`;

/**
 * Vertex shader for KiCad-native footprint strokes (silk / fab / courtyard / text / pad numbers).
 * Identical quad expansion to the footprint-browser preview (KicadFootprintRenderShared.STROKE_VS_SOURCE);
 * only the final world -> clip transform uses the PCB camera. The fragment shader is the preview's own.
 */
const NATIVE_STROKE_VS = `
attribute vec2 a_quad_pos;
attribute vec2 a_seg_p0;
attribute vec2 a_seg_p1;
attribute vec4 a_seg_props; // (strokeWidth, dimAlpha, isDashed, startLen)
attribute vec4 a_seg_color;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_rotation;
uniform float u_dpr;

varying vec2 v_world_pos;
varying vec2 v_world_p0;
varying vec2 v_world_p1;
varying vec4 v_props;
varying vec4 v_color;
varying float v_arcLength;

void main() {
  v_world_p0 = a_seg_p0;
  v_world_p1 = a_seg_p1;
  v_props = a_seg_props;
  v_color = a_seg_color;

  float radius = a_seg_props.x * 0.5;
  float pixelSizeMm = 1.0 / max(u_zoom * u_dpr, 0.001);
  float totalR = radius + pixelSizeMm * 1.5;

  vec2 dir = a_seg_p1 - a_seg_p0;
  float segLen = length(dir);
  vec2 u = segLen > 0.00001 ? (dir / segLen) : vec2(1.0, 0.0);
  vec2 n = vec2(-u.y, u.x);

  vec2 center = (a_seg_p0 + a_seg_p1) * 0.5;
  float halfLen = segLen * 0.5 + totalR;
  vec2 world_pos = center + u * (a_quad_pos.x * halfLen) + n * (a_quad_pos.y * totalR);
  v_world_pos = world_pos;
  v_arcLength = a_seg_props.w + dot(world_pos - a_seg_p0, u);

  float c = cos(u_rotation), s = sin(u_rotation);
  vec2 p = vec2(c * world_pos.x - s * world_pos.y, s * world_pos.x + c * world_pos.y);
  vec2 screen = u_pan + u_zoom * p;
  gl_Position = vec4((screen.x * u_dpr / u_resolution.x) * 2.0 - 1.0,
                     1.0 - (screen.y * u_dpr / u_resolution.y) * 2.0, 0.0, 1.0);
}`;

interface FootprintBuild {
  padData: Float32Array | null;
  padCount: number;
  silkData: Float32Array | null;
  silkCount: number;
  fillF32: Float32Array | null;
  packed: Float32Array | null;
  lineCount: number;
}

/** Pad numbers are always visible regardless of zoom level. */
const PAD_NUMBER_MIN_ZOOM = 0;
const EMPTY_NETS: number[] = [];
const EMPTY_MAP: Record<string, any> = {};

function compileProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const mk = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Footprints WebGL shader compile error:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = mk(gl.VERTEX_SHADER, vsSrc), fs = mk(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Footprints WebGL program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function hexToRgba(color: string, alpha = 1): [number,number,number,number] {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [0.58,0.64,0.72,alpha];
  return [
    parseInt(m[1].slice(0,2),16)/255,
    parseInt(m[1].slice(2,4),16)/255,
    parseInt(m[1].slice(4,6),16)/255,
    alpha
  ];
}
function affinePoint(m: number[], x: number, y: number) {
  return {x:m[0]*x+m[2]*y+m[4], y:m[1]*x+m[3]*y+m[5]};
}
function primitiveSegments(p: KicadGeometryPrimitive, stroke: number, dashed = false) {
  const out: {x1:number;y1:number;x2:number;y2:number}[] = [];
  const add=(a:any,b:any)=>out.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y});
  if(p.kind==="line") add(p.start,p.end);
  else if(p.kind==="rect") {
    const cx=(p.start.x+p.end.x)*0.5, cy=(p.start.y+p.end.y)*0.5, w=Math.abs(p.end.x-p.start.x), h=Math.abs(p.end.y-p.start.y);
    const c=Math.cos(p.rotation*Math.PI/180), s=Math.sin(p.rotation*Math.PI/180);
    const pts=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>({x:cx+x*c-y*s,y:cy+x*s+y*c}));
    for(let i=0;i<4;i++) add(pts[i],pts[(i+1)%4]);
  } else if(p.kind==="roundrect" || p.kind==="chamferrect") {
    const cx=p.center.x, cy=p.center.y, w=p.size.x, h=p.size.y, rot=(p.rotation||0)*Math.PI/180;
    const c=Math.cos(rot),s=Math.sin(rot);
    const pts:any[]=[];
    const radii=p.kind==="roundrect"?p.radii:{topLeft:0,topRight:0,bottomRight:0,bottomLeft:0};
    const cham=p.kind==="chamferrect"?p.chamfers:{topLeft:0,topRight:0,bottomRight:0,bottomLeft:0};
    const corners=[[-1,-1,radii.topLeft,cham.topLeft],[1,-1,radii.topRight,cham.topRight],[1,1,radii.bottomRight,cham.bottomRight],[-1,1,radii.bottomLeft,cham.bottomLeft]];
    for(const [sx,sy,rr,cc] of corners as any[]){
      if((cc||0)>0){
        const inset=Math.min(cc,w/2,h/2);
        pts.push({x:sx*w/2-sx*inset,y:sy*h/2},{x:sx*w/2,y:sy*h/2-sy*inset});
      } else {
        const r=Math.min(rr||0,w/2,h/2);
        if(r>0){
          const base=(Math.atan2(sy,sx));
          for(let k=0;k<=6;k++){const a=base + (sx<0? -1:1)*(Math.PI/4)*(k/6)*sy; pts.push({x:sx*(w/2-r)+r*Math.cos(a),y:sy*(h/2-r)+r*Math.sin(a)});}
        } else pts.push({x:sx*w/2,y:sy*h/2});
      }
    }
    const world=pts.map(q=>({x:cx+q.x*c-q.y*s,y:cy+q.x*s+q.y*c}));
    for(let i=0;i<world.length;i++) add(world[i],world[(i+1)%world.length]);
  } else if(p.kind==="circle"){
    const n=Math.max(24,Math.ceil(p.radius*18)); let prev={x:p.center.x+p.radius,y:p.center.y};
    for(let i=1;i<=n;i++){const a=2*Math.PI*i/n,q={x:p.center.x+p.radius*Math.cos(a),y:p.center.y+p.radius*Math.sin(a)};add(prev,q);prev=q;}
  } else if(p.kind==="arc"){
    const n=Math.max(8,Math.ceil(Math.abs(p.sweepRadians)*12)); let prev=p.start;
    for(let i=1;i<=n;i++){const a=p.sweepRadians*i/n; const q={x:p.center.x+p.radius*Math.cos(Math.atan2(p.start.y-p.center.y,p.start.x-p.center.x)+a),y:p.center.y+p.radius*Math.sin(Math.atan2(p.start.y-p.center.y,p.start.x-p.center.x)+a)};add(prev,q);prev=q;}
    add(prev,p.end);
  } else if(p.kind==="polygon" || p.kind==="bezier"){
    for(let i=0;i<p.points.length-1;i++) add(p.points[i],p.points[i+1]);
    if(p.kind==="polygon" && p.points.length>2) add(p.points[p.points.length-1],p.points[0]);
  } else if(p.kind==="capsule") {
    // Capsule outline as two tangent lines + semicircle polylines.
    const dx=p.end.x-p.start.x,dy=p.end.y-p.start.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
    const a={x:p.start.x+nx*p.radius,y:p.start.y+ny*p.radius},b={x:p.end.x+nx*p.radius,y:p.end.y+ny*p.radius};
    const c={x:p.end.x-nx*p.radius,y:p.end.y-ny*p.radius},d={x:p.start.x-nx*p.radius,y:p.start.y-ny*p.radius};
    add(a,b);add(c,d);
    const steps=12; let prev=b; for(let i=1;i<=steps;i++){const t=i*Math.PI/steps;const q={x:p.end.x+nx*p.radius*Math.cos(t)+(-dx/L)*p.radius*Math.sin(t),y:p.end.y+ny*p.radius*Math.cos(t)+(-dy/L)*p.radius*Math.sin(t)};add(prev,q);prev=q;}
    prev=c; for(let i=1;i<=steps;i++){const t=Math.PI+i*Math.PI/steps;const q={x:p.start.x+nx*p.radius*Math.cos(t)+(-dx/L)*p.radius*Math.sin(t),y:p.start.y+ny*p.radius*Math.cos(t)+(-dy/L)*p.radius*Math.sin(t)};add(prev,q);prev=q;}
  }
  return out;
}


/** Upload a native packed array: full bufferData or partial bufferSubData for dirty ranges. */
function uploadNativePackedArray(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  data: Float32Array,
  prevUploaded: Float32Array | null,
  contentDirty: boolean,
  isFullRebuild: boolean,
  dirtyRanges: { byteOffset: number; byteLength: number }[],
): Float32Array {
  if (!contentDirty && prevUploaded === data) return data;

  // Prefer partial upload only when the GPU buffer already holds this array and we have ranges.
  const canSub =
    !isFullRebuild &&
    prevUploaded === data &&
    dirtyRanges.length > 0 &&
    data.byteLength > 0;

  if (canSub) {
    const totalBytes = data.byteLength;
    let dirtyBytes = 0;
    for (const r of dirtyRanges) dirtyBytes += r.byteLength;
    // If more than half the buffer is dirty, a full upload is typically cheaper.
    if (dirtyBytes * 2 < totalBytes) {
      for (const r of dirtyRanges) {
        if (r.byteLength <= 0) continue;
        const start = r.byteOffset >> 2; // floats
        const end = start + (r.byteLength >> 2);
        gl.bufferSubData(gl.ARRAY_BUFFER, r.byteOffset, data.subarray(start, end));
      }
      return data;
    }
  }

  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  return data;
}

export const PcbWebGLFootprints: React.FC<PcbWebGLFootprintsProps> = ({
  pcb,
  pan,
  zoom,
  boardRotation,
  activeLayer,
  dimInactiveLayers,
  selectedId,
  selection,
  groupSelected,
  highlightedNetIds = EMPTY_NETS,
  layerColors = EMPTY_MAP as Record<string, string>,
  layerVisibility = EMPTY_MAP as Record<string, boolean>,
}) => {
  // Shader programs
  const padProgramRef = useRef<WebGLProgram | null>(null);
  const silkProgramRef = useRef<WebGLProgram | null>(null);
  const techFillProgramRef = useRef<WebGLProgram | null>(null);
  const techFillBufferRef = useRef<WebGLBuffer | null>(null);
  const nativeSilkBufferRef = useRef<WebGLBuffer | null>(null);
  // KiCad-native footprints (shared builder): pad/drill fills + strokes, and the body-fill pass
  const nativeStrokeProgramRef = useRef<WebGLProgram | null>(null);
  const nativeStrokeBufferRef = useRef<WebGLBuffer | null>(null);
  const nativePadFillBufferRef = useRef<WebGLBuffer | null>(null);
  const nativeHaloBufferRef = useRef<WebGLBuffer | null>(null);
  const bodyProgramRef = useRef<WebGLProgram | null>(null);
  const bodyBufferRef = useRef<WebGLBuffer | null>(null);

  // Buffers
  const quadBufferRef = useRef<WebGLBuffer | null>(null);
  const padInstanceBufferRef = useRef<WebGLBuffer | null>(null);
  const silkInstanceBufferRef = useRef<WebGLBuffer | null>(null);
  /** Which typed array is currently resident in each GPU buffer (skip re-uploading unchanged data). */
  const uploadedRef = useRef<{
    pad: Float32Array | null; silk: Float32Array | null; fill: Float32Array | null; line: Float32Array | null;
    nativePad: Float32Array | null; nativeHalo: Float32Array | null; nativeStroke: Float32Array | null; body: Float32Array | null;
  }>({ pad: null, silk: null, fill: null, line: null, nativePad: null, nativeHalo: null, nativeStroke: null, body: null });

  // Persistent Scene Graph
  const sceneGraph = useMemo(() => new FootprintSceneGraph(), []);

  // Synchronize Footprint Scene Graph whenever pcb footprints or selection state changes.
  // Layout effect: it must run BEFORE the unified stage draws this commit's frame.
  const syncVersionRef = useRef(0);
  const geomVersionRef = useRef(0);
  const lastFootprintsRef = useRef<unknown>(null);
  useLayoutEffect(() => {
    const groupFps = groupSelected?.footprints || [];
    sceneGraph.syncFromFootprints(pcb.footprints || [], selectedId, groupFps);
    syncVersionRef.current++;
    if (lastFootprintsRef.current !== pcb.footprints) {
      lastFootprintsRef.current = pcb.footprints;
      geomVersionRef.current++; // geometry / transforms may have changed
    }
  }, [pcb.footprints, selectedId, groupSelected?.footprints?.join(","), sceneGraph]);

  // World-space geometry of every KiCad-native footprint, built with the SAME code as the footprint
  // browser preview. It does not depend on pan / zoom (only on the pad-number threshold), so it is
  // cached across camera moves and shared by the body pass and the footprint pass.
  const nativeStaticRef = useRef<{ deps: unknown[]; scene: NativeStaticScene; contentVersion: number } | null>(null);
  const nativeSceneCacheRef = useRef(new NativeStaticSceneCache());
  const nativeHaloRef = useRef<{ deps: unknown[]; halo: Float32Array } | null>(null);
  /** Last contentVersion uploaded to GPU (footprint pass) — forces bufferData when arrays are patched in-place. */
  const nativeUploadVersionRef = useRef(-1);
  /** Same idea for the body-fill pass (runs as a separate stage pass). */
  const bodyUploadVersionRef = useRef(-1);
  // Instance data of the app's own (non-KiCad) footprints. Independent of pan / zoom / cursor.
  const legacyBuildRef = useRef<{ deps: unknown[]; value: FootprintBuild } | null>(null);
  const showPadNumbers = zoom >= PAD_NUMBER_MIN_ZOOM;
  const showBodyFill = layerVisibility["body fill"] !== false && layerVisibility["body_fill"] !== false;
  const sameDeps = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((d, i) => d === b[i]);
  /** Static geometry (large) — rebuilt only when footprints / style change. Shared by both passes. */
  const getNativeScene = (): { scene: NativeStaticScene; halo: Float32Array } => {
    const sDeps = [pcb.footprints, layerColors, layerVisibility, activeLayer, dimInactiveLayers, showPadNumbers, showBodyFill, sceneGraph, geomVersionRef.current];
    let sc = nativeStaticRef.current;
    if (!sc || !sameDeps(sc.deps, sDeps)) {
      const scene = buildNativeStaticSceneCached({
        footprints: pcb.footprints || [],
        getParent: (id) => sceneGraph.getParent(id),
        layerColors, layerVisibility, activeLayer, dimInactiveLayers, showPadNumbers, showBodyFill,
      }, nativeSceneCacheRef.current);
      sc = {
        deps: sDeps,
        scene,
        contentVersion: nativeSceneCacheRef.current.contentVersion,
      };
      nativeStaticRef.current = sc;
    }
    // Halos (selection / net highlight) — small, recomputed on selection changes only.
    const hDeps = [sc.scene, selection, groupSelected, highlightedNetIds, syncVersionRef.current];
    let hc = nativeHaloRef.current;
    if (!hc || !sameDeps(hc.deps, hDeps)) {
      hc = { deps: hDeps, halo: buildNativeHalos(sc.scene, { selection, groupPadIds: groupSelected?.pads || [], highlightedNetIds }) };
      nativeHaloRef.current = hc;
    }
    return { scene: sc.scene, halo: hc.halo };
  };

  // Draw closure. It is (re)installed by usePcbGLPass whenever one of its inputs changes; the
  // expensive CPU-side geometry (instance arrays, Hershey text strokes, fill triangles) is built
  // lazily ONCE per installation, so frames caused by unrelated changes on the shared canvas
  // (e.g. the cursor moving over the overlay) only re-issue the GL draw calls.
  const drawFootprints = (() => {
    return (frame: PcbGLFrame) => {
      const { gl, ext, physW: w, physH: h, dpr } = frame;
      const padProg = padProgramRef.current;
      const silkProg = silkProgramRef.current;
      if (!padProg || !silkProg) return;

      pcbGLEnableStandardBlend(gl);

      const parents = sceneGraph.getParents();
      if (parents.length === 0) return;

      const FLOATS_PER_PAD = 30;
      const FLOATS_PER_SILK = 18;

      const buildDeps: unknown[] = [
        pcb.footprints, pcb.layers, layerColors, layerVisibility, activeLayer, dimInactiveLayers,
        selection, groupSelected, highlightedNetIds, sceneGraph, syncVersionRef.current,
      ];
      const cachedBuild = legacyBuildRef.current;
      let built: FootprintBuild | null =
        cachedBuild && cachedBuild.deps.length === buildDeps.length && cachedBuild.deps.every((d, i) => d === buildDeps[i])
          ? cachedBuild.value
          : null;

      if (!built) {
        const layerMap = new Map((pcb.layers || []).map((l) => [normalizeLayerId(l.id), l]));
        const drillLayer = layerMap.get("drill");
        const drillHexCol = drillLayer?.color || "#000000";
        const drillR = parseInt(drillHexCol.slice(1, 3), 16) / 255;
        const drillG = parseInt(drillHexCol.slice(3, 5), 16) / 255;
        const drillB = parseInt(drillHexCol.slice(5, 7), 16) / 255;
        const fpById = new Map((pcb.footprints || []).map((f) => [f.id, f] as const));
        const b: FootprintBuild = { padData: null, padCount: 0, silkData: null, silkCount: 0, fillF32: null, packed: null, lineCount: 0 };

        // ------------------------------------------------------------------------
        // 1. Pack Instanced Pad Attributes from Scene Graph
        // ------------------------------------------------------------------------
        // Each pad instance takes:
        // a_parent_mat_col01 (4 floats), a_parent_mat_col2 (2 floats), a_parent_state (2 floats)
        // a_pad_local_pos (2 floats), a_pad_dim_rot (4 floats), a_pad_drill_props (4 floats)
        // a_pad_color (4 floats), a_pad_drill_color (4 floats), a_pad_params (4 floats)
        // Total: 30 floats per instance
        let totalPads = 0;
        const nativeIds = new Set((pcb.footprints || []).filter((f) => !!f?.nativeKicadFootprint).map((f) => f.id));
        // KiCad-native footprints are drawn by the shared render model (see getNativeScene); the SDF
        // pad path below only serves the app's own (non-KiCad) footprints.
        parents.forEach((p) => { if (!nativeIds.has(p.id)) totalPads += (p.pads?.length || 0); });

        if (totalPads > 0) {
          const padData = new Float32Array(totalPads * FLOATS_PER_PAD);
          let offset = 0;

          for (const parent of parents) {
            if (nativeIds.has(parent.id)) continue;
            const mat = parent.matrix; // [a, b, c, d, tx, ty]
            const parentSel = parent.selected ? 1.0 : 0.0;
            const parentFlipped = parent.isFlippedBottom ? 1.0 : 0.0;

            for (const pad of (parent.pads || [])) {
              const padLayer = pad.layer === "multi_layer" 
                ? normalizeLayerId(activeLayer) 
                : normalizeLayerId(pad.layer || (parent.isFlippedBottom ? "bottom_copper" : "top_copper"));

              const isLayerVisible = pad.layer === "multi_layer" || layerMap.get(padLayer)?.visible !== false;
              if (!isLayerVisible) continue;

              const isPadActive = !dimInactiveLayers || pad.layer === "multi_layer" || padLayer === normalizeLayerId(activeLayer);
              const dimAlpha = isPadActive ? 1.0 : 0.25;

              const isPadSel = selection?.kind === "pad" && selection.id === pad.id ? 1.0 : 0.0;
              const isNetHigh = pad.netId !== undefined && highlightedNetIds.includes(pad.netId) ? 1.0 : 0.0;

              // Resolve color
              const hexCol = layerMap.get(padLayer)?.color || getCopperLayerStandardColor(padLayer);
              const r = parseInt(hexCol.slice(1, 3), 16) / 255;
              const g = parseInt(hexCol.slice(3, 5), 16) / 255;
              const b = parseInt(hexCol.slice(5, 7), 16) / 255;

              // Pad Shape ID
              let shapeId = 0.0;
              if (pad.shape === "circle") shapeId = 1.0;
              else if (pad.shape === "roundrect") shapeId = 2.0;
              else if (pad.shape === "oval") shapeId = 3.0;

              // 1. Parent Transform Matrix & State
              padData[offset++] = mat[0];
              padData[offset++] = mat[1];
              padData[offset++] = mat[2];
              padData[offset++] = mat[3];
              padData[offset++] = mat[4];
              padData[offset++] = mat[5];
              padData[offset++] = parentSel;
              padData[offset++] = parentFlipped;

              // 2. Child Local Coordinates & Shapes
              padData[offset++] = pad.localX;
              padData[offset++] = pad.localY;
              padData[offset++] = pad.width;
              padData[offset++] = pad.height;
              padData[offset++] = (pad.localRotationDeg * Math.PI) / 180;
              padData[offset++] = shapeId;

              // 3. Child Drill Properties
              const isDrillVisible = layerMap.get("drill")?.visible !== false;
              padData[offset++] = isDrillVisible ? (pad.drill || 0.0) : 0.0;
              padData[offset++] = pad.drillX || 0.0;
              padData[offset++] = pad.drillY || 0.0;
              padData[offset++] = pad.roundrectRatio || 0.25;

              // 4. Colors
              padData[offset++] = r;
              padData[offset++] = g;
              padData[offset++] = b;
              padData[offset++] = 1.0;

              // Drill hole color
              padData[offset++] = drillR;
              padData[offset++] = drillG;
              padData[offset++] = drillB;
              padData[offset++] = 1.0;

              // 5. Parameters
              padData[offset++] = padLayer === "top_copper" ? 0.0 : 1.0;
              padData[offset++] = isPadSel;
              padData[offset++] = isNetHigh;
              padData[offset++] = dimAlpha;
            }
          }

          const activePadCount = offset / FLOATS_PER_PAD;
          if (activePadCount > 0) {
            b.padData = padData.subarray(0, offset);
            b.padCount = activePadCount;
          }
        }

        // ------------------------------------------------------------------------
        // 2. Pack Instanced Silkscreen Graphics from Scene Graph
        // ------------------------------------------------------------------------
        // a_parent_mat_col01 (4 floats), a_parent_mat_col2 (2 floats)
        // a_silk_p0 (2 floats), a_silk_p1 (2 floats), a_silk_props (4 floats), a_silk_color (4 floats)
        // Total: 18 floats per instance
        let totalSilk = 0;
        parents.forEach((p) => {
          const sourceFp = fpById.get(p.id);
          if (!sourceFp?.nativeKicadFootprint) totalSilk += (p.silkscreenGraphics?.length || 0);
        });

        if (totalSilk > 0) {
          const silkData = new Float32Array(totalSilk * FLOATS_PER_SILK);
          let sOffset = 0;

          for (const parent of parents) {
            const sourceFp = fpById.get(parent.id);
            if (sourceFp?.nativeKicadFootprint) continue;
            const mat = parent.matrix;
            const parentSel = parent.selected ? 1.0 : 0.0;

            for (const g of (parent.silkscreenGraphics || [])) {
              const isSilkVis = layerMap.get(g.layer)?.visible !== false;
              if (!isSilkVis) continue;

              const isSilkActive = !dimInactiveLayers || g.layer === activeLayer;
              const dimAlpha = isSilkActive ? 1.0 : 0.3;

              silkData[sOffset++] = mat[0];
              silkData[sOffset++] = mat[1];
              silkData[sOffset++] = mat[2];
              silkData[sOffset++] = mat[3];
              silkData[sOffset++] = mat[4];
              silkData[sOffset++] = mat[5];

              const p0x = g.p0?.x ?? 0;
              const p0y = g.p0?.y ?? 0;
              const p1x = g.p1?.x ?? 0;
              const p1y = g.p1?.y ?? 0;

              silkData[sOffset++] = p0x;
              silkData[sOffset++] = p0y;
              silkData[sOffset++] = p1x;
              silkData[sOffset++] = p1y;

              silkData[sOffset++] = g.strokeWidth;
              silkData[sOffset++] = parentSel;
              silkData[sOffset++] = dimAlpha;
              silkData[sOffset++] = 0.0;

              // Silkscreen Yellow (#fde047)
              silkData[sOffset++] = 0.99;
              silkData[sOffset++] = 0.88;
              silkData[sOffset++] = 0.28;
              silkData[sOffset++] = 0.95;
            }
          }

          const activeSilkCount = sOffset / FLOATS_PER_SILK;
          if (activeSilkCount > 0) {
            b.silkData = silkData.subarray(0, sOffset);
            b.silkCount = activeSilkCount;
          }
        }

        // ------------------------------------------------------------------------
        // 3. Native KiCad footprint technical layers + Reference/Value + fills.
        //    This is the authoritative PCB footprint renderer. SVG is never used.
        // ------------------------------------------------------------------------
        {
        const lineData: number[] = [];
        const fillData: number[] = [];
        const pushLine = (a:any,b:any,color:number[],width:number, dash:boolean) => {
          // Parent transform is baked here so all native and generated geometry shares
          // exactly the same board transform as pads and the existing scene graph.
          lineData.push(a.x,a.y,b.x,b.y,width,color[0],color[1],color[2],color[3]);
        };
        const pushTri = (a:any,b:any,c:any,color:number[]) => {
          for (const q of [a,b,c]) fillData.push(q.x,q.y,color[0],color[1],color[2],color[3]);
        };

        // Generated/internal footprints: keep their exact scene-graph geometry in
        // WebGL, and add the Reference/Value plus a technical courtyard envelope.
        const pcbLayerVisibility=(pcb.layers||[]).reduce((m:any,l:any)=>(m[l.id]=l.visible,m),{});
        for(const parent of parents){
          const fp=(pcb.footprints||[]).find(f=>f.id===parent.id);
          if(!fp || fp.nativeKicadFootprint) continue;
          const localFab=parent.fabGraphics||[];
          for(const g of localFab){
            const segs=primitiveSegments({kind:"line",start:g.p0,end:g.p1,stroke:{width:g.strokeWidth}},g.strokeWidth);
            const col=hexToRgba(getKicadLayerColor("top_fab",layerColors),0.65);
            for(const q of segs) pushLine(affinePoint(parent.matrix,q.x1,q.y1),affinePoint(parent.matrix,q.x2,q.y2),col,g.strokeWidth,false);
          }
          // Courtyard = exact local footprint envelope, rendered as KiCad-style dashed WebGL.
          const b=parent.localBounds, pts=[{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}];
          for(let i=0;i<4;i++){
            const a=pts[i],bb=pts[(i+1)%4],A=affinePoint(parent.matrix,a.x,a.y),B=affinePoint(parent.matrix,bb.x,bb.y);
            const dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
            const cc=hexToRgba(layerColors["top_courtyard"] || layerColors["courtyard"] || "#c084fc",.9);
            for(let d=0;d<L;d+=.8){const e=Math.min(d+.5,L);pushLine({x:A.x+ux*d,y:A.y+uy*d},{x:A.x+ux*e,y:A.y+uy*e},cc,.05,false);}
          }
        }

          if (fillData.length) b.fillF32 = new Float32Array(fillData);
          if (lineData.length) {
          const lineCount=lineData.length/9;
          const packed=new Float32Array(lineCount*18);
          let o=0;
          for(let i=0;i<lineCount;i++){
            const k=i*9;
            packed[o++]=1;packed[o++]=0;packed[o++]=0;packed[o++]=1;packed[o++]=0;packed[o++]=0; // identity parent
            packed[o++]=lineData[k];packed[o++]=lineData[k+1];packed[o++]=lineData[k+2];packed[o++]=lineData[k+3];
            packed[o++]=lineData[k+4];packed[o++]=0;packed[o++]=1;packed[o++]=0;
            packed[o++]=lineData[k+5];packed[o++]=lineData[k+6];packed[o++]=lineData[k+7];packed[o++]=lineData[k+8];
          }
            b.packed = packed;
            b.lineCount = lineCount;
          }
        }
        built = b;
        legacyBuildRef.current = { deps: buildDeps, value: b };
      }

      // ---------------- draw phase (cheap) ----------------
      // 1. pads
      if (built.padData && built.padCount > 0) {
        const padData = built.padData;
        const activePadCount = built.padCount;
        gl.useProgram(padProg);

        // Upload buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, padInstanceBufferRef.current);
        if (uploadedRef.current.pad !== padData) { gl.bufferData(gl.ARRAY_BUFFER, padData, gl.DYNAMIC_DRAW); uploadedRef.current.pad = padData; }

        // Set Uniforms
        gl.uniform2f(gl.getUniformLocation(padProg, "u_resolution"), w, h);
        gl.uniform2f(gl.getUniformLocation(padProg, "u_pan"), pan.x, pan.y);
        gl.uniform1f(gl.getUniformLocation(padProg, "u_zoom"), zoom);
        gl.uniform1f(gl.getUniformLocation(padProg, "u_rotation"), (boardRotation * Math.PI) / 180);
        gl.uniform1f(gl.getUniformLocation(padProg, "u_dpr"), dpr);

        // Bind Quad
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBufferRef.current);
        const locQuad = gl.getAttribLocation(padProg, "a_quad_pos");
        gl.enableVertexAttribArray(locQuad);
        gl.vertexAttribPointer(locQuad, 2, gl.FLOAT, false, 0, 0);

        // Bind Instanced Attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, padInstanceBufferRef.current);
        const stride = FLOATS_PER_PAD * 4;

        const locMat01 = gl.getAttribLocation(padProg, "a_parent_mat_col01");
        const locMat2 = gl.getAttribLocation(padProg, "a_parent_mat_col2");
        const locPState = gl.getAttribLocation(padProg, "a_parent_state");
        const locLocPos = gl.getAttribLocation(padProg, "a_pad_local_pos");
        const locDimRot = gl.getAttribLocation(padProg, "a_pad_dim_rot");
        const locDrill = gl.getAttribLocation(padProg, "a_pad_drill_props");
        const locColor = gl.getAttribLocation(padProg, "a_pad_color");
        const locDrillCol = gl.getAttribLocation(padProg, "a_pad_drill_color");
        const locParams = gl.getAttribLocation(padProg, "a_pad_params");

        const setupInstancedAttr = (loc: number, size: number, floatOff: number) => {
          if (loc >= 0) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, floatOff * 4);
            ext.vertexAttribDivisorANGLE(loc, 1);
          }
        };

        setupInstancedAttr(locMat01, 4, 0);
        setupInstancedAttr(locMat2, 2, 4);
        setupInstancedAttr(locPState, 2, 6);
        setupInstancedAttr(locLocPos, 2, 8);
        setupInstancedAttr(locDimRot, 4, 10);
        setupInstancedAttr(locDrill, 4, 14);
        setupInstancedAttr(locColor, 4, 18);
        setupInstancedAttr(locDrillCol, 4, 22);
        setupInstancedAttr(locParams, 4, 26);

        // Render All Instanced Pads
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, activePadCount);

        // Reset Divisors
        [locMat01, locMat2, locPState, locLocPos, locDimRot, locDrill, locColor, locDrillCol, locParams].forEach((loc) => {
          if (loc >= 0) ext.vertexAttribDivisorANGLE(loc, 0);
        });
      }

      // 2. silkscreen graphics
      if (built.silkData && built.silkCount > 0) {
        const silkData = built.silkData;
        const activeSilkCount = built.silkCount;
        gl.useProgram(silkProg);

        gl.bindBuffer(gl.ARRAY_BUFFER, silkInstanceBufferRef.current);
        if (uploadedRef.current.silk !== silkData) { gl.bufferData(gl.ARRAY_BUFFER, silkData, gl.DYNAMIC_DRAW); uploadedRef.current.silk = silkData; }

        gl.uniform2f(gl.getUniformLocation(silkProg, "u_resolution"), w, h);
        gl.uniform2f(gl.getUniformLocation(silkProg, "u_pan"), pan.x, pan.y);
        gl.uniform1f(gl.getUniformLocation(silkProg, "u_zoom"), zoom);
        gl.uniform1f(gl.getUniformLocation(silkProg, "u_rotation"), (boardRotation * Math.PI) / 180);
        gl.uniform1f(gl.getUniformLocation(silkProg, "u_dpr"), dpr);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBufferRef.current);
        const locQuad = gl.getAttribLocation(silkProg, "a_quad_pos");
        gl.enableVertexAttribArray(locQuad);
        gl.vertexAttribPointer(locQuad, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, silkInstanceBufferRef.current);
        const sStride = FLOATS_PER_SILK * 4;

        const locSMat01 = gl.getAttribLocation(silkProg, "a_parent_mat_col01");
        const locSMat2 = gl.getAttribLocation(silkProg, "a_parent_mat_col2");
        const locSP0 = gl.getAttribLocation(silkProg, "a_silk_p0");
        const locSP1 = gl.getAttribLocation(silkProg, "a_silk_p1");
        const locSProps = gl.getAttribLocation(silkProg, "a_silk_props");
        const locSCol = gl.getAttribLocation(silkProg, "a_silk_color");

        const setupSilkAttr = (loc: number, size: number, floatOff: number) => {
          if (loc >= 0) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, sStride, floatOff * 4);
            ext.vertexAttribDivisorANGLE(loc, 1);
          }
        };

        setupSilkAttr(locSMat01, 4, 0);
        setupSilkAttr(locSMat2, 2, 4);
        setupSilkAttr(locSP0, 2, 6);
        setupSilkAttr(locSP1, 2, 8);
        setupSilkAttr(locSProps, 4, 10);
        setupSilkAttr(locSCol, 4, 14);

        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, activeSilkCount);

        [locSMat01, locSMat2, locSP0, locSP1, locSProps, locSCol].forEach((loc) => {
          if (loc >= 0) ext.vertexAttribDivisorANGLE(loc, 0);
        });
      }

      // 3. technical layers
      const techProg = techFillProgramRef.current;
      const lineBuf = nativeSilkBufferRef.current;
      const fillBuf = techFillBufferRef.current;
      if (techProg && fillBuf && lineBuf) {
        // Fills first: body fill remains behind outlines/text.
        if (built.fillF32) {
          const fillF32 = built.fillF32;
        gl.useProgram(techProg);
        gl.bindBuffer(gl.ARRAY_BUFFER,fillBuf);
        if (uploadedRef.current.fill !== fillF32) { gl.bufferData(gl.ARRAY_BUFFER,fillF32,gl.DYNAMIC_DRAW); uploadedRef.current.fill = fillF32; }
        gl.uniform2f(gl.getUniformLocation(techProg,"u_resolution"),w,h);
        gl.uniform2f(gl.getUniformLocation(techProg,"u_pan"),pan.x,pan.y);
        gl.uniform1f(gl.getUniformLocation(techProg,"u_zoom"),zoom);
        gl.uniform1f(gl.getUniformLocation(techProg,"u_rotation"),(boardRotation*Math.PI)/180);
        gl.uniform1f(gl.getUniformLocation(techProg,"u_dpr"),dpr);
        const aWorld=gl.getAttribLocation(techProg,"a_world"), aColor=gl.getAttribLocation(techProg,"a_color");
        gl.enableVertexAttribArray(aWorld); gl.vertexAttribPointer(aWorld,2,gl.FLOAT,false,24,0);
        gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor,4,gl.FLOAT,false,24,8);
        gl.drawArrays(gl.TRIANGLES,0,fillF32.length/6);
        }
        // Technical/text line pass uses the same instanced quad path as silkscreen.
        if (built.packed && built.lineCount > 0) {
          const packed = built.packed;
          const lineCount = built.lineCount;
        gl.useProgram(silkProg);
        gl.bindBuffer(gl.ARRAY_BUFFER,lineBuf);if (uploadedRef.current.line !== packed) { gl.bufferData(gl.ARRAY_BUFFER,packed,gl.DYNAMIC_DRAW); uploadedRef.current.line = packed; }
        gl.uniform2f(gl.getUniformLocation(silkProg,"u_resolution"),w,h);
        gl.uniform2f(gl.getUniformLocation(silkProg,"u_pan"),pan.x,pan.y);
        gl.uniform1f(gl.getUniformLocation(silkProg,"u_zoom"),zoom);
        gl.uniform1f(gl.getUniformLocation(silkProg,"u_rotation"),(boardRotation*Math.PI)/180);
        gl.uniform1f(gl.getUniformLocation(silkProg,"u_dpr"),dpr);
        gl.bindBuffer(gl.ARRAY_BUFFER,quadBufferRef.current);
        const qloc=gl.getAttribLocation(silkProg,"a_quad_pos");gl.enableVertexAttribArray(qloc);gl.vertexAttribPointer(qloc,2,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,lineBuf);
        const stride=18*4;
        const setup=(name:string,size:number,off:number)=>{const loc=gl.getAttribLocation(silkProg,name);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,off*4);ext.vertexAttribDivisorANGLE(loc,1);}};
        setup("a_parent_mat_col01",4,0);setup("a_parent_mat_col2",2,4);setup("a_silk_p0",2,6);setup("a_silk_p1",2,8);setup("a_silk_props",4,10);setup("a_silk_color",4,14);
        ext.drawArraysInstancedANGLE(gl.TRIANGLES,0,6,lineCount);
        }
      }

      // 4. KiCad-native footprints — pads, drills, pad numbers, silkscreen, fab, courtyard, text.
      //    Same geometry and stroke shader as the footprint browser preview.
      const { scene, halo } = getNativeScene();
      const nFillProg = techFillProgramRef.current;
      const nStrokeProg = nativeStrokeProgramRef.current;
      const nFillBuf = nativePadFillBufferRef.current;
      const nHaloBuf = nativeHaloBufferRef.current;
      const nStrokeBuf = nativeStrokeBufferRef.current;
      const nQuadBuf = quadBufferRef.current;
      const resetAttribs = () => {
        for (let i = 0; i < 16; i++) { gl.disableVertexAttribArray(i); ext.vertexAttribDivisorANGLE(i, 0); }
      };
      const rot = (boardRotation * Math.PI) / 180;

      // In-place patch keeps the same Float32Array reference — compare contentVersion too.
      const nativeVer = nativeSceneCacheRef.current.contentVersion;
      const nativeDirty = nativeUploadVersionRef.current !== nativeVer;
      if (nativeDirty) nativeUploadVersionRef.current = nativeVer;

      if (nFillProg && nFillBuf && nHaloBuf && (halo.length > 0 || scene.padFill.length > 0)) {
        const cache = nativeSceneCacheRef.current;
        const drawFill = (buf: WebGLBuffer, data: Float32Array, key: "nativeHalo" | "nativePad") => {
          if (data.length === 0) return;
          resetAttribs();
          gl.useProgram(nFillProg);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          if (key === "nativePad") {
            uploadedRef.current[key] = uploadNativePackedArray(
              gl, data, uploadedRef.current[key], nativeDirty, cache.lastFullRebuild, cache.lastDirtyPad
            );
          } else if (nativeDirty || uploadedRef.current[key] !== data) {
            // Halos are rebuilt as a new array on selection changes — always full upload.
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            uploadedRef.current[key] = data;
          }
          gl.uniform2f(gl.getUniformLocation(nFillProg, "u_resolution"), w, h);
          gl.uniform2f(gl.getUniformLocation(nFillProg, "u_pan"), pan.x, pan.y);
          gl.uniform1f(gl.getUniformLocation(nFillProg, "u_zoom"), zoom);
          gl.uniform1f(gl.getUniformLocation(nFillProg, "u_rotation"), rot);
          gl.uniform1f(gl.getUniformLocation(nFillProg, "u_dpr"), dpr);
          const aW = gl.getAttribLocation(nFillProg, "a_world"), aC = gl.getAttribLocation(nFillProg, "a_color");
          gl.enableVertexAttribArray(aW); gl.vertexAttribPointer(aW, 2, gl.FLOAT, false, 24, 0);
          gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 24, 8);
          gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
        };
        drawFill(nHaloBuf, halo, "nativeHalo");        // selection / net halos first …
        drawFill(nFillBuf, scene.padFill, "nativePad"); // … pads and drills on top of them
      }

      if (nStrokeProg && nStrokeBuf && nQuadBuf && scene.strokeCount > 0) {
        resetAttribs();
        gl.useProgram(nStrokeProg);
        gl.uniform2f(gl.getUniformLocation(nStrokeProg, "u_resolution"), w, h);
        gl.uniform2f(gl.getUniformLocation(nStrokeProg, "u_pan"), pan.x, pan.y);
        gl.uniform1f(gl.getUniformLocation(nStrokeProg, "u_zoom"), zoom);
        gl.uniform1f(gl.getUniformLocation(nStrokeProg, "u_rotation"), rot);
        gl.uniform1f(gl.getUniformLocation(nStrokeProg, "u_dpr"), dpr);
        // The preview fragment shader derives its pixel size from u_bounds.z / u_canvas_res.x
        gl.uniform4f(gl.getUniformLocation(nStrokeProg, "u_bounds"), 0, 0, w / Math.max(zoom * dpr, 0.001), 0);
        gl.uniform2f(gl.getUniformLocation(nStrokeProg, "u_canvas_res"), w, h);
        gl.uniform1f(gl.getUniformLocation(nStrokeProg, "u_dashSize"), 0.5);
        gl.uniform1f(gl.getUniformLocation(nStrokeProg, "u_dashRatio"), 0.6);

        // unit quad (per vertex) + one 12-float record per segment (per instance)
        gl.bindBuffer(gl.ARRAY_BUFFER, nQuadBuf);
        const aQuad = gl.getAttribLocation(nStrokeProg, "a_quad_pos");
        gl.enableVertexAttribArray(aQuad); gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, nStrokeBuf);
        uploadedRef.current.nativeStroke = uploadNativePackedArray(
          gl, scene.strokes, uploadedRef.current.nativeStroke, nativeDirty,
          nativeSceneCacheRef.current.lastFullRebuild, nativeSceneCacheRef.current.lastDirtyStroke
        );
        const stride = 12 * 4;
        const at = (name: string, size: number, off: number) => {
          const loc = gl.getAttribLocation(nStrokeProg, name);
          if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4); ext.vertexAttribDivisorANGLE(loc, 1); }
        };
        at("a_seg_p0", 2, 0); at("a_seg_p1", 2, 2); at("a_seg_props", 4, 4); at("a_seg_color", 4, 8);
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, scene.strokeCount);
        resetAttribs();
      }
    };
  })();

  usePcbGLPass(
    "footprints",
    PCB_GL_PASS_ORDER.footprints,
    // ---- init: compile shaders / create buffers on the shared context
    (gl) => {
    // Helper to compile shader
    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Footprints WebGL shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const createProg = (vsSrc: string, fsSrc: string): WebGLProgram | null => {
      const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
      const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;

      const prog = gl.createProgram();
      if (!prog) return null;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Footprints WebGL program link error:", gl.getProgramInfoLog(prog));
        return null;
      }
      return prog;
    };

    padProgramRef.current = createProg(PAD_VERTEX_SHADER, PAD_FRAGMENT_SHADER);
    silkProgramRef.current = createProg(SILK_VERTEX_SHADER, SILK_FRAGMENT_SHADER);
    techFillProgramRef.current = createProg(TECH_FILL_VS, TECH_FILL_FS);
    nativeStrokeProgramRef.current = createProg(NATIVE_STROKE_VS, STROKE_FS_SOURCE);

    // Quad geometry [-1, -1] to [1, 1]
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

    padInstanceBufferRef.current = gl.createBuffer();
    silkInstanceBufferRef.current = gl.createBuffer();
    techFillBufferRef.current = gl.createBuffer();
    nativeSilkBufferRef.current = gl.createBuffer();
    nativeStrokeBufferRef.current = gl.createBuffer();
    nativePadFillBufferRef.current = gl.createBuffer();
    nativeHaloBufferRef.current = gl.createBuffer();

    uploadedRef.current = { pad: null, silk: null, fill: null, line: null, nativePad: null, nativeHalo: null, nativeStroke: null, body: uploadedRef.current.body };

    return () => {
      if (qBuf) gl.deleteBuffer(qBuf);
      if (padInstanceBufferRef.current) gl.deleteBuffer(padInstanceBufferRef.current);
      if (silkInstanceBufferRef.current) gl.deleteBuffer(silkInstanceBufferRef.current);
      if (techFillBufferRef.current) gl.deleteBuffer(techFillBufferRef.current);
      if (nativeSilkBufferRef.current) gl.deleteBuffer(nativeSilkBufferRef.current);
      if (padProgramRef.current) gl.deleteProgram(padProgramRef.current);
      if (silkProgramRef.current) gl.deleteProgram(silkProgramRef.current);
      if (techFillProgramRef.current) gl.deleteProgram(techFillProgramRef.current);
      if (nativeStrokeProgramRef.current) gl.deleteProgram(nativeStrokeProgramRef.current);
      if (nativeStrokeBufferRef.current) gl.deleteBuffer(nativeStrokeBufferRef.current);
      if (nativePadFillBufferRef.current) gl.deleteBuffer(nativePadFillBufferRef.current);
      if (nativeHaloBufferRef.current) gl.deleteBuffer(nativeHaloBufferRef.current);
      nativeHaloBufferRef.current = null;
      nativeStrokeProgramRef.current = null;
      nativeStrokeBufferRef.current = null;
      nativePadFillBufferRef.current = null;
      padProgramRef.current = null;
      silkProgramRef.current = null;
      techFillProgramRef.current = null;
      quadBufferRef.current = null;
      padInstanceBufferRef.current = null;
      silkInstanceBufferRef.current = null;
      techFillBufferRef.current = null;
      nativeSilkBufferRef.current = null;
    };
    },
    drawFootprints,
    [
      pcb.layers,
      pcb.footprints,
      layerColors,
      layerVisibility,
      pan.x,
      pan.y,
      zoom,
      boardRotation,
      activeLayer,
      dimInactiveLayers,
      selectedId,
      selection,
      groupSelected,
      highlightedNetIds,
      sceneGraph,
    ]
  );

  // Component bodies (fab-outline fill) sit BEHIND the copper: their own pass, drawn right after the
  // zones and before tracks / pads / vias, so a body never dims or hides copper.
  usePcbGLPass(
    "footprint-bodies",
    PCB_GL_PASS_ORDER.footprintBodies,
    (gl) => {
      const prog = compileProgram(gl, TECH_FILL_VS, TECH_FILL_FS);
      const buf = gl.createBuffer();
      bodyProgramRef.current = prog;
      bodyBufferRef.current = buf;
      uploadedRef.current.body = null;
      return () => {
        if (buf) gl.deleteBuffer(buf);
        if (prog) gl.deleteProgram(prog);
        bodyProgramRef.current = null;
        bodyBufferRef.current = null;
        uploadedRef.current.body = null;
      };
    },
    (frame) => {
      const { gl, physW: w, physH: h, dpr } = frame;
      const prog = bodyProgramRef.current, buf = bodyBufferRef.current;
      if (!prog || !buf) return;
      const { scene } = getNativeScene();
      if (scene.bodyFill.length === 0) return;
      pcbGLEnableStandardBlend(gl);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const bodyCache = nativeSceneCacheRef.current;
      const bodyVer = bodyCache.contentVersion;
      const bodyDirty = bodyUploadVersionRef.current !== bodyVer;
      if (bodyDirty || uploadedRef.current.body !== scene.bodyFill) {
        uploadedRef.current.body = uploadNativePackedArray(
          gl, scene.bodyFill, uploadedRef.current.body, bodyDirty,
          bodyCache.lastFullRebuild, bodyCache.lastDirtyBody
        );
        bodyUploadVersionRef.current = bodyVer;
      }
      gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), w, h);
      gl.uniform2f(gl.getUniformLocation(prog, "u_pan"), pan.x, pan.y);
      gl.uniform1f(gl.getUniformLocation(prog, "u_zoom"), zoom);
      gl.uniform1f(gl.getUniformLocation(prog, "u_rotation"), (boardRotation * Math.PI) / 180);
      gl.uniform1f(gl.getUniformLocation(prog, "u_dpr"), dpr);
      const aW = gl.getAttribLocation(prog, "a_world"), aC = gl.getAttribLocation(prog, "a_color");
      gl.enableVertexAttribArray(aW); gl.vertexAttribPointer(aW, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 24, 8);
      gl.drawArrays(gl.TRIANGLES, 0, scene.bodyFill.length / 6);
    },
    [
      pcb.layers, pcb.footprints, layerColors, layerVisibility, pan.x, pan.y, zoom, boardRotation,
      activeLayer, dimInactiveLayers, selectedId, selection, groupSelected, highlightedNetIds, sceneGraph,
    ]
  );

  // Rendering happens on the unified PCB canvas (PcbGLStage) — nothing to mount here.
  return null;
};
