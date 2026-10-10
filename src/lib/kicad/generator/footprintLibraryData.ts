import { FOOTPRINT_FAMILIES, generateFootprint, type FootprintFamilyDefinition } from "./index";
import type { KicadFootprintModel } from "../footprint";
import { getOfficialFootprintRef, guessOfficialFootprintRef } from "./officialFootprintMap";
import {
  hasEmbeddedOfficial,
  loadEmbeddedOfficialFootprint,
  getEmbeddedOfficialMeta,
} from "../footprint/embedded";

export interface FootprintLibraryItem {
  id: string;
  familyId: string;
  presetId?: string;
  name: string;
  nameAr: string;
  category: FootprintCategoryGroup;
  categoryName: string;
  categoryNameAr: string;
  mounting: "SMD" | "THT" | "Both";
  pinsText: string;
  pitchText: string;
  description: string;
  descriptionAr: string;
  params: Record<string, any>;
  tags: string[];
}

export type FootprintCategoryGroup =
  | "all"
  | "ic"
  | "passive"
  | "semiconductor"
  | "connector"
  | "crystal"
  | "switch_relay"
  | "protection"
  | "potentiometer"
  | "opto"
  | "power"
  | "display"
  | "sensor"
  | "module"
  | "mechanical";

export interface FootprintCategoryInfo {
  id: FootprintCategoryGroup;
  name: string;
  nameAr: string;
  iconName?: string;
}

export const FOOTPRINT_CATEGORIES: FootprintCategoryInfo[] = [
  { id: "all", name: "All", nameAr: "الكل" },
  { id: "ic", name: "ICs", nameAr: "دوائر متكاملة (ICs)" },
  { id: "passive", name: "Passives", nameAr: "عناصر خاملة" },
  { id: "semiconductor", name: "Semiconductors", nameAr: "أشباه موصلات" },
  { id: "connector", name: "Connectors", nameAr: "موصلات ورؤوس" },
  { id: "crystal", name: "Crystals", nameAr: "كريستالات ومذبذبات" },
  { id: "switch_relay", name: "Switches", nameAr: "مفاتيح ورليهات" },
  { id: "protection", name: "Protection", nameAr: "عناصر حماية" },
  { id: "potentiometer", name: "Potentiometers", nameAr: "مقاومات متغيرة" },
  { id: "opto", name: "Optocouplers", nameAr: "عوازل ضوئية" },
  { id: "power", name: "Power", nameAr: "طاقة وبطاريات" },
  { id: "display", name: "Displays", nameAr: "شاشات وعروض" },
  { id: "sensor", name: "Sensors", nameAr: "حساسات" },
  { id: "module", name: "Modules", nameAr: "وحدات وموديلات" },
  { id: "mechanical", name: "Mechanical", nameAr: "ميكانيكية" },
];

export interface FootprintLibraryGroup {
  id: string;
  name: string;
  nameAr: string;
  category: FootprintCategoryGroup;
  iconName: string;
  description: string;
  descriptionAr: string;
  mountingTypes: ("SMD" | "THT")[];
  itemIds: string[];
}

