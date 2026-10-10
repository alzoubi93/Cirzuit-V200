/**
 * Preferred import path for the shared WebGL stage engine.
 *
 * Implementation lives in `pcbGLStageCore.ts` (historical filename — still the source of truth).
 * Both PCB (`PcbGLStage`) and Schematic (`SchematicGLStage`) construct a `GLStageCore` instance.
 */
export {
  GLStageCore,
  type GLContext,
  type GLFrame,
  type GLInstancing,
  type GLPass,
  // Legacy aliases
  PcbGLStageCore,
  type PcbGL,
  type PcbGLFrame,
  type PcbGLInstancing,
  type PcbGLPass,
  pcbGLEnableStandardBlend,
  createInstancingShim,
  resetPassState,
  PCB_GL_PASS_ORDER,
} from "./pcbGLStageCore";
