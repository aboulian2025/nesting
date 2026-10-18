/**
 * @file useUndoRedo.ts
 * خط تراجع (Undo/Redo) لإدارة الحالة العامة للتطبيق:
 * - يسجل لقطات من الحالة الموحدة عند تغيير أي منها
 * - دمج التغييرات السريعة المتتالية (كتابة أرقام / ضغط + متكرر) ضمن عملية تراجع واحدة
 * - حد أقصى 50 لقطة في الذاكرة
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartInput, SheetConfig, SortStrategy, IndividualPartOverride } from '../utils/nesting';

export interface DocState {
  parts: PartInput[];
  partOverrides: Record<string, IndividualPartOverride>;
  sheetConfig: SheetConfig;
  sortStrategy: SortStrategy;
  globalMultiplier: number;
}

const HISTORY_LIMIT = 50;
const COALESCE_MS = 600;
const DOC_KEYS = ['parts', 'partOverrides', 'sheetConfig', 'sortStrategy', 'globalMultiplier'] as const;

export function useUndoRedo(current: DocState) {
  const lastSnapshotRef = useRef<DocState>(current);
  const pastRef = useRef<DocState[]>([]);
  const futureRef = useRef<DocState[]>([]);
  const lastChangeTimeRef = useRef(0);
  const lastChangeKeysRef = useRef<string[]>([]);
  const isUndoingRef = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  // رصد التغييرات الخارجية وتسجيلها في خط التراجع
  useEffect(() => {
    if (isUndoingRef.current) {
      // تم تطبيق تراجع/إعادة — لا نسجل العملية نفسها كتغيير جديد
      isUndoingRef.current = false;
      lastSnapshotRef.current = current;
      return;
    }

    const prev = lastSnapshotRef.current;
    if (!prev) {
      lastSnapshotRef.current = current;
      return;
    }

    const changedKeys = DOC_KEYS.filter((k) => prev[k] !== current[k]);
    if (changedKeys.length === 0) return;

    const now = Date.now();
    const withinWindow = now - lastChangeTimeRef.current < COALESCE_MS;
    const sameKeys =
      changedKeys.length === lastChangeKeysRef.current.length &&
      changedKeys.every((k) => lastChangeKeysRef.current.includes(k));

    // التغييرات السريعة المتشابهة تُدمج في عملية تراجع واحدة (اللقطة السابقة محفوظة بالفعل)
    if (!(withinWindow && sameKeys)) {
      pastRef.current.push(prev);
      if (pastRef.current.length > HISTORY_LIMIT) {
        pastRef.current.shift();
      }
      futureRef.current = []; // أي تغيير جديد يلغي خط الإعادة
    }

    lastChangeTimeRef.current = now;
    lastChangeKeysRef.current = changedKeys;
    lastSnapshotRef.current = current;
    syncFlags();
  }, [current, syncFlags]);

  // التراجع: إرجاع الحالة السابقة ودفع الحالة الحالية إلى خط الإعادة
  const undo = useCallback((): DocState | null => {
    if (pastRef.current.length === 0) return null;

    const prev = pastRef.current.pop()!;
    futureRef.current.push(lastSnapshotRef.current);
    if (futureRef.current.length > HISTORY_LIMIT) {
      futureRef.current.shift();
    }

    lastSnapshotRef.current = prev;
    lastChangeTimeRef.current = 0;
    lastChangeKeysRef.current = [];
    isUndoingRef.current = true;
    syncFlags();
    return prev;
  }, [syncFlags]);

  // الإعادة: إعادة الحالة التالية من خط الإعادة
  const redo = useCallback((): DocState | null => {
    if (futureRef.current.length === 0) return null;

    const next = futureRef.current.pop()!;
    pastRef.current.push(lastSnapshotRef.current);
    if (pastRef.current.length > HISTORY_LIMIT) {
      pastRef.current.shift();
    }

    lastSnapshotRef.current = next;
    lastChangeTimeRef.current = 0;
    lastChangeKeysRef.current = [];
    isUndoingRef.current = true;
    syncFlags();
    return next;
  }, [syncFlags]);

  return { undo, redo, canUndo, canRedo };
}
