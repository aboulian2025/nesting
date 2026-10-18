/**
 * @file nesting.ts
 * محرك توزيع القطع على ألواح الخشب (Sheet Nesting Engine)
 * خوارزمية MaxRects (BSSF / BAF) مع قفل عروق الخشب (Wood Grain Lock)
 */

export const GrainDirection = {
  WIDTH: 'width',   // أفقي = عرض (محاذاة العرض أفقياً، يمنع الدوران)
  HEIGHT: 'height', // رأسي = طول (محاذاة الطول رأسياً، تدوير إلزامي 90 درجة)
  FREE: 'free'      // حر = تدوير حر للقطعة حسب المساحة لتقليل الهدر واستغلال الفراغات
} as const;

export type GrainDirectionType = typeof GrainDirection[keyof typeof GrainDirection];

export interface IndividualPartOverride {
  rotated?: boolean;
  grain?: GrainDirectionType;
  customWidth?: number;
  customHeight?: number;
  hidden?: boolean; // إخفاء أو حذف القطعة الفردية دون حذف بقية الصنف
}

export interface PartInput {
  id: string;
  name: string;
  width: number;
  height: number;
  count: number;
  grain: GrainDirectionType;
  color?: string;
  material?: string;
  pathData?: string; // Optional SVG path 'd'
  svgSnippet?: string; // Real SVG markup (paths, holes, groups)
  viewBox?: string;    // Local bounding box viewBox
  originalBBox?: { x: number; y: number; width: number; height: number };
  overrideRotated?: boolean; // خاصية التحكم الفردي في تدوير القطعة بالذات
  metadata?: Record<string, unknown>;
}

export interface PlacedPart {
  id: string;
  uniqueId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  rotated: boolean;
  grain: GrainDirectionType;
  color?: string;
  pathData?: string;
  svgSnippet?: string;
  viewBox?: string;
  originalBBox?: { x: number; y: number; width: number; height: number };
  /** الكنتور الحقيقي (نظام إحداثيات اللوح بالمم) — يضبطه محرك NFP غير المنتظم فقط */
  contour?: { x: number; y: number }[];
  /** زاوية التدوير الفعلية بالدرجات (0-360) — محرك NFP فقط؛ المحرك المستطيلات يتجاهله */
  rotationDeg?: number;
  /** إزاحة أصل القطعة المحلي على اللوح — محرك NFP فقط؛ لإعادة بناء تحويل الـ snippet الحقيقي */
  worldTx?: number;
  worldTy?: number;
}

export interface SheetConfig {
  sheetWidth: number;   // افتراضياً 2400 مم (عرض اللوح المخصص)
  sheetHeight: number;  // افتراضياً 1200 مم (ارتفاع اللوح المخصص)
  sheetMargin: number;  // e.g. 15 mm
  partGap: number;      // e.g. 4 mm (saw blade kerf)
  materialName?: string;
  pricePerSheet?: number;
  thickness?: number;   // e.g. 18 mm
}

export interface SheetStats {
  sheetIndex: number;
  sheetWidth: number;
  sheetHeight: number;
  sheetMargin: number;
  partGap: number;
  placedCount: number;
  usedArea: number;
  totalArea: number;
  wasteArea: number;
  usableArea: number;
  utilizationPercent: number;
  wastePercent: number;
  placedParts: PlacedPart[];
  estimatedCutLengthMeters: number;
}

export interface NestingResult {
  optimization?: {
    method: 'baseline' | 'compacted' | 'nfp'; timedOut: boolean;
    baselineAreaMm2?: number; occupiedAreaMm2?: number; improvementPercent?: number;
  };
  summary: {
    sheetsUsed: number;
    totalPartsProvided: number;
    totalPartsPlaced: number;
    unplacedCount: number;
    totalSheetArea: number;
    totalUsedArea: number;
    totalWasteArea: number;
    overallUtilizationPercent: number;
    overallWastePercent: number;
    totalEstimatedCutLengthMeters: number;
    totalMaterialCost: number;
  };
  sheets: SheetStats[];
  unplacedParts: PartInput[];
}

export class Rect {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get right(): number {
    return this.x + this.width;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  contains(other: Rect): boolean {
    return (
      other.x >= this.x &&
      other.y >= this.y &&
      other.right <= this.right &&
      other.bottom <= this.bottom
    );
  }

