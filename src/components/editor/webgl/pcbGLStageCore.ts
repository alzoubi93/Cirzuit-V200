/**
 * glStageCore (file: pcbGLStageCore.ts) — framework-free core of the unified WebGL stage.
 *
 * Shared by BOTH editors:
 *   - PCB editor via <PcbGLStage>
 *   - Schematic editor via <SchematicGLStage>
 *
 * ONE <canvas>, ONE WebGL context, ONE frame per stage instance. Layers register as
 * ordered "passes". Each frame the stage:
 *   1. sizes the drawing buffer once (shared pixel grid — layers cannot drift),
 *   2. clears the buffer ONCE,
 *   3. runs passes in ascending `order`, resetting WebGL state before each pass so no
 *      pass can leak blend / program / attribute / divisor state into the next.
 *
 * Nothing here depends on React (unit-testable with a mock context).
 *
 * Naming: preferred names are GLStageCore / GLContext / GLFrame / GLPass.
 * Legacy aliases PcbGLStageCore / PcbGL / PcbGLFrame / … remain for compatibility.
 */

/** Preferred name for the WebGL context handle used by stage passes. */
export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;
/** @deprecated Prefer GLContext — kept so existing PCB/Schematic imports keep working. */
export type PcbGL = GLContext;

/**
 * Same method names as ANGLE_instanced_arrays. On WebGL2 they map to the native calls, on
 * WebGL1 this is the real extension object — so layer code is written once for both.
 */
export interface GLInstancing {
  vertexAttribDivisorANGLE(index: number, divisor: number): void;
  drawArraysInstancedANGLE(mode: number, first: number, count: number, primcount: number): void;
  drawElementsInstancedANGLE(mode: number, count: number, type: number, offset: number, primcount: number): void;
}
/** @deprecated Prefer GLInstancing */
export type PcbGLInstancing = GLInstancing;

/** Everything a pass needs to draw one frame. Sizes are shared by ALL passes. */
export interface GLFrame {
  gl: GLContext;
  ext: GLInstancing;
  isWebGL2: boolean;
  /** Drawing-buffer size in physical (device) pixels. */
  physW: number;
  physH: number;
  /** Canvas size in CSS pixels. */
  cssW: number;
  cssH: number;
  /** Effective physical/CSS pixel ratio (physW / cssW). Use this instead of window.devicePixelRatio. */
  dpr: number;
}
/** @deprecated Prefer GLFrame */
export type PcbGLFrame = GLFrame;

export interface GLPass {
  name: string;
  /** Ascending draw order — lower numbers are drawn first (further back). */
  order: number;
  /** Create programs / buffers. May return a cleanup callback. Called again after a context restore. */
  init(gl: GLContext, ext: GLInstancing, isWebGL2: boolean): void | (() => void);
  /** Draw one frame. Must NOT clear the framebuffer and must NOT resize the canvas. */
  draw(frame: GLFrame): void;
}
/** @deprecated Prefer GLPass */
export type PcbGLPass = GLPass;

/**
 * Back-to-front order of the passes. Single source of truth — this is the order the
 * previous separate canvases were stacked in PcbEditor (DOM order).
 * (The old per-canvas `z-[1]` on pads/footprints silently pushed them above the silkscreen
 *  canvas; the unified stage removes that discrepancy by making the order explicit here.)
 */
export const PCB_GL_PASS_ORDER = {
  grid: 0,
  zones: 100,
  /** Component body fill — behind the copper so it never hides tracks or pads. */
  footprintBodies: 150,
  tracks: 200,
  pads: 300,
  vias: 400,
  footprints: 500,
  silkscreen: 600,
  text: 650,
  overlay: 900,
} as const;

/**
 * Standard "over" compositing for a premultiplied-alpha canvas whose shaders output
 * NON-premultiplied colour: RGB is blended with SRC_ALPHA, alpha accumulates with ONE.
 * (Plain blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA) would also square the alpha channel and
 * make anti-aliased edges / translucent fills darker once several layers share a canvas.)
 */
