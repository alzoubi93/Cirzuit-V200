// WebGL pass for schematic symbol bodies. Built-in CirZuit symbols use the existing SVG-to-vector
// adapter; native KiCad symbols use KiCadParsedSymbol geometry directly so their mm coordinates,
// pins, arcs, fills, mirrors and instance origin are preserved. All resulting geometry is batched
// into a single triangle list for the shared schematic WebGL stage.
//
// Deliberately NOT covered here (left on other WebGL/SVG text paths, see Canvas.tsx):
//  - "realistic" mode (a different renderer, <RealisticComponent> / SchematicWebGLRealisticSymbols)
//  - free-standing text nodes (n.symbol === "text") — drawn via SchematicWebGLBadges
// Two-pin voltage gradient during simulation: SymbolInstance.color2 + gradP0/gradP1.
// Capacitor breathing during simulation IS covered (instance.breathing + live scale pulse).
// Pin markers / selection outlines are drawn by SchematicWebGLSelection.
import { useMemo, useRef, useEffect, useState } from "react";
import { useSchematicGLPass, useSchematicGLStage, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { vectorizeSymbol, resolveVecColor, type VecPrimitive } from "@/lib/symbolVectorize";
import { getImportedKiCadParsedSymbol, kicadFillCss, type KiCadGraphic, type KiCadPin } from "@/lib/kicadSymbol";
import { kicadPointToWorld, WORLD_UNITS_PER_KICAD_MM } from "@/lib/kicadCoordinateSystem";
import earcut from "earcut";
import { getOrCreateFontAtlas, layoutSdfText, type WebGLTextQuad } from "@/lib/webglTextSdf";
import { GRID } from "@/lib/schematic";
import { SYMBOLS } from "@/lib/symbols";
import type { SymbolId, SchematicNode } from "@/lib/schematic";
import type { KiCadSchematicModel } from "@/lib/kicadSchematicCore";
import { getKiCadCoreSymbol } from "@/lib/kicadSchematicCore";

export interface SymbolInstance {
  id: string;
  symbolId: SymbolId;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  scale: number;
  color: string; // resolved runtime color (hex); the sentinel-colored parts of the glyph use this
  /**
   * Optional second color for voltage gradient during simulation (pin0 → pin1).
   * When set with gradP0/gradP1, dynamic-colored glyph parts blend from color→color2
   * along that local-space axis (mirrors the old SVG linearGradient 20%–80% stops).
   */
  color2?: string;
  /** Local symbol-space endpoints of the voltage axis (typically pin0 / pin1). */
  gradP0?: [number, number];
  gradP1?: [number, number];
  /** When true, scale pulses 1.0↔1.08 (capacitor breathing during simulation). */
  breathing?: boolean;
  /** Optional overall opacity (ghost placement). Default 1. */
  alpha?: number;
  /** Background color used by KiCad `fill (type background)` primitives. */
  kicadBackground?: string;
  /** Placed KiCad Reference/Value fields; positions are absolute schematic mm. */
  kicadFields?: { reference?: any; value?: any };
  kicadNodeId?: string;
}


export interface SchematicWebGLSymbolsProps {
  instances: SymbolInstance[];
  view: { x: number; y: number; scale: number };
  kicadCore?: KiCadSchematicModel;
}

const VERTEX_SRC = `
attribute vec2 a_position; // CSS px, already in screen space
attribute vec4 a_color;    // premultiplied
uniform vec2 u_resolution; // physical px
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

function hexToRgba(color: string, alpha = 1): [number, number, number, number] {
  const value = String(color || "").trim();

  // Native KiCad symbol rendering uses rgba(...) for `fill=background`.
  // The old parser treated the leading "rgba(" characters as hexadecimal
  // digits, producing NaN/invalid GPU colors and making imported symbol
  // interiors render as a solid, incorrect color.
  const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgba) {
    const chan = (v: string) => Math.max(0, Math.min(255, Number(v))) / 255;
    const aRaw = rgba[4];
    const a = aRaw == null ? alpha : Math.max(0, Math.min(1, aRaw.endsWith('%') ? Number(aRaw.slice(0, -1)) / 100 : Number(aRaw)));
    return [chan(rgba[1]), chan(rgba[2]), chan(rgba[3]), a * alpha];
  }

  const h = value.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) {
    const r = parseInt(h[0] + h[0], 16) / 255;
    const g = parseInt(h[1] + h[1], 16) / 255;
    const b = parseInt(h[2] + h[2], 16) / 255;
    return [r, g, b, alpha];
  }
  if (/^[0-9a-f]{6,8}$/i.test(h)) {
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
    return [r, g, b, a * alpha];
  }
  return [0.5, 0.5, 0.5, alpha];
}


function mixHex(c1: string, c2: string, t: number): [number, number, number] {
  const [r1, g1, b1] = hexToRgba(c1, 1);
  const [r2, g2, b2] = hexToRgba(c2, 1);
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [r1 + (r2 - r1) * u, g1 + (g2 - g1) * u, b1 + (b2 - b1) * u];
}

/** Smoothstep matching SVG gradient stops at 20% and 80%. */
function gradientT(lx: number, ly: number, p0: [number, number], p1: [number, number]): number {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0.5;
  let t = ((lx - p0[0]) * dx + (ly - p0[1]) * dy) / len2;
  // Map so 0.2→0 and 0.8→1 like the old SVG stops
  t = (t - 0.2) / 0.6;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}



function nativeArcPoints(start: {x:number;y:number}, mid: {x:number;y:number}, end: {x:number;y:number}, segments = 32): [number, number][] {
  const ax = start.x, ay = start.y, bx = mid.x, by = mid.y, cx = end.x, cy = end.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      pts.push([u*u*ax + 2*u*t*bx + t*t*cx, u*u*ay + 2*u*t*by + t*t*cy]);
    }
    return pts;
  }
  const a2 = ax*ax + ay*ay, b2 = bx*bx + by*by, c2 = cx*cx + cy*cy;
  const ox = (a2*(by-cy) + b2*(cy-ay) + c2*(ay-by)) / d;
  const oy = (a2*(cx-bx) + b2*(ax-cx) + c2*(bx-ax)) / d;
  const r = Math.hypot(ax-ox, ay-oy);
  const angle = (x:number,y:number) => Math.atan2(y-oy, x-ox);
  const norm = (a:number) => { let v = a % (Math.PI*2); if (v < 0) v += Math.PI*2; return v; };
  const a0 = norm(angle(ax, ay)), am = norm(angle(bx, by)), a1 = norm(angle(cx, cy));
  const ccwSpan = norm(a1 - a0);
  const midOnCcw = norm(am - a0) <= ccwSpan + 1e-7;
  const span = midOnCcw ? ccwSpan : ccwSpan - Math.PI*2;
  const count = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI / 16)));
  const pts: [number, number][] = [];
  for (let i=0;i<=count;i++) {
    const a = a0 + span * (i/count);
    pts.push([ox + r*Math.cos(a), oy + r*Math.sin(a)]);
  }
  return pts;
}

function nativeBezierPoints(pts: {x:number;y:number}[], segments = 24): [number, number][] {
  if (pts.length < 2) return [];
  const out: [number, number][] = [];
  if (pts.length === 3) {
    for (let i=0;i<=segments;i++) {
      const t=i/segments, u=1-t;
      out.push([u*u*pts[0].x+2*u*t*pts[1].x+t*t*pts[2].x, u*u*pts[0].y+2*u*t*pts[1].y+t*t*pts[2].y]);
    }
    return out;
  }
  const p0=pts[0], p1=pts[1], p2=pts[2], p3=pts[3] || pts[pts.length-1];
  for (let i=0;i<=segments;i++) {
    const t=i/segments, u=1-t;
    out.push([
      u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,
      u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y,
    ]);
  }
  return out;
}

type NativePrimitive = VecPrimitive & {
  triangles?: number[];
  strokeType?: string;
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
};

function nativeGraphicPoints(g: KiCadGraphic, parsed: ReturnType<typeof getImportedKiCadParsedSymbol>, background: string): NativePrimitive[] {
  if (!parsed) return [];
  const bbox = parsed.bbox;
  const point = (p: {x:number;y:number}): [number,number] => {
    const q = kicadPointToWorld(p, bbox);
    return [q.x, q.y];
  };
  // KiCad uses stroke width 0 to mean "use the schematic default line width".
  // It is not a no-stroke command. KiCad's default schematic line width is 6 mil = 0.1524 mm.
  const strokeMm = Number((g as any).stroke?.width ?? 0);
  const stroke = (strokeMm > 0 ? strokeMm : 0.1524) / 2.54;
  // Same fill resolution as the library preview (background / explicit color / none).
  const fillColor = kicadFillCss((g as any).fill);
  void background;
  const out: NativePrimitive[] = [];
  let pts: [number,number][] = [];
  let closed = false;
  if (g.type === "polyline" || g.type === "bezier") {
    pts = g.type === "bezier"
      ? nativeBezierPoints(g.pts).map(([x, y]) => point({ x, y }))
      : g.pts.map(point);
    closed = false;
  } else if (g.type === "rectangle") {
    pts = [point(g.start), [point(g.end)[0], point(g.start)[1]], point(g.end), [point(g.start)[0], point(g.end)[1]]];
    closed = true;
  } else if (g.type === "circle") {
    const c = point(g.center), rx = g.radius/2.54;
    for (let i=0;i<48;i++) { const a=i*Math.PI*2/48; pts.push([c[0]+Math.cos(a)*rx,c[1]+Math.sin(a)*rx]); }
    closed = true;
  } else if (g.type === "arc") {
    pts = nativeArcPoints(g.start,g.mid,g.end).map(point as any);
    closed = false;
  } else if (g.type === "text" || g.type === "text_box") {
    return [];
  }
  if (pts.length < 2) return [];
  if (fillColor && pts.length >= 3) {
    const flat:number[]=[]; for (const p of pts) flat.push(p[0],p[1]);
    const idx=earcut(flat, [], 2);
    for (let i=0;i+2<idx.length;i+=3) out.push({kind:"fill",points:[pts[idx[i]],pts[idx[i+1]],pts[idx[i+2]]],color:fillColor});
  }
  if (stroke > 0 && pts.length >= 2) out.push({
    kind:"stroke", points:pts, closed, color:"\u0000SYMBOL_DYNAMIC_COLOR\u0000", width:stroke,
    strokeType: (g as any).stroke?.type ?? "default", cap: "butt", join: "miter",
  });
  return out;
}

function nativePinPrimitives(pin: KiCadPin, parsed: ReturnType<typeof getImportedKiCadParsedSymbol>): NativePrimitive[] {
  if (!parsed || pin.hide) return [];
  const p0 = kicadPointToWorld(pin.at, parsed.bbox);
  const a = pin.at.angle * Math.PI / 180;
  const endMm = { x: pin.at.x + Math.cos(a) * pin.length, y: pin.at.y + Math.sin(a) * pin.length };
  const p1 = kicadPointToWorld(endMm, parsed.bbox);
  const width = 0.254 / 2.54;
  const color = "\u0000SYMBOL_DYNAMIC_COLOR\u0000";
  const out: NativePrimitive[] = [{ kind:"stroke", points:[[p0.x,p0.y],[p1.x,p1.y]], closed:false, color, width, cap:"butt", join:"miter" }];

  // KiCad pin graphic styles are part of the symbol definition, not decoration.
  // Draw the style marker at the symbol/body end of the pin (p1), in the local
  // world coordinate system. The marker is intentionally geometry, so it remains
  // crisp and participates in the same WebGL transform as the pin line.
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const r = Math.max(0.09, Math.min(0.20, width * 1.6));
  const marker = (points: [number,number][], closed = true, fill = false): NativePrimitive => ({
    kind: fill ? "fill" : "stroke", points, closed, color, width: fill ? 0 : width, join:"round", cap:"round"
  });
  const addCircle = (cx:number, cy:number, radius:number, segments=20) => {
    const pts:[number,number][]=[];
    for(let i=0;i<segments;i++){ const t=i*Math.PI*2/segments; pts.push([cx+Math.cos(t)*radius, cy+Math.sin(t)*radius]); }
    out.push(marker(pts,true,false));
  };
  const addTriangle = (tip:[number,number], base:[number,number], half:number, filled=false) => {
    const bx=base[0], by=base[1];
    const pts:[[number,number],[number,number],[number,number]] = [
      tip,
      [bx + nx*half, by + ny*half],
      [bx - nx*half, by - ny*half],
    ];
    out.push(marker(pts,true,filled));
  };

  const shape = String(pin.shape || "line");
  const markerCenter:[number,number] = [p1.x - ux * r * 1.15, p1.y - uy * r * 1.15];
  if (shape === "inverted" || shape === "inverted_clock" || shape === "input_low" || shape === "clock_low") {
    addCircle(markerCenter[0], markerCenter[1], r, 24);
  }
  if (shape === "clock" || shape === "inverted_clock" || shape === "clock_low" || shape === "edge_clock_high") {
    const base:[number,number] = [p1.x - ux*r*2.8, p1.y - uy*r*2.8];
    const tip:[number,number] = [p1.x - ux*r*0.35, p1.y - uy*r*0.35];
    addTriangle(tip, base, r*1.05, false);
  }
  if (shape === "output_low") {
    const base:[number,number] = [p1.x - ux*r*2.6, p1.y - uy*r*2.6];
    const tip:[number,number] = [p1.x - ux*r*0.3, p1.y - uy*r*0.3];
    addTriangle(tip, base, r*1.0, false);
  }
  if (shape === "non_logic") {
    const a0:[number,number] = [p1.x - ux*r*2.0 + nx*r, p1.y - uy*r*2.0 + ny*r];
    const a1:[number,number] = [p1.x - ux*r*0.3 + nx*r, p1.y - uy*r*0.3 + ny*r];
    const b0:[number,number] = [p1.x - ux*r*2.0 - nx*r, p1.y - uy*r*2.0 - ny*r];
    const b1:[number,number] = [p1.x - ux*r*0.3 - nx*r, p1.y - uy*r*0.3 - ny*r];
    out.push(marker([a0,a1],false,false), marker([b0,b1],false,false));
  }
  return out;
}

function dashPattern(type: string, widthPx: number): number[] | null {
  const t = String(type || "default");
  if (t === "solid" || t === "default" || !t) return null;
  const unit = Math.max(1.5, widthPx * 5);
  if (t === "dot") return [unit * 0.35, unit * 1.65];
  if (t === "dash") return [unit * 3.0, unit * 2.0];
  if (t === "dash_dot") return [unit * 3.0, unit * 1.5, unit * 0.45, unit * 1.5];
  if (t === "dash_dot_dot") return [unit * 3.0, unit * 1.5, unit * 0.45, unit * 1.5, unit * 0.45, unit * 1.5];
  return null;
}

function splitDashedPolyline(points: [number,number][], pattern: number[], closed: boolean): [number,number][][] {
  if (points.length < 2 || !pattern.length) return [points];
  const out:[number,number][][]=[];
  let pat=0, patPos=0, drawing=true;
  const emitSeg=(a:[number,number],b:[number,number])=>{ if(drawing){ const last=out[out.length-1]; if(last && Math.hypot(last[last.length-1][0]-a[0],last[last.length-1][1]-a[1])<1e-6) last.push(b); else out.push([a,b]); } };
  const segs=closed ? points.map((p,i)=>[p,points[(i+1)%points.length]] as [[number,number],[number,number]]) : points.slice(0,-1).map((p,i)=>[p,points[i+1]] as [[number,number],[number,number]]);
  for(const [a,b] of segs){
    let x=a[0],y=a[1], dx=b[0]-x,dy=b[1]-y, remain=Math.hypot(dx,dy); if(remain<1e-9) continue;
    dx/=remain; dy/=remain;
    while(remain>1e-9){
      const take=Math.min(remain, pattern[pat]-patPos);
      const nx=x+dx*take, ny=y+dy*take;
      emitSeg([x,y],[nx,ny]);
      x=nx;y=ny;remain-=take;patPos+=take;
      if(patPos>=pattern[pat]-1e-9){pat=(pat+1)%pattern.length;patPos=0;drawing=!drawing;}
    }
  }
  return out;
}

function appendStrokeMesh(
  verts:number[],
  pts:[number,number][],
  widthPx:number,
  color:[number,number,number,number],
  closed:boolean,
  cap:"butt"|"round"|"square"="butt",
  join:"miter"|"round"|"bevel"="miter"
) {
  if (pts.length < 2 || widthPx <= 0) return;
  const hw = widthPx / 2;
  const addTri = (a:[number,number], b:[number,number], c:[number,number]) => {
    for (const p of [a,b,c]) verts.push(p[0],p[1],color[0],color[1],color[2],color[3]);
  };
  const addQuad = (a:[number,number], b:[number,number], c:[number,number], d:[number,number]) => {
    addTri(a,b,c); addTri(a,c,d);
  };
  const addRoundFan = (center:[number,number], a0:number, a1:number) => {
    let span = a1 - a0;
    while (span <= -Math.PI) span += Math.PI * 2;
    while (span > Math.PI) span -= Math.PI * 2;
    const steps = Math.max(3, Math.ceil(Math.abs(span) / (Math.PI / 10)));
    for (let i=0;i<steps;i++) {
      const t0 = a0 + span * (i/steps);
      const t1 = a0 + span * ((i+1)/steps);
      addTri(center,
        [center[0] + Math.cos(t0)*hw, center[1] + Math.sin(t0)*hw],
        [center[0] + Math.cos(t1)*hw, center[1] + Math.sin(t1)*hw]);
    }
  };
  const segCount = closed ? pts.length : pts.length - 1;
  const dirs:[number,number][] = [];
  const normals:[number,number][] = [];
  for (let i=0;i<segCount;i++) {
    const a=pts[i], b=pts[(i+1)%pts.length];
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len;
    dirs.push([ux,uy]); normals.push([-uy*hw,ux*hw]);
  }

  // Segment bodies.
  for (let i=0;i<segCount;i++) {
    const a=pts[i], b=pts[(i+1)%pts.length];
    const [ux,uy]=dirs[i], [nx,ny]=normals[i];
    let aL:[number,number]=[a[0]+nx,a[1]+ny], aR:[number,number]=[a[0]-nx,a[1]-ny];
    let bL:[number,number]=[b[0]+nx,b[1]+ny], bR:[number,number]=[b[0]-nx,b[1]-ny];
    if (!closed && i===0 && cap==='square') {
      aL=[aL[0]-ux*hw,aL[1]-uy*hw]; aR=[aR[0]-ux*hw,aR[1]-uy*hw];
    }
    if (!closed && i===segCount-1 && cap==='square') {
      bL=[bL[0]+ux*hw,bL[1]+uy*hw]; bR=[bR[0]+ux*hw,bR[1]+uy*hw];
    }
    addQuad(aL,aR,bR,bL);
  }

  // Joins: construct only the outside half of the join. This avoids the
  // overdraw/round-bump artifact of the previous full-circle implementation.
  const first = closed ? 0 : 1;
  const last = closed ? pts.length : pts.length-1;
  for (let i=first;i<last;i++) {
    const idx=i % pts.length, prev=(idx-1+pts.length)%pts.length, next=(idx+1)%pts.length;
    const p=pts[idx];
    const [ux0,uy0]=dirs[prev < segCount ? prev : 0];
    const [ux1,uy1]=dirs[idx < segCount ? idx : 0];
    const cross=ux0*uy1-uy0*ux1;
    if (Math.abs(cross) < 1e-6) continue;
    const side = cross > 0 ? 1 : -1;
    const n0:[number,number]=[-uy0*hw*side, ux0*hw*side];
    const n1:[number,number]=[-uy1*hw*side, ux1*hw*side];
    const a:[number,number]=[p[0]+n0[0],p[1]+n0[1]];
    const b:[number,number]=[p[0]+n1[0],p[1]+n1[1]];
    if (join==='round') {
      const aa=Math.atan2(n0[1],n0[0]), bb=Math.atan2(n1[1],n1[0]);
      addRoundFan(p,aa,bb);
    } else if (join==='bevel') {
      addTri(p,a,b);
    } else {
      // Miter intersection of the two offset lines.
      const det=ux0*uy1-uy0*ux1;
      if (Math.abs(det)<1e-6) { addTri(p,a,b); continue; }
      const qx=b[0]-a[0], qy=b[1]-a[1];
      const t=(qx*uy1-qy*ux1)/det;
      const m:[number,number]=[a[0]+ux0*t,a[1]+uy0*t];
      const miterLen=Math.hypot(m[0]-p[0],m[1]-p[1]);
      if (miterLen > hw*4) addTri(p,a,b);
      else addTri(a,m,b);
    }
  }
  if (!closed && cap==='round') {
    const [d0x,d0y]=dirs[0], [dnx,dny]=dirs[segCount-1];
    addRoundFan(pts[0], Math.atan2(-d0y,-d0x)-Math.PI/2, Math.atan2(-d0y,-d0x)+Math.PI/2);
    addRoundFan(pts[pts.length-1], Math.atan2(dny,dnx)-Math.PI/2, Math.atan2(dny,dnx)+Math.PI/2);
  }
}

function transformPoint(
  p: [number, number],
  centerX: number,
  centerY: number,
  inst: SymbolInstance,
  view: { x: number; y: number; scale: number }
): [number, number] {
  const liveScale = inst.breathing
    ? inst.scale * (1 + 0.08 * (0.5 + 0.5 * Math.sin(((typeof performance !== "undefined" ? performance.now() : 0) / 1000) * (Math.PI * 2 / 1.5))))
    : inst.scale;
  let x = p[0] * liveScale;
  let y = p[1] * liveScale;
  let pivotX = centerX * liveScale;
  let pivotY = centerY * liveScale;

  // KiCad places a symbol at its library (0,0) anchor, not at the visual
  // bounding-box center. Imported symbols such as 02x14 connectors have a
  // deliberately asymmetric bbox, so rotating around centerX/centerY causes
  // pins and labels to swing away from their electrical coordinates.
  let mirrorX = false;
  let mirrorY = false;
  if (inst.symbolId.startsWith("kicad:")) {
    const native = getImportedKiCadParsedSymbol(inst.symbolId);
    if (native) {
      pivotX = (-native.bbox.minX * WORLD_UNITS_PER_KICAD_MM) * liveScale;
      pivotY = (native.bbox.maxY * WORLD_UNITS_PER_KICAD_MM) * liveScale;
    }
  }
  const coreSymbol = (inst as any).__kicadCoreSymbol as { mirrorX?: boolean; mirrorY?: boolean } | undefined;
  mirrorX = !!coreSymbol?.mirrorX;
  mirrorY = !!coreSymbol?.mirrorY;
  // KiCad mirror-y = horizontal flip (X); mirror-x = vertical flip (Y).
  if (mirrorY) x = pivotX - (x - pivotX);
  if (mirrorX) y = pivotY - (y - pivotY);

  const rad = (inst.rotation * Math.PI) / 180;
  const dx = x - pivotX, dy = y - pivotY;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  x = dx * cos - dy * sin + pivotX;
  y = dx * sin + dy * cos + pivotY;
  x += inst.x;
  y += inst.y;
  const worldScale = view.scale * GRID;
  return [x * worldScale + view.x, y * worldScale + view.y];
}


const KICAD_TEXT_VERTEX_SRC = `
attribute vec2 a_quad_pos;
attribute vec4 a_pos_size;
attribute vec4 a_uv_bounds;
attribute float a_rotation;
attribute float a_mirror;
attribute vec4 a_color;
uniform vec2 u_resolution;
uniform float u_dpr;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  v_color = a_color;
  vec2 uv = a_quad_pos + vec2(0.5);
  if (a_mirror > 0.5) uv.x = 1.0 - uv.x;
  v_uv = vec2(mix(a_uv_bounds.x, a_uv_bounds.z, uv.x), mix(a_uv_bounds.y, a_uv_bounds.w, uv.y));
  vec2 local = vec2(a_quad_pos.x * a_pos_size.z, a_quad_pos.y * a_pos_size.w);
  float c = cos(a_rotation), s = sin(a_rotation);
  local = vec2(local.x*c-local.y*s, local.x*s+local.y*c);
  vec2 screen = a_pos_size.xy + local;
  vec2 clip = vec2((screen.x*u_dpr/u_resolution.x)*2.0-1.0, 1.0-(screen.y*u_dpr/u_resolution.y)*2.0);
  gl_Position = vec4(clip,0.0,1.0);
}
`;
const KICAD_TEXT_FRAGMENT_SRC = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform sampler2D u_font_atlas;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec4 texel = texture2D(u_font_atlas, v_uv);
  float sigDist = texel.a - 0.5;
  vec2 screenTexSize = vec2(1.0)/max(fwidth(v_uv),vec2(0.000001));
  float screenPxRange = max(0.5*(8.0/1024.0)*(screenTexSize.x+screenTexSize.y),1.0);
  float alpha = clamp(sigDist*screenPxRange+0.5,0.0,1.0);
  if(alpha<=0.005) discard;
  gl_FragColor = vec4(v_color.rgb,alpha*v_color.a);
}
`;
function toEssl300Local(vsSrc: string, fsSrc: string) {
  return {
    vs: "#version 300 es\n" + vsSrc.trim().replace(/\battribute\b/g,"in").replace(/\bvarying\b/g,"out"),
    fs: "#version 300 es\n" + fsSrc.trim().replace(/\bvarying\b/g,"in").replace(/texture2D/g,"texture").replace(/gl_FragColor/g,"outColor").replace(/precision highp float;/,"precision highp float;\nout vec4 outColor;")
  };
}
const KICAD_TEXT_FLOATS = 14;


