import React, { useEffect, useRef } from "react";
import type { KicadFootprintModel } from "@/lib/kicad/footprint";
import { KicadFootprintRuntime } from "@/lib/kicad/footprint/kicadFootprintRuntime";
import { buildKicadFootprintItems } from "./KicadFootprintGeometry";
import { kicadGeometryEngine, type KicadGeometryItem } from "@/lib/kicad/footprint/geometry";

export interface WebGLBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Props {
  footprint: KicadFootprintModel | KicadFootprintRuntime;
  bounds?: WebGLBounds;
  layerColors?: Record<string, string>;
  layerVisibility?: Record<string, boolean>;
  activeLayer?: string;
  dimInactiveLayers?: boolean;
  reference?: string;
  value?: string;
  className?: string;
  style?: React.CSSProperties;
}

import {
  FILL_VS_SOURCE,
  FILL_FS_SOURCE,
  STROKE_VS_SOURCE,
  STROKE_FS_SOURCE,
  buildWebGLGeometryForFootprint,
} from "./KicadFootprintRenderShared";

// Re-exported for existing callers.
export { buildWebGLGeometryForFootprint };

export function KicadFootprintWebGLCanvas({
  footprint,
  bounds,
  layerColors = {},
  layerVisibility = {},
  activeLayer = "top_copper",
  dimInactiveLayers = false,
  reference = "REF**",
  value = footprint?.name || "",
  className = "w-full h-full",
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !footprint) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) return;

    const createShader = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const strokeVert = createShader(gl.VERTEX_SHADER, STROKE_VS_SOURCE);
    const strokeFrag = createShader(gl.FRAGMENT_SHADER, STROKE_FS_SOURCE);
    const strokeProgram = gl.createProgram()!;
    gl.attachShader(strokeProgram, strokeVert);
    gl.attachShader(strokeProgram, strokeFrag);
    gl.linkProgram(strokeProgram);

    const fillVert = createShader(gl.VERTEX_SHADER, FILL_VS_SOURCE);
    const fillFrag = createShader(gl.FRAGMENT_SHADER, FILL_FS_SOURCE);
    const fillProgram = gl.createProgram()!;
    gl.attachShader(fillProgram, fillVert);
    gl.attachShader(fillProgram, fillFrag);
    gl.linkProgram(fillProgram);

    // Same item list (and same draw order: Fab < CrtYd < Cu < Mask < Paste < SilkS) the PCB editor uses.
    const items: KicadGeometryItem[] = buildKicadFootprintItems(footprint);

    const { bodyFillVertices, padFillVertices, segments } = buildWebGLGeometryForFootprint(
      items,
      reference,
      value,
      activeLayer,
      layerColors,
      layerVisibility,
      dimInactiveLayers
    );

    // Standard "over" compositing for a premultiplied canvas (same as the PCB editor's unified stage).
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || 16;
    const disableAllAttribs = () => {
      for (let i = 0; i < maxAttribs; i++) {
        gl.disableVertexAttribArray(i);
      }
    };

    // =========================================================================
    // UPLOAD GEOMETRY ONCE (Body Fill + Pads, then Silkscreen/Fab/Courtyard/Text)
    // =========================================================================
    const allFillVertices = [...bodyFillVertices, ...padFillVertices];
    const fillFloatsPerVertex = 6;
    let fillBuffer: WebGLBuffer | null = null;

    if (allFillVertices.length > 0 && gl.getProgramParameter(fillProgram, gl.LINK_STATUS)) {
      const fillData = new Float32Array(allFillVertices.length * fillFloatsPerVertex);
      let fOffset = 0;
      for (const v of allFillVertices) {
        fillData[fOffset++] = v.x;
        fillData[fOffset++] = v.y;
        fillData[fOffset++] = v.r;
        fillData[fOffset++] = v.g;
        fillData[fOffset++] = v.b;
        fillData[fOffset++] = v.a;
      }
      fillBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, fillBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, fillData, gl.STATIC_DRAW);
    }

    const strokeFloatsPerVertex = 14;
    let strokeBuffer: WebGLBuffer | null = null;

    if (segments.length > 0 && gl.getProgramParameter(strokeProgram, gl.LINK_STATUS)) {
      const unitQuad = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];

      const vertexData = new Float32Array(segments.length * 6 * strokeFloatsPerVertex);
      let offset = 0;
      for (const seg of segments) {
        for (const q of unitQuad) {
          vertexData[offset++] = q[0];
          vertexData[offset++] = q[1];
          vertexData[offset++] = seg.p0x;
          vertexData[offset++] = seg.p0y;
          vertexData[offset++] = seg.p1x;
          vertexData[offset++] = seg.p1y;
          vertexData[offset++] = seg.strokeWidth;
          vertexData[offset++] = seg.dimAlpha;
          vertexData[offset++] = seg.isDashed;
          vertexData[offset++] = seg.startLen;
          vertexData[offset++] = seg.r;
          vertexData[offset++] = seg.g;
          vertexData[offset++] = seg.b;
          vertexData[offset++] = seg.a;
        }
      }

      strokeBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, strokeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
    }

    const computedBounds = kicadGeometryEngine.bounds(items);

    // =========================================================================
    // DRAW PASS — re-run on every resize so the canvas stays pixel-crisp and
    // correctly framed at any container size, matching the resolution
    // independence the previous SVG renderer had for free.
    // =========================================================================
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const widthPx = Math.max(1, Math.floor(rect.width * dpr));
      const heightPx = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== widthPx) canvas.width = widthPx;
      if (canvas.height !== heightPx) canvas.height = heightPx;

      gl.viewport(0, 0, widthPx, heightPx);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Compute aspect-ratio corrected isometric bounds
      const canvasAspect = widthPx / heightPx;
      let b = bounds;
      if (!b) {
        const w = Math.max(1.8, computedBounds.maxX - computedBounds.minX);
        const h = Math.max(1.8, computedBounds.maxY - computedBounds.minY);
        const pad = Math.max(0.8, Math.max(w, h) * 0.12);
        b = {
          minX: computedBounds.minX - pad,
          minY: computedBounds.minY - pad,
          maxX: computedBounds.maxX + pad,
          maxY: computedBounds.maxY + pad,
        };
      }

      const bWidthRaw = Math.max(b.maxX - b.minX, 0.001);
      const bHeightRaw = Math.max(b.maxY - b.minY, 0.001);
      const bCenterX = (b.minX + b.maxX) / 2;
      const bCenterY = (b.minY + b.maxY) / 2;
      const boundsAspect = bWidthRaw / bHeightRaw;

      let bWidth = bWidthRaw;
      let bHeight = bHeightRaw;
      let minX = b.minX;
      let minY = b.minY;

      if (canvasAspect > boundsAspect) {
        bWidth = bHeightRaw * canvasAspect;
        minX = bCenterX - bWidth / 2;
      } else {
        bHeight = bWidthRaw / canvasAspect;
        minY = bCenterY - bHeight / 2;
      }

      // -----------------------------------------------------------------------
      // 1. DRAW BODY FILL & COPPER PADS (TRIANGLES)
      // -----------------------------------------------------------------------
      if (fillBuffer && gl.getProgramParameter(fillProgram, gl.LINK_STATUS)) {
        gl.useProgram(fillProgram);
        disableAllAttribs();
        gl.bindBuffer(gl.ARRAY_BUFFER, fillBuffer);

        const aPosLoc = gl.getAttribLocation(fillProgram, "a_pos");
        const aColorLoc = gl.getAttribLocation(fillProgram, "a_color");
        const uBoundsLocF = gl.getUniformLocation(fillProgram, "u_bounds");
        const uResLocF = gl.getUniformLocation(fillProgram, "u_canvas_res");

        if (aPosLoc >= 0) {
          gl.enableVertexAttribArray(aPosLoc);
          gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, fillFloatsPerVertex * 4, 0);
        }
        if (aColorLoc >= 0) {
          gl.enableVertexAttribArray(aColorLoc);
          gl.vertexAttribPointer(aColorLoc, 4, gl.FLOAT, false, fillFloatsPerVertex * 4, 2 * 4);
        }

        gl.uniform4f(uBoundsLocF, minX, minY, bWidth, bHeight);
        gl.uniform2f(uResLocF, widthPx, heightPx);

        gl.drawArrays(gl.TRIANGLES, 0, allFillVertices.length);
        disableAllAttribs();
      }

      // -----------------------------------------------------------------------
      // 2. DRAW SILKSCREEN, FAB, COURTYARD & HERSHEY TEXT STROKES (QUADS)
      // -----------------------------------------------------------------------
      if (strokeBuffer && gl.getProgramParameter(strokeProgram, gl.LINK_STATUS)) {
        gl.useProgram(strokeProgram);
        disableAllAttribs();
        gl.bindBuffer(gl.ARRAY_BUFFER, strokeBuffer);

        const stride = strokeFloatsPerVertex * 4;
        const setupAttr = (name: string, size: number, attrOffset: number) => {
          const loc = gl.getAttribLocation(strokeProgram, name);
          if (loc >= 0) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, attrOffset * 4);
          }
        };

        setupAttr("a_quad_pos", 2, 0);
        setupAttr("a_seg_p0", 2, 2);
        setupAttr("a_seg_p1", 2, 4);
        setupAttr("a_seg_props", 4, 6);
        setupAttr("a_seg_color", 4, 10);

        const uBoundsLoc = gl.getUniformLocation(strokeProgram, "u_bounds");
        const uResLoc = gl.getUniformLocation(strokeProgram, "u_canvas_res");
        const uDashSizeLoc = gl.getUniformLocation(strokeProgram, "u_dashSize");
        const uDashRatioLoc = gl.getUniformLocation(strokeProgram, "u_dashRatio");

        gl.uniform4f(uBoundsLoc, minX, minY, bWidth, bHeight);
        gl.uniform2f(uResLoc, widthPx, heightPx);
        if (uDashSizeLoc) gl.uniform1f(uDashSizeLoc, 0.5);
        if (uDashRatioLoc) gl.uniform1f(uDashRatioLoc, 0.6);

        gl.drawArrays(gl.TRIANGLES, 0, segments.length * 6);
        disableAllAttribs();
      }
    };

    draw();

    // Re-draw whenever the container is resized (e.g. modal open/layout
    // changes) so the WebGL canvas keeps the same crispness and correct
    // framing that the SVG viewBox used to provide automatically.
    let rafId = 0;
    const scheduleDraw = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(draw);
    };
    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", scheduleDraw);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleDraw);
      if (fillBuffer) gl.deleteBuffer(fillBuffer);
      if (strokeBuffer) gl.deleteBuffer(strokeBuffer);
      gl.deleteProgram(fillProgram);
      gl.deleteProgram(strokeProgram);
      gl.deleteShader(fillVert);
      gl.deleteShader(fillFrag);
      gl.deleteShader(strokeVert);
      gl.deleteShader(strokeFrag);
    };
  }, [footprint, bounds, layerColors, layerVisibility, activeLayer, dimInactiveLayers, reference, value]);

  return <canvas ref={canvasRef} className={className} style={style} />;
}