export function pcbGLEnableStandardBlend(gl: PcbGL): void {
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

export function createInstancingShim(gl: PcbGL): { ext: PcbGLInstancing; isWebGL2: boolean } | null {
  const maybe2 = gl as WebGL2RenderingContext;
  if (typeof maybe2.vertexAttribDivisor === "function" && typeof maybe2.drawArraysInstanced === "function") {
    return {
      isWebGL2: true,
      ext: {
        vertexAttribDivisorANGLE: (i, d) => maybe2.vertexAttribDivisor(i, d),
        drawArraysInstancedANGLE: (m, f, c, p) => maybe2.drawArraysInstanced(m, f, c, p),
        drawElementsInstancedANGLE: (m, c, t, o, p) => maybe2.drawElementsInstanced(m, c, t, o, p),
      },
    };
  }
  const angle = gl.getExtension("ANGLE_instanced_arrays") as PcbGLInstancing | null;
  if (!angle) return null;
  return { isWebGL2: false, ext: angle };
}

/**
 * Put the context back to the defaults of a freshly created context (plus the frame
 * viewport). Called before every pass: it is what guarantees passes are independent.
 */
export function resetPassState(gl: PcbGL, ext: PcbGLInstancing, maxAttribs: number, physW: number, physH: number): void {
  gl.useProgram(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  gl.disable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ZERO);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.CULL_FACE);
  gl.colorMask(true, true, true, true);
  gl.activeTexture(gl.TEXTURE0);

  // Attribute arrays + instancing divisors are per-location global state: a divisor of 1
  // left behind by an instanced pass would silently break the next pass's plain quad.
  for (let i = 0; i < maxAttribs; i++) {
    gl.disableVertexAttribArray(i);
    ext.vertexAttribDivisorANGLE(i, 0);
  }

  gl.viewport(0, 0, physW, physH);
}

export interface PcbGLStageEnv {
  getCssSize(canvas: HTMLCanvasElement): { width: number; height: number };
  getDpr(): number;
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(id: number): void;
  onError(passName: string, phase: "init" | "draw", err: unknown): void;
}

const defaultEnv: PcbGLStageEnv = {
  getCssSize: (c) => ({ width: c.clientWidth, height: c.clientHeight }),
  getDpr: () => (typeof window !== "undefined" && window.devicePixelRatio) || 1,
  requestAnimationFrame: (cb) => requestAnimationFrame(() => cb()),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
  onError: (name, phase, err) => console.error(`[GLStage] pass "${name}" failed during ${phase}:`, err),
};

interface PassRecord {
  pass: PcbGLPass;
  seq: number;
  ready: boolean;
  failed: boolean;
  cleanup: (() => void) | null;
}

const CONTEXT_ATTRS: WebGLContextAttributes = {
  // Transparent outside the board so the editor background shows through, exactly like the
  // former per-layer canvases did.
  alpha: true,
  premultipliedAlpha: true,
  antialias: true,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
};

export class GLStageCore {
  private env: PcbGLStageEnv;
  private canvas: HTMLCanvasElement | null = null;
  private gl: PcbGL | null = null;
  private ext: PcbGLInstancing | null = null;
  private isWebGL2 = false;
  private maxAttribs = 8;
  private passes = new Map<string, PassRecord>();
  private sorted: PassRecord[] = [];
  private seq = 0;
  private dirty = false;
  private rafId = 0;
  private lost = false;
  private unsupported = false;
  private reportedDrawErrors = new Set<string>();
  /** Number of frames rendered — handy for tests / diagnostics. */
  public frameCount = 0;

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    if (this.rafId) {
      this.env.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  };

  private onRestored = () => {
    this.lost = false;
    // The old GPU objects died with the lost context: deleting them would only raise
    // INVALID_OPERATION warnings, so drop the cleanups and simply create everything again.
    for (const rec of this.sorted) rec.cleanup = null;
    this.initAllPasses();
    this.requestRender();
  };

  constructor(env: Partial<PcbGLStageEnv> = {}) {
    this.env = { ...defaultEnv, ...env };
  }

  // ---------------------------------------------------------------- canvas / context

