import React from "react";
import { Input } from "@/components/ui/input";

interface Props {
  genParams: Record<string, any>;
  updateGenParams: (params: Record<string, any>) => void;
  updateGenParam: (key: string, value: any) => void;
  lang: "ar" | "en";
}

export const SwitchRelayFamilySection: React.FC<Props> = ({
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
          <span>{lang === "ar" ? "نوع المفتاح أو المرحل (THT)" : "Switch & Relay Type (THT)"}</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "tactile", label: "Tactile Switch", desc: "Momentary Push Button" },
            { id: "slide", label: "Slide Switch", desc: "SPDT / DPDT Toggle Slide" },
            { id: "dip", label: "DIP Switch", desc: "Multi-position Config Switch" },
            { id: "relay_power", label: "Power Relay", desc: "Songle SRD / Omron 10A" },
            { id: "relay_signal", label: "Signal Relay", desc: "Telecom DPDT 8-Pin" },
            { id: "pushbutton", label: "Push Button", desc: "Latching / Panel Mount" },
          ].map((item) => {
            const isSelected = (genParams.technologyType || "tactile") === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "tactile") {
                    updateGenParams({
                      technologyType: "tactile",
                      mounting: "THT",
                      packageType: "Tactile_6x6mm_THT",
                      packageSize: "Tactile_6x6mm_THT",
                      value: "SW_Push",
                    });
                  } else if (item.id === "slide") {
                    updateGenParams({
                      technologyType: "slide",
                      mounting: "THT",
                      packageType: "SlideSwitch_SPDT_P2.54mm",
                      packageSize: "SlideSwitch_SPDT_P2.54mm",
                      value: "SW_Slide",
                    });
                  } else if (item.id === "dip") {
                    updateGenParams({
                      technologyType: "dip",
                      mounting: "THT",
                      packageType: "DIP_Switch_4Pos",
                      packageSize: "DIP_Switch_4Pos",
                      value: "DIP_4P",
                    });
                  } else if (item.id === "relay_power") {
                    updateGenParams({
                      technologyType: "relay_power",
                      mounting: "THT",
                      packageType: "Relay_SPDT_Songle_SRD",
                      packageSize: "Relay_SPDT_Songle_SRD",
                      value: "Songle_SRD",
                    });
                  } else if (item.id === "relay_signal") {
                    updateGenParams({
                      technologyType: "relay_signal",
                      mounting: "THT",
                      packageType: "Relay_DPDT_Telecom",
                      packageSize: "Relay_DPDT_Telecom",
                      value: "Relay_Telecom",
                    });
                  } else if (item.id === "pushbutton") {
                    updateGenParams({
                      technologyType: "pushbutton",
                      mounting: "THT",
                      packageType: "Tactile_12x12mm_THT",
                      packageSize: "Tactile_12x12mm_THT",
                      value: "SW_12x12",
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

      {/* 2. Package Controls */}
      <div className="space-y-3">
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "تباعد الأرجل X Pitch (mm)" : "Lead Spacing X (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.pitchX ?? 6.5}
                onChange={(e) => updateGenParam("pitchX", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "تباعد الأرجل Y Pitch (mm)" : "Lead Spacing Y (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.pitchY ?? 4.5}
                onChange={(e) => updateGenParam("pitchY", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
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
            <div>
              <label className="text-[10px] font-semibold text-slate-400">
                {lang === "ar" ? "حجم الوسادة Pad Size (mm)" : "Pad Size (mm)"}
              </label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs font-mono bg-slate-950 border-slate-700 text-white mt-1"
                value={genParams.padSize ?? 1.8}
                onChange={(e) => updateGenParam("padSize", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
