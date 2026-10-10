import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  SchematicDoc,
  SchematicNode,
  SchematicWire,
  WireColor,
  GRID,
  computeJunctions,
  computeCrossings,
  findWireHit,
  splitWireAtPoint,
  nextReference,
} from "@/lib/schematic";
import { SYMBOLS, transformedPins, nodeBBox } from "@/lib/symbols";
import { getImportedKiCadParsedSymbol, KICAD_BODY_FILL } from "@/lib/kicadSymbol";
import { kicadPointToWorld, worldPointToKicad, WORLD_UNITS_PER_KICAD_MM } from "@/lib/kicadCoordinateSystem";
import { transformKiCadLibraryPoint, runtimeKiCadMirror, getKiCadCoreSymbol } from "@/lib/kicadSchematicCore";
import { getOrCreateFontAtlas } from "@/lib/webglTextSdf";
import { getSymbolPinGeometry, pinTextOrientation, uprightAxisRotation, PIN_NAME_FONT, PIN_NAME_MIN_FONT } from "@/lib/symbolPinGeometry";
import { buildNetIndex, netIdForSelection } from "@/lib/netlist";
import { analyzeDamage } from "@/lib/damage";
import { SchematicWebGLFire, type FireInstance } from "./webgl/SchematicWebGLFire";
import { SchematicWebGLGrid, type GridStyle } from "./webgl/SchematicWebGLGrid";
import { SchematicGLStage } from "./webgl/SchematicGLStage";
import { SchematicWebGLSymbols, type SymbolInstance } from "./webgl/SchematicWebGLSymbols";
import { SchematicWebGLWires, type WireInstance } from "./webgl/SchematicWebGLWires";
import { SchematicWebGLRealisticWires, type RealisticWireInstance } from "./webgl/SchematicWebGLRealisticWires";
import { SchematicWebGLWireGlow, SchematicWebGLWireSelection } from "./webgl/SchematicWebGLWireOverlay";
import { SchematicWebGLGuides, type AlignmentMatchGuide } from "./webgl/SchematicWebGLGuides";
import { SchematicWebGLCurrentFlow } from "./webgl/SchematicWebGLCurrentFlow";
import { SchematicWebGLNetLabels, type NetLabelInstance } from "./webgl/SchematicWebGLNetLabels";
import { SchematicWebGLBadges, type BadgeInstance } from "./webgl/SchematicWebGLBadges";
import { SchematicWebGLRealisticSymbols, type RealisticSymbolInstance } from "./webgl/SchematicWebGLRealisticSymbols";
import { getRealisticBackground } from "@/lib/realisticBackgrounds";
import { SchematicWebGLJunctions, type JunctionInstance } from "./webgl/SchematicWebGLJunctions";
import { SchematicWebGLSolderJoints, type SolderJointInstance } from "./webgl/SchematicWebGLSolderJoints";
import { SchematicWebGLSelection, type SelectionRectInstance, type PinMarkerInstance, type WireToolIndicator, type GlowInstance } from "./webgl/SchematicWebGLSelection";
import type { SymbolId, SchematicNetLabel } from "@/lib/schematic";
import { useI18n } from "@/i18n";
import { toast } from "sonner";
import {
  generateSpiceNetlist,
  runSimulation,
  SimulationResult,
  getComponentRef,
  getVoltageColor,
} from "@/lib/simulation";
import { motion, AnimatePresence } from "motion/react";


function CurrentFlow({
  path,
  current,
  zoom,
}: {
  path: string;
  current: number;
  zoom: number;
}) {
  const absI = Math.abs(current);
  if (absI < 1e-6) return null;
  if (zoom < 0.4) return null; // Performance optimization for mobile

  const direction = current > 0 ? 1 : -1;
  const cycleLength = 1.2;
  const dashLength = 0.6;
  const gapLength = cycleLength - dashLength;
  
  // Velocity in units per second
  const v = Math.min(15, Math.max(0.5, absI * 250));
  const duration = cycleLength / v;

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Outer Glow / Trail */}
      <path
        d={path}
        fill="none"
        stroke="#eab308"
        strokeWidth={0.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${dashLength} ${gapLength}`}
        opacity={0.4}
        style={{ filter: "blur(1.5px)" }}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to={direction > 0 ? -cycleLength : cycleLength}
          dur={`${duration}s`}
          repeatCount="indefinite"
        />
      </path>

      {/* Inner Core */}
      <path
        d={path}
        fill="none"
        stroke="#fef08a"
        strokeWidth={0.08}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${dashLength} ${gapLength}`}
        opacity={0.9}
        style={{ filter: "drop-shadow(0 0 1px #facc15)" }}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to={direction > 0 ? -cycleLength : cycleLength}
          dur={`${duration}s`}
          repeatCount="indefinite"
        />
      </path>
    </g>
  );
}

