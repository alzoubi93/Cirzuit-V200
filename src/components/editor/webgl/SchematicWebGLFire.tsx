// Real-time fire, sparks, smoke and soot for destroyed components — 100 % WebGL, no SVG.
//
// Every burning component is a small procedural particle system that is evaluated on the CPU as a
// pure function of (wall-clock time, particle index, seed) — there is no particle state to keep
// in sync, so the effect is deterministic, survives pan / zoom / React re-renders and never leaks.
// The fragment shader does the actual "fire look":
//   * flames   – teardrop tongues whose silhouette is torn by 4-octave value noise, coloured by a
//                black-body style ramp (deep red -> orange -> yellow -> white-hot core) and
//                blended additively so overlapping tongues blow out to white like real flames;
//   * sparks   – short fast streaks that fly out on ballistic arcs and cool from yellow to red;
//   * smoke    – large soft noisy puffs that rise, widen, drift and fade (normal blending);
//   * glow     – an additive ember halo that flickers, plus a one-off white flash at ignition;
//   * soot     – a charred, noisy black patch left on the body of the part.
//
// Severity (0..1) controls the size / amount; below FIRE_THRESHOLD only smoke + a dull ember glow
// are produced (overheating), above it real flames appear.
import { useEffect, useRef } from "react";
import { useSchematicGLStage, useSchematicGLPass, SCHEMATIC_GL_PASS_ORDER } from "./SchematicGLStage";
import type { PcbGL, PcbGLFrame } from "./pcbGLStageCore";
import { FIRE_VERT, FIRE_FRAG, FIRE_FLOATS, buildFireVertices, type FireInstance } from "./fireParticles";

export type { FireInstance };

export interface SchematicWebGLFireProps {
  instances: FireInstance[];
  view: { x: number; y: number; scale: number };
}

const MAX_FIRES = 16;

export function SchematicWebGLFire({ instances, view }: SchematicWebGLFireProps): null {
  const core = useSchematicGLStage();
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<{
    aPos: number; aUv: number; aP: number;
    uResolution: WebGLUniformLocation | null; uDpr: WebGLUniformLocation | null;
  } | null>(null);

  const list = instances.slice(0, MAX_FIRES);

  useSchematicGLPass(
    "fire",
    SCHEMATIC_GL_PASS_ORDER.selection + 5,
    (gl: PcbGL) => {
      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.error("SchematicWebGLFire shader error:", gl.getShaderInfoLog(sh));
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = compile(gl.VERTEX_SHADER, FIRE_VERT), fs = compile(gl.FRAGMENT_SHADER, FIRE_FRAG);
      if (!vs || !fs) return;
      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("SchematicWebGLFire link error:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return;
      }
      programRef.current = program;
      const buffer = gl.createBuffer();
      bufferRef.current = buffer;
      locsRef.current = {
        aPos: gl.getAttribLocation(program, "a_pos"),
        aUv: gl.getAttribLocation(program, "a_uv"),
        aP: gl.getAttribLocation(program, "a_p"),
        uResolution: gl.getUniformLocation(program, "u_resolution"),
        uDpr: gl.getUniformLocation(program, "u_dpr"),
      };
      return () => {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        programRef.current = null;
        bufferRef.current = null;
        locsRef.current = null;
      };
    },
    (frame: PcbGLFrame) => {
      const { gl, physW, physH, dpr } = frame;
      const program = programRef.current, locs = locsRef.current, buffer = bufferRef.current;
      if (!program || !locs || !buffer || list.length === 0) return;

      const back: number[] = [], front: number[] = [];
      const now = performance.now() / 1000;
      for (const inst of list) buildFireVertices(inst, view, now, back, front);

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.uniform2f(locs.uResolution, physW, physH);
      gl.uniform1f(locs.uDpr, dpr);
      const stride = FIRE_FLOATS * 4;
      const setup = () => {
        gl.enableVertexAttribArray(locs.aPos);
        gl.vertexAttribPointer(locs.aPos, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(locs.aUv);
        gl.vertexAttribPointer(locs.aUv, 2, gl.FLOAT, false, stride, 2 * 4);
        gl.enableVertexAttribArray(locs.aP);
        gl.vertexAttribPointer(locs.aP, 4, gl.FLOAT, false, stride, 4 * 4);
      };
      gl.enable(gl.BLEND);

      if (back.length) {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(back), gl.DYNAMIC_DRAW);
        setup();
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);          // soot + smoke: premultiplied "over"
        gl.drawArrays(gl.TRIANGLES, 0, back.length / FIRE_FLOATS);
      }
      if (front.length) {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(front), gl.DYNAMIC_DRAW);
        setup();
        gl.blendFunc(gl.ONE, gl.ONE);                           // flames, sparks, glow: additive
        gl.drawArrays(gl.TRIANGLES, 0, front.length / FIRE_FLOATS);
      }
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);             // restore the stage default
    },
    [instances, view.x, view.y, view.scale]
  );

  // The stage only renders on demand — keep it ticking while anything is burning.
  const burning = list.length > 0;
  useEffect(() => {
    if (!burning) return;
    let raf = 0;
    const tick = () => { core.requestRender(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [core, burning]);

  return null;
}
