// Minimal SVG path data flattener: parses the small subset of path commands actually used by
// src/lib/symbols.tsx (M/L/H/V/C/Q/A/Z, plus their lowercase/relative forms, and the shorthand
// smooth variants) and returns one or more flattened polylines (arrays of [x, y] points) in
// the path's own local coordinate space, ready to feed straight into line/triangle geometry.

export interface FlattenedSubpath {
  points: [number, number][];
  closed: boolean;
}

const CURVE_STEPS = 16;

function tokenize(d: string): string[] {
  return d
    .replace(/,/g, " ")
    .replace(/-/g, " -")
    .replace(/e -/gi, "e-") // don't split exponents like 1e-5
    .replace(/([a-zA-Z])/g, " $1 ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function flattenPath(d: string): FlattenedSubpath[] {
  const tokens = tokenize(d);
  let i = 0;
  const readNum = () => parseFloat(tokens[i++]);

  const subpaths: FlattenedSubpath[] = [];
  let current: [number, number][] = [];
  let cx = 0, cy = 0; // current point
  let sx = 0, sy = 0; // subpath start
  let lastCmd = "";
  let lastCtrl: [number, number] | null = null; // for smooth curve reflection

  const pushPoint = (x: number, y: number) => {
    current.push([x, y]);
    cx = x;
    cy = y;
  };

  const cubicTo = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const x0 = cx, y0 = cy;
    for (let t = 1; t <= CURVE_STEPS; t++) {
      const u = t / CURVE_STEPS;
      const mu = 1 - u;
      const px = mu * mu * mu * x0 + 3 * mu * mu * u * x1 + 3 * mu * u * u * x2 + u * u * u * x;
      const py = mu * mu * mu * y0 + 3 * mu * mu * u * y1 + 3 * mu * u * u * y2 + u * u * u * y;
      current.push([px, py]);
    }
    cx = x; cy = y;
    lastCtrl = [x2, y2];
  };

  const quadTo = (x1: number, y1: number, x: number, y: number) => {
    const x0 = cx, y0 = cy;
    for (let t = 1; t <= CURVE_STEPS; t++) {
      const u = t / CURVE_STEPS;
      const mu = 1 - u;
      const px = mu * mu * x0 + 2 * mu * u * x1 + u * u * x;
      const py = mu * mu * y0 + 2 * mu * u * y1 + u * u * y;
      current.push([px, py]);
    }
    cx = x; cy = y;
    lastCtrl = [x1, y1];
  };

  // Flattens an elliptical arc (endpoint parameterization) to line segments.
  const arcTo = (rx: number, ry: number, xRot: number, largeArc: boolean, sweep: boolean, x: number, y: number) => {
    const x0 = cx, y0 = cy;
    if (rx === 0 || ry === 0) { pushPoint(x, y); return; }
    const phi = (xRot * Math.PI) / 180;
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    const dx2 = (x0 - x) / 2, dy2 = (y0 - y) / 2;
    const x1p = cosPhi * dx2 + sinPhi * dy2;
    const y1p = -sinPhi * dx2 + cosPhi * dy2;
    let rxAbs = Math.abs(rx), ryAbs = Math.abs(ry);
    const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
    if (lambda > 1) {
      const s = Math.sqrt(lambda);
      rxAbs *= s; ryAbs *= s;
    }
    const sign = largeArc !== sweep ? 1 : -1;
    const num = rxAbs * rxAbs * ryAbs * ryAbs - rxAbs * rxAbs * y1p * y1p - ryAbs * ryAbs * x1p * x1p;
    const den = rxAbs * rxAbs * y1p * y1p + ryAbs * ryAbs * x1p * x1p;
    const coef = sign * Math.sqrt(Math.max(0, num / den));
    const cxp = (coef * (rxAbs * y1p)) / ryAbs;
    const cyp = (coef * -(ryAbs * x1p)) / rxAbs;
    const centerX = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
    const centerY = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) => {
      const dot = ux * vx + uy * vy;
      const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)) || 1;
      let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
      if (ux * vy - uy * vx < 0) a = -a;
      return a;
    };
    const theta1 = angle(1, 0, (x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs);
    let dTheta = angle((x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs, (-x1p - cxp) / rxAbs, (-y1p - cyp) / ryAbs);
    if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
    for (let t = 1; t <= CURVE_STEPS; t++) {
      const theta = theta1 + (dTheta * t) / CURVE_STEPS;
      const px = centerX + rxAbs * Math.cos(theta) * cosPhi - ryAbs * Math.sin(theta) * sinPhi;
      const py = centerY + rxAbs * Math.cos(theta) * sinPhi + ryAbs * Math.sin(theta) * cosPhi;
      current.push([px, py]);
    }
    cx = x; cy = y;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    let cmd = tok;
    if (/^[a-zA-Z]$/.test(tok)) {
      i++;
    } else {
      // repeated implicit command (same as previous)
      cmd = lastCmd;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === "M") {
      const x = readNum(), y = readNum();
      if (current.length) subpaths.push({ points: current, closed: false });
      current = [];
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      sx = cx; sy = cy;
      pushPoint(cx, cy);
      lastCmd = rel ? "l" : "L"; // subsequent bare pairs after M are treated as lineto
      lastCtrl = null;
      continue;
    }
    if (C === "L") {
      const x = readNum(), y = readNum();
      pushPoint(rel ? cx + x : x, rel ? cy + y : y);
      lastCmd = cmd; lastCtrl = null; continue;
    }
    if (C === "H") {
      const x = readNum();
      pushPoint(rel ? cx + x : x, cy);
      lastCmd = cmd; lastCtrl = null; continue;
    }
    if (C === "V") {
      const y = readNum();
      pushPoint(cx, rel ? cy + y : y);
      lastCmd = cmd; lastCtrl = null; continue;
    }
    if (C === "C") {
      const x1 = readNum(), y1 = readNum(), x2 = readNum(), y2 = readNum(), x = readNum(), y = readNum();
      const ax1 = rel ? cx + x1 : x1, ay1 = rel ? cy + y1 : y1;
      const ax2 = rel ? cx + x2 : x2, ay2 = rel ? cy + y2 : y2;
      const ax = rel ? cx + x : x, ay = rel ? cy + y : y;
      cubicTo(ax1, ay1, ax2, ay2, ax, ay);
      lastCmd = cmd; continue;
    }
    if (C === "S") {
      const x2 = readNum(), y2 = readNum(), x = readNum(), y = readNum();
      const ax2 = rel ? cx + x2 : x2, ay2 = rel ? cy + y2 : y2;
      const ax = rel ? cx + x : x, ay = rel ? cy + y : y;
      const rx1 = lastCtrl ? 2 * cx - lastCtrl[0] : cx;
      const ry1 = lastCtrl ? 2 * cy - lastCtrl[1] : cy;
      cubicTo(rx1, ry1, ax2, ay2, ax, ay);
      lastCmd = cmd; continue;
    }
    if (C === "Q") {
      const x1 = readNum(), y1 = readNum(), x = readNum(), y = readNum();
      const ax1 = rel ? cx + x1 : x1, ay1 = rel ? cy + y1 : y1;
      const ax = rel ? cx + x : x, ay = rel ? cy + y : y;
      quadTo(ax1, ay1, ax, ay);
      lastCmd = cmd; continue;
    }
    if (C === "T") {
      const x = readNum(), y = readNum();
      const ax = rel ? cx + x : x, ay = rel ? cy + y : y;
      const rx1 = lastCtrl ? 2 * cx - lastCtrl[0] : cx;
      const ry1 = lastCtrl ? 2 * cy - lastCtrl[1] : cy;
      quadTo(rx1, ry1, ax, ay);
      lastCmd = cmd; continue;
    }
    if (C === "A") {
      const rx = readNum(), ry = readNum(), xRot = readNum();
      const largeArc = readNum() !== 0, sweep = readNum() !== 0;
      const x = readNum(), y = readNum();
      const ax = rel ? cx + x : x, ay = rel ? cy + y : y;
      arcTo(rx, ry, xRot, largeArc, sweep, ax, ay);
      lastCmd = cmd; lastCtrl = null; continue;
    }
    if (C === "Z") {
      if (current.length) {
        subpaths.push({ points: current, closed: true });
      }
      current = [[sx, sy]];
      cx = sx; cy = sy;
      lastCmd = cmd; lastCtrl = null; continue;
    }
    // Unknown command: bail out to avoid an infinite loop.
    break;
  }
  if (current.length) subpaths.push({ points: current, closed: false });
  return subpaths;
}
