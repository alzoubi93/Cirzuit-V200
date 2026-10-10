import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderTree,
  Eye,
  Download,
  Box,
  Cpu,
  Layers,
  Zap,
  Cable,
  Check,
  Sliders,
  Info,
  SlidersHorizontal,
  FileUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  FOOTPRINT_CATEGORIES,
  FOOTPRINT_LIBRARY_CATALOG,
  FOOTPRINT_LIBRARY_GROUPS,
  buildModelFromLibraryItem,
  resolveOfficialOrGeneratedModel,
  isOfficialEmbeddedCatalogItem,
  type FootprintCategoryGroup,
  type FootprintLibraryGroup,
  type FootprintLibraryItem,
} from "@/lib/kicad/generator/footprintLibraryData";
import { getOfficialFootprintRef, getMappedOfficialLibraries } from "@/lib/kicad/generator/officialFootprintMap";
import { ensureEmbeddedReady, loadEmbeddedOfficialFootprint } from "@/lib/kicad/footprint/embedded";
import { getGeneratorSupport, type GeneratorSupport } from "@/lib/kicad/generator/generatorSupport";
import { nativeFootprintBounds } from "./KicadFootprintGeometry";
import {
  readKicadFootprintDefinition,
  kicadFootprintLibrary,
  type KicadFootprintModel,
} from "@/lib/kicad/footprint";
import { FootprintPreview } from "./FootprintBrowser";
import { FootprintLayerToggles, DEFAULT_LAYER_VISIBILITY } from "./FootprintLayerToggles";

interface Props {
  selectionOnly?: boolean;
  onSelectFootprint: (footprint: KicadFootprintModel) => void;
  /**
   * Opens the generator with the footprint that the Library is showing.
   * `model` is the real library geometry when `mode === "model"` (the generator
   * displays and edits that exact footprint); for `mode === "parametric"` the
   * generator opens the matching parametric family with the catalog params.
   */
  onCustomizeInGenerator: (
    item: FootprintLibraryItem,
    model: KicadFootprintModel | null,
    mode: Exclude<GeneratorSupport, "none">
  ) => void;
  onViewChange?: (
    view: "libraries" | "footprints" | "preview",
    info?: {
      libraryName?: string;
      count?: number;
      itemName?: string;
      mounting?: string;
      onBackToLibraries?: () => void;
      onBackToFootprints?: () => void;
    }
  ) => void;
}

/**
 * High-performance vector SVG thumbnail renderer for library footprint cards.
 * Renders pads, silkscreen outlines, drill holes, and pin markers in microseconds.
 */
