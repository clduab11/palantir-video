import ms from "milsymbol";

export type MilSymbolRenderOptions = {
  size?: number;
  evaluationRating?: string;
  uniqueDesignation?: string;
  staffComments?: string;
};

const svgCache = new Map<string, string>();

/**
 * Deterministic MIL-STD-2525C/D SVG renderer backed by spatialillusions/milsymbol.
 * Pure JS SVG generation — safe in SSR, Vitest, and browser components.
 */
export function renderMilSymbolSvg(
  sidc: string,
  options: MilSymbolRenderOptions = {},
): string {
  const size = options.size ?? 28;
  const key = `${sidc}:${size}:${options.evaluationRating ?? ""}:${options.uniqueDesignation ?? ""}:${options.staffComments ?? ""}`;
  const cached = svgCache.get(key);
  if (cached) return cached;

  const hasLabels = Boolean(
    options.evaluationRating ||
      options.uniqueDesignation ||
      options.staffComments,
  );

  const sym = new ms.Symbol(sidc, {
    size,
    frame: true,
    fill: true,
    strokeWidth: 4,
    outlineWidth: 2,
    outlineColor: "#05080d",
    infoFields: hasLabels,
    infoColor: "#e4e4e7",
    ...(options.evaluationRating
      ? { evaluationRating: options.evaluationRating }
      : {}),
    ...(options.uniqueDesignation
      ? { uniqueDesignation: options.uniqueDesignation }
      : {}),
    ...(options.staffComments ? { staffComments: options.staffComments } : {}),
  });

  const svg = sym.asSVG();
  svgCache.set(key, svg);
  return svg;
}

export function renderMilSymbolDataUri(
  sidc: string,
  options: MilSymbolRenderOptions = {},
): string {
  const svg = renderMilSymbolSvg(sidc, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
