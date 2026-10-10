import React, { useEffect, useRef } from "react";
import { PcbDoc, PcbPad, PcbZone, PcbLayerId, PcbLayer, getCopperLayerStandardColor, isCopperLayer } from "@/lib/pcb";
import { renderZoneOnCanvas, isZoneVisible, isZoneOnLayer } from "@/lib/zoneGeometry";

interface PcbCanvasLayerProps {
  pcb: PcbDoc;
  pan: { x: number; y: number };
  zoom: number;
  boardRotation: number;
  selectedTrackId: string | null;
  selectedId: string | null;
  selection: any;
  groupSelected: { footprints: string[]; tracks: string[]; vias: string[]; pads: string[] } | null;
  highlightedNetIds: number[];
  trackNetMap: Map<string, number>;
  activeLayer: PcbLayerId;
  dimInactiveLayers: boolean;
  containerWidth: number;
  containerHeight: number;
}

export const PcbCanvasLayer: React.FC<PcbCanvasLayerProps> = ({
  pcb,
  pan,
  zoom,
  boardRotation,
  selectedTrackId,
  selectedId,
  selection,
  groupSelected,
  highlightedNetIds,
  trackNetMap,
  activeLayer,
  dimInactiveLayers,
  containerWidth,
  containerHeight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth || canvas.clientWidth || 800;
    const h = containerHeight || canvas.clientHeight || 600;

    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set up viewport transformation (high DPI + pan + zoom + board rotation)
    ctx.scale(dpr, dpr);
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    if (boardRotation) {
      ctx.rotate((boardRotation * Math.PI) / 180);
    }

    const layerMap = new Map<string, PcbLayer>();
    (pcb.layers || []).forEach((l) => layerMap.set(l.id, l));

    const isLayerVisible = (layerId: string) => {
      const layer = layerMap.get(layerId);
      return layer ? layer.visible : true;
    };

    const getLayerColor = (layerId: string) => {
      const layer = layerMap.get(layerId);
      if (layer?.color) return layer.color;
      return getCopperLayerStandardColor(layerId);
    };

    const getLayerAlpha = (layerId: string) => {
      if (!dimInactiveLayers) return 1.0;
      if (layerId === activeLayer || layerId === "multi_layer" || layerId === "drill") return 1.0;
      return 0.25;
    };

    // 2. RENDER STANDALONE & FOOTPRINT PADS (Canvas accelerated)
    const allPads: { pad: PcbPad; footprintId?: string }[] = [];
    (pcb.pads || []).forEach((p) => allPads.push({ pad: p }));
    (pcb.footprints || []).forEach((fp) => {
      // KiCad-origin footprints are rendered by the unified PCB WebGL footprint pass. Their
      // pads must not be duplicated by the legacy canvas pad layer.
      if (fp.nativeKicadFootprint) return;
      (fp.pads || []).forEach((p) => {
        if (!p) return;
        const pX = typeof p.x === "number" ? p.x : 0;
        const pY = typeof p.y === "number" ? p.y : 0;
        // Calculate absolute position for footprint pads
        const rad = ((fp.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const absX = (typeof fp.x === "number" ? fp.x : 0) + (pX * cos - pY * sin);
        const absY = (typeof fp.y === "number" ? fp.y : 0) + (pX * sin + pY * cos);
        allPads.push({
          pad: { ...p, x: absX, y: absY },
          footprintId: fp.id,
        });
      });
    });

    for (let i = 0; i < allPads.length; i++) {
      const { pad, footprintId } = allPads[i];
      if (!pad || !isLayerVisible(pad.layer)) continue;

      const isPadSel = (selection?.kind === "pad" && selection.id === pad.id) || (footprintId && selectedId === footprintId);
      const isGroupSel = (groupSelected?.pads?.includes(pad.id) || (footprintId && groupSelected?.footprints?.includes(footprintId))) || false;

      ctx.globalAlpha = getLayerAlpha(pad.layer);
      let padColor = getLayerColor(pad.layer);

      if (isGroupSel) padColor = "#f59e0b";
      else if (isPadSel) padColor = "#8b5cf6";

      ctx.fillStyle = padColor;

      const padX = typeof pad.x === "number" ? pad.x : 0;
      const padY = typeof pad.y === "number" ? pad.y : 0;
      const padW = typeof pad.width === "number" ? pad.width : 1.5;
      const padH = typeof pad.height === "number" ? pad.height : 1.5;

      if (pad.shape === "rect") {
        ctx.fillRect(padX - padW / 2, padY - padH / 2, padW, padH);
        if (isPadSel || isGroupSel) {
          ctx.strokeStyle = isGroupSel ? "#f59e0b" : "#3b82f6";
          ctx.lineWidth = 0.2;
          ctx.strokeRect(padX - padW / 2, padY - padH / 2, padW, padH);
        }
      } else {
        ctx.beginPath();
        ctx.arc(padX, padY, padW / 2, 0, Math.PI * 2);
        ctx.fill();
        if (isPadSel || isGroupSel) {
          ctx.strokeStyle = isGroupSel ? "#f59e0b" : "#3b82f6";
          ctx.lineWidth = 0.2;
          ctx.stroke();
        }
      }

      // Drill hole
      if (pad.drill) {
        ctx.fillStyle = "#121214";
        ctx.beginPath();
        ctx.arc(padX, padY, pad.drill / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. RENDER NATIVE BOARD GRAPHICS
    const graphics = pcb.graphics || [];
    for (let i = 0; i < graphics.length; i++) {
      const g = graphics[i];
      if (!g || !isLayerVisible(g.layer)) continue;
      const isSel = selection?.kind === "graphic" && selection.id === g.id;
      const layerObj = pcb.layers?.find(l => l.id === g.layer);
      const color = isSel ? "#3b82f6" : (layerObj?.color || "#ffd166");
      const width = g.stroke?.width || g.width || 0.2;

      ctx.globalAlpha = getLayerAlpha(g.layer);
      ctx.strokeStyle = color;
      ctx.fillStyle = g.fill === "solid" ? color : "none";
      ctx.lineWidth = width;

      if (g.kind === "line" && g.start && g.end) {
        ctx.beginPath();
        ctx.moveTo(g.start.x ?? 0, g.start.y ?? 0);
        ctx.lineTo(g.end.x ?? 0, g.end.y ?? 0);
        ctx.stroke();
      } else if (g.kind === "arc" && g.start && g.end) {
        ctx.beginPath();
        ctx.moveTo(g.start.x ?? 0, g.start.y ?? 0);
        if (g.mid) {
          ctx.quadraticCurveTo(g.mid.x ?? 0, g.mid.y ?? 0, g.end.x ?? 0, g.end.y ?? 0);
        } else {
          ctx.lineTo(g.end.x ?? 0, g.end.y ?? 0);
        }
        ctx.stroke();
      } else if (g.kind === "circle" && g.center) {
        const endX = g.end?.x ?? g.center.x ?? 0;
        const endY = g.end?.y ?? g.center.y ?? 0;
        const centerX = g.center.x ?? 0;
        const centerY = g.center.y ?? 0;
        const r = g.radius || Math.hypot(endX - centerX, endY - centerY);
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        if (g.fill === "solid") ctx.fill();
        ctx.stroke();
      } else if (g.kind === "rect" && g.start && g.end) {
        const startX = g.start.x ?? 0, startY = g.start.y ?? 0;
        const endX = g.end.x ?? 0, endY = g.end.y ?? 0;
        const minX = Math.min(startX, endX);
        const minY = Math.min(startY, endY);
        const w = Math.abs(endX - startX);
        const h = Math.abs(endY - startY);
        if (g.fill === "solid") ctx.fillRect(minX, minY, w, h);
        ctx.strokeRect(minX, minY, w, h);
      } else if ((g.kind === "poly" || g.kind === "curve") && g.points && g.points.length > 0 && g.points[0]) {
        ctx.beginPath();
        ctx.moveTo(g.points[0].x ?? 0, g.points[0].y ?? 0);
        for (let ptI = 1; ptI < g.points.length; ptI++) {
          if (g.points[ptI]) {
            ctx.lineTo(g.points[ptI].x ?? 0, g.points[ptI].y ?? 0);
          }
        }
        if (g.fill === "solid") ctx.fill();
        ctx.stroke();
      } else if (g.kind === "text" && g.position) {
        ctx.fillStyle = color;
        ctx.font = `${g.bold ? "bold " : ""}${g.size?.y || 1.2}px monospace`;
        ctx.fillText(g.text || "", g.position.x ?? 0, g.position.y ?? 0);
      }
    }

    // 5. RENDER DIMENSIONS
    const dimensions = pcb.dimensions || [];
    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];
      if (!dim || !isLayerVisible(dim.layer)) continue;
      if (!dim.points || !Array.isArray(dim.points) || dim.points.length < 2 || !dim.points[0] || !dim.points[1]) continue;
      const p1 = dim.points[0];
      const p2 = dim.points[1];
      const layerObj = pcb.layers?.find(l => l.id === dim.layer);
      const color = layerObj?.color || "#06b6d4";

      ctx.globalAlpha = getLayerAlpha(dim.layer);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 0.15;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 0.25, 0, Math.PI * 2);
      ctx.arc(p2.x, p2.y, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. RENDER TARGETS
    const targets = pcb.targets || [];
    for (let i = 0; i < targets.length; i++) {
      const tg = targets[i];
      if (!isLayerVisible(tg.layer)) continue;
      const layerObj = pcb.layers?.find(l => l.id === tg.layer);
      const color = layerObj?.color || "#e11d48";
      const s = tg.size || 3;
      const r = s / 2;

      ctx.globalAlpha = getLayerAlpha(tg.layer);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.2;

      ctx.beginPath();
      ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(tg.x, tg.y, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(tg.x - r * 1.3, tg.y);
      ctx.lineTo(tg.x + r * 1.3, tg.y);
      ctx.moveTo(tg.x, tg.y - r * 1.3);
      ctx.lineTo(tg.x, tg.y + r * 1.3);
      ctx.stroke();
    }

    ctx.restore();
  }, [
    pcb,
    pan,
    zoom,
    boardRotation,
    selectedTrackId,
    selectedId,
    selection,
    groupSelected,
    highlightedNetIds,
    trackNetMap,
    activeLayer,
    dimInactiveLayers,
    containerWidth,
    containerHeight,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
    />
  );
};

