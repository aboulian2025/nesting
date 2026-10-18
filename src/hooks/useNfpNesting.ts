import { useEffect, useRef, useState } from 'react';
import {
  buildNfpRequest,
  rawResultToNestingResult,
  DEFAULT_NFP_BUDGET_MS,
  nfpRestartsForBudget,
  DEFAULT_FREE_ROTATION_COUNT,
} from '../utils/nfpEngine.ts';
import type {
  IndividualPartOverride,
  NestingResult,
  PartInput,
  SheetConfig,
} from '../utils/nesting.ts';
import type { NfpCoreResult, NfpProgress, NfpWorkerIn, NfpWorkerOut } from '../utils/nfpTypes.ts';

export interface UseNfpNestingParams {
  enabled: boolean;
  parts: PartInput[];
  sheetConfig: SheetConfig;
  globalMultiplier: number;
  partOverrides: Record<string, IndividualPartOverride>;
  budgetMs?: number;
  freeRotationCount?: number;
  maxRestarts?: number;
  runId?: number;
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
    runId,
    parts,
    sheetConfig,
    globalMultiplier,
    partOverrides,
    budgetMs = DEFAULT_NFP_BUDGET_MS,
    freeRotationCount = DEFAULT_FREE_ROTATION_COUNT,
    maxRestarts = nfpRestartsForBudget(budgetMs),
  } = params;

  const [result, setResult] = useState<NestingResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<NfpProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // String identities for effect deps (object deps change every render)
  const partsKey = JSON.stringify(parts);
  const overridesKey = JSON.stringify(partOverrides);
  const sheetKey = JSON.stringify(sheetConfig);
  const requestKey = JSON.stringify([enabled, partsKey, overridesKey, sheetKey,
    globalMultiplier, budgetMs, freeRotationCount, maxRestarts, runId]);

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
      setSettledKey(requestKey);
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
    setResult(null);
    setError(null);
    setProgress(null);

    const worker = new Worker(new URL('../workers/nfpWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    let active = true;
    let checkpoint: NfpCoreResult | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (raw: NfpCoreResult) => {
      if (!active) return;
      active = false;
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      setSettledKey(requestKey);
      try {
        setResult(rawResultToNestingResult(raw, parts, sheetConfig, globalMultiplier, partOverrides));
        setError(null);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : String(err));
      }
      setProgress(null);
      setRunning(false);
      worker.terminate();
    };

    worker.onmessage = (ev: MessageEvent<NfpWorkerOut>) => {
      if (!active) return;
      const msg = ev.data;
      if (msg.type === 'progress') {
        setProgress(msg.progress);
      } else if (msg.type === 'checkpoint') {
        checkpoint = msg.result;
        if (deadlineTimer === undefined) {
          deadlineTimer = setTimeout(() => {
            if (checkpoint) settle({ ...checkpoint, optimizationTimedOut: true,
              elapsedMs: Math.max(checkpoint.elapsedMs, budgetMs) });
          }, Math.max(0, budgetMs - checkpoint.elapsedMs));
        }
      } else if (msg.type === 'done') {
        settle(msg.result);
      } else if (msg.type === 'error') {
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        setSettledKey(requestKey);
        setError(msg.message);
        setProgress(null);
        setRunning(false);
      }
    };

    worker.onerror = (ev: ErrorEvent) => {
      if (!active) return;
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      setSettledKey(requestKey);
      setError(ev.message || 'NFP worker failed');
      setRunning(false);
    };

    const msg: NfpWorkerIn = { type: 'run', request };
    worker.postMessage(msg);

    return () => {
      active = false;
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
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
    runId,
  ]);

  const isCurrent = settledKey === requestKey;
  return {
    result: enabled && isCurrent ? result : null,
    running: enabled && (!isCurrent || running),
    progress: enabled ? progress : null,
    error: enabled && isCurrent ? error : null,
  };
}
