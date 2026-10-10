import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import type { KicadFootprintModel, KicadFootprintPad } from "@/lib/kicad/footprint";

/**
 * Generator panel for a footprint that comes from the Library / KiCad import tab.
 *
 * Instead of rebuilding the footprint from guessed parametric values, the
 * generator edits the REAL geometry of the library footprint: identity
 * (reference / value / name), every pad (number, position, size, drill),
 * and bulk scaling helpers.  The live preview and the "Add to PCB" action use
 * the edited model, so what you see is exactly what gets placed.
 */

const fmt = (v: number | undefined) =>
  v === undefined || !Number.isFinite(v) ? "" : String(Math.round(v * 1000) / 1000);

function NumField({
  value,
  onCommit,
  min,
  disabled,
  className = "",
}: {
  value: number | undefined;
  onCommit: (v: number) => void;
  min?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className={`h-7 px-1.5 text-[11px] font-mono bg-slate-900 border-slate-700 text-white ${className}`}
      value={disabled ? "—" : text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = parseFloat(t);
        if (Number.isFinite(n) && (min === undefined || n >= min)) onCommit(n);
      }}
    />
  );
}

function clonePad(p: KicadFootprintPad): KicadFootprintPad {
  return { ...p, position: { ...p.position }, size: { ...p.size } };
}

export function cloneFootprintModel(model: KicadFootprintModel): KicadFootprintModel {
  const full: KicadFootprintModel =
    typeof (model as any)?.GetRenderModel === "function" ? (model as any).GetRenderModel() : model;
  try {
    return structuredClone(full);
  } catch {
    return JSON.parse(JSON.stringify(full));
  }
}

interface Props {
  model: KicadFootprintModel;
  onChange: (next: KicadFootprintModel) => void;
  onReset: () => void;
  /** Present only when the library item also has a parametric family. */
  onUseParametric?: () => void;
}

