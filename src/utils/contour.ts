/**
 * @file contour.ts
 * استخراج مضلعات Contour الحقيقية من قطع SVG لمحرك التسكين غير المنتظم (NFP)
 * يعتمد على تحليل نصي (DOM-free) كي يعمل في المتصفح وفي اختبارات Node معاً
 * متوافق مع منطق dxfExporter (نفس تقريب المنحنيات) لضمان تطابق الهندسة مع التصدير
 */

export interface ContourPoint {
  x: number;
  y: number;
}

export interface ContourBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// عدد خطوات التقريب الثابت — مطابق لـ dxfExporter لضمان تطابق الكنتور مع مخطط DXF
const CUBIC_STEPS = 16;
const QUAD_STEPS = 12;
const ARC_STEPS = 16;
const ELLIPSE_STEPS = 32;

// ------------------------------------------------------------------
// مساعدات هندسية أساسية (مُصدَّرة للاختبارات)
// ------------------------------------------------------------------

/** المساحة الموقعة لمضلع (shoelace) — إشارة موجبة عكس عقارب الساعة في نظام SVG */
export function signedArea(pts: ContourPoint[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** محيط المضلع */
export function perimeter(pts: ContourPoint[]): number {
  let len = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** الصندوق المحيط */
export function contourBounds(pts: ContourPoint[]): ContourBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** نقطة داخل مضلع؟ (ray casting) */
export function pointInContour(point: ContourPoint, pts: ContourPoint[]): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = pts[i];
    const pj = pts[j];
    if (
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** المحدب اللاحق (Convex Hull) — Andrew monotone chain */
export function convexHull(pts: ContourPoint[]): ContourPoint[] {
  if (pts.length <= 3) return pts.slice();

  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: ContourPoint, a: ContourPoint, b: ContourPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: ContourPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: ContourPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** إزالة النقاط المكررة والمتداخلة تقريباً من المضلع */
export function dedupePoints(pts: ContourPoint[], eps = 1e-6): ContourPoint[] {
  const out: ContourPoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < eps && Math.abs(last.y - p.y) < eps) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first.x - last.x) < eps && Math.abs(first.y - last.y) < eps) out.pop();
  }
  return out;
}

// ------------------------------------------------------------------
// عينات المنحنيات (نفس منطق dxfExporter: خطوات ثابتة)
// ------------------------------------------------------------------

function sampleCubic(
  p0: ContourPoint,
  p1: ContourPoint,
  p2: ContourPoint,
  p3: ContourPoint,
  steps = CUBIC_STEPS
): ContourPoint[] {
  const points: ContourPoint[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x:
        mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y:
        mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
    });
  }
  return points;
}

