import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Check,
  Search,
  Download,
  FileUp,
  Loader2,
  Library,
  LibraryBig,
  Cpu,
  Cable,
  Zap,
  Radio,
  Microchip,
  Sliders,
  ExternalLink,
  Sparkles,
  Layers,
  ArrowRight,
  ArrowLeft,
  Eye,
  CheckCheck,
  RefreshCw,
  X,
  Volume2,
  Tv,
  ToggleLeft,
  ShieldCheck,
  Gauge,
  Folder,
} from "lucide-react";
import { SYMBOL_LIST, CATEGORY_ORDER, type SymbolCategory, type SymbolDef } from "@/lib/symbols";
import { SymbolPreview } from "./SymbolPreview";
import { useI18n } from "@/i18n";
import type { SymbolId } from "@/lib/schematic";
import {
  importKiCadSymbolLibrary,
  fetchOfficialKiCadLib,
  fetchOfficialKiCadLibList,
  getImportedKiCadSymbols,
  OFFICIAL_KICAD_LIBS,
  registerKiCadSymbol,
  type KiCadParsedSymbol,
} from "@/lib/kicadSymbol";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  favorites: SymbolId[];
  onToggleFavorite: (id: SymbolId) => void;
  onPick: (id: SymbolId) => void;
  realistic?: boolean;
}

type KiCadCategory =
  | "all"
  | "mcu"
  | "connector"
  | "power"
  | "sensor"
  | "semiconductor"
  | "logic"
  | "rf"
  | "device";

interface ActiveLibrary {
  name: string;
  parsedSymbols: KiCadParsedSymbol[];
  symbolDefs: SymbolDef[];
}

interface ComponentCategoryDef {
  id: string;
  name: string;
  icon: any;
  match: (s: SymbolDef) => boolean;
}

const BUILTIN_CATEGORIES: ComponentCategoryDef[] = [
  {
    id: "transistors",
    name: "Transistors",
    icon: Radio,
    match: (s) =>
      ["npn", "pnp", "nmosfet", "pmosfet"].includes(s.id) ||
      s.id.includes("transistor") ||
      s.id.includes("mosfet"),
  },
  {
    id: "diodes",
    name: "Diodes & LEDs",
    icon: Zap,
    match: (s) =>
      ["diode", "zener", "led", "photodiode"].includes(s.id) ||
      (s.category === "semi" && !["npn", "pnp", "nmosfet", "pmosfet"].includes(s.id)),
  },
  {
    id: "displays",
    name: "Displays",
    icon: Tv,
    match: (s) =>
      s.category === "display" ||
      ["seven_segment", "dot_matrix", "lcd_1602", "lcd_2004", "oled_ssd1306", "tft_spi", "generic_display"].includes(s.id),
  },
  {
    id: "audio_amplifiers",
    name: "Audio & Amplifiers",
    icon: Volume2,
    match: (s) =>
      s.category === "amplifier" ||
      ["generic_opamp", "single_opamp", "dual_opamp", "quad_opamp", "comparator", "instrumentation_amp", "audio_amplifier", "power_amplifier", "audio_jack"].includes(s.id),
  },
  {
    id: "power",
    name: "Power & Regulators",
    icon: Zap,
    match: (s) =>
      s.category === "power" ||
      ["gnd", "vcc", "vdd", "power_flag", "battery", "dc_source", "ac_source", "lm2596", "lm1117", "xl4015_buck", "mt3608_boost", "tp4056_charger", "generic_dcdc"].includes(s.id),
  },
  {
    id: "passives",
    name: "Passive Components",
    icon: Sliders,
    match: (s) =>
      s.category === "passive" ||
      ["resistor", "var_resistor", "capacitor", "capacitor_polar", "inductor", "transformer"].includes(s.id),
  },
  {
    id: "connectors",
    name: "Connectors & Ports",
    icon: Cable,
    match: (s) =>
      s.category === "connector" ||
      s.id.startsWith("CONN_") ||
      ["header", "screw_terminal", "usb_c", "micro_usb", "jst", "dc_jack", "usb_a", "barrel_jack", "rj45", "hdmi", "gpio_header", "fpc_connector"].includes(s.id),
  },
  {
    id: "logic",
    name: "Logic Gates",
    icon: Microchip,
    match: (s) =>
      s.category === "logic" ||
      ["and_gate", "or_gate", "not_gate", "nand_gate", "nor_gate", "xor_gate", "xnor_gate", "buffer_gate", "schmitt_trigger", "tristate_buffer"].includes(s.id),
  },
  {
    id: "mcu_boards",
    name: "Microcontrollers & Boards",
    icon: Cpu,
    match: (s) =>
      ["mcu", "board", "ic"].includes(s.category) ||
      ["esp32_devkit", "esp32_wroom", "esp8266_nodemcu", "arduino_uno", "arduino_nano", "stm32_bluepill", "rpi_pico", "esp32"].includes(s.id) ||
      s.id.startsWith("ic") ||
      s.id.startsWith("mcu"),
  },
  {
    id: "control_switches",
    name: "Switches & Controls",
    icon: ToggleLeft,
    match: (s) =>
      ["control", "protection"].includes(s.category) ||
      ["push_button", "switch", "dip_switch", "rotary_switch", "fuse"].includes(s.id),
  },
  {
    id: "kicad_imported",
    name: "KiCad Symbols",
    icon: Layers,
    match: (s) => s.id.startsWith("kicad:"),
  },
];