export function GeneratorModelEditor({ model, onChange, onReset, onUseParametric }: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [sizeScale, setSizeScale] = useState(100);
  const [posScale, setPosScale] = useState(100);

  const isOfficial = !!(model as any).fromOfficialKiCad || model.source?.type === "kicad-official";
  const hasDrills = useMemo(() => model.pads.some((p) => p.drill !== undefined), [model.pads]);

  /** Immutable edit helper: copies model/pads/properties, applies fn, flags as customized. */
  const commit = (fn: (draft: KicadFootprintModel) => void) => {
    const next: KicadFootprintModel = {
      ...model,
      properties: { ...model.properties },
      pads: model.pads.map(clonePad),
    };
    fn(next);
    (next as any).customizedInGenerator = true;
    onChange(next);
  };

  const updatePad = (index: number, patch: (pad: KicadFootprintPad) => void) =>
    commit((d) => patch(d.pads[index]));

  const setName = (name: string) =>
    commit((d) => {
      d.name = name;
      d.fullName = d.library ? `${d.library}:${name}` : name;
    });

  const setDrill = (index: number, v: number) =>
    updatePad(index, (p) => {
      const old = p.drill ?? 0;
      p.drill = v;
      if (old > 0) {
        const k = v / old;
        if (p.drillX !== undefined) p.drillX = p.drillX * k;
        if (p.drillY !== undefined) p.drillY = p.drillY * k;
      }
    });

  const addPad = () =>
    commit((d) => {
      const last = d.pads[d.pads.length - 1];
      const nums = d.pads.map((p) => parseInt(p.number, 10)).filter((n) => Number.isFinite(n));
      const nextNumber = String((nums.length ? Math.max(...nums) : d.pads.length) + 1);
      const base: KicadFootprintPad = last
        ? clonePad(last)
        : ({
            number: "1",
            type: "smd",
            shape: "rect",
            position: { x: 0, y: 0 },
            size: { x: 1, y: 1 },
            rotation: 0,
            layers: ["F.Cu", "F.Paste", "F.Mask"],
          } as KicadFootprintPad);
      const step = Math.max(base.size.x, base.size.y) * 1.5;
      base.number = nextNumber;
      base.position = { x: base.position.x + step, y: base.position.y };
      base.net = undefined;
      d.pads.push(base);
    });

  const removePad = (index: number) => {
    if (model.pads.length <= 1) return; // a footprint needs at least one pad
    commit((d) => {
      d.pads.splice(index, 1);
    });
  };

  const applySizeScale = () => {
    const k = sizeScale / 100;
    if (!(k > 0) || k === 1) return;
    commit((d) => {
      d.pads.forEach((p) => {
        p.size = { x: p.size.x * k, y: p.size.y * k };
      });
    });
    setSizeScale(100);
  };

  const applyPosScale = () => {
    const k = posScale / 100;
    if (!(k > 0) || k === 1) return;
    commit((d) => {
      d.pads.forEach((p) => {
        p.position = { x: p.position.x * k, y: p.position.y * k };
      });
    });
    setPosScale(100);
  };

  const label = "text-[10px] font-semibold text-slate-400";
  const inputCls = "h-8 text-xs font-mono bg-slate-900 border-slate-700 text-white mt-1";

  return (
    <div className="flex flex-col gap-3.5" dir="ltr">
      {/* Source banner */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-emerald-200">
            {ar ? "تعديل بصمة قادمة من المكتبة" : "Editing a library footprint"}
          </span>
          {isOfficial && (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
              KiCad Official
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-slate-200 break-all">{model.fullName || model.name}</div>
        <div className="text-[10px] text-slate-400 leading-relaxed">
          {ar
            ? "يعرض المولد هندسة البصمة الأصلية نفسها. أي تعديل هنا يظهر مباشرة في المعاينة ويُطبَّق عند الإضافة للوحة."
            : "The generator shows the exact library geometry. Edits appear live in the preview and are applied when adding to the PCB."}
        </div>
        <div className="flex gap-2 pt-0.5 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-800"
            onClick={onReset}
          >
            <RefreshCw className="size-3" />
            {ar ? "استرجاع الأصل" : "Reset to original"}
          </Button>
          {onUseParametric && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-800"
              onClick={onUseParametric}
            >
              <ArrowLeft className="size-3" />
              {ar ? "المولد البارامتري" : "Parametric generator"}
            </Button>
          )}
        </div>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>{ar ? "البادئة (Reference)" : "Prefix / Ref"}</label>
          <Input
            className={inputCls}
            value={model.properties?.Reference ?? ""}
            onChange={(e) => commit((d) => { d.properties.Reference = e.target.value; })}
          />
        </div>
        <div>
          <label className={label}>{ar ? "القيمة (Value)" : "Value"}</label>
          <Input
            className={inputCls}
            value={model.properties?.Value ?? ""}
            onChange={(e) => commit((d) => { d.properties.Value = e.target.value; })}
          />
        </div>
        <div className="col-span-2">
          <label className={label}>{ar ? "اسم البصمة (Name)" : "Footprint Name"}</label>
          <Input className={inputCls} value={model.name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      {/* Bulk tools */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>{ar ? "تحجيم أحجام الأطراف %" : "Scale pad sizes %"}</label>
          <div className="flex gap-1.5 mt-1">
            <NumField value={sizeScale} min={1} onCommit={setSizeScale} className="flex-1" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] border-slate-600 text-slate-200" onClick={applySizeScale}>
              {ar ? "تطبيق" : "Apply"}
            </Button>
          </div>
        </div>
        <div>
          <label className={label}>{ar ? "تحجيم المسافات %" : "Scale spacing %"}</label>
          <div className="flex gap-1.5 mt-1">
            <NumField value={posScale} min={1} onCommit={setPosScale} className="flex-1" />
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] border-slate-600 text-slate-200" onClick={applyPosScale}>
              {ar ? "تطبيق" : "Apply"}
            </Button>
          </div>
        </div>
      </div>

      {/* Pads table */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-800">
          <span className="text-[11px] font-semibold text-slate-300">
            {ar ? `الأطراف (${model.pads.length})` : `Pads (${model.pads.length})`}
          </span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1 border-slate-600 text-slate-200" onClick={addPad}>
            <Plus className="size-3" />
            {ar ? "إضافة" : "Add"}
          </Button>
        </div>
        <div className="grid grid-cols-[2.6rem_1fr_1fr_1fr_1fr_1fr_1.25rem] gap-1 px-2 pt-1.5 text-[9px] font-semibold text-slate-500 uppercase">
          <span>#</span>
          <span>X</span>
          <span>Y</span>
          <span>W</span>
          <span>H</span>
          <span>{hasDrills ? "Ø" : ""}</span>
          <span />
        </div>
        <div className="max-h-72 overflow-y-auto px-2 pb-2 space-y-1">
          {model.pads.map((p, i) => (
            <div key={i} className="grid grid-cols-[2.6rem_1fr_1fr_1fr_1fr_1fr_1.25rem] gap-1 items-center">
              <Input
                className="h-7 px-1.5 text-[11px] font-mono bg-slate-900 border-slate-700 text-white"
                value={p.number}
                onChange={(e) => updatePad(i, (pad) => { pad.number = e.target.value; })}
              />
              <NumField value={p.position.x} onCommit={(v) => updatePad(i, (pad) => { pad.position = { ...pad.position, x: v }; })} />
              <NumField value={p.position.y} onCommit={(v) => updatePad(i, (pad) => { pad.position = { ...pad.position, y: v }; })} />
              <NumField value={p.size.x} min={0.01} onCommit={(v) => updatePad(i, (pad) => { pad.size = { ...pad.size, x: v }; })} />
              <NumField value={p.size.y} min={0.01} onCommit={(v) => updatePad(i, (pad) => { pad.size = { ...pad.size, y: v }; })} />
              <NumField value={p.drill} min={0.01} disabled={p.drill === undefined} onCommit={(v) => setDrill(i, v)} />
              <button
                type="button"
                className="text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-500"
                disabled={model.pads.length <= 1}
                onClick={() => removePad(i)}
                aria-label={ar ? "حذف الطرف" : "Delete pad"}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
