import { contourToMm, rectContour, snippetToContour } from './contour.ts';
import type { NfpCoreResult, NfpPartRequest, NfpRunRequest, Pt } from './nfpTypes.ts';
import {
  expandParts,
  GrainDirection,
  type GrainDirectionType,
  type IndividualPartOverride,
  type NestingResult,
  type PartInput,
  type PlacedPart,
  type SheetConfig,
  type SheetStats,
} from './nesting.ts';

// Main-thread bridge for the NFP engine: builds worker requests (contour
// extraction happens here — DOM-free), computes grain-legal rotation angles,
// and converts raw worker output into the shared NestingResult shape.

export const DEFAULT_FREE_ROTATION_COUNT = 16;
export const DEFAULT_NFP_BUDGET_MS = 5000;
export const DEFAULT_NFP_RESTARTS = 14;

export interface NfpEngineOptions {
  freeRotationCount?: number;
  budgetMs?: number;
  maxRestarts?: number;
}

export function isAxisAlignedRect(pts: Pt[]): boolean {
  if (pts.length !== 4) return false;
  let horiz = 0;
  let vert = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy < 1e-6 && dx > 1e-6) horiz++;
    else if (dx < 1e-6 && dy > 1e-6) vert++;
    else return false;
  }
  return horiz === 2 && vert === 2;
}

/**
 * Grain-legal rotation angles (degrees) for one part, mirroring the rect
 * engine's getAllowedOrientations, expanded to fine angles for FREE grain
 * on irregular shapes. Axis-aligned rectangles collapse to [0]/[90] because
 * 180°/270° are shape-equivalent (big NFP cache win, no quality loss).
 */
export function computeNfpRotations(
  part: {
    width: number;
    height: number;
    grain?: GrainDirectionType;
    overrideRotated?: boolean;
  },
  isRect: boolean,
  freeRotationCount: number = DEFAULT_FREE_ROTATION_COUNT,
  _vertexCount?: number,
): number[] {
  const w = part.width;
  const h = part.height;

  if (part.overrideRotated !== undefined) {
    return part.overrideRotated ? [90] : [0];
  }

  const grain = (part.grain || GrainDirection.FREE).toLowerCase();

  switch (grain) {
    case GrainDirection.WIDTH:
    case 'x':
    case 'horizontal':
      return [0];
    case GrainDirection.HEIGHT:
    case 'y':
    case 'vertical':
      if (w === h) return [0];
      return [90];
    case GrainDirection.FREE:
    default: {
      if (isRect) return [0, 90];
      // The requested search space must not silently shrink with contour detail.
      const n = Math.max(4, Math.min(72, Math.floor(freeRotationCount) || DEFAULT_FREE_ROTATION_COUNT));
      const step = 360 / n;
      return Array.from({ length: n }, (_, i) => Math.round(i * step * 100) / 100);
    }
  }
}

export function buildNfpRequest(
  parts: PartInput[],
  sheetConfig: SheetConfig,
  globalMultiplier = 1,
  partOverrides?: Record<string, IndividualPartOverride>,
  opts: NfpEngineOptions = {},
): NfpRunRequest {
  const expanded = expandParts(parts, globalMultiplier, partOverrides);
  const contourCache = new Map<string, Pt[]>();

  const requests: NfpPartRequest[] = expanded.map((p) => {
    const shapeId = `${p.id}|${p.width}x${p.height}`;
    let contour = contourCache.get(shapeId);
    if (!contour) {
      if (p.svgSnippet) {
        const raw = snippetToContour(p.svgSnippet);
        contour =
          raw.length >= 3 && p.originalBBox
            ? contourToMm(raw, p.originalBBox, p.width, p.height)
            : rectContour(p.width, p.height);
      } else {
        contour = rectContour(p.width, p.height);
      }
      contourCache.set(shapeId, contour);
    }
    const isRect = isAxisAlignedRect(contour);
    return {
      uniqueId: p.uniqueId,
      shapeId,
      name: p.name,
      contour,
      width: p.width,
      height: p.height,
      rotations: computeNfpRotations(p, isRect, opts.freeRotationCount, contour.length),
      grain: p.grain,
      color: p.color,
      svgSnippet: p.svgSnippet,
      viewBox: p.viewBox,
      originalBBox: p.originalBBox,
      pathData: p.pathData,
    };
  });

  return {
    parts: requests,
    sheet: {
      sheetWidth: sheetConfig.sheetWidth,
      sheetHeight: sheetConfig.sheetHeight,
      sheetMargin: sheetConfig.sheetMargin,
      partGap: sheetConfig.partGap,
      pricePerSheet: sheetConfig.pricePerSheet,
    },
    budgetMs: opts.budgetMs ?? DEFAULT_NFP_BUDGET_MS,
    maxRestarts: opts.maxRestarts ?? DEFAULT_NFP_RESTARTS,
  };
}