export const FOOTPRINT_LIBRARY_CATALOG: FootprintLibraryItem[] = [
  {
    "id": "dip-4",
    "familyId": "dip",
    "presetId": "dip-4",
    "name": "DIP-4 (Opto/Relay)",
    "nameAr": "DIP-4 (Opto/Relay) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (4 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (4 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 4,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-4 (Opto/Relay)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "4"
    ]
  },
  {
    "id": "dip-8",
    "familyId": "dip",
    "presetId": "dip-8",
    "name": "DIP-8 (Op-Amp / NE555)",
    "nameAr": "DIP-8 (Op-Amp / NE555) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (8 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (8 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 8,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-8 (Op-Amp / NE555)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "8"
    ]
  },
  {
    "id": "dip-14",
    "familyId": "dip",
    "presetId": "dip-14",
    "name": "DIP-14 (Logic 74xx)",
    "nameAr": "DIP-14 (Logic 74xx) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "14 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (14 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (14 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 14,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-14 (Logic 74xx)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "14"
    ]
  },
  {
    "id": "dip-16",
    "familyId": "dip",
    "presetId": "dip-16",
    "name": "DIP-16 (Shift Reg / Driver)",
    "nameAr": "DIP-16 (Shift Reg / Driver) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "16 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (16 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (16 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 16,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-16 (Shift Reg / Driver)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "16"
    ]
  },
  {
    "id": "dip-18",
    "familyId": "dip",
    "presetId": "dip-18",
    "name": "DIP-18 (Microcontroller)",
    "nameAr": "DIP-18 (Microcontroller) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "18 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (18 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (18 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 18,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-18 (Microcontroller)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "18"
    ]
  },
  {
    "id": "dip-20",
    "familyId": "dip",
    "presetId": "dip-20",
    "name": "DIP-20 (Buffer / Driver)",
    "nameAr": "DIP-20 (Buffer / Driver) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "20 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (20 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (20 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 20,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-20 (Buffer / Driver)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "20"
    ]
  },
  {
    "id": "dip-24",
    "familyId": "dip",
    "presetId": "dip-24",
    "name": "DIP-24 (Narrow 7.62mm)",
    "nameAr": "DIP-24 (Narrow 7.62mm) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "24 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (24 pins, row spacing 7.62mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (24 سن، تباعد 7.62مم)",
    "params": {
      "pinCount": 24,
      "rowSpacing": 7.62,
      "reference": "U",
      "value": "DIP-24 (Narrow 7.62mm)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "24"
    ]
  },
  {
    "id": "dip-28",
    "familyId": "dip",
    "presetId": "dip-28",
    "name": "DIP-28 (Wide 15.24mm - ATmega328)",
    "nameAr": "DIP-28 (Wide 15.24mm - ATmega328) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "28 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (28 pins, row spacing 15.24mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (28 سن، تباعد 15.24مم)",
    "params": {
      "pinCount": 28,
      "rowSpacing": 15.24,
      "reference": "U",
      "value": "DIP-28 (Wide 15.24mm - ATmega328)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "28"
    ]
  },
  {
    "id": "dip-40",
    "familyId": "dip",
    "presetId": "dip-40",
    "name": "DIP-40 (Wide 15.24mm - MCU)",
    "nameAr": "DIP-40 (Wide 15.24mm - MCU) (ثنائي الأطراف THT)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "THT",
    "pinsText": "40 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Dual In-Line Package (40 pins, row spacing 15.24mm)",
    "descriptionAr": "حزمة ثنائية الأطراف قياسية عبر اللوح THT (40 سن، تباعد 15.24مم)",
    "params": {
      "pinCount": 40,
      "rowSpacing": 15.24,
      "reference": "U",
      "value": "DIP-40 (Wide 15.24mm - MCU)"
    },
    "tags": [
      "dip",
      "ic",
      "tht",
      "package_dip",
      "40"
    ]
  },
  {
    "id": "soic-8",
    "familyId": "soic",
    "presetId": "soic-8",
    "name": "SOIC-8 (1.27mm)",
    "nameAr": "SOIC-8 (1.27mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "8 Pins",
    "pitchText": "1.27mm",
    "description": "Small Outline Package (8 pins, pitch 1.27mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (8 سن، خطوة 1.27مم)",
    "params": {
      "pinCount": 8,
      "pitch": 1.27,
      "rowSpacing": 5.4,
      "padWidth": 1.55,
      "padHeight": 0.6,
      "bodyWidth": 3.9,
      "packageSubtype": "SOIC",
      "reference": "U",
      "value": "SOIC-8 (1.27mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "8"
    ]
  },
  {
    "id": "soic-14",
    "familyId": "soic",
    "presetId": "soic-14",
    "name": "SOIC-14 (1.27mm)",
    "nameAr": "SOIC-14 (1.27mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "14 Pins",
    "pitchText": "1.27mm",
    "description": "Small Outline Package (14 pins, pitch 1.27mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (14 سن، خطوة 1.27مم)",
    "params": {
      "pinCount": 14,
      "pitch": 1.27,
      "rowSpacing": 5.4,
      "padWidth": 1.55,
      "padHeight": 0.6,
      "bodyWidth": 3.9,
      "packageSubtype": "SOIC",
      "reference": "U",
      "value": "SOIC-14 (1.27mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "14"
    ]
  },
  {
    "id": "soic-16",
    "familyId": "soic",
    "presetId": "soic-16",
    "name": "SOIC-16 (1.27mm)",
    "nameAr": "SOIC-16 (1.27mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "16 Pins",
    "pitchText": "1.27mm",
    "description": "Small Outline Package (16 pins, pitch 1.27mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (16 سن، خطوة 1.27مم)",
    "params": {
      "pinCount": 16,
      "pitch": 1.27,
      "rowSpacing": 5.4,
      "padWidth": 1.55,
      "padHeight": 0.6,
      "bodyWidth": 3.9,
      "packageSubtype": "SOIC",
      "reference": "U",
      "value": "SOIC-16 (1.27mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "16"
    ]
  },
  {
    "id": "soic-16w",
    "familyId": "soic",
    "presetId": "soic-16w",
    "name": "SOIC-16 Wide (7.5mm Body)",
    "nameAr": "SOIC-16 Wide (7.5mm Body) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "16 Pins",
    "pitchText": "1.27mm",
    "description": "Small Outline Package (16 pins, pitch 1.27mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (16 سن، خطوة 1.27مم)",
    "params": {
      "pinCount": 16,
      "pitch": 1.27,
      "rowSpacing": 9.4,
      "padWidth": 1.8,
      "padHeight": 0.6,
      "bodyWidth": 7.5,
      "packageSubtype": "SOIC",
      "reference": "U",
      "value": "SOIC-16 Wide (7.5mm Body)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "16"
    ]
  },
  {
    "id": "soic-20w",
    "familyId": "soic",
    "presetId": "soic-20w",
    "name": "SOIC-20 Wide (7.5mm Body)",
    "nameAr": "SOIC-20 Wide (7.5mm Body) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "20 Pins",
    "pitchText": "1.27mm",
    "description": "Small Outline Package (20 pins, pitch 1.27mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (20 سن، خطوة 1.27مم)",
    "params": {
      "pinCount": 20,
      "pitch": 1.27,
      "rowSpacing": 9.4,
      "padWidth": 1.8,
      "padHeight": 0.6,
      "bodyWidth": 7.5,
      "packageSubtype": "SOIC",
      "reference": "U",
      "value": "SOIC-20 Wide (7.5mm Body)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "20"
    ]
  },
  {
    "id": "tssop-8",
    "familyId": "soic",
    "presetId": "tssop-8",
    "name": "TSSOP-8 (0.65mm)",
    "nameAr": "TSSOP-8 (0.65mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "8 Pins",
    "pitchText": "0.65mm",
    "description": "Small Outline Package (8 pins, pitch 0.65mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (8 سن، خطوة 0.65مم)",
    "params": {
      "pinCount": 8,
      "pitch": 0.65,
      "rowSpacing": 6.4,
      "padWidth": 1.45,
      "padHeight": 0.45,
      "bodyWidth": 4.4,
      "packageSubtype": "TSSOP",
      "reference": "U",
      "value": "TSSOP-8 (0.65mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "8"
    ]
  },
  {
    "id": "tssop-16",
    "familyId": "soic",
    "presetId": "tssop-16",
    "name": "TSSOP-16 (0.65mm)",
    "nameAr": "TSSOP-16 (0.65mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "16 Pins",
    "pitchText": "0.65mm",
    "description": "Small Outline Package (16 pins, pitch 0.65mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (16 سن، خطوة 0.65مم)",
    "params": {
      "pinCount": 16,
      "pitch": 0.65,
      "rowSpacing": 6.4,
      "padWidth": 1.45,
      "padHeight": 0.45,
      "bodyWidth": 4.4,
      "packageSubtype": "TSSOP",
      "reference": "U",
      "value": "TSSOP-16 (0.65mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "16"
    ]
  },
  {
    "id": "tssop-20",
    "familyId": "soic",
    "presetId": "tssop-20",
    "name": "TSSOP-20 (0.65mm)",
    "nameAr": "TSSOP-20 (0.65mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "20 Pins",
    "pitchText": "0.65mm",
    "description": "Small Outline Package (20 pins, pitch 0.65mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (20 سن، خطوة 0.65مم)",
    "params": {
      "pinCount": 20,
      "pitch": 0.65,
      "rowSpacing": 6.4,
      "padWidth": 1.45,
      "padHeight": 0.45,
      "bodyWidth": 4.4,
      "packageSubtype": "TSSOP",
      "reference": "U",
      "value": "TSSOP-20 (0.65mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "20"
    ]
  },
  {
    "id": "msop-8",
    "familyId": "soic",
    "presetId": "msop-8",
    "name": "MSOP-8 (0.65mm)",
    "nameAr": "MSOP-8 (0.65mm) (سطحي SMD)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "8 Pins",
    "pitchText": "0.65mm",
    "description": "Small Outline Package (8 pins, pitch 0.65mm)",
    "descriptionAr": "حزمة متكاملة سطحية SMD (8 سن، خطوة 0.65مم)",
    "params": {
      "pinCount": 8,
      "pitch": 0.65,
      "rowSpacing": 4.9,
      "padWidth": 1.2,
      "padHeight": 0.4,
      "bodyWidth": 3,
      "packageSubtype": "MSOP",
      "reference": "U",
      "value": "MSOP-8 (0.65mm)"
    },
    "tags": [
      "soic",
      "sop",
      "tssop",
      "ic",
      "smd",
      "8"
    ]
  },
  {
    "id": "lqfp-32",
    "familyId": "qfp",
    "presetId": "lqfp-32",
    "name": "LQFP-32 (7x7mm, 0.8mm Pitch)",
    "nameAr": "LQFP-32 (7x7mm, 0.8mm Pitch) (رباعي مسطح QFP)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "32 Pins",
    "pitchText": "0.8mm",
    "description": "Quad Flat Package (32 pins)",
    "descriptionAr": "حزمة رباعية مسطحة بأطراف محيطية (32 سن)",
    "params": {
      "pinCount": 32,
      "pitch": 0.8,
      "bodySize": 7,
      "spanX": 9,
      "spanY": 9,
      "padWidth": 0.45,
      "padLength": 1.5,
      "reference": "U",
      "value": "LQFP-32 (7x7mm, 0.8mm Pitch)"
    },
    "tags": [
      "qfp",
      "tqfp",
      "lqfp",
      "ic",
      "smd",
      "32"
    ]
  },
  {
    "id": "lqfp-44",
    "familyId": "qfp",
    "presetId": "lqfp-44",
    "name": "LQFP-44 (10x10mm, 0.8mm Pitch)",
    "nameAr": "LQFP-44 (10x10mm, 0.8mm Pitch) (رباعي مسطح QFP)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "44 Pins",
    "pitchText": "0.8mm",
    "description": "Quad Flat Package (44 pins)",
    "descriptionAr": "حزمة رباعية مسطحة بأطراف محيطية (44 سن)",
    "params": {
      "pinCount": 44,
      "pitch": 0.8,
      "bodySize": 10,
      "spanX": 12,
      "spanY": 12,
      "padWidth": 0.45,
      "padLength": 1.5,
      "reference": "U",
      "value": "LQFP-44 (10x10mm, 0.8mm Pitch)"
    },
    "tags": [
      "qfp",
      "tqfp",
      "lqfp",
      "ic",
      "smd",
      "44"
    ]
  },
  {
    "id": "lqfp-48",
    "familyId": "qfp",
    "presetId": "lqfp-48",
    "name": "LQFP-48 (7x7mm, 0.5mm Pitch - STM32)",
    "nameAr": "LQFP-48 (7x7mm, 0.5mm Pitch - STM32) (رباعي مسطح QFP)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "48 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat Package (48 pins)",
    "descriptionAr": "حزمة رباعية مسطحة بأطراف محيطية (48 سن)",
    "params": {
      "pinCount": 48,
      "pitch": 0.5,
      "bodySize": 7,
      "spanX": 9,
      "spanY": 9,
      "padWidth": 0.3,
      "padLength": 1.5,
      "reference": "U",
      "value": "LQFP-48 (7x7mm, 0.5mm Pitch - STM32)"
    },
    "tags": [
      "qfp",
      "tqfp",
      "lqfp",
      "ic",
      "smd",
      "48"
    ]
  },
  {
    "id": "lqfp-64",
    "familyId": "qfp",
    "presetId": "lqfp-64",
    "name": "LQFP-64 (10x10mm, 0.5mm Pitch)",
    "nameAr": "LQFP-64 (10x10mm, 0.5mm Pitch) (رباعي مسطح QFP)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "64 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat Package (64 pins)",
    "descriptionAr": "حزمة رباعية مسطحة بأطراف محيطية (64 سن)",
    "params": {
      "pinCount": 64,
      "pitch": 0.5,
      "bodySize": 10,
      "spanX": 12,
      "spanY": 12,
      "padWidth": 0.3,
      "padLength": 1.5,
      "reference": "U",
      "value": "LQFP-64 (10x10mm, 0.5mm Pitch)"
    },
    "tags": [
      "qfp",
      "tqfp",
      "lqfp",
      "ic",
      "smd",
      "64"
    ]
  },
  {
    "id": "lqfp-100",
    "familyId": "qfp",
    "presetId": "lqfp-100",
    "name": "LQFP-100 (14x14mm, 0.5mm Pitch)",
    "nameAr": "LQFP-100 (14x14mm, 0.5mm Pitch) (رباعي مسطح QFP)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "100 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat Package (100 pins)",
    "descriptionAr": "حزمة رباعية مسطحة بأطراف محيطية (100 سن)",
    "params": {
      "pinCount": 100,
      "pitch": 0.5,
      "bodySize": 14,
      "spanX": 16,
      "spanY": 16,
      "padWidth": 0.3,
      "padLength": 1.5,
      "reference": "U",
      "value": "LQFP-100 (14x14mm, 0.5mm Pitch)"
    },
    "tags": [
      "qfp",
      "tqfp",
      "lqfp",
      "ic",
      "smd",
      "100"
    ]
  },
  {
    "id": "qfn-16",
    "familyId": "qfn",
    "presetId": "qfn-16",
    "name": "QFN-16 (3x3mm, 0.5mm)",
    "nameAr": "QFN-16 (3x3mm, 0.5mm) (بدون أرجل QFN)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "16 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat No-leads Package with exposed thermal pad (16 pins)",
    "descriptionAr": "حزمة بدون أطراف مع وسادة حرارية مركزية (16 سن)",
    "params": {
      "pinCount": 16,
      "pitch": 0.5,
      "bodySize": 3,
      "thermalPadSize": 1.7,
      "reference": "U",
      "value": "QFN-16 (3x3mm, 0.5mm)"
    },
    "tags": [
      "qfn",
      "dfn",
      "ic",
      "smd",
      "16"
    ]
  },
  {
    "id": "qfn-24",
    "familyId": "qfn",
    "presetId": "qfn-24",
    "name": "QFN-24 (4x4mm, 0.5mm)",
    "nameAr": "QFN-24 (4x4mm, 0.5mm) (بدون أرجل QFN)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "24 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat No-leads Package with exposed thermal pad (24 pins)",
    "descriptionAr": "حزمة بدون أطراف مع وسادة حرارية مركزية (24 سن)",
    "params": {
      "pinCount": 24,
      "pitch": 0.5,
      "bodySize": 4,
      "thermalPadSize": 2.5,
      "reference": "U",
      "value": "QFN-24 (4x4mm, 0.5mm)"
    },
    "tags": [
      "qfn",
      "dfn",
      "ic",
      "smd",
      "24"
    ]
  },
  {
    "id": "qfn-32",
    "familyId": "qfn",
    "presetId": "qfn-32",
    "name": "QFN-32 (5x5mm, 0.5mm - ESP32/ATmega)",
    "nameAr": "QFN-32 (5x5mm, 0.5mm - ESP32/ATmega) (بدون أرجل QFN)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "32 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat No-leads Package with exposed thermal pad (32 pins)",
    "descriptionAr": "حزمة بدون أطراف مع وسادة حرارية مركزية (32 سن)",
    "params": {
      "pinCount": 32,
      "pitch": 0.5,
      "bodySize": 5,
      "thermalPadSize": 3.5,
      "reference": "U",
      "value": "QFN-32 (5x5mm, 0.5mm - ESP32/ATmega)"
    },
    "tags": [
      "qfn",
      "dfn",
      "ic",
      "smd",
      "32"
    ]
  },
  {
    "id": "qfn-48",
    "familyId": "qfn",
    "presetId": "qfn-48",
    "name": "QFN-48 (7x7mm, 0.5mm)",
    "nameAr": "QFN-48 (7x7mm, 0.5mm) (بدون أرجل QFN)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "48 Pins",
    "pitchText": "0.5mm",
    "description": "Quad Flat No-leads Package with exposed thermal pad (48 pins)",
    "descriptionAr": "حزمة بدون أطراف مع وسادة حرارية مركزية (48 سن)",
    "params": {
      "pinCount": 48,
      "pitch": 0.5,
      "bodySize": 7,
      "thermalPadSize": 5.2,
      "reference": "U",
      "value": "QFN-48 (7x7mm, 0.5mm)"
    },
    "tags": [
      "qfn",
      "dfn",
      "ic",
      "smd",
      "48"
    ]
  },
  {
    "id": "bga-64",
    "familyId": "bga",
    "presetId": "bga-64",
    "name": "BGA-64 (8x8 Grid, 0.8mm)",
    "nameAr": "BGA-64 (8x8 Grid, 0.8mm) (شبكة كرات BGA)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "64 Balls",
    "pitchText": "0.8mm",
    "description": "Ball Grid Array Package (64 balls, pitch 0.8mm)",
    "descriptionAr": "مصفوفة كرات لحام سفلية عالية الكثافة (64 كرة)",
    "params": {
      "rows": 8,
      "columns": 8,
      "pitch": 0.8,
      "padDiameter": 0.4,
      "reference": "U",
      "value": "BGA-64 (8x8 Grid, 0.8mm)"
    },
    "tags": [
      "bga",
      "wlcsp",
      "ic",
      "smd",
      "64"
    ]
  },
  {
    "id": "bga-100",
    "familyId": "bga",
    "presetId": "bga-100",
    "name": "BGA-100 (10x10 Grid, 0.8mm)",
    "nameAr": "BGA-100 (10x10 Grid, 0.8mm) (شبكة كرات BGA)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "64 Balls",
    "pitchText": "0.8mm",
    "description": "Ball Grid Array Package (64 balls, pitch 0.8mm)",
    "descriptionAr": "مصفوفة كرات لحام سفلية عالية الكثافة (64 كرة)",
    "params": {
      "rows": 10,
      "columns": 10,
      "pitch": 0.8,
      "padDiameter": 0.4,
      "reference": "U",
      "value": "BGA-100 (10x10 Grid, 0.8mm)"
    },
    "tags": [
      "bga",
      "wlcsp",
      "ic",
      "smd",
      "64"
    ]
  },
  {
    "id": "bga-256",
    "familyId": "bga",
    "presetId": "bga-256",
    "name": "BGA-256 (16x16 Grid, 1.0mm)",
    "nameAr": "BGA-256 (16x16 Grid, 1.0mm) (شبكة كرات BGA)",
    "category": "ic",
    "categoryName": "IC Packages",
    "categoryNameAr": "الدوائر المتكاملة",
    "mounting": "SMD",
    "pinsText": "64 Balls",
    "pitchText": "1mm",
    "description": "Ball Grid Array Package (64 balls, pitch 1mm)",
    "descriptionAr": "مصفوفة كرات لحام سفلية عالية الكثافة (64 كرة)",
    "params": {
      "rows": 16,
      "columns": 16,
      "pitch": 1,
      "padDiameter": 0.5,
      "reference": "U",
      "value": "BGA-256 (16x16 Grid, 1.0mm)"
    },
    "tags": [
      "bga",
      "wlcsp",
      "ic",
      "smd",
      "64"
    ]
  },
  {
    "id": "res-smd-01005",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_01005 (0402 Metric - 0.40 × 0.20 mm - 1%)",
    "nameAr": "مقاومة سطحية R 01005 (0402 Metric - 0.40 × 0.20 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 01005 (0402 Metric - 0.40 × 0.20 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 01005 (0402 Metric - 0.40 × 0.20 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "01005",
      "packageSize": "01005",
      "padWidth": 0.2,
      "padHeight": 0.22,
      "reference": "R",
      "value": "R_01005 (0402 Metric - 0.40 × 0.20 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "01005",
      "01005 (0402 Metric - 0.40 × 0.20 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-0201",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0201 (0603 Metric - 0.60 × 0.30 mm - 1%)",
    "nameAr": "مقاومة سطحية R 0201 (0603 Metric - 0.60 × 0.30 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0201 (0603 Metric - 0.60 × 0.30 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0201 (0603 Metric - 0.60 × 0.30 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0201",
      "packageSize": "0201",
      "padWidth": 0.35,
      "padHeight": 0.35,
      "reference": "R",
      "value": "R_0201 (0603 Metric - 0.60 × 0.30 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0201",
      "0201 (0603 Metric - 0.60 × 0.30 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-0402",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0402 (1005 Metric - 1.00 × 0.50 mm - 1%)",
    "nameAr": "مقاومة سطحية R 0402 (1005 Metric - 1.00 × 0.50 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0402 (1005 Metric - 1.00 × 0.50 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0402 (1005 Metric - 1.00 × 0.50 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0402",
      "packageSize": "0402",
      "padWidth": 0.55,
      "padHeight": 0.6,
      "reference": "R",
      "value": "R_0402 (1005 Metric - 1.00 × 0.50 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0402",
      "0402 (1005 Metric - 1.00 × 0.50 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-0603",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0603 (1608 Metric - 1.60 × 0.80 mm - 1%)",
    "nameAr": "مقاومة سطحية R 0603 (1608 Metric - 1.60 × 0.80 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0603 (1608 Metric - 1.60 × 0.80 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0603 (1608 Metric - 1.60 × 0.80 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0603",
      "packageSize": "0603",
      "padWidth": 0.8,
      "padHeight": 0.9,
      "reference": "R",
      "value": "R_0603 (1608 Metric - 1.60 × 0.80 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0603",
      "0603 (1608 Metric - 1.60 × 0.80 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-0805",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0805 (2012 Metric - 2.00 × 1.25 mm - 1%)",
    "nameAr": "مقاومة سطحية R 0805 (2012 Metric - 2.00 × 1.25 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0805 (2012 Metric - 2.00 × 1.25 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0805 (2012 Metric - 2.00 × 1.25 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0805",
      "packageSize": "0805",
      "padWidth": 1,
      "padHeight": 1.3,
      "reference": "R",
      "value": "R_0805 (2012 Metric - 2.00 × 1.25 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0805",
      "0805 (2012 Metric - 2.00 × 1.25 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-1206",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1206 (3216 Metric - 3.20 × 1.60 mm - 1%)",
    "nameAr": "مقاومة سطحية R 1206 (3216 Metric - 3.20 × 1.60 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1206 (3216 Metric - 3.20 × 1.60 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1206 (3216 Metric - 3.20 × 1.60 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1206",
      "packageSize": "1206",
      "padWidth": 1.1,
      "padHeight": 1.7,
      "reference": "R",
      "value": "R_1206 (3216 Metric - 3.20 × 1.60 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "1206",
      "1206 (3216 Metric - 3.20 × 1.60 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-1210",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1210 (3225 Metric - 3.20 × 2.50 mm - 1%)",
    "nameAr": "مقاومة سطحية R 1210 (3225 Metric - 3.20 × 2.50 mm - 1%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1210 (3225 Metric - 3.20 × 2.50 mm - 1%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1210 (3225 Metric - 3.20 × 2.50 mm - 1%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1210",
      "packageSize": "1210",
      "padWidth": 1.1,
      "padHeight": 2.6,
      "reference": "R",
      "value": "R_1210 (3225 Metric - 3.20 × 2.50 mm - 1%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "1210",
      "1210 (3225 Metric - 3.20 × 2.50 mm - 1%)"
    ]
  },
  {
    "id": "res-smd-0402-cf",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0402 Carbon (1005 Metric - 1.00 × 0.50 mm - 5%)",
    "nameAr": "مقاومة سطحية R 0402 Carbon (1005 Metric - 1.00 × 0.50 mm - 5%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0402 Carbon (1005 Metric - 1.00 × 0.50 mm - 5%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0402 Carbon (1005 Metric - 1.00 × 0.50 mm - 5%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0402-cf",
      "packageSize": "0402-cf",
      "padWidth": 0.55,
      "padHeight": 0.6,
      "reference": "R",
      "value": "R_0402 Carbon (1005 Metric - 1.00 × 0.50 mm - 5%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0402-cf",
      "0402 Carbon (1005 Metric - 1.00 × 0.50 mm - 5%)"
    ]
  },
  {
    "id": "res-smd-0603-cf",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0603 Carbon (1608 Metric - 1.60 × 0.80 mm - 5%)",
    "nameAr": "مقاومة سطحية R 0603 Carbon (1608 Metric - 1.60 × 0.80 mm - 5%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0603 Carbon (1608 Metric - 1.60 × 0.80 mm - 5%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0603 Carbon (1608 Metric - 1.60 × 0.80 mm - 5%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0603-cf",
      "packageSize": "0603-cf",
      "padWidth": 0.8,
      "padHeight": 0.9,
      "reference": "R",
      "value": "R_0603 Carbon (1608 Metric - 1.60 × 0.80 mm - 5%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0603-cf",
      "0603 Carbon (1608 Metric - 1.60 × 0.80 mm - 5%)"
    ]
  },
  {
    "id": "res-smd-0805-cf",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0805 Carbon (2012 Metric - 2.00 × 1.25 mm - 5%)",
    "nameAr": "مقاومة سطحية R 0805 Carbon (2012 Metric - 2.00 × 1.25 mm - 5%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0805 Carbon (2012 Metric - 2.00 × 1.25 mm - 5%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0805 Carbon (2012 Metric - 2.00 × 1.25 mm - 5%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0805-cf",
      "packageSize": "0805-cf",
      "padWidth": 1,
      "padHeight": 1.3,
      "reference": "R",
      "value": "R_0805 Carbon (2012 Metric - 2.00 × 1.25 mm - 5%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "0805-cf",
      "0805 Carbon (2012 Metric - 2.00 × 1.25 mm - 5%)"
    ]
  },
  {
    "id": "res-smd-1206-cf",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1206 Carbon (3216 Metric - 3.20 × 1.60 mm - 5%)",
    "nameAr": "مقاومة سطحية R 1206 Carbon (3216 Metric - 3.20 × 1.60 mm - 5%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1206 Carbon (3216 Metric - 3.20 × 1.60 mm - 5%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1206 Carbon (3216 Metric - 3.20 × 1.60 mm - 5%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1206-cf",
      "packageSize": "1206-cf",
      "padWidth": 1.1,
      "padHeight": 1.7,
      "reference": "R",
      "value": "R_1206 Carbon (3216 Metric - 3.20 × 1.60 mm - 5%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "1206-cf",
      "1206 Carbon (3216 Metric - 3.20 × 1.60 mm - 5%)"
    ]
  },
  {
    "id": "res-smd-1210-cf",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1210 Carbon (3225 Metric - 3.20 × 2.50 mm - 5%)",
    "nameAr": "مقاومة سطحية R 1210 Carbon (3225 Metric - 3.20 × 2.50 mm - 5%)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1210 Carbon (3225 Metric - 3.20 × 2.50 mm - 5%) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1210 Carbon (3225 Metric - 3.20 × 2.50 mm - 5%) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1210-cf",
      "packageSize": "1210-cf",
      "padWidth": 1.1,
      "padHeight": 2.6,
      "reference": "R",
      "value": "R_1210 Carbon (3225 Metric - 3.20 × 2.50 mm - 5%)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "1210-cf",
      "1210 Carbon (3225 Metric - 3.20 × 2.50 mm - 5%)"
    ]
  },
  {
    "id": "res-smd-1812",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1812 Power (4532 Metric - 4.50 × 3.20 mm - 0.75W)",
    "nameAr": "مقاومة سطحية R 1812 Power (4532 Metric - 4.50 × 3.20 mm - 0.75W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1812 Power (4532 Metric - 4.50 × 3.20 mm - 0.75W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1812 Power (4532 Metric - 4.50 × 3.20 mm - 0.75W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1812",
      "packageSize": "1812",
      "padWidth": 1.2,
      "padHeight": 3.4,
      "reference": "R",
      "value": "R_1812 Power (4532 Metric - 4.50 × 3.20 mm - 0.75W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "1812",
      "1812 Power (4532 Metric - 4.50 × 3.20 mm - 0.75W)"
    ]
  },
  {
    "id": "res-smd-2010",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2010 Power (5025 Metric - 5.00 × 2.50 mm - 1.0W)",
    "nameAr": "مقاومة سطحية R 2010 Power (5025 Metric - 5.00 × 2.50 mm - 1.0W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2010 Power (5025 Metric - 5.00 × 2.50 mm - 1.0W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2010 Power (5025 Metric - 5.00 × 2.50 mm - 1.0W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "2010",
      "packageSize": "2010",
      "padWidth": 1.3,
      "padHeight": 2.7,
      "reference": "R",
      "value": "R_2010 Power (5025 Metric - 5.00 × 2.50 mm - 1.0W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "2010",
      "2010 Power (5025 Metric - 5.00 × 2.50 mm - 1.0W)"
    ]
  },
  {
    "id": "res-smd-2512",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2512 Power (6332 Metric - 6.30 × 3.20 mm - 2.0W)",
    "nameAr": "مقاومة سطحية R 2512 Power (6332 Metric - 6.30 × 3.20 mm - 2.0W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2512 Power (6332 Metric - 6.30 × 3.20 mm - 2.0W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2512 Power (6332 Metric - 6.30 × 3.20 mm - 2.0W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "2512",
      "packageSize": "2512",
      "padWidth": 1.4,
      "padHeight": 3.4,
      "reference": "R",
      "value": "R_2512 Power (6332 Metric - 6.30 × 3.20 mm - 2.0W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "2512",
      "2512 Power (6332 Metric - 6.30 × 3.20 mm - 2.0W)"
    ]
  },
  {
    "id": "res-smd-2712",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2712 Power (7032 Metric - 7.00 × 3.20 mm - 2.5W)",
    "nameAr": "مقاومة سطحية R 2712 Power (7032 Metric - 7.00 × 3.20 mm - 2.5W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2712 Power (7032 Metric - 7.00 × 3.20 mm - 2.5W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2712 Power (7032 Metric - 7.00 × 3.20 mm - 2.5W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "2712",
      "packageSize": "2712",
      "padWidth": 1.5,
      "padHeight": 3.4,
      "reference": "R",
      "value": "R_2712 Power (7032 Metric - 7.00 × 3.20 mm - 2.5W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "2712",
      "2712 Power (7032 Metric - 7.00 × 3.20 mm - 2.5W)"
    ]
  },
  {
    "id": "res-smd-2920",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2920 Power (7550 Metric - 7.50 × 5.00 mm - 3.0W)",
    "nameAr": "مقاومة سطحية R 2920 Power (7550 Metric - 7.50 × 5.00 mm - 3.0W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2920 Power (7550 Metric - 7.50 × 5.00 mm - 3.0W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2920 Power (7550 Metric - 7.50 × 5.00 mm - 3.0W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "2920",
      "packageSize": "2920",
      "padWidth": 1.6,
      "padHeight": 5.3,
      "reference": "R",
      "value": "R_2920 Power (7550 Metric - 7.50 × 5.00 mm - 3.0W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "2920",
      "2920 Power (7550 Metric - 7.50 × 5.00 mm - 3.0W)"
    ]
  },
  {
    "id": "res-smd-shunt-1206",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1206 Shunt (3216 Metric - 0.05Ω Sense)",
    "nameAr": "مقاومة سطحية R 1206 Shunt (3216 Metric - 0.05Ω Sense)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1206 Shunt (3216 Metric - 0.05Ω Sense) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1206 Shunt (3216 Metric - 0.05Ω Sense) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "shunt-1206",
      "packageSize": "shunt-1206",
      "padWidth": 1.2,
      "padHeight": 1.8,
      "reference": "R",
      "value": "R_1206 Shunt (3216 Metric - 0.05Ω Sense)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "shunt-1206",
      "1206 Shunt (3216 Metric - 0.05Ω Sense)"
    ]
  },
  {
    "id": "res-smd-shunt-2010",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2010 Shunt (5025 Metric - 0.02Ω 1W)",
    "nameAr": "مقاومة سطحية R 2010 Shunt (5025 Metric - 0.02Ω 1W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2010 Shunt (5025 Metric - 0.02Ω 1W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2010 Shunt (5025 Metric - 0.02Ω 1W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "shunt-2010",
      "packageSize": "shunt-2010",
      "padWidth": 1.4,
      "padHeight": 2.8,
      "reference": "R",
      "value": "R_2010 Shunt (5025 Metric - 0.02Ω 1W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "shunt-2010",
      "2010 Shunt (5025 Metric - 0.02Ω 1W)"
    ]
  },
  {
    "id": "res-smd-shunt-2512",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2512 Shunt (6332 Metric - 0.01Ω 2W)",
    "nameAr": "مقاومة سطحية R 2512 Shunt (6332 Metric - 0.01Ω 2W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2512 Shunt (6332 Metric - 0.01Ω 2W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2512 Shunt (6332 Metric - 0.01Ω 2W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "shunt-2512",
      "packageSize": "shunt-2512",
      "padWidth": 1.6,
      "padHeight": 3.6,
      "reference": "R",
      "value": "R_2512 Shunt (6332 Metric - 0.01Ω 2W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "shunt-2512",
      "2512 Shunt (6332 Metric - 0.01Ω 2W)"
    ]
  },
  {
    "id": "res-smd-shunt-2712",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2712 Shunt (7032 Metric - 0.005Ω 3W)",
    "nameAr": "مقاومة سطحية R 2712 Shunt (7032 Metric - 0.005Ω 3W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2712 Shunt (7032 Metric - 0.005Ω 3W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2712 Shunt (7032 Metric - 0.005Ω 3W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "shunt-2712",
      "packageSize": "shunt-2712",
      "padWidth": 1.8,
      "padHeight": 3.6,
      "reference": "R",
      "value": "R_2712 Shunt (7032 Metric - 0.005Ω 3W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "shunt-2712",
      "2712 Shunt (7032 Metric - 0.005Ω 3W)"
    ]
  },
  {
    "id": "res-smd-shunt-2920",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_2920 Shunt (7550 Metric - 0.001Ω 5W)",
    "nameAr": "مقاومة سطحية R 2920 Shunt (7550 Metric - 0.001Ω 5W)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 2920 Shunt (7550 Metric - 0.001Ω 5W) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 2920 Shunt (7550 Metric - 0.001Ω 5W) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "shunt-2920",
      "packageSize": "shunt-2920",
      "padWidth": 2,
      "padHeight": 5.4,
      "reference": "R",
      "value": "R_2920 Shunt (7550 Metric - 0.001Ω 5W)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "shunt-2920",
      "2920 Shunt (7550 Metric - 0.001Ω 5W)"
    ]
  },
  {
    "id": "res-smd-pot-smd-tc33",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_TC33 (Bourns 3.8 × 3.6 mm SMD Trimmer)",
    "nameAr": "مقاومة سطحية R TC33 (Bourns 3.8 × 3.6 mm SMD Trimmer)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor TC33 (Bourns 3.8 × 3.6 mm SMD Trimmer) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية TC33 (Bourns 3.8 × 3.6 mm SMD Trimmer) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "pot-smd-tc33",
      "packageSize": "pot-smd-tc33",
      "padWidth": 1.2,
      "padHeight": 1.2,
      "reference": "R",
      "value": "R_TC33 (Bourns 3.8 × 3.6 mm SMD Trimmer)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "pot-smd-tc33",
      "TC33 (Bourns 3.8 × 3.6 mm SMD Trimmer)"
    ]
  },
  {
    "id": "res-smd-pot-smd-3314g",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_Bourns 3314G (4.5 × 4.5 mm SMD Trimmer)",
    "nameAr": "مقاومة سطحية R Bourns 3314G (4.5 × 4.5 mm SMD Trimmer)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor Bourns 3314G (4.5 × 4.5 mm SMD Trimmer) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية Bourns 3314G (4.5 × 4.5 mm SMD Trimmer) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "pot-smd-3314g",
      "packageSize": "pot-smd-3314g",
      "padWidth": 1.4,
      "padHeight": 1.3,
      "reference": "R",
      "value": "R_Bourns 3314G (4.5 × 4.5 mm SMD Trimmer)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "pot-smd-3314g",
      "Bourns 3314G (4.5 × 4.5 mm SMD Trimmer)"
    ]
  },
  {
    "id": "res-smd-pot-smd-3314j",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_Bourns 3314J (4.5 × 4.5 mm J-Lead Trimmer)",
    "nameAr": "مقاومة سطحية R Bourns 3314J (4.5 × 4.5 mm J-Lead Trimmer)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor Bourns 3314J (4.5 × 4.5 mm J-Lead Trimmer) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية Bourns 3314J (4.5 × 4.5 mm J-Lead Trimmer) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "pot-smd-3314j",
      "packageSize": "pot-smd-3314j",
      "padWidth": 1.4,
      "padHeight": 1.3,
      "reference": "R",
      "value": "R_Bourns 3314J (4.5 × 4.5 mm J-Lead Trimmer)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "pot-smd-3314j",
      "Bourns 3314J (4.5 × 4.5 mm J-Lead Trimmer)"
    ]
  },
  {
    "id": "res-smd-array-0402x4",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0402×4 Array (0804 Metric - 8-Pad Convex)",
    "nameAr": "مقاومة سطحية R 0402×4 Array (0804 Metric - 8-Pad Convex)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0402×4 Array (0804 Metric - 8-Pad Convex) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0402×4 Array (0804 Metric - 8-Pad Convex) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "array-0402x4",
      "packageSize": "array-0402x4",
      "padWidth": 0.3,
      "padHeight": 0.45,
      "reference": "R",
      "value": "R_0402×4 Array (0804 Metric - 8-Pad Convex)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "array-0402x4",
      "0402×4 Array (0804 Metric - 8-Pad Convex)"
    ]
  },
  {
    "id": "res-smd-array-0603x4",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0603×4 Array (1206 Metric - 8-Pad Convex)",
    "nameAr": "مقاومة سطحية R 0603×4 Array (1206 Metric - 8-Pad Convex)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0603×4 Array (1206 Metric - 8-Pad Convex) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0603×4 Array (1206 Metric - 8-Pad Convex) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "array-0603x4",
      "packageSize": "array-0603x4",
      "padWidth": 0.45,
      "padHeight": 0.7,
      "reference": "R",
      "value": "R_0603×4 Array (1206 Metric - 8-Pad Convex)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "array-0603x4",
      "0603×4 Array (1206 Metric - 8-Pad Convex)"
    ]
  },
  {
    "id": "res-smd-array-0805x4",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_0805×4 Array (1608 Metric - 8-Pad Concave)",
    "nameAr": "مقاومة سطحية R 0805×4 Array (1608 Metric - 8-Pad Concave)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 0805×4 Array (1608 Metric - 8-Pad Concave) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 0805×4 Array (1608 Metric - 8-Pad Concave) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "array-0805x4",
      "packageSize": "array-0805x4",
      "padWidth": 0.65,
      "padHeight": 0.9,
      "reference": "R",
      "value": "R_0805×4 Array (1608 Metric - 8-Pad Concave)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "array-0805x4",
      "0805×4 Array (1608 Metric - 8-Pad Concave)"
    ]
  },
  {
    "id": "res-smd-array-1206x4",
    "familyId": "passive",
    "presetId": "resistor-smd",
    "name": "R_1206×4 Array (2512 Metric - 8-Pad Convex)",
    "nameAr": "مقاومة سطحية R 1206×4 Array (2512 Metric - 8-Pad Convex)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Chip Resistor 1206×4 Array (2512 Metric - 8-Pad Convex) (undefinedxundefinedmm)",
    "descriptionAr": "مقاومة سطحية قياسية 1206×4 Array (2512 Metric - 8-Pad Convex) (undefined×undefinedمم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "array-1206x4",
      "packageSize": "array-1206x4",
      "padWidth": 0.7,
      "padHeight": 1.2,
      "reference": "R",
      "value": "R_1206×4 Array (2512 Metric - 8-Pad Convex)"
    },
    "tags": [
      "resistor",
      "res",
      "smd",
      "chip",
      "array-1206x4",
      "1206×4 Array (2512 Metric - 8-Pad Convex)"
    ]
  },
  {
    "id": "res-tht-axial-0204",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial DIN0204 (1/8W 1% P5.08mm)",
    "nameAr": "مقاومة ثقبية Axial DIN0204 (1/8W 1% P5.08mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Axial Resistor Axial DIN0204 (1/8W 1% P5.08mm) (Pitch 5.08mm, Body 3.6x1.6mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial DIN0204 (1/8W 1% P5.08mm) (تباعد 5.08مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0204",
      "pitch": 5.08,
      "drill": 0.7,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 3.6,
      "bodyDiameter": 1.6,
      "reference": "R",
      "value": "R_Axial DIN0204 (1/8W 1% P5.08mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0204",
      "5.08"
    ]
  },
  {
    "id": "res-tht-axial-0207",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial DIN0207 (1/4W 1% P7.62mm Standard)",
    "nameAr": "مقاومة ثقبية Axial DIN0207 (1/4W 1% P7.62mm Standard)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.62mm Pitch",
    "description": "Through-Hole Axial Resistor Axial DIN0207 (1/4W 1% P7.62mm Standard) (Pitch 7.62mm, Body 6.3x2.4mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial DIN0207 (1/4W 1% P7.62mm Standard) (تباعد 7.62مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0207",
      "pitch": 7.62,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 6.3,
      "bodyDiameter": 2.4,
      "reference": "R",
      "value": "R_Axial DIN0207 (1/4W 1% P7.62mm Standard)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0207",
      "7.62"
    ]
  },
  {
    "id": "res-tht-axial-0309",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial DIN0309 (1/2W 1% P10.16mm)",
    "nameAr": "مقاومة ثقبية Axial DIN0309 (1/2W 1% P10.16mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10.16mm Pitch",
    "description": "Through-Hole Axial Resistor Axial DIN0309 (1/2W 1% P10.16mm) (Pitch 10.16mm, Body 9x3.2mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial DIN0309 (1/2W 1% P10.16mm) (تباعد 10.16مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0309",
      "pitch": 10.16,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 9,
      "bodyDiameter": 3.2,
      "reference": "R",
      "value": "R_Axial DIN0309 (1/2W 1% P10.16mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0309",
      "10.16"
    ]
  },
  {
    "id": "res-tht-axial-0411",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial DIN0411 (1.0W 1% P12.70mm)",
    "nameAr": "مقاومة ثقبية Axial DIN0411 (1.0W 1% P12.70mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "12.7mm Pitch",
    "description": "Through-Hole Axial Resistor Axial DIN0411 (1.0W 1% P12.70mm) (Pitch 12.7mm, Body 11.5x4.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial DIN0411 (1.0W 1% P12.70mm) (تباعد 12.7مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0411",
      "pitch": 12.7,
      "drill": 0.9,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 11.5,
      "bodyDiameter": 4.5,
      "reference": "R",
      "value": "R_Axial DIN0411 (1.0W 1% P12.70mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0411",
      "12.7"
    ]
  },
  {
    "id": "res-tht-axial-0204-c",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0204 Carbon (1/8W 5% P5.08mm)",
    "nameAr": "مقاومة ثقبية Axial 0204 Carbon (1/8W 5% P5.08mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0204 Carbon (1/8W 5% P5.08mm) (Pitch 5.08mm, Body 3.6x1.6mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0204 Carbon (1/8W 5% P5.08mm) (تباعد 5.08مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0204-c",
      "pitch": 5.08,
      "drill": 0.7,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 3.6,
      "bodyDiameter": 1.6,
      "reference": "R",
      "value": "R_Axial 0204 Carbon (1/8W 5% P5.08mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0204-c",
      "5.08"
    ]
  },
  {
    "id": "res-tht-axial-0207-c",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0207 Carbon (1/4W 5% P7.62mm)",
    "nameAr": "مقاومة ثقبية Axial 0207 Carbon (1/4W 5% P7.62mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.62mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0207 Carbon (1/4W 5% P7.62mm) (Pitch 7.62mm, Body 6.3x2.4mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0207 Carbon (1/4W 5% P7.62mm) (تباعد 7.62مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0207-c",
      "pitch": 7.62,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 6.3,
      "bodyDiameter": 2.4,
      "reference": "R",
      "value": "R_Axial 0207 Carbon (1/4W 5% P7.62mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0207-c",
      "7.62"
    ]
  },
  {
    "id": "res-tht-axial-0309-c",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0309 Carbon (1/2W 5% P10.16mm)",
    "nameAr": "مقاومة ثقبية Axial 0309 Carbon (1/2W 5% P10.16mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10.16mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0309 Carbon (1/2W 5% P10.16mm) (Pitch 10.16mm, Body 9x3.2mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0309 Carbon (1/2W 5% P10.16mm) (تباعد 10.16مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0309-c",
      "pitch": 10.16,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 9,
      "bodyDiameter": 3.2,
      "reference": "R",
      "value": "R_Axial 0309 Carbon (1/2W 5% P10.16mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0309-c",
      "10.16"
    ]
  },
  {
    "id": "res-tht-axial-0414",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0414 Power (2.0W P15.24mm)",
    "nameAr": "مقاومة ثقبية Axial 0414 Power (2.0W P15.24mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "15.24mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0414 Power (2.0W P15.24mm) (Pitch 15.24mm, Body 14x5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0414 Power (2.0W P15.24mm) (تباعد 15.24مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0414",
      "pitch": 15.24,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 14,
      "bodyDiameter": 5,
      "reference": "R",
      "value": "R_Axial 0414 Power (2.0W P15.24mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0414",
      "15.24"
    ]
  },
  {
    "id": "res-tht-axial-0617",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0617 Power (3.0W P17.78mm)",
    "nameAr": "مقاومة ثقبية Axial 0617 Power (3.0W P17.78mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "17.78mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0617 Power (3.0W P17.78mm) (Pitch 17.78mm, Body 17x6mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0617 Power (3.0W P17.78mm) (تباعد 17.78مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0617",
      "pitch": 17.78,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 17,
      "bodyDiameter": 6,
      "reference": "R",
      "value": "R_Axial 0617 Power (3.0W P17.78mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0617",
      "17.78"
    ]
  },
  {
    "id": "res-tht-cement-5w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Cement 5W Ceramic (P25.40mm)",
    "nameAr": "مقاومة ثقبية Cement 5W Ceramic (P25.40mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "25.4mm Pitch",
    "description": "Through-Hole Axial Resistor Cement 5W Ceramic (P25.40mm) (Pitch 25.4mm, Body 22x9.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Cement 5W Ceramic (P25.40mm) (تباعد 25.4مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "cement-5w",
      "pitch": 25.4,
      "drill": 1.2,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 22,
      "bodyDiameter": 9.5,
      "reference": "R",
      "value": "R_Cement 5W Ceramic (P25.40mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "cement-5w",
      "25.4"
    ]
  },
  {
    "id": "res-tht-cement-10w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Cement 10W Ceramic (P35.56mm)",
    "nameAr": "مقاومة ثقبية Cement 10W Ceramic (P35.56mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "35.56mm Pitch",
    "description": "Through-Hole Axial Resistor Cement 10W Ceramic (P35.56mm) (Pitch 35.56mm, Body 32x10mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Cement 10W Ceramic (P35.56mm) (تباعد 35.56مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "cement-10w",
      "pitch": 35.56,
      "drill": 1.3,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 32,
      "bodyDiameter": 10,
      "reference": "R",
      "value": "R_Cement 10W Ceramic (P35.56mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "cement-10w",
      "35.56"
    ]
  },
  {
    "id": "res-tht-shunt-5w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Shunt Sense 5W (0.01Ω - 0.1Ω P25.40mm)",
    "nameAr": "مقاومة ثقبية Shunt Sense 5W (0.01Ω - 0.1Ω P25.40mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "25.4mm Pitch",
    "description": "Through-Hole Axial Resistor Shunt Sense 5W (0.01Ω - 0.1Ω P25.40mm) (Pitch 25.4mm, Body 22x9.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Shunt Sense 5W (0.01Ω - 0.1Ω P25.40mm) (تباعد 25.4مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "shunt-5w",
      "pitch": 25.4,
      "drill": 1.2,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 22,
      "bodyDiameter": 9.5,
      "reference": "R",
      "value": "R_Shunt Sense 5W (0.01Ω - 0.1Ω P25.40mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "shunt-5w",
      "25.4"
    ]
  },
  {
    "id": "res-tht-shunt-10w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Shunt Sense 10W (0.005Ω - 0.05Ω P35.56mm)",
    "nameAr": "مقاومة ثقبية Shunt Sense 10W (0.005Ω - 0.05Ω P35.56mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "35.56mm Pitch",
    "description": "Through-Hole Axial Resistor Shunt Sense 10W (0.005Ω - 0.05Ω P35.56mm) (Pitch 35.56mm, Body 32x10mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Shunt Sense 10W (0.005Ω - 0.05Ω P35.56mm) (تباعد 35.56مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "shunt-10w",
      "pitch": 35.56,
      "drill": 1.3,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 32,
      "bodyDiameter": 10,
      "reference": "R",
      "value": "R_Shunt Sense 10W (0.005Ω - 0.05Ω P35.56mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "shunt-10w",
      "35.56"
    ]
  },
  {
    "id": "res-tht-axial-0414-shunt",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0414 Low-Ohm Sense (2.0W P15.24mm)",
    "nameAr": "مقاومة ثقبية Axial 0414 Low-Ohm Sense (2.0W P15.24mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "15.24mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0414 Low-Ohm Sense (2.0W P15.24mm) (Pitch 15.24mm, Body 14x5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0414 Low-Ohm Sense (2.0W P15.24mm) (تباعد 15.24مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0414-shunt",
      "pitch": 15.24,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 14,
      "bodyDiameter": 5,
      "reference": "R",
      "value": "R_Axial 0414 Low-Ohm Sense (2.0W P15.24mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0414-shunt",
      "15.24"
    ]
  },
  {
    "id": "res-tht-pot-3296w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Bourns 3296W Trimmer (3-pin Inline P2.54mm)",
    "nameAr": "مقاومة ثقبية Bourns 3296W Trimmer (3-pin Inline P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor Bourns 3296W Trimmer (3-pin Inline P2.54mm) (Pitch 2.54mm, Body 9.5x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Bourns 3296W Trimmer (3-pin Inline P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "pot-3296w",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 9.5,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_Bourns 3296W Trimmer (3-pin Inline P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "pot-3296w",
      "2.54"
    ]
  },
  {
    "id": "res-tht-pot-3362p",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Bourns 3362P Trimmer (3-pin Triangle P2.54mm)",
    "nameAr": "مقاومة ثقبية Bourns 3362P Trimmer (3-pin Triangle P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor Bourns 3362P Trimmer (3-pin Triangle P2.54mm) (Pitch 2.54mm, Body 6.8x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Bourns 3362P Trimmer (3-pin Triangle P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "pot-3362p",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 6.8,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_Bourns 3362P Trimmer (3-pin Triangle P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "pot-3362p",
      "2.54"
    ]
  },
  {
    "id": "res-tht-pot-rk09",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Alps RK09 Rotary Pot (3-pin P5.0mm)",
    "nameAr": "مقاومة ثقبية Alps RK09 Rotary Pot (3-pin P5.0mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5mm Pitch",
    "description": "Through-Hole Axial Resistor Alps RK09 Rotary Pot (3-pin P5.0mm) (Pitch 5mm, Body 9.8x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Alps RK09 Rotary Pot (3-pin P5.0mm) (تباعد 5مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "pot-rk09",
      "pitch": 5,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 9.8,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_Alps RK09 Rotary Pot (3-pin P5.0mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "pot-rk09",
      "5"
    ]
  },
  {
    "id": "res-tht-sip-4",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_SIP-4 Resistor Network (4-pin P2.54mm)",
    "nameAr": "مقاومة ثقبية SIP-4 Resistor Network (4-pin P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor SIP-4 Resistor Network (4-pin P2.54mm) (Pitch 2.54mm, Body 10.16x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس SIP-4 Resistor Network (4-pin P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "sip-4",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 10.16,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_SIP-4 Resistor Network (4-pin P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "sip-4",
      "2.54"
    ]
  },
  {
    "id": "res-tht-sip-6",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_SIP-6 Resistor Network (6-pin P2.54mm)",
    "nameAr": "مقاومة ثقبية SIP-6 Resistor Network (6-pin P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor SIP-6 Resistor Network (6-pin P2.54mm) (Pitch 2.54mm, Body 15.24x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس SIP-6 Resistor Network (6-pin P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "sip-6",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 15.24,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_SIP-6 Resistor Network (6-pin P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "sip-6",
      "2.54"
    ]
  },
  {
    "id": "res-tht-sip-8",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_SIP-8 Resistor Network (8-pin P2.54mm)",
    "nameAr": "مقاومة ثقبية SIP-8 Resistor Network (8-pin P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor SIP-8 Resistor Network (8-pin P2.54mm) (Pitch 2.54mm, Body 20.32x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس SIP-8 Resistor Network (8-pin P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "sip-8",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 20.32,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_SIP-8 Resistor Network (8-pin P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "sip-8",
      "2.54"
    ]
  },
  {
    "id": "res-tht-sip-10",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_SIP-10 Resistor Network (10-pin P2.54mm)",
    "nameAr": "مقاومة ثقبية SIP-10 Resistor Network (10-pin P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor SIP-10 Resistor Network (10-pin P2.54mm) (Pitch 2.54mm, Body 25.4x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس SIP-10 Resistor Network (10-pin P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "sip-10",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 25.4,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_SIP-10 Resistor Network (10-pin P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "sip-10",
      "2.54"
    ]
  },
  {
    "id": "res-tht-axial-0204-prec",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0204 Ultra-Prec 0.1% P5.08mm",
    "nameAr": "مقاومة ثقبية Axial 0204 Ultra-Prec 0.1% P5.08mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0204 Ultra-Prec 0.1% P5.08mm (Pitch 5.08mm, Body 3.6x1.6mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0204 Ultra-Prec 0.1% P5.08mm (تباعد 5.08مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0204-prec",
      "pitch": 5.08,
      "drill": 0.7,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 3.6,
      "bodyDiameter": 1.6,
      "reference": "R",
      "value": "R_Axial 0204 Ultra-Prec 0.1% P5.08mm"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0204-prec",
      "5.08"
    ]
  },
  {
    "id": "res-tht-axial-0207-vert",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0207 Vertical High Density P5.08mm",
    "nameAr": "مقاومة ثقبية Axial 0207 Vertical High Density P5.08mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0207 Vertical High Density P5.08mm (Pitch 5.08mm, Body 6.3x2.4mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0207 Vertical High Density P5.08mm (تباعد 5.08مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0207-vert",
      "pitch": 5.08,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 6.3,
      "bodyDiameter": 2.4,
      "reference": "R",
      "value": "R_Axial 0207 Vertical High Density P5.08mm"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0207-vert",
      "5.08"
    ]
  },
  {
    "id": "res-tht-axial-0207-vert-c",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Axial 0207 Vertical Carbon 5% P5.08mm",
    "nameAr": "مقاومة ثقبية Axial 0207 Vertical Carbon 5% P5.08mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Axial Resistor Axial 0207 Vertical Carbon 5% P5.08mm (Pitch 5.08mm, Body 6.3x2.4mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Axial 0207 Vertical Carbon 5% P5.08mm (تباعد 5.08مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-0207-vert-c",
      "pitch": 5.08,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 6.3,
      "bodyDiameter": 2.4,
      "reference": "R",
      "value": "R_Axial 0207 Vertical Carbon 5% P5.08mm"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-0207-vert-c",
      "5.08"
    ]
  },
  {
    "id": "res-tht-axial-high-voltage",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_High Voltage Resistor 10kV P22.86mm",
    "nameAr": "مقاومة ثقبية High Voltage Resistor 10kV P22.86mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.86mm Pitch",
    "description": "Through-Hole Axial Resistor High Voltage Resistor 10kV P22.86mm (Pitch 22.86mm, Body 19x6mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس High Voltage Resistor 10kV P22.86mm (تباعد 22.86مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-high-voltage",
      "pitch": 22.86,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 19,
      "bodyDiameter": 6,
      "reference": "R",
      "value": "R_High Voltage Resistor 10kV P22.86mm"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-high-voltage",
      "22.86"
    ]
  },
  {
    "id": "res-tht-axial-wirewound-7w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Wirewound 7W High Power P30.48mm",
    "nameAr": "مقاومة ثقبية Wirewound 7W High Power P30.48mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "30.48mm Pitch",
    "description": "Through-Hole Axial Resistor Wirewound 7W High Power P30.48mm (Pitch 30.48mm, Body 26x8.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Wirewound 7W High Power P30.48mm (تباعد 30.48مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "axial-wirewound-7w",
      "pitch": 30.48,
      "drill": 1.2,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 26,
      "bodyDiameter": 8.5,
      "reference": "R",
      "value": "R_Wirewound 7W High Power P30.48mm"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "axial-wirewound-7w",
      "30.48"
    ]
  },
  {
    "id": "res-tht-shunt-wirewound-7w",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Wirewound Low-Ohm Shunt 7W P30.48mm",
    "nameAr": "مقاومة ثقبية Wirewound Low-Ohm Shunt 7W P30.48mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "30.48mm Pitch",
    "description": "Through-Hole Axial Resistor Wirewound Low-Ohm Shunt 7W P30.48mm (Pitch 30.48mm, Body 26x8.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Wirewound Low-Ohm Shunt 7W P30.48mm (تباعد 30.48مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "shunt-wirewound-7w",
      "pitch": 30.48,
      "drill": 1.2,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 26,
      "bodyDiameter": 8.5,
      "reference": "R",
      "value": "R_Wirewound Low-Ohm Shunt 7W P30.48mm"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "shunt-wirewound-7w",
      "30.48"
    ]
  },
  {
    "id": "res-tht-pot-3386p",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_Bourns 3386P Cermet Trimmer (3-pin P2.54mm)",
    "nameAr": "مقاومة ثقبية Bourns 3386P Cermet Trimmer (3-pin P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor Bourns 3386P Cermet Trimmer (3-pin P2.54mm) (Pitch 2.54mm, Body 9.5x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس Bourns 3386P Cermet Trimmer (3-pin P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "pot-3386p",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 9.5,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_Bourns 3386P Cermet Trimmer (3-pin P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "pot-3386p",
      "2.54"
    ]
  },
  {
    "id": "res-tht-pot-wh148",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_WH148 16mm Rotary Potentiometer (P5.08mm)",
    "nameAr": "مقاومة ثقبية WH148 16mm Rotary Potentiometer (P5.08mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Axial Resistor WH148 16mm Rotary Potentiometer (P5.08mm) (Pitch 5.08mm, Body 16x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس WH148 16mm Rotary Potentiometer (P5.08mm) (تباعد 5.08مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "pot-wh148",
      "pitch": 5.08,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 16,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_WH148 16mm Rotary Potentiometer (P5.08mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "pot-wh148",
      "5.08"
    ]
  },
  {
    "id": "res-tht-sip-9",
    "familyId": "passive",
    "presetId": "resistor-tht",
    "name": "R_SIP-9 Resistor Network (9-pin P2.54mm)",
    "nameAr": "مقاومة ثقبية SIP-9 Resistor Network (9-pin P2.54mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Axial Resistor SIP-9 Resistor Network (9-pin P2.54mm) (Pitch 2.54mm, Body 22.86x2.5mm)",
    "descriptionAr": "مقاومة محورية ثقبية THT قياس SIP-9 Resistor Network (9-pin P2.54mm) (تباعد 2.54مم)",
    "params": {
      "categoryGroup": "resistor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Axial_THT",
      "packageSize": "sip-9",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyLength": 22.86,
      "bodyDiameter": 2.5,
      "reference": "R",
      "value": "R_SIP-9 Resistor Network (9-pin P2.54mm)"
    },
    "tags": [
      "resistor",
      "res",
      "tht",
      "axial",
      "sip-9",
      "2.54"
    ]
  },
  {
    "id": "cap-smd-01005",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_01005 MLCC (0402 Metric - 0.40 × 0.20 mm)",
    "nameAr": "مكثف سطحي C 01005 MLCC (0402 Metric - 0.40 × 0.20 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 01005 MLCC (0402 Metric - 0.40 × 0.20 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 01005 MLCC (0402 Metric - 0.40 × 0.20 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "01005",
      "packageSize": "01005",
      "padWidth": 0.2,
      "padHeight": 0.22,
      "polarized": false,
      "reference": "C",
      "value": "C_01005 MLCC (0402 Metric - 0.40 × 0.20 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "01005",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-0201",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_0201 MLCC (0603 Metric - 0.60 × 0.30 mm)",
    "nameAr": "مكثف سطحي C 0201 MLCC (0603 Metric - 0.60 × 0.30 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 0201 MLCC (0603 Metric - 0.60 × 0.30 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 0201 MLCC (0603 Metric - 0.60 × 0.30 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0201",
      "packageSize": "0201",
      "padWidth": 0.35,
      "padHeight": 0.35,
      "polarized": false,
      "reference": "C",
      "value": "C_0201 MLCC (0603 Metric - 0.60 × 0.30 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "0201",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-0402",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_0402 MLCC (1005 Metric - 1.00 × 0.50 mm)",
    "nameAr": "مكثف سطحي C 0402 MLCC (1005 Metric - 1.00 × 0.50 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 0402 MLCC (1005 Metric - 1.00 × 0.50 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 0402 MLCC (1005 Metric - 1.00 × 0.50 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0402",
      "packageSize": "0402",
      "padWidth": 0.55,
      "padHeight": 0.6,
      "polarized": false,
      "reference": "C",
      "value": "C_0402 MLCC (1005 Metric - 1.00 × 0.50 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "0402",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-0603",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_0603 MLCC (1608 Metric - 1.60 × 0.80 mm)",
    "nameAr": "مكثف سطحي C 0603 MLCC (1608 Metric - 1.60 × 0.80 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 0603 MLCC (1608 Metric - 1.60 × 0.80 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 0603 MLCC (1608 Metric - 1.60 × 0.80 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0603",
      "packageSize": "0603",
      "padWidth": 0.8,
      "padHeight": 0.9,
      "polarized": false,
      "reference": "C",
      "value": "C_0603 MLCC (1608 Metric - 1.60 × 0.80 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "0603",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-0805",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_0805 MLCC (2012 Metric - 2.00 × 1.25 mm)",
    "nameAr": "مكثف سطحي C 0805 MLCC (2012 Metric - 2.00 × 1.25 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 0805 MLCC (2012 Metric - 2.00 × 1.25 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 0805 MLCC (2012 Metric - 2.00 × 1.25 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "0805",
      "packageSize": "0805",
      "padWidth": 1,
      "padHeight": 1.3,
      "polarized": false,
      "reference": "C",
      "value": "C_0805 MLCC (2012 Metric - 2.00 × 1.25 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "0805",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-1206",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_1206 MLCC (3216 Metric - 3.20 × 1.60 mm)",
    "nameAr": "مكثف سطحي C 1206 MLCC (3216 Metric - 3.20 × 1.60 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 1206 MLCC (3216 Metric - 3.20 × 1.60 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 1206 MLCC (3216 Metric - 3.20 × 1.60 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1206",
      "packageSize": "1206",
      "padWidth": 1.1,
      "padHeight": 1.7,
      "polarized": false,
      "reference": "C",
      "value": "C_1206 MLCC (3216 Metric - 3.20 × 1.60 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "1206",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-1210",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_1210 MLCC (3225 Metric - 3.20 × 2.50 mm)",
    "nameAr": "مكثف سطحي C 1210 MLCC (3225 Metric - 3.20 × 2.50 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 1210 MLCC (3225 Metric - 3.20 × 2.50 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 1210 MLCC (3225 Metric - 3.20 × 2.50 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1210",
      "packageSize": "1210",
      "padWidth": 1.1,
      "padHeight": 2.6,
      "polarized": false,
      "reference": "C",
      "value": "C_1210 MLCC (3225 Metric - 3.20 × 2.50 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "1210",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-1806",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_1806 MLCC (4516 Metric - 4.50 × 1.60 mm)",
    "nameAr": "مكثف سطحي C 1806 MLCC (4516 Metric - 4.50 × 1.60 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 1806 MLCC (4516 Metric - 4.50 × 1.60 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 1806 MLCC (4516 Metric - 4.50 × 1.60 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1806",
      "packageSize": "1806",
      "padWidth": 1.2,
      "padHeight": 1.8,
      "polarized": false,
      "reference": "C",
      "value": "C_1806 MLCC (4516 Metric - 4.50 × 1.60 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "1806",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-1812",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_1812 MLCC (4532 Metric - 4.50 × 3.20 mm)",
    "nameAr": "مكثف سطحي C 1812 MLCC (4532 Metric - 4.50 × 3.20 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 1812 MLCC (4532 Metric - 4.50 × 3.20 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 1812 MLCC (4532 Metric - 4.50 × 3.20 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "1812",
      "packageSize": "1812",
      "padWidth": 1.2,
      "padHeight": 3.4,
      "polarized": false,
      "reference": "C",
      "value": "C_1812 MLCC (4532 Metric - 4.50 × 3.20 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "1812",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-2220",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_2220 MLCC (5750 Metric - 5.70 × 5.00 mm)",
    "nameAr": "مكثف سطحي C 2220 MLCC (5750 Metric - 5.70 × 5.00 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor 2220 MLCC (5750 Metric - 5.70 × 5.00 mm) (Ceramic MLCC)",
    "descriptionAr": "مكثف سطحي قياسي 2220 MLCC (5750 Metric - 5.70 × 5.00 mm) (سيراميك)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "2220",
      "packageSize": "2220",
      "padWidth": 1.4,
      "padHeight": 5.3,
      "polarized": false,
      "reference": "C",
      "value": "C_2220 MLCC (5750 Metric - 5.70 × 5.00 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "2220",
      "non-polarized"
    ]
  },
  {
    "id": "cap-smd-EIA-3216-18",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_EIA-3216-18 (Case A - 3.2 × 1.6 mm)",
    "nameAr": "مكثف سطحي C EIA-3216-18 (Case A - 3.2 × 1.6 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor EIA-3216-18 (Case A - 3.2 × 1.6 mm) (Polarized Tantalum)",
    "descriptionAr": "مكثف سطحي قياسي EIA-3216-18 (Case A - 3.2 × 1.6 mm) (تنتالوم قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "EIA-3216-18",
      "packageSize": "EIA-3216-18",
      "padWidth": 1.4,
      "padHeight": 1.2,
      "polarized": true,
      "reference": "C",
      "value": "C_EIA-3216-18 (Case A - 3.2 × 1.6 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "EIA-3216-18",
      "polarized"
    ]
  },
  {
    "id": "cap-smd-EIA-3528-21",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_EIA-3528-21 (Case B - 3.5 × 2.8 mm)",
    "nameAr": "مكثف سطحي C EIA-3528-21 (Case B - 3.5 × 2.8 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor EIA-3528-21 (Case B - 3.5 × 2.8 mm) (Polarized Tantalum)",
    "descriptionAr": "مكثف سطحي قياسي EIA-3528-21 (Case B - 3.5 × 2.8 mm) (تنتالوم قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "EIA-3528-21",
      "packageSize": "EIA-3528-21",
      "padWidth": 1.4,
      "padHeight": 2.2,
      "polarized": true,
      "reference": "C",
      "value": "C_EIA-3528-21 (Case B - 3.5 × 2.8 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "EIA-3528-21",
      "polarized"
    ]
  },
  {
    "id": "cap-smd-EIA-6032-28",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_EIA-6032-28 (Case C - 6.0 × 3.2 mm)",
    "nameAr": "مكثف سطحي C EIA-6032-28 (Case C - 6.0 × 3.2 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor EIA-6032-28 (Case C - 6.0 × 3.2 mm) (Polarized Tantalum)",
    "descriptionAr": "مكثف سطحي قياسي EIA-6032-28 (Case C - 6.0 × 3.2 mm) (تنتالوم قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "EIA-6032-28",
      "packageSize": "EIA-6032-28",
      "padWidth": 2,
      "padHeight": 2.2,
      "polarized": true,
      "reference": "C",
      "value": "C_EIA-6032-28 (Case C - 6.0 × 3.2 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "EIA-6032-28",
      "polarized"
    ]
  },
  {
    "id": "cap-smd-EIA-7343-31",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_EIA-7343-31 (Case D - 7.3 × 4.3 mm)",
    "nameAr": "مكثف سطحي C EIA-7343-31 (Case D - 7.3 × 4.3 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor EIA-7343-31 (Case D - 7.3 × 4.3 mm) (Polarized Tantalum)",
    "descriptionAr": "مكثف سطحي قياسي EIA-7343-31 (Case D - 7.3 × 4.3 mm) (تنتالوم قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "EIA-7343-31",
      "packageSize": "EIA-7343-31",
      "padWidth": 2.4,
      "padHeight": 2.4,
      "polarized": true,
      "reference": "C",
      "value": "C_EIA-7343-31 (Case D - 7.3 × 4.3 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "EIA-7343-31",
      "polarized"
    ]
  },
  {
    "id": "cap-smd-EIA-7343-43",
    "familyId": "passive",
    "presetId": "capacitor-smd",
    "name": "C_EIA-7343-43 (Case E - 7.3 × 4.3 mm)",
    "nameAr": "مكثف سطحي C EIA-7343-43 (Case E - 7.3 × 4.3 mm)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "NaNmm Span",
    "description": "SMD Capacitor EIA-7343-43 (Case E - 7.3 × 4.3 mm) (Polarized Tantalum)",
    "descriptionAr": "مكثف سطحي قياسي EIA-7343-43 (Case E - 7.3 × 4.3 mm) (تنتالوم قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "SMD",
      "mounting": "SMD",
      "chipSize": "EIA-7343-43",
      "packageSize": "EIA-7343-43",
      "padWidth": 2.4,
      "padHeight": 2.4,
      "polarized": true,
      "reference": "C",
      "value": "C_EIA-7343-43 (Case E - 7.3 × 4.3 mm)"
    },
    "tags": [
      "capacitor",
      "cap",
      "smd",
      "mlcc",
      "EIA-7343-43",
      "polarized"
    ]
  },
  {
    "id": "cap-tht-disc-d4-p2.54",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Disc D4.0 P2.54mm",
    "nameAr": "مكثف ثقبي Disc D4.0 P2.54mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Capacitor Disc D4.0 P2.54mm (Pitch 2.54mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Disc D4.0 P2.54mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "disc-d4-p2.54",
      "pitch": 2.54,
      "drill": 0.7,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 4,
      "bodyLength": 7.2,
      "bodyWidth": 2,
      "polarized": false,
      "reference": "C",
      "value": "C_Disc D4.0 P2.54mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "disc-d4-p2.54",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-disc-d5-p2.54",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Disc D5.0 P2.54mm",
    "nameAr": "مكثف ثقبي Disc D5.0 P2.54mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Capacitor Disc D5.0 P2.54mm (Pitch 2.54mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Disc D5.0 P2.54mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "disc-d5-p2.54",
      "pitch": 2.54,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 5,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": false,
      "reference": "C",
      "value": "C_Disc D5.0 P2.54mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "disc-d5-p2.54",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-disc-d5-p5.08",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Disc D5.0 P5.08mm",
    "nameAr": "مكثف ثقبي Disc D5.0 P5.08mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Capacitor Disc D5.0 P5.08mm (Pitch 5.08mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Disc D5.0 P5.08mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "disc-d5-p5.08",
      "pitch": 5.08,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 5,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": false,
      "reference": "C",
      "value": "C_Disc D5.0 P5.08mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "disc-d5-p5.08",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-disc-d8-p5.08",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Disc D8.0 P5.08mm",
    "nameAr": "مكثف ثقبي Disc D8.0 P5.08mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Capacitor Disc D8.0 P5.08mm (Pitch 5.08mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Disc D8.0 P5.08mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "disc-d8-p5.08",
      "pitch": 5.08,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 7.2,
      "bodyWidth": 3,
      "polarized": false,
      "reference": "C",
      "value": "C_Disc D8.0 P5.08mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "disc-d8-p5.08",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-film-l7.2-p5.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Box Film L7.2 W2.5 P5.0mm (WIMA)",
    "nameAr": "مكثف ثقبي Box Film L7.2 W2.5 P5.0mm (WIMA)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5mm Pitch",
    "description": "Through-Hole Capacitor Box Film L7.2 W2.5 P5.0mm (WIMA) (Pitch 5mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Box Film L7.2 W2.5 P5.0mm (WIMA) (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "film-l7.2-p5.0",
      "pitch": 5,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": false,
      "reference": "C",
      "value": "C_Box Film L7.2 W2.5 P5.0mm (WIMA)"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "film-l7.2-p5.0",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-film-l10-p7.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Box Film L10 W4.0 P7.5mm",
    "nameAr": "مكثف ثقبي Box Film L10 W4.0 P7.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.5mm Pitch",
    "description": "Through-Hole Capacitor Box Film L10 W4.0 P7.5mm (Pitch 7.5mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Box Film L10 W4.0 P7.5mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "film-l10-p7.5",
      "pitch": 7.5,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 10,
      "bodyWidth": 4,
      "polarized": false,
      "reference": "C",
      "value": "C_Box Film L10 W4.0 P7.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "film-l10-p7.5",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-film-l18-p15.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Box Film L18 W5.0 P15.0mm",
    "nameAr": "مكثف ثقبي Box Film L18 W5.0 P15.0mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "15mm Pitch",
    "description": "Through-Hole Capacitor Box Film L18 W5.0 P15.0mm (Pitch 15mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Box Film L18 W5.0 P15.0mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "film-l18-p15.0",
      "pitch": 15,
      "drill": 0.9,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 18,
      "bodyWidth": 5,
      "polarized": false,
      "reference": "C",
      "value": "C_Box Film L18 W5.0 P15.0mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "film-l18-p15.0",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-film-l26-p22.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Box Film L26 W7.0 P22.5mm",
    "nameAr": "مكثف ثقبي Box Film L26 W7.0 P22.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Capacitor Box Film L26 W7.0 P22.5mm (Pitch 22.5mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Box Film L26 W7.0 P22.5mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "film-l26-p22.5",
      "pitch": 22.5,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 26,
      "bodyWidth": 7,
      "polarized": false,
      "reference": "C",
      "value": "C_Box Film L26 W7.0 P22.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "film-l26-p22.5",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-radial-d5-p2.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D5.0 P2.0mm",
    "nameAr": "مكثف ثقبي Radial D5.0 P2.0mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2mm Pitch",
    "description": "Through-Hole Capacitor Radial D5.0 P2.0mm (Pitch 2mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D5.0 P2.0mm (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d5-p2.0",
      "pitch": 2,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 5,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D5.0 P2.0mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d5-p2.0",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-radial-d6.3-p2.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D6.3 P2.5mm",
    "nameAr": "مكثف ثقبي Radial D6.3 P2.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.5mm Pitch",
    "description": "Through-Hole Capacitor Radial D6.3 P2.5mm (Pitch 2.5mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D6.3 P2.5mm (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d6.3-p2.5",
      "pitch": 2.5,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 6.3,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D6.3 P2.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d6.3-p2.5",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-radial-d8-p3.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D8.0 P3.5mm",
    "nameAr": "مكثف ثقبي Radial D8.0 P3.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "3.5mm Pitch",
    "description": "Through-Hole Capacitor Radial D8.0 P3.5mm (Pitch 3.5mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D8.0 P3.5mm (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d8-p3.5",
      "pitch": 3.5,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D8.0 P3.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d8-p3.5",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-radial-d10-p5.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D10.0 P5.0mm",
    "nameAr": "مكثف ثقبي Radial D10.0 P5.0mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5mm Pitch",
    "description": "Through-Hole Capacitor Radial D10.0 P5.0mm (Pitch 5mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D10.0 P5.0mm (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d10-p5.0",
      "pitch": 5,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 10,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D10.0 P5.0mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d10-p5.0",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-radial-d12.5-p5.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D12.5 P5.0mm",
    "nameAr": "مكثف ثقبي Radial D12.5 P5.0mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5mm Pitch",
    "description": "Through-Hole Capacitor Radial D12.5 P5.0mm (Pitch 5mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D12.5 P5.0mm (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d12.5-p5.0",
      "pitch": 5,
      "drill": 0.9,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 12.5,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D12.5 P5.0mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d12.5-p5.0",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-radial-d16-p7.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D16.0 P7.5mm",
    "nameAr": "مكثف ثقبي Radial D16.0 P7.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.5mm Pitch",
    "description": "Through-Hole Capacitor Radial D16.0 P7.5mm (Pitch 7.5mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D16.0 P7.5mm (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d16-p7.5",
      "pitch": 7.5,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 16,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D16.0 P7.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d16-p7.5",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-safety-x2-p15.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Safety X2 275V P15.0mm",
    "nameAr": "مكثف ثقبي Safety X2 275V P15.0mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "15mm Pitch",
    "description": "Through-Hole Capacitor Safety X2 275V P15.0mm (Pitch 15mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Safety X2 275V P15.0mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "safety-x2-p15.0",
      "pitch": 15,
      "drill": 0.9,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 18,
      "bodyWidth": 6,
      "polarized": false,
      "reference": "C",
      "value": "C_Safety X2 275V P15.0mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "safety-x2-p15.0",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-safety-x2-p22.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Safety X2 275V P22.5mm",
    "nameAr": "مكثف ثقبي Safety X2 275V P22.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Capacitor Safety X2 275V P22.5mm (Pitch 22.5mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Safety X2 275V P22.5mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "safety-x2-p22.5",
      "pitch": 22.5,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 8,
      "bodyLength": 26.5,
      "bodyWidth": 8.5,
      "polarized": false,
      "reference": "C",
      "value": "C_Safety X2 275V P22.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "safety-x2-p22.5",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-disc-d10-p7.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Disc D10.0 P7.5mm",
    "nameAr": "مكثف ثقبي Disc D10.0 P7.5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.5mm Pitch",
    "description": "Through-Hole Capacitor Disc D10.0 P7.5mm (Pitch 7.5mm, Disc/Film)",
    "descriptionAr": "مكثف ثقبي THT قياس Disc D10.0 P7.5mm (قرصي/بلاستيكي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Disc_THT",
      "packageSize": "disc-d10-p7.5",
      "pitch": 7.5,
      "drill": 0.8,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 10,
      "bodyLength": 7.2,
      "bodyWidth": 3.5,
      "polarized": false,
      "reference": "C",
      "value": "C_Disc D10.0 P7.5mm"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "disc-d10-p7.5",
      "ceramic"
    ]
  },
  {
    "id": "cap-tht-radial-d18-p7.5",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D18.0 P7.5mm (High Power)",
    "nameAr": "مكثف ثقبي Radial D18.0 P7.5mm (High Power)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.5mm Pitch",
    "description": "Through-Hole Capacitor Radial D18.0 P7.5mm (High Power) (Pitch 7.5mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D18.0 P7.5mm (High Power) (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d18-p7.5",
      "pitch": 7.5,
      "drill": 1,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 18,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D18.0 P7.5mm (High Power)"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d18-p7.5",
      "electrolytic"
    ]
  },
  {
    "id": "cap-tht-radial-d22-p10.0",
    "familyId": "passive",
    "presetId": "capacitor-tht",
    "name": "C_Radial D22.0 P10.0mm (Snap-in)",
    "nameAr": "مكثف ثقبي Radial D22.0 P10.0mm (Snap-in)",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10mm Pitch",
    "description": "Through-Hole Capacitor Radial D22.0 P10.0mm (Snap-in) (Pitch 10mm, Radial Electrolytic)",
    "descriptionAr": "مكثف ثقبي THT قياس Radial D22.0 P10.0mm (Snap-in) (إلكتروليتي قطبي)",
    "params": {
      "categoryGroup": "capacitor",
      "packageType": "THT",
      "mounting": "THT",
      "subtype": "Radial_THT",
      "packageSize": "radial-d22-p10.0",
      "pitch": 10,
      "drill": 1.2,
      "padWidth": 1.6,
      "padHeight": 1.6,
      "bodyDiameter": 22,
      "bodyLength": 7.2,
      "bodyWidth": 2.5,
      "polarized": true,
      "reference": "C",
      "value": "C_Radial D22.0 P10.0mm (Snap-in)"
    },
    "tags": [
      "capacitor",
      "cap",
      "tht",
      "radial-d22-p10.0",
      "electrolytic"
    ]
  },
  {
    "id": "ind-smd-0402",
    "familyId": "inductor",
    "presetId": "0402",
    "name": "L_0402",
    "nameAr": "محث سطحي L 0402",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "1.0mm Span",
    "description": "SMD Power Inductor 0402 (1.0x0.5mm)",
    "descriptionAr": "محث قدرة سطحي قياسي 0402 (1.0x0.5mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "0402",
      "pitch": 1.0,
      "bodyLength": 0.5,
      "bodyWidth": 1.0,
      "padWidth": 0.5,
      "padHeight": 0.6,
      "reference": "L",
      "value": "L_0402"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "0402"
    ]
  },
  {
    "id": "ind-smd-0603",
    "familyId": "inductor",
    "presetId": "0603",
    "name": "L_0603",
    "nameAr": "محث سطحي L 0603",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "1.6mm Span",
    "description": "SMD Power Inductor 0603 (1.6x0.8mm)",
    "descriptionAr": "محث قدرة سطحي قياسي 0603 (1.6x0.8mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "0603",
      "pitch": 1.6,
      "bodyLength": 0.8,
      "bodyWidth": 1.6,
      "padWidth": 0.8,
      "padHeight": 0.9,
      "reference": "L",
      "value": "L_0603"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "0603"
    ]
  },
  {
    "id": "ind-smd-0805",
    "familyId": "inductor",
    "presetId": "0805",
    "name": "L_0805",
    "nameAr": "محث سطحي L 0805",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "2.0mm Span",
    "description": "SMD Power Inductor 0805 (2.0x1.2mm)",
    "descriptionAr": "محث قدرة سطحي قياسي 0805 (2.0x1.2mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "0805",
      "pitch": 2.0,
      "bodyLength": 1.25,
      "bodyWidth": 2.0,
      "padWidth": 1.0,
      "padHeight": 1.3,
      "reference": "L",
      "value": "L_0805"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "0805"
    ]
  },
  {
    "id": "ind-smd-1206",
    "familyId": "inductor",
    "presetId": "1206",
    "name": "L_1206",
    "nameAr": "محث سطحي L 1206",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "3.2mm Span",
    "description": "SMD Power Inductor 1206 (3.2x1.6mm)",
    "descriptionAr": "محث قدرة سطحي قياسي 1206 (3.2x1.6mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "1206",
      "pitch": 3.2,
      "bodyLength": 1.6,
      "bodyWidth": 3.2,
      "padWidth": 1.2,
      "padHeight": 1.7,
      "reference": "L",
      "value": "L_1206"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "1206"
    ]
  },
  {
    "id": "ind-smd-CDRH104",
    "familyId": "inductor",
    "presetId": "CDRH104",
    "name": "L_CDRH104",
    "nameAr": "محث سطحي L CDRH104",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "7.6mm Span",
    "description": "SMD Power Inductor CDRH104 (10x10mm)",
    "descriptionAr": "محث قدرة سطحي قياسي CDRH104 (10x10mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "CDRH104",
      "pitch": 7.6,
      "bodyLength": 10.0,
      "bodyWidth": 10.0,
      "padWidth": 3.0,
      "padHeight": 6.8,
      "reference": "L",
      "value": "L_CDRH104"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "CDRH104"
    ]
  },
  {
    "id": "ind-smd-CDRH127",
    "familyId": "inductor",
    "presetId": "CDRH127",
    "name": "L_CDRH127",
    "nameAr": "محث سطحي L CDRH127",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "9.2mm Span",
    "description": "SMD Power Inductor CDRH127 (12x12mm)",
    "descriptionAr": "محث قدرة سطحي قياسي CDRH127 (12x12mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "CDRH127",
      "pitch": 9.2,
      "bodyLength": 12.0,
      "bodyWidth": 12.0,
      "padWidth": 3.5,
      "padHeight": 8.0,
      "reference": "L",
      "value": "L_CDRH127"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "CDRH127"
    ]
  },
  {
    "id": "ind-smd-NR3015",
    "familyId": "inductor",
    "presetId": "NR3015",
    "name": "L_NR3015",
    "nameAr": "محث سطحي L NR3015",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "2.2mm Span",
    "description": "SMD Power Inductor NR3015 (3x3mm)",
    "descriptionAr": "محث قدرة سطحي قياسي NR3015 (3x3mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "NR3015",
      "pitch": 2.2,
      "bodyLength": 3.0,
      "bodyWidth": 3.0,
      "padWidth": 1.1,
      "padHeight": 2.8,
      "reference": "L",
      "value": "L_NR3015"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "NR3015"
    ]
  },
  {
    "id": "ind-smd-NR6045",
    "familyId": "inductor",
    "presetId": "NR6045",
    "name": "L_NR6045",
    "nameAr": "محث سطحي L NR6045",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "4.6mm Span",
    "description": "SMD Power Inductor NR6045 (6x6mm)",
    "descriptionAr": "محث قدرة سطحي قياسي NR6045 (6x6mm)",
    "params": {
      "mounting": "SMD",
      "packageType": "NR6045",
      "pitch": 4.6,
      "bodyLength": 6.0,
      "bodyWidth": 6.0,
      "padWidth": 2.0,
      "padHeight": 5.5,
      "reference": "L",
      "value": "L_NR6045"
    },
    "tags": [
      "inductor",
      "choke",
      "smd",
      "power",
      "NR6045"
    ]
  },
  {
    "id": "ind-tht-axial-l5",
    "familyId": "inductor",
    "presetId": "axial-l5",
    "name": "L_Ax-L 5mm",
    "nameAr": "محث ثقبي Ax-L 5mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.62mm Pitch",
    "description": "Through-Hole Inductor / Choke Ax-L 5mm",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Ax-L 5mm",
    "params": {
      "mounting": "THT",
      "packageType": "axial-l5",
      "pitch": 7.62,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Ax-L 5mm"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "axial-l5"
    ]
  },
  {
    "id": "ind-tht-radial-d6",
    "familyId": "inductor",
    "presetId": "radial-d6",
    "name": "L_Rad-L D6",
    "nameAr": "محث ثقبي Rad-L D6",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "3mm Pitch",
    "description": "Through-Hole Inductor / Choke Rad-L D6",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Rad-L D6",
    "params": {
      "mounting": "THT",
      "packageType": "radial-d6",
      "pitch": 3,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Rad-L D6"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "radial-d6"
    ]
  },
  {
    "id": "ind-tht-toroid-d15",
    "familyId": "inductor",
    "presetId": "toroid-d15",
    "name": "L_Tor-L D15",
    "nameAr": "محث ثقبي Tor-L D15",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10mm Pitch",
    "description": "Through-Hole Inductor / Choke Tor-L D15",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Tor-L D15",
    "params": {
      "mounting": "THT",
      "packageType": "toroid-d15",
      "pitch": 10,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Tor-L D15"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "toroid-d15"
    ]
  },
  {
    "id": "ind-tht-axial-l7",
    "familyId": "inductor",
    "presetId": "axial-l7",
    "name": "L_Ax-L 7mm",
    "nameAr": "محث ثقبي Ax-L 7mm",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10.16mm Pitch",
    "description": "Through-Hole Inductor / Choke Ax-L 7mm",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Ax-L 7mm",
    "params": {
      "mounting": "THT",
      "packageType": "axial-l7",
      "pitch": 10.16,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Ax-L 7mm"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "axial-l7"
    ]
  },
  {
    "id": "ind-tht-radial-d8",
    "familyId": "inductor",
    "presetId": "radial-d8",
    "name": "L_Rad-L D8",
    "nameAr": "محث ثقبي Rad-L D8",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5mm Pitch",
    "description": "Through-Hole Inductor / Choke Rad-L D8",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Rad-L D8",
    "params": {
      "mounting": "THT",
      "packageType": "radial-d8",
      "pitch": 5,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Rad-L D8"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "radial-d8"
    ]
  },
  {
    "id": "ind-tht-radial-d10",
    "familyId": "inductor",
    "presetId": "radial-d10",
    "name": "L_Rad-L D10",
    "nameAr": "محث ثقبي Rad-L D10",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5mm Pitch",
    "description": "Through-Hole Inductor / Choke Rad-L D10",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Rad-L D10",
    "params": {
      "mounting": "THT",
      "packageType": "radial-d10",
      "pitch": 5,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Rad-L D10"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "radial-d10"
    ]
  },
  {
    "id": "ind-tht-toroid-d20",
    "familyId": "inductor",
    "presetId": "toroid-d20",
    "name": "L_Tor-L D20",
    "nameAr": "محث ثقبي Tor-L D20",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "12mm Pitch",
    "description": "Through-Hole Inductor / Choke Tor-L D20",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس Tor-L D20",
    "params": {
      "mounting": "THT",
      "packageType": "toroid-d20",
      "pitch": 12,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_Tor-L D20"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "toroid-d20"
    ]
  },
  {
    "id": "ind-tht-cmc-uu9.8",
    "familyId": "inductor",
    "presetId": "cmc-uu9.8",
    "name": "L_CMC UU9.8",
    "nameAr": "محث ثقبي CMC UU9.8",
    "category": "passive",
    "categoryName": "Passives (R/L/C)",
    "categoryNameAr": "المكونات الخاملة",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7mm Pitch",
    "description": "Through-Hole Inductor / Choke CMC UU9.8",
    "descriptionAr": "محث وملف خانق ثقبي THT قياس CMC UU9.8",
    "params": {
      "mounting": "THT",
      "packageType": "cmc-uu9.8",
      "pitch": 7,
      "drill": 0.8,
      "padWidth": 1.6,
      "reference": "L",
      "value": "L_CMC UU9.8"
    },
    "tags": [
      "inductor",
      "choke",
      "tht",
      "cmc-uu9.8"
    ]
  },
  {
    "id": "diode-smd-SOD-523",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SOD-523 (0603 Metric - 1.20 × 0.80 mm)",
    "nameAr": "دايود سطحي D SOD-523 (0603 Metric - 1.20 × 0.80 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Diode SOD-523 (0603 Metric - 1.20 × 0.80 mm) (undefinedxundefinedmm)",
    "descriptionAr": "دايود سطحي قياسي SOD-523 (0603 Metric - 1.20 × 0.80 mm) (undefined×undefinedمم)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SOD-523",
      "padWidth": 0.6,
      "padHeight": 0.4,
      "reference": "D",
      "value": "D_SOD-523 (0603 Metric - 1.20 × 0.80 mm)"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SOD-523"
    ]
  },
  {
    "id": "diode-smd-SOD-323",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SOD-323 (1005 Metric - 1.70 × 1.25 mm)",
    "nameAr": "دايود سطحي D SOD-323 (1005 Metric - 1.70 × 1.25 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Diode SOD-323 (1005 Metric - 1.70 × 1.25 mm) (undefinedxundefinedmm)",
    "descriptionAr": "دايود سطحي قياسي SOD-323 (1005 Metric - 1.70 × 1.25 mm) (undefined×undefinedمم)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SOD-323",
      "padWidth": 0.9,
      "padHeight": 0.6,
      "reference": "D",
      "value": "D_SOD-323 (1005 Metric - 1.70 × 1.25 mm)"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SOD-323"
    ]
  },
  {
    "id": "diode-smd-SOD-123",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SOD-123 (1608 Metric - 2.70 × 1.60 mm)",
    "nameAr": "دايود سطحي D SOD-123 (1608 Metric - 2.70 × 1.60 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Diode SOD-123 (1608 Metric - 2.70 × 1.60 mm) (undefinedxundefinedmm)",
    "descriptionAr": "دايود سطحي قياسي SOD-123 (1608 Metric - 2.70 × 1.60 mm) (undefined×undefinedمم)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SOD-123",
      "padWidth": 0.9,
      "padHeight": 1.2,
      "reference": "D",
      "value": "D_SOD-123 (1608 Metric - 2.70 × 1.60 mm)"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SOD-123"
    ]
  },
  {
    "id": "diode-smd-SOD-80",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SOD-80 / MiniMELF (3.50 × 1.50 mm)",
    "nameAr": "دايود سطحي D SOD-80 / MiniMELF (3.50 × 1.50 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Diode SOD-80 / MiniMELF (3.50 × 1.50 mm) (undefinedxundefinedmm)",
    "descriptionAr": "دايود سطحي قياسي SOD-80 / MiniMELF (3.50 × 1.50 mm) (undefined×undefinedمم)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SOD-80",
      "padWidth": 1.1,
      "padHeight": 1.7,
      "reference": "D",
      "value": "D_SOD-80 / MiniMELF (3.50 × 1.50 mm)"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SOD-80"
    ]
  },
  {
    "id": "diode-smd-SMA",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SMA (DO-214AC - 4.30 × 2.60 mm)",
    "nameAr": "دايود سطحي D SMA (DO-214AC - 4.30 × 2.60 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "4.0mm Body",
    "description": "SMD Diode SMA (DO-214AC - 4.30 × 2.60 mm)",
    "descriptionAr": "دايود سطحي قياسي SMA (DO-214AC - 4.30 × 2.60 mm)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SMA",
      "pitch": 4.0,
      "bodyLength": 4.5,
      "bodyWidth": 2.6,
      "padWidth": 1.5,
      "padHeight": 1.7,
      "reference": "D",
      "value": "D_SMA"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SMA"
    ]
  },
  {
    "id": "diode-smd-SMB",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SMB (DO-214AA - 4.50 × 3.60 mm)",
    "nameAr": "دايود سطحي D SMB (DO-214AA - 4.50 × 3.60 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Diode SMB (DO-214AA - 4.50 × 3.60 mm) (undefinedxundefinedmm)",
    "descriptionAr": "دايود سطحي قياسي SMB (DO-214AA - 4.50 × 3.60 mm) (undefined×undefinedمم)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SMB",
      "padWidth": 2.1,
      "padHeight": 2.2,
      "reference": "D",
      "value": "D_SMB (DO-214AA - 4.50 × 3.60 mm)"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SMB"
    ]
  },
  {
    "id": "diode-smd-SMC",
    "familyId": "diode",
    "presetId": "diodes-smd",
    "name": "D_SMC (DO-214AB - 6.80 × 5.90 mm)",
    "nameAr": "دايود سطحي D SMC (DO-214AB - 6.80 × 5.90 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Diode SMC (DO-214AB - 6.80 × 5.90 mm) (undefinedxundefinedmm)",
    "descriptionAr": "دايود سطحي قياسي SMC (DO-214AB - 6.80 × 5.90 mm) (undefined×undefinedمم)",
    "params": {
      "isLed": false,
      "mounting": "SMD",
      "packageType": "SMC",
      "padWidth": 2.3,
      "padHeight": 3,
      "reference": "D",
      "value": "D_SMC (DO-214AB - 6.80 × 5.90 mm)"
    },
    "tags": [
      "diode",
      "rectifier",
      "smd",
      "SMC"
    ]
  },
  {
    "id": "led-smd-0201",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_0201 (0603 Metric - 0.60 × 0.30 mm)",
    "nameAr": "مؤشر LED سطحي 0201 (0603 Metric - 0.60 × 0.30 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 0201 (0603 Metric - 0.60 × 0.30 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 0201 (0603 Metric - 0.60 × 0.30 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "0201",
      "padWidth": 0.35,
      "padHeight": 0.4,
      "reference": "D",
      "value": "LED_0201 (0603 Metric - 0.60 × 0.30 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "0201"
    ]
  },
  {
    "id": "led-smd-0402",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_0402 (1005 Metric - 1.00 × 0.50 mm)",
    "nameAr": "مؤشر LED سطحي 0402 (1005 Metric - 1.00 × 0.50 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 0402 (1005 Metric - 1.00 × 0.50 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 0402 (1005 Metric - 1.00 × 0.50 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "0402",
      "padWidth": 0.55,
      "padHeight": 0.6,
      "reference": "D",
      "value": "LED_0402 (1005 Metric - 1.00 × 0.50 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "0402"
    ]
  },
  {
    "id": "led-smd-0603",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_0603 (1608 Metric - 1.60 × 0.80 mm)",
    "nameAr": "مؤشر LED سطحي 0603 (1608 Metric - 1.60 × 0.80 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 0603 (1608 Metric - 1.60 × 0.80 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 0603 (1608 Metric - 1.60 × 0.80 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "0603",
      "padWidth": 0.8,
      "padHeight": 0.9,
      "reference": "D",
      "value": "LED_0603 (1608 Metric - 1.60 × 0.80 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "0603"
    ]
  },
  {
    "id": "led-smd-0805",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_0805 (2012 Metric - 2.00 × 1.25 mm)",
    "nameAr": "مؤشر LED سطحي 0805 (2012 Metric - 2.00 × 1.25 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 0805 (2012 Metric - 2.00 × 1.25 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 0805 (2012 Metric - 2.00 × 1.25 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "0805",
      "padWidth": 1,
      "padHeight": 1.3,
      "reference": "D",
      "value": "LED_0805 (2012 Metric - 2.00 × 1.25 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "0805"
    ]
  },
  {
    "id": "led-smd-1206",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_1206 (3216 Metric - 3.20 × 1.60 mm)",
    "nameAr": "مؤشر LED سطحي 1206 (3216 Metric - 3.20 × 1.60 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 1206 (3216 Metric - 3.20 × 1.60 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 1206 (3216 Metric - 3.20 × 1.60 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "1206",
      "padWidth": 1.1,
      "padHeight": 1.7,
      "reference": "D",
      "value": "LED_1206 (3216 Metric - 3.20 × 1.60 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "1206"
    ]
  },
  {
    "id": "led-smd-1210",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_1210 (3225 Metric - 3.20 × 2.50 mm)",
    "nameAr": "مؤشر LED سطحي 1210 (3225 Metric - 3.20 × 2.50 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 1210 (3225 Metric - 3.20 × 2.50 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 1210 (3225 Metric - 3.20 × 2.50 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "1210",
      "padWidth": 1.1,
      "padHeight": 2.6,
      "reference": "D",
      "value": "LED_1210 (3225 Metric - 3.20 × 2.50 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "1210"
    ]
  },
  {
    "id": "led-smd-1812",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_1812 (4532 Metric - 4.50 × 3.20 mm)",
    "nameAr": "مؤشر LED سطحي 1812 (4532 Metric - 4.50 × 3.20 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 1812 (4532 Metric - 4.50 × 3.20 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 1812 (4532 Metric - 4.50 × 3.20 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "1812",
      "padWidth": 1.3,
      "padHeight": 3.4,
      "reference": "D",
      "value": "LED_1812 (4532 Metric - 4.50 × 3.20 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "1812"
    ]
  },
  {
    "id": "led-smd-2010",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_2010 (5025 Metric - 5.00 × 2.50 mm)",
    "nameAr": "مؤشر LED سطحي 2010 (5025 Metric - 5.00 × 2.50 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 2010 (5025 Metric - 5.00 × 2.50 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 2010 (5025 Metric - 5.00 × 2.50 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "2010",
      "padWidth": 1.2,
      "padHeight": 2.7,
      "reference": "D",
      "value": "LED_2010 (5025 Metric - 5.00 × 2.50 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "2010"
    ]
  },
  {
    "id": "led-smd-2512",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_2512 (6432 Metric - 6.40 × 3.20 mm)",
    "nameAr": "مؤشر LED سطحي 2512 (6432 Metric - 6.40 × 3.20 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 2512 (6432 Metric - 6.40 × 3.20 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 2512 (6432 Metric - 6.40 × 3.20 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "2512",
      "padWidth": 1.3,
      "padHeight": 3.4,
      "reference": "D",
      "value": "LED_2512 (6432 Metric - 6.40 × 3.20 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "2512"
    ]
  },
  {
    "id": "led-smd-2835",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_2835 (PLCC-2 - 2.80 × 3.50 mm)",
    "nameAr": "مؤشر LED سطحي 2835 (PLCC-2 - 2.80 × 3.50 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 2835 (PLCC-2 - 2.80 × 3.50 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 2835 (PLCC-2 - 2.80 × 3.50 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "2835",
      "padWidth": 1.2,
      "padHeight": 2.5,
      "reference": "D",
      "value": "LED_2835 (PLCC-2 - 2.80 × 3.50 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "2835"
    ]
  },
  {
    "id": "led-smd-3020",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_3020 (PLCC-2 - 3.00 × 2.00 mm)",
    "nameAr": "مؤشر LED سطحي 3020 (PLCC-2 - 3.00 × 2.00 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 3020 (PLCC-2 - 3.00 × 2.00 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 3020 (PLCC-2 - 3.00 × 2.00 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "3020",
      "padWidth": 1.1,
      "padHeight": 1.5,
      "reference": "D",
      "value": "LED_3020 (PLCC-2 - 3.00 × 2.00 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "3020"
    ]
  },
  {
    "id": "led-smd-3528",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_3528 (PLCC-2 - 3.50 × 2.80 mm)",
    "nameAr": "مؤشر LED سطحي 3528 (PLCC-2 - 3.50 × 2.80 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 3528 (PLCC-2 - 3.50 × 2.80 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 3528 (PLCC-2 - 3.50 × 2.80 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "3528",
      "padWidth": 1.5,
      "padHeight": 2.2,
      "reference": "D",
      "value": "LED_3528 (PLCC-2 - 3.50 × 2.80 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "3528"
    ]
  },
  {
    "id": "led-smd-5050",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_5050 (PLCC-6 - 5.00 × 5.00 mm)",
    "nameAr": "مؤشر LED سطحي 5050 (PLCC-6 - 5.00 × 5.00 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 5050 (PLCC-6 - 5.00 × 5.00 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 5050 (PLCC-6 - 5.00 × 5.00 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "5050",
      "padWidth": 1.6,
      "padHeight": 1.6,
      "reference": "D",
      "value": "LED_5050 (PLCC-6 - 5.00 × 5.00 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "5050"
    ]
  },
  {
    "id": "led-smd-5630",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_5630 (PLCC-4 - 5.60 × 3.00 mm)",
    "nameAr": "مؤشر LED سطحي 5630 (PLCC-4 - 5.60 × 3.00 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 5630 (PLCC-4 - 5.60 × 3.00 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 5630 (PLCC-4 - 5.60 × 3.00 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "5630",
      "padWidth": 1.4,
      "padHeight": 2,
      "reference": "D",
      "value": "LED_5630 (PLCC-4 - 5.60 × 3.00 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "5630"
    ]
  },
  {
    "id": "led-smd-5730",
    "familyId": "diode",
    "presetId": "leds-smd",
    "name": "LED_5730 (PLCC-2 - 5.70 × 3.00 mm)",
    "nameAr": "مؤشر LED سطحي 5730 (PLCC-2 - 5.70 × 3.00 mm)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "undefinedmm Body",
    "description": "SMD Chip LED 5730 (PLCC-2 - 5.70 × 3.00 mm) (undefinedxundefinedmm)",
    "descriptionAr": "مؤشر ضوئي سطحي LED قياس 5730 (PLCC-2 - 5.70 × 3.00 mm)",
    "params": {
      "isLed": true,
      "mounting": "SMD",
      "packageType": "5730",
      "padWidth": 1.5,
      "padHeight": 2,
      "reference": "D",
      "value": "LED_5730 (PLCC-2 - 5.70 × 3.00 mm)"
    },
    "tags": [
      "led",
      "diode",
      "optics",
      "smd",
      "5730"
    ]
  },
  {
    "id": "diode-tht-DO-35",
    "familyId": "diode",
    "presetId": "diodes-tht",
    "name": "DO-35 (1N4148)",
    "nameAr": "دايود ثقبي DO-35 (1N4148)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "7.62mm Pitch",
    "description": "Through-Hole Diode DO-35 (1N4148)",
    "descriptionAr": "دايود مقوم عبر الثقوب THT قياس DO-35 (1N4148)",
    "params": {
      "isLed": false,
      "mounting": "THT",
      "packageType": "DO-35",
      "pitch": 7.62,
      "drill": 0.8,
      "padSize": 1.6,
      "bodyLength": 3.8,
      "bodyDiameter": 1.9,
      "reference": "D",
      "value": "DO-35 (1N4148)"
    },
    "tags": [
      "diode",
      "rectifier",
      "tht",
      "DO-35"
    ]
  },
  {
    "id": "diode-tht-DO-41",
    "familyId": "diode",
    "presetId": "diodes-tht",
    "name": "DO-41 (1N4007)",
    "nameAr": "دايود ثقبي DO-41 (1N4007)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10.16mm Pitch",
    "description": "Through-Hole Diode DO-41 (1N4007)",
    "descriptionAr": "دايود مقوم عبر الثقوب THT قياس DO-41 (1N4007)",
    "params": {
      "isLed": false,
      "mounting": "THT",
      "packageType": "DO-41",
      "pitch": 10.16,
      "drill": 1,
      "padSize": 2,
      "bodyLength": 4.3,
      "bodyDiameter": 2.6,
      "reference": "D",
      "value": "DO-41 (1N4007)"
    },
    "tags": [
      "diode",
      "rectifier",
      "tht",
      "DO-41"
    ]
  },
  {
    "id": "diode-tht-DO-15",
    "familyId": "diode",
    "presetId": "diodes-tht",
    "name": "DO-15 (1N5399)",
    "nameAr": "دايود ثقبي DO-15 (1N5399)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "15.24mm Pitch",
    "description": "Through-Hole Diode DO-15 (1N5399)",
    "descriptionAr": "دايود مقوم عبر الثقوب THT قياس DO-15 (1N5399)",
    "params": {
      "isLed": false,
      "mounting": "THT",
      "packageType": "DO-15",
      "pitch": 15.24,
      "drill": 1,
      "padSize": 2,
      "bodyLength": 7.6,
      "bodyDiameter": 3.6,
      "reference": "D",
      "value": "DO-15 (1N5399)"
    },
    "tags": [
      "diode",
      "rectifier",
      "tht",
      "DO-15"
    ]
  },
  {
    "id": "diode-tht-DO-201",
    "familyId": "diode",
    "presetId": "diodes-tht",
    "name": "DO-201 (1N5408)",
    "nameAr": "دايود ثقبي DO-201 (1N5408)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "15.24mm Pitch",
    "description": "Through-Hole Diode DO-201 (1N5408)",
    "descriptionAr": "دايود مقوم عبر الثقوب THT قياس DO-201 (1N5408)",
    "params": {
      "isLed": false,
      "mounting": "THT",
      "packageType": "DO-201",
      "pitch": 15.24,
      "drill": 1.2,
      "padSize": 2.4,
      "bodyLength": 9.5,
      "bodyDiameter": 5.3,
      "reference": "D",
      "value": "DO-201 (1N5408)"
    },
    "tags": [
      "diode",
      "rectifier",
      "tht",
      "DO-201"
    ]
  },
  {
    "id": "diode-tht-3mm",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED 3mm",
    "nameAr": "مؤشر ضوئي LED 3mm",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole LED LED 3mm",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED 3mm",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "3mm",
      "pitch": 2.54,
      "drill": 0.8,
      "padSize": 1.6,
      "reference": "D",
      "value": "LED 3mm"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "3mm"
    ]
  },
  {
    "id": "diode-tht-5mm",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED 5mm",
    "nameAr": "مؤشر ضوئي LED 5mm",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole LED LED 5mm",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED 5mm",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "5mm",
      "pitch": 2.54,
      "drill": 0.85,
      "padSize": 1.8,
      "reference": "D",
      "value": "LED 5mm"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "5mm"
    ]
  },
  {
    "id": "diode-tht-8mm",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED 8mm",
    "nameAr": "مؤشر ضوئي LED 8mm",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole LED LED 8mm",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED 8mm",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "8mm",
      "pitch": 2.54,
      "drill": 0.9,
      "padSize": 2,
      "reference": "D",
      "value": "LED 8mm"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "8mm"
    ]
  },
  {
    "id": "diode-tht-Bridge-KBP",
    "familyId": "diode",
    "presetId": "diodes-tht",
    "name": "Bridge KBP",
    "nameAr": "دايود ثقبي Bridge KBP",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "3.81mm Pitch",
    "description": "Through-Hole Diode Bridge KBP",
    "descriptionAr": "دايود مقوم عبر الثقوب THT قياس Bridge KBP",
    "params": {
      "isLed": false,
      "mounting": "THT",
      "packageType": "Bridge-KBP",
      "pitch": 3.81,
      "drill": 0.9,
      "padSize": 1.8,
      "reference": "D",
      "value": "Bridge KBP"
    },
    "tags": [
      "diode",
      "rectifier",
      "tht",
      "Bridge-KBP"
    ]
  },
  {
    "id": "diode-tht-Axial Power",
    "familyId": "diode",
    "presetId": "diodes-tht",
    "name": "Axial Power (10A)",
    "nameAr": "دايود ثقبي Axial Power (10A)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "20.32mm Pitch",
    "description": "Through-Hole Diode Axial Power (10A)",
    "descriptionAr": "دايود مقوم عبر الثقوب THT قياس Axial Power (10A)",
    "params": {
      "isLed": false,
      "mounting": "THT",
      "packageType": "Axial Power",
      "pitch": 20.32,
      "drill": 1.5,
      "padSize": 3,
      "bodyLength": 15,
      "bodyDiameter": 8,
      "reference": "D",
      "value": "Axial Power (10A)"
    },
    "tags": [
      "diode",
      "rectifier",
      "tht",
      "Axial Power"
    ]
  },
  {
    "id": "diode-tht-10mm",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED 10mm",
    "nameAr": "مؤشر ضوئي LED 10mm",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole LED LED 10mm",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED 10mm",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "10mm",
      "pitch": 2.54,
      "drill": 1,
      "padSize": 2.2,
      "reference": "D",
      "value": "LED 10mm"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "10mm"
    ]
  },
  {
    "id": "diode-tht-Rectangular",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED Rect. (5x2)",
    "nameAr": "مؤشر ضوئي LED Rect. (5x2)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole LED LED Rect. (5x2)",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED Rect. (5x2)",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "Rectangular",
      "pitch": 2.54,
      "drill": 0.8,
      "padSize": 1.6,
      "reference": "D",
      "value": "LED Rect. (5x2)"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "Rectangular"
    ]
  },
  {
    "id": "diode-tht-Bi-Color",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED Bi-Color",
    "nameAr": "مؤشر ضوئي LED Bi-Color",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole LED LED Bi-Color",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED Bi-Color",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "Bi-Color",
      "pitch": 2.54,
      "drill": 0.85,
      "padSize": 1.8,
      "reference": "D",
      "value": "LED Bi-Color"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "Bi-Color"
    ]
  },
  {
    "id": "diode-tht-RGB",
    "familyId": "diode",
    "presetId": "leds-tht",
    "name": "LED RGB",
    "nameAr": "مؤشر ضوئي LED RGB",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "Through-Hole LED LED RGB",
    "descriptionAr": "مؤشر ليد ضوئي عبر الثقوب THT قياس LED RGB",
    "params": {
      "isLed": true,
      "mounting": "THT",
      "packageType": "RGB",
      "pitch": 1.27,
      "drill": 0.8,
      "padSize": 1.4,
      "reference": "D",
      "value": "LED RGB"
    },
    "tags": [
      "diode",
      "led",
      "tht",
      "RGB"
    ]
  },
  {
    "id": "trans-smd-SOT-23",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-23 (TO-236AB)",
    "nameAr": "ترانزستور سطحي SOT-23 (TO-236AB)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "3 Pins",
    "pitchText": "0.95mm Pitch",
    "description": "SMD Transistor Package SOT-23 (TO-236AB) (3 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-23 (TO-236AB)",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-23",
      "packageSize": "SOT-23",
      "pitch": 0.95,
      "padWidth": 0.8,
      "padHeight": 0.9,
      "bodyWidth": 2.9,
      "bodyLength": 1.3,
      "pins": 3,
      "reference": "Q",
      "value": "SOT-23 (TO-236AB)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-23"
    ]
  },
  {
    "id": "trans-smd-SOT-23-5",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-23-5",
    "nameAr": "ترانزستور سطحي SOT-23-5",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "5 Pins",
    "pitchText": "0.95mm Pitch",
    "description": "SMD Transistor Package SOT-23-5 (5 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-23-5",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-23-5",
      "packageSize": "SOT-23-5",
      "pitch": 0.95,
      "padWidth": 0.7,
      "padHeight": 1,
      "bodyWidth": 2.9,
      "bodyLength": 1.6,
      "pins": 5,
      "reference": "Q",
      "value": "SOT-23-5"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-23-5"
    ]
  },
  {
    "id": "trans-smd-SOT-23-6",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-23-6",
    "nameAr": "ترانزستور سطحي SOT-23-6",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "6 Pins",
    "pitchText": "0.95mm Pitch",
    "description": "SMD Transistor Package SOT-23-6 (6 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-23-6",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-23-6",
      "packageSize": "SOT-23-6",
      "pitch": 0.95,
      "padWidth": 0.7,
      "padHeight": 1,
      "bodyWidth": 2.9,
      "bodyLength": 1.6,
      "pins": 6,
      "reference": "Q",
      "value": "SOT-23-6"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-23-6"
    ]
  },
  {
    "id": "trans-smd-SOT-223",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-223 (Tab Pin 4)",
    "nameAr": "ترانزستور سطحي SOT-223 (Tab Pin 4)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "4 Pins",
    "pitchText": "2.3mm Pitch",
    "description": "SMD Transistor Package SOT-223 (Tab Pin 4) (4 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-223 (Tab Pin 4)",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-223",
      "packageSize": "SOT-223",
      "pitch": 2.3,
      "padWidth": 1,
      "padHeight": 1.8,
      "bodyWidth": 6.5,
      "bodyLength": 3.5,
      "pins": 4,
      "reference": "Q",
      "value": "SOT-223 (Tab Pin 4)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-223"
    ]
  },
  {
    "id": "trans-smd-SOT-89",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-89 (TO-243)",
    "nameAr": "ترانزستور سطحي SOT-89 (TO-243)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "3 Pins",
    "pitchText": "1.5mm Pitch",
    "description": "SMD Transistor Package SOT-89 (TO-243) (3 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-89 (TO-243)",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-89",
      "packageSize": "SOT-89",
      "pitch": 1.5,
      "padWidth": 0.8,
      "padHeight": 1.4,
      "bodyWidth": 4.5,
      "bodyLength": 2.5,
      "pins": 3,
      "reference": "Q",
      "value": "SOT-89 (TO-243)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-89"
    ]
  },
  {
    "id": "trans-smd-SOT-323",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-323 (SC-70-3)",
    "nameAr": "ترانزستور سطحي SOT-323 (SC-70-3)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "3 Pins",
    "pitchText": "0.65mm Pitch",
    "description": "SMD Transistor Package SOT-323 (SC-70-3) (3 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-323 (SC-70-3)",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-323",
      "packageSize": "SOT-323",
      "pitch": 0.65,
      "padWidth": 0.5,
      "padHeight": 0.6,
      "bodyWidth": 2,
      "bodyLength": 1.25,
      "pins": 3,
      "reference": "Q",
      "value": "SOT-323 (SC-70-3)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-323"
    ]
  },
  {
    "id": "trans-smd-SOT-363",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SOT-363 (SC-88)",
    "nameAr": "ترانزستور سطحي SOT-363 (SC-88)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "6 Pins",
    "pitchText": "0.65mm Pitch",
    "description": "SMD Transistor Package SOT-363 (SC-88) (6 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SOT-363 (SC-88)",
    "params": {
      "mounting": "SMD",
      "packageType": "SOT-363",
      "packageSize": "SOT-363",
      "pitch": 0.65,
      "padWidth": 0.4,
      "padHeight": 0.6,
      "bodyWidth": 2,
      "bodyLength": 1.25,
      "pins": 6,
      "reference": "Q",
      "value": "SOT-363 (SC-88)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SOT-363"
    ]
  },
  {
    "id": "trans-smd-DPAK",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "DPAK / TO-252-2",
    "nameAr": "ترانزستور سطحي DPAK / TO-252-2",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "3 Pins",
    "pitchText": "4.56mm Pitch",
    "description": "SMD Transistor Package DPAK / TO-252-2 (3 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس DPAK / TO-252-2",
    "params": {
      "mounting": "SMD",
      "packageType": "DPAK",
      "packageSize": "DPAK",
      "pitch": 4.56,
      "padWidth": 1.4,
      "padHeight": 2.2,
      "bodyWidth": 6.6,
      "bodyLength": 6.1,
      "pins": 3,
      "reference": "Q",
      "value": "DPAK / TO-252-2"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "DPAK"
    ]
  },
  {
    "id": "trans-smd-D2PAK",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "D2PAK / TO-263-2",
    "nameAr": "ترانزستور سطحي D2PAK / TO-263-2",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "3 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "SMD Transistor Package D2PAK / TO-263-2 (3 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس D2PAK / TO-263-2",
    "params": {
      "mounting": "SMD",
      "packageType": "D2PAK",
      "packageSize": "D2PAK",
      "pitch": 5.08,
      "padWidth": 1.6,
      "padHeight": 3.4,
      "bodyWidth": 10.2,
      "bodyLength": 9.2,
      "pins": 3,
      "reference": "Q",
      "value": "D2PAK / TO-263-2"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "D2PAK"
    ]
  },
  {
    "id": "trans-smd-SO-8",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "SO-8 (Power MOSFET SOIC-8)",
    "nameAr": "ترانزستور سطحي SO-8 (Power MOSFET SOIC-8)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "8 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "SMD Transistor Package SO-8 (Power MOSFET SOIC-8) (8 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس SO-8 (Power MOSFET SOIC-8)",
    "params": {
      "mounting": "SMD",
      "packageType": "SO-8",
      "packageSize": "SO-8",
      "pitch": 1.27,
      "padWidth": 0.6,
      "padHeight": 1.5,
      "bodyWidth": 4.9,
      "bodyLength": 3.9,
      "pins": 8,
      "reference": "Q",
      "value": "SO-8 (Power MOSFET SOIC-8)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "SO-8"
    ]
  },
  {
    "id": "trans-smd-PowerPAK-56",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "PowerPAK-56 (DFN 5x6)",
    "nameAr": "ترانزستور سطحي PowerPAK-56 (DFN 5x6)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "8 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "SMD Transistor Package PowerPAK-56 (DFN 5x6) (8 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس PowerPAK-56 (DFN 5x6)",
    "params": {
      "mounting": "SMD",
      "packageType": "PowerPAK-56",
      "packageSize": "PowerPAK-56",
      "pitch": 1.27,
      "padWidth": 0.6,
      "padHeight": 0.7,
      "bodyWidth": 5,
      "bodyLength": 6,
      "pins": 8,
      "reference": "Q",
      "value": "PowerPAK-56 (DFN 5x6)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "PowerPAK-56"
    ]
  },
  {
    "id": "trans-smd-LFPAK56",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "LFPAK56 (SOT-669)",
    "nameAr": "ترانزستور سطحي LFPAK56 (SOT-669)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "5 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "SMD Transistor Package LFPAK56 (SOT-669) (5 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس LFPAK56 (SOT-669)",
    "params": {
      "mounting": "SMD",
      "packageType": "LFPAK56",
      "packageSize": "LFPAK56",
      "pitch": 1.27,
      "padWidth": 0.6,
      "padHeight": 1.1,
      "bodyWidth": 5,
      "bodyLength": 5.3,
      "pins": 5,
      "reference": "Q",
      "value": "LFPAK56 (SOT-669)"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "LFPAK56"
    ]
  },
  {
    "id": "trans-smd-Custom_SMD",
    "familyId": "transistor",
    "presetId": "transistor-smd",
    "name": "Custom SMD Transistor",
    "nameAr": "ترانزستور سطحي Custom SMD Transistor",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "SMD",
    "pinsText": "3 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "SMD Transistor Package Custom SMD Transistor (3 pins)",
    "descriptionAr": "حزمة ترانزستور سطحية SMD قياس Custom SMD Transistor",
    "params": {
      "mounting": "SMD",
      "packageType": "Custom_SMD",
      "packageSize": "Custom_SMD",
      "pitch": 1.27,
      "padWidth": 1,
      "padHeight": 1.5,
      "bodyWidth": 5,
      "bodyLength": 4,
      "pins": 3,
      "reference": "Q",
      "value": "Custom SMD Transistor"
    },
    "tags": [
      "transistor",
      "fet",
      "mosfet",
      "bjt",
      "smd",
      "Custom_SMD"
    ]
  },
  {
    "id": "trans-tht-TO-92",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-92 (2N2222)",
    "nameAr": "ترانزستور ثقبي TO-92 (2N2222)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-92 (2N2222) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-92 (2N2222)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-92",
      "packageSize": "TO-92",
      "pitch": 1.27,
      "drill": 0.75,
      "padSize": 1.4,
      "bodyWidth": 4.6,
      "bodyLength": 3.8,
      "pins": 3,
      "reference": "Q",
      "value": "TO-92 (2N2222)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-92"
    ]
  },
  {
    "id": "trans-tht-TO-18",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-18 (Metal)",
    "nameAr": "ترانزستور ثقبي TO-18 (Metal)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-18 (Metal) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-18 (Metal)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-18",
      "packageSize": "TO-18",
      "pitch": 2.54,
      "drill": 0.75,
      "padSize": 1.4,
      "bodyWidth": 4.7,
      "bodyLength": 4.7,
      "pins": 3,
      "reference": "Q",
      "value": "TO-18 (Metal)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-18"
    ]
  },
  {
    "id": "trans-tht-TO-39",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-39 (Metal)",
    "nameAr": "ترانزستور ثقبي TO-39 (Metal)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-39 (Metal) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-39 (Metal)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-39",
      "packageSize": "TO-39",
      "pitch": 5.08,
      "drill": 0.85,
      "padSize": 1.6,
      "bodyWidth": 8.5,
      "bodyLength": 8.5,
      "pins": 3,
      "reference": "Q",
      "value": "TO-39 (Metal)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-39"
    ]
  },
  {
    "id": "trans-tht-TO-126",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-126 (BD139)",
    "nameAr": "ترانزستور ثقبي TO-126 (BD139)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.28mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-126 (BD139) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-126 (BD139)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-126",
      "packageSize": "TO-126",
      "pitch": 2.28,
      "drill": 1,
      "padSize": 1.8,
      "bodyWidth": 7.8,
      "bodyLength": 3,
      "pins": 3,
      "reference": "Q",
      "value": "TO-126 (BD139)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-126"
    ]
  },
  {
    "id": "trans-tht-TO-220",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-220 (IRF540)",
    "nameAr": "ترانزستور ثقبي TO-220 (IRF540)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-220 (IRF540) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-220 (IRF540)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-220",
      "packageSize": "TO-220",
      "pitch": 2.54,
      "drill": 1,
      "padSize": 1.8,
      "bodyWidth": 10.2,
      "bodyLength": 4.5,
      "pins": 3,
      "reference": "Q",
      "value": "TO-220 (IRF540)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-220"
    ]
  },
  {
    "id": "trans-tht-TO-247",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-247 (High Pwr)",
    "nameAr": "ترانزستور ثقبي TO-247 (High Pwr)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "5.45mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-247 (High Pwr) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-247 (High Pwr)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-247",
      "packageSize": "TO-247",
      "pitch": 5.45,
      "drill": 1.3,
      "padSize": 2.4,
      "bodyWidth": 15.8,
      "bodyLength": 5,
      "pins": 3,
      "reference": "Q",
      "value": "TO-247 (High Pwr)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-247"
    ]
  },
  {
    "id": "trans-tht-TO-3",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-3 (Diamond)",
    "nameAr": "ترانزستور ثقبي TO-3 (Diamond)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "10.92mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-3 (Diamond) (2 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-3 (Diamond)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-3",
      "packageSize": "TO-3",
      "pitch": 10.92,
      "drill": 1.5,
      "padSize": 3,
      "bodyWidth": 39,
      "bodyLength": 26,
      "pins": 2,
      "reference": "Q",
      "value": "TO-3 (Diamond)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-3"
    ]
  },
  {
    "id": "trans-tht-TO-264",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-264 (Extreme)",
    "nameAr": "ترانزستور ثقبي TO-264 (Extreme)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "5.45mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-264 (Extreme) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-264 (Extreme)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-264",
      "packageSize": "TO-264",
      "pitch": 5.45,
      "drill": 1.4,
      "padSize": 2.6,
      "bodyWidth": 20,
      "bodyLength": 5.2,
      "pins": 3,
      "reference": "Q",
      "value": "TO-264 (Extreme)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-264"
    ]
  },
  {
    "id": "trans-tht-TO-92L",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-92L (Long)",
    "nameAr": "ترانزستور ثقبي TO-92L (Long)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "1.27mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-92L (Long) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-92L (Long)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-92L",
      "packageSize": "TO-92L",
      "pitch": 1.27,
      "drill": 0.75,
      "padSize": 1.4,
      "bodyWidth": 5,
      "bodyLength": 4,
      "pins": 3,
      "reference": "Q",
      "value": "TO-92L (Long)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-92L"
    ]
  },
  {
    "id": "trans-tht-TO-220F",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-220F (Iso)",
    "nameAr": "ترانزستور ثقبي TO-220F (Iso)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-220F (Iso) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-220F (Iso)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-220F",
      "packageSize": "TO-220F",
      "pitch": 2.54,
      "drill": 1,
      "padSize": 1.8,
      "bodyWidth": 10.2,
      "bodyLength": 4.7,
      "pins": 3,
      "reference": "Q",
      "value": "TO-220F (Iso)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-220F"
    ]
  },
  {
    "id": "trans-tht-TO-251",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-251 (IPAK)",
    "nameAr": "ترانزستور ثقبي TO-251 (IPAK)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.28mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-251 (IPAK) (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-251 (IPAK)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-251",
      "packageSize": "TO-251",
      "pitch": 2.28,
      "drill": 0.9,
      "padSize": 1.6,
      "bodyWidth": 6.6,
      "bodyLength": 6.1,
      "pins": 3,
      "reference": "Q",
      "value": "TO-251 (IPAK)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-251"
    ]
  },
  {
    "id": "trans-tht-TO-218",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-218",
    "nameAr": "ترانزستور ثقبي TO-218",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "5.45mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-218 (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-218",
    "params": {
      "mounting": "THT",
      "packageType": "TO-218",
      "packageSize": "TO-218",
      "pitch": 5.45,
      "drill": 1.3,
      "padSize": 2.4,
      "bodyWidth": 15.3,
      "bodyLength": 4.8,
      "pins": 3,
      "reference": "Q",
      "value": "TO-218"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-218"
    ]
  },
  {
    "id": "trans-tht-TO-66",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-66 (Metal)",
    "nameAr": "ترانزستور ثقبي TO-66 (Metal)",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-66 (Metal) (2 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-66 (Metal)",
    "params": {
      "mounting": "THT",
      "packageType": "TO-66",
      "packageSize": "TO-66",
      "pitch": 5.08,
      "drill": 1.2,
      "padSize": 2.5,
      "bodyWidth": 31,
      "bodyLength": 18,
      "pins": 2,
      "reference": "Q",
      "value": "TO-66 (Metal)"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-66"
    ]
  },
  {
    "id": "trans-tht-TO-220-5",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "TO-220-5",
    "nameAr": "ترانزستور ثقبي TO-220-5",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "5 Pins",
    "pitchText": "1.7mm Pitch",
    "description": "Through-Hole Transistor / Power Package TO-220-5 (5 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس TO-220-5",
    "params": {
      "mounting": "THT",
      "packageType": "TO-220-5",
      "packageSize": "TO-220-5",
      "pitch": 1.7,
      "drill": 0.9,
      "padSize": 1.5,
      "bodyWidth": 10.2,
      "bodyLength": 4.5,
      "pins": 5,
      "reference": "Q",
      "value": "TO-220-5"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "TO-220-5"
    ]
  },
  {
    "id": "trans-tht-SIP-3",
    "familyId": "transistor",
    "presetId": "transistor-tht",
    "name": "SIP-3 / SIL-3",
    "nameAr": "ترانزستور ثقبي SIP-3 / SIL-3",
    "category": "semiconductor",
    "categoryName": "Semiconductors",
    "categoryNameAr": "أشباه الموصلات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Transistor / Power Package SIP-3 / SIL-3 (3 pins)",
    "descriptionAr": "حزمة ترانزستور وقدرة ثقبية THT قياس SIP-3 / SIL-3",
    "params": {
      "mounting": "THT",
      "packageType": "SIP-3",
      "packageSize": "SIP-3",
      "pitch": 2.54,
      "drill": 0.85,
      "padSize": 1.6,
      "bodyWidth": 7.6,
      "bodyLength": 2.5,
      "pins": 3,
      "reference": "Q",
      "value": "SIP-3 / SIL-3"
    },
    "tags": [
      "transistor",
      "fet",
      "power",
      "tht",
      "SIP-3"
    ]
  },
  {
    "id": "xtal-smd-SMD-3225-4P",
    "familyId": "crystal",
    "presetId": "SMD-3225-4P",
    "name": "XTAL_SMD 3225 4-Pad",
    "nameAr": "كريستال سطحي SMD 3225 4-Pad",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 3225 4-Pad (3.2 × 2.5 mm standard crystal)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 3225 4-Pad",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-3225-4P",
      "packageSize": "SMD-3225-4P",
      "reference": "Y",
      "value": "XTAL_SMD 3225 4-Pad"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-3225-4P"
    ]
  },
  {
    "id": "xtal-smd-SMD-2016-4P",
    "familyId": "crystal",
    "presetId": "SMD-2016-4P",
    "name": "XTAL_SMD 2016 4-Pad",
    "nameAr": "كريستال سطحي SMD 2016 4-Pad",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 2016 4-Pad (2.0 × 1.6 mm ultra-miniature)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 2016 4-Pad",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-2016-4P",
      "packageSize": "SMD-2016-4P",
      "reference": "Y",
      "value": "XTAL_SMD 2016 4-Pad"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-2016-4P"
    ]
  },
  {
    "id": "xtal-smd-SMD-2520-4P",
    "familyId": "crystal",
    "presetId": "SMD-2520-4P",
    "name": "XTAL_SMD 2520 4-Pad",
    "nameAr": "كريستال سطحي SMD 2520 4-Pad",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 2520 4-Pad (2.5 × 2.0 mm compact)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 2520 4-Pad",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-2520-4P",
      "packageSize": "SMD-2520-4P",
      "reference": "Y",
      "value": "XTAL_SMD 2520 4-Pad"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-2520-4P"
    ]
  },
  {
    "id": "xtal-smd-SMD-5032-4P",
    "familyId": "crystal",
    "presetId": "SMD-5032-4P",
    "name": "XTAL_SMD 5032 4-Pad",
    "nameAr": "كريستال سطحي SMD 5032 4-Pad",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 5032 4-Pad (5.0 × 3.2 mm robust)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 5032 4-Pad",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-5032-4P",
      "packageSize": "SMD-5032-4P",
      "reference": "Y",
      "value": "XTAL_SMD 5032 4-Pad"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-5032-4P"
    ]
  },
  {
    "id": "xtal-smd-SMD-7050-4P",
    "familyId": "crystal",
    "presetId": "SMD-7050-4P",
    "name": "XTAL_SMD 7050 4-Pad",
    "nameAr": "كريستال سطحي SMD 7050 4-Pad",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 7050 4-Pad (7.0 × 5.0 mm legacy / automotive)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 7050 4-Pad",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-7050-4P",
      "packageSize": "SMD-7050-4P",
      "reference": "Y",
      "value": "XTAL_SMD 7050 4-Pad"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-7050-4P"
    ]
  },
  {
    "id": "xtal-smd-SMD-3215-2P",
    "familyId": "crystal",
    "presetId": "SMD-3215-2P",
    "name": "XTAL_SMD 3215 2-Pad (FC-135)",
    "nameAr": "كريستال سطحي SMD 3215 2-Pad (FC-135)",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 3215 2-Pad (FC-135) (3.2 × 1.5 mm 32.768 kHz tuning fork)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 3215 2-Pad (FC-135)",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-3215-2P",
      "packageSize": "SMD-3215-2P",
      "reference": "Y",
      "value": "XTAL_SMD 3215 2-Pad (FC-135)"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-3215-2P"
    ]
  },
  {
    "id": "xtal-smd-SMD-5032-2P",
    "familyId": "crystal",
    "presetId": "SMD-5032-2P",
    "name": "XTAL_SMD 5032 2-Pad",
    "nameAr": "كريستال سطحي SMD 5032 2-Pad",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator SMD 5032 2-Pad (5.0 × 3.2 mm 2-terminal resonator)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس SMD 5032 2-Pad",
    "params": {
      "mounting": "SMD",
      "packageType": "SMD-5032-2P",
      "packageSize": "SMD-5032-2P",
      "reference": "Y",
      "value": "XTAL_SMD 5032 2-Pad"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "SMD-5032-2P"
    ]
  },
  {
    "id": "xtal-smd-HC-49-SMD",
    "familyId": "crystal",
    "presetId": "HC-49-SMD",
    "name": "XTAL_HC-49/SMD Gullwing",
    "nameAr": "كريستال سطحي HC-49/SMD Gullwing",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator HC-49/SMD Gullwing (11.4 × 4.8 mm SMT crystal can)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس HC-49/SMD Gullwing",
    "params": {
      "mounting": "SMD",
      "packageType": "HC-49-SMD",
      "packageSize": "HC-49-SMD",
      "reference": "Y",
      "value": "XTAL_HC-49/SMD Gullwing"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "HC-49-SMD"
    ]
  },
  {
    "id": "xtal-smd-OSC-SMD-3225",
    "familyId": "crystal",
    "presetId": "OSC-SMD-3225",
    "name": "XTAL_Oscillator SMD 3225 4-Pin",
    "nameAr": "كريستال سطحي Oscillator SMD 3225 4-Pin",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator Oscillator SMD 3225 4-Pin (3.2 × 2.5 mm active clock)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس Oscillator SMD 3225 4-Pin",
    "params": {
      "mounting": "SMD",
      "packageType": "OSC-SMD-3225",
      "packageSize": "OSC-SMD-3225",
      "reference": "Y",
      "value": "XTAL_Oscillator SMD 3225 4-Pin"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "OSC-SMD-3225"
    ]
  },
  {
    "id": "xtal-smd-OSC-SMD-5032",
    "familyId": "crystal",
    "presetId": "OSC-SMD-5032",
    "name": "XTAL_Oscillator SMD 5032 4-Pin",
    "nameAr": "كريستال سطحي Oscillator SMD 5032 4-Pin",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator Oscillator SMD 5032 4-Pin (5.0 × 3.2 mm active clock)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس Oscillator SMD 5032 4-Pin",
    "params": {
      "mounting": "SMD",
      "packageType": "OSC-SMD-5032",
      "packageSize": "OSC-SMD-5032",
      "reference": "Y",
      "value": "XTAL_Oscillator SMD 5032 4-Pin"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "OSC-SMD-5032"
    ]
  },
  {
    "id": "xtal-smd-OSC-SMD-7050",
    "familyId": "crystal",
    "presetId": "OSC-SMD-7050",
    "name": "XTAL_Oscillator SMD 7050 4-Pin",
    "nameAr": "كريستال سطحي Oscillator SMD 7050 4-Pin",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.5mm",
    "description": "SMD Crystal Resonator / Oscillator Oscillator SMD 7050 4-Pin (7.0 × 5.0 mm active clock)",
    "descriptionAr": "بلورة مذبذب سطحية SMD قياس Oscillator SMD 7050 4-Pin",
    "params": {
      "mounting": "SMD",
      "packageType": "OSC-SMD-7050",
      "packageSize": "OSC-SMD-7050",
      "reference": "Y",
      "value": "XTAL_Oscillator SMD 7050 4-Pin"
    },
    "tags": [
      "crystal",
      "oscillator",
      "resonator",
      "smd",
      "OSC-SMD-7050"
    ]
  },
  {
    "id": "xtal-tht-HC-49/US",
    "familyId": "crystal",
    "presetId": "HC-49/US",
    "name": "XTAL_HC-49/US",
    "nameAr": "كريستال ثقبي HC-49/US",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can HC-49/US (Low profile 11.5x5mm / Pitch 4.88mm)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس HC-49/US",
    "params": {
      "mounting": "THT",
      "packageType": "HC-49/US",
      "packageSize": "HC-49/US",
      "reference": "Y",
      "value": "XTAL_HC-49/US"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "HC-49/US"
    ]
  },
  {
    "id": "xtal-tht-HC-49/U",
    "familyId": "crystal",
    "presetId": "HC-49/U",
    "name": "XTAL_HC-49/U",
    "nameAr": "كريستال ثقبي HC-49/U",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can HC-49/U (Full height 11.5x5mm / Pitch 4.88mm)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس HC-49/U",
    "params": {
      "mounting": "THT",
      "packageType": "HC-49/U",
      "packageSize": "HC-49/U",
      "reference": "Y",
      "value": "XTAL_HC-49/U"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "HC-49/U"
    ]
  },
  {
    "id": "xtal-tht-TuningFork_2x6",
    "familyId": "crystal",
    "presetId": "TuningFork_2x6",
    "name": "XTAL_Watch 2x6mm",
    "nameAr": "كريستال ثقبي Watch 2x6mm",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Watch 2x6mm (32.768kHz Cylindrical / Pitch 2.54mm)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Watch 2x6mm",
    "params": {
      "mounting": "THT",
      "packageType": "TuningFork_2x6",
      "packageSize": "TuningFork_2x6",
      "reference": "Y",
      "value": "XTAL_Watch 2x6mm"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "TuningFork_2x6"
    ]
  },
  {
    "id": "xtal-tht-TuningFork_3x8",
    "familyId": "crystal",
    "presetId": "TuningFork_3x8",
    "name": "XTAL_Watch 3x8mm",
    "nameAr": "كريستال ثقبي Watch 3x8mm",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Watch 3x8mm (32.768kHz Cylindrical / Pitch 2.54mm)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Watch 3x8mm",
    "params": {
      "mounting": "THT",
      "packageType": "TuningFork_3x8",
      "packageSize": "TuningFork_3x8",
      "reference": "Y",
      "value": "XTAL_Watch 3x8mm"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "TuningFork_3x8"
    ]
  },
  {
    "id": "xtal-tht-Resonator_3Pin_P2.54",
    "familyId": "crystal",
    "presetId": "Resonator_3Pin_P2.54",
    "name": "XTAL_Resonator 3P",
    "nameAr": "كريستال ثقبي Resonator 3P",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Resonator 3P (Ceramic 3-Pin / Built-in Caps)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Resonator 3P",
    "params": {
      "mounting": "THT",
      "packageType": "Resonator_3Pin_P2.54",
      "packageSize": "Resonator_3Pin_P2.54",
      "reference": "Y",
      "value": "XTAL_Resonator 3P"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "Resonator_3Pin_P2.54"
    ]
  },
  {
    "id": "xtal-tht-Oscillator_DIP-8",
    "familyId": "crystal",
    "presetId": "Oscillator_DIP-8",
    "name": "XTAL_Osc DIP-8",
    "nameAr": "كريستال ثقبي Osc DIP-8",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Osc DIP-8 (Half Size Clock / Pitch 7.62x5.08mm)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Osc DIP-8",
    "params": {
      "mounting": "THT",
      "packageType": "Oscillator_DIP-8",
      "packageSize": "Oscillator_DIP-8",
      "reference": "Y",
      "value": "XTAL_Osc DIP-8"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "Oscillator_DIP-8"
    ]
  },
  {
    "id": "xtal-tht-Oscillator_DIP-14",
    "familyId": "crystal",
    "presetId": "Oscillator_DIP-14",
    "name": "XTAL_Osc DIP-14",
    "nameAr": "كريستال ثقبي Osc DIP-14",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Osc DIP-14 (Full Size Clock / Pitch 15.24x7.62mm)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Osc DIP-14",
    "params": {
      "mounting": "THT",
      "packageType": "Oscillator_DIP-14",
      "packageSize": "Oscillator_DIP-14",
      "reference": "Y",
      "value": "XTAL_Osc DIP-14"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "Oscillator_DIP-14"
    ]
  },
  {
    "id": "xtal-tht-HC-49_Horizontal",
    "familyId": "crystal",
    "presetId": "HC-49_Horizontal",
    "name": "XTAL_HC-49 Horiz",
    "nameAr": "كريستال ثقبي HC-49 Horiz",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can HC-49 Horiz (Laying flat with ground tab)",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس HC-49 Horiz",
    "params": {
      "mounting": "THT",
      "packageType": "HC-49_Horizontal",
      "packageSize": "HC-49_Horizontal",
      "reference": "Y",
      "value": "XTAL_HC-49 Horiz"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "HC-49_Horizontal"
    ]
  },
  {
    "id": "xtal-tht-TuningFork_1x5",
    "familyId": "crystal",
    "presetId": "TuningFork_1x5",
    "name": "XTAL_Watch 1.5x5mm",
    "nameAr": "كريستال ثقبي Watch 1.5x5mm",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Watch 1.5x5mm ()",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Watch 1.5x5mm",
    "params": {
      "mounting": "THT",
      "packageType": "TuningFork_1x5",
      "packageSize": "TuningFork_1x5",
      "reference": "Y",
      "value": "XTAL_Watch 1.5x5mm"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "TuningFork_1x5"
    ]
  },
  {
    "id": "xtal-tht-Resonator_2Pin_P2.54",
    "familyId": "crystal",
    "presetId": "Resonator_2Pin_P2.54",
    "name": "XTAL_Resonator 2P",
    "nameAr": "كريستال ثقبي Resonator 2P",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Resonator 2P ()",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Resonator 2P",
    "params": {
      "mounting": "THT",
      "packageType": "Resonator_2Pin_P2.54",
      "packageSize": "Resonator_2Pin_P2.54",
      "reference": "Y",
      "value": "XTAL_Resonator 2P"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "Resonator_2Pin_P2.54"
    ]
  },
  {
    "id": "xtal-tht-Resonator_3Pin_P5.0",
    "familyId": "crystal",
    "presetId": "Resonator_3Pin_P5.0",
    "name": "XTAL_Resonator 3P (P5.0)",
    "nameAr": "كريستال ثقبي Resonator 3P (P5.0)",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can Resonator 3P (P5.0) ()",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس Resonator 3P (P5.0)",
    "params": {
      "mounting": "THT",
      "packageType": "Resonator_3Pin_P5.0",
      "packageSize": "Resonator_3Pin_P5.0",
      "reference": "Y",
      "value": "XTAL_Resonator 3P (P5.0)"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "Resonator_3Pin_P5.0"
    ]
  },
  {
    "id": "xtal-tht-HC-49/S_H2.5",
    "familyId": "crystal",
    "presetId": "HC-49/S_H2.5",
    "name": "XTAL_HC-49/S (H2.5)",
    "nameAr": "كريستال ثقبي HC-49/S (H2.5)",
    "category": "crystal",
    "categoryName": "Crystals & Oscillators",
    "categoryNameAr": "الكريستال والمذبذبات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "4.88mm Pitch",
    "description": "Through-Hole Crystal Can HC-49/S (H2.5) ()",
    "descriptionAr": "بلورة كريستال ثقبية THT قياس HC-49/S (H2.5)",
    "params": {
      "mounting": "THT",
      "packageType": "HC-49/S_H2.5",
      "packageSize": "HC-49/S_H2.5",
      "reference": "Y",
      "value": "XTAL_HC-49/S (H2.5)"
    },
    "tags": [
      "crystal",
      "oscillator",
      "rtc",
      "tht",
      "HC-49/S_H2.5"
    ]
  },
  {
    "id": "sw-smd-Tactile_6x6mm_SMD",
    "familyId": "switch_relay",
    "presetId": "Tactile_6x6mm_SMD",
    "name": "Tactile 6x6mm SMD",
    "nameAr": "مفتاح سطحي Tactile 6x6mm SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch Tactile 6x6mm SMD (4-Lead Gullwing 6×6 mm)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس Tactile 6x6mm SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Tactile_6x6mm_SMD",
      "packageSize": "Tactile_6x6mm_SMD",
      "reference": "SW",
      "value": "Tactile 6x6mm SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "Tactile_6x6mm_SMD"
    ]
  },
  {
    "id": "sw-smd-Pushbutton_SMD_3x4mm",
    "familyId": "switch_relay",
    "presetId": "Pushbutton_SMD_3x4mm",
    "name": "Tactile 3x4mm SMD",
    "nameAr": "مفتاح سطحي Tactile 3x4mm SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch Tactile 3x4mm SMD (2-Lead ultra-miniature 3×4 mm)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس Tactile 3x4mm SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Pushbutton_SMD_3x4mm",
      "packageSize": "Pushbutton_SMD_3x4mm",
      "reference": "SW",
      "value": "Tactile 3x4mm SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "Pushbutton_SMD_3x4mm"
    ]
  },
  {
    "id": "sw-smd-Tactile_3x6mm_SMD",
    "familyId": "switch_relay",
    "presetId": "Tactile_3x6mm_SMD",
    "name": "Tactile 3x6mm SMD",
    "nameAr": "مفتاح سطحي Tactile 3x6mm SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch Tactile 3x6mm SMD (2-Lead miniature side/top)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس Tactile 3x6mm SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Tactile_3x6mm_SMD",
      "packageSize": "Tactile_3x6mm_SMD",
      "reference": "SW",
      "value": "Tactile 3x6mm SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "Tactile_3x6mm_SMD"
    ]
  },
  {
    "id": "sw-smd-Tactile_4x4mm_SMD",
    "familyId": "switch_relay",
    "presetId": "Tactile_4x4mm_SMD",
    "name": "Tactile 4x4mm SMD",
    "nameAr": "مفتاح سطحي Tactile 4x4mm SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch Tactile 4x4mm SMD (4-Lead sealed micro switch)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس Tactile 4x4mm SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Tactile_4x4mm_SMD",
      "packageSize": "Tactile_4x4mm_SMD",
      "reference": "SW",
      "value": "Tactile 4x4mm SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "Tactile_4x4mm_SMD"
    ]
  },
  {
    "id": "sw-smd-SlideSwitch_SMD_SPDT",
    "familyId": "switch_relay",
    "presetId": "SlideSwitch_SMD_SPDT",
    "name": "Slide Switch SPDT SMD",
    "nameAr": "مفتاح سطحي Slide Switch SPDT SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch Slide Switch SPDT SMD (3-Pin SMT miniature slide switch)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس Slide Switch SPDT SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "SlideSwitch_SMD_SPDT",
      "packageSize": "SlideSwitch_SMD_SPDT",
      "reference": "SW",
      "value": "Slide Switch SPDT SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "SlideSwitch_SMD_SPDT"
    ]
  },
  {
    "id": "sw-smd-DIP_Switch_SMD_2Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_SMD_2Pos",
    "name": "DIP Switch 2-Pos SMD",
    "nameAr": "مفتاح سطحي DIP Switch 2-Pos SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch DIP Switch 2-Pos SMD (2-Position Gullwing SMT)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس DIP Switch 2-Pos SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "DIP_Switch_SMD_2Pos",
      "packageSize": "DIP_Switch_SMD_2Pos",
      "reference": "SW",
      "value": "DIP Switch 2-Pos SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "DIP_Switch_SMD_2Pos"
    ]
  },
  {
    "id": "sw-smd-DIP_Switch_SMD_4Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_SMD_4Pos",
    "name": "DIP Switch 4-Pos SMD",
    "nameAr": "مفتاح سطحي DIP Switch 4-Pos SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch DIP Switch 4-Pos SMD (4-Position Gullwing SMT)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس DIP Switch 4-Pos SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "DIP_Switch_SMD_4Pos",
      "packageSize": "DIP_Switch_SMD_4Pos",
      "reference": "SW",
      "value": "DIP Switch 4-Pos SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "DIP_Switch_SMD_4Pos"
    ]
  },
  {
    "id": "sw-smd-DIP_Switch_SMD_8Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_SMD_8Pos",
    "name": "DIP Switch 8-Pos SMD",
    "nameAr": "مفتاح سطحي DIP Switch 8-Pos SMD",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch DIP Switch 8-Pos SMD (8-Position Gullwing SMT)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس DIP Switch 8-Pos SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "DIP_Switch_SMD_8Pos",
      "packageSize": "DIP_Switch_SMD_8Pos",
      "reference": "SW",
      "value": "DIP Switch 8-Pos SMD"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "DIP_Switch_SMD_8Pos"
    ]
  },
  {
    "id": "sw-smd-Relay_PhotoMOS_SOP4",
    "familyId": "switch_relay",
    "presetId": "Relay_PhotoMOS_SOP4",
    "name": "PhotoMOS Relay SOP-4",
    "nameAr": "مفتاح سطحي PhotoMOS Relay SOP-4",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "4.5mm",
    "description": "SMD Pushbutton / Switch PhotoMOS Relay SOP-4 (Solid State Relay 4-Pin SOP)",
    "descriptionAr": "زر ضغط أو مفتاح سطحي SMD قياس PhotoMOS Relay SOP-4",
    "params": {
      "mounting": "SMD",
      "packageType": "Relay_PhotoMOS_SOP4",
      "packageSize": "Relay_PhotoMOS_SOP4",
      "reference": "SW",
      "value": "PhotoMOS Relay SOP-4"
    },
    "tags": [
      "switch",
      "button",
      "tactile",
      "smd",
      "Relay_PhotoMOS_SOP4"
    ]
  },
  {
    "id": "sw-tht-Tactile_6x6mm_THT",
    "familyId": "switch_relay",
    "presetId": "Tactile_6x6mm_THT",
    "name": "Tactile 6mm",
    "nameAr": "مفتاح / مرحل ثقبي Tactile 6mm",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Tactile 6mm (4-Pin 6.5x4.5mm)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Tactile 6mm",
    "params": {
      "mounting": "THT",
      "packageType": "Tactile_6x6mm_THT",
      "packageSize": "Tactile_6x6mm_THT",
      "reference": "SW",
      "value": "Tactile 6mm"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Tactile_6x6mm_THT"
    ]
  },
  {
    "id": "sw-tht-Tactile_12x12mm_THT",
    "familyId": "switch_relay",
    "presetId": "Tactile_12x12mm_THT",
    "name": "Tactile 12mm",
    "nameAr": "مفتاح / مرحل ثقبي Tactile 12mm",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Tactile 12mm (4-Pin 12.5x5.0mm)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Tactile 12mm",
    "params": {
      "mounting": "THT",
      "packageType": "Tactile_12x12mm_THT",
      "packageSize": "Tactile_12x12mm_THT",
      "reference": "SW",
      "value": "Tactile 12mm"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Tactile_12x12mm_THT"
    ]
  },
  {
    "id": "sw-tht-SlideSwitch_SPDT_P2.54mm",
    "familyId": "switch_relay",
    "presetId": "SlideSwitch_SPDT_P2.54mm",
    "name": "Slide SPDT",
    "nameAr": "مفتاح / مرحل ثقبي Slide SPDT",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Slide SPDT (3-Pin 2.54mm)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Slide SPDT",
    "params": {
      "mounting": "THT",
      "packageType": "SlideSwitch_SPDT_P2.54mm",
      "packageSize": "SlideSwitch_SPDT_P2.54mm",
      "reference": "SW",
      "value": "Slide SPDT"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "SlideSwitch_SPDT_P2.54mm"
    ]
  },
  {
    "id": "sw-tht-DIP_Switch_4Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_4Pos",
    "name": "DIP 4P",
    "nameAr": "مفتاح / مرحل ثقبي DIP 4P",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay DIP 4P (Pitch 2.54mm)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس DIP 4P",
    "params": {
      "mounting": "THT",
      "packageType": "DIP_Switch_4Pos",
      "packageSize": "DIP_Switch_4Pos",
      "reference": "SW",
      "value": "DIP 4P"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "DIP_Switch_4Pos"
    ]
  },
  {
    "id": "sw-tht-DIP_Switch_8Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_8Pos",
    "name": "DIP 8P",
    "nameAr": "مفتاح / مرحل ثقبي DIP 8P",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay DIP 8P (Pitch 2.54mm)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس DIP 8P",
    "params": {
      "mounting": "THT",
      "packageType": "DIP_Switch_8Pos",
      "packageSize": "DIP_Switch_8Pos",
      "reference": "SW",
      "value": "DIP 8P"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "DIP_Switch_8Pos"
    ]
  },
  {
    "id": "sw-tht-Relay_SPDT_Songle_SRD",
    "familyId": "switch_relay",
    "presetId": "Relay_SPDT_Songle_SRD",
    "name": "Songle 10A",
    "nameAr": "مفتاح / مرحل ثقبي Songle 10A",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Songle 10A (SPDT 5-Pin)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Songle 10A",
    "params": {
      "mounting": "THT",
      "packageType": "Relay_SPDT_Songle_SRD",
      "packageSize": "Relay_SPDT_Songle_SRD",
      "reference": "SW",
      "value": "Songle 10A"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Relay_SPDT_Songle_SRD"
    ]
  },
  {
    "id": "sw-tht-Relay_DPDT_Telecom",
    "familyId": "switch_relay",
    "presetId": "Relay_DPDT_Telecom",
    "name": "Telecom",
    "nameAr": "مفتاح / مرحل ثقبي Telecom",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Telecom (DPDT 8-Pin)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Telecom",
    "params": {
      "mounting": "THT",
      "packageType": "Relay_DPDT_Telecom",
      "packageSize": "Relay_DPDT_Telecom",
      "reference": "SW",
      "value": "Telecom"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Relay_DPDT_Telecom"
    ]
  },
  {
    "id": "sw-tht-Relay_SolidState_SIP4",
    "familyId": "switch_relay",
    "presetId": "Relay_SolidState_SIP4",
    "name": "SSR SIP-4",
    "nameAr": "مفتاح / مرحل ثقبي SSR SIP-4",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay SSR SIP-4 (4-Pin SIP)",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس SSR SIP-4",
    "params": {
      "mounting": "THT",
      "packageType": "Relay_SolidState_SIP4",
      "packageSize": "Relay_SolidState_SIP4",
      "reference": "SW",
      "value": "SSR SIP-4"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Relay_SolidState_SIP4"
    ]
  },
  {
    "id": "sw-tht-Tactile_6x6mm_2Pin",
    "familyId": "switch_relay",
    "presetId": "Tactile_6x6mm_2Pin",
    "name": "Tactile Switch 6x6mm 2-Pin (Pitch 6.5mm)",
    "nameAr": "مفتاح / مرحل ثقبي Tactile Switch 6x6mm 2-Pin (Pitch 6.5mm)",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Tactile Switch 6x6mm 2-Pin (Pitch 6.5mm) ()",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Tactile Switch 6x6mm 2-Pin (Pitch 6.5mm)",
    "params": {
      "mounting": "THT",
      "packageType": "Tactile_6x6mm_2Pin",
      "packageSize": "Tactile_6x6mm_2Pin",
      "reference": "SW",
      "value": "Tactile Switch 6x6mm 2-Pin (Pitch 6.5mm)"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Tactile_6x6mm_2Pin"
    ]
  },
  {
    "id": "sw-tht-Tactile_RightAngle_6x6mm",
    "familyId": "switch_relay",
    "presetId": "Tactile_RightAngle_6x6mm",
    "name": "Tactile Right-Angle 6x6mm Side Push",
    "nameAr": "مفتاح / مرحل ثقبي Tactile Right-Angle 6x6mm Side Push",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Tactile Right-Angle 6x6mm Side Push ()",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Tactile Right-Angle 6x6mm Side Push",
    "params": {
      "mounting": "THT",
      "packageType": "Tactile_RightAngle_6x6mm",
      "packageSize": "Tactile_RightAngle_6x6mm",
      "reference": "SW",
      "value": "Tactile Right-Angle 6x6mm Side Push"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Tactile_RightAngle_6x6mm"
    ]
  },
  {
    "id": "sw-tht-SlideSwitch_DPDT_P2.54mm",
    "familyId": "switch_relay",
    "presetId": "SlideSwitch_DPDT_P2.54mm",
    "name": "Slide Switch DPDT 6-Pin (Pitch 2.54mm)",
    "nameAr": "مفتاح / مرحل ثقبي Slide Switch DPDT 6-Pin (Pitch 2.54mm)",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Slide Switch DPDT 6-Pin (Pitch 2.54mm) ()",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Slide Switch DPDT 6-Pin (Pitch 2.54mm)",
    "params": {
      "mounting": "THT",
      "packageType": "SlideSwitch_DPDT_P2.54mm",
      "packageSize": "SlideSwitch_DPDT_P2.54mm",
      "reference": "SW",
      "value": "Slide Switch DPDT 6-Pin (Pitch 2.54mm)"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "SlideSwitch_DPDT_P2.54mm"
    ]
  },
  {
    "id": "sw-tht-DIP_Switch_2Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_2Pos",
    "name": "DIP Switch 2-Position THT",
    "nameAr": "مفتاح / مرحل ثقبي DIP Switch 2-Position THT",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay DIP Switch 2-Position THT ()",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس DIP Switch 2-Position THT",
    "params": {
      "mounting": "THT",
      "packageType": "DIP_Switch_2Pos",
      "packageSize": "DIP_Switch_2Pos",
      "reference": "SW",
      "value": "DIP Switch 2-Position THT"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "DIP_Switch_2Pos"
    ]
  },
  {
    "id": "sw-tht-DIP_Switch_6Pos",
    "familyId": "switch_relay",
    "presetId": "DIP_Switch_6Pos",
    "name": "DIP Switch 6-Position THT",
    "nameAr": "مفتاح / مرحل ثقبي DIP Switch 6-Position THT",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay DIP Switch 6-Position THT ()",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس DIP Switch 6-Position THT",
    "params": {
      "mounting": "THT",
      "packageType": "DIP_Switch_6Pos",
      "packageSize": "DIP_Switch_6Pos",
      "reference": "SW",
      "value": "DIP Switch 6-Position THT"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "DIP_Switch_6Pos"
    ]
  },
  {
    "id": "sw-tht-Relay_Power_G2R_16A",
    "familyId": "switch_relay",
    "presetId": "Relay_Power_G2R_16A",
    "name": "Omron G2R-1 Power Relay 16A 8-Pin",
    "nameAr": "مفتاح / مرحل ثقبي Omron G2R-1 Power Relay 16A 8-Pin",
    "category": "switch_relay",
    "categoryName": "Switches & Relays",
    "categoryNameAr": "المفاتيح والمرحلات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "6.5mm",
    "description": "Through-Hole Switch / Relay Omron G2R-1 Power Relay 16A 8-Pin ()",
    "descriptionAr": "مفتاح أو مرحل ثقبي THT قياس Omron G2R-1 Power Relay 16A 8-Pin",
    "params": {
      "mounting": "THT",
      "packageType": "Relay_Power_G2R_16A",
      "packageSize": "Relay_Power_G2R_16A",
      "reference": "K",
      "value": "Omron G2R-1 Power Relay 16A 8-Pin"
    },
    "tags": [
      "switch",
      "relay",
      "tht",
      "Relay_Power_G2R_16A"
    ]
  },
  {
    "id": "fuse-smd-Fuse_SMD_0603",
    "familyId": "fuse_protection",
    "presetId": "Fuse_SMD_0603",
    "name": "Fuse 0603",
    "nameAr": "حماية / فيوز سطحي Fuse 0603",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Fuse / TVS Protection Fuse 0603 ()",
    "descriptionAr": "فيوز أو عنصر حماية سطحي SMD قياس Fuse 0603",
    "params": {
      "mounting": "SMD",
      "packageType": "Fuse_SMD_0603",
      "packageSize": "Fuse_SMD_0603",
      "reference": "F",
      "value": "Fuse 0603"
    },
    "tags": [
      "fuse",
      "tvs",
      "protection",
      "smd",
      "Fuse_SMD_0603"
    ]
  },
  {
    "id": "fuse-smd-Fuse_SMD_0805",
    "familyId": "fuse_protection",
    "presetId": "Fuse_SMD_0805",
    "name": "Fuse 0805",
    "nameAr": "حماية / فيوز سطحي Fuse 0805",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Fuse / TVS Protection Fuse 0805 ()",
    "descriptionAr": "فيوز أو عنصر حماية سطحي SMD قياس Fuse 0805",
    "params": {
      "mounting": "SMD",
      "packageType": "Fuse_SMD_0805",
      "packageSize": "Fuse_SMD_0805",
      "reference": "F",
      "value": "Fuse 0805"
    },
    "tags": [
      "fuse",
      "tvs",
      "protection",
      "smd",
      "Fuse_SMD_0805"
    ]
  },
  {
    "id": "fuse-smd-Fuse_SMD_1206",
    "familyId": "fuse_protection",
    "presetId": "Fuse_SMD_1206",
    "name": "Fuse 1206",
    "nameAr": "حماية / فيوز سطحي Fuse 1206",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Fuse / TVS Protection Fuse 1206 ()",
    "descriptionAr": "فيوز أو عنصر حماية سطحي SMD قياس Fuse 1206",
    "params": {
      "mounting": "SMD",
      "packageType": "Fuse_SMD_1206",
      "packageSize": "Fuse_SMD_1206",
      "reference": "F",
      "value": "Fuse 1206"
    },
    "tags": [
      "fuse",
      "tvs",
      "protection",
      "smd",
      "Fuse_SMD_1206"
    ]
  },
  {
    "id": "fuse-smd-Fuse_SMD_1812",
    "familyId": "fuse_protection",
    "presetId": "Fuse_SMD_1812",
    "name": "Fuse 1812",
    "nameAr": "حماية / فيوز سطحي Fuse 1812",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Fuse / TVS Protection Fuse 1812 ()",
    "descriptionAr": "فيوز أو عنصر حماية سطحي SMD قياس Fuse 1812",
    "params": {
      "mounting": "SMD",
      "packageType": "Fuse_SMD_1812",
      "packageSize": "Fuse_SMD_1812",
      "reference": "F",
      "value": "Fuse 1812"
    },
    "tags": [
      "fuse",
      "tvs",
      "protection",
      "smd",
      "Fuse_SMD_1812"
    ]
  },
  {
    "id": "fuse-smd-TVS_SMAJ",
    "familyId": "fuse_protection",
    "presetId": "TVS_SMAJ",
    "name": "TVS SMAJ",
    "nameAr": "حماية / فيوز سطحي TVS SMAJ",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Fuse / TVS Protection TVS SMAJ ()",
    "descriptionAr": "فيوز أو عنصر حماية سطحي SMD قياس TVS SMAJ",
    "params": {
      "mounting": "SMD",
      "packageType": "TVS_SMAJ",
      "packageSize": "TVS_SMAJ",
      "reference": "F",
      "value": "TVS SMAJ"
    },
    "tags": [
      "fuse",
      "tvs",
      "protection",
      "smd",
      "TVS_SMAJ"
    ]
  },
  {
    "id": "fuse-smd-TVS_SMBJ",
    "familyId": "fuse_protection",
    "presetId": "TVS_SMBJ",
    "name": "TVS SMBJ",
    "nameAr": "حماية / فيوز سطحي TVS SMBJ",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Fuse / TVS Protection TVS SMBJ ()",
    "descriptionAr": "فيوز أو عنصر حماية سطحي SMD قياس TVS SMBJ",
    "params": {
      "mounting": "SMD",
      "packageType": "TVS_SMBJ",
      "packageSize": "TVS_SMBJ",
      "reference": "F",
      "value": "TVS SMBJ"
    },
    "tags": [
      "fuse",
      "tvs",
      "protection",
      "smd",
      "TVS_SMBJ"
    ]
  },
  {
    "id": "fuse-tht-Fuseholder_5x20mm_THT",
    "familyId": "fuse_protection",
    "presetId": "Fuseholder_5x20mm_THT",
    "name": "Fuse 5x20",
    "nameAr": "فيوز / حماية ثقبي Fuse 5x20",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Fuse / Varistor Fuse 5x20 ()",
    "descriptionAr": "فيوز زجاجي أو فاريستور حماية ثقبي THT قياس Fuse 5x20",
    "params": {
      "mounting": "THT",
      "packageType": "Fuseholder_5x20mm_THT",
      "packageSize": "Fuseholder_5x20mm_THT",
      "reference": "F",
      "value": "Fuse 5x20"
    },
    "tags": [
      "fuse",
      "varistor",
      "protection",
      "tht",
      "Fuseholder_5x20mm_THT"
    ]
  },
  {
    "id": "fuse-tht-Varistor_MOV_10D",
    "familyId": "fuse_protection",
    "presetId": "Varistor_MOV_10D",
    "name": "Var MOV 10D",
    "nameAr": "فيوز / حماية ثقبي Var MOV 10D",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Fuse / Varistor Var MOV 10D ()",
    "descriptionAr": "فيوز زجاجي أو فاريستور حماية ثقبي THT قياس Var MOV 10D",
    "params": {
      "mounting": "THT",
      "packageType": "Varistor_MOV_10D",
      "packageSize": "Varistor_MOV_10D",
      "reference": "F",
      "value": "Var MOV 10D"
    },
    "tags": [
      "fuse",
      "varistor",
      "protection",
      "tht",
      "Varistor_MOV_10D"
    ]
  },
  {
    "id": "fuse-tht-Fuseholder_6.3x32mm",
    "familyId": "fuse_protection",
    "presetId": "Fuseholder_6.3x32mm",
    "name": "Fuse 6.3x32",
    "nameAr": "فيوز / حماية ثقبي Fuse 6.3x32",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Fuse / Varistor Fuse 6.3x32 ()",
    "descriptionAr": "فيوز زجاجي أو فاريستور حماية ثقبي THT قياس Fuse 6.3x32",
    "params": {
      "mounting": "THT",
      "packageType": "Fuseholder_6.3x32mm",
      "packageSize": "Fuseholder_6.3x32mm",
      "reference": "F",
      "value": "Fuse 6.3x32"
    },
    "tags": [
      "fuse",
      "varistor",
      "protection",
      "tht",
      "Fuseholder_6.3x32mm"
    ]
  },
  {
    "id": "fuse-tht-Varistor_MOV_7D",
    "familyId": "fuse_protection",
    "presetId": "Varistor_MOV_7D",
    "name": "Var MOV 7D",
    "nameAr": "فيوز / حماية ثقبي Var MOV 7D",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Fuse / Varistor Var MOV 7D ()",
    "descriptionAr": "فيوز زجاجي أو فاريستور حماية ثقبي THT قياس Var MOV 7D",
    "params": {
      "mounting": "THT",
      "packageType": "Varistor_MOV_7D",
      "packageSize": "Varistor_MOV_7D",
      "reference": "F",
      "value": "Var MOV 7D"
    },
    "tags": [
      "fuse",
      "varistor",
      "protection",
      "tht",
      "Varistor_MOV_7D"
    ]
  },
  {
    "id": "fuse-tht-Varistor_MOV_14D",
    "familyId": "fuse_protection",
    "presetId": "Varistor_MOV_14D",
    "name": "Var MOV 14D",
    "nameAr": "فيوز / حماية ثقبي Var MOV 14D",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Fuse / Varistor Var MOV 14D ()",
    "descriptionAr": "فيوز زجاجي أو فاريستور حماية ثقبي THT قياس Var MOV 14D",
    "params": {
      "mounting": "THT",
      "packageType": "Varistor_MOV_14D",
      "packageSize": "Varistor_MOV_14D",
      "reference": "F",
      "value": "Var MOV 14D"
    },
    "tags": [
      "fuse",
      "varistor",
      "protection",
      "tht",
      "Varistor_MOV_14D"
    ]
  },
  {
    "id": "fuse-tht-GDT_2Pin_P5mm",
    "familyId": "fuse_protection",
    "presetId": "GDT_2Pin_P5mm",
    "name": "GDT 2P",
    "nameAr": "فيوز / حماية ثقبي GDT 2P",
    "category": "protection",
    "categoryName": "Fuses & Protection",
    "categoryNameAr": "الحماية والفيوزات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "22.5mm Pitch",
    "description": "Through-Hole Fuse / Varistor GDT 2P ()",
    "descriptionAr": "فيوز زجاجي أو فاريستور حماية ثقبي THT قياس GDT 2P",
    "params": {
      "mounting": "THT",
      "packageType": "GDT_2Pin_P5mm",
      "packageSize": "GDT_2Pin_P5mm",
      "reference": "F",
      "value": "GDT 2P"
    },
    "tags": [
      "fuse",
      "varistor",
      "protection",
      "tht",
      "GDT_2Pin_P5mm"
    ]
  },
  {
    "id": "pot-smd-Potentiometer_Bourns_3314G_SMD",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Bourns_3314G_SMD",
    "name": "3314G SMD",
    "nameAr": "مقاومة متغيرة سطحية 3314G SMD",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "SMD",
    "pinsText": "3 Pads",
    "pitchText": "SMD",
    "description": "SMD Trimmer Potentiometer 3314G SMD ()",
    "descriptionAr": "مقاومة متغيرة وضبط دقيق سطحية SMD قياس 3314G SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Potentiometer_Bourns_3314G_SMD",
      "packageSize": "Potentiometer_Bourns_3314G_SMD",
      "reference": "RV",
      "value": "3314G SMD"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "smd",
      "Potentiometer_Bourns_3314G_SMD"
    ]
  },
  {
    "id": "pot-smd-Potentiometer_Bourns_3314J_SMD",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Bourns_3314J_SMD",
    "name": "3314J SMD",
    "nameAr": "مقاومة متغيرة سطحية 3314J SMD",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "SMD",
    "pinsText": "3 Pads",
    "pitchText": "SMD",
    "description": "SMD Trimmer Potentiometer 3314J SMD ()",
    "descriptionAr": "مقاومة متغيرة وضبط دقيق سطحية SMD قياس 3314J SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Potentiometer_Bourns_3314J_SMD",
      "packageSize": "Potentiometer_Bourns_3314J_SMD",
      "reference": "RV",
      "value": "3314J SMD"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "smd",
      "Potentiometer_Bourns_3314J_SMD"
    ]
  },
  {
    "id": "pot-tht-Potentiometer_Trimmer_3296W",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Trimmer_3296W",
    "name": "Trim 3296W",
    "nameAr": "مقاومة متغيرة ثقبية Trim 3296W",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Potentiometer / Trimmer Trim 3296W ()",
    "descriptionAr": "مقاومة متغيرة دائرية أو تريمر ثقبي THT قياس Trim 3296W",
    "params": {
      "mounting": "THT",
      "packageType": "Potentiometer_Trimmer_3296W",
      "packageSize": "Potentiometer_Trimmer_3296W",
      "reference": "RV",
      "value": "Trim 3296W"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "tht",
      "Potentiometer_Trimmer_3296W"
    ]
  },
  {
    "id": "pot-tht-Potentiometer_Trimmer_3362P",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Trimmer_3362P",
    "name": "Trim 3362P",
    "nameAr": "مقاومة متغيرة ثقبية Trim 3362P",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Potentiometer / Trimmer Trim 3362P ()",
    "descriptionAr": "مقاومة متغيرة دائرية أو تريمر ثقبي THT قياس Trim 3362P",
    "params": {
      "mounting": "THT",
      "packageType": "Potentiometer_Trimmer_3362P",
      "packageSize": "Potentiometer_Trimmer_3362P",
      "reference": "RV",
      "value": "Trim 3362P"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "tht",
      "Potentiometer_Trimmer_3362P"
    ]
  },
  {
    "id": "pot-tht-Potentiometer_Rotary_Alpha16mm",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Rotary_Alpha16mm",
    "name": "Rot Alpha 16mm",
    "nameAr": "مقاومة متغيرة ثقبية Rot Alpha 16mm",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Potentiometer / Trimmer Rot Alpha 16mm ()",
    "descriptionAr": "مقاومة متغيرة دائرية أو تريمر ثقبي THT قياس Rot Alpha 16mm",
    "params": {
      "mounting": "THT",
      "packageType": "Potentiometer_Rotary_Alpha16mm",
      "packageSize": "Potentiometer_Rotary_Alpha16mm",
      "reference": "RV",
      "value": "Rot Alpha 16mm"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "tht",
      "Potentiometer_Rotary_Alpha16mm"
    ]
  },
  {
    "id": "pot-tht-Potentiometer_Rotary_9mm",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Rotary_9mm",
    "name": "Rot 9mm",
    "nameAr": "مقاومة متغيرة ثقبية Rot 9mm",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Potentiometer / Trimmer Rot 9mm ()",
    "descriptionAr": "مقاومة متغيرة دائرية أو تريمر ثقبي THT قياس Rot 9mm",
    "params": {
      "mounting": "THT",
      "packageType": "Potentiometer_Rotary_9mm",
      "packageSize": "Potentiometer_Rotary_9mm",
      "reference": "RV",
      "value": "Rot 9mm"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "tht",
      "Potentiometer_Rotary_9mm"
    ]
  },
  {
    "id": "pot-tht-Potentiometer_Slide_30mm",
    "familyId": "potentiometer",
    "presetId": "Potentiometer_Slide_30mm",
    "name": "Slide 30mm",
    "nameAr": "مقاومة متغيرة ثقبية Slide 30mm",
    "category": "potentiometer",
    "categoryName": "Potentiometers",
    "categoryNameAr": "مقاومات متغيرة",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Potentiometer / Trimmer Slide 30mm ()",
    "descriptionAr": "مقاومة متغيرة دائرية أو تريمر ثقبي THT قياس Slide 30mm",
    "params": {
      "mounting": "THT",
      "packageType": "Potentiometer_Slide_30mm",
      "packageSize": "Potentiometer_Slide_30mm",
      "reference": "RV",
      "value": "Slide 30mm"
    },
    "tags": [
      "potentiometer",
      "trimmer",
      "tht",
      "Potentiometer_Slide_30mm"
    ]
  },
  {
    "id": "opto-smd-Optocoupler_SMD-4",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_SMD-4",
    "name": "SMD-4 Gullwing",
    "nameAr": "عازل ضوئي سطحي SMD-4 Gullwing",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.54mm",
    "description": "SMD Optocoupler / Isolator SMD-4 Gullwing (4-Pin SMD PC817S (Pitch 2.54mm, Row 10.16mm))",
    "descriptionAr": "عازل ضوئي سطحي SMD قياس SMD-4 Gullwing",
    "params": {
      "mounting": "SMD",
      "packageType": "Optocoupler_SMD-4",
      "packageSize": "Optocoupler_SMD-4",
      "reference": "U",
      "value": "SMD-4 Gullwing"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "smd",
      "Optocoupler_SMD-4"
    ]
  },
  {
    "id": "opto-smd-Optocoupler_SMD-6",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_SMD-6",
    "name": "SMD-6 Gullwing",
    "nameAr": "عازل ضوئي سطحي SMD-6 Gullwing",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.54mm",
    "description": "SMD Optocoupler / Isolator SMD-6 Gullwing (6-Pin SMD 4N35S (Pitch 2.54mm, Row 10.16mm))",
    "descriptionAr": "عازل ضوئي سطحي SMD قياس SMD-6 Gullwing",
    "params": {
      "mounting": "SMD",
      "packageType": "Optocoupler_SMD-6",
      "packageSize": "Optocoupler_SMD-6",
      "reference": "U",
      "value": "SMD-6 Gullwing"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "smd",
      "Optocoupler_SMD-6"
    ]
  },
  {
    "id": "opto-smd-Optocoupler_SMD-8",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_SMD-8",
    "name": "SMD-8 Gullwing",
    "nameAr": "عازل ضوئي سطحي SMD-8 Gullwing",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.54mm",
    "description": "SMD Optocoupler / Isolator SMD-8 Gullwing (8-Pin SMD 6N137S (Pitch 2.54mm, Row 10.16mm))",
    "descriptionAr": "عازل ضوئي سطحي SMD قياس SMD-8 Gullwing",
    "params": {
      "mounting": "SMD",
      "packageType": "Optocoupler_SMD-8",
      "packageSize": "Optocoupler_SMD-8",
      "reference": "U",
      "value": "SMD-8 Gullwing"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "smd",
      "Optocoupler_SMD-8"
    ]
  },
  {
    "id": "opto-smd-Optocoupler_SOIC-4",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_SOIC-4",
    "name": "SOP-4 Mini-Flat",
    "nameAr": "عازل ضوئي سطحي SOP-4 Mini-Flat",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.54mm",
    "description": "SMD Optocoupler / Isolator SOP-4 Mini-Flat (4-Pin SOP (TLP291, Pitch 2.54mm, Row 7.0mm))",
    "descriptionAr": "عازل ضوئي سطحي SMD قياس SOP-4 Mini-Flat",
    "params": {
      "mounting": "SMD",
      "packageType": "Optocoupler_SOIC-4",
      "packageSize": "Optocoupler_SOIC-4",
      "reference": "U",
      "value": "SOP-4 Mini-Flat"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "smd",
      "Optocoupler_SOIC-4"
    ]
  },
  {
    "id": "opto-smd-Optocoupler_SOIC-8",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_SOIC-8",
    "name": "SOIC-8 Narrow",
    "nameAr": "عازل ضوئي سطحي SOIC-8 Narrow",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.54mm",
    "description": "SMD Optocoupler / Isolator SOIC-8 Narrow (8-Pin High Speed (Pitch 1.27mm, Row 6.0mm))",
    "descriptionAr": "عازل ضوئي سطحي SMD قياس SOIC-8 Narrow",
    "params": {
      "mounting": "SMD",
      "packageType": "Optocoupler_SOIC-8",
      "packageSize": "Optocoupler_SOIC-8",
      "reference": "U",
      "value": "SOIC-8 Narrow"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "smd",
      "Optocoupler_SOIC-8"
    ]
  },
  {
    "id": "opto-smd-Optocoupler_PhotoMOS_SOP4",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_PhotoMOS_SOP4",
    "name": "PhotoMOS SOP-4",
    "nameAr": "عازل ضوئي سطحي PhotoMOS SOP-4",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "2.54mm",
    "description": "SMD Optocoupler / Isolator PhotoMOS SOP-4 (4-Pin Solid State Relay SOP)",
    "descriptionAr": "عازل ضوئي سطحي SMD قياس PhotoMOS SOP-4",
    "params": {
      "mounting": "SMD",
      "packageType": "Optocoupler_PhotoMOS_SOP4",
      "packageSize": "Optocoupler_PhotoMOS_SOP4",
      "reference": "U",
      "value": "PhotoMOS SOP-4"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "smd",
      "Optocoupler_PhotoMOS_SOP4"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-4",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-4",
    "name": "DIP-4 Standard",
    "nameAr": "عازل ضوئي ثقبي DIP-4 Standard",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-4 Standard (PC817 / EL817 7.62mm Row Spacing)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-4 Standard",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-4",
      "packageSize": "Optocoupler_DIP-4",
      "reference": "U",
      "value": "DIP-4 Standard"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-4"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-4_Wide",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-4_Wide",
    "name": "DIP-4 Wide",
    "nameAr": "عازل ضوئي ثقبي DIP-4 Wide",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-4 Wide (10.16mm Spacing for High Isolation)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-4 Wide",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-4_Wide",
      "packageSize": "Optocoupler_DIP-4_Wide",
      "reference": "U",
      "value": "DIP-4 Wide"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-4_Wide"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-6",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-6",
    "name": "DIP-6 Standard",
    "nameAr": "عازل ضوئي ثقبي DIP-6 Standard",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-6 Standard (4N25 / 4N35 / MOC3021 7.62mm Spacing)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-6 Standard",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-6",
      "packageSize": "Optocoupler_DIP-6",
      "reference": "U",
      "value": "DIP-6 Standard"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-6"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-6_Wide",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-6_Wide",
    "name": "DIP-6 Wide",
    "nameAr": "عازل ضوئي ثقبي DIP-6 Wide",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-6 Wide (10.16mm Spacing for Mains Isolation)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-6 Wide",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-6_Wide",
      "packageSize": "Optocoupler_DIP-6_Wide",
      "reference": "U",
      "value": "DIP-6 Wide"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-6_Wide"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-8",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-8",
    "name": "DIP-8 Standard",
    "nameAr": "عازل ضوئي ثقبي DIP-8 Standard",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-8 Standard (6N137 High Speed / Dual Channel)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-8 Standard",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-8",
      "packageSize": "Optocoupler_DIP-8",
      "reference": "U",
      "value": "DIP-8 Standard"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-8"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-8_Wide",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-8_Wide",
    "name": "DIP-8 Wide",
    "nameAr": "عازل ضوئي ثقبي DIP-8 Wide",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-8 Wide (10.16mm Spacing for 5kV Isolation)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-8 Wide",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-8_Wide",
      "packageSize": "Optocoupler_DIP-8_Wide",
      "reference": "U",
      "value": "DIP-8 Wide"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-8_Wide"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_DIP-16",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_DIP-16",
    "name": "DIP-16 Quad Optocoupler",
    "nameAr": "عازل ضوئي ثقبي DIP-16 Quad Optocoupler",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler DIP-16 Quad Optocoupler (PC847 / Quad Isolator (16 Pins))",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس DIP-16 Quad Optocoupler",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_DIP-16",
      "packageSize": "Optocoupler_DIP-16",
      "reference": "U",
      "value": "DIP-16 Quad Optocoupler"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_DIP-16"
    ]
  },
  {
    "id": "opto-tht-Optocoupler_SIP-4",
    "familyId": "optocoupler",
    "presetId": "Optocoupler_SIP-4",
    "name": "SIP-4 Single Line",
    "nameAr": "عازل ضوئي ثقبي SIP-4 Single Line",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler SIP-4 Single Line (4-Pin Single In-line Opto Pitch 2.54mm)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس SIP-4 Single Line",
    "params": {
      "mounting": "THT",
      "packageType": "Optocoupler_SIP-4",
      "packageSize": "Optocoupler_SIP-4",
      "reference": "U",
      "value": "SIP-4 Single Line"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Optocoupler_SIP-4"
    ]
  },
  {
    "id": "opto-tht-Opto_Interrupter_Slot",
    "familyId": "optocoupler",
    "presetId": "Opto_Interrupter_Slot",
    "name": "Slot Interrupter",
    "nameAr": "عازل ضوئي ثقبي Slot Interrupter",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler Slot Interrupter (Optical Slot Sensor ITR9608)",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس Slot Interrupter",
    "params": {
      "mounting": "THT",
      "packageType": "Opto_Interrupter_Slot",
      "packageSize": "Opto_Interrupter_Slot",
      "reference": "U",
      "value": "Slot Interrupter"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Opto_Interrupter_Slot"
    ]
  },
  {
    "id": "opto-tht-Opto_Reflective_Sensor",
    "familyId": "optocoupler",
    "presetId": "Opto_Reflective_Sensor",
    "name": "Reflective Sensor",
    "nameAr": "عازل ضوئي ثقبي Reflective Sensor",
    "category": "opto",
    "categoryName": "Optocouplers",
    "categoryNameAr": "العوازل الضوئية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Through-Hole Optocoupler Reflective Sensor (Optical Reflective Sensor (TCRT5000))",
    "descriptionAr": "عازل ضوئي ثقبي DIP عبر الثقوب THT قياس Reflective Sensor",
    "params": {
      "mounting": "THT",
      "packageType": "Opto_Reflective_Sensor",
      "packageSize": "Opto_Reflective_Sensor",
      "reference": "U",
      "value": "Reflective Sensor"
    },
    "tags": [
      "optocoupler",
      "isolator",
      "tht",
      "Opto_Reflective_Sensor"
    ]
  },
  {
    "id": "bat-smd-Battery_CR2032_SMD_Keystone1058",
    "familyId": "batteries_power",
    "presetId": "Battery_CR2032_SMD_Keystone1058",
    "name": "CR2032 SMD Retainer",
    "nameAr": "حامل بطارية سطحي CR2032 SMD Retainer",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Coin Cell Battery Holder CR2032 SMD Retainer (Keystone 1058 / BK-912 Surface Mount)",
    "descriptionAr": "حامل بطارية قرصية سطحي SMD قياس CR2032 SMD Retainer",
    "params": {
      "mounting": "SMD",
      "packageType": "Battery_CR2032_SMD_Keystone1058",
      "packageSize": "Battery_CR2032_SMD_Keystone1058",
      "reference": "BT",
      "value": "CR2032 SMD Retainer"
    },
    "tags": [
      "battery",
      "cr2032",
      "power",
      "smd",
      "Battery_CR2032_SMD_Keystone1058"
    ]
  },
  {
    "id": "bat-smd-Battery_CR1220_SMD",
    "familyId": "batteries_power",
    "presetId": "Battery_CR1220_SMD",
    "name": "CR1220 SMD Holder",
    "nameAr": "حامل بطارية سطحي CR1220 SMD Holder",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Coin Cell Battery Holder CR1220 SMD Holder (12mm Micro Coin Cell SMT Holder)",
    "descriptionAr": "حامل بطارية قرصية سطحي SMD قياس CR1220 SMD Holder",
    "params": {
      "mounting": "SMD",
      "packageType": "Battery_CR1220_SMD",
      "packageSize": "Battery_CR1220_SMD",
      "reference": "BT",
      "value": "CR1220 SMD Holder"
    },
    "tags": [
      "battery",
      "cr2032",
      "power",
      "smd",
      "Battery_CR1220_SMD"
    ]
  },
  {
    "id": "bat-smd-Battery_CR2450_SMD",
    "familyId": "batteries_power",
    "presetId": "Battery_CR2450_SMD",
    "name": "CR2450 SMD Retainer",
    "nameAr": "حامل بطارية سطحي CR2450 SMD Retainer",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Coin Cell Battery Holder CR2450 SMD Retainer (24mm High Capacity Coin Cell SMT)",
    "descriptionAr": "حامل بطارية قرصية سطحي SMD قياس CR2450 SMD Retainer",
    "params": {
      "mounting": "SMD",
      "packageType": "Battery_CR2450_SMD",
      "packageSize": "Battery_CR2450_SMD",
      "reference": "BT",
      "value": "CR2450 SMD Retainer"
    },
    "tags": [
      "battery",
      "cr2032",
      "power",
      "smd",
      "Battery_CR2450_SMD"
    ]
  },
  {
    "id": "bat-smd-Connector_DCJack_SMD",
    "familyId": "batteries_power",
    "presetId": "Connector_DCJack_SMD",
    "name": "DC Barrel Jack 2.1mm SMD",
    "nameAr": "حامل بطارية سطحي DC Barrel Jack 2.1mm SMD",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "SMD",
    "description": "SMD Coin Cell Battery Holder DC Barrel Jack 2.1mm SMD (PJ-002A Surface Mount DC Power Jack)",
    "descriptionAr": "حامل بطارية قرصية سطحي SMD قياس DC Barrel Jack 2.1mm SMD",
    "params": {
      "mounting": "SMD",
      "packageType": "Connector_DCJack_SMD",
      "packageSize": "Connector_DCJack_SMD",
      "reference": "BT",
      "value": "DC Barrel Jack 2.1mm SMD"
    },
    "tags": [
      "battery",
      "cr2032",
      "power",
      "smd",
      "Connector_DCJack_SMD"
    ]
  },
  {
    "id": "bat-tht-Battery_CR2032_THT_Keystone3002",
    "familyId": "batteries_power",
    "presetId": "Battery_CR2032_THT_Keystone3002",
    "name": "CR2032 THT",
    "nameAr": "حامل بطارية ثقبي CR2032 THT",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips CR2032 THT (Keystone 3002 / Pitch 20.0mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس CR2032 THT",
    "params": {
      "mounting": "THT",
      "packageType": "Battery_CR2032_THT_Keystone3002",
      "packageSize": "Battery_CR2032_THT_Keystone3002",
      "reference": "BT",
      "value": "CR2032 THT"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Battery_CR2032_THT_Keystone3002"
    ]
  },
  {
    "id": "bat-tht-Battery_18650_Holder_Keystone1042",
    "familyId": "batteries_power",
    "presetId": "Battery_18650_Holder_Keystone1042",
    "name": "18650 Holder",
    "nameAr": "حامل بطارية ثقبي 18650 Holder",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips 18650 Holder (Li-Ion PCB Holder / Pitch 77.2mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس 18650 Holder",
    "params": {
      "mounting": "THT",
      "packageType": "Battery_18650_Holder_Keystone1042",
      "packageSize": "Battery_18650_Holder_Keystone1042",
      "reference": "BT",
      "value": "18650 Holder"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Battery_18650_Holder_Keystone1042"
    ]
  },
  {
    "id": "bat-tht-Battery_AA_Holder_Keystone2460",
    "familyId": "batteries_power",
    "presetId": "Battery_AA_Holder_Keystone2460",
    "name": "AA Holder",
    "nameAr": "حامل بطارية ثقبي AA Holder",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips AA Holder (1.5V Cell PCB Holder / Pitch 57.0mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس AA Holder",
    "params": {
      "mounting": "THT",
      "packageType": "Battery_AA_Holder_Keystone2460",
      "packageSize": "Battery_AA_Holder_Keystone2460",
      "reference": "BT",
      "value": "AA Holder"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Battery_AA_Holder_Keystone2460"
    ]
  },
  {
    "id": "bat-tht-Battery_AAA_Holder_Keystone2466",
    "familyId": "batteries_power",
    "presetId": "Battery_AAA_Holder_Keystone2466",
    "name": "AAA Holder",
    "nameAr": "حامل بطارية ثقبي AAA Holder",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips AAA Holder (1.5V Cell PCB Holder / Pitch 50.0mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس AAA Holder",
    "params": {
      "mounting": "THT",
      "packageType": "Battery_AAA_Holder_Keystone2466",
      "packageSize": "Battery_AAA_Holder_Keystone2466",
      "reference": "BT",
      "value": "AAA Holder"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Battery_AAA_Holder_Keystone2466"
    ]
  },
  {
    "id": "bat-tht-Connector_DCJack_2.1mm_THT",
    "familyId": "batteries_power",
    "presetId": "Connector_DCJack_2.1mm_THT",
    "name": "DC Jack 2.1mm",
    "nameAr": "حامل بطارية ثقبي DC Jack 2.1mm",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips DC Jack 2.1mm (Barrel Power Jack PJ-002AH 3-Pin)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس DC Jack 2.1mm",
    "params": {
      "mounting": "THT",
      "packageType": "Connector_DCJack_2.1mm_THT",
      "packageSize": "Connector_DCJack_2.1mm_THT",
      "reference": "BT",
      "value": "DC Jack 2.1mm"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Connector_DCJack_2.1mm_THT"
    ]
  },
  {
    "id": "bat-tht-Terminal_Block_2Pin_5.08mm",
    "familyId": "batteries_power",
    "presetId": "Terminal_Block_2Pin_5.08mm",
    "name": "Screw Term 2P",
    "nameAr": "حامل بطارية ثقبي Screw Term 2P",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips Screw Term 2P (Terminal Block 2-Pin Pitch 5.08mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس Screw Term 2P",
    "params": {
      "mounting": "THT",
      "packageType": "Terminal_Block_2Pin_5.08mm",
      "packageSize": "Terminal_Block_2Pin_5.08mm",
      "reference": "BT",
      "value": "Screw Term 2P"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Terminal_Block_2Pin_5.08mm"
    ]
  },
  {
    "id": "bat-tht-Connector_Power_XT60_THT",
    "familyId": "batteries_power",
    "presetId": "Connector_Power_XT60_THT",
    "name": "XT60 Male",
    "nameAr": "حامل بطارية ثقبي XT60 Male",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips XT60 Male (High Current 60A DC / Pitch 7.2mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس XT60 Male",
    "params": {
      "mounting": "THT",
      "packageType": "Connector_Power_XT60_THT",
      "packageSize": "Connector_Power_XT60_THT",
      "reference": "BT",
      "value": "XT60 Male"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Connector_Power_XT60_THT"
    ]
  },
  {
    "id": "bat-tht-Connector_Power_XT30_THT",
    "familyId": "batteries_power",
    "presetId": "Connector_Power_XT30_THT",
    "name": "XT30 Male",
    "nameAr": "حامل بطارية ثقبي XT30 Male",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips XT30 Male (Compact 30A DC / Pitch 5.0mm)",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس XT30 Male",
    "params": {
      "mounting": "THT",
      "packageType": "Connector_Power_XT30_THT",
      "packageSize": "Connector_Power_XT30_THT",
      "reference": "BT",
      "value": "XT30 Male"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Connector_Power_XT30_THT"
    ]
  },
  {
    "id": "bat-tht-Terminal_Block_3Pin_5.08mm",
    "familyId": "batteries_power",
    "presetId": "Terminal_Block_3Pin_5.08mm",
    "name": "Screw Terminal Block 3-Pin (Pitch 5.08mm)",
    "nameAr": "حامل بطارية ثقبي Screw Terminal Block 3-Pin (Pitch 5.08mm)",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips Screw Terminal Block 3-Pin (Pitch 5.08mm) ()",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس Screw Terminal Block 3-Pin (Pitch 5.08mm)",
    "params": {
      "mounting": "THT",
      "packageType": "Terminal_Block_3Pin_5.08mm",
      "packageSize": "Terminal_Block_3Pin_5.08mm",
      "reference": "BT",
      "value": "Screw Terminal Block 3-Pin (Pitch 5.08mm)"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Terminal_Block_3Pin_5.08mm"
    ]
  },
  {
    "id": "bat-tht-Terminal_Block_2Pin_3.81mm",
    "familyId": "batteries_power",
    "presetId": "Terminal_Block_2Pin_3.81mm",
    "name": "Eurostyle Terminal Block 2-Pin (Pitch 3.81mm)",
    "nameAr": "حامل بطارية ثقبي Eurostyle Terminal Block 2-Pin (Pitch 3.81mm)",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips Eurostyle Terminal Block 2-Pin (Pitch 3.81mm) ()",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس Eurostyle Terminal Block 2-Pin (Pitch 3.81mm)",
    "params": {
      "mounting": "THT",
      "packageType": "Terminal_Block_2Pin_3.81mm",
      "packageSize": "Terminal_Block_2Pin_3.81mm",
      "reference": "BT",
      "value": "Eurostyle Terminal Block 2-Pin (Pitch 3.81mm)"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Terminal_Block_2Pin_3.81mm"
    ]
  },
  {
    "id": "bat-tht-Battery_CR2450_THT",
    "familyId": "batteries_power",
    "presetId": "Battery_CR2450_THT",
    "name": "CR2450 Coin Cell Retainer THT (Pitch 24mm)",
    "nameAr": "حامل بطارية ثقبي CR2450 Coin Cell Retainer THT (Pitch 24mm)",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips CR2450 Coin Cell Retainer THT (Pitch 24mm) ()",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس CR2450 Coin Cell Retainer THT (Pitch 24mm)",
    "params": {
      "mounting": "THT",
      "packageType": "Battery_CR2450_THT",
      "packageSize": "Battery_CR2450_THT",
      "reference": "BT",
      "value": "CR2450 Coin Cell Retainer THT (Pitch 24mm)"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Battery_CR2450_THT"
    ]
  },
  {
    "id": "bat-tht-Battery_9V_Snap_Pins",
    "familyId": "batteries_power",
    "presetId": "Battery_9V_Snap_Pins",
    "name": "9V Battery Snap PCB Mount Pins (Pitch 12.7mm)",
    "nameAr": "حامل بطارية ثقبي 9V Battery Snap PCB Mount Pins (Pitch 12.7mm)",
    "category": "power",
    "categoryName": "Batteries & Power",
    "categoryNameAr": "البطاريات والتغذية",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "THT",
    "description": "Through-Hole Battery Holder / Clips 9V Battery Snap PCB Mount Pins (Pitch 12.7mm) ()",
    "descriptionAr": "حامل بطارية أو مشابك ثقبية THT قياس 9V Battery Snap PCB Mount Pins (Pitch 12.7mm)",
    "params": {
      "mounting": "THT",
      "packageType": "Battery_9V_Snap_Pins",
      "packageSize": "Battery_9V_Snap_Pins",
      "reference": "BT",
      "value": "9V Battery Snap PCB Mount Pins (Pitch 12.7mm)"
    },
    "tags": [
      "battery",
      "18650",
      "cr2032",
      "power",
      "tht",
      "Battery_9V_Snap_Pins"
    ]
  },
  {
    "id": "conn-if-usb-c-16p",
    "familyId": "connector_interface",
    "presetId": "usb-c-16p",
    "name": "USB Type-C Receptacle 16-Pin",
    "nameAr": "منفذ USB Type-C ذو 16 طرفاً (مختلط SMD/THT)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "Both",
    "pinsText": "16 Pins",
    "pitchText": "0.5mm/Hybrid",
    "description": "USB Type-C 16-Pin Receptacle Hybrid SMD with 4 THT Shield Tabs",
    "descriptionAr": "مقبس USB من النوع C بـ 16 طرفاً مع 4 أرجل تثبيت ثقبية للحماية",
    "params": {
      "packageType": "USB_C_Receptacle_16Pin",
      "reference": "J",
      "value": "USB_C_16P"
    },
    "tags": [
      "connector",
      "usb",
      "usb-c",
      "type-c",
      "smd",
      "tht"
    ]
  },
  {
    "id": "conn-if-usb-a-female",
    "familyId": "connector_interface",
    "presetId": "usb-a-female",
    "name": "USB Type-A Female Receptacle (THT)",
    "nameAr": "مقبس USB Type-A أنثى ثقبي (THT)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.0mm/2.5mm",
    "description": "USB Type-A Female Receptacle Right-Angle Through-Hole",
    "descriptionAr": "مقبس USB من النوع A أنثى بزاوية قائمة للتثبيت عبر الثقوب",
    "params": {
      "packageType": "USB_A_Receptacle_Female_THT",
      "reference": "J",
      "value": "USB_A_Female"
    },
    "tags": [
      "connector",
      "usb",
      "usb-a",
      "tht"
    ]
  },
  {
    "id": "conn-if-usb-micro-b",
    "familyId": "connector_interface",
    "presetId": "usb-micro-b",
    "name": "Micro-USB Type-B Receptacle (SMD)",
    "nameAr": "مقبس Micro-USB Type-B سطحي (SMD)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "Both",
    "pinsText": "5 Pins",
    "pitchText": "0.65mm",
    "description": "Micro-USB Type-B 5-Pin SMD Receptacle with 4 Shield Legs",
    "descriptionAr": "مقبس Micro-USB من النوع B ذو 5 أطراف سطحي مع 4 أرجل حماية ثقبية",
    "params": {
      "packageType": "Micro_USB_B_Receptacle_SMD",
      "reference": "J",
      "value": "Micro-USB"
    },
    "tags": [
      "connector",
      "usb",
      "micro-usb",
      "micro-b",
      "smd",
      "tht"
    ]
  },
  {
    "id": "conn-if-dc-jack-2.1mm",
    "familyId": "connector_interface",
    "presetId": "dc-jack-2.1mm",
    "name": "DC Barrel Jack 2.1mm (PJ-002A)",
    "nameAr": "منفذ طاقة DC جاك 2.1مم (THT)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "Custom",
    "description": "DC Power Barrel Jack 2.1mm ID / 5.5mm OD Horizontal",
    "descriptionAr": "جاك طاقة مستمر DC بقطر داخلي 2.1مم وخارجي 5.5مم أفقي ثقبي",
    "params": {
      "packageType": "BarrelJack_DC_2.1mm_PJ002A",
      "reference": "J",
      "value": "DC_Jack"
    },
    "tags": [
      "connector",
      "power",
      "dc",
      "jack",
      "tht"
    ]
  },
  {
    "id": "conn-if-rj45-magjack",
    "familyId": "connector_interface",
    "presetId": "rj45-magjack",
    "name": "RJ45 MagJack Ethernet 8P8C",
    "nameAr": "منفذ شبكة إيثرنت RJ45 مع محول مغناطيسي",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "1.02mm",
    "description": "RJ45 8P8C Modular Jack with Integrated Magnetics (MagJack) and Shield",
    "descriptionAr": "منفذ إيثرنت RJ45 مع محول مغناطيسي مدمج ومصابيح إشارة للحماية",
    "params": {
      "packageType": "RJ45_MagJack_Ethernet_8P",
      "reference": "J",
      "value": "RJ45"
    },
    "tags": [
      "connector",
      "ethernet",
      "rj45",
      "magjack",
      "tht"
    ]
  },
  {
    "id": "conn-if-jst-xh-2p",
    "familyId": "connector_interface",
    "presetId": "jst-xh-2p",
    "name": "JST-XH 2-Pin Header (2.54mm)",
    "nameAr": "موصّل JST-XH طرفين (2.54مم)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm",
    "description": "JST XH series 2-Pin Keyed Shrouded Header 2.54mm Pitch",
    "descriptionAr": "رأس توصيل JST عائلة XH ثنائي الأطراف بتباعد 2.54مم",
    "params": {
      "packageType": "JST_XH_2Pin_2.54mm",
      "reference": "J",
      "value": "JST_XH_2P"
    },
    "tags": [
      "connector",
      "jst",
      "xh",
      "tht",
      "2pin"
    ]
  },
  {
    "id": "conn-if-jst-xh-3p",
    "familyId": "connector_interface",
    "presetId": "jst-xh-3p",
    "name": "JST-XH 3-Pin Header (2.54mm)",
    "nameAr": "موصّل JST-XH ثلاث أطراف (2.54مم)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm",
    "description": "JST XH series 3-Pin Keyed Shrouded Header 2.54mm Pitch",
    "descriptionAr": "رأس توصيل JST عائلة XH ثلاثي الأطراف بتباعد 2.54مم",
    "params": {
      "packageType": "JST_XH_3Pin_2.54mm",
      "reference": "J",
      "value": "JST_XH_3P"
    },
    "tags": [
      "connector",
      "jst",
      "xh",
      "tht",
      "3pin"
    ]
  },
  {
    "id": "conn-if-jst-xh-4p",
    "familyId": "connector_interface",
    "presetId": "jst-xh-4p",
    "name": "JST-XH 4-Pin Header (2.54mm)",
    "nameAr": "موصّل JST-XH أربع أطراف (2.54مم)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm",
    "description": "JST XH series 4-Pin Keyed Shrouded Header 2.54mm Pitch",
    "descriptionAr": "رأس توصيل JST عائلة XH رباعي الأطراف بتباعد 2.54مم",
    "params": {
      "packageType": "JST_XH_4Pin_2.54mm",
      "reference": "J",
      "value": "JST_XH_4P"
    },
    "tags": [
      "connector",
      "jst",
      "xh",
      "tht",
      "4pin"
    ]
  },
  {
    "id": "conn-if-jst-ph-2p",
    "familyId": "connector_interface",
    "presetId": "jst-ph-2p",
    "name": "JST-PH 2-Pin Header (2.00mm)",
    "nameAr": "موصّل JST-PH طرفين (2.00مم)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.00mm",
    "description": "JST PH series 2-Pin Keyed Shrouded Header 2.00mm Pitch",
    "descriptionAr": "رأس توصيل JST عائلة PH ثنائي الأطراف بتباعد دقيق 2.00مم",
    "params": {
      "packageType": "JST_PH_2Pin_2.00mm",
      "reference": "J",
      "value": "JST_PH_2P"
    },
    "tags": [
      "connector",
      "jst",
      "ph",
      "tht",
      "2pin"
    ]
  },
  {
    "id": "conn-if-jst-ph-3p",
    "familyId": "connector_interface",
    "presetId": "jst-ph-3p",
    "name": "JST-PH 3-Pin Header (2.00mm)",
    "nameAr": "موصّل JST-PH ثلاث أطراف (2.00مم)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.00mm",
    "description": "JST PH series 3-Pin Keyed Shrouded Header 2.00mm Pitch",
    "descriptionAr": "رأس توصيل JST عائلة PH ثلاثي الأطراف بتباعد دقيق 2.00مم",
    "params": {
      "packageType": "JST_PH_3Pin_2.00mm",
      "reference": "J",
      "value": "JST_PH_3P"
    },
    "tags": [
      "connector",
      "jst",
      "ph",
      "tht",
      "3pin"
    ]
  },
  {
    "id": "conn-if-audio-3.5mm",
    "familyId": "connector_interface",
    "presetId": "audio-3.5mm",
    "name": "3.5mm Stereo Audio Jack (SJ-43514)",
    "nameAr": "منفذ سماعة صوت 3.5مم (THT)",
    "category": "connector",
    "categoryName": "Connectors & Interfaces",
    "categoryNameAr": "الموصلات والواجهات",
    "mounting": "THT",
    "pinsText": "5 Pins",
    "pitchText": "Custom",
    "description": "3.5mm Stereo Audio Jack TRRS Through-Hole Horizontal",
    "descriptionAr": "منفذ صوت ستيريو 3.5مم TRRS أفقي ثقبي مع دبابيس تحويل مدمجة",
    "params": {
      "packageType": "AudioJack_3.5mm_SJ43514",
      "reference": "J",
      "value": "AudioJack"
    },
    "tags": [
      "connector",
      "audio",
      "jack",
      "3.5mm",
      "trrs",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x2",
    "familyId": "connector",
    "presetId": "hdr-1x2",
    "name": "Pin Header 1x2 (2.54mm)",
    "nameAr": "رأس دبابيس 1x2 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x2 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x2 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 2,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x02"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x2",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x3",
    "familyId": "connector",
    "presetId": "hdr-1x3",
    "name": "Pin Header 1x3 (2.54mm)",
    "nameAr": "رأس دبابيس 1x3 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x3 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x3 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 3,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x03"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x3",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x4",
    "familyId": "connector",
    "presetId": "hdr-1x4",
    "name": "Pin Header 1x4 (I2C / UART)",
    "nameAr": "رأس دبابيس 1x4 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x4 (I2C / UART Pinout)",
    "descriptionAr": "رأس دبابيس مستقيم 1x4 مثالي لواجهات I2C و UART تباعد 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 4,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x04"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x4",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x5",
    "familyId": "connector",
    "presetId": "hdr-1x5",
    "name": "Pin Header 1x5 (2.54mm)",
    "nameAr": "رأس دبابيس 1x5 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "5 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x5 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x5 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 5,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x05"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x5",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x6",
    "familyId": "connector",
    "presetId": "hdr-1x6",
    "name": "Pin Header 1x6 (FTDI / ISP)",
    "nameAr": "رأس دبابيس 1x6 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "6 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x6 (FTDI Programming / Arduino Pro Mini ISP)",
    "descriptionAr": "رأس دبابيس مستقيم 1x6 لبرمجة متحكمات FTDI وبروتوكول ISP تباعد 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 6,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x06"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x6",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x7",
    "familyId": "connector",
    "presetId": "hdr-1x7",
    "name": "Pin Header 1x7 (2.54mm)",
    "nameAr": "رأس دبابيس 1x7 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "7 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x7 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x7 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 7,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x07"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x7",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x8",
    "familyId": "connector",
    "presetId": "hdr-1x8",
    "name": "Pin Header 1x8 (Arduino Shield)",
    "nameAr": "رأس دبابيس 1x8 (Arduino Shield) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x8 (Standard Arduino UNO Shield connector)",
    "descriptionAr": "رأس دبابيس 1x8 قياسي لربط لوحات أردوينو والدرع تباعد 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 8,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x08"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x8",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x10",
    "familyId": "connector",
    "presetId": "hdr-1x10",
    "name": "Pin Header 1x10 (2.54mm)",
    "nameAr": "رأس دبابيس 1x10 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "10 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x10 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x10 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 10,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x10"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x10",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x12",
    "familyId": "connector",
    "presetId": "hdr-1x12",
    "name": "Pin Header 1x12 (2.54mm)",
    "nameAr": "رأس دبابيس 1x12 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "12 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x12 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x12 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 12,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x12"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x12",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-1x20",
    "familyId": "connector",
    "presetId": "hdr-1x20",
    "name": "Pin Header 1x20 (2.54mm)",
    "nameAr": "رأس دبابيس 1x20 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "20 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 1x20 (2.54mm pitch) Vertical",
    "descriptionAr": "رأس دبابيس مستقيم 1x20 صف واحد قياسي 2.54مم",
    "params": {
      "rows": 1,
      "pinCount": 20,
      "pitch": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_1x20"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "1x20",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x3",
    "familyId": "connector",
    "presetId": "hdr-2x3",
    "name": "Pin Header 2x3 (AVR ISP)",
    "nameAr": "رأس دبابيس 2x3 (AVR ISP) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "6 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 2x3 (Standard AVR 6-pin ISP programming header)",
    "descriptionAr": "رأس دبابيس ثنائي الصفوف 2x3 لبرمجة ميكروكنترولر AVR ISP تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 6,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x03"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x3",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x4",
    "familyId": "connector",
    "presetId": "hdr-2x4",
    "name": "Pin Header 2x4 (8-Pin)",
    "nameAr": "رأس دبابيس 2x4 (2.54مم) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 2x4 (8-Pin pitch 2.54mm) Vertical",
    "descriptionAr": "رأس دبابيس ثنائي الصفوف 2x4 بعدد 8 أطراف تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 8,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x04"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x4",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x5",
    "familyId": "connector",
    "presetId": "hdr-2x5",
    "name": "Pin Header 2x5 (JTAG 10-Pin)",
    "nameAr": "رأس دبابيس 2x5 (JTAG 10-Pin) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "10 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 2x5 (Standard JTAG 10-pin debugger header)",
    "descriptionAr": "رأس دبابيس ثنائي الصفوف 2x5 لتشخيص وبرمجة JTAG تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 10,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x05"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x5",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x6",
    "familyId": "connector",
    "presetId": "hdr-2x6",
    "name": "Pin Header 2x6 (12-Pin)",
    "nameAr": "رأس دبابيس 2x6 (12-Pin) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "12 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 2x6 (12-Pin pitch 2.54mm) Vertical",
    "descriptionAr": "رأس دبابيس ثنائي الصفوف 2x6 بعدد 12 أطراف تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 12,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x06"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x6",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x8",
    "familyId": "connector",
    "presetId": "hdr-2x8",
    "name": "Pin Header 2x8 (16-Pin)",
    "nameAr": "رأس دبابيس 2x8 (16-Pin) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "16 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 2x8 (16-Pin pitch 2.54mm) Vertical",
    "descriptionAr": "رأس دبابيس ثنائي الصفوف 2x8 بعدد 16 أطراف تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 16,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x08"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x8",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x10",
    "familyId": "connector",
    "presetId": "hdr-2x10",
    "name": "Pin Header 2x10 (20-Pin)",
    "nameAr": "رأس دبابيس 2x10 (20-Pin) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "20 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header 2x10 (20-Pin pitch 2.54mm) Vertical",
    "descriptionAr": "رأس دبابيس ثنائي الصفوف 2x10 بعدد 20 طرفاً تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 20,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x10"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x10",
      "tht"
    ]
  },
  {
    "id": "conn-hdr-2x20",
    "familyId": "connector",
    "presetId": "hdr-2x20",
    "name": "Pin Header 2x20 (40-Pin Raspberry Pi)",
    "nameAr": "رأس دبابيس 2x20 (40-Pin رايسبري باي) (ثقبي THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "40 Pins",
    "pitchText": "2.54mm Pitch",
    "description": "Connector / Pin Header Pin Header 2x20 (40-Pin Raspberry Pi Header)",
    "descriptionAr": "منفذ دبابيس 2x20 بعدد 40 طرفاً متوافق مع لوحات رايسبري باي تباعد 2.54مم",
    "params": {
      "rows": 2,
      "pinCount": 40,
      "pitch": 2.54,
      "rowSpacing": 2.54,
      "connectorType": "Header",
      "reference": "J",
      "value": "Pin_Header_2x20"
    },
    "tags": [
      "connector",
      "header",
      "pin-header",
      "2x20",
      "tht"
    ]
  },
  {
    "id": "conn-tb-2p",
    "familyId": "connector",
    "presetId": "tb-2p",
    "name": "Terminal Block 2-Pin (5.08mm)",
    "nameAr": "منفذ مسامير ثنائي 2-Pin (5.08مم) (THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Screw Terminal Block 2-Pin (5.08mm / 0.2 inch pitch)",
    "descriptionAr": "روزيته توصيل أسلاك بمسامير ثنائية الأطراف خطوة 5.08مم ثقبية",
    "params": {
      "rows": 1,
      "pinCount": 2,
      "pitch": 5.08,
      "connectorType": "TerminalBlock",
      "reference": "J",
      "value": "Terminal_Block_1x02"
    },
    "tags": [
      "connector",
      "terminal-block",
      "terminal",
      "tb-2p",
      "tht"
    ]
  },
  {
    "id": "conn-tb-3p",
    "familyId": "connector",
    "presetId": "tb-3p",
    "name": "Terminal Block 3-Pin (5.08mm)",
    "nameAr": "منفذ مسامير ثلاثي 3-Pin (5.08مم) (THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Screw Terminal Block 3-Pin (5.08mm / 0.2 inch pitch)",
    "descriptionAr": "روزيته توصيل أسلاك بمسامير ثلاثية الأطراف خطوة 5.08مم ثقبية",
    "params": {
      "rows": 1,
      "pinCount": 3,
      "pitch": 5.08,
      "connectorType": "TerminalBlock",
      "reference": "J",
      "value": "Terminal_Block_1x03"
    },
    "tags": [
      "connector",
      "terminal-block",
      "terminal",
      "tb-3p",
      "tht"
    ]
  },
  {
    "id": "conn-tb-4p",
    "familyId": "connector",
    "presetId": "tb-4p",
    "name": "Terminal Block 4-Pin (5.08mm)",
    "nameAr": "منفذ مسامير رباعي 4-Pin (5.08مم) (THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Screw Terminal Block 4-Pin (5.08mm / 0.2 inch pitch)",
    "descriptionAr": "روزيته توصيل أسلاك بمسامير رباعية الأطراف خطوة 5.08مم ثقبية",
    "params": {
      "rows": 1,
      "pinCount": 4,
      "pitch": 5.08,
      "connectorType": "TerminalBlock",
      "reference": "J",
      "value": "Terminal_Block_1x04"
    },
    "tags": [
      "connector",
      "terminal-block",
      "terminal",
      "tb-4p",
      "tht"
    ]
  },
  {
    "id": "conn-tb-5p",
    "familyId": "connector",
    "presetId": "tb-5p",
    "name": "Terminal Block 5-Pin (5.08mm)",
    "nameAr": "منفذ مسامير خماسي 5-Pin (5.08مم) (THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "5 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Screw Terminal Block 5-Pin (5.08mm pitch)",
    "descriptionAr": "روزيته توصيل أسلاك بمسامير خماسية الأطراف خطوة 5.08مم ثقبية",
    "params": {
      "rows": 1,
      "pinCount": 5,
      "pitch": 5.08,
      "connectorType": "TerminalBlock",
      "reference": "J",
      "value": "Terminal_Block_1x05"
    },
    "tags": [
      "connector",
      "terminal-block",
      "terminal",
      "tb-5p",
      "tht"
    ]
  },
  {
    "id": "conn-tb-6p",
    "familyId": "connector",
    "presetId": "tb-6p",
    "name": "Terminal Block 6-Pin (5.08mm)",
    "nameAr": "منفذ مسامير سداسي 6-Pin (5.08مم) (THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "6 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Screw Terminal Block 6-Pin (5.08mm pitch)",
    "descriptionAr": "روزيته توصيل أسلاك بمسامير سداسية الأطراف خطوة 5.08مم ثقبية",
    "params": {
      "rows": 1,
      "pinCount": 6,
      "pitch": 5.08,
      "connectorType": "TerminalBlock",
      "reference": "J",
      "value": "Terminal_Block_1x06"
    },
    "tags": [
      "connector",
      "terminal-block",
      "terminal",
      "tb-6p",
      "tht"
    ]
  },
  {
    "id": "conn-tb-8p",
    "familyId": "connector",
    "presetId": "tb-8p",
    "name": "Terminal Block 8-Pin (5.08mm)",
    "nameAr": "منفذ مسامير ثماني 8-Pin (5.08مم) (THT)",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "5.08mm Pitch",
    "description": "Screw Terminal Block 8-Pin (5.08mm pitch)",
    "descriptionAr": "روزيته توصيل أسلاك بمسامير ثمانية الأطراف خطوة 5.08مم ثقبية",
    "params": {
      "rows": 1,
      "pinCount": 8,
      "pitch": 5.08,
      "connectorType": "TerminalBlock",
      "reference": "J",
      "value": "Terminal_Block_1x08"
    },
    "tags": [
      "connector",
      "terminal-block",
      "terminal",
      "tb-8p",
      "tht"
    ]
  },
  {
    "id": "mech-tp-keystone-5000",
    "familyId": "test_mechanical",
    "presetId": "TestPoint_Keystone_5000_THT",
    "name": "Test Point Keystone 5000 (THT)",
    "nameAr": "نقطة فحص Keystone 5000 ثقبية (THT)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "THT",
    "pinsText": "1 Pin",
    "pitchText": "N/A",
    "description": "Keystone 5000 / 5001 Series Miniature Test Point Loop Through-Hole",
    "descriptionAr": "نقطة فحص دبابيس دائرية صغيرة ثقبية عبر اللوح",
    "params": {
      "packageType": "TestPoint_Keystone_5000_THT"
    },
    "tags": [
      "testpoint",
      "keystone",
      "5000",
      "tht"
    ]
  },
  {
    "id": "mech-tp-keystone-5015",
    "familyId": "test_mechanical",
    "presetId": "TestPoint_Keystone_5015_SMD",
    "name": "Test Point Keystone 5015 (SMD)",
    "nameAr": "نقطة فحص Keystone 5015 سطحية (SMD)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "SMD",
    "pinsText": "1 Pin",
    "pitchText": "N/A",
    "description": "Keystone 5015 Surface Mount Micro Miniature Test Point Loop",
    "descriptionAr": "نقطة فحص دائرية فائقة الصغر ذات تثبيت سطحي",
    "params": {
      "packageType": "TestPoint_Keystone_5015_SMD"
    },
    "tags": [
      "testpoint",
      "keystone",
      "5015",
      "smd"
    ]
  },
  {
    "id": "mech-tp-pad-1.0mm",
    "familyId": "test_mechanical",
    "presetId": "TestPoint_Pad_1.0mm_SMD",
    "name": "Test Pad 1.0mm (SMD)",
    "nameAr": "وسادة فحص دائرية 1.0مم (SMD)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "SMD",
    "pinsText": "1 Pin",
    "pitchText": "N/A",
    "description": "Surface Mount Circular Test Pad D1.0mm for Pogo Pins and Probes",
    "descriptionAr": "وسادة فحص دائرية مسطحة بقطر 1.0مم للملامس والمسابر",
    "params": {
      "packageType": "TestPoint_Pad_1.0mm_SMD"
    },
    "tags": [
      "testpoint",
      "pad",
      "smd"
    ]
  },
  {
    "id": "mech-tp-pad-1.5mm",
    "familyId": "test_mechanical",
    "presetId": "TestPoint_Pad_1.5mm_SMD",
    "name": "Test Pad 1.5mm (SMD)",
    "nameAr": "وسادة فحص دائرية 1.5مم (SMD)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "SMD",
    "pinsText": "1 Pin",
    "pitchText": "N/A",
    "description": "Surface Mount Circular Test Pad D1.5mm for Pogo Pins and Probes",
    "descriptionAr": "وسادة فحص دائرية مسطحة بقطر 1.5مم للملامس والمسابر",
    "params": {
      "packageType": "TestPoint_Pad_1.5mm_SMD"
    },
    "tags": [
      "testpoint",
      "pad",
      "smd"
    ]
  },
  {
    "id": "mech-hole-m2.5-np",
    "familyId": "test_mechanical",
    "presetId": "MountingHole_M2.5",
    "name": "Mounting Hole M2.5 (NPTH)",
    "nameAr": "ثقب تثبيت M2.5 غير ناقل (NPTH)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "THT",
    "pinsText": "1 Hole",
    "pitchText": "N/A",
    "description": "Mechanical Mounting Hole for M2.5 screw (2.7mm NPTH)",
    "descriptionAr": "ثقب تثبيت ميكانيكي لبرغي M2.5 بقطر 2.7مم غير مطلي بالنحاس",
    "params": {
      "packageType": "MountingHole_M2.5"
    },
    "tags": [
      "mountinghole",
      "mechanical",
      "tht"
    ]
  },
  {
    "id": "mech-hole-m3-np",
    "familyId": "test_mechanical",
    "presetId": "MountingHole_M3",
    "name": "Mounting Hole M3 (NPTH)",
    "nameAr": "ثقب تثبيت M3 غير ناقل (NPTH)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "THT",
    "pinsText": "1 Hole",
    "pitchText": "N/A",
    "description": "Mechanical Mounting Hole for M3 screw (3.2mm NPTH)",
    "descriptionAr": "ثقب تثبيت ميكانيكي لبرغي M3 بقطر 3.2مم غير مطلي بالنحاس",
    "params": {
      "packageType": "MountingHole_M3"
    },
    "tags": [
      "mountinghole",
      "mechanical",
      "tht"
    ]
  },
  {
    "id": "mech-hole-m3-plated",
    "familyId": "test_mechanical",
    "presetId": "MountingHole_M3_Plated_Ground",
    "name": "Mounting Hole M3 (Plated Ground)",
    "nameAr": "ثقب تثبيت M3 مطلي متصل بالأرضي",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "THT",
    "pinsText": "1 Hole",
    "pitchText": "N/A",
    "description": "Plated Mounting Hole M3 with Chassis Ground Pad and Via Stitching",
    "descriptionAr": "ثقب تثبيت معدني مطلي لبرغي M3 متصل بالأرضي الهيكلي مع فتحات خياطة Vias",
    "params": {
      "packageType": "MountingHole_M3_Plated_Ground"
    },
    "tags": [
      "mountinghole",
      "plated",
      "ground",
      "tht"
    ]
  },
  {
    "id": "mech-hole-m4-np",
    "familyId": "test_mechanical",
    "presetId": "MountingHole_M4",
    "name": "Mounting Hole M4 (NPTH)",
    "nameAr": "ثقب تثبيت M4 غير ناقل (NPTH)",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "THT",
    "pinsText": "1 Hole",
    "pitchText": "N/A",
    "description": "Mechanical Mounting Hole for M4 screw (4.3mm NPTH)",
    "descriptionAr": "ثقب تثبيت ميكانيكي لبرغي M4 بقطر 4.3مم غير مطلي بالنحاس",
    "params": {
      "packageType": "MountingHole_M4"
    },
    "tags": [
      "mountinghole",
      "mechanical",
      "tht"
    ]
  },
  {
    "id": "mech-fiducial-1.0mm",
    "familyId": "test_mechanical",
    "presetId": "Fiducial_1.0mm_Round",
    "name": "Fiducial Mark 1.0mm",
    "nameAr": "علامة محاذاة بصرية 1.0مم",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "SMD",
    "pinsText": "N/A",
    "pitchText": "N/A",
    "description": "Optical Alignment Fiducial Mark D1.0mm for Automated Pick and Place",
    "descriptionAr": "علامة محاذاة بصرية دائرية بقطر 1.0مم لخطوط التجميع الآلي",
    "params": {
      "packageType": "Fiducial_1.0mm_Round"
    },
    "tags": [
      "fiducial",
      "optical",
      "smd"
    ]
  },
  {
    "id": "mech-fiducial-1.5mm",
    "familyId": "test_mechanical",
    "presetId": "Fiducial_1.5mm_Round",
    "name": "Fiducial Mark 1.5mm",
    "nameAr": "علامة محاذاة بصرية 1.5مم",
    "category": "mechanical",
    "categoryName": "Mechanical & Test",
    "categoryNameAr": "الميكانيكا والاختبار",
    "mounting": "SMD",
    "pinsText": "N/A",
    "pitchText": "N/A",
    "description": "Optical Alignment Fiducial Mark D1.5mm for Automated Pick and Place",
    "descriptionAr": "علامة محاذاة بصرية دائرية بقطر 1.5مم لخطوط التجميع الآلي",
    "params": {
      "packageType": "Fiducial_1.5mm_Round"
    },
    "tags": [
      "fiducial",
      "optical",
      "smd"
    ]
  },
  {
    "id": "mod-esp32",
    "familyId": "modules",
    "presetId": "mod-esp32",
    "name": "ESP32-WROOM-32 Wi-Fi/BLE Module 38-Pad SMD",
    "nameAr": "وحدة واي فاي وبلوتوث ESP32-WROOM-32",
    "category": "module",
    "categoryName": "Modules",
    "categoryNameAr": "الوحدات النمطية",
    "mounting": "SMD",
    "pinsText": "38 Pads",
    "pitchText": "1.27mm",
    "description": "Espressif ESP32-WROOM-32 Wi-Fi & Bluetooth Module 38-Castellated SMD",
    "descriptionAr": "وحدة بلوتوث وواي فاي ESP32-WROOM-32 بـ 38 طرف سطحي متراص",
    "params": {
      "packageType": "Module_ESP32_WROOM_32",
      "mounting": "SMD",
      "reference": "U",
      "value": "ESP32-WROOM-32"
    },
    "tags": ["esp32", "wifi", "bluetooth", "smd", "module"]
  },
  {
    "id": "mod-nano",
    "familyId": "modules",
    "presetId": "mod-nano",
    "name": "Arduino Nano Development Board 2x15 Header",
    "nameAr": "لوحة تطوير أردوينو نانو (ثقبية THT)",
    "category": "module",
    "categoryName": "Modules",
    "categoryNameAr": "الوحدات النمطية",
    "mounting": "THT",
    "pinsText": "30 Pins",
    "pitchText": "2.54mm",
    "description": "Arduino Nano Development Board Pin Socket Footprint (2x15 15.24mm spacing)",
    "descriptionAr": "مستقبل أطراف لوحة أردوينو نانو صفين 15 طرف بتباعد 15.24مم",
    "params": {
      "packageType": "Module_Arduino_Nano_Header",
      "mounting": "THT",
      "reference": "U",
      "value": "Arduino_Nano"
    },
    "tags": ["arduino", "nano", "tht", "module"]
  },
  {
    "id": "mod-pico",
    "familyId": "modules",
    "presetId": "mod-pico",
    "name": "Raspberry Pi Pico RP2040 Module 40-Pin",
    "nameAr": "لوحة راسبيري باي بيكو RP2040 (ثقبية THT)",
    "category": "module",
    "categoryName": "Modules",
    "categoryNameAr": "الوحدات النمطية",
    "mounting": "THT",
    "pinsText": "40 Pins",
    "pitchText": "2.54mm",
    "description": "Raspberry Pi Pico RP2040 Microcontroller Module 40-Pin Header",
    "descriptionAr": "لوحة تطوير راسبيري باي بيكو 40 طرف بتباعد 17.78مم",
    "params": {
      "packageType": "Module_RaspberryPi_Pico",
      "mounting": "THT",
      "reference": "U",
      "value": "RPi_Pico"
    },
    "tags": ["raspberrypi", "pico", "rp2040", "tht", "module"]
  },
  {
    "id": "mod-lm2596",
    "familyId": "modules",
    "presetId": "mod-lm2596",
    "name": "LM2596 DC-DC Buck Converter Module THT",
    "nameAr": "وحدة خافض الجهد LM2596 DC-DC (ثقبية THT)",
    "category": "module",
    "categoryName": "Modules",
    "categoryNameAr": "الوحدات النمطية",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "N/A",
    "description": "LM2596 Step-Down DC-DC Buck Converter Adjustable Module",
    "descriptionAr": "وحدة خافض جهد مستمر قابلة للضبط LM2596 بأربعة أطراف",
    "params": {
      "packageType": "Module_Buck_LM2596",
      "mounting": "THT",
      "reference": "MOD",
      "value": "LM2596"
    },
    "tags": ["lm2596", "buck", "power", "tht", "module"]
  },
  {
    "id": "mod-mini360",
    "familyId": "modules",
    "presetId": "mod-mini360",
    "name": "Mini-360 Ultra-Small Synchronous Buck Module SMD",
    "nameAr": "وحدة خافض الجهد Mini-360 فائقة الصغر (سطحية SMD)",
    "category": "module",
    "categoryName": "Modules",
    "categoryNameAr": "الوحدات النمطية",
    "mounting": "SMD",
    "pinsText": "4 Pads",
    "pitchText": "N/A",
    "description": "Mini-360 Ultra-Small Synchronous Buck Converter Module SMD",
    "descriptionAr": "وحدة خافض جهد تيار مستمر متزامنة متناهية الصغر Mini-360 سطحية",
    "params": {
      "packageType": "Module_Buck_Mini360",
      "mounting": "SMD",
      "reference": "MOD",
      "value": "Mini-360"
    },
    "tags": ["mini360", "buck", "power", "smd", "module"]
  },
  {
    "id": "mod-tp4056",
    "familyId": "modules",
    "presetId": "mod-tp4056",
    "name": "TP4056 Li-Ion Battery Charger Module Type-C",
    "nameAr": "وحدة شحن بطاريات الليثيوم TP4056 مع حماية (ثقبية THT)",
    "category": "module",
    "categoryName": "Modules",
    "categoryNameAr": "الوحدات النمطية",
    "mounting": "THT",
    "pinsText": "6 Pins",
    "pitchText": "N/A",
    "description": "TP4056 Li-Ion Battery Charger Module with Protection and USB-C",
    "descriptionAr": "وحدة شحن بطاريات ليثيوم أيون مع منفذ USB-C ودائرة حماية مدمجة",
    "params": {
      "packageType": "Module_TP4056_Charger",
      "mounting": "THT",
      "reference": "MOD",
      "value": "TP4056"
    },
    "tags": ["tp4056", "charger", "battery", "tht", "module"]
  },
  {
    "id": "rf-sma-edge",
    "familyId": "rf_antenna",
    "presetId": "rf-sma-edge",
    "name": "SMA Edge Mount Female RF Jack 1.6mm",
    "nameAr": "موصل SMA طرفي أفقي لحافة اللوحة 1.6مم",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "SMD",
    "pinsText": "5 Pads",
    "pitchText": "N/A",
    "description": "SMA Edge-Mount Female Jack Connector for 1.6mm PCB",
    "descriptionAr": "موصل SMA أنثى للتثبيت الأفقي على حافة لوحة الدارات بسمك 1.6مم",
    "params": {
      "packageType": "SMA_Edge_Mount_Jack",
      "mounting": "SMD",
      "reference": "J",
      "value": "SMA_Edge"
    },
    "tags": ["rf", "sma", "connector", "edge-mount"]
  },
  {
    "id": "rf-sma-vert",
    "familyId": "rf_antenna",
    "presetId": "rf-sma-vert",
    "name": "SMA Vertical Female RF Jack 5.08mm THT",
    "nameAr": "موصل SMA عمودي ثقبي 5.08مم",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "5 Pins",
    "pitchText": "5.08mm",
    "description": "SMA Female Vertical RF Connector Through-Hole 5.08mm",
    "descriptionAr": "موصل SMA عمودي ثقبي 5.08مم بتباعد أطراف 5.08مم",
    "params": {
      "packageType": "SMA_Vertical_THT",
      "mounting": "THT",
      "reference": "J",
      "value": "SMA_Vertical"
    },
    "tags": ["rf", "sma", "connector", "vertical", "tht"]
  },
  {
    "id": "rf-ufl",
    "familyId": "rf_antenna",
    "presetId": "rf-ufl",
    "name": "Hirose U.FL / IPEX SMT Micro Coaxial Receptacle",
    "nameAr": "مقبس كواكسيل ميكرو U.FL / IPEX سطحي",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "SMD",
    "pinsText": "3 Pads",
    "pitchText": "N/A",
    "description": "Hirose U.FL / IPEX Surface Mount Micro-Coaxial RF Receptacle",
    "descriptionAr": "مستقبل كواكسيل مصغر فائق الصغر Hirose U.FL للتثبيت السطحي",
    "params": {
      "packageType": "U.FL_IPEX_SMT",
      "mounting": "SMD",
      "reference": "J",
      "value": "U.FL"
    },
    "tags": ["rf", "ufl", "ipex", "coaxial", "smd"]
  },
  {
    "id": "ant-24ghz-ifa",
    "familyId": "rf_antenna",
    "presetId": "ant-24ghz-ifa",
    "name": "Antenna 2.4GHz Inverted-F (IFA) PCB Trace",
    "nameAr": "هوائي مطبوع 2.4GHz IFA على اللوحة",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "SMD",
    "pinsText": "2 Pads",
    "pitchText": "2.00mm",
    "description": "2.4GHz PCB Inverted-F Antenna (IFA) Trace Keepout & Feed",
    "descriptionAr": "تصميم هوائي مطبوع IFA بتردد 2.4 جيجاهرتز على اللوحة للواي فاي والبلوتوث",
    "params": {
      "packageType": "Antenna_2.4GHz_IFA_PCB",
      "mounting": "SMD",
      "reference": "ANT",
      "value": "2.4GHz_IFA"
    },
    "tags": ["antenna", "rf", "2.4ghz", "wifi", "bluetooth", "smd"]
  },
  {
    "id": "ant-helical",
    "familyId": "rf_antenna",
    "presetId": "ant-helical",
    "name": "Antenna Helical Spring Wire 1-Pin THT",
    "nameAr": "هوائي سلكي زنبركي حلزوني طرف واحد",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "1 Pin",
    "pitchText": "N/A",
    "description": "Single-Pin Through-Hole Pad for 433MHz / 868MHz / 915MHz Helical Wire Spring Antenna",
    "descriptionAr": "ثقب توصيل مفرد لتثبيت الهوائيات الزنبركية السلكية بتردد 433/868/915 ميجاهرتز",
    "params": {
      "packageType": "Antenna_Helical_Wire_1Pin",
      "mounting": "THT",
      "reference": "ANT",
      "value": "Helical_Ant"
    },
    "tags": ["antenna", "helical", "spring", "rf", "tht"]
  },
  {
    "id": "mod-nrf24",
    "familyId": "rf_antenna",
    "presetId": "mod-nrf24",
    "name": "NRF24L01+ 2.4GHz Transceiver Socket 2x4 Header",
    "nameAr": "مقبس موديول لاسلكي NRF24L01+ 2×4",
    "category": "connector",
    "categoryName": "Connectors & Headers",
    "categoryNameAr": "الموصلات والمنافذ",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "2.54mm",
    "description": "NRF24L01+ 2.4GHz Transceiver Module 2x4 Pin Header Socket",
    "descriptionAr": "مقبس توصيل ثنائي الصفوف 2x4 لموديول الإرسال والاستقبال اللاسلكي NRF24L01+",
    "params": {
      "packageType": "Module_NRF24L01_Header_2x4",
      "mounting": "THT",
      "reference": "MOD",
      "value": "NRF24L01+"
    },
    "tags": ["rf", "nrf24l01", "transceiver", "socket", "tht"]
  },
  {
    "id": "disp-oled-096-i2c",
    "familyId": "display",
    "presetId": "oled-096-i2c",
    "name": "OLED 0.96 inch 128x64 I2C 4-Pin Header",
    "nameAr": "شاشة أوليد 0.96 بوصة I2C بأربعة أطراف",
    "category": "display",
    "categoryName": "Displays",
    "categoryNameAr": "الشاشات ووسائل العرض",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm",
    "description": "0.96 inch I2C OLED Display Module 128x64 pixels with 4-Pin vertical connector",
    "descriptionAr": "شاشة عرض أوليد مقاس 0.96 بوصة بروتوكول I2C دقة 128x64 بأربعة أطراف مستقيمة",
    "params": {
      "packageType": "Display_OLED_0.96_I2C_4Pin",
      "reference": "DS",
      "value": "OLED_0.96_I2C"
    },
    "tags": ["display", "oled", "i2c", "tht"]
  },
  {
    "id": "disp-oled-13-spi",
    "familyId": "display",
    "presetId": "oled-13-spi",
    "name": "OLED 1.3 inch 128x64 SPI 7-Pin Header",
    "nameAr": "شاشة أوليد 1.3 بوصة SPI بسبعة أطراف",
    "category": "display",
    "categoryName": "Displays",
    "categoryNameAr": "الشاشات ووسائل العرض",
    "mounting": "THT",
    "pinsText": "7 Pins",
    "pitchText": "2.54mm",
    "description": "1.3 inch SPI OLED Display Module 128x64 pixels with 7-Pin vertical connector",
    "descriptionAr": "شاشة عرض أوليد مقاس 1.3 بوصة بروتوكول SPI دقة 128x64 بسبعة أطراف مستقيمة",
    "params": {
      "packageType": "Display_OLED_1.3_SPI_7Pin",
      "reference": "DS",
      "value": "OLED_1.3_SPI"
    },
    "tags": ["display", "oled", "spi", "tht"]
  },
  {
    "id": "disp-7seg-1d",
    "familyId": "display",
    "presetId": "7seg-1d",
    "name": "7-Segment Display 1-Digit 0.56 inch 10-Pin",
    "nameAr": "شاشة سباعية رقم واحد 0.56 بوصة",
    "category": "display",
    "categoryName": "Displays",
    "categoryNameAr": "الشاشات ووسائل العرض",
    "mounting": "THT",
    "pinsText": "10 Pins",
    "pitchText": "2.54mm",
    "description": "Single-Digit 7-Segment Display 0.56 inch common anode/cathode 10-Pin package",
    "descriptionAr": "مؤشر سباعي الأرقام خانة واحدة قياس 0.56 بوصة بـ 10 أطراف ثقبية THT",
    "params": {
      "packageType": "Display_7Segment_1Digit_10Pin",
      "reference": "DS",
      "value": "7Seg_1Digit"
    },
    "tags": ["display", "7segment", "led", "tht"]
  },
  {
    "id": "disp-7seg-4d",
    "familyId": "display",
    "presetId": "7seg-4d",
    "name": "7-Segment Display 4-Digit 0.56 inch 12-Pin",
    "nameAr": "شاشة سباعية 4 أرقام 0.56 بوصة",
    "category": "display",
    "categoryName": "Displays",
    "categoryNameAr": "الشاشات ووسائل العرض",
    "mounting": "THT",
    "pinsText": "12 Pins",
    "pitchText": "2.54mm",
    "description": "4-Digit 7-Segment Display 0.56 inch common anode/cathode 12-Pin package",
    "descriptionAr": "مؤشر سباعي الأرقام 4 خانات قياس 0.56 بوصة بـ 12 طرف ثقبي THT",
    "params": {
      "packageType": "Display_7Segment_4Digit_12Pin",
      "reference": "DS",
      "value": "7Seg_4Digit"
    },
    "tags": ["display", "7segment", "led", "tht"]
  },
  {
    "id": "disp-lcd-1602",
    "familyId": "display",
    "presetId": "lcd-1602",
    "name": "LCD 1602 Parallel 16-Pin Header (80x36mm)",
    "nameAr": "شاشة حرفية LCD1602 ستة عشر طرفاً",
    "category": "display",
    "categoryName": "Displays",
    "categoryNameAr": "الشاشات ووسائل العرض",
    "mounting": "THT",
    "pinsText": "16 Pins",
    "pitchText": "2.54mm",
    "description": "Standard Character LCD 16x2 Display with 16-Pin parallel interface header",
    "descriptionAr": "شاشة بلورية سائلة LCD 1602 حرفية 16x2 بـ 16 طرف توازي مستقيم",
    "params": {
      "packageType": "Display_LCD1602_Parallel_16Pin",
      "reference": "DS",
      "value": "LCD1602"
    },
    "tags": ["display", "lcd", "parallel", "tht"]
  },
  {
    "id": "disp-tft-24-spi",
    "familyId": "display",
    "presetId": "tft-24-spi",
    "name": "TFT 2.4 inch Color SPI ILI9341 14-Pin Header",
    "nameAr": "شاشة ملونة TFT 2.4 بوصة SPI",
    "category": "display",
    "categoryName": "Displays",
    "categoryNameAr": "الشاشات ووسائل العرض",
    "mounting": "THT",
    "pinsText": "14 Pins",
    "pitchText": "2.54mm",
    "description": "2.4 inch Color TFT LCD Display with SPI interface ILI9341 controller 14-Pin",
    "descriptionAr": "شاشة ألوان TFT ملونة مقاس 2.4 بوصة بروتوكول SPI متحكم ILI9341 بـ 14 طرف",
    "params": {
      "packageType": "Display_TFT_2.4_SPI_14Pin",
      "reference": "DS",
      "value": "TFT_2.4_SPI"
    },
    "tags": ["display", "tft", "spi", "color", "tht"]
  },
  {
    "id": "sensor-sens-dht11",
    "familyId": "sensor",
    "presetId": "sens-dht11",
    "name": "DHT11 / DHT22 Humidity & Temp Sensor 4-Pin",
    "nameAr": "مستشعر حرارة ورطوبة DHT11/DHT22",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm",
    "description": "DHT11/DHT22 Humidity & Temperature Sensor Package with 4-Pin radial leads",
    "descriptionAr": "حساس قياس الرطوبة والحرارة DHT11 أو DHT22 بأربعة أطراف",
    "params": {
      "packageType": "Sensor_DHT11_DHT22_4Pin",
      "reference": "U",
      "value": "DHT11"
    },
    "tags": ["sensor", "humidity", "temperature", "tht"]
  },
  {
    "id": "sensor-sens-hcsr04",
    "familyId": "sensor",
    "presetId": "sens-hcsr04",
    "name": "HC-SR04 Ultrasonic Distance Sensor 4-Pin",
    "nameAr": "مستشعر مسافة بالموجات فوق الصوتية HC-SR04",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "4 Pins",
    "pitchText": "2.54mm",
    "description": "HC-SR04 Ultrasonic Distance Sensor Module with 4-Pin straight header",
    "descriptionAr": "مستشعر المسافات بالموجات فوق الصوتية HC-SR04 بأربعة أطراف مستقيمة",
    "params": {
      "packageType": "Sensor_HCSR04_Ultrasonic_4Pin",
      "reference": "U",
      "value": "HC-SR04"
    },
    "tags": ["sensor", "ultrasonic", "distance", "tht"]
  },
  {
    "id": "sensor-sens-hcsr501",
    "familyId": "sensor",
    "presetId": "sens-hcsr501",
    "name": "HC-SR501 PIR Infrared Motion Sensor 3-Pin",
    "nameAr": "مستشعر حركة بالأشعة تحت الحمراء PIR",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "2.54mm",
    "description": "HC-SR501 PIR Infrared Pyroelectric Motion Sensor Module with 3-Pin connector",
    "descriptionAr": "مستشعر كشف الحركة بالأشعة تحت الحمراء PIR طراز HC-SR501 بثلاثة أطراف",
    "params": {
      "packageType": "Sensor_HCSR501_PIR_3Pin",
      "reference": "U",
      "value": "HC-SR501_PIR"
    },
    "tags": ["sensor", "motion", "pir", "infrared", "tht"]
  },
  {
    "id": "sensor-sens-hall",
    "familyId": "sensor",
    "presetId": "sens-hall",
    "name": "Hall Effect Sensor TO-92 3-Pin (A3144)",
    "nameAr": "مستشعر مغناطيسي تأثير هول A3144",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "3 Pins",
    "pitchText": "1.27mm",
    "description": "Hall Effect Magnetic Field Sensor in TO-92 3-Pin vertical package (A3144 / US1881)",
    "descriptionAr": "مستشعر المجال المغناطيسي تأثير هول حزمة TO-92 بثلاثة أطراف (A3144)",
    "params": {
      "packageType": "Sensor_Hall_Effect_TO92_3Pin",
      "reference": "U",
      "value": "A3144"
    },
    "tags": ["sensor", "magnetic", "hall", "tht"]
  },
  {
    "id": "sensor-sens-bme280-smd",
    "familyId": "sensor",
    "presetId": "sens-bme280-smd",
    "name": "BME280 / BMP280 Pressure Sensor LGA-8 SMD",
    "nameAr": "مستشعر ضغط جوي BME280 سطحي LGA-8",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "SMD",
    "pinsText": "8 Pads",
    "pitchText": "0.65mm",
    "description": "BME280 / BMP280 Digital Barometric Pressure, Temp & Humidity Sensor LGA-8 SMD",
    "descriptionAr": "حساس رقمي دقيق للضغط الجوي والرطوبة والحرارة BME280 تثبيت سطحي LGA-8",
    "params": {
      "packageType": "Sensor_BME280_BMP280_SMD",
      "reference": "U",
      "value": "BME280_SMD"
    },
    "tags": ["sensor", "pressure", "temperature", "smd"]
  },
  {
    "id": "sensor-sens-bme280-mod",
    "familyId": "sensor",
    "presetId": "sens-bme280-mod",
    "name": "BME280 Breakout Module 6-Pin Header",
    "nameAr": "لوحة مستشعر BME280 سداسية الأطراف",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "6 Pins",
    "pitchText": "2.54mm",
    "description": "BME280 Sensor Breakout Board Module with 6-Pin single row vertical header",
    "descriptionAr": "لوحة جاهزة (Breakout) لمستشعر BME280 بستة أطراف مستقيمة 2.54مم",
    "params": {
      "packageType": "Sensor_BME280_Module_6Pin",
      "reference": "U",
      "value": "BME280_Module"
    },
    "tags": ["sensor", "pressure", "module", "tht"]
  },
  {
    "id": "sensor-sens-mpu6050",
    "familyId": "sensor",
    "presetId": "sens-mpu6050",
    "name": "MPU-6050 (GY-521) 6-Axis IMU Module 8-Pin",
    "nameAr": "مستشعر حركة وتسارع 6 محاور MPU-6050",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "8 Pins",
    "pitchText": "2.54mm",
    "description": "MPU-6050 Gyroscope & Accelerometer 6-Axis IMU GY-521 Module Breakout with 8-Pin header",
    "descriptionAr": "لوحة مستشعر قياس الدوران والتسارع ذو الـ 6 محاور MPU-6050 مع 8 أطراف",
    "params": {
      "packageType": "Sensor_MPU6050_Module_8Pin",
      "reference": "U",
      "value": "MPU6050_GY521"
    },
    "tags": ["sensor", "gyroscope", "accelerometer", "imu", "tht"]
  },
  {
    "id": "sensor-sens-ldr",
    "familyId": "sensor",
    "presetId": "sens-ldr",
    "name": "Light Dependent Resistor (LDR) 5mm Radial",
    "nameAr": "مستشعر ضوء LDR مقاومة ضوئية 5مم",
    "category": "sensor",
    "categoryName": "Sensors",
    "categoryNameAr": "المستشعرات والحساسات",
    "mounting": "THT",
    "pinsText": "2 Pins",
    "pitchText": "3.50mm",
    "description": "Light Dependent Photoresistor LDR 5mm radial leaded through-hole package",
    "descriptionAr": "مستشعر الضوء الضوئي (مقاومة ضوئية LDR) قياس 5مم بطرفين ثقبيين THT",
    "params": {
      "packageType": "Sensor_LDR_5mm_Radial",
      "reference": "R",
      "value": "LDR_5mm"
    },
    "tags": ["sensor", "light", "ldr", "photoresistor", "tht"]
  }
,
{
  "id": "ess-esp32-wroom-32",
  "familyId": "modules",
  "name": "ESP32-WROOM-32 Module",
  "nameAr": "وحدة ESP32-WROOM-32",
  "category": "module",
  "categoryName": "ESP32-WROOM-32 Module",
  "categoryNameAr": "وحدة ESP32-WROOM-32",
  "mounting": "SMD",
  "pinsText": "38",
  "pitchText": "1.27mm",
  "description": "ESP32-WROOM-32 Module (KiCad Official)",
  "descriptionAr": "وحدة ESP32-WROOM-32 (رسمي KiCad)",
  "params": {
    "reference": "U",
    "value": "ESP32-WROOM-32 Module"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-esp32-wroom-32"
  ]
},
{
  "id": "ess-arduino-uno-r3",
  "familyId": "modules",
  "name": "Arduino UNO R3 Board",
  "nameAr": "لوحة Arduino UNO R3",
  "category": "module",
  "categoryName": "Arduino UNO R3 Board",
  "categoryNameAr": "لوحة Arduino UNO R3",
  "mounting": "THT",
  "pinsText": "30+",
  "pitchText": "2.54mm",
  "description": "Arduino UNO R3 Board (KiCad Official)",
  "descriptionAr": "لوحة Arduino UNO R3 (رسمي KiCad)",
  "params": {
    "reference": "U",
    "value": "Arduino UNO R3 Board"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-arduino-uno-r3"
  ]
},
{
  "id": "ess-rpi-pico",
  "familyId": "modules",
  "name": "Raspberry Pi Pico",
  "nameAr": "راسبيري باي بيكو",
  "category": "module",
  "categoryName": "Raspberry Pi Pico",
  "categoryNameAr": "راسبيري باي بيكو",
  "mounting": "Both",
  "pinsText": "40",
  "pitchText": "2.54mm",
  "description": "Raspberry Pi Pico (KiCad Official)",
  "descriptionAr": "راسبيري باي بيكو (رسمي KiCad)",
  "params": {
    "reference": "U",
    "value": "Raspberry Pi Pico"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-rpi-pico"
  ]
},
{
  "id": "ess-microsd-molex",
  "familyId": "connector",
  "name": "microSD Card Holder (Molex)",
  "nameAr": "حامل بطاقة microSD",
  "category": "connector",
  "categoryName": "microSD Card Holder (Molex)",
  "categoryNameAr": "حامل بطاقة microSD",
  "mounting": "SMD",
  "pinsText": "8",
  "pitchText": "1.1mm",
  "description": "microSD Card Holder (Molex) (KiCad Official)",
  "descriptionAr": "حامل بطاقة microSD (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "microSD Card Holder (Molex)"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-microsd-molex"
  ]
},
{
  "id": "ess-usb-c-16p",
  "familyId": "connector",
  "name": "USB-C Receptacle 16P",
  "nameAr": "منفذ USB-C 16 طرف",
  "category": "connector",
  "categoryName": "USB-C Receptacle 16P",
  "categoryNameAr": "منفذ USB-C 16 طرف",
  "mounting": "SMD",
  "pinsText": "16",
  "pitchText": "0.5mm",
  "description": "USB-C Receptacle 16P (KiCad Official)",
  "descriptionAr": "منفذ USB-C 16 طرف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "USB-C Receptacle 16P"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-usb-c-16p"
  ]
},
{
  "id": "ess-usb-c-24p",
  "familyId": "connector",
  "name": "USB-C Receptacle 24P",
  "nameAr": "منفذ USB-C 24 طرف",
  "category": "connector",
  "categoryName": "USB-C Receptacle 24P",
  "categoryNameAr": "منفذ USB-C 24 طرف",
  "mounting": "SMD",
  "pinsText": "24",
  "pitchText": "0.5mm",
  "description": "USB-C Receptacle 24P (KiCad Official)",
  "descriptionAr": "منفذ USB-C 24 طرف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "USB-C Receptacle 24P"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-usb-c-24p"
  ]
},
{
  "id": "ess-pinsocket-1x8",
  "familyId": "connector",
  "name": "Pin Socket 1x8 (2.54mm)",
  "nameAr": "سوكت أنثى 1×8",
  "category": "connector",
  "categoryName": "Pin Socket 1x8 (2.54mm)",
  "categoryNameAr": "سوكت أنثى 1×8",
  "mounting": "THT",
  "pinsText": "8",
  "pitchText": "2.54mm",
  "description": "Pin Socket 1x8 (2.54mm) (KiCad Official)",
  "descriptionAr": "سوكت أنثى 1×8 (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "Pin Socket 1x8 (2.54mm)"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-pinsocket-1x8"
  ]
},
{
  "id": "ess-pinsocket-1x10",
  "familyId": "connector",
  "name": "Pin Socket 1x10 (2.54mm)",
  "nameAr": "سوكت أنثى 1×10",
  "category": "connector",
  "categoryName": "Pin Socket 1x10 (2.54mm)",
  "categoryNameAr": "سوكت أنثى 1×10",
  "mounting": "THT",
  "pinsText": "10",
  "pitchText": "2.54mm",
  "description": "Pin Socket 1x10 (2.54mm) (KiCad Official)",
  "descriptionAr": "سوكت أنثى 1×10 (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "Pin Socket 1x10 (2.54mm)"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-pinsocket-1x10"
  ]
},
{
  "id": "ess-pinsocket-2x20",
  "familyId": "connector",
  "name": "Pin Socket 2x20 (2.54mm)",
  "nameAr": "سوكت أنثى 2×20",
  "category": "connector",
  "categoryName": "Pin Socket 2x20 (2.54mm)",
  "categoryNameAr": "سوكت أنثى 2×20",
  "mounting": "THT",
  "pinsText": "40",
  "pitchText": "2.54mm",
  "description": "Pin Socket 2x20 (2.54mm) (KiCad Official)",
  "descriptionAr": "سوكت أنثى 2×20 (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "Pin Socket 2x20 (2.54mm)"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-pinsocket-2x20"
  ]
},
{
  "id": "ess-relay-spdt-g5v",
  "familyId": "switch_relay",
  "name": "Relay SPDT Omron G5V-1",
  "nameAr": "ريليه SPDT أومرون G5V-1",
  "category": "switch_relay",
  "categoryName": "Relay SPDT Omron G5V-1",
  "categoryNameAr": "ريليه SPDT أومرون G5V-1",
  "mounting": "THT",
  "pinsText": "5",
  "pitchText": "2.54mm",
  "description": "Relay SPDT Omron G5V-1 (KiCad Official)",
  "descriptionAr": "ريليه SPDT أومرون G5V-1 (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "Relay SPDT Omron G5V-1"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-relay-spdt-g5v"
  ]
},
{
  "id": "ess-relay-dpdt-g5v2",
  "familyId": "switch_relay",
  "name": "Relay DPDT Omron G5V-2",
  "nameAr": "ريليه DPDT أومرون G5V-2",
  "category": "switch_relay",
  "categoryName": "Relay DPDT Omron G5V-2",
  "categoryNameAr": "ريليه DPDT أومرون G5V-2",
  "mounting": "THT",
  "pinsText": "8",
  "pitchText": "2.54mm",
  "description": "Relay DPDT Omron G5V-2 (KiCad Official)",
  "descriptionAr": "ريليه DPDT أومرون G5V-2 (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "Relay DPDT Omron G5V-2"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-relay-dpdt-g5v2"
  ]
},
{
  "id": "ess-relay-spdt-songle",
  "familyId": "switch_relay",
  "name": "Relay SPDT Songle SRD",
  "nameAr": "ريليه Songle SRD",
  "category": "switch_relay",
  "categoryName": "Relay SPDT Songle SRD",
  "categoryNameAr": "ريليه Songle SRD",
  "mounting": "THT",
  "pinsText": "5",
  "pitchText": "5.0mm",
  "description": "Relay SPDT Songle SRD (KiCad Official)",
  "descriptionAr": "ريليه Songle SRD (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "Relay SPDT Songle SRD"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-relay-spdt-songle"
  ]
},
{
  "id": "ess-to220-horiz",
  "familyId": "transistor",
  "name": "TO-220-3 Horizontal",
  "nameAr": "TO-220 أفقي",
  "category": "semiconductor",
  "categoryName": "TO-220-3 Horizontal",
  "categoryNameAr": "TO-220 أفقي",
  "mounting": "THT",
  "pinsText": "3",
  "pitchText": "2.54mm",
  "description": "TO-220-3 Horizontal (KiCad Official)",
  "descriptionAr": "TO-220 أفقي (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "TO-220-3 Horizontal"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-to220-horiz"
  ]
},
{
  "id": "ess-to220-vert",
  "familyId": "transistor",
  "name": "TO-220-3 Vertical",
  "nameAr": "TO-220 عمودي",
  "category": "semiconductor",
  "categoryName": "TO-220-3 Vertical",
  "categoryNameAr": "TO-220 عمودي",
  "mounting": "THT",
  "pinsText": "3",
  "pitchText": "2.54mm",
  "description": "TO-220-3 Vertical (KiCad Official)",
  "descriptionAr": "TO-220 عمودي (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "TO-220-3 Vertical"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-to220-vert"
  ]
},
{
  "id": "ess-ws2812b",
  "familyId": "transistor",
  "name": "WS2812B Addressable LED",
  "nameAr": "LED عنونوني WS2812B",
  "category": "semiconductor",
  "categoryName": "WS2812B Addressable LED",
  "categoryNameAr": "LED عنونوني WS2812B",
  "mounting": "SMD",
  "pinsText": "4",
  "pitchText": "3.2mm",
  "description": "WS2812B Addressable LED (KiCad Official)",
  "descriptionAr": "LED عنونوني WS2812B (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "WS2812B Addressable LED"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-ws2812b"
  ]
},
{
  "id": "ess-led-5050-rgb",
  "familyId": "transistor",
  "name": "RGB LED 5050",
  "nameAr": "LED RGB 5050",
  "category": "semiconductor",
  "categoryName": "RGB LED 5050",
  "categoryNameAr": "LED RGB 5050",
  "mounting": "SMD",
  "pinsText": "6",
  "pitchText": "1.5mm",
  "description": "RGB LED 5050 (KiCad Official)",
  "descriptionAr": "LED RGB 5050 (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "RGB LED 5050"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-led-5050-rgb"
  ]
},
{
  "id": "ess-tactile-6x6",
  "familyId": "switch_relay",
  "name": "Tactile Switch 6x6mm SMD",
  "nameAr": "مفتاح لمس 6×6 ملم",
  "category": "switch_relay",
  "categoryName": "Tactile Switch 6x6mm SMD",
  "categoryNameAr": "مفتاح لمس 6×6 ملم",
  "mounting": "SMD",
  "pinsText": "4",
  "pitchText": "4.5mm",
  "description": "Tactile Switch 6x6mm SMD (KiCad Official)",
  "descriptionAr": "مفتاح لمس 6×6 ملم (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "Tactile Switch 6x6mm SMD"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-tactile-6x6"
  ]
},
{
  "id": "ess-jst-xh-5p",
  "familyId": "connector",
  "name": "JST-XH 5-Pin",
  "nameAr": "JST-XH 5 أطراف",
  "category": "connector",
  "categoryName": "JST-XH 5-Pin",
  "categoryNameAr": "JST-XH 5 أطراف",
  "mounting": "THT",
  "pinsText": "5",
  "pitchText": "2.50mm",
  "description": "JST-XH 5-Pin (KiCad Official)",
  "descriptionAr": "JST-XH 5 أطراف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "JST-XH 5-Pin"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-jst-xh-5p"
  ]
},
{
  "id": "ess-jst-xh-6p",
  "familyId": "connector",
  "name": "JST-XH 6-Pin",
  "nameAr": "JST-XH 6 أطراف",
  "category": "connector",
  "categoryName": "JST-XH 6-Pin",
  "categoryNameAr": "JST-XH 6 أطراف",
  "mounting": "THT",
  "pinsText": "6",
  "pitchText": "2.50mm",
  "description": "JST-XH 6-Pin (KiCad Official)",
  "descriptionAr": "JST-XH 6 أطراف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "JST-XH 6-Pin"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-jst-xh-6p"
  ]
},
{
  "id": "ess-jst-ph-4p",
  "familyId": "connector",
  "name": "JST-PH 4-Pin",
  "nameAr": "JST-PH 4 أطراف",
  "category": "connector",
  "categoryName": "JST-PH 4-Pin",
  "categoryNameAr": "JST-PH 4 أطراف",
  "mounting": "THT",
  "pinsText": "4",
  "pitchText": "2.00mm",
  "description": "JST-PH 4-Pin (KiCad Official)",
  "descriptionAr": "JST-PH 4 أطراف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "JST-PH 4-Pin"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-jst-ph-4p"
  ]
},
{
  "id": "ess-jst-ph-5p",
  "familyId": "connector",
  "name": "JST-PH 5-Pin",
  "nameAr": "JST-PH 5 أطراف",
  "category": "connector",
  "categoryName": "JST-PH 5-Pin",
  "categoryNameAr": "JST-PH 5 أطراف",
  "mounting": "THT",
  "pinsText": "5",
  "pitchText": "2.00mm",
  "description": "JST-PH 5-Pin (KiCad Official)",
  "descriptionAr": "JST-PH 5 أطراف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "JST-PH 5-Pin"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-jst-ph-5p"
  ]
},
{
  "id": "ess-jst-ph-6p",
  "familyId": "connector",
  "name": "JST-PH 6-Pin",
  "nameAr": "JST-PH 6 أطراف",
  "category": "connector",
  "categoryName": "JST-PH 6-Pin",
  "categoryNameAr": "JST-PH 6 أطراف",
  "mounting": "THT",
  "pinsText": "6",
  "pitchText": "2.00mm",
  "description": "JST-PH 6-Pin (KiCad Official)",
  "descriptionAr": "JST-PH 6 أطراف (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "JST-PH 6-Pin"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-jst-ph-6p"
  ]
},
{
  "id": "ess-tb-2p-5.08",
  "familyId": "connector",
  "name": "Terminal Block 2P 5.08mm",
  "nameAr": "طرف لولبي 2P 5.08مم",
  "category": "connector",
  "categoryName": "Terminal Block 2P 5.08mm",
  "categoryNameAr": "طرف لولبي 2P 5.08مم",
  "mounting": "THT",
  "pinsText": "2",
  "pitchText": "5.08mm",
  "description": "Terminal Block 2P 5.08mm (KiCad Official)",
  "descriptionAr": "طرف لولبي 2P 5.08مم (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "Terminal Block 2P 5.08mm"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-tb-2p-5.08"
  ]
},
{
  "id": "ess-tb-3p-5.08",
  "familyId": "connector",
  "name": "Terminal Block 3P 5.08mm",
  "nameAr": "طرف لولبي 3P 5.08مم",
  "category": "connector",
  "categoryName": "Terminal Block 3P 5.08mm",
  "categoryNameAr": "طرف لولبي 3P 5.08مم",
  "mounting": "THT",
  "pinsText": "3",
  "pitchText": "5.08mm",
  "description": "Terminal Block 3P 5.08mm (KiCad Official)",
  "descriptionAr": "طرف لولبي 3P 5.08مم (رسمي KiCad)",
  "params": {
    "reference": "J",
    "value": "Terminal Block 3P 5.08mm"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-tb-3p-5.08"
  ]
},
{
  "id": "ess-barrel-jack",
  "familyId": "batteries_power",
  "name": "DC Barrel Jack 2.1mm",
  "nameAr": "جاك تغذية 2.1مم",
  "category": "power",
  "categoryName": "DC Barrel Jack 2.1mm",
  "categoryNameAr": "جاك تغذية 2.1مم",
  "mounting": "THT",
  "pinsText": "3",
  "pitchText": "2.5mm",
  "description": "DC Barrel Jack 2.1mm (KiCad Official)",
  "descriptionAr": "جاك تغذية 2.1مم (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "DC Barrel Jack 2.1mm"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-barrel-jack"
  ]
},
{
  "id": "ess-cr2032-smd",
  "familyId": "batteries_power",
  "name": "CR2032 Holder Keystone 1058 SMD",
  "nameAr": "حامل CR2032 سطحي",
  "category": "power",
  "categoryName": "CR2032 Holder Keystone 1058 SMD",
  "categoryNameAr": "حامل CR2032 سطحي",
  "mounting": "SMD",
  "pinsText": "2",
  "pitchText": "-",
  "description": "CR2032 Holder Keystone 1058 SMD (KiCad Official)",
  "descriptionAr": "حامل CR2032 سطحي (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "CR2032 Holder Keystone 1058 SMD"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-cr2032-smd"
  ]
},
{
  "id": "ess-cr2032-tht",
  "familyId": "batteries_power",
  "name": "CR2032 Holder Keystone 3002 THT",
  "nameAr": "حامل CR2032 ثقبي",
  "category": "power",
  "categoryName": "CR2032 Holder Keystone 3002 THT",
  "categoryNameAr": "حامل CR2032 ثقبي",
  "mounting": "THT",
  "pinsText": "2",
  "pitchText": "-",
  "description": "CR2032 Holder Keystone 3002 THT (KiCad Official)",
  "descriptionAr": "حامل CR2032 ثقبي (رسمي KiCad)",
  "params": {
    "reference": "K",
    "value": "CR2032 Holder Keystone 3002 THT"
  },
  "tags": [
    "essential",
    "kicad-official",
    "ess-cr2032-tht"
  ]
}
];