function sampleQuad(
  p0: ContourPoint,
  p1: ContourPoint,
  p2: ContourPoint,
  steps = QUAD_STEPS
): ContourPoint[] {
  const points: ContourPoint[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
    });
  }
  return points;
}

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
  steps = ARC_STEPS
): ContourPoint[] {
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
    const s = Math.sqrt(radiiCheck);
    rx *= s;
    ry *= s;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const sq = Math.max(
    0,
    (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq)
  );
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
  if (!sweepFlag && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  else if (sweepFlag && deltaAngle < 0) deltaAngle += 2 * Math.PI;

  const points: ContourPoint[] = [];
  for (let i = 1; i <= steps; i++) {
    const angle = startAngle + (deltaAngle * i) / steps;
    const px = rx * Math.cos(angle);
    const py = ry * Math.sin(angle);
    points.push({
      x: cosPhi * px - sinPhi * py + cx,
      y: sinPhi * px + cosPhi * py + cy
    });
  }
  return points;
}

// ------------------------------------------------------------------
// محلل مسارات SVG (ماسح محارفي — يدعم الأوامر كاملة مع أعلام Arc)
// ------------------------------------------------------------------

/**
 * تحليل سلسلة 'd' إلى حلقات نقاط
 * يدعم: M L H V C S Q T A Z (حروف كبيرة/صغيرة) مع الإسناد النسبي
 */
export function pathDToLoops(d: string, closedOnly = false): ContourPoint[][] {
  if (!d || typeof d !== 'string') return [];

  const tokens = tokenizePath(d);
  const loops: ContourPoint[][] = [];
  let current: ContourPoint[] = [];

  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCmd = '';
  let ctrlX = 0;
  let ctrlY = 0;
  let qCtrlX = 0;
  let qCtrlY = 0;

  let i = 0;
  const num = (): number => {
    const v = tokens[i++];
    return typeof v === 'number' ? v : NaN;
  };

  const flush = (close: boolean) => {
    if (current.length >= 2) {
      if (close) current = dedupePoints(current);
      if (!closedOnly || close) loops.push(current);
    }
    current = [];
  };

  while (i < tokens.length) {
    let cmd: string;
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
    } else {
      cmd = prevCmd === 'M' ? 'L' : prevCmd === 'm' ? 'l' : prevCmd;
      if (!cmd) break;
    }

    const rel = cmd === cmd.toLowerCase();
    const base = cmd.toUpperCase();

    switch (base) {
      case 'M': {
        flush(false);
        let x = num();
        let y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        sx = cx;
        sy = cy;
        current.push({ x: cx, y: cy });
        break;
      }
      case 'L': {
        let x = num();
        let y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        cx = x;
        cy = y;
        current.push({ x: cx, y: cy });
        break;
      }
      case 'H': {
        let x = num();
        if (rel) x += cx;
        cx = x;
        current.push({ x: cx, y: cy });
        break;
      }
      case 'V': {
        let y = num();
        if (rel) y += cy;
        cy = y;
        current.push({ x: cx, y: cy });
        break;
      }
      case 'C': {
        let x1 = num();
        let y1 = num();
        let x2 = num();
        let y2 = num();
        let x = num();
        let y = num();
        if (rel) {
          x1 += cx;
          y1 += cy;
          x2 += cx;
          y2 += cy;
          x += cx;
          y += cy;
        }
        const pts = sampleCubic({ x: cx, y: cy }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y });
        current.push(...pts);
        ctrlX = x2;
        ctrlY = y2;
        cx = x;
        cy = y;
        break;
      }
      case 'S': {
        let x2 = num();
        let y2 = num();
        let x = num();
        let y = num();
        if (rel) {
          x2 += cx;
          y2 += cy;
          x += cx;
          y += cy;
        }
        const reflect =
          prevCmd.toUpperCase() === 'C' || prevCmd.toUpperCase() === 'S'
            ? { x: 2 * cx - ctrlX, y: 2 * cy - ctrlY }
            : { x: cx, y: cy };
        const pts = sampleCubic({ x: cx, y: cy }, reflect, { x: x2, y: y2 }, { x, y });
        current.push(...pts);
        ctrlX = x2;
        ctrlY = y2;
        cx = x;
        cy = y;
        break;
      }
      case 'Q': {
        let x1 = num();
        let y1 = num();
        let x = num();
        let y = num();
        if (rel) {
          x1 += cx;
          y1 += cy;
          x += cx;
          y += cy;
        }
        const pts = sampleQuad({ x: cx, y: cy }, { x: x1, y: y1 }, { x, y });
        current.push(...pts);
        qCtrlX = x1;
        qCtrlY = y1;
        cx = x;
        cy = y;
        break;
      }
      case 'T': {
        let x = num();
        let y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        const reflect =
          prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T'
            ? { x: 2 * cx - qCtrlX, y: 2 * cy - qCtrlY }
            : { x: cx, y: cy };
        const pts = sampleQuad({ x: cx, y: cy }, reflect, { x, y });
        current.push(...pts);
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const laf = num() !== 0;
        const sf = num() !== 0;
        let x = num();
        let y = num();
        if (rel) {
          x += cx;
          y += cy;
        }
        const pts = sampleArc(cx, cy, rx, ry, rot, laf, sf, x, y);
        current.push(...pts);
        cx = x;
        cy = y;
        break;
      }
      case 'Z': {
        cx = sx;
        cy = sy;
        flush(true);
        prevCmd = cmd;
        continue;
      }
      default: {
        i++;
        prevCmd = cmd;
        continue;
      }
    }

    prevCmd = cmd;
  }

  flush(false);
  return loops.filter(l => l.length >= 2);
}

