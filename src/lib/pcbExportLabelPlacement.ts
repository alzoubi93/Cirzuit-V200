import type { PcbDoc, PcbFootprint } from "./pcb";
import { checkIfPolarizedCapacitor } from "./pcb";

export interface ExportLabelPlacement {
  kind: "reference" | "value";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
}

type Rect = { x: number; y: number; w: number; h: number };

function rotPoint(x: number, y: number, angleDeg: number) {
  const a = angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: c * x - s * y, y: s * x + c * y };
}
function invPoint(x: number, y: number, angleDeg: number) {
  return rotPoint(x, y, -angleDeg);
}
function padRect(p: any): Rect {
  return { x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height };
}
function expand(r: Rect, e: number): Rect { return { x: r.x - e, y: r.y - e, w: r.w + 2 * e, h: r.h + 2 * e }; }
function intersects(a: Rect, b: Rect) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function textRect(x: number, y: number, text: string, size: number): Rect {
  const w = Math.max(size * 0.72, text.length * size * 0.62);
  return { x: x - w / 2, y: y - size * 0.55, w, h: size * 1.1 };
}

function segmentRect(x1: number, y1: number, x2: number, y2: number, pad: number): Rect {
  return expand({
    x: Math.min(x1, x2), y: Math.min(y1, y2),
    w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
  }, pad);
}

/** Convert silkscreen strokes into thin collision geometry.
 * Important: a rectangle/circle is a STROKE, not a filled obstacle.
 * The previous implementation used the whole bounding box, which made
 * perfectly valid empty body areas look occupied and pushed labels far away.
 */
function graphicObstacles(fp: PcbFootprint): Rect[] {
  const out: Rect[] = [];
  for (const g of (fp.nativeKicadFootprint?.graphics || []) as any[]) {
    if (!(g.layer === "F.SilkS" || g.layer === "B.SilkS" || g.layer === "silk" || g.layer === "silkscreen" || g.layer === "bottom_silkscreen")) continue;
    if (g.kind === "text" || g.kind === "text_box" || g.kind === "textbox") continue;
    const sw = Math.max(0.12, Number(g.stroke?.width || 0.15)) + 0.12;
    if (g.kind === "line" && g.start && g.end) {
      out.push(segmentRect(g.start.x, g.start.y, g.end.x, g.end.y, sw));
    } else if (g.kind === "circle" && g.center) {
      const r = Number(g.radius || 0);
      const n = 32;
      for (let i = 1; i <= n; i++) {
        const a0 = ((i - 1) / n) * Math.PI * 2, a1 = (i / n) * Math.PI * 2;
        out.push(segmentRect(g.center.x + Math.cos(a0) * r, g.center.y + Math.sin(a0) * r,
          g.center.x + Math.cos(a1) * r, g.center.y + Math.sin(a1) * r, sw));
      }
    } else if (g.kind === "rect" && g.start && g.end) {
      const x1 = Math.min(g.start.x, g.end.x), x2 = Math.max(g.start.x, g.end.x);
      const y1 = Math.min(g.start.y, g.end.y), y2 = Math.max(g.start.y, g.end.y);
      out.push(segmentRect(x1,y1,x2,y1,sw), segmentRect(x2,y1,x2,y2,sw),
        segmentRect(x2,y2,x1,y2,sw), segmentRect(x1,y2,x1,y1,sw));
    } else if ((g.kind === "poly" || g.kind === "curve") && Array.isArray(g.points) && g.points.length > 1) {
      for (let i = 1; i < g.points.length; i++) {
        const a = g.points[i - 1], b = g.points[i];
        out.push(segmentRect(a.x,a.y,b.x,b.y,sw));
      }
    }
  }
  return out;
}