  intersects(other: Rect): boolean {
    return !(
      other.x >= this.right ||
      other.right <= this.x ||
      other.y >= this.bottom ||
      other.bottom <= this.y
    );
  }
}

/**
 * فئة تمثيل وإدارة اللوح الواحد بخوارزمية MaxRects BSSF
 */
export class SheetBin {
  public index: number;
  public sheetWidth: number;
  public sheetHeight: number;
  public sheetMargin: number;
  public partGap: number;

  public usableMinX: number;
  public usableMinY: number;
  public usableMaxX: number;
  public usableMaxY: number;
  public usableWidth: number;
  public usableHeight: number;

  public freeRectangles: Rect[];
  public placedParts: PlacedPart[];

  constructor(index: number, config: SheetConfig) {
    this.index = index;
    this.sheetWidth = Math.max(1, config.sheetWidth);
    this.sheetHeight = Math.max(1, config.sheetHeight);
    this.sheetMargin = Math.max(0, config.sheetMargin ?? 0);
    this.partGap = Math.max(0, config.partGap ?? 0);

    this.usableMinX = this.sheetMargin;
    this.usableMinY = this.sheetMargin;
    this.usableMaxX = Math.max(this.usableMinX, this.sheetWidth - this.sheetMargin);
    this.usableMaxY = Math.max(this.usableMinY, this.sheetHeight - this.sheetMargin);

    this.usableWidth = Math.max(0, this.usableMaxX - this.usableMinX);
    this.usableHeight = Math.max(0, this.usableMaxY - this.usableMinY);

    this.freeRectangles = [
      new Rect(this.usableMinX, this.usableMinY, this.usableWidth, this.usableHeight)
    ];
    this.placedParts = [];
  }

  /**
   * إرجاع التوجهات المسموحة بناءً على قفل عروق الخشب أو التحكم الفردي
   */
  getAllowedOrientations(part: { width: number; height: number; grain?: GrainDirectionType; overrideRotated?: boolean }): Array<{ w: number; h: number; rotated: boolean }> {
    // إذا كان هناك أمر تحكم فردي صريح بتدوير أو عدم تدوير هذه النسخة بالذات
    if (part.overrideRotated !== undefined) {
      return part.overrideRotated
        ? [{ w: part.height, h: part.width, rotated: true }]
        : [{ w: part.width, h: part.height, rotated: false }];
    }

    const grain = (part.grain || GrainDirection.FREE).toLowerCase();
    const w = part.width;
    const h = part.height;

    switch (grain) {
      case GrainDirection.WIDTH:
      case 'x':
      case 'horizontal':
        // أفقي = عرض اللوح: الحفاظ على اتجاه العروق أفقياً بمحاذاة محور X (يمنع الدوران)
        return [{ w, h, rotated: false }];

      case GrainDirection.HEIGHT:
      case 'y':
      case 'vertical':
        // رأسي = طول اللوح: تدوير القطعة 90 درجة لتوازي طول/ارتفاع اللوح Y
        // القطعة المربعة لا حاجة لتدويرها (نفس الأبعاد في الحالتين)
        if (w === h) {
          return [{ w, h, rotated: false }];
        }
        return [{ w: h, h: w, rotated: true }];

      case GrainDirection.FREE:
      default:
        // حر: تدوير حر للقطعة حسب المساحة لتقليل الهدر واستغلال الفراغات
        if (w === h) {
          return [{ w, h, rotated: false }];
        }
        return [
          { w, h, rotated: false },
          { w: h, h: w, rotated: true }
        ];
    }
  }

