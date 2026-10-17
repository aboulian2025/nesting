/**
 * @file nesting.ts
 * محرك توزيع القطع على ألواح الخشب (Sheet Nesting Engine)
 * خوارزمية MaxRects (BSSF / BAF) مع قفل عروق الخشب (Wood Grain Lock)
 */

export const GrainDirection = {
  WIDTH: 'width',   // أفقي = عرض اللوح (يمنع الدوران وتوازي العرض)
  HEIGHT: 'height', // رأسي = طول اللوح (تدوير رأسي 90 درجة لموازاة الطول)
  FREE: 'free'      // حر = تدوير حر للقطعة حسب المساحة لتقليل الهدر
} as const;

export type GrainDirectionType = typeof GrainDirection[keyof typeof GrainDirection];

export interface IndividualPartOverride {
  rotated?: boolean;
  grain?: GrainDirectionType;
  customWidth?: number;
  customHeight?: number;
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
}

export interface SheetConfig {
  sheetWidth: number;   // e.g. 2440 mm
  sheetHeight: number;  // e.g. 1220 mm
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
   */
  scorePlacement(part: PartInput & { uniqueId: string }): number | null {
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
            const shortSideFit = Math.min(leftoverX, leftoverY);
            const tieBreaker = (free.y * 1000 + free.x) / 100000;
            const score = shortSideFit + tieBreaker;
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
   * محاولة إدراج القطعة وفق معيار Best Short Side Fit (BSSF)
   */
  insert(part: PartInput & { uniqueId: string }): PlacedPart | null {
    const orientations = this.getAllowedOrientations(part);
    if (orientations.length === 0) return null;

    let bestScore = Infinity;
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
            const shortSideFit = Math.min(leftoverX, leftoverY);

            // نفضل الموضع الأقرب للركن (y ثم x) لتقليل التشتت إذا تساوى المعيار
            const tieBreaker = (free.y * 10000 + free.x) / 1000000;
            const currentScore = shortSideFit + tieBreaker;

            if (currentScore < bestScore) {
              bestScore = currentScore;
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

export type SortStrategy = 'optimal' | 'maxDimension' | 'area' | 'perimeter' | 'width' | 'height' | 'original';

/**
 * دالة مساعدة لتعبئة الألواح بنظام Sheet-First التتابعي الأقصى:
 * تعبئة اللوح الحالي بالكامل واستغلال كافة فراغاته المتبقية من قائمة القطع قبل فتح اللوح التالي
 */
function packSequentialSheets(
  parts: (PartInput & { uniqueId: string })[],
  sheetConfig: SheetConfig,
  strictOrder = false
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
        // في الترتيب الصارم: نتبع ترتيب القائمة بدقة ونسكن أول قطعة ملائمة استجابة لاختيار المستخدم
        for (let i = 0; i < pool.length; i++) {
          const candidate = pool[i];
          if (sheet.insert(candidate)) {
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
          const score = sheet.scorePlacement(candidate);
          if (score !== null && score < bestPartScore) {
            bestPartScore = score;
            bestPartIndex = i;
            if (score === 0) break;
          }
        }

        if (bestPartIndex !== -1) {
          const candidate = pool[bestPartIndex];
          if (sheet.insert(candidate)) {
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
 * ترتيب القطع حسب دالة ترتيب محددة
 */
function sortPartsBy(
  parts: (PartInput & { uniqueId: string })[],
  strategy: Exclude<SortStrategy, 'optimal' | 'original'>
): (PartInput & { uniqueId: string })[] {
  const copy = [...parts];
  copy.sort((a, b) => {
    switch (strategy) {
      case 'maxDimension': {
        const maxA = Math.max(a.width, a.height);
        const maxB = Math.max(b.width, b.height);
        return maxB - maxA || (b.width * b.height) - (a.width * a.height);
      }
      case 'perimeter': {
        const perimA = 2 * (a.width + a.height);
        const perimB = 2 * (b.width + b.height);
        return perimB - perimA || (b.width * b.height) - (a.width * a.height);
      }
      case 'width':
        return b.width - a.width || b.height - a.height;
      case 'height':
        return b.height - a.height || b.width - a.width;
      case 'area':
      default:
        return (b.width * b.height) - (a.width * a.height) || Math.max(b.width, b.height) - Math.max(a.width, a.height);
    }
  });
  return copy;
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
  const mult = Math.max(1, Math.floor(globalMultiplier || 1));
  const expandedParts: (PartInput & { uniqueId: string })[] = [];

  for (const p of parts) {
    const count = Math.max(1, (p.count || 1) * mult);
    for (let c = 0; c < count; c++) {
      const uniqueId = `${p.id}_${c + 1}`;
      const override = partOverrides?.[uniqueId];
      expandedParts.push({
        ...p,
        width: override?.customWidth !== undefined ? override.customWidth : p.width,
        height: override?.customHeight !== undefined ? override.customHeight : p.height,
        uniqueId,
        grain: override?.grain || p.grain,
        overrideRotated: override?.rotated
      });
    }
  }

  let finalSheets: SheetBin[] = [];
  let finalUnplaced: PartInput[] = [];

  if (sortStrategy === 'optimal') {
    // استراتيجية الاستغلال الأقصى التلقائي:
    // تجربة استراتيجيات الترتيب المتعددة واختيار النمط الذي يضمن أعلى استغلال لمساحة اللوح الأول
    const candidateStrategies: Array<Exclude<SortStrategy, 'optimal' | 'original'>> = [
      'maxDimension',
      'perimeter',
      'width',
      'height',
      'area'
    ];

    let bestScore = -1;
    let bestResult: { sheets: SheetBin[]; unplacedParts: PartInput[] } | null = null;

    for (const strat of candidateStrategies) {
      const sorted = sortPartsBy(expandedParts, strat);
      // تجربة كل استراتيجية مع وبدون الترتيب الصارم لمعرفة أيهما يعطي أعلى ملء للوح الأول
      for (const strict of [false, true]) {
        const res = packSequentialSheets(sorted, sheetConfig, strict);

        if (res.sheets.length > 0) {
          const sheet1Stats = res.sheets[0].getStats();
          // وزن المعيار: أولوية قصوى لمساحة اللوح الأول المستخدمة، ثم عدد القطع، ثم تقليل عدد الألواح الكلية
          const score = sheet1Stats.usedArea * 1000 + sheet1Stats.placedCount * 50 - res.sheets.length * 10000;
          if (score > bestScore || bestResult === null) {
            bestScore = score;
            bestResult = res;
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
    const res = packSequentialSheets(expandedParts, sheetConfig, true);
    finalSheets = res.sheets;
    finalUnplaced = res.unplacedParts;
  } else {
    // استجابة فورية ومباشرة لاختيار المستخدم من القائمة المنسدلة
    const sorted = sortPartsBy(expandedParts, sortStrategy);
    const res = packSequentialSheets(sorted, sheetConfig, true);
    finalSheets = res.sheets;
    finalUnplaced = res.unplacedParts;
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
