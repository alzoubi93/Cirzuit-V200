import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  GLStageCore,
  type GLContext,
  type GLFrame,
  type GLInstancing,
  // legacy aliases still work for pass files that import PcbGL*
  type PcbGL,
  type PcbGLFrame,
  type PcbGLInstancing,
} from "./pcbGLStageCore";

// Shared framework-free engine (`GLStageCore`) — same core as the PCB editor, independent
// canvas/context instance for the schematic.

const SchematicGLStageContext = createContext<GLStageCore | null>(null);

export function useSchematicGLStage(): GLStageCore {
  const core = useContext(SchematicGLStageContext);
  if (!core) throw new Error("Schematic WebGL layers must be rendered inside <SchematicGLStage>");
  return core;
}

export interface SchematicGLStageProps {
  children?: React.ReactNode;
  className?: string;
  /** Cap WebGL backing-store resolution on high-DPR mobile browsers (e.g. Termux/Android). */
  maxDpr?: number;
}

/** The ONE canvas of the schematic editor's WebGL layers. */
export const SchematicGLStage: React.FC<SchematicGLStageProps> = ({ children, className, maxDpr = 2 }) => {
  const coreRef = useRef<GLStageCore | null>(null);
  if (!coreRef.current) {
    coreRef.current = new GLStageCore({
      // Android/Termux browsers can report DPR 2.5–4+. A full-resolution WebGL
      // backing store makes every interactive frame disproportionately expensive.
      getDpr: () => Math.min(
        (typeof window !== "undefined" && window.devicePixelRatio) || 1,
        Math.max(1, maxDpr),
      ),
    });
  }
  const core = coreRef.current;

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const setCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasElRef.current = el;
      if (el) (el as unknown as { __schematicGLStage?: GLStageCore }).__schematicGLStage = core;
      core.attach(el);
    },
    [core]
  );

  // Do not synchronously flush WebGL from every React commit.
  // High-frequency pointer/wheel state changes must be allowed to coalesce into
  // the engine's own requestAnimationFrame render. The old synchronous flush
  // could block the main thread for an entire WebGL frame on mobile/Termux.
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => core.notifyResize());
    ro.observe(el);
    const onWinResize = () => core.notifyResize();
    window.addEventListener("resize", onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
    };
  }, [core]);

  useEffect(() => () => core.dispose(), [core]);

  return (
    <SchematicGLStageContext.Provider value={core}>
      <canvas
        ref={setCanvas}
        data-schematic-webgl-stage="unified"
        className={className ?? "absolute inset-0 w-full h-full pointer-events-none select-none"}
        style={{ display: "block" }}
      />
      {children}
    </SchematicGLStageContext.Provider>
  );
};

export function useSchematicGLPass(
  name: string,
  order: number,
  init: (gl: GLContext, ext: GLInstancing, isWebGL2: boolean) => void | (() => void),
  draw: (frame: GLFrame) => void,
  deps: React.DependencyList
): void {
  const core = useSchematicGLStage();
  const initRef = useRef(init);
  initRef.current = init;
  const drawRef = useRef(draw);

  useLayoutEffect(() => {
    return core.registerPass({
      name,
      order,
      init: (gl, ext, isGL2) => initRef.current(gl, ext, isGL2),
      draw: (frame) => drawRef.current(frame),
    });
  }, [core, name, order]);

  useLayoutEffect(() => {
    drawRef.current = draw;
    core.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, ...deps]);
}

/**
 * Paint order for schematic WebGL passes (lower = further back).
 * Other files may use offsets (e.g. symbols - 1, symbols + 1) — keep gaps.
 */
export const SCHEMATIC_GL_PASS_ORDER = {
  grid: 0,
  wireGlow: 20,
  wires: 25,
  wireSelection: 30,
  junctions: 40,
  symbols: 50,
  /** Selection outlines + pin markers (above symbols, below badges) */
  selection: 60,
  badges: 70,
} as const;