function globalObstacles(pcb: PcbDoc, self: PcbFootprint): { x:number;y:number;w:number;h:number }[] {
  const out: Rect[] = [];
  for (const fp of pcb.footprints || []) {
    if (fp.id === self.id) continue;
    for (const p of fp.pads || []) {
      const q = rotPoint(p.x, p.y, fp.rotation); out.push(expand({x:fp.x+q.x-p.width/2,y:fp.y+q.y-p.height/2,w:p.width,h:p.height},0.12));
    }
    for (const g of (fp.nativeKicadFootprint?.graphics || []) as any[]) {
      if (!(g.layer === "F.SilkS" || g.layer === "B.SilkS" || g.layer === "silk" || g.layer === "silkscreen" || g.layer === "bottom_silkscreen")) continue;
      if (g.kind === "text" || g.kind === "text_box" || g.kind === "textbox") continue;
      const sw=Math.max(0.12,Number(g.stroke?.width||0.15))+0.12;
      let box: Rect | null = null;
      if(g.kind === "line" && g.start && g.end) box={x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),w:Math.abs(g.end.x-g.start.x),h:Math.abs(g.end.y-g.start.y)};
      else if(g.kind === "circle" && g.center){const r=Number(g.radius||0);box={x:g.center.x-r,y:g.center.y-r,w:2*r,h:2*r};}
      else if(g.kind === "rect" && g.start && g.end) box={x:Math.min(g.start.x,g.end.x),y:Math.min(g.start.y,g.end.y),w:Math.abs(g.end.x-g.start.x),h:Math.abs(g.end.y-g.start.y)};
      else if((g.kind === "poly"||g.kind === "curve")&&Array.isArray(g.points)&&g.points.length){const xs=g.points.map((q:any)=>q.x),ys=g.points.map((q:any)=>q.y);box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
      if(box){const corners=[rotPoint(box.x,box.y,fp.rotation),rotPoint(box.x+box.w,box.y,fp.rotation),rotPoint(box.x,box.y+box.h,fp.rotation),rotPoint(box.x+box.w,box.y+box.h,fp.rotation)];const xs=corners.map(q=>q.x+fp.x),ys=corners.map(q=>q.y+fp.y);out.push(expand({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)},sw));}
    }
  }
  for (const p of pcb.pads || []) out.push(expand({x:p.x-p.width/2,y:p.y-p.height/2,w:p.width,h:p.height},0.12));
  for (const v of pcb.vias || []) out.push(expand({x:v.x-v.diameter/2,y:v.y-v.diameter/2,w:v.diameter,h:v.diameter},0.12));
  for (const t of pcb.tracks || []) {
    for (let i=1;i<t.points.length;i++) {
      const a=t.points[i-1], b=t.points[i], pad=Math.max(0.12,(t.width||0.15)/2)+0.12;
      out.push(expand({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)},pad));
    }
  }
  for (const t of pcb.texts || []) {
    const size=Number(t.size||1), q=rotPoint(t.x,t.y,0);
    out.push(expand({x:q.x-size*Math.max(1,String(t.text||"").length)*0.31,y:q.y-size*0.55,w:size*Math.max(1,String(t.text||"").length)*0.62,h:size*1.1},0.12));
  }
  return out;
}

/**
 * Export-only placement. Labels prefer the component's own empty body space first,
 * then fall back to safe outside positions. Every candidate is tested against pads,
 * tracks, vias and silkscreen geometry with a small keep-out margin.
 */