function MiniOscilloscope({
  values,
  currentTime,
  width = 3,
  height = 1.2,
}: {
  values: { t: number; v: number }[];
  currentTime: number;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) return null;

  // Show last 50ms or similar window
  const windowSize = 0.05;
  const startTime = Math.max(0, currentTime - windowSize);
  const filtered = values.filter((v) => v.t >= startTime && v.t <= currentTime);

  if (filtered.length < 2) return null;

  const minV = Math.min(...filtered.map((v) => v.v));
  const maxV = Math.max(...filtered.map((v) => v.v));
  const range = Math.max(0.1, maxV - minV);

  const points = filtered
    .map((v) => {
      const x = ((v.t - startTime) / windowSize) * width;
      const y = height - ((v.v - minV) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <g transform="translate(0.2, 0.8)">
      <rect width={width} height={height} fill="#1e293b" rx={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke="#10b981"
        strokeWidth={0.04}
        strokeLinejoin="round"
      />
      <text
        x={width - 0.1}
        y={height - 0.1}
        fontSize={0.18}
        fill="#94a3b8"
        textAnchor="end"
      >
        {maxV.toFixed(1)}V
      </text>
      <text
        x={width - 0.1}
        y={0.2}
        fontSize={0.18}
        fill="#94a3b8"
        textAnchor="end"
      >
        {minV.toFixed(1)}V
      </text>
    </g>
  );
}

const getHeatColor = (p: number) => {
  if (p < 0.05) return null;
  if (p < 0.2) return "rgba(251, 191, 36, 0.4)"; // Yellow-400 glow
  if (p < 0.6) return "rgba(249, 115, 22, 0.6)"; // Orange-500 glow
  return "rgba(239, 68, 68, 0.8)"; // Red-500 glow
};

function FloatingNodeIndicator({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle
        r={0.25}
        fill="none"
        stroke="#ef4444"
        strokeWidth={0.04}
        opacity={0.6}
      >
        <animate
          attributeName="r"
          values="0.2;0.35;0.2"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
      <path
        d="M 0,-0.15 L 0,0.05 M 0,0.12 L 0,0.15"
        stroke="#ef4444"
        strokeWidth={0.06}
        strokeLinecap="round"
      />
    </g>
  );
}

function ComponentStateAnimation({
  node,
  stats,
  isSimulating,
  currentTime,
  doc,
}: {
  node: SchematicNode;
  stats: any;
  isSimulating: boolean;
  currentTime: number;
  doc: SchematicDoc;
}) {
  const sym = SYMBOLS[node.symbol];
  if (!sym) return null;
  const cx = sym.width / 2,
    cy = sym.height / 2;

  const fault = doc.faults?.find((f) => f.targetId === node.id);
  const isDark = doc.canvasColor === "black";

  return (
    <g>
      {fault && (
        <g transform={`translate(${cx} ${cy})`} opacity={0.8}>
          <motion.path
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            d="M -0.4 -0.4 L 0.4 0.4 M 0.4 -0.4 L -0.4 0.4"
            stroke="#ef4444"
            strokeWidth={0.15}
            strokeLinecap="round"
          />
          <circle
            r={0.6}
            fill="none"
            stroke="#ef4444"
            strokeWidth={0.08}
            strokeDasharray="0.2,0.1"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="0.3"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}

      {node.symbol === "switch" && (
        <g>
          {/* Mask original diagonal line */}
          <line
            x1={1}
            y1={1}
            x2={2.2}
            y2={0.3}
            stroke={isDark ? "#0b1220" : "#ffffff"}
            strokeWidth={0.25}
          />
          <motion.line
            x1={1}
            y1={1}
            x2={2.2}
            animate={{
              y2:
                node.value === "on" || node.value === "1" || node.value === "ON"
                  ? 1
                  : 0.3,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            stroke="currentColor"
            strokeWidth={0.12}
            strokeLinecap="round"
          />
        </g>
      )}

      {node.symbol === "led" &&
        isSimulating &&
        stats &&
        Math.abs(stats.current) > 1e-5 && (
          <g transform={`translate(${cx} ${cy})`}>
            {/* Outermost soft light aura / projection */}
            <circle
              r={2.8}
              fill="#ff1e56"
              opacity={Math.min(0.6, Math.abs(stats.current) * 60)}
              style={{ filter: "blur(14px)" }}
            >
              <animate
                attributeName="opacity"
                values={`${Math.min(0.2, Math.abs(stats.current) * 20)};${Math.min(0.6, Math.abs(stats.current) * 60)};${Math.min(0.2, Math.abs(stats.current) * 20)}`}
                dur="1.2s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Middle intense glow */}
            <circle
              r={1.5}
              fill="#ff0000"
              opacity={Math.min(0.85, Math.abs(stats.current) * 90)}
              style={{ filter: "blur(5px)" }}
            />
            {/* Core emission */}
            <circle
              r={0.8}
              fill="#ff6b6b"
              opacity={Math.min(0.95, Math.abs(stats.current) * 110)}
              style={{ filter: "blur(1.5px)" }}
            />
            {/* White-hot diode junction emitter */}
            <circle
              r={0.35}
              fill="#ffffff"
              opacity={Math.min(1.0, Math.abs(stats.current) * 130)}
              style={{ filter: "blur(0.5px)" }}
            />
            {/* Light rays */}
            <g
              stroke="#ff3366"
              strokeWidth={0.22}
              strokeLinecap="round"
              opacity={Math.min(1.0, Math.abs(stats.current) * 60)}
            >
              <line x1={-0.6} y1={-0.6} x2={-1.4} y2={-1.4} />
              <line x1={0} y1={-0.8} x2={0} y2={-1.7} />
              <line x1={0.6} y1={-0.6} x2={1.4} y2={-1.4} />
              <line x1={-0.8} y1={0} x2={-1.6} y2={0} />
              <line x1={0.8} y1={0} x2={1.6} y2={0} />
            </g>
          </g>
        )}

      {node.symbol === "capacitor" && isSimulating && stats && (
        <g transform={`translate(${cx - 0.5} ${cy - 0.6})`}>
          <rect
            width={1}
            height={1.2}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.05}
            opacity={0.2}
          />
          <motion.rect
            width={1}
            animate={{ height: Math.min(1.2, Math.abs(stats.voltage) * 0.1) }}
            y={1.2 - Math.min(1.2, Math.abs(stats.voltage) * 0.1)}
            fill="#3b82f6"
            opacity={0.5}
          />
        </g>
      )}

      {(node.symbol === "nmosfet" ||
        node.symbol === "pmosfet" ||
        node.symbol === "mosfet") &&
        isSimulating &&
        stats && (
          <circle
            cx={cx}
            cy={cy}
            r={0.8}
            fill={Math.abs(stats.current) > 0.001 ? "#10b981" : "none"}
            opacity={0.2}
            style={{ filter: "blur(4px)" }}
          />
        )}

      {node.symbol === "battery" && isSimulating && (
        <g transform={`translate(${cx - 0.6} ${cy - 0.3})`}>
          <rect
            width={1.2}
            height={0.6}
            rx={0.05}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.05}
          />
          <rect
            width={1.0}
            height={0.4}
            x={0.1}
            y={0.1}
            fill="#10b981"
            opacity={0.6}
          />
          <rect
            width={0.15}
            height={0.3}
            x={1.2}
            y={0.15}
            fill="currentColor"
            rx={0.02}
          />
        </g>
      )}
    </g>
  );
}

export type EditorTool = "select" | "wire" | "pan";
export type WireStyle = "ortho" | "diag45" | "curved";

interface Props {
  doc: SchematicDoc;
  setDoc: (
    updater: (d: SchematicDoc) => SchematicDoc,
    noHistory?: boolean,
  ) => void;
  commitHistory: () => void;
  tool: EditorTool;
  setTool: (t: EditorTool) => void;
  locateSignal?: { id: string; t: number } | null;
  selectedIds?: string[];
  setSelectedIds?: (ids: string[]) => void;
  wireColor: WireColor;
  svgRef?: React.RefObject<SVGSVGElement>;
  selectedWireIds?: string[];
  setSelectedWireIds?: (ids: string[]) => void;
  clipboard: { nodes: SchematicNode[]; wires: SchematicWire[] } | null;
  setClipboard: (data: { nodes: SchematicNode[]; wires: SchematicWire[] } | null) => void;
  selectedTrackId?: string | null;
  setSelectedTrackId?: (id: string | null) => void;
  selectedPin?: { nodeId: string; pinIndex: number } | null;
  setSelectedPin?: (pin: { nodeId: string; pinIndex: number } | null) => void;
  highlightedNetIds?: number[];
  /** Ghost placement from library or clipboard */
  placement?: {
    symbol?: SymbolId;
    rotation?: 0 | 90 | 180 | 270;
    multi?: { nodes: SchematicNode[]; wires: SchematicWire[] };
  } | null;
  setPlacement?: (p: {
    symbol?: SymbolId;
    rotation?: 0 | 90 | 180 | 270;
    multi?: { nodes: SchematicNode[]; wires: SchematicWire[] };
  } | null) => void;
  onPlace?: (
    symbol: SymbolId,
    x: number,
    y: number,
    rotation: 0 | 90 | 180 | 270,
    metadata?: any
  ) => void;
  onPlaceMulti?: (data: { nodes: SchematicNode[]; wires: SchematicWire[] }, x: number, y: number) => void;
  onCancelPlace?: () => void;
  onRotatePlacement?: () => void;
  /** Fired when user double-clicks a node — Editor opens the properties panel. */
  onOpenProperties?: (nodeId: string) => void;
  onOpenWireProperties?: (wireId: string) => void;
  wireStyle?: WireStyle;
  gridStyle?: GridStyle;
  showGrid?: boolean;
  gridOpacity?: number;
  snap?: boolean;
  onBackgroundClick?: () => void;
  onCanvasClick?: () => void;
  simulationResults?: SimulationResult[];
  currentTime?: number;
  isSimulating?: boolean;
  realistic?: boolean;
  showProbes?: boolean;
}

const WIRE_COLOR_HEX: Record<WireColor, string> = {
  black: "#111111",
  red: "#dc2626",
  green: "#16a34a",
  blue: "#2563eb",
  yellow: "#eab308",
  white: "#ffffff",
};

const PIN_SNAP = 0.6;
// Lift dragged/placed element about 0.5cm above the finger on touch so it isn't covered.
const TOUCH_LIFT_PX = 57; // ~1.5cm at 96dpi

interface PinHit {
  nodeId: string;
  x: number;
  y: number;
  pinIndex: number;
}

export function Canvas({
  doc,
  setDoc,
  commitHistory,
  tool,
  setTool,
  selectedIds,
  setSelectedIds,
  wireColor,
  svgRef,
  selectedWireIds,
  setSelectedWireIds,
  clipboard,
  setClipboard,
  selectedTrackId,
  setSelectedTrackId,
  selectedPin,
  setSelectedPin,
  highlightedNetIds,
  placement,
  onPlace,
  onPlaceMulti,
  onCancelPlace,
  onRotatePlacement,
  onOpenProperties,
  onOpenWireProperties,
  wireStyle = "ortho",
  gridStyle = "hybrid",
  showGrid = true,
  gridOpacity = 0.9,
  snap = false,
  onBackgroundClick,
  onCanvasClick,
  simulationResults,
  currentTime = 0,
  isSimulating = false,
  realistic = false,
  showProbes = true,
  locateSignal,
}: Props) {
  void setTool;
  const { lang } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerSvgRef = useRef<SVGSVGElement>(null);
  const svg = svgRef ?? innerSvgRef;

  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ w: 800, h: 600 });

  const lastProcessedLocateSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (locateSignal && locateSignal.id && locateSignal.t !== lastProcessedLocateSignalRef.current) {
      lastProcessedLocateSignalRef.current = locateSignal.t;
      const node = doc.nodes.find((n) => n.id === locateSignal.id);
      if (node) {
        // Calculate center of node
        const sym = SYMBOLS[node.symbol];
        if (sym) {
          const cx = node.x + sym.width / 2;
          const cy = node.y + sym.height / 2;
          
          // Pan to it with 2.0 zoom scale
          const newScale = 2.0;
          setView({
            x: size.w / 2 - cx * newScale * GRID,
            y: size.h / 2 - cy * newScale * GRID,
            scale: newScale,
          });
        }
      }
    }
  }, [locateSignal, doc.nodes, size.w, size.h]);

  const [hoverPin, setHoverPin] = useState<PinHit | null>(null);

  const selectedId = selectedIds?.[0] || null;
  const selectedWireId = selectedWireIds?.[0] || null;

  const setSelectedId = useCallback(
    (id: string | null) => {
      setSelectedIds?.(id ? [id] : []);
    },
    [setSelectedIds],
  );

  const setSelectedWireId = useCallback(
    (id: string | null) => {
      setSelectedWireIds?.(id ? [id] : []);
    },
    [setSelectedWireIds],
  );

  const allPins = useMemo<PinHit[]>(() => {
    const list: PinHit[] = [];
    for (const n of doc.nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      const pins = transformedPins(sym, n.rotation, n.size);
      pins.forEach((p, i) => {
        if (!sym.pins[i].hide) {
          list.push({ nodeId: n.id, x: n.x + p.x, y: n.y + p.y, pinIndex: i });
        }
      });
    }
    return list;
  }, [doc.nodes]);

  const netIndex = useMemo(() => buildNetIndex(doc), [doc]);

  const gndNetId = useMemo(() => {
    let gndId = -1;
    doc.nodes.forEach((node) => {
      if (node.symbol === "gnd") {
        const netId = netIndex.pinNet.get(`${node.id}:0`);
        if (netId !== undefined) gndId = netId;
      }
    });
    if (gndId === -1 && netIndex.nets.length > 0) {
      gndId = 0;
    }
    return gndId;
  }, [doc.nodes, netIndex]);

  const highlightedNet = useMemo(() => {
    if (highlightedNetIds && highlightedNetIds.length > 0) {
      return highlightedNetIds[0];
    }
    return netIdForSelection(netIndex, {
      wireId: selectedWireIds[0],
      nodeId: selectedIds[0],
    });
  }, [highlightedNetIds, netIndex, selectedWireIds, selectedIds]);

  const [dragInfo, setDragInfo] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [snapWireHi, setSnapWireHi] = useState<string | null>(null);

  // High-frequency interaction guards. Pointer/wheel events can arrive much faster
  // than a mobile browser can render. Keep only the newest coordinates and let one
  // animation frame perform the React update.
  const wirePreviewFrameRequested = useRef(false);
  const pendingWirePointerRef = useRef<{ x: number; y: number } | null>(null);
  const zoomFrameRequested = useRef(false);
  const pendingWheelRef = useRef<{ clientX: number; clientY: number; deltaY: number } | null>(null);
  const simulationHoverFrameRequested = useRef(false);

  const getNetVoltage = useCallback(
    (netId: number) => {
      if (netId === gndNetId) return 0;
      if (!simulationResults || simulationResults.length === 0) return 0;
      const nodeName = `net_${netId}`;
      const res = simulationResults.find((r) => r.node === nodeName);
      if (!res) return 0;
      const points = res.values;
      if (points.length === 0) return 0;

      // Find closest time point
      let low = 0,
        high = points.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (points[mid].t < currentTime) low = mid + 1;
        else if (points[mid].t > currentTime) high = mid - 1;
        else return points[mid].v;
      }
      return points[Math.max(0, low - 1)]?.v ?? 0;
    },
    [simulationResults, currentTime, gndNetId],
  );

  const getElementCurrent = useCallback(
    (ref: string) => {
      if (!simulationResults || simulationResults.length === 0) return 0;
      const res = simulationResults.find(
        (r) => r.type === "current" && r.node === ref,
      );
      if (!res) return 0;
      const points = res.values;
      if (points.length === 0) return 0;

      let low = 0,
        high = points.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (points[mid].t < currentTime) low = mid + 1;
        else if (points[mid].t > currentTime) high = mid - 1;
        else return points[mid].v;
      }
      return points[Math.max(0, low - 1)]?.v ?? 0;
    },
    [simulationResults, currentTime],
  );

  const getComponentStats = useCallback(
    (node: SchematicNode) => {
      if (!simulationResults || simulationResults.length === 0) return null;
      const ref = getComponentRef(node);

      const net0 = netIndex.pinNet.get(`${node.id}:0`);
      const net1 = netIndex.pinNet.get(`${node.id}:1`);
      const v0 = net0 !== undefined ? getNetVoltage(net0) : 0;
      const v1 = net1 !== undefined ? getNetVoltage(net1) : 0;
      const voltage = v0 - v1;

      const current = getElementCurrent(ref);
      const power = Math.abs(voltage * current);

      return { voltage, current, power, v0, v1 };
    },
    [simulationResults, netIndex, getNetVoltage, getElementCurrent],
  );

  // ---- component damage (over-current / over-power / short circuit) ------------------------
  const damageMap = useMemo(
    () => (isSimulating && simulationResults && simulationResults.length ? analyzeDamage(doc, simulationResults, netIndex) : new Map()),
    [isSimulating, simulationResults, doc, netIndex],
  );
  /** nodes that have already failed at the current playback time */
  const burntNow = useMemo(() => {
    const m = new Map<string, import("@/lib/damage").DamageEvent>();
    damageMap.forEach((ev, id) => { if (ev.time <= currentTime + 1e-9) m.set(id, ev); });
    return m;
  }, [damageMap, currentTime]);
  const fireStartRef = useRef<Map<string, number>>(new Map());
  const fireInstances = useMemo<FireInstance[]>(() => {
    const starts = fireStartRef.current;
    const now = performance.now() / 1000;
    for (const id of Array.from(starts.keys())) if (!burntNow.has(id)) starts.delete(id);
    const list: FireInstance[] = [];
    for (const n of doc.nodes) {
      const ev = burntNow.get(n.id);
      const sym = SYMBOLS[n.symbol];
      if (!ev || !sym) continue;
      if (!starts.has(n.id)) starts.set(n.id, now);
      let h = 0; for (let i = 0; i < n.id.length; i++) h = (h * 31 + n.id.charCodeAt(i)) | 0;
      list.push({
        id: n.id,
        x: n.x + sym.width / 2,
        y: n.y + sym.height / 2,
        radius: Math.max(0.9, Math.min(sym.width, sym.height) * 0.45) * (n.size ?? 1),
        severity: ev.severity,
        startSec: starts.get(n.id)!,
        seed: Math.abs(h) % 997 + 1,
      });
    }
    return list;
  }, [burntNow, doc.nodes]);

  const pinCurrents = useMemo(() => {
    if (!simulationResults || simulationResults.length === 0)
      return new Map<string, number>();
    const m = new Map<string, number>();
    doc.nodes.forEach((n) => {
      const sym = SYMBOLS[n.symbol];
      if (!sym) return;
      const i = getElementCurrent(getComponentRef(n));
      const pins = transformedPins(sym, n.rotation, n.size ?? 1);
      pins.forEach((p, idx) => {
        // Use integer keys to avoid floating point issues, but round to nearest grid/half-grid
        const kx = Math.round((n.x + p.x) * 10);
        const ky = Math.round((n.y + p.y) * 10);
        const key = `${kx},${ky}`;
        const flow = idx === 0 ? i : idx === 1 ? -i : 0;
        m.set(key, (m.get(key) || 0) + flow);
      });
    });
    return m;
  }, [doc.nodes, simulationResults, getElementCurrent]);

  const getWirePinCurrent = (x: number, y: number) => {
    const kx = Math.round(x * 10);
    const ky = Math.round(y * 10);
    return pinCurrents.get(`${kx},${ky}`) || 0;
  };

  const [stickyProbe, setStickyProbe] = useState<{
    id: string;
    type: "node" | "wire" | "pin";
  } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<{
    id: string;
    type: "node" | "wire" | "pin";
    pos: { x: number; y: number };
  } | null>(null);

  const floatingPins = useMemo(() => {
    const list: { nodeId: string; pinIndex: number; x: number; y: number }[] =
      [];
    doc.nodes.forEach((n) => {
      const sym = SYMBOLS[n.symbol];
      if (!sym) return;
      const pins = transformedPins(sym, n.rotation, n.size);
      pins.forEach((p, i) => {
        const netId = netIndex.pinNet.get(`${n.id}:${i}`);
        if (netId !== undefined) {
          const net = netIndex.nets[netId];
          // Isolated if it's the only thing in the net
          if (net && net.wireIds.size === 0 && net.pins.length === 1) {
            list.push({
              nodeId: n.id,
              pinIndex: i,
              x: n.x + p.x,
              y: n.y + p.y,
            });
          }
        }
      });
    });
    return list;
  }, [doc.nodes, netIndex]);

  const activeProbe = showProbes ? (stickyProbe || hoverTarget) : null;

  const probeData = useMemo(() => {
    if (!isSimulating || !simulationResults || !activeProbe) return null;

    if (activeProbe.type === "pin") {
      const [nId, pIdx] = activeProbe.id.split(":");
      const netId = netIndex.pinNet.get(`${nId}:${pIdx}`);
      if (netId !== undefined) {
        const v = getNetVoltage(netId);
        const n = doc.nodes.find((n) => n.id === nId);
        if (n) {
          const sym = SYMBOLS[n.symbol];
          if (!sym) return null;
          const p = transformedPins(sym, n.rotation, n.size)[parseInt(pIdx)];
          const nodeName = `net_${netId}`;
          const res = simulationResults.find((r) => r.node === nodeName);
          return {
            x: n.x + p.x,
            y: n.y + p.y,
            val: v.toFixed(2) + "V",
            type: `Pin ${pIdx}`,
            history: res?.values,
          };
        }
      }
    } else if (activeProbe.type === "node") {
      const n = doc.nodes.find((n) => n.id === activeProbe.id);
      if (n) {
        const stats = getComponentStats(n);
        if (stats) {
          const sym = SYMBOLS[n.symbol];
          const ref = getComponentRef(n);
          // For components, show current waveform if possible
          const iRes = simulationResults.find(
            (r) => r.type === "current" && r.node === ref,
          );
          return {
            x: n.x + (sym?.width ?? 0) / 2,
            y: n.y - 0.5,
            val: `V: ${stats.voltage.toFixed(2)}V\nI: ${(stats.current * 1000).toFixed(1)}mA\nP: ${(stats.power * 1000).toFixed(1)}mW`,
            type: n.reference || "Component",
            history: iRes?.values, // Power or current history
          };
        }
      }
    } else if (activeProbe.type === "wire") {
      const w = doc.wires.find((w) => w.id === activeProbe.id);
      if (w) {
        const netId = netIndex.wireNet.get(w.id);
        if (netId !== undefined) {
          const v = getNetVoltage(netId);
          const nodeName = `net_${netId}`;
          const res = simulationResults.find((r) => r.node === nodeName);
          return {
            x: activeProbe.pos.x,
            y: activeProbe.pos.y,
            val: v.toFixed(2) + "V",
            type: `Net ${netId}`,
            history: res?.values,
          };
        }
      }
    }
    return null;
  }, [
    isSimulating,
    simulationResults,
    activeProbe,
    getNetVoltage,
    doc.nodes,
    getComponentStats,
    doc.wires,
    netIndex,
  ]);

  const autoFit = useCallback(() => {
    if (doc.nodes.length === 0 && doc.wires.length === 0) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    doc.nodes.forEach((n) => {
      const sym = SYMBOLS[n.symbol];
      if (!sym) return;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + sym.width);
      maxY = Math.max(maxY, n.y + sym.height);
    });
    doc.wires.forEach((w) =>
      w.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }),
    );

    if (minX === Infinity) return;

    const cw = maxX - minX,
      ch = maxY - minY;
    const padding = 2;
    const s = Math.min(
      size.w / GRID / (cw + padding * 2),
      size.h / GRID / (ch + padding * 2),
    );
    const finalScale = Math.min(2, Math.max(0.2, s));

    setView({
      x: size.w / 2 - (minX + cw / 2) * finalScale * GRID,
      y: size.h / 2 - (minY + ch / 2) * finalScale * GRID,
      scale: finalScale,
    });
  }, [doc, size]);

  const autoFitRef = useRef(autoFit);
  useEffect(() => {
    autoFitRef.current = autoFit;
  }, [autoFit]);

  useEffect(() => {
    if (isSimulating && size.w > 0 && size.h > 0) {
      const timer = setTimeout(() => autoFitRef.current(), 50);
      return () => clearTimeout(timer);
    }
  }, [isSimulating, size.w, size.h]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => {
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (tool !== "wire") {
      setPendingWire(null);
      setWirePreview(null);
    }
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tgt?.isContentEditable)
        return;

      if (e.key === "Escape") {
        setPendingWire(null);
        setWirePreview(null);
        setSelectedWireIds([]);
        setSelectedIds([]);
        if (placement) onCancelPlace?.();
      }
      if ((e.key === "r" || e.key === "R") && placement) onRotatePlacement?.();
      
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!isSimulating && (selectedIds.length > 0 || selectedWireIds.length > 0)) {
          commitHistory();
          setDoc((d) => ({
            ...d,
            nodes: d.nodes.filter(n => !selectedIds.includes(n.id)),
            wires: d.wires.filter((w) => !selectedWireIds.includes(w.id)),
          }));
          setSelectedWireIds([]);
          setSelectedIds([]);
        }
      }

      // Clipboard shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        const nodes = doc.nodes.filter(n => selectedIds.includes(n.id));
        const wires = doc.wires.filter(w => selectedWireIds.includes(w.id));
        if (nodes.length > 0 || wires.length > 0) {
          setClipboard({ nodes: JSON.parse(JSON.stringify(nodes)), wires: JSON.parse(JSON.stringify(wires)) });
          toast.success(lang === "ar" ? "تم النسخ" : "Copied");
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        if (clipboard) {
          if (setTool) setTool("select");
          if (setPlacement) setPlacement({ multi: clipboard });
          toast.info(lang === "ar" ? "اختر مكاناً للصق" : "Select location to paste");
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        const nodes = doc.nodes.filter(n => selectedIds.includes(n.id));
        const wires = doc.wires.filter(w => selectedWireIds.includes(w.id));
        if (nodes.length > 0 || wires.length > 0) {
          commitHistory();
          const offset = { x: 1, y: 1 };
          const newNodes: SchematicNode[] = nodes.map(n => ({
            ...n,
            id: crypto.randomUUID(),
            x: n.x + offset.x,
            y: n.y + offset.y,
          }));
          const newWires: SchematicWire[] = wires.map(w => ({
            ...w,
            id: crypto.randomUUID(),
            points: w.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))
          }));

          setDoc(d => {
            const nodesWithRefs = newNodes.map(nn => {
               const sym = SYMBOLS[nn.symbol];
               const prefix = sym?.prefix || "U";
               return { ...nn, reference: nextReference(d, prefix) };
            });
            return {
              ...d,
              nodes: [...d.nodes, ...nodesWithRefs],
              wires: [...d.wires, ...newWires]
            };
          });
          setSelectedIds(newNodes.map(n => n.id));
          setSelectedWireIds(newWires.map(w => w.id));
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        setSelectedIds(doc.nodes.map(n => n.id));
        setSelectedWireIds(doc.wires.map(w => w.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tool,
    selectedIds,
    selectedWireIds,
    setDoc,
    setSelectedIds,
    setSelectedWireIds,
    placement,
    onCancelPlace,
    onRotatePlacement,
    clipboard,
    setClipboard,
    doc,
    isSimulating,
    commitHistory,
    lang,
  ]);

  const isDark = doc.canvasColor === "black";
  const bg = isSimulating
    ? "#000000"
    : (realistic
        ? (isDark ? "radial-gradient(circle, #2d1c10 0%, #170d07 100%)" : "radial-gradient(circle, #fcf6f0 0%, #e8dec9 100%)")
        : (isDark ? "#0b1220" : "#ffffff"));
  const strokeColor = isDark ? "#e6edf6" : "#111827";

  const getWireColorHex = (cName: WireColor) => {
    if (cName === "white" && !isDark) return "#1e293b";
    if (cName === "black" && isDark) return "#f1f5f9";
    return WIRE_COLOR_HEX[cName] || "#111111";
  };

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const x = (sx - rect.left - view.x) / (GRID * view.scale);
      const y = (sy - rect.top - view.y) / (GRID * view.scale);
      return { x, y };
    },
    [view],
  );

  const snapToGrid = useCallback(
    (p: { x: number; y: number }) =>
      snap
        ? { x: Math.round(p.x), y: Math.round(p.y) }
        : { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
    [snap],
  );

  const findPinAt = useCallback(
    (wp: { x: number; y: number }, ignoreNodeId?: string): PinHit | null => {
      let best: PinHit | null = null;
      let bestD = PIN_SNAP * PIN_SNAP;
      for (const p of allPins) {
        if (ignoreNodeId && p.nodeId === ignoreNodeId) continue;
        const d = (p.x - wp.x) ** 2 + (p.y - wp.y) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    },
    [allPins],
  );

  const getPinWorldPos = useCallback(
    (nodeId: string, pinIndex: number, currentNodes: SchematicNode[]) => {
      const node = currentNodes.find((n) => n.id === nodeId);
      if (!node) return null;
      const sym = SYMBOLS[node.symbol];
      if (!sym) return null;
      const pins = transformedPins(sym, node.rotation, node.size);
      const p = pins[pinIndex];
      if (!p) return null;
      return { x: node.x + p.x, y: node.y + p.y };
    },
    [],
  );

  // ---------------- Wire routing ----------------
  const routeOrtho = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      ignoreIds: Set<string>,
    ): { x: number; y: number }[] => {
      const obstacles = doc.nodes
        .filter((n) => !ignoreIds.has(n.id))
        .map((n) => {
          const b = nodeBBox(n);
          return { x: b.x + 0.1, y: b.y + 0.1, w: b.w - 0.2, h: b.h - 0.2 };
        });
      const hits = (
        a: { x: number; y: number },
        b: { x: number; y: number },
      ) => {
        const minX = Math.min(a.x, b.x),
          maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y),
          maxY = Math.max(a.y, b.y);
        for (const o of obstacles) {
          if (minX > o.x + o.w || maxX < o.x) continue;
          if (minY > o.y + o.h || maxY < o.y) continue;
          return true;
        }
        return false;
      };
      if (hits(start, end)) {
        // Direct path blocked, do manual L-shape
        return [start, { x: start.x, y: end.y }, end];
      }
      return [start, { x: end.x, y: start.y }, end];
    },
    [doc.nodes],
  );

  const routeWire = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      ignoreIds: Set<string>,
    ): { x: number; y: number }[] => {
      return routeOrtho(start, end, ignoreIds);
    },
    [routeOrtho],
  );

  const gesture = useRef<{
    type: "none" | "pan" | "drag" | "pinch" | "wire" | "wireSeg" | "anchor" | "multi-drag" | "selection";
    startX?: number;
    startY?: number;
    startView?: { x: number; y: number };
    nodeId?: string;
    nodeStart?: { x: number; y: number };
    nodeStarts?: Map<string, { x: number; y: number }>;
    pinchStartDist?: number;
    pinchStartScale?: number;
    pinchCenter?: { x: number; y: number };
    wireStart?: { x: number; y: number };
    wireStartPin?: PinHit | null;
    startPinInfo?: { nodeId: string; pinIndex: number } | null;
    endPinInfo?: { nodeId: string; pinIndex: number } | null;
    moved?: boolean;
    segWireId?: string;
    segIndex?: number;
    segOrient?: "h" | "v";
    segOriginalPoints?: { x: number; y: number }[];
    anchorWireId?: string;
    anchorIndex?: number;
    affected?: {
      wireId: string;
      vertexIndex: number;
      orig: { x: number; y: number }[];
    }[];
    affectedMulti?: {
      wireId: string;
      vertexIndex: number;
      orig: { x: number; y: number }[];
    }[];
    wireStarts?: Map<string, { x: number; y: number }[]>;
    stretchWires?: {
      wireId: string;
      vertexIndex: number;
      orig: { x: number; y: number }[];
    }[];
    attachedNodeId?: string;
    attachedNodeStart?: { x: number; y: number };
    attachedNodeOtherWires?: {
      wireId: string;
      vertexIndex: number;
      orig: { x: number; y: number }[];
    }[];
    currentX?: number;
    currentY?: number;
    pointerType?: string;
  }>({ type: "none" });

  const [wirePreview, setWirePreview] = useState<{
    points: { x: number; y: number }[];
    valid: boolean;
  } | null>(null);
  const [pendingWire, setPendingWire] = useState<{
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panFrameRequested = useRef(false);
  const dragFrameRequested = useRef(false);
  const selectionFrameRequested = useRef(false);
  const mouseCoords = useRef({ x: 0, y: 0 });

  const autoConnect = useCallback(
    (d: SchematicDoc, movedNodeId: string): SchematicDoc => {
      const n = d.nodes.find((nn) => nn.id === movedNodeId);
      if (!n) return d;
      const sym = SYMBOLS[n.symbol];
      if (!sym) return d;
      const pins = transformedPins(sym, n.rotation, n.size).map((p, i) => ({
        x: n.x + p.x,
        y: n.y + p.y,
        hide: sym.pins[i].hide,
      }));
      let wires = d.wires;
      for (const pin of pins) {
        if (!pin.hide) {
          wires = wires.map((w) => splitWireAtPoint(w, pin, 0.18) ?? w);
        }
      }
      return wires === d.wires ? d : { ...d, wires };
    },
    [],
  );

  // Helper to check if a point is connected to any pin of the given nodes
  const isPointConnectedToNodes = (pt: { x: number; y: number }, nodes: SchematicNode[]) => {
    for (const n of nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      const pins = transformedPins(sym, n.rotation, n.size).map((p, i) => ({
        x: n.x + p.x,
        y: n.y + p.y,
        hide: sym.pins[i].hide,
      }));
      for (const pin of pins) {
        if (!pin.hide && Math.hypot(pt.x - pin.x, pt.y - pin.y) < 0.45) {
          return true;
        }
      }
    }
    return false;
  };

  // Determine wires "attached" to a given node (any vertex coincides with any pin)
  const findAttachedWires = (node: SchematicNode, currentWires: SchematicWire[]) => {
    const sym = SYMBOLS[node.symbol];
    if (!sym) return [];
    const pins = transformedPins(sym, node.rotation, node.size).map((p) => ({
      x: node.x + p.x,
      y: node.y + p.y,
    }));
    const out: {
      wireId: string;
      vertexIndex: number;
      orig: { x: number; y: number }[];
    }[] = [];
    for (const w of currentWires) {
      for (let i = 0; i < w.points.length; i++) {
        const pt = w.points[i];
        for (const pin of pins) {
          if (Math.hypot(pt.x - pin.x, pt.y - pin.y) < 0.45) {
            out.push({
              wireId: w.id,
              vertexIndex: i,
              orig: w.points.map((p) => ({ ...p })),
            });
            break; // Move to next point in this wire
          }
        }
      }
    }
    return out;
  };

  const stretchWire = (
    pts: { x: number; y: number }[],
    vertexIndices: number | number[],
    dx: number,
    dy: number,
  ): { x: number; y: number }[] => {
    const indices = Array.isArray(vertexIndices) ? vertexIndices : [vertexIndices];
    if (indices.length === 0) return pts;

    if (pts.length === 2 && indices.length === 1) {
      const vertexIndex = indices[0];
      const otherIndex = vertexIndex === 0 ? 1 : 0;
      const A = pts[vertexIndex];
      const B = pts[otherIndex];
      const A_prime = { x: A.x + dx, y: A.y + dy };
      const isHoriz = Math.abs(A.y - B.y) < 1e-6;
      const I = isHoriz ? { x: B.x, y: A_prime.y } : { x: A_prime.x, y: B.y };
      return vertexIndex === 0 ? [A_prime, I, { ...B }] : [{ ...B }, I, A_prime];
    }

    const np = pts.map((p) => ({ ...p }));
    const moved = new Set<number>();
    for (const idx of indices) {
      if (idx >= 0 && idx < np.length) {
        np[idx].x += dx;
        np[idx].y += dy;
        moved.add(idx);
      }
    }

    const propagated = new Set<number>();
    for (const idx of indices) {
      if (idx > 0 && !moved.has(idx - 1) && !propagated.has(idx - 1)) {
        const prev = np[idx - 1];
        const isHoriz = Math.abs(pts[idx].y - pts[idx - 1].y) < 1e-6;
        const isVert = Math.abs(pts[idx].x - pts[idx - 1].x) < 1e-6;
        if (isHoriz) prev.y += dy;
        else if (isVert) prev.x += dx;
        propagated.add(idx - 1);
      }
      if (idx < np.length - 1 && !moved.has(idx + 1) && !propagated.has(idx + 1)) {
        const next = np[idx + 1];
        const isHoriz = Math.abs(pts[idx].y - pts[idx + 1].y) < 1e-6;
        const isVert = Math.abs(pts[idx].x - pts[idx + 1].x) < 1e-6;
        if (isHoriz) next.y += dy;
        else if (isVert) next.x += dx;
        propagated.add(idx + 1);
      }
    }

    return np;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Inform parent that drawing canvas was clicked anywhere to exit sideboxes
    onCanvasClick?.();

    const downWpEarly = screenToWorld(e.clientX, e.clientY);
    if (tool === "select" && !isSimulating && doc.netLabels?.length) {
      const labelHit = [...doc.netLabels].reverse().find((label) => {
        if (label.visible === false) return false;
        const geo = netLabelGeometry(label);
        const angle = ((label.rotation ?? 0) * Math.PI) / 180;
        const cos = Math.cos(-angle), sin = Math.sin(-angle);
        const dx = downWpEarly.x - label.x, dy = downWpEarly.y - label.y;
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        return lx >= -0.05 && lx <= geo.width + 0.05 && ly >= -geo.halfH - 0.05 && ly <= geo.halfH + 0.05;
      });
      if (labelHit) {
        const netId = netIndex.labelNet.get(labelHit.id);
        if (netId !== undefined) {
          const matchingWireIds = doc.wires
            .filter((w) => netIndex.wireNet.get(w.id) === netId)
            .map((w) => w.id);
          if (matchingWireIds.length > 0 && setSelectedWireIds) {
            setSelectedWireIds(matchingWireIds);
          }
        }
        return;
      }
    }

    const target = e.target as SVGElement;
    // Geometric picking (no DOM lookups needed): anchor handles (drawn topmost, only for the
    // selected wire) take priority, then pin > node > wire — mirrors the priority already used
    // for simulation hover. This is the same math used by the WebGL layers' coordinate system,
    // so it keeps working once the SVG visuals are removed.
    const downWp = screenToWorld(e.clientX, e.clientY);
    const selWireForAnchors = selectedWireId ? doc.wires.find((wi) => wi.id === selectedWireId) : undefined;
    const anchorHitDown = selWireForAnchors
      ? selWireForAnchors.points.reduce<{ idx: number; d: number } | null>((best, p, i) => {
          const d = Math.hypot(p.x - downWp.x, p.y - downWp.y);
          if (d <= 0.22 && (!best || d < best.d)) return { idx: i, d };
          return best;
        }, null)
      : null;
    // In Select/Pan mode the symbol body has priority over its pin hit area.
    // This is important for EDA-style dragging: a component may be grabbed directly
    // at/near a pin while its existing wire remains attached. Pin picking is still
    // used by the wire tool and simulation logic below.
    const nodeHitDown = !anchorHitDown
      ? [...doc.nodes].reverse().find((n) => {
          const b = nodeBBox(n);
          return downWp.x >= b.x && downWp.x <= b.x + b.w && downWp.y >= b.y && downWp.y <= b.y + b.h;
        }) ?? null
      : null;
    const pinHitDown = !anchorHitDown && !nodeHitDown && !isSimulating ? findPinAt(downWp) : null;
    const wireHitDown = !anchorHitDown && !pinHitDown && !nodeHitDown ? findWireHit(doc.wires, downWp, 0.3) : null;
    const targetNodeId: string | null = nodeHitDown ? nodeHitDown.id : null;
    const targetWireId: string | null = wireHitDown ? wireHitDown.wireId : null;
    const targetAnchorEl = anchorHitDown ? { idx: anchorHitDown.idx, wireId: selectedWireId as string } : null;
    const isBackground = !targetNodeId && !targetWireId && !targetAnchorEl && !pinHitDown;


    if (isBackground) {
      onBackgroundClick?.();
      // A plain click on empty schematic space is also a true deselection gesture.
      // Keep Shift-click additive so marquee/additive selection remains possible.
      if ((tool === "select" || tool === "pan") && !e.shiftKey && !isSimulating) {
        setSelectedIds?.([]);
        setSelectedWireIds?.([]);
        setSelectedPin?.(null);
        setSelectedTrackId?.(null);
      }
    }

    if (placement) {
      if (e.button === 2) {
        onCancelPlace?.();
        return;
      }
      const lift = e.pointerType === "touch" ? TOUCH_LIFT_PX : 0;
      const wp = screenToWorld(e.clientX, e.clientY - lift);
      const snapped = snapToGrid(wp);
      if (placement.multi) {
        onPlaceMulti?.(placement.multi, snapped.x, snapped.y);
      } else if (placement.symbol) {
        onPlace?.(placement.symbol, snapped.x, snapped.y, placement.rotation ?? 0, (placement as any).metadata);
      }
      return;
    }

    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      gesture.current = {
        type: "pinch",
        pinchStartDist: dist,
        pinchStartScale: view.scale,
        pinchCenter: { x: cx, y: cy },
        startView: { x: view.x, y: view.y },
      };
      setWirePreview(null);
      return;
    }

    // Hand tool / middle mouse pans from the background. Selection tool must NOT
    // enter this branch: starting on empty canvas is the marquee-selection gesture.
    if (e.button === 1 || tool === "pan") {
      const target = e.target as SVGElement;
      const isClickBackground = isBackground || target === svg.current || target.classList.contains("grid-background");

      if (isClickBackground) {
        gesture.current = {
          type: "pan",
          startX: e.clientX,
          startY: e.clientY,
          startView: { x: view.x, y: view.y },
        };
        return;
      } else if (tool === "pan" && (targetNodeId || targetWireId)) {
        // User requested that clicking with Hand tool (pan) also selects the element
        const id = targetNodeId ?? targetWireId;
        if (id) {
          if (targetNodeId) {
            setSelectedIds?.([id]);
            setSelectedWireIds?.([]);
          } else {
            setSelectedWireIds?.([id]);
            setSelectedIds?.([]);
          }
        }
      }
    }

    const anchorEl = targetAnchorEl;
    const nodeEl = targetNodeId;
    const wp = downWp;

    if (tool === "wire" && !isSimulating) {
      const pin = findPinAt(wp);
      const start = pin ? { x: pin.x, y: pin.y } : snapToGrid(wp);
      gesture.current = {
        type: "wire",
        startX: e.clientX,
        startY: e.clientY,
        wireStart: start,
        wireStartPin: pin,
        moved: false,
      };
      setWirePreview({ points: [start, start], valid: true });
      return;
    }

    if ((tool === "select" || tool === "pan") && anchorEl && selectedWireId && !isSimulating) {
      const idx = anchorEl.idx;
      const wid = anchorEl.wireId;
      if (idx >= 0 && wid === selectedWireId) {
        const w = doc.wires.find((wi) => wi.id === wid);
        if (w) {
          // Find if this anchor is connected to any component pin
          const pt = w.points[idx];
          let attachedNodeId: string | undefined = undefined;
          let attachedNodeStart: { x: number; y: number } | undefined =
            undefined;
          let attachedNodeOtherWires: any[] = [];
          if (idx === 0 || idx === w.points.length - 1) {
            for (const n of doc.nodes) {
              const sym = SYMBOLS[n.symbol];
              if (!sym) continue;
              const pins = transformedPins(sym, n.rotation, n.size).map(
                (p, i) => ({ x: n.x + p.x, y: n.y + p.y, hide: sym.pins[i].hide }),
              );
              for (const pin of pins) {
                if (!pin.hide && Math.hypot(pt.x - pin.x, pt.y - pin.y) < 0.25) {
                  attachedNodeId = n.id;
                  attachedNodeStart = { x: n.x, y: n.y };
                  // Find other wires connected to this same node so they stretch too (exclude current wire wid)
                  attachedNodeOtherWires = findAttachedWires(n, doc.wires).filter(
                    (aw) => aw.wireId !== wid,
                  );
                  break;
                }
              }
              if (attachedNodeId) break;
            }
          }

          const startPin = findPinAt(w.points[0]);
          const endPin = findPinAt(w.points[w.points.length - 1]);
          const startPinInfo = startPin ? { nodeId: startPin.nodeId, pinIndex: startPin.pinIndex } : null;
          const endPinInfo = endPin ? { nodeId: endPin.nodeId, pinIndex: endPin.pinIndex } : null;

          gesture.current = {
            type: "anchor",
            startX: e.clientX,
            startY: e.clientY,
            anchorWireId: wid,
            anchorIndex: idx,
            segOriginalPoints: w.points.map((p) => ({ ...p })),
            attachedNodeId,
            attachedNodeStart,
            attachedNodeOtherWires,
            startPinInfo,
            endPinInfo,
          };
          return;
        }
      }
    }

    if ((tool === "select" || tool === "pan") && !anchorEl && !nodeEl && isSimulating) {
      const wp = screenToWorld(e.clientX, e.clientY);
      const wireHit = findWireHit(doc.wires, wp, 0.3);
      if (wireHit) {
        setStickyProbe({ id: wireHit.id, type: "wire" });
        return;
      }
      const pin = findPinAt(wp);
      if (pin) {
        setStickyProbe({ id: `${pin.nodeId}:${pin.pinIndex}`, type: "pin" });
        return;
      }
      setStickyProbe(null);
    }

    // Check if we should drag the active selection together
    const hasSelection = (selectedIds && selectedIds.length > 0) || (selectedWireIds && selectedWireIds.length > 0);
    if ((tool === "select" || tool === "pan") && !isSimulating && hasSelection && !e.shiftKey) {
      let selMinX = Infinity;
      let selMinY = Infinity;
      let selMaxX = -Infinity;
      let selMaxY = -Infinity;

      selectedIds?.forEach((sid) => {
        const n = doc.nodes.find((nn) => nn.id === sid);
        if (n) {
          const bbox = nodeBBox(n);
          selMinX = Math.min(selMinX, bbox.x);
          selMinY = Math.min(selMinY, bbox.y);
          selMaxX = Math.max(selMaxX, bbox.x + bbox.w);
          selMaxY = Math.max(selMaxY, bbox.y + bbox.h);
        }
      });

      selectedWireIds?.forEach((wid) => {
        const w = doc.wires.find((wi) => wi.id === wid);
        if (w) {
          w.points.forEach((pt) => {
            selMinX = Math.min(selMinX, pt.x);
            selMinY = Math.min(selMinY, pt.y);
            selMaxX = Math.max(selMaxX, pt.x);
            selMaxY = Math.max(selMaxY, pt.y);
          });
        }
      });

      const isEndpointConnectedToSelectedNode = (pt: { x: number; y: number }) => {
        for (const sid of (selectedIds || [])) {
          const n = doc.nodes.find(nn => nn.id === sid);
          if (!n) continue;
          const sym = SYMBOLS[n.symbol];
          if (!sym) continue;
          const pins = transformedPins(sym, n.rotation, n.size).map((p, i) => ({
            x: n.x + p.x,
            y: n.y + p.y,
            hide: sym.pins[i].hide,
          }));
          for (const pin of pins) {
            if (!pin.hide && Math.hypot(pt.x - pin.x, pt.y - pin.y) < 0.25) {
              return true;
            }
          }
        }
        return false;
      };

      doc.wires.forEach(w => {
        const first = w.points[0];
        const last = w.points[w.points.length - 1];
        if (isEndpointConnectedToSelectedNode(first) && isEndpointConnectedToSelectedNode(last)) {
          w.points.forEach((pt) => {
            selMinX = Math.min(selMinX, pt.x);
            selMinY = Math.min(selMinY, pt.y);
            selMaxX = Math.max(selMaxX, pt.x);
            selMaxY = Math.max(selMaxY, pt.y);
          });
        }
      });

      const padding = 0.5;
      const isInsideBBox = 
        wp.x >= (selMinX - padding) && 
        wp.x <= (selMaxX + padding) && 
        wp.y >= (selMinY - padding) && 
        wp.y <= (selMaxY + padding);

      const clickedUnselectedNode = nodeEl && !selectedIds.includes(nodeEl);

      const clickedSelectedNode = nodeEl && selectedIds.includes(nodeEl);
      const clickedSelectedWire = (() => {
        const hit = findWireHit(doc.wires, wp, 0.35);
        if (hit) {
          if (selectedWireIds.includes(hit.wireId)) return true;
          const w = doc.wires.find(wi => wi.id === hit.wireId);
          if (w) {
            const first = w.points[0];
            const last = w.points[w.points.length - 1];
            if (isEndpointConnectedToSelectedNode(first) && isEndpointConnectedToSelectedNode(last)) {
              return true;
            }
          }
        }
        return false;
      })();

      if (clickedSelectedNode || clickedSelectedWire || (isInsideBBox && !clickedUnselectedNode && !anchorEl)) {
        const starts = new Map<string, { x: number; y: number }>();
        selectedIds.forEach((sid) => {
          const n = doc.nodes.find((nn) => nn.id === sid);
          if (n) starts.set(sid, { x: n.x, y: n.y });
        });

        const rigidWires = new Set<string>();
        doc.wires.forEach(w => {
          if (selectedWireIds.includes(w.id)) {
            rigidWires.add(w.id);
          } else {
            const first = w.points[0];
            const last = w.points[w.points.length - 1];
            if (isEndpointConnectedToSelectedNode(first) && isEndpointConnectedToSelectedNode(last)) {
              rigidWires.add(w.id);
            }
          }
        });

        const wireStarts = new Map<string, { x: number; y: number }[]>();
        rigidWires.forEach(wid => {
          const w = doc.wires.find(wi => wi.id === wid);
          if (w) {
            wireStarts.set(wid, w.points.map(p => ({ ...p })));
          }
        });

        const stretchWires: { wireId: string; endpoint: "first" | "last"; orig: { x: number; y: number }[] }[] = [];
        doc.wires.forEach(w => {
          if (rigidWires.has(w.id)) return;
          const first = w.points[0];
          const last = w.points[w.points.length - 1];
          const firstConn = isEndpointConnectedToSelectedNode(first);
          const lastConn = isEndpointConnectedToSelectedNode(last);
          if (firstConn) {
            stretchWires.push({
              wireId: w.id,
              endpoint: "first",
              orig: w.points.map(p => ({ ...p }))
            });
          }
          if (lastConn) {
            stretchWires.push({
              wireId: w.id,
              endpoint: "last",
              orig: w.points.map(p => ({ ...p }))
            });
          }
        });

        gesture.current = {
          type: "multi-drag",
          startX: e.clientX,
          startY: e.clientY,
          nodeStarts: starts,
          wireStarts,
          stretchWires,
          moved: false,
        };
        return;
      }
    }

    if ((tool === "select" || tool === "pan") && nodeEl) {
      const id = nodeEl;
      const isSelected = selectedIds.includes(id);
      let nextIds = [...selectedIds];

      if (e.shiftKey) {
        if (isSelected) nextIds = nextIds.filter((x) => x !== id);
        else nextIds.push(id);
        setSelectedIds(nextIds);
        setSelectedWireIds([]);
      } else {
        if (!isSelected) {
          nextIds = [id];
          setSelectedIds(nextIds);
          setSelectedWireIds([]);
        }
      }

      if (isSimulating) {
        const node = doc.nodes.find((n) => n.id === id);
        if (
          node &&
          (node.symbol === "switch" ||
            node.symbol === "switch_spst" ||
            node.symbol === "button" ||
            node.symbol === "push_button")
        ) {
          const nextVal = node.value === "1" || node.value === "on" ? "0" : "1";
          setDoc(
            (d) => ({
              ...d,
              nodes: d.nodes.map((n) =>
                n.id === id ? { ...n, value: nextVal } : n,
              ),
            }),
            true,
          );
          return;
        }
        setStickyProbe({ id, type: "node" });
        return;
      }

      if (nextIds.length > 1 || selectedWireIds.length > 0) {
        const starts = new Map<string, { x: number; y: number }>();
        nextIds.forEach((sid) => {
          const n = doc.nodes.find((nn) => nn.id === sid);
          if (n) starts.set(sid, { x: n.x, y: n.y });
        });

        const isPointConnectedToSelectedNode = (pt: { x: number; y: number }) => {
          return isPointConnectedToNodes(pt, doc.nodes.filter(n => nextIds.includes(n.id)));
        };

        const rigidWires = new Set<string>();
        doc.wires.forEach(w => {
          if (selectedWireIds.includes(w.id) || w.points.every(pt => isPointConnectedToSelectedNode(pt))) {
            rigidWires.add(w.id);
          }
        });

        const wireStarts = new Map<string, { x: number; y: number }[]>();
        rigidWires.forEach(wid => {
          const w = doc.wires.find(wi => wi.id === wid);
          if (w) {
            wireStarts.set(wid, w.points.map(p => ({ ...p })));
          }
        });

        const stretchWires: { wireId: string; vertexIndex: number; orig: { x: number; y: number }[] }[] = [];
        doc.wires.forEach(w => {
          if (rigidWires.has(w.id)) return;
          w.points.forEach((pt, idx) => {
            if (isPointConnectedToSelectedNode(pt)) {
              stretchWires.push({
                wireId: w.id,
                vertexIndex: idx,
                orig: w.points.map(p => ({ ...p }))
              });
            }
          });
        });

        gesture.current = {
          type: "multi-drag",
          startX: e.clientX,
          startY: e.clientY,
          nodeStarts: starts,
          wireStarts,
          stretchWires,
          moved: false,
          pointerType: e.pointerType,
        };
      } else {
        const node = doc.nodes.find((n) => n.id === id);
        if (node) {
          gesture.current = {
            type: "drag",
            startX: e.clientX,
            startY: e.clientY,
            nodeId: id,
            nodeStart: { x: node.x, y: node.y },
            moved: false,
            affected: findAttachedWires(node, doc.wires),
            pointerType: e.pointerType,
          };
          setDragInfo({ nodeId: id, x: node.x, y: node.y });
        }
      }
      return;
    }

    if ((tool === "select" || tool === "pan") && !isSimulating) {
      const hit = findWireHit(doc.wires, wp, 0.35);
      if (hit) {
        if (e.shiftKey) {
          if (selectedWireIds.includes(hit.wireId)) {
            setSelectedWireIds(selectedWireIds.filter(wid => wid !== hit.wireId));
          } else {
            setSelectedWireIds([...selectedWireIds, hit.wireId]);
          }
        } else {
          setSelectedWireIds([hit.wireId]);
          setSelectedIds([]);
        }
        const w = doc.wires.find((wi) => wi.id === hit.wireId)!;
        const a = w.points[hit.segIndex],
          b = w.points[hit.segIndex + 1];
        const orient: "h" | "v" = Math.abs(a.y - b.y) < 1e-6 ? "h" : "v";
        const startPin = findPinAt(w.points[0]);
        const endPin = findPinAt(w.points[w.points.length - 1]);
        const startPinInfo = startPin ? { nodeId: startPin.nodeId, pinIndex: startPin.pinIndex } : null;
        const endPinInfo = endPin ? { nodeId: endPin.nodeId, pinIndex: endPin.pinIndex } : null;

        gesture.current = {
          type: "wireSeg",
          startX: e.clientX,
          startY: e.clientY,
          segWireId: hit.wireId,
          segIndex: hit.segIndex,
          segOrient: orient,
          segOriginalPoints: w.points.map((p) => ({ ...p })),
          moved: false,
          startPinInfo,
          endPinInfo,
        };
        return;
      }
    }

    if (tool === "select") {
      if (!e.shiftKey) {
        setSelectedIds([]);
        setSelectedWireIds([]);
      }
      gesture.current = {
        type: "selection",
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      };
      return;
    }
    if (tool === "pan") {
      if (setSelectedIds) setSelectedIds([]);
      if (setSelectedWireIds) setSelectedWireIds([]);
      if (setSelectedPin) setSelectedPin(null);
      if (setSelectedTrackId) setSelectedTrackId(null);
    }
    gesture.current = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      startView: { x: view.x, y: view.y },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    mouseCoords.current = { x: e.clientX, y: e.clientY };
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (isSimulating && simulationResults && g.type === "none") {
      // Probe hit-testing scans nodes/wires and used to run on every pointer event.
      // On mobile this can easily outrun the renderer, so sample it once per frame.
      if (!simulationHoverFrameRequested.current) {
        simulationHoverFrameRequested.current = true;
        const pointerX = e.clientX;
        const pointerY = e.clientY;
        requestAnimationFrame(() => {
          simulationHoverFrameRequested.current = false;
          if (gesture.current.type !== "none") return;
          const wp = screenToWorld(pointerX, pointerY);
          const pin = findPinAt(wp);
          if (pin) {
            setHoverTarget((prev) => {
              const id = `${pin.nodeId}:${pin.pinIndex}`;
              return prev?.id === id && prev.type === "pin"
                ? (prev.pos.x === wp.x && prev.pos.y === wp.y ? prev : { ...prev, pos: wp })
                : { id, type: "pin", pos: wp };
            });
          } else {
            const nodeHit = doc.nodes.find((n) => {
              const bbox = nodeBBox(n);
              return (
                wp.x >= bbox.x &&
                wp.x <= bbox.x + bbox.w &&
                wp.y >= bbox.y &&
                wp.y <= bbox.y + bbox.h
              );
            });
            if (nodeHit) {
              setHoverTarget((prev) =>
                prev?.id === nodeHit.id && prev.type === "node"
                  ? (prev.pos.x === wp.x && prev.pos.y === wp.y ? prev : { ...prev, pos: wp })
                  : { id: nodeHit.id, type: "node", pos: wp },
              );
            } else {
              const wireHit = findWireHit(doc.wires, wp, 0.3);
              setHoverTarget((prev) => {
                const id = wireHit?.id;
                if (!id) return prev === null ? null : null;
                return prev?.id === id && prev.type === "wire"
                  ? (prev.pos.x === wp.x && prev.pos.y === wp.y ? prev : { ...prev, pos: wp })
                  : { id, type: "wire", pos: wp };
              });
            }
          }
        });
      }
    }

    if (placement && g.type === "none") {
      pendingWirePointerRef.current = { x: e.clientX, y: e.clientY };
      if (!wirePreviewFrameRequested.current) {
        wirePreviewFrameRequested.current = true;
        requestAnimationFrame(() => {
          wirePreviewFrameRequested.current = false;
          const pos = pendingWirePointerRef.current;
          if (!pos || gesture.current.type !== "none") return;
          const lift = e.pointerType === "touch" ? TOUCH_LIFT_PX : 0;
          const wp = screenToWorld(pos.x, pos.y - lift);
          setGhostPos(snapToGrid(wp));
        });
      }
      return;
    }

    if (tool === "wire" && g.type === "none") {
      pendingWirePointerRef.current = { x: e.clientX, y: e.clientY };
      if (!wirePreviewFrameRequested.current) {
        wirePreviewFrameRequested.current = true;
        requestAnimationFrame(() => {
          wirePreviewFrameRequested.current = false;
          const pos = pendingWirePointerRef.current;
          if (!pos || gesture.current.type !== "none") return;
          const wp = screenToWorld(pos.x, pos.y);
          const pin = findPinAt(wp);
          setHoverPin(pin);
          if (pendingWire) {
            const end = pin ? { x: pin.x, y: pin.y } : snapToGrid(wp);
            const ignoreIds = new Set<string>();
            if (pendingWire.nodeId) ignoreIds.add(pendingWire.nodeId);
            if (pin) ignoreIds.add(pin.nodeId);
            setWirePreview({
              points: routeWire(pendingWire, end, ignoreIds),
              valid: true,
            });
          }
        });
      }
      return;
    }

    if (g.type === "pinch" && pointers.current.size >= 2) {
      if (!panFrameRequested.current) {
        panFrameRequested.current = true;
        requestAnimationFrame(() => {
          panFrameRequested.current = false;
          if (gesture.current.type !== "pinch" || !g.pinchCenter || !g.startView || g.pinchStartScale === undefined) return;
          const pts = Array.from(pointers.current.values()).slice(0, 2);
          if (pts.length < 2) return;
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const ratio = dist / (g.pinchStartDist || dist);
          const newScale = Math.max(
            0.2,
            Math.min(8, (g.pinchStartScale || 1) * ratio),
          );
          const rect = containerRef.current!.getBoundingClientRect();
          const localX = g.pinchCenter.x - rect.left;
          const localY = g.pinchCenter.y - rect.top;
          const sv = g.startView;
          const sScale = g.pinchStartScale;
          const nx = localX - ((localX - sv.x) / sScale) * newScale;
          const ny = localY - ((localY - sv.y) / sScale) * newScale;
          setView({ x: nx, y: ny, scale: newScale });
        });
      }
      return;
    }
    if (g.type === "pan") {
      if (!panFrameRequested.current) {
        panFrameRequested.current = true;
        requestAnimationFrame(() => {
          panFrameRequested.current = false;
          if (gesture.current.type !== "pan" || !g.startView || g.startX === undefined || g.startY === undefined) return;
          const curCoords = mouseCoords.current;
          if (!curCoords) return;
          setView({
            ...view,
            x: g.startView.x + (curCoords.x - g.startX),
            y: g.startView.y + (curCoords.y - g.startY),
          });
        });
      }
      return;
    }
    if (g.type === "multi-drag") {
      if (!dragFrameRequested.current) {
        dragFrameRequested.current = true;
        requestAnimationFrame(() => {
          dragFrameRequested.current = false;
          if (gesture.current.type !== "multi-drag" || g.startX === undefined || g.startY === undefined) return;
          const curCoords = mouseCoords.current;
          if (!curCoords) return;
          const lift = g.pointerType === "touch" ? TOUCH_LIFT_PX : 0;
          const startW = screenToWorld(g.startX!, g.startY!);
          const curW = screenToWorld(curCoords.x, curCoords.y - lift);
          if (!startW || !curW) return;
          const dx = curW.x - startW.x,
            dy = curW.y - startW.y;

          if (!g.moved) {
            commitHistory();
            g.moved = true;
          }

          let dxSnapped = dx;
          let dySnapped = dy;
          if (snap) {
            dxSnapped = Math.round(dx);
            dySnapped = Math.round(dy);
          } else {
            dxSnapped = Math.round(dx * 100) / 100;
            dySnapped = Math.round(dy * 100) / 100;
          }

          const nodeStarts = g.nodeStarts!;
          
          setDoc((d) => ({
            ...d,
            nodes: d.nodes.map((n) => {
              const startPos = nodeStarts.get(n.id);
              if (!startPos) return n;
              return { ...n, x: startPos.x + dxSnapped, y: startPos.y + dySnapped };
            }),
            wires: d.wires.map((w) => {
              // 1. If it is a rigid wire, move it rigidly
              const startPoints = g.wireStarts?.get(w.id);
              if (startPoints) {
                return {
                  ...w,
                  points: startPoints.map(p => ({ x: p.x + dxSnapped, y: p.y + dySnapped }))
                };
              }

              // 2. If it is a stretch wire, stretch its affected vertices
              const stretchEntries = g.stretchWires?.filter(sw => sw.wireId === w.id);
              if (stretchEntries && stretchEntries.length > 0) {
                const origPoints = stretchEntries[0].orig;
                const indices = stretchEntries.map(se => se.vertexIndex);
                const nextPoints = stretchWire(origPoints, indices, dxSnapped, dySnapped);
                return { ...w, points: nextPoints };
              }

              return w;
            }),
          }), true);
        });
      }
      return;
    }

    if (g.type === "selection") {
      g.currentX = e.clientX;
      g.currentY = e.clientY;
      // Throttle marquee redraws to one React render per animation frame.
      // Previously every pointermove forced a full Canvas render, which could freeze
      // the editor when selecting many symbols/wires.
      if (!selectionFrameRequested.current) {
        selectionFrameRequested.current = true;
        requestAnimationFrame(() => {
          selectionFrameRequested.current = false;
          if (gesture.current.type !== "selection") return;
          setGhostPos(prev => prev ? { ...prev } : { x: 0, y: 0 });
        });
      }
      return;
    }

    if (g.type === "drag" && g.nodeId) {
      if (!dragFrameRequested.current) {
        dragFrameRequested.current = true;
        requestAnimationFrame(() => {
          dragFrameRequested.current = false;
          if (gesture.current.type !== "drag" || !gesture.current.nodeId || g.startX === undefined || g.startY === undefined) return;
          const curCoords = mouseCoords.current;
          if (!curCoords) return;
          const lift = g.pointerType === "touch" ? TOUCH_LIFT_PX : 0;
          const startW = screenToWorld(g.startX!, g.startY!);
          const curW = screenToWorld(curCoords.x, curCoords.y - lift);
          if (!startW || !curW) return;
          const dx = curW.x - startW.x,
            dy = curW.y - startW.y;

          if (!g.moved) {
            commitHistory();
            g.moved = true;
          }

          let dxSnapped = dx;
          let dySnapped = dy;
          if (snap) {
            dxSnapped = Math.round(dx);
            dySnapped = Math.round(dy);
          } else {
            dxSnapped = Math.round(dx * 100) / 100;
            dySnapped = Math.round(dy * 100) / 100;
          }

          const id = g.nodeId;
          if (!g.nodeStart) return;
          const nx = g.nodeStart.x + dxSnapped,
            ny = g.nodeStart.y + dySnapped;
          const affected = g.affected ?? [];
          setDoc(
            (d) => ({
              ...d,
              nodes: d.nodes.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)),
              wires:
                affected.length === 0
                  ? d.wires
                  : d.wires.map((w) => {
                      const wireAffected = affected.filter((a) => a.wireId === w.id);
                      if (wireAffected.length === 0) return w;
                      const indices = wireAffected.map(a => a.vertexIndex);
                      const origPoints = wireAffected[0].orig;
                      const nextPoints = stretchWire(origPoints, indices, dxSnapped, dySnapped);
                      return { ...w, points: nextPoints };
                    }),
            }),
            true,
          );
          setDragInfo({ nodeId: id, x: nx, y: ny });

          const node = doc.nodes.find((nn) => nn.id === id);
          if (node) {
            const sym = SYMBOLS[node.symbol];
            if (sym) {
              const pins = transformedPins(sym, node.rotation, node.size).map(
                (p, i) => ({ x: node.x + p.x, y: node.y + p.y, hide: sym.pins[i].hide }),
              );
              for (const pin of pins) {
                if (pin.hide) continue;
                for (const w of doc.wires) {
                  if (
                    Math.hypot(w.points[0].x - pin.x, w.points[0].y - pin.y) < 0.45
                  ) {
                    setSnapWireHi(w.id);
                  }
                }
              }
            }
          }
        });
      }
      return;
    }
    if (
      g.type === "anchor" &&
      g.anchorWireId != null &&
      g.anchorIndex != null &&
      g.segOriginalPoints
    ) {
      const startW = screenToWorld(g.startX!, g.startY!);
      const curW = screenToWorld(e.clientX, e.clientY);
      const dx = curW.x - startW.x,
        dy = curW.y - startW.y;

      if (!g.moved) {
        commitHistory();
        g.moved = true;

        const w = doc.wires.find((wi) => wi.id === g.anchorWireId);
        if (w) {
          const pts = g.segOriginalPoints.map((p) => ({ ...p }));
          let idx = g.anchorIndex;
          if (idx === 0 && g.startPinInfo) {
            pts.splice(1, 0, { ...pts[0] });
            idx = 1;
            g.segOriginalPoints = pts;
            g.anchorIndex = idx;
          } else if (idx === pts.length - 1 && g.endPinInfo) {
            pts.splice(pts.length - 1, 0, { ...pts[pts.length - 1] });
            idx = pts.length - 2;
            g.segOriginalPoints = pts;
            g.anchorIndex = idx;
          }
        }
      }

      const wid = g.anchorWireId;
      const idx = g.anchorIndex;
      const original = g.segOriginalPoints;
      g.moved = true;
      setDoc((d) => {
        const nodes =
          g.attachedNodeId && g.attachedNodeStart
            ? d.nodes.map((n) =>
                n.id === g.attachedNodeId
                  ? {
                      ...n,
                      x: g.attachedNodeStart!.x + dx,
                      y: g.attachedNodeStart!.y + dy,
                    }
                  : n,
              )
            : d.nodes;

        const wires = d.wires.map((w) => {
          if (w.id === wid) {
            const pts = original.map((p) => ({ ...p }));
            const moved = { x: pts[idx].x + dx, y: pts[idx].y + dy };
            if (snap) {
              moved.x = Math.round(moved.x);
              moved.y = Math.round(moved.y);
            }
            pts[idx] = moved;

            // Force start/end points to stay on their connected pins!
            if (g.startPinInfo) {
              const startPos = getPinWorldPos(g.startPinInfo.nodeId, g.startPinInfo.pinIndex, d.nodes);
              if (startPos) {
                pts[0] = startPos;
              }
            }
            if (g.endPinInfo) {
              const endPos = getPinWorldPos(g.endPinInfo.nodeId, g.endPinInfo.pinIndex, d.nodes);
              if (endPos) {
                pts[pts.length - 1] = endPos;
              }
            }

            return { ...w, points: pts };
          }
          const other = g.attachedNodeOtherWires?.find(
            (o) => o.wireId === w.id,
          );
          if (other) {
            return {
              ...w,
              points: stretchWire(other.orig, other.vertexIndex, dx, dy),
            };
          }
          return w;
        });

        return { ...d, nodes, wires };
      }, true);
      return;
    }
    if (
      g.type === "wireSeg" &&
      g.segWireId != null &&
      g.segIndex != null &&
      g.segOriginalPoints
    ) {
      const startW = screenToWorld(g.startX!, g.startY!);
      const curW = screenToWorld(e.clientX, e.clientY);
      const dx = curW.x - startW.x,
        dy = curW.y - startW.y;
      if (!g.moved) {
        commitHistory();
        g.moved = true;
        
        const w = doc.wires.find((wi) => wi.id === g.segWireId);
        if (w) {
          const pts = g.segOriginalPoints.map((p) => ({ ...p }));
          let idx = g.segIndex;
          const isStartPin = idx === 0 && g.startPinInfo != null;
          const isEndPin = idx + 1 === pts.length - 1 && g.endPinInfo != null;
          
          if (isStartPin) {
            pts.splice(1, 0, { ...pts[0] });
            idx += 1;
          }
          if (isEndPin) {
            pts.splice(pts.length - 1, 0, { ...pts[pts.length - 1] });
          }
          g.segOriginalPoints = pts;
          g.segIndex = idx;
        }
      }
      const id = g.segWireId;
      const idx = g.segIndex;
      const orient = g.segOrient;
      const original = g.segOriginalPoints;
      setDoc(
        (d) => ({
          ...d,
          wires: d.wires.map((w) => {
            if (w.id !== id) return w;
            const pts = original.map((p) => ({ ...p }));
            if (orient === "h") {
              pts[idx].y += dy;
              pts[idx + 1].y += dy;
            } else {
              pts[idx].x += dx;
              pts[idx + 1].x += dx;
            }

            // Force start/end points to stay on their connected pins!
            if (g.startPinInfo) {
              const startPos = getPinWorldPos(g.startPinInfo.nodeId, g.startPinInfo.pinIndex, d.nodes);
              if (startPos) {
                pts[0] = startPos;
              }
            }
            if (g.endPinInfo) {
              const endPos = getPinWorldPos(g.endPinInfo.nodeId, g.endPinInfo.pinIndex, d.nodes);
              if (endPos) {
                pts[pts.length - 1] = endPos;
              }
            }

            return { ...w, points: pts };
          }),
        }),
        true,
      );
      return;
    }
    if (g.type === "wire" && g.wireStart) {
      pendingWirePointerRef.current = { x: e.clientX, y: e.clientY };
      if (!wirePreviewFrameRequested.current) {
        wirePreviewFrameRequested.current = true;
        requestAnimationFrame(() => {
          wirePreviewFrameRequested.current = false;
          const pos = pendingWirePointerRef.current;
          const current = gesture.current;
          if (!pos || current.type !== "wire" || !current.wireStart) return;
          const dx = pos.x - (current.startX ?? pos.x);
          const dy = pos.y - (current.startY ?? pos.y);
          if (Math.hypot(dx, dy) > 4) current.moved = true;
          const wp = screenToWorld(pos.x, pos.y);
          const endPin = findPinAt(wp);
          setHoverPin(endPin);
          const end = endPin ? { x: endPin.x, y: endPin.y } : snapToGrid(wp);
          const ignoreIds = new Set<string>();
          if (current.wireStartPin) ignoreIds.add(current.wireStartPin.nodeId);
          if (endPin) ignoreIds.add(endPin.nodeId);
          setWirePreview({
            points: routeWire(current.wireStart, end, ignoreIds),
            valid: true,
          });
        });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g.type === "selection") {
      const rect = containerRef.current!.getBoundingClientRect();
      const x1 = Math.min(g.startX!, g.currentX!);
      const y1 = Math.min(g.startY!, g.currentY!);
      const x2 = Math.max(g.startX!, g.currentX!);
      const y2 = Math.max(g.startY!, g.currentY!);
      
      const w1 = screenToWorld(x1, y1);
      const w2 = screenToWorld(x2, y2);
      
      const selectedNodes = doc.nodes.filter(n => {
        const bbox = nodeBBox(n);
        return bbox.x >= w1.x && (bbox.x + bbox.w) <= w2.x &&
               bbox.y >= w1.y && (bbox.y + bbox.h) <= w2.y;
      }).map(n => n.id);
      
      const selectedWires = doc.wires.filter(w => {
        return w.points.every(p => p.x >= w1.x && p.x <= w2.x && p.y >= w1.y && p.y <= w2.y);
      }).map(w => w.id);
      
      if (e.shiftKey) {
        setSelectedIds(Array.from(new Set([...selectedIds, ...selectedNodes])));
        setSelectedWireIds(Array.from(new Set([...selectedWireIds, ...selectedWires])));
      } else {
        setSelectedIds(selectedNodes);
        setSelectedWireIds(selectedWires);
      }
      
      gesture.current = { type: "none" };
      setGhostPos(prev => prev ? { ...prev } : { x: 0, y: 0 });
      return;
    }

    if (g.type === "multi-drag") {
      setDoc(d => {
        let nextDoc = d;
        g.nodeStarts?.forEach((_, id) => {
          nextDoc = autoConnect(nextDoc, id);
        });
        return nextDoc;
      }, true);
      setSelectedIds([...selectedIds]); // Trigger refresh
      gesture.current = { type: "none" };
      return;
    }

    if (g.type === "drag") {
      const id = g.nodeId;
      if (id) setDoc((d) => autoConnect(d, id));
      setDragInfo(null);
      setSnapWireHi(null);
    }

    if (g.type === "wire" && g.wireStart) {
      const wp = screenToWorld(e.clientX, e.clientY);
      const endPin = findPinAt(wp);
      const end = endPin ? { x: endPin.x, y: endPin.y } : snapToGrid(wp);
      const same = end.x === g.wireStart.x && end.y === g.wireStart.y;
      if (!g.moved) {
        if (pendingWire) {
          const samePending =
            end.x === pendingWire.x && end.y === pendingWire.y;
          if (!samePending) {
            const ignoreIds = new Set<string>();
            if (pendingWire.nodeId) ignoreIds.add(pendingWire.nodeId);
            if (endPin) ignoreIds.add(endPin.nodeId);
            const points = routeWire(pendingWire, end, ignoreIds).filter(
              (p, i, arr) =>
                i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y,
            );
            setDoc((d) => ({
              ...d,
              wires: [
                ...d.wires,
                {
                  id: crypto.randomUUID(),
                  points,
                  color: wireColor,
                  width: d.defaultWireWidth ?? 0.1,
                },
              ],
            }));
          }
          setPendingWire(null);
          setWirePreview(null);
        } else {
          setPendingWire({
            x: g.wireStart.x,
            y: g.wireStart.y,
            nodeId: g.wireStartPin?.nodeId,
          });
          setWirePreview({ points: [g.wireStart, g.wireStart], valid: true });
        }
      } else if (!same) {
        const ignoreIds = new Set<string>();
        if (g.wireStartPin) ignoreIds.add(g.wireStartPin.nodeId);
        if (endPin) ignoreIds.add(endPin.nodeId);
        const points = routeWire(g.wireStart, end, ignoreIds).filter(
          (p, i, arr) =>
            i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y,
        );
        setDoc((d) => ({
          ...d,
          wires: [
            ...d.wires,
            {
              id: crypto.randomUUID(),
              points,
              color: wireColor,
              width: d.defaultWireWidth ?? 0.1,
            },
          ],
        }));
        setPendingWire(null);
        setWirePreview(null);
      } else {
        setWirePreview(null);
      }
    }

    if (pointers.current.size < 2 && g.type === "pinch")
      gesture.current = { type: "none" };
    if (pointers.current.size === 0) {
      gesture.current = { type: "none" };
      setDragInfo(null);
      setSnapWireHi(null);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    pendingWheelRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      deltaY: e.deltaY,
    };
    if (zoomFrameRequested.current) return;

    zoomFrameRequested.current = true;
    requestAnimationFrame(() => {
      zoomFrameRequested.current = false;
      const wheel = pendingWheelRef.current;
      if (!wheel || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = wheel.clientX - rect.left;
      const localY = wheel.clientY - rect.top;
      const delta = -wheel.deltaY * 0.0015;
      setView((prev) => {
        const newScale = Math.max(0.1, Math.min(10, prev.scale * (1 + delta)));
        const nx = localX - ((localX - prev.x) / prev.scale) * newScale;
        const ny = localY - ((localY - prev.y) / prev.scale) * newScale;
        return { x: nx, y: ny, scale: newScale };
      });
    });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (placement) {
      e.preventDefault();
      onCancelPlace?.();
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (isSimulating) return;
    const clickWp = screenToWorld(e.clientX, e.clientY);
    const nodeHit = [...doc.nodes].reverse().find((n) => {
      const b = nodeBBox(n);
      return clickWp.x >= b.x && clickWp.x <= b.x + b.w && clickWp.y >= b.y && clickWp.y <= b.y + b.h;
    });
    if (nodeHit && onOpenProperties) {
      const id = nodeHit.id;
      setSelectedId(id);
      setSelectedWireId(null);
      onOpenProperties(id);
      return;
    }

    // Check if double clicked on wire
    const hit = findWireHit(doc.wires, clickWp, 0.45);
    if (hit) {
      setSelectedId(null);
      setSelectedWireId(hit.wireId);
      if (onOpenWireProperties) {
        onOpenWireProperties(hit.wireId);
      }
      return;
    }

    if (!selectedWireId) return;
    // Anchor (wire vertex handle) hit test, geometric: nearest point on the selected wire
    // within its visual radius (0.22 world units — matches the <circle r={0.22}> handles).
    const selWire = doc.wires.find((wi) => wi.id === selectedWireId);
    const anchorHit = selWire
      ? selWire.points.reduce<{ idx: number; d: number } | null>((best, p, i) => {
          const d = Math.hypot(p.x - clickWp.x, p.y - clickWp.y);
          if (d <= 0.22 && (!best || d < best.d)) return { idx: i, d };
          return best;
        }, null)
      : null;
    if (anchorHit) {
      const idx = anchorHit.idx;
      const wid = selectedWireId;
      if (idx > 0) {
        setDoc((d) => ({
          ...d,
          wires: d.wires.map((w) => {
            if (w.id !== wid || idx >= w.points.length - 1) return w;
            const pts = w.points.filter((_, i) => i !== idx);
            return { ...w, points: pts };
          }),
        }));
        return;
      }
    }
    const wp = screenToWorld(e.clientX, e.clientY);
    const w = doc.wires.find((wi) => wi.id === selectedWireId);
    if (!w) return;
    const split = splitWireAtPoint(
      w,
      snap ? { x: Math.round(wp.x), y: Math.round(wp.y) } : wp,
      0.45,
    );
    if (split)
      setDoc((d) => ({
        ...d,
        wires: d.wires.map((wi) => (wi.id === w.id ? split : wi)),
      }));
  };

  const gridSize = GRID * view.scale;

  const junctions = useMemo(() => {
    const explicit = (doc.junctions ?? []).map(j => ({ x: j.x, y: j.y, diameter: j.diameter }));
    const derived = computeJunctions(doc.wires).map(j => ({ x: j.x, y: j.y, diameter: undefined }));
    const seen = new Set<string>();
    const merged: { x: number; y: number; diameter?: number }[] = [];
    for (const j of [...explicit, ...derived]) {
      const key = `${Math.round(j.x * 100)},${Math.round(j.y * 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(j);
    }
    return merged;
  }, [doc.junctions, doc.wires]);
  const crossings = useMemo(() => computeCrossings(doc.wires), [doc.wires]);
  const crossingMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }[]>();
    for (const c of crossings) {
      const arr = m.get(c.wireId) ?? [];
      arr.push({ x: c.x, y: c.y });
      m.set(c.wireId, arr);
    }
    return m;
  }, [crossings]);

  const renderWirePath = (w: SchematicWire) => {
    if (wireStyle === "curved" && w.points.length >= 3) {
      const r = 0.35;
      let d = `M ${w.points[0].x} ${w.points[0].y}`;
      for (let i = 1; i < w.points.length - 1; i++) {
        const a = w.points[i - 1],
          b = w.points[i],
          c = w.points[i + 1];
        const dirA = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
        const dirC = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
        const lenAB = Math.hypot(b.x - a.x, b.y - a.y);
        const lenBC = Math.hypot(c.x - b.x, c.y - b.y);
        const rr = Math.min(r, lenAB / 2, lenBC / 2);
        const p1 = { x: b.x - dirA.x * rr, y: b.y - dirA.y * rr };
        const p2 = { x: b.x + dirC.x * rr, y: b.y + dirC.y * rr };
        d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`;
      }
      const last = w.points[w.points.length - 1];
      d += ` L ${last.x} ${last.y}`;
      return d;
    }
    const hops = crossingMap.get(w.id) ?? [];
    let d = "";
    const HOP = 0.35;
    for (let i = 0; i < w.points.length; i++) {
      const p = w.points[i];
      if (i === 0) {
        d += `M ${p.x} ${p.y}`;
        continue;
      }
      const prev = w.points[i - 1];
      const isH = Math.abs(prev.y - p.y) < 1e-6;
      if (isH && hops.length) {
        const dir = Math.sign(p.x - prev.x);
        const segHops = hops
          .filter(
            (h) =>
              Math.abs(h.y - p.y) < 1e-6 &&
              (dir > 0 ? h.x > prev.x && h.x < p.x : h.x < prev.x && h.x > p.x),
          )
          .sort((a, b) => dir * (a.x - b.x));
        for (const h of segHops) {
          d += ` L ${h.x - dir * HOP} ${p.y}`;
          d += ` A ${HOP} ${HOP} 0 0 ${dir > 0 ? 1 : 0} ${h.x + dir * HOP} ${p.y}`;
        }
        d += ` L ${p.x} ${p.y}`;
      } else {
        d += ` L ${p.x} ${p.y}`;
      }
    }
    return d;
  };

  // Shared banner geometry for a net label — same math used by the old SVG path `d` strings
  // (localFlagPath / globalPortPath), factored out so the WebGL renderer and the geometric
  // click hit-test can't drift apart.
  const netLabelGeometry = (label: SchematicNetLabel) => {
    const isGlobal = label.scope === "global";
    const charWidth = 0.28;
    const padLeft = isGlobal ? 0.44 : 0.38;
    const padRight = isGlobal ? 0.38 : 0.22;
    const width = Math.max(1.15, padLeft + label.text.length * charWidth + padRight);
    const height = 0.68;
    const halfH = height / 2;
    const shape = String(label.shape || "");
    let points: [number, number][];
    if (!isGlobal) {
      // Local labels are the simple flag shape used by KiCad's SCH_LABEL.
      points = [
        [0, 0], [0.32, -halfH], [width, -halfH], [width, halfH], [0.32, halfH],
      ];
    } else if (shape === "input") {
      // KiCad global input: pointed electrical side, flat tail.
      points = [[0,0],[0.34,-halfH],[width,-halfH],[width,halfH],[0.34,halfH]];
    } else if (shape === "output") {
      // Output is the mirrored flag.
      points = [[0,0],[0.28,-halfH],[width,-halfH],[width-0.34,0],[width,halfH],[0.28,halfH]];
    } else if (shape === "bidirectional" || shape === "tri_state" || shape === "passive") {
      // Preserve the semantic family with a symmetric/flat-ended outline.
      points = [[0,0],[0.30,-halfH],[width-0.30,-halfH],[width,0],[width-0.30,halfH],[0.30,halfH]];
    } else {
      points = [[0,0],[0.32,-halfH],[width-0.28,-halfH],[width,0],[width-0.28,halfH],[0.32,halfH]];
    }
    const textLocalX = isGlobal ? (padLeft + width - padRight) / 2 : (padLeft + width - padRight) / 2 + 0.04;
    return { isGlobal, width, height, halfH, points, textLocalX, textLocalY: 0.02 };
  };

  // renderPinLabel was replaced by webglPinLabelInstances (see below) — pin name labels are
  // now WebGL-rendered, same geometry, no SVG left behind.


  const dragOverlay = (() => {
    if (!dragInfo) return null;
    const n = doc.nodes.find((nn) => nn.id === dragInfo.nodeId);
    if (!n) return null;
    const sym = SYMBOLS[n.symbol];
    if (!sym) return null;
    const cx = n.x + sym.width / 2,
      cy = n.y + sym.height / 2;
    const sx = cx * GRID * view.scale + view.x,
      sy = cy * GRID * view.scale + view.y;
    return (
      <>
        <line
          x1={0}
          y1={sy}
          x2={size.w}
          y2={sy}
          stroke="#2563eb"
          strokeWidth={0.5}
          strokeDasharray="4,3"
          opacity={0.4}
          pointerEvents="none"
        />
        <line
          x1={sx}
          y1={0}
          x2={sx}
          y2={size.h}
          stroke="#2563eb"
          strokeWidth={0.5}
          strokeDasharray="4,3"
          opacity={0.4}
          pointerEvents="none"
        />
        <g pointerEvents="none">
          <rect
            x={sx + 8}
            y={sy - 28}
            width={96}
            height={22}
            rx={4}
            fill="#0f172a"
            opacity={0.92}
          />
          <text
            x={sx + 56}
            y={sy - 13}
            fontSize={11}
            textAnchor="middle"
            fill="#e6edf6"
            fontFamily="ui-monospace, monospace"
          >
            X {n.x.toFixed(1)} Y {n.y.toFixed(1)}
          </text>
        </g>
      </>
    );
  })();

  // ghostOverlay moved to WebGL (symbol/wire instances + selection rect)

  const webglAlignmentMatches = useMemo<AlignmentMatchGuide[]>(() => {
    if (!dragInfo) return [];
    const node = doc.nodes.find((nn) => nn.id === dragInfo.nodeId);
    if (!node) return [];
    const sym = SYMBOLS[node.symbol];
    if (!sym) return [];
    const myPoints = [
      ...transformedPins(sym, node.rotation, node.size).map((p) => ({
        x: node.x + p.x,
        y: node.y + p.y,
      })),
      {
        x: node.x + (sym.width * node.size) / 2,
        y: node.y + (sym.height * node.size) / 2,
      },
      { x: node.x, y: node.y },
      { x: node.x + sym.width * node.size, y: node.y + sym.height * node.size },
    ];
    const others: { x: number; y: number }[] = [];
    for (const n of doc.nodes) {
      if (n.id === node.id) continue;
      const s = SYMBOLS[n.symbol];
      if (!s) continue;
      transformedPins(s, n.rotation, n.size).forEach((p) =>
        others.push({ x: n.x + p.x, y: n.y + p.y }),
      );
      others.push({
        x: n.x + (s.width * n.size) / 2,
        y: n.y + (s.height * n.size) / 2,
      });
      others.push({ x: n.x, y: n.y });
      others.push({ x: n.x + s.width * n.size, y: n.y + s.height * n.size });
    }
    const TOL = 0.05;
    const matches: AlignmentMatchGuide[] = [];
    const seen = new Set<string>();
    for (const mp of myPoints) {
      for (const op of others) {
        if (Math.abs(mp.y - op.y) < TOL) {
          const key = `h:${mp.y.toFixed(2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            matches.push({ axis: "h", my: mp, other: op });
          }
        }
        if (Math.abs(mp.x - op.x) < TOL) {
          const key = `v:${mp.x.toFixed(2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            matches.push({ axis: "v", my: mp, other: op });
          }
        }
      }
    }
    return matches;
  }, [dragInfo, doc.nodes]);

  // Instances for the WebGL symbol-body pass. Deliberately mirrors (a simplified copy of) the
  // color logic in the per-node SVG render below — see SchematicWebGLSymbols.tsx's file
  // comment for exactly which cases are excluded here and still rendered via SVG instead.
  const webglSymbolInstances = useMemo<SymbolInstance[]>(() => {
    const list: SymbolInstance[] = [];
    for (const n of doc.nodes) {
      if (realistic) continue;
      const nativeParsed = n.symbol?.startsWith("kicad:") ? getImportedKiCadParsedSymbol(n.symbol) : undefined;
      const catalogSym = SYMBOLS[n.symbol];
      const sym = catalogSym ?? (nativeParsed ? {
        id: n.symbol, category: "ic" as const,
        width: Math.max(0.5, (nativeParsed.bbox.maxX - nativeParsed.bbox.minX) / 2.54),
        height: Math.max(0.5, (nativeParsed.bbox.maxY - nativeParsed.bbox.minY) / 2.54),
        pins: nativeParsed.pins.map((p) => ({ x: (p.at.x - nativeParsed.bbox.minX) / 2.54, y: (nativeParsed.bbox.maxY - p.at.y) / 2.54, number: p.number || undefined, name: p.name !== "~" ? p.name : undefined, hide: p.hide })),
        prefix: nativeParsed.reference || "U", defaultValue: nativeParsed.value || nativeParsed.name, draw: () => null,
      } : undefined);
      if (!sym) continue;
      if (n.symbol === "text") continue;
      // Native KiCad symbols now use the same WebGL vector pipeline as built-in
      // symbols. Their text is emitted by the dedicated SDF badge pass below.
      // Capacitor breathing is now handled via animated scale on the WebGL instance

      const hasNetPin = highlightedNetIds
        ? sym.pins.some((_, i) => {
            const pNet = netIndex.pinNet.get(`${n.id}:${i}`);
            return pNet !== undefined && highlightedNetIds.includes(pNet);
          })
        : highlightedNet != null &&
          sym.pins.some(
            (_, i) => netIndex.pinNet.get(`${n.id}:${i}`) === highlightedNet,
          );

      const isLedOn = n.symbol === "led" && isSimulating && (() => {
        const cur = Math.abs(getElementCurrent(getComponentRef(n)));
        const brightness = cur < 0.00001 ? 0 : Math.min(1, cur * 100);
        return brightness >= 0.02;
      })();
      const isLedWhiteToRed = n.symbol === "led" && isLedOn && n.color === "white";
      const effectiveColor = isLedWhiteToRed ? "red" : n.color;
      const nodeColor = effectiveColor
        ? getWireColorHex(effectiveColor)
        : getWireColorHex(doc.defaultElementColor || "black");

      let componentColor = hasNetPin ? "#2563eb" : nodeColor;
      let color2: string | undefined;
      let gradP0: [number, number] | undefined;
      let gradP1: [number, number] | undefined;

      if (isSimulating && sym.pins.length > 0 && !hasNetPin) {
        const pinVoltages = sym.pins.map((_, i) => {
          const netId = netIndex.pinNet.get(`${n.id}:${i}`);
          return netId !== undefined ? getNetVoltage(netId) : 0;
        });
        if (sym.pins.length === 2) {
          const c1 = pinVoltages[0] > 0.001 ? "#4ade80" : "#94a3b8";
          const c2 = pinVoltages[1] > 0.001 ? "#4ade80" : "#94a3b8";
          if (c1 === c2) {
            componentColor = c1;
          } else {
            // Dual-tone voltage gradient along pin0 → pin1 (WebGL per-vertex blend).
            componentColor = c1;
            color2 = c2;
            gradP0 = [sym.pins[0].x, sym.pins[0].y];
            gradP1 = [sym.pins[1].x, sym.pins[1].y];
          }
        } else {
          const allPositive = pinVoltages.every((v) => v > 0.001);
          const allNegative = pinVoltages.every((v) => v <= 0.001);
          if (allPositive) componentColor = "#4ade80";
          else if (allNegative) componentColor = "#94a3b8";
        }
      }

      list.push({
        id: n.id,
        symbolId: n.symbol,
        x: n.x,
        y: n.y,
        rotation: n.rotation,
        scale: n.size ?? 1,
        color: componentColor,
        color2,
        gradP0,
        gradP1,
        breathing: n.symbol === "capacitor" && isSimulating,
        kicadBackground: KICAD_BODY_FILL,
        kicadFields: n.metadata?.kicadNative ? n.metadata?.kicadFields : undefined,
        kicadNodeId: n.metadata?.kicadNative ? n.id : undefined,
      });
    }
    // Ghost placement symbols (semi-transparent blue)
    if (placement && ghostPos && !realistic) {
      if (placement.multi) {
        const { nodes } = placement.multi;
        let minX = Infinity, minY = Infinity;
        nodes.forEach((n) => {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
        });
        if (minX !== Infinity) {
          const dx = ghostPos.x - minX, dy = ghostPos.y - minY;
          for (const n of nodes) {
            if (!SYMBOLS[n.symbol]) continue;
            list.push({
              id: `ghost-${n.id}`,
              symbolId: n.symbol,
              x: n.x + dx,
              y: n.y + dy,
              rotation: n.rotation ?? 0,
              scale: n.size ?? 1,
              color: "#2563eb",
              alpha: 0.5,
            });
          }
        }
      } else if (placement.symbol && SYMBOLS[placement.symbol]) {
        list.push({
          id: "ghost-placement",
          symbolId: placement.symbol,
          x: ghostPos.x,
          y: ghostPos.y,
          rotation: (placement.rotation ?? 0) as 0 | 90 | 180 | 270,
          scale: 1,
          color: "#2563eb",
          alpha: 0.55,
        });
      }
    }
    return list;
  }, [
    doc.nodes,
    doc.defaultElementColor,
    realistic,
    isSimulating,
    highlightedNet,
    highlightedNetIds,
    netIndex,
    getNetVoltage,
    isDark,
    placement,
    ghostPos,
  ]);

  const webglSymbolNodeIds = useMemo(
    () => new Set(webglSymbolInstances.map((i) => i.id)),
    [webglSymbolInstances]
  );

  // Instances for the WebGL wires pass. Mirrors (a copy of) the color/width logic in the
  // per-wire SVG render below for the non-realistic case — see SchematicWebGLWires.tsx's file
  // comment for exactly what stays on SVG (realistic mode, dashed selection outline, sim glow,
  // voltage tooltip, and all pointer interaction/hit-testing).
  const webglWireInstances = useMemo<WireInstance[]>(() => {
    if (realistic) return [];
    const list: WireInstance[] = [];
    for (const w of doc.wires) {
      if (!w.points || w.points.length === 0) continue;
      const isSel = selectedWireIds.includes(w.id);
      const wireNetId = netIndex.wireNet.get(w.id);
      const inNet = highlightedNetIds
        ? wireNetId !== undefined && highlightedNetIds.includes(wireNetId)
        : highlightedNet != null && wireNetId === highlightedNet;
      const isSnapHi = w.id === snapWireHi;
      const baseColor = getWireColorHex(w.color);

      const voltage = isSimulating ? getNetVoltage(wireNetId ?? 0) : 0;
      const stroke = isSimulating
        ? voltage > 0.001 ? "#4ade80" : "#94a3b8"
        : isSnapHi
          ? "#16a34a"
          : inNet
            ? "#2563eb"
            : baseColor;

      const customWidth = w.width ?? 0.1;
      const sw = isSel
        ? customWidth * 1.8
        : inNet || isSnapHi
          ? customWidth * 1.5
          : isSimulating
            ? 0.15
            : customWidth;

      list.push({ id: w.id, d: renderWirePath(w), color: stroke, width: sw });
    }
    // Ghost placement wires (multi paste)
    if (placement?.multi && ghostPos) {
      const { nodes, wires } = placement.multi;
      let minX = Infinity, minY = Infinity;
      nodes.forEach((n) => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
      });
      wires.forEach((w) =>
        w.points.forEach((p) => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
        })
      );
      if (minX !== Infinity) {
        const dx = ghostPos.x - minX, dy = ghostPos.y - minY;
        for (const w of wires) {
          if (!w.points?.length) continue;
          const pts = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          list.push({ id: `ghost-wire-${w.id}`, d, color: "#2563eb", width: 0.1, alpha: 0.5 });
        }
      }
    }
    return list;
  }, [
    doc.wires,
    realistic,
    selectedWireIds,
    netIndex,
    highlightedNet,
    highlightedNetIds,
    snapWireHi,
    isSimulating,
    getNetVoltage,
    isDark,
    wireStyle,
    crossingMap,
    placement,
    ghostPos,
  ]);

  // Realistic view: pins of board-type modules (Arduino, ESP32, STM32, displays, sensor
  // breakouts …). A wire plugged into one of these pins is drawn ABOVE the board body, like a
  // real jumper pushed into a header hole.
  const BOARD_SYMBOL_RE = /arduino|esp|stm32|pico|nodemcu|wroom|raspberry|lcd|oled|tft|display|dot_matrix|buck|boost|charger|dcdc|lm2596|ultrasonic|pir|gas|nrf24|bluetooth|hc05|sensor/i;
  const boardPinPoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (const n of doc.nodes) {
      if (!BOARD_SYMBOL_RE.test(String(n.symbol))) continue;
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      for (const p of transformedPins(sym, n.rotation, n.size)) {
        pts.push({ x: n.x + p.x, y: n.y + p.y });
      }
    }
    return pts;
  }, [doc.nodes]);

  const wireTouchesBoard = useCallback(
    (w: (typeof doc.wires)[number]) => {
      const pts = w.points;
      if (!pts || pts.length === 0 || boardPinPoints.length === 0) return false;
      const near = (px: number, py: number) =>
        boardPinPoints.some((bp) => Math.abs(bp.x - px) < 0.2 && Math.abs(bp.y - py) < 0.2);
      const a = pts[0], b = pts[pts.length - 1];
      return near(a.x, a.y) || near(b.x, b.y);
    },
    [boardPinPoints]
  );

  // Realistic-mode wires are drawn by a different pass (layered shadow/sleeve/highlight +
  // solder blobs) than the plain-mode one above — see SchematicWebGLRealisticWires.tsx.
  const webglRealisticWireInstances = useMemo<RealisticWireInstance[]>(() => {
    if (!realistic) return [];
    const list: RealisticWireInstance[] = [];
    for (const w of doc.wires) {
      if (!w.points || w.points.length === 0) continue;
      const wireNetId = netIndex.wireNet.get(w.id);
      const inNet = highlightedNetIds
        ? wireNetId !== undefined && highlightedNetIds.includes(wireNetId)
        : highlightedNet != null && wireNetId === highlightedNet;
      const isSnapHi = w.id === snapWireHi;
      const baseColor = getWireColorHex(w.color);
      const voltage = isSimulating ? getNetVoltage(wireNetId ?? 0) : 0;
      const stroke = isSimulating
        ? voltage > 0.001 ? "#4ade80" : "#94a3b8"
        : isSnapHi
          ? "#16a34a"
          : inNet
            ? "#2563eb"
            : baseColor;
      // Bare copper / silver keep their metal look; an active highlight (simulation, snap, net) only tints it.
      const overridden = isSimulating || isSnapHi || inNet;
      list.push({ id: w.id, d: renderWirePath(w), color: stroke, material: w.realisticMaterial ?? doc.defaultWireMaterial ?? "copper", tinted: overridden, overBoard: wireTouchesBoard(w) });
    }
    return list;
  }, [realistic, doc.wires, doc.defaultWireMaterial, netIndex, highlightedNet, highlightedNetIds, snapWireHi, isSimulating, getNetVoltage, wireTouchesBoard]);

  const webglWireIds = useMemo(() => new Set(webglWireInstances.map((i) => i.id)), [webglWireInstances]);
  const webglRealisticWireIds = useMemo(
    () => new Set(webglRealisticWireInstances.map((i) => i.id)),
    [webglRealisticWireInstances]
  );

  // Same list, filtered: the glow halo only while simulating, the dashed outline only for
  // selected wires. Both stay empty in realistic mode (webglWireInstances is [] there too),
  // which correctly leaves the equivalent SVG overlays visible for that case.
  const webglGlowInstances = useMemo(
    () => (isSimulating ? webglWireInstances : []),
    [isSimulating, webglWireInstances]
  );
  const webglSelectionInstances = useMemo(
    () => webglWireInstances.filter((i) => selectedWireIds.includes(i.id)),
    [webglWireInstances, selectedWireIds]
  );
  const webglCurrentFlowInstances = useMemo(() => {
    if (!isSimulating) return [];
    const list: { id: string; d: string; current: number }[] = [];
    // Wires on either plain or realistic WebGL path
    for (const w of doc.wires) {
      const onWebGL = webglWireIds.has(w.id) || webglRealisticWireIds.has(w.id);
      if (!onWebGL || !w.points || w.points.length === 0) continue;
      const sI = getWirePinCurrent(w.points[0].x, w.points[0].y);
      const eI = getWirePinCurrent(
        w.points[w.points.length - 1].x,
        w.points[w.points.length - 1].y
      );
      const current = Math.abs(sI) > Math.abs(eI) ? sI : -eI;
      if (Math.abs(current) < 1e-6) continue;
      list.push({ id: w.id, d: renderWirePath(w), current });
    }
    // 2-pin component bodies (was SVG CurrentFlow inside each node)
    if (view.scale > 0.6) {
      for (const n of doc.nodes) {
        const sym = SYMBOLS[n.symbol];
        if (!sym || sym.pins.length !== 2) continue;
        if (n.symbol === "text") continue;
        const stats = getComponentStats(n);
        if (!stats || Math.abs(stats.current) < 1e-6) continue;
        const pins = transformedPins(sym, n.rotation, n.size ?? 1);
        if (pins.length < 2) continue;
        const x0 = n.x + pins[0].x, y0 = n.y + pins[0].y;
        const x1 = n.x + pins[1].x, y1 = n.y + pins[1].y;
        list.push({
          id: `comp-flow-${n.id}`,
          d: `M ${x0} ${y0} L ${x1} ${y1}`,
          current: stats.current,
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, doc.wires, doc.nodes, webglWireIds, webglRealisticWireIds, getWirePinCurrent, getComponentStats, view.scale]);

  const webglNetLabelInstances = useMemo<NetLabelInstance[]>(() => {
    return (doc.netLabels ?? [])
      .filter((label) => label.visible !== false)
      .map((label) => {
        const netId = netIndex.labelNet.get(label.id);
        const isHighlighted = highlightedNetIds?.includes(netId ?? -1) ?? false;
        const isGlobal = label.scope === "global";
        const upperText = label.text.toUpperCase();
        const isGnd = upperText === "GND" || upperText === "AGND" || upperText === "DGND" || upperText === "0V" || upperText.startsWith("GND");
        const isPower = upperText === "VCC" || upperText === "VDD" || upperText === "VBAT" || upperText === "+5V" || upperText === "+3.3V" || upperText === "+12V" || upperText === "+24V" || upperText.startsWith("+");
        const netVoltage = isSimulating && netId !== undefined ? getNetVoltage(netId) : null;

        let strokeColor = isGlobal ? "#a855f7" : "#0284c7";
        // KiCad label shapes are outlines; their interior is transparent.
        // The previous filled badges made local labels look like blue boxes and
        // hid the pin/wire geometry underneath them.
        let bgColor = "rgba(0, 0, 0, 0)";
        let textColor = isGlobal ? (isDark ? "#c084fc" : "#7e22ce") : (isDark ? "#38bdf8" : "#0369a1");

        if (isGnd) {
          strokeColor = "#10b981";
          bgColor = "rgba(0, 0, 0, 0)";
          textColor = isDark ? "#6ee7b7" : "#047857";
        } else if (isPower) {
          strokeColor = "#f59e0b";
          bgColor = "rgba(0, 0, 0, 0)";
          textColor = isDark ? "#fcd34d" : "#b45309";
        }
        if (isHighlighted) {
          strokeColor = "#3b82f6";
          bgColor = "rgba(0, 0, 0, 0)";
          textColor = isDark ? "#93c5fd" : "#1d4ed8";
        } else if (isSimulating && netVoltage !== null && Math.abs(netVoltage) > 0.05) {
          strokeColor = "#10b981";
          textColor = isDark ? "#4ade80" : "#059669";
        }

        const geo = netLabelGeometry(label);
        const rawRot = ((label.rotation ?? 0) + 360) % 360;
        // KiCad's label spin style is not a literal 180-degree text rotation.
        // LEFT/RIGHT stay horizontal and UP/BOTTOM stay vertical; justification
        // determines which side of the electrical anchor the glyphs occupy.
        const textRotationDeg = rawRot === 90 ? -90 : rawRot === 270 ? 90 : 0;
        // The label outline rotates with the KiCad spin style, while the glyphs
        // remain readable. In particular, a 180° label is NOT a 180° text
        // rotation: its banner points in the opposite direction and the text
        // stays horizontal.
        const shapeRotationDeg = rawRot === 90 ? -90 : rawRot === 270 ? 90 : rawRot;
        const justify = label.justify ?? (rawRot === 180 || rawRot === 270 ? "right" : "left");
        const verticalAlign = label.verticalAlign === "top" ? "top" : label.verticalAlign === "bottom" ? "bottom" : "middle";
        // Keep the electrical anchor/shape orientation exactly as imported, but place the
        // visible net name in the visual center of its banner.  This avoids the old
        // left/right text drift where the glyphs sat against the flag tip instead of inside
        // the body.  Rotation/mirroring is still handled by the text pass.
        const textLocalX = geo.width / 2;
        return {
          id: label.id,
          x: label.x,
          y: label.y,
          // raw KiCad 90/270 are schematic-coordinate vertical orientations.
          // The WebGL scene has Y-down screen coordinates, so the visible banner must
          // use the same screen rotation as the readable glyphs: 90 -> -90 and 270 -> +90.
          rotationDeg: shapeRotationDeg,
          points: geo.points,
          bgColor,
          strokeColor,
          text: label.text,
          textColor,
          textLocalX,
          textLocalY: geo.textLocalY,
          fontSize: label.fontSize ?? 0.42,
          justify: "center",
          verticalAlign: "middle",
          mirror: !!label.mirror,
          textRotationDeg,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.netLabels, netIndex, highlightedNetIds, isDark, isSimulating, getNetVoltage]);

  const webglWireVoltageBadgeInstances = useMemo<BadgeInstance[]>(() => {
    if (!isSimulating || view.scale <= 0.6) return [];
    const list: BadgeInstance[] = [];
    for (const w of doc.wires) {
      if (!webglWireIds.has(w.id) || !w.points.length) continue;
      const wireNetId = netIndex.wireNet.get(w.id);
      const voltage = getNetVoltage(wireNetId ?? 0);
      const cx = w.points[0].x + (w.points[w.points.length - 1].x - w.points[0].x) / 2;
      const cy = w.points[0].y + (w.points[w.points.length - 1].y - w.points[0].y) / 2 - 0.45;
      list.push({
        id: w.id,
        x: cx,
        y: cy,
        width: 1.7,
        height: 0.64,
        bgColor: "#1c0a00",
        borderColor: "#f97316",
        borderWidth: 0.06,
        text: `${voltage.toFixed(1)}V`,
        textColor: "#fdba74",
        fontSize: 0.42,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, view.scale, doc.wires, webglWireIds, netIndex, getNetVoltage]);

  const webglNetLabelVoltageBadgeInstances = useMemo<BadgeInstance[]>(() => {
    if (!isSimulating) return [];
    const list: BadgeInstance[] = [];
    for (const label of doc.netLabels ?? []) {
      if (label.visible === false) continue;
      const netId = netIndex.labelNet.get(label.id);
      const netVoltage = netId !== undefined ? getNetVoltage(netId) : null;
      if (netVoltage === null) continue;
      const geo = netLabelGeometry(label);
      const angle = ((label.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const localX = geo.width + 0.7, localY = 0;
      const worldX = label.x + (localX * cos - localY * sin);
      const worldY = label.y + (localX * sin + localY * cos);
      list.push({
        id: `${label.id}-voltage`,
        x: worldX,
        y: worldY,
        width: 1.1,
        height: 0.52,
        bgColor: isDark ? "#090d16" : "#ffffff",
        borderColor: "#10b981",
        borderWidth: 0.04,
        text: `${netVoltage.toFixed(1)}V`,
        textColor: "#10b981",
        fontSize: 0.28,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, doc.netLabels, netIndex, getNetVoltage, isDark]);

  // Component reference ("R1") / value ("10k") labels above/below each symbol, plus free-text
  // annotation nodes (symbol === "text"). Positioned outside the symbol's own footprint, so
  // this is safe to move to WebGL even for symbols whose body is still SVG (realistic mode) —
  // same reasoning as the wire overlays above.
  const webglComponentLabelInstances = useMemo<BadgeInstance[]>(() => {
    const list: BadgeInstance[] = [];
    for (const n of doc.nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      const cx = sym.width / 2;
      const isLedOn = n.symbol === "led" && isSimulating && (() => {
        const i = Math.abs(getElementCurrent(getComponentRef(n)));
        return i >= 0.00001 ? Math.min(1, i * 100) >= 0.02 : false;
      })();
      const isLedWhiteToRed = n.symbol === "led" && isLedOn && n.color === "white";
      const effectiveColor = isLedWhiteToRed ? "red" : n.color;
      const labelColor = effectiveColor ? getWireColorHex(effectiveColor) : getWireColorHex(doc.defaultElementColor || "black");

      if (n.symbol === "text") {
        if (n.value) {
          list.push({
            id: `${n.id}-text`,
            x: n.x + cx,
            y: n.y + sym.height / 2,
            width: 0,
            height: 0,
            text: n.value,
            textColor: labelColor,
            fontSize: 0.6,
          });
        }
        continue;
      }

      const stats = isSimulating ? getComponentStats(n) : null;
      let liveValueStr = "";
      if (isSimulating && stats) {
        if (n.symbol === "voltmeter") {
          const v = stats.voltage, absV = Math.abs(v);
          liveValueStr = absV >= 1 ? `${v.toFixed(2)} V` : absV >= 1e-3 ? `${(v * 1000).toFixed(1)} mV` : absV >= 1e-6 ? `${(v * 1e6).toFixed(1)} µV` : "0.00 V";
        } else if (n.symbol === "ammeter") {
          const i = stats.current, absI = Math.abs(i);
          liveValueStr = absI >= 1 ? `${i.toFixed(2)} A` : absI >= 1e-3 ? `${(i * 1000).toFixed(1)} mA` : absI >= 1e-6 ? `${(i * 1e6).toFixed(1)} µA` : "0.00 A";
        }
      }

      const nativeFields = n.metadata?.kicadNative ? n.metadata?.kicadFields : undefined;
      if (n.reference && !n.metadata?.kicadNative && !nativeFields?.referenceHidden) {
        const refWidth = Math.max(1.0, n.reference.length * 0.45 + 0.4);
        list.push({
          id: `${n.id}-ref`,
          x: n.x + cx,
          y: n.y - 0.7,
          width: refWidth,
          height: 0.8,
          bgColor: isSimulating ? (isDark ? "#2e1065" : "#f3e8ff") : undefined,
          borderColor: isSimulating ? (isDark ? "#a855f7" : "#c084fc") : undefined,
          borderWidth: 0.04,
          text: n.reference,
          textColor: isSimulating ? (isDark ? "#e9d5ff" : "#7e22ce") : labelColor,
          fontSize: 0.65,
        });
      }

      const valText = n.label || liveValueStr || (!n.metadata?.kicadNative && !nativeFields?.valueHidden ? n.value : undefined);
      if (valText) {
        const valWidth = Math.max(1.2, valText.length * 0.45 + 0.4);
        list.push({
          id: `${n.id}-val`,
          x: n.x + cx,
          y: n.y + sym.height + 1.0,
          width: valWidth,
          height: 0.8,
          bgColor: isSimulating ? (isDark ? "#022c22" : "#f0fdf4") : undefined,
          borderColor: isSimulating ? (isDark ? "#34d399" : "#86efac") : undefined,
          borderWidth: 0.04,
          text: valText,
          textColor: isSimulating ? (isDark ? "#a7f3d0" : "#16a34a") : labelColor,
          fontSize: 0.65,
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.nodes, doc.defaultElementColor, isSimulating, getElementCurrent, getComponentStats, getWireColorHex, isDark]);

  // Pin-name labels are rendered in a dedicated WebGL text pass so they stay crisp and
  // always sit above the symbol body.  The placement is derived from the actual pin side,
  // not from an assumption that every symbol's electrical pin lies at x=0 / x=width.
  // This is especially important for native KiCad symbols: their bbox includes the pin lead,
  // so the connection point can be some distance inside the SymbolDef bbox.
  const webglPinLabelInstances = useMemo<BadgeInstance[]>(() => {
    const list: BadgeInstance[] = [];
    const EDGE_CLEARANCE = 0.58; // world units from the body edge to the glyph start/end
    const MIN_FONT = 0.22;
    const MAX_FONT = 0.30;

    const estimateSdfWidth = (text: string, size: number) => {
      let units = 0;
      for (const ch of text) {
        if (/[ijlI1.,'|:;]/.test(ch)) units += 0.35;
        else if (/[wWmM@_OQ0]/.test(ch)) units += 0.80;
        else units += 0.60;
      }
      return units * size + Math.max(0, text.length - 1) * size * 0.05;
    };

    // All native KiCad text/pin positions use the same transform as the
    // normalized KiCad core and the symbol body. The old implementation mixed
    // raw millimetres with world units here, which was a major source of
    // misplaced pin names (especially on rotated/mirrored symbols).
    // NOTE: callers below compute label anchors in the symbol's *local world*
    // space (already scaled by WORLD_UNITS_PER_KICAD_MM via kicadPointToWorld).
    // transformKiCadLibraryPoint expects KiCad *millimetres* (Y-up), so the
    // local-world point must be converted back first. Passing world units
    // straight in shrank every label by 1/2.54, flipped it vertically and left
    // it floating away from its pin.
    const transformNativeLocalForNode = (pt: { x: number; y: number }, parsed: NonNullable<ReturnType<typeof getImportedKiCadParsedSymbol>>, node: SchematicNode) =>
      transformKiCadLibraryPoint(doc.kicadCore, node, parsed, worldPointToKicad(pt, parsed.bbox));

    const rotateLocal = (x: number, y: number, sym: typeof SYMBOLS[string], rotation: number, scale: number) => {
      const cx = sym.width / 2;
      const cy = sym.height / 2;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return {
        x: cx + ((x - cx) * cos - (y - cy) * sin) * scale,
        y: cy + ((x - cx) * sin + (y - cy) * cos) * scale,
      };
    };

    const nativeKicadBodyBounds = (node: SchematicNode, sym: NonNullable<typeof SYMBOLS[string]>) => {
      if (!node.symbol?.startsWith("kicad:")) return null;
      const parsed = getImportedKiCadParsedSymbol(node.symbol);
      if (!parsed) return null;
      const graphics = parsed.bodyGraphics || [];
      if (!graphics.length) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const add = (x: number, y: number) => {
        const q = kicadPointToWorld({ x, y }, parsed.bbox);
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
      };
      for (const g of graphics) {
        if (g.type === "polyline" || g.type === "bezier") g.pts.forEach(pt => add(pt.x, pt.y));
        else if (g.type === "rectangle") { add(g.start.x, g.start.y); add(g.end.x, g.end.y); }
        else if (g.type === "circle") {
          add(g.center.x - g.radius, g.center.y - g.radius);
          add(g.center.x + g.radius, g.center.y + g.radius);
        } else if (g.type === "arc") {
          add(g.start.x, g.start.y); add(g.mid.x, g.mid.y); add(g.end.x, g.end.y);
        } else if (g.type === "text" && !g.hide) add(g.at.x, g.at.y);
      }
      if (!Number.isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    };

    const measureName = (text: string, size: number) => {
      try {
        const atlas = getOrCreateFontAtlas();
        let w = 0;
        for (let i = 0; i < text.length; i++) {
          const g = atlas.glyphs.get(text[i]) || atlas.glyphs.get("?");
          w += (g?.advance || 0.6) * size;
          if (i < text.length - 1) w += 0.05 * size; // layoutSdfText letterSpacing
        }
        return w;
      } catch {
        return estimateSdfWidth(text, size);
      }
    };

    for (const n of doc.nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      // Any placed `kicad:` symbol that has a parsed KiCad model (schematic import OR a symbol
      // taken from the KiCad symbol repository) is drawn by the native renderer, which rotates
      // about the KiCad anchor. Its pin text must use that same frame and rotation rules.
      const nativeParsedForLabels = n.symbol.startsWith("kicad:") ? getImportedKiCadParsedSymbol(n.symbol) : undefined;
      if (n.metadata?.kicadNative || nativeParsedForLabels) {
        const parsed = nativeParsedForLabels;
        if (parsed) {
          const bbox = parsed.bbox;
          const showPinNames = !parsed.pinNamesHide;
          const showPinNumbers = !parsed.pinNumbersHide;
          const scale = n.size ?? 1;
          const toLocal = (pt: { x: number; y: number }) => kicadPointToWorld(pt, bbox);
          const bodyBounds = nativeKicadBodyBounds(n, sym) ?? {
            minX: 0, minY: 0, maxX: sym.width, maxY: sym.height,
          };
          const color = n.color
            ? getWireColorHex(n.color)
            : getWireColorHex(doc.defaultElementColor || "black");

          // One size for the whole symbol: PIN_NAME_FONT, shrunk only as far as needed so the
          // left/right (or top/bottom) name columns never overlap or touch the frame.
          const stripTilde = (raw: string) => {
            let r = raw.trim();
            if (r.startsWith("~{") && r.endsWith("}")) r = r.slice(2, -1);
            else if (r.startsWith("~")) r = r.slice(1);
            else if (r.endsWith("~")) r = r.slice(0, -1);
            return r;
          };
          const widestByDir = new Map<string, number>();
          const perpByDir = new Map<string, number[]>();
          {
            const mir = runtimeKiCadMirror(n);
            for (const pin of parsed.pins) {
              if (pin.hide || !pin.name || pin.name === "~" || pin.nameEffects.hidden) continue;
              const nm = stripTilde(pin.name);
              if (!nm) continue;
              let dx = Math.cos((pin.at.angle * Math.PI) / 180), dy = Math.sin((pin.at.angle * Math.PI) / 180);
              if (mir.mirrorY) dx = -dx;
              if (mir.mirrorX) dy = -dy;
              const key = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "U" : "D");
              widestByDir.set(key, Math.max(widestByDir.get(key) ?? 0, measureName(nm, PIN_NAME_FONT)));
              const r = toLocal(pin.at);
              const arr = perpByDir.get(key) ?? [];
              arr.push(key === "R" || key === "L" ? r.y : r.x);
              perpByDir.set(key, arr);
            }
          }
          let nativeNameFont = PIN_NAME_FONT;
          {
            const M = 0.15 + 0.05;
            const fit = (a: string, b: string, span: number) => {
              const wa = widestByDir.get(a) ?? 0, wb = widestByDir.get(b) ?? 0;
              if (wa + wb <= 0) return PIN_NAME_FONT;
              const budget = Math.max(0.3, span - 2 * M - (wa > 0 && wb > 0 ? 0.3 : 0));
              return wa + wb > budget ? PIN_NAME_FONT * budget / (wa + wb) : PIN_NAME_FONT;
            };
            nativeNameFont = Math.min(
              fit("R", "L", bodyBounds.maxX - bodyBounds.minX),
              fit("U", "D", bodyBounds.maxY - bodyBounds.minY),
            );
            for (const arr of perpByDir.values()) {
              const sorted = [...arr].sort((x, y) => x - y);
              for (let i = 1; i < sorted.length; i++) {
                const d = sorted[i] - sorted[i - 1];
                if (d > 0.05) nativeNameFont = Math.min(nativeNameFont, d * 0.62);
              }
            }
            nativeNameFont = Math.max(PIN_NAME_MIN_FONT, nativeNameFont);
          }

          for (let pinIdx = 0; pinIdx < parsed.pins.length; pinIdx++) {
            const pin = parsed.pins[pinIdx];
            if (pin.hide) continue;

            const root = toLocal(pin.at);
            const rad = (pin.at.angle * Math.PI) / 180;
            const nativeEnd = {
              x: pin.at.x + Math.cos(rad) * pin.length,
              y: pin.at.y + Math.sin(rad) * pin.length,
            };
            const end = toLocal(nativeEnd);
            // Derive the pin direction after the instance mirror. In KiCad,
            // mirror-y flips X (horizontal mirror) and mirror-x flips Y (vertical mirror).
            // The label placement must use the transformed pin direction, not the
            // untransformed library angle.
            let effectiveAngle = pin.at.angle;
            // Mirrored symbols are pre-baked (pin angles already flipped).
            const { mirrorX, mirrorY } = runtimeKiCadMirror(n);
            let dirX = Math.cos(effectiveAngle * Math.PI / 180);
            let dirY = Math.sin(effectiveAngle * Math.PI / 180);
            if (mirrorY) dirX = -dirX;
            if (mirrorX) dirY = -dirY;
            effectiveAngle = ((Math.atan2(dirY, dirX) * 180 / Math.PI) + 360) % 360;
            const angle = ((Math.round(effectiveAngle / 90) * 90) % 360 + 360) % 360;

            // The native KiCad renderer and this SDF pass now use the same pin-text
            // contract: names sit just inside the symbol body from the pin's body end,
            // numbers sit just outside/above the pin lead. Crucially, 180° pins keep
            // their text horizontal; KiCad encodes the side with justification rather
            // than rotating the glyphs upside down.
            if (showPinNames && pin.name && pin.name !== "~" && !pin.nameEffects.hidden) {
              let rawName = pin.name.trim();
              if (rawName.startsWith("~{") && rawName.endsWith("}")) rawName = rawName.slice(2, -1);
              else if (rawName.startsWith("~")) rawName = rawName.slice(1);
              else if (rawName.endsWith("~")) rawName = rawName.slice(0, -1);

              if (rawName) {
                const nameSize = nativeNameFont; // same base size/weight as built-in and generated symbols
                const estimate = estimateSdfWidth(rawName, nameSize);
                let x = end.x, y = end.y;
                let justify: "left" | "center" | "right" = "left";
                let rotationDeg = 0;
                const margin = 0.15;
                const off = Math.max(0.20, (parsed.pinNamesOffset || 0.508) / 2.54);

                if (angle === 0) {
                  justify = "left";
                  x = Math.min(end.x + off, bodyBounds.maxX - margin - estimate);
                  x = Math.max(x, end.x + margin);
                } else if (angle === 180) {
                  justify = "right";
                  x = Math.max(end.x - off, bodyBounds.minX + margin + estimate);
                  x = Math.min(x, end.x - margin);
                } else if (angle === 270) {
                  justify = "left";
                  rotationDeg = 90;
                  y = Math.min(end.y + off, bodyBounds.maxY - margin - estimate);
                  y = Math.max(y, end.y + margin);
                } else if (angle === 90) {
                  justify = "left";
                  rotationDeg = -90;
                  y = Math.max(end.y - off, bodyBounds.minY + margin + estimate);
                  y = Math.min(y, end.y - margin);
                }

                const q = transformNativeLocalForNode({ x, y }, parsed, n);
                // Text orientation follows the pin's *world* direction: horizontal pins keep
                // horizontal, upright text; vertical pins read bottom-to-top (KiCad convention).
                // Justification encodes which side the pin is on, so nothing is ever upside down
                // and the name always grows into the body for any node rotation.
                const nameOrient = pinTextOrientation(
                  { x: Math.cos((angle * Math.PI) / 180), y: -Math.sin((angle * Math.PI) / 180) },
                  getKiCadCoreSymbol(doc.kicadCore, n.id)?.rotation ?? n.rotation ?? 0,
                );
                void justify; void rotationDeg;
                list.push({
                  id: `${n.id}-kpin-name-${pinIdx}`,
                  x: q.x, y: q.y, width: 0, height: 0,
                  text: rawName, textColor: color,
                  fontSize: nameSize * scale,
                  justify: nameOrient.justify,
                  verticalAlign: "middle",
                  rotationDeg: nameOrient.rotationDeg,
                  mirror: !!pin.nameEffects.justify.mirror,
                });
              }
            }

            if (showPinNumbers && pin.number && !pin.numberEffects.hidden) {
              const numSize = Math.max(0.22, Math.min(0.34,
                ((pin.numberEffects.font.size.y || 1.0) / 2.54) * 0.9));
              let x = (root.x + end.x) / 2;
              let y = (root.y + end.y) / 2;
              let justify: "left" | "center" | "right" = "center";
              if (angle === 0 || angle === 180) y = root.y - 0.20;
              else if (angle === 90 || angle === 270) { x = root.x - 0.22; justify = "right"; }
              const q = transformNativeLocalForNode({ x, y }, parsed, n);
              // Numbers run along their pin and stay upright: horizontal, or bottom-to-top
              // when the pin is vertical in the world (after node rotation).
              const numRot = uprightAxisRotation(angle === 90 || angle === 270, getKiCadCoreSymbol(doc.kicadCore, n.id)?.rotation ?? n.rotation ?? 0);
              justify = "center";
              list.push({
                id: `${n.id}-kpin-number-${pinIdx}`,
                x: q.x, y: q.y, width: 0, height: 0,
                text: pin.number, textColor: color,
                fontSize: numSize * scale,
                justify,
                verticalAlign: "middle",
                rotationDeg: numRot,
                mirror: !!pin.numberEffects.justify.mirror,
              });
            }
          }
        }
        continue;
      }

      // ---- Built-in / generated symbols: collision-free, frame-clear pin names ----
      // Everything is derived from the symbol's real drawn geometry (lead lines + body frame),
      // so any lead length / body size / rotation is handled the same way.
      const nodeRot = ((n.rotation ?? 0) % 360 + 360) % 360;
      const isGenHeader = n.symbol.startsWith("CONN_") && !n.symbol.startsWith("CONN_SCREW_");
      const isScrewTerminal = n.symbol.startsWith("CONN_SCREW_");
      const isPlainBuiltin = !n.symbol.startsWith("kicad:");
      const FRAME_GAP = 0.22;  // clear space between text and the body frame
      const CENTER_GAP = 0.30; // clear space between opposite label columns
      const REF_FONT = PIN_NAME_FONT;
      const nodeColorHex = getWireColorHex(n.color || doc.defaultElementColor || "black");
      let geo: ReturnType<typeof getSymbolPinGeometry> | null = null;
      let sharedFont = REF_FONT;
      let geoUsable = false;
      if (isPlainBuiltin && !isGenHeader && !isScrewTerminal) {
        geo = getSymbolPinGeometry(n.symbol, sym as any);
        const nameOf = (i: number) => (n.pinNames?.[i] ?? sym.pins[i].name ?? sym.pins[i].number ?? "").trim();
        const widest = new Map<string, number>();
        const coords = new Map<string, number[]>();
        let allConfident = true;
        for (let i = 0; i < sym.pins.length; i++) {
          const pp = sym.pins[i], g = geo.pins[i];
          const nm = nameOf(i);
          if (pp.hide || !nm || nm === "~") continue;
          if (!g.confident) allConfident = false;
          const key = `${g.inward.x},${g.inward.y}`;
          widest.set(key, Math.max(widest.get(key) ?? 0, measureName(nm, REF_FONT)));
          const perp = g.inward.x !== 0 ? pp.y : pp.x;
          const arr = coords.get(key) ?? []; arr.push(perp); coords.set(key, arr);
        }
        const bw = geo.body.x1 - geo.body.x0, bh = geo.body.y1 - geo.body.y0;
        const axisFont = (posKey: string, negKey: string, span: number) => {
          const wPos = widest.get(posKey) ?? 0, wNeg = widest.get(negKey) ?? 0;
          if (wPos + wNeg <= 0) return REF_FONT;
          const budget = span - 2 * FRAME_GAP - (wPos > 0 && wNeg > 0 ? CENTER_GAP : 0);
          if (budget < 0.4) return -1; // body too small for inside labels: legacy placement
          return wPos + wNeg > budget ? REF_FONT * budget / (wPos + wNeg) : REF_FONT;
        };
        const fx = axisFont("1,0", "-1,0", bw);
        const fy = axisFont("0,1", "0,-1", bh);
        geoUsable = allConfident && fx !== -1 && fy !== -1;
        if (geoUsable) {
          let font = Math.min(REF_FONT, fx, fy);
          for (const arr of coords.values()) {
            const sorted = [...arr].sort((a, b) => a - b);
            for (let i = 1; i < sorted.length; i++) {
              const d = sorted[i] - sorted[i - 1];
              if (d > 0.05) font = Math.min(font, d * 0.62); // never taller than the pin pitch
            }
          }
          sharedFont = Math.max(PIN_NAME_MIN_FONT, font);
        }
      }

      const nodeScale = n.size ?? 1;
      const body = nativeKicadBodyBounds(n, sym) ?? {
        minX: EDGE_CLEARANCE,
        minY: EDGE_CLEARANCE,
        maxX: Math.max(EDGE_CLEARANCE, sym.width - EDGE_CLEARANCE),
        maxY: Math.max(EDGE_CLEARANCE, sym.height - EDGE_CLEARANCE),
      };

      const isIcLike = isPlainBuiltin && (sym.category === "ic" || sym.category === "mcu");
      const nodeScaleForNum = n.size ?? 1;
      for (let pinIdx = 0; pinIdx < sym.pins.length; pinIdx++) {
        const p = sym.pins[pinIdx];
        if (p.hide) continue;

        // Screw terminals: pin label sits directly above its own screw; the pin number is
        // added below the screw only when a custom label replaces the default number.
        if (isScrewTerminal) {
          const rot = uprightAxisRotation(false, nodeRot);
          const label = (n.pinNames?.[pinIdx] ?? p.name ?? "").trim();
          const num = String(pinIdx + 1);
          const push = (text: string, dy: number, fs: number, suffix: string) => {
            const loc = rotateLocal(p.x, p.y + dy, sym, n.rotation, nodeScaleForNum);
            list.push({
              id: `${n.id}-pin-${pinIdx}${suffix}`,
              x: n.x + loc.x, y: n.y + loc.y, width: 0, height: 0,
              text, textColor: nodeColorHex,
              fontSize: fs * nodeScaleForNum, justify: "center", verticalAlign: "middle",
              rotationDeg: rot,
            });
          };
          push(label || num, -0.62, 0.30, "");
          if (label && label !== num) push(num, 0.62, 0.24, "-num");
          continue;
        }

        // Built-in IC / MCU symbols: pin number directly above the pin lead.
        if (isIcLike) {
          const nameDigits = /^P?(\d+)$/.exec((p.name ?? "").trim());
          const numText = String(p.number ?? (nameDigits ? nameDigits[1] : pinIdx + 1)).trim();
          if (numText) {
            const ng = getSymbolPinGeometry(n.symbol, sym as any).pins[pinIdx];
            const lead = ng ? ng.lead : 0;
            const inward = ng ? ng.inward : { x: 1, y: 0 };
            const NUM_FONT = 0.26;
            // Anchor: middle of the drawn lead; if there is no visible lead, just outside the pin.
            const along = lead >= 0.25 ? Math.min(lead, 0.5) / 2 : -0.3;
            let ax = p.x + inward.x * along, ay = p.y + inward.y * along;
            if (inward.x !== 0) ay -= 0.22; else ax += 0.22;
            const loc = rotateLocal(ax, ay, sym, n.rotation, nodeScaleForNum);
            list.push({
              id: `${n.id}-pinnum-${pinIdx}`,
              x: n.x + loc.x, y: n.y + loc.y, width: 0, height: 0,
              text: numText, textColor: nodeColorHex,
              fontSize: NUM_FONT * nodeScaleForNum, justify: "center", verticalAlign: "middle",
              rotationDeg: uprightAxisRotation(false, nodeRot),
            });
          }
        }

        // Always prefer the explicit schematic override, then the native pin name, then
        // the pin number. This makes generated headers/connectors useful even when their
        // generator supplied only a pin number.
        const name = (n.pinNames?.[pinIdx] ?? p.name ?? p.number ?? "").trim();
        if (!name || name === "~") continue;

        // Native KiCad angle gives the authoritative direction of the pin lead into the body.
        // For ordinary CirZuit symbols infer the side from the nearest symbol edge.
        let side: "left" | "right" | "top" | "bottom";
        const parsed = n.symbol?.startsWith("kicad:") ? getImportedKiCadParsedSymbol(n.symbol) : undefined;
        const nativePin = parsed?.pins?.[pinIdx];

        if (isGenHeader) {
          // Generated pin headers/sockets: name centred directly below its pin (inside the
          // body), always upright (horizontal, or bottom-to-top when the part is rotated 90/270).
          const rot = uprightAxisRotation(false, nodeRot);
          const along = measureName(name, 1);
          const avail = rot === 0 ? 1.35 : 0.9;
          const fs = Math.max(PIN_NAME_MIN_FONT, Math.min(PIN_NAME_FONT, avail / Math.max(0.01, along)));
          const loc = rotateLocal(p.x, p.y + 0.55, sym, n.rotation, nodeScale);
          list.push({
            id: `${n.id}-pin-${pinIdx}`,
            x: n.x + loc.x, y: n.y + loc.y, width: 0, height: 0,
            text: name, textColor: nodeColorHex,
            fontSize: fs * nodeScale, justify: "center", verticalAlign: "middle",
            rotationDeg: rot,
          });
          continue;
        }
        if (geo && geoUsable) {
          const g = geo.pins[pinIdx];
          const o = pinTextOrientation(g.inward, nodeRot);
          const loc = rotateLocal(
            g.innerEnd.x + g.inward.x * FRAME_GAP,
            g.innerEnd.y + g.inward.y * FRAME_GAP,
            sym, n.rotation, nodeScale,
          );
          list.push({
            id: `${n.id}-pin-${pinIdx}`,
            x: n.x + loc.x, y: n.y + loc.y, width: 0, height: 0,
            text: name, textColor: nodeColorHex,
            fontSize: sharedFont * nodeScale,
            justify: o.justify, verticalAlign: "middle",
            rotationDeg: o.rotationDeg,
          });
          continue;
        }
        if (nativePin) {
          const a = ((Math.round(nativePin.at.angle) % 360) + 360) % 360;
          if (a === 0) side = "left";
          else if (a === 180) side = "right";
          else if (a === 90) side = "bottom";
          else if (a === 270) side = "top";
          else {
            const dl = Math.abs(p.x - body.minX), dr = Math.abs(p.x - body.maxX);
            const dt = Math.abs(p.y - body.minY), db = Math.abs(p.y - body.maxY);
            const m = Math.min(dl, dr, dt, db);
            side = m === dl ? "left" : m === dr ? "right" : m === dt ? "top" : "bottom";
          }
        } else {
          const dl = Math.abs(p.x - body.minX), dr = Math.abs(p.x - body.maxX);
          const dt = Math.abs(p.y - body.minY), db = Math.abs(p.y - body.maxY);
          const m = Math.min(dl, dr, dt, db);
          side = m === dl ? "left" : m === dr ? "right" : m === dt ? "top" : "bottom";
        }

        let lx = p.x;
        let ly = p.y;
        let justify: "left" | "center" | "right" = "left";
        let verticalAlign: "top" | "middle" | "bottom" = "middle";
        let fontSize = MAX_FONT;

        if (side === "left") {
          lx = Math.max(p.x + EDGE_CLEARANCE, body.minX + EDGE_CLEARANCE);
          ly = Math.min(Math.max(p.y, body.minY + EDGE_CLEARANCE), body.maxY - EDGE_CLEARANCE);
          justify = "left";
          const available = Math.max(0.25, body.maxX - lx - EDGE_CLEARANCE);
          fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, available / Math.max(1, estimateSdfWidth(name, 1))));
        } else if (side === "right") {
          lx = Math.min(p.x - EDGE_CLEARANCE, body.maxX - EDGE_CLEARANCE);
          ly = Math.min(Math.max(p.y, body.minY + EDGE_CLEARANCE), body.maxY - EDGE_CLEARANCE);
          justify = "right";
          const available = Math.max(0.25, lx - body.minX - EDGE_CLEARANCE);
          fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, available / Math.max(1, estimateSdfWidth(name, 1))));
        } else if (side === "top") {
          lx = Math.min(Math.max(p.x, body.minX + EDGE_CLEARANCE), body.maxX - EDGE_CLEARANCE);
          ly = Math.max(p.y + EDGE_CLEARANCE, body.minY + EDGE_CLEARANCE);
          justify = "center";
          verticalAlign = "middle";
          const available = Math.max(0.25, body.maxY - ly - EDGE_CLEARANCE);
          fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, available / Math.max(1, estimateSdfWidth(name, 1))));
        } else {
          lx = Math.min(Math.max(p.x, body.minX + EDGE_CLEARANCE), body.maxX - EDGE_CLEARANCE);
          ly = Math.min(p.y - EDGE_CLEARANCE, body.maxY - EDGE_CLEARANCE);
          justify = "center";
          verticalAlign = "middle";
          const available = Math.max(0.25, ly - body.minY - EDGE_CLEARANCE);
          fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, available / Math.max(1, estimateSdfWidth(name, 1))));
        }

        const local = rotateLocal(lx, ly, sym, n.rotation, nodeScale);
        const effectiveColor = n.color || doc.defaultElementColor || "black";
        const nodeColor = getWireColorHex(effectiveColor);

        list.push({
          id: `${n.id}-pin-${pinIdx}`,
          x: n.x + local.x,
          y: n.y + local.y,
          width: 0,
          height: 0,
          text: name,
          textColor: nodeColor,
          fontSize,
          justify,
          verticalAlign,
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.nodes, doc.defaultElementColor, getWireColorHex]);

  // Realistic mode is fully native WebGL: no React SVG tree is created.
  const webglRealisticSymbolInstances = useMemo<RealisticSymbolInstance[]>(() => {
    if (!realistic) return [];
    const list: RealisticSymbolInstance[] = [];
    for (const n of doc.nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym || n.symbol === "text") continue;
      const ref = getComponentRef(n);
      const glowing =
        isSimulating &&
        (n.symbol === "led" || n.symbol === "switch" || n.symbol === "push_button") &&
        ref !== null &&
        !burntNow.has(n.id) &&
        Math.abs(getElementCurrent(ref)) > 1e-5;
      const glowColor =
        n.color === "green" ? "#22c55e" :
        n.color === "blue" ? "#3b82f6" :
        n.color === "yellow" ? "#eab308" :
        n.color === "white" ? "#ef4444" : "#ef4444";

      let liveValue = "";
      if (isSimulating) {
        const stats = getComponentStats(n);
        if (stats && (n.symbol === "voltmeter" || n.symbol === "ammeter")) {
          const val = n.symbol === "voltmeter" ? stats.voltage : stats.current;
          const unit = n.symbol === "voltmeter" ? "V" : "A";
          const abs = Math.abs(val);
          liveValue = abs >= 1 ? `${val.toFixed(2)} ${unit}` :
            abs >= 1e-3 ? `${(val * 1000).toFixed(1)} m${unit}` :
            abs >= 1e-6 ? `${(val * 1e6).toFixed(1)} µ${unit}` : `0.00 ${unit}`;
        }
      }

      list.push({
        id: n.id,
        symbolId: n.symbol,
        x: n.x,
        y: n.y,
        width: sym.width,
        height: sym.height,
        rotation: n.rotation ?? 0,
        scale: n.size ?? 1,
        value: n.value || "",
        color: n.color || doc.defaultElementColor || "#111827",
        metadata: n.metadata,
        liveValue,
        glowing,
        glowColor,
        alpha: 1,
      });
    }
    // Ghost preview while placing a component (realistic view)
    if (placement && ghostPos) {
      const pushGhost = (id: string, symbolId: any, x: number, y: number, rot: any, scale: number, alpha: number, metadata?: any) => {
        const s = SYMBOLS[symbolId];
        if (!s) return;
        list.push({ id, symbolId, x, y, width: s.width, height: s.height, rotation: rot, scale, value: "", color: doc.defaultElementColor || "#111827", metadata, alpha });
      };
      if (placement.multi) {
        const { nodes } = placement.multi;
        let minX = Infinity, minY = Infinity;
        nodes.forEach((n) => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); });
        if (minX !== Infinity) {
          const dx = ghostPos.x - minX, dy = ghostPos.y - minY;
          for (const n of nodes) pushGhost(`ghost-${n.id}`, n.symbol, n.x + dx, n.y + dy, n.rotation ?? 0, n.size ?? 1, 0.5);
        }
      } else if (placement.symbol) {
        pushGhost("ghost-placement", placement.symbol, ghostPos.x, ghostPos.y, (placement.rotation ?? 0) as 0 | 90 | 180 | 270, 1, 0.55, (placement as any).metadata);
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realistic, doc.nodes, doc.defaultElementColor, isSimulating, getComponentRef, getElementCurrent, getComponentStats, placement, ghostPos, burntNow]);


  // Junctions are purely decorative (no hit-testing in the old SVG either), so this one is a
  // full replacement with nothing left behind on SVG.
  const webglJunctionInstances = useMemo<JunctionInstance[]>(() => {
    return junctions.map((j) => {
      const netId = netIndex.gridNet.get(`${Math.round(j.x * 10)},${Math.round(j.y * 10)}`);
      const voltage = isSimulating ? getNetVoltage(netId ?? 0) : 0;
      const glowColor =
        isSimulating && Math.abs(voltage) > 0.1
          ? voltage > 0.001 ? "#4ade80" : "#94a3b8"
          : null;
      // Realistic view: directions of the wires meeting here, so the solder can flow along them.
      let dirs: [number, number][] | undefined;
      if (realistic) {
        dirs = [];
        const add = (px: number, py: number) => {
          const dx = px - j.x, dy = py - j.y, l = Math.hypot(dx, dy);
          if (l > 1e-4 && dirs!.length < 6 && !dirs!.some((d) => Math.abs(d[0] - dx / l) + Math.abs(d[1] - dy / l) < 0.05)) dirs!.push([dx / l, dy / l]);
        };
        for (const w of doc.wires) {
          const pts = w.points;
          if (!pts) continue;
          for (let i = 0; i < pts.length; i++) {
            if (Math.abs(pts[i].x - j.x) < 0.05 && Math.abs(pts[i].y - j.y) < 0.05) {
              if (i > 0) add(pts[i - 1].x, pts[i - 1].y);
              if (i < pts.length - 1) add(pts[i + 1].x, pts[i + 1].y);
            }
          }
        }
      }
      return { x: j.x, y: j.y, color: strokeColor, glowColor, radius: j.diameter ? Math.max(0.18, j.diameter / 2) : 0.28, dirs };
    });
  }, [junctions, netIndex, isSimulating, getNetVoltage, strokeColor, realistic, doc.wires]);

  // Realistic view: a shiny solder joint on top of every pin / leg that has a wire connected or previewed.
  const webglSolderJointInstances = useMemo<SolderJointInstance[]>(() => {
    if (!realistic) return [];

    const wirePoints: { x: number; y: number }[] = [];
    for (const w of doc.wires) {
      if (w.points) wirePoints.push(...w.points);
    }
    if (wirePreview?.points) {
      wirePoints.push(...wirePreview.points);
    }

    const hitPin = (px: number, py: number) => {
      for (const wp of wirePoints) {
        if (Math.hypot(wp.x - px, wp.y - py) < 0.25) return true;
      }
      return false;
    };

    const out: SolderJointInstance[] = [];
    const seen = new Set<string>();

    for (const p of allPins) {
      const k = `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
      if (seen.has(k) || !hitPin(p.x, p.y)) continue;
      seen.add(k);
      out.push({ x: p.x, y: p.y, radius: 0.22 });
    }

    for (const wp of wirePoints) {
      const k = `${Math.round(wp.x * 10)},${Math.round(wp.y * 10)}`;
      if (seen.has(k)) continue;
      const isOnPin = allPins.some(p => Math.hypot(p.x - wp.x, p.y - wp.y) < 0.25);
      if (isOnPin) {
        seen.add(k);
        out.push({ x: wp.x, y: wp.y, radius: 0.22 });
      }
    }

    return out;
  }, [realistic, doc.wires, wirePreview, allPins]);

  // Realistic view: pin names stay hidden until the user selects (clicks) the element.
  const visiblePinLabelInstances = useMemo<BadgeInstance[]>(() => {
    if (!realistic) return webglPinLabelInstances;
    if (!selectedIds || selectedIds.length === 0) return [];
    return webglPinLabelInstances.filter((b) =>
      selectedIds.some((id) => b.id.startsWith(`${id}-pin`) || b.id.startsWith(`${id}-kpin`))
    );
  }, [realistic, webglPinLabelInstances, selectedIds]);

  // Selection rectangles + pin markers now drawn by SchematicWebGLSelection (WebGL).
  // Invisible SVG hit targets remain for pointer events.
  const webglSelectionRects = useMemo<SelectionRectInstance[]>(() => {
    const list: SelectionRectInstance[] = [];
    for (const n of doc.nodes) {
      if (!selectedIds.includes(n.id)) continue;
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      const nodeScale = n.size ?? 1;
      const cx = sym.width / 2;
      const cy = sym.height / 2;
      // Same padding as the old SVG selection rect: -0.3 .. +0.6
      // Note: when the node is scaled/rotated the visual outline is still axis-aligned
      // in the old SVG (the rect was inside the rotated group). We approximate by
      // expanding with scale and rotating the corners.
      list.push({
        x: n.x - 0.3 * nodeScale,
        y: n.y - 0.3 * nodeScale,
        w: (sym.width + 0.6) * nodeScale,
        h: (sym.height + 0.6) * nodeScale,
        cx: n.x + cx * nodeScale,
        cy: n.y + cy * nodeScale,
        rotation: (n.rotation ?? 0) as 0 | 90 | 180 | 270,
        scale: nodeScale,
      });
    }
    // Ghost placement outline (single symbol)
    if (placement?.symbol && ghostPos && !placement.multi) {
      const sym = SYMBOLS[placement.symbol];
      if (sym) {
        const rot = (placement.rotation ?? 0) as 0 | 90 | 180 | 270;
        list.push({
          x: ghostPos.x - 0.2,
          y: ghostPos.y - 0.2,
          w: sym.width + 0.4,
          h: sym.height + 0.4,
          cx: ghostPos.x + sym.width / 2,
          cy: ghostPos.y + sym.height / 2,
          rotation: rot,
          scale: 1,
        });
      }
    }
    return list;
  }, [doc.nodes, selectedIds, placement, ghostPos]);

  const webglPinMarkers = useMemo<PinMarkerInstance[]>(() => {
    const list: PinMarkerInstance[] = [];
    for (const n of doc.nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      const nodeScale = n.size ?? 1;
      const nodeColor = strokeColor;
      const pins = transformedPins(sym, n.rotation, nodeScale);
      for (let i = 0; i < pins.length; i++) {
        if (sym.pins[i]?.hide) continue;
        const p = pins[i];
        const pNet = netIndex.pinNet.get(`${n.id}:${i}`);
        const inNet = highlightedNetIds
          ? pNet !== undefined && highlightedNetIds.includes(pNet)
          : highlightedNet != null && pNet === highlightedNet;
        const isSelected = selectedPin?.nodeId === n.id && selectedPin?.pinIndex === i;
        const isFloating = floatingPins.some((fp) => fp.nodeId === n.id && fp.pinIndex === i);

        let kind: PinMarkerInstance["kind"] = "normal";
        let color = nodeColor;
        if (isSelected) {
          kind = "selected";
          color = "#dc2626";
        } else if (inNet) {
          kind = "net";
          color = "#2563eb";
        } else if (isFloating) {
          kind = "floating";
          color = nodeColor;
        }
        list.push({ x: n.x + p.x, y: n.y + p.y, kind, color });
      }
    }
    return list;

  }, [doc.nodes, selectedPin, selectedIds, netIndex, highlightedNetIds, highlightedNet, floatingPins, strokeColor]);

  // Wire-tool hover + pending indicators (WebGL)
  const webglWireIndicators = useMemo<WireToolIndicator[]>(() => {
    const list: WireToolIndicator[] = [];
    if (tool === "wire") {
      if (hoverPin) list.push({ x: hoverPin.x, y: hoverPin.y, kind: "hover" });
      if (pendingWire) list.push({ x: pendingWire.x, y: pendingWire.y, kind: "pending" });
    }
    return list;
  }, [tool, hoverPin, pendingWire]);

  // LED glow + heat discs (WebGL soft circles)
  const webglGlows = useMemo<GlowInstance[]>(() => {
    const list: GlowInstance[] = [];
    if (!isSimulating) return list;
    for (const n of doc.nodes) {
      const sym = SYMBOLS[n.symbol];
      if (!sym) continue;
      const cx = n.x + sym.width / 2;
      const cy = n.y + sym.height / 2;

      // LED glow
      if (n.symbol === "led" && !burntNow.has(n.id)) {
        const i = Math.abs(getElementCurrent(getComponentRef(n)));
        const brightness = i < 0.00001 ? 0 : Math.min(1, i * 100);
        if (brightness >= 0.02) {
          const glowColor =
            n.color === "green" ? "#22c55e" :
            n.color === "blue" ? "#3b82f6" :
            n.color === "yellow" ? "#eab308" :
            n.color === "white" ? "#ff6b6b" : "#ff1e56";
          list.push({
            x: cx,
            y: cy,
            r: 0.7 + brightness * 1.5,
            color: glowColor,
            alpha: brightness * 0.9,
            layers: 5,
          });
        }
      }

      // Heat glow from power dissipation
      const stats = getComponentStats(n);
      if (stats && stats.power >= 0.05) {
        const p = stats.power;
        const color = p < 0.2 ? "#fbbf24" : p < 0.6 ? "#f97316" : "#ef4444";
        const alpha = p < 0.2 ? 0.4 : p < 0.6 ? 0.55 : 0.7;
        list.push({
          x: cx,
          y: cy,
          r: Math.max(sym.width, sym.height) * 0.7,
          color,
          alpha,
          layers: 4,
        });
      }
    }
    return list;
  }, [isSimulating, doc.nodes, getElementCurrent, getComponentRef, getComponentStats, burntNow]);

  // Active marquee drag selection box in world coordinates (WebGL / Realistic Mode)
  const webglMarqueeBox = useMemo(() => {
    const g = gesture.current;
    if (g.type !== "selection" || pointers.current.size === 0 || g.startX === undefined || g.currentX === undefined || g.startY === undefined || g.currentY === undefined) {
      return null;
    }
    const x1 = Math.min(g.startX, g.currentX);
    const y1 = Math.min(g.startY, g.currentY);
    const x2 = Math.max(g.startX, g.currentX);
    const y2 = Math.max(g.startY, g.currentY);
    const w1 = screenToWorld(x1, y1);
    const w2 = screenToWorld(x2, y2);
    return { x1: w1.x, y1: w1.y, x2: w2.x, y2: w2.y };
  }, [screenToWorld, ghostPos]);


  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden touch-none no-select"
      style={{
        background: bg,
        cursor: placement
          ? "crosshair"
          : tool === "pan"
            ? "grab"
            : tool === "wire"
              ? "crosshair"
              : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {/* Realistic mode background is CSS/HTML only; component geometry is WebGL.
          The workbench background is chosen in the Realistic-view settings (wood, ESD mat,
          cutting mat, marble, brushed metal, blueprint, …) and never affects the schematic. */}
      {realistic && !isSimulating && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: getRealisticBackground(doc.realisticBackground).css(isDark),
          }}
        />
      )}

      {/* One shared WebGL canvas for the schematic: grid (replacing the old SVG <SmartGrid>)
          plus the static symbol-body glyphs (replacing SYMBOLS[id].draw() for the common
          case — see SchematicWebGLSymbols.tsx for what's excluded and still on SVG). Uses the
          same proven stage engine (PcbGLStageCore) as the PCB editor. */}
      <SchematicGLStage>
        {showGrid && (
          <SchematicWebGLGrid
            gridSize={gridSize}
            offsetX={view.x}
            offsetY={view.y}
            isDark={isDark || isSimulating}
            style={gridStyle}
            opacity={isSimulating ? gridOpacity * 0.18 : gridOpacity}
            zoom={view.scale}
            isSimulating={isSimulating}
            realistic={realistic && !isSimulating}
          />
        )}
        <SchematicWebGLWireGlow instances={webglGlowInstances} view={view} />
        <SchematicWebGLRealisticWires instances={webglRealisticWireInstances} view={view} />
        <SchematicWebGLWires instances={webglWireInstances} view={view} />
        <SchematicWebGLWireSelection instances={webglSelectionInstances} view={view} />
        <SchematicWebGLCurrentFlow instances={webglCurrentFlowInstances} view={view} />
        <SchematicWebGLNetLabels instances={webglNetLabelInstances} view={view} />
        <SchematicWebGLBadges
          instances={[
            ...webglWireVoltageBadgeInstances,
            ...webglNetLabelVoltageBadgeInstances,
            ...webglComponentLabelInstances,
            ...visiblePinLabelInstances,
          ]}
          view={view}
        />
        <SchematicWebGLJunctions instances={webglJunctionInstances} view={view} realistic={realistic} />
        {realistic && <SchematicWebGLSolderJoints instances={webglSolderJointInstances} view={view} />}
        <SchematicWebGLRealisticSymbols instances={webglRealisticSymbolInstances} view={view} />
        <SchematicWebGLSymbols instances={webglSymbolInstances} view={view} kicadCore={doc.kicadCore} />
        <SchematicWebGLSelection rects={webglSelectionRects} pins={webglPinMarkers} wireIndicators={webglWireIndicators} glows={webglGlows} marqueeBox={webglMarqueeBox} view={view} timeSec={currentTime} />
        <SchematicWebGLFire instances={fireInstances} view={view} />
        <SchematicWebGLGuides
          wirePreview={
            wirePreview && wirePreview.points.length > 1
              ? {
                  points: wirePreview.points,
                  color: getWireColorHex(wireColor),
                  curved: wireStyle === "curved",
                }
              : null
          }
          alignments={webglAlignmentMatches}
          view={view}
          canvasSize={size}
        />
      </SchematicGLStage>

      {!realistic && (
      <svg
        ref={svg}
        width={size.w}
        height={size.h}
        style={{ position: "absolute", top: 0, left: 0, display: "block" }}
      >

        <g
          transform={`translate(${view.x} ${view.y}) scale(${view.scale * GRID})`}
        >
          {doc.wires.map((w) => {
            if (!w.points || w.points.length === 0) return null;
            const isSel = selectedWireIds.includes(w.id);
            const wireNetId = netIndex.wireNet.get(w.id);
            const inNet = highlightedNetIds
              ? wireNetId !== undefined && highlightedNetIds.includes(wireNetId)
              : highlightedNet != null && wireNetId === highlightedNet;
            const isSnapHi = w.id === snapWireHi;
            const baseColor = getWireColorHex(w.color);

            const voltage = isSimulating ? getNetVoltage(wireNetId ?? 0) : 0;
            const stroke = isSimulating
              ? (voltage > 0.001 ? "#4ade80" : "#94a3b8")
              : isSnapHi
                ? "#16a34a"
                : inNet
                  ? "#2563eb"
                  : baseColor;

            let wireCurrent = 0;
            if (isSimulating) {
              const sI = getWirePinCurrent(w.points[0].x, w.points[0].y);
              const eI = getWirePinCurrent(
                w.points[w.points.length - 1].x,
                w.points[w.points.length - 1].y,
              );
              wireCurrent = Math.abs(sI) > Math.abs(eI) ? sI : -eI;
            }

            const customWidth = w.width ?? 0.1;
            const sw = isSel
              ? customWidth * 1.8
              : inNet || isSnapHi
                ? customWidth * 1.5
                : isSimulating
                  ? 0.15
                  : customWidth;
            const path = renderWirePath(w);
            return (
              <g key={w.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={0.6}
                  style={{ cursor: tool === "select" ? "move" : "default" }}
                />
                {webglWireIds.has(w.id) ? null : (
                  <path
                    d={path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={sw}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {webglWireIds.has(w.id) ? null : isSimulating && (
                  <path
                    d={path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={sw * 2.5}
                    opacity={0.15}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: "blur(2px)", pointerEvents: "none" }}
                  />
                )}
                {webglWireIds.has(w.id) ? null : isSimulating && (
                  <CurrentFlow
                    path={path}
                    current={wireCurrent}
                    zoom={view.scale}
                  />
                )}
                {webglWireIds.has(w.id) ? null : isSel && (
                  <path
                    d={path}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={0.08}
                    strokeDasharray="0.3,0.2"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {webglWireIds.has(w.id) ? null : isSimulating && view.scale > 0.6 && (
                  <g
                    transform={`translate(${w.points[0].x + (w.points[w.points.length - 1].x - w.points[0].x) / 2} ${w.points[0].y + (w.points[w.points.length - 1].y - w.points[0].y) / 2 - 0.45})`}
                    pointerEvents="none"
                  >
                    <rect
                      x={-0.85}
                      y={-0.32}
                      width={1.7}
                      height={0.64}
                      rx={0.12}
                      fill="#1c0a00"
                      stroke="#f97316"
                      strokeWidth={0.06}
                      opacity={1.0}
                    />
                    <text
                      x={0}
                      y={0.14}
                      fontSize={0.42}
                      fill="#fdba74"
                      textAnchor="middle"
                      fontWeight="black"
                      fontFamily="ui-monospace"
                    >
                      {voltage.toFixed(1)}V
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Explicit KiCad no-connect markers. These are electrical annotations,
              not wires: a crossing wire remains disconnected unless KiCad also
              supplied a junction at that coordinate. */}
          {(doc.noConnects ?? []).map((nc) => (
            <g key={`no-connect-${nc.id}`} transform={`translate(${nc.x} ${nc.y})`} pointerEvents="none">
              <path
                d="M -0.26 -0.26 L 0.26 0.26 M -0.26 0.26 L 0.26 -0.26"
                stroke={isDark ? "#67e8f9" : "#0891b2"}
                strokeWidth={0.11}
                strokeLinecap="round"
              />
            </g>
          ))}

          {/* Net Labels - Professional International EDA Standard (KiCad / Altium Designer) */}
          {(doc.netLabels ?? []).map((label) => {
            const netId = netIndex.labelNet.get(label.id);
            const isHighlighted = highlightedNetIds?.includes(netId ?? -1);
            const angle = label.rotation ?? 0;
            const isGlobal = label.scope === "global";
            const upperText = label.text.toUpperCase();
            const isGnd = upperText === "GND" || upperText === "AGND" || upperText === "DGND" || upperText === "0V" || upperText.startsWith("GND");
            const isPower = upperText === "VCC" || upperText === "VDD" || upperText === "VBAT" || upperText === "+5V" || upperText === "+3.3V" || upperText === "+12V" || upperText === "+24V" || upperText.startsWith("+");
            
            // Dynamic Voltage during simulation
            const netVoltage = isSimulating && netId !== undefined ? getNetVoltage(netId) : null;

            // Color scheme matching KiCad 8 & Altium standards
            let strokeColor = isGlobal ? "#a855f7" : "#0284c7";
            let bgColor = isDark
              ? (isGlobal ? "rgba(46, 16, 101, 0.92)" : "rgba(8, 47, 73, 0.92)")
              : (isGlobal ? "rgba(250, 245, 255, 0.96)" : "rgba(240, 249, 255, 0.96)");
            let textColor = isGlobal
              ? (isDark ? "#c084fc" : "#7e22ce")
              : (isDark ? "#38bdf8" : "#0369a1");

            if (isGnd) {
              strokeColor = "#10b981";
              bgColor = "rgba(0, 0, 0, 0)";
              textColor = isDark ? "#6ee7b7" : "#047857";
            } else if (isPower) {
              strokeColor = "#f59e0b";
              bgColor = "rgba(0, 0, 0, 0)";
              textColor = isDark ? "#fcd34d" : "#b45309";
            }

            if (isHighlighted) {
              strokeColor = "#3b82f6";
              bgColor = "rgba(0, 0, 0, 0)";
              textColor = isDark ? "#93c5fd" : "#1d4ed8";
            } else if (isSimulating && netVoltage !== null && Math.abs(netVoltage) > 0.05) {
              strokeColor = "#10b981";
              textColor = isDark ? "#4ade80" : "#059669";
            }

            // Measurements for crisp EDA typography
            const charWidth = 0.28;
            const padLeft = isGlobal ? 0.44 : 0.38;
            const padRight = isGlobal ? 0.38 : 0.22;
            const width = Math.max(1.15, padLeft + label.text.length * charWidth + padRight);
            const height = 0.68;
            const halfH = height / 2;

            // Flag paths (KiCad Local chevron vs Global diamond port)
            const localFlagPath = `M 0 0 L 0.32 -${halfH} L ${width} -${halfH} L ${width} ${halfH} L 0.32 ${halfH} Z`;
            const globalPortPath = `M 0 0 L 0.32 -${halfH} L ${width - 0.28} -${halfH} L ${width} 0 L ${width - 0.28} ${halfH} L 0.32 ${halfH} Z`;
            const pathData = isGlobal ? globalPortPath : localFlagPath;

            return (
              <g
                key={`net-label-${label.id}`}
                transform={`translate(${label.x} ${label.y}) rotate(${angle})`}
                opacity={label.visible === false ? 0 : 1}
                style={{ pointerEvents: "none" }}
              >
                {/* Glow filter when highlighted or active */}
                {isHighlighted && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={0.16}
                    opacity={0.6}
                    style={{ filter: "drop-shadow(0 0 2px #3b82f6)" }}
                  />
                )}

                {/* Banner body + text now rendered by SchematicWebGLNetLabels */}

                {/* Scope Indicator Detail (KiCad port marker) */}
                {isGlobal && (
                  <path
                    d={`M ${width - 0.22} -0.15 L ${width - 0.08} 0 L ${width - 0.22} 0.15`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={0.04}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.8}
                  />
                )}

                {/* Anchor Snapping Node at Electrical Origin (0, 0) */}
                <g pointerEvents="none">
                  <circle
                    cx={0}
                    cy={0}
                    r={0.08}
                    fill={strokeColor}
                    stroke={isDark ? "#0f172a" : "#ffffff"}
                    strokeWidth={0.03}
                  />
                  <circle cx={0} cy={0} r={0.03} fill="#ffffff" />
                </g>

                {/* Live Voltage Badge during Simulation — now rendered by SchematicWebGLBadges */}
              </g>
            );
          })}

          {selectedWireId &&
            (() => {
              const w = doc.wires.find((wi) => wi.id === selectedWireId);
              if (!w) return null;
              return (
                <g>
                  {w.points.map((p, i) => (
                    <circle
                      key={`a-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={0.22}
                      fill="#fff"
                      stroke="#2563eb"
                      strokeWidth={0.06}
                      style={{ cursor: "grab" }}
                    />
                  ))}
                </g>
              );
            })()}

          {/* wirePreview now SchematicWebGLGuides */}


          {/* Junctions now drawn entirely by SchematicWebGLJunctions (see the WebGL stage
              above) — this layer never had SVG hit-testing to preserve. */}

          {doc.nodes.map((n) => {
            const sym = SYMBOLS[n.symbol];
            if (!sym) return null;
            const isSel = selectedIds.includes(n.id);
            const cx = sym.width / 2,
              cy = sym.height / 2;
            const nodeScale = n.size ?? 1;
            const isLedOn = n.symbol === "led" && isSimulating && (() => {
              const i = Math.abs(getElementCurrent(getComponentRef(n)));
              const brightness = i < 0.00001 ? 0 : Math.min(1, i * 100);
              return brightness >= 0.02;
            })();
            const isLedWhiteToRed = n.symbol === "led" && isLedOn && n.color === "white";
            const effectiveColor = isLedWhiteToRed ? "red" : n.color;
            const nodeColor = effectiveColor
              ? getWireColorHex(effectiveColor)
              : getWireColorHex(doc.defaultElementColor || "black");

            const hasNetPin = highlightedNetIds
              ? sym.pins.some((_, i) => {
                  const pNet = netIndex.pinNet.get(`${n.id}:${i}`);
                  return pNet !== undefined && highlightedNetIds.includes(pNet);
                })
              : highlightedNet != null &&
                sym.pins.some(
                  (_, i) =>
                    netIndex.pinNet.get(`${n.id}:${i}`) === highlightedNet,
                );

            const stats = isSimulating ? getComponentStats(n) : null;
            const heatColor = stats ? getHeatColor(stats.power) : null;

            let liveValueStr = "";
            if (isSimulating && stats) {
              if (n.symbol === "voltmeter") {
                const v = stats.voltage;
                const absV = Math.abs(v);
                if (absV >= 1) liveValueStr = `${v.toFixed(2)} V`;
                else if (absV >= 1e-3) liveValueStr = `${(v * 1000).toFixed(1)} mV`;
                else if (absV >= 1e-6) liveValueStr = `${(v * 1e6).toFixed(1)} µV`;
                else liveValueStr = "0.00 V";
              } else if (n.symbol === "ammeter") {
                const i = stats.current;
                const absI = Math.abs(i);
                if (absI >= 1) liveValueStr = `${i.toFixed(2)} A`;
                else if (absI >= 1e-3) liveValueStr = `${(i * 1000).toFixed(1)} mA`;
                else if (absI >= 1e-6) liveValueStr = `${(i * 1e6).toFixed(1)} µA`;
                else liveValueStr = "0.00 A";
              }
            }

            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y})`}
                style={{ cursor: "move" }}
              >
                {locateSignal?.id === n.id && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={Math.max(sym.width, sym.height) * 1.5}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={0.2}
                    opacity={0.8}
                    style={{ filter: "drop-shadow(0 0 4px #ef4444)" }}
                  >
                    <animate
                      attributeName="r"
                      from={Math.max(sym.width, sym.height) * 0.5}
                      to={Math.max(sym.width, sym.height) * 2.0}
                      dur="1.5s"
                      repeatCount="3"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.8"
                      to="0"
                      dur="1.5s"
                      repeatCount="3"
                    />
                  </circle>
                )}
                {/* Heat glow now in SchematicWebGLSelection glows */}
                {/* LED glow now in SchematicWebGLSelection glows */}
                <rect
                  x={cx - (cx + 0.2) * nodeScale}
                  y={cy - (cy + 0.2) * nodeScale}
                  width={(sym.width + 0.4) * nodeScale}
                  height={(sym.height + 0.4) * nodeScale}
                  fill="rgba(0,0,0,0.001)"
                />
                <g
                  transform={`rotate(${n.rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${nodeScale}) translate(${-cx} ${-cy})`}
                >
                  <g>
                    {(() => {
                    let componentColor = burntNow.has(n.id) ? "#4b3f39" : hasNetPin ? "#2563eb" : nodeColor;
                    let gradientDef = null;

                    if (isSimulating && !realistic && sym.pins.length > 0 && !hasNetPin) {
                      const pinVoltages = sym.pins.map((pin, i) => {
                        const netId = netIndex.pinNet.get(`${n.id}:${i}`);
                        return netId !== undefined ? getNetVoltage(netId) : 0;
                      });

                      if (sym.pins.length === 2) {
                        const c1 = pinVoltages[0] > 0.001 ? "#4ade80" : "#94a3b8";
                        const c2 = pinVoltages[1] > 0.001 ? "#4ade80" : "#94a3b8";
                        
                        if (c1 !== c2) {
                          const gradId = `grad-${n.id}`;
                          componentColor = `url(#${gradId})`;
                          gradientDef = (
                            <defs>
                              <linearGradient id={gradId} x1={sym.pins[0].x} y1={sym.pins[0].y} x2={sym.pins[1].x} y2={sym.pins[1].y} gradientUnits="userSpaceOnUse">
                                <stop offset="20%" stopColor={c1} />
                                <stop offset="80%" stopColor={c2} />
                              </linearGradient>
                            </defs>
                          );
                        } else {
                          componentColor = c1;
                        }
                      } else {
                        const allPositive = pinVoltages.every(v => v > 0.001);
                        const allNegative = pinVoltages.every(v => v <= 0.001);
                        if (allPositive) componentColor = "#4ade80";
                        else if (allNegative) componentColor = "#94a3b8";
                      }
                    }
                    
                    // The body glyph for this node is already drawn by the WebGL symbols pass
                    // (see webglSymbolInstances above) — don't also draw it in SVG. Nodes
                    // excluded from that pass (realistic mode, text) still fall through to
                    // sym.draw() here. Capacitor breathing is now WebGL-driven.
                    const bodyDrawnByWebGL = webglSymbolNodeIds.has(n.id);

                    return (
                      <>
                        {gradientDef}
                        {n.symbol === "text" ? null : bodyDrawnByWebGL ? null : (
                          sym.draw(componentColor)
                        )}
                      </>
                    );
                  })()}
                  <ComponentStateAnimation
                    node={n}
                    stats={stats}
                    isSimulating={isSimulating}
                    currentTime={currentTime}
                    doc={doc}
                  />
                  {/* Component CurrentFlow now in SchematicWebGLCurrentFlow */}
                  {/* Pin name labels now rendered by SchematicWebGLBadges (webglPinLabelInstances) */}
                  {/* Selection outline now drawn by SchematicWebGLSelection (WebGL) */}
                  </g>
                </g>
                {/* Pin markers (visual) now drawn by SchematicWebGLSelection.
                    Keep invisible hit-target circles for pointer events. */}
                {transformedPins(sym, n.rotation, nodeScale).map((p, i) => {
                  if (sym.pins[i].hide) return null;
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={0.22}
                      fill="rgba(0,0,0,0.001)"
                      style={{ cursor: "pointer", pointerEvents: "auto" }}
                      onPointerDown={(e) => {
                        if (tool !== "select") return;
                        e.stopPropagation();
                        if (setSelectedPin)
                          setSelectedPin({ nodeId: n.id, pinIndex: i });
                        setSelectedIds([]);
                        setSelectedWireIds([]);
                        if (setSelectedTrackId) setSelectedTrackId(null);
                      }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Wire-tool hover + pending indicators now drawn by SchematicWebGLSelection */}

          {/* ghostOverlay now WebGL */}
          {probeData && (
            <g
              transform={`translate(${probeData.x} ${probeData.y})`}
              pointerEvents="none"
            >
              <rect
                x={0.2}
                y={-0.6}
                width={4.2}
                height={
                  probeData.history
                    ? probeData.val.includes("\n")
                      ? 3.4
                      : 2.8
                    : probeData.val.includes("\n")
                      ? 1.6
                      : 1.0
                }
                rx={0.15}
                fill="#0f172a"
                opacity={0.95}
                stroke="#1e293b"
                strokeWidth={0.05}
              />
              <text
                x={0.4}
                y={-0.2}
                fontSize={0.3}
                fill="#94a3b8"
                fontWeight="bold"
              >
                {probeData.type}
              </text>
              {probeData.val.split("\n").map((line, idx) => (
                <text
                  key={idx}
                  x={0.4}
                  y={0.25 + idx * 0.45}
                  fontSize={0.38}
                  fill="#10b981"
                  fontWeight="black"
                  fontFamily="ui-monospace"
                >
                  {line}
                </text>
              ))}
              {probeData.history && (
                <g transform={`translate(0, ${probeData.val.includes("\n") ? 0.6 : 0.2})`}>
                  <MiniOscilloscope
                    values={probeData.history}
                    currentTime={currentTime}
                    width={3.8}
                    height={1.2}
                  />
                </g>
              )}
            </g>
          )}
          {gesture.current.type === "selection" && (() => {
            const g = gesture.current;
            const x1 = Math.min(g.startX!, g.currentX!);
            const y1 = Math.min(g.startY!, g.currentY!);
            const x2 = Math.max(g.startX!, g.currentX!);
            const y2 = Math.max(g.startY!, g.currentY!);
            
            const w1 = screenToWorld(x1, y1);
            const w2 = screenToWorld(x2, y2);
            
            return (
              <rect
                x={w1.x}
                y={w1.y}
                width={w2.x - w1.x}
                height={w2.y - w1.y}
                fill="#2563eb"
                fillOpacity={0.15}
                stroke="#2563eb"
                strokeWidth={0.05}
                strokeDasharray="0.2,0.1"
                pointerEvents="none"
              />
            );
          })()}
        </g>

        {dragOverlay}
        {/* alignmentOverlay now WebGL */}
        {placement && (
          <g pointerEvents="none">
            <rect
              x={size.w / 2 - 130}
              y={8}
              width={260}
              height={26}
              rx={6}
              fill="#2563eb"
              opacity={0.92}
            />
            <text
              x={size.w / 2}
              y={26}
              fontSize={12}
              textAnchor="middle"
              fill="#fff"
              fontFamily="system-ui"
            >
              Tap to place · R to rotate · Esc to cancel
            </text>
          </g>
        )}
      </svg>
      )}

    </div>
  );
}
