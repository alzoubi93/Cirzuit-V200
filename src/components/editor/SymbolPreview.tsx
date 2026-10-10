import { useState, useEffect, cloneElement, isValidElement } from "react";
import { SYMBOLS } from "@/lib/symbols";
import type { SymbolId } from "@/lib/schematic";
import { getImportedKiCadSymbol } from "@/lib/kicadSymbol";
import { getRealisticSymbolWebGLDataUrl } from "./webgl/realisticWebGLThumbnail";

export function SymbolPreview({ id, size = 56, color = "currentColor", realistic = false }: { id: SymbolId; size?: number; color?: string; realistic?: boolean }) {
  const sym = SYMBOLS[id] || getImportedKiCadSymbol(id);
  // KiCad symbols are vector schematic drawings — skip realistic 3D preview
  const useRealistic = Boolean(sym && realistic && !String(id).startsWith("kicad:"));
  const defaultVal = sym?.defaultValue;

  const [webglSrc, setWebglSrc] = useState<string | null>(() => {
    if (!useRealistic || !sym) return null;
    return getRealisticSymbolWebGLDataUrl(id, defaultVal, Math.max(128, Math.round(size * 2)));
  });

  useEffect(() => {
    if (useRealistic && sym) {
      const src = getRealisticSymbolWebGLDataUrl(id, defaultVal, Math.max(128, Math.round(size * 2)));
      setWebglSrc(src);
    } else {
      setWebglSrc(null);
    }
  }, [id, useRealistic, defaultVal, size, sym]);

  if (!sym) return null;

  if (useRealistic) {
    if (webglSrc) {
      return (
        <img
          src={webglSrc}
          alt={String(id)}
          width={size}
          height={size}
          className="object-contain pointer-events-none select-none drop-shadow-sm mx-auto"
          style={{ width: size, height: size, maxWidth: "100%", maxHeight: "100%" }}
        />
      );
    }
    return <div style={{ width: size, height: size }} className="animate-pulse bg-muted/20 rounded mx-auto" />;
  }

  const pad = 0.5;
  const w = sym.width + pad * 2;
  const h = sym.height + pad * 2;
  const renderedSymbol = typeof sym.draw === "function" ? sym.draw(color) : null;
  const safeContent = Array.isArray(renderedSymbol)
    ? renderedSymbol.map((el, idx) => (isValidElement(el) && el.key == null ? cloneElement(el, { key: `child-${idx}` }) : el))
    : renderedSymbol;

  return (
    <svg viewBox={`${-pad} ${-pad} ${w} ${h}`} width={size} height={size} preserveAspectRatio="xMidYMid meet">
      <g key={`symbol-${id}`}>
        {safeContent}
      </g>
    </svg>
  );
}
