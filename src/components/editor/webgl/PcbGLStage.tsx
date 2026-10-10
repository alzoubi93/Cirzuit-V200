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
  type PcbGL,
  type PcbGLFrame,
  type PcbGLInstancing,
} from "./pcbGLStageCore";

export * from "./pcbGLStageCore";

const PcbGLStageContext = createContext<GLStageCore | null>(null);

export function usePcbGLStage(): GLStageCore {
  const core = useContext(PcbGLStageContext);
  if (!core) throw new Error("PCB WebGL layers must be rendered inside <PcbGLStage>");
  return core;
}

export interface PcbGLStageProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * The ONE canvas of the PCB editor. Render every PCB WebGL layer as a child; the layers
 * render nothing themselves (they only register a draw pass with the stage).
 *
 * The canvas fills its positioned parent (`absolute inset-0`). Its drawing buffer is sized
 * from the canvas' own CSS box, so the buffer always maps 1:1 onto what is on screen —
 * whatever offset the parent has (e.g. when the rulers are visible).
 */
export const PcbGLStage: React.FC<PcbGLStageProps> = ({ children, className }) => {
  const coreRef = useRef<GLStageCore | null>(null);
  if (!coreRef.current) coreRef.current = new GLStageCore();
  const core = coreRef.current;

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const setCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasElRef.current = el;
      // Diagnostics handle (DevTools / tests): document.querySelector("[data-pcb-webgl-stage]").__pcbGLStage
      if (el) (el as unknown as { __pcbGLStage?: GLStageCore }).__pcbGLStage = core;
      core.attach(el);
    },
    [core]
  );

  // Children's layout effects (which mark the frame dirty) run before this one, so the
  // frame is drawn synchronously in the same commit as the SVG interaction layer.
  useLayoutEffect(() => {
    core.flushIfDirty();
  });

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => core.notifyResize());
    ro.observe(el);
    // devicePixelRatio changes (browser zoom / moving between monitors)
    const onWinResize = () => core.notifyResize();
    window.addEventListener("resize", onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
    };
  }, [core]);

  return (
    <PcbGLStageContext.Provider value={core}>
      <canvas
        ref={setCanvas}
        data-pcb-webgl-stage="unified"
        className={className ?? "absolute inset-0 w-full h-full pointer-events-none select-none"}
        style={{ display: "block" }}
      />
      {children}
    </PcbGLStageContext.Provider>
  );
};

/**
 * Register a layer as a pass of the unified stage.
 *
 * @param name   unique pass name
 * @param order  see PCB_GL_PASS_ORDER
 * @param init   create programs/buffers (stable for the lifetime of the pass; re-run after a
 *               WebGL context restore). May return a cleanup function.
 * @param draw   draw one frame. Re-registered whenever `deps` change, exactly like the
 *               `useEffect` render passes it replaces.
 * @param deps   values `draw` depends on. When they change the stage redraws the frame.
 */
export function usePcbGLPass(
  name: string,
  order: number,
  init: (gl: PcbGL, ext: PcbGLInstancing, isWebGL2: boolean) => void | (() => void),
  draw: (frame: PcbGLFrame) => void,
  deps: React.DependencyList
): void {
  const core = usePcbGLStage();
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
