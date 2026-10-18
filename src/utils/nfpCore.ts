import { signedArea } from './contour.ts';
import type {
  NfpCoreResult,
  NfpPartRequest,
  NfpPlacementOut,
  NfpProgress,
  NfpRunRequest,
  NfpSheetOut,
  Pt,
} from './nfpTypes.ts';

// Ported greedy NFP nesting core from SVGnest (MIT) â€” Jack000/SVGnest
// placementworker.js placePaths + svgnest.js minkowskiDifference/polygonOffset,
// stripped of the GA: multi-restart deterministic orders inside a time budget.

export interface NfpDeps {
  GeometryUtil: any;
  ClipperLib: any;
  now?: () => number;
}

// Clipper integer scale (units per mm). 1000 (=1 micron) keeps coordinate
// magnitudes small so Clipper's MinkowskiSum runs ~6x faster than at 1e7 while
// edge clearance/offset accuracy stays far below any real cutting tolerance.
const CLIPPER_SCALE = 1000;
const CURVE_TOLERANCE = 0.3;
const MAX_SHEETS = 10000;

interface Bnds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Candidate scoring for a placement:
//  - 'bbox'    : minimize bounding-box growth (width weighted 2x)
//  - 'gravity' : minimize the part's bottom-left position first (bottom-left fill)
type Scoring = 'bbox' | 'gravity';

interface ShapeLocal {
  raw: Pt[];
  off: Pt[];
}

interface PreparedShape {
  off: Pt[];
  raw: Pt[];
  offB: Bnds;
  rawB: Bnds;
}

interface PlacedRec {
  uniqueId: string;
  shapeId: string;
  rot: number;
  t: Pt;
  prep: PreparedShape;
  aabb: Bnds;
  rawWorld: Pt[];
}

interface SheetState {
  placed: PlacedRec[];
  unionOff: Bnds | null;
}

interface GreedyOutcome {
  sheets: SheetState[];
  pool: NfpPartRequest[];
}