/** Convert raw worker output into the shared NestingResult used by all UI/exporters. */
export function rawResultToNestingResult(
  raw: NfpCoreResult,
  parts: PartInput[],
  sheetConfig: SheetConfig,
  globalMultiplier = 1,
  partOverrides?: Record<string, IndividualPartOverride>,
): NestingResult {
  const expanded = expandParts(parts, globalMultiplier, partOverrides);
  const byUniqueId = new Map(expanded.map((p) => [p.uniqueId, p]));
  if (byUniqueId.size !== expanded.length) {
    throw new Error('Duplicate part IDs: re-import the designs to give each part a unique identity.');
  }
  const placedIds = new Set<string>();

  const W = sheetConfig.sheetWidth;
  const H = sheetConfig.sheetHeight;
  const margin = Math.max(0, sheetConfig.sheetMargin ?? 0);
  const totalArea = W * H;
  const usableArea = Math.max(0, W - 2 * margin) * Math.max(0, H - 2 * margin);

  const sheetsStats: SheetStats[] = [];

  for (let si = 0; si < raw.sheets.length; si++) {
    const sheetOut = raw.sheets[si];
    const placedParts: PlacedPart[] = [];

    for (const pl of sheetOut.placements) {
      const src = byUniqueId.get(pl.uniqueId);
      if (!src || placedIds.has(pl.uniqueId)) {
        throw new Error(`Invalid or repeated NFP placement: ${pl.uniqueId}`);
      }
      placedIds.add(pl.uniqueId);
      const quarterTurn = ((pl.rotationDeg % 180) + 180) % 180 === 90;
      placedParts.push({
        id: src.id,
        uniqueId: src.uniqueId,
        name: src.name || `Part_${src.id}`,
        x: pl.x,
        y: pl.y,
        width: pl.width,
        height: pl.height,
        originalWidth: src.width,
        originalHeight: src.height,
        rotated: quarterTurn,
        grain: src.grain || GrainDirection.FREE,
        color: src.color,
        pathData: src.pathData,
        svgSnippet: src.svgSnippet,
        viewBox: src.viewBox,
        originalBBox: src.originalBBox,
        contour: pl.contour,
        rotationDeg: pl.rotationDeg,
        worldTx: pl.tx,
        worldTy: pl.ty,
      });
    }

    // A rotated or concave part does not occupy its bounding-box area.
    const partsArea = sheetOut.placements.reduce((sum, p) => sum + p.area, 0);
    const wasteArea = Math.max(0, totalArea - partsArea);
    const utilization = totalArea > 0 ? (partsArea / totalArea) * 100 : 0;
    const wastePercent = totalArea > 0 ? (wasteArea / totalArea) * 100 : 0;

    let totalCutLengthMm = 0;
    for (const pl of sheetOut.placements) {
      totalCutLengthMm += pl.perimeter > 0 ? pl.perimeter : (pl.width + pl.height) * 2;
    }
    const estimatedCutMeters = parseFloat(((totalCutLengthMm * 0.65) / 1000).toFixed(2));

    sheetsStats.push({
      sheetIndex: si + 1,
      sheetWidth: W,
      sheetHeight: H,
      sheetMargin: margin,
      partGap: sheetConfig.partGap,
      placedCount: placedParts.length,
      usedArea: Math.round(partsArea),
      totalArea: Math.round(totalArea),
      wasteArea: Math.round(wasteArea),
      usableArea: Math.round(usableArea),
      utilizationPercent: parseFloat(utilization.toFixed(2)),
      wastePercent: parseFloat(wastePercent.toFixed(2)),
      placedParts,
      estimatedCutLengthMeters: estimatedCutMeters,
    });
  }

  // Every input instance must be either placed or explicitly reported unplaced.
  const unplacedParts = expanded.filter((p) => !placedIds.has(p.uniqueId));

  const totalSheetArea = sheetsStats.reduce((sum, s) => sum + s.totalArea, 0);
  const totalUsedArea = sheetsStats.reduce((sum, s) => sum + s.usedArea, 0);
  const totalWasteArea = totalSheetArea - totalUsedArea;
  const overallUtilization = totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0;
  const overallWaste = totalSheetArea > 0 ? (totalWasteArea / totalSheetArea) * 100 : 0;
  const totalCutLength = sheetsStats.reduce((sum, s) => sum + s.estimatedCutLengthMeters, 0);
  const price = sheetConfig.pricePerSheet || 0;
  const totalMaterialCost = sheetsStats.length * price;

  return {
    optimization: raw.layoutMethod ? {
      method: raw.layoutMethod, timedOut: !!raw.optimizationTimedOut,
      baselineAreaMm2: raw.baselineAreaMm2, occupiedAreaMm2: raw.occupiedAreaMm2,
      improvementPercent: raw.improvementPercent,
    } : undefined,
    summary: {
      sheetsUsed: sheetsStats.length,
      totalPartsProvided: expanded.length,
      totalPartsPlaced: expanded.length - unplacedParts.length,
      unplacedCount: unplacedParts.length,
      totalSheetArea: Math.round(totalSheetArea),
      totalUsedArea: Math.round(totalUsedArea),
      totalWasteArea: Math.round(totalWasteArea),
      overallUtilizationPercent: parseFloat(overallUtilization.toFixed(2)),
      overallWastePercent: parseFloat(overallWaste.toFixed(2)),
      totalEstimatedCutLengthMeters: parseFloat(totalCutLength.toFixed(2)),
      totalMaterialCost: parseFloat(totalMaterialCost.toFixed(2)),
    },
    sheets: sheetsStats,
    unplacedParts,
  };
}