  attach(canvas: HTMLCanvasElement | null): void {
    if (canvas === this.canvas) return;
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onLost as EventListener, false);
      this.canvas.removeEventListener("webglcontextrestored", this.onRestored as EventListener, false);
    }
    this.canvas = canvas;
    if (!canvas) return;

    canvas.addEventListener("webglcontextlost", this.onLost as EventListener, false);
    canvas.addEventListener("webglcontextrestored", this.onRestored as EventListener, false);

    if (this.gl && (this.gl as any).canvas === canvas) {
      // Same canvas re-attached (React StrictMode re-runs ref callbacks): keep the context.
      this.requestRender();
      return;
    }

    const gl = ((canvas.getContext("webgl2", CONTEXT_ATTRS) ||
      canvas.getContext("webgl", CONTEXT_ATTRS) ||
      canvas.getContext("experimental-webgl", CONTEXT_ATTRS)) as PcbGL | null);
    if (!gl) {
      this.unsupported = true;
      console.warn("[GLStage] WebGL is not available — PCB canvas cannot be rendered.");
      return;
    }
    const shim = createInstancingShim(gl);
    if (!shim) {
      this.unsupported = true;
      console.warn("[GLStage] Instanced drawing (WebGL2 / ANGLE_instanced_arrays) is not available.");
      return;
    }
    this.gl = gl;
    this.ext = shim.ext;
    this.isWebGL2 = shim.isWebGL2;
    this.maxAttribs = Math.min(32, Math.max(8, (gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number) || 8));
    this.unsupported = false;
    this.initAllPasses();
    this.requestRender();
  }

  get glContext(): PcbGL | null { return this.gl; }
  get isContextLost(): boolean { return this.lost; }
  get isUnsupported(): boolean { return this.unsupported; }
  get passNames(): string[] { return this.sorted.map((r) => r.pass.name); }

  // ---------------------------------------------------------------- pass registry

  registerPass(pass: PcbGLPass): () => void {
    const existing = this.passes.get(pass.name);
    if (existing) this.disposeRecord(existing);

    const rec: PassRecord = { pass, seq: this.seq++, ready: false, failed: false, cleanup: null };
    this.passes.set(pass.name, rec);
    this.resort();
    if (this.gl && this.ext && !this.lost) this.initRecord(rec);
    this.requestRender();

    return () => {
      if (this.passes.get(pass.name) === rec) {
        this.passes.delete(pass.name);
        this.resort();
      }
      this.disposeRecord(rec);
      this.requestRender();
    };
  }

  private resort() {
    this.sorted = Array.from(this.passes.values()).sort((a, b) => a.pass.order - b.pass.order || a.seq - b.seq);
  }

  private initRecord(rec: PassRecord) {
    if (!this.gl || !this.ext) return;
    try {
      const cleanup = rec.pass.init(this.gl, this.ext, this.isWebGL2);
      rec.cleanup = typeof cleanup === "function" ? cleanup : null;
      rec.ready = true;
      rec.failed = false;
    } catch (err) {
      rec.ready = false;
      rec.failed = true;
      this.env.onError(rec.pass.name, "init", err);
    }
  }

  private disposeRecord(rec: PassRecord) {
    if (rec.cleanup) {
      try { rec.cleanup(); } catch { /* context may already be gone */ }
    }
    rec.cleanup = null;
    rec.ready = false;
  }

  private initAllPasses() {
    for (const rec of this.sorted) {
      this.disposeRecord(rec);
      this.initRecord(rec);
    }
  }

  // ---------------------------------------------------------------- rendering

  /** Mark the frame dirty; it is drawn on the next animation frame unless flushed sooner. */
  requestRender(): void {
    this.dirty = true;
    if (!this.rafId && this.gl && !this.lost) {
      this.rafId = this.env.requestAnimationFrame(() => {
        this.rafId = 0;
        if (this.dirty) this.render();
      });
    }
  }

  /** Draw synchronously if something changed — used at React commit so WebGL never lags the SVG layer. */
  flushIfDirty(): void {
    if (!this.dirty) return;
    if (this.rafId) {
      this.env.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.render();
  }

  /** Canvas was resized (ResizeObserver) — redraw immediately, before the browser paints. */
  notifyResize(): void {
    this.dirty = true;
    this.flushIfDirty();
  }

  render(): void {
    const gl = this.gl, ext = this.ext, canvas = this.canvas;
    if (!gl || !ext || !canvas || this.lost || this.unsupported) return;
    if (typeof gl.isContextLost === "function" && gl.isContextLost()) return;
    this.dirty = false;

    const css = this.env.getCssSize(canvas);
    const cssW = Math.max(1, css.width);
    const cssH = Math.max(1, css.height);
    const dpr = this.env.getDpr();
    const physW = Math.max(1, Math.round(cssW * dpr));
    const physH = Math.max(1, Math.round(cssH * dpr));

    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW;
      canvas.height = physH;
    }

    const frame: PcbGLFrame = {
      gl, ext, isWebGL2: this.isWebGL2,
      physW, physH, cssW, cssH,
      dpr: physW / cssW,
    };

    // The single clear of the frame.
    resetPassState(gl, ext, this.maxAttribs, physW, physH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const rec of this.sorted) {
      if (!rec.ready || rec.failed) continue;
      resetPassState(gl, ext, this.maxAttribs, physW, physH);
      try {
        rec.pass.draw(frame);
      } catch (err) {
        // A broken pass must never take the layers above it down with it.
        if (!this.reportedDrawErrors.has(rec.pass.name)) {
          this.reportedDrawErrors.add(rec.pass.name);
          this.env.onError(rec.pass.name, "draw", err);
        }
      }
    }
    resetPassState(gl, ext, this.maxAttribs, physW, physH);
    this.frameCount++;
  }

  dispose(): void {
    if (this.rafId) this.env.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    for (const rec of this.sorted) this.disposeRecord(rec);
    this.passes.clear();
    this.sorted = [];
    this.attach(null);
    this.gl = null;
    this.ext = null;
  }
}

/** @deprecated Prefer GLStageCore — same class, legacy name. */
export { GLStageCore as PcbGLStageCore };