  /**
   * تقييم مدى ملاءمة القطعة للفراغات الحالية في اللوح لحساب Best Fit
   * الترتيب الحدوي: المعيار الأساسي أولاً، ثم المساحة الحرة الأضيق (استغلال أفضل)، ثم القرب من الركن
   */
  scorePlacement(part: PartInput & { uniqueId: string }, heuristic: 'BSSF' | 'BAF' | 'BLSF' = 'BSSF'): number | null {
    const orientations = this.getAllowedOrientations(part);
    if (orientations.length === 0) return null;

    let bestScore = Infinity;

    for (const orient of orientations) {
      const { w, h } = orient;
      for (const free of this.freeRectangles) {
        if (free.width >= w && free.height >= h) {
          if (free.x + w <= this.usableMaxX && free.y + h <= this.usableMaxY) {
            const leftoverX = free.width - w;
            const leftoverY = free.height - h;
            let primaryFit: number;
            if (heuristic === 'BAF') {
              // Best Area Fit: يقلل المساحة المتبقية غير المستغلة في المستطيل الحر
              primaryFit = free.width * free.height - w * h;
            } else if (heuristic === 'BLSF') {
              // Best Long Side Fit
              primaryFit = Math.max(leftoverX, leftoverY);
            } else {
              // Best Short Side Fit
              primaryFit = Math.min(leftoverX, leftoverY);
            }
            // معايير ثانوية: الفراغ الأضيق (استغلال أنسب) ثم القرب من الركن الأعلى يسار
            const secondary = free.width * free.height * 1e-6;
            const tieBreaker = (free.y * 1000 + free.x) / 100000;
            const score = primaryFit + secondary + tieBreaker;
            if (score < bestScore) {
              bestScore = score;
            }
          }
        }
      }
    }

    return bestScore === Infinity ? null : bestScore;
  }

  /**
   * محاولة إدراج القطعة وفق معيار الملاءمة المختار (BSSF أو BAF أو BLSF)
   */
  insert(part: PartInput & { uniqueId: string }, heuristic: 'BSSF' | 'BAF' | 'BLSF' = 'BSSF'): PlacedPart | null {
    const orientations = this.getAllowedOrientations(part);
    if (orientations.length === 0) return null;

    let bestScore = Infinity;
    let bestFreeArea = Infinity;
    let bestTieBreaker = Infinity;
    let bestPlacement: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotated: boolean;
      freeRect: Rect;
    } | null = null;

    for (const orient of orientations) {
      const { w, h, rotated } = orient;

      for (const free of this.freeRectangles) {
        if (free.width >= w && free.height >= h) {
          if (free.x + w <= this.usableMaxX && free.y + h <= this.usableMaxY) {
            const leftoverX = free.width - w;
            const leftoverY = free.height - h;
            const freeArea = free.width * free.height;
            let primaryFit: number;
            if (heuristic === 'BAF') {
              primaryFit = freeArea - w * h;
            } else if (heuristic === 'BLSF') {
              primaryFit = Math.max(leftoverX, leftoverY);
            } else {
              primaryFit = Math.min(leftoverX, leftoverY);
            }

            // نفضل الموضع الأقرب للركن (y ثم x) لتقليل التشتت إذا تساوى المعيار
            const tieBreaker = (free.y * 10000 + free.x) / 1000000;

            // مقارنة حدوية: المعيار الأساسي، ثم الفراغ الأضيق (استغلال أنسب للمساحة)، ثم الركن
            const isBetter =
              primaryFit < bestScore ||
              (primaryFit === bestScore && freeArea < bestFreeArea) ||
              (primaryFit === bestScore && freeArea === bestFreeArea && tieBreaker < bestTieBreaker);

            if (isBetter) {
              bestScore = primaryFit;
              bestFreeArea = freeArea;
              bestTieBreaker = tieBreaker;
              bestPlacement = {
                x: free.x,
                y: free.y,
                width: w,
                height: h,
                rotated,
                freeRect: free
              };
            }
          }
        }
      }
    }

    if (!bestPlacement) return null;

    // المساحة المحجوزة تشمل فاصل القطع (partGap)
    const reservedWidth = Math.min(bestPlacement.width + this.partGap, this.usableMaxX - bestPlacement.x);
    const reservedHeight = Math.min(bestPlacement.height + this.partGap, this.usableMaxY - bestPlacement.y);
    const placedBounds = new Rect(bestPlacement.x, bestPlacement.y, reservedWidth, reservedHeight);

    this.splitFreeRectangles(placedBounds);
    this.pruneFreeRectangles();

    const result: PlacedPart = {
      id: part.id,
      uniqueId: part.uniqueId,
      name: part.name || `Part_${part.id}`,
      x: bestPlacement.x,
      y: bestPlacement.y,
      width: bestPlacement.width,
      height: bestPlacement.height,
      originalWidth: part.width,
      originalHeight: part.height,
      rotated: bestPlacement.rotated,
      grain: part.grain || GrainDirection.FREE,
      color: part.color,
      pathData: part.pathData,
      svgSnippet: part.svgSnippet,
      viewBox: part.viewBox,
      originalBBox: part.originalBBox
    };

