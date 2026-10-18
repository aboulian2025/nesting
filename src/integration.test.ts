import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { parseSvgString } from './utils/svgParser.ts';
import { buildNfpRequest, rawResultToNestingResult } from './utils/nfpEngine.ts';
import { runGreedyNest } from './utils/nfpCore.ts';
import { generateInkscapeSvg, generateSheetDxf, generateCutListCsv } from './utils/exporters.ts';
import type { NfpWorkerIn, NfpWorkerOut } from './utils/nfpTypes.ts';
import { useNfpNesting, type UseNfpNestingState } from './hooks/useNfpNesting.ts';
import { snippetToLoops } from './utils/contour.ts';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as any;
for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'SVGElement', 'Element', 'XMLSerializer', 'MouseEvent']) g[key] = (dom.window as any)[key];
g.IS_REACT_ACT_ENVIRONMENT = true;
g.self = g;
for (const name of ['geometryutil', 'clipper']) new Function(readFileSync(new URL(`../public/svgnest/${name}.js`, import.meta.url), 'utf8'))();
const deps = { GeometryUtil: g.GeometryUtil || g.window.GeometryUtil, ClipperLib: g.ClipperLib || g.window.ClipperLib };
const config = { sheetWidth: 100, sheetHeight: 80, sheetMargin: 5, partGap: 4 };

