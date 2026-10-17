/**
 * @file svgParser.ts
 * محلل ملفات SVG المتقدم لاستخراج المسارات الحقيقية (Real Geometry Paths)
 * والأبعاد المحيطة (Bounding Box) الدقيقة لماكينات الـ CNC وقص الخشب
 * مع دعم استيراد التصميم بالكامل كقطعة واحدة متكاملة أو تفكيك المجموعات
 */

import { GrainDirection } from './nesting.ts';
import type { GrainDirectionType, PartInput } from './nesting.ts';

export interface ParsedSvgResult {
  parts: PartInput[];
  fileName?: string;
  viewBox?: { x: number; y: number; width: number; height: number };
  rawSvg: string;
}

export type SvgImportMode = 'single' | 'groups' | 'shapes';

/**
 * تحويل مختلف وحدات القياس إلى مليمتر (mm)
 */
export function convertUnitToMm(valStr: string | number, defaultDpi = 96): number {
  if (typeof valStr === 'number') return valStr;
  if (!valStr) return 0;

  const str = String(valStr).trim().toLowerCase();
  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  if (str.endsWith('mm')) return num;
  if (str.endsWith('cm')) return num * 10;
  if (str.endsWith('in')) return num * 25.4;
  if (str.endsWith('pt')) return num * (25.4 / 72);
  if (str.endsWith('pc')) return num * (25.4 / 6);
  if (str.endsWith('m')) return num * 1000;
  if (str.endsWith('px')) {
    return (num * 25.4) / defaultDpi;
  }

  return num;
}

/**
 * محلل شامل لأوامر مسارات SVG (Path Data 'd') لحساب المستطيل المحيط الحقيقي
 * يدعم جميع الأوامر القياسية: M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, Z, z
 */
