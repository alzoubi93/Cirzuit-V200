/**
 * Conservative capability diagnostics for Gerber RS-274X input.
 * This does not change geometry or pretend unsupported commands were rendered.
 * Call before import to surface constructs that need full spec support.
 */
export type GerberDiagnosticCode =
  | "REGION_FILL_UNSUPPORTED"
  | "CLEAR_POLARITY_UNSUPPORTED"
  | "APERTURE_MACRO_UNSUPPORTED"
  | "BLOCK_APERTURE_UNSUPPORTED"
  | "STEP_REPEAT_PRESENT"
  | "ARC_INTERPOLATION_PRESENT"
  | "X2_ATTRIBUTES_PRESENT";

export interface GerberDiagnostic {
  code: GerberDiagnosticCode;
  severity: "warning" | "info";
  message: string;
}

export function diagnoseGerberContent(content: string): GerberDiagnostic[] {
  const source = content.toUpperCase();
  const results: GerberDiagnostic[] = [];
  const add = (code: GerberDiagnosticCode, severity: GerberDiagnostic["severity"], message: string) => {
    if (!results.some((item) => item.code === code)) results.push({ code, severity, message });
  };

  if (/\bG0?36\b/.test(source) || /\bG0?37\b/.test(source)) {
    add("REGION_FILL_UNSUPPORTED", "warning", "This file contains G36/G37 region fills; simple dark filled regions are imported as PCB zones and rendered by the WebGL zone pass. Nested contours and clear-polarity boolean composition still require validation.");
  }
  if (/%LPC\s*\*%/i.test(content)) {
    add("CLEAR_POLARITY_UNSUPPORTED", "warning", "This file uses clear polarity (LPC); contained closed clear regions inside a previously imported dark region are represented as WebGL polygon holes, but general ordered polarity compositing is not yet fully supported.");
  }
  if (/%AM[A-Z0-9_$.-]+\s*\*/i.test(content)) {
    add("APERTURE_MACRO_UNSUPPORTED", "warning", "This file defines Aperture Macros; common primitives are supported, but the importer does not yet implement every primitive or exact boolean compositing.");
  }
  if (/%ABD\d+/i.test(content) || /%AB\s*\*%/i.test(content)) {
    add("BLOCK_APERTURE_UNSUPPORTED", "warning", "This file uses block apertures; block aperture geometry is not yet fully evaluated.");
  }
  if (/%SRX/i.test(content)) {
    add("STEP_REPEAT_PRESENT", "info", "This file uses step-and-repeat; the importer has basic support for repeated geometry.");
  }
  if (/\bG0?[23](?=\D|$)/.test(source)) {
    add("ARC_INTERPOLATION_PRESENT", "info", "This file contains circular interpolation; arcs are approximated with line segments for rendering.");
  }
  if (/%T[FA]\. /i.test(content) || /%TF\.|%TA\.|%TO\./i.test(content)) {
    add("X2_ATTRIBUTES_PRESENT", "info", "This file contains Gerber X2 attributes; layer classification may use some attributes, but full metadata is not retained.");
  }
  return results;
}
