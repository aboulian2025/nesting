import { signedArea, convexHull } from './contour.ts';
import { nestSheets, type PartInput } from './nesting.ts';
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
const VALIDATION_SCALE = 1000000;
// Offset arcs must not consume a significant fraction of the requested gap.
const CURVE_TOLERANCE = 0.01;
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
  exactOff: Pt[];
}

interface PreparedShape {
  off: Pt[];
  exactOff: Pt[];
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
  // Rectangles pack on axis contacts; bevel sampling only adds redundant NFP
  // vertices there. Square joins keep those common jobs fast and exact.
  const axisRect = polygon.length === 4 && polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return Math.abs(a.x - b.x) < 1e-8 || Math.abs(a.y - b.y) < 1e-8;
  });
  co.AddPath(p, axisRect ? C.JoinType.jtMiter : C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, offset * CLIPPER_SCALE);
  const result: Pt[][] = [];
  for (let i = 0; i < out.length; i++) {
    const path = out[i];
    if (path && path.length > 2) result.push(toNest(path, CLIPPER_SCALE));
  }
  return result;
}

// Minkowski sums are extremely expensive on sampled curves. Build a small
// conservative proxy, and prove it contains the complete clearance outline
// with a polygon difference. Render/export geometry is never simplified.
export function collisionProxy(C: any, original: Pt[]): Pt[] {
  if (original.length <= 32) return original;
  const source = toClipper(original);
  C.JS.ScaleUpPath(source, CLIPPER_SCALE);
  for (const tolerance of [0.05, 0.1, 0.25, 0.5]) {
    const clean = C.Clipper.CleanPolygon(source, tolerance * CLIPPER_SCALE);
    if (clean.length < 3 || clean.length >= original.length) continue;
    for (const growth of [tolerance, tolerance*2, tolerance*4]) {
      const offset = new C.ClipperOffset(2, CURVE_TOLERANCE * CLIPPER_SCALE);
      offset.AddPath(clean, C.JoinType.jtMiter, C.EndType.etClosedPolygon);
      const grown = new C.Paths();
      offset.Execute(grown, growth * CLIPPER_SCALE);
      if (grown.length !== 1 || grown[0].length >= original.length) continue;
      const difference = new C.Paths();
      const clipper = new C.Clipper();
      clipper.AddPath(source, C.PolyType.ptSubject, true);
      clipper.AddPaths(grown, C.PolyType.ptClip, true);
      clipper.Execute(C.ClipType.ctDifference, difference, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
      if (difference.some((p: any) => Math.abs(C.Clipper.Area(p)) > 0)) continue;
      if (grown[0].length <= 64 || tolerance === 0.5) return toNest(grown[0], CLIPPER_SCALE);
    }
  }
  return original;
}

// svgnest cleanPolygon: simplify self-intersections, keep biggest piece, drop noise.
function cleanPolygon(C: any, polygon: Pt[]): Pt[] | null {
  const p = toClipper(polygon);
  C.JS.ScaleUpPath(p, CLIPPER_SCALE);
  const simple = C.Clipper.SimplifyPolygon(p, C.PolyFillType.pftNonZero);
  if (!simple || simple.length === 0) return null;
  // Keep every lobe of a self-intersecting path in the collision envelope.
  // Dropping smaller lobes can move original artwork beyond the sheet edge.
  if (simple.length > 1) return convexHull(polygon);
  let biggest = simple[0];
  let biggestArea = Math.abs(C.Clipper.Area(biggest));
  for (let i = 1; i < simple.length; i++) {
    const area = Math.abs(C.Clipper.Area(simple[i]));
    if (area > biggestArea) {
      biggest = simple[i];
      biggestArea = area;
    }
  }
  const clean = C.Clipper.CleanPolygon(biggest, 0.001 * CLIPPER_SCALE);
  if (!clean || clean.length === 0) return null;
  return toNest(clean, CLIPPER_SCALE);
}

// svgnest minkowskiDifference (svgnest.js:491) â€” outer NFP between A and B at origin.
function minkowskiDifference(G: any, C: any, A: Pt[], B: Pt[]): Pt[][] {
  const convex = (points: Pt[]) => {
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
      const cross = (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if (Math.abs(cross) < 1e-8) continue;
      const next = Math.sign(cross);
      if (sign && sign !== next) return false;
      sign = next;
    }
    return sign !== 0;
  };
  // For convex pairs the hull of vertex differences is the exact Minkowski
  // difference. Avoid Clipper's costly union of thousands of tiny quads.
  // A large concave Minkowski union is indivisible in Clipper and can block
  // a worker for seconds. Its convex envelope is a safe search-only obstacle;
  // exact outlines still govern compaction and final clearance validation.
  if ((convex(A) && convex(B)) || A.length * B.length > 1024) {
    const sums: Pt[] = [];
    for (const a of A) for (const b of B) sums.push({ x: a.x-b.x, y: a.y-b.y });
    return [convexHull(sums).map(p => ({ x: p.x+B[0].x, y: p.y+B[0].y }))];
  }
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

function orderParts(parts: NfpPartRequest[], strategy: number, seed = 1): NfpPartRequest[] {
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
    case 4:
      arr.sort((a, b) => b.width - a.width || b.height - a.height);
      break;
    case 5:
      arr.sort((a, b) => b.height - a.height || b.width - a.width);
      break;
    case 6:
      arr.sort((a, b) =>
        Math.max(b.width, b.height) / Math.min(b.width, b.height) -
        Math.max(a.width, a.height) / Math.min(a.width, a.height));
      break;
    default:
      for (let i = arr.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = Math.floor((seed / 0x100000000) * (i + 1));
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
  onCheckpoint?: (result: NfpCoreResult) => void,
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

  // Imported files can contain many identical shapes with different IDs.
  // Share expensive offset/Minkowski caches by geometry, not by UI identity.
  const geometryIds = new Map<string, string>();
  const shapeAliases = new Map<string, string>();
  for (const part of req.parts) {
    // Match the integer geometry actually used by Clipper (one micron).
    const geometry = JSON.stringify(part.contour.map(p => [
      Math.round(p.x*CLIPPER_SCALE), Math.round(p.y*CLIPPER_SCALE),
    ]));
    const id = geometryIds.get(geometry) ?? part.shapeId;
    geometryIds.set(geometry, id);
    shapeAliases.set(part.shapeId, id);
  }
  const shapeKey = (id: string) => shapeAliases.get(id) ?? id;

  const softDeadline = start + Math.max(req.budgetMs, 1);
  const hardDeadline = softDeadline;

  // The sheet constraint uses the real contour. Expanded collision outlines
  // apply only between parts, independently of the sheet-edge margin.
  const m = margin;
  let binPolygon: Pt[] = [
    { x: m, y: m },
    { x: W - m, y: m },
    { x: W - m, y: H - m },
    { x: m, y: H - m },
  ];
  if (G.polygonArea(binPolygon) > 0) binPolygon.reverse();
  const binBounds = boundsOf(binPolygon);
  const binArea = Math.abs(G.polygonArea(binPolygon));

  // --- per-shape prep (clean + winding + gap/2 expansion), cached ---
  const shapeLocal = new Map<string, ShapeLocal | null>();
  const shapeOf = (part: NfpPartRequest): ShapeLocal | null => {
    const id = shapeKey(part.shapeId);
    const hit = shapeLocal.get(id);
    if (hit !== undefined) return hit;
    let raw = part.contour;
    if (raw.length > 3) {
      const cleaned = cleanPolygon(C, raw);
      if (cleaned && cleaned.length > 2) raw = cleaned;
    }
    if (raw.length < 3 || Math.abs(G.polygonArea(raw)) < CURVE_TOLERANCE * CURVE_TOLERANCE) {
      shapeLocal.set(id, null);
      return null;
    }
    if (G.polygonArea(raw) > 0) raw = raw.map((p) => ({ x: p.x, y: p.y }));
    if (G.polygonArea(raw) > 0) raw.reverse();
    let off = raw;
    if (gap > 0) {
      const expanded = polygonOffset(C, raw, 0.5 * gap);
      if (expanded.length === 1) off = expanded[0];
    }
    const exactOff = off;
    off = collisionProxy(C, off);
    if (G.polygonArea(off) > 0) off = off.map((p) => ({ x: p.x, y: p.y }));
    if (G.polygonArea(off) > 0) off.reverse();
    const local: ShapeLocal = { raw, off, exactOff };
    shapeLocal.set(id, local);
    return local;
  };

  // --- rotated prep cache: `${shapeId}|${rot}` ---
  const rotCache = new Map<string, PreparedShape | null>();
  const prepFor = (part: NfpPartRequest, rot: number): PreparedShape | null => {
    const key = `${shapeKey(part.shapeId)}|${rot}`;
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
      exactOff: rotatePoly(local.exactOff, rot),
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
    const key = `${shapeKey(part.shapeId)}|${rot}`;
    const hit = binNfpCache.get(key);
    if (hit !== undefined) return hit;
    let nfp: Pt[][] | null = null;
    if (prep.rawB.width > binBounds.width + 1e-9 || prep.rawB.height > binBounds.height + 1e-9) {
      nfp = null;
    } else if (G.isRectangle(binPolygon, 0.001)) {
      nfp = G.noFitPolygonRectangle(binPolygon, prep.raw);
    } else {
      nfp = G.noFitPolygon(binPolygon, prep.raw, true, false);
    }
    if (nfp && nfp.length > 0) {
      for (const path of nfp) {
        // SVGnest NFP coordinates refer to the movable polygon's first point.
        // Pair NFPs use off[0], so express this raw-contour constraint likewise.
        for (const pt of path) {
          pt.x += prep.off[0].x - prep.raw[0].x;
          pt.y += prep.off[0].y - prep.raw[0].y;
        }
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
    const key = `${shapeKey(aShapeId)}|${aRot}|${shapeKey(bPart.shapeId)}|${bRot}`;
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
    // Guard against rounding translated NFPs onto Clipper's one-micron grid.
    // Two extra microns prevent a contact point turning into a thin overlap.
    nfp = nfp.flatMap(path => polygonOffset(C, path, 0.002));
    for (const path of nfp) {
      if (G.polygonArea(path) > 0) path.reverse();
    }
    pairNfpCache.set(key, nfp);
    return nfp;
  };

  // --- try to place one part into the current sheet (all rotations) ---
  const tryPlace = (sheetState: SheetState, part: NfpPartRequest, scoring: Scoring): PlacedRec | null => {
    let best: { t: Pt; prep: PreparedShape; rot: number; score: number } | null = null;
    const rotations = (part.rotations.length > 0 ? part.rotations.slice() : [0]).sort((a,b) =>
      Number(Math.abs(b % 90) < 1e-7) - Number(Math.abs(a % 90) < 1e-7));
    for (const rot of rotations) {
      if (now() > hardDeadline) break;
      const prep = prepFor(part, rot);
      if (!prep) break;
      if (
        prep.rawB.width > binBounds.width + 1e-9 ||
        prep.rawB.height > binBounds.height + 1e-9
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
          if (now() >= hardDeadline) return null;
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
            if (cleaned.length > 2 && area > 1e-8 * CLIPPER_SCALE * CLIPPER_SCALE) {
              clipper.AddPath(cleaned, C.PolyType.ptSubject, true);
            }
          }
        }
        if (now() >= hardDeadline) return null;
        if (nfpMissing) continue;
        if (!clipper.Execute(C.ClipType.ctUnion, combinedNfp, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) {
          continue;
        }

        // Clipper drops zero-area subjects. Exact-width/height fits have a
        // feasible line (or point), not a polygon: intersect that line with the
        // forbidden boundaries and retain its legal endpoints/contact points.
        const domain = boundsOf(binNfp[0]);
        if (domain.width < 1e-7 || domain.height < 1e-7) {
          const points: Pt[] = [...binNfp[0]];
          for (const path of combinedNfp) {
            const poly = toNest(path, CLIPPER_SCALE);
            for (let i = 0; i < poly.length; i++) {
              const a = poly[i];
              const b = poly[(i + 1) % poly.length];
              for (const axis of ['x', 'y'] as const) {
                if ((axis === 'x' ? domain.width : domain.height) >= 1e-7) continue;
                const value = domain[axis];
                const delta = b[axis] - a[axis];
                if (Math.abs(delta) < 1e-9) {
                  if (Math.abs(a[axis] - value) < 1e-7) points.push(a, b);
                  continue;
                }
                const t = (value - a[axis]) / delta;
                if (t >= 0 && t <= 1) points.push({
                  x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y),
                });
              }
            }
          }
          for (const pt of points) {
            if (pt.x < domain.x - 1e-7 || pt.x > domain.x + domain.width + 1e-7 ||
                pt.y < domain.y - 1e-7 || pt.y > domain.y + domain.height + 1e-7) continue;
            let winding = 0;
            let boundary = false;
            const cp = { X: Math.round(pt.x * CLIPPER_SCALE), Y: Math.round(pt.y * CLIPPER_SCALE) };
            for (const path of combinedNfp) {
              const inside = C.Clipper.PointInPolygon(cp, path);
              if (inside === -1) boundary = true;
              if (inside === 1) winding += C.Clipper.Orientation(path) ? 1 : -1;
            }
            if (winding !== 0 && !boundary) continue;
            const t = { x: pt.x - prep.off[0].x, y: pt.y - prep.off[0].y };
            const shifted = { ...prep.offB, x: prep.offB.x + t.x, y: prep.offB.y + t.y };
            const merged = mergeBounds(sheetState.unionOff, shifted);
            const growth = merged.width * 2 + merged.height;
            const score = scoring === 'gravity' ? shifted.y * 1e7 + growth : growth;
            if (!best || score < best.score - 1e-9 ||
                (almostEqual(score, best.score) && t.x < best.t.x)) best = { t, prep, rot, score };
          }
          continue;
        }

        if (now() >= hardDeadline) return null;
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
            Math.abs(C.Clipper.Area(p)) >= 1e-8 * CLIPPER_SCALE * CLIPPER_SCALE,
        );
        if (cleanedFinal.length === 0) continue;

        candidates = [];
        const placedBounds = sheetState.unionOff;
        for (const path of cleanedFinal) {
          const nf = toNest(path, CLIPPER_SCALE);
          if (Math.abs(G.polygonArea(nf)) < 1e-6) continue;
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
      // No angle can improve bbox growth below the existing envelope. Once a
      // piece fills a pocket without growing it, spend the budget on other parts.
      if (scoring === 'bbox' && best && sheetState.unionOff &&
          best.score <= sheetState.unionOff.width*2+sheetState.unionOff.height+1e-8) break;
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
    for (const s of o.sheets) {
      const bounds = s.placed.reduce<Bnds | null>((b, p) => mergeBounds(b, p.aabb), null);
      if (bounds) {
        const area = bounds.width * bounds.height;
        occupied += area / (Math.max(W * H, 1) + area);
      }
    }
    return (
      o.pool.length * (req.parts.length + 1) +
      o.sheets.length +
      occupied / (req.parts.length + 1)
    );
  };

  const legalOutcome = (outcome: GreedyOutcome): boolean => {
    for (const sheet of outcome.sheets) {
      const cached = sheet.placed.map(p => {
        const clip = toClipper(translatePoly(p.prep.exactOff, p.t));
        C.JS.ScaleUpPath(clip, VALIDATION_SCALE);
        return { rec: p, clip };
      });
      for (let i = 0; i < cached.length; i++) {
        const { rec: p, clip } = cached[i];
        if (p.aabb.x < margin-1e-6 || p.aabb.y < margin-1e-6 ||
            p.aabb.x+p.aabb.width > W-margin+1e-6 || p.aabb.y+p.aabb.height > H-margin+1e-6) return false;
        for (let j = 0; j < i; j++) {
          const other = cached[j].rec;
          const a = { x:p.prep.offB.x+p.t.x, y:p.prep.offB.y+p.t.y, ...{ width:p.prep.offB.width, height:p.prep.offB.height } };
          const b = { x:other.prep.offB.x+other.t.x, y:other.prep.offB.y+other.t.y, width:other.prep.offB.width, height:other.prep.offB.height };
          if (a.x+a.width <= b.x || b.x+b.width <= a.x || a.y+a.height <= b.y || b.y+b.height <= a.y) continue;
          const intersection = new C.Paths(), checker = new C.Clipper();
          checker.AddPath(clip, C.PolyType.ptSubject, true);
          checker.AddPath(cached[j].clip, C.PolyType.ptClip, true);
          checker.Execute(C.ClipType.ctIntersection, intersection, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
          if (intersection.some((path: any) => Math.abs(C.Clipper.Area(path)) > 1)) return false;
        }
      }
    }
    return true;
  };

  // Tighten a complete layout against the original clearance outlines, rather
  // than the conservative fast-search proxies. Only accept a non-worse result.
  const compactOutcome = (input: GreedyOutcome, deadline: number): GreedyOutcome => {
    if (now() >= deadline) return input;
    const result: GreedyOutcome = { pool: input.pool.slice(), sheets: input.sheets.map(s => ({
      placed: s.placed.map(p => ({ ...p, t: { ...p.t } })), unionOff: s.unionOff,
    })) };
    for (let pass = 0; pass < 3 && now() < deadline; pass++) {
      let moved = false;
      for (const sheet of result.sheets) {
        const order = sheet.placed.slice().sort((a, b) => pass % 2
          ? b.aabb.y-a.aabb.y || b.aabb.x-a.aabb.x
          : a.aabb.y-b.aabb.y || a.aabb.x-b.aabb.x);
        for (const rec of order) {
          if (now() >= deadline) break;
          const fixed = sheet.placed.filter(p => p !== rec).map(p => {
            const clip = toClipper(translatePoly(p.prep.exactOff, p.t));
            C.JS.ScaleUpPath(clip, VALIDATION_SCALE);
            return { clip, bounds: { ...p.prep.offB, x: p.prep.offB.x+p.t.x, y: p.prep.offB.y+p.t.y }, raw: p.aabb };
          });
          const legal = (t: Pt) => {
            const bounds = { ...rec.prep.offB, x: rec.prep.offB.x+t.x, y: rec.prep.offB.y+t.y };
            let clip: ReturnType<typeof toClipper> | null = null;
            for (const other of fixed) {
              const b = other.bounds;
              if (bounds.x+bounds.width <= b.x || b.x+b.width <= bounds.x ||
                  bounds.y+bounds.height <= b.y || b.y+b.height <= bounds.y) continue;
              if (!clip) { clip = toClipper(translatePoly(rec.prep.exactOff, t)); C.JS.ScaleUpPath(clip, VALIDATION_SCALE); }
              const intersection = new C.Paths();
              const checker = new C.Clipper();
              checker.AddPath(clip, C.PolyType.ptSubject, true);
              checker.AddPath(other.clip, C.PolyType.ptClip, true);
              checker.Execute(C.ClipType.ctIntersection, intersection, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
              if (intersection.some((p: any) => Math.abs(C.Clipper.Area(p)) > 1)) return false;
            }
            return true;
          };
          for (const axis of (pass % 2 ? ['y', 'x'] : ['x', 'y']) as Array<'x'|'y'>) {
            const low = margin - rec.prep.rawB[axis];
            const current = rec.t[axis];
            if (current-low < 0.01) continue;
            const candidates = [low, current];
            for (let i = 1; i < 16; i++) candidates.push(low+(current-low)*i/16);
            for (const f of fixed) {
              const size = axis === 'x' ? 'width' : 'height';
              candidates.push(f.raw[axis]+f.raw[size]+gap-rec.prep.rawB[axis]);
            }
            const sorted = [...new Set(candidates)].filter(v => v >= low && v <= current).sort((a,b) => a-b);
            let previous = low, target = current;
            for (const value of sorted) {
              if (now() >= deadline) break;
              if (legal({ ...rec.t, [axis]: value })) { target = value; break; }
              previous = value;
            }
            for (let i = 0; i < 16 && target-previous > 0.002 && now() < deadline; i++) {
              const value = (previous+target)/2;
              if (legal({ ...rec.t, [axis]: value })) target=value; else previous=value;
            }
            if (target < current-0.001) {
              rec.t = { ...rec.t, [axis]: target };
              rec.rawWorld = translatePoly(rec.prep.raw, rec.t);
              rec.aabb = boundsOf(rec.rawWorld);
              moved = true;
            }
          }
        }
        sheet.unionOff = sheet.placed.reduce<Bnds | null>((b,p) => mergeBounds(b, {
          ...p.prep.offB, x:p.prep.offB.x+p.t.x, y:p.prep.offB.y+p.t.y,
        }), null);
      }
      if (!moved) break;
    }
    return scoreOutcome(result) < scoreOutcome(input)-1e-10 && legalOutcome(result) ? result : input;
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
  // Start with a cheap complete solution before spending time on Minkowski
  // pairs. A timed-out optimisation must never replace eight input pieces
  // with a partial two-piece layout (OL.svg regression).
  const baselineParts: PartInput[] = [];
  const baselineMeta = new Map<string, { part: NfpPartRequest; base: number; alt?: number }>();
  for (const part of parts) {
    const rotations = part.rotations.length ? part.rotations : [0];
    const choices = rotations.map(rot => ({ rot, bounds: boundsOf(rotatePoly(part.contour, rot)) }));
    const fits = choices.filter(c => c.bounds.width <= W - 2 * margin + 1e-7 &&
      c.bounds.height <= H - 2 * margin + 1e-7);
    const chosen = (fits.length ? fits : choices).slice().sort((a, b) =>
      a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)[0];
    const alt = rotations.find(rot => {
      const delta = ((rot - chosen.rot) % 360 + 360) % 360;
      return almostEqual(delta, 90) || almostEqual(delta, 270);
    });
    baselineMeta.set(part.uniqueId, { part, base: chosen.rot, alt });
    baselineParts.push({
      id: part.uniqueId, name: part.name, count: 1,
      width: chosen.bounds.width, height: chosen.bounds.height,
      grain: alt === undefined ? 'width' : 'free',
    });
  }
  const unpackSeed = (packed: ReturnType<typeof nestSheets>): GreedyOutcome => {
  const baseline: GreedyOutcome = { sheets: [], pool: [] };
  const baselinePlaced = new Set<string>();
  for (const packedSheet of packed.sheets) {
    const state: SheetState = { placed: [], unionOff: null };
    for (const placed of packedSheet.placedParts) {
      const meta = baselineMeta.get(placed.id)!;
      const rot = placed.rotated ? meta.alt! : meta.base;
      const prep = prepFor(meta.part, rot);
      if (!prep) continue;
      const t = { x: placed.x - prep.rawB.x, y: placed.y - prep.rawB.y };
      const rawWorld = translatePoly(prep.raw, t);
      state.placed.push({ uniqueId: meta.part.uniqueId, shapeId: meta.part.shapeId,
        rot, t, prep, aabb: boundsOf(rawWorld), rawWorld });
      state.unionOff = mergeBounds(state.unionOff, {
        ...prep.offB, x: prep.offB.x + t.x, y: prep.offB.y + t.y,
      });
      baselinePlaced.add(meta.part.uniqueId);
    }
    if (state.placed.length) baseline.sheets.push(state);
  }
  baseline.pool = parts.filter(p => !baselinePlaced.has(p.uniqueId));
  return baseline;
  };
  const baseline = unpackSeed(nestSheets(baselineParts, sheet, 'optimal'));
  const occupiedArea = (o: GreedyOutcome) => o.sheets.reduce((sum,s) => {
    const bounds = s.placed.reduce<Bnds | null>((b,p) => mergeBounds(b,p.aabb), null);
    return sum+(bounds ? bounds.width*bounds.height : 0);
  }, 0);
  const finish = (o: GreedyOutcome, method: 'baseline'|'compacted'|'nfp', restarts: number) => {
    const result = buildResult(o, restarts);
    result.layoutMethod = method;
    result.optimizationTimedOut = now() >= softDeadline;
    result.baselineAreaMm2 = occupiedArea(baseline);
    result.occupiedAreaMm2 = occupiedArea(o);
    result.improvementPercent = result.baselineAreaMm2 > 0
      ? (1-result.occupiedAreaMm2/result.baselineAreaMm2)*100 : 0;
    return result;
  };
  // Publish a complete recoverable layout before any expensive polygon search.
  onCheckpoint?.(finish(baseline, 'baseline', 0));
  let seed = baseline;
  // MaxRects primarily minimises sheet count. On a one-sheet job, also search
  // narrower/shorter bins so small parts occupy pockets instead of a wide strip.
  // Every candidate is mapped back to the real sheet without scaling the parts.
  const seedDeadline = start + req.budgetMs * 0.15;
  for (const axis of ['sheetWidth', 'sheetHeight'] as const) {
    for (const fraction of [0.85, 0.7, 0.6, 0.5, 0.4]) {
      if (now() >= seedDeadline) break;
      const constrained = { ...sheet, [axis]: 2*margin+(sheet[axis]-2*margin)*fraction };
      const candidate = unpackSeed(nestSheets(baselineParts, constrained, 'optimal'));
      if (scoreOutcome(candidate) < scoreOutcome(seed) && legalOutcome(candidate)) {
        seed = candidate;
        onCheckpoint?.(finish(seed, 'compacted', 0));
      }
    }
  }
  let best: GreedyOutcome = compactOutcome(seed, Math.min(softDeadline, start+req.budgetMs*0.4));
  let bestScore = scoreOutcome(best);
  let bestMethod: 'baseline'|'compacted'|'nfp' = best === baseline ? 'baseline' : 'compacted';
  let restartsRun = 0;
  onCheckpoint?.(finish(best, bestMethod, restartsRun));

  // Refine the complete seed first. Removing/reinserting small concave pieces
  // can use pockets that a new greedy run might not reach before its deadline.
  const byId = new Map(parts.map(p => [p.uniqueId, p]));
  const reinsertionOrder = parts.slice().sort((a,b) => a.contour.length-b.contour.length);
  for (const part of reinsertionOrder) {
    if (now() >= start+req.budgetMs*0.65) break;
    const trial: GreedyOutcome = { pool: best.pool.slice(), sheets: best.sheets.map(s => ({
      placed: s.placed.filter(p => p.uniqueId !== part.uniqueId), unionOff: null,
    })) };
    if (!best.sheets.some(s => s.placed.some(p => p.uniqueId === part.uniqueId))) continue;
    for (const s of trial.sheets) s.unionOff = s.placed.reduce<Bnds | null>((b,p) => mergeBounds(b, {
      ...p.prep.offB, x:p.prep.offB.x+p.t.x, y:p.prep.offB.y+p.t.y,
    }), null);
    let inserted = false;
    for (const s of trial.sheets) {
      if (tryPlace(s, byId.get(part.uniqueId)!, 'bbox')) { inserted=true; break; }
      if (now() >= softDeadline) break;
    }
    if (!inserted) continue;
    trial.sheets = trial.sheets.filter(s => s.placed.length);
    const tightened = compactOutcome(trial, Math.min(softDeadline, start+req.budgetMs*0.7));
    const score = scoreOutcome(tightened);
    if (score < bestScore-1e-10 && legalOutcome(tightened)) { best=tightened; bestScore=score; bestMethod='nfp'; onCheckpoint?.(finish(best, bestMethod, restartsRun)); }
  }

  // Each ordering strategy is tried with both scorings: bottom-left 'gravity'
  // packs axis-aligned/near-rectangular jobs far more densely, while 'bbox'
  // growth interleaves irregular shapes better. Running both and keeping the
  // best outcome is therefore never worse than either alone.
  const STRATEGY_COUNT = 7;
  for (let r = 0; r < Math.max(req.maxRestarts, 1); r++) {
    if (now() > softDeadline) break;
    const strategy = r < STRATEGY_COUNT * 2 ? Math.floor(r / 2) : 99;
    const scoring: Scoring = r % 2 === 0 ? 'bbox' : 'gravity';
    const order = orderParts(parts, strategy, r + 1);
    const outcome = compactOutcome(greedyOnce(order, r, scoring), softDeadline);
    restartsRun++;
    const score = scoreOutcome(outcome);
    if (score < bestScore && legalOutcome(outcome)) {
      bestScore = score;
      best = outcome;
      bestMethod = 'nfp';
      onCheckpoint?.(finish(best, bestMethod, restartsRun));
    }
    // Even one-sheet jobs benefit from later compacting passes: the remaining
    // reusable offcut can be much larger with a different order or scoring.
  }

  return finish(best, bestMethod, restartsRun);
}
