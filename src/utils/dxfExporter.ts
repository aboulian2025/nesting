/**
 * @file dxfExporter.ts
 * تصدير مخططات القص وتوزيع الألواح بصيغة AutoCAD DXF (R12 / ASCII قياسي)
 * متوافقة 100% مع كافة برامج AutoCAD و CAM وماكينات الـ CNC والراوتر والليزر وقص الخشب
 *
 * المزايا الهندسية لضمان عدم ظهور الملف فارغاً في أي برنامج:
 * 1. تضمين قسم القوالب BLOCKS الإلزامي في مواصفات AutoCAD DXF (غيابه يسبب رفض الملف وظهوره فارغاً)
 * 2. إضافة حدود اللوح والمجال الرؤيوي $EXTMIN و $EXTMAX ومنفذ الرؤية VPORT *ACTIVE لفتح الرسم مكبراً ومضبوطاً في المنتصف تلقائياً
 * 3. استخدام كيانات LINE و CIRCLE القياسية عالمياً المتوافقة مع كافة أجهزة التحكم (RDWorks, ArtCAM, Aspire, Vectric, SheetCAM, LightBurn, Fusion 360)
 * 4. دعم كافة عناصر الـ SVG: path, rect (مع rx/ry), circle, ellipse, line, polygon, polyline
 * 5. فواصل أسطر DOS/Windows القياسية \r\n (CRLF) الإلزامية لمحللات DXF
 * 6. ترميز آمن للنصوص واللغة العربية (\U+XXXX) وجدول STYLE لمنع أخطاء الترميز في برامج CAM
 */

import type { SheetStats, PlacedPart } from './nesting.ts';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * ترميز النصوص إلى صيغة DXF الآمنة مع تحويل الأحرف غير الإنجليزية إلى صيغة \U+XXXX
 * لمنع انهيار أو رفض برامج CAM القديمة (مثل ArtCAM و RDWorks) للملف بسبب الأحرف العربية
 */
export function encodeDxfText(text: string): string {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126 && text[i] !== '\\') {
      result += text[i];
    } else if (text[i] === '\\') {
      result += '\\\\';
    } else {
      result += `\\U+${code.toString(16).padStart(4, '0').toUpperCase()}`;
    }
  }
  return result;
}

/**
 * تحويل مسار بيزيه تكعيبي (Cubic Bezier) إلى خطوط مستقيمة متتابعة
 */
function sampleCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  steps = 16
): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y;
    points.push({ x, y });
  }
  return points;
}

/**
 * تحويل مسار بيزيه تربيعي (Quadratic Bezier) إلى خطوط
 */
function sampleQuadraticBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  steps = 12
): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
    points.push({ x, y });
  }
  return points;
}

/**
 * تحويل قوس إهليلجي (SVG Arc) إلى خطوط
 */
