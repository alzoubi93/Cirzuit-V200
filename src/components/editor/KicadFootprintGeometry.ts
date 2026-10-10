/**
 * KiCad footprint geometry adapter.
 *
 * PCB rendering is WebGL-only. This module deliberately contains no SVG/DOM
 * rendering code. It exposes the canonical geometry extraction used by the
 * unified PCB WebGL footprint renderer and by the footprint browser.
 */
import type { KicadFootprintModel } from "@/lib/kicad/footprint";
import { KicadFootprintRuntime } from "@/lib/kicad/footprint/kicadFootprintRuntime";
import { kicadGeometryEngine, type KicadGeometryItem } from "@/lib/kicad/footprint/geometry";

export function getKicadLayerColor(layer: string, layerColors: Record<string, string> = {}) {
  const appSilkColor = layerColors["silkscreen"] || "#f2eda1";
  const appBottomSilkColor = layerColors["bottom_silkscreen"] || layerColors["silkscreen"] || "#e8b2a7";
  const appOutlineColor = layerColors["outline"] || "#d0d2cd";
  const drillColor = layerColors["drill"] || "#323232";
  const fabColor = layerColors["top_fab"] || layerColors["fab"] || "#afafaf";
  const bottomFabColor = layerColors["bottom_fab"] || "#585d84";
  const courtyardColor = layerColors["top_courtyard"] || layerColors["courtyard"] || "#ff26e2";
  const bottomCourtyardColor = layerColors["bottom_courtyard"] || "#26e9ff";
  const defaults: Record<string,string> = {
    top_copper:"#c83434", bottom_copper:"#4d7fc4",
    silkscreen:appSilkColor, bottom_silkscreen:appBottomSilkColor,
    solder_mask:"rgba(216,100,255,0.40)", bottom_solder_mask:"rgba(2,255,238,0.40)",
    top_paste:"rgba(180,160,154,0.90)", bottom_paste:"rgba(0,194,194,0.90)",
    top_courtyard:courtyardColor, bottom_courtyard:bottomCourtyardColor,
    top_fab:fabColor, bottom_fab:bottomFabColor, drill:drillColor, outline:appOutlineColor
  };
  
  const normLayer = layer.includes(".") ? layer : layer; // Keep KiCad dots for now but check common ones
  let color = layerColors[layer];
  if (!color) {
    if (layer==="top_fab" || layer==="F.Fab") color=fabColor;
    else if (layer==="bottom_fab" || layer==="B.Fab") color=bottomFabColor;
    else if (layer==="top_courtyard" || layer==="F.CrtYd") color=courtyardColor;
    else if (layer==="bottom_courtyard" || layer==="B.CrtYd") color=bottomCourtyardColor;
    else if (layer==="silkscreen" || layer==="F.SilkS") color=appSilkColor;
    else if (layer==="bottom_silkscreen" || layer==="B.SilkS") color=appBottomSilkColor;
    else if (layer==="outline" || layer==="Edge.Cuts") color=appOutlineColor;
    else if (layer==="drill") color=drillColor;
    else color=defaults[layer] || appSilkColor;
  }
  return color || appSilkColor;
}

const itemsCache = new WeakMap<object,KicadGeometryItem[]>();
const boundsCache = new WeakMap<object,{minX:number;minY:number;maxX:number;maxY:number}>();

export function buildKicadFootprintItems(
  footprint: KicadFootprintModel | KicadFootprintRuntime
): KicadGeometryItem[] {
  if (!footprint) return [];
  const targetObj=(typeof (footprint as any).GetRenderModel==="function"
    ? (footprint as any).GetRenderModel() : footprint) as object;
  const cached=itemsCache.get(targetObj);
  if (cached) return cached;
  let raw: KicadGeometryItem[]=[];
  if (typeof (footprint as KicadFootprintRuntime).GetWorldGeometry==="function") {
    raw=(footprint as KicadFootprintRuntime).GetWorldGeometry() || [];
  } else {
    const local=kicadGeometryEngine.buildFootprint(footprint.graphics || [], footprint.pads || []);
    raw=kicadGeometryEngine.transformed(local,{
      position: footprint.position || {x:0,y:0},
      rotation: footprint.rotation || 0,
      scaleX:1, scaleY:1, flipped: footprint.layer==="B.Cu"
    });
  }
  const order:Record<string,number>={
    "F.Fab":10,"B.Fab":11,"F.CrtYd":20,"B.CrtYd":21,
    "F.Cu":30,"B.Cu":31,"*.Cu":32,"F.Mask":40,"B.Mask":41,
    "F.Paste":42,"B.Paste":43,"F.SilkS":50,"B.SilkS":51
  };
  const sorted=[...raw].sort((a,b)=>(order[a.layer]??50)-(order[b.layer]??50));
  itemsCache.set(targetObj,sorted);
  return sorted;
}

export function nativeFootprintBounds(fp: KicadFootprintModel | KicadFootprintRuntime) {
  if (!fp) return {minX:0,minY:0,maxX:0,maxY:0};
  const targetObj=(typeof (fp as any).GetRenderModel==="function"
    ? (fp as any).GetRenderModel() : fp) as object;
  const cached=boundsCache.get(targetObj);
  if (cached) return cached;
  const b=kicadGeometryEngine.bounds(buildKicadFootprintItems(fp));
  boundsCache.set(targetObj,b);
  return b;
}
