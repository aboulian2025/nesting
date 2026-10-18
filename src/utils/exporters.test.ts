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

test('generateInkscapeSvg: NFP contour-only parts render as <polygon> in sheet coords', () => {
  const dummySheet: SheetStats = {
    sheetIndex: 1,
    sheetWidth: 1000,
    sheetHeight: 800,
    sheetMargin: 15,
    partGap: 4,
    placedParts: [
      {
        uniqueId: 'nfp_0',
        id: 'nfp1',
        name: 'قطعة NFP',
        width: 40,
        height: 40,
        originalWidth: 40,
        originalHeight: 40,
        x: 20,
        y: 20,
        rotated: false,
        grain: GrainDirection.FREE,
        color: '#FF0000',
        contour: [
          { x: 20, y: 20 },
          { x: 60, y: 20 },
          { x: 60, y: 60 },
          { x: 20, y: 60 },
        ],
        rotationDeg: 0,
        worldTx: 20,
        worldTy: 20,
      },
    ],
    usedArea: 1600,
    totalArea: 1000 * 800,
    wasteArea: 1000 * 800 - 1600,
    usableArea: (1000 - 30) * (800 - 30),
    wastePercent: 99.8,
    estimatedCutLengthMeters: 0.16,
    utilizationPercent: 0.2,
    placedCount: 1,
  };

  const svg = generateInkscapeSvg(dummySheet);

  assert.ok(svg.includes('<polygon'), 'contour part must render as <polygon>');
  assert.ok(
    svg.includes('points="20.000,20.000 60.000,20.000 60.000,60.000 20.000,60.000"'),
    `polygon points must be sheet coords`,
  );
});

test('generateInkscapeSvg: imported NFP parts keep their real paths (holes included) via general transform', () => {
  const dummySheet: SheetStats = {
    sheetIndex: 1,
    sheetWidth: 1000,
    sheetHeight: 800,
    sheetMargin: 15,
    partGap: 4,
    placedParts: [
      {
        uniqueId: 'nfp_1',
        id: 'nfp2',
        name: 'شكل مثقوب',
        width: 100,
        height: 100,
        originalWidth: 100,
        originalHeight: 100,
        x: 20,
        y: 20,
        rotated: false,
        grain: GrainDirection.FREE,
        color: '#FF0000',
        svgSnippet:
          '<path d="M 0 0 L 100 0 L 100 100 L 0 100 Z M 30 30 L 30 70 L 70 70 L 70 30 Z" stroke="#FF0000" fill="none" />',
        originalBBox: { x: 0, y: 0, width: 100, height: 100 },
        contour: [
          { x: 20, y: 20 },
          { x: 120, y: 20 },
          { x: 120, y: 120 },
          { x: 20, y: 120 },
        ],
        rotationDeg: 30,
        worldTx: 20,
        worldTy: 20,
      },
    ],
    usedArea: 10000,
    totalArea: 1000 * 800,
    wasteArea: 1000 * 800 - 10000,
    usableArea: (1000 - 30) * (800 - 30),
    wastePercent: 98.7,
    estimatedCutLengthMeters: 0.4,
    utilizationPercent: 1.3,
    placedCount: 1,
  };

  const svg = generateInkscapeSvg(dummySheet);

  assert.ok(!svg.includes('<polygon'), 'imported NFP part must NOT collapse to a polygon');
  assert.ok(svg.includes('M 30 30'), 'inner hole subpath must be preserved');
  assert.ok(
    /translate\(20(?:\.0+)?, 20(?:\.0+)?\) rotate\(30\) translate\(0, 0\)/.test(svg),
    `general NFP transform missing, got: ${svg.match(/translate\([^"]*\)/)?.[0]}`,
  );
});