export function computePathBoundingBox(d: string): { x: number; y: number; width: number; height: number } {
  if (!d || !d.trim()) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  // تقسيم الأوامر والمعاملات
  const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;

  const updateBounds = (x: number, y: number) => {
    if (!isNaN(x) && !isNaN(y)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };

  while ((match = cmdRegex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    // استخراج كافة الأرقام بما فيها الإشارات السالبة والكسور العشرية
    const nums = (argsStr.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []).map(Number);
    const isRel = cmd === cmd.toLowerCase();
    const type = cmd.toUpperCase();

    let i = 0;
    switch (type) {
      case 'M': {
        if (nums.length >= 2) {
          curX = isRel ? curX + nums[0] : nums[0];
          curY = isRel ? curY + nums[1] : nums[1];
          startX = curX;
          startY = curY;
          updateBounds(curX, curY);
          i = 2;
          // أي أزواج إضافية بعد M تعتبر أوامر Lineto ضمنية
          while (i < nums.length - 1) {
            curX = isRel ? curX + nums[i] : nums[i];
            curY = isRel ? curY + nums[i + 1] : nums[i + 1];
            updateBounds(curX, curY);
            i += 2;
          }
        }
        break;
      }
      case 'L': {
        while (i < nums.length - 1) {
          curX = isRel ? curX + nums[i] : nums[i];
          curY = isRel ? curY + nums[i + 1] : nums[i + 1];
          updateBounds(curX, curY);
          i += 2;
        }
        break;
      }
      case 'H': {
        while (i < nums.length) {
          curX = isRel ? curX + nums[i] : nums[i];
          updateBounds(curX, curY);
          i++;
        }
        break;
      }
      case 'V': {
        while (i < nums.length) {
          curY = isRel ? curY + nums[i] : nums[i];
          updateBounds(curX, curY);
          i++;
        }
        break;
      }
      case 'C': {
        while (i < nums.length - 5) {
          const cp1x = isRel ? curX + nums[i] : nums[i];
          const cp1y = isRel ? curY + nums[i + 1] : nums[i + 1];
          const cp2x = isRel ? curX + nums[i + 2] : nums[i + 2];
          const cp2y = isRel ? curY + nums[i + 3] : nums[i + 3];
          curX = isRel ? curX + nums[i + 4] : nums[i + 4];
          curY = isRel ? curY + nums[i + 5] : nums[i + 5];
          updateBounds(cp1x, cp1y);
          updateBounds(cp2x, cp2y);
          updateBounds(curX, curY);
          i += 6;
        }
        break;
      }
      case 'S':
      case 'Q': {
        while (i < nums.length - 3) {
          const cpx = isRel ? curX + nums[i] : nums[i];
          const cpy = isRel ? curY + nums[i + 1] : nums[i + 1];
          curX = isRel ? curX + nums[i + 2] : nums[i + 2];
          curY = isRel ? curY + nums[i + 3] : nums[i + 3];
          updateBounds(cpx, cpy);
          updateBounds(curX, curY);
          i += 4;
        }
        break;
      }
      case 'T': {
        while (i < nums.length - 1) {
          curX = isRel ? curX + nums[i] : nums[i];
          curY = isRel ? curY + nums[i + 1] : nums[i + 1];
          updateBounds(curX, curY);
          i += 2;
        }
        break;
      }
      case 'A': {
        // rx ry x-axis-rotation large-arc-flag sweep-flag x y
        while (i < nums.length - 6) {
          curX = isRel ? curX + nums[i + 5] : nums[i + 5];
          curY = isRel ? curY + nums[i + 6] : nums[i + 6];
          updateBounds(curX, curY);
          i += 7;
        }
        break;
      }
      case 'Z': {
        curX = startX;
        curY = startY;
        updateBounds(curX, curY);
        break;
      }
    }
  }

  if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { x: minX, y: minY, width, height };
}

/**
 * حساب الصندوق المحيط لعنصر هندسي فردي
 */
export function getElementBoundingBox(el: Element): { x: number; y: number; width: number; height: number } {
  const tag = el.tagName.toLowerCase();

  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y = parseFloat(el.getAttribute('y') || '0');
    const w = parseFloat(el.getAttribute('width') || '100');
    const h = parseFloat(el.getAttribute('height') || '100');
    return { x, y, width: w, height: h };
  } else if (tag === 'circle') {
    const cx = parseFloat(el.getAttribute('cx') || '0');
    const cy = parseFloat(el.getAttribute('cy') || '0');
    const r = parseFloat(el.getAttribute('r') || '50');
    return { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
  } else if (tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx') || '0');
    const cy = parseFloat(el.getAttribute('cy') || '0');
    const rx = parseFloat(el.getAttribute('rx') || '50');
    const ry = parseFloat(el.getAttribute('ry') || '30');
    return { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry };
  } else if (tag === 'path') {
    return computePathBoundingBox(el.getAttribute('d') || '');
  } else if (tag === 'polygon' || tag === 'polyline') {
    const pointsStr = el.getAttribute('points') || '';
    const nums = (pointsStr.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < nums.length - 1; i += 2) {
      const px = nums[i];
      const py = nums[i + 1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (minX !== Infinity) {
      return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }
  } else if (tag === 'line') {
    const x1 = parseFloat(el.getAttribute('x1') || '0');
    const y1 = parseFloat(el.getAttribute('y1') || '0');
    const x2 = parseFloat(el.getAttribute('x2') || '0');
    const y2 = parseFloat(el.getAttribute('y2') || '0');
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    return { x: minX, y: minY, width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(1, Math.abs(y2 - y1)) };
  }

  // تجربة قياس المتصفح إن وجد
  if (typeof document !== 'undefined' && document.body && (el as SVGGraphicsElement).getBBox) {
    try {
      const bbox = (el as SVGGraphicsElement).getBBox();
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    } catch {
      // ignore
    }
  }

  return { x: 0, y: 0, width: 100, height: 100 };
}

/**
 * حساب الصندوق المحيط لمجموعة من العناصر الهندسية
 */
export function getElementsCombinedBBox(elements: Element[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    // تجاهل مستطيلات الخلفية العامة البيضاء أو السوداء التي تغطي الرسم
    const tag = el.tagName.toLowerCase();
    if (tag === 'rect') {
      const w = el.getAttribute('width');
      const h = el.getAttribute('height');
      if (w === '100%' || h === '100%') continue;
    }

    const bb = getElementBoundingBox(el);
    if (bb.width > 0 && bb.height > 0) {
      if (bb.x < minX) minX = bb.x;
      if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
      if (bb.y < minY) minY = bb.y;
      if (bb.y + bb.height > maxY) maxY = bb.y + bb.height;
    }
  }

  if (minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    return { x: 0, y: 0, width: 200, height: 200 };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

/**
 * التحقق من أن العنصر مرئي وصالح للقص وليس عنصراً مخفياً أو إرشادياً أو إطاراً فارغاً
 */
export function isElementVisibleAndValid(
  el: Element,
  viewBoxDim?: { x: number; y: number; width: number; height: number }
): boolean {
  // 1. تجاهل أي عناصر داخل defs, clipPath, mask, pattern, symbol, metadata, template, namedview
  if (el.closest('defs, clipPath, mask, pattern, symbol, metadata, template, namedview')) {
    return false;
  }

  // 2. فحص خاصية display: none
  const style = el.getAttribute('style') || '';
  if (/display\s*:\s*none/i.test(style) || el.getAttribute('display') === 'none') {
    return false;
  }

  // 3. فحص خاصية visibility: hidden
  if (/visibility\s*:\s*hidden/i.test(style) || el.getAttribute('visibility') === 'hidden') {
    return false;
  }

  // 4. فحص الشفافية التامة opacity: 0
  if (/opacity\s*:\s*0(?![.\d])/i.test(style) || el.getAttribute('opacity') === '0') {
    return false;
  }

  // 5. فحص الإطارات المخفية (Invisible helper / spacer frames)
  const fill = (el.getAttribute('fill') || '').trim().toLowerCase();
  const stroke = (el.getAttribute('stroke') || '').trim().toLowerCase();
  const strokeWidth = (el.getAttribute('stroke-width') || '').trim();

  const isNoFill = fill === 'none' || fill === 'transparent' || /fill\s*:\s*(none|transparent)/i.test(style);
  const isNoStroke =
    stroke === 'none' ||
    stroke === 'transparent' ||
    strokeWidth === '0' ||
    /stroke\s*:\s*(none|transparent)/i.test(style) ||
    /stroke-width\s*:\s*0/i.test(style) ||
    (!stroke && !/stroke\s*:/i.test(style) && isNoFill);

  if (isNoFill && isNoStroke) {
    return false;
  }

  // 6. مستطيلات الخلفية التغطوية البيضاء
  const tag = el.tagName.toLowerCase();
  if (tag === 'rect') {
    const w = el.getAttribute('width');
    const h = el.getAttribute('height');
    if (w === '100%' || h === '100%') return false;
    if (fill === '#ffffff' || fill === 'white' || fill === '#fff') {
      if (isNoStroke) return false;
    }
  }

  // 7. المسارات الفارغة أو النقطية الميتة
  if (tag === 'path') {
    const d = (el.getAttribute('d') || '').trim();
    if (!d || d === 'M 0 0' || d === 'M0,0' || d === 'm0,0' || d === 'm 0 0') {
      return false;
    }
  }

  // 8. فحص الأبعاد خارج صفحة العمل (Scratchpad / Off-artboard elements)
  if (viewBoxDim && viewBoxDim.width > 0 && viewBoxDim.height > 0) {
    const bb = getElementBoundingBox(el);
    if (bb.width > 0 && bb.height > 0) {
      const marginX = viewBoxDim.width * 0.2;
      const marginY = viewBoxDim.height * 0.2;
      const isCompletelyOutside =
        bb.x + bb.width < viewBoxDim.x - marginX ||
        bb.x > viewBoxDim.x + viewBoxDim.width + marginX ||
        bb.y + bb.height < viewBoxDim.y - marginY ||
        bb.y > viewBoxDim.y + viewBoxDim.height + marginY;

      if (isCompletelyOutside) {
        return false;
      }
    }
  }

  return true;
}

/**
 * تنظيف مسارات الـ SVG بالكامل وإلزامها بـ Outline أحمر بارز #FF0000 بدون تعبئة
 * مع استبعاد العناصر المخفية أو الأطر الفارغة
 */
export function sanitizeSvgToRedOutline(rootEl: Element, viewBoxDim?: { x: number; y: number; width: number; height: number }): string {
  const clone = rootEl.cloneNode(true) as Element;

  // إزالة وسوم الأنماط style والـ defs ومسودات inkscape
  clone.querySelectorAll('style, defs, clipPath, mask, pattern, symbol, metadata, template, namedview').forEach(s => s.remove());

  // العثور على كافة الأشكال وتطبيق الـ Outline الأحمر #FF0000 بعد تصفية غير المرئي
  const shapes = clone.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
  shapes.forEach(shape => {
    if (!isElementVisibleAndValid(shape, viewBoxDim)) {
      shape.remove();
      return;
    }

    shape.removeAttribute('style');
    shape.setAttribute('fill', 'none');
    shape.setAttribute('stroke', '#FF0000');
    shape.setAttribute('stroke-width', '1.5');
    shape.setAttribute('stroke-linecap', 'round');
    shape.setAttribute('stroke-linejoin', 'round');
  });

  // إذا كان العنصر نفسه شكل فردي
  const selfTag = clone.tagName.toLowerCase();
  if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(selfTag)) {
    if (!isElementVisibleAndValid(clone, viewBoxDim)) {
      return '';
    }
    clone.removeAttribute('style');
    clone.setAttribute('fill', 'none');
    clone.setAttribute('stroke', '#FF0000');
    clone.setAttribute('stroke-width', '1.5');
    clone.setAttribute('stroke-linecap', 'round');
    clone.setAttribute('stroke-linejoin', 'round');
  }

  // تنظيف المجموعات الفارغة
  clone.querySelectorAll('g').forEach(g => {
    if (g.children.length === 0) g.remove();
  });

  return clone.outerHTML;
}

/**
 * تحليل ملف SVG بدقة مع دعم الاستيراد الموحد (Single Design) أو التفكيك (Groups/Shapes)
 */
export function parseSvgString(
  svgString: string,
  defaultGrain: GrainDirectionType = GrainDirection.FREE,
  scaleFactor = 1,
  mode: SvgImportMode = 'single'
): ParsedSvgResult {
  const parts: PartInput[] = [];

  if (typeof window === 'undefined') {
    return { parts: [], rawSvg: svgString };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  if (!svgEl) {
    throw new Error('الملف ليس بصيغة SVG صالحة أو ينقصه وسم <svg>');
  }

  // قراءة أبعاد viewBox والـ width/height الرسمية
  let viewBoxDim: { x: number; y: number; width: number; height: number } | undefined;
  const viewBoxAttr = svgEl.getAttribute('viewBox');
  if (viewBoxAttr) {
    const vbParts = viewBoxAttr.split(/[\s,]+/).map(Number);
    if (vbParts.length >= 4) {
      viewBoxDim = { x: vbParts[0], y: vbParts[1], width: vbParts[2], height: vbParts[3] };
    }
  }

  // فحص ما إذا كان العرض محدد بالمليمتر في الـ SVG
  let detectedScale = scaleFactor;
  const svgWidthAttr = svgEl.getAttribute('width');
  if (svgWidthAttr && viewBoxDim && viewBoxDim.width > 0) {
    const realMm = convertUnitToMm(svgWidthAttr);
    if (realMm > 0 && Math.abs(realMm - viewBoxDim.width) > 1) {
      detectedScale = realMm / viewBoxDim.width;
    }
  }

  // استخراج كافة الأشكال الهندسية الصالحة في الملف واستبعاد أي مسارات مخفية أو خارج صفحة العمل
  const allRawShapes = Array.from(svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line'));
  const allShapes = allRawShapes.filter(el => isElementVisibleAndValid(el, viewBoxDim));

  if (allShapes.length === 0) {
    throw new Error('لم يتم العثور على أشكال أو مسارات قابلة للقص في ملف SVG.');
  }

  // 1. الوضع الأول: استيراد التصميم بالكامل كقطعة واحدة متكاملة (موصى به للتصاميم المعقدة والمفرغة)
  if (mode === 'single' || allShapes.length === 1) {
    const bbox = getElementsCombinedBBox(allShapes);
    const width = Math.max(10, Math.round(bbox.width * detectedScale));
    const height = Math.max(10, Math.round(bbox.height * detectedScale));

    // إنشاء حاوية موحدة تحتوي على كافة مسارات التصميم الصالحة كـ Outline أحمر #FF0000
    const containerG = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    allShapes.forEach(shape => {
      containerG.appendChild(shape.cloneNode(true));
    });

    const snippet = sanitizeSvgToRedOutline(containerG, viewBoxDim);

    parts.push({
      id: `Design_Single_${Date.now() % 10000}`,
      name: 'تصميم متكامل (SVG Design)',
      width,
      height,
      count: 1,
      grain: defaultGrain,
      color: '#FF0000',
      svgSnippet: snippet,
      viewBox: `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
      originalBBox: bbox
    });

    return {
      parts,
      viewBox: viewBoxDim,
      rawSvg: svgString
    };
  }

  // 2. الوضع الثاني: فحص المجموعات <g> إذا رغب المستخدم في تفكيك المجموعات
  let partCounter = 1;
  const processedElements = new Set<Element>();

  if (mode === 'groups') {
    const directGroups = Array.from(svgEl.querySelectorAll('svg > g, g[id]'));
    for (const group of directGroups) {
      if (processedElements.has(group) || group.closest('defs')) continue;

      const groupShapes = Array.from(group.querySelectorAll('path, rect, polygon, polyline, circle, ellipse, line'));
      if (groupShapes.length === 0) continue;

      const bbox = getElementsCombinedBBox(groupShapes);
      if (bbox.width > 5 && bbox.height > 5) {
        processedElements.add(group);
        groupShapes.forEach(s => processedElements.add(s));

        const width = Math.max(10, Math.round(bbox.width * detectedScale));
        const height = Math.max(10, Math.round(bbox.height * detectedScale));
        const name = group.getAttribute('id') || `Part_Group_${partCounter}`;

        let grain = defaultGrain;
        const nameLower = name.toLowerCase();
        if (nameLower.includes('grain_x') || nameLower.includes('width') || nameLower.includes('horiz')) {
          grain = GrainDirection.WIDTH;
        } else if (nameLower.includes('grain_y') || nameLower.includes('height') || nameLower.includes('vert')) {
          grain = GrainDirection.HEIGHT;
        }

        const snippet = sanitizeSvgToRedOutline(group);

        parts.push({
          id: `P_${partCounter++}`,
          name,
          width,
          height,
          count: 1,
          grain,
          color: '#FF0000',
          svgSnippet: snippet,
          viewBox: `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
          originalBBox: bbox
        });
      }
    }
  }

  // 3. الأشكال المستقلة غير المجمعة
  for (const shape of allShapes) {
    if (processedElements.has(shape)) continue;

    const bbox = getElementBoundingBox(shape);
    if (bbox.width > 5 && bbox.height > 5) {
      processedElements.add(shape);
      const width = Math.max(10, Math.round(bbox.width * detectedScale));
      const height = Math.max(10, Math.round(bbox.height * detectedScale));
      const name = shape.getAttribute('id') || `Part_${partCounter}`;

      let grain = defaultGrain;
      const lower = name.toLowerCase();
      if (lower.includes('width') || lower.includes('grain_x') || lower.includes('horiz')) {
        grain = GrainDirection.WIDTH;
      } else if (lower.includes('height') || lower.includes('grain_y') || lower.includes('vert')) {
        grain = GrainDirection.HEIGHT;
      }

      const snippet = sanitizeSvgToRedOutline(shape);

      parts.push({
        id: `P_${partCounter++}`,
        name,
        width,
        height,
        count: 1,
        grain,
        color: '#FF0000',
        svgSnippet: snippet,
        viewBox: `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
        originalBBox: bbox
      });
    }
  }

  return {
    parts,
    viewBox: viewBoxDim,
    rawSvg: svgString
  };
}

/**
 * نماذج وتصاميم هندسية حقيقية عالية الجودة لماكينات الـ CNC وقص الألواح
 */
export const SAMPLE_SVGS = [
  {
    id: 'islamic_lattice_screen',
    title: 'لوح ديكور إسلامي مفرغ (Islamic Lattice Screen)',
    titleEn: 'Islamic Decorative Lattice Screen',
    description: 'لوح حائط هندسي مفرغ بنقوش هندسية إسلامية دقيقة وفتحات قص ليزر وراوتر CNC',
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
  <!-- الإطار الخارجي -->
  <rect x="10" y="10" width="580" height="880" rx="12" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="30" y="30" width="540" height="840" rx="8" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <!-- زخارف ونقوش هندسية داخلية متقاطعة مفرغة -->
  <polygon points="300,100 380,220 300,340 220,220" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="300" cy="220" r="40" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="300" cy="220" r="70" fill="none" stroke="#FF0000" stroke-width="2.5" stroke-dasharray="12 6" />

  <polygon points="300,380 440,520 300,660 160,520" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="300" cy="520" r="60" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <polygon points="300,450 350,520 300,590 250,520" fill="none" stroke="#FF0000" stroke-width="2.5" />

  <polygon points="300,700 380,820 300,860 220,820" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="300" cy="780" r="35" fill="none" stroke="#FF0000" stroke-width="2.5" />

  <!-- ثقوب التثبيت الجانبية -->
  <circle cx="20" cy="50" r="4" fill="none" stroke="#FF0000" stroke-width="2" />
  <circle cx="20" cy="450" r="4" fill="none" stroke="#FF0000" stroke-width="2" />
  <circle cx="20" cy="850" r="4" fill="none" stroke="#FF0000" stroke-width="2" />
  <circle cx="580" cy="50" r="4" fill="none" stroke="#FF0000" stroke-width="2" />
  <circle cx="580" cy="450" r="4" fill="none" stroke="#FF0000" stroke-width="2" />
  <circle cx="580" cy="850" r="4" fill="none" stroke="#FF0000" stroke-width="2" />
</svg>`
  },
  {
    id: 'cnc_chair_frame',
    title: 'قائم كرسي خشب مريح مع ثقوب تثبيت (CNC Chair Side Frame)',
    titleEn: 'Curved Ergonomic Chair Frame with Holes',
    description: 'تصميم هيكل كرسي منحني بمسارات Bezier وثقوب براغي لربط القواطع',
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 800" width="500" height="800">
  <!-- المسار المنحني الخارجي لقائم الكرسي -->
  <path d="M 50,50 C 120,40 380,30 450,120 C 420,300 380,450 440,750 C 370,760 320,750 300,600 C 270,450 200,420 120,450 L 50,750 C 30,750 20,700 40,600 C 70,450 60,300 40,150 Z" fill="none" stroke="#FF0000" stroke-width="2.5" stroke-linejoin="round" />
  <!-- فتحات تخفيف الوزن وتثبيت المقعد -->
  <circle cx="250" cy="180" r="30" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="220" cy="280" r="25" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="180" y="340" width="80" height="28" rx="14" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <!-- ثقوب براغي التجميع -->
  <circle cx="100" cy="90" r="6" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="380" cy="140" r="6" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="160" cy="460" r="6" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="340" cy="550" r="6" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="70" cy="700" r="6" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <circle cx="410" cy="700" r="6" fill="none" stroke="#FF0000" stroke-width="2.5" />
</svg>`
  },
  {
    id: 'acoustic_slotted_panel',
    title: 'لوح عازل صوتي بشرائح تفريغ (Acoustic Slotted Panel)',
    titleEn: 'Acoustic Sound Absorber Panel',
    description: 'لوح جداري عازل يحتوي على فتحات طولية مصفوفة لامتصاص الصوت',
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <rect x="10" y="10" width="780" height="480" rx="16" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <!-- شرائح تفريغ طولية متكررة -->
  <rect x="60" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="130" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="200" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="270" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="340" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="410" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="480" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="550" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="620" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
  <rect x="690" y="50" width="30" height="400" rx="15" fill="none" stroke="#FF0000" stroke-width="2.5" />
</svg>`
  }
];
