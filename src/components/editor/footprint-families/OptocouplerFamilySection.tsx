import React from "react";
import { Input } from "@/components/ui/input";

interface Props {
  genParams: Record<string, any>;
  updateGenParams: (params: Record<string, any>) => void;
  updateGenParam: (key: string, value: any) => void;
  lang: "ar" | "en";
}

export const OptocouplerFamilySection: React.FC<Props> = ({
  genParams,
  updateGenParams,
  updateGenParam,
  lang,
}) => {
  const isTht =
    genParams.mounting === "THT" ||
    (genParams.packageType &&
      (genParams.packageType.toLowerCase().includes("tht") ||
        genParams.packageType.includes("DIP-") ||
        genParams.packageType.includes("SIP-") ||
        genParams.packageType.includes("Interrupter")));

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
          <span>{lang === "ar" ? "نوع العازل الضوئي والمستشعر (THT)" : "Optocoupler & Isolator Type (THT)"}</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "opto_dip", label: "DIP Opto", desc: "4/6/8-Pin Classic Isolator" },
            { id: "opto_wide", label: "Wide DIP", desc: "High Clearance Mains Isolation" },
            { id: "opto_slot", label: "Slot Interrupter", desc: "Optical Barrier Photo Interrupter" },
          ].map((item) => {
            const isSelected = (genParams.technologyType || "opto_dip") === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "opto_dip") {
                    updateGenParams({
                      technologyType: "opto_dip",
                      mounting: "THT",
                      packageType: "Optocoupler_DIP-4",
                      packageSize: "Optocoupler_DIP-4",
                      rowSpacing: 7.62,
                      value: "PC817",
                    });
                  } else if (item.id === "opto_wide") {
                    updateGenParams({
                      technologyType: "opto_wide",
                      mounting: "THT",
                      packageType: "Optocoupler_DIP-4_Wide",
                      packageSize: "Optocoupler_DIP-4_Wide",
                      rowSpacing: 10.16,
                      value: "PC817_Wide",
                    });
                  } else if (item.id === "opto_slot") {
                    updateGenParams({
                      technologyType: "opto_slot",
                      mounting: "THT",
                      packageType: "Opto_Interrupter_Slot",
                      packageSize: "Opto_Interrupter_Slot",
                      value: "ITR9608",
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

      {/* 2. Package Parameters (THT only) */}
      <div className="space-y-3">
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "تباعد الصفين Row Spacing (mm)" : "Row Spacing (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.rowSpacing ?? 7.62}
                onChange={(e) => updateGenParam("rowSpacing", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "تباعد الأرجل Pitch (mm)" : "Pin Pitch (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.pitch ?? 2.54}
                onChange={(e) => updateGenParam("pitch", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "عدد الأطراف Pin Count" : "Pin Count"}
              </label>
              <Input
                type="number"
                step="2"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.pinCount ?? 4}
                onChange={(e) => updateGenParam("pinCount", parseInt(e.target.value, 10) || 4)}
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
        </div>
      </div>
    </div>
  );
};
