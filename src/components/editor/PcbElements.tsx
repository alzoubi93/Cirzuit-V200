import React from "react";
import { PcbTrack, PcbFootprint, PcbVia, PcbPad, PcbZone, PcbMeasure, PcbText, PcbLayer, PcbGraphic, PcbDimension, PcbTarget, checkIfPolarizedCapacitor, isCopperLayer, determineViaType, getViaClassificationLabel, getCopperLayerStandardColor, normalizeLayerId } from "@/lib/pcb";
import { getTrackSvgPath } from "@/lib/arcGeometry";
import { polygonToSvgPath, getZoneBoundingBox } from "@/lib/zoneGeometry";
import { footprintBBox } from "@/lib/pcbSync";
import { toDisplay, fmt } from "@/lib/pcb";
import { getElectrolyticSize } from "./ThreeDRealModels";

export const MemoizedPcbTrack = React.memo(({ 
  track, layer, sel, isHi, isGroupSel,
  onPointerDown, onDoubleClick
}: {
  track: PcbTrack, layer: PcbLayer | undefined, sel: boolean, isHi: boolean, isGroupSel: boolean,
  onPointerDown: (e: React.PointerEvent, tr: PcbTrack) => void,
  onDoubleClick: (e: React.MouseEvent, tr: PcbTrack) => void
}) => {
  if (!layer?.visible) return null;
  const d = getTrackSvgPath(track);
  if (!d) return null;

  return (
    <g>
      {/* Interactive transparent hit-test overlay for instant selection & dragging */}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={Math.max((track.width || 0.4) + 1.6, 2.0)}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        onPointerDown={(e) => onPointerDown(e, track)}
        onDoubleClick={(e) => onDoubleClick(e, track)}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
      />
    </g>
  );
});

export const MemoizedPcbVia = React.memo(({
  via, layer, sel, isGroupSel,
  onPointerDown, onDoubleClick
}: {
  via: PcbVia, layer: PcbLayer | undefined, sel: boolean, isGroupSel: boolean,
  onPointerDown: (e: React.PointerEvent, v: PcbVia) => void,
  onDoubleClick: (e: React.MouseEvent, v: PcbVia) => void
}) => {
  const isSquare = via.shape === "square";
  const radius = (via.diameter || 0.8) / 2;
  const label = getViaClassificationLabel(via);

  return (
    <g onPointerDown={(e) => onPointerDown(e, via)} onDoubleClick={(e) => onDoubleClick(e, via)} data-via-id={via.id}>
      <title>{label}</title>
      {isSquare ? (
        <rect
          x={via.x - radius - 0.6}
          y={via.y - radius - 0.6}
          width={via.diameter + 1.2}
          height={via.diameter + 1.2}
          fill="transparent"
          style={{ cursor: "pointer", pointerEvents: "all" }}
        />
      ) : (
        <circle
          cx={via.x}
          cy={via.y}
          r={radius + 0.6}
          fill="transparent"
          style={{ cursor: "pointer", pointerEvents: "all" }}
        />
      )}
    </g>
  );
});

