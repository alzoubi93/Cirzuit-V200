/**
 * Embedded official KiCad footprints (offline).
 * Geometry shipped as gzip under /kicad-footprints/ (includes (model ...) refs).
 */
import officialMeta from "./officialMeta.json";
import { readKicadFootprintDefinition } from "../kicadFootprintReader";
import type { KicadFootprintModel } from "../kicadFootprint";

export type EmbeddedOfficialMeta = {
  library: string;
  name: string;
  fullName: string;
};

const meta = officialMeta as Record<string, EmbeddedOfficialMeta>;
let mods: Record<string, string> = {};
let loadState: "idle" | "loading" | "ready" | "error" = "idle";
let loadPromise: Promise<void> | null = null;
const GZIP_URL = "/kicad-footprints/officialMods.json.gz";

async function loadFromGzip(): Promise<Record<string, string>> {
  const res = await fetch(GZIP_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`gzip fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (typeof DecompressionStream === "undefined") throw new Error("DecompressionStream unavailable");
  const stream = new Response(buf).body!.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text) as Record<string, string>;
}

export function ensureEmbeddedReady(): Promise<void> {
  if (loadState === "ready") return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadState = "loading";
  loadPromise = (async () => {
    try {
      mods = await loadFromGzip();
      loadState = "ready";
    } catch (e) {
      loadState = "error";
      console.error("[CirZuit] embedded footprints failed:", e);
      mods = {};
    }
  })();
  return loadPromise;
}

if (typeof window !== "undefined") void ensureEmbeddedReady();

export function listEmbeddedOfficialIds(): string[] {
  return Object.keys(mods).length ? Object.keys(mods) : Object.keys(meta);
}
export function hasEmbeddedOfficial(catalogId: string): boolean {
  return catalogId in mods || catalogId in meta;
}
export function getEmbeddedOfficialMeta(catalogId: string): EmbeddedOfficialMeta | undefined {
  return meta[catalogId];
}
export function isEmbeddedPackReady(): boolean {
  return loadState === "ready";
}
export function loadEmbeddedOfficialFootprint(catalogId: string): KicadFootprintModel | null {
  const text = mods[catalogId];
  if (!text) return null;
  const m = meta[catalogId];
  const model = readKicadFootprintDefinition(text, {
    type: "kicad-official",
    path: m ? `${m.library}.pretty/${m.name}.kicad_mod` : catalogId,
    repository: "https://gitlab.com/kicad/libraries/kicad-footprints.git",
    commit: "master-embedded",
  });
  if (m) {
    model.library = m.library;
    model.name = model.name || m.name;
    model.fullName = m.fullName;
  }
  (model as any).fromOfficialKiCad = true;
  (model as any).catalogItemId = catalogId;
  (model as any).embeddedOffline = true;
  return model;
}