    this.placedParts.push(result);
    return result;
  }

  private splitFreeRectangles(placed: Rect): void {
    const updated: Rect[] = [];

    for (const free of this.freeRectangles) {
      if (!placed.intersects(free)) {
        updated.push(free);
        continue;
      }

      // التقسيم الرباعي للمستطيلات القصوى
      if (placed.x > free.x && placed.x < free.right) {
        updated.push(new Rect(free.x, free.y, placed.x - free.x, free.height));
      }
      if (placed.right < free.right && placed.right > free.x) {
        updated.push(new Rect(placed.right, free.y, free.right - placed.right, free.height));
      }
      if (placed.y > free.y && placed.y < free.bottom) {
        updated.push(new Rect(free.x, free.y, free.width, placed.y - free.y));
      }
      if (placed.bottom < free.bottom && placed.bottom > free.y) {
        updated.push(new Rect(free.x, placed.bottom, free.width, free.bottom - placed.bottom));
      }
    }

    this.freeRectangles = updated;
  }

  private pruneFreeRectangles(): void {
    this.freeRectangles = this.freeRectangles.filter((r1, i) => {
      if (r1.width <= 0 || r1.height <= 0) return false;
      return !this.freeRectangles.some((r2, j) => i !== j && r2.contains(r1));
    });
  }

  getStats(): SheetStats {
    const totalArea = this.sheetWidth * this.sheetHeight;
    const partsArea = this.placedParts.reduce((sum, p) => sum + p.width * p.height, 0);
    const usableArea = this.usableWidth * this.usableHeight;
    const wasteArea = Math.max(0, totalArea - partsArea);
    const utilization = totalArea > 0 ? (partsArea / totalArea) * 100 : 0;
    const wastePercent = totalArea > 0 ? (wasteArea / totalArea) * 100 : 0;

    // تقدير طول خطوط القص الكلية بالأمتار
    let totalCutLengthMm = 0;
    for (const p of this.placedParts) {
      // محيط القطعة
      totalCutLengthMm += (p.width + p.height) * 2;
    }
    // تقريب القص المشترك بنسبة 35% لتقليل المحيط المكرر
    const estimatedCutMeters = parseFloat(((totalCutLengthMm * 0.65) / 1000).toFixed(2));

    return {
      sheetIndex: this.index,
      sheetWidth: this.sheetWidth,
      sheetHeight: this.sheetHeight,
      sheetMargin: this.sheetMargin,
      partGap: this.partGap,
      placedCount: this.placedParts.length,
      usedArea: Math.round(partsArea),
      totalArea: Math.round(totalArea),
      wasteArea: Math.round(wasteArea),
      usableArea: Math.round(usableArea),
      utilizationPercent: parseFloat(utilization.toFixed(2)),
      wastePercent: parseFloat(wastePercent.toFixed(2)),
      placedParts: this.placedParts,
      estimatedCutLengthMeters: estimatedCutMeters
    };
  }
}

export type SortStrategy =
  | 'optimal'
  | 'maxDimension'
  | 'area'
  | 'perimeter'
  | 'width'
  | 'height'
  | 'minDimension'
  | 'aspectRatio'
  | 'original';

/**
 * دالة مساعدة لتعبئة الألواح بنظام Sheet-First التتابعي الأقصى:
 * تعبئة اللوح الحالي بالكامل واستغلال كافة فراغاته المتبقية من قائمة القطع قبل فتح اللوح التالي
 */
