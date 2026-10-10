/**
 * Multi-channel & Signed Distance Field (MSDF/SDF) Font Atlas & WebGL Engine
 *
 * Provides resolution-independent, pin-sharp text rendering on the GPU for
 * PCB silkscreen, copper, and fabrication layers at arbitrary zoom factors (0.01x to 100x)
 * without relying on DOM SVG <text> elements.
 */

export interface GlyphMetrics {
  char: string;
  x: number;          // Atlas pixel X
  y: number;          // Atlas pixel Y
  width: number;      // Atlas pixel width
  height: number;     // Atlas pixel height
  u0: number;         // Normalized UV min X
  v0: number;         // Normalized UV min Y
  u1: number;         // Normalized UV max X
  v1: number;         // Normalized UV max Y
  advance: number;    // Character layout advance in em
  bearingX: number;   // Horizontal bearing in em
  bearingY: number;   // Vertical bearing in em
  glyphWidth: number; // Rendered width in em
  glyphHeight: number;// Rendered height in em
}

export interface FontAtlasData {
  canvas: HTMLCanvasElement;
  textureWidth: number;
  textureHeight: number;
  pixelDistanceRange: number;
  emSize: number;
  glyphs: Map<string, GlyphMetrics>;
}

// 2D Euclidean Distance Transform (linear time O(N) 1D parabolic envelope)
function edt1D(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
}

function edt2D(grid: Float64Array, width: number, height: number): Float64Array {
  const size = Math.max(width, height);
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  const dist = new Float64Array(width * height);

  // Transform along columns
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      f[y] = grid[y * width + x];
    }
    edt1D(f, height, d, v, z);
    for (let y = 0; y < height; y++) {
      dist[y * width + x] = d[y];
    }
  }

  // Transform along rows
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      f[x] = dist[y * width + x];
    }
    edt1D(f, width, d, v, z);
    for (let x = 0; x < width; x++) {
      dist[y * width + x] = Math.sqrt(d[x]);
    }
  }

  return dist;
}

let cachedFontAtlas: FontAtlasData | null = null;

/**
 * Builds or retrieves the cached MSDF/SDF font atlas
 */