export const FootprintVectorThumbnail = React.memo(function FootprintVectorThumbnail({
  model,
  className = "w-full h-full",
}: {
  model: KicadFootprintModel;
  className?: string;
}) {
  const { viewBox, paths, pads } = useMemo(() => {
    if (!model) {
      return { viewBox: "-10 -10 20 20", paths: [], pads: [] };
    }

    const b = nativeFootprintBounds(model);
    const rawW = Number.isFinite(b.maxX - b.minX) ? b.maxX - b.minX : 10;
    const rawH = Number.isFinite(b.maxY - b.minY) ? b.maxY - b.minY : 10;
    const w = Math.max(2.4, rawW);
    const h = Math.max(2.4, rawH);
    const pad = Math.max(0.8, Math.max(w, h) * 0.18);
    const minX = (Number.isFinite(b.minX) ? b.minX : -w / 2) - pad;
    const minY = (Number.isFinite(b.minY) ? b.minY : -h / 2) - pad;
    const totalW = w + pad * 2;
    const totalH = h + pad * 2;

    // Extract silkscreen shapes
    const shapes = model.shapes || [];
    const svgPaths: React.ReactNode[] = [];

    shapes.forEach((s: any, idx) => {
      if (s.shape === "line") {
        const x1 = Number.isFinite(s.x1) ? s.x1 : Number.isFinite(s.start?.x) ? s.start.x : 0;
        const y1 = Number.isFinite(s.y1) ? s.y1 : Number.isFinite(s.start?.y) ? s.start.y : 0;
        const x2 = Number.isFinite(s.x2) ? s.x2 : Number.isFinite(s.end?.x) ? s.end.x : 0;
        const y2 = Number.isFinite(s.y2) ? s.y2 : Number.isFinite(s.end?.y) ? s.end.y : 0;
        svgPaths.push(
          <line
            key={`s-l-${idx}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#cbd5e1"
            strokeWidth={Math.max(0.12, (s.thickness || 0.15) * 0.8)}
            strokeLinecap="round"
          />
        );
      } else if (s.shape === "rect") {
        const x1 = Number.isFinite(s.x1)
          ? s.x1
          : Number.isFinite(s.start?.x)
          ? s.start.x
          : Number.isFinite(s.x)
          ? s.x
          : Number.isFinite(s.center?.x)
          ? s.center.x - (s.size?.x || 0) / 2
          : 0;
        const y1 = Number.isFinite(s.y1)
          ? s.y1
          : Number.isFinite(s.start?.y)
          ? s.start.y
          : Number.isFinite(s.y)
          ? s.y
          : Number.isFinite(s.center?.y)
          ? s.center.y - (s.size?.y || 0) / 2
          : 0;
        const x2 = Number.isFinite(s.x2)
          ? s.x2
          : Number.isFinite(s.end?.x)
          ? s.end.x
          : Number.isFinite(s.width)
          ? x1 + s.width
          : Number.isFinite(s.size?.x)
          ? x1 + s.size.x
          : x1;
        const y2 = Number.isFinite(s.y2)
          ? s.y2
          : Number.isFinite(s.end?.y)
          ? s.end.y
          : Number.isFinite(s.height)
          ? y1 + s.height
          : Number.isFinite(s.size?.y)
          ? y1 + s.size.y
          : y1;

        const rx = Number.isFinite(Math.min(x1, x2)) ? Math.min(x1, x2) : 0;
        const ry = Number.isFinite(Math.min(y1, y2)) ? Math.min(y1, y2) : 0;
        const rw = Number.isFinite(Math.abs(x2 - x1)) ? Math.abs(x2 - x1) : 1;
        const rh = Number.isFinite(Math.abs(y2 - y1)) ? Math.abs(y2 - y1) : 1;
        svgPaths.push(
          <rect
            key={`s-r-${idx}`}
            x={rx}
            y={ry}
            width={rw}
            height={rh}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={0.15}
          />
        );
      } else if (s.shape === "circle") {
        const cx = Number.isFinite(s.x) ? s.x : Number.isFinite(s.cx) ? s.cx : Number.isFinite(s.center?.x) ? s.center.x : 0;
        const cy = Number.isFinite(s.y) ? s.y : Number.isFinite(s.cy) ? s.cy : Number.isFinite(s.center?.y) ? s.center.y : 0;
        const r = Number.isFinite(s.radius) ? s.radius : Number.isFinite(s.r) ? s.r : 1;
        svgPaths.push(
          <circle
            key={`s-c-${idx}`}
            cx={cx}
            cy={cy}
            r={Math.max(0.1, r)}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={0.15}
          />
        );
      }
    });

    // Extract pads
    const modelPads = model.pads || [];
    const svgPads: React.ReactNode[] = [];

    modelPads.forEach((p: any, idx) => {
      const px = Number.isFinite(p.x) ? p.x : Number.isFinite(p.position?.x) ? p.position.x : 0;
      const py = Number.isFinite(p.y) ? p.y : Number.isFinite(p.position?.y) ? p.position.y : 0;
      const pw = Number.isFinite(p.width)
        ? p.width
        : Number.isFinite(p.size?.x)
        ? p.size.x
        : Number.isFinite(p.size?.width)
        ? p.size.width
        : 1.2;
      const ph = Number.isFinite(p.height)
        ? p.height
        : Number.isFinite(p.size?.y)
        ? p.size.y
        : Number.isFinite(p.size?.height)
        ? p.size.height
        : 1.2;
      const drillDiam = typeof p.drill === "number" && Number.isFinite(p.drill) ? p.drill : Number.isFinite(p.drill?.diameter) ? p.drill.diameter : 0;
      const isTht = drillDiam > 0 || p.type === "thru_hole" || p.type === "np_thru_hole";
      const isPin1 = p.number === "1" || idx === 0;
      const padColor = isPin1 ? "#f59e0b" : "#eab308";

      if (p.shape === "circle") {
        svgPads.push(
          <g key={`p-${idx}`}>
            <circle cx={px} cy={py} r={Math.max(0.1, pw / 2)} fill={padColor} />
            {isTht && <circle cx={px} cy={py} r={Math.max(0.05, (drillDiam || 0.8) / 2)} fill="#030712" stroke="#ca8a04" strokeWidth={0.05} />}
          </g>
        );
      } else {
        const rad = Math.min(pw, ph) * 0.15;
        const rx = Number.isFinite(px - pw / 2) ? px - pw / 2 : 0;
        const ry = Number.isFinite(py - ph / 2) ? py - ph / 2 : 0;
        svgPads.push(
          <g key={`p-${idx}`}>
            <rect
              x={rx}
              y={ry}
              width={Math.max(0.1, pw)}
              height={Math.max(0.1, ph)}
              rx={Number.isFinite(rad) ? rad : 0.1}
              fill={padColor}
            />
            {isTht && <circle cx={px} cy={py} r={Math.max(0.05, (drillDiam || 0.8) / 2)} fill="#030712" stroke="#ca8a04" strokeWidth={0.05} />}
          </g>
        );
      }
    });

    return {
      viewBox: `${minX} ${minY} ${totalW} ${totalH}`,
      paths: svgPaths,
      pads: svgPads,
    };
  }, [model]);

  return (
    <div className={`relative ${className} flex items-center justify-center overflow-hidden select-none`}>
      <svg
        viewBox={viewBox}
        className="w-full h-full max-w-[90px] max-h-[90px] drop-shadow-sm"
        preserveAspectRatio="xMidYMid meet"
      >
        <g>{paths}</g>
        <g>{pads}</g>
      </svg>
    </div>
  );
});

export function FootprintLibrarySection({
  selectionOnly = false,
  onSelectFootprint,
  onCustomizeInGenerator,
  onViewChange,
}: Props) {
  const { lang } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const model = readKicadFootprintDefinition(content);
      model.library = "Custom_Upload";
      model.fullName = `Custom_Upload:${model.name}`;
      kicadFootprintLibrary.registerCustom(model);
      onSelectFootprint(model);
    } catch (err) {
      console.error("Failed to read footprint file", err);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  // Navigation views: "libraries" (Tree) -> "footprints" (List) -> "preview" (Inspect)
  const [view, setView] = useState<"libraries" | "footprints" | "preview">("libraries");
  const [selectedLibrary, setSelectedLibrary] = useState<FootprintLibraryGroup | null>(null);
  const [selectedSubtree, setSelectedSubtree] = useState<"all" | "SMD" | "THT">("all");
  const [selectedItem, setSelectedItem] = useState<FootprintLibraryItem | null>(null);

  // Search & Categories filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FootprintCategoryGroup>("all");

  // Track expanded tree branches in libraries view
  const [expandedTrees, setExpandedTrees] = useState<Set<string>>(new Set());

  // Layer visibility for live preview
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(DEFAULT_LAYER_VISIBILITY);

  // Session cache of officially loaded footprints (WebGL-native geometry).
  const [officialModels, setOfficialModels] = useState<Map<string, KicadFootprintModel>>(new Map());
  const [officialLoadingId, setOfficialLoadingId] = useState<string | null>(null);
  const [officialStatus, setOfficialStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [packReady, setPackReady] = useState(false);

  // Inflate offline gzip footprint pack once (WebGL still uses native models).
  useEffect(() => {
    let cancelled = false;
    void ensureEmbeddedReady().then(() => {
      if (!cancelled) setPackReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Build models after the offline pack is ready so embedded geometry is used.
  const itemModels = useMemo(() => {
    const map = new Map<string, KicadFootprintModel>();
    for (const item of FOOTPRINT_LIBRARY_CATALOG) {
      try {
        map.set(item.id, buildModelFromLibraryItem(item));
      } catch (err) {
        console.error(`Failed to generate footprint model for ${item.id}`, err);
      }
    }
    return map;
  }, [packReady]);

  // Warm up official library indexes for mapped libraries (non-blocking).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await kicadFootprintLibrary.initialize();
        const libs = getMappedOfficialLibraries();
        for (const lib of libs) {
          if (cancelled) return;
          try { await kicadFootprintLibrary.ensureLibrary(lib); } catch { /* ignore per-lib */ }
        }
      } catch {
        // Offline / CORS — library will use generator fallback.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadOfficialForItem = useCallback(async (item: FootprintLibraryItem) => {
    const ref = getOfficialFootprintRef(item.id);
    if (!ref) return null;
    if (officialModels.has(item.id)) return officialModels.get(item.id)!;
    setOfficialLoadingId(item.id);
    setOfficialStatus("loading");
    try {
      const model = await resolveOfficialOrGeneratedModel(item, (full) =>
        kicadFootprintLibrary.loadByFullName(full)
      );
      const fromOfficial = !!(model as any).fromOfficialKiCad;
      setOfficialModels(prev => {
        const next = new Map(prev);
        next.set(item.id, model);
        return next;
      });
      setOfficialStatus(fromOfficial ? "ready" : "fallback");
      return model;
    } catch {
      setOfficialStatus("fallback");
      return null;
    } finally {
      setOfficialLoadingId(null);
    }
  }, [officialModels]);

  // Quick lookup of catalog items by ID
  const catalogById = useMemo(() => {
    const map = new Map<string, FootprintLibraryItem>();
    for (const item of FOOTPRINT_LIBRARY_CATALOG) {
      map.set(item.id, item);
    }
    return map;
  }, []);

  // Filtered libraries list based on search and category
  const filteredLibraries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FOOTPRINT_LIBRARY_GROUPS.filter((lib) => {
      // Category filter
      if (activeCategory !== "all" && lib.category !== activeCategory) {
        return false;
      }
      if (!q) return true;

      // Search match in library name, arabic name, description, or contained item names
      const matchLib =
        lib.name.toLowerCase().includes(q) ||
        lib.nameAr.toLowerCase().includes(q) ||
        lib.description.toLowerCase().includes(q) ||
        lib.descriptionAr.toLowerCase().includes(q);

      if (matchLib) return true;

      // Check if any contained items match search
      return lib.itemIds.some((itemId) => {
        const item = catalogById.get(itemId);
        if (!item) return false;
        return (
          item.name.toLowerCase().includes(q) ||
          item.nameAr.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    });
  }, [searchQuery, activeCategory, catalogById]);

  // Footprints inside the currently selected library & subtree
  const currentLibraryItems = useMemo(() => {
    if (!selectedLibrary) return [];
    const items: FootprintLibraryItem[] = [];
    for (const id of selectedLibrary.itemIds) {
      const it = catalogById.get(id);
      if (it) items.push(it);
    }

    // Filter by selected subtree (All / SMD / THT)
    let list = items;
    if (selectedSubtree !== "all") {
      list = list.filter((it) => it.mounting === selectedSubtree || it.mounting === "Both");
    }

    // Filter by in-library search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.nameAr.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q) ||
          it.descriptionAr.toLowerCase().includes(q) ||
          it.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return list;
  }, [selectedLibrary, selectedSubtree, searchQuery, catalogById]);

  const handleBackToLibraries = useCallback(() => {
    setSearchQuery("");
    setView("libraries");
  }, []);

  const handleBackToFootprints = useCallback(() => {
    setView("footprints");
  }, []);

  useEffect(() => {
    onViewChange?.(view, {
      libraryName: selectedLibrary?.name,
      count: currentLibraryItems.length,
      itemName: selectedItem?.name,
      mounting: selectedItem?.mounting,
      onBackToLibraries: handleBackToLibraries,
      onBackToFootprints: handleBackToFootprints,
    });
  }, [view, selectedLibrary?.name, currentLibraryItems.length, selectedItem?.name, selectedItem?.mounting, handleBackToLibraries, handleBackToFootprints, onViewChange]);

  // Toggle tree expansion for a specific library
  const toggleTreeExpand = (libId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTrees((prev) => {
      const next = new Set(prev);
      if (next.has(libId)) next.delete(libId);
      else next.add(libId);
      return next;
    });
  };

  // Open library at a specific subtree branch (All / SMD / THT)
  const openLibrary = (lib: FootprintLibraryGroup, subtree: "all" | "SMD" | "THT" = "all") => {
    setSelectedLibrary(lib);
    setSelectedSubtree(subtree);
    setSearchQuery("");
    setView("footprints");
  };

  // Open live preview for a specific footprint item
  const openPreview = (item: FootprintLibraryItem) => {
    setSelectedItem(item);
    setView("preview");
  };

  // Render Category Icon (Unified with KiCad import style)
  const renderCategoryIcon = (_category?: FootprintCategoryGroup, _iconName?: string) => {
    return <FolderOpen className="size-4" />;
  };

  // Selected item footprint model for live preview
  // Prefer officially loaded KiCad geometry; fall back to parametric generator.
  const selectedModel = useMemo(() => {
    if (!selectedItem) return null;
    return (
      officialModels.get(selectedItem.id) ||
      itemModels.get(selectedItem.id) ||
      buildModelFromLibraryItem(selectedItem)
    );
  }, [selectedItem, itemModels, officialModels]);

  // Can the generator handle the footprint currently previewed?
  // "model" → edit the real geometry, "parametric" → family params, "none" → hide the button.
  const generatorSupport = useMemo<GeneratorSupport>(() => {
    if (!selectedItem) return "none";
    const officialPending =
      isOfficialEmbeddedCatalogItem(selectedItem.id) ||
      (!!getOfficialFootprintRef(selectedItem.id) &&
        !officialModels.has(selectedItem.id) &&
        officialStatus !== "fallback");
    return getGeneratorSupport({
      familyId: selectedItem.familyId,
      model: selectedModel,
      officialPending,
    });
  }, [selectedItem, selectedModel, officialModels, officialStatus, packReady]);

  // Resolve the freshest real geometry for an item and hand it to the generator.
  const handleCustomizeClick = useCallback(async (item: FootprintLibraryItem) => {
    let model: KicadFootprintModel | null = selectedModel;
    try {
      if (isOfficialEmbeddedCatalogItem(item.id)) {
        await ensureEmbeddedReady();
        model = loadEmbeddedOfficialFootprint(item.id) || model;
      } else if (getOfficialFootprintRef(item.id)) {
        model = officialModels.get(item.id) || (await loadOfficialForItem(item)) || model;
      }
    } catch {
      /* keep the model we already have */
    }
    const mode = getGeneratorSupport({ familyId: item.familyId, model });
    if (mode === "none") return;
    onCustomizeInGenerator(item, model, mode);
  }, [selectedModel, officialModels, loadOfficialForItem, onCustomizeInGenerator]);

  // When user opens a footprint preview, resolve official geometry if not already embedded.
  useEffect(() => {
    if (view !== "preview" || !selectedItem) return;
    if (isOfficialEmbeddedCatalogItem(selectedItem.id)) {
      setOfficialStatus("ready");
      return;
    }
    if (officialModels.has(selectedItem.id)) return;
    if (!getOfficialFootprintRef(selectedItem.id)) {
      setOfficialStatus("fallback");
      return;
    }
    void loadOfficialForItem(selectedItem);
  }, [view, selectedItem, officialModels, loadOfficialForItem]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-slate-950 text-slate-100" dir="ltr">
      {/* ========================================================================= */}
      {/* VIEW 1: LIBRARIES & TREE VIEW                                              */}
      {/* ========================================================================= */}
      {view === "libraries" && (
        <div className="h-full flex flex-col min-h-0">
          {/* Top Search & Filter Bar */}
          <div className="p-2.5 sm:p-3 border-b border-slate-800 space-y-2 shrink-0 bg-slate-900/40">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-slate-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    lang === "ar"
                      ? "بحث في مكتبات وعائلات البصمات (مثل Resistor, DIP, SOT-23, USB)..."
                      : "Search footprint libraries (e.g. Resistor, DIP, SOT-23, USB)..."
                  }
                  className="h-8 sm:h-9 ps-8 sm:ps-9 text-xs sm:text-sm bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".kicad_mod"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 sm:h-9 text-xs gap-1.5 border-slate-700 text-slate-300 hover:text-white shrink-0"
                onClick={() => fileRef.current?.click()}
                title="تحميل ملف .kicad_mod"
              >
                <FileUp className="size-3.5 text-blue-400" />
                <span className="hidden sm:inline">{lang === "ar" ? "ملف بصمة" : "Upload .kicad_mod"}</span>
              </Button>
            </div>

            {/* Category Pills */}
            <div className="flex gap-1.5 overflow-x-auto py-1 no-scrollbar touch-pan-x text-xs">
              {FOOTPRINT_CATEGORIES.map((cat) => {
                const label = lang === "ar" ? cat.nameAr : cat.name;
                const text = cat.id === "all" ? `${label} (${FOOTPRINT_LIBRARY_CATALOG.length})` : label;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 whitespace-nowrap ${
                      activeCategory === cat.id
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Libraries List with Expandable Tree for Dual-Mounting (SMD/THT) */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
            {filteredLibraries.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <FolderOpen className="size-8 text-slate-700 stroke-1" />
                <span>{lang === "ar" ? "لا توجد مكتبات مطابقة لخيارات البحث" : "No matching libraries found"}</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm">
                {filteredLibraries.map((lib) => {
                  const hasBothMounting = lib.mountingTypes.includes("SMD") && lib.mountingTypes.includes("THT");
                  const isExpanded = expandedTrees.has(lib.id);

                  // Count SMD vs THT items inside library
                  const totalCount = lib.itemIds.length;
                  const smdCount = lib.itemIds.filter((id) => {
                    const item = catalogById.get(id);
                    return item && (item.mounting === "SMD" || item.mounting === "Both");
                  }).length;
                  const thtCount = lib.itemIds.filter((id) => {
                    const item = catalogById.get(id);
                    return item && (item.mounting === "THT" || item.mounting === "Both");
                  }).length;

                  return (
                    <div key={lib.id} className="transition-colors group">
                      {/* Main Library Row */}
                      <div
                        onClick={() => openLibrary(lib, "all")}
                        className="flex items-center justify-between p-3 hover:bg-slate-800/60 cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-bold font-mono text-slate-200 group-hover:text-blue-400 transition-colors">
                                {lib.name}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Badges & Tree Expansion Action */}
                        <div className="flex items-center gap-2 shrink-0 ms-2">
                          {/* Tree Expand Button for Dual Types */}
                          {hasBothMounting ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-7 w-7 p-0 rounded-md transition-colors ${
                                isExpanded
                                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                                  : "text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                              }`}
                              onClick={(e) => toggleTreeExpand(lib.id, e)}
                              title={lang === "ar" ? "عرض شجرة الأنواع (SMD / THT)" : "Expand tree (SMD / THT)"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          ) : (
                            <ChevronRight className="size-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                          )}
                        </div>
                      </div>

                      {/* Expandable Tree Branch Sub-nodes (THT vs SMD) */}
                      {hasBothMounting && isExpanded && (
                        <div className="bg-slate-950/70 border-t border-slate-800/80 ps-8 sm:ps-12 pe-3 sm:pe-4 py-2 space-y-1">
                          {/* Tree Node 1: All Items */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              openLibrary(lib, "all");
                            }}
                            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-slate-800/70 cursor-pointer text-xs transition-colors group/node"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 font-mono">├─</span>
                              <FolderOpen className="size-3.5 text-blue-400" />
                              <span className="font-semibold text-slate-200 group-hover/node:text-blue-400">
                                {lang === "ar" ? "الكل" : "All"}
                              </span>
                            </div>
                          </div>

                          {/* Tree Node 2: SMD Items */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              openLibrary(lib, "SMD");
                            }}
                            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-slate-800/70 cursor-pointer text-xs transition-colors group/node"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 font-mono">├─</span>
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                SMD
                              </span>
                              <span className="font-semibold text-slate-200 group-hover/node:text-cyan-400">
                                SMD
                              </span>
                            </div>
                          </div>

                          {/* Tree Node 3: THT Items */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              openLibrary(lib, "THT");
                            }}
                            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-slate-800/70 cursor-pointer text-xs transition-colors group/node"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 font-mono">└─</span>
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                THT
                              </span>
                              <span className="font-semibold text-slate-200 group-hover/node:text-amber-400">
                                THT
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: FOOTPRINTS LIST IN LIBRARY                                         */}
      {/* ========================================================================= */}
      {view === "footprints" && selectedLibrary && (
        <div className="h-full flex flex-col min-h-0">
          {/* Subtree Switcher & In-Library Search */}
          <div className="p-2.5 sm:p-3 border-b border-slate-800 shrink-0 bg-slate-900/30 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === "ar" ? "بحث في بصمات هذه المكتبة..." : "Search in this library..."}
                className="h-8 ps-8 text-xs bg-slate-900 border-slate-700 text-white w-full"
              />
            </div>

            {/* Tree Mounting Tabs Switcher (if library has both types) */}
            {selectedLibrary.mountingTypes.includes("SMD") && selectedLibrary.mountingTypes.includes("THT") && (
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedSubtree("all")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    selectedSubtree === "all"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lang === "ar" ? "الكل" : "All"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSubtree("SMD")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    selectedSubtree === "SMD"
                      ? "bg-cyan-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  SMD ({selectedLibrary.itemIds.filter((id) => catalogById.get(id)?.mounting === "SMD" || catalogById.get(id)?.mounting === "Both").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSubtree("THT")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    selectedSubtree === "THT"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  THT ({selectedLibrary.itemIds.filter((id) => catalogById.get(id)?.mounting === "THT" || catalogById.get(id)?.mounting === "Both").length})
                </button>
              </div>
            )}
          </div>

          {/* Footprints List in Vertical Format matching KiCad Import list style */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
            {currentLibraryItems.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs font-mono">
                <Box className="size-8 text-slate-700 stroke-1" />
                <span>{lang === "ar" ? "لا توجد بصمات مطابقة في هذا التصنيف" : "No footprints found"}</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm">
                {currentLibraryItems.map((item) => {
                  const model = itemModels.get(item.id) || buildModelFromLibraryItem(item);

                  return (
                    <div
                      key={item.id}
                      onClick={() => openPreview(item)}
                      className="p-3 hover:bg-slate-800/60 transition-colors group cursor-pointer flex items-center justify-between gap-3"
                    >
                      {/* Left: Info */}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-mono font-bold text-slate-200 group-hover:text-blue-400 transition-colors break-all leading-snug">
                          {item.name}
                        </div>
                      </div>

                      {/* Right: View & Add/Assign Buttons matching KiCad Footprints style */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-8 px-0 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 shrink-0 flex items-center justify-center"
                          onClick={() => openPreview(item)}
                          title={lang === "ar" ? "معاينة البصمة" : "Preview Footprint"}
                        >
                          <Eye className="size-3.5 text-blue-400" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-8 px-0 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 shrink-0 flex items-center justify-center"
                          onClick={() => {
                            const m = itemModels.get(item.id) || buildModelFromLibraryItem(item);
                            onSelectFootprint(m);
                          }}
                          title={selectionOnly ? (lang === "ar" ? "تعيين البصمة" : "Assign Footprint") : (lang === "ar" ? "إضافة للوحة" : "Add to PCB")}
                        >
                          <Download className="size-3.5 text-blue-400" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: LIVE INTERACTIVE PREVIEW & ENGINEERING SPECS                      */}
      {/* ========================================================================= */}
      {view === "preview" && selectedItem && selectedModel && (
        <div className="h-full flex flex-col min-h-0">
          {/* 2-Column Responsive Layout: Left Live WebGL Stage, Right Full Specs */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-4 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-3 sm:gap-4">
            {/* Visual Stage + Layer Toggles on the Left */}
            <div className="flex flex-row gap-2.5 min-h-[190px] h-full" dir="ltr">
              {/* Layer Toggles Panel on the Left */}
              <div className="shrink-0 flex flex-col justify-start">
                <FootprintLayerToggles
                  visibility={layerVisibility}
                  onChange={setLayerVisibility}
                  orientation="vertical"
                />
              </div>

              {/* Canvas Container */}
              <div className="flex-1 min-h-[180px] h-[200px] sm:h-[240px] rounded-xl bg-slate-950 border border-slate-800 p-2 sm:p-3 flex items-center justify-center relative overflow-hidden shadow-inner">
                <FootprintPreview
                  footprint={selectedModel}
                  layerVisibility={layerVisibility}
                  className="w-full h-full"
                />
              </div>
            </div>

            {/* Right Column: Engineering Specs & Action Buttons */}
            <div className="flex flex-col justify-between border border-slate-800 rounded-xl bg-slate-900/60 p-3.5 sm:p-4 space-y-3.5 overflow-y-auto">
              <div className="space-y-3.5">
                {/* Section Title */}
                <div>
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {lang === "ar" ? "المواصفات الهندسية للبصمة" : "Footprint Specifications"}
                  </div>
                  <div className="font-mono text-xs sm:text-sm font-bold text-white mt-1">
                    {selectedItem.name}
                    {((selectedItem && isOfficialEmbeddedCatalogItem(selectedItem.id)) ||
                      (selectedItem && officialModels.has(selectedItem.id) && (officialModels.get(selectedItem.id) as any)?.fromOfficialKiCad) ||
                      (selectedModel as any)?.fromOfficialKiCad ||
                      (selectedModel as any)?.embeddedOffline) && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30 align-middle">
                        KiCad Official
                      </span>
                    )}
                    {selectedItem && officialLoadingId === selectedItem.id && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/30 align-middle">
                        Loading official…
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {lang === "ar" ? selectedItem.descriptionAr : selectedItem.description}
                  </div>
                </div>

                {/* Key Specs Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400">{lang === "ar" ? "عدد الأطراف" : "Pad count"}</div>
                    <div className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5 font-mono">
                      {selectedItem.pinsText}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400">{lang === "ar" ? "نوع التثبيت" : "Mounting style"}</div>
                    <div className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5 font-mono">
                      {selectedItem.mounting === "SMD" ? "Surface Mount (SMD)" : "Through-Hole (THT)"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400">{lang === "ar" ? "الخطوة (Pitch)" : "Pin pitch"}</div>
                    <div className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5 font-mono">
                      {selectedItem.pitchText}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400">{lang === "ar" ? "العائلة" : "Category"}</div>
                    <div className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5">
                      {selectedItem.categoryName}
                    </div>
                  </div>
                </div>

                {/* Parameter Details Breakdown */}
                <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 text-[11px] space-y-1.5 font-mono">
                  <div className="text-[10px] text-slate-400 font-sans font-semibold uppercase tracking-wider mb-1">
                    {lang === "ar" ? "المعاملات الدقيقة (Parameters):" : "Physical Parameters:"}
                  </div>
                  {Object.entries(selectedItem.params).map(([key, val]) => {
                    if (typeof val === "object" || key === "reference" || key === "value") return null;
                    return (
                      <div key={key} className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-400">{key}:</span>
                        <span className="text-blue-300 font-semibold">{String(val)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                {/* Secondary Button: Customize in Footprint Generator.
                    Hidden for footprints the generator cannot handle. */}
                {(generatorSupport !== "none" || officialLoadingId === selectedItem.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-9 text-xs font-semibold gap-2 border-blue-500/40 text-blue-300 hover:bg-blue-600/20 hover:text-white"
                    disabled={officialLoadingId === selectedItem.id}
                    onClick={() => { void handleCustomizeClick(selectedItem); }}
                  >
                    <Sparkles className="size-3.5 text-blue-400" />
                    <span>{lang === "ar" ? "تخصيص المعاملات في المولد" : "Customize in Generator"}</span>
                  </Button>
                )}

                {/* Primary Button: Insert to PCB / Assign */}
                <Button
                  size="lg"
                  className="w-full h-10 sm:h-11 text-xs sm:text-sm font-bold gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 active:scale-[0.99] transition-transform"
                  disabled={!!selectedItem && officialLoadingId === selectedItem.id}
                  onClick={async () => {
                    let model = selectedModel;
                    if (selectedItem && getOfficialFootprintRef(selectedItem.id) && !officialModels.has(selectedItem.id)) {
                      const official = await loadOfficialForItem(selectedItem);
                      if (official) model = official;
                    }
                    if (model) onSelectFootprint(model);
                  }}
                >
                  <Download className="size-4" />
                  <span>
                    {selectionOnly
                      ? lang === "ar"
                        ? "تعيين هذه البصمة للعنصر"
                        : "Assign This Footprint"
                      : lang === "ar"
                      ? "إضافة البصمة للوحة (PCB)"
                      : "Add Footprint to PCB"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
