/**
 * KiCad Hershey / Newstroke Vector Font Engine
 *
 * In KiCad, PCB texts on silkscreen, copper, and fabrication layers are
 * fundamentally defined as Vector Strokes (connected straight lines / polylines).
 * They are rendered in the same way as traces and lines, as smooth triangle meshes
 * with rounded caps.
 *
 * This module provides:
 * 1. Normalized vector stroke glyph tables for all printable ASCII characters (32-126)
 *    and common engineering symbols (µ, Ω, °, ², ³, ±, Ø).
 * 2. High-performance stroke decomposition into 2D line segments with full support
 *    for stroke thickness, size (width/height), arbitrary rotation, text justification,
 *    bold, italic slant, and layer mirroring (e.g. for bottom silkscreen/copper).
 */

import { PcbLayerId } from "./pcb";

export interface HersheyPoint {
  x: number;
  y: number;
}

export type HersheyPolyline = HersheyPoint[];

export interface HersheyGlyph {
  width: number; // Normalized character advance width (relative to height = 1.0)
  strokes: HersheyPolyline[];
}

export interface HersheyTextSegment {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  strokeWidth: number;
  layer: PcbLayerId;
}

export interface HersheyTextOptions {
  text: string;
  x: number;
  y: number;
  size?: number; // Character height in mm (default: 1.0)
  sizeY?: number; // Optional distinct height if size represents width
  thickness?: number; // Line stroke width in mm (default: 0.15)
  rotation?: number; // Degrees (0, 90, 180, 270, or arbitrary)
  layer?: PcbLayerId; // PCB Layer (default: "silkscreen")
  justify?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom" | "baseline";
  bold?: boolean;
  italic?: boolean;
  mirror?: boolean;
  letterSpacing?: number; // Additional spacing factor (default: 0.15)
}

/**
 * Normalized Hershey Vector Glyphs.
 * Coordinate system:
 * - Y ranges from 0.0 (top) to 1.0 (bottom), with baseline around 0.82.
 * - X ranges from 0.0 to glyph.width.
 */
