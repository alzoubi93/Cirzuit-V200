// Workbench backgrounds for the REALISTIC view only (never used by the schematic module).
// Each preset provides:
//  - css:    full CSS `background` shorthand for the canvas backdrop layer
//  - fill:   single representative hex used by the SVG/PDF/JPEG exporter (vector export
//            cannot carry CSS multi-layer gradients, so it falls back to the base tone)

export interface RealisticBackground {
  id: string;
  ar: string;
  en: string;
  css: (isDark: boolean) => string;
  fill: string;
}

export const REALISTIC_BACKGROUNDS: RealisticBackground[] = [
  {
    id: "wood",
    ar: "خشبية",
    en: "Wood",
    fill: "#a2764b",
    css: (isDark) =>
      [
        "radial-gradient(ellipse at 50% 40%, rgba(255,226,180,0.10) 0%, rgba(0,0,0,0) 55%, rgba(40,22,8,0.22) 100%)",
        "repeating-linear-gradient(92deg, rgba(70,40,16,0.10) 0px, rgba(70,40,16,0.10) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 6px, rgba(255,226,180,0.06) 6px, rgba(255,226,180,0.06) 8px, rgba(0,0,0,0) 8px, rgba(0,0,0,0) 17px)",
        "repeating-linear-gradient(88.6deg, rgba(60,32,12,0.07) 0px, rgba(60,32,12,0.07) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 31px)",
        isDark
          ? "linear-gradient(180deg, #a2764b 0%, #94693f 55%, #8a6038 100%)"
          : "linear-gradient(180deg, #b58a5b 0%, #a97d4f 55%, #9c7146 100%)",
      ].join(", "),
  },
  {
    id: "dark_wood",
    ar: "خشب داكن",
    en: "Dark Wood",
    fill: "#5d4126",
    css: () =>
      [
        "radial-gradient(ellipse at 50% 38%, rgba(255,214,160,0.07) 0%, rgba(0,0,0,0) 55%, rgba(10,5,2,0.35) 100%)",
        "repeating-linear-gradient(91.5deg, rgba(28,15,6,0.16) 0px, rgba(28,15,6,0.16) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 9px, rgba(214,168,120,0.05) 9px, rgba(214,168,120,0.05) 11px, rgba(0,0,0,0) 11px, rgba(0,0,0,0) 23px)",
        "repeating-linear-gradient(89deg, rgba(20,10,4,0.12) 0px, rgba(20,10,4,0.12) 3px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 37px)",
        "linear-gradient(180deg, #6b4c2d 0%, #5d4126 55%, #4e351e 100%)",
      ].join(", "),
  },
  {
    id: "black_mat",
    ar: "مطاط أسود",
    en: "ESD Mat",
    fill: "#1d222b",
    css: () =>
      [
        "radial-gradient(ellipse at 50% 40%, rgba(160,180,210,0.06) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.4) 100%)",
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 4px)",
        "repeating-linear-gradient(-45deg, rgba(255,255,255,0.014) 0px, rgba(255,255,255,0.014) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 4px)",
        "linear-gradient(180deg, #242a35 0%, #1d222b 55%, #171b22 100%)",
      ].join(", "),
  },
  {
    id: "green_mat",
    ar: "سجادة قص",
    en: "Cutting Mat",
    fill: "#1f6f54",
    css: () =>
      [
        "radial-gradient(ellipse at 50% 40%, rgba(220,255,235,0.06) 0%, rgba(0,0,0,0) 55%, rgba(0,20,12,0.35) 100%)",
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 40px)",
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 40px)",
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 8px)",
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 8px)",
        "linear-gradient(180deg, #237a5c 0%, #1f6f54 55%, #1a5f48 100%)",
      ].join(", "),
  },
  {
    id: "white_desk",
    ar: "مكتب أبيض",
    en: "White Desk",
    fill: "#e8eaee",
    css: () =>
      [
        "radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.5) 0%, rgba(0,0,0,0) 55%, rgba(90,100,120,0.18) 100%)",
        "repeating-linear-gradient(93deg, rgba(120,130,150,0.05) 0px, rgba(120,130,150,0.05) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 26px)",
        "linear-gradient(180deg, #f2f3f6 0%, #e8eaee 55%, #dde0e6 100%)",
      ].join(", "),
  },
  {
    id: "marble",
    ar: "رخام",
    en: "Marble",
    fill: "#cfd3d8",
    css: () =>
      [
        "radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0) 50%)",
        "repeating-linear-gradient(63deg, rgba(120,126,138,0.10) 0px, rgba(120,126,138,0.10) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 60px, rgba(150,156,168,0.07) 60px, rgba(150,156,168,0.07) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 130px)",
        "repeating-linear-gradient(118deg, rgba(140,146,158,0.08) 0px, rgba(140,146,158,0.08) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 90px)",
        "linear-gradient(180deg, #d9dce1 0%, #cfd3d8 55%, #c2c7ce 100%)",
      ].join(", "),
  },
  {
    id: "brushed_metal",
    ar: "معدن مصقول",
    en: "Brushed Metal",
    fill: "#9aa2ad",
    css: () =>
      [
        "radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.22) 0%, rgba(0,0,0,0) 55%, rgba(30,36,46,0.30) 100%)",
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px, rgba(40,46,56,0.05) 3px, rgba(40,46,56,0.05) 4px, rgba(0,0,0,0) 4px, rgba(0,0,0,0) 7px)",
        "linear-gradient(180deg, #aab1bc 0%, #9aa2ad 55%, #8b939f 100%)",
      ].join(", "),
  },
  {
    id: "blueprint",
    ar: "مخطط أزرق",
    en: "Blueprint",
    fill: "#123a6b",
    css: () =>
      [
        "radial-gradient(ellipse at 50% 40%, rgba(140,190,255,0.08) 0%, rgba(0,0,0,0) 55%, rgba(2,10,25,0.4) 100%)",
        "repeating-linear-gradient(0deg, rgba(140,190,255,0.09) 0px, rgba(140,190,255,0.09) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 40px)",
        "repeating-linear-gradient(90deg, rgba(140,190,255,0.09) 0px, rgba(140,190,255,0.09) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 40px)",
        "repeating-linear-gradient(0deg, rgba(140,190,255,0.035) 0px, rgba(140,190,255,0.035) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 8px)",
        "repeating-linear-gradient(90deg, rgba(140,190,255,0.035) 0px, rgba(140,190,255,0.035) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 8px)",
        "linear-gradient(180deg, #16447c 0%, #123a6b 55%, #0e2f58 100%)",
      ].join(", "),
  },
];

export function getRealisticBackground(id?: string): RealisticBackground {
  return REALISTIC_BACKGROUNDS.find((b) => b.id === id) ?? REALISTIC_BACKGROUNDS[0];
}
