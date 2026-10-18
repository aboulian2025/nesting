/// <reference lib="webworker" />
import { runGreedyNest, type NfpDeps } from '../utils/nfpCore.ts';
import type { NfpWorkerIn, NfpWorkerOut } from '../utils/nfpTypes.ts';

// Classic-glue module worker: loads SVGnest vendor scripts (geometryutil + clipper,
// MIT — see THIRD_PARTY_NOTICES.md) at runtime via fetch + eval so they run as
// classic-script globals (self.GeometryUtil / self.ClipperLib) inside a module worker.

const ctx = self as unknown as {
  postMessage(msg: NfpWorkerOut): void;
  onmessage: ((ev: MessageEvent<NfpWorkerIn>) => void) | null;
};

let vendorPromise: Promise<NfpDeps> | null = null;

function loadVendor(): Promise<NfpDeps> {
  if (vendorPromise) return vendorPromise;
  vendorPromise = (async () => {
    const [geomSrc, clipSrc] = await Promise.all([
      fetch('/svgnest/geometryutil.js').then((r) => {
        if (!r.ok) throw new Error(`geometryutil.js: HTTP ${r.status}`);
        return r.text();
      }),
      fetch('/svgnest/clipper.js').then((r) => {
        if (!r.ok) throw new Error(`clipper.js: HTTP ${r.status}`);
        return r.text();
      }),
    ]);
    // Vendor files attach to `self` when `window`/`document` are absent (worker env).
    new Function(geomSrc)();
    new Function(clipSrc)();
    const w = self as unknown as { GeometryUtil?: unknown; ClipperLib?: unknown };
    if (!w.GeometryUtil || !w.ClipperLib) {
      throw new Error('SVGnest vendor globals failed to initialise');
    }
    return { GeometryUtil: w.GeometryUtil, ClipperLib: w.ClipperLib };
  })();
  return vendorPromise;
}

ctx.onmessage = async (ev: MessageEvent<NfpWorkerIn>) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'run') return;
  try {
    const deps = await loadVendor();
    let lastProgressAt=0;
    const result = runGreedyNest(deps, msg.request, (progress) => {
      const time=performance.now();
      if (time-lastProgressAt<100 && progress.placed!==progress.total) return;
      lastProgressAt=time;
      ctx.postMessage({ type: 'progress', progress });
    }, (result) => ctx.postMessage({ type: 'checkpoint', result }));
    ctx.postMessage({ type: 'done', result });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

ctx.postMessage({ type: 'ready' });
