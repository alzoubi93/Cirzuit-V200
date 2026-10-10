import React from "react";
import { Input } from "@/components/ui/input";

interface Props {
  genParams: Record<string, any>;
  updateGenParams: (params: Record<string, any>) => void;
  updateGenParam: (key: string, value: any) => void;
  lang: "ar" | "en";
}

export const FuseProtectionFamilySection: React.FC<Props> = ({
  genParams,
  updateGenParams,
  updateGenParam,
  lang,
}) => {
  return (
    <div className="space-y-3.5 border-t border-slate-800 pt-3">
      {/* 1. Category / Technology Filter Grid */}
      <div>
        <label className="text-[10px] font-semibold text-slate-300 flex items-center justify-between mb-1.5">
          <span>{lang === "ar" ? "نوع عنصر الحماية والصمام (THT)" : "Protection & Fuse Technology (THT)"}</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: "cartridge", label: "Cartridge Fuse", desc: "5x20mm & 6.3x32mm Glass/Ceramic" },
            { id: "ptc_tht", label: "Radial PTC", desc: "PolySwitch Resettable Through-Hole" },
            { id: "varistor", label: "Varistor MOV", desc: "Metal Oxide Surge Absorber" },
            { id: "gdt", label: "Gas Tube (GDT)", desc: "Lightning Spark Gap Arrestor" },
          ].map((item) => {
            const isSelected = (genParams.technologyType || "cartridge") === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "cartridge") {
                    updateGenParams({
                      technologyType: "cartridge",
                      mounting: "THT",
                      packageType: "Fuseholder_5x20mm_THT",
                      packageSize: "Fuseholder_5x20mm_THT",
                      pitch: 22.6,
                      drill: 1.6,
                      padSize: 3.0,
                      value: "Fuse_5x20mm",
                    });
                  } else if (item.id === "ptc_tht") {
                    updateGenParams({
                      technologyType: "ptc_tht",
                      mounting: "THT",
                      packageType: "Radial_PTC_P5.08mm",
                      packageSize: "Radial_PTC_P5.08mm",
                      pitch: 5.08,
                      drill: 0.9,
                      padSize: 1.8,
                      value: "PTC_5.08mm",
                    });
                  } else if (item.id === "varistor") {
                    updateGenParams({
                      technologyType: "varistor",
                      mounting: "THT",
                      packageType: "Varistor_MOV_7D",
                      packageSize: "Varistor_MOV_7D",
                      pitch: 5.0,
                      value: "MOV_07D",
                    });
                  } else if (item.id === "gdt") {
                    updateGenParams({
                      technologyType: "gdt",
                      mounting: "THT",
                      packageType: "GDT_2Pin_P5mm",
                      packageSize: "GDT_2Pin_P5mm",
                      pitch: 5.0,
                      value: "GDT_5mm",
                    });
                  }
                }}
                className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all text-center border ${
                  isSelected
                    ? "bg-blue-600/30 border-blue-500 text-blue-200 font-bold shadow-sm shadow-blue-500/20"
                    : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="truncate">{item.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Package Controls */}
      <div className="space-y-3">
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "تباعد الأرجل Pitch (mm)" : "Lead Spacing Pitch (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.pitch ?? 5.08}
                onChange={(e) => updateGenParam("pitch", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "قطر الثقب Drill (mm)" : "Drill Hole (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.drill ?? 1.0}
                onChange={(e) => updateGenParam("drill", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "حجم الوسادة Pad Size (mm)" : "Pad Size (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.padSize ?? 2.0}
                onChange={(e) => updateGenParam("padSize", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "طول الهيكل Body L (mm)" : "Body Length (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.bodyLength ?? 10.0}
                onChange={(e) => updateGenParam("bodyLength", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