/** ماسح محارفي للمسار: أوامر + أرقام (يدعم قراءة أعلام Arc المتلاصقة 01) */
function tokenizePath(d: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  let i = 0;
  const n = d.length;

  const isCmd = (c: string) => /[MmLlHhVvCcSsQqTtAaZz]/.test(c);

  while (i < n) {
    const c = d[i];

    if (isCmd(c)) {
      tokens.push(c);
      i++;
      continue;
    }

    if (/[0-9.+-eE]/.test(c)) {
      const start = i;
      if (d[i] === '+' || d[i] === '-') i++;
      let dots = 0;
      while (i < n) {
        const ch = d[i];
        if (ch >= '0' && ch <= '9') {
          i++;
        } else if (ch === '.') {
          if (++dots > 1) break;
          i++;
        } else if (ch === 'e' || ch === 'E') {
          if (
            i + 1 < n &&
            (d[i + 1] === '+' || d[i + 1] === '-' || (d[i + 1] >= '0' && d[i + 1] <= '9'))
          ) {
            i++;
            if (d[i] === '+' || d[i] === '-') i++;
            while (i < n && d[i] >= '0' && d[i] <= '9') i++;
          }
          break;
        } else {
          break;
        }
      }
      const raw = d.slice(start, i);
      const val = parseFloat(raw);
      if (!Number.isNaN(val)) {
        tokens.push(val);
      } else {
        i++;
      }
      continue;
    }

    i++;
  }

  return tokens;
}

// ------------------------------------------------------------------
// تحويل عناصر SVG غير المسارية إلى حلقات
// ------------------------------------------------------------------

function rectToLoop(attrs: Record<string, string>): ContourPoint[] {
  const x = parseFloat(attrs.x || '0') || 0;
  const y = parseFloat(attrs.y || '0') || 0;
  const w = parseFloat(attrs.width || '0') || 0;
  const h = parseFloat(attrs.height || '0') || 0;
  if (w <= 0 || h <= 0) return [];

  let rx = parseFloat(attrs.rx || '0') || 0;
  let ry = parseFloat(attrs.ry || '0') || 0;
  if (!attrs.rx && attrs.ry) rx = ry;
  if (!attrs.ry && attrs.rx) ry = rx;
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);

  if (rx <= 0 || ry <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ];
  }

  // مستطيل بزوايا دائرية — ربع دائرة لكل زاوية
  const pts: ContourPoint[] = [];
  const cornerSteps = 8;
  const arcPts = (ccx: number, ccy: number, a0: number, a1: number) => {
    for (let s = 1; s <= cornerSteps; s++) {
      const a = a0 + ((a1 - a0) * s) / cornerSteps;
      pts.push({ x: ccx + rx * Math.cos(a), y: ccy + ry * Math.sin(a) });
    }
  };
  arcPts(x + w - rx, y + ry, -Math.PI / 2, 0);
  arcPts(x + w - rx, y + h - ry, 0, Math.PI / 2);
  arcPts(x + rx, y + h - ry, Math.PI / 2, Math.PI);
  arcPts(x + rx, y + ry, Math.PI, 1.5 * Math.PI);
  return pts;
}

