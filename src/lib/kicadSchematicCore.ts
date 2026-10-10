import type { SchematicDoc, SchematicNode, SchematicWire, SchematicNetLabel, SchematicJunction, SchematicNoConnect, SchematicBus, SchematicBusEntry, SchematicText, SchematicTextBox } from "./schematic";
import { getImportedKiCadParsedSymbol } from "./kicadSymbol";
import { WORLD_UNITS_PER_KICAD_MM } from "./kicadCoordinateSystem";

/**
 * V9 native KiCad schematic model.
 *
 * The model deliberately keeps KiCad semantics separate from the legacy
 * SchematicDoc renderer model.  It is persisted with the project so a saved
 * project can be reopened without reparsing the original .kicad_sch file.
 */
export interface KiCadCorePoint { x: number; y: number; }
export interface KiCadCorePin {
  nodeId: string;
  number: string;
  name: string;
  world: KiCadCorePoint;
  local: KiCadCorePoint;
  connectedWireIds: string[];
  connectedNetLabelIds: string[];
}
export interface KiCadCoreSymbolInstance {
  nodeId: string;
  uuid?: string;
  libId: string;
  unit: number;
  rotation: 0 | 90 | 180 | 270;
  mirrorX: boolean;
  mirrorY: boolean;
  anchorMm?: KiCadCorePoint;
  pins: KiCadCorePin[];
}
export interface KiCadCoreNet {
  id: string;
  name?: string;
  wireIds: string[];
  pinRefs: string[];
  labelIds: string[];
  junctionIds: string[];
  noConnectIds: string[];
}
export interface KiCadCoreGraphicText { id: string; text: string; x: number; y: number; rotation?: number; fontSize?: number; visible?: boolean; }
export interface KiCadSchematicModel {
  schemaVersion: 2;
  sourceFormat: "kicad_sch";
  coordinateSystem: "kicad-mm-y-up-to-cirzuit-world-y-down";
  symbols: KiCadCoreSymbolInstance[];
  wires: SchematicWire[];
  labels: SchematicNetLabel[];
  junctions: SchematicJunction[];
  noConnects: SchematicNoConnect[];
  buses: SchematicBus[];
  busEntries: SchematicBusEntry[];
  texts: SchematicText[];
  textBoxes: SchematicTextBox[];
  nets: KiCadCoreNet[];
  diagnostics: {
    orphanPins: string[];
    danglingWires: string[];
    labelsWithoutWire: string[];
  };
}


/**
 * Mirrored KiCad instances are registered as *pre-mirrored* symbols
 * (`kicad:<lib>:u1:mx` / `:my`, see importSchematicFormats.registerSchematicSymbol):
 * their pins and graphics already contain the flip. Applying `metadata.mirrorX/Y`
 * again at render/connectivity time flips them back, which is what moved pins
 * (and therefore the wire attachment points) of mirrored parts. This returns
 * the mirror that still has to be applied at runtime (none for baked symbols).
 */
export function runtimeKiCadMirror(node: { symbol: string; metadata?: any }): { mirrorX: boolean; mirrorY: boolean } {
  const baked = /:u\d+(:mx)?(:my)?$/.test(node.symbol) && /:(mx|my)$/.test(node.symbol);
  if (baked) return { mirrorX: false, mirrorY: false };
  return { mirrorX: !!node.metadata?.mirrorX, mirrorY: !!node.metadata?.mirrorY };
}