function boundsOf(pts: Pt[]): Bnds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function mergeBounds(a: Bnds | null, b: Bnds): Bnds {
  if (!a) return { ...b };
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rotatePoly(pts: Pt[], degrees: number): Pt[] {
  if (degrees === 0) return pts.map((p) => ({ x: p.x, y: p.y }));
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return pts.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
}

function translatePoly(pts: Pt[], t: Pt): Pt[] {
  return pts.map((p) => ({ x: p.x + t.x, y: p.y + t.y }));
}

function toClipper(pts: Pt[]): Array<{ X: number; Y: number }> {
  return pts.map((p) => ({ X: p.x, Y: p.y }));
}

function toNest(path: Array<{ X: number; Y: number }>, scale: number): Pt[] {
  return path.map((p) => ({ x: p.X / scale, y: p.Y / scale }));
}

// svgnest polygonOffset: expand (+) / contract (âˆ’) a polygon with round joins.
function polygonOffset(C: any, polygon: Pt[], offset: number): Pt[][] {
  if (!offset || Math.abs(offset) < 1e-9) return [polygon];
  const p = toClipper(polygon);
  C.JS.ScaleUpPath(p, CLIPPER_SCALE);
  const co = new C.ClipperOffset(2, CURVE_TOLERANCE * CLIPPER_SCALE);
  co.AddPath(p, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, offset * CLIPPER_SCALE);
  const result: Pt[][] = [];
  for (let i = 0; i < out.length; i++) {
    const path = out[i];
    if (path && path.length > 2) result.push(toNest(path, CLIPPER_SCALE));
  }
  return result;
}

// svgnest cleanPolygon: simplify self-intersections, keep biggest piece, drop noise.
function cleanPolygon(C: any, polygon: Pt[]): Pt[] | null {
  const p = toClipper(polygon);
  C.JS.ScaleUpPath(p, CLIPPER_SCALE);
  const simple = C.Clipper.SimplifyPolygon(p, C.PolyFillType.pftNonZero);
  if (!simple || simple.length === 0) return null;
  let biggest = simple[0];
  let biggestArea = Math.abs(C.Clipper.Area(biggest));
  for (let i = 1; i < simple.length; i++) {
    const area = Math.abs(C.Clipper.Area(simple[i]));
    if (area > biggestArea) {
      biggest = simple[i];
      biggestArea = area;
    }
  }
  const clean = C.Clipper.CleanPolygon(biggest, CURVE_TOLERANCE * CLIPPER_SCALE);
  if (!clean || clean.length === 0) return null;
  return toNest(clean, CLIPPER_SCALE);
}

// CleanPolygon only (no reordering): simplify within an absolute mm tolerance.
function cleanPolygonTol(C: any, polygon: Pt[], tolMm: number): Pt[] | null {
  const p = toClipper(polygon);
  C.JS.ScaleUpPath(p, CLIPPER_SCALE);
  const clean = C.Clipper.CleanPolygon(p, tolMm * CLIPPER_SCALE);
  if (!clean || clean.length === 0) return null;
  return toNest(clean, CLIPPER_SCALE);
}

// svgnest minkowskiDifference (svgnest.js:491) â€” outer NFP between A and B at origin.
function minkowskiDifference(G: any, C: any, A: Pt[], B: Pt[]): Pt[][] {
  const Ac = toClipper(A);
  C.JS.ScaleUpPath(Ac, CLIPPER_SCALE);
  const Bc = toClipper(B);
  C.JS.ScaleUpPath(Bc, CLIPPER_SCALE);
  for (let i = 0; i < Bc.length; i++) {
    Bc[i].X *= -1;
    Bc[i].Y *= -1;
  }
  const solution = C.Clipper.MinkowskiSum(Ac, Bc, true);
  let clipperNfp: Pt[] | null = null;
  let largestArea: number | null = null;
  for (const s of solution) {
    const n = toNest(s, CLIPPER_SCALE);
    const sarea = G.polygonArea(n);
    if (largestArea === null || largestArea > sarea) {
      clipperNfp = n;
      largestArea = sarea;
    }
  }
  if (!clipperNfp || clipperNfp.length < 3) return [];
  for (let i = 0; i < clipperNfp.length; i++) {
    clipperNfp[i].x += B[0].x;
    clipperNfp[i].y += B[0].y;
  }
  return [clipperNfp];
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function orderParts(parts: NfpPartRequest[], strategy: number): NfpPartRequest[] {
  const arr = parts.slice();
  const areaOf = (p: NfpPartRequest) => Math.abs(signedArea(p.contour));
  switch (strategy) {
    case 0:
      arr.sort((a, b) => areaOf(b) - areaOf(a));
      break;
    case 1:
      arr.sort(
        (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height),
      );
      break;
    case 2:
      arr.sort(
        (a, b) =>
          2 * (b.width + b.height) - 2 * (a.width + a.height),
      );
      break;
    case 3:
      arr.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height));
      break;
    default:
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      break;
  }
  return arr;
}

