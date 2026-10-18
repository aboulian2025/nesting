import { useEffect, useRef, useState } from 'react';
import {
  buildNfpRequest,
  rawResultToNestingResult,
  DEFAULT_NFP_BUDGET_MS,
  DEFAULT_NFP_RESTARTS,
  DEFAULT_FREE_ROTATION_COUNT,
} from '../utils/nfpEngine.ts';
import type {
  IndividualPartOverride,
  NestingResult,
  PartInput,
  SheetConfig,
} from '../utils/nesting.ts';
import type { NfpProgress, NfpWorkerIn, NfpWorkerOut } from '../utils/nfpTypes.ts';

export interface UseNfpNestingParams {
  enabled: boolean;
  parts: PartInput[];
  sheetConfig: SheetConfig;
  globalMultiplier: number;
  partOverrides: Record<string, IndividualPartOverride>;
  budgetMs?: number;
  freeRotationCount?: number;
  maxRestarts?: number;
}

export interface UseNfpNestingState {
  result: NestingResult | null;
  running: boolean;
  progress: NfpProgress | null;
  error: string | null;
}

/**
 * Runs the irregular-shape (NFP) greedy engine in a web worker.
 * The worker is terminated on dependency changes/unmount, so a stale
 * run can never overwrite a newer one.
 */
export function useNfpNesting(params: UseNfpNestingParams): UseNfpNestingState {
  const {
    enabled,
    parts,
    sheetConfig,
    globalMultiplier,
    partOverrides,
    budgetMs = DEFAULT_NFP_BUDGET_MS,
    freeRotationCount = DEFAULT_FREE_ROTATION_COUNT,
    maxRestarts = DEFAULT_NFP_RESTARTS,
  } = params;

  const [result, setResult] = useState<NestingResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<NfpProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // String identities for effect deps (object deps change every render)
  const partsKey = JSON.stringify(parts);
  const overridesKey = JSON.stringify(partOverrides);
  const sheetKey = JSON.stringify(sheetConfig);

  useEffect(() => {
    if (!enabled) {
      setRunning(false);
      return;
    }

    const request = buildNfpRequest(parts, sheetConfig, globalMultiplier, partOverrides, {
      budgetMs,
      freeRotationCount,
      maxRestarts,
    });

    if (request.parts.length === 0) {
      setResult(
        rawResultToNestingResult(
          { sheets: [], unplacedUniqueIds: [], score: 0, restartsRun: 0, elapsedMs: 0 },
          [],
          sheetConfig,
          globalMultiplier,
          {},
        ),
      );
      setRunning(false);
      setError(null);
      setProgress(null);
      return;
    }

    setRunning(true);
    setError(null);
    setProgress(null);

    const worker = new Worker(new URL('../workers/nfpWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<NfpWorkerOut>) => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        setProgress(msg.progress);
      } else if (msg.type === 'done') {
        setResult(
          rawResultToNestingResult(
            msg.result,
            parts,
            sheetConfig,
            globalMultiplier,
            partOverrides,
          ),
        );
        setProgress(null);
        setRunning(false);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setProgress(null);
        setRunning(false);
      }
    };

    worker.onerror = (ev: ErrorEvent) => {
      setError(ev.message || 'NFP worker failed');
      setRunning(false);
    };

    const msg: NfpWorkerIn = { type: 'run', request };
    worker.postMessage(msg);

    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    partsKey,
    overridesKey,
    sheetKey,
    globalMultiplier,
    budgetMs,
    freeRotationCount,
    maxRestarts,
  ]);

  return { result, running, progress, error };
}