test('transformed SVG import → NFP → SVG/DXF/CSV keeps dimensions and placement', () => {
  const parsed = parseSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><g transform="translate(20 10)"><g transform="scale(2 3)"><rect x="0" y="0" width="10" height="10"/></g></g></svg>`);
  assert.equal(parsed.parts.length, 1);
  const part = parsed.parts[0];
  assert.equal(part.width, 20);
  assert.equal(part.height, 30);
  assert.deepEqual(part.originalBBox, { x: 20, y: 10, width: 20, height: 30 });
  const request = buildNfpRequest(parsed.parts, config);
  const raw = runGreedyNest(deps, request);
  assert.equal(raw.unplacedUniqueIds.length, 0);
  const result = rawResultToNestingResult(raw, parsed.parts, config);
  const placed = result.sheets[0].placedParts[0];
  assert.ok(Math.abs(placed.x - 5) < 0.01);
  assert.ok(Math.abs(placed.y - 5) < 0.01);
  assert.equal(result.sheets[0].usedArea, 600);
  const svg = generateInkscapeSvg(result.sheets[0]);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  assert.equal(doc.querySelector('parsererror'), null);
  assert.match(svg, /translate\(20 10\) scale\(2 3\)/);
  assert.match(generateSheetDxf(result.sheets[0]), /ENTITIES/);
  const csv = generateCutListCsv(result);
  assert.equal(csv.trim().split('\r\n').length, 2);
});

// Controlled worker transport: exercise the actual React input/settlement flow
// while executing the real nesting core when the test delivers a worker reply.
class ControlledWorker {
  static workers: ControlledWorker[] = [];
  onmessage: ((event: { data: NfpWorkerOut }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  request: NfpWorkerIn | null = null;
  terminated = false;
  constructor() { ControlledWorker.workers.push(this); }
  postMessage(request: NfpWorkerIn) { this.request = request; }
  terminate() { this.terminated = true; }
  complete() {
    assert.ok(this.request && this.request.type === 'run');
    const result = runGreedyNest(deps, { ...this.request.request, maxRestarts: 2 });
    if (!this.terminated) this.onmessage?.({ data: { type: 'done', result } });
  }
}
g.Worker = ControlledWorker;

test('changing sheet settings hides the old NFP result immediately and ignores cancelled replies', async () => {
  const root = createRoot(document.getElementById('root')!);
  const snapshots: UseNfpNestingState[] = [];
  const parts = [{ id: 'a', name: 'A', width: 20, height: 10, count: 1, grain: 'free' as const }];
  function Probe({ width }: { width: number }) {
    snapshots.push(useNfpNesting({ enabled: true, parts, sheetConfig: { ...config, sheetWidth: width },
      globalMultiplier: 1, partOverrides: {} }));
    return null;
  }
  try {
    await act(async () => { root.render(React.createElement(Probe, { width: 100 })); });
    await act(async () => { ControlledWorker.workers.at(-1)!.complete(); });
    assert.equal(snapshots.at(-1)!.result?.sheets[0].sheetWidth, 100);
    const start = snapshots.length;
    await act(async () => { root.render(React.createElement(Probe, { width: 120 })); });
    assert.ok(snapshots.slice(start).every(s => s.result === null && s.running));
    const cancelled = ControlledWorker.workers.at(-1)!;
    await act(async () => { root.render(React.createElement(Probe, { width: 140 })); });
    assert.equal(cancelled.terminated, true);
    await act(async () => { cancelled.complete(); });
    assert.equal(snapshots.at(-1)!.result, null);
    await act(async () => { ControlledWorker.workers.at(-1)!.complete(); });
    assert.equal(snapshots.at(-1)!.result?.sheets[0].sheetWidth, 140);
  } finally { await act(async () => { root.unmount(); }); }
});

test('React opens SVG import repeatedly and blocks export until current NFP settles', async () => {
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const button = (label: string) => {
    const found = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(label));
    assert.ok(found, `missing button: ${label}`);
    return found;
  };
  try {
    await act(async () => { root.render(React.createElement(App)); });
    for (let i = 0; i < 2; i++) {
      await act(async () => { button('استيراد SVG').click(); });
      const modal = container.querySelector('.fixed.inset-0');
      assert.ok(modal);
      const close = modal.querySelector('button');
      assert.ok(close);
      await act(async () => { close.click(); });
    }
    await act(async () => { button('أشكال حرة (NFP)').click(); });
    assert.equal(button('تصدير Inkscape SVG').disabled, true);
    const first = ControlledWorker.workers.at(-1)!;
    await act(async () => { first.complete(); });
    assert.equal(button('تصدير Inkscape SVG').disabled, false);
    // Changing engine settings starts a distinct request; old output must not
    // remain exportable even in the render before the effect starts the worker.
    await act(async () => { button('مستطيلات').click(); });
    await act(async () => { button('أشكال حرة (NFP)').click(); });
    assert.equal(button('تصدير Inkscape SVG').disabled, true);
    const second = ControlledWorker.workers.at(-1)!;
    assert.notEqual(first, second);
    await act(async () => { second.complete(); });
    assert.equal(button('تصدير Inkscape SVG').disabled, false);
  } finally {
    await act(async () => { root.unmount(); });
  }
});

test('appending two imported SVGs preserves every part identity and exported design', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="one"><rect width="20" height="20"/></g><g id="two"><circle cx="50" cy="50" r="10"/></g></svg>';
  const parts = [...parseSvgString(svg, 'free', 1, 'groups').parts, ...parseSvgString(svg, 'free', 1, 'groups').parts];
  assert.equal(parts.length, 4);
  assert.equal(new Set(parts.map(p => p.id)).size, 4);
  const raw = runGreedyNest(deps, buildNfpRequest(parts, { ...config, sheetWidth: 200, sheetHeight: 200 }, 1, {}, { maxRestarts: 1 }));
  const result = rawResultToNestingResult(raw, parts, { ...config, sheetWidth: 200, sheetHeight: 200 });
  assert.equal(result.summary.totalPartsPlaced, 4);
  assert.equal(new Set(result.sheets.flatMap(s => s.placedParts.map(p => p.uniqueId))).size, 4);
  const xml = result.sheets.map(generateInkscapeSvg).join('');
  assert.equal((xml.match(/<circle\b/g) || []).length, 2);
  assert.equal((xml.match(/<rect\b/g) || []).length, 2);
});

test('NFP keeps open strokes and every lobe in the imported design and exports', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="lobes" d="M0 0 L40 40 L0 40 L40 0 Z"/><line id="open" x1="10" y1="10" x2="90" y2="10"/><circle id="hole" cx="20" cy="20" r="3"/></svg>';
  const parts = parseSvgString(svg, 'width').parts;
  const cfg = { ...config, sheetWidth: 120, sheetHeight: 120 };
  const req = buildNfpRequest(parts, cfg);
  assert.ok(Math.max(...req.parts[0].contour.map(p => p.x)) >= 90);
  const raw = runGreedyNest(deps, { ...req, maxRestarts: 1 });
  const result = rawResultToNestingResult(raw, parts, cfg);
  assert.equal(result.summary.totalPartsPlaced, 1);
  const exported = generateInkscapeSvg(result.sheets[0]);
  const doc = new DOMParser().parseFromString(exported, 'image/svg+xml');
  for (const id of ['lobes', 'open', 'hole']) assert.ok(doc.getElementById(id), `${id} missing from exported design`);
  const dxf = generateSheetDxf(result.sheets[0]);
  assert.match(dxf, /LINE/);
});

test('an incomplete NFP reply displays the remaining parts and blocks export', async () => {
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  try {
    await act(async () => { root.render(React.createElement(App)); });
    const nfp = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('أشكال حرة (NFP)'))!;
    await act(async () => { nfp.click(); });
    const worker = ControlledWorker.workers.at(-1)!;
    await act(async () => { worker.onmessage?.({ data: { type: 'done', result: {
      sheets: [], unplacedUniqueIds: [], score: 0, restartsRun: 1, elapsedMs: 0,
    } } }); });
    const alert = container.querySelector('[role="alert"]');
    assert.ok(alert?.textContent?.includes('قطع غير موزعة'));
    const exportButton = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('تصدير Inkscape SVG'))!;
    assert.equal(exportButton.disabled, true);
  } finally { await act(async () => { root.unmount(); }); }
});

test('uploaded OL.svg keeps all 8 elements and 20 subpaths when the optimisation budget expires', () => {
  const source = readFileSync(new URL('./fixtures/ol-import.svg', import.meta.url), 'utf8');
  const original = new DOMParser().parseFromString(source, 'image/svg+xml');
  const expected = [...original.querySelectorAll('path')];
  assert.equal(expected.length, 8);
  const cfg = { sheetWidth: 2400, sheetHeight: 1200, sheetMargin: 15, partGap: 4 };
  for (const mode of ['shapes', 'groups', 'single', 'single-resized'] as const) {
    const isSingle = mode === 'single' || mode === 'single-resized';
    const parts = parseSvgString(source, 'free', 1, isSingle ? 'single' : mode).parts;
    for (const part of parts) {
      assert.ok(Math.abs(part.width - part.originalBBox!.width) < 1e-9, 'import must preserve fractional mm');
      assert.ok(Math.abs(part.height - part.originalBBox!.height) < 1e-9, 'import must preserve fractional mm');
      if (mode === 'single-resized') { part.width *= 0.9995; part.height *= 0.9995; }
    }
    const request = buildNfpRequest(parts, cfg, 1, {}, { budgetMs: 1, maxRestarts: 14 });
    const start = Date.now();
    const raw = runGreedyNest(deps, request);
    assert.ok(Date.now() - start < 3000, 'a tiny budget must not trigger expensive Minkowski work');
    const result = rawResultToNestingResult(raw, parts, cfg);
    assert.equal(result.summary.totalPartsPlaced, isSingle ? 1 : 8, mode);
    assert.equal(result.summary.unplacedCount, 0, mode);
    assert.equal(result.sheets.length, 1, mode);
    const exported = result.sheets.map(s => new DOMParser().parseFromString(generateInkscapeSvg(s), 'image/svg+xml'));
    const paths = exported.flatMap(d => [...d.querySelectorAll('path')]);
    assert.equal(paths.length, 8, mode);
    for (const path of expected) {
      const found = paths.filter(p => p.id === path.id);
      assert.equal(found.length, 1, `${mode}: ${path.id}`);
      assert.equal(found[0].getAttribute('d'), path.getAttribute('d'), `${mode}: changed path ${path.id}`);
    }
    for (const doc of exported) {
      const loops = snippetToLoops(new XMLSerializer().serializeToString(doc));
      assert.equal(loops.length, 20);
      for (const p of loops.flat()) {
        assert.ok(p.x >= 14.95 && p.x <= 2385.05, `${mode}: artwork outside sheet x=${p.x}`);
        assert.ok(p.y >= 14.95 && p.y <= 1185.05, `${mode}: artwork outside sheet y=${p.y}`);
      }
    }
    assert.equal(generateCutListCsv(result).trim().split('\r\n').length, (isSingle ? 1 : 8) + 1);
    for (const sheet of result.sheets) assert.match(generateSheetDxf(sheet), /ENTITIES/);
  }
});

test('OL.svg shape optimisation compacts the layout by at least 15% without overlap or missing paths', () => {
  const source = readFileSync(new URL('./fixtures/ol-import.svg', import.meta.url), 'utf8');
  const parts = parseSvgString(source, 'free', 1, 'groups').parts;
  const cfg = { sheetWidth: 2400, sheetHeight: 1200, sheetMargin: 15, partGap: 4 };
  // Fixed clock makes the fixed optimisation pass reproducible under CI load.
  const raw = runGreedyNest({ ...deps, now: () => 0 }, buildNfpRequest(parts, cfg, 1, {}, {
    budgetMs: 100, maxRestarts: 1,
  }));
  assert.equal(raw.unplacedUniqueIds.length, 0);
  assert.equal(raw.sheets.length, 1);
  assert.equal(raw.sheets[0].placements.length, 8);
  assert.ok(raw.improvementPercent! >= 15, `improvement=${raw.improvementPercent}`);
  assert.ok(raw.occupiedAreaMm2! < raw.baselineAreaMm2!);
  const C = deps.ClipperLib;
  const grown = raw.sheets[0].placements.map(p => {
    const path = p.contour.map(pt => ({ X: pt.x, Y: pt.y }));
    C.JS.ScaleUpPath(path, 1000000);
    const offset = new C.ClipperOffset(2, 10000), out = new C.Paths();
    offset.AddPath(path, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    offset.Execute(out, (cfg.partGap/2-0.015)*1000000);
    assert.equal(out.length, 1);
    return out[0];
  });
  for (let i = 0; i < grown.length; i++) for (let j = 0; j < i; j++) {
    const checker = new C.Clipper(), overlap = new C.Paths();
    checker.AddPath(grown[i], C.PolyType.ptSubject, true);
    checker.AddPath(grown[j], C.PolyType.ptClip, true);
    checker.Execute(C.ClipType.ctIntersection, overlap, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    const area = overlap.reduce((sum: number, path: any) => sum+Math.abs(C.Clipper.Area(path))/1e12, 0);
    assert.ok(area < 1e-4, `${i}/${j}: gap violated, overlap=${area}`);
  }
  const result = rawResultToNestingResult(raw, parts, cfg);
  const svg = generateInkscapeSvg(result.sheets[0]);
  const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const original = new DOMParser().parseFromString(source, 'image/svg+xml');
  assert.equal(xml.querySelectorAll('path').length, 8);
  assert.equal(snippetToLoops(svg).length, 20);
  for (const p of original.querySelectorAll('path')) assert.equal(xml.getElementById(p.id)?.getAttribute('d'), p.getAttribute('d'));
  for (const p of snippetToLoops(svg).flat()) {
    assert.ok(p.x >= 14.95 && p.x <= 2385.05, `x=${p.x} outside sheet`);
    assert.ok(p.y >= 14.95 && p.y <= 1185.05, `y=${p.y} outside sheet`);
  }
});

test('worker deadline returns the latest complete checkpoint and ignores late results', async () => {
  const root = createRoot(document.getElementById('root')!);
  const parts = [{ id: 'checkpoint-part', name: 'A', width: 20, height: 10, count: 13, grain: 'free' as const }];
  const cfg = { sheetWidth: 200, sheetHeight: 100, sheetMargin: 5, partGap: 4 };
  const snapshots: UseNfpNestingState[] = [];
  function Probe() {
    snapshots.push(useNfpNesting({ enabled: true, parts, sheetConfig: cfg,
      globalMultiplier: 1, partOverrides: {}, budgetMs: 30 }));
    return null;
  }
  try {
    await act(async () => { root.render(React.createElement(Probe)); });
    const worker = ControlledWorker.workers.at(-1)!;
    const raw = runGreedyNest(deps, buildNfpRequest(parts, cfg, 1, {}, { budgetMs: 1 }));
    await act(async () => {
      worker.onmessage?.({ data: { type: 'checkpoint', result: { ...raw, elapsedMs: 29 } } });
      await new Promise(resolve => setTimeout(resolve, 15));
    });
    assert.equal(snapshots.at(-1)!.running, false);
    assert.equal(worker.terminated, true);
    assert.equal(snapshots.at(-1)!.result?.sheets.reduce((sum,s) => sum+s.placedParts.length,0), 13);
    assert.equal(snapshots.at(-1)!.result?.optimization?.timedOut, true);
    const settled = snapshots.at(-1)!.result;
    await act(async () => { worker.onmessage?.({ data: { type: 'error', message: 'late error' } }); });
    assert.equal(snapshots.at(-1)!.result, settled);
    assert.equal(snapshots.at(-1)!.error, null);
  } finally { await act(async () => { root.unmount(); }); }
});
