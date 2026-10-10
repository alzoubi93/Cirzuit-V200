# Gerber IC Pad Gap Fix V5

- Keeps the V4 Gerber behavior: no fabricated sequential pad numbers.
- Adds display-only clearance between neighboring imported Gerber pads when their raw copper flash size would visually merge.
- Targets THT/IC/connector pitch first; fine-pitch SMD uses a smaller clearance.
- Does not modify imported coordinates, tracks, nets, or copper connectivity.
- Real copper tracks remain rendered separately and can still connect pads when the Gerber actually contains that copper.
- PCB export-label placement from V3 remains unchanged.
