import React from "react";
import { Input } from "@/components/ui/input";

interface Props {
  genParams: Record<string, any>;
  updateGenParams: (params: Record<string, any>) => void;
  updateGenParam: (key: string, value: any) => void;
  lang: "ar" | "en";
}

export const BatteriesPowerFamilySection: React.FC<Props> = ({
  genParams,
  updateGenParams,
  updateGenParam,
  lang,
}) => {
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
          <span>{lang === "ar" ? "نوع البطارية أو مدخل الطاقة" : "Battery & Power Interface Type"}</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "coin_cell", label: "Coin Cell CR2032", desc: "RTC & Backup Battery Holder" },
            { id: "cylindrical", label: "18650 / AA / AAA", desc: "Li-Ion & Alkaline Battery Clips" },
            { id: "dc_jack", label: "DC Barrel Jack", desc: "2.1mm / 2.5mm Power Supply In" },
            { id: "terminal", label: "Screw Terminal", desc: "2P / 3P 5.08mm Wire Terminal" },
            { id: "high_power", label: "XT60 / XT30", desc: "High Current LiPo Connectors" },
          ].map((item) => {
            const isSelected = (genParams.technologyType || "coin_cell") === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "coin_cell") {
                    updateGenParams({
                      technologyType: "coin_cell",
                      mounting: "THT",
                      packageType: "Battery_CR2032_THT_Keystone3002",
                      packageSize: "Battery_CR2032_THT_Keystone3002",
                      value: "CR2032",
                    });
                  } else if (item.id === "cylindrical") {
                    updateGenParams({
                      technologyType: "cylindrical",
                      mounting: "THT",
                      packageType: "Battery_18650_Holder_Keystone1042",
                      packageSize: "Battery_18650_Holder_Keystone1042",
                      value: "18650_Holder",
                    });
                  } else if (item.id === "dc_jack") {
                    updateGenParams({
                      technologyType: "dc_jack",
                      mounting: "THT",
                      packageType: "Connector_DCJack_2.1mm_THT",
                      packageSize: "Connector_DCJack_2.1mm_THT",
                      value: "DC_IN_2.1mm",
                    });
                  } else if (item.id === "terminal") {
                    updateGenParams({
                      technologyType: "terminal",
                      mounting: "THT",
                      packageType: "Terminal_Block_2P_5.08mm",
                      packageSize: "Terminal_Block_2P_5.08mm",
                      value: "Screw_Terminal_2P",
                    });
                  } else if (item.id === "high_power") {
                    updateGenParams({
                      technologyType: "high_power",
                      mounting: "THT",
                      packageType: "Connector_Power_XT60_THT",
                      packageSize: "Connector_Power_XT60_THT",
                      value: "XT60",
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

      {/* 2. Package Parameters (THT) */}
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
                value={genParams.pitch ?? 20.0}
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
                value={genParams.drill ?? 1.2}
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
                value={genParams.padSize ?? 2.5}
                onChange={(e) => updateGenParam("padSize", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "قطر الهيكل Diameter (mm)" : "Body Diameter (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.diameter ?? 20.0}
                onChange={(e) => updateGenParam("diameter", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
