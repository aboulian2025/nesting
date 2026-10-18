import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Pt } from './nfpTypes.ts';
import { collisionProxy, runGreedyNest, type NfpDeps } from './nfpCore.ts';
import type { NfpPartRequest, NfpRunRequest, NfpSheetRequest } from './nfpTypes.ts';

// Load SVGnest vendor scripts (classic-script globals) in the Node global scope,
// mirroring how nfpWorker.ts evaluates them inside the browser worker.
const g = globalThis as any;
if (!g.self) g.self = globalThis;
if (!g.GeometryUtil) {
  new Function(readFileSync(new URL('../../public/svgnest/geometryutil.js', import.meta.url), 'utf8'))();
  new Function(readFileSync(new URL('../../public/svgnest/clipper.js', import.meta.url), 'utf8'))();
}
const deps: NfpDeps = { GeometryUtil: g.GeometryUtil, ClipperLib: g.ClipperLib };
const C = g.ClipperLib;
const SCALE = 10000000;

function makeRectPart(
  uniqueId: string,
  width: number,
  height: number,
  rotations: number[],
): NfpPartRequest {
  const contour: Pt[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  return {
    uniqueId,
    shapeId: uniqueId,
    name: uniqueId,
    contour,
    width,
    height,
    rotations,
    grain: 'FREE',
  };
}

function makeLPart(uniqueId: string, rotations: number[]): NfpPartRequest {
  // 30x30 square minus 20x20 notch → area 500
  const contour: Pt[] = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 30 },
    { x: 0, y: 30 },
  ];
  return {
    uniqueId,
    shapeId: uniqueId,
    name: uniqueId,
    contour,
    width: 30,
    height: 30,
    rotations,
    grain: 'FREE',
  };
}

function sheet(partial: Partial<NfpSheetRequest> = {}): NfpSheetRequest {
  return {
    sheetWidth: 100,
    sheetHeight: 100,
    sheetMargin: 0,
    partGap: 0,
    ...partial,
  };
}

function run(
  parts: NfpPartRequest[],
  sh: NfpSheetRequest,
  overrides: Partial<NfpRunRequest> = {},
) {
  const req: NfpRunRequest = {
    parts,
    sheet: sh,
    budgetMs: 5000,
    maxRestarts: 2,
    ...overrides,
  };
  return runGreedyNest(deps, req);
}

function toClipperPath(pts: Pt[]) {
  return pts.map((p) => ({ X: p.x, Y: p.y }));
}

