/**
 * nativeFootprintScene — turns every KiCad-native footprint of the board into world-space GPU arrays
 * using the SAME builder as the footprint browser / generator preview (KicadFootprintRenderShared).
 *
 * Because both places run the exact same code, a footprint's pads (all shapes, drills, numbers),
 * body fill, silkscreen, fab, courtyard and text are identical in the PCB editor and in the preview.
 *
 * Pure CPU code (no React, no GL). Per-footprint geometry is built once in the footprint's local
 * frame and cached, so moving / rotating a footprint only re-applies its 2x3 matrix.
 */
import type { PcbFootprint } from "@/lib/pcb";
import type { FootprintParentNode } from "@/lib/pcbFootprintSceneGraph";
import { buildKicadFootprintItems } from "../KicadFootprintGeometry";
import {
  buildWebGLGeometryForFootprint,
  isReferenceOrValueItem,
  type FillVertexData,
  type PadFillRange,
  type SegmentQuadData,
} from "../KicadFootprintRenderShared";

export const NATIVE_FILL_FLOATS = 6;      // x, y, r, g, b, a
export const NATIVE_STROKE_FLOATS = 12;   // per INSTANCE: p0(2) p1(2) props(4) color(4) — drawn with the unit quad

export interface NativeStaticInput {
  footprints: PcbFootprint[];
  getParent: (id: string) => FootprintParentNode | undefined;
  layerColors: Record<string, string>;
  layerVisibility: Record<string, boolean>;
  activeLayer: string;
  dimInactiveLayers: boolean;
  /** Pad numbers are only legible when zoomed in — the caller decides. */
  showPadNumbers: boolean;
  showBodyFill: boolean;
}

export interface NativeHaloInput {
  selection: { kind?: string; id?: string } | null | undefined;
  groupPadIds: string[];
  highlightedNetIds: number[];
}

interface NativeEntry {
  local: SharedGeom;
  parent: FootprintParentNode;
}

/** Everything that only changes when footprints / style change — NOT on selection or camera moves. */
export interface NativeStaticScene {
  bodyFill: Float32Array;   // 6 floats / vertex, world mm
  padFill: Float32Array;    // 6 floats / vertex, world mm
  strokes: Float32Array;    // NATIVE_STROKE_FLOATS per instance, world mm
  strokeCount: number;
  entries: NativeEntry[];
}

/** Geometry shared by every instance of a footprint (same model / side / style). */
interface SharedGeom {
  body: Float32Array;
  pads: Float32Array;
  padRanges: PadFillRange[];
  segs: Float32Array; // 12 floats per segment
}

const SELECT_HALO: [number, number, number, number] = [0.23, 0.51, 0.96, 0.85];
const NET_HALO: [number, number, number, number] = [0.96, 0.62, 0.07, 0.85];
const HALO_WIDTH_MM = 0.35;
const SHARED_CACHE_LIMIT = 64;
const LABEL_CACHE_LIMIT = 8192;

const sharedCache = new WeakMap<object, Map<string, SharedGeom>>();
const labelCache = new WeakMap<object, Map<string, Float32Array>>();

function swapSide(layer: string): string {
  if (layer.startsWith("F.")) return "B." + layer.slice(2);
  if (layer.startsWith("B.")) return "F." + layer.slice(2);
  return layer;
}

function packFill(v: FillVertexData[]): Float32Array {
  const out = new Float32Array(v.length * NATIVE_FILL_FLOATS);
  let o = 0;
  for (const p of v) { out[o++] = p.x; out[o++] = p.y; out[o++] = p.r; out[o++] = p.g; out[o++] = p.b; out[o++] = p.a; }
  return out;
}

function packSegs(v: SegmentQuadData[]): Float32Array {
  const out = new Float32Array(v.length * 12);
  let o = 0;
  for (const s of v) {
    out[o++] = s.p0x; out[o++] = s.p0y; out[o++] = s.p1x; out[o++] = s.p1y;
    out[o++] = s.strokeWidth; out[o++] = s.dimAlpha; out[o++] = s.isDashed; out[o++] = s.startLen;
    out[o++] = s.r; out[o++] = s.g; out[o++] = s.b; out[o++] = s.a;
  }
  return out;
}