function getSymbolDescription(s: SymbolDef, lang: string): string {
  const isAr = lang === "ar";
  const id = s.id;
  
  if (id === "npn") return isAr ? "ترانزستور ثنائي القطبية NPN (مثال BC547)" : "NPN Bipolar Junction Transistor";
  if (id === "pnp") return isAr ? "ترانزستور ثنائي القطبية PNP (مثال BC557)" : "PNP Bipolar Junction Transistor";
  if (id === "nmosfet") return isAr ? "ترانزستور قدرة N-Channel MOSFET" : "N-Channel Power MOSFET";
  if (id === "pmosfet") return isAr ? "ترانزستور قدرة P-Channel MOSFET" : "P-Channel Power MOSFET";
  if (id === "diode") return isAr ? "دايود تقويم عام (1N4148 / 1N4007)" : "General Purpose Switching Diode";
  if (id === "zener") return isAr ? "دايود زينر لتثبيت جهد التغذية" : "Zener Voltage Regulator Diode";
  if (id === "led") return isAr ? "دايود ضوئي بواعث LED" : "Light Emitting Diode";
  if (id === "photodiode") return isAr ? "دايود حساس للضوء Photodiode" : "Light Sensitive Photodiode";
  if (id === "resistor") return isAr ? "مقاومة كربونية / سطحية ثابتة" : "Fixed Resistor Component";
  if (id === "var_resistor") return isAr ? "مقاومة متغيرة / بوتنشيوميتر" : "Potentiometer / Variable Resistor";
  if (id === "capacitor") return isAr ? "مكثف سيراميكي غير قطبي" : "Unpolarized Ceramic Capacitor";
  if (id === "capacitor_polar") return isAr ? "مكثف كيميائي قطبي Electrolytic" : "Polarized Electrolytic Capacitor";
  if (id === "inductor") return isAr ? "ملف حثي Inductor" : "Power Inductor Coil";
  if (id === "transformer") return isAr ? "محول كهربائي ملفات رئيسية وثانوية" : "Power Transformer";
  if (id === "gnd") return isAr ? "خط التأريض الأرضي Reference Ground" : "Ground Power Rail";
  if (id === "vcc") return isAr ? "خط الجهد الموجب VCC (+5V)" : "Positive Voltage Rail VCC";
  if (id === "vdd") return isAr ? "خط التغذية VDD (+3.3V)" : "Logic Supply Rail VDD";
  if (id === "battery") return isAr ? "بطارية تغذية DC" : "DC Battery Power Source";
  if (id === "seven_segment") return isAr ? "شاشة أرقام سباعية 7-Segment" : "7-Segment LED Display";
  if (id === "dot_matrix") return isAr ? "شاشة مصفوفة نقطية 8x8 LED Matrix" : "8x8 LED Dot Matrix Display";
  if (id === "lcd_1602") return isAr ? "شاشة نصية LCD 16x2 مع إضاءة" : "16x2 Character LCD Display Module";
  if (id === "lcd_2004") return isAr ? "شاشة نصية LCD 20x4" : "20x4 Character LCD Display Module";
  if (id === "oled_ssd1306") return isAr ? "شاشة OLED بدقة 128x64 (I2C)" : "0.96 inch OLED Display Module";
  if (id === "tft_spi") return isAr ? "شاشة ملونة TFT مع واجهة SPI" : "Color TFT Display with SPI";
  if (id === "generic_opamp") return isAr ? "مضخم عمليات عام Op-Amp" : "Operational Amplifier Symbol";
  if (id === "single_opamp") return isAr ? "مضخم عمليات مفرد (LM741)" : "Single Operational Amplifier";
  if (id === "dual_opamp") return isAr ? "مضخم عمليات مزدوج (LM358)" : "Dual Operational Amplifier";
  if (id === "quad_opamp") return isAr ? "مضخم عمليات رباعي (LM324)" : "Quad Operational Amplifier";
  if (id === "comparator") return isAr ? "مقارن جهود (LM393)" : "Voltage Comparator IC";
  if (id === "audio_amplifier") return isAr ? "مضخم صوتي منخفض الجهد (LM386)" : "Low Voltage Audio Power Amplifier";
  if (id === "power_amplifier") return isAr ? "مضخم قدرة صوتي (TDA2030)" : "Audio Power Amplifier IC";
  if (id === "arduino_uno") return isAr ? "لوحة أردوينو أونو ATmega328P" : "Arduino Uno R3 Development Board";
  if (id === "arduino_nano") return isAr ? "لوحة أردوينو نانو الصغيرة" : "Arduino Nano V3 Development Board";
  if (id === "esp32_devkit") return isAr ? "لوحة ESP32 DevKit مع WiFi/BLE" : "ESP32 Wi-Fi & BLE Development Board";
  if (id === "esp8266_nodemcu") return isAr ? "لوحة NodeMCU ESP8266 WiFi" : "NodeMCU ESP8266 Wi-Fi Module";
  if (id === "rpi_pico") return isAr ? "لوحة راسبيري باي بيكو RP2040" : "Raspberry Pi Pico RP2040 Board";
  if (id === "stm32_bluepill") return isAr ? "لوحة STM32 Blue Pill" : "STM32F103 Blue Pill MCU Board";
  if (id === "push_button") return isAr ? "زر ضغط لحظي Push Button" : "Momentary Push Button Switch";
  if (id === "switch") return isAr ? "مفتاح تشغيل/إيقاف SPST Switch" : "Toggle ON/OFF Switch";
  if (id === "fuse") return isAr ? "فيوز حماية من زيادة التيار" : "Circuit Protection Fuse";
  if (id === "screw_terminal") return isAr ? "كتلة توصيل لولبية Terminal Block" : "Screw Terminal Connector";
  if (id === "usb_c") return isAr ? "منفذ USB Type-C للتغذية والبيانات" : "USB Type-C Receptacle Connector";
  if (id === "micro_usb") return isAr ? "منفذ Micro-USB" : "Micro-USB Connector";

  if (s.defaultValue) return `${isAr ? "عنصر" : "Symbol"} ${s.defaultValue}`;
  return isAr ? `رمز مخطط ${s.id}` : `Schematic symbol ${s.id}`;
}

