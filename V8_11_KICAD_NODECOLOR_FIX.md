# V8.11 — KiCad WebGL runtime fix

Fixed a runtime ReferenceError during `.kicad_sch` import/rendering:
`ReferenceError: nodeColor is not defined` in the KiCad-native text path.

The KiCad-native WebGL text renderer now computes a local `kicadTextColor` inside the parsed-symbol branch instead of relying on the outer `nodeColor` binding. This makes the branch self-contained and robust against Vite/HMR stale module closures.

No rendering architecture was changed; this is a focused runtime fix on top of V8.10.
