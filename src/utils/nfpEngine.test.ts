import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pt } from './nfpTypes.ts';
import {
  buildNfpRequest,
  computeNfpRotations,
  isAxisAlignedRect,
  rawResultToNestingResult,
} from './nfpEngine.ts';
import type { NfpCoreResult } from './nfpTypes.ts';
import type { PartInput, SheetConfig } from './nesting.ts';

const RECT: Pt[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
];

const L_SHAPE: Pt[] = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 30 },
  { x: 0, y: 30 },
];

const TRIANGLE: Pt[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 0, y: 30 },
];

const ROTATED_RECT: Pt[] = [
  { x: 0, y: 0 },
  { x: 28.28, y: 28.28 },
  { x: 0, y: 56.57 },
  { x: -28.28, y: 28.28 },
];

test('isAxisAlignedRect: detects axis rects only', () => {
  assert.equal(isAxisAlignedRect(RECT), true);
  assert.equal(isAxisAlignedRect([...RECT].reverse()), true);
  assert.equal(isAxisAlignedRect(L_SHAPE), false);
  assert.equal(isAxisAlignedRect(TRIANGLE), false);
  assert.equal(isAxisAlignedRect(ROTATED_RECT), false);
  assert.equal(isAxisAlignedRect(RECT.slice(0, 3)), false);
});

test('computeNfpRotations: override wins', () => {
  assert.deepEqual(
    computeNfpRotations({ width: 10, height: 20, overrideRotated: true }, false),
    [90],
  );
  assert.deepEqual(
    computeNfpRotations({ width: 10, height: 20, overrideRotated: false }, true),
    [0],
  );
});

test('computeNfpRotations: WIDTH/HEIGHT grain rules match rect engine', () => {
  assert.deepEqual(computeNfpRotations({ width: 10, height: 20, grain: 'width' }, false), [0]);
  assert.deepEqual(computeNfpRotations({ width: 20, height: 10, grain: 'height' }, false), [90]);
  assert.deepEqual(computeNfpRotations({ width: 20, height: 20, grain: 'height' }, false), [0]);
});

test('computeNfpRotations: FREE rect collapses to [0,90]', () => {
  assert.deepEqual(computeNfpRotations({ width: 10, height: 20, grain: 'free' }, true), [0, 90]);
  assert.deepEqual(computeNfpRotations({ width: 10, height: 20, grain: 'free' }, true, 32), [0, 90]);
});

test('computeNfpRotations: FREE irregular gets fine angles', () => {
  const rots = computeNfpRotations({ width: 30, height: 30, grain: 'free' }, false, 16);
  assert.equal(rots.length, 16);
  assert.ok(Math.abs(rots[1] - 22.5) < 1e-9, `step=${rots[1]}`);
  assert.ok(rots.includes(90));
  assert.ok(rots.includes(0));
  assert.ok(rots.every((r) => r >= 0 && r < 360));
  assert.equal(new Set(rots).size, 16);

  const coarse = computeNfpRotations({ width: 30, height: 30, grain: 'free' }, false, 6);
  assert.equal(coarse.length, 6);
  assert.ok(Math.abs(coarse[1] - 60) < 1e-9);
});

test('computeNfpRotations: vertex cap for heavy contours', () => {
  // >128 vertices → at most 4 angles
  const heavy = computeNfpRotations({ width: 300, height: 400, grain: 'free' }, false, 32, 200);
  assert.equal(heavy.length, 4);
  assert.deepEqual(heavy, [0, 90, 180, 270]);
  // >48 vertices → at most 8 angles
  const medium = computeNfpRotations({ width: 300, height: 400, grain: 'free' }, false, 32, 60);
  assert.equal(medium.length, 8);
  assert.ok(Math.abs(medium[1] - 45) < 1e-9);
  // small contours keep the requested fine count
  const light = computeNfpRotations({ width: 300, height: 400, grain: 'free' }, false, 16, 8);
  assert.equal(light.length, 16);
  // no vertex info → unchanged behaviour
  const plain = computeNfpRotations({ width: 300, height: 400, grain: 'free' }, false, 16);
  assert.equal(plain.length, 16);
});

test('buildNfpRequest: rect part without snippet', () => {
  const parts: PartInput[] = [
    { id: 'p1', name: 'P1', width: 100, height: 50, count: 2, grain: 'width' },
  ];
  const req = buildNfpRequest(parts, sheetCfg(), 1, undefined, { budgetMs: 1234, maxRestarts: 7 });
  assert.equal(req.parts.length, 2);
  assert.equal(req.budgetMs, 1234);
  assert.equal(req.maxRestarts, 7);
  assert.equal(req.sheet.sheetWidth, 2400);
  const p = req.parts[0];
  assert.deepEqual(p.contour, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ]);
  assert.deepEqual(p.rotations, [0]);
  assert.equal(req.parts[0].shapeId, req.parts[1].shapeId, 'instances share shapeId');
});

test('buildNfpRequest: snippet contour mapped to mm via originalBBox', () => {
  const parts: PartInput[] = [
    {
      id: 's1',
      name: 'S1',
      width: 200,
      height: 100,
      count: 1,
      grain: 'free',
      svgSnippet: '<path d="M0 0 L100 0 L100 50 L0 50 Z"/>',
      originalBBox: { x: 0, y: 0, width: 100, height: 50 },
    },
  ];
  const req = buildNfpRequest(parts, sheetCfg());
  const p = req.parts[0];
  // scaled ×2 (200/100 = 100/50) → mm contour
  assert.ok(Math.abs(p.contour[1].x - 200) < 1e-6, `x=${p.contour[1].x}`);
  assert.ok(Math.abs(p.contour[1].y - 0) < 1e-6);
  assert.ok(Math.abs(p.contour[2].x - 200) < 1e-6);
  assert.ok(Math.abs(p.contour[2].y - 100) < 1e-6);
  assert.deepEqual(p.rotations, [0, 90], 'axis rect collapses rotations');
});