function circleToLoop(attrs: Record<string, string>): ContourPoint[] {
  const cx = parseFloat(attrs.cx || '0') || 0;
  const cy = parseFloat(attrs.cy || '0') || 0;
  const r = parseFloat(attrs.r || '0') || 0;
  if (r <= 0) return [];
  const pts: ContourPoint[] = [];
  for (let s = 0; s < ELLIPSE_STEPS; s++) {
    const a = (2 * Math.PI * s) / ELLIPSE_STEPS;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function ellipseToLoop(attrs: Record<string, string>): ContourPoint[] {
  const cx = parseFloat(attrs.cx || '0') || 0;
  const cy = parseFloat(attrs.cy || '0') || 0;
  const rx = parseFloat(attrs.rx || '0') || 0;
  const ry = parseFloat(attrs.ry || '0') || 0;
  if (rx <= 0 || ry <= 0) return [];
  const pts: ContourPoint[] = [];
  for (let s = 0; s < ELLIPSE_STEPS; s++) {
    const a = (2 * Math.PI * s) / ELLIPSE_STEPS;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

function pointsAttrToLoop(str: string): ContourPoint[] {
  const nums = (str.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) || []).map(Number);
  const pts: ContourPoint[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}

/** تحليل وسم SVG واحد إلى حلقات */
export function svgElementToLoops(tag: string, attrs: Record<string, string>): ContourPoint[][] {
  switch (tag.toLowerCase()) {
    case 'path':
      return pathDToLoops(attrs.d || '');
    case 'rect':
      return [rectToLoop(attrs)].filter(l => l.length >= 3);
    case 'circle':
      return [circleToLoop(attrs)].filter(l => l.length >= 3);
    case 'ellipse':
      return [ellipseToLoop(attrs)].filter(l => l.length >= 3);
    case 'polygon':
      return [pointsAttrToLoop(attrs.points || '')].filter(l => l.length >= 3);
    case 'polyline':
      return [pointsAttrToLoop(attrs.points || '')].filter(l => l.length >= 2);
    case 'line':
      return [[
        { x: parseFloat(attrs.x1 || '0'), y: parseFloat(attrs.y1 || '0') },
        { x: parseFloat(attrs.x2 || '0'), y: parseFloat(attrs.y2 || '0') },
      ]];
    default:
      return [];
  }
}

/**
 * تحليل مقتطف SVG (markup ناتج من sanitizeSvgToRedOutline) إلى كل الحلقات
 * يعتمد على تحليل نصي بدل DOMParser كي يعمل في Node وفي Worker معاً
 */
export type SvgMatrix = [number, number, number, number, number, number];
const IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0];

export function multiplySvgMatrices(a: SvgMatrix, b: SvgMatrix): SvgMatrix {
  return [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
  ];
}

export function parseSvgTransform(value: string): SvgMatrix {
  let matrix: SvgMatrix = [...IDENTITY];
  for (const match of value.matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)) {
    const args = (match[2].match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || []).map(Number);
    let next: SvgMatrix = [...IDENTITY];
    const angle = (args[0] || 0) * Math.PI / 180;
    switch (match[1].toLowerCase()) {
      case 'matrix': if (args.length === 6) next = args as SvgMatrix; break;
      case 'translate': next[4] = args[0] || 0; next[5] = args[1] || 0; break;
      case 'scale': next[0] = args[0] ?? 1; next[3] = args[1] ?? next[0]; break;
      case 'rotate': {
        next = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
        if (args.length >= 3) next = multiplySvgMatrices(
          multiplySvgMatrices([1, 0, 0, 1, args[1], args[2]], next),
          [1, 0, 0, 1, -args[1], -args[2]],
        );
        break;
      }
      case 'skewx': next[2] = Math.tan(angle); break;
      case 'skewy': next[1] = Math.tan(angle); break;
    }
    matrix = multiplySvgMatrices(matrix, next);
  }
  return matrix;
}

export function transformSvgPoint(p: ContourPoint, m: SvgMatrix): ContourPoint {
  return { x: m[0]*p.x+m[2]*p.y+m[4], y: m[1]*p.x+m[3]*p.y+m[5] };
}

export function snippetToLoops(snippet: string, closedOnly = false): ContourPoint[][] {
  if (!snippet || typeof snippet !== 'string') return [];
  const loops: ContourPoint[][] = [];
  const stack: Array<{ tag: string; matrix: SvgMatrix }> = [{ tag: '', matrix: IDENTITY }];
  // Keep group transforms instead of discarding them during contour extraction.
  const tags = snippet.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([\w:.-]+)\b([^>]*?)(\/?)>/g);
  for (const m of tags) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const attr of m[3].matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3];
    }
    const matrix = multiplySvgMatrices(stack[stack.length - 1].matrix, parseSvgTransform(attrs.transform || ''));
    const sourceLoops = closedOnly && tag==='path' ? pathDToLoops(attrs.d||'',true)
      : closedOnly && (tag==='line'||tag==='polyline') ? [] : svgElementToLoops(tag, attrs);
    for (const loop of sourceLoops) {
      const clean = dedupePoints(loop.map(p => transformSvgPoint(p, matrix)));
      // Open strokes and self-intersections can have zero signed area. Keep
      // their endpoints so the collision envelope contains all original art.
      if (clean.length >= 2) loops.push(clean);
    }
    if (!m[4]) stack.push({ tag, matrix });
  }
  return loops;
}