function setLimited<V>(map: Map<string, V>, key: string, value: V, limit: number) {
  if (map.size >= limit) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
}

function itemsFor(model: object, flipped: boolean) {
  let items = buildKicadFootprintItems(model as any);
  if (flipped) items = items.map((it) => ({ ...it, layer: swapSide(it.layer) }));
  return items;
}

function visibilityFor(input: NativeStaticInput): Record<string, boolean> {
  return {
    ...input.layerVisibility,
    "body fill": input.showBodyFill,
    body_fill: input.showBodyFill,
    pad_numbers: input.showPadNumbers,
    padNumbers: input.showPadNumbers,
  };
}

function getSharedGeom(model: object, flipped: boolean, styleKey: string, input: NativeStaticInput): SharedGeom {
  let perModel = sharedCache.get(model);
  if (!perModel) { perModel = new Map(); sharedCache.set(model, perModel); }
  const key = `${flipped ? 1 : 0}|${styleKey}`;
  const hit = perModel.get(key);
  if (hit) return hit;
  const items = itemsFor(model, flipped).filter((it) => !isReferenceOrValueItem(it));
  const g = buildWebGLGeometryForFootprint(
    items, "", "", input.activeLayer, input.layerColors, visibilityFor(input), input.dimInactiveLayers
  );
  const shared: SharedGeom = {
    body: packFill(g.bodyFillVertices),
    pads: packFill(g.padFillVertices),
    padRanges: g.padRanges,
    segs: packSegs(g.segments),
  };
  setLimited(perModel, key, shared, SHARED_CACHE_LIMIT);
  return shared;
}

/** Reference / value text: the only per-instance geometry (tiny, cached per designator). */
function getLabelSegs(model: object, flipped: boolean, ref: string, val: string, styleKey: string, input: NativeStaticInput): Float32Array {
  let perModel = labelCache.get(model);
  if (!perModel) { perModel = new Map(); labelCache.set(model, perModel); }
  const key = `${flipped ? 1 : 0}|${ref}|${val}|${styleKey}`;
  const hit = perModel.get(key);
  if (hit) return hit;
  const items = itemsFor(model, flipped).filter(isReferenceOrValueItem);
  const g = buildWebGLGeometryForFootprint(
    items, ref, val, input.activeLayer, input.layerColors, visibilityFor(input), input.dimInactiveLayers
  );
  const segs = packSegs(g.segments);
  setLimited(perModel, key, segs, LABEL_CACHE_LIMIT);
  return segs;
}