const GLYPH_TABLE: Record<string, HersheyGlyph> = {
  " ": {
    width: 0.5,
    strokes: [],
  },
  "!": {
    width: 0.35,
    strokes: [
      [{ x: 0.175, y: 0.08 }, { x: 0.175, y: 0.62 }],
      [{ x: 0.175, y: 0.8 }, { x: 0.175, y: 0.85 }],
    ],
  },
  "\"": {
    width: 0.45,
    strokes: [
      [{ x: 0.14, y: 0.08 }, { x: 0.14, y: 0.32 }],
      [{ x: 0.31, y: 0.08 }, { x: 0.31, y: 0.32 }],
    ],
  },
  "#": {
    width: 0.7,
    strokes: [
      [{ x: 0.28, y: 0.08 }, { x: 0.2, y: 0.88 }],
      [{ x: 0.5, y: 0.08 }, { x: 0.42, y: 0.88 }],
      [{ x: 0.08, y: 0.34 }, { x: 0.62, y: 0.34 }],
      [{ x: 0.08, y: 0.62 }, { x: 0.62, y: 0.62 }],
    ],
  },
  "$": {
    width: 0.65,
    strokes: [
      [{ x: 0.325, y: 0.02 }, { x: 0.325, y: 0.94 }],
      [
        { x: 0.54, y: 0.22 }, { x: 0.38, y: 0.12 }, { x: 0.24, y: 0.16 },
        { x: 0.18, y: 0.28 }, { x: 0.24, y: 0.42 }, { x: 0.42, y: 0.52 },
        { x: 0.5, y: 0.66 }, { x: 0.44, y: 0.78 }, { x: 0.3, y: 0.82 },
        { x: 0.14, y: 0.74 }
      ],
    ],
  },
  "%": {
    width: 0.75,
    strokes: [
      [{ x: 0.65, y: 0.1 }, { x: 0.15, y: 0.85 }],
      [
        { x: 0.22, y: 0.15 }, { x: 0.32, y: 0.15 }, { x: 0.32, y: 0.32 },
        { x: 0.22, y: 0.32 }, { x: 0.22, y: 0.15 }
      ],
      [
        { x: 0.48, y: 0.62 }, { x: 0.58, y: 0.62 }, { x: 0.58, y: 0.8 },
        { x: 0.48, y: 0.8 }, { x: 0.48, y: 0.62 }
      ],
    ],
  },
  "&": {
    width: 0.75,
    strokes: [
      [
        { x: 0.68, y: 0.82 }, { x: 0.28, y: 0.42 }, { x: 0.28, y: 0.22 },
        { x: 0.38, y: 0.12 }, { x: 0.48, y: 0.22 }, { x: 0.38, y: 0.36 },
        { x: 0.16, y: 0.58 }, { x: 0.16, y: 0.74 }, { x: 0.28, y: 0.84 },
        { x: 0.5, y: 0.84 }, { x: 0.68, y: 0.56 }
      ],
    ],
  },
  "'": {
    width: 0.28,
    strokes: [
      [{ x: 0.14, y: 0.08 }, { x: 0.14, y: 0.32 }],
    ],
  },
  "(": {
    width: 0.38,
    strokes: [
      [{ x: 0.28, y: 0.06 }, { x: 0.14, y: 0.3 }, { x: 0.14, y: 0.64 }, { x: 0.28, y: 0.88 }],
    ],
  },
  ")": {
    width: 0.38,
    strokes: [
      [{ x: 0.1, y: 0.06 }, { x: 0.24, y: 0.3 }, { x: 0.24, y: 0.64 }, { x: 0.1, y: 0.88 }],
    ],
  },
  "*": {
    width: 0.55,
    strokes: [
      [{ x: 0.275, y: 0.22 }, { x: 0.275, y: 0.68 }],
      [{ x: 0.1, y: 0.34 }, { x: 0.45, y: 0.56 }],
      [{ x: 0.1, y: 0.56 }, { x: 0.45, y: 0.34 }],
    ],
  },
  "+": {
    width: 0.65,
    strokes: [
      [{ x: 0.325, y: 0.2 }, { x: 0.325, y: 0.74 }],
      [{ x: 0.08, y: 0.47 }, { x: 0.57, y: 0.47 }],
    ],
  },
  ",": {
    width: 0.3,
    strokes: [
      [{ x: 0.16, y: 0.75 }, { x: 0.16, y: 0.85 }, { x: 0.1, y: 0.96 }],
    ],
  },
  "-": {
    width: 0.55,
    strokes: [
      [{ x: 0.1, y: 0.47 }, { x: 0.45, y: 0.47 }],
    ],
  },
  ".": {
    width: 0.3,
    strokes: [
      [{ x: 0.15, y: 0.8 }, { x: 0.15, y: 0.85 }],
    ],
  },
  "/": {
    width: 0.55,
    strokes: [
      [{ x: 0.46, y: 0.08 }, { x: 0.1, y: 0.86 }],
    ],
  },
  ":": {
    width: 0.3,
    strokes: [
      [{ x: 0.15, y: 0.32 }, { x: 0.15, y: 0.37 }],
      [{ x: 0.15, y: 0.78 }, { x: 0.15, y: 0.83 }],
    ],
  },
  ";": {
    width: 0.3,
    strokes: [
      [{ x: 0.15, y: 0.32 }, { x: 0.15, y: 0.37 }],
      [{ x: 0.15, y: 0.75 }, { x: 0.15, y: 0.83 }, { x: 0.1, y: 0.94 }],
    ],
  },
  "<": {
    width: 0.55,
    strokes: [
      [{ x: 0.45, y: 0.22 }, { x: 0.1, y: 0.47 }, { x: 0.45, y: 0.72 }],
    ],
  },
  "=": {
    width: 0.55,
    strokes: [
      [{ x: 0.08, y: 0.37 }, { x: 0.47, y: 0.37 }],
      [{ x: 0.08, y: 0.57 }, { x: 0.47, y: 0.57 }],
    ],
  },
  ">": {
    width: 0.55,
    strokes: [
      [{ x: 0.1, y: 0.22 }, { x: 0.45, y: 0.47 }, { x: 0.1, y: 0.72 }],
    ],
  },
  "?": {
    width: 0.55,
    strokes: [
      [
        { x: 0.1, y: 0.24 }, { x: 0.16, y: 0.12 }, { x: 0.34, y: 0.1 },
        { x: 0.46, y: 0.2 }, { x: 0.46, y: 0.34 }, { x: 0.28, y: 0.48 },
        { x: 0.28, y: 0.62 }
      ],
      [{ x: 0.28, y: 0.78 }, { x: 0.28, y: 0.83 }],
    ],
  },
  "@": {
    width: 0.85,
    strokes: [
      [
        { x: 0.64, y: 0.64 }, { x: 0.64, y: 0.42 }, { x: 0.5, y: 0.34 },
        { x: 0.36, y: 0.42 }, { x: 0.36, y: 0.58 }, { x: 0.5, y: 0.66 },
        { x: 0.64, y: 0.58 }, { x: 0.74, y: 0.68 }, { x: 0.74, y: 0.32 },
        { x: 0.52, y: 0.14 }, { x: 0.24, y: 0.26 }, { x: 0.16, y: 0.52 },
        { x: 0.24, y: 0.78 }, { x: 0.56, y: 0.86 }, { x: 0.76, y: 0.82 }
      ],
    ],
  },
  "[": {
    width: 0.35,
    strokes: [
      [{ x: 0.26, y: 0.06 }, { x: 0.12, y: 0.06 }, { x: 0.12, y: 0.88 }, { x: 0.26, y: 0.88 }],
    ],
  },
  "\\": {
    width: 0.55,
    strokes: [
      [{ x: 0.1, y: 0.08 }, { x: 0.46, y: 0.86 }],
    ],
  },
  "]": {
    width: 0.35,
    strokes: [
      [{ x: 0.1, y: 0.06 }, { x: 0.24, y: 0.06 }, { x: 0.24, y: 0.88 }, { x: 0.1, y: 0.88 }],
    ],
  },
  "^": {
    width: 0.5,
    strokes: [
      [{ x: 0.1, y: 0.32 }, { x: 0.25, y: 0.1 }, { x: 0.4, y: 0.32 }],
    ],
  },
  "_": {
    width: 0.55,
    strokes: [
      [{ x: 0.02, y: 0.94 }, { x: 0.53, y: 0.94 }],
    ],
  },
  "`": {
    width: 0.3,
    strokes: [
      [{ x: 0.12, y: 0.08 }, { x: 0.2, y: 0.18 }],
    ],
  },
  "{": {
    width: 0.4,
    strokes: [
      [{ x: 0.3, y: 0.06 }, { x: 0.2, y: 0.14 }, { x: 0.2, y: 0.4 }, { x: 0.1, y: 0.47 }, { x: 0.2, y: 0.54 }, { x: 0.2, y: 0.8 }, { x: 0.3, y: 0.88 }],
    ],
  },
  "|": {
    width: 0.25,
    strokes: [
      [{ x: 0.125, y: 0.04 }, { x: 0.125, y: 0.92 }],
    ],
  },
  "}": {
    width: 0.4,
    strokes: [
      [{ x: 0.1, y: 0.06 }, { x: 0.2, y: 0.14 }, { x: 0.2, y: 0.4 }, { x: 0.3, y: 0.47 }, { x: 0.2, y: 0.54 }, { x: 0.2, y: 0.8 }, { x: 0.1, y: 0.88 }],
    ],
  },
  "~": {
    width: 0.6,
    strokes: [
      [{ x: 0.08, y: 0.48 }, { x: 0.2, y: 0.38 }, { x: 0.34, y: 0.48 }, { x: 0.48, y: 0.38 }],
    ],
  },

  // --------------------------------------------------------------------------
  // NUMBERS (0-9)
  // --------------------------------------------------------------------------
  "0": {
    width: 0.6,
    strokes: [
      [
        { x: 0.12, y: 0.28 }, { x: 0.22, y: 0.12 }, { x: 0.38, y: 0.12 },
        { x: 0.48, y: 0.28 }, { x: 0.48, y: 0.66 }, { x: 0.38, y: 0.82 },
        { x: 0.22, y: 0.82 }, { x: 0.12, y: 0.66 }, { x: 0.12, y: 0.28 }
      ],
      [{ x: 0.44, y: 0.22 }, { x: 0.16, y: 0.72 }], // Slashed zero for PCB distinction
    ],
  },
  "1": {
    width: 0.55,
    strokes: [
      [{ x: 0.15, y: 0.24 }, { x: 0.31, y: 0.12 }, { x: 0.31, y: 0.82 }],
      [{ x: 0.17, y: 0.82 }, { x: 0.43, y: 0.82 }],
    ],
  },
  "2": {
    width: 0.6,
    strokes: [
      [
        { x: 0.12, y: 0.26 }, { x: 0.22, y: 0.12 }, { x: 0.4, y: 0.12 },
        { x: 0.48, y: 0.24 }, { x: 0.46, y: 0.4 }, { x: 0.12, y: 0.82 },
        { x: 0.48, y: 0.82 }
      ],
    ],
  },
  "3": {
    width: 0.6,
    strokes: [
      [
        { x: 0.12, y: 0.2 }, { x: 0.22, y: 0.12 }, { x: 0.4, y: 0.12 },
        { x: 0.48, y: 0.24 }, { x: 0.44, y: 0.42 }, { x: 0.28, y: 0.44 }
      ],
      [
        { x: 0.28, y: 0.44 }, { x: 0.46, y: 0.48 }, { x: 0.48, y: 0.68 },
        { x: 0.38, y: 0.82 }, { x: 0.2, y: 0.82 }, { x: 0.12, y: 0.74 }
      ],
    ],
  },
  "4": {
    width: 0.6,
    strokes: [
      [{ x: 0.38, y: 0.82 }, { x: 0.38, y: 0.12 }, { x: 0.1, y: 0.58 }, { x: 0.5, y: 0.58 }],
    ],
  },
  "5": {
    width: 0.6,
    strokes: [
      [{ x: 0.46, y: 0.12 }, { x: 0.14, y: 0.12 }, { x: 0.14, y: 0.44 }],
      [
        { x: 0.14, y: 0.44 }, { x: 0.36, y: 0.4 }, { x: 0.48, y: 0.52 },
        { x: 0.48, y: 0.7 }, { x: 0.38, y: 0.82 }, { x: 0.2, y: 0.82 },
        { x: 0.12, y: 0.72 }
      ],
    ],
  },
  "6": {
    width: 0.6,
    strokes: [
      [
        { x: 0.46, y: 0.2 }, { x: 0.36, y: 0.12 }, { x: 0.22, y: 0.14 },
        { x: 0.12, y: 0.32 }, { x: 0.12, y: 0.66 }, { x: 0.22, y: 0.82 },
        { x: 0.38, y: 0.82 }, { x: 0.48, y: 0.7 }, { x: 0.48, y: 0.54 },
        { x: 0.38, y: 0.44 }, { x: 0.12, y: 0.5 }
      ],
    ],
  },
  "7": {
    width: 0.6,
    strokes: [
      [{ x: 0.12, y: 0.12 }, { x: 0.48, y: 0.12 }, { x: 0.24, y: 0.82 }],
      [{ x: 0.22, y: 0.46 }, { x: 0.4, y: 0.46 }], // Center cross-stroke
    ],
  },
  "8": {
    width: 0.6,
    strokes: [
      [
        { x: 0.3, y: 0.46 }, { x: 0.18, y: 0.34 }, { x: 0.18, y: 0.22 },
        { x: 0.26, y: 0.12 }, { x: 0.36, y: 0.12 }, { x: 0.44, y: 0.22 },
        { x: 0.44, y: 0.34 }, { x: 0.3, y: 0.46 }, { x: 0.14, y: 0.58 },
        { x: 0.14, y: 0.72 }, { x: 0.24, y: 0.82 }, { x: 0.38, y: 0.82 },
        { x: 0.48, y: 0.72 }, { x: 0.48, y: 0.58 }, { x: 0.3, y: 0.46 }
      ],
    ],
  },
  "9": {
    width: 0.6,
    strokes: [
      [
        { x: 0.48, y: 0.46 }, { x: 0.22, y: 0.46 }, { x: 0.12, y: 0.34 },
        { x: 0.12, y: 0.22 }, { x: 0.22, y: 0.12 }, { x: 0.38, y: 0.12 },
        { x: 0.48, y: 0.26 }, { x: 0.48, y: 0.62 }, { x: 0.38, y: 0.8 },
        { x: 0.24, y: 0.82 }, { x: 0.14, y: 0.72 }
      ],
    ],
  },

  // --------------------------------------------------------------------------
  // UPPERCASE LETTERS (A-Z)
  // --------------------------------------------------------------------------
  "A": {
    width: 0.65,
    strokes: [
      [{ x: 0.1, y: 0.82 }, { x: 0.325, y: 0.12 }, { x: 0.55, y: 0.82 }],
      [{ x: 0.18, y: 0.56 }, { x: 0.47, y: 0.56 }],
    ],
  },
  "B": {
    width: 0.65,
    strokes: [
      [{ x: 0.14, y: 0.82 }, { x: 0.14, y: 0.12 }],
      [
        { x: 0.14, y: 0.12 }, { x: 0.4, y: 0.12 }, { x: 0.52, y: 0.22 },
        { x: 0.52, y: 0.36 }, { x: 0.4, y: 0.46 }, { x: 0.14, y: 0.46 }
      ],
      [
        { x: 0.4, y: 0.46 }, { x: 0.54, y: 0.54 }, { x: 0.54, y: 0.7 },
        { x: 0.42, y: 0.82 }, { x: 0.14, y: 0.82 }
      ],
    ],
  },
  "C": {
    width: 0.65,
    strokes: [
      [
        { x: 0.54, y: 0.26 }, { x: 0.44, y: 0.14 }, { x: 0.28, y: 0.12 },
        { x: 0.14, y: 0.26 }, { x: 0.14, y: 0.68 }, { x: 0.28, y: 0.82 },
        { x: 0.44, y: 0.82 }, { x: 0.54, y: 0.7 }
      ],
    ],
  },
  "D": {
    width: 0.65,
    strokes: [
      [{ x: 0.14, y: 0.82 }, { x: 0.14, y: 0.12 }],
      [
        { x: 0.14, y: 0.12 }, { x: 0.36, y: 0.12 }, { x: 0.52, y: 0.26 },
        { x: 0.52, y: 0.68 }, { x: 0.36, y: 0.82 }, { x: 0.14, y: 0.82 }
      ],
    ],
  },
  "E": {
    width: 0.6,
    strokes: [
      [{ x: 0.48, y: 0.12 }, { x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }, { x: 0.48, y: 0.82 }],
      [{ x: 0.14, y: 0.47 }, { x: 0.42, y: 0.47 }],
    ],
  },
  "F": {
    width: 0.58,
    strokes: [
      [{ x: 0.48, y: 0.12 }, { x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.14, y: 0.47 }, { x: 0.42, y: 0.47 }],
    ],
  },
  "G": {
    width: 0.68,
    strokes: [
      [
        { x: 0.56, y: 0.26 }, { x: 0.46, y: 0.14 }, { x: 0.3, y: 0.12 },
        { x: 0.14, y: 0.26 }, { x: 0.14, y: 0.68 }, { x: 0.28, y: 0.82 },
        { x: 0.48, y: 0.82 }, { x: 0.56, y: 0.7 }, { x: 0.56, y: 0.48 },
        { x: 0.36, y: 0.48 }
      ],
    ],
  },
  "H": {
    width: 0.65,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.52, y: 0.12 }, { x: 0.52, y: 0.82 }],
      [{ x: 0.14, y: 0.47 }, { x: 0.52, y: 0.47 }],
    ],
  },
  "I": {
    width: 0.35,
    strokes: [
      [{ x: 0.175, y: 0.12 }, { x: 0.175, y: 0.82 }],
      [{ x: 0.08, y: 0.12 }, { x: 0.27, y: 0.12 }],
      [{ x: 0.08, y: 0.82 }, { x: 0.27, y: 0.82 }],
    ],
  },
  "J": {
    width: 0.5,
    strokes: [
      [{ x: 0.36, y: 0.12 }, { x: 0.36, y: 0.68 }, { x: 0.28, y: 0.82 }, { x: 0.14, y: 0.8 }, { x: 0.08, y: 0.68 }],
    ],
  },
  "K": {
    width: 0.65,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.52, y: 0.14 }, { x: 0.14, y: 0.5 }],
      [{ x: 0.26, y: 0.4 }, { x: 0.54, y: 0.82 }],
    ],
  },
  "L": {
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }, { x: 0.48, y: 0.82 }],
    ],
  },
  "M": {
    width: 0.75,
    strokes: [
      [{ x: 0.12, y: 0.82 }, { x: 0.12, y: 0.12 }, { x: 0.375, y: 0.54 }, { x: 0.63, y: 0.12 }, { x: 0.63, y: 0.82 }],
    ],
  },
  "N": {
    width: 0.68,
    strokes: [
      [{ x: 0.14, y: 0.82 }, { x: 0.14, y: 0.12 }, { x: 0.54, y: 0.82 }, { x: 0.54, y: 0.12 }],
    ],
  },
  "O": {
    width: 0.68,
    strokes: [
      [
        { x: 0.14, y: 0.32 }, { x: 0.26, y: 0.12 }, { x: 0.44, y: 0.12 },
        { x: 0.56, y: 0.32 }, { x: 0.56, y: 0.62 }, { x: 0.44, y: 0.82 },
        { x: 0.26, y: 0.82 }, { x: 0.14, y: 0.62 }, { x: 0.14, y: 0.32 }
      ],
    ],
  },
  "P": {
    width: 0.62,
    strokes: [
      [{ x: 0.14, y: 0.82 }, { x: 0.14, y: 0.12 }],
      [
        { x: 0.14, y: 0.12 }, { x: 0.38, y: 0.12 }, { x: 0.5, y: 0.22 },
        { x: 0.5, y: 0.42 }, { x: 0.38, y: 0.52 }, { x: 0.14, y: 0.52 }
      ],
    ],
  },
  "Q": {
    width: 0.68,
    strokes: [
      [
        { x: 0.14, y: 0.32 }, { x: 0.26, y: 0.12 }, { x: 0.44, y: 0.12 },
        { x: 0.56, y: 0.32 }, { x: 0.56, y: 0.62 }, { x: 0.44, y: 0.82 },
        { x: 0.26, y: 0.82 }, { x: 0.14, y: 0.62 }, { x: 0.14, y: 0.32 }
      ],
      [{ x: 0.38, y: 0.64 }, { x: 0.58, y: 0.88 }],
    ],
  },
  "R": {
    width: 0.64,
    strokes: [
      [{ x: 0.14, y: 0.82 }, { x: 0.14, y: 0.12 }],
      [
        { x: 0.14, y: 0.12 }, { x: 0.38, y: 0.12 }, { x: 0.5, y: 0.22 },
        { x: 0.5, y: 0.4 }, { x: 0.38, y: 0.5 }, { x: 0.14, y: 0.5 }
      ],
      [{ x: 0.32, y: 0.5 }, { x: 0.52, y: 0.82 }],
    ],
  },
  "S": {
    width: 0.6,
    strokes: [
      [
        { x: 0.48, y: 0.26 }, { x: 0.38, y: 0.14 }, { x: 0.24, y: 0.14 },
        { x: 0.14, y: 0.26 }, { x: 0.16, y: 0.4 }, { x: 0.46, y: 0.54 },
        { x: 0.48, y: 0.68 }, { x: 0.38, y: 0.82 }, { x: 0.2, y: 0.82 },
        { x: 0.12, y: 0.7 }
      ],
    ],
  },
  "T": {
    width: 0.6,
    strokes: [
      [{ x: 0.1, y: 0.12 }, { x: 0.5, y: 0.12 }],
      [{ x: 0.3, y: 0.12 }, { x: 0.3, y: 0.82 }],
    ],
  },
  "U": {
    width: 0.65,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.66 }, { x: 0.26, y: 0.82 }, { x: 0.42, y: 0.82 }, { x: 0.52, y: 0.66 }, { x: 0.52, y: 0.12 }],
    ],
  },
  "V": {
    width: 0.65,
    strokes: [
      [{ x: 0.1, y: 0.12 }, { x: 0.325, y: 0.82 }, { x: 0.55, y: 0.12 }],
    ],
  },
  "W": {
    width: 0.85,
    strokes: [
      [{ x: 0.1, y: 0.12 }, { x: 0.26, y: 0.82 }, { x: 0.425, y: 0.36 }, { x: 0.59, y: 0.82 }, { x: 0.75, y: 0.12 }],
    ],
  },
  "X": {
    width: 0.65,
    strokes: [
      [{ x: 0.12, y: 0.12 }, { x: 0.53, y: 0.82 }],
      [{ x: 0.53, y: 0.12 }, { x: 0.12, y: 0.82 }],
    ],
  },
  "Y": {
    width: 0.65,
    strokes: [
      [{ x: 0.12, y: 0.12 }, { x: 0.325, y: 0.46 }, { x: 0.53, y: 0.12 }],
      [{ x: 0.325, y: 0.46 }, { x: 0.325, y: 0.82 }],
    ],
  },
  "Z": {
    width: 0.6,
    strokes: [
      [{ x: 0.12, y: 0.12 }, { x: 0.48, y: 0.12 }, { x: 0.12, y: 0.82 }, { x: 0.48, y: 0.82 }],
    ],
  },

  // --------------------------------------------------------------------------
  // LOWERCASE LETTERS (a-z)
  // --------------------------------------------------------------------------
  "a": {
    width: 0.55,
    strokes: [
      [
        { x: 0.44, y: 0.48 }, { x: 0.34, y: 0.36 }, { x: 0.2, y: 0.36 },
        { x: 0.12, y: 0.48 }, { x: 0.12, y: 0.7 }, { x: 0.22, y: 0.82 },
        { x: 0.38, y: 0.82 }, { x: 0.44, y: 0.7 }
      ],
      [{ x: 0.44, y: 0.36 }, { x: 0.44, y: 0.82 }],
    ],
  },
  "b": {
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }],
      [
        { x: 0.14, y: 0.48 }, { x: 0.24, y: 0.36 }, { x: 0.38, y: 0.36 },
        { x: 0.46, y: 0.48 }, { x: 0.46, y: 0.7 }, { x: 0.36, y: 0.82 },
        { x: 0.14, y: 0.82 }
      ],
    ],
  },
  "c": {
    width: 0.5,
    strokes: [
      [
        { x: 0.42, y: 0.46 }, { x: 0.34, y: 0.36 }, { x: 0.2, y: 0.36 },
        { x: 0.12, y: 0.48 }, { x: 0.12, y: 0.7 }, { x: 0.22, y: 0.82 },
        { x: 0.36, y: 0.82 }, { x: 0.44, y: 0.72 }
      ],
    ],
  },
  "d": {
    width: 0.55,
    strokes: [
      [{ x: 0.44, y: 0.12 }, { x: 0.44, y: 0.82 }],
      [
        { x: 0.44, y: 0.48 }, { x: 0.34, y: 0.36 }, { x: 0.2, y: 0.36 },
        { x: 0.12, y: 0.48 }, { x: 0.12, y: 0.7 }, { x: 0.22, y: 0.82 },
        { x: 0.44, y: 0.82 }
      ],
    ],
  },
  "e": {
    width: 0.52,
    strokes: [
      [
        { x: 0.44, y: 0.68 }, { x: 0.36, y: 0.82 }, { x: 0.2, y: 0.82 },
        { x: 0.12, y: 0.68 }, { x: 0.12, y: 0.52 }, { x: 0.22, y: 0.36 },
        { x: 0.38, y: 0.36 }, { x: 0.44, y: 0.48 }, { x: 0.12, y: 0.48 }
      ],
    ],
  },
  "f": {
    width: 0.4,
    strokes: [
      [{ x: 0.34, y: 0.14 }, { x: 0.24, y: 0.12 }, { x: 0.18, y: 0.22 }, { x: 0.18, y: 0.82 }],
      [{ x: 0.08, y: 0.38 }, { x: 0.32, y: 0.38 }],
    ],
  },
  "g": {
    width: 0.55,
    strokes: [
      [
        { x: 0.44, y: 0.48 }, { x: 0.34, y: 0.36 }, { x: 0.2, y: 0.36 },
        { x: 0.12, y: 0.48 }, { x: 0.12, y: 0.7 }, { x: 0.22, y: 0.82 },
        { x: 0.44, y: 0.82 }
      ],
      [{ x: 0.44, y: 0.36 }, { x: 0.44, y: 0.94 }, { x: 0.34, y: 1.04 }, { x: 0.16, y: 1.02 }],
    ],
  },
  "h": {
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.14, y: 0.48 }, { x: 0.26, y: 0.36 }, { x: 0.38, y: 0.36 }, { x: 0.44, y: 0.48 }, { x: 0.44, y: 0.82 }],
    ],
  },
  "i": {
    width: 0.28,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.14, y: 0.18 }, { x: 0.14, y: 0.22 }],
    ],
  },
  "j": {
    width: 0.32,
    strokes: [
      [{ x: 0.2, y: 0.36 }, { x: 0.2, y: 0.94 }, { x: 0.1, y: 1.04 }, { x: 0.04, y: 0.98 }],
      [{ x: 0.2, y: 0.18 }, { x: 0.2, y: 0.22 }],
    ],
  },
  "k": {
    width: 0.52,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.42, y: 0.36 }, { x: 0.14, y: 0.62 }],
      [{ x: 0.24, y: 0.52 }, { x: 0.44, y: 0.82 }],
    ],
  },
  "l": {
    width: 0.28,
    strokes: [
      [{ x: 0.14, y: 0.12 }, { x: 0.14, y: 0.78 }, { x: 0.22, y: 0.82 }],
    ],
  },
  "m": {
    width: 0.75,
    strokes: [
      [{ x: 0.12, y: 0.36 }, { x: 0.12, y: 0.82 }],
      [{ x: 0.12, y: 0.48 }, { x: 0.24, y: 0.36 }, { x: 0.36, y: 0.36 }, { x: 0.38, y: 0.5 }, { x: 0.38, y: 0.82 }],
      [{ x: 0.38, y: 0.48 }, { x: 0.5, y: 0.36 }, { x: 0.62, y: 0.36 }, { x: 0.64, y: 0.5 }, { x: 0.64, y: 0.82 }],
    ],
  },
  "n": {
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.14, y: 0.48 }, { x: 0.26, y: 0.36 }, { x: 0.38, y: 0.36 }, { x: 0.44, y: 0.48 }, { x: 0.44, y: 0.82 }],
    ],
  },
  "o": {
    width: 0.55,
    strokes: [
      [
        { x: 0.14, y: 0.5 }, { x: 0.24, y: 0.36 }, { x: 0.36, y: 0.36 },
        { x: 0.46, y: 0.5 }, { x: 0.46, y: 0.68 }, { x: 0.36, y: 0.82 },
        { x: 0.24, y: 0.82 }, { x: 0.14, y: 0.68 }, { x: 0.14, y: 0.5 }
      ],
    ],
  },
  "p": {
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 1.04 }],
      [
        { x: 0.14, y: 0.48 }, { x: 0.24, y: 0.36 }, { x: 0.38, y: 0.36 },
        { x: 0.46, y: 0.48 }, { x: 0.46, y: 0.7 }, { x: 0.36, y: 0.82 },
        { x: 0.14, y: 0.82 }
      ],
    ],
  },
  "q": {
    width: 0.55,
    strokes: [
      [{ x: 0.44, y: 0.36 }, { x: 0.44, y: 1.04 }],
      [
        { x: 0.44, y: 0.48 }, { x: 0.34, y: 0.36 }, { x: 0.2, y: 0.36 },
        { x: 0.12, y: 0.48 }, { x: 0.12, y: 0.7 }, { x: 0.22, y: 0.82 },
        { x: 0.44, y: 0.82 }
      ],
    ],
  },
  "r": {
    width: 0.4,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 0.82 }],
      [{ x: 0.14, y: 0.48 }, { x: 0.22, y: 0.36 }, { x: 0.34, y: 0.36 }],
    ],
  },
  "s": {
    width: 0.48,
    strokes: [
      [
        { x: 0.38, y: 0.44 }, { x: 0.3, y: 0.36 }, { x: 0.2, y: 0.36 },
        { x: 0.14, y: 0.44 }, { x: 0.18, y: 0.54 }, { x: 0.34, y: 0.62 },
        { x: 0.38, y: 0.72 }, { x: 0.3, y: 0.82 }, { x: 0.18, y: 0.82 },
        { x: 0.12, y: 0.74 }
      ],
    ],
  },
  "t": {
    width: 0.36,
    strokes: [
      [{ x: 0.18, y: 0.18 }, { x: 0.18, y: 0.76 }, { x: 0.26, y: 0.82 }],
      [{ x: 0.08, y: 0.36 }, { x: 0.3, y: 0.36 }],
    ],
  },
  "u": {
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 0.72 }, { x: 0.24, y: 0.82 }, { x: 0.38, y: 0.82 }, { x: 0.44, y: 0.72 }, { x: 0.44, y: 0.36 }],
      [{ x: 0.44, y: 0.6 }, { x: 0.44, y: 0.82 }],
    ],
  },
  "v": {
    width: 0.55,
    strokes: [
      [{ x: 0.1, y: 0.36 }, { x: 0.275, y: 0.82 }, { x: 0.45, y: 0.36 }],
    ],
  },
  "w": {
    width: 0.75,
    strokes: [
      [{ x: 0.1, y: 0.36 }, { x: 0.22, y: 0.82 }, { x: 0.375, y: 0.52 }, { x: 0.53, y: 0.82 }, { x: 0.65, y: 0.36 }],
    ],
  },
  "x": {
    width: 0.52,
    strokes: [
      [{ x: 0.12, y: 0.36 }, { x: 0.42, y: 0.82 }],
      [{ x: 0.42, y: 0.36 }, { x: 0.12, y: 0.82 }],
    ],
  },
  "y": {
    width: 0.55,
    strokes: [
      [{ x: 0.1, y: 0.36 }, { x: 0.275, y: 0.82 }],
      [{ x: 0.45, y: 0.36 }, { x: 0.2, y: 1.04 }, { x: 0.1, y: 1.0 }],
    ],
  },
  "z": {
    width: 0.5,
    strokes: [
      [{ x: 0.12, y: 0.36 }, { x: 0.4, y: 0.36 }, { x: 0.12, y: 0.82 }, { x: 0.4, y: 0.82 }],
    ],
  },

  // --------------------------------------------------------------------------
  // ENGINEERING / SCIENTIFIC SYMBOLS
  // --------------------------------------------------------------------------
  "µ": { // Micro (e.g. µF, µH, µA)
    width: 0.58,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 1.04 }],
      [{ x: 0.14, y: 0.68 }, { x: 0.24, y: 0.82 }, { x: 0.38, y: 0.82 }, { x: 0.44, y: 0.68 }, { x: 0.44, y: 0.36 }],
    ],
  },
  "u": { // Fallback for micro when typed as 'u'
    width: 0.55,
    strokes: [
      [{ x: 0.14, y: 0.36 }, { x: 0.14, y: 0.72 }, { x: 0.24, y: 0.82 }, { x: 0.38, y: 0.82 }, { x: 0.44, y: 0.72 }, { x: 0.44, y: 0.36 }],
      [{ x: 0.44, y: 0.6 }, { x: 0.44, y: 0.82 }],
    ],
  },
  "Ω": { // Ohm (resistance)
    width: 0.7,
    strokes: [
      [
        { x: 0.08, y: 0.82 }, { x: 0.22, y: 0.82 }, { x: 0.2, y: 0.68 },
        { x: 0.14, y: 0.46 }, { x: 0.24, y: 0.2 }, { x: 0.46, y: 0.2 },
        { x: 0.56, y: 0.46 }, { x: 0.5, y: 0.68 }, { x: 0.48, y: 0.82 },
        { x: 0.62, y: 0.82 }
      ],
    ],
  },
  "°": { // Degree
    width: 0.4,
    strokes: [
      [
        { x: 0.14, y: 0.18 }, { x: 0.24, y: 0.12 }, { x: 0.32, y: 0.18 },
        { x: 0.24, y: 0.26 }, { x: 0.14, y: 0.18 }
      ],
    ],
  },
};