function sampleArc(
  startX: number,
  startY: number,
  rx: number,
  ry: number,
  xAxisRotationDeg: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  endX: number,
  endY: number,
  steps = 16
): Point2D[] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  if (rx === 0 || ry === 0 || (startX === endX && startY === endY)) {
    return [{ x: endX, y: endY }];
  }

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (startX - endX) / 2;
  const dy2 = (startY - endY) / 2;

  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const radiiCheck = x1pSq / rxSq + y1pSq / rySq;
  if (radiiCheck > 1) {
    const scale = Math.sqrt(radiiCheck);
    rx *= scale;
    ry *= scale;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
  const coef = sign * Math.sqrt(sq);

  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * -((ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (startX + endX) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (startY + endY) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const startAngle = Math.atan2(uy, ux);
  let deltaAngle = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

  if (!sweepFlag && deltaAngle > 0) {
    deltaAngle -= 2 * Math.PI;
  } else if (sweepFlag && deltaAngle < 0) {
    deltaAngle += 2 * Math.PI;
  }

  const points: Point2D[] = [];
  for (let i = 1; i <= steps; i++) {
    const angle = startAngle + (deltaAngle * i) / steps;
    const px = rx * Math.cos(angle);
    const py = ry * Math.sin(angle);
    const x = cosPhi * px - sinPhi * py + cx;
    const y = sinPhi * px + cosPhi * py + cy;
    points.push({ x, y });
  }

  return points;
}

/**
 * تحويل إحداثيات نقطة من نظام القطعة المحلي إلى إحداثيات CAD للوح (X>=0, Y>=0 من الزاوية السفلية اليسرى)
 * مع دعم إزاحة اللوح sheetOffsetX/sheetOffsetY عند تصدير عدة ألواح في ملف واحد
 */
export function transformToCad(
  localX: number,
  localY: number,
  part: PlacedPart,
  sheetH: number,
  sheetOffsetX = 0,
  sheetOffsetY = 0
): Point2D {
  const minX = part.originalBBox?.x || 0;
  const minY = part.originalBBox?.y || 0;

  const scaleX = part.originalBBox?.width ? part.originalWidth / part.originalBBox.width : 1;
  const scaleY = part.originalBBox?.height ? part.originalHeight / part.originalBBox.height : 1;

  // 1. تسوية الإزاحة الداخلية والمقياس
  const sX = (localX - minX) * scaleX;
  const sY = (localY - minY) * scaleY;

  // 2. تطبيق التدوير 90 درجة إذا كانت القطعة مدورة
  let rotX = sX;
  let rotY = sY;
  if (part.rotated) {
    rotX = part.width - sY;
    rotY = sX;
  }

  // 3. موضع القطعة على اللوح بنظام الـ SVG
  const sheetX = part.x + rotX;
  const sheetY = part.y + rotY;

  // 4. تحويل Y إلى نظام إحداثيات CAD/CNC الديكارتي (من أسفل لأعلى) مع إزاحة اللوح
  const cadX = sheetOffsetX + sheetX;
  const cadY = sheetOffsetY + (sheetH - sheetY);

  return { x: cadX, y: cadY };
}

/**
 * كاتب أوامر DXF الاحترافي
 * يولد كيانات متوافقة 100% مع أوتوكاد وماكينات التحكم الرقمي CNC
 */
export class DxfWriter {
  private buffer: string[] = [];

  /**
   * إضافة خط مستقيم LINE
   * الكيان الأكثر موثوقية وتوافقاً مع كل ماكينات الـ CNC ومحللات DXF
   */
  addLine(x1: number, y1: number, x2: number, y2: number, layer: string, color = 1) {
    if (Math.abs(x1 - x2) < 0.001 && Math.abs(y1 - y2) < 0.001) return;

    this.buffer.push('0');
    this.buffer.push('LINE');
    this.buffer.push('8');
    this.buffer.push(layer);
    this.buffer.push('62');
    this.buffer.push(String(color));
    this.buffer.push('10');
    this.buffer.push(x1.toFixed(3));
    this.buffer.push('20');
    this.buffer.push(y1.toFixed(3));
    this.buffer.push('30');
    this.buffer.push('0.0');
    this.buffer.push('11');
    this.buffer.push(x2.toFixed(3));
    this.buffer.push('21');
    this.buffer.push(y2.toFixed(3));
    this.buffer.push('31');
    this.buffer.push('0.0');
  }

  /**
   * إضافة دائرة CIRCLE
   */
  addCircle(cx: number, cy: number, r: number, layer: string, color = 1) {
    if (r <= 0.001) return;
    this.buffer.push('0');
    this.buffer.push('CIRCLE');
    this.buffer.push('8');
    this.buffer.push(layer);
    this.buffer.push('62');
    this.buffer.push(String(color));
    this.buffer.push('10');
    this.buffer.push(cx.toFixed(3));
    this.buffer.push('20');
    this.buffer.push(cy.toFixed(3));
    this.buffer.push('30');
    this.buffer.push('0.0');
    this.buffer.push('40');
    this.buffer.push(r.toFixed(3));
  }

  /**
   * إضافة مسار مغلق أو مفتوح باستخدام خطوط LINE متصلة
   * يضمن ظهور الأشكال في برامج CAM (مثل RDWorks و ArtCAM) التي لا تدعم كائنات POLYLINE القديمة
   */
  addConnectedLines(points: Point2D[], isClosed: boolean, layer: string, color = 1) {
    if (points.length < 2) return;
    for (let i = 0; i < points.length - 1; i++) {
      this.addLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, layer, color);
    }
    if (isClosed && points.length >= 3) {
      this.addLine(points[points.length - 1].x, points[points.length - 1].y, points[0].x, points[0].y, layer, color);
    }
  }

  /**
   * إضافة نص توضيحي TEXT
   */
  addText(x: number, y: number, height: number, text: string, layer: string, color = 3) {
    if (!text || !text.trim()) return;
    this.buffer.push('0');
    this.buffer.push('TEXT');
    this.buffer.push('8');
    this.buffer.push(layer);
    this.buffer.push('62');
    this.buffer.push(String(color));
    this.buffer.push('10');
    this.buffer.push(x.toFixed(3));
    this.buffer.push('20');
    this.buffer.push(y.toFixed(3));
    this.buffer.push('30');
    this.buffer.push('0.0');
    this.buffer.push('40');
    this.buffer.push(height.toFixed(2));
    this.buffer.push('1');
    this.buffer.push(encodeDxfText(text));
    this.buffer.push('7');
    this.buffer.push('STANDARD');
  }

  getString(): string {
    return this.buffer.join('\r\n');
  }
}

/**
 * تحليل مسار SVG Path 'd' وتحويله إلى خطوط وأقواس DXF
 */
export function parseSvgPathToDxf(
  d: string,
  part: PlacedPart,
  sheetH: number,
  writer: DxfWriter,
  sheetOffsetX = 0,
  sheetOffsetY = 0,
  layer = 'CUT_PATHS'
) {
  if (!d || !d.trim()) return;

  const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let prevCpX = 0;
  let prevCpY = 0;
  let prevCmd = '';

  while ((match = cmdRegex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
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
          i = 2;
          while (i < nums.length - 1) {
            const nextX = isRel ? curX + nums[i] : nums[i];
            const nextY = isRel ? curY + nums[i + 1] : nums[i + 1];
            const p1 = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
            const p2 = transformToCad(nextX, nextY, part, sheetH, sheetOffsetX, sheetOffsetY);
            writer.addLine(p1.x, p1.y, p2.x, p2.y, layer, 1);
            curX = nextX;
            curY = nextY;
            i += 2;
          }
        }
        break;
      }
      case 'L': {
        while (i < nums.length - 1) {
          const nextX = isRel ? curX + nums[i] : nums[i];
          const nextY = isRel ? curY + nums[i + 1] : nums[i + 1];
          const p1 = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          const p2 = transformToCad(nextX, nextY, part, sheetH, sheetOffsetX, sheetOffsetY);
          writer.addLine(p1.x, p1.y, p2.x, p2.y, layer, 1);
          curX = nextX;
          curY = nextY;
          i += 2;
        }
        break;
      }
      case 'H': {
        while (i < nums.length) {
          const nextX = isRel ? curX + nums[i] : nums[i];
          const p1 = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          const p2 = transformToCad(nextX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          writer.addLine(p1.x, p1.y, p2.x, p2.y, layer, 1);
          curX = nextX;
          i++;
        }
        break;
      }
      case 'V': {
        while (i < nums.length) {
          const nextY = isRel ? curY + nums[i] : nums[i];
          const p1 = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          const p2 = transformToCad(curX, nextY, part, sheetH, sheetOffsetX, sheetOffsetY);
          writer.addLine(p1.x, p1.y, p2.x, p2.y, layer, 1);
          curY = nextY;
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
          const endX = isRel ? curX + nums[i + 4] : nums[i + 4];
          const endY = isRel ? curY + nums[i + 5] : nums[i + 5];

          const pts = sampleCubicBezier(
            { x: curX, y: curY },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: endX, y: endY },
            16
          );

          let prev = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          for (const pt of pts) {
            const cadPt = transformToCad(pt.x, pt.y, part, sheetH, sheetOffsetX, sheetOffsetY);
            writer.addLine(prev.x, prev.y, cadPt.x, cadPt.y, layer, 1);
            prev = cadPt;
          }

          prevCpX = cp2x;
          prevCpY = cp2y;
          curX = endX;
          curY = endY;
          i += 6;
        }
        break;
      }
      case 'S': {
        while (i < nums.length - 3) {
          let cp1x = curX;
          let cp1y = curY;
          if (['C', 'S'].includes(prevCmd)) {
            cp1x = 2 * curX - prevCpX;
            cp1y = 2 * curY - prevCpY;
          }
          const cp2x = isRel ? curX + nums[i] : nums[i];
          const cp2y = isRel ? curY + nums[i + 1] : nums[i + 1];
          const endX = isRel ? curX + nums[i + 2] : nums[i + 2];
          const endY = isRel ? curY + nums[i + 3] : nums[i + 3];

          const pts = sampleCubicBezier(
            { x: curX, y: curY },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: endX, y: endY },
            16
          );

          let prev = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          for (const pt of pts) {
            const cadPt = transformToCad(pt.x, pt.y, part, sheetH, sheetOffsetX, sheetOffsetY);
            writer.addLine(prev.x, prev.y, cadPt.x, cadPt.y, layer, 1);
            prev = cadPt;
          }

          prevCpX = cp2x;
          prevCpY = cp2y;
          curX = endX;
          curY = endY;
          i += 4;
        }
        break;
      }
      case 'Q': {
        while (i < nums.length - 3) {
          const cpx = isRel ? curX + nums[i] : nums[i];
          const cpy = isRel ? curY + nums[i + 1] : nums[i + 1];
          const endX = isRel ? curX + nums[i + 2] : nums[i + 2];
          const endY = isRel ? curY + nums[i + 3] : nums[i + 3];

          const pts = sampleQuadraticBezier(
            { x: curX, y: curY },
            { x: cpx, y: cpy },
            { x: endX, y: endY },
            12
          );

          let prev = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          for (const pt of pts) {
            const cadPt = transformToCad(pt.x, pt.y, part, sheetH, sheetOffsetX, sheetOffsetY);
            writer.addLine(prev.x, prev.y, cadPt.x, cadPt.y, layer, 1);
            prev = cadPt;
          }

          prevCpX = cpx;
          prevCpY = cpy;
          curX = endX;
          curY = endY;
          i += 4;
        }
        break;
      }
      case 'A': {
        while (i < nums.length - 6) {
          const rx = nums[i];
          const ry = nums[i + 1];
          const rot = nums[i + 2];
          const largeArc = nums[i + 3] !== 0;
          const sweep = nums[i + 4] !== 0;
          const endX = isRel ? curX + nums[i + 5] : nums[i + 5];
          const endY = isRel ? curY + nums[i + 6] : nums[i + 6];

          const pts = sampleArc(curX, curY, rx, ry, rot, largeArc, sweep, endX, endY, 16);

          let prev = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
          for (const pt of pts) {
            const cadPt = transformToCad(pt.x, pt.y, part, sheetH, sheetOffsetX, sheetOffsetY);
            writer.addLine(prev.x, prev.y, cadPt.x, cadPt.y, layer, 1);
            prev = cadPt;
          }

          curX = endX;
          curY = endY;
          i += 7;
        }
        break;
      }
      case 'Z': {
        const p1 = transformToCad(curX, curY, part, sheetH, sheetOffsetX, sheetOffsetY);
        const p2 = transformToCad(startX, startY, part, sheetH, sheetOffsetX, sheetOffsetY);
        writer.addLine(p1.x, p1.y, p2.x, p2.y, layer, 1);
        curX = startX;
        curY = startY;
        break;
      }
    }

    prevCmd = type;
  }
}

