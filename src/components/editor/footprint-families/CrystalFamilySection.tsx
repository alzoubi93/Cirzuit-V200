import React from "react";
import { Input } from "@/components/ui/input";

interface Props {
  genParams: Record<string, any>;
  updateGenParams: (params: Record<string, any>) => void;
  updateGenParam: (key: string, value: any) => void;
  lang: "ar" | "en";
}

export const CrystalFamilySection: React.FC<Props> = ({
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
          <span>{lang === "ar" ? "نوع البلورة والمذبذب (THT)" : "Crystal & Oscillator Type (THT)"}</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: "can", label: "HC-49 Quartz", desc: "HC-49/US Metal Can" },
            { id: "tuning_fork", label: "32.768kHz RTC", desc: "Tuning Fork Watch Crystal" },
            { id: "oscillator", label: "Active Osc", desc: "Powered Clock Oscillator DIP-8/14" },
            { id: "resonator", label: "Ceramic Res", desc: "3-Pin Built-in Caps P2.54mm" },
          ].map((item) => {
            const isSelected = (genParams.technologyType || "can") === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "can") {
                    updateGenParams({
                      technologyType: "can",
                      mounting: "THT",
                      packageType: "HC-49/US",
                      packageSize: "HC-49/US",
                      pitch: 4.88,
                      drill: 0.8,
                      padSize: 1.6,
                      value: "16MHz",
                    });
                  } else if (item.id === "tuning_fork") {
                    updateGenParams({
                      technologyType: "tuning_fork",
                      mounting: "THT",
                      packageType: "TuningFork_2x6",
                      packageSize: "TuningFork_2x6",
                      pitch: 2.54,
                      value: "32.768kHz",
                    });
                  } else if (item.id === "oscillator") {
                    updateGenParams({
                      technologyType: "oscillator",
                      mounting: "THT",
                      packageType: "Oscillator_DIP-8",
                      packageSize: "Oscillator_DIP-8",
                      value: "OSC_25MHz",
                    });
                  } else if (item.id === "resonator") {
                    updateGenParams({
                      technologyType: "resonator",
                      mounting: "THT",
                      packageType: "Resonator_3Pin_P2.54",
                      packageSize: "Resonator_3Pin_P2.54",
                      pitch: 2.54,
                      value: "16MHz",
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
                value={genParams.pitch ?? 4.88}
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
                {lang === "ar" ? "طول الهيكل Body L (mm)" : "Body Length (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.bodyLength ?? 11.5}
                onChange={(e) => updateGenParam("bodyLength", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "عرض الهيكل Body W (mm)" : "Body Width (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.bodyWidth ?? 4.9}
                onChange={(e) => updateGenParam("bodyWidth", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