/**
 * اختيار الكنتور الخارجي من مجموعة حلقات:
 * - إذا كانت كل الحلقات الأخرى داخل أكبر حلقة (بالمساحة) => ثقوب => نأخذ الأكبر فقط
 * - إذا كانت هناك حلقات متفرقة (تصميم متكامل بعدة أشكال) => المحدب اللاحق لكل النقاط
 *   (تقدير آمن لا يتداخل مع أي شكل — أفضل من BBox)
 */
export function chooseOuterContour(loops: ContourPoint[][]): ContourPoint[] {
  if (loops.length === 0) return [];
  if (loops.length === 1) return loops[0];

  let outerIdx = 0;
  let outerArea = Math.abs(signedArea(loops[0]));
  for (let i = 1; i < loops.length; i++) {
    const a = Math.abs(signedArea(loops[i]));
    if (a > outerArea) {
      outerArea = a;
      outerIdx = i;
    }
  }

  const outer = loops[outerIdx];
  let allInside = true;
  for (let i = 0; i < loops.length; i++) {
    if (i === outerIdx) continue;
    if (!loops[i].every(p => pointInContour(p, outer))) {
      allInside = false;
      break;
    }
  }

  if (allInside) return outer;

  const all: ContourPoint[] = [];
  for (const l of loops) all.push(...l);
  return convexHull(all);
}

/** الكنتور الخارجي لمقطف SVG مباشرة */
export function snippetToContour(snippet: string): ContourPoint[] {
  return chooseOuterContour(snippetToLoops(snippet));
}

/** كنتور مستطيل بسيط */
export function rectContour(width: number, height: number): ContourPoint[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
}

/**
 * تحويل كنتور من وحدات SVG إلى مليمترات داخل القطعة (نظام part-local)
 * mm = (point - originalBBox.origin) * (partSize / originalBBox.size)
 * مطابق تماماً لمنطق الرسم في SheetCanvas وتحويل dxfExporter.transformToCad
 */
export function contourToMm(
  contour: ContourPoint[],
  originalBBox: { x: number; y: number; width: number; height: number },
  partWidth: number,
  partHeight: number
): ContourPoint[] {
  const scaleX = originalBBox.width > 0 ? partWidth / originalBBox.width : 1;
  const scaleY = originalBBox.height > 0 ? partHeight / originalBBox.height : 1;
  return contour.map(p => ({
    x: (p.x - originalBBox.x) * scaleX,
    y: (p.y - originalBBox.y) * scaleY
  }));
}
