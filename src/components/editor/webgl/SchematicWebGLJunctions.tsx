// WebGL pass for the small filled-dot + ring markers drawn at wire junctions (where 3+ wire
// segments meet). Purely decorative (pointerEvents: "none" in the old SVG, no hit-testing
// involved at all), so this is a straightforward, low-risk port — unlike wires/symbols there
// is no interaction layer to preserve here.
//
// The simulating-voltage "glow" used a CSS blur filter in SVG; WebGL has no free blur, so it's
// approximated with a soft radial falloff circle instead of true Gaussian blur — visually
// close, not pixel-identical.
import { useMemo, useRef } from "react";
import { useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { GRID } from "@/lib/schematic";

export interface JunctionInstance {
  x: number;
  y: number;
  color: string; // hex, the dot/ring color (strokeColor)
  glowColor: string | null; // hex, or null when no glow this frame
  radius?: number;
  /** Realistic view: unit vectors from the junction along every wire that meets here. */
  dirs?: [number, number][];
}

export interface SchematicWebGLJunctionsProps {
  instances: JunctionInstance[];
  view: { x: number; y: number; scale: number };
  /** Realistic view: draw each junction as a shiny solder blob instead of a flat dot. */
  realistic?: boolean;
}

const VERTEX_SRC = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec2 u_resolution;
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
void main() { gl_FragColor = v_color; }
`;

function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b, alpha];
}

function circleFan(cx: number, cy: number, r: number, segments = 20): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

export function SchematicWebGLJunctions({ instances, view, realistic = false }: SchematicWebGLJunctionsProps): null {
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPosition: number; aColor: number;
    uResolution: WebGLUniformLocation | null; uDpr: WebGLUniformLocation | null;
  } | null>(null);

  const vertexData = useMemo(() => {
    const verts: number[] = [];
    const worldScale = view.scale * GRID;
    const toScreen = (x: number, y: number): [number, number] => [
      x * worldScale + view.x,
      y * worldScale + view.y,
    ];

    const pushFan = (cx: number, cy: number, r: number, color: string, alpha: number, ring = false, ringWidth = 0) => {
      const [rr, gg, bb, aa] = hexToRgba(color, alpha);
      const pr = rr * aa, pg = gg * aa, pb = bb * aa;
      if (!ring) {
        const pts = circleFan(cx, cy, r).map(([x, y]) => toScreen(x, y));
        for (let i = 1; i + 1 < pts.length; i++) {
          verts.push(
            pts[0][0], pts[0][1], pr, pg, pb, aa,
            pts[i][0], pts[i][1], pr, pg, pb, aa,
            pts[i + 1][0], pts[i + 1][1], pr, pg, pb, aa
          );
        }
      } else {
        const outer = circleFan(cx, cy, r).map(([x, y]) => toScreen(x, y));
        const inner = circleFan(cx, cy, r - ringWidth).map(([x, y]) => toScreen(x, y));
        for (let i = 0; i < outer.length; i++) {
          const j = (i + 1) % outer.length;
          verts.push(
            outer[i][0], outer[i][1], pr, pg, pb, aa,
            inner[i][0], inner[i][1], pr, pg, pb, aa,
            inner[j][0], inner[j][1], pr, pg, pb, aa,
            outer[i][0], outer[i][1], pr, pg, pb, aa,
            inner[j][0], inner[j][1], pr, pg, pb, aa,
            outer[j][0], outer[j][1], pr, pg, pb, aa
          );
        }
      }
    };

    // Realistic solder blob: soft shadow, dark rim, then stacked discs walking toward the light
    // (top-left) so the ball reads as a rounded, shiny metal bead.
    const pushRgb = (cx: number, cy: number, r: number, c: [number, number, number], a: number) => {
      const pts = circleFan(cx, cy, r, 26).map(([x, y]) => toScreen(x, y));
      const pr = c[0] * a, pg = c[1] * a, pb = c[2] * a;
      for (let i = 1; i + 1 < pts.length; i++) {
        verts.push(pts[0][0], pts[0][1], pr, pg, pb, a, pts[i][0], pts[i][1], pr, pg, pb, a, pts[i + 1][0], pts[i + 1][1], pr, pg, pb, a);
      }
    };
    // Realistic solder junction: wires twisted together and soldered. A lumpy shiny blob whose
    // meniscus flows a little way along every incident wire, with amber flux residue around it.
    const shaded = (cx: number, cy: number, r: number, base: [number, number, number], spec: number) => {
      const K = 9;
      for (let i = 0; i < K; i++) {
        const t = i / (K - 1);
        const b = 0.3 + 0.9 * Math.pow(t, 0.9);
        let c: [number, number, number] = [Math.min(1, base[0] * b), Math.min(1, base[1] * b), Math.min(1, base[2] * b)];
        if (t > 0.75) { const w = ((t - 0.75) / 0.25) * spec; c = [c[0] + (1 - c[0]) * w, c[1] + (1 - c[1]) * w, c[2] + (1 - c[2]) * w]; }
        pushRgb(cx - 0.45 * r * 0.6 * t, cy - 0.6 * r * 0.6 * t, r * (1 - t * 0.88), c, 1);
      }
    };
    const solder = (j: JunctionInstance) => {
      const R = Math.max(j.radius ?? 0.28, 0.26);
      const dirs = j.dirs ?? [];
      const silver: [number, number, number] = [0.8, 0.83, 0.88];
      const tint = j.glowColor ? hexToRgba(j.glowColor) : null;
      const base: [number, number, number] = tint ? [silver[0] * 0.74 + tint[0] * 0.26, silver[1] * 0.74 + tint[1] * 0.26, silver[2] * 0.74 + tint[2] * 0.26] : silver;
      const dark: [number, number, number] = [0.32, 0.35, 0.41];
      // flux residue + soft shadow
      pushRgb(j.x, j.y, R * 1.9, [0.78, 0.5, 0.16], 0.07);
      pushRgb(j.x, j.y, R * 1.5, [0.78, 0.5, 0.16], 0.07);
      for (let k = 0; k < 5; k++) pushRgb(j.x + 0.05, j.y + 0.09, R * (1.05 + k * 0.1), [0, 0, 0], 0.085);
      // wetting base: main blob + tapering lobes that creep along each wire
      for (const [dx, dy] of dirs) {
        [[0.6, 0.62], [1.0, 0.46], [1.38, 0.33]].forEach(([d, r]) => pushRgb(j.x + dx * R * d, j.y + dy * R * d, R * r, dark, 1));
      }
      pushRgb(j.x, j.y, R * 1.12, dark, 1);
      // shaded lobes then the main ball
      for (const [dx, dy] of dirs) {
        shaded(j.x + dx * R * 0.6, j.y + dy * R * 0.6, R * 0.5, base, 0.9);
        shaded(j.x + dx * R * 1.0, j.y + dy * R * 1.0, R * 0.36, base, 0.9);
      }
      shaded(j.x, j.y, R * 0.98, base, 1);
      pushRgb(j.x - R * 0.34, j.y - R * 0.38, R * 0.15, [1, 1, 1], 0.85);
      // secondary micro-glint + a darker under-rim: sells the wet, rounded metal surface
      pushRgb(j.x + R * 0.22, j.y + R * 0.3, R * 0.1, [0.95, 0.97, 1], 0.4);
      pushRgb(j.x + R * 0.12, j.y + R * 0.42, R * 0.5, [0.1, 0.11, 0.14], 0.18);
    };

    for (const j of instances) {
      if (realistic) {
        if (j.glowColor) {
          for (let s = 5; s >= 1; s--) pushFan(j.x, j.y, (0.6 * s) / 5, j.glowColor, 0.4 * (1 - s / 5) * 0.5);
        }
        solder(j);
        continue;
      }
      if (j.glowColor) {
        // Soft falloff approximating the old blur(4px): a few concentric translucent rings.
        const steps = 5;
        for (let s = steps; s >= 1; s--) {
          const r = (0.6 * s) / steps;
          const alpha = 0.4 * (1 - s / steps) * 0.6;
          pushFan(j.x, j.y, r, j.glowColor, alpha);
        }
      }
      const r = j.radius ?? 0.28;
      pushFan(j.x, j.y, r, j.color, 1);
      pushFan(j.x, j.y, r + 0.08, j.color, 0.4, true, 0.05);
    }
    return new Float32Array(verts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, view.x, view.y, view.scale, realistic]);

  useSchematicGLPass(
    "junctions",
    SCHEMATIC_GL_PASS_ORDER.junctions,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLJunctions shader error:", gl.getShaderInfoLog(shader));
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
        console.error("SchematicWebGLJunctions link error:", gl.getProgramInfoLog(program));
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
      if (!program || !locs || !buffer || vertexData.length === 0) return;

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

      gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 6);
    },
    [vertexData]
  );

  return null;
}