/**
 * Helper to generate footprint model for a library item
 */
export function buildModelFromLibraryItem(item: FootprintLibraryItem): KicadFootprintModel {
  // Prefer embedded offline official KiCad geometry when available.
  if (hasEmbeddedOfficial(item.id)) {
    const embedded = loadEmbeddedOfficialFootprint(item.id);
    if (embedded) {
      // Keep catalog-friendly reference/value defaults for the editor.
      const ref = item.params?.reference || embedded.properties?.Reference || "U";
      const val = item.params?.value || item.name;
      if (embedded.properties) {
        embedded.properties.Reference = String(ref);
        embedded.properties.Value = String(val);
      }
      return embedded;
    }
  }

  const family = FOOTPRINT_FAMILIES[item.familyId] || FOOTPRINT_FAMILIES.dip;
  const mergedParams = {
    ...family.defaultParams,
    ...item.params,
    reference: item.params?.reference || "U",
    value: item.params?.value || item.name,
  };
  const model = generateFootprint(item.familyId, mergedParams);
  const official = getOfficialFootprintRef(item.id) || guessOfficialFootprintRef(item.familyId, mergedParams);
  if (official) {
    (model as any).officialRef = official.fullName;
    (model as any).officialLibrary = official.library;
    (model as any).officialName = official.name;
  }
  return model;
}

