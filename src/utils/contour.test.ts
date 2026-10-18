/**
 * اختبارات وحدة لمستخرج الكنتور contour.ts
 * تشغّل: node --experimental-strip-types --test src/utils/contour.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signedArea,
  perimeter,
  contourBounds,
  pointInContour,
  convexHull,
  dedupePoints,
  pathDToLoops,
  snippetToLoops,
  snippetToContour,
  chooseOuterContour,
  rectContour,
  contourToMm
} from './contour.ts';
import type { ContourPoint } from './contour.ts';

test('rectContour: 4 نقاط ومساحة صحيحة', () => {
  const r = rectContour(100, 50);
  assert.equal(r.length, 4);
  assert.equal(Math.abs(signedArea(r)), 100 * 50);
  const b = contourBounds(r);
  assert.deepEqual(b, { x: 0, y: 0, width: 100, height: 50 });
});

test('contourBounds وperimeter', () => {
  const pts: ContourPoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 }
  ];
  assert.equal(perimeter(pts), 30);
  assert.equal(contourBounds(pts).width, 10);
});

test('pathDToLoops: مسار مثلث مغلق بسيط', () => {
  const loops = pathDToLoops('M0 0 L100 0 L100 50 Z');
  assert.equal(loops.length, 1);
  assert.equal(loops[0].length, 3);
  assert.equal(Math.abs(signedArea(loops[0])), 2500);
});

test('pathDToLoops: إسناد نسبي (lowercase) وأمر متكرر ضمني', () => {
  const loops = pathDToLoops('m10 10 l20 0 0 20 -20 0 z');
  assert.equal(loops.length, 1);
  const b = contourBounds(loops[0]);
  assert.equal(b.x, 10);
  assert.equal(b.y, 10);
  assert.equal(b.width, 20);
  assert.equal(b.height, 20);
});

test('pathDToLoops: مسار تكعيبي C ينتج أكثر من 4 نقاط ضمن الحدود', () => {
  const loops = pathDToLoops('M0 0 C 50 0 50 100 100 100 L100 0 Z');
  assert.equal(loops.length, 1);
  assert.ok(loops[0].length > 6, 'عدد نقاط المنحنى يجب أن يكون > 6');
  const b = contourBounds(loops[0]);
  assert.ok(b.width <= 100.001 && b.height <= 100.001);
  assert.ok(b.width >= 99);
});

test('pathDToLoops: مسار قوس A ينتج منحنى دائري ضمن حدود الدائرة', () => {
  // نصف دائرة من (0,0) إلى (100,0) بنصف قطر 50
  const loops = pathDToLoops('M0 0 A 50 50 0 0 1 100 0 Z');
  assert.equal(loops.length, 1);
  const b = contourBounds(loops[0]);
  assert.ok(b.height > 45, `ارتفاع النصف دائرة ≈ 50، حصلنا ${b.height}`);
  assert.ok(b.width <= 100.001);
});

test('pathDToLoops: خطوط H/V', () => {
  const loops = pathDToLoops('M0 0 H100 V50 H0 Z');
  assert.equal(loops.length, 1);
  assert.equal(Math.abs(signedArea(loops[0])), 5000);
});

test('pathDToLoops: مسارين متعددَي الحلقات (M ... Z M ... Z)', () => {
  const loops = pathDToLoops('M0 0 L10 0 L10 10 Z M20 20 L30 20 L30 30 Z');
  assert.equal(loops.length, 2);
});

test('snippetToLoops: مقتطف path واحد', () => {
  const snippet = '<path d="M0 0 L200 0 L200 100 Z" fill="none" stroke="#FF0000"/>';
  const loops = snippetToLoops(snippet);
  assert.equal(loops.length, 1);
  assert.equal(Math.abs(signedArea(loops[0])), 10000);
});

test('snippetToContour: شكلان متفرقان (rect + circle) → hull يحيط بالاثنين', () => {
  const snippet =
    '<g><rect x="0" y="0" width="10" height="10" fill="none"/>' +
    '<circle cx="100" cy="50" r="40" fill="none"/></g>';
  const contour = snippetToContour(snippet);
  // متفرقان => محدب لاحق يمتد من 0 إلى 140 (حافة الدائرة اليمنى)
  const b = contourBounds(contour);
  assert.equal(b.x, 0);
  assert.equal(b.y, 0);
  assert.ok(Math.abs(b.width - 140) < 1, `العرض ≈ 140، حصلنا ${b.width}`);
  assert.ok(Math.abs(b.height - 90) < 1, `الارتفاع ≈ 90، حصلنا ${b.height}`);
});

test('snippetToContour: ثقب داخلي داخل شكل واحد → يُتجاهل ويأخذ الخارجي فقط', () => {
  const snippet =
    '<path d="M0 0 L100 0 L100 100 L0 100 Z"/>' +
    '<path d="M40 40 L60 40 L60 60 L40 60 Z"/>';
  const contour = snippetToContour(snippet);
  assert.equal(Math.abs(signedArea(contour)), 10000);
});

test('chooseOuterContour: ثقب داخلي (hole) يُتجاهل — يأخذ الخارجي فقط', () => {
  const outer: ContourPoint[] = rectContour(100, 100);
  const inner: ContourPoint[] = [
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 60 },
    { x: 40, y: 60 }
  ];
  const chosen = chooseOuterContour([outer, inner]);
  assert.equal(chosen.length, 4);
  assert.equal(Math.abs(signedArea(chosen)), 10000);
});

test('chooseOuterContour: شكلان متفرقان → محدب لاحق يحيط بهما معاً', () => {
  const a: ContourPoint[] = rectContour(50, 50);
  const b: ContourPoint[] = [
    { x: 100, y: 100 },
    { x: 150, y: 100 },
    { x: 150, y: 150 },
    { x: 100, y: 150 }
  ];
  const chosen = chooseOuterContour([a, b]);
  const cb = contourBounds(chosen);
  assert.equal(cb.x, 0);
  assert.equal(cb.y, 0);
  assert.equal(cb.width, 150);
  assert.equal(cb.height, 150);
});

test('pointInContour: داخل/خارج', () => {
  const r = rectContour(100, 100);
  assert.equal(pointInContour({ x: 50, y: 50 }, r), true);
  assert.equal(pointInContour({ x: 150, y: 50 }, r), false);
});

test('convexHull: نقاط مبعثرة → المحدب يحتوي كل النقاط وبمساحة أقل من bbox أحياناً', () => {
  const pts: ContourPoint[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 50, y: 50 } // نقطة داخلية
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  for (const p of pts) assert.equal(pointInContour(p, hull) || hull.some(h => h.x === p.x && h.y === p.y), true);
});

test('dedupePoints: إزالة المكررات ونقطة الإغلاق', () => {
  const pts: ContourPoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 0 }
  ];
  const clean = dedupePoints(pts);
  assert.equal(clean.length, 3);
});

test('contourToMm: تحويل وحدات SVG إلى مم حسب originalBBox والمقياس', () => {
  const contour: ContourPoint[] = [
    { x: 10, y: 20 },
    { x: 110, y: 20 },
    { x: 110, y: 70 }
  ];
  const bbox = { x: 10, y: 20, width: 100, height: 50 };
  const mm = contourToMm(contour, bbox, 200, 100); // مقياس ×2
  assert.deepEqual(mm[0], { x: 0, y: 0 });
  assert.deepEqual(mm[1], { x: 200, y: 0 });
  assert.deepEqual(mm[2], { x: 200, y: 100 });
});

test('pathDToLoops: مسار مفتوح (polyline بدون Z) يبقى صالحاً كحلقة', () => {
  const loops = pathDToLoops('M0 0 L10 0 L10 10');
  assert.equal(loops.length, 1);
  assert.equal(loops[0].length, 3);
});

test('snippetToLoops: مقتطف rect بزوايا دائرية rx/ry', () => {
  const snippet = '<rect x="0" y="0" width="100" height="50" rx="10" ry="10"/>';
  const loops = snippetToLoops(snippet);
  assert.equal(loops.length, 1);
  assert.ok(loops[0].length >= 20, 'الزوايا الدائرية تنتج نقاطاً إضافية');
  const b = contourBounds(loops[0]);
  assert.ok(Math.abs(b.width - 100) < 1 && Math.abs(b.height - 50) < 1);
});

test('snippetToLoops applies nested group and shape transforms in SVG order', () => {
  const loops = snippetToLoops('<g transform="translate(10 20)"><g transform="scale(2 3)"><rect width="10" height="5" transform="translate(1 2)"/></g></g>');
  assert.deepEqual(contourBounds(loops[0]), { x: 12, y: 26, width: 20, height: 15 });
});

test('snippetToLoops restores sibling transforms and handles rotate-about-center', () => {
  const loops = snippetToLoops('<g transform="translate(10 0)"><rect width="10" height="5"/></g><rect width="10" height="5" transform="rotate(90 5 5)"/>');
  assert.deepEqual(contourBounds(loops[0]), { x: 10, y: 0, width: 10, height: 5 });
  const b = contourBounds(loops[1]);
  assert.ok(Math.abs(b.x - 5) < 1e-8);
  assert.ok(Math.abs(b.y) < 1e-8);
  assert.ok(Math.abs(b.width - 5) < 1e-8);
  assert.ok(Math.abs(b.height - 10) < 1e-8);
});

test('an open stroke protruding from a closed outline stays in the collision envelope', () => {
  const snippet = '<rect width="20" height="20"/><path d="M10 10 L90 10"/><line x1="5" y1="5" x2="5" y2="80"/>';
  const loops = snippetToLoops(snippet);
  assert.equal(loops.length, 3);
  assert.deepEqual(contourBounds(snippetToContour(snippet)), { x: 0, y: 0, width: 90, height: 80 });
});

test('a crossing secondary loop is not mistaken for an internal hole', () => {
  const envelope = snippetToContour('<rect width="20" height="20"/><polygon points="10,10 50,10 50,30 10,30"/>');
  assert.deepEqual(contourBounds(envelope), { x: 0, y: 0, width: 50, height: 30 });
});