// Intersection area (mm²) of two polygons via Clipper.
function intersectionArea(a: Pt[], b: Pt[]): number {
  const ca = toClipperPath(a);
  const cb = toClipperPath(b);
  C.JS.ScaleUpPath(ca, SCALE);
  C.JS.ScaleUpPath(cb, SCALE);
  const clipper = new C.Clipper();
  const solution = new C.Paths();
  clipper.AddPath(ca, C.PolyType.ptSubject, true);
  clipper.AddPath(cb, C.PolyType.ptClip, true);
  clipper.Execute(C.ClipType.ctIntersection, solution, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  let area = 0;
  for (const path of solution) area += Math.abs(C.Clipper.Area(path));
  return area / (SCALE * SCALE);
}

// Offset polygon outward by delta (mm), round joins.
function offsetPoly(pts: Pt[], delta: number): Pt[] {
  const c = toClipperPath(pts);
  C.JS.ScaleUpPath(c, SCALE);
  const co = new C.ClipperOffset(2, 0.3 * SCALE);
  co.AddPath(c, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  assert.equal(out.length, 1, 'offset must yield a single path');
  return out[0].map((p: any) => ({ x: p.X / SCALE, y: p.Y / SCALE }));
}

function assertNoOverlap(contours: Pt[][]) {
  for (let i = 0; i < contours.length; i++) {
    for (let j = i + 1; j < contours.length; j++) {
      const area = intersectionArea(contours[i], contours[j]);
      assert.ok(area < 1e-4, `parts ${i}/${j} overlap by ${area} mm²`);
    }
  }
}

function assertInBounds(contours: Pt[][], sh: NfpSheetRequest) {
  const lo = sh.sheetMargin - 0.01;
  const hiX = sh.sheetWidth - sh.sheetMargin + 0.01;
  const hiY = sh.sheetHeight - sh.sheetMargin + 0.01;
  for (const pts of contours) {
    for (const p of pts) {
      assert.ok(p.x >= lo && p.x <= hiX, `x=${p.x} outside [${lo},${hiX}]`);
      assert.ok(p.y >= lo && p.y <= hiY, `y=${p.y} outside [${lo},${hiY}]`);
    }
  }
}

function allContours(result: ReturnType<typeof runGreedyNest>): Pt[][] {
  return result.sheets.flatMap((s) => s.placements.map((p) => p.contour));
}

test('vendor globals loaded', () => {
  assert.ok(deps.GeometryUtil, 'GeometryUtil missing');
  assert.ok(deps.ClipperLib, 'ClipperLib missing');
  assert.ok(Math.abs(Math.abs(deps.GeometryUtil.polygonArea([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 },
  ])) - 50) < 1e-9, 'polygonArea of 10x5 rect must be 50');
});

test('single rect placed at left edge, inside bin', () => {
  const sh = sheet();
  const res = run([makeRectPart('a', 40, 20, [0, 90, 180, 270])], sh);
  assert.equal(res.unplacedUniqueIds.length, 0);
  assert.equal(res.sheets.length, 1);
  const p = res.sheets[0].placements[0];
  assert.ok(p.x <= 0.5, `left edge expected, x=${p.x}`);
  assertInBounds(allContours(res), sh);
  assert.ok([0, 90, 180, 270].includes(p.rotationDeg));
});

test('two rects do not overlap and stay in bounds', () => {
  const sh = sheet();
  const res = run(
    [makeRectPart('a', 40, 30, [0, 90]), makeRectPart('b', 40, 30, [0, 90])],
    sh,
  );
  assert.equal(res.unplacedUniqueIds.length, 0);
  const contours = allContours(res);
  assert.equal(contours.length, 2);
  assertNoOverlap(contours);
  assertInBounds(contours, sh);
});

test('L-shapes nest without overlap', () => {
  const sh = sheet();
  const parts = ['l1', 'l2', 'l3'].map((id) => makeLPart(id, [0, 90, 180, 270]));
  const res = run(parts, sh);
  assert.equal(res.unplacedUniqueIds.length, 0, `unplaced: ${res.unplacedUniqueIds}`);
  const contours = allContours(res);
  assert.equal(contours.length, 3);
  assertNoOverlap(contours);
  assertInBounds(contours, sh);
});

test('heavy-vertex contour preserves clearance and stays inside the sheet', () => {
  const heavy: Pt[] = [];
  for (let i = 0; i < 24; i++) {
    const ang = (i * 2 * Math.PI) / 24;
    const r = i % 2 === 0 ? 20 : 18;
    heavy.push({ x: 20 + r * Math.cos(ang), y: 15 + r * 0.75 * Math.sin(ang) });
  }
  const make = (id: string): NfpPartRequest => ({
    uniqueId: id,
    shapeId: id,
    name: id,
    contour: heavy.map((p) => ({ ...p })),
    width: 40,
    height: 30,
    rotations: [0, 90, 180, 270],
    grain: 'FREE',
  });
  const sh = sheet({ partGap: 5 });
  const res = run([make('h1'), make('h2')], sh);
  assert.equal(res.unplacedUniqueIds.length, 0, `unplaced: ${res.unplacedUniqueIds}`);
  const contours = allContours(res);
  assert.equal(contours.length, 2);
  assertNoOverlap(contours);
  assertInBounds(contours, sh);
});

test('partGap is respected between parts without adding an edge margin', () => {
  const sh = sheet({ partGap: 5 });
  const res = run(
    [makeRectPart('a', 30, 20, [0]), makeRectPart('b', 30, 20, [0]), makeRectPart('c', 30, 20, [0])],
    sh,
  );
  assert.equal(res.unplacedUniqueIds.length, 0);
  const contours = allContours(res);
  assertInBounds(contours, sh);
  for (let i = 0; i < contours.length; i++) {
    for (let j = i + 1; j < contours.length; j++) {
      const grown = offsetPoly(contours[i], 5 - 0.01);
      assert.ok(
        intersectionArea(grown, contours[j]) < 1e-4,
        `gap<5 between ${i}/${j}`,
      );
    }
  }
  assert.ok(Math.abs(Math.min(...contours.flat().map(p => p.x))) < 0.01);
  assert.ok(Math.abs(Math.min(...contours.flat().map(p => p.y))) < 0.01);
});

test('multi-sheet: 6 squares 12x12 on 30x30 bins → 2 sheets, all placed', () => {
  const sh = sheet({ sheetWidth: 30, sheetHeight: 30 });
  const parts = Array.from({ length: 6 }, (_, i) => makeRectPart(`r${i}`, 12, 12, [0]));
  const res = run(parts, sh);
  assert.equal(res.unplacedUniqueIds.length, 0, `unplaced: ${res.unplacedUniqueIds}`);
  assert.equal(res.sheets.length, 2, `sheets=${res.sheets.length}`);
  const placedIds = res.sheets.flatMap((s) => s.placements.map((p) => p.uniqueId));
  assert.equal(placedIds.length, 6);
  assert.equal(new Set(placedIds).size, 6);
  for (const s of res.sheets) {
    assertNoOverlap(s.placements.map((p) => p.contour));
    assertInBounds(s.placements.map((p) => p.contour), sh);
  }
});

test('oversized part goes to unplaced, others still placed', () => {
  const sh = sheet({ sheetWidth: 50, sheetHeight: 50 });
  const res = run(
    [makeRectPart('big', 200, 200, [0, 90]), makeRectPart('small', 20, 20, [0])],
    sh,
  );
  assert.deepEqual(res.unplacedUniqueIds, ['big']);
  assert.equal(res.sheets.length, 1);
  assert.equal(res.sheets[0].placements[0].uniqueId, 'small');
});

test('rotations constrained to allowed list', () => {
  const sh = sheet();
  const res = run(
    [makeRectPart('a', 40, 15, [0, 90]), makeRectPart('b', 40, 15, [0, 90])],
    sh,
    { maxRestarts: 3 },
  );
  for (const s of res.sheets) {
    for (const p of s.placements) {
      assert.ok([0, 90].includes(p.rotationDeg), `rot=${p.rotationDeg}`);
    }
  }
});

test('restarts run ≥1 and score/restarts reported', () => {
  const sh = sheet();
  const res = run([makeRectPart('a', 40, 30, [0])], sh, { maxRestarts: 3 });
  assert.ok(res.restartsRun >= 1 && res.restartsRun <= 3, `restartsRun=${res.restartsRun}`);
  assert.ok(Number.isFinite(res.score));
  assert.ok(res.elapsedMs >= 0);
});

test('placement output has area/perimeter/contour sanity', () => {
  const sh = sheet();
  const res = run([makeRectPart('a', 40, 20, [0])], sh);
  const p = res.sheets[0].placements[0];
  assert.ok(Math.abs(p.area - 800) < 1e-6, `area=${p.area}`);
  assert.ok(Math.abs(p.perimeter - 120) < 1e-6, `perimeter=${p.perimeter}`);
  assert.equal(p.contour.length, 4);
  assert.ok(Math.abs(p.width - 40) < 1e-6 && Math.abs(p.height - 20) < 1e-6);
});

test('bottom-left gravity packs a dense job onto a single sheet', () => {
  // 18 rects ~ OL.svg letter sizes: must fit on ONE 2400x1200 sheet (was spilling to 2)
  const sh = sheet({ sheetWidth: 2400, sheetHeight: 1200, sheetMargin: 15, partGap: 4 });
  const parts: NfpPartRequest[] = [];
  for (let i = 0; i < 18; i++) {
    parts.push(
      i % 2 === 0
        ? makeRectPart(`g${i}`, 336, 434, [0, 90])
        : makeRectPart(`g${i}`, 297, 397, [0, 90]),
    );
  }
  const res = run(parts, sh, { budgetMs: 5000, maxRestarts: 6 });
  assert.equal(res.unplacedUniqueIds.length, 0, `unplaced: ${res.unplacedUniqueIds}`);
  assert.equal(res.sheets.length, 1, `expected one sheet, got ${res.sheets.length}`);
  assertNoOverlap(allContours(res));
  assertInBounds(allContours(res), sh);
});

test('irregular L-shaped job: combined scoring keeps all parts placed without overlaps', () => {
  const sh = sheet({ sheetWidth: 160, sheetHeight: 160, sheetMargin: 2, partGap: 1 });
  const parts: NfpPartRequest[] = [];
  for (let i = 0; i < 24; i++) parts.push(makeLPart(`Lb${i}`, [0, 90, 180, 270]));
  const res = run(parts, sh, { budgetMs: 8000, maxRestarts: 8 });
  assert.equal(res.unplacedUniqueIds.length, 0, `unplaced: ${res.unplacedUniqueIds}`);
  assert.ok(res.sheets.length <= 2, `expected <=2 sheets, got ${res.sheets.length}`);
  for (const s of res.sheets) {
    const cs = s.placements.map((p) => p.contour);
    assertNoOverlap(cs);
    assertInBounds(cs, sh);
  }
});

test('dense mixed job: many parts place fast with no overlaps', () => {
  const sh = sheet({ sheetWidth: 200, sheetHeight: 200, partGap: 2 });
  const parts: NfpPartRequest[] = [];
  for (let i = 0; i < 20; i++) {
    const w = 20 + (i % 5) * 5;
    const h = 10 + (i % 3) * 5;
    parts.push(makeRectPart(`m${i}`, w, h, [0, 90, 180, 270]));
  }
  for (let i = 0; i < 10; i++) parts.push(makeLPart(`L${i}`, [0, 90, 180, 270]));
  const t0 = Date.now();
  // Leave room for the independent final geometry check and CI scheduling.
  const res = run(parts, sh, { budgetMs: 6000, maxRestarts: 2 });
  const elapsed = Date.now() - t0;
  let placedCount = 0;
  for (const s of res.sheets) {
    const contours = s.placements.map((p) => p.contour);
    placedCount += contours.length;
    assertNoOverlap(contours);
    assertInBounds(contours, sh);
  }
  assert.ok(elapsed < 8000, `took ${elapsed}ms`);
  // greedy should place the vast majority
  assert.ok(
    placedCount >= Math.floor(parts.length * 0.7),
    `only ${placedCount}/${parts.length} placed`,
  );
});

test('sheet margin remains exact with a nonzero part gap', () => {
  const sh = sheet({ sheetWidth: 100, sheetHeight: 80, sheetMargin: 7, partGap: 6 });
  const res = run([makeRectPart('edge', 30, 20, [0])], sh);
  assert.equal(res.unplacedUniqueIds.length, 0);
  const p = res.sheets[0].placements[0];
  assert.ok(Math.abs(p.x - 7) < 0.01, `x=${p.x}`);
  assert.ok(Math.abs(p.y - 7) < 0.01, `y=${p.y}`);
  assertInBounds(allContours(res), sh);
});

test('exact-width parts share one sheet with the requested gap', () => {
  const sh = sheet({ sheetWidth: 100, sheetHeight: 80, sheetMargin: 5, partGap: 4 });
  const res = run([makeRectPart('a', 90, 30, [0]), makeRectPart('b', 90, 36, [0])], sh);
  assert.equal(res.unplacedUniqueIds.length, 0);
  assert.equal(res.sheets.length, 1);
  assertInBounds(allContours(res), sh);
  assertNoOverlap(allContours(res));
  const ps = [...res.sheets[0].placements].sort((a, b) => a.y - b.y);
  assert.ok(Math.abs(ps[1].y - ps[0].y - ps[0].height - 4) < 0.01);
});

test('exact-height parts share one sheet instead of losing a feasible line', () => {
  const sh = sheet({ sheetWidth: 80, sheetHeight: 100, sheetMargin: 5, partGap: 4 });
  const res = run([makeRectPart('a', 30, 90, [0]), makeRectPart('b', 36, 90, [0])], sh);
  assert.equal(res.unplacedUniqueIds.length, 0);
  assert.equal(res.sheets.length, 1);
  assertInBounds(allContours(res), sh);
  assertNoOverlap(allContours(res));
});

test('a part can fill the entire usable sheet despite a nonzero gap', () => {
  const sh = sheet({ sheetMargin: 5, partGap: 4 });
  const res = run([makeRectPart('full', 90, 90, [0])], sh);
  assert.equal(res.unplacedUniqueIds.length, 0);
  assert.equal(res.sheets.length, 1);
  assertInBounds(allContours(res), sh);
});

test('one-sheet jobs keep searching for a compact offcut', () => {
  const parts = [makeRectPart('a', 30, 20, [0, 90]), makeLPart('b', [0, 90, 180, 270])];
  const first = run(parts, sheet(), { maxRestarts: 1 });
  const improved = run(parts, sheet(), { maxRestarts: 4 });
  assert.equal(improved.restartsRun, 4);
  assert.equal(improved.sheets.length, 1);
  assert.ok(improved.score <= first.score);
  assertNoOverlap(allContours(improved));
});

test('self-intersecting imported paths keep every lobe inside the sheet', () => {
  const contour = [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 40, y: 0 }];
  const part = { ...makeRectPart('bowtie', 40, 40, [0]), contour };
  const sh = sheet({ sheetWidth: 50, sheetHeight: 50, sheetMargin: 5, partGap: 2 });
  const result = run([part], sh);
  assert.equal(result.unplacedUniqueIds.length, 0);
  const p = result.sheets[0].placements[0];
  assert.equal(p.width, 40);
  assert.equal(p.height, 40);
  for (const point of contour) {
    assert.ok(point.x + p.tx >= 4.99 && point.x + p.tx <= 45.01);
    assert.ok(point.y + p.ty >= 4.99 && point.y + p.ty <= 45.01);
  }
});

