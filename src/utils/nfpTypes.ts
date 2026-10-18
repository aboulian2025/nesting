export interface Pt {
  x: number;
  y: number;
}

export interface NfpPartRequest {
  uniqueId: string;
  shapeId: string;
  name: string;
  contour: Pt[];
  holes?: Pt[][];
  width: number;
  height: number;
  rotations: number[];
  grain: string;
  color?: string;
  svgSnippet?: string;
  viewBox?: string;
  originalBBox?: { x: number; y: number; width: number; height: number };
  pathData?: string;
}

export interface NfpSheetRequest {
  sheetWidth: number;
  sheetHeight: number;
  sheetMargin: number;
  partGap: number;
  pricePerSheet?: number;
}

export interface NfpRunRequest {
  parts: NfpPartRequest[];
  sheet: NfpSheetRequest;
  budgetMs: number;
  maxRestarts: number;
}

export interface NfpPlacementOut {
  uniqueId: string;
  sheetIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  /** إزاحة نقطة الأصل المحلية للقطعة على اللوح (نظام مم) قبل التدوير */
  tx: number;
  ty: number;
  contour: Pt[];
  holes?: Pt[][];
  area: number;
  perimeter: number;
}

export interface NfpSheetOut {
  placements: NfpPlacementOut[];
}

export interface NfpCoreResult {
  layoutMethod?: 'baseline' | 'compacted' | 'nfp';
  optimizationTimedOut?: boolean;
  baselineAreaMm2?: number;
  occupiedAreaMm2?: number;
  improvementPercent?: number;
  sheets: NfpSheetOut[];
  unplacedUniqueIds: string[];
  score: number;
  restartsRun: number;
  elapsedMs: number;
}

export interface NfpProgress {
  restart: number;
  placed: number;
  total: number;
  elapsedMs: number;
}

export type NfpWorkerIn = { type: 'run'; request: NfpRunRequest };

export type NfpWorkerOut =
  | { type: 'ready' }
  | { type: 'progress'; progress: NfpProgress }
  | { type: 'checkpoint'; result: NfpCoreResult }
  | { type: 'done'; result: NfpCoreResult }
  | { type: 'error'; message: string };
