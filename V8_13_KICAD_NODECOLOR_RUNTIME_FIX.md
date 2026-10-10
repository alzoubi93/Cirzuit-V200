# V8.13 — KiCad nodeColor runtime fix

Fixed the remaining `ReferenceError: nodeColor is not defined` in the KiCad component-label WebGL memo.

The KiCad label path now uses a local `labelColor` variable for all free-text, reference/value, pin-name and pin-number labels. It no longer references `nodeColor` from the surrounding rendering path.

This is intentionally a narrow runtime fix and does not change the KiCad geometry pipeline.

After replacing the project, restart the Vite dev server once (stop `npm run dev`, then start it again) to discard any stale HMR module/source-map state before testing the `.kicad_sch` import.
