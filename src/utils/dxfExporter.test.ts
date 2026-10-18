/**
 * @file dxfExporter.test.ts
 * اختبارات وحدة تصدير ملفات AutoCAD DXF لماكينات الـ CNC
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSheetDxf, generateAllSheetsDxf, encodeDxfText } from './dxfExporter.ts';
import { GrainDirection } from './nesting.ts';
import type { SheetStats } from './nesting.ts';

test('encodeDxfText: safely encodes ASCII and converts Unicode/Arabic to \\U+XXXX', () => {
  assert.equal(encodeDxfText('Part_1'), 'Part_1');
  const encodedArabic = encodeDxfText('باب دولاب');
  // يجب ألا يحتوي على أحرف خارج نطاق الـ 7-bit ASCII لمنع انهيار برامج CAM
  assert.ok(/^[\\a-zA-Z0-9_+ ]+$/.test(encodedArabic));
  assert.ok(encodedArabic.includes('\\U+0628')); // حرف الباء
});

test('generateSheetDxf: generates fully compliant, non-empty AutoCAD DXF with BLOCKS, VPORT, EXTMIN/MAX, CRLF', () => {
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
        name: 'قطعة مستطيلة',
        width: 600,
        height: 400,
        originalWidth: 600,
        originalHeight: 400,
        x: 20,
        y: 20,
        rotated: false,
        grain: GrainDirection.FREE,
        color: '#FF0000'
      },
      {
        uniqueId: 'p2_0',
        id: 'p2',
        name: 'قطعة بزخرفة وثقوب',
        width: 300,
        height: 500,
        originalWidth: 300,
        originalHeight: 500,
        x: 700,
        y: 50,
        rotated: true, // مدورة 90 درجة
        grain: GrainDirection.FREE,
        color: '#FF0000',
        svgSnippet: `
          <rect x="0" y="0" width="300" height="500" rx="10" stroke="#FF0000" fill="none" />
          <circle cx="150" cy="250" r="40" stroke="#FF0000" fill="none" />
          <path d="M 50 50 L 250 50 L 150 200 Z" stroke="#FF0000" fill="none" />
          <line x1="50" y1="300" x2="250" y2="300" stroke="#FF0000" />
        `,
        originalBBox: { x: 0, y: 0, width: 300, height: 500 }
      }
    ],
    usedArea: 600 * 400 + 300 * 500,
    totalArea: 2440 * 1220,
    wasteArea: 2440 * 1220 - (600 * 400 + 300 * 500),
    usableArea: (2440 - 30) * (1220 - 30),
    wastePercent: 86.9,
    estimatedCutLengthMeters: 6.5,
    utilizationPercent: 13.1,
    placedCount: 2
  };

  const dxf = generateSheetDxf(dummySheet);

  // 1. فحص فواصل الأسطر DOS/Windows القياسية CRLF \r\n
  assert.ok(dxf.includes('\r\n'));
  assert.ok(!dxf.includes('\n\n'));

  // 2. فحص ترويسة أوتوكاد ووحدات القياس والحدود
  assert.ok(dxf.includes('$ACADVER\r\n1\r\nAC1009'));
  assert.ok(dxf.includes('$MEASUREMENT\r\n70\r\n1')); // متري
  assert.ok(dxf.includes('$INSUNITS\r\n70\r\n4')); // مليمتر
  assert.ok(dxf.includes('$EXTMAX\r\n10\r\n2440.000\r\n20\r\n1220.000')); // حدود اللوح

  // 3. فحص جدول الطبقات: مطابق لـ SVG (طبقة مسارات القص فقط CUT_PATHS دون أي إطار لوح أو هوامش)
  assert.ok(dxf.includes('TABLE\r\n2\r\nVPORT'));
  assert.ok(dxf.includes('VPORT\r\n2\r\n*ACTIVE')); // منفذ الرؤية الفعال
  assert.ok(dxf.includes('LAYER\r\n70\r\n2')); // طبقتان فقط (0 و CUT_PATHS)
  assert.ok(dxf.includes('LAYER\r\n2\r\nCUT_PATHS'));
  assert.ok(!dxf.includes('SHEET_BORDER')); // تم حذف إطار اللوح كلياً مثل SVG
  assert.ok(!dxf.includes('MARGIN_GUIDE')); // تم حذف الهامش كلياً مثل SVG
  assert.ok(!dxf.includes('TEXT_INFO')); // تم حذف النصوص كلياً مثل SVG

  // 4. فحص وجود قسم القوالب BLOCKS الإلزامي قبل ENTITIES
  const blocksIdx = dxf.indexOf('SECTION\r\n2\r\nBLOCKS');
  const entitiesIdx = dxf.indexOf('SECTION\r\n2\r\nENTITIES');
  assert.ok(blocksIdx > 0, 'BLOCKS section must exist');
  assert.ok(entitiesIdx > blocksIdx, 'ENTITIES section must come after BLOCKS section');

  // 5. فحص وجود مسارات القص الصريحة CUT_PATHS فقط دون أي إضافات
  assert.ok(dxf.includes('LINE\r\n8\r\nCUT_PATHS'));
  assert.ok(dxf.includes('CIRCLE\r\n8\r\nCUT_PATHS'));
  assert.ok(!dxf.includes('SHEET_BORDER'));
  assert.ok(!dxf.includes('MARGIN_GUIDE'));
  assert.ok(!dxf.includes('0\r\nTEXT'));

  // 6. فحص نهاية الملف EOF
  assert.ok(dxf.endsWith('0\r\nENDSEC\r\n0\r\nEOF'));
});

test('generateAllSheetsDxf: generates multi-sheet layout with only CUT_PATHS and no border additions', () => {
  const sheet1: SheetStats = {
    sheetIndex: 1,
    sheetWidth: 2440,
    sheetHeight: 1220,
    sheetMargin: 10,
    partGap: 4,
    placedParts: [
      {
        uniqueId: 'p1_0',
        id: 'p1',
        name: 'قاطع',
        width: 400,
        height: 200,
        originalWidth: 400,
        originalHeight: 200,
        x: 10,
        y: 10,
        rotated: false,
        grain: GrainDirection.FREE,
        color: '#FF0000'
      }
    ],
    usedArea: 400 * 200,
    totalArea: 2440 * 1220,
    wasteArea: 2440 * 1220 - 400 * 200,
    usableArea: 2420 * 1200,
    wastePercent: 97.3,
    estimatedCutLengthMeters: 1.2,
    utilizationPercent: 2.7,
    placedCount: 1
  };

  const sheet2: SheetStats = {
    ...sheet1,
    sheetIndex: 2
  };

  const multiDxf = generateAllSheetsDxf([sheet1, sheet2], 200);
  assert.ok(!multiDxf.includes('SHEET_BORDER'));
  assert.ok(!multiDxf.includes('TEXT_INFO'));
  assert.ok(multiDxf.includes('LINE\r\n8\r\nCUT_PATHS'));
  // العرض الكلي للوحين مع المسافة: 2440 + 200 + 2440 = 5080
  assert.ok(multiDxf.includes('$EXTMAX\r\n10\r\n5080.000\r\n20\r\n1220.000'));
});

test('generateSheetDxf: NFP contour-only parts export as Y-flipped LINE segments', () => {
  const dummySheet: SheetStats = {
    sheetIndex: 1,
    sheetWidth: 1000,
    sheetHeight: 1220,
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
    totalArea: 1000 * 1220,
    wasteArea: 1000 * 1220 - 1600,
    usableArea: (1000 - 30) * (1220 - 30),
    wastePercent: 99.9,
    estimatedCutLengthMeters: 0.16,
    utilizationPercent: 0.1,
    placedCount: 1,
  };

  const dxf = generateSheetDxf(dummySheet);

  // 4 حواف = 4 خطوط LINE على طبقة CUT_PATHS
  const lineCount = dxf.split('LINE\r\n8\r\nCUT_PATHS').length - 1;
  assert.equal(lineCount, 4, `expected 4 contour LINE edges, got ${lineCount}`);

  // flip Y: y_dxf = sheetH - y → (20,1200) → (60,1200) → (60,1160) → (20,1160)
  assert.ok(dxf.includes('10\r\n20.000\r\n20\r\n1200.000\r\n30\r\n0.0\r\n11\r\n60.000\r\n21\r\n1200.000'));
  assert.ok(dxf.includes('10\r\n60.000\r\n20\r\n1160.000'));
});

test('generateSheetDxf: imported NFP parts export real paths including inner holes', () => {
  const dummySheet: SheetStats = {
    sheetIndex: 1,
    sheetWidth: 1000,
    sheetHeight: 1220,
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
        rotationDeg: 0,
        worldTx: 20,
        worldTy: 20,
      },
    ],
    usedArea: 10000,
    totalArea: 1000 * 1220,
    wasteArea: 1000 * 1220 - 10000,
    usableArea: (1000 - 30) * (1220 - 30),
    wastePercent: 99.2,
    estimatedCutLengthMeters: 0.4,
    utilizationPercent: 0.8,
    placedCount: 1,
  };

  const dxf = generateSheetDxf(dummySheet);

  // outer square (4) + inner hole (4) = 8 LINE edges
  const lineCount = dxf.split('LINE\r\n8\r\nCUT_PATHS').length - 1;
  assert.equal(lineCount, 8, `expected 8 LINE edges (outer + hole), got ${lineCount}`);
  // inner hole corner at local (30,30) → sheet (50,50) → dxf (50, 1170)
  assert.ok(dxf.includes('10\r\n50.000\r\n20\r\n1170.000'), 'inner hole points must be exported');
});
