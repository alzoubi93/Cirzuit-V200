# CirZuit — Embedded Official KiCad Footprints (Optimized)

## Size strategy
| Asset | Role | Approx size |
|-------|------|-------------|
| `public/kicad-footprints/officialMods.json.gz` | Primary offline pack (gzip) | **~200 KB** |
| `embedded/officialMods.json` | Fallback if gunzip unavailable | ~2.1 MB (not in main load path) |
| `embedded/officialMeta.json` | Eager metadata | ~57 KB |
| `embedded/mods/` | **Removed** (was duplicate) | 0 |

Runtime: inflate gzip once via `DecompressionStream`, keep models in memory.
WebGL path unchanged (`readKicadFootprintDefinition` → native WebGL).

## Essentials added (offline)
- ESP32-WROOM-32, Arduino UNO R3, Raspberry Pi Pico
- microSD (Molex), USB-C 16P & 24P
- Pin sockets 1x8 / 1x10 / 2x20
- Relays Omron G5V-1 / G5V-2, CUI SR5 (Songle-class)
- TO-220 horizontal & vertical
- WS2812B, RGB 5050
- Tactile 6x6 SMD
- JST-XH 5–6, JST-PH 4–6
- Terminal block 2P/3P 5.08mm, Barrel jack
- CR2032 Keystone 1058 (SMD) & 3002 (THT)

Also fixed poor mappings for mod-esp32, mod-pico, mod-nano, relays, terminal blocks.

## Catalog
All previous catalog IDs remain embedded + 27 `ess-*` essentials.
Library group **Essentials (Offline)** lists them first.
