// Component damage analysis for the simulator.
//
// Looks at the solved waveforms (current / power / node voltages) and decides which parts
// would be destroyed in real life: an LED fed far above its 30 mA absolute maximum (or a reverse
// voltage above ~5 V), a resistor dissipating several times its rating, a source delivering a short
// circuit current, a diode carrying more than 1 A.
//
// The result is a map  nodeId -> DamageEvent  with the simulation time at which the part first
// failed and a severity in 0..1 (0.15-0.35 = overheating / smoke only, > 0.35 = open flames).
import type { SchematicDoc, SchematicNode } from "./schematic";
import { buildNetIndex, type NetIndex } from "./netlist";
import { SYMBOLS } from "./symbols";
import { findGndNetId, getComponentRef, getSpiceNodeName, type SimulationResult } from "./simulation";

export type DamageKind = "led" | "resistor" | "source" | "diode";
export type DamageReason = "overcurrent" | "reverse-voltage" | "overpower" | "short-circuit";

export interface DamageEvent {
  nodeId: string;
  kind: DamageKind;
  reason: DamageReason;
  /** simulation time (s) of the first sample that exceeded the limit */
  time: number;
  /** 0..1 — below FIRE_THRESHOLD the part only smokes */
  severity: number;
  /** worst value seen (A for current, V for reverse voltage, W for power) */
  peak: number;
}

export const FIRE_THRESHOLD = 0.35;

export const LED_MAX_CURRENT = 0.03;      // A  (typical absolute maximum rating of a 5 mm LED)
export const LED_MAX_REVERSE = 5;         // V  (reverse breakdown of a standard LED)
export const DIODE_MAX_CURRENT = 1;       // A  (1N400x class)
export const SOURCE_MAX_CURRENT = 10;     // A
export const DEFAULT_RESISTOR_RATING = 0.25; // W

const LED_SYMBOLS = new Set(["led"]);
const DIODE_SYMBOLS = new Set(["diode", "schottky", "rectifier"]);
const RESISTOR_SYMBOLS = new Set(["resistor"]);
const SOURCE_SYMBOLS = new Set(["battery", "vsource", "dc_source", "lipo_battery", "li_ion_18650"]);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function damageKindOf(symbol: string): DamageKind | null {
  if (LED_SYMBOLS.has(symbol)) return "led";
  if (DIODE_SYMBOLS.has(symbol)) return "diode";
  if (RESISTOR_SYMBOLS.has(symbol)) return "resistor";
  if (SOURCE_SYMBOLS.has(symbol)) return "source";
  return null;
}

function firstExceeding(values: { t: number; v: number }[], limit: number, abs = true): { idx: number; peak: number } | null {
  let idx = -1, peak = 0;
  for (let i = 0; i < values.length; i++) {
    const x = abs ? Math.abs(values[i].v) : values[i].v;
    if (x > limit) { if (idx < 0) idx = i; if (x > peak) peak = x; }
  }
  return idx < 0 ? null : { idx, peak };
}

