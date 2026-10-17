/**
 * @file nesting.test.ts
 * اختبارات الوحدة لمحرك توزيع الألواح وقفل عروق الخشب
 * باستخدام node:test و node:assert/strict
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { nestSheets, GrainDirection, SheetBin, Rect } from './nesting.ts';

test('SheetBin: correctly initializes usable bounds with sheetMargin', () => {
  const bin = new SheetBin(1, {
    sheetWidth: 2440,
    sheetHeight: 1220,
    sheetMargin: 20,
    partGap: 4
  });

  assert.equal(bin.usableMinX, 20);
  assert.equal(bin.usableMinY, 20);
  assert.equal(bin.usableMaxX, 2420);
  assert.equal(bin.usableMaxY, 1200);
  assert.equal(bin.usableWidth, 2400);
  assert.equal(bin.usableHeight, 1180);
});

test('Wood Grain Lock: WIDTH (X) strictly disallows rotation', () => {
  const sheetConfig = {
    sheetWidth: 1000,
    sheetHeight: 500,
    sheetMargin: 10,
    partGap: 5
  };

  const parts = [
    {
      id: 'shelf_horizontal',
      name: 'رف أفقي',
      width: 400,
      height: 200,
      count: 1,
      grain: GrainDirection.WIDTH
    }
  ];

  const result = nestSheets(parts, sheetConfig);
  assert.equal(result.summary.sheetsUsed, 1);
  assert.equal(result.sheets[0].placedParts.length, 1);

  const placed = result.sheets[0].placedParts[0];
  assert.equal(placed.rotated, false, 'WIDTH grain lock must keep rotated === false');
  assert.equal(placed.width, 400);
  assert.equal(placed.height, 200);
});

test('Wood Grain Lock: HEIGHT (Y) forces 90-degree rotation', () => {
  const sheetConfig = {
    sheetWidth: 1000,
    sheetHeight: 800,
    sheetMargin: 10,
    partGap: 4
  };

  const parts = [
    {
      id: 'door_vertical',
      name: 'باب عمودي',
      width: 300,
      height: 600,
      count: 1,
      grain: GrainDirection.HEIGHT
    }
  ];

  const result = nestSheets(parts, sheetConfig);
  assert.equal(result.summary.sheetsUsed, 1);
  assert.equal(result.sheets[0].placedParts.length, 1);

  const placed = result.sheets[0].placedParts[0];
  assert.equal(placed.rotated, true, 'HEIGHT grain lock must rotate 90 degrees');
  assert.equal(placed.width, 600, 'Width becomes original height');
  assert.equal(placed.height, 300, 'Height becomes original width');
});

test('Wood Grain Lock: FREE allows rotation for best space efficiency', () => {
  // اللوح بارتفاع 300 وعرض 800
  // إذا كانت القطعة 500 عرض و 250 ارتفاع
  // بالوضع العادي 500x250 تتسع، ولكن لو القطعة 250 عرض و 500 ارتفاع:
  // لا تتسع إلا إذا دُوّرت إلى 500x250!
  const sheetConfig = {
    sheetWidth: 800,
    sheetHeight: 300,
    sheetMargin: 0,
    partGap: 0
  };

  const parts = [
    {
      id: 'tall_piece',
      name: 'قطعة حرة',
      width: 250,
      height: 500, // لن تتسع في ارتفاع 300 إلا بالتدوير
      count: 1,
      grain: GrainDirection.FREE
    }
  ];

  const result = nestSheets(parts, sheetConfig);
  assert.equal(result.summary.sheetsUsed, 1, 'FREE grain lock should rotate piece to fit');
  assert.equal(result.sheets[0].placedParts[0].rotated, true);
  assert.equal(result.sheets[0].placedParts[0].width, 500);
  assert.equal(result.sheets[0].placedParts[0].height, 250);
});

test('partGap and sheetMargin are strictly respected during placement', () => {
  const sheetConfig = {
    sheetWidth: 1000,
    sheetHeight: 1000,
    sheetMargin: 25,
    partGap: 10
  };

  const parts = [
    { id: 'p1', name: 'قطعة 1', width: 200, height: 200, count: 2, grain: GrainDirection.WIDTH }
  ];

  const result = nestSheets(parts, sheetConfig);
  const placed = result.sheets[0].placedParts;
  assert.equal(placed.length, 2);

  // التأكد من تطبيق الهامش على القطعة الأولى
  assert.ok(placed[0].x >= 25, 'x must be >= margin');
  assert.ok(placed[0].y >= 25, 'y must be >= margin');

  // التأكد من وجود فاصل بين القطعتين لا يقل عن partGap
  const p1 = placed[0];
  const p2 = placed[1];

  const xOverlap = Math.max(0, Math.min(p1.x + p1.width, p2.x + p2.width) - Math.max(p1.x, p2.x));
  const yOverlap = Math.max(0, Math.min(p1.y + p1.height, p2.y + p2.height) - Math.max(p1.y, p2.y));

  if (xOverlap > 0) {
    const yDist = Math.abs(p2.y - (p1.y + p1.height));
    assert.ok(yDist >= 10, `Y distance (${yDist}) must be >= partGap (10)`);
  } else if (yOverlap > 0) {
    const xDist = Math.abs(p2.x - (p1.x + p1.width));
    assert.ok(xDist >= 10, `X distance (${xDist}) must be >= partGap (10)`);
  }
});

test('Multi-sheet overflow: opens new sheets when area is exhausted', () => {
  const sheetConfig = {
    sheetWidth: 500,
    sheetHeight: 500,
    sheetMargin: 0,
    partGap: 0
  };

  // كل قطعة 400×400 (مساحة 160000)، مساحة اللوح 250000 -> قطعة واحدة فقط لكل لوح
  const parts = [
    { id: 'large_p', name: 'قطعة كبيرة', width: 400, height: 400, count: 3, grain: GrainDirection.FREE }
  ];

  const result = nestSheets(parts, sheetConfig);
  assert.equal(result.summary.sheetsUsed, 3, 'Must allocate 3 sheets for 3 large parts');
  assert.equal(result.summary.totalPartsPlaced, 3);
  assert.equal(result.summary.unplacedCount, 0);
});

test('Utilization calculation correctly reflects used vs total area', () => {
  const sheetConfig = {
    sheetWidth: 1000,
    sheetHeight: 1000,
    sheetMargin: 0,
    partGap: 0
  };

  const parts = [
    { id: 'half_sheet', name: 'نصف لوح', width: 1000, height: 500, count: 1, grain: GrainDirection.WIDTH }
  ];

  const result = nestSheets(parts, sheetConfig);
  assert.equal(result.sheets[0].utilizationPercent, 50);
  assert.equal(result.sheets[0].wastePercent, 50);
});

test('Sheet-First Maximal Packing: exhausts all spaces in Sheet 1 with smaller parts before opening Sheet 2', () => {
  const sheetConfig = {
    sheetWidth: 1000,
    sheetHeight: 1000,
    sheetMargin: 0,
    partGap: 0
  };

  // لوح 1000×1000:
  // قطعة رئيسية 800×1000 (مساحة 800000) يتبقى شريط 200×1000
  // قطعة أخرى كبيرة 500×500 لا تتسع في المتبقي من اللوح الأول (تحتاج لوح 2)
  // قطعتان صغيرتان 200×500 يجب أن تحشوا الشريط المتبقي في اللوح الأول بالكامل قبل الذهاب للوح الثاني!
  const parts = [
    { id: 'main_big', name: 'قطعة كبيرة 1', width: 800, height: 1000, count: 1, grain: GrainDirection.FREE },
    { id: 'overflow_big', name: 'قطعة كبيرة 2', width: 500, height: 500, count: 1, grain: GrainDirection.FREE },
    { id: 'small_filler', name: 'قطعة حشو صغيرة', width: 200, height: 500, count: 2, grain: GrainDirection.FREE }
  ];

  const result = nestSheets(parts, sheetConfig, 'optimal');
  assert.equal(result.summary.sheetsUsed, 2);

  // اللوح الأول يجب أن يستغل 100% من مساحته (القطعة الكبيرة 800×1000 + قطعتي الحشو 200×500)
  const sheet1 = result.sheets[0];
  assert.equal(sheet1.placedCount, 3, 'Sheet 1 must accommodate 3 parts including the fillers');
  assert.equal(sheet1.usedArea, 1000000, 'Sheet 1 must be 100% utilized');
  assert.equal(sheet1.utilizationPercent, 100);

  // اللوح الثاني يتبقى به فقط القطعة الكبيرة الفائضة
  const sheet2 = result.sheets[1];
  assert.equal(sheet2.placedCount, 1);
  assert.equal(sheet2.placedParts[0].id, 'overflow_big');
});