/**
 * فك وتحليل الأشكال الهندسية من داخل الـ svgSnippet إلى أوامر DXF
 */
export function parseSnippetToDxf(
  snippet: string,
  part: PlacedPart,
  sheetH: number,
  writer: DxfWriter,
  sheetOffsetX = 0,
  sheetOffsetY = 0
) {
  // 1. مسارات path
  const pathRegex = /<path\b[^>]*\bd=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(snippet)) !== null) {
    parseSvgPathToDxf(match[1], part, sheetH, writer, sheetOffsetX, sheetOffsetY, 'CUT_PATHS');
  }

  // 2. مستطيلات rect (مع دعم الاستدارة rx/ry)
  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  while ((match = rectRegex.exec(snippet)) !== null) {
    const attrs = match[1];
    const x = parseFloat((attrs.match(/\bx=["']([^"']+)["']/i) || [])[1] || '0');
    const y = parseFloat((attrs.match(/\by=["']([^"']+)["']/i) || [])[1] || '0');
    const w = parseFloat((attrs.match(/\bwidth=["']([^"']+)["']/i) || [])[1] || '0');
    const h = parseFloat((attrs.match(/\bheight=["']([^"']+)["']/i) || [])[1] || '0');
    const rx = parseFloat((attrs.match(/\brx=["']([^"']+)["']/i) || [])[1] || '0');
    const ry = parseFloat((attrs.match(/\bry=["']([^"']+)["']/i) || [])[1] || String(rx));

    if (w > 0 && h > 0) {
      if (rx > 0 && ry > 0) {
        // مستطيل بزوايا دائرية
        const effectiveRx = Math.min(rx, w / 2);
        const effectiveRy = Math.min(ry, h / 2);
        const d = `M ${x + effectiveRx} ${y} ` +
          `H ${x + w - effectiveRx} ` +
          `A ${effectiveRx} ${effectiveRy} 0 0 1 ${x + w} ${y + effectiveRy} ` +
          `V ${y + h - effectiveRy} ` +
          `A ${effectiveRx} ${effectiveRy} 0 0 1 ${x + w - effectiveRx} ${y + h} ` +
          `H ${x + effectiveRx} ` +
          `A ${effectiveRx} ${effectiveRy} 0 0 1 ${x} ${y + h - effectiveRy} ` +
          `V ${y + effectiveRy} ` +
          `A ${effectiveRx} ${effectiveRy} 0 0 1 ${x + effectiveRx} ${y} Z`;
        parseSvgPathToDxf(d, part, sheetH, writer, sheetOffsetX, sheetOffsetY, 'CUT_PATHS');
      } else {
        // مستطيل عادي مستقيم
        const p1 = transformToCad(x, y, part, sheetH, sheetOffsetX, sheetOffsetY);
        const p2 = transformToCad(x + w, y, part, sheetH, sheetOffsetX, sheetOffsetY);
        const p3 = transformToCad(x + w, y + h, part, sheetH, sheetOffsetX, sheetOffsetY);
        const p4 = transformToCad(x, y + h, part, sheetH, sheetOffsetX, sheetOffsetY);

        writer.addLine(p1.x, p1.y, p2.x, p2.y, 'CUT_PATHS', 1);
        writer.addLine(p2.x, p2.y, p3.x, p3.y, 'CUT_PATHS', 1);
        writer.addLine(p3.x, p3.y, p4.x, p4.y, 'CUT_PATHS', 1);
        writer.addLine(p4.x, p4.y, p1.x, p1.y, 'CUT_PATHS', 1);
      }
    }
  }

  // 3. دوائر circle
  const circleRegex = /<circle\b([^>]*)\/?>/gi;
  while ((match = circleRegex.exec(snippet)) !== null) {
    const attrs = match[1];
    const cx = parseFloat((attrs.match(/\bcx=["']([^"']+)["']/i) || [])[1] || '0');
    const cy = parseFloat((attrs.match(/\bcy=["']([^"']+)["']/i) || [])[1] || '0');
    const r = parseFloat((attrs.match(/\br=["']([^"']+)["']/i) || [])[1] || '0');

    if (r > 0) {
      const center = transformToCad(cx, cy, part, sheetH, sheetOffsetX, sheetOffsetY);
      const scaleX = part.originalBBox?.width ? part.originalWidth / part.originalBBox.width : 1;
      writer.addCircle(center.x, center.y, r * scaleX, 'CUT_PATHS', 1);
    }
  }

  // 4. أشكال بيضاوية ellipse
  const ellipseRegex = /<ellipse\b([^>]*)\/?>/gi;
  while ((match = ellipseRegex.exec(snippet)) !== null) {
    const attrs = match[1];
    const cx = parseFloat((attrs.match(/\bcx=["']([^"']+)["']/i) || [])[1] || '0');
    const cy = parseFloat((attrs.match(/\bcy=["']([^"']+)["']/i) || [])[1] || '0');
    const rx = parseFloat((attrs.match(/\brx=["']([^"']+)["']/i) || [])[1] || '0');
    const ry = parseFloat((attrs.match(/\bry=["']([^"']+)["']/i) || [])[1] || '0');

    if (rx > 0 && ry > 0) {
      const steps = 32;
      const pts: Point2D[] = [];
      for (let s = 0; s < steps; s++) {
        const theta = (s / steps) * 2 * Math.PI;
        const px = cx + rx * Math.cos(theta);
        const py = cy + ry * Math.sin(theta);
        pts.push(transformToCad(px, py, part, sheetH, sheetOffsetX, sheetOffsetY));
      }
      writer.addConnectedLines(pts, true, 'CUT_PATHS', 1);
    }
  }

  // 5. خطوط فردية line
  const lineRegex = /<line\b([^>]*)\/?>/gi;
  while ((match = lineRegex.exec(snippet)) !== null) {
    const attrs = match[1];
    const x1 = parseFloat((attrs.match(/\bx1=["']([^"']+)["']/i) || [])[1] || '0');
    const y1 = parseFloat((attrs.match(/\by1=["']([^"']+)["']/i) || [])[1] || '0');
    const x2 = parseFloat((attrs.match(/\bx2=["']([^"']+)["']/i) || [])[1] || '0');
    const y2 = parseFloat((attrs.match(/\by2=["']([^"']+)["']/i) || [])[1] || '0');

    const p1 = transformToCad(x1, y1, part, sheetH, sheetOffsetX, sheetOffsetY);
    const p2 = transformToCad(x2, y2, part, sheetH, sheetOffsetX, sheetOffsetY);
    writer.addLine(p1.x, p1.y, p2.x, p2.y, 'CUT_PATHS', 1);
  }

  // 6. مضلعات polygon و polyline
  const polyRegex = /<(polygon|polyline)\b[^>]*\bpoints=["']([^"']+)["'][^>]*>/gi;
  while ((match = polyRegex.exec(snippet)) !== null) {
    const isClosed = match[1].toLowerCase() === 'polygon';
    const nums = (match[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const pts: Point2D[] = [];
    for (let i = 0; i < nums.length - 1; i += 2) {
      pts.push(transformToCad(nums[i], nums[i + 1], part, sheetH, sheetOffsetX, sheetOffsetY));
    }
    if (pts.length >= 2) {
      writer.addConnectedLines(pts, isClosed, 'CUT_PATHS', 1);
    }
  }
}

/**
 * بناء ترويسة ملف DXF القياسية المتوافقة 100% مع أوتوكاد وماكينات CNC
 */
function buildDxfHeaderAndTables(totalWidth: number, totalHeight: number): string {
  const centerX = totalWidth / 2;
  const centerY = totalHeight / 2;
  const viewHeight = Math.max(100, totalHeight * 1.15);
  const aspectRatio = totalWidth / Math.max(1, totalHeight);

  // تسلسل الأقسام القياسي: HEADER -> TABLES -> BLOCKS -> ENTITIES
  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009',
    '9', '$MEASUREMENT',
    '70', '1', // 1 = متري (Metric)
    '9', '$INSUNITS',
    '70', '4', // 4 = مليمتر (Millimeters)
    '9', '$LUNITS',
    '70', '2', // 2 = عشري (Decimal)
    '9', '$LUPREC',
    '70', '3', // دقة 3 أرقام عشرية
    '9', '$EXTMIN',
    '10', '0.000',
    '20', '0.000',
    '30', '0.000',
    '9', '$EXTMAX',
    '10', totalWidth.toFixed(3),
    '20', totalHeight.toFixed(3),
    '30', '0.000',
    '9', '$LIMMIN',
    '10', '0.000',
    '20', '0.000',
    '9', '$LIMMAX',
    '10', totalWidth.toFixed(3),
    '20', totalHeight.toFixed(3),
    '9', '$LIMCHECK',
    '70', '0',
    '0', 'ENDSEC',

    // قسم الجداول TABLES
    '0', 'SECTION',
    '2', 'TABLES',

    // جدول منافذ الرؤية VPORT لضبط الكاميرا مكبرة على اللوح في المنتصف
    '0', 'TABLE',
    '2', 'VPORT',
    '70', '1',
    '0', 'VPORT',
    '2', '*ACTIVE',
    '70', '0',
    '10', '0.0',
    '20', '0.0',
    '11', '1.0',
    '21', '1.0',
    '12', centerX.toFixed(3),
    '22', centerY.toFixed(3),
    '13', '0.0',
    '23', '0.0',
    '14', '10.0',
    '24', '10.0',
    '15', '0.0',
    '25', '0.0',
    '16', '0.0',
    '26', '0.0',
    '36', '1.0',
    '17', '0.0',
    '27', '0.0',
    '37', '0.0',
    '40', viewHeight.toFixed(3),
    '41', aspectRatio.toFixed(3),
    '42', '50.0',
    '43', '0.0',
    '44', '0.0',
    '50', '0.0',
    '51', '0.0',
    '71', '0',
    '72', '100',
    '73', '1',
    '74', '3',
    '75', '1',
    '76', '1',
    '77', '1',
    '78', '1',
    '0', 'ENDTAB',

    // جدول أنماط الخطوط LTYPE
    '0', 'TABLE',
    '2', 'LTYPE',
    '70', '1',
    '0', 'LTYPE',
    '2', 'CONTINUOUS',
    '70', '0',
    '3', 'Solid line',
    '72', '65',
    '73', '0',
    '40', '0.0',
    '0', 'ENDTAB',

    // جدول الطبقات LAYER (مطابق لطبقات SVG: مسارات القص فقط CUT_PATHS باللون الأحمر #FF0000)
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '2',
    '0', 'LAYER',
    '2', '0',
    '70', '0',
    '62', '7',
    '6', 'CONTINUOUS',
    '0', 'LAYER',
    '2', 'CUT_PATHS',
    '70', '0',
    '62', '1', // أحمر بارز لمسارات القص
    '6', 'CONTINUOUS',
    '0', 'ENDTAB',

    // جدول أنماط النصوص STYLE
    '0', 'TABLE',
    '2', 'STYLE',
    '70', '1',
    '0', 'STYLE',
    '2', 'STANDARD',
    '70', '0',
    '40', '0.0',
    '41', '1.0',
    '50', '0.0',
    '71', '0',
    '42', '2.5',
    '3', 'txt',
    '4', '',
    '0', 'ENDTAB',

    '0', 'ENDSEC',

    // قسم القوالب BLOCKS (إلزامي في أوتوكاد، وبدونه يتوقف البرنامج ويعتبر الملف فارغاً)
    '0', 'SECTION',
    '2', 'BLOCKS',
    '0', 'ENDSEC',

    // بداية قسم الكيانات
    '0', 'SECTION',
    '2', 'ENTITIES'
  ];

  return lines.join('\r\n');
}