function packSequentialSheets(
  parts: (PartInput & { uniqueId: string })[],
  sheetConfig: SheetConfig,
  strictOrder = false,
  heuristic: 'BSSF' | 'BAF' | 'BLSF' = 'BSSF'
): { sheets: SheetBin[]; unplacedParts: PartInput[] } {
  const pool = [...parts];
  const sheets: SheetBin[] = [];
  const unplacedParts: PartInput[] = [];

  while (pool.length > 0) {
    const sheet = new SheetBin(sheets.length + 1, sheetConfig);
    let placedAny = true;

    // استمرار البحث الحثيث في كامل قائمة القطع المتبقية لتعبئة أي فراغ ممكن في اللوح الحالي
    while (placedAny && pool.length > 0) {
      placedAny = false;

      if (strictOrder) {
        // في الترتيب الصارم: نتبع ترتيب القائمة ونسكن أول قطعة ملائمة استجابة مباشرة لأولوية الترتيب
        // وإذا لم تتسع القطعة التالية، يتم ملء الفراغات الشاغرة بالقطع الأصغر اللاحقة في نفس الترتيب
        for (let i = 0; i < pool.length; i++) {
          const candidate = pool[i];
          if (sheet.insert(candidate, heuristic)) {
            pool.splice(i, 1);
            placedAny = true;
            break;
          }
        }
      } else {
        // في الترتيب الذكي / الاستغلال الأقصى: نقيّم كل القطع في pool ونختار القطعة الأنسب لملء الفراغ بدقة (Global Best Fit)
        let bestPartIndex = -1;
        let bestPartScore = Infinity;

        for (let i = 0; i < pool.length; i++) {
          const candidate = pool[i];
          const score = sheet.scorePlacement(candidate, heuristic);
          if (score !== null && score < bestPartScore) {
            bestPartScore = score;
            bestPartIndex = i;
            if (score === 0) break;
          }
        }

        if (bestPartIndex !== -1) {
          const candidate = pool[bestPartIndex];
          if (sheet.insert(candidate, heuristic)) {
            pool.splice(bestPartIndex, 1);
            placedAny = true;
          }
        }
      }
    }

    // إذا لم تتسع أي قطعة من القطع المتبقية في لوح فارغ جديد، فهذا يعني أنها أكبر من سعة اللوح
    if (sheet.placedParts.length === 0) {
      unplacedParts.push(...pool);
      break;
    }

    sheets.push(sheet);
  }

  return { sheets, unplacedParts };
}

/**
 * حساب الأبعاد الفعالة للقطعة عند الترتيب بناءً على قفل عروق الخشب:
 * - أفقي (WIDTH): الأبعاد كما هي بدون تدوير
 * - رأسي (HEIGHT): العرض والطول متبادلان (تدوير 90 درجة إلزامي)
 * - حر (FREE): وضع الضلع الأطول أفقياً كأفضل توجيه مبدئي
 * - التحكم الفردي بالتدوير يسبق قفل العروق
 */
function getEffectiveDims(part: {
  width: number;
  height: number;
  grain?: GrainDirectionType;
  overrideRotated?: boolean;
}): { effWidth: number; effHeight: number } {
  if (part.overrideRotated !== undefined) {
    return part.overrideRotated
      ? { effWidth: part.height, effHeight: part.width }
      : { effWidth: part.width, effHeight: part.height };
  }

  const grain = (part.grain || GrainDirection.FREE).toLowerCase();

  switch (grain) {
    case GrainDirection.HEIGHT:
    case 'y':
    case 'vertical':
      return { effWidth: part.height, effHeight: part.width };
    case GrainDirection.FREE:
    case 'free':
      return part.width < part.height
        ? { effWidth: part.height, effHeight: part.width }
        : { effWidth: part.width, effHeight: part.height };
    case GrainDirection.WIDTH:
    case 'x':
    case 'horizontal':
    default:
      return { effWidth: part.width, effHeight: part.height };
  }
}

/**
 * ترتيب القطع حسب دالة ترتيب محددة
 * الترتيب يتم على الأبعاد الفعالة بعد مراعاة قفل عروق الخشب لكل قطعة
 */