export const MemoizedPcbZone = React.memo(({
  zone, layer, sel, isGroupSel, isZoneHi,
  onPointerDown, onDoubleClick
}: {
  zone: PcbZone,
  layer: PcbLayer | undefined,
  sel: boolean,
  isGroupSel: boolean,
  isZoneHi?: boolean,
  onPointerDown: (e: React.PointerEvent, z: PcbZone) => void,
  onDoubleClick: (e: React.MouseEvent, z: PcbZone) => void,
}) => {
  if (layer && !layer.visible) return null;

  const baseColor = layer?.color || getCopperLayerStandardColor(zone.layer);
  const strokeColor = isGroupSel ? "#f59e0b" : sel ? "#3b82f6" : isZoneHi ? "#60a5fa" : (zone.isKeepout ? "#ef4444" : baseColor);
  const boundaryPath = polygonToSvgPath(zone.boundary);

  const isKeepout = zone.isKeepout;
  const fillMode = zone.fill?.fillMode || "solid";
  const hatchStyle = zone.fill?.hatchStyle;

  // Title label for hover tooltip
  const title = isKeepout
    ? `Keepout Zone [${zone.layer}]`
    : `Copper Zone: ${zone.name || (zone.netName ? `Net ${zone.netName}` : `Net ${zone.netId ?? "None"}`)} (${zone.layer})`;

  return (
    <g
      onPointerDown={(e) => onPointerDown(e, zone)}
      onDoubleClick={(e) => onDoubleClick(e, zone)}
      data-zone-id={zone.id}
      style={{ cursor: "pointer" }}
    >
      <title>{title}</title>

      {/* 1. Filled Copper Islands (SVG polygons with fill-rule="evenodd" for thermal/clearance cutouts) */}
      {!isKeepout && zone.filledPolygons && zone.filledPolygons.length > 0 && (
        <g opacity={sel ? 0.75 : 0.65}>
          {zone.filledPolygons.map((fp, idx) => {
            const fpPath = polygonToSvgPath(fp);
            if (!fpPath) return null;
            return (
              <path
                key={`fp-${idx}`}
                d={fpPath}
                fill={isGroupSel ? "#f59e0b" : sel ? "#3b82f6" : baseColor}
                fillRule="evenodd"
                stroke="none"
              />
            );
          })}
        </g>
      )}

      {/* 2. Fallback / Hatch Fill if no filledPolygons but solid or hatched fill is defined */}
      {!isKeepout && (!zone.filledPolygons || zone.filledPolygons.length === 0) && boundaryPath && (
        <path
          d={boundaryPath}
          fill={isGroupSel ? "rgba(245, 158, 11, 0.3)" : sel ? "rgba(59, 130, 246, 0.35)" : baseColor}
          fillOpacity={fillMode === "none" ? 0 : 0.4}
          fillRule="evenodd"
          stroke="none"
        />
      )}

      {/* 3. Keepout Zone Indicator (Diagonal stripe hatching or semi-transparent red) */}
      {isKeepout && boundaryPath && (
        <path
          d={boundaryPath}
          fill="rgba(239, 68, 68, 0.15)"
          fillRule="evenodd"
          stroke="none"
        />
      )}

      {/* 4. Zone Boundary Outline (Dashed when unselected, solid glowing when selected) */}
      {boundaryPath && (
        <>
          {/* Thick invisible click grabber for the boundary line */}
          <path
            d={boundaryPath}
            fill="none"
            stroke="transparent"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {/* Visual Boundary Line */}
          <path
            d={boundaryPath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={sel ? 0.5 : 0.25}
            strokeDasharray={isKeepout ? "1.5, 1.0" : sel ? undefined : "2.0, 1.2"}
            strokeLinejoin="round"
            opacity={sel ? 1.0 : 0.85}
          />
        </>
      )}

      {/* 5. Selected / Highlighted boundary glow */}
      {(sel || isGroupSel) && boundaryPath && (
        <path
          d={boundaryPath}
          fill="none"
          stroke={isGroupSel ? "#f59e0b" : "#60a5fa"}
          strokeWidth={0.8}
          strokeLinejoin="round"
          opacity={0.5}
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
  );
});

export const MemoizedPcbPad = React.memo(({
  pad, layer, sel, isGroupSel, isPadHi, isPadSel, isDrillVisible, drillColor,
  onPointerDown, onPadPointerDown, onDoubleClick, onPadDoubleClick, showLabel = true
}: {
  pad: any, layer?: PcbLayer, sel?: boolean, isGroupSel?: boolean, isPadHi?: boolean, isPadSel?: boolean, isDrillVisible?: boolean, drillColor?: string,
  onPointerDown?: (e: React.PointerEvent, p: any) => void,
  onPadPointerDown?: (e: React.PointerEvent, p: any) => void,
  onDoubleClick?: (e: React.MouseEvent, p: any) => void,
  onPadDoubleClick?: (e: React.MouseEvent, p: any) => void,
  showLabel?: boolean
}) => {
  if (layer && !layer.visible) return null;
  const padColor = isGroupSel ? "#f59e0b" : (sel || isPadSel) ? "#8b5cf6" : isPadHi ? "#f97316" : (layer?.color || (normalizeLayerId(pad.layer) === "bottom_copper" ? "#3b82f6" : "#ef4444"));
  
  const handlePointerDown = (e: React.PointerEvent) => {
    if (onPointerDown) onPointerDown(e, pad);
    if (onPadPointerDown) onPadPointerDown(e, pad);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (onDoubleClick) onDoubleClick(e, pad);
    if (onPadDoubleClick) onPadDoubleClick(e, pad);
  };

  const label = showLabel ? (pad.number || pad.name || (typeof pad.pinIndex === 'number' ? String(pad.pinIndex + 1) : "")) : "";

  return (
    <g onPointerDown={handlePointerDown} onDoubleClick={handleDoubleClick}>
      {pad.shape === "rect" ? (
        <rect x={pad.x - (pad.width + 1.2) / 2} y={pad.y - (pad.height + 1.2) / 2} width={pad.width + 1.2} height={pad.height + 1.2} fill="transparent" style={{ cursor: "pointer" }} />
      ) : (
        <circle cx={pad.x} cy={pad.y} r={(pad.width + 1.2) / 2} fill="transparent" style={{ cursor: "pointer" }} />
      )}
      <g transform={`rotate(${pad.rotation || 0} ${pad.x} ${pad.y})`}>
        {pad.nativeShape === "oval" ? (
          <ellipse cx={pad.x} cy={pad.y} rx={Number.isFinite(pad.width) ? pad.width / 2 : 0} ry={Number.isFinite(pad.height) ? pad.height / 2 : 0} fill={padColor} stroke={isGroupSel ? "#f59e0b" : (sel || isPadSel) ? "#3b82f6" : "none"} strokeWidth={isGroupSel ? 0.25 : 0.1} />
        ) : pad.nativeShape === "roundrect" ? (
          <rect x={pad.x-pad.width/2} y={pad.y-pad.height/2} width={pad.width} height={pad.height} rx={Math.min(pad.width,pad.height)*(pad.roundrectRatio || 0.25)} fill={padColor} stroke={isGroupSel ? "#f59e0b" : (sel || isPadSel) ? "#3b82f6" : "none"} strokeWidth={isGroupSel ? 0.25 : 0.1} />
        ) : pad.shape === "rect" ? (
          <rect x={pad.x - pad.width / 2} y={pad.y - pad.height / 2} width={pad.width} height={pad.height} fill={padColor} stroke={isGroupSel ? "#f59e0b" : (sel || isPadSel) ? "#3b82f6" : "none"} strokeWidth={isGroupSel ? 0.25 : 0.1} />
        ) : (
          <circle cx={pad.x} cy={pad.y} r={Math.min(pad.width,pad.height) / 2} fill={padColor} stroke={isGroupSel ? "#f59e0b" : (sel || isPadSel) ? "#3b82f6" : "none"} strokeWidth={isGroupSel ? 0.25 : 0.1} />
        )}
        {pad.drill && isDrillVisible !== false && (
          <circle cx={pad.x} cy={pad.y} r={pad.drill / 2} fill={drillColor || "#000000"} />
        )}
        {label && (
          <text
            x={pad.x}
            y={pad.y}
            fontSize={Math.max(pad.width, pad.height) * 0.6}
            fill="#ffffff"
            textAnchor="middle"
            dominantBaseline="central"
            fontWeight={700}
            fontFamily="monospace"
            style={{ pointerEvents: "none" }}
          >
            {label}
          </text>
        )}
      </g>
    </g>
  );
});

export const MemoizedPcbMeasure = React.memo(({
  measure, sel, unit,
  onPointerDown, onDoubleClick
}: {
  measure: PcbMeasure, sel: boolean, unit: import("@/lib/pcb").PcbUnit,
  onPointerDown: (e: React.PointerEvent, m: PcbMeasure) => void,
  onDoubleClick: (e: React.MouseEvent, m: PcbMeasure) => void
}) => {
  const dx = measure.b.x - measure.a.x, dy = measure.b.y - measure.a.y;
  const dist = Math.hypot(dx, dy);
  return (
    <g
      onPointerDown={(e) => onPointerDown(e, measure)} 
      onDoubleClick={(e) => onDoubleClick(e, measure)}
      style={{ cursor: "pointer" }}
    >
      <line x1={measure.a.x} y1={measure.a.y} x2={measure.b.x} y2={measure.b.y} stroke={sel ? "#3b82f6" : "#ea580c"} strokeWidth={0.16} strokeDasharray="0.6 0.4" />
      <g>
        <line x1={measure.a.x - 1.0} y1={measure.a.y} x2={measure.a.x + 1.0} y2={measure.a.y} stroke={sel ? "#3b82f6" : "#ea580c"} strokeWidth={0.15} />
        <line x1={measure.a.x} y1={measure.a.y - 1.0} x2={measure.a.x} y2={measure.a.y + 1.0} stroke={sel ? "#3b82f6" : "#ea580c"} strokeWidth={0.15} />
        <circle cx={measure.a.x} cy={measure.a.y} r={0.25} fill={sel ? "#3b82f6" : "#ea580c"} />
      </g>
      <g>
        <line x1={measure.b.x - 1.0} y1={measure.b.y} x2={measure.b.x + 1.0} y2={measure.b.y} stroke={sel ? "#3b82f6" : "#ea580c"} strokeWidth={0.15} />
        <line x1={measure.b.x} y1={measure.b.y - 1.0} x2={measure.b.x} y2={measure.b.y + 1.0} stroke={sel ? "#3b82f6" : "#ea580c"} strokeWidth={0.15} />
        <circle cx={measure.b.x} cy={measure.b.y} r={0.25} fill={sel ? "#3b82f6" : "#ea580c"} />
      </g>
      <g transform={`translate(${(measure.a.x + measure.b.x) / 2}, ${(measure.a.y + measure.b.y) / 2 - 1.5})`} textAnchor="middle">
        <text x={0} y={0} fontSize={1.6} fill={sel ? "#3b82f6" : "#ea580c"} fontWeight="bold">
          {fmt(dist, unit)}
        </text>
      </g>
    </g>
  );
});

export const MemoizedPcbText = React.memo(({
  text, layer, sel, isGroupSel, isMoveTool,
  onPointerDown, onDoubleClick
}: {
  text: PcbText, layer: PcbLayer | undefined, sel: boolean, isGroupSel: boolean, isMoveTool: boolean,
  onPointerDown: (e: React.PointerEvent, t: PcbText) => void,
  onDoubleClick: (e: React.MouseEvent, t: PcbText) => void
}) => {
  if (layer && !layer.visible) return null;
  const col = isGroupSel ? "#f59e0b" : sel ? "#3b82f6" : (layer?.color || (text.layer === "silkscreen" ? "#fde047" : text.layer === "bottom_silkscreen" ? "#fde047" : "#22c55e"));
  return (
    <g
      transform={`translate(${text.x},${text.y}) rotate(${text.rotation})`}
      onPointerDown={(e) => onPointerDown(e, text)}
      onDoubleClick={(e) => onDoubleClick(e, text)}
      style={{ cursor: isMoveTool ? "move" : "default" }}
    >
      <rect
        x={-text.text.length * text.size * 0.3 - 0.2}
        y={-text.size * 0.5 - 0.2}
        width={text.text.length * text.size * 0.6 + 0.4}
        height={text.size + 0.4}
        fill="transparent"
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={text.size}
        fill={col}
        fontWeight="bold"
        fontFamily="monospace"
        style={{ pointerEvents: "none" }}
      >
        {text.text}
      </text>
    </g>
  );
});


export const MemoizedPcbGraphic = React.memo(({
  graphic, layer, sel, isGroupSel, onPointerDown, onDoubleClick
}: {
  graphic: PcbGraphic,
  layer: PcbLayer | undefined,
  sel: boolean,
  isGroupSel: boolean,
  onPointerDown: (e: React.PointerEvent, g: PcbGraphic) => void,
  onDoubleClick: (e: React.MouseEvent, g: PcbGraphic) => void,
}) => {
  if (layer && !layer.visible) return null;

  const color = isGroupSel ? "#f59e0b" : sel ? "#3b82f6" : (layer?.color || "#ffd166");
  const strokeW = graphic.stroke?.width || graphic.width || 0.2;
  const strokeDash = graphic.stroke?.type === "dash" ? "1 0.5" : graphic.stroke?.type === "dot" ? "0.2 0.3" : undefined;
  const fillCol = graphic.fill === "solid" ? color : "none";

  const renderShape = () => {
    switch (graphic.kind) {
      case "line":
        return <line x1={graphic.start.x} y1={graphic.start.y} x2={graphic.end.x} y2={graphic.end.y} stroke={color} strokeWidth={strokeW} strokeDasharray={strokeDash} strokeLinecap="round" />;
      case "arc": {
        const d = graphic.mid
          ? `M ${graphic.start.x} ${graphic.start.y} Q ${graphic.mid.x} ${graphic.mid.y} ${graphic.end.x} ${graphic.end.y}`
          : `M ${graphic.start.x} ${graphic.start.y} L ${graphic.end.x} ${graphic.end.y}`;
        return <path d={d} stroke={color} strokeWidth={strokeW} strokeDasharray={strokeDash} fill="none" strokeLinecap="round" />;
      }
      case "circle": {
        const r = graphic.radius || Math.hypot(graphic.end.x - graphic.center.x, graphic.end.y - graphic.center.y);
        return <circle cx={graphic.center.x} cy={graphic.center.y} r={r} stroke={color} strokeWidth={strokeW} strokeDasharray={strokeDash} fill={fillCol} />;
      }
      case "rect": {
        const minX = Math.min(graphic.start.x, graphic.end.x);
        const minY = Math.min(graphic.start.y, graphic.end.y);
        const w = Math.abs(graphic.end.x - graphic.start.x);
        const h = Math.abs(graphic.end.y - graphic.start.y);
        return <rect x={minX} y={minY} width={w} height={h} rx={graphic.radius || 0} stroke={color} strokeWidth={strokeW} strokeDasharray={strokeDash} fill={fillCol} />;
      }
      case "poly":
      case "curve": {
        const ptsStr = (graphic.points || []).map(p => `${p.x},${p.y}`).join(" ");
        return <polygon points={ptsStr} stroke={color} strokeWidth={strokeW} strokeDasharray={strokeDash} fill={fillCol} strokeLinejoin="round" strokeLinecap="round" />;
      }
      case "text": {
        return (
          <text
            x={graphic.position.x}
            y={graphic.position.y}
            fill={color}
            fontSize={graphic.size?.y || graphic.size?.x || 1.2}
            fontFamily="monospace"
            fontWeight={graphic.bold ? "bold" : "normal"}
            fontStyle={graphic.italic ? "italic" : "normal"}
            transform={graphic.rotation ? `rotate(${graphic.rotation} ${graphic.position.x} ${graphic.position.y})` : undefined}
          >
            {graphic.text}
          </text>
        );
      }
      case "textbox": {
        return (
          <text
            x={graphic.position.x}
            y={graphic.position.y}
            fill={color}
            fontSize={graphic.size?.y || 1.2}
            fontFamily="monospace"
          >
            {graphic.text}
          </text>
        );
      }
      default:
        return null;
    }
  };

  return (
    <g onPointerDown={(e) => onPointerDown(e, graphic)} onDoubleClick={(e) => onDoubleClick(e, graphic)} style={{ cursor: "pointer" }}>
      {renderShape()}
    </g>
  );
});

export const MemoizedPcbDimension = React.memo(({
  dimension, layer, sel, isGroupSel, onPointerDown, onDoubleClick
}: {
  dimension: PcbDimension,
  layer: PcbLayer | undefined,
  sel: boolean,
  isGroupSel: boolean,
  onPointerDown: (e: React.PointerEvent, d: PcbDimension) => void,
  onDoubleClick: (e: React.MouseEvent, d: PcbDimension) => void,
}) => {
  if (layer && !layer.visible) return null;
  const color = isGroupSel ? "#f59e0b" : sel ? "#3b82f6" : (layer?.color || "#06b6d4");
  const pts = dimension.points || [];
  if (pts.length < 2) return null;

  const p1 = pts[0];
  const p2 = pts[1];
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const textVal = dimension.text || `${len.toFixed(2)} mm`;

  return (
    <g onPointerDown={(e) => onPointerDown(e, dimension)} onDoubleClick={(e) => onDoubleClick(e, dimension)} style={{ cursor: "pointer" }}>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={0.15} strokeDasharray="0.3 0.2" />
      <circle cx={p1.x} cy={p1.y} r={0.25} fill={color} />
      <circle cx={p2.x} cy={p2.y} r={0.25} fill={color} />
      <text x={midX} y={midY - 0.5} fill={color} fontSize={1.0} textAnchor="middle" fontFamily="monospace">
        {textVal}
      </text>
    </g>
  );
});

export const MemoizedPcbTarget = React.memo(({
  target, layer, sel, isGroupSel, onPointerDown, onDoubleClick
}: {
  target: PcbTarget,
  layer: PcbLayer | undefined,
  sel: boolean,
  isGroupSel: boolean,
  onPointerDown: (e: React.PointerEvent, t: PcbTarget) => void,
  onDoubleClick: (e: React.MouseEvent, t: PcbTarget) => void,
}) => {
  if (layer && !layer.visible) return null;
  const color = isGroupSel ? "#f59e0b" : sel ? "#3b82f6" : (layer?.color || "#e11d48");
  const s = target.size || 3;
  const r = s / 2;

  return (
    <g onPointerDown={(e) => onPointerDown(e, target)} onDoubleClick={(e) => onDoubleClick(e, target)} style={{ cursor: "pointer" }}>
      <circle cx={target.x} cy={target.y} r={r} fill="none" stroke={color} strokeWidth={0.2} />
      <circle cx={target.x} cy={target.y} r={r * 0.5} fill="none" stroke={color} strokeWidth={0.15} />
      <line x1={target.x - r * 1.3} y1={target.y} x2={target.x + r * 1.3} y2={target.y} stroke={color} strokeWidth={0.15} />
      <line x1={target.x} y1={target.y - r * 1.3} x2={target.x} y2={target.y + r * 1.3} stroke={color} strokeWidth={0.15} />
    </g>
  );
});