export function analyzeDamage(
  doc: SchematicDoc,
  results: SimulationResult[],
  netIndexArg?: NetIndex,
): Map<string, DamageEvent> {
  const out = new Map<string, DamageEvent>();
  if (!results || results.length === 0) return out;
  const netIndex = netIndexArg ?? buildNetIndex(doc);
  const gnd = findGndNetId(doc, netIndex);

  const cur = new Map<string, SimulationResult>();
  const pow = new Map<string, SimulationResult>();
  const volt = new Map<string, SimulationResult>();
  for (const r of results) {
    if (r.type === "current") cur.set(r.node, r);
    else if (r.type === "power") pow.set(r.node, r);
    else if (r.type === "voltage") volt.set(r.node, r);
  }

  const netVoltage = (n: SchematicNode, pin: number) => {
    const netId = netIndex.pinNet.get(`${n.id}:${pin}`);
    return volt.get(getSpiceNodeName(netId, gnd))?.values;
  };

  const put = (n: SchematicNode, kind: DamageKind, reason: DamageReason, time: number, severity: number, peak: number) => {
    const prev = out.get(n.id);
    // keep the earliest failure, but the worst severity
    if (prev) {
      prev.time = Math.min(prev.time, time);
      if (severity > prev.severity) { prev.severity = severity; prev.reason = reason; prev.peak = peak; }
      return;
    }
    out.set(n.id, { nodeId: n.id, kind, reason, time, severity: clamp01(severity), peak });
  };

  for (const n of doc.nodes) {
    const kind = damageKindOf(n.symbol as string);
    if (!kind || !SYMBOLS[n.symbol]) continue;
    const ref = getComponentRef(n, doc);
    const c = cur.get(ref)?.values;
    if (!c || c.length === 0) continue;

    if (kind === "led") {
      const hit = firstExceeding(c, LED_MAX_CURRENT);
      if (hit) put(n, kind, "overcurrent", c[hit.idx].t, 0.4 + 0.6 * clamp01((hit.peak - LED_MAX_CURRENT) / 0.17), hit.peak);
      // reverse breakdown: anode (pin 0) far below cathode (pin 1)
      const va = netVoltage(n, 0), vk = netVoltage(n, 1);
      if (va || vk) {
        const len = Math.max(va?.length ?? 0, vk?.length ?? 0);
        let idx = -1, peak = 0;
        for (let i = 0; i < len; i++) {
          const rev = (vk?.[i]?.v ?? 0) - (va?.[i]?.v ?? 0);
          if (rev > LED_MAX_REVERSE) { if (idx < 0) idx = i; if (rev > peak) peak = rev; }
        }
        if (idx >= 0) put(n, kind, "reverse-voltage", (va ?? vk)![idx].t, 0.55 + 0.45 * clamp01((peak - LED_MAX_REVERSE) / 45), peak);
      }
    } else if (kind === "diode") {
      const hit = firstExceeding(c, DIODE_MAX_CURRENT);
      if (hit) put(n, kind, "overcurrent", c[hit.idx].t, 0.45 + 0.55 * clamp01((hit.peak - DIODE_MAX_CURRENT) / 20), hit.peak);
    } else if (kind === "source") {
      const hit = firstExceeding(c, SOURCE_MAX_CURRENT);
      if (hit) put(n, kind, "short-circuit", c[hit.idx].t, 0.5 + 0.5 * clamp01((hit.peak - SOURCE_MAX_CURRENT) / 100), hit.peak);
    } else if (kind === "resistor") {
      const p = pow.get(ref)?.values;
      if (!p) continue;
      const rating = Number(n.metadata?.powerRating) > 0 ? Number(n.metadata.powerRating) : DEFAULT_RESISTOR_RATING;
      const hit = firstExceeding(p, rating * 2);        // starts to smoke at 2x rating
      if (hit) {
        const ratio = hit.peak / rating;
        const sev = ratio <= 5 ? 0.15 + 0.2 * clamp01((ratio - 2) / 3) : 0.45 + 0.55 * clamp01((ratio - 5) / 60);
        put(n, kind, "overpower", p[hit.idx].t, sev, hit.peak);
      }
    }
  }
  return out;
}

export function damageMessage(ev: DamageEvent, ref: string, lang: string): string {
  const ar = lang === "ar";
  const fire = ev.severity >= FIRE_THRESHOLD;
  switch (ev.reason) {
    case "overcurrent":
      return ev.kind === "led"
        ? (ar ? `احترق الليد ${ref}: تيار ${(ev.peak * 1000).toFixed(0)}mA يتجاوز الحد الأقصى 30mA` : `LED ${ref} burned out: ${(ev.peak * 1000).toFixed(0)} mA exceeds the 30 mA maximum`)
        : (ar ? `تلف الدايود ${ref}: تيار ${ev.peak.toFixed(2)}A` : `Diode ${ref} destroyed: ${ev.peak.toFixed(2)} A`);
    case "reverse-voltage":
      return ar ? `انهيار عكسي للّيد ${ref}: جهد عكسي ${ev.peak.toFixed(0)}V` : `LED ${ref} reverse breakdown: ${ev.peak.toFixed(0)} V reverse`;
    case "overpower":
      return fire
        ? (ar ? `اشتعلت المقاومة ${ref}: قدرة ${ev.peak.toFixed(1)}W` : `Resistor ${ref} caught fire: ${ev.peak.toFixed(1)} W`)
        : (ar ? `المقاومة ${ref} ترتفع حرارتها وتدخّن (${ev.peak.toFixed(2)}W)` : `Resistor ${ref} is overheating and smoking (${ev.peak.toFixed(2)} W)`);
    case "short-circuit":
      return ar ? `قصر دارة: ${ref} يعطي ${ev.peak.toFixed(0)}A ويشتعل` : `Short circuit: ${ref} delivers ${ev.peak.toFixed(0)} A and ignites`;
  }
}