type KiCadTextGLResources = { program:WebGLProgram; texture:WebGLTexture; quad:WebGLBuffer; instBuf:WebGLBuffer };
const kicadTextResources = new WeakMap<WebGLRenderingContext|WebGL2RenderingContext, KiCadTextGLResources>();
function drawSdfTextPass(frame:PcbGLFrame, quads:WebGLTextQuad[], r:KiCadTextGLResources){
  const gl=frame.gl, ext=frame.ext; gl.useProgram(r.program);
  const data=new Float32Array(quads.length*KICAD_TEXT_FLOATS); let o=0;
  for(const q of quads){ data[o++]=q.x;data[o++]=q.y;data[o++]=q.w;data[o++]=q.h;data[o++]=q.u0;data[o++]=q.v0;data[o++]=q.u1;data[o++]=q.v1;data[o++]=q.rotationRad;data[o++]=q.mirror?1:0;data[o++]=q.color[0];data[o++]=q.color[1];data[o++]=q.color[2];data[o++]=q.color[3]; }
  gl.bindBuffer(gl.ARRAY_BUFFER,r.instBuf); gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.uniform2f(gl.getUniformLocation(r.program,"u_resolution"),frame.physW,frame.physH); gl.uniform1f(gl.getUniformLocation(r.program,"u_dpr"),frame.dpr); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,r.texture); gl.uniform1i(gl.getUniformLocation(r.program,"u_font_atlas"),0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER,r.quad); const aq=gl.getAttribLocation(r.program,"a_quad_pos"); gl.enableVertexAttribArray(aq); gl.vertexAttribPointer(aq,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,r.instBuf); const stride=KICAD_TEXT_FLOATS*4;
  const attrs:[[string,number,number]]|any=[["a_pos_size",4,0],["a_uv_bounds",4,16],["a_rotation",1,32],["a_mirror",1,36],["a_color",4,40]];
  for(const [name,size,off] of attrs){const loc=gl.getAttribLocation(r.program,name);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,off);ext.vertexAttribDivisorANGLE(loc,1);}}
  ext.drawArraysInstancedANGLE(gl.TRIANGLES,0,6,quads.length);
  for(const [name] of attrs){const loc=gl.getAttribLocation(r.program,name);if(loc>=0)ext.vertexAttribDivisorANGLE(loc,0);}
}