/**
 * ذيل ملف DXF
 */
function buildDxfFooter(): string {
  return ['0', 'ENDSEC', '0', 'EOF'].join('\r\n');
}

/**
 * توليد محتوى لوح واحد داخل DxfWriter
 * مطابق 100% لنمط تصدير الـ SVG بدون أي إطار لوح أو هوامش أو نصوص أو إضافات
 */
function appendSheetEntities(sheet: SheetStats, writer: DxfWriter, sheetOffsetX = 0, sheetOffsetY = 0) {
  const sheetH = sheet.sheetHeight;

  // مسارات القص فقط (CUT_PATHS) مطابقة تماماً لمسارات SVG دون أي إطار لوح أو هوامش أو إضافات
  sheet.placedParts.forEach((part) => {
    if (part.svgSnippet) {
      // تفكيك وتحويل مسارات الـ SVG الحقيقية إلى خطوط وأقواس متوافقة مع الـ CNC
      parseSnippetToDxf(part.svgSnippet, part, sheetH, writer, sheetOffsetX, sheetOffsetY);
    } else {
      // للقطع المستطيلة العادية المنشأة يدوياً
      const p1 = { x: sheetOffsetX + part.x, y: sheetOffsetY + (sheetH - (part.y + part.height)) };
      const p2 = { x: sheetOffsetX + part.x + part.width, y: sheetOffsetY + (sheetH - (part.y + part.height)) };
      const p3 = { x: sheetOffsetX + part.x + part.width, y: sheetOffsetY + (sheetH - part.y) };
      const p4 = { x: sheetOffsetX + part.x, y: sheetOffsetY + (sheetH - part.y) };

      writer.addLine(p1.x, p1.y, p2.x, p2.y, 'CUT_PATHS', 1);
      writer.addLine(p2.x, p2.y, p3.x, p3.y, 'CUT_PATHS', 1);
      writer.addLine(p3.x, p3.y, p4.x, p4.y, 'CUT_PATHS', 1);
      writer.addLine(p4.x, p4.y, p1.x, p1.y, 'CUT_PATHS', 1);
    }
  });
}

