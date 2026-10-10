import earcut from "earcut";

interface Point {
  x: number;
  y: number;
}

interface WorkerZoneData {
  id: string;
  layer: string;
  isKeepout: boolean;
  boundary: {
    pts: Point[];
    holes?: Point[][];
  } | null;
  filledPolygons?: {
    pts: Point[];
    holes?: Point[][];
    layer?: string;
  }[];
}

self.onmessage = function (e: MessageEvent<{ zones: WorkerZoneData[] }>) {
  if (!e || !e.data || !Array.isArray(e.data.zones)) return;
  const { zones } = e.data;
  const results: Record<string, {
    vertices: number[];
    layer: string;
    isKeepout: boolean;
  }> = {};

  for (const zone of zones) {
    if (!zone || !zone.id) continue;
    const allVertices: number[] = [];
    
    // Choose what to triangulate: filledPolygons first, fallback to boundary
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
          const validHolePts: Point[] = [];
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
        console.error("Triangulation error for zone poly:", err);
      }
    }

    results[zone.id] = {
      vertices: allVertices,
      layer: zone.layer || "top_copper",
      isKeepout: !!zone.isKeepout
    };
  }

  self.postMessage({ results });
};