/**
 * Resolve footprint for library UI: embedded official (offline) first,
 * then optional network official, then parametric generator.
 */
export async function resolveOfficialOrGeneratedModel(
  item: FootprintLibraryItem,
  loadOfficial?: (fullName: string) => Promise<KicadFootprintModel>
): Promise<KicadFootprintModel> {
  // 1) Embedded offline official
  if (hasEmbeddedOfficial(item.id)) {
    const embedded = loadEmbeddedOfficialFootprint(item.id);
    if (embedded) return embedded;
  }

  // 2) Generator baseline
  const generated = buildModelFromLibraryItem(item);

  // 3) Optional network fetch only if not embedded and mapping exists
  const official = getOfficialFootprintRef(item.id) || guessOfficialFootprintRef(item.familyId, {
    ...item.params,
  });
  if (!official || !loadOfficial) return generated;
  try {
    const model = await loadOfficial(official.fullName);
    model.library = model.library || official.library;
    if (!model.fullName) model.fullName = official.fullName;
    (model as any).catalogItemId = item.id;
    (model as any).fromOfficialKiCad = true;
    return model;
  } catch (err) {
    console.warn(`[CirZuit] Official footprint ${official.fullName} unavailable, using generator:`, err);
    return generated;
  }
}

export function isOfficialEmbeddedCatalogItem(itemId: string): boolean {
  return hasEmbeddedOfficial(itemId);
}