export function placePcbExportLabels(pcb: PcbDoc, fp: PcbFootprint): ExportLabelPlacement[] {
  const sym = String(fp.symbol || "").toLowerCase(), ref = String(fp.reference || "").toLowerCase();
  const isFuse = sym.includes("fuse") || ref.startsWith("f");
  const isLed = sym.includes("led") || (sym.includes("diode") && sym.includes("light"));
  const isPot = sym.includes("potentiometer") || sym.includes("var_resistor") || ref.startsWith("rv");
  const isPolar = checkIfPolarizedCapacitor(fp);
  const isInductor = sym.includes("inductor") || sym.includes("coil") || ref.startsWith("l");
  const isResistor = sym.includes("resistor") || ref.startsWith("r");
  const isDiode = !isLed && (sym.includes("diode") || ref.startsWith("d"));
  const isCapacitor = !isPolar && (sym.includes("capacitor") || ref.startsWith("c"));

  let minX=0,minY=0,maxX=0,maxY=0;
  for (const p of fp.pads || []) { minX=Math.min(minX,p.x-p.width/2); maxX=Math.max(maxX,p.x+p.width/2); minY=Math.min(minY,p.y-p.height/2); maxY=Math.max(maxY,p.y+p.height/2); }
  const bw=Math.max(1,maxX-minX+1.2), bh=Math.max(1,maxY-minY+1.2), cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const refText=fp.reference?.trim() || "", valText=fp.value?.trim() || "";
  if (!refText && !valText) return [];

  const localObstacles: Rect[] = [];
  for (const p of fp.pads || []) localObstacles.push(expand(padRect(p),0.18));
  localObstacles.push(...graphicObstacles(fp));
  for (const g of globalObstacles(pcb, fp)) {
    const corners=[invPoint(g.x-fp.x,g.y-fp.y,fp.rotation),invPoint(g.x+g.w-fp.x,g.y-fp.y,fp.rotation),invPoint(g.x-fp.x,g.y+g.h-fp.y,fp.rotation),invPoint(g.x+g.w-fp.x,g.y+g.h-fp.y,fp.rotation)];
    const xs=corners.map(p=>p.x), ys=corners.map(p=>p.y); localObstacles.push(expand({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)},0.12));
  }

  const placements: ExportLabelPlacement[]=[];
  const used: Rect[]=[];
  const tryPlace=(kind:"reference"|"value",text:string,candidates:[number,number,number][])=>{
    if(!text)return;
    // Try semantic anchors first. Never jump several millimetres away just because
    // a broad search cell happens to be empty.
    for(const [x,y,size] of candidates){
      for (const scale of [1, 0.92, 0.84, 0.76]) {
        const fs = Math.max(0.34, size * scale);
        const r=textRect(x,y,text,fs);
        if(localObstacles.some(o=>intersects(r,o)) || used.some(o=>intersects(r,o))) continue;
        placements.push({kind,text,x,y,fontSize:fs,bold:kind==="reference"});
        used.push(expand(r,0.08));
        return;
      }
    }

    // Small local search around the nearest semantic anchor only. This prevents
    // labels from drifting to unrelated empty board areas.
    const [ax, ay, baseSize] = candidates[0] || [cx, cy, 0.56];
    const size = Math.max(0.34, baseSize);
    const maxRadius = Math.max(1.8, Math.min(3.2, Math.max(bw,bh) * 0.65));
    let best: {x:number;y:number;fs:number;score:number} | null = null;
    for (let iy=-6; iy<=6; iy++) for (let ix=-8; ix<=8; ix++) {
      const x=ax + ix * Math.max(0.18, size*0.42);
      const y=ay + iy * Math.max(0.18, size*0.42);
      const d=Math.hypot(x-ax,y-ay);
      if(d>maxRadius) continue;
      for (const scale of [0.84,0.72,0.60]) {
        const fs=Math.max(0.34,size*scale), r=textRect(x,y,text,fs);
        if(localObstacles.some(o=>intersects(r,o)) || used.some(o=>intersects(r,o))) continue;
        const score=d + (scale<0.8 ? 0.15 : 0);
        if(!best || score<best.score) best={x,y,fs,score};
      }
    }
    if(best){
      const r=textRect(best.x,best.y,text,best.fs);
      placements.push({kind,text,x:best.x,y:best.y,fontSize:best.fs,bold:kind==="reference"});
      used.push(expand(r,0.08));
      return;
    }

    // Last resort: keep the label attached to its semantic anchor instead of
    // moving it to a distant board-wide grid position.
    const [x,y,fs]=candidates[0] || [cx,cy,size];
    placements.push({kind,text,x,y,fontSize:Math.max(0.34,fs),bold:kind==="reference"});
  };

  const top = cy - bh*0.23, bottom = cy + bh*0.23;
  if (isFuse) {
    tryPlace("reference",refText,[[cx, minY-0.75, Math.min(1,Math.max(.55,bw/(Math.max(1,refText.length)*.65)))] ]);
    tryPlace("value",valText,[[cx,cy,Math.min(.75,Math.max(.5,bw/(Math.max(1,valText.length)*.62)))] ]);
  } else if (isLed) {
    tryPlace("reference",refText,[[cx,top,.58],[cx,minY-.65,.58]]);
    tryPlace("value",valText,[[cx,bottom,.58],[cx,maxY+.65,.58]]);
  } else if (isDiode) {
    tryPlace("reference",refText,[[cx,minY-.55,.58],[cx,cy-bh*.28,.54]]);
    tryPlace("value",valText,[[cx,maxY+.55,.56],[cx,cy+bh*.28,.52]]);
  } else if (isCapacitor) {
    tryPlace("reference",refText,[[cx,minY-.55,.58],[cx,cy-bh*.28,.54]]);
    tryPlace("value",valText,[[cx,maxY+.55,.56],[cx,cy+bh*.28,.52]]);
  } else if (isPolar) {
    // In the footprint's local axis, pad 0 is the positive side used by the plus marker.
    const pad0=fp.pads?.[0], pad1=fp.pads?.[1];
    const dir=pad0&&pad1 ? Math.sign(pad1.x-pad0.x)||1 : 1;
    const posX=cx-dir*bw*0.18, negX=cx+dir*bw*0.18;
    tryPlace("reference",refText,[[posX,cy-bh*.18,.56],[cx,top,.56]]);
    tryPlace("value",valText,[[negX,cy-bh*.18,.56],[cx,bottom,.56]]);
  } else if (isPot) {
    tryPlace("reference",refText,[[cx,minY-.75,.72],[cx,top,.56]]);
    tryPlace("value",valText,[[cx,cy+bh*.22,.56],[cx,maxY+.7,.56]]);
  } else if (isInductor) {
    tryPlace("reference",refText,[[cx,cy-bh*.22,.58],[cx,minY-.7,.58]]);
    tryPlace("value",valText,[[cx,cy+bh*.22,.58],[cx,maxY+.7,.58]]);
  } else if (isResistor) {
    tryPlace("reference",refText,[[cx,minY-.7,.72],[cx,cy-bh*.22,.56]]);
    tryPlace("value",valText,[[cx,cy,.56],[cx,maxY+.7,.56]]);
  } else {
    tryPlace("reference",refText,[[cx,minY-.8,.72],[cx,cy-bh*.22,.56]]);
    tryPlace("value",valText,[[cx,maxY+.8,.62],[cx,cy+bh*.22,.56]]);
  }
  return placements;
}