function sortPartsBy(
  parts: (PartInput & { uniqueId: string })[],
  strategy: Exclude<SortStrategy, 'optimal' | 'original'>
): (PartInput & { uniqueId: string })[] {
  const copy = [...parts];
  copy.sort((a, b) => {
    const aDims = getEffectiveDims(a);
    const bDims = getEffectiveDims(b);
    const areaA = aDims.effWidth * aDims.effHeight;
    const areaB = bDims.effWidth * bDims.effHeight;

    switch (strategy) {
      case 'maxDimension': {
        const maxA = Math.max(aDims.effWidth, aDims.effHeight);
        const maxB = Math.max(bDims.effWidth, bDims.effHeight);
        return maxB - maxA || areaB - areaA;
      }
      case 'perimeter': {
        const perimA = 2 * (aDims.effWidth + aDims.effHeight);
        const perimB = 2 * (bDims.effWidth + bDims.effHeight);
        return perimB - perimA || areaB - areaA;
      }
      case 'width':
        return bDims.effWidth - aDims.effWidth || bDims.effHeight - aDims.effHeight;
      case 'height':
        return bDims.effHeight - aDims.effHeight || bDims.effWidth - aDims.effWidth;
      case 'minDimension': {
        const minA = Math.min(aDims.effWidth, aDims.effHeight);
        const minB = Math.min(bDims.effWidth, bDims.effHeight);
        return minB - minA || areaB - areaA;
      }
      case 'aspectRatio': {
        const ratioA = Math.max(aDims.effWidth, aDims.effHeight) / Math.max(1, Math.min(aDims.effWidth, aDims.effHeight));
        const ratioB = Math.max(bDims.effWidth, bDims.effHeight) / Math.max(1, Math.min(bDims.effWidth, bDims.effHeight));
        return ratioB - ratioA || areaB - areaA;
      }
      case 'area':
      default:
        return areaB - areaA || Math.max(bDims.effWidth, bDims.effHeight) - Math.max(aDims.effWidth, aDims.effHeight);
    }
  });
  return copy;
}

/**
 * توسعة قائمة القطع حسب العدد والمضاعرات والتحكم الفردي (إخفاء/أبعاد/عروق/تدوير)
 * مشتركة بين محرك MaxRects المستطيل ومحرك NFP غير المنتظم
 */
export function expandParts(
  parts: PartInput[],
  globalMultiplier = 1,
  partOverrides?: Record<string, IndividualPartOverride>
): (PartInput & { uniqueId: string })[] {
  const mult = Math.max(1, Math.floor(globalMultiplier || 1));
  const expandedParts: (PartInput & { uniqueId: string })[] = [];

  for (const p of parts) {
    const count = Math.max(1, (p.count || 1) * mult);
    for (let c = 0; c < count; c++) {
      const uniqueId = `${p.id}_${c + 1}`;
      const override = partOverrides?.[uniqueId];
      if (override?.hidden) continue; // استبعاد القطع المحذوفة فردياً

      expandedParts.push({
        ...p,
        width: override?.customWidth !== undefined ? override.customWidth : p.width,
        height: override?.customHeight !== undefined ? override.customHeight : p.height,
        uniqueId,
        grain: override?.grain || p.grain,
        // التحكم الفردي للنسخة يسبق تدوير الصنف على مستوى PartInput
        overrideRotated: override?.rotated ?? p.overrideRotated
      });
    }
  }

  return expandedParts;
}

/**
 * المحرك الرئيسي لتوزيع القطع على الألواح
 * يضمن التوزيع الأقصى واستغلال جميع المساحات الممكنة في اللوح الأول قبل الانتقال إلى اللوح الثاني
 */