export const FOOTPRINT_LIBRARY_GROUPS: FootprintLibraryGroup[] = [
  {
    id: "Essentials_Offline",
    name: "Essentials (Offline)",
    nameAr: "أساسيات (بدون إنترنت)",
    category: "all",
    iconName: "Star",
    description: "High-value official KiCad footprints for offline use: ESP32-WROOM, Pico, Uno, USB-C, microSD, JST, relays, WS2812B, TO-220, terminals",
    descriptionAr: "بصمات KiCad الرسمية الأهم للعمل بدون إنترنت: ESP32 و Pico و USB-C و microSD و JST وريليهات و WS2812B",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("ess-")).map(i => i.id)
  },
  {
    id: "Package_DIP",
    name: "Package_DIP",
    nameAr: "حزم الدوائر المتكاملة DIP",
    category: "ic",
    iconName: "Cpu",
    description: "Standard Dual In-Line Packages (DIP-4 through DIP-64)",
    descriptionAr: "حزم الدوائر المتكاملة الثنائية التقليدية عبر اللوح THT",
    mountingTypes: ["THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.category === "ic" && i.id.startsWith("dip-")).map(i => i.id)
  },
  {
    id: "Package_SO",
    name: "Package_SO",
    nameAr: "حزم التثبيت السطحي SOIC / SSOP",
    category: "ic",
    iconName: "Cpu",
    description: "Small Outline IC Packages (SOIC-8, SOP, SSOP, TSSOP)",
    descriptionAr: "حزم التثبيت السطحي الصغيرة SOIC و SOP و SSOP و TSSOP",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.category === "ic" && !i.id.startsWith("dip-") && !i.id.startsWith("qfp") && !i.id.startsWith("qfn") && !i.id.startsWith("bga")).map(i => i.id)
  },
  {
    id: "Package_QFP_QFN",
    name: "Package_QFP_QFN",
    nameAr: "حزم QFP و QFN و LQFP",
    category: "ic",
    iconName: "Cpu",
    description: "Quad Flat Packages (QFP, TQFP, LQFP) and Quad Flat No-Lead (QFN, DFN)",
    descriptionAr: "حزم الأطراف الرباعية مسطحة الأطراف أو بدون أطراف QFP و QFN و DFN",
    mountingTypes: ["SMD"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.category === "ic" && (i.id.startsWith("qfp") || i.id.startsWith("qfn") || i.id.startsWith("dfn") || i.id.startsWith("lqfp"))).map(i => i.id)
  },
  {
    id: "Package_BGA",
    name: "Package_BGA",
    nameAr: "حزم الشبكة الكروية BGA",
    category: "ic",
    iconName: "Cpu",
    description: "Ball Grid Array Packages (BGA-64, BGA-100, FBGA)",
    descriptionAr: "حزم مصفوفة الشبكة الكروية للمتحكمات والمعالجات المتقدمة BGA",
    mountingTypes: ["SMD"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.category === "ic" && i.id.startsWith("bga")).map(i => i.id)
  },
  {
    id: "Resistor",
    name: "Resistor",
    nameAr: "المقاومات والمقاومات المتعددة",
    category: "passive",
    iconName: "Zap",
    description: "Axial Resistors (0207, 0411), Cement 5W/10W, Shunts, and Arrays",
    descriptionAr: "المقاومات الحلقية (Axial) ومقاومات الاسمنت وقدرات عالية ومصفوفات المقاومات",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("res-")).map(i => i.id)
  },
  {
    id: "Capacitor",
    name: "Capacitor",
    nameAr: "المكثفات (سيراميك، بولستر، كيميائي)",
    category: "passive",
    iconName: "Zap",
    description: "Disc Ceramic, Film Box, Radial Electrolytic, and Safety Capacitors X2",
    descriptionAr: "مكثفات السيراميك القرصية، ومكثفات البولستر، والمكثفات الكيميائية الإشعاعية",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("cap-")).map(i => i.id)
  },
  {
    id: "Inductor",
    name: "Inductor",
    nameAr: "الملفات والمحاثات",
    category: "passive",
    iconName: "Zap",
    description: "Axial Inductors, Power Toroid Chokes, and Drum Core Inductors",
    descriptionAr: "الملفات الحلقية وملفات القدرة وملفات الترددات والخانقات",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("ind-")).map(i => i.id)
  },
  {
    id: "Diode_LED",
    name: "Diode_LED",
    nameAr: "الدايودات والصمامات الثنائية LEDs",
    category: "semiconductor",
    iconName: "Zap",
    description: "DO-41 Rectifiers, DO-15, Schottky, Zener, LEDs 3mm/5mm/10mm",
    descriptionAr: "دايودات التقويم DO-41 و DO-15، ودايودات زينر، وصمامات LED بأحجام مختلفة",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("diode-")).map(i => i.id)
  },
  {
    id: "Transistor_FET",
    name: "Transistor_FET",
    nameAr: "الترانزستورات وموسفيت القدرة",
    category: "semiconductor",
    iconName: "Cpu",
    description: "TO-92 Small Signal, TO-126, TO-220, and TO-247 Power Transistors",
    descriptionAr: "ترانزستورات الإشارة TO-92 وترانزستورات القدرة TO-126 و TO-220 و TO-247",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("trans-")).map(i => i.id)
  },
  {
    id: "Pin_Headers_Terminal_Blocks",
    name: "Pin_Headers_Terminal_Blocks",
    nameAr: "رؤوس الدبابيس ومنافذ التوصيل",
    category: "connector",
    iconName: "Cable",
    description: "Standard Single and Double-Row Pin Headers (1x2 to 2x20), Screw Terminal Blocks (2P to 8P)",
    descriptionAr: "رؤوس الدبابيس الفردية والزوجية، ومنافذ البراغي لتوصيل الأسلاك والأطراف خطوة 5.08مم",
    mountingTypes: ["THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("conn-hdr-") || i.id.startsWith("conn-tb-")).map(i => i.id)
  },
  {
    id: "Connector_Interface",
    name: "Connector_Interface",
    nameAr: "الموصلات وواجهات الاتصال",
    category: "connector",
    iconName: "Cable",
    description: "USB Type-C, USB Type-A, Micro-USB, DC Barrel Jack, RJ45 Ethernet, JST-XH, JST-PH, and Audio Jacks",
    descriptionAr: "منافذ USB-C و Micro-USB ومقابس تيار مستمر DC ومنافذ إيثرنت وموصلات JST-XH/PH وسماعات الصوت",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("conn-if-") || i.id.startsWith("ess-usb") || i.id.startsWith("ess-jst") || i.id.startsWith("ess-microsd") || i.id.startsWith("ess-pinsocket") || i.id.startsWith("ess-tb-") || i.id.startsWith("ess-barrel")).map(i => i.id)
  },
  {
    id: "RF_Antennas",
    name: "RF_Antennas",
    nameAr: "الهوائيات ومكونات التردد اللاسلكي RF",
    category: "connector",
    iconName: "Cable",
    description: "SMA RF Jacks (Vertical/Edge), U.FL SMT, 2.4GHz PCB Trace Antennas, Helical Springs, and NRF24L01+ Sockets",
    descriptionAr: "مقابس وموصلات SMA و U.FL وهوائيات مطبوعة 2.4GHz وهوائيات حلزونية ومستقبلات NRF24L01+",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("rf-") || i.id.startsWith("ant-") || i.id === "mod-nrf24").map(i => i.id)
  },
  {
    id: "Crystal_Oscillator",
    name: "Crystal_Oscillator",
    nameAr: "الكريستال والمذبذبات",
    category: "crystal",
    iconName: "Zap",
    description: "HC-49S, HC-49U, 32.768kHz RTC Cylinders, and SMD Oscillators",
    descriptionAr: "بلورات الكريستال الثقبية HC-49 والساعات 32.768kHz ومذبذبات SMD",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("xtal-")).map(i => i.id)
  },
  {
    id: "Switch_Relay",
    name: "Switch_Relay",
    nameAr: "المفاتيح والمرحلات الكهربائية",
    category: "switch_relay",
    iconName: "Zap",
    description: "Tactile Pushbuttons, DIP Switches, Slide Switches, Songle Relays",
    descriptionAr: "أزرار ضغط ومفاتيح DIP ومفاتيح منزلقة ومرحلات 5V/12V",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("sw-") || i.id.startsWith("ess-relay") || i.id.startsWith("ess-tactile")).map(i => i.id)
  },
  {
    id: "Fuse_Protection",
    name: "Fuse_Protection",
    nameAr: "الحماية والفيوزات وموانع الصواعق",
    category: "protection",
    iconName: "Zap",
    description: "5x20mm Glass Fuses, Auto Blade Fuses, MOV Varistors",
    descriptionAr: "فيوزات زجاجية وسيارات وفاريستورات حماية الجهد الزائد",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("fuse-")).map(i => i.id)
  },
  {
    id: "Potentiometer_Trimmer",
    name: "Potentiometer_Trimmer",
    nameAr: "المقاومات المتغيرة والتريمر",
    category: "potentiometer",
    iconName: "Zap",
    description: "Bourns 3296W Multiturn, 3362P Single-turn, Rotary 16mm",
    descriptionAr: "مقاومات ضبط دقيقة 3296W ومقاومات دائرية 16مم",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("pot-")).map(i => i.id)
  },
  {
    id: "Optocoupler_Isolator",
    name: "Optocoupler_Isolator",
    nameAr: "العوازل الضوئية",
    category: "opto",
    iconName: "Zap",
    description: "PC817 DIP-4, 4N35 DIP-6, 6N137 High-Speed DIP-8",
    descriptionAr: "عوازل ضوئية للعزل الكهربائي وحماية الدوائر الحساسة PC817 و 4N35",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("opto-")).map(i => i.id)
  },
  {
    id: "Battery_Power",
    name: "Battery_Power",
    nameAr: "البطاريات وحوامل التغذية",
    category: "power",
    iconName: "Zap",
    description: "CR2032 Coin Cell Holders (SMD/THT), 18650 Li-Ion Clips, 9V Battery Snaps",
    descriptionAr: "حوامل بطاريات CR2032 (سطحية وثقبية) وخلايا 18650 وأطراف بطاريات 9V",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("bat-")).map(i => i.id)
  },
  {
    id: "Display",
    name: "Display",
    nameAr: "الشاشات ووسائل العرض",
    category: "display",
    iconName: "Zap",
    description: "OLED 0.96\" I2C, OLED 1.3\" SPI, 7-Segment Displays, LCD 1602 Character, TFT 2.4\" SPI",
    descriptionAr: "شاشات عرض OLED و شاشات سباعية الأرقام وشاشات بلورية LCD وشاشات TFT ملونة",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("disp-")).map(i => i.id)
  },
  {
    id: "Sensor",
    name: "Sensor",
    nameAr: "المستشعرات والحساسات",
    category: "sensor",
    iconName: "Zap",
    description: "DHT11/22, HC-SR04 Ultrasonic, HC-SR501 PIR, Hall Effect TO-92, BME280/BMP280, MPU-6050, 5mm LDR",
    descriptionAr: "مستشعرات الحرارة والرطوبة، ومستشعرات المسافة وحساسات الحركة والضغط الجوي والتسارع والضوء",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("sensor-")).map(i => i.id)
  },
  {
    id: "Module_Controller",
    name: "Module_Controller",
    nameAr: "الوحدات والمتحكمات التطويرية",
    category: "module",
    iconName: "Cpu",
    description: "Arduino Nano, ESP32 DevKit, Raspberry Pi Pico, STM32 BluePill",
    descriptionAr: "لوحات أردوينو نانو و ESP32 وراسبيري باي بيكو و STM32",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("mod-") || i.id.startsWith("ess-esp") || i.id.startsWith("ess-arduino") || i.id.startsWith("ess-rpi")).map(i => i.id)
  },
  {
    id: "Mechanical_Test",
    name: "Mechanical_Test",
    nameAr: "الميكانيكا ونقاط الفحص والمحاذاة",
    category: "mechanical",
    iconName: "Box",
    description: "Mounting Holes (M2.5/M3/M4), Test Points THT/SMD, and Optical Fiducials",
    descriptionAr: "ثقوب تثبيت أرضية ومعزولة ونقاط فحص الإشارات وعلامات محاذاة بصرية SMT",
    mountingTypes: ["SMD", "THT"],
    itemIds: FOOTPRINT_LIBRARY_CATALOG.filter(i => i.id.startsWith("mech-")).map(i => i.id)
  }
];