export function getOrCreateFontAtlas(): FontAtlasData {
  if (cachedFontAtlas) return cachedFontAtlas;

  const atlasSize = 1024;
  const emSize = 64;
  const padding = 10;
  const cellWidth = emSize + padding * 2;
  const cellHeight = emSize + padding * 2;
  const cols = Math.floor(atlasSize / cellWidth);
  const pixelRange = 8.0;

  const canvas = document.createElement("canvas");
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to obtain 2D context for Font Atlas");

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  // Characters to pack: ASCII 32-126 + special electronics symbols
  const chars: string[] = [];
  for (let c = 32; c <= 126; c++) chars.push(String.fromCharCode(c));
  chars.push("µ", "Ω", "°", "±", "²", "³", "Ø", "●", "■", "▲");

  const glyphMap = new Map<string, GlyphMetrics>();

  // Rasterize glyphs into an offscreen scratch canvas
  const scratch = document.createElement("canvas");
  scratch.width = cellWidth;
  scratch.height = cellHeight;
  const sCtx = scratch.getContext("2d", { willReadFrequently: true })!;
  sCtx.font = `500 ${emSize}px "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
  sCtx.textBaseline = "middle";
  sCtx.textAlign = "center";

  const totalPixels = cellWidth * cellHeight;
  const insideGrid = new Float64Array(totalPixels);
  const outsideGrid = new Float64Array(totalPixels);

  const atlasImgData = ctx.createImageData(atlasSize, atlasSize);
  const atlasBuf = atlasImgData.data;

  chars.forEach((ch, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellX = col * cellWidth;
    const cellY = row * cellHeight;

    if (cellY + cellHeight > atlasSize) return;

    // Clear scratch
    sCtx.clearRect(0, 0, cellWidth, cellHeight);
    sCtx.fillStyle = "white";
    sCtx.fillText(ch, cellWidth / 2, cellHeight / 2);

    const charImgData = sCtx.getImageData(0, 0, cellWidth, cellHeight);
    const pixels = charImgData.data;

    // Prepare inside/outside binary grids with subpixel boundary refinement for signed distance calculation
    for (let i = 0; i < totalPixels; i++) {
      const alpha = pixels[i * 4 + 3] / 255;
      if (alpha > 0.98) {
        insideGrid[i] = 0;
        outsideGrid[i] = Infinity;
      } else if (alpha < 0.02) {
        insideGrid[i] = Infinity;
        outsideGrid[i] = 0;
      } else {
        const subDist = (0.5 - alpha) * 0.75;
        if (alpha >= 0.5) {
          insideGrid[i] = Math.max(0, subDist);
          outsideGrid[i] = Infinity;
        } else {
          insideGrid[i] = Infinity;
          outsideGrid[i] = Math.max(0, -subDist);
        }
      }
    }

    const distToOutside = edt2D(insideGrid, cellWidth, cellHeight);
    const distToInside = edt2D(outsideGrid, cellWidth, cellHeight);

    // Compute Signed Distance: positive inside, negative outside
    // Pack into RGB / Alpha channels for Multi-channel / SDF rendering
    for (let y = 0; y < cellHeight; y++) {
      for (let x = 0; x < cellWidth; x++) {
        const i = y * cellWidth + x;
        // distToOutside is the distance to the nearest *inside* pixel;
        // distToInside is the distance to the nearest *outside* pixel.
        // For an SDF the sign must be positive inside the glyph and negative
        // outside it. The previous implementation inverted this test, which
        // made the quad/cell itself opaque and the glyph interior transparent.
        const dToInside = distToOutside[i];
        const dToOutside = distToInside[i];
        const alpha = pixels[i * 4 + 3] / 255;
        const signedDist = alpha >= 0.5 ? dToOutside : -dToInside;

        // Map signed distance to [0..1] range, centered at 0.5
        const normDist = 0.5 + (signedDist / (pixelRange * 2));
        const val = Math.max(0, Math.min(255, Math.round(normDist * 255)));

        // Multi-channel directional distance for MSDF edge preservation:
        // R: horizontal edge bias, G: isotropic signed distance, B: vertical edge bias
        const gx = x > 0 && x < cellWidth - 1 ? (distToOutside[i + 1] - distToOutside[i - 1]) : 0;
        const gy = y > 0 && y < cellHeight - 1 ? (distToOutside[i + cellWidth] - distToOutside[i - cellWidth]) : 0;
        const rVal = Math.max(0, Math.min(255, Math.round(val + gx * 4)));
        const bVal = Math.max(0, Math.min(255, Math.round(val + gy * 4)));

        const atlasIdx = ((cellY + y) * atlasSize + (cellX + x)) * 4;
        atlasBuf[atlasIdx] = rVal;     // R (MSDF red)
        atlasBuf[atlasIdx + 1] = val;  // G (Median/Isotropic SDF)
        atlasBuf[atlasIdx + 2] = bVal; // B (MSDF blue)
        atlasBuf[atlasIdx + 3] = val;  // A (Direct SDF)
      }
    }

    // Measure font advance
    const textMetric = sCtx.measureText(ch);
    const advance = textMetric.width / emSize;

    glyphMap.set(ch, {
      char: ch,
      x: cellX,
      y: cellY,
      width: cellWidth,
      height: cellHeight,
      u0: cellX / atlasSize,
      v0: cellY / atlasSize,
      u1: (cellX + cellWidth) / atlasSize,
      v1: (cellY + cellHeight) / atlasSize,
      advance: Math.max(0.45, advance),
      bearingX: -padding / emSize,
      bearingY: (emSize / 2 + padding) / emSize,
      glyphWidth: cellWidth / emSize,
      glyphHeight: cellHeight / emSize,
    });
  });

  ctx.putImageData(atlasImgData, 0, 0);

  cachedFontAtlas = {
    canvas,
    textureWidth: atlasSize,
    textureHeight: atlasSize,
    pixelDistanceRange: pixelRange,
    emSize,
    glyphs: glyphMap,
  };

  return cachedFontAtlas;
}

export interface WebGLTextQuad {
  // World Center & Dimensions in mm
  x: number;
  y: number;
  w: number;
  h: number;
  rotationRad: number;
  mirror: boolean;
  
  // Atlas UV
  u0: number;
  v0: number;
  u1: number;
  v1: number;

  // Visual Attributes
  color: [number, number, number, number];
  haloColor: [number, number, number, number];
  dimAlpha: number;
  isSelected: number;
  thickness: number;
}

export interface LayoutSdfTextOptions {
  text: string;
  x: number;
  y: number;
  size: number; // Character height in mm
  rotationDeg?: number;
  color?: [number, number, number, number];
  haloColor?: [number, number, number, number];
  dimAlpha?: number;
  isSelected?: boolean;
  justify?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  letterSpacing?: number;
  mirror?: boolean;
  thickness?: number;
}

/**
 * Computes GPU character quads for a string using the MSDF/SDF glyph atlas.
 */
export function layoutSdfText(
  atlas: FontAtlasData,
  options: LayoutSdfTextOptions
): WebGLTextQuad[] {
  const {
    text,
    x = 0,
    y = 0,
    size = 1.0,
    rotationDeg = 0,
    color = [0.99, 0.88, 0.28, 1.0], // Silkscreen yellow
    haloColor = [0.23, 0.51, 0.96, 0.85], // Selection blue
    dimAlpha = 1.0,
    isSelected = false,
    justify = "center",
    verticalAlign = "middle",
    letterSpacing = 0.05,
    mirror = false,
    thickness = 0,
  } = options;

  if (!text || text.length === 0) return [];

  // 1. Calculate total string layout width
  let totalAdvance = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const glyph = atlas.glyphs.get(ch) || atlas.glyphs.get("?") || atlas.glyphs.get(" ")!;
    totalAdvance += (glyph?.advance || 0.6) * size;
    if (i < text.length - 1) {
      totalAdvance += letterSpacing * size;
    }
  }

  // 2. Justification offset
  let offsetX = 0;
  if (justify === "center") {
    offsetX = -totalAdvance * 0.5;
  } else if (justify === "right") {
    offsetX = -totalAdvance;
  }

  // Vertical alignment offset
  let offsetY = 0;
  if (verticalAlign === "middle") {
    offsetY = 0;
  } else if (verticalAlign === "top") {
    offsetY = size * 0.5;
  } else if (verticalAlign === "bottom") {
    offsetY = -size * 0.5;
  }

  const rotRad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const quads: WebGLTextQuad[] = [];
  let cursorX = offsetX;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const glyph = atlas.glyphs.get(ch) || atlas.glyphs.get("?") || atlas.glyphs.get(" ");
    if (!glyph) continue;

    const charAdvance = (glyph.advance || 0.6) * size;
    const quadW = glyph.glyphWidth * size;
    const quadH = glyph.glyphHeight * size;

    // Character quad center relative to text origin
    let localCenterX = cursorX + charAdvance * 0.5;
    const localCenterY = offsetY;

    if (mirror) {
      localCenterX = -localCenterX;
    }

    // World position with board/text rotation
    const worldX = x + (localCenterX * cosR - localCenterY * sinR);
    const worldY = y + (localCenterX * sinR + localCenterY * cosR);

    quads.push({
      x: worldX,
      y: worldY,
      w: quadW,
      h: quadH,
      rotationRad: rotRad,
      mirror: !!mirror,
      u0: glyph.u0,
      v0: glyph.v0,
      u1: glyph.u1,
      v1: glyph.v1,
      color,
      haloColor,
      dimAlpha,
      isSelected: isSelected ? 1.0 : 0.0,
      thickness,
    });

    cursorX += charAdvance + letterSpacing * size;
  }

  return quads;
}