export function nestSheets(
  parts: PartInput[],
  sheetConfig: SheetConfig,
  sortStrategy: SortStrategy = 'optimal',
  globalMultiplier = 1,
  partOverrides?: Record<string, IndividualPartOverride>
): NestingResult {
  const expandedParts = expandParts(parts, globalMultiplier, partOverrides);

  let finalSheets: SheetBin[] = [];
  let finalUnplaced: PartInput[] = [];

  if (sortStrategy === 'optimal') {
    // استراتيجية الاستغلال الأقصى التلقائي:
    // تجربة استراتيجيات الترتيب المتعددة واختيار النمط الذي يضمن أعلى استغلال لمساحة اللوح الأول وأقل هدر
    const candidateStrategies: Array<Exclude<SortStrategy, 'optimal' | 'original'>> = [
      'maxDimension',
      'area',
      'perimeter',
      'width',
      'height',
      'minDimension',
      'aspectRatio'
    ];

    let bestScore = -Infinity;
    let bestResult: { sheets: SheetBin[]; unplacedParts: PartInput[] } | null = null;

    for (const strat of candidateStrategies) {
      const sorted = sortPartsBy(expandedParts, strat);
      for (const heuristic of ['BSSF', 'BAF'] as const) {
        for (const strict of [false, true]) {
          const res = packSequentialSheets(sorted, sheetConfig, strict, heuristic);

          if (res.sheets.length > 0) {
            const sheet1Stats = res.sheets[0].getStats();
            const totalUsedArea = res.sheets.reduce((sum, s) => sum + s.getStats().usedArea, 0);
            // وزن المعيار: أولوية قصوى لتقليل عدد الألواح، ثم ملء اللوح الأول بأعلى مساحة وعدد قطع
            const score =
              sheet1Stats.usedArea * 1000 +
              sheet1Stats.placedCount * 50 -
              res.sheets.length * 100000 +
              totalUsedArea;

            if (score > bestScore || bestResult === null) {
              bestScore = score;
              bestResult = res;
            }
          }
        }
      }
    }

    if (bestResult) {
      finalSheets = bestResult.sheets;
      finalUnplaced = bestResult.unplacedParts;
    } else {
      const fallback = packSequentialSheets(expandedParts, sheetConfig, false);
      finalSheets = fallback.sheets;
      finalUnplaced = fallback.unplacedParts;
    }
  } else if (sortStrategy === 'original') {
    const res = packSequentialSheets(expandedParts, sheetConfig, true, 'BSSF');
    finalSheets = res.sheets;
    finalUnplaced = res.unplacedParts;
  } else {
    // استجابة فورية وحاسمة لاختيار المستخدم من القائمة المنسدلة:
    // الترتيب المختار يُطبَّق صارماً على التسكين، وتُجرب عدة معايير ملاءمة (BSSF/BAF/BLSF)
    // واختيار الأفضل منها بعدد الألواح ثم استغلال مساحة اللوح الأول
    const sorted = sortPartsBy(expandedParts, sortStrategy);
    let bestResult: { sheets: SheetBin[]; unplacedParts: PartInput[] } | null = null;
    let bestScore = -Infinity;

    for (const heuristic of ['BSSF', 'BAF', 'BLSF'] as const) {
      const res = packSequentialSheets(sorted, sheetConfig, true, heuristic);
      if (res.sheets.length > 0) {
        const s1 = res.sheets[0].getStats();
        const totalUsedArea = res.sheets.reduce((sum, s) => sum + s.getStats().usedArea, 0);
        // وزن المعيار: تقليل عدد الألواح أولاً، ثم ملء اللوح الأول بأعلى مساحة وعدد قطع
        const score =
          s1.usedArea * 1000 +
          s1.placedCount * 10 -
          res.sheets.length * 1000000 +
          totalUsedArea;
        if (score > bestScore || bestResult === null) {
          bestScore = score;
          bestResult = res;
        }
      }
    }

    if (bestResult) {
      finalSheets = bestResult.sheets;
      finalUnplaced = bestResult.unplacedParts;
    } else {
      const fallback = packSequentialSheets(sorted, sheetConfig, true);
      finalSheets = fallback.sheets;
      finalUnplaced = fallback.unplacedParts;
    }
  }

  const sheetsStats = finalSheets.map(s => s.getStats());
  const totalSheetArea = sheetsStats.reduce((sum, s) => sum + s.totalArea, 0);
  const totalUsedArea = sheetsStats.reduce((sum, s) => sum + s.usedArea, 0);
  const totalWasteArea = totalSheetArea - totalUsedArea;
  const overallUtilization = totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0;
  const overallWaste = totalSheetArea > 0 ? (totalWasteArea / totalSheetArea) * 100 : 0;
  const totalCutLength = sheetsStats.reduce((sum, s) => sum + s.estimatedCutLengthMeters, 0);
  const price = sheetConfig.pricePerSheet || 0;
  const totalMaterialCost = finalSheets.length * price;

  return {
    summary: {
      sheetsUsed: finalSheets.length,
      totalPartsProvided: expandedParts.length,
      totalPartsPlaced: expandedParts.length - finalUnplaced.length,
      unplacedCount: finalUnplaced.length,
      totalSheetArea: Math.round(totalSheetArea),
      totalUsedArea: Math.round(totalUsedArea),
      totalWasteArea: Math.round(totalWasteArea),
      overallUtilizationPercent: parseFloat(overallUtilization.toFixed(2)),
      overallWastePercent: parseFloat(overallWaste.toFixed(2)),
      totalEstimatedCutLengthMeters: parseFloat(totalCutLength.toFixed(2)),
      totalMaterialCost: parseFloat(totalMaterialCost.toFixed(2))
    },
    sheets: sheetsStats,
    unplacedParts: finalUnplaced
  };
}