/** Halo = the pad's own triangles grown by HALO_WIDTH_MM on every side (bbox-anisotropic scale). */
function pushHalo(out: number[], pads: Float32Array, start: number, count: number, m: readonly number[], color: readonly number[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const k = (start + i) * NATIVE_FILL_FLOATS;
    const x = pads[k], y = pads[k + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = Math.max(maxX - minX, 0.05), h = Math.max(maxY - minY, 0.05);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const sx = (w + 2 * HALO_WIDTH_MM) / w, sy = (h + 2 * HALO_WIDTH_MM) / h;
  for (let i = 0; i < count; i++) {
    const k = (start + i) * NATIVE_FILL_FLOATS;
    const lx = cx + (pads[k] - cx) * sx, ly = cy + (pads[k + 1] - cy) * sy;
    out.push(m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5], color[0], color[1], color[2], color[3]);
  }
}

/** Per-footprint ranges inside the packed world-space arrays (for incremental transform updates). */
export interface NativeFpRange {
  id: string;
  bodyOffset: number;
  bodyFloats: number;
  padOffset: number;
  padFloats: number;
  strokeOffset: number;
  strokeFloats: number;
  local: SharedGeom;
  labels: Float32Array;
  matrix: readonly number[];
}

/**
 * Cache that allows rebuildNativeStaticScene to patch only footprints whose matrix (or labels)
 * changed, instead of reallocating and re-transforming every footprint on the board.
 * One cache instance should be kept per PCB editor mount (e.g. a React ref).
 */
/** Byte range inside a GPU buffer (for gl.bufferSubData). */
export interface NativeDirtyByteRange {
  /** Offset in bytes from the start of the buffer. */
  byteOffset: number;
  /** Length in bytes. */
  byteLength: number;
}

export class NativeStaticSceneCache {
  styleKey = "";
  /** Ordered footprint ids from the last successful build. */
  ids: string[] = [];
  ranges = new Map<string, NativeFpRange>();
  scene: NativeStaticScene | null = null;
  /**
   * Bumped on every full rebuild or in-place patch so the GL upload path knows the
   * underlying Float32Array *contents* changed even when the array reference did not.
   */
  contentVersion = 0;
  /** Stats for diagnostics / tests. */
  lastFullRebuild = false;
  lastPatchedCount = 0;
  /**
   * After a patch, the dirty byte ranges in bodyFill / padFill / strokes.
   * Empty after a full rebuild or a no-op. Consumed by the GL upload path for bufferSubData.
   */
  lastDirtyBody: NativeDirtyByteRange[] = [];
  lastDirtyPad: NativeDirtyByteRange[] = [];
  lastDirtyStroke: NativeDirtyByteRange[] = [];

  clear() {
    this.styleKey = "";
    this.ids = [];
    this.ranges.clear();
    this.scene = null;
    this.contentVersion = 0;
    this.lastDirtyBody = [];
    this.lastDirtyPad = [];
    this.lastDirtyStroke = [];
  }
}

function emitFillWorld(
  src: Float32Array,
  dst: Float32Array,
  o: number,
  m: readonly number[]
): number {
  for (let k = 0; k < src.length; k += NATIVE_FILL_FLOATS) {
    const x = src[k], y = src[k + 1];
    dst[o++] = m[0] * x + m[2] * y + m[4];
    dst[o++] = m[1] * x + m[3] * y + m[5];
    dst[o++] = src[k + 2]; dst[o++] = src[k + 3]; dst[o++] = src[k + 4]; dst[o++] = src[k + 5];
  }
  return o;
}

function emitSegsWorld(
  src: Float32Array,
  dst: Float32Array,
  o: number,
  m: readonly number[]
): number {
  for (let k = 0; k < src.length; k += 12) {
    dst[o++] = m[0] * src[k] + m[2] * src[k + 1] + m[4];
    dst[o++] = m[1] * src[k] + m[3] * src[k + 1] + m[5];
    dst[o++] = m[0] * src[k + 2] + m[2] * src[k + 3] + m[4];
    dst[o++] = m[1] * src[k + 2] + m[3] * src[k + 3] + m[5];
    for (let j = 4; j < 12; j++) dst[o++] = src[k + j];
  }
  return o;
}

function matrixEq(a: readonly number[], b: readonly number[]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5];
}

/**
 * Full pack of every KiCad-native footprint into world-space GPU arrays.
 * Prefer `buildNativeStaticSceneCached` when a persistent cache is available.
 */