export function runGreedyNest(
  deps: NfpDeps,
  req: NfpRunRequest,
  onProgress?: (p: NfpProgress) => void,
): NfpCoreResult {
  const G = deps.GeometryUtil;
  const C = deps.ClipperLib;
  const now = deps.now ?? (() => Date.now());
  const start = now();
  const { sheet } = req;
  const W = sheet.sheetWidth;
  const H = sheet.sheetHeight;
  const margin = sheet.sheetMargin;
  const gap = sheet.partGap;

  const softDeadline = start + Math.max(req.budgetMs, 1);
  const hardDeadline = start + Math.max(req.budgetMs * 4, 1000);

  // --- bin polygon (usable rect, contracted by gap/2), negative winding ---
  const m = margin;
  let binPolygon: Pt[] = [
    { x: m, y: m },
    { x: W - m, y: m },
    { x: W - m, y: H - m },
    { x: m, y: H - m },
  ];
  if (gap > 0) {
    const contracted = polygonOffset(C, binPolygon, -0.5 * gap);
    if (contracted.length === 1) binPolygon = contracted[0];
  }
  if (G.polygonArea(binPolygon) > 0) binPolygon.reverse();
  const binBounds = boundsOf(binPolygon);
  const binArea = Math.abs(G.polygonArea(binPolygon));

  // --- per-shape prep (clean + winding + gap/2 expansion), cached ---
  const shapeLocal = new Map<string, ShapeLocal | null>();
  const shapeOf = (part: NfpPartRequest): ShapeLocal | null => {
    const hit = shapeLocal.get(part.shapeId);
    if (hit !== undefined) return hit;
    let raw = part.contour;
    if (raw.length > 3) {
      const cleaned = cleanPolygon(C, raw);
      if (cleaned && cleaned.length > 2) raw = cleaned;
    }
    if (raw.length < 3 || Math.abs(G.polygonArea(raw)) < CURVE_TOLERANCE * CURVE_TOLERANCE) {
      shapeLocal.set(part.shapeId, null);
      return null;
    }
    if (G.polygonArea(raw) > 0) raw = raw.map((p) => ({ x: p.x, y: p.y }));
    if (G.polygonArea(raw) > 0) raw.reverse();
    let off = raw;
    if (gap > 0) {
      const expanded = polygonOffset(C, raw, 0.5 * gap);
      if (expanded.length === 1) off = expanded[0];
    }
    // Simplify the collision outline (not the render/export contour): CleanPolygon
    // error stays <= gap/4 so edge clearance remains >= 3*gap/4, inside the kerf.
    // Huge vertex-count savings on curve-heavy shapes (e.g. 193->39 pts on OL.svg
    // letter-O rings) cut Minkowski pair-NFP time by ~4-8x. Skipped when gap == 0
    // so contours stay geometrically exact with no clearance budget.
    if (gap > 0 && off.length > 16) {
      const offTol = Math.min(2, Math.max(0.5, gap * 0.25));
      const simplified = cleanPolygonTol(C, off, offTol);
      if (simplified && simplified.length > 2) {
        const a0 = Math.abs(G.polygonArea(off));
        const a1 = Math.abs(G.polygonArea(simplified));
        if (a0 <= 0 || a1 >= a0 * 0.8) off = simplified;
      }
    }
    if (G.polygonArea(off) > 0) off = off.map((p) => ({ x: p.x, y: p.y }));
    if (G.polygonArea(off) > 0) off.reverse();
    const local: ShapeLocal = { raw, off };
    shapeLocal.set(part.shapeId, local);
    return local;
  };

  // --- rotated prep cache: `${shapeId}|${rot}` ---
  const rotCache = new Map<string, PreparedShape | null>();
  const prepFor = (part: NfpPartRequest, rot: number): PreparedShape | null => {
    const key = `${part.shapeId}|${rot}`;
    const hit = rotCache.get(key);
    if (hit !== undefined) return hit;
    const local = shapeOf(part);
    if (!local) {
      rotCache.set(key, null);
      return null;
    }
    const off = rotatePoly(local.off, rot);
    const raw = rotatePoly(local.raw, rot);
    const prep: PreparedShape = {
      off,
      raw,
      offB: boundsOf(off),
      rawB: boundsOf(raw),
    };
    rotCache.set(key, prep);
    return prep;
  };

  // --- inner NFP (bin) cache ---
  const binNfpCache = new Map<string, Pt[][] | null>();
  const getBinNfp = (part: NfpPartRequest, rot: number, prep: PreparedShape): Pt[][] | null => {
    const key = `${part.shapeId}|${rot}`;
    const hit = binNfpCache.get(key);
    if (hit !== undefined) return hit;
    let nfp: Pt[][] | null = null;
    if (prep.offB.width > binBounds.width + 1e-9 || prep.offB.height > binBounds.height + 1e-9) {
      nfp = null;
    } else if (G.isRectangle(binPolygon, 0.001)) {
      nfp = G.noFitPolygonRectangle(binPolygon, prep.off);
    } else {
      nfp = G.noFitPolygon(binPolygon, prep.off, true, false);
    }
    if (nfp && nfp.length > 0) {
      for (const path of nfp) {
        if (G.polygonArea(path) > 0) path.reverse();
      }
    } else {
      nfp = null;
    }
    binNfpCache.set(key, nfp);
    return nfp;
  };

  // --- outer pair NFP cache (shape-local, absolute minkowski result) ---
  const pairNfpCache = new Map<string, Pt[][] | null>();
  const getPairNfp = (
    aPrep: PreparedShape,
    aShapeId: string,
    aRot: number,
    bPart: NfpPartRequest,
    bRot: number,
  ): Pt[][] | null => {
    const key = `${aShapeId}|${aRot}|${bPart.shapeId}|${bRot}`;
    const hit = pairNfpCache.get(key);
    if (hit !== undefined) return hit;
    const bPrep = prepFor(bPart, bRot);
    if (!bPrep) {
      pairNfpCache.set(key, null);
      return null;
    }
    let nfp = minkowskiDifference(G, C, aPrep.off, bPrep.off);
    if (!nfp || nfp.length === 0) {
      pairNfpCache.set(key, null);
      return null;
    }
    for (let i = 0; i < nfp.length; i++) {
      if (Math.abs(G.polygonArea(nfp[i])) < Math.abs(G.polygonArea(aPrep.off))) {
        nfp = [];
        break;
      }
    }
    if (nfp.length === 0) {
      pairNfpCache.set(key, null);
      return null;
    }
    for (const path of nfp) {
      if (G.polygonArea(path) > 0) path.reverse();
    }
    pairNfpCache.set(key, nfp);
    return nfp;
  };

  // --- try to place one part into the current sheet (all rotations) ---
  const tryPlace = (sheetState: SheetState, part: NfpPartRequest, scoring: Scoring): PlacedRec | null => {
    let best: { t: Pt; prep: PreparedShape; rot: number; score: number } | null = null;
    const rotations = part.rotations.length > 0 ? part.rotations : [0];
    for (const rot of rotations) {
      if (now() > hardDeadline) break;
      const prep = prepFor(part, rot);
      if (!prep) break;
      if (
        prep.offB.width > binBounds.width + 1e-9 ||
        prep.offB.height > binBounds.height + 1e-9
      ) {
        continue;
      }
      const binNfp = getBinNfp(part, rot, prep);
      if (!binNfp || binNfp.length === 0) continue;

      const placedList = sheetState.placed;
      let candidates: Array<{ t: Pt; score: number }>;

      if (placedList.length === 0) {
        candidates = [];
        for (const path of binNfp) {
          for (const pt of path) {
            const t = { x: pt.x - prep.off[0].x, y: pt.y - prep.off[0].y };
            const score =
              scoring === 'gravity'
                ? (prep.offB.y + t.y) * 1e7 + (prep.offB.x + t.x)
                : prep.offB.width * 2 + prep.offB.height;
            candidates.push({ t, score });
          }
        }
      } else {
        // combined forbidden NFP: union of (pairNfp + placed translation)
        const clipperBinNfp: Array<Array<{ X: number; Y: number }>> = [];
        for (const path of binNfp) clipperBinNfp.push(toClipper(path));
        C.JS.ScaleUpPaths(clipperBinNfp, CLIPPER_SCALE);

        let clipper = new C.Clipper();
        const combinedNfp = new C.Paths();
        let nfpMissing = false;
        for (let j = 0; j < placedList.length; j++) {
          const rec = placedList[j];
          const nfp = getPairNfp(rec.prep, rec.shapeId, rec.rot, part, rot);
          if (!nfp) {
            nfpMissing = true;
            break;
          }
          for (const path of nfp) {
            const clone = toClipper(path);
            for (const pt of clone) {
              pt.X += rec.t.x;
              pt.Y += rec.t.y;
            }
            C.JS.ScaleUpPath(clone, CLIPPER_SCALE);
            const cleaned = C.Clipper.CleanPolygon(clone, 0.0001 * CLIPPER_SCALE);
            const area = Math.abs(C.Clipper.Area(cleaned));
            if (cleaned.length > 2 && area > 0.1 * CLIPPER_SCALE * CLIPPER_SCALE) {
              clipper.AddPath(cleaned, C.PolyType.ptSubject, true);
            }
          }
        }
        if (nfpMissing) continue;
        if (!clipper.Execute(C.ClipType.ctUnion, combinedNfp, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) {
          continue;
        }

        const finalNfp = new C.Paths();
        clipper = new C.Clipper();
        clipper.AddPaths(combinedNfp, C.PolyType.ptClip, true);
        clipper.AddPaths(clipperBinNfp, C.PolyType.ptSubject, true);
        if (!clipper.Execute(C.ClipType.ctDifference, finalNfp, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) {
          continue;
        }

        let cleanedFinal = C.Clipper.CleanPolygons(finalNfp, 0.0001 * CLIPPER_SCALE);
        cleanedFinal = cleanedFinal.filter(
          (p: any) =>
            p.length >= 3 &&
            Math.abs(C.Clipper.Area(p)) >= 0.1 * CLIPPER_SCALE * CLIPPER_SCALE,
        );
        if (cleanedFinal.length === 0) continue;

        candidates = [];
        const placedBounds = sheetState.unionOff;
        for (const path of cleanedFinal) {
          const nf = toNest(path, CLIPPER_SCALE);
          if (Math.abs(G.polygonArea(nf)) < 2) continue;
          for (const pt of nf) {
            const t = { x: pt.x - prep.off[0].x, y: pt.y - prep.off[0].y };
            const shifted: Bnds = {
              x: prep.offB.x + t.x,
              y: prep.offB.y + t.y,
              width: prep.offB.width,
              height: prep.offB.height,
            };
            const merged = mergeBounds(placedBounds, shifted);
            const growth = merged.width * 2 + merged.height;
            const score = scoring === 'gravity' ? shifted.y * 1e7 + growth : growth;
            candidates.push({ t, score });
          }
        }
      }

      for (const cand of candidates) {
        if (
          best === null ||
          cand.score < best.score - 1e-9 ||
          (almostEqual(cand.score, best.score) && cand.t.x < best.t.x)
        ) {
          best = { t: cand.t, prep, rot, score: cand.score };
        }
      }
    }

    if (!best) {
      return null;
    }

    const rawWorld = translatePoly(best.prep.raw, best.t);
    const rec: PlacedRec = {
      uniqueId: part.uniqueId,
      shapeId: part.shapeId,
      rot: best.rot,
      t: best.t,
      prep: best.prep,
      aabb: boundsOf(rawWorld),
      rawWorld,
    };
    sheetState.placed.push(rec);
    sheetState.unionOff = mergeBounds(sheetState.unionOff, {
      x: best.prep.offB.x + best.t.x,
      y: best.prep.offB.y + best.t.y,
      width: best.prep.offB.width,
      height: best.prep.offB.height,
    });
    return rec;
  };

  // --- one greedy pass over sheets for a given order ---
  const greedyOnce = (order: NfpPartRequest[], restart: number, scoring: Scoring): GreedyOutcome => {
    const sheets: SheetState[] = [];
    const pool = order.slice();
    let totalPlaced = 0;

    while (pool.length > 0) {
      if (sheets.length >= MAX_SHEETS) break;
      if (restart > 0 && now() > softDeadline) break;

      const sheetState: SheetState = { placed: [], unionOff: null };
      const keep: number[] = [];
      let placedAny = false;

      for (let i = 0; i < pool.length; i++) {
        if (now() > hardDeadline) {
          for (let k = keep.length - 1; k >= 0; k--) pool.splice(keep[k], 1);
          if (keep.length > 0) sheets.push(sheetState);
          return { sheets, pool };
        }
        const part = pool[i];
        const rec = tryPlace(sheetState, part, scoring);
        if (rec) {
          keep.push(i);
          placedAny = true;
          totalPlaced++;
          onProgress?.({ restart, placed: totalPlaced, total: order.length, elapsedMs: now() - start });
        }
      }

      for (let k = keep.length - 1; k >= 0; k--) pool.splice(keep[k], 1);

      if (!placedAny) break; // fresh sheet placed nothing â†’ remaining unplaceable
      sheets.push(sheetState);
    }

    return { sheets, pool };
  };

  const scoreOutcome = (o: GreedyOutcome): number => {
    let occupied = 0;
    for (const s of o.sheets) occupied += s.unionOff ? s.unionOff.width : 0;
    return (
      o.pool.length * 1e6 +
      o.sheets.length * 1e3 +
      occupied / Math.max(W, 1)
    );
  };

  const buildResult = (o: GreedyOutcome, restartsRun: number): NfpCoreResult => {
    const sheetsOut: NfpSheetOut[] = [];
    let placementCounter = 0;
    for (let si = 0; si < o.sheets.length; si++) {
      const st = o.sheets[si];
      const placements: NfpPlacementOut[] = [];
      for (const rec of st.placed) {
        const area = Math.abs(signedArea(rec.prep.raw));
        let perimeter = 0;
        for (let i = 0; i < rec.prep.raw.length; i++) {
          const a = rec.prep.raw[i];
          const b = rec.prep.raw[(i + 1) % rec.prep.raw.length];
          perimeter += Math.hypot(b.x - a.x, b.y - a.y);
        }
        placements.push({
          uniqueId: rec.uniqueId,
          sheetIndex: si,
          x: rec.aabb.x,
          y: rec.aabb.y,
          width: rec.aabb.width,
          height: rec.aabb.height,
          rotationDeg: rec.rot,
          tx: rec.t.x,
          ty: rec.t.y,
          contour: rec.rawWorld,
          area,
          perimeter,
        });
        placementCounter++;
      }
      if (placements.length > 0) sheetsOut.push({ placements });
    }
    return {
      sheets: sheetsOut,
      unplacedUniqueIds: o.pool.map((p) => p.uniqueId),
      score: scoreOutcome(o),
      restartsRun,
      elapsedMs: now() - start,
    };
  };

  // --- restarts: deterministic strategies, then shuffles, bounded by budget ---
  const parts = req.parts;
  let best: GreedyOutcome | null = null;
  let bestScore = Infinity;
  let restartsRun = 0;

  // Each ordering strategy is tried with both scorings: bottom-left 'gravity'
  // packs axis-aligned/near-rectangular jobs far more densely, while 'bbox'
  // growth interleaves irregular shapes better. Running both and keeping the
  // best outcome is therefore never worse than either alone.
  const STRATEGY_COUNT = 7;
  for (let r = 0; r < Math.max(req.maxRestarts, 1); r++) {
    if (r > 0 && now() > softDeadline) break;
    const strategy = r < STRATEGY_COUNT * 2 ? Math.floor(r / 2) : 99;
    const scoring: Scoring = r % 2 === 0 ? 'bbox' : 'gravity';
    const order = orderParts(parts, strategy);
    const outcome = greedyOnce(order, r, scoring);
    restartsRun++;
    const score = scoreOutcome(outcome);
    if (score < bestScore) {
      bestScore = score;
      best = outcome;
    }
    if (outcome.pool.length === 0 && outcome.sheets.length <= 1) {
      // everything fits on a single sheet â€” cannot do better
      break;
    }
  }

  if (!best) {
    best = { sheets: [], pool: parts };
  }
  return buildResult(best, restartsRun);
}