test('buildNfpRequest: custom dims produce distinct shapeId', () => {
  const parts: PartInput[] = [
    { id: 'p1', name: 'P1', width: 100, height: 50, count: 2, grain: 'free' },
  ];
  const overrides = { p1_2: { customWidth: 80 } };
  const req = buildNfpRequest(parts, sheetCfg(), 1, overrides);
  assert.notEqual(req.parts[0].shapeId, req.parts[1].shapeId);
  assert.equal(req.parts[0].width, 100);
  assert.equal(req.parts[1].width, 80);
});

function sheetCfg(): SheetConfig {
  return {
    sheetWidth: 2400,
    sheetHeight: 1200,
    sheetMargin: 15,
    partGap: 4,
    pricePerSheet: 100,
  };
}

test('rawResultToNestingResult: summary + stats + PlacedPart mapping', () => {
  const parts: PartInput[] = [
    { id: 'a', name: 'A', width: 100, height: 50, count: 2, grain: 'free' },
    { id: 'b', name: 'B', width: 60, height: 40, count: 1, grain: 'width' },
  ];

  const raw: NfpCoreResult = {
    sheets: [
      {
        placements: [
          {
            uniqueId: 'a_1',
            sheetIndex: 0,
            x: 15,
            y: 15,
            width: 50,
            height: 100,
            rotationDeg: 90,
            tx: 15,
            ty: 15,
            contour: [
              { x: 15, y: 15 },
              { x: 15, y: 115 },
              { x: 65, y: 115 },
              { x: 65, y: 15 },
            ],
            area: 5000,
            perimeter: 300,
          },
          {
            uniqueId: 'b_1',
            sheetIndex: 0,
            x: 70,
            y: 15,
            width: 60,
            height: 40,
            rotationDeg: 0,
            tx: 70,
            ty: 15,
            contour: [
              { x: 70, y: 15 },
              { x: 130, y: 15 },
              { x: 130, y: 55 },
              { x: 70, y: 55 },
            ],
            area: 2400,
            perimeter: 200,
          },
        ],
      },
    ],
    unplacedUniqueIds: ['a_2'],
    score: 123,
    restartsRun: 2,
    elapsedMs: 45,
  };

  const result = rawResultToNestingResult(raw, parts, sheetCfg());

  assert.equal(result.summary.sheetsUsed, 1);
  assert.equal(result.summary.totalPartsProvided, 3);
  assert.equal(result.summary.totalPartsPlaced, 2);
  assert.equal(result.summary.unplacedCount, 1);
  assert.deepEqual(
    result.unplacedParts.map((p) => (p as PartInput & { uniqueId?: string }).uniqueId ?? p.id),
    ['a_2'],
  );

  const sheet = result.sheets[0];
  assert.equal(sheet.sheetIndex, 1, 'sheetIndex is 1-based like the rect engine');
  assert.equal(sheet.placedCount, 2);
  // used area = AABB footprints: 50×100 + 60×40 = 5000 + 2400 = 7400
  assert.equal(sheet.usedArea, 7400);
  assert.equal(sheet.totalArea, 2400 * 1200);
  // usable area = (2400−30)×(1200−30)
  assert.equal(sheet.usableArea, 2370 * 1170);
  // cut = (300 + 200) × 0.65 / 1000 = 0.325 → toFixed(2) → 0.33
  assert.ok(
    Math.abs(sheet.estimatedCutLengthMeters - 0.33) < 1e-9,
    `cut=${sheet.estimatedCutLengthMeters}`,
  );

  const p1 = sheet.placedParts[0];
  assert.equal(p1.uniqueId, 'a_1');
  assert.equal(p1.originalWidth, 100, 'original keeps unrotated dims');
  assert.equal(p1.originalHeight, 50);
  assert.equal(p1.width, 50, 'footprint swapped at 90°');
  assert.equal(p1.height, 100);
  assert.equal(p1.rotated, true);
  assert.equal(p1.rotationDeg, 90);
  assert.equal(p1.contour?.length, 4);
  assert.equal(p1.grain, 'free');

  const p2 = sheet.placedParts[1];
  assert.equal(p2.rotated, false);
  assert.equal(p2.rotationDeg, 0);

  // material cost = 1 sheet × 100
  assert.equal(result.summary.totalMaterialCost, 100);
  // overall utilization = 7400 / (2400×1200) × 100
  const expectedUtil = ((7400 / (2400 * 1200)) * 100).toFixed(2);
  assert.equal(String(result.summary.overallUtilizationPercent), expectedUtil);
});

test('rawResultToNestingResult: empty result → zero summary', () => {
  const parts: PartInput[] = [
    { id: 'a', name: 'A', width: 100, height: 50, count: 1, grain: 'free' },
  ];
  const raw: NfpCoreResult = {
    sheets: [],
    unplacedUniqueIds: ['a_1'],
    score: 1,
    restartsRun: 1,
    elapsedMs: 1,
  };
  const result = rawResultToNestingResult(raw, parts, sheetCfg());
  assert.equal(result.summary.sheetsUsed, 0);
  assert.equal(result.summary.unplacedCount, 1);
  assert.equal(result.summary.overallUtilizationPercent, 0);
  assert.equal(result.unplacedParts.length, 1);
});