/** Merge overlapping/adjacent byte ranges (keeps bufferSubData call count low when many fps move). */
function mergeByteRanges(ranges: NativeDirtyByteRange[]): NativeDirtyByteRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = ranges.slice().sort((a, b) => a.byteOffset - b.byteOffset);
  const out: NativeDirtyByteRange[] = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n.byteOffset <= cur.byteOffset + cur.byteLength) {
      const end = Math.max(cur.byteOffset + cur.byteLength, n.byteOffset + n.byteLength);
      cur.byteLength = end - cur.byteOffset;
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

export function buildNativeStaticScene(input: NativeStaticInput): NativeStaticScene {
  return buildNativeStaticSceneCached(input, null);
}

/**
 * Build (or incrementally update) the native footprint scene.
 *
 * - **Full rebuild** when style, footprint set, or local geometry size changes.
 * - **Patch** when only parent matrices (move/rotate) or label content changed but
 *   packed float counts stay the same — re-writes only those ranges in-place.
 *
 * @param cache Pass a stable `NativeStaticSceneCache` (e.g. from a React ref) to enable patching.
 *              Pass `null` for a one-shot full build (same as the old API).
 */
export function buildNativeStaticSceneCached(
  input: NativeStaticInput,
  cache: NativeStaticSceneCache | null
): NativeStaticScene {
  const styleKey = JSON.stringify([
    input.activeLayer, input.dimInactiveLayers, input.showPadNumbers, input.showBodyFill,
    input.layerColors, input.layerVisibility,
  ]);

  interface Item {
    id: string;
    local: SharedGeom;
    labels: Float32Array;
    m: readonly number[];
    parent: FootprintParentNode;
  }
  const items: Item[] = [];
  for (const fp of input.footprints || []) {
    if (!fp || !fp.nativeKicadFootprint) continue;
    const parent = input.getParent(fp.id);
    if (!parent) continue;
    const native: any = fp.nativeKicadFootprint;
    const ref = fp.reference || native.properties?.Reference || "REF**";
    const val = fp.value || native.properties?.Value || native.name || "VAL**";
    const model = native as object;
    const flipped = !!parent.isFlippedBottom;
    items.push({
      id: fp.id,
      local: getSharedGeom(model, flipped, styleKey, input),
      labels: getLabelSegs(model, flipped, ref, val, styleKey, input),
      m: parent.matrix,
      parent,
    });
  }

  // --- Try incremental patch ---
  if (
    cache &&
    cache.scene &&
    cache.styleKey === styleKey &&
    cache.ids.length === items.length &&
    cache.ids.every((id, i) => id === items[i].id)
  ) {
    let canPatch = true;
    const dirty: Item[] = [];
    for (const it of items) {
      const prev = cache.ranges.get(it.id);
      if (!prev) { canPatch = false; break; }
      // Local geometry or label buffer size must match (same slot footprint in packed arrays).
      if (
        prev.local !== it.local ||
        prev.bodyFloats !== it.local.body.length ||
        prev.padFloats !== it.local.pads.length ||
        prev.strokeFloats !== it.local.segs.length + it.labels.length
      ) {
        // Label text often changes length → different stroke count → full rebuild.
        if (
          prev.bodyFloats !== it.local.body.length ||
          prev.padFloats !== it.local.pads.length ||
          prev.strokeFloats !== it.local.segs.length + it.labels.length
        ) {
          canPatch = false;
          break;
        }
        // Same sizes but new local/labels object — still patchable
      }
      if (!matrixEq(prev.matrix, it.m) || prev.labels !== it.labels || prev.local !== it.local) {
        dirty.push(it);
      }
    }

    if (canPatch && dirty.length === 0) {
      // Nothing moved — refresh parent refs on entries for halo selection flags
      const entries = items.map((it) => ({ local: it.local, parent: it.parent }));
      cache.scene = { ...cache.scene, entries };
      cache.lastFullRebuild = false;
      cache.lastPatchedCount = 0;
      cache.lastDirtyBody = [];
      cache.lastDirtyPad = [];
      cache.lastDirtyStroke = [];
      return cache.scene;
    }

    if (canPatch) {
      const scene = cache.scene;
      const dirtyBody: NativeDirtyByteRange[] = [];
      const dirtyPad: NativeDirtyByteRange[] = [];
      const dirtyStroke: NativeDirtyByteRange[] = [];
      for (const it of dirty) {
        const prev = cache.ranges.get(it.id)!;
        emitFillWorld(it.local.body, scene.bodyFill, prev.bodyOffset, it.m);
        emitFillWorld(it.local.pads, scene.padFill, prev.padOffset, it.m);
        let so = prev.strokeOffset;
        so = emitSegsWorld(it.local.segs, scene.strokes, so, it.m);
        emitSegsWorld(it.labels, scene.strokes, so, it.m);
        if (prev.bodyFloats > 0) {
          dirtyBody.push({ byteOffset: prev.bodyOffset * 4, byteLength: prev.bodyFloats * 4 });
        }
        if (prev.padFloats > 0) {
          dirtyPad.push({ byteOffset: prev.padOffset * 4, byteLength: prev.padFloats * 4 });
        }
        if (prev.strokeFloats > 0) {
          dirtyStroke.push({ byteOffset: prev.strokeOffset * 4, byteLength: prev.strokeFloats * 4 });
        }
        cache.ranges.set(it.id, {
          id: it.id,
          bodyOffset: prev.bodyOffset,
          bodyFloats: prev.bodyFloats,
          padOffset: prev.padOffset,
          padFloats: prev.padFloats,
          strokeOffset: prev.strokeOffset,
          strokeFloats: prev.strokeFloats,
          local: it.local,
          labels: it.labels,
          matrix: it.m,
        });
      }
      const entries = items.map((it) => ({ local: it.local, parent: it.parent }));
      // Keep same array buffers (important for GPU upload skip via reference equality).
      scene.entries = entries;
      cache.scene = scene;
      cache.contentVersion++;
      cache.lastFullRebuild = false;
      cache.lastPatchedCount = dirty.length;
      cache.lastDirtyBody = mergeByteRanges(dirtyBody);
      cache.lastDirtyPad = mergeByteRanges(dirtyPad);
      cache.lastDirtyStroke = mergeByteRanges(dirtyStroke);
      return scene;
    }
  }

  // --- Full rebuild ---
  let bodyV = 0, padV = 0, segN = 0;
  for (const e of items) {
    bodyV += e.local.body.length / NATIVE_FILL_FLOATS;
    padV += e.local.pads.length / NATIVE_FILL_FLOATS;
    segN += (e.local.segs.length + e.labels.length) / 12;
  }

  const bodyFill = new Float32Array(bodyV * NATIVE_FILL_FLOATS);
  const padFill = new Float32Array(padV * NATIVE_FILL_FLOATS);
  const strokes = new Float32Array(segN * NATIVE_STROKE_FLOATS);
  let bo = 0, po = 0, so = 0;
  const ranges = new Map<string, NativeFpRange>();
  const ids: string[] = [];

  for (const e of items) {
    const bodyOffset = bo;
    const padOffset = po;
    const strokeOffset = so;
    bo = emitFillWorld(e.local.body, bodyFill, bo, e.m);
    po = emitFillWorld(e.local.pads, padFill, po, e.m);
    so = emitSegsWorld(e.local.segs, strokes, so, e.m);
    so = emitSegsWorld(e.labels, strokes, so, e.m);
    ids.push(e.id);
    ranges.set(e.id, {
      id: e.id,
      bodyOffset,
      bodyFloats: e.local.body.length,
      padOffset,
      padFloats: e.local.pads.length,
      strokeOffset,
      strokeFloats: e.local.segs.length + e.labels.length,
      local: e.local,
      labels: e.labels,
      matrix: e.m,
    });
  }

  const scene: NativeStaticScene = {
    bodyFill,
    padFill,
    strokes,
    strokeCount: segN,
    entries: items.map((e) => ({ local: e.local, parent: e.parent })),
  };

  if (cache) {
    cache.styleKey = styleKey;
    cache.ids = ids;
    cache.ranges = ranges;
    cache.scene = scene;
    cache.contentVersion++;
    cache.lastFullRebuild = true;
    cache.lastPatchedCount = items.length;
    // Full rebuild replaces the whole buffer — no partial ranges.
    cache.lastDirtyBody = [];
    cache.lastDirtyPad = [];
    cache.lastDirtyStroke = [];
  }

  return scene;
}

/**
 * Selection / net-highlight halos around pads. Small and cheap: recomputed on every selection change
 * without touching the (large) static arrays. Drawn BEFORE the pads so the pads sit on top.
 */
export function buildNativeHalos(scene: NativeStaticScene, input: NativeHaloInput): Float32Array {
  const highlighted = new Set(input.highlightedNetIds || []);
  const groupPads = new Set(input.groupPadIds || []);
  const halo: number[] = [];
  for (const e of scene.entries) {
    const m = e.parent.matrix;
    let padsByNumber: Map<string, { id: string; netId?: number }[]> | null = null;
    for (const r of e.local.padRanges) {
      if (r.kind !== "copper" || r.padNumber === "") continue;
      if (!padsByNumber) {
        padsByNumber = new Map();
        for (const p of e.parent.pads) {
          const k = String(p.number ?? "");
          if (!padsByNumber.has(k)) padsByNumber.set(k, []);
          padsByNumber.get(k)!.push({ id: p.id, netId: p.netId });
        }
      }
      const infos = padsByNumber.get(r.padNumber) || [];
      const selected =
        e.parent.selected ||
        infos.some((p) => (input.selection?.kind === "pad" && input.selection.id === p.id) || groupPads.has(p.id));
      const net = infos.some((p) => p.netId !== undefined && highlighted.has(p.netId));
      if (!selected && !net) continue;
      pushHalo(halo, e.local.pads, r.start, r.count, m, selected ? SELECT_HALO : NET_HALO);
    }
  }
  return new Float32Array(halo);
}
