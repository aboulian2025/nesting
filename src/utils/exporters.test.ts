/**
 * @file exporters.test.ts
 * اختبارات وحدة تصدير ملفات Inkscape SVG النظيفة
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInkscapeSvg, cleanSnippetForInkscape } from './exporters.ts';
import { GrainDirection } from './nesting.ts';
import type { SheetStats } from './nesting.ts';

test('cleanSnippetForInkscape: strips outer svg wrappers and defs', () => {
  const rawSnippet = '<svg viewBox="0 0 100 100"><defs><style>.a{fill:none}</style></defs><path d="M 0 0 L 100 100" stroke="#FF0000"/></svg>';
  const cleaned = cleanSnippetForInkscape(rawSnippet);

  assert.ok(!cleaned.includes('<svg'));
  assert.ok(!cleaned.includes('</svg>'));
  assert.ok(!cleaned.includes('<style'));
  assert.ok(!cleaned.includes('<defs'));
  assert.ok(cleaned.includes('<path'));
});

test('generateInkscapeSvg: generates valid Inkscape SVG with proper layers and no nested svg', () => {
  const dummySheet: SheetStats = {
    sheetIndex: 1,
    sheetWidth: 2440,
    sheetHeight: 1220,
    sheetMargin: 15,
    partGap: 4,
    placedParts: [
      {
        uniqueId: 'p1_0',
        id: 'p1',
        name: 'قائم كرسي',
        width: 500,
        height: 800,
        originalWidth: 500,
        originalHeight: 800,
        x: 20,
        y: 20,
        rotated: false,
        grain: GrainDirection.FREE,
        color: '#FF0000',
        svgSnippet: '<path d="M 50 50 L 450 50 L 450 750 Z" stroke="#FF0000" fill="none" />',
        originalBBox: { x: 50, y: 50, width: 400, height: 700 }
      },
      {
        uniqueId: 'p2_0',
        id: 'p2',
        name: 'قاطع أفقي',
        width: 300,
        height: 150,
        originalWidth: 300,
        originalHeight: 150,
        x: 600,
        y: 50,
        rotated: true, // مدورة 90 درجة
        grain: GrainDirection.FREE,
        color: '#FF0000',
        svgSnippet: '<rect x="0" y="0" width="300" height="150" stroke="#FF0000" fill="none" />',
        originalBBox: { x: 0, y: 0, width: 300, height: 150 }
      }
    ],
    usedArea: 500 * 800 + 300 * 150,
    totalArea: 2440 * 1220,
    wasteArea: 2440 * 1220 - (500 * 800 + 300 * 150),
    usableArea: (2440 - 30) * (1220 - 30),
    wastePercent: 84.5,
    estimatedCutLengthMeters: 5.2,
    utilizationPercent: 15.5,
    placedCount: 2
  };

  const svg = generateInkscapeSvg(dummySheet);

  // 1. فحص وسوم ومساحات أسماء Inkscape
  assert.ok(svg.includes('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"'));
  assert.ok(svg.includes('xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"'));
  assert.ok(svg.includes('sodipodi:namedview'));
  assert.ok(svg.includes('units="mm"'));

  // 2. التحقق من حذف طبقة إطار اللوح (Sheet Border) نهائياً ووجود طبقة مسارات القص فقط
  assert.ok(!svg.includes('layer_sheet_border'));
  assert.ok(!svg.includes('rect_sheet_boundary'));
  assert.ok(svg.includes('inkscape:label="مسارات القص (Cut Paths - #FF0000)"'));

  // 3. التحقق المطلق من عدم وجود وسوم svg متداخلة
  // التي تسبب مسارات عشوائية أو مخفية خارج صفحة العمل في Inkscape
  assert.ok(!svg.includes('<svg x='));
  assert.ok(!svg.includes('<svg width='));

  // 4. التحقق من عدم وجود نقوش خشب أو نصوص تغطي المخطط
  assert.ok(!svg.includes('woodPattern'));

  // 5. التحقق من تحويل التدوير والـ offset
  assert.ok(svg.includes('translate(-50, -50)'));
  assert.ok(svg.includes('rotate(90)'));
});
