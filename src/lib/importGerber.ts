import JSZip from "jszip";
import { PcbDoc, PcbTrack, PcbVia, PcbPad, PcbZone, PcbLayerId, emptyPcbDoc } from "./pcb";
import { SchematicDoc } from "./schematic";

interface Aperture {
  shape: string; // 'C' | 'R' | 'O' | macro name
  dims: number[]; // size dimensions in mm
  macroPrimitives?: { code: number; exposure: number; values: number[] }[];
  blockContent?: string;
}

/**
 * Parses a single Gerber RS-274X file string and extracts tracks, pads and outline.
 */
export function parseGerberFile(
  content: string,
  layerId: PcbLayerId,
  preserveOrigin = false,
  blockDepth = 0
): { tracks: PcbTrack[]; pads: PcbPad[]; zones: PcbZone[]; outlineSegments: { x1: number; y1: number; x2: number; y2: number }[] } {
  // Defensive limit for malformed/cyclic aperture-block references. Real files
  // should use finite nesting; never let corrupt input hang the browser tab.
  if (blockDepth > 12) return { tracks: [], pads: [], zones: [], outlineSegments: [] };
  const tracks: PcbTrack[] = [];
  const pads: PcbPad[] = [];
  const zones: PcbZone[] = [];
  const outlineSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  // Stable local sequence for fragments created by clear-polarity clipping.
  // Avoid random IDs during import so debugging and regression comparisons are reproducible.
  let importedFragmentSequence = 0;

  // Gerber State
  let units: "mm" | "inch" = "mm";
  let scaleX = 10000; // decimal scale (fractional digits)
  let scaleY = 10000;
  let integerDigitsX = 2;
  let integerDigitsY = 2;
  let fractionalDigitsX = 4;
  let fractionalDigitsY = 4;
  let zeroSuppression: "leading" | "trailing" = "leading";
  let coordinateMode: "absolute" | "incremental" = "absolute";
  const apertures = new Map<number, Aperture>();
  // Parse simple, numeric Aperture Macro primitives before splitting normal
  // Gerber commands. This supports common circle (1), legacy vector line (2), outline (4), vector line (20), center-line rectangle (21),
  // lower-left rectangle (22), regular polygon (5), legacy Moire (6), and approximate thermal (7) primitives. Complex
  // expressions/variable assignments and exposure-off boolean compositing are
  // intentionally not approximated as standard pads.
  const macroDefinitions = new Map<string, string>();
  // Block apertures store a Gerber command stream and may contain multiple
  // objects. Preserve each body and render it at flash time through this parser.
  const blockApertures = new Map<number, string>();
  // AB blocks may nest. A non-greedy regex stops at the first inner %AB*%
  // and corrupts the outer block body, so match open/close commands with a stack.
  const blockRanges: { start: number; end: number }[] = [];
  const blockStack: { dcode: number; bodyStart: number; commandStart: number }[] = [];
  const blockCommandRegex = /%AB(?:D([0-9]+))?\*%/gi;
  let blockCommandMatch: RegExpExecArray | null;
  while ((blockCommandMatch = blockCommandRegex.exec(content)) !== null) {
    const command = blockCommandMatch[0];
    if (blockCommandMatch[1] !== undefined) {
      blockStack.push({ dcode: Number(blockCommandMatch[1]), bodyStart: blockCommandRegex.lastIndex, commandStart: blockCommandMatch.index });
    } else {
      const opened = blockStack.pop();
      if (!opened) continue;
      blockApertures.set(opened.dcode, content.slice(opened.bodyStart, blockCommandMatch.index));
      if (blockStack.length === 0) blockRanges.push({ start: opened.commandStart, end: blockCommandRegex.lastIndex });
    }
  }
  for (const [dcode, blockContent] of blockApertures) {
    apertures.set(dcode, { shape: "AB", dims: [], blockContent });
  }
  const macroRegex = /%AM([A-Za-z_][A-Za-z0-9_$]*)\*([\s\S]*?)%/g;
  let macroMatch: RegExpExecArray | null;
  while ((macroMatch = macroRegex.exec(content)) !== null) {
    macroDefinitions.set(macroMatch[1].toUpperCase(), macroMatch[2]);
  }
  // Evaluate the arithmetic subset used by Gerber aperture macros. Expressions
  // are token-validated before evaluation; no identifiers other than $n are allowed.
  const evaluateMacroExpression = (expression: string, variables: Map<number, number>): number | null => {
    let expanded = expression.trim().replace(/\$(\d+)/g, (_match, index: string) => {
      const value = variables.get(Number(index));
      return value === undefined ? "NaN" : String(value);
    });
    if (!/^[\d.eE+\-*/()\s]+$/.test(expanded) || /NaN|Infinity/.test(expanded)) return null;
    try {
      const value = Function(`"use strict"; return (${expanded});`)();
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    } catch { return null; }
  };
  const instantiateMacro = (name: string, adParameters: number[]) => {
    const body = macroDefinitions.get(name);
    if (body === undefined) return undefined;
    const variables = new Map<number, number>();
    adParameters.forEach((value, index) => variables.set(index + 1, value));
    const primitives: { code: number; exposure: number; values: number[] }[] = [];
    for (const raw of body.split("*")) {
      const line = raw.trim();
      if (!line || /^0(?:\s|$)/.test(line)) continue; // macro comment lines
      const assignment = line.match(/^\$(\d+)\s*=\s*(.+)$/);
      if (assignment) {
        const value = evaluateMacroExpression(assignment[2], variables);
        if (value !== null) variables.set(Number(assignment[1]), value);
        continue;
      }
      const fields = line.split(",");
      const code = Number(fields[0]);
      if (![1, 2, 4, 5, 6, 7, 20, 21, 22].includes(code)) continue;
      const evaluated = fields.slice(1).map((field) => evaluateMacroExpression(field, variables));
      if (evaluated.some((value) => value === null)) continue;
      const values = evaluated as number[];
      primitives.push({ code, exposure: values[0] ?? 1, values: values.slice(1) });
    }
    return primitives;
  };
  // Remove macro declarations from the ordinary command stream so their
  // primitive fields are not mistaken for coordinates or D-codes.
  let commandContent = content.replace(/%AM[A-Za-z_][A-Za-z0-9_$]*\*[\s\S]*?%/g, "");
  // Remove complete outer AB definitions (including nested definitions) from
  // the main stream, without accidentally leaving the tail of a nested block.
  for (const range of [...blockRanges].sort((a, b) => b.start - a.start)) {
    commandContent = commandContent.slice(0, range.start) + commandContent.slice(range.end);
  }

  let currentX = 0;
  let currentY = 0;
  let currentAperture: number | null = null;
  let interpolationMode: "linear" | "cw" | "ccw" = "linear";
  let regionMode = false;
  let activeRegion: { x: number; y: number }[] = [];
  let regionPolarity: "dark" | "clear" = "dark";
  // Active aperture transformations (Gerber LM/LR/LS). These are especially
  // important for block apertures, which may be mirrored, rotated and scaled
  // independently at each flash.
  let mirrorX = false;
  let mirrorY = false;
  let apertureRotation = 0;
  let apertureScale = 1;
  // Step-and-repeat state (%SR...*% ... %SR*%). Gerber repeats only the
  // graphics generated inside the block, so we snapshot output-array indices.
  let stepRepeat: { nx: number; ny: number; dx: number; dy: number; trackStart: number; padStart: number; zoneStart: number; outlineStart: number } | null = null;

  // Point-in-polygon test used to associate Gerber clear regions with a
  // preceding dark copper region. PcbWebGLZones already triangulates polygon
  // holes with earcut, so the subtraction is represented in actual WebGL geometry.
  const pointInPolygon = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x);
      if (crosses) inside = !inside;
    }
    return inside;
  };

  const polygonBounds = (ring: { x: number; y: number }[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of ring) {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    }
    return { minX, minY, maxX, maxY };
  };
  const boundsOverlap = (
    a: { minX: number; minY: number; maxX: number; maxY: number },
    b: { minX: number; minY: number; maxX: number; maxY: number },
  ) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;

  // Gerber LPC erases previously painted image data. The current zone model
  // can represent a clear object as a hole only when that object is wholly
  // contained by a copper region. Validate every vertex and every edge midpoint
  // (not just the centroid) to avoid creating holes that leak beyond the copper
  // boundary. Apply the clear to every containing zone because Gerber compositing
  // affects the accumulated image, not only the most recently-created zone.
  const ringContainsRing = (outer: { x: number; y: number }[], inner: { x: number; y: number }[]) => {
    if (outer.length < 3 || inner.length < 3) return false;

    // A vertex-and-midpoint-only check can miss an edge that briefly crosses
    // outside a concave contour and returns before its midpoint. Reject proper
    // edge crossings first, then sample each inner edge at quarter intervals.
    const orient = (a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const properlyIntersects = (a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}, d: {x:number;y:number}) => {
      const scale = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y), Math.abs(d.x), Math.abs(d.y));
      const epsilon = scale * scale * 1e-12;
      const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
      return ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
        ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon));
    };

    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      if (!pointInPolygon(a, outer)) return false;
      for (let j = 0; j < outer.length; j++) {
        if (properlyIntersects(a, b, outer[j], outer[(j + 1) % outer.length])) return false;
      }
      for (const t of [0.25, 0.5, 0.75]) {
        if (!pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, outer)) return false;
      }
    }
    return true;
  };

  const subtractContainedShape = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return false;
    const clearBounds = polygonBounds(pts);
    const clearSpan = Math.min(clearBounds.maxX - clearBounds.minX, clearBounds.maxY - clearBounds.minY);
    // Clear polarity removes previously painted primitives as well as zones.
    // This importer cannot split partially intersected tracks/pads without a
    // polygon Boolean engine, so remove only primitives wholly covered by the
    // clear shape; leave partial intersections untouched rather than corrupting
    // their geometry.
    const coveredPads = pads.filter((pad) => {
      if (pad.layer !== layerId) return false;
      const rx = Math.max(pad.width / 2, 0.001);
      const ry = Math.max(pad.height / 2, 0.001);
      // Avoid building an outline for pads that cannot intersect this clear.
      if (!boundsOverlap(clearBounds, { minX: pad.x - rx, maxX: pad.x + rx, minY: pad.y - ry, maxY: pad.y + ry })) return false;
      let outline: { x: number; y: number }[];
      if (pad.shape === "circle") {
        outline = Array.from({ length: 96 }, (_, i) => ({
          // A denser contour makes full-coverage checks less likely to mistake
          // a barely protruding circular pad for a fully erased one.
          x: pad.x + Math.cos(i * Math.PI / 48) * rx,
          y: pad.y + Math.sin(i * Math.PI / 48) * ry,
        }));
      } else if (pad.shape === "oval") {
        // Model an obround pad as a capsule, not its bounding rectangle.
        // The rectangle's corners lie outside the real pad and can cause an
        // LPC clearance that fully covers the oval to be incorrectly rejected.
        const outlinePoints: { x: number; y: number }[] = [];
        if (pad.width >= pad.height) {
          const radius = ry;
          const offset = Math.max(0, rx - radius);
          for (let i = 0; i <= 48; i++) {
            const angle = -Math.PI / 2 + i * Math.PI / 48;
            outlinePoints.push({ x: pad.x + offset + Math.cos(angle) * radius, y: pad.y + Math.sin(angle) * radius });
          }
          for (let i = 0; i <= 48; i++) {
            const angle = Math.PI / 2 + i * Math.PI / 48;
            outlinePoints.push({ x: pad.x - offset + Math.cos(angle) * radius, y: pad.y + Math.sin(angle) * radius });
          }
        } else {
          const radius = rx;
          const offset = Math.max(0, ry - radius);
          for (let i = 0; i <= 48; i++) {
            const angle = i * Math.PI / 48;
            outlinePoints.push({ x: pad.x + Math.cos(angle) * radius, y: pad.y + offset + Math.sin(angle) * radius });
          }
          for (let i = 0; i <= 48; i++) {
            const angle = Math.PI + i * Math.PI / 48;
            outlinePoints.push({ x: pad.x + Math.cos(angle) * radius, y: pad.y - offset + Math.sin(angle) * radius });
          }
        }
        outline = outlinePoints;
      } else {
        outline = [{ x: pad.x-rx, y: pad.y-ry }, { x: pad.x+rx, y: pad.y-ry }, { x: pad.x+rx, y: pad.y+ry }, { x: pad.x-rx, y: pad.y+ry }];
      }
      return ringContainsRing(pts, outline);
    });
    const coveredPadIds = new Set(coveredPads.map((pad) => pad.id));
    if (coveredPadIds.size) {
      for (let i = pads.length - 1; i >= 0; i--) if (coveredPadIds.has(pads[i].id)) pads.splice(i, 1);
    }
    const coveredTrackIds = new Set(tracks.filter((track) => {
      if (track.layer !== layerId || track.points.length < 2) return false;
      const radius = Math.max(track.width, 0) / 2;
      const strokeFitsAt = (point: { x: number; y: number }) => {
        if (!pointInPolygon(point, pts)) return false;
        // Sample the stroke perimeter as well as its centreline. This avoids
        // erasing copper whose width crosses the clearance boundary.
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          if (!pointInPolygon({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius }, pts)) return false;
        }
        return true;
      };
      // Checking only the stored vertices is unsafe for concave clear regions:
      // both endpoints can be inside while the straight segment between them
      // crosses a notch/outside area. Sample every segment adaptively before
      // removing the track. This remains a conservative whole-track test; it
      // does not pretend to split partially erased tracks.
      for (let i = 0; i < track.points.length; i++) {
        if (!strokeFitsAt(track.points[i])) return false;
        if (i === 0) continue;
        const a = track.points[i - 1], b = track.points[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const step = Math.max(0.05, Math.min(0.25, Math.max(radius, 0.05)));
        const samples = Math.min(4096, Math.max(1, Math.ceil(length / step)));
        for (let sample = 1; sample < samples; sample++) {
          const t = sample / samples;
          if (!strokeFitsAt({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
        }
      }
      return true;
    }).map((track) => track.id));
    if (coveredTrackIds.size) {
      for (let i = tracks.length - 1; i >= 0; i--) if (coveredTrackIds.has(tracks[i].id)) tracks.splice(i, 1);
    }

    // Split partially erased tracks into surviving runs. This is deliberately
    // conservative: a sample is removed only when the complete circular
    // cross-section of the track is inside the LPC polygon. It handles the
    // common case of a clear region crossing a straight/polyline track without
    // claiming exact polygon clipping for the boundary slivers or pads.
    const splitTrackIds: string[] = [];
    const residualTracks: typeof tracks = [];
    let clearMinX = Infinity, clearMaxX = -Infinity, clearMinY = Infinity, clearMaxY = -Infinity;
    for (const point of pts) {
      clearMinX = Math.min(clearMinX, point.x); clearMaxX = Math.max(clearMaxX, point.x);
      clearMinY = Math.min(clearMinY, point.y); clearMaxY = Math.max(clearMaxY, point.y);
    }
    for (const track of tracks) {
      if (track.layer !== layerId || track.points.length < 2) continue;
      const radius = Math.max(track.width, 0) / 2;
      // Fast reject tracks whose stroke bounding box cannot meet this clearance.
      // This avoids expensive point-in-polygon/perimeter sampling for unrelated copper.
      let trackMinX = Infinity, trackMaxX = -Infinity, trackMinY = Infinity, trackMaxY = -Infinity;
      for (const point of track.points) {
        trackMinX = Math.min(trackMinX, point.x); trackMaxX = Math.max(trackMaxX, point.x);
        trackMinY = Math.min(trackMinY, point.y); trackMaxY = Math.max(trackMaxY, point.y);
      }
      trackMinX -= radius; trackMaxX += radius; trackMinY -= radius; trackMaxY += radius;
      if (trackMaxX < clearMinX || trackMinX > clearMaxX || trackMaxY < clearMinY || trackMinY > clearMaxY) continue;
      const erasedAt = (point: { x: number; y: number }) => {
        if (!pointInPolygon(point, pts)) return false;
        for (let i = 0; i < 24; i++) {
          const angle = i * Math.PI / 12;
          if (!pointInPolygon({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius }, pts)) return false;
        }
        return true;
      };
      const sampled: { point: { x: number; y: number }; erased: boolean }[] = [];
      // Adapt the sampling interval to the clearance's narrowest dimension.
      // A fixed 0.05 mm grid can jump over a very narrow LPC clearance entirely,
      // especially when the track is thin. Keep at least eight samples across
      // the smaller bounding-box dimension, while retaining the existing cap.
      const adaptiveStep = Math.max(0.0005, Math.min(0.05, clearSpan / 8));
      for (let i = 0; i < track.points.length - 1; i++) {
        const a = track.points[i], b = track.points[i + 1];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.min(4096, Math.ceil(length / adaptiveStep)));
        for (let j = 0; j < steps; j++) {
          const t = j / steps;
          const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          // Polyline vertices are sampled again as the next segment starts. Avoid
          // duplicating them because dense Gerber polylines can otherwise balloon
          // the fragment point arrays and slow down WebGL rendering.
          if (sampled.length && Math.hypot(point.x - sampled[sampled.length - 1].point.x, point.y - sampled[sampled.length - 1].point.y) < 1e-9) continue;
          sampled.push({ point, erased: erasedAt(point) });
        }
      }
      const last = track.points[track.points.length - 1];
      sampled.push({ point: { ...last }, erased: erasedAt(last) });
      if (!sampled.some((sample) => sample.erased)) continue;
      splitTrackIds.push(track.id);
      let run: { x: number; y: number }[] = [];
      const flushRun = () => {
        const deduped = run.filter((point, index) => index === 0 || Math.hypot(point.x - run[index - 1].x, point.y - run[index - 1].y) > 1e-7);
        if (deduped.length >= 2) {
          importedFragmentSequence += 1;
          residualTracks.push({ ...track, id: `track-imported-fragment-${importedFragmentSequence}`, points: deduped });
        }
        run = [];
      };
      // Refine every erased/non-erased transition by bisection. The coarse
      // samples identify the surviving runs; binary search places their ends
      // much closer to the clearance boundary than the 0.05 mm sampling grid.
      // This is still a conservative stroke-cross-section approximation, not a
      // general polygon Boolean operation for pads or filled zones.
      const transitionPoint = (
        a: { x: number; y: number },
        b: { x: number; y: number },
        aErased: boolean,
      ) => {
        let lo = 0, hi = 1;
        for (let iteration = 0; iteration < 28; iteration++) {
          const mid = (lo + hi) / 2;
          const point = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
          if (erasedAt(point) === aErased) lo = mid;
          else hi = mid;
        }
        const t = (lo + hi) / 2;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      };
      for (let i = 0; i < sampled.length; i++) {
        const sample = sampled[i];
        const previous = i > 0 ? sampled[i - 1] : undefined;
        if (previous && previous.erased !== sample.erased) {
          const boundary = transitionPoint(previous.point, sample.point, previous.erased);
          if (previous.erased) {
            // Copper resumes at the refined boundary.
            flushRun();
            run.push(boundary);
          } else {
            // End the surviving run at the refined boundary before the gap.
            run.push(boundary);
            flushRun();
          }
        }
        if (sample.erased) flushRun();
        else run.push(sample.point);
      }
      flushRun();
    }
    if (splitTrackIds.length) {
      const splitIds = new Set(splitTrackIds);
      for (let i = tracks.length - 1; i >= 0; i--) if (splitIds.has(tracks[i].id)) tracks.splice(i, 1);
      tracks.push(...residualTracks);
    }

    // If the clear shape fully covers an earlier copper zone, remove that
    // zone outright. Previously only clear shapes contained by a zone were
    // represented as holes, leaving completely erased islands visible.
    const coveredZoneIds = new Set(zones.filter((zone) => {
      if (zone.layer !== layerId || !zone.boundary || zone.boundary.pts.length < 3) return false;
      if (!boundsOverlap(clearBounds, polygonBounds(zone.boundary.pts))) return false;
      return ringContainsRing(pts, zone.boundary.pts);
    }).map((zone) => zone.id));
    if (coveredZoneIds.size) {
      for (let i = zones.length - 1; i >= 0; i--) {
        if (coveredZoneIds.has(zones[i].id)) zones.splice(i, 1);
      }
    }

    // Exact rectangular boolean subtraction for the common LPC-vs-rectangular
    // copper-zone case. If the clearance crosses a zone boundary, represent the
    // remaining copper as up to four non-overlapping rectangles. This avoids
    // storing an invalid hole that extends outside the zone. Non-rectangular
    // intersections continue through the conservative containment path below.
    const axisAlignedRectBounds = (ring: { x: number; y: number }[]) => {
      if (ring.length !== 4) return null;
      const bounds = polygonBounds(ring);
      if (bounds.maxX - bounds.minX <= 1e-9 || bounds.maxY - bounds.minY <= 1e-9) return null;
      const corners = new Set(ring.map((point) => `${point.x.toFixed(9)},${point.y.toFixed(9)}`));
      const expected = [
        `${bounds.minX.toFixed(9)},${bounds.minY.toFixed(9)}`,
        `${bounds.maxX.toFixed(9)},${bounds.minY.toFixed(9)}`,
        `${bounds.maxX.toFixed(9)},${bounds.maxY.toFixed(9)}`,
        `${bounds.minX.toFixed(9)},${bounds.maxY.toFixed(9)}`,
      ];
      return expected.every((corner) => corners.has(corner)) ? bounds : null;
    };
    const clearRect = axisAlignedRectBounds(pts);
    if (clearRect) {
      // Exact rectangular subtraction for rectangular Gerber copper pads that
      // are only partially covered by a rectangular LPC region. Keep the result
      // as copper pads (rather than a zone overlay) so downstream PCB rendering
      // and selection continue to use the existing pad pipeline. Through-hole
      // pads are intentionally excluded because splitting one would duplicate
      // or lose its drill semantics.
      const padFragments: typeof pads = [];
      const splitPadIds = new Set<string>();
      for (const pad of pads) {
        if (pad.layer !== layerId || pad.shape !== "rect" || pad.drill || pad.width <= 0 || pad.height <= 0) continue;
        const padRect = {
          minX: pad.x - pad.width / 2, maxX: pad.x + pad.width / 2,
          minY: pad.y - pad.height / 2, maxY: pad.y + pad.height / 2,
        };
        if (!boundsOverlap(clearRect, padRect)) continue;
        const ix0 = Math.max(padRect.minX, clearRect.minX);
        const iy0 = Math.max(padRect.minY, clearRect.minY);
        const ix1 = Math.min(padRect.maxX, clearRect.maxX);
        const iy1 = Math.min(padRect.maxY, clearRect.maxY);
        if (ix1 <= ix0 + 1e-9 || iy1 <= iy0 + 1e-9) continue;
        // Pads completely covered by the clearance were removed earlier. For
        // partial overlap, retain up to four non-overlapping rectangular pieces.
        const rects = [
          { minX: padRect.minX, minY: padRect.minY, maxX: padRect.maxX, maxY: iy0 },
          { minX: padRect.minX, minY: iy1, maxX: padRect.maxX, maxY: padRect.maxY },
          { minX: padRect.minX, minY: iy0, maxX: ix0, maxY: iy1 },
          { minX: ix1, minY: iy0, maxX: padRect.maxX, maxY: iy1 },
        ].filter((rect) => rect.maxX - rect.minX > 1e-9 && rect.maxY - rect.minY > 1e-9);
        if (!rects.length) continue;
        splitPadIds.add(pad.id);
        for (const rect of rects) {
          const width = rect.maxX - rect.minX, height = rect.maxY - rect.minY;
          padFragments.push({
            ...pad,
            id: `${pad.id}-lpc-${++importedFragmentSequence}`,
            x: (rect.minX + rect.maxX) / 2,
            y: (rect.minY + rect.maxY) / 2,
            width,
            height,
          });
        }
      }
      if (splitPadIds.size) {
        for (let i = pads.length - 1; i >= 0; i--) if (splitPadIds.has(pads[i].id)) pads.splice(i, 1);
        pads.push(...padFragments);
      }
      for (let i = zones.length - 1; i >= 0; i--) {
        const zone = zones[i];
        if (zone.layer !== layerId || !zone.boundary || zone.boundary.holes?.length) continue;
        const zoneRect = axisAlignedRectBounds(zone.boundary.pts);
        if (!zoneRect || !boundsOverlap(clearRect, zoneRect)) continue;
        // If the clear is inside the zone, the regular hole representation below
        // is preferable. If the zone is inside the clear it was removed above.
        if (ringContainsRing(zone.boundary.pts, pts) || ringContainsRing(pts, zone.boundary.pts)) continue;
        const ix0 = Math.max(zoneRect.minX, clearRect.minX);
        const iy0 = Math.max(zoneRect.minY, clearRect.minY);
        const ix1 = Math.min(zoneRect.maxX, clearRect.maxX);
        const iy1 = Math.min(zoneRect.maxY, clearRect.maxY);
        if (ix1 <= ix0 || iy1 <= iy0) continue;
        const rectangles = [
          { minX: zoneRect.minX, minY: zoneRect.minY, maxX: zoneRect.maxX, maxY: iy0 },
          { minX: zoneRect.minX, minY: iy1, maxX: zoneRect.maxX, maxY: zoneRect.maxY },
          { minX: zoneRect.minX, minY: iy0, maxX: ix0, maxY: iy1 },
          { minX: ix1, minY: iy0, maxX: zoneRect.maxX, maxY: iy1 },
        ].filter((rect) => rect.maxX - rect.minX > 1e-9 && rect.maxY - rect.minY > 1e-9);
        const fragments = rectangles.map((rect) => {
          const ring = [
            { x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY },
            { x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY },
          ];
          return {
            ...zone,
            id: `${zone.id}-lpc-${++importedFragmentSequence}`,
            boundary: { pts: ring },
            ...(zone.filledPolygons ? { filledPolygons: zone.filledPolygons.map((polygon) => ({ ...polygon, pts: ring, holes: [] })) } : {}),
          };
        });
        zones.splice(i, 1, ...fragments);
      }
    }

    // For an axis-aligned rectangular clearance crossing a non-rectangular
    // simple zone, decompose the remaining polygon into non-overlapping
    // trapezoids using vertical slabs. Slab boundaries include every zone
    // vertex and both clearance edges, so each polygon edge is linear within
    // a slab. Zones with existing holes are deliberately left to the existing
    // conservative path because flattening their topology would be unsafe.
    if (clearRect) {
      for (let i = zones.length - 1; i >= 0; i--) {
        const zone = zones[i];
        if (zone.layer !== layerId || !zone.boundary || zone.boundary.pts.length < 3) continue;
        if (zone.boundary.holes?.length) continue;
        const ring = zone.boundary.pts;
        if (axisAlignedRectBounds(ring) || !boundsOverlap(clearRect, polygonBounds(ring))) continue;
        if (ringContainsRing(ring, pts) || ringContainsRing(pts, ring)) continue;
        const zoneBounds = polygonBounds(ring);
        const xCuts = [...new Set([
          zoneBounds.minX, zoneBounds.maxX,
          ...ring.map((point) => point.x).filter((x) => x > zoneBounds.minX + 1e-9 && x < zoneBounds.maxX - 1e-9),
          ...(clearRect.minX > zoneBounds.minX && clearRect.minX < zoneBounds.maxX ? [clearRect.minX] : []),
          ...(clearRect.maxX > zoneBounds.minX && clearRect.maxX < zoneBounds.maxX ? [clearRect.maxX] : []),
          // Add exact x coordinates where polygon edges cross the rectangle's
          // horizontal boundaries; otherwise clipping a sloped edge at a slab
          // endpoint would create a diagonal where the true boundary is flat.
          ...ring.flatMap((point, index) => {
            const next = ring[(index + 1) % ring.length];
            if (Math.abs(next.y - point.y) < 1e-12) return [];
            return [clearRect.minY, clearRect.maxY].flatMap((y) => {
              const t = (y - point.y) / (next.y - point.y);
              const x = point.x + t * (next.x - point.x);
              return t > 0 && t < 1 && x > zoneBounds.minX + 1e-9 && x < zoneBounds.maxX - 1e-9 ? [x] : [];
            });
          }),
        ])].sort((a, b) => a - b);
        const fragments: PcbZone[] = [];
        const yAt = (edge: { x: number; y: number }, next: { x: number; y: number }, x: number) => {
          const dx = next.x - edge.x;
          if (Math.abs(dx) < 1e-12) return (edge.y + next.y) / 2;
          return edge.y + (next.y - edge.y) * ((x - edge.x) / dx);
        };
        for (let slab = 0; slab < xCuts.length - 1; slab++) {
          const x0 = xCuts[slab], x1 = xCuts[slab + 1];
          if (x1 - x0 <= 1e-9) continue;
          const xm = (x0 + x1) / 2;
          const crossings: { midY: number; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
          for (let edgeIndex = 0; edgeIndex < ring.length; edgeIndex++) {
            const a = ring[edgeIndex], b = ring[(edgeIndex + 1) % ring.length];
            if ((a.x <= xm && b.x > xm) || (b.x <= xm && a.x > xm)) {
              crossings.push({ midY: yAt(a, b, xm), a, b });
            }
          }
          crossings.sort((a, b) => a.midY - b.midY);
          for (let j = 0; j + 1 < crossings.length; j += 2) {
            const low = crossings[j], high = crossings[j + 1];
            const low0 = yAt(low.a, low.b, x0), low1 = yAt(low.a, low.b, x1);
            const high0 = yAt(high.a, high.b, x0), high1 = yAt(high.a, high.b, x1);
            const bands = clearRect.minX <= xm && xm < clearRect.maxX
              ? [[-Infinity, clearRect.minY], [clearRect.maxY, Infinity]]
              : [[-Infinity, Infinity]];
            for (const [bandMin, bandMax] of bands) {
              const y00 = Math.max(low0, bandMin), y01 = Math.max(low1, bandMin);
              const y10 = Math.min(high0, bandMax), y11 = Math.min(high1, bandMax);
              if (Math.min(y10 - y00, y11 - y01) <= 1e-9) continue;
              const fragmentPts = [
                { x: x0, y: y00 }, { x: x1, y: y01 },
                { x: x1, y: y11 }, { x: x0, y: y10 },
              ];
              fragments.push({
                ...zone,
                id: `${zone.id}-lpc-${++importedFragmentSequence}`,
                boundary: { pts: fragmentPts },
                ...(zone.filledPolygons ? { filledPolygons: [{ pts: fragmentPts, holes: [] }] } : {}),
              });
            }
          }
        }
        // Only replace the original if decomposition yielded valid residual
        // copper. Otherwise retain the original rather than risk data loss.
        if (fragments.length) zones.splice(i, 1, ...fragments);
      }
    }

    // General simple-polygon subtraction for non-rectangular LPC regions.
    // A vertical decomposition turns each x-slab into non-overlapping trapezoids.
    // Include polygon vertices and edge/edge intersections as slab boundaries so
    // the vertical ordering of boundary edges cannot change inside a slab. Zones
    // with pre-existing holes are intentionally skipped until their topology can
    // be preserved by the same operation.
    if (!clearRect) {
      const cross = (a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}) =>
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const intersectionX = (
        a: {x:number;y:number}, b: {x:number;y:number},
        c: {x:number;y:number}, d: {x:number;y:number},
      ) => {
        const rx = b.x - a.x, ry = b.y - a.y;
        const sx = d.x - c.x, sy = d.y - c.y;
        const denominator = rx * sy - ry * sx;
        if (Math.abs(denominator) < 1e-12) return null;
        const qx = c.x - a.x, qy = c.y - a.y;
        const t = (qx * sy - qy * sx) / denominator;
        const u = (qx * ry - qy * rx) / denominator;
        return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9
          ? a.x + t * rx : null;
      };
      const yOnEdge = (a: {x:number;y:number}, b: {x:number;y:number}, x: number) =>
        a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x));
      for (let zoneIndex = zones.length - 1; zoneIndex >= 0; zoneIndex--) {
        const zone = zones[zoneIndex];
        if (zone.layer !== layerId || !zone.boundary || zone.boundary.pts.length < 3) continue;
        const ring = zone.boundary.pts;
        if (zone.boundary.holes?.length || !boundsOverlap(clearBounds, polygonBounds(ring))) continue;
        // Existing containment handling below represents a fully-contained clear
        // region as a hole, and fully covered zones have already been removed.
        if (ringContainsRing(ring, pts) || ringContainsRing(pts, ring)) continue;
        const zoneBounds = polygonBounds(ring);
        const overlapMinX = Math.max(zoneBounds.minX, clearBounds.minX);
        const overlapMaxX = Math.min(zoneBounds.maxX, clearBounds.maxX);
        if (overlapMaxX - overlapMinX <= 1e-9) continue;
        const xCuts = [
          zoneBounds.minX, zoneBounds.maxX,
          ...ring.map((point) => point.x),
          ...pts.map((point) => point.x),
        ].filter((x) => x >= zoneBounds.minX - 1e-9 && x <= zoneBounds.maxX + 1e-9);
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          for (let j = 0; j < pts.length; j++) {
            const c = pts[j], d = pts[(j + 1) % pts.length];
            const x = intersectionX(a, b, c, d);
            if (x !== null && x > zoneBounds.minX + 1e-9 && x < zoneBounds.maxX - 1e-9) xCuts.push(x);
          }
        }
        const cuts = [...new Set(xCuts.map((x) => Math.round(x * 1e9) / 1e9))].sort((a, b) => a - b);
        const edges = [
          ...ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length], source: 'zone' as const })),
          ...pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length], source: 'clear' as const })),
        ];
        const fragments: PcbZone[] = [];
        for (let slab = 0; slab < cuts.length - 1; slab++) {
          const x0 = cuts[slab], x1 = cuts[slab + 1];
          if (x1 - x0 <= 1e-9) continue;
          const xm = (x0 + x1) / 2;
          const crossings = edges.filter(({a,b}) =>
            (a.x <= xm && b.x > xm) || (b.x <= xm && a.x > xm))
            .map((edge) => ({ ...edge, midY: yOnEdge(edge.a, edge.b, xm) }))
            .sort((a, b) => a.midY - b.midY);
          // Coincident boundaries do not create a filled band; collapse their
          // y-values before classifying the open intervals between crossings.
          const uniqueCrossings = crossings.filter((edge, index) =>
            index === 0 || Math.abs(edge.midY - crossings[index - 1].midY) > 1e-9);
          for (let j = 0; j < uniqueCrossings.length - 1; j++) {
            const low = uniqueCrossings[j], high = uniqueCrossings[j + 1];
            if (high.midY - low.midY <= 1e-9) continue;
            const probe = { x: xm, y: (low.midY + high.midY) / 2 };
            if (!pointInPolygon(probe, ring) || pointInPolygon(probe, pts)) continue;
            const low0 = yOnEdge(low.a, low.b, x0), low1 = yOnEdge(low.a, low.b, x1);
            const high0 = yOnEdge(high.a, high.b, x0), high1 = yOnEdge(high.a, high.b, x1);
            const fragmentPts = [
              { x: x0, y: low0 }, { x: x1, y: low1 },
              { x: x1, y: high1 }, { x: x0, y: high0 },
            ];
            const twiceArea = fragmentPts.reduce((sum, point, index) => {
              const next = fragmentPts[(index + 1) % fragmentPts.length];
              return sum + point.x * next.y - next.x * point.y;
            }, 0);
            if (Math.abs(twiceArea) <= 1e-10) continue;
            fragments.push({
              ...zone,
              id: `${zone.id}-lpc-${++importedFragmentSequence}`,
              boundary: { pts: fragmentPts },
              ...(zone.filledPolygons ? { filledPolygons: [{ pts: fragmentPts, holes: [] }] } : {}),
            });
          }
        }
        // Do not lose copper if a degenerate/self-intersecting contour defeats
        // decomposition; only replace the source zone when a valid result exists.
        if (fragments.length) zones.splice(zoneIndex, 1, ...fragments);
      }
    }

    const targets = zones.filter((zone) => {
      if (zone.layer !== layerId || !zone.boundary || zone.boundary.pts.length < 3) return false;
      if (!boundsOverlap(clearBounds, polygonBounds(zone.boundary.pts))) return false;
      // A clear object wholly inside an existing clearance changes no pixels;
      // don't create overlapping/nested holes that can confuse polygon triangulation.
      if ((zone.boundary.holes || []).some((existingHole) => ringContainsRing(existingHole, pts))) return false;
      return ringContainsRing(zone.boundary.pts, pts);
    });
    if (!targets.length) return coveredPadIds.size > 0 || coveredTrackIds.size > 0 || coveredZoneIds.size > 0;
    for (const target of targets) {
      const hole = pts.map((point) => ({ x: point.x, y: point.y }));
      // If this clearance fully covers earlier holes, those holes are redundant:
      // the larger clear region already removes their entire area. Partial
      // intersections still need a true polygon boolean clipper and are not guessed.
      target.boundary.holes = [...(target.boundary.holes || []).filter((existingHole) => !ringContainsRing(hole, existingHole)), hole];
      // Keep the WebGL fill geometry's hole list in sync with the editable zone
      // boundary. Some zones can contain multiple filled polygons.
      if (target.filledPolygons?.length) {
        target.filledPolygons = target.filledPolygons.map((fillPoly) => {
          if (!ringContainsRing(fillPoly.pts, hole)) return fillPoly;
          const previousHoles = fillPoly.holes || [];
          return {
            ...fillPoly,
            holes: [...previousHoles.filter((existingHole) => !ringContainsRing(hole, existingHole)), hole.map((point) => ({ ...point }))],
          };
        });
      }
    }
    return true;
  };

  // Tracks accumulator
  let activeTrackPoints: { x: number; y: number }[] = [];
  let activeTrackWidth = 0.25;

  const flushActiveTrack = () => {
    if (activeTrackPoints.length >= 2) {
      if (regionPolarity === "clear" && (layerId === "top_copper" || layerId === "bottom_copper")) {
        // Clear-polarity strokes erase existing copper. Approximate each stroke
        // segment as a capsule-shaped polygon and subtract only when fully inside
        // an existing zone; never accidentally import it as a new copper track.
        for (let i = 0; i < activeTrackPoints.length - 1; i++) {
          const a = activeTrackPoints[i], b = activeTrackPoints[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
          const radius = Math.max(0, activeTrackWidth) / 2;
          if (length <= 1e-9 || radius <= 0) continue;
          const angle = Math.atan2(dy, dx);
          const capSteps = 12;
          const polygon: { x: number; y: number }[] = [];
          for (let step = 0; step <= capSteps; step++) {
            const theta = angle + Math.PI / 2 - (Math.PI * step / capSteps);
            polygon.push({ x: b.x + Math.cos(theta) * radius, y: b.y + Math.sin(theta) * radius });
          }
          for (let step = 0; step <= capSteps; step++) {
            const theta = angle - Math.PI / 2 - (Math.PI * step / capSteps);
            polygon.push({ x: a.x + Math.cos(theta) * radius, y: a.y + Math.sin(theta) * radius });
          }
          subtractContainedShape(polygon);
        }
      } else {
        tracks.push({
          id: `track-imported-${Math.random().toString(36).substr(2, 9)}`,
          layer: layerId,
          width: activeTrackWidth,
          points: [...activeTrackPoints],
        });
      }
    }
    activeTrackPoints = [];
  };

  // Convert coordinate string to mm
  const parseCoordinate = (
    coordStr: string,
    scale: number,
    integerDigits: number,
    fractionalDigits: number,
  ): number => {
    if (!coordStr) return 0;
    const sign = coordStr.startsWith("-") ? -1 : 1;
    let raw = coordStr.replace(/^[+-]/, "");
    let result: number;

    if (raw.includes(".")) {
      result = Number(raw);
    } else {
      // FS supports both leading-zero suppression (L) and trailing-zero
      // suppression (T). Expand the omitted zeros before converting to mm.
      const totalDigits = integerDigits + fractionalDigits;
      if (zeroSuppression === "trailing" && raw.length < totalDigits) {
        raw = raw.padEnd(totalDigits, "0");
      } else if (zeroSuppression === "leading" && raw.length < totalDigits) {
        raw = raw.padStart(totalDigits, "0");
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 0;
      result = parsed / scale;
    }

    result *= sign;
    if (units === "inch") result *= 25.4;
    return result;
  };

  // Clean and split by Gerber block separator '*'
  const blocks = commandContent.split("*");

  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;

    // Parameter block: enclosed in % or contains parameter commands
    if (block.includes("%")) {
      const paramContent = block.replace(/%/g, "").trim();

      // Gerber load polarity. Clear polarity is recorded, but exact compositing
      // requires ordered boolean operations across all primitives; do not silently
      // misrepresent it as dark copper.
      if (/^LP[DC]$/i.test(paramContent)) {
        regionPolarity = paramContent.toUpperCase() === "LPC" ? "clear" : "dark";
        continue;
      }
      const mirrorMatch = paramContent.match(/^LM(N|XY|X|Y)$/i);
      if (mirrorMatch) {
        const mode = mirrorMatch[1].toUpperCase();
        mirrorX = mode === "X" || mode === "XY";
        mirrorY = mode === "Y" || mode === "XY";
        continue;
      }
      const rotationMatch = paramContent.match(/^LR([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
      if (rotationMatch) {
        apertureRotation = Number(rotationMatch[1]);
        continue;
      }
      const scalingMatch = paramContent.match(/^LS([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
      if (scalingMatch) {
        const nextScale = Number(scalingMatch[1]);
        apertureScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;
        continue;
      }

      // Units setting
      if (paramContent.includes("MOMM")) {
        units = "mm";
        continue;
      } else if (paramContent.includes("MOIN")) {
        units = "inch";
        continue;
      }

      // Step-and-repeat: %SRX2Y3I10J5*% opens a repeated block;
      // %SR*% closes it. Distances are expressed in the current Gerber units.
      if (/^SR(?:X|\*)/i.test(paramContent) || /^SR$/i.test(paramContent)) {
        flushActiveTrack();
        const srBody = paramContent.replace(/^SR/i, "");
        if (!srBody) {
          if (stepRepeat) {
            const sr = stepRepeat;
            const sourceTracks = tracks.slice(sr.trackStart);
            const sourcePads = pads.slice(sr.padStart);
            const sourceZones = zones.slice(sr.zoneStart);
            const sourceOutlines = outlineSegments.slice(sr.outlineStart);
            for (let iy = 0; iy < sr.ny; iy++) {
              for (let ix = 0; ix < sr.nx; ix++) {
                if (ix === 0 && iy === 0) continue;
                const dx = ix * sr.dx;
                const dy = iy * sr.dy;
                sourceTracks.forEach((t) => tracks.push({
                  ...t,
                  id: `track-imported-${Math.random().toString(36).slice(2, 11)}`,
                  points: t.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
                }));
                sourcePads.forEach((pad) => pads.push({
                  ...pad,
                  id: `pad-imported-${Math.random().toString(36).slice(2, 11)}`,
                  x: pad.x + dx,
                  y: pad.y + dy,
                }));
                sourceZones.forEach((zone) => {
                  const pts = zone.boundary.pts.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
                  zones.push({ ...zone, id: `gerber-region-${Math.random().toString(36).slice(2, 11)}`, boundary: { ...zone.boundary, pts }, filledPolygons: [{ layer: zone.layer, pts }] });
                });
                sourceOutlines.forEach((seg) => outlineSegments.push({
                  x1: seg.x1 + dx, y1: seg.y1 + dy,
                  x2: seg.x2 + dx, y2: seg.y2 + dy,
                }));
              }
            }
            stepRepeat = null;
          }
        } else {
          const getNumber = (key: string, fallback: number) => {
            const match = srBody.match(new RegExp(`${key}([-+]?[0-9.]+)`, "i"));
            if (!match) return fallback;
            const value = Number(match[1]);
            return Number.isFinite(value) ? value : fallback;
          };
          const unitScale = units === "inch" ? 25.4 : 1;
          stepRepeat = {
            nx: Math.max(1, Math.min(100, Math.floor(getNumber("X", 1)))),
            ny: Math.max(1, Math.min(100, Math.floor(getNumber("Y", 1)))),
            dx: getNumber("I", 0) * unitScale,
            dy: getNumber("J", 0) * unitScale,
            trackStart: tracks.length,
            padStart: pads.length,
            zoneStart: zones.length,
            outlineStart: outlineSegments.length,
          };
        }
        continue;
      }

      // Format specification: e.g. %FSLAX34Y34*% or %FSTIX24Y24*%.
      if (paramContent.includes("FS")) {
        const fsMatch = paramContent.match(/FS([LT])([AI])X([0-9])([0-9])Y([0-9])([0-9])/i);
        if (fsMatch) {
          zeroSuppression = fsMatch[1].toUpperCase() === "T" ? "trailing" : "leading";
          coordinateMode = fsMatch[2].toUpperCase() === "I" ? "incremental" : "absolute";
          integerDigitsX = parseInt(fsMatch[3], 10);
          fractionalDigitsX = parseInt(fsMatch[4], 10);
          integerDigitsY = parseInt(fsMatch[5], 10);
          fractionalDigitsY = parseInt(fsMatch[6], 10);
          scaleX = Math.pow(10, fractionalDigitsX);
          scaleY = Math.pow(10, fractionalDigitsY);
        }
        continue;
      }

      // Aperture definition (e.g. ADD10C,1.5)
      if (paramContent.startsWith("ADD") || paramContent.includes("ADD")) {
        const apMatch = paramContent.match(/ADD([0-9]+)([A-Za-z_][A-Za-z0-9_$]*),?([^%]*)/);
        if (apMatch) {
          const dcode = parseInt(apMatch[1], 10);
          const shape = apMatch[2].toUpperCase();
          const dimParts = apMatch[3].split("X");
          const dims = dimParts.map(d => {
            const val = parseFloat(d);
            return units === "inch" ? val * 25.4 : val;
          });
          // Keep AD macro modifiers in file units; the flash geometry stage
          // converts dimensional modifiers to millimetres exactly once.
          const adParameters = apMatch[3].split("X").filter(Boolean).map((value) => Number(value));
          const macroPrimitives = instantiateMacro(shape, adParameters);
          apertures.set(dcode, { shape, dims, ...(macroPrimitives?.length ? { macroPrimitives } : {}), ...(blockApertures.has(dcode) ? { blockContent: blockApertures.get(dcode) } : {}) });
        }
        continue;
      }

      // If it starts with % but isn't a known parameter and doesn't contain coordinates or D-codes, skip
      if (!paramContent.match(/[XYD][0-9]/)) {
        continue;
      }

      // Otherwise, clean leading/trailing % so data block commands can execute
      block = paramContent;
    }

    // Region boundaries: collect D01 coordinates between G36 and G37 as a
    // filled polygon. The polygon is consumed by the existing WebGL zone pass.
    if (/G0?36/.test(block)) {
      flushActiveTrack();
      regionMode = true;
      activeRegion = [{ x: currentX, y: currentY }];
      block = block.replace(/G0?36/g, "");
    }
    const endsRegion = /G0?37/.test(block);
    if (endsRegion) block = block.replace(/G0?37/g, "");

    // Comment
    if (block.startsWith("G04") || block.startsWith("G4")) {
      continue;
    }

    // G-codes in data blocks. G90/G91 may appear alongside coordinates.
    if (/G0?1(?:\D|$)/.test(block)) interpolationMode = "linear";
    if (/G0?2(?:\D|$)/.test(block)) interpolationMode = "cw";
    if (/G0?3(?:\D|$)/.test(block)) interpolationMode = "ccw";
    if (/G0?90(?:\D|$)/.test(block)) coordinateMode = "absolute";
    if (/G0?91(?:\D|$)/.test(block)) coordinateMode = "incremental";
    if (/G70(?:\D|$)/.test(block)) units = "inch";
    if (/G71(?:\D|$)/.test(block)) units = "mm";

    // Parse coordinates and active operation D-code
    let hasX = false;
    let hasY = false;
    let targetX = currentX;
    let targetY = currentY;

    // Extract X and Y coordinates
    const xMatch = block.match(/X([-+]?[0-9.]+)/);
    if (xMatch) {
      const parsedX = parseCoordinate(xMatch[1], scaleX, integerDigitsX, fractionalDigitsX);
      targetX = coordinateMode === "incremental" ? currentX + parsedX : parsedX;
      hasX = true;
    }
    const yMatch = block.match(/Y([-+]?[0-9.]+)/);
    if (yMatch) {
      const parsedY = parseCoordinate(yMatch[1], scaleY, integerDigitsY, fractionalDigitsY);
      targetY = coordinateMode === "incremental" ? currentY + parsedY : parsedY;
      hasY = true;
    }

    // Arc center offsets are always relative to the current point. Gerber I/J
    // use the same coordinate format and units as X/Y, independent of G90/G91.
    const iMatch = block.match(/I([-+]?[0-9.]+)/);
    const jMatch = block.match(/J([-+]?[0-9.]+)/);
    const arcI = iMatch ? parseCoordinate(iMatch[1], scaleX, integerDigitsX, fractionalDigitsX) : 0;
    const arcJ = jMatch ? parseCoordinate(jMatch[1], scaleY, integerDigitsY, fractionalDigitsY) : 0;
    const makeArcPoints = (x0: number, y0: number, x1: number, y1: number) => {
      if (interpolationMode === "linear" || (!iMatch && !jMatch)) return [{ x: x1, y: y1 }];
      const cx = x0 + arcI;
      const cy = y0 + arcJ;
      const radius = Math.hypot(x0 - cx, y0 - cy);
      if (!Number.isFinite(radius) || radius <= 1e-9) return [{ x: x1, y: y1 }];
      const startAngle = Math.atan2(y0 - cy, x0 - cx);
      const endAngle = Math.atan2(y1 - cy, x1 - cx);
      let sweep = endAngle - startAngle;
      if (interpolationMode === "cw") {
        while (sweep >= 0) sweep -= Math.PI * 2;
      } else {
        while (sweep <= 0) sweep += Math.PI * 2;
      }
      // Equal start/end coordinates represent a full circle in multi-quadrant mode.
      if (Math.hypot(x1 - x0, y1 - y0) < 1e-8) sweep = interpolationMode === "cw" ? -Math.PI * 2 : Math.PI * 2;
      // Adaptive tessellation: preserve small arcs without wasting vertices, while
      // keeping large-radius arcs accurate enough for PCB copper/outline geometry.
      // The maximum sagitta error is 0.01 mm, capped to bound import cost.
      const endpointRadius = Math.hypot(x1 - cx, y1 - cy);
      const tessellationRadius = Math.max(radius, Number.isFinite(endpointRadius) ? endpointRadius : radius);
      const maxSagittaMm = 0.01;
      const maxStepAngle = tessellationRadius > maxSagittaMm
        ? 2 * Math.acos(Math.max(-1, Math.min(1, 1 - maxSagittaMm / tessellationRadius)))
        : Math.PI / 18;
      const safeStepAngle = Number.isFinite(maxStepAngle) && maxStepAngle > 1e-6 ? maxStepAngle : Math.PI / 180;
      const steps = Math.max(2, Math.min(720, Math.ceil(Math.abs(sweep) / safeStepAngle)));
      const points: { x: number; y: number }[] = [];
      for (let step = 1; step <= steps; step++) {
        const angle = startAngle + sweep * step / steps;
        points.push(step === steps ? { x: x1, y: y1 } : { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
      }
      return points;
    };

    // Check for aperture selection (e.g. D10)
    const apSelMatch = block.match(/D([1-9][0-9]+)/);
    if (apSelMatch) {
      const dcode = parseInt(apSelMatch[1], 10);
      if (apertures.has(dcode)) {
        flushActiveTrack();
        currentAperture = dcode;
        const ap = apertures.get(dcode)!;
        activeTrackWidth = ap.dims[0] || 0.25;
      }
    }

    // Action code (D01, D02, D03)
    const actionMatch = block.match(/D0(1|2|3)\*?$/) || block.match(/D(1|2|3)\*?$/);
    const action = actionMatch ? parseInt(actionMatch[1], 10) : null;

    if (hasX || hasY || action) {
      const act = action !== null ? action : 1; // Default to D01 if movement happened without explicit D-code

      if (act === 2) {
        // D02: Move (Pen Up)
        flushActiveTrack();
        currentX = targetX;
        currentY = targetY;
        if (regionMode) activeRegion = [{ x: currentX, y: currentY }];
        activeTrackPoints = [{ x: currentX, y: currentY }];
      } else if (act === 1) {
        // D01: Draw (Pen Down)
        if (activeTrackPoints.length === 0) {
          activeTrackPoints.push({ x: currentX, y: currentY });
        }
        const segmentPoints = makeArcPoints(currentX, currentY, targetX, targetY);
        let previous = { x: currentX, y: currentY };
        for (const point of segmentPoints) {
          if (regionMode) activeRegion.push(point);
          else activeTrackPoints.push(point);
          if (layerId === "outline") {
            outlineSegments.push({ x1: previous.x, y1: previous.y, x2: point.x, y2: point.y });
          }
          previous = point;
        }

        currentX = targetX;
        currentY = targetY;
      } else if (act === 3) {
        // D03: Flash (Stamp Aperture)
        currentX = targetX;
        currentY = targetY;
        flushActiveTrack();

        if (currentAperture && apertures.has(currentAperture)) {
          const ap = apertures.get(currentAperture)!;
          const w = ap.dims[0] || 1.0;
          const h = ap.dims[1] || w;

          // Render a block aperture as a collection of child Gerber objects.
          // Parameter definitions (FS/MO/AD/AM) are copied into the isolated
          // stream; AB declarations are intentionally excluded to avoid recursion.
          if (ap.blockContent !== undefined) {
            if (regionPolarity === "dark") {
              const parameterPreamble = (content.match(/%[^%]*%/g) || []).filter((command) =>
                /^%(?:FS|MO|ADD|AM|IN|IP|IR|AS|MI|OF|SF|LN|LPD)/i.test(command.replace(/\s/g, "")) &&
                !/^%AB/i.test(command.replace(/\s/g, ""))
              ).join("\n");
              // Include the complete block dictionary before the selected body. This
              // lets nested blocks refer to sibling/global D-codes during recursion.
              const blockDictionary = [...blockApertures.entries()]
                .filter(([dcode]) => dcode !== currentAperture)
                .map(([dcode, body]) => `%ABD${dcode}*%\n${body}\n%AB*%`)
                .join("\n");
              const child = parseGerberFile(`${parameterPreamble}\n${blockDictionary}\n${ap.blockContent}\nM02*`, layerId, true, blockDepth + 1);
              const transformPoint = (point: {x:number;y:number}) => {
                let x = point.x * (mirrorX ? -1 : 1) * apertureScale;
                let y = point.y * (mirrorY ? -1 : 1) * apertureScale;
                const radians = apertureRotation * Math.PI / 180;
                const cos = Math.cos(radians), sin = Math.sin(radians);
                const tx = x * cos - y * sin;
                const ty = x * sin + y * cos;
                return { x: tx + currentX, y: ty + currentY };
              };
              child.tracks.forEach((track) => tracks.push({ ...track, id: `gerber-block-track-${Math.random().toString(36).slice(2,11)}`, width: track.width * apertureScale, points: track.points.map(transformPoint) }));
              child.pads.forEach((pad) => {
                const point = transformPoint({x:pad.x,y:pad.y});
                pads.push({ ...pad, id: `gerber-block-pad-${Math.random().toString(36).slice(2,11)}`, x: point.x, y: point.y, width: pad.width * apertureScale, height: pad.height * apertureScale });
              });
              child.zones.forEach((zone) => {
                const translateRing = (ring: {x:number;y:number}[]) => ring.map(transformPoint);
                const boundary = { ...zone.boundary, pts: translateRing(zone.boundary.pts), ...(zone.boundary.holes ? {holes: zone.boundary.holes.map(translateRing)} : {}) };
                const filledPolygons = zone.filledPolygons?.map((polygon) => ({ ...polygon, pts: translateRing(polygon.pts), ...(polygon.holes ? {holes: polygon.holes.map(translateRing)} : {}) }));
                zones.push({ ...zone, id: `gerber-block-zone-${Math.random().toString(36).slice(2,11)}`, boundary, ...(filledPolygons ? {filledPolygons} : {}) });
              });
              child.outlineSegments.forEach((seg) => {
                const a = transformPoint({x:seg.x1,y:seg.y1});
                const b = transformPoint({x:seg.x2,y:seg.y2});
                outlineSegments.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y});
              });
            } else if (layerId === "top_copper" || layerId === "bottom_copper") {
              // A clear block flash removes its child image from the existing
              // copper image. The current document model supports contained
              // polygon holes, so convert child pads/tracks/zones to polygons
              // and subtract them where fully contained. Intersecting or
              // out-of-order boolean cases still require a polygon clipper.
              const circlePoints = (cx: number, cy: number, rx: number, ry = rx) =>
                Array.from({ length: 48 }, (_, i) => ({ x: cx + Math.cos(i * Math.PI / 24) * rx, y: cy + Math.sin(i * Math.PI / 24) * ry }));
              child.zones.forEach((zone) => {
                const pts = zone.boundary.pts.map(transformPoint);
                subtractContainedShape(pts);
              });
              child.pads.forEach((pad) => {
                const cx = pad.x, cy = pad.y;
                let local: {x:number;y:number}[];
                if (pad.shape === "circle") local = circlePoints(cx, cy, pad.width / 2, pad.height / 2);
                else local = [{x:cx-pad.width/2,y:cy-pad.height/2},{x:cx+pad.width/2,y:cy-pad.height/2},{x:cx+pad.width/2,y:cy+pad.height/2},{x:cx-pad.width/2,y:cy+pad.height/2}];
                subtractContainedShape(local.map(transformPoint));
              });
              child.tracks.forEach((track) => {
                for (let i = 1; i < track.points.length; i++) {
                  const a = track.points[i - 1], b = track.points[i];
                  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
                  if (length <= 1e-9) continue;
                  const nx = -dy / length * track.width / 2, ny = dx / length * track.width / 2;
                  const pts = [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}].map(transformPoint);
                  subtractContainedShape(pts);
                }
              });
            }
            // Non-copper clear blocks cannot be composited into the current
            // PCB data model. Copper clear blocks above support contained
            // subtraction without falsely painting clear objects as dark.
            continue;
          }

          if (layerId === "top_copper" || layerId === "bottom_copper") {
            if (regionPolarity === "clear" && !ap.macroPrimitives?.length) {
              const width = Math.max(0, w);
              const height = Math.max(0, h);
              let clearPts: {x:number;y:number}[];
              if (ap.shape === "C") clearPts = Array.from({length:64},(_,i)=>({x:currentX+Math.cos(i*Math.PI/32)*width/2,y:currentY+Math.sin(i*Math.PI/32)*width/2}));
              else if (ap.shape === "O") {
                const major=Math.max(width,height), minor=Math.min(width,height), radius=minor/2, straight=(major-minor)/2;
                clearPts=Array.from({length:64},(_,i)=>{ const a=i*Math.PI/32; return width>=height ? {x:currentX+Math.cos(a)*radius+Math.sign(Math.cos(a))*straight,y:currentY+Math.sin(a)*radius} : {x:currentX+Math.cos(a)*radius,y:currentY+Math.sin(a)*radius+Math.sign(Math.sin(a))*straight}; });
              } else clearPts=[{x:currentX-width/2,y:currentY-height/2},{x:currentX+width/2,y:currentY-height/2},{x:currentX+width/2,y:currentY+height/2},{x:currentX-width/2,y:currentY+height/2}];
              subtractContainedShape(clearPts);
              continue;
            }
            if (ap.macroPrimitives?.length) {
              const makeZone = (pts: { x: number; y: number }[], name: string, holes: { x: number; y: number }[][] = []) => {
                if (pts.length < 3) return;
                zones.push({
                  id: `gerber-macro-${Math.random().toString(36).slice(2, 11)}`,
                  layer: layerId,
                  boundary: { pts, holes },
                  filledPolygons: [{ layer: layerId, pts, holes }],
                  fill: { fillMode: "solid", filled: true },
                  name,
                });
              };
              const unitScale = units === "inch" ? 25.4 : 1;
              const rotate = (pts: { x: number; y: number }[], angleDeg: number) => {
                const a = angleDeg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
                return pts.map((pt) => ({ x: pt.x * c - pt.y * sn, y: pt.x * sn + pt.y * c }));
              };
              // Build each supported primitive in flash-local coordinates, then
              // combine exposure-off primitives as transparent holes in any
              // containing exposure-on primitive. Full Gerber boolean compositing
              // for overlapping/partially intersecting shapes remains a limitation.
              const positiveShapes: { pts: { x: number; y: number }[]; name: string }[] = [];
              // Aperture macro primitives are defined in flash-local coordinates.
              // Apply the graphics-state transform to the complete macro image
              // (including exposure-off primitives) before translating it to the
              // flash point. Gerber mirrors first, then rotates and scales.
              const toWorld = (pts: { x: number; y: number }[]) => pts.map((pt) => {
                let x = pt.x * (mirrorX ? -1 : 1) * apertureScale;
                let y = pt.y * (mirrorY ? -1 : 1) * apertureScale;
                const radians = apertureRotation * Math.PI / 180;
                const tx = x * Math.cos(radians) - y * Math.sin(radians);
                const ty = x * Math.sin(radians) + y * Math.cos(radians);
                return { x: tx + currentX, y: ty + currentY };
              });
              const negativeShapes: { pts: { x: number; y: number }[] }[] = [];
              for (const primitive of ap.macroPrimitives) {
                const v = [...primitive.values];
                // Scale only dimensions and coordinates. Vertex counts and angles
                // are dimensionless and must remain unchanged in inch-mode files.
                const scaledIndices = primitive.code === 1 ? [0, 1, 2]
                  : primitive.code === 5 ? [1, 2, 3]
                  : (primitive.code === 2 || primitive.code === 20) ? [0, 1, 2, 3, 4]
                  : primitive.code === 21 ? [0, 1, 2, 3]
                  : primitive.code === 22 ? [0, 1, 2, 3]
                  : primitive.code === 6 ? [0, 1, 2, 3, 4, 6, 7] : primitive.code === 7 ? [1, 2, 3, 4, 5] : primitive.code === 4 ? Array.from({length: Math.max(0, v.length - 2)}, (_, i) => i + 1).filter(index => index < v.length - 1) : [];
                for (const index of scaledIndices) if (index < v.length) v[index] *= unitScale;
                let pts: { x: number; y: number }[] | null = null;
                let name = "Gerber aperture macro";
                if (primitive.code === 1 && v.length >= 3) {
                  const diameter = v[0], cx = v[1], cy = v[2];
                  pts = Array.from({ length: 48 }, (_, i) => ({ x: cx + Math.cos(i * Math.PI / 24) * diameter / 2, y: cy + Math.sin(i * Math.PI / 24) * diameter / 2 }));
                  name = "Gerber aperture macro circle";
                } else if ((primitive.code === 21 || primitive.code === 22) && v.length >= 5) {
                  const width = v[0], height = v[1], x = v[2], y = v[3], angle = v[4];
                  const corners = primitive.code === 21
                    ? [{x:x-width/2,y:y-height/2},{x:x+width/2,y:y-height/2},{x:x+width/2,y:y+height/2},{x:x-width/2,y:y+height/2}]
                    : [{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
                  pts = rotate(corners, angle).map(pt => ({x:pt.x,y:pt.y}));
                  name = primitive.code === 21 ? "Gerber aperture macro center-line rectangle" : "Gerber aperture macro lower-left rectangle";
                } else if ((primitive.code === 2 || primitive.code === 20) && v.length >= 6) {
                  const width=v[0], x1=v[1], y1=v[2], x2=v[3], y2=v[4], angle=v[5];
                  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy);
                  if (len > 1e-9) {
                    const nx=-dy/len*width/2, ny=dx/len*width/2;
                    pts=rotate([{x:x1+nx,y:y1+ny},{x:x2+nx,y:y2+ny},{x:x2-nx,y:y2-ny},{x:x1-nx,y:y1-ny}], angle).map(pt => ({x:pt.x,y:pt.y}));
                  }
                  name = primitive.code === 2 ? "Gerber aperture macro legacy vector line" : "Gerber aperture macro vector line";
                } else if (primitive.code === 4 && v.length >= 7) {
                  const vertices = Math.max(3, Math.min(1000, Math.floor(v[0])));
                  const expected = 1 + vertices * 2 + 1;
                  if (v.length >= expected) {
                    const angle = v[1 + vertices * 2] || 0;
                    const outline = Array.from({length: vertices}, (_, i) => ({x: v[1 + i * 2], y: v[2 + i * 2]}));
                    pts = rotate(outline, angle).map(pt => ({x:pt.x,y:pt.y}));
                  }
                  name = "Gerber aperture macro outline";
                } else if (primitive.code === 5 && v.length >= 5) {
                  const vertices=Math.max(3,Math.min(64,Math.floor(v[0]))), cx=v[1], cy=v[2], diameter=v[3], angle=v[4] || 0;
                  pts=Array.from({length:vertices},(_,i)=>({x:cx+Math.cos((angle+i*360/vertices)*Math.PI/180)*diameter/2,y:cy+Math.sin((angle+i*360/vertices)*Math.PI/180)*diameter/2}));
                  name = "Gerber aperture macro polygon";
                } else if (primitive.code === 6 && v.length >= 9) {
                  // Legacy Moiré primitive: concentric annular rings and optional
                  // orthogonal crosshairs. Ucamco deprecated code 6 in 2021, but
                  // it remains useful for importing older fabrication data.
                  const cx=v[0], cy=v[1], outer=Math.max(0,v[2]), thickness=Math.max(0,v[3]), gap=Math.max(0,v[4]);
                  const maxRings=Math.max(0,Math.min(100,Math.floor(v[5]))), crossThickness=Math.max(0,v[6]), crossLength=Math.max(0,v[7]), angle=v[8] || 0;
                  const ringCount = thickness > 0 ? Math.min(maxRings, Math.ceil(outer / (2 * thickness + gap))) : 0;
                  for (let ring=0; ring<ringCount; ring++) {
                    const diameter=outer - ring * (2 * thickness + gap);
                    if (diameter <= 0) break;
                    const outerPts=Array.from({length:64},(_,i)=>({x:cx+Math.cos(i*Math.PI/32)*diameter/2,y:cy+Math.sin(i*Math.PI/32)*diameter/2}));
                    const innerDiameter=diameter-2*thickness;
                    const holes=innerDiameter > 0 ? [Array.from({length:64},(_,i)=>({x:cx+Math.cos(i*Math.PI/32)*innerDiameter/2,y:cy+Math.sin(i*Math.PI/32)*innerDiameter/2}))] : [];
                    const worldOuter=rotate(outerPts,angle).map(pt=>({x:pt.x,y:pt.y}));
                    const worldHoles=holes.map(hole=>rotate(hole,angle).map(pt=>({x:pt.x,y:pt.y})));
                    if (regionPolarity === "dark") makeZone(toWorld(worldOuter), "Gerber aperture macro Moire ring", worldHoles.map(toWorld));
                    else subtractContainedShape(toWorld(worldOuter));
                  }
                  if (crossThickness > 0 && crossLength > 0) {
                    for (const crossAngle of [angle, angle+90]) {
                      const rad=crossAngle*Math.PI/180, half=crossLength/2, hw=crossThickness/2;
                      const bar=[{x:cx-half*Math.cos(rad)-hw*Math.sin(rad),y:cy-half*Math.sin(rad)+hw*Math.cos(rad)},{x:cx+half*Math.cos(rad)-hw*Math.sin(rad),y:cy+half*Math.sin(rad)+hw*Math.cos(rad)},{x:cx+half*Math.cos(rad)+hw*Math.sin(rad),y:cy+half*Math.sin(rad)-hw*Math.cos(rad)},{x:cx-half*Math.cos(rad)+hw*Math.sin(rad),y:cy-half*Math.sin(rad)-hw*Math.cos(rad)}];
                      const worldBar=rotate(bar,0).map(pt=>({x:pt.x,y:pt.y}));
                      if (regionPolarity === "dark") makeZone(toWorld(worldBar), "Gerber aperture macro Moire crosshair");
                      else subtractContainedShape(toWorld(worldBar));
                    }
                  }
                  continue;
                } else if (primitive.code === 7 && v.length >= 6) {
                  // Thermal primitive: approximate the annular copper with a circular
                  // outer contour and subtract the center plus two crossing gap bars.
                  // The two bars form four spokes; exact Gerber boolean compositing is
                  // still required when these gaps overlap other macro primitives.
                  const cx=v[0], cy=v[1], outer=Math.max(0,v[2]), inner=Math.max(0,v[3]), gap=Math.max(0,v[4]), angle=v[5] || 0;
                  if (outer > 0 && inner < outer) {
                    pts=Array.from({length:64},(_,i)=>({x:cx+Math.cos(i*Math.PI/32)*outer/2,y:cy+Math.sin(i*Math.PI/32)*outer/2}));
                    positiveShapes.push({pts: rotate(pts, angle).map(pt=>({x:pt.x,y:pt.y})), name:"Gerber aperture macro thermal"});
                    const innerPts=Array.from({length:64},(_,i)=>({x:cx+Math.cos(i*Math.PI/32)*inner/2,y:cy+Math.sin(i*Math.PI/32)*inner/2}));
                    negativeShapes.push({pts: rotate(innerPts, angle).map(pt=>({x:pt.x,y:pt.y}))});
                    if (gap > 0) {
                      for (const barAngle of [angle, angle+90]) {
                        const rad=barAngle*Math.PI/180, half=Math.max(0,outer/2-gap), gw=gap/2;
                        const bar=[{x:cx-half*Math.cos(rad)-gw*Math.sin(rad),y:cy-half*Math.sin(rad)+gw*Math.cos(rad)},{x:cx+half*Math.cos(rad)-gw*Math.sin(rad),y:cy+half*Math.sin(rad)+gw*Math.cos(rad)},{x:cx+half*Math.cos(rad)+gw*Math.sin(rad),y:cy+half*Math.sin(rad)-gw*Math.cos(rad)},{x:cx-half*Math.cos(rad)+gw*Math.sin(rad),y:cy-half*Math.sin(rad)-gw*Math.cos(rad)}];
                        negativeShapes.push({pts:rotate(bar,0).map(pt=>({x:pt.x,y:pt.y}))});
                      }
                    }
                  }
                  continue;
                }
                if (!pts || pts.length < 3) continue;
                if (primitive.exposure === 0) negativeShapes.push({ pts });
                else positiveShapes.push({ pts, name });
              }
              for (const shape of positiveShapes) {
                const holes = negativeShapes
                  .filter(hole => pointInPolygon(hole.pts[0], shape.pts))
                  .map(hole => toWorld(hole.pts));
                if (regionPolarity === "clear") subtractContainedShape(toWorld(shape.pts));
                else makeZone(toWorld(shape.pts), shape.name, holes);
              }
              continue;
            }
            if (regionPolarity === "clear" && (layerId === "top_copper" || layerId === "bottom_copper")) {
              // Standard aperture flashes under LPC erase prior copper; do not
              // incorrectly add them to the copper pad collection. Represent the
              // common circle/rectangle/obround cases as a polygon and subtract it
              // from contained copper zones. Cross-boundary clipping still needs a
              // full polygon-boolean engine and is intentionally not approximated.
              let flash: { x: number; y: number }[];
              if (ap.shape === "C") {
                flash = Array.from({ length: 64 }, (_, i) => ({
                  x: currentX + Math.cos(i * Math.PI / 32) * w / 2,
                  y: currentY + Math.sin(i * Math.PI / 32) * w / 2,
                }));
              } else if (ap.shape === "O") {
                const radius = Math.min(w, h) / 2;
                const horizontal = w >= h;
                const halfSpan = Math.max(0, (Math.max(w, h) - Math.min(w, h)) / 2);
                // Build a rounded rectangle as two semicircles along its long axis.
                flash = Array.from({ length: 32 }, (_, i) => {
                  const theta = (horizontal ? (i < 16 ? -Math.PI / 2 + i * Math.PI / 16 : Math.PI / 2 + (i - 16) * Math.PI / 16) : (i < 16 ? Math.PI + i * Math.PI / 16 : (i - 16) * Math.PI / 16));
                  const cx = horizontal ? currentX + (i < 16 ? halfSpan : -halfSpan) : currentX;
                  const cy = horizontal ? currentY : currentY + (i < 16 ? halfSpan : -halfSpan);
                  return { x: cx + Math.cos(theta) * radius, y: cy + Math.sin(theta) * radius };
                });
              } else {
                flash = [
                  { x: currentX - w / 2, y: currentY - h / 2 },
                  { x: currentX + w / 2, y: currentY - h / 2 },
                  { x: currentX + w / 2, y: currentY + h / 2 },
                  { x: currentX - w / 2, y: currentY + h / 2 },
                ];
              }
              // LM/LR/LS apply to the aperture shape before it is flashed.
              // The pad path stores an untransformed primitive, but LPC must
              // subtract the transformed footprint or rotated/scaled clearances
              // will erase the wrong area. Transform around the flash origin.
              flash = flash.map((point) => {
                let x = (point.x - currentX) * (mirrorX ? -1 : 1) * apertureScale;
                let y = (point.y - currentY) * (mirrorY ? -1 : 1) * apertureScale;
                const radians = apertureRotation * Math.PI / 180;
                const tx = x * Math.cos(radians) - y * Math.sin(radians);
                const ty = x * Math.sin(radians) + y * Math.cos(radians);
                return { x: currentX + tx, y: currentY + ty };
              });
              subtractContainedShape(flash);
            } else {
              // PcbPad currently has no rotation field. A rotated Gerber flash
              // therefore cannot be represented faithfully as a pad; preserve
              // its actual transformed outline as zone geometry instead.
              const normalizedRotation = ((apertureRotation % 360) + 360) % 360;
              if (normalizedRotation > 1e-8 && Math.abs(normalizedRotation - 360) > 1e-8) {
                let flash: { x: number; y: number }[];
                if (ap.shape === "C") {
                  flash = Array.from({ length: 64 }, (_, i) => ({
                    x: currentX + Math.cos(i * Math.PI / 32) * w / 2,
                    y: currentY + Math.sin(i * Math.PI / 32) * w / 2,
                  }));
                } else if (ap.shape === "O") {
                  const radius = Math.min(w, h) / 2;
                  const horizontal = w >= h;
                  const halfSpan = Math.max(0, (Math.max(w, h) - Math.min(w, h)) / 2);
                  flash = Array.from({ length: 32 }, (_, i) => {
                    const theta = horizontal
                      ? (i < 16 ? -Math.PI / 2 + i * Math.PI / 16 : Math.PI / 2 + (i - 16) * Math.PI / 16)
                      : (i < 16 ? Math.PI + i * Math.PI / 16 : (i - 16) * Math.PI / 16);
                    const cx = horizontal ? currentX + (i < 16 ? halfSpan : -halfSpan) : currentX;
                    const cy = horizontal ? currentY : currentY + (i < 16 ? halfSpan : -halfSpan);
                    return { x: cx + Math.cos(theta) * radius, y: cy + Math.sin(theta) * radius };
                  });
                } else {
                  flash = [
                    { x: currentX - w / 2, y: currentY - h / 2 },
                    { x: currentX + w / 2, y: currentY - h / 2 },
                    { x: currentX + w / 2, y: currentY + h / 2 },
                    { x: currentX - w / 2, y: currentY + h / 2 },
                  ];
                }
                const radians = apertureRotation * Math.PI / 180;
                const pts = flash.map((point) => {
                  const x = (point.x - currentX) * (mirrorX ? -1 : 1) * apertureScale;
                  const y = (point.y - currentY) * (mirrorY ? -1 : 1) * apertureScale;
                  return {
                    x: currentX + x * Math.cos(radians) - y * Math.sin(radians),
                    y: currentY + x * Math.sin(radians) + y * Math.cos(radians),
                  };
                });
                zones.push({
                  id: `gerber-flash-${Math.random().toString(36).slice(2, 11)}`,
                  layer: layerId,
                  boundary: { pts },
                  filledPolygons: [{ layer: layerId, pts }],
                  fill: { fillMode: "solid", filled: true },
                  name: "Imported rotated Gerber flash",
                });
                continue;
              }
              pads.push({
                id: `pad-imported-${Math.random().toString(36).substr(2, 9)}`,
                x: currentX,
                y: currentY,
                width: w,
                height: h,
                // Preserve standard Gerber aperture geometry instead of flattening
                // obround/oval flashes into rectangles. Polygon/macros remain a
                // conservative fallback until full macro/region support is added.
                shape: ap.shape === "C" ? "circle" : ap.shape === "O" ? "oval" : "rect",
                layer: layerId === "bottom_copper" ? "bottom_copper" : "top_copper",
                // Gerber RS-274X has no component pin metadata; never invent pin numbers.
              });
            }
          }
        }
      }
    }

    if (endsRegion && regionMode) {
      if ((layerId === "top_copper" || layerId === "bottom_copper") && activeRegion.length >= 3) {
        // Remove consecutive duplicate points and a repeated closing point.
        let pts = activeRegion.filter((pt, index, arr) => index === 0 || Math.hypot(pt.x - arr[index - 1].x, pt.y - arr[index - 1].y) > 1e-8);
        if (pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-8) pts = pts.slice(0, -1);
        if (pts.length >= 3 && regionPolarity === "dark") {
          zones.push({
            id: `gerber-region-${Math.random().toString(36).slice(2, 11)}`,
            layer: layerId,
            boundary: { pts },
            filledPolygons: [{ layer: layerId, pts }],
            fill: { fillMode: "solid", filled: true },
            name: "Imported Gerber region",
          });
        } else if (pts.length >= 3 && regionPolarity === "clear") {
          // Gerber LPC erases the prior image. For the common copper-pour case,
          // encode a contained clear region as a polygon hole; the WebGL zone
          // triangulator (earcut) excludes the hole from the filled triangles.
          // If no containing dark region exists, do not fake a clear region as copper.
          subtractContainedShape(pts);
        }
      }
      regionMode = false;
      activeRegion = [];
      flushActiveTrack();
    }
  }

  // Flush any remaining active track
  flushActiveTrack();

  return { tracks, pads, zones, outlineSegments };
}

/**
 * Parses an Excellon NC Drill file string and extracts vias (drill holes).
 */
export function parseExcellonFile(content: string): PcbVia[] {
  const vias: PcbVia[] = [];
  let units: "mm" | "inch" = "mm";
  let zeroSuppression: "leading" | "trailing" = "leading";
  // Common Excellon defaults: METRIC 3.3 and INCH 2.4 when no explicit
  // decimal coordinates or format declaration is present.
  let integerDigits = 3;
  let fractionalDigits = 3;
  const tools = new Map<number, number>(); // Tool code -> diameter in mm
  let activeTool: number | null = null;
  // Excellon permits coordinate records to omit one axis; retain the prior
  // absolute coordinate instead of silently snapping the omitted axis to zero.
  let currentDrillX = 0;
  let currentDrillY = 0;

  const parseDrillCoordinate = (rawValue: string): number => {
    if (rawValue.includes(".")) {
      const decimal = Number(rawValue);
      return units === "inch" ? decimal * 25.4 : decimal;
    }
    const sign = rawValue.startsWith("-") ? -1 : 1;
    let raw = rawValue.replace(/^[+-]/, "");
    const totalDigits = integerDigits + fractionalDigits;
    if (zeroSuppression === "trailing") raw = raw.padEnd(totalDigits, "0");
    else raw = raw.padStart(totalDigits, "0");
    const value = Number(raw) / Math.pow(10, fractionalDigits) * sign;
    return units === "inch" ? value * 25.4 : value;
  };

  const lines = content.split("\n");

  for (let line of lines) {
    line = line.trim().toUpperCase();
    if (!line || line.startsWith(";")) continue;

    // Unit settings and common Excellon coordinate declarations, e.g.
    // METRIC,LZ,000.000 or INCH,TZ,00.0000.
    if (line.includes("METRIC") || line === "M71") {
      units = "mm";
      integerDigits = 3;
      fractionalDigits = 3;
      if (line.includes("TZ")) zeroSuppression = "trailing";
      else if (line.includes("LZ")) zeroSuppression = "leading";
      const fmt = line.match(/(?:METRIC|INCH)[^0-9]*([0-9]+)\.([0-9]+)/);
      if (fmt) { integerDigits = fmt[1].length; fractionalDigits = fmt[2].length; }
      continue;
    } else if (line.includes("INCH") || line === "M72") {
      units = "inch";
      integerDigits = 2;
      fractionalDigits = 4;
      if (line.includes("TZ")) zeroSuppression = "trailing";
      else if (line.includes("LZ")) zeroSuppression = "leading";
      const fmt = line.match(/(?:METRIC|INCH)[^0-9]*([0-9]+)\.([0-9]+)/);
      if (fmt) { integerDigits = fmt[1].length; fractionalDigits = fmt[2].length; }
      continue;
    }

    // Tool Definition: e.g. T01C1.0 or T1C0.8
    if (line.startsWith("T") && line.includes("C")) {
      const toolMatch = line.match(/^T([0-9]+)C([0-9.]+)/);
      if (toolMatch) {
        const tnum = parseInt(toolMatch[1], 10);
        let dia = parseFloat(toolMatch[2]);
        if (units === "inch") {
          dia *= 25.4;
        }
        tools.set(tnum, dia);
      }
      continue;
    }

    // Tool select: e.g. T01 or T1
    if (line.startsWith("T") && !line.includes("C")) {
      const toolSelMatch = line.match(/^T([0-9]+)/);
      if (toolSelMatch) {
        activeTool = parseInt(toolSelMatch[1], 10);
      }
      continue;
    }

    // Drill hit coordinate: e.g. X12.345Y67.890
    if (line.startsWith("X") || line.startsWith("Y")) {
      let x = currentDrillX;
      let y = currentDrillY;
      let hasX = false;
      let hasY = false;

      const xMatch = line.match(/X([-+]?[0-9.]+)/);
      if (xMatch) {
        x = parseDrillCoordinate(xMatch[1]);
        hasX = true;
      }

      const yMatch = line.match(/Y([-+]?[0-9.]+)/);
      if (yMatch) {
        y = parseDrillCoordinate(yMatch[1]);
        hasY = true;
      }

      if (hasX || hasY) {
        currentDrillX = x;
        currentDrillY = y;
        const drillDia = activeTool && tools.has(activeTool) ? tools.get(activeTool)! : 0.8;
        vias.push({
          id: `via-imported-${Math.random().toString(36).substr(2, 9)}`,
          x,
          y,
          drill: drillDia,
          diameter: drillDia + 0.4, // Standard annular ring
        });
      }
    }
  }

  return vias;
}

/**
 * Excellon files describe drill hits, while Gerber copper layers describe the
 * lands (flashed pads) around them. Treating every hit as a standalone via made
 * the through-hole pads render as solid red/blue discs with no hole (the small
 * via drawn beneath/above them was not a faithful hole). Here each drill hit is
 * attached to the copper pad(s) it passes through (top and bottom copper), so
 * the pad itself is rendered with its drill. Only hits with no pad under them
 * stay as vias.
 *
 * Both inputs must be in the same coordinate frame (before board-origin
 * normalization). Mutates `pads` (sets `drill`) and returns the remaining vias.
 */
export function assignDrillsToPads(pads: PcbPad[], drills: PcbVia[]): PcbVia[] {
  if (pads.length === 0 || drills.length === 0) return drills;

  // Spatial hash so large boards stay O(n).
  const CELL = 5; // mm
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const grid = new Map<string, PcbPad[]>();
  for (const pad of pads) {
    const k = key(Math.floor(pad.x / CELL), Math.floor(pad.y / CELL));
    const bucket = grid.get(k);
    if (bucket) bucket.push(pad); else grid.set(k, [pad]);
  }

  // Gerber and Excellon are often exported with slightly different rounding
  // (here ~0.013 mm), so allow a small centre tolerance.
  const CENTER_TOLERANCE = 0.1; // mm
  const remaining: PcbVia[] = [];

  for (const drill of drills) {
    const hole = Number(drill.drill) || 0;
    const cx = Math.floor(drill.x / CELL);
    const cy = Math.floor(drill.y / CELL);
    const matched: PcbPad[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const pad of grid.get(key(cx + dx, cy + dy)) || []) {
          const dist = Math.hypot(pad.x - drill.x, pad.y - drill.y);
          // The hole must lie inside the land, otherwise this is a different feature.
          if (dist <= CENTER_TOLERANCE && hole > 0 && hole < Math.min(pad.width, pad.height)) matched.push(pad);
        }
      }
    }
    if (matched.length === 0) {
      remaining.push(drill);
      continue;
    }
    for (const pad of matched) {
      // Keep the largest hole if several hits land on one pad (e.g. slots).
      pad.drill = Math.max(pad.drill || 0, hole);
    }
  }
  return remaining;
}

/**
 * Determines if a file is an Excellon drill file based on its contents.
 */
export function isDrillContent(content: string): boolean {
  const normalized = content.toUpperCase();
  if (normalized.includes("M48") || normalized.includes("METRIC") || normalized.includes("INCH") || normalized.includes("M71") || normalized.includes("M72")) {
    if (!normalized.includes("%MOMM") && !normalized.includes("%MOIN") && !normalized.includes("%FSLA")) {
      return true;
    }
  }
  // Check for tool definitions, e.g. T01C1.2 or T1C0.8
  if (/T\d+C\d+/.test(normalized) || /T0\d+C/.test(normalized)) {
    return true;
  }
  // Check if it has many drill coordinates and no G01/G02/D01/D02/D03 commands
  const lines = normalized.split("\n");
  let drillCoordCount = 0;
  let gerberCommandCount = 0;
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i].trim();
    if (line.startsWith("X") || line.startsWith("Y")) {
      if (!line.includes("*") && !line.includes("D")) {
        drillCoordCount++;
      }
    }
    if (line.includes("*") || line.includes("D01") || line.includes("D02") || line.includes("D03")) {
      gerberCommandCount++;
    }
  }
  if (drillCoordCount > 5 && gerberCommandCount === 0) {
    return true;
  }
  return false;
}

/**
 * Detects the layer type based on keywords inside comments or content header blocks.
 */
export function detectLayerByContent(content: string): PcbLayerId | "drill" | null {
  if (isDrillContent(content)) {
    return "drill";
  }

  const header = content.slice(0, 10000).toLowerCase();

  // Gerber X2 Attribute Detection (%TF.FileFunction,...)
  if (header.includes("%tf.filefunction")) {
    if (header.includes("copper,l1,top") || header.includes("top,cu") || header.includes("copper,top")) return "top_copper";
    if (header.includes("copper,l2,bot") || header.includes("bot,cu") || header.includes("copper,bot")) return "bottom_copper";
    if (header.includes("legend,top") || header.includes("silk,top")) return "silkscreen";
    if (header.includes("legend,bot") || header.includes("silk,bot")) return "bottom_silkscreen";
    if (header.includes("soldermask,top") || header.includes("mask,top")) return "solder_mask";
    if (header.includes("soldermask,bot") || header.includes("mask,bot")) return "bottom_solder_mask";
    if (header.includes("profile") || header.includes("outline")) return "outline";
  }

  // 1. Outline (Board edge/profile)
  if (
    header.includes("edge.cuts") ||
    header.includes("edge_cuts") ||
    header.includes("edgecuts") ||
    header.includes("board outline") ||
    header.includes("boardoutline") ||
    header.includes("board_outline") ||
    header.includes("gko") ||
    header.includes("outline layer") ||
    header.includes("profile layer") ||
    header.includes("layer: outline") ||
    header.includes("layer: profile")
  ) {
    return "outline";
  }

  // 2. Top Copper
  if (
    header.includes("f.cu") ||
    header.includes("f_cu") ||
    header.includes("top copper") ||
    header.includes("topcopper") ||
    header.includes("top_copper") ||
    header.includes("layer: top copper") ||
    header.includes("layer: top_copper") ||
    header.includes("layer 1") ||
    header.includes("layer: f.cu") ||
    header.includes("gtl")
  ) {
    return "top_copper";
  }

  // 3. Bottom Copper
  if (
    header.includes("b.cu") ||
    header.includes("b_cu") ||
    header.includes("bottom copper") ||
    header.includes("bottomcopper") ||
    header.includes("bottom_copper") ||
    header.includes("layer: bottom copper") ||
    header.includes("layer: bottom_copper") ||
    header.includes("layer 2") ||
    header.includes("layer: b.cu") ||
    header.includes("gbl")
  ) {
    return "bottom_copper";
  }

  // 4. Top Silkscreen
  if (
    header.includes("f.silks") ||
    header.includes("f.silk") ||
    header.includes("f_silk") ||
    header.includes("top silk") ||
    header.includes("topsilk") ||
    header.includes("top_silk") ||
    header.includes("top silkscreen") ||
    header.includes("silkscreen top") ||
    header.includes("layer: f.silks") ||
    header.includes("gto")
  ) {
    return "silkscreen";
  }

  // 5. Bottom Silkscreen
  if (
    header.includes("b.silks") ||
    header.includes("b.silk") ||
    header.includes("b_silk") ||
    header.includes("bottom silk") ||
    header.includes("bottomsilk") ||
    header.includes("bottom_silk") ||
    header.includes("bottom silkscreen") ||
    header.includes("silkscreen bottom") ||
    header.includes("layer: b.silks") ||
    header.includes("gbo")
  ) {
    return "bottom_silkscreen";
  }

  // 6. Top Solder Mask
  if (
    header.includes("f.mask") ||
    header.includes("f_mask") ||
    header.includes("top mask") ||
    header.includes("topmask") ||
    header.includes("top_mask") ||
    header.includes("top soldermask") ||
    header.includes("soldermask top") ||
    header.includes("solder mask top") ||
    header.includes("layer: f.mask") ||
    header.includes("gts")
  ) {
    return "solder_mask";
  }

  // 7. Bottom Solder Mask
  if (
    header.includes("b.mask") ||
    header.includes("b_mask") ||
    header.includes("bottom mask") ||
    header.includes("bottommask") ||
    header.includes("bottom_mask") ||
    header.includes("bottom soldermask") ||
    header.includes("soldermask bottom") ||
    header.includes("solder mask bottom") ||
    header.includes("layer: b.mask") ||
    header.includes("gbs")
  ) {
    return "bottom_solder_mask";
  }

  return null;
}

/**
 * Combines filename rules and internal file content indicators to accurately identify a file's role.
 */
export function detectLayerByFilenameAndContent(filename: string, content: string): PcbLayerId | "drill" | null {
  const fn = filename.toLowerCase();

  // First, check if content is definitely drill
  if (isDrillContent(content)) {
    return "drill";
  }

  // Check specific extensions first (standard/common extensions)
  if (fn.endsWith(".gtl") || fn.endsWith(".cmp") || fn.endsWith(".top") || fn.endsWith(".g1") || fn.endsWith(".tcu")) {
    return "top_copper";
  }
  if (fn.endsWith(".gbl") || fn.endsWith(".sol") || fn.endsWith(".bot") || fn.endsWith(".g2") || fn.endsWith(".bcu") || fn.endsWith(".bottom")) {
    return "bottom_copper";
  }
  if (fn.endsWith(".gko") || fn.endsWith(".gml") || fn.endsWith(".profile") || fn.endsWith(".outline") || fn.endsWith(".gm1") || fn.endsWith(".gm20") || fn.endsWith(".edge") || fn.endsWith(".cuts")) {
    return "outline";
  }
  if (fn.endsWith(".gto") || fn.endsWith(".plc") || fn.endsWith(".tsilk") || fn.endsWith(".gtsilk") || fn.endsWith(".legend_top")) {
    return "silkscreen";
  }
  if (fn.endsWith(".gbo") || fn.endsWith(".pls") || fn.endsWith(".bsilk") || fn.endsWith(".gbsilk") || fn.endsWith(".legend_bottom")) {
    return "bottom_silkscreen";
  }
  if (fn.endsWith(".gts") || fn.endsWith(".stc") || fn.endsWith(".tsold") || fn.endsWith(".mask_top") || fn.endsWith(".f_mask")) {
    return "solder_mask";
  }
  if (fn.endsWith(".gbs") || fn.endsWith(".sts") || fn.endsWith(".bsold") || fn.endsWith(".mask_bot") || fn.endsWith(".b_mask")) {
    return "bottom_solder_mask";
  }
  if (fn.endsWith(".drl") || fn.endsWith(".txt") || fn.endsWith(".xln") || fn.endsWith(".drill") || fn.endsWith(".exc") || fn.endsWith(".tap")) {
    return "drill";
  }

  // If the extension is generic (e.g. .gbr) or unrecognized, check keywords in filename
  if (
    fn.includes("outline") ||
    fn.includes("profile") ||
    fn.includes("edge_cuts") ||
    fn.includes("edgecuts") ||
    fn.includes("edge.cuts") ||
    fn.includes("contour") ||
    fn.includes("border") ||
    fn.includes("mechanical") ||
    fn.includes("mech") ||
    fn.includes("dimension") ||
    fn.includes("gko") ||
    fn.includes("gml")
  ) {
    return "outline";
  }

  if (
    fn.includes("drill") ||
    fn.includes("excellon") ||
    fn.includes("plated") ||
    fn.includes("nonplated") ||
    fn.includes("npth") ||
    fn.includes("pth") ||
    fn.includes("drl") ||
    fn.includes("txt") ||
    fn.includes("xln")
  ) {
    return "drill";
  }

  if (
    fn.includes("top_copper") ||
    fn.includes("topcopper") ||
    fn.includes("top.copper") ||
    fn.includes("copper_top") ||
    fn.includes("copper.top") ||
    fn.includes("f.cu") ||
    fn.includes("f_cu") ||
    fn.includes("f-cu") ||
    fn.includes("top_cu") ||
    fn.includes("top.cu") ||
    fn.includes("top-cu") ||
    fn.includes("signal_top") ||
    fn.includes("layer1") ||
    fn.includes("layer_1") ||
    fn.includes("gtl")
  ) {
    return "top_copper";
  }

  if (
    fn.includes("bottom_copper") ||
    fn.includes("bottomcopper") ||
    fn.includes("bottom.copper") ||
    fn.includes("copper_bottom") ||
    fn.includes("copper.bottom") ||
    fn.includes("b.cu") ||
    fn.includes("b_cu") ||
    fn.includes("b-cu") ||
    fn.includes("bottom_cu") ||
    fn.includes("bottom.cu") ||
    fn.includes("bottom-cu") ||
    fn.includes("signal_bottom") ||
    fn.includes("layer2") ||
    fn.includes("layer_2") ||
    fn.includes("bot_copper") ||
    fn.includes("bot.copper") ||
    fn.includes("bot_cu") ||
    fn.includes("bot.cu") ||
    fn.includes("gbl")
  ) {
    return "bottom_copper";
  }

  if (
    fn.includes("top_silk") ||
    fn.includes("topsilk") ||
    fn.includes("top.silk") ||
    fn.includes("top_silkscreen") ||
    fn.includes("silkscreen_top") ||
    fn.includes("silkscreen.top") ||
    fn.includes("f.silk") ||
    fn.includes("f_silk") ||
    fn.includes("f-silk") ||
    fn.includes("legend_top") ||
    fn.includes("gto")
  ) {
    return "silkscreen";
  }

  if (
    fn.includes("bottom_silk") ||
    fn.includes("bottomsilk") ||
    fn.includes("bottom.silk") ||
    fn.includes("bottom_silkscreen") ||
    fn.includes("silkscreen_bottom") ||
    fn.includes("silkscreen.bottom") ||
    fn.includes("b.silk") ||
    fn.includes("b_silk") ||
    fn.includes("b-silk") ||
    fn.includes("legend_bottom") ||
    fn.includes("bot_silk") ||
    fn.includes("botsilk") ||
    fn.includes("bot.silk") ||
    fn.includes("gbo")
  ) {
    return "bottom_silkscreen";
  }

  if (
    fn.includes("top_solder") ||
    fn.includes("topsoldermask") ||
    fn.includes("top_mask") ||
    fn.includes("top.mask") ||
    fn.includes("solder_mask_top") ||
    fn.includes("soldermask_top") ||
    fn.includes("solder-mask-top") ||
    fn.includes("f.mask") ||
    fn.includes("f_mask") ||
    fn.includes("f-mask") ||
    fn.includes("solder_stop_top") ||
    fn.includes("solderstop_top") ||
    fn.includes("gts")
  ) {
    return "solder_mask";
  }

  if (
    fn.includes("bottom_solder") ||
    fn.includes("bottomsoldermask") ||
    fn.includes("bottom_mask") ||
    fn.includes("bottom.mask") ||
    fn.includes("solder_mask_bottom") ||
    fn.includes("soldermask_bottom") ||
    fn.includes("solder-mask-bottom") ||
    fn.includes("b.mask") ||
    fn.includes("b_mask") ||
    fn.includes("b-mask") ||
    fn.includes("solder_stop_bottom") ||
    fn.includes("solderstop_bottom") ||
    fn.includes("bot_solder") ||
    fn.includes("bot_mask") ||
    fn.includes("gbs")
  ) {
    return "bottom_solder_mask";
  }

  // Fallback to internal content-based detection
  const detectedByContent = detectLayerByContent(content);
  if (detectedByContent) {
    return detectedByContent;
  }

  // Check generic indicators in content body
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes("top") || lowerContent.includes("f.cu") || lowerContent.includes("gtl")) {
    return "top_copper";
  }
  if (lowerContent.includes("bottom") || lowerContent.includes("b.cu") || lowerContent.includes("gbl")) {
    return "bottom_copper";
  }

  return null;
}

/**
 * Main import coordinator. Reads files from a ZIP, single Gerber file, or multiple Gerber files,
 * creates a new Gerber project, scales/centers all components, and returns a SchematicDoc.
 */
export async function importGerberToProject(
  fileInput: File | File[] | FileList,
  lang: "ar" | "en"
): Promise<{ doc: SchematicDoc; name: string }> {
  const doc = emptyPcbDoc();
  
  // Normalize fileInput to an array of File objects
  let files: File[] = [];
  if (fileInput instanceof FileList) {
    files = Array.from(fileInput);
  } else if (Array.isArray(fileInput)) {
    files = fileInput;
  } else if (fileInput) {
    files = [fileInput];
  }

  if (files.length === 0) {
    return {
      name: "Empty Project",
      doc: {
        nodes: [],
        wires: [],
        canvasColor: "white",
        defaultWireColor: "black",
        pcb: emptyPcbDoc(),
      },
    };
  }

  let name = "";
  if (files.length === 1) {
    name = files[0].name.replace(/\.[^/.]+$/, "");
  } else {
    const firstBase = files[0].name.replace(/\.[^/.]+$/, "");
    name = firstBase + " Set";
  }

  const tracks: PcbTrack[] = [];
  const pads: PcbPad[] = [];
  const zones: PcbZone[] = [];
  const vias: PcbVia[] = [];
  const outlineSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];

  const addFileResult = (res: { tracks: PcbTrack[]; pads: PcbPad[]; zones?: PcbZone[]; outlineSegments: { x1: number; y1: number; x2: number; y2: number }[] }) => {
    tracks.push(...res.tracks);
    pads.push(...res.pads);
    zones.push(...(res.zones || []));
    outlineSegments.push(...res.outlineSegments);
  };

  for (const file of files) {
    // Check if file is ZIP
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      
      for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue;
        const text = await zipEntry.async("string");
        const detected = detectLayerByFilenameAndContent(relativePath, text);
        if (!detected) continue;

        if (detected === "drill") {
          vias.push(...parseExcellonFile(text));
        } else {
          addFileResult(parseGerberFile(text, detected));
        }
      }
    } else {
      // Single file processing (either as a single file or part of multiple selection)
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });

      const detected = detectLayerByFilenameAndContent(file.name, text);
      if (detected === "drill") {
        vias.push(...parseExcellonFile(text));
      } else if (detected) {
        addFileResult(parseGerberFile(text, detected));
      } else {
        // Fallback for completely unrecognized files
        addFileResult(parseGerberFile(text, "top_copper"));
      }
    }
  }

  // Attach drill hits to the copper pads they pass through (so through-hole pads
  // render with their real hole); leftover hits stay as standalone vias.
  const standaloneVias = assignDrillsToPads(pads, vias);
  vias.length = 0;
  vias.push(...standaloneVias);

  // 1. Calculate Bounding Box of all imported items
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const updateBounds = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  // Include physical extents, not only object centers. Otherwise a Gerber set
  // without an explicit profile can clip the outside half of edge pads/tracks.
  tracks.forEach((t) => t.points.forEach((p) => {
    const halfWidth = Math.max(0, Number(t.width) || 0) / 2;
    updateBounds(p.x - halfWidth, p.y - halfWidth);
    updateBounds(p.x + halfWidth, p.y + halfWidth);
  }));
  pads.forEach((p) => {
    const halfW = Math.max(0, Number(p.width) || 0) / 2;
    const halfH = Math.max(0, Number(p.height) || 0) / 2;
    updateBounds(p.x - halfW, p.y - halfH);
    updateBounds(p.x + halfW, p.y + halfH);
  });
  vias.forEach((v) => {
    const radius = Math.max(0, Number(v.diameter) || Number(v.drill) || 0) / 2;
    updateBounds(v.x - radius, v.y - radius);
    updateBounds(v.x + radius, v.y + radius);
  });
  zones.forEach((z) => z.boundary.pts.forEach((p) => updateBounds(p.x, p.y)));
  outlineSegments.forEach((s) => {
    updateBounds(s.x1, s.y1);
    updateBounds(s.x2, s.y2);
  });

  // If no elements were parsed, or coordinates are extreme/empty
  if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    // Return an empty document
    return {
      name: name + " (Empty Gerber)",
      doc: {
        nodes: [],
        wires: [],
        canvasColor: "white",
        defaultWireColor: "black",
        pcb: emptyPcbDoc(),
      },
    };
  }

  // Bounding box size (Real physical size of the PCB)
  const boardWidth = Number((maxX - minX).toFixed(3));
  const boardHeight = Number((maxY - minY).toFixed(3));

  // Offset so that the minimum coordinate of the design aligns perfectly with (0,0) of the board
  // Top-level imports are always normalized to the board origin. Recursive block-aperture
  // parses (inside parseGerberFile) preserve file coordinates so LM/LR/LS transforms are
  // applied around the Gerber origin rather than around an artificial child bounding-box origin.
  const offsetX = -minX;
  const offsetY = -minY;

  // 2. Adjust all elements coordinates
  tracks.forEach((t) => {
    t.points = t.points.map((p) => ({
      x: Number((p.x + offsetX).toFixed(3)),
      y: Number((p.y + offsetY).toFixed(3)),
    }));
  });

  pads.forEach((p) => {
    p.x = Number((p.x + offsetX).toFixed(3));
    p.y = Number((p.y + offsetY).toFixed(3));
  });

  vias.forEach((v) => {
    v.x = Number((v.x + offsetX).toFixed(3));
    v.y = Number((v.y + offsetY).toFixed(3));
  });
  zones.forEach((z) => {
    z.boundary.pts = z.boundary.pts.map((p) => ({ x: Number((p.x + offsetX).toFixed(3)), y: Number((p.y + offsetY).toFixed(3)) }));
    if (z.filledPolygons) z.filledPolygons = z.filledPolygons.map((poly) => ({ ...poly, pts: poly.pts.map((p) => ({ x: Number((p.x + offsetX).toFixed(3)), y: Number((p.y + offsetY).toFixed(3)) })) }));
  });

  // Assemble PcbDoc
  doc.width = boardWidth;
  doc.height = boardHeight;
  doc.tracks = tracks;
  doc.pads = pads;
  doc.vias = vias;
  doc.zones = [...(doc.zones || []), ...zones];
  doc.footprints = [];
  doc.isImportedGerber = true;

  // Return full SchematicDoc
  return {
    name,
    doc: {
      nodes: [],
      wires: [],
      canvasColor: "white",
      defaultWireColor: "black",
      pcb: doc,
    },
  };
}
