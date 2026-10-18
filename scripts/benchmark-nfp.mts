import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { parseSvgString } from '../src/utils/svgParser.ts';
import { buildNfpRequest, rawResultToNestingResult } from '../src/utils/nfpEngine.ts';
import { runGreedyNest } from '../src/utils/nfpCore.ts';
import { generateInkscapeSvg, generateSheetDxf, generateCutListCsv } from '../src/utils/exporters.ts';

// No input artwork is committed: pass a local SVG to reproduce the full test.
const [file, multiplierArg = '13', secondsArg = '30', anglesArg = '32'] = process.argv.slice(2);
if (!file) throw new Error('Usage: npm run benchmark:nfp -- path/to/TEST.svg [multiplier=13] [seconds=30] [angles=32]');
const multiplier = Number(multiplierArg), budgetMs = Number(secondsArg)*1000, angles = Number(anglesArg);
assert.ok(Number.isInteger(multiplier) && multiplier > 0);
assert.ok(Number.isFinite(budgetMs) && budgetMs > 0);
assert.ok(Number.isInteger(angles) && angles >= 4 && angles <= 72);
const dom = new JSDOM('');
const g = globalThis as any;
Object.assign(g, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser, self: g });
for (const name of ['geometryutil', 'clipper']) new Function(readFileSync(new URL(`../public/svgnest/${name}.js`, import.meta.url), 'utf8'))();
const deps = { GeometryUtil: g.GeometryUtil || g.window.GeometryUtil, ClipperLib: g.ClipperLib || g.window.ClipperLib };
const cfg = { sheetWidth: 2400, sheetHeight: 1200, sheetMargin: 15, partGap: 4 };
const parts = parseSvgString(readFileSync(file, 'utf8'), 'free', 1, 'groups').parts;
assert.ok(parts.length > 0, 'No parts imported');
const request = buildNfpRequest(parts, cfg, multiplier, {}, { budgetMs, freeRotationCount: angles });
const start = performance.now();
let checkpoints = 0;
const raw = runGreedyNest(deps, request, undefined, () => { checkpoints++; });
const wallMs = performance.now()-start;
assert.equal(raw.unplacedUniqueIds.length, 0, 'Some pieces could not be placed');
const placed = raw.sheets.flatMap(s => s.placements);
assert.equal(placed.length, request.parts.length);
assert.equal(new Set(placed.map(p => p.uniqueId)).size, request.parts.length);
for (const p of request.parts) assert.ok(placed.some(q => q.uniqueId === p.uniqueId));
const C = deps.ClipperLib, scale = 1e6;
for (const sheet of raw.sheets) {
  const grown = sheet.placements.map(p => {
    for (const pt of p.contour) assert.ok(pt.x >= 14.999 && pt.x <= 2385.001 && pt.y >= 14.999 && pt.y <= 1185.001, 'Out of bounds');
    const out = new C.Paths(), offset = new C.ClipperOffset(2, 10000);
    offset.AddPath(p.contour.map(pt => ({ X: Math.round(pt.x*scale), Y: Math.round(pt.y*scale) })), C.JoinType.jtRound, C.EndType.etClosedPolygon);
    offset.Execute(out, (cfg.partGap/2-0.015)*scale);
    assert.equal(out.length, 1);
    const path = out[0] as Array<{ X: number; Y: number }>;
    return { path, minX: Math.min(...path.map(p=>p.X)), maxX: Math.max(...path.map(p=>p.X)),
      minY: Math.min(...path.map(p=>p.Y)), maxY: Math.max(...path.map(p=>p.Y)) };
  });
  for (let i=0; i<grown.length; i++) for (let j=0; j<i; j++) {
    const a=grown[i], b=grown[j];
    if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) continue;
    const clip=new C.Clipper(), overlap=new C.Paths();
    clip.AddPath(a.path,C.PolyType.ptSubject,true);clip.AddPath(b.path,C.PolyType.ptClip,true);
    clip.Execute(C.ClipType.ctIntersection,overlap,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);
    assert.ok(overlap.reduce((sum: number,p: any)=>sum+Math.abs(C.Clipper.Area(p))/scale**2,0)<1e-4, `Clearance violated: ${i}/${j}`);
  }
}
const result=rawResultToNestingResult(raw,parts,cfg,multiplier);
let exportedPaths=0;
for (const sheet of result.sheets) {
  const doc=new DOMParser().parseFromString(generateInkscapeSvg(sheet),'image/svg+xml');
  assert.equal(doc.querySelector('parsererror'),null);
  exportedPaths+=doc.querySelectorAll('path').length;
  assert.match(generateSheetDxf(sheet),/ENTITIES/);
}
assert.equal(generateCutListCsv(result).trim().split('\r\n').length,placed.length+1);
assert.ok(wallMs <= budgetMs+1000, `Budget overrun: ${wallMs.toFixed(0)}ms`);
console.log(JSON.stringify({settings:{...cfg,multiplier,budgetMs,angles},sourceParts:parts.length,
  placed:placed.length,unplaced:raw.unplacedUniqueIds.length,sheets:raw.sheets.length,wallMs:Math.round(wallMs),
  checkpoints,method:raw.layoutMethod,baselineAreaMm2:raw.baselineAreaMm2,occupiedAreaMm2:raw.occupiedAreaMm2,
  improvementPercent:raw.improvementPercent,exportedPaths,clearanceCheck:'passed (0.03mm tolerance)',
  perSheet:raw.sheets.map(s=>({count:s.placements.length,outerContourUtilizationPercent:s.placements.reduce((a,p)=>a+p.area,0)/(2370*1170)*100}))},null,2));