function RawSymbolPreview({ def, size = 56, color = "currentColor" }: { def: SymbolDef; size?: number; color?: string }) {
  if (!def || typeof def.draw !== "function") return null;
  const pad = 0.5;
  const w = Math.max(1, def.width + pad * 2);
  const h = Math.max(1, def.height + pad * 2);
  return (
    <svg viewBox={`${-pad} ${-pad} ${w} ${h}`} width={size} height={size} preserveAspectRatio="xMidYMid meet" className="mx-auto">
      {def.draw(color)}
    </svg>
  );
}

export function ComponentLibrary({ open, onOpenChange, favorites, onToggleFavorite, onPick, realistic = false }: Props) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [selectedBuiltinCat, setSelectedBuiltinCat] = useState<string | null>(null);
  const [imported, setImported] = useState<SymbolDef[]>(() => getImportedKiCadSymbols());
  const [activeTab, setActiveTab] = useState<"library" | "kicad_import">("library");
  const [importBusy, setImportBusy] = useState(false);
  const [activeFetchLib, setActiveFetchLib] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // KiCad library picker state
  const [officialLibs, setOfficialLibs] = useState<string[]>(OFFICIAL_KICAD_LIBS);
  const [libSearchQuery, setLibSearchQuery] = useState("");
  const [libCategory, setLibCategory] = useState<KiCadCategory>("all");
  const [refreshingLibs, setRefreshingLibs] = useState(false);

  const handleRefreshOfficialLibs = async () => {
    setRefreshingLibs(true);
    try {
      const libs = await fetchOfficialKiCadLibList();
      if (libs && libs.length > 0) {
        setOfficialLibs(libs);
      }
    } catch (e) {
      console.error("Failed to refresh official libs", e);
    } finally {
      setRefreshingLibs(false);
    }
  };
  
  // Selected library detailed browser state
  const [selectedLib, setSelectedLib] = useState<ActiveLibrary | null>(null);
  const [libLoading, setLibLoading] = useState<string | null>(null);
  const [libCache, setLibCache] = useState<Map<string, ActiveLibrary>>(() => new Map());
  const [symbolSearchQuery, setSymbolSearchQuery] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const libraryFileRef = useRef<HTMLInputElement>(null);

  // Sync imported list and reset views when dialog opens
  useEffect(() => {
    if (open) {
      setImported(getImportedKiCadSymbols());
      setActiveTab("library");
      setSelectedBuiltinCat(null);
      setQ("");
    }
  }, [open]);

  // Load dynamic official libraries list from GitLab API on import tab active
  useEffect(() => {
    if (activeTab === "kicad_import") {
      fetchOfficialKiCadLibList().then((libs) => {
        if (libs && libs.length > 0) {
          setOfficialLibs(libs);
        }
      });
    }
  }, [activeTab]);

  const allSymbols = useMemo(() => {
    const map = new Map<string, SymbolDef>();
    for (const s of SYMBOL_LIST) map.set(s.id, s);
    for (const s of imported) map.set(s.id, s);
    return Array.from(map.values());
  }, [imported]);

  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return allSymbols.filter((s) => {
      if (selectedBuiltinCat) {
        const catDef = BUILTIN_CATEGORIES.find((c) => c.id === selectedBuiltinCat);
        if (catDef && !catDef.match(s)) return false;
      }
      if (!ql) return true;
      const name = (t(`symbols.${s.id}`) || s.defaultValue || s.id).toLowerCase();
      const desc = getSymbolDescription(s, lang).toLowerCase();
      return (
        name.includes(ql) ||
        s.id.toLowerCase().includes(ql) ||
        (s.defaultValue ?? "").toLowerCase().includes(ql) ||
        desc.includes(ql)
      );
    });
  }, [q, selectedBuiltinCat, t, lang, allSymbols]);

  const grouped = useMemo(() => {
    const g: Record<string, SymbolDef[]> = {};
    for (const s of filtered) {
      const cat = s.id.startsWith("kicad:") ? "kicad" : s.category;
      (g[cat] ??= []).push(s);
    }
    return g;
  }, [filtered]);

  const refreshImported = useCallback(() => {
    setImported(getImportedKiCadSymbols());
  }, []);

  // Fetch & open a library for individual element browsing
  const handleOpenLib = async (libName: string) => {
    if (libCache.has(libName)) {
      setSelectedLib(libCache.get(libName)!);
      setSymbolSearchQuery("");
      setImportMsg(null);
      return;
    }
    setLibLoading(libName);
    setImportMsg(null);
    setImportSuccess(false);
    
    // Give UI a chance to render the loading state before blocking the main thread
    await new Promise(r => setTimeout(r, 50));

    try {
      const text = await fetchOfficialKiCadLib(libName);
      
      // Allow the spinner to keep spinning smoothly before the heavy synchronous parsing
      await new Promise(r => setTimeout(r, 50));
      
      const importedResult = importKiCadSymbolLibrary(text, libName);
      const parsed = importedResult.parsed;
      if (!parsed.length) {
        setImportMsg(importedResult.errors[0] || `لم يُعثر على رموز صالحة في مكتبة ${libName}`);
        return;
      }
      const symbolDefs = importedResult.symbols;
      const activeData: ActiveLibrary = {
        name: libName,
        parsedSymbols: parsed,
        symbolDefs,
      };
      setLibCache((prev) => new Map(prev).set(libName, activeData));
      setSelectedLib(activeData);
      setSymbolSearchQuery("");
    } catch (e: any) {
      setImportMsg(`خطأ أثناء تحميل مكتبة ${libName}: ${e?.message || e}`);
    } finally {
      setLibLoading(null);
    }
  };

  // Import local file and open it for individual browsing
  const handleFileImport = async (file: File) => {
    setLibLoading(file.name);
    setImportMsg(null);
    setImportSuccess(false);

    // Give UI a chance to render the loading state before blocking the main thread
    await new Promise(r => setTimeout(r, 50));

    try {
      const text = await file.text();

      // Allow the spinner to keep spinning smoothly before the heavy synchronous parsing
      await new Promise(r => setTimeout(r, 50));

      const nick = file.name.replace(/\.kicad_sym$/i, "") || "الملف المحلي";
      const importedResult = importKiCadSymbolLibrary(text, nick);
      const parsed = importedResult.parsed;
      if (!parsed.length) {
        setImportMsg(importedResult.errors[0] || `لم يتم العثور على رموز صالحة في ${file.name}`);
        return;
      }
      const symbolDefs = importedResult.symbols;
      const activeData: ActiveLibrary = {
        name: nick,
        parsedSymbols: parsed,
        symbolDefs,
      };
      setSelectedLib(activeData);
      setSymbolSearchQuery("");
    } catch (e: any) {
      setImportMsg(`خطأ في قراءة ملف ${file.name}: ${e?.message || e}`);
    } finally {
      setLibLoading(null);
    }
  };

  // Bulk fetch library directly
  const handleFetchLib = async (libName: string) => {
    setImportBusy(true);
    setActiveFetchLib(libName);
    setImportMsg(null);
    setImportSuccess(false);

    // Give UI a chance to render the loading state before blocking the main thread
    await new Promise(r => setTimeout(r, 50));

    try {
      const text = await fetchOfficialKiCadLib(libName);

      // Allow the spinner to keep spinning smoothly before the heavy synchronous parsing
      await new Promise(r => setTimeout(r, 50));

      const { symbols, errors } = importKiCadSymbolLibrary(text, libName, true);
      refreshImported();
      if (symbols.length) {
        setImportSuccess(true);
        setImportMsg(`تم استيراد جميع عناصر مكتبة ${libName} (${symbols.length} رمزاً) بنجاح`);
        setSelectedBuiltinCat("kicad_imported");
      } else {
        setImportMsg(errors[0] || "لم يُعثر على رموز في المكتبة");
      }
    } catch (e: any) {
      setImportMsg(String(e?.message || e));
    } finally {
      setImportBusy(false);
      setActiveFetchLib(null);
    }
  };

  // Single symbol import handler
  const handleImportSingleSymbol = (def: SymbolDef, parsed?: KiCadParsedSymbol) => {
    registerKiCadSymbol(def, parsed);
    refreshImported();
    setSelectedBuiltinCat("kicad_imported");
    setImportSuccess(true);
    setImportMsg(`تم جلب واستيراد الرمز "${def.defaultValue || def.id.replace(/^kicad:[^:]+:?/, "")}" بنجاح`);
  };

  // Single symbol import & pick handler
  const handleImportAndPick = (def: SymbolDef, parsed?: KiCadParsedSymbol) => {
    registerKiCadSymbol(def, parsed);
    refreshImported();
    setSelectedBuiltinCat("kicad_imported");
    onOpenChange(false);
    onPick(def.id);
  };

  // Import all symbols in the currently selected library
  const handleImportAllInLib = () => {
    if (!selectedLib) return;
    for (let i = 0; i < selectedLib.symbolDefs.length; i++) {
      registerKiCadSymbol(selectedLib.symbolDefs[i], selectedLib.parsedSymbols[i]);
    }
    refreshImported();
    setSelectedBuiltinCat("kicad_imported");
    setImportSuccess(true);
    setImportMsg(`تم استيراد جميع عناصر مكتبة ${selectedLib.name} (${selectedLib.symbolDefs.length} رمزاً) بنجاح!`);
  };

  // Filter symbols inside the active selected library
  const filteredLibSymbols = useMemo(() => {
    if (!selectedLib) return [];
    const sq = symbolSearchQuery.trim().toLowerCase();
    if (!sq) return selectedLib.symbolDefs.map((def, idx) => ({ def, parsed: selectedLib.parsedSymbols[idx] }));
    return selectedLib.symbolDefs
      .map((def, idx) => ({ def, parsed: selectedLib.parsedSymbols[idx] }))
      .filter(({ def, parsed }) => {
        const val = (def.defaultValue || "").toLowerCase();
        const id = def.id.toLowerCase();
        const desc = (parsed?.description || "").toLowerCase();
        const kw = (parsed?.keywords || "").toLowerCase();
        return val.includes(sq) || id.includes(sq) || desc.includes(sq) || kw.includes(sq);
      });
  }, [selectedLib, symbolSearchQuery]);

  // Classify KiCad library into category
  const classifyKiCadLib = (name: string): KiCadCategory => {
    if (/^(MCU_|CPU_|CPLD_|FPGA_|DSP_|GPU)/i.test(name)) return "mcu";
    if (/^Connector/i.test(name)) return "connector";
    if (/^(Power_|Regulator_|Converter_|Battery_|power$)/i.test(name)) return "power";
    if (/^(Sensor_|Interface_|Isolator)/i.test(name)) return "sensor";
    if (/^(Transistor_|Diode_|Driver_|Triac_|LED$|Jumper|Valve)/i.test(name)) return "semiconductor";
    if (/^(Logic_|4xxx|74xx|Analog_|Amplifier_|Comparator_|Memory_|Buffer|Filter)/i.test(name)) return "logic";
    if (/^RF_/i.test(name)) return "rf";
    return "device";
  };

  // Filtered official KiCad libraries for the import list view
  const filteredOfficialLibs = useMemo(() => {
    const sq = libSearchQuery.trim().toLowerCase();
    return officialLibs.filter((lib) => {
      if (libCategory !== "all" && classifyKiCadLib(lib) !== libCategory) {
        return false;
      }
      if (!sq) return true;
      return lib.toLowerCase().includes(sq);
    });
  }, [officialLibs, libSearchQuery, libCategory]);

  const categoryOrder: (SymbolCategory | "kicad")[] = [...CATEGORY_ORDER, "kicad"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-component-library hideCloseButton={true} className="w-full sm:w-[95vw] sm:max-w-3xl h-[100dvh] sm:h-[85vh] sm:max-h-[800px] p-0 flex flex-col gap-0 rounded-none sm:rounded-xl overflow-hidden border-0 sm:border">
        {/* Visually Hidden Title for Accessibility compliance */}
        <DialogHeader className="sr-only">
          <DialogTitle>مكتبة العناصر واستيراد KiCad</DialogTitle>
        </DialogHeader>

        {/* Smart Dialog Header / Tab Selector */}
        {(!selectedLib && !selectedBuiltinCat) ? (
          <div className="px-3 sm:px-6 py-2 sm:py-3 border-b flex flex-row items-center justify-between gap-2 sm:gap-4 shrink-0 bg-muted/30">
            <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto py-0.5 no-scrollbar shrink min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab("library")}
                className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 sm:gap-2 border shrink-0 whitespace-nowrap ${
                  activeTab === "library"
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/40 shadow-sm shadow-blue-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/80"
                }`}
              >
                <Library className="size-3.5 sm:size-4 text-blue-400 shrink-0" />
                <span>{lang === "ar" ? "مكتبة العناصر" : "Component Library"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMsg(null);
                  setSelectedLib(null);
                  setActiveTab("kicad_import");
                }}
                className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 sm:gap-2 border shrink-0 whitespace-nowrap ${
                  activeTab === "kicad_import"
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/40 shadow-sm shadow-blue-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/80"
                }`}
              >
                <Download className="size-3.5 sm:size-4 text-blue-400 shrink-0" />
                <span>KiCad Symbols</span>
              </button>
            </div>

            <DialogClose className="h-8 w-8 shrink-0 text-blue-500 dark:text-blue-400 hover:bg-muted border-2 border-blue-500/80 rounded-lg transition-all flex items-center justify-center shadow-sm focus:outline-none">
              <X className="h-4 w-4 stroke-[2.5]" />
              <span className="sr-only">{lang === "ar" ? "إغلاق" : "Close"}</span>
            </DialogClose>
          </div>
        ) : (
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b flex flex-row items-center justify-between gap-3 shrink-0 bg-muted/25">
            <div className="flex items-center gap-2.5 min-w-0">
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  setSelectedLib(null);
                  setSelectedBuiltinCat(null);
                  setQ("");
                }}
                className="h-7 w-7 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 shrink-0 flex items-center justify-center p-0"
              >
                <ArrowLeft className="size-3.5" />
              </Button>
              <div className="h-4 w-[1px] bg-border/60 shrink-0" />
              <div className="text-xs sm:text-sm font-bold font-mono text-foreground truncate flex items-center gap-2 min-w-0">
                <span className="truncate">
                  {selectedLib?.name || BUILTIN_CATEGORIES.find((c) => c.id === selectedBuiltinCat)?.name}
                </span>
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full shrink-0">
                  {selectedLib
                    ? `${filteredLibSymbols.length} ${lang === "ar" ? "عنصر" : "symbols"}`
                    : (() => {
                        const categoryDef = BUILTIN_CATEGORIES.find((c) => c.id === selectedBuiltinCat);
                        const count = allSymbols.filter(categoryDef?.match || (() => false)).length;
                        return `${count} ${lang === "ar" ? "عنصر" : "symbols"}`;
                      })()}
                </span>
              </div>
            </div>

            <DialogClose className="h-8 w-8 shrink-0 text-blue-500 dark:text-blue-400 hover:bg-muted border-2 border-blue-500/80 rounded-lg transition-all flex items-center justify-center shadow-sm focus:outline-none">
              <X className="h-4 w-4 stroke-[2.5]" />
              <span className="sr-only">{lang === "ar" ? "إغلاق" : "Close"}</span>
            </DialogClose>
          </div>
        )}

        {activeTab === "library" ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden" dir="ltr">
            {!selectedBuiltinCat ? (
              /* VIEW 1: Categories / Libraries List */
              <div className="p-3 sm:p-4 space-y-3 flex-1 min-h-0 flex flex-col overflow-y-auto">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search across all libraries..."
                      className="h-8 sm:h-9 text-xs sm:text-sm ps-8 sm:ps-9"
                      autoFocus
                    />
                  </div>

                  <input
                    ref={libraryFileRef}
                    type="file"
                    accept=".kicad_sym,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileImport(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 sm:h-9 text-xs gap-1.5 shrink-0"
                    disabled={importBusy || Boolean(libLoading)}
                    onClick={() => libraryFileRef.current?.click()}
                    title={lang === "ar" ? "تحميل ملف محلي .kicad_sym" : "Upload local .kicad_sym"}
                  >
                    {libLoading && !activeFetchLib ? (
                      <Loader2 className="size-3.5 sm:size-4 animate-spin text-blue-400" />
                    ) : (
                      <FileUp className="size-3.5 sm:size-4 text-blue-400" />
                    )}
                    <span className="hidden sm:inline">{lang === "ar" ? "ملف محلي" : "Local File"}</span>
                  </Button>
                </div>

                {!q.trim() ? (
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-2 gap-2.5 flex-1 overflow-y-auto pb-2">
                    {BUILTIN_CATEGORIES.map((cat) => {
                      const symbolsInCat = allSymbols.filter(cat.match);
                      const count = symbolsInCat.length;
                      if (cat.id === "kicad_imported" && count === 0) return null;

                      return (
                        <div
                          key={cat.id}
                          onClick={() => {
                            setSelectedBuiltinCat(cat.id);
                            setQ("");
                          }}
                          className="flex items-center justify-between p-3.5 rounded-xl border border-border/80 bg-card hover:border-blue-500/50 hover:bg-accent/40 transition-all cursor-pointer group shadow-sm"
                        >
                          <span className="text-xs sm:text-sm font-bold font-sans text-foreground truncate group-hover:text-blue-500 transition-colors">
                            {cat.name}
                          </span>
                          <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Search Results in Rich Card Format */
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-2.5">
                      {filtered.map((s) => {
                        const isFav = favSet.has(s.id);
                        const displayName = s.id.startsWith("kicad:")
                          ? s.defaultValue || s.id.replace(/^kicad:[^:]+:?/, "")
                          : t(`symbols.${s.id}`);
                        const pinCount = s.pins.length;
                        const desc = getSymbolDescription(s, lang);

                        return (
                          <div
                            key={s.id}
                            className={`flex flex-col justify-between p-2.5 rounded-xl border transition-all ${
                              isFav ? "bg-blue-500/5 border-blue-500/40" : "bg-card border-border hover:border-blue-500/40"
                            }`}
                          >
                            <div className="w-full bg-muted/30 dark:bg-muted/10 rounded-lg p-2 flex items-center justify-center min-h-[80px] border border-border/40 relative">
                              <SymbolPreview id={s.id} size={56} realistic={realistic} />
                              {pinCount > 0 && (
                                <span className="absolute bottom-1 end-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-background/80 border text-muted-foreground">
                                  {pinCount} pins
                                </span>
                              )}
                              {s.prefix && (
                                <span className="absolute top-1 start-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                  {s.prefix}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 space-y-1">
                              <div className="text-xs font-bold font-mono text-foreground truncate" title={displayName}>
                                {displayName}
                              </div>
                              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug" title={desc}>
                                {desc}
                              </p>
                            </div>

                            <div className="mt-2.5 pt-2 border-t flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-1 h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => {
                                  onPick(s.id);
                                  onOpenChange(false);
                                }}
                              >
                                <Plus className="size-3" />
                                {lang === "ar" ? "إضافة للمخطط" : "Add to Schematic"}
                              </Button>

                              <Button
                                size="icon"
                                variant={isFav ? "default" : "outline"}
                                className={`size-7 shrink-0 transition-transform active:scale-90 ${
                                  isFav ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : ""
                                }`}
                                onClick={() => onToggleFavorite(s.id)}
                                title={isFav ? t("removeFromSidebar") : t("addToSidebar")}
                              >
                                {isFav ? <Check className="size-3" /> : <Plus className="size-3" />}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* VIEW 2: Inside Selected Library Category */
              <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3.5 flex-1 min-h-0 flex flex-col overflow-hidden" dir="ltr">
                {(() => {
                  const categoryDef = BUILTIN_CATEGORIES.find((c) => c.id === selectedBuiltinCat);
                  const matchedSymbols = allSymbols.filter((s) => {
                    if (!categoryDef) return true;
                    if (!categoryDef.match(s)) return false;
                    if (!q.trim()) return true;
                    const ql = q.trim().toLowerCase();
                    const name = (t(`symbols.${s.id}`) || s.defaultValue || s.id).toLowerCase();
                    const desc = getSymbolDescription(s, lang).toLowerCase();
                    return name.includes(ql) || s.id.toLowerCase().includes(ql) || desc.includes(ql);
                  });

                  return (
                    <>
                      {/* Internal Search bar */}
                      <div className="relative shrink-0">
                        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground" />
                        <Input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder={
                            lang === "ar"
                              ? `بحث داخل ${categoryDef?.name || "المكتبة"}...`
                              : `Search inside ${categoryDef?.name || "Library"}...`
                          }
                          className="h-8 sm:h-9 ps-8 sm:ps-9 text-xs sm:text-sm"
                        />
                      </div>

                      {/* Grid of Symbol Cards in Rich Format */}
                      <div className="flex-1 rounded-xl border bg-card p-2 overflow-y-auto min-h-[160px]">
                        {matchedSymbols.length === 0 ? (
                          <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                            <div>
                              {q.trim()
                                ? `لا يوجد عنصر مطابق لـ "${q}" في هذه المكتبة`
                                : "لا توجد عناصر متاحة في هذه المكتبة"}
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-2.5">
                            {matchedSymbols.map((s) => {
                              const isFav = favSet.has(s.id);
                              const displayName = s.id.startsWith("kicad:")
                                ? s.defaultValue || s.id.replace(/^kicad:[^:]+:?/, "")
                                : t(`symbols.${s.id}`);
                              const pinCount = s.pins.length;
                              const desc = getSymbolDescription(s, lang);

                              return (
                                <div
                                  key={s.id}
                                  className={`flex flex-col justify-between p-2.5 rounded-xl border transition-all ${
                                    isFav
                                      ? "bg-blue-500/5 border-green-500/40"
                                      : "bg-card border-border hover:border-blue-500/40"
                                  }`}
                                >
                                  {/* Symbol Preview Box */}
                                  <div className="w-full bg-muted/30 dark:bg-muted/10 rounded-lg p-2 flex items-center justify-center min-h-[85px] border border-border/40 relative">
                                    <SymbolPreview id={s.id} size={60} realistic={realistic} />
                                    {pinCount > 0 && (
                                      <span className="absolute bottom-1 end-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-background/80 border text-muted-foreground">
                                        {pinCount} pins
                                      </span>
                                    )}
                                    {s.prefix && (
                                      <span className="absolute top-1 start-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                        {s.prefix}
                                      </span>
                                    )}
                                  </div>

                                  {/* Symbol Details */}
                                  <div className="mt-2 space-y-1">
                                    <div className="text-xs font-bold font-mono text-foreground truncate" title={displayName}>
                                      {displayName}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug" title={desc}>
                                      {desc}
                                    </p>
                                  </div>

                                  {/* Actions */}
                                  <div className="mt-2.5 pt-2 border-t flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="flex-1 h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() => {
                                        onPick(s.id);
                                        onOpenChange(false);
                                      }}
                                    >
                                      <Plus className="size-3" />
                                      {lang === "ar" ? "إضافة للمخطط" : "Add to Schematic"}
                                    </Button>

                                    <Button
                                      size="icon"
                                      variant={isFav ? "default" : "outline"}
                                      className={`size-7 shrink-0 transition-transform active:scale-90 ${
                                        isFav ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : ""
                                      }`}
                                      onClick={() => onToggleFavorite(s.id)}
                                      title={isFav ? t("removeFromSidebar") : t("addToSidebar")}
                                    >
                                      {isFav ? <Check className="size-3" /> : <Plus className="size-3" />}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          /* KICAD IMPORT TAB CONTENT */
          <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3.5 flex-1 min-h-0 flex flex-col overflow-y-auto" dir="ltr">
            {/* Status notification banner */}
            {importMsg && (
              <div
                className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 font-medium border shrink-0 ${
                  importSuccess
                    ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}
              >
                {importSuccess ? <Check className="size-4 shrink-0 text-green-500" /> : <Sparkles className="size-4 shrink-0" />}
                <span className="flex-1 min-w-0 truncate">{importMsg}</span>
                {importSuccess && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] px-2 shrink-0 text-green-600 dark:text-green-400"
                    onClick={() => {
                      setActiveTab("library");
                    }}
                  >
                    عرض الرموز المستوردة ({imported.length})
                  </Button>
                )}
              </div>
            )}

            {!selectedLib ? (
              /* VIEW 1: Library Selector & List */
              <div className="flex-1 min-h-[180px] flex flex-col space-y-2 overflow-hidden">
                <div className="shrink-0">
                  {/* Search in official libs */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground" />
                      <Input
                        value={libSearchQuery}
                        onChange={(e) => setLibSearchQuery(e.target.value)}
                        placeholder={lang === "ar" ? "بحث عن مكتبة (مثلاً STM32, USB, Sensor)..." : "Search libraries (e.g. STM32, USB, Sensor)..."}
                        className="h-8 sm:h-9 ps-8 sm:ps-9 text-xs sm:text-sm"
                      />
                    </div>

                    <input
                      ref={fileRef}
                      type="file"
                      accept=".kicad_sym,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileImport(f);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 sm:h-9 text-xs gap-1.5 shrink-0"
                      disabled={importBusy || Boolean(libLoading)}
                      onClick={() => fileRef.current?.click()}
                      title={lang === "ar" ? "تحميل ملف محلي .kicad_sym" : "Upload local .kicad_sym"}
                    >
                      {libLoading && !activeFetchLib ? (
                        <Loader2 className="size-3.5 sm:size-4 animate-spin text-blue-400" />
                      ) : (
                        <FileUp className="size-3.5 sm:size-4 text-blue-400" />
                      )}
                      <span className="hidden sm:inline">{lang === "ar" ? "ملف محلي" : "Local File"}</span>
                    </Button>
                  </div>
                </div>

                {/* KiCad Categories selector */}
                <div className="flex gap-1.5 overflow-x-auto py-1 no-scrollbar touch-pan-x text-xs shrink-0">
                  <button
                    onClick={() => setLibCategory("all")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "all"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lang === "ar" ? "الكل" : "All"} ({officialLibs.length})
                  </button>

                  <button
                    onClick={() => setLibCategory("mcu")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "mcu"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Cpu className="size-3" />
                    {lang === "ar" ? "المتحكمات (MCU)" : "MCUs"}
                  </button>

                  <button
                    onClick={() => setLibCategory("connector")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "connector"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Cable className="size-3" />
                    {lang === "ar" ? "الموصلات" : "Connectors"}
                  </button>

                  <button
                    onClick={() => setLibCategory("power")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "power"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Zap className="size-3" />
                    {lang === "ar" ? "الطاقة والمنظمات" : "Power & Regs"}
                  </button>

                  <button
                    onClick={() => setLibCategory("sensor")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "sensor"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sliders className="size-3" />
                    {lang === "ar" ? "الحساسات والواجهات" : "Sensors & IO"}
                  </button>

                  <button
                    onClick={() => setLibCategory("semiconductor")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "semiconductor"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Microchip className="size-3" />
                    {lang === "ar" ? "أشباه الموصلات" : "Semiconductors"}
                  </button>

                  <button
                    onClick={() => setLibCategory("rf")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1 ${
                      libCategory === "rf"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Radio className="size-3" />
                    {lang === "ar" ? "اللاسلكي (RF)" : "Wireless (RF)"}
                  </button>
                </div>

                {/* Grid of libraries */}
                <div className="flex-1 min-h-[140px] rounded-xl border bg-card p-1.5 sm:p-2 overflow-y-auto">
                  {filteredOfficialLibs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground space-y-1">
                      <div>
                        {libSearchQuery.trim()
                          ? `لا توجد مكتبة مطابقة لـ "${libSearchQuery}"`
                          : libCategory !== "all"
                            ? "لا توجد مكتبات في هذا التصنيف"
                            : "لا توجد مكتبات متاحة حالياً"}
                      </div>
                      <div className="text-[10px] opacity-80">
                        جرّب مسح البحث أو اختيار «الكل»، أو انتظر تحميل القائمة من GitLab
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-2 gap-2">
                      {filteredOfficialLibs.map((libName) => {
                        const isLoading = libLoading === libName;
                        const isBulkBusy = importBusy && activeFetchLib === libName;
                        return (
                          <div
                            key={libName}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-muted/20 hover:border-blue-500/40 hover:bg-accent/40 transition-all group"
                          >
                            <div
                              className="flex flex-col min-w-0 me-2 cursor-pointer flex-1"
                              onClick={() => handleOpenLib(libName)}
                            >
                              <span className="text-xs font-mono font-bold truncate text-foreground group-hover:text-blue-500 transition-colors">
                                {libName}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {libName}.kicad_sym
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                                onClick={() => handleOpenLib(libName)}
                                disabled={isLoading || isBulkBusy}
                                title="تصفح محتويات هذه المكتبة واستيراد عناصرها منفردة"
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Eye className="size-3" />
                                )}
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                                onClick={() => handleFetchLib(libName)}
                                disabled={isLoading || isBulkBusy}
                                title="جلب واستيراد المكتبة بالكامل بضغطة واحدة"
                              >
                                {isBulkBusy ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Download className="size-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* VIEW 2: Inside Selected Library - Single Symbol Browser & Importer */
              <div className="flex-1 min-h-[220px] flex flex-col space-y-2.5 overflow-hidden">
                {/* Search & Actions bar inside library */}
                <div className="p-2.5 sm:p-3 border-b bg-muted/40 shrink-0 flex items-center gap-2.5">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground" />
                    <Input
                      value={symbolSearchQuery}
                      onChange={(e) => setSymbolSearchQuery(e.target.value)}
                      placeholder={lang === "ar" ? "بحث برمز أو اسم المكون..." : "Search symbol or name..."}
                      className="h-8 sm:h-9 ps-8 sm:ps-9 text-xs sm:text-sm w-full bg-muted/20 border-border/60"
                    />
                  </div>
                  <div className="text-xs font-mono text-muted-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg border border-border/60 shrink-0 font-medium">
                    {filteredLibSymbols.length} {lang === "ar" ? "عنصر" : "symbols"}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 sm:h-9 text-[10px] sm:text-xs gap-1 sm:gap-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold shrink-0"
                    onClick={handleImportAllInLib}
                    disabled={importBusy}
                    title="استيراد كافة الرموز الموجودة في هذه المكتبة دفعة واحدة"
                  >
                    <Download className="size-3 sm:size-3.5" />
                    <span className="hidden sm:inline">{lang === "ar" ? "جلب الكل" : "Fetch All"}</span>
                  </Button>
                </div>

                {/* Grid of symbols inside selected library */}
                <div className="flex-1 rounded-xl border bg-card p-2 overflow-y-auto min-h-[160px]">
                  {filteredLibSymbols.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                      <div>
                        {symbolSearchQuery.trim()
                          ? `لا يوجد عنصر مطابق لـ "${symbolSearchQuery}" في هذه المكتبة`
                          : selectedLib && selectedLib.symbolDefs.length === 0
                            ? "تعذّر استخراج رموز من هذه المكتبة (قد يكون التنسيق غير مدعوم أو فشل التحميل)"
                            : "لا توجد عناصر للعرض"}
                      </div>
                      {symbolSearchQuery.trim() ? (
                        <div className="text-[10px] opacity-80">امسح حقل البحث لعرض كل رموز المكتبة</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-2.5">
                      {filteredLibSymbols.map(({ def, parsed }) => {
                        const isImported = imported.some((imp) => imp.id === def.id);
                        const displayName = def.defaultValue || def.id.replace(/^kicad:[^:]+:?/, "");
                        const pinCount = def.pins.length;

                        return (
                          <div
                            key={def.id}
                            className={`flex flex-col justify-between p-2.5 rounded-xl border transition-all ${
                              isImported
                                ? "bg-green-500/5 border-green-500/40"
                                : "bg-card border-border hover:border-blue-500/40"
                            }`}
                          >
                            {/* Symbol Preview Box */}
                            <div className="w-full bg-muted/30 dark:bg-muted/10 rounded-lg p-2 flex items-center justify-center min-h-[80px] border border-border/40 relative">
                              <RawSymbolPreview def={def} size={60} />
                              {pinCount > 0 && (
                                <span className="absolute bottom-1 end-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-background/80 border text-muted-foreground">
                                  {pinCount} pins
                                </span>
                              )}
                              {def.prefix && (
                                <span className="absolute top-1 start-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                  {def.prefix}
                                </span>
                              )}
                            </div>

                            {/* Symbol Details */}
                            <div className="mt-2 space-y-1">
                              <div className="text-xs font-bold font-mono text-foreground truncate" title={displayName}>
                                {displayName}
                              </div>
                              {parsed?.description ? (
                                <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug" title={parsed.description}>
                                  {parsed.description}
                                </p>
                              ) : (
                                <p className="text-[10px] text-muted-foreground/60 italic">
                                  رمز {selectedLib.name}
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="mt-2.5 pt-2 border-t flex items-center gap-1.5">
                              {isImported ? (
                                <div className="flex items-center justify-between w-full gap-1">
                                  <span className="text-[10px] font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <Check className="size-3" />
                                    مستورد
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[11px] px-2 gap-1 border-green-500/30 text-green-700 dark:text-green-300 hover:bg-green-500/10"
                                    onClick={() => handleImportAndPick(def, parsed)}
                                  >
                                    استخدام
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 w-full">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="flex-1 h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() => handleImportSingleSymbol(def, parsed)}
                                  >
                                    <Plus className="size-3" />
                                    جلب الرمز
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2 gap-1 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                                    onClick={() => handleImportAndPick(def, parsed)}
                                    title="جلب الرمز وإضافته فوراً إلى المخطط"
                                  >
                                    جلب واستخدام
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}


          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