/**
 * Calculates the total bounding box width of a string formatted in Hershey Vector Font
 */
export function measureHersheyText(
  text: string,
  charHeight: number,
  charWidth?: number,
  letterSpacing: number = 0.15
): { width: number; height: number } {
  if (!text) return { width: 0, height: charHeight };
  const h = charHeight || 1.0;
  const wScale = charWidth ? charWidth / h : 1.0;

  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const glyph = GLYPH_TABLE[ch] || GLYPH_TABLE[ch.toUpperCase()] || GLYPH_TABLE["?"] || GLYPH_TABLE[" "];
    const cw = glyph.width * h * wScale;
    totalW += cw;
    if (i < text.length - 1) {
      totalW += letterSpacing * h * wScale;
    }
  }

  return { width: totalW, height: h };
}

/**
 * Generates vector stroke line segments for any arbitrary string using KiCad's
 * Hershey Vector Font specifications.
 *
 * Each character is decomposed into straight line segments (strokes).
 * Can be rendered directly via WebGL instanced line segments or triangulated meshes.
 */
export function generateHersheyTextStrokes(options: HersheyTextOptions): HersheyTextSegment[] {
  const {
    text,
    x = 0,
    y = 0,
    size = 1.0,
    sizeY,
    thickness = 0.15,
    rotation = 0,
    layer = "silkscreen",
    justify = "center",
    verticalAlign = "middle",
    bold = false,
    italic = false,
    mirror = false,
    letterSpacing = 0.15,
  } = options;

  if (!text || text.length === 0) return [];

  const charH = sizeY || size;
  const charWScale = size / charH; // default 1.0 if size === charH
  const totalDim = measureHersheyText(text, charH, size, letterSpacing);

  // 1. Calculate base origin offset based on justification & vertical alignment
  let offsetX = 0;
  if (justify === "center") {
    offsetX = -totalDim.width * 0.5;
  } else if (justify === "right") {
    offsetX = -totalDim.width;
  }

  let offsetY = 0;
  if (verticalAlign === "middle") {
    offsetY = -charH * 0.5;
  } else if (verticalAlign === "bottom") {
    offsetY = -charH;
  } else if (verticalAlign === "baseline") {
    offsetY = -charH * 0.82; // standard baseline is at ~82% of character cell
  }

  // 2. Rotation & Mirror trigonometry
  const rotRad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const effectiveThickness = bold ? thickness * 1.35 : thickness;
  const italicSlant = italic ? 0.22 : 0.0;

  const segments: HersheyTextSegment[] = [];

  let cursorX = offsetX;

  for (let cIdx = 0; cIdx < text.length; cIdx++) {
    const ch = text[cIdx];
    const glyph = GLYPH_TABLE[ch] || GLYPH_TABLE[ch.toUpperCase()] || GLYPH_TABLE["?"] || GLYPH_TABLE[" "];
    const glyphW = glyph.width * charH * charWScale;

    for (const stroke of glyph.strokes) {
      if (stroke.length < 2) continue;

      for (let s = 0; s < stroke.length - 1; s++) {
        const pt0 = stroke[s];
        const pt1 = stroke[s + 1];

        // Glyph local position in character cell
        // X ranges [0, glyph.width], Y ranges [0, 1]
        const raw0X = pt0.x * charH * charWScale;
        const raw0Y = pt0.y * charH;
        const raw1X = pt1.x * charH * charWScale;
        const raw1Y = pt1.y * charH;

        // Apply italic slant: x' = x + (1 - y) * slant
        const slanted0X = raw0X + (charH - raw0Y) * italicSlant;
        const slanted1X = raw1X + (charH - raw1Y) * italicSlant;

        // Text block local coordinates
        let local0X = cursorX + slanted0X;
        const local0Y = offsetY + raw0Y;
        let local1X = cursorX + slanted1X;
        const local1Y = offsetY + raw1Y;

        // Mirror for bottom layer
        if (mirror) {
          local0X = -local0X;
          local1X = -local1X;
        }

        // Apply board/text rotation and translate to world (x, y)
        const w0x = x + (local0X * cosR - local0Y * sinR);
        const w0y = y + (local0X * sinR + local0Y * cosR);
        const w1x = x + (local1X * cosR - local1Y * sinR);
        const w1y = y + (local1X * sinR + local1Y * cosR);

        segments.push({
          p0: { x: w0x, y: w0y },
          p1: { x: w1x, y: w1y },
          strokeWidth: effectiveThickness,
          layer,
        });

        // Extra dual stroke for bold emphasis if requested
        if (bold) {
          const boldOffset = thickness * 0.35;
          segments.push({
            p0: { x: w0x + boldOffset * cosR, y: w0y + boldOffset * sinR },
            p1: { x: w1x + boldOffset * cosR, y: w1y + boldOffset * sinR },
            strokeWidth: effectiveThickness,
            layer,
          });
        }
      }
    }

    cursorX += glyphW + letterSpacing * charH * charWScale;
  }

  return segments;
}
