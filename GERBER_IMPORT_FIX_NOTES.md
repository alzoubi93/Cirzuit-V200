# Gerber Import Fix — preserveOrigin ReferenceError

## Problem
`importGerberToProject` referenced the variable `preserveOrigin` which is only a
parameter of `parseGerberFile`, not of the top-level import function. This caused:

  ReferenceError: preserveOrigin is not defined

and the UI showed: فشل استيراد ملفات Gerber / Failed to import Gerber files

## Fix
In `src/lib/importGerber.ts`, top-level imports always normalize coordinates to
the board origin:

  const offsetX = -minX;
  const offsetY = -minY;

Recursive block-aperture parsing still uses `preserveOrigin` inside `parseGerberFile`.

## Tested with
FELEZJOO gerber set (copper/silkscreen/soldermask top+bottom + Excellon drill).