export function SchematicWebGLSymbols({ instances, view, kicadCore }: SchematicWebGLSymbolsProps): null {
  const coreByNode = useMemo(() => new Map((kicadCore?.symbols ?? []).map(s => [s.nodeId, s])), [kicadCore]);
  const renderInstances = useMemo(() => instances.map(i => ({ ...i, __kicadCoreSymbol: i.kicadNodeId ? coreByNode.get(i.kicadNodeId) : undefined } as SymbolInstance & { __kicadCoreSymbol?: any })), [instances, coreByNode]);
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const vertexCountRef = useRef(0);
  const locsRef = useRef<{
    aPosition: number;
    aColor: number;
    uResolution: WebGLUniformLocation | null;
    uDpr: WebGLUniformLocation | null;
  } | null>(null);
  const [animTick, setAnimTick] = useState(0);
  const core = useSchematicGLStage();

  // Rebuild the flattened vertex buffer whenever any instance's transform/color changes.
  const vertexData = useMemo(() => {
    // [x, y, r, g, b, a] per vertex, triangles only.
    const verts: number[] = [];
    const strokeScale = view.scale * GRID;

    for (const inst of renderInstances) {
      const native = inst.symbolId.startsWith("kicad:") ? getImportedKiCadParsedSymbol(inst.symbolId) : undefined;
      // Do not make the native KiCad render path depend on the mutable SYMBOLS
      // catalog. During a fresh import (and after HMR) the parsed native symbol
      // can exist before the compatibility catalog has been populated.
      const catalogSym = SYMBOLS[inst.symbolId];
      const sym = catalogSym ?? (native ? {
        id: inst.symbolId, category: "ic" as const,
        width: Math.max(0.5, (native.bbox.maxX - native.bbox.minX) * WORLD_UNITS_PER_KICAD_MM),
        height: Math.max(0.5, (native.bbox.maxY - native.bbox.minY) * WORLD_UNITS_PER_KICAD_MM),
        pins: native.pins.map((p) => ({ x: (p.at.x - native.bbox.minX) * WORLD_UNITS_PER_KICAD_MM, y: (native.bbox.maxY - p.at.y) * WORLD_UNITS_PER_KICAD_MM, number: p.number || undefined, name: p.name !== "~" ? p.name : undefined, hide: p.hide })),
        prefix: native.reference || "U", defaultValue: native.value || native.name,
        draw: () => null,
      } : undefined);
      if (!sym) continue;
      const glyph: NativePrimitive[] = native
        ? [
            ...native.bodyGraphics.flatMap((g) => nativeGraphicPoints(g, native, inst.kicadBackground || "#ffffff")),
            ...native.pins.flatMap((p) => nativePinPrimitives(p, native)),
          ]
        : vectorizeSymbol(inst.symbolId, sym.draw);
      if (glyph.length === 0) continue;
      const centerX = sym.width / 2, centerY = sym.height / 2;

      const useGrad = !!(inst.color2 && inst.gradP0 && inst.gradP1);
      const alphaMul = inst.alpha ?? 1;

      const colorAtLocal = (lx: number, ly: number, baseResolved: string): [number, number, number, number] => {
        // Only gradient the dynamic (sentinel) color; literal colors in the glyph stay as authored.
        if (useGrad && baseResolved === inst.color) {
          const t = gradientT(lx, ly, inst.gradP0!, inst.gradP1!);
          const [r, g, b] = mixHex(inst.color, inst.color2!, t);
          const a = alphaMul;
          return [r * a, g * a, b * a, a];
        }
        const [r, g, b, a0] = hexToRgba(baseResolved, 1);
        const a = a0 * alphaMul;
        return [r * a, g * a, b * a, a];
      };

      for (const prim of glyph as VecPrimitive[]) {
        const resolved = resolveVecColor(prim.color, inst.color);

        if (prim.kind === "fill") {
          const localPts = prim.points;
          const screenPts = localPts.map((p) => transformPoint(p, centerX, centerY, inst, view));
          const triangles = (prim as NativePrimitive).triangles;
          const triplets = triangles
            ? Array.from({ length: triangles.length / 3 }, (_, k) => [triangles[k*3], triangles[k*3+1], triangles[k*3+2]])
            : Array.from({ length: Math.max(0, screenPts.length - 2) }, (_, k) => [0, k + 1, k + 2]);
          for (const [i0, i1, i2] of triplets) {
            const cols = [i0, i1, i2].map((idx) => {
              const [lx, ly] = localPts[idx];
              return colorAtLocal(lx, ly, resolved);
            });
            const [x0, y0] = screenPts[i0];
            const [x1, y1] = screenPts[i1];
            const [x2, y2] = screenPts[i2];
            const c0 = cols[0], c1 = cols[1], c2 = cols[2];
            verts.push(
              x0, y0, c0[0], c0[1], c0[2], c0[3],
              x1, y1, c1[0], c1[1], c1[2], c1[3],
              x2, y2, c2[0], c2[1], c2[2], c2[3]
            );
          }
        } else {
          const localPts = prim.points;
          const screenPts = localPts.map((p) => transformPoint(p, centerX, centerY, inst, view));
          const widthPx = Math.max(0.5, prim.width * inst.scale * strokeScale);
          const dash = dashPattern((prim as NativePrimitive).strokeType ?? "default", widthPx);
          const paths = dash ? splitDashedPolyline(screenPts, dash, !!prim.closed) : [screenPts];
          for (const path of paths) {
            if (path.length < 2) continue;
            const [lx0,ly0]=localPts[0];
            const [lx1,ly1]=localPts[Math.min(1,localPts.length-1)];
            const [cr,cg,cb,ca] = colorAtLocal((lx0+lx1)/2,(ly0+ly1)/2,resolved);
            appendStrokeMesh(verts, path, widthPx, [cr,cg,cb,ca], !dash && !!prim.closed, (prim as NativePrimitive).cap ?? "butt", (prim as NativePrimitive).join ?? "miter");
          }
        }
      }
    }
    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderInstances, view.x, view.y, view.scale, animTick]);


  // Native KiCad text is kept in the same coordinate contract as symbol geometry.
  // KiCad stores text in mm/Y-up; kicadPointToWorld converts the anchor to the
  // local top-left world space, while the final rotation is composed with the
  // schematic instance rotation. This prevents the common 90/180° text drift.
  const kicadTextQuads = useMemo(() => {
    const atlas = getOrCreateFontAtlas();
    const worldScale = view.scale * GRID;
    const all: WebGLTextQuad[] = [];
    const toJustify = (j?: string): "left" | "center" | "right" => j === "left" || j === "right" ? j : "center";
    const toVertical = (j?: string): "top" | "middle" | "bottom" => j === "top" ? "top" : j === "bottom" ? "bottom" : "middle";
    for (const inst of renderInstances) {
      if (!inst.symbolId.startsWith("kicad:")) continue;
      const native = getImportedKiCadParsedSymbol(inst.symbolId);
      if (!native) continue;
      const sym = SYMBOLS[inst.symbolId];
      const emit = (text: string, at: {x:number;y:number;angle:number}, effects: any, hidden?: boolean) => {
        if (!text || hidden || effects?.hidden) return;
        const q = kicadPointToWorld(at, native.bbox);
        const centerX = sym.width / 2, centerY = sym.height / 2;
        const font = effects?.font;
        const sizeMm = Number(font?.size?.y ?? font?.size?.x ?? 1.27);
        const size = Math.max(0.05, sizeMm * WORLD_UNITS_PER_KICAD_MM);
        const anchor = transformPoint([q.x, q.y], centerX, centerY, inst, view);
        const angle = inst.rotation - Number(at.angle || 0);
        const [r,g,b,a] = hexToRgba(inst.color,1);
        const qs = layoutSdfText(atlas, {
          text,
          x: q.x,
          y: q.y,
          size,
          rotationDeg: angle,
          mirror: !!effects?.justify?.mirror,
          color: [r,g,b,a],
          justify: toJustify(effects?.justify?.horizontal),
          verticalAlign: toVertical(effects?.justify?.vertical),
          thickness: Math.max(0, Number(font?.thickness ?? 0) * WORLD_UNITS_PER_KICAD_MM),
        });
        const textScale = view.scale * GRID * inst.scale;
        all.push(...qs.map(v => ({
          ...v,
          x: anchor[0] + (v.x - q.x) * textScale,
          y: anchor[1] + (v.y - q.y) * textScale,
          w: v.w * textScale,
          h: v.h * textScale,
        })));
      };
      for (const g of native.bodyGraphics) {
        if (g.type === "text") emit(g.text, g.at, g.effects, g.hide);
        else if (g.type === "text_box") emit(g.text, g.at, g.effects, g.hide);
      }
      // Reference/Value in native.properties are the library defaults (for example
      // C_Small or GND), not the placed-instance field values.  Canvas already renders
      // the instance fields (C19, 0.1uF, GND, etc.). Rendering these library defaults here
      // caused the visible duplicates seen after KiCad import. Keep other visible custom
      // library properties, but never draw the default Reference/Value pair twice.
      for (const prop of native.properties) {
        if (prop.name === "Reference" || prop.name === "Value") continue;
        emit(prop.value, prop.at, prop.effects, prop.hide);
      }

      // Placed symbol fields are stored in the schematic instance and their
      // `(at ...)` coordinates are already absolute schematic coordinates.
      // Do not run them through the library-symbol transform a second time.
      const emitPlacedField = (field: any) => {
        if (!field || !field.value || field.hidden || field.effects?.hidden || !field.at) return;
        const font = field.effects?.font;
        const sizeMm = Number(font?.size?.y ?? font?.size?.x ?? 1.27);
        const size = Math.max(0.05, sizeMm * WORLD_UNITS_PER_KICAD_MM);
        const jh = field.effects?.justify?.[0] ?? field.effects?.justify?.horizontal;
        const jv = field.effects?.justify?.[1] ?? field.effects?.justify?.vertical;
        const just = jh === "left" || jh === "right" ? jh : "center";
        const vert = jv === "top" ? "top" : jv === "bottom" ? "bottom" : "middle";
        const rawAngle = Number(field.at.angle || 0);
        const angle = rawAngle === 90 ? -90 : rawAngle === 270 ? 90 : 0;
        const x = Number(field.at.x || 0) * WORLD_UNITS_PER_KICAD_MM;
        const y = Number(field.at.y || 0) * WORLD_UNITS_PER_KICAD_MM;
        const [r,g,b,a] = hexToRgba(inst.color,1);
        const qs = layoutSdfText(atlas, {
          text: String(field.value), x, y, size, rotationDeg: angle,
          mirror: !!field.effects?.justify?.mirror, color:[r,g,b,a],
          justify: just, verticalAlign: vert,
          thickness: Math.max(0, Number(font?.thickness ?? 0) * WORLD_UNITS_PER_KICAD_MM),
        });
        all.push(...qs.map(v => ({
          ...v, x: v.x * worldScale + view.x, y: v.y * worldScale + view.y,
          w: v.w * worldScale, h: v.h * worldScale,
        })));
      };
      emitPlacedField(inst.kicadFields?.reference);
      emitPlacedField(inst.kicadFields?.value);
    }
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderInstances, view.x, view.y, view.scale]);

  useSchematicGLPass(
    "symbols",
    SCHEMATIC_GL_PASS_ORDER.symbols,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLSymbols shader error:", gl.getShaderInfoLog(shader));
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
        console.error("SchematicWebGLSymbols link error:", gl.getProgramInfoLog(program));
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
      if (!program || !locs || !buffer) return;
      if (vertexData.length === 0) { vertexCountRef.current = 0; return; }

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

      const vertexCount = vertexData.length / 6;
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    },
    [vertexData]
  );


  useSchematicGLPass(
    "kicadSymbolText",
    SCHEMATIC_GL_PASS_ORDER.symbols + 5,
    (gl: PcbGL, ext, isGL2) => {
      const src = isGL2 ? toEssl300Local(KICAD_TEXT_VERTEX_SRC, KICAD_TEXT_FRAGMENT_SRC) : { vs: KICAD_TEXT_VERTEX_SRC, fs: KICAD_TEXT_FRAGMENT_SRC };
      const compile = (type:number, code:string) => { const sh=gl.createShader(type); if(!sh) return null; gl.shaderSource(sh,code); gl.compileShader(sh); if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){ console.error("KiCad text shader:",gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null;} return sh; };
      const vs=compile(gl.VERTEX_SHADER,src.vs), fs=compile(gl.FRAGMENT_SHADER,src.fs); if(!vs||!fs) return;
      const program=gl.createProgram(); if(!program) return; gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)){console.error("KiCad text link:",gl.getProgramInfoLog(program)); gl.deleteProgram(program); return;}
      const atlas=getOrCreateFontAtlas(); const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas.canvas); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const quad=gl.createBuffer(), instBuf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,quad); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-0.5,-0.5,0.5,-0.5,-0.5,0.5,0.5,-0.5,0.5,0.5,-0.5,0.5]),gl.STATIC_DRAW);
      kicadTextResources.set(gl,{program,texture:tex!,quad:quad!,instBuf:instBuf!});
      return () => { kicadTextResources.delete(gl); gl.deleteTexture(tex); if(quad) gl.deleteBuffer(quad); if(instBuf) gl.deleteBuffer(instBuf); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); };
    },
    (frame:PcbGLFrame) => {
      if(!kicadTextQuads.length) return;
      // The implementation mirrors the shared SDF badge pass, but is isolated so
      // KiCad text remains ordered immediately above its native symbol geometry.
      // Locate resources from the pass closure via a small stable cache on the GL object.
      const holder=kicadTextResources.get(frame.gl);
      if(!holder) return;
      drawSdfTextPass(frame,kicadTextQuads,holder);
    },
    [kicadTextQuads]
  );

  // Animate while any instance is breathing (capacitor during sim).
  useEffect(() => {
    const hasBreathing = instances.some((i) => i.breathing);
    if (!hasBreathing) return;
    let rafId = 0;
    const tick = () => {
      setAnimTick((t) => t + 1);
      core.requestRender();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [core, instances]);

  return null;
}

