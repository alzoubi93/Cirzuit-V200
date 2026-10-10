import React from "react";
import { Input } from "@/components/ui/input";

interface Props {
  genParams: Record<string, any>;
  updateGenParams: (params: Record<string, any>) => void;
  updateGenParam: (key: string, value: any) => void;
  lang: "ar" | "en";
}

export const PotentiometerFamilySection: React.FC<Props> = ({
  genParams,
  updateGenParams,
  updateGenParam,
  lang,
}) => {
  const isTht =
    genParams.mounting === "THT" ||
    (genParams.packageType &&
      (genParams.packageType.toLowerCase().includes("tht") ||
        genParams.packageType.includes("3296") ||
        genParams.packageType.includes("3362") ||
        genParams.packageType.includes("3386") ||
        genParams.packageType.includes("Alpha") ||
        genParams.packageType.includes("Slide") ||
        genParams.packageType.includes("Rotary")));

  const isCustom =
    genParams.packageSize === "custom" ||
    genParams.packageType === "custom" ||
    genParams.packageSize === "Custom" ||
    genParams.packageType === "Custom";

  return (
    <div className="space-y-3.5 border-t border-slate-800 pt-3">
      {/* 1. Category / Technology Filter Grid */}
      <div>
        <label className="text-[10px] font-semibold text-slate-300 flex items-center justify-between mb-1.5">
          <span>{lang === "ar" ? "نوع المقاومة المتغيرة (THT)" : "Potentiometer & Trimmer Type (THT)"}</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "trimmer_single", label: "Single-Turn", desc: "Bourns 3362P / 3386P Cermet" },
            { id: "trimmer_multi", label: "Multi-Turn", desc: "Precision 3296W / 3296Y" },
            { id: "rotary_panel", label: "Rotary Pot", desc: "Alpha 16mm / Bourns 9mm" },
            { id: "slide_fader", label: "Slide Fader", desc: "Mixer / Console 30/60mm" },
          ].map((item) => {
            const isSelected = (genParams.technologyType || "trimmer_single") === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "trimmer_single") {
                    updateGenParams({
                      technologyType: "trimmer_single",
                      mounting: "THT",
                      packageType: "Potentiometer_Trimmer_3362P",
                      packageSize: "Potentiometer_Trimmer_3362P",
                      value: "10k",
                    });
                  } else if (item.id === "trimmer_multi") {
                    updateGenParams({
                      technologyType: "trimmer_multi",
                      mounting: "THT",
                      packageType: "Potentiometer_Trimmer_3296W",
                      packageSize: "Potentiometer_Trimmer_3296W",
                      value: "10k_Precision",
                    });
                  } else if (item.id === "rotary_panel") {
                    updateGenParams({
                      technologyType: "rotary_panel",
                      mounting: "THT",
                      packageType: "Potentiometer_Rotary_Alpha16mm",
                      packageSize: "Potentiometer_Rotary_Alpha16mm",
                      value: "Alpha_16mm",
                    });
                  } else if (item.id === "slide_fader") {
                    updateGenParams({
                      technologyType: "slide_fader",
                      mounting: "THT",
                      packageType: "Potentiometer_Slide_30mm",
                      packageSize: "Potentiometer_Slide_30mm",
                      value: "Fader_30mm",
                    });
                  }
                }}
                className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-all text-center border ${
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

      {/* 2. Package Controls (THT only) */}
      <div className="space-y-3">
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "تباعد الأرجل Pitch (mm)" : "Terminal Pitch (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.pitch ?? 2.54}
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
                value={genParams.drill ?? 0.8}
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
                value={genParams.padSize ?? 1.6}
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
                value={genParams.bodyLength ?? 6.8}
                onChange={(e) => updateGenParam("bodyLength", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