test('fast collision proxies contain the entire original curved outline', () => {
  const original: Pt[] = Array.from({ length: 193 }, (_, i) => ({
    x: 60+50*Math.cos(i*2*Math.PI/193), y: 60+40*Math.sin(i*2*Math.PI/193),
  }));
  const proxy = collisionProxy(C, original);
  assert.ok(proxy.length < original.length, `proxy not reduced: ${proxy.length}`);
  const source = toClipperPath(original), enclosing = toClipperPath(proxy);
  C.JS.ScaleUpPath(source, 1000); C.JS.ScaleUpPath(enclosing, 1000);
  const checker = new C.Clipper(), missing = new C.Paths();
  checker.AddPath(source, C.PolyType.ptSubject, true);
  checker.AddPath(enclosing, C.PolyType.ptClip, true);
  checker.Execute(C.ClipType.ctDifference, missing, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  assert.equal(missing.reduce((sum: number, path: any) => sum+Math.abs(C.Clipper.Area(path)), 0), 0);
});

test('repeated concave jobs preserve all instances, clearance and grain in every checkpoint', () => {
  const parts = Array.from({length: 12}, (_,i) => ({
    ...makeLPart(`repeat-${i}`, i%2 ? [0] : [0,90,180,270]),
    // Identical geometry with different grain rules must not share angle masks.
    shapeId: `grain-${i%2}`,
  }));
  const snapshots: ReturnType<typeof runGreedyNest>[] = [];
  const req = {parts, sheet: sheet({sheetWidth:160,sheetHeight:100,sheetMargin:2,partGap:2}),
    budgetMs:100, maxRestarts:1};
  const raw = runGreedyNest({...deps,now:()=>0},req,undefined,r=>snapshots.push(r));
  assert.equal(raw.unplacedUniqueIds.length,0);
  assert.equal(raw.sheets.flatMap(s=>s.placements).length,12);
  assert.ok(snapshots.length>=2);
  for (let i=0;i<snapshots.length;i++) {
    if (i) assert.ok(snapshots[i].score<=snapshots[i-1].score+1e-9);
    const placed=snapshots[i].sheets.flatMap(s=>s.placements);
    assert.equal(new Set(placed.map(p=>p.uniqueId)).size,12);
    for (const p of placed) {
      assert.ok(parts.find(q=>q.uniqueId===p.uniqueId)!.rotations.includes(p.rotationDeg));
      assert.ok(p.x>=1.999 && p.y>=1.999 && p.x+p.width<=158.001 && p.y+p.height<=98.001);
    }
    for (const s of snapshots[i].sheets) for (let a=0;a<s.placements.length;a++) for (let b=0;b<a;b++) {
      assert.ok(intersectionArea(offsetPoly(s.placements[a].contour,0.98),offsetPoly(s.placements[b].contour,0.98))<1e-5);
    }
  }
});