/**
 * توليد ملف AutoCAD DXF (R12 / ASCII) احترافي متوافق 100% للوح الحالي
 */
export function generateSheetDxf(sheet: SheetStats): string {
  const sheetW = sheet.sheetWidth;
  const sheetH = sheet.sheetHeight;

  const header = buildDxfHeaderAndTables(sheetW, sheetH);
  const writer = new DxfWriter();

  appendSheetEntities(sheet, writer, 0, 0);

  const footer = buildDxfFooter();

  return `${header}\r\n${writer.getString()}\r\n${footer}`;
}

/**
 * توليد ملف AutoCAD DXF احترافي يضم كافة الألواح الموزعة بجانب بعضها البعض
 * ميزة احترافية لماكينات الـ CNC للتحكم بكامل خط الإنتاج من ملف DXF واحد
 */
export function generateAllSheetsDxf(sheets: SheetStats[], spacing = 200): string {
  if (sheets.length === 0) return '';
  if (sheets.length === 1) return generateSheetDxf(sheets[0]);

  let totalWidth = 0;
  let maxHeight = 0;

  sheets.forEach((s, idx) => {
    totalWidth += s.sheetWidth + (idx > 0 ? spacing : 0);
    if (s.sheetHeight > maxHeight) maxHeight = s.sheetHeight;
  });

  const header = buildDxfHeaderAndTables(totalWidth, maxHeight);
  const writer = new DxfWriter();

  let curOffsetX = 0;
  sheets.forEach((s) => {
    appendSheetEntities(s, writer, curOffsetX, 0);
    curOffsetX += s.sheetWidth + spacing;
  });

  const footer = buildDxfFooter();

  return `${header}\r\n${writer.getString()}\r\n${footer}`;
}
