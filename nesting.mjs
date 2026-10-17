/**
 * @file nesting.mjs
 * محرك توزيع القطع على ألواح الخشب (Sheet Nesting Engine)
 * يعتمد على خوارزمية MaxRects BSSF مع قفل عروق الخشب (Wood Grain Lock)
 */

export const GrainDirection = Object.freeze({
  WIDTH: 'width',   // عروق أفقية موازية لمحور X (يمنع الدوران)
  HEIGHT: 'height', // عروق رأسية موازية لمحور Y (تدوير إلزامي 90 درجة)
  FREE: 'free'      // حرية التدوير لتقليل الهدر
});

export class Rect {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get right() { return this.x + this.width; }
  get bottom() { return this.y + this.height; }

  contains(other) {
    return (
      other.x >= this.x &&
      other.y >= this.y &&
      other.right <= this.right &&
      other.bottom <= this.bottom
    );
  }

  intersects(other) {
    return !(
      other.x >= this.right ||
      other.right <= this.x ||
      other.y >= this.bottom ||
      other.bottom <= this.y
    );
  }
}

export class SheetBin {
  constructor(index, config) {
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

  getAllowedOrientations(part) {
    const grain = (part.grain || GrainDirection.FREE).toLowerCase();
    const w = part.width;
    const h = part.height;

    switch (grain) {
      case GrainDirection.WIDTH:
      case 'x':
      case 'horizontal':
        return [{ w, h, rotated: false }];

      case GrainDirection.HEIGHT:
      case 'y':
      case 'vertical':
        return [{ w: h, h: w, rotated: true }];

      case GrainDirection.FREE:
      default:
        if (w === h) return [{ w, h, rotated: false }];
        return [
          { w, h, rotated: false },
          { w: h, h: w, rotated: true }
        ];
    }
  }

  insert(part) {
    const orientations = this.getAllowedOrientations(part);
    if (orientations.length === 0) return null;

    let bestScore = Infinity;
    let bestPlacement = null;

    for (const orient of orientations) {
      const { w, h, rotated } = orient;

      for (const free of this.freeRectangles) {
        if (free.width >= w && free.height >= h) {
          if (free.x + w <= this.usableMaxX && free.y + h <= this.usableMaxY) {
            const leftoverX = free.width - w;
            const leftoverY = free.height - h;
            const shortSideFit = Math.min(leftoverX, leftoverY);
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

    const reservedWidth = Math.min(bestPlacement.width + this.partGap, this.usableMaxX - bestPlacement.x);
    const reservedHeight = Math.min(bestPlacement.height + this.partGap, this.usableMaxY - bestPlacement.y);
    const placedBounds = new Rect(bestPlacement.x, bestPlacement.y, reservedWidth, reservedHeight);

    this.splitFreeRectangles(placedBounds);
    this.pruneFreeRectangles();

    const result = {
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
      svgSnippet: part.svgSnippet,
      viewBox: part.viewBox,
      originalBBox: part.originalBBox
    };

    this.placedParts.push(result);
    return result;
  }

  splitFreeRectangles(placed) {
    const updated = [];
    for (const free of this.freeRectangles) {
      if (!placed.intersects(free)) {
        updated.push(free);
        continue;
      }

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

  pruneFreeRectangles() {
    this.freeRectangles = this.freeRectangles.filter((r1, i) => {
      if (r1.width <= 0 || r1.height <= 0) return false;
      return !this.freeRectangles.some((r2, j) => i !== j && r2.contains(r1));
    });
  }

  getStats() {
    const totalArea = this.sheetWidth * this.sheetHeight;
    const partsArea = this.placedParts.reduce((sum, p) => sum + (p.width * p.height), 0);
    const usableArea = this.usableWidth * this.usableHeight;
    const wasteArea = Math.max(0, totalArea - partsArea);
    const utilization = totalArea > 0 ? (partsArea / totalArea) * 100 : 0;
    const wastePercent = totalArea > 0 ? (wasteArea / totalArea) * 100 : 0;

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
      placedParts: this.placedParts
    };
  }
}

export function nestSheets(parts, sheetConfig, sortStrategy = 'area', globalMultiplier = 1) {
  const mult = Math.max(1, Math.floor(globalMultiplier || 1));
  const expandedParts = [];
  for (const p of parts) {
    const count = Math.max(1, (p.count || 1) * mult);
    for (let c = 0; c < count; c++) {
      expandedParts.push({
        ...p,
        uniqueId: `${p.id}_${c + 1}`
      });
    }
  }

  expandedParts.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const sheets = [];
  const unplacedParts = [];

  for (const part of expandedParts) {
    let placed = false;

    for (const sheet of sheets) {
      if (sheet.insert(part)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newSheet = new SheetBin(sheets.length + 1, sheetConfig);
      if (newSheet.insert(part)) {
        sheets.push(newSheet);
        placed = true;
      } else {
        unplacedParts.push(part);
      }
    }
  }

  const sheetsStats = sheets.map(s => s.getStats());
  const totalSheetArea = sheetsStats.reduce((sum, s) => sum + s.totalArea, 0);
  const totalUsedArea = sheetsStats.reduce((sum, s) => sum + s.usedArea, 0);
  const totalWasteArea = totalSheetArea - totalUsedArea;
  const overallUtilization = totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0;

  return {
    summary: {
      sheetsUsed: sheets.length,
      totalPartsProvided: expandedParts.length,
      totalPartsPlaced: expandedParts.length - unplacedParts.length,
      unplacedCount: unplacedParts.length,
      totalSheetArea: Math.round(totalSheetArea),
      totalUsedArea: Math.round(totalUsedArea),
      totalWasteArea: Math.round(totalWasteArea),
      overallUtilizationPercent: parseFloat(overallUtilization.toFixed(2)),
      overallWastePercent: parseFloat((100 - overallUtilization).toFixed(2))
    },
    sheets: sheetsStats,
    unplacedParts
  };
}