const EPS = 1e-4;
const key = (p: KiCadCorePoint) => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`;
const dist2 = (a: KiCadCorePoint, b: KiCadCorePoint) => (a.x-b.x)**2 + (a.y-b.y)**2;

function rotateAround(p: KiCadCorePoint, pivot: KiCadCorePoint, deg: number): KiCadCorePoint {
  if (!deg) return p;
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const x = p.x - pivot.x, y = p.y - pivot.y;
  return { x: x*c - y*s + pivot.x, y: x*s + y*c + pivot.y };
}

function localPinToWorld(node: SchematicNode, pin: any, parsed: any): KiCadCorePoint {
  const bbox = parsed.bbox;
  const local = {
    x: (pin.at.x - bbox.minX) * WORLD_UNITS_PER_KICAD_MM,
    y: (bbox.maxY - pin.at.y) * WORLD_UNITS_PER_KICAD_MM,
  };
  const pivot = {
    x: (-bbox.minX) * WORLD_UNITS_PER_KICAD_MM,
    y: bbox.maxY * WORLD_UNITS_PER_KICAD_MM,
  };
  // KiCad applies symbol mirroring around the library origin before the
  // schematic-level rotation. Keep the connectivity point transform identical
  // to the renderer transform so pin/wire attachment cannot drift visually.
  let mx = local.x;
  let my = local.y;
  const meta = runtimeKiCadMirror(node);
  // KiCad mirror flags: mirror-y flips horizontally (X), mirror-x flips vertically (Y).
  if (meta.mirrorY) mx = pivot.x - (mx - pivot.x);
  if (meta.mirrorX) my = pivot.y - (my - pivot.y);
  const rotated = rotateAround({ x: mx, y: my }, pivot, node.rotation);
  return { x: node.x + rotated.x, y: node.y + rotated.y };
}

function pointOnSegment(p: KiCadCorePoint, a: KiCadCorePoint, b: KiCadCorePoint, tol = 0.035): boolean {
  const dx=b.x-a.x, dy=b.y-a.y;
  const len2=dx*dx+dy*dy;
  if (len2 < EPS) return dist2(p,a) <= tol*tol;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2));
  const q={x:a.x+t*dx,y:a.y+t*dy};
  return dist2(p,q) <= tol*tol;
}

function pinWorldPoints(doc: SchematicDoc): KiCadCorePin[] {
  const result: KiCadCorePin[] = [];
  for (const node of doc.nodes) {
    if (!node.symbol.startsWith("kicad:")) continue;
    const parsed = getImportedKiCadParsedSymbol(node.symbol);
    if (!parsed) continue;
    for (const pin of parsed.pins ?? []) {
      result.push({
        nodeId: node.id,
        number: String(pin.number ?? ""),
        name: String(pin.name ?? ""),
        world: localPinToWorld(node, pin, parsed),
        local: {
          x: (pin.at.x - parsed.bbox.minX) * WORLD_UNITS_PER_KICAD_MM,
          y: (parsed.bbox.maxY - pin.at.y) * WORLD_UNITS_PER_KICAD_MM,
        },
        connectedWireIds: [],
        connectedNetLabelIds: [],
      });
    }
  }
  return result;
}


export function getKiCadCoreSymbol(model: KiCadSchematicModel | undefined, nodeId: string): KiCadCoreSymbolInstance | undefined {
  return model?.symbols.find(s => s.nodeId === nodeId);
}

/** Convert a parsed KiCad library point (mm/Y-up) into CirZuit world space
 * relative to the schematic node anchor, using the same transform contract for
 * body graphics, pins and text. */
export function transformKiCadLibraryPoint(
  model: KiCadSchematicModel | undefined,
  node: SchematicNode,
  parsed: any,
  point: { x: number; y: number },
): KiCadCorePoint {
  const core = getKiCadCoreSymbol(model, node.id);
  const scale = node.size ?? 1;
  const anchor = {
    x: (-parsed.bbox.minX) * WORLD_UNITS_PER_KICAD_MM,
    y: parsed.bbox.maxY * WORLD_UNITS_PER_KICAD_MM,
  };
  let dx = (point.x - parsed.bbox.minX) * WORLD_UNITS_PER_KICAD_MM - anchor.x;
  let dy = (parsed.bbox.maxY - point.y) * WORLD_UNITS_PER_KICAD_MM - anchor.y;
  if (core?.mirrorY) dx = -dx;
  if (core?.mirrorX) dy = -dy;
  const r = ((core?.rotation ?? node.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return {
    x: node.x + anchor.x * scale + (dx * c - dy * s) * scale,
    y: node.y + anchor.y * scale + (dx * s + dy * c) * scale,
  };
}

export function buildKiCadSchematicModel(doc: SchematicDoc): KiCadSchematicModel {
  const symbols: KiCadCoreSymbolInstance[] = [];
  const allPins = pinWorldPoints(doc);
  const labels = doc.netLabels ?? [];
  const wires = doc.wires ?? [];
  const junctions = doc.junctions ?? [];
  const noConnects = doc.noConnects ?? [];
  const buses = doc.buses ?? [];
  const busEntries = doc.busEntries ?? [];
  const texts = doc.texts ?? [];
  const textBoxes = doc.textBoxes ?? [];

  for (const node of doc.nodes) {
    if (!node.symbol.startsWith("kicad:")) continue;
    const parsed = getImportedKiCadParsedSymbol(node.symbol);
    if (!parsed) continue;
    symbols.push({
      nodeId: node.id,
      uuid: node.metadata?.uuid || node.id,
      libId: String(node.metadata?.libId || ""),
      unit: Number(node.unit || 1),
      rotation: node.rotation,
      mirrorX: runtimeKiCadMirror(node).mirrorX,
      mirrorY: runtimeKiCadMirror(node).mirrorY,
      anchorMm: node.metadata?.anchorMm,
      pins: allPins.filter(p => p.nodeId === node.id),
    });
  }

  // KiCad connectivity is built from explicit graph vertices. Consecutive
  // points of the same wire are connected; wire crossings are NOT connected
  // unless they share an endpoint or a real junction object.
  const parent = new Map<string, string>();
  const ensure = (k: string) => { if (!parent.has(k)) parent.set(k, k); return k; };
  const find = (x: string): string => {
    ensure(x);
    let r = x;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    let p = x;
    while (parent.get(p)! === undefined || parent.get(p)! === p) break;
    while (parent.get(p)! !== p) { const q = parent.get(p)!; parent.set(p, r); p = q; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const pointOn = (p: KiCadCorePoint, a: KiCadCorePoint, b: KiCadCorePoint, tol=0.035) => pointOnSegment(p,a,b,tol);

  for (const w of wires) {
    for (const p of w.points) ensure(key(p));
    for (let i=0;i<w.points.length-1;i++) union(key(w.points[i]), key(w.points[i+1]));
  }

  // KiCad also permits a wire endpoint to terminate on the middle of another
  // wire. Such a T connection is electrical even when there is no separate
  // junction item in the file. Do this only for endpoints; crossing two
  // interior segments must remain non-connected unless KiCad supplied a
  // junction.
  for (let wi = 0; wi < wires.length; wi++) {
    const wa = wires[wi];
    const endpoints = wa.points.length > 1 ? [wa.points[0], wa.points[wa.points.length - 1]] : wa.points;
    for (const ep of endpoints) {
      for (let wj = 0; wj < wires.length; wj++) {
        if (wi === wj) continue;
        const wb = wires[wj];
        for (let i = 0; i < wb.points.length - 1; i++) {
          if (pointOnSegment(ep, wb.points[i], wb.points[i + 1])) {
            ensure(key(ep));
            union(key(ep), key(wb.points[i]));
            union(key(ep), key(wb.points[i + 1]));
            break;
          }
        }
      }
    }
  }

  const attachToWire = (p: KiCadCorePoint, wire: SchematicWire) => {
    for (let i=0;i<wire.points.length-1;i++) {
      const a=wire.points[i], b=wire.points[i+1];
      if (pointOn(p,a,b)) {
        const k=key(p); ensure(k); union(k,key(a)); union(k,key(b));
        return true;
      }
    }
    for (const q of wire.points) if (dist2(p,q)<=0.035**2) { union(key(p),key(q)); return true; }
    return false;
  };

  for (const j of junctions) for (const w of wires) if (attachToWire(j,w)) break;
  for (const pin of allPins) for (const w of wires) if (attachToWire(pin.world,w)) pin.connectedWireIds.push(w.id);
  for (const label of labels) {
    const p={x:label.x,y:label.y};
    for (const w of wires) if (attachToWire(p,w)) break;
  }

  // A no-connect marker suppresses the "orphan pin" diagnostic at its exact
  // electrical anchor. It does not create a net.
  const diagnostics={orphanPins:[] as string[], danglingWires:[] as string[], labelsWithoutWire:[] as string[]};
  for (const pin of allPins) {
    const nc=noConnects.find(n=>dist2(pin.world,n)<=0.035**2);
    if (!pin.connectedWireIds.length && !nc) diagnostics.orphanPins.push(`${pin.nodeId}:${pin.number}`);
  }
  for (const label of labels) {
    const attached=wires.some(w=>w.points.some(q=>dist2(q,label)<=0.035**2) || w.points.slice(0,-1).some((p,i)=>pointOnSegment(label,p,w.points[i+1])));
    if (!attached) diagnostics.labelsWithoutWire.push(label.id);
  }
  for (const w of wires) {
    const endpoints=w.points.length?[w.points[0],w.points[w.points.length-1]]:[];
    if (!endpoints.length) continue;
    const endpointAttached=(p:KiCadCorePoint)=>allPins.some(x=>dist2(x.world,p)<=0.035**2) || labels.some(x=>dist2(x,p)<=0.035**2) || junctions.some(x=>dist2(x,p)<=0.035**2) || noConnects.some(x=>dist2(x,p)<=0.035**2);
    if (!endpointAttached(endpoints[0]) && !endpointAttached(endpoints[1])) diagnostics.danglingWires.push(w.id);
  }

  const roots = new Map<string, KiCadCoreNet>();
  const netForPoint=(p:KiCadCorePoint)=>{
    const root=find(key(p));
    let n=roots.get(root);
    if(!n){ n={id:`net:${root}`,wireIds:[],pinRefs:[],labelIds:[],junctionIds:[],noConnectIds:[]}; roots.set(root,n); }
    return n;
  };
  for(const w of wires){
    if(!w.points.length) continue;
    const n=netForPoint(w.points[0]);
    if(!n.wireIds.includes(w.id)) n.wireIds.push(w.id);
    // A multi-point wire and a T-connected wire may share a root through an
    // endpoint on another segment. Register the same net against every point
    // so later pin/label lookups cannot create duplicate nets.
    for(const pt of w.points) {
      const same=netForPoint(pt);
      if(same !== n) {
        for(const id of same.wireIds) if(!n.wireIds.includes(id)) n.wireIds.push(id);
        for(const ref of same.pinRefs) if(!n.pinRefs.includes(ref)) n.pinRefs.push(ref);
        for(const id of same.labelIds) if(!n.labelIds.includes(id)) n.labelIds.push(id);
        for(const id of same.junctionIds) if(!n.junctionIds.includes(id)) n.junctionIds.push(id);
        for(const id of same.noConnectIds) if(!n.noConnectIds.includes(id)) n.noConnectIds.push(id);
        roots.delete(same.id.replace(/^net:/,''));
      }
    }
  }
  for(const pin of allPins){ if(pin.connectedWireIds.length){ const n=netForPoint(pin.world); const ref=`${pin.nodeId}:${pin.number}`; if(!n.pinRefs.includes(ref)) n.pinRefs.push(ref); } }
  for(const label of labels){
    const attached=wires.some(w=>w.points.some(q=>dist2(q,label)<=0.035**2) || w.points.slice(0,-1).some((p,i)=>pointOnSegment(label,p,w.points[i+1])));
    if(attached){ const n=netForPoint(label); if(!n.labelIds.includes(label.id)) n.labelIds.push(label.id); if(!n.name) n.name=label.text; }
  }
  for(const j of junctions){ const n=netForPoint(j); if(!n.junctionIds.includes(j.id)) n.junctionIds.push(j.id); }
  for(const nc of noConnects){ if(wires.some(w=>w.points.some(q=>dist2(q,nc)<=0.035**2) || w.points.slice(0,-1).some((p,i)=>pointOnSegment(nc,p,w.points[i+1])))) { const n=netForPoint(nc); if(!n.noConnectIds.includes(nc.id)) n.noConnectIds.push(nc.id); } }

  return {
    schemaVersion:2, sourceFormat:"kicad_sch",
    coordinateSystem:"kicad-mm-y-up-to-cirzuit-world-y-down",
    symbols, wires, labels, junctions, noConnects, buses, busEntries, texts, textBoxes,
    nets:[...roots.values()], diagnostics,
  };
}
