/**
 * @file svgParser.test.ts
 * اختبارات الوحدة لحساب أبعاد مسارات الـ SVG الحقيقية
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computePathBoundingBox, convertUnitToMm } from './svgParser.ts';

test('convertUnitToMm: correctly converts physical and pixel units', () => {
  assert.equal(convertUnitToMm('100mm'), 100);
  assert.equal(convertUnitToMm('10cm'), 100);
  assert.equal(convertUnitToMm('1in'), 25.4);
  assert.equal(convertUnitToMm('1m'), 1000);
});

test('computePathBoundingBox: calculates exact bounding box of complex path', () => {
  // مسار مستطيل بأبعاد 500x300 يبدأ من (50, 100)
  const d = 'M 50 100 L 550 100 L 550 400 L 50 400 Z';
  const bbox = computePathBoundingBox(d);

  assert.equal(bbox.x, 50);
  assert.equal(bbox.y, 100);
  assert.equal(bbox.width, 500);
  assert.equal(bbox.height, 300);
});

test('computePathBoundingBox: handles relative commands (m, l, h, v)', () => {
  const d = 'm 10 20 l 100 0 v 50 h -100 z';
  const bbox = computePathBoundingBox(d);

  assert.equal(bbox.x, 10);
  assert.equal(bbox.y, 20);
  assert.equal(bbox.width, 100);
  assert.equal(bbox.height, 50);
});

test('isElementVisibleAndValid: identifies hidden, invisible, and spacer elements', async () => {
  const { isElementVisibleAndValid } = await import('./svgParser.ts');

  // 1. عنصر داخل defs
  const insideDefs = {
    tagName: 'path',
    closest: (s: string) => s.includes('defs') ? {} : null,
    getAttribute: () => null
  } as unknown as Element;
  assert.equal(isElementVisibleAndValid(insideDefs), false);

  // 2. عنصر بـ display: none
  const hiddenDisplay = {
    tagName: 'path',
    closest: () => null,
    getAttribute: (attr: string) => (attr === 'style' ? 'display: none' : null)
  } as unknown as Element;
  assert.equal(isElementVisibleAndValid(hiddenDisplay), false);

  // 3. عنصر بـ visibility: hidden
  const hiddenVisibility = {
    tagName: 'rect',
    closest: () => null,
    getAttribute: (attr: string) => (attr === 'visibility' ? 'hidden' : null)
  } as unknown as Element;
  assert.equal(isElementVisibleAndValid(hiddenVisibility), false);

  // 4. إطار وهمي بدون تعبئة وبدون حدود (fill: none && stroke: none)
  const spacerFrame = {
    tagName: 'rect',
    closest: () => null,
    getAttribute: (attr: string) => {
      if (attr === 'fill') return 'none';
      if (attr === 'stroke') return 'none';
      return null;
    }
  } as unknown as Element;
  assert.equal(isElementVisibleAndValid(spacerFrame), false);

  // 5. مسار حقيقي صالح للقص (له حدود أو تعبئة)
  const validPath = {
    tagName: 'path',
    closest: () => null,
    getAttribute: (attr: string) => {
      if (attr === 'd') return 'M 10 10 L 50 50 Z';
      if (attr === 'stroke') return '#000000';
      return null;
    }
  } as unknown as Element;
  assert.equal(isElementVisibleAndValid(validPath), true);
});

