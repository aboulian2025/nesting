/**
 * @file CncControlsBar.tsx
 * شريط التحكم المباشر في الواجهة:
 * - الأبعاد المخصصة للوح (Width, Height بالمليمتر)
 * - هامش اللوح (sheetMargin) وسماكة سلاح المنشار (partGap)
 * - خيارات أولوية ترتيب القطع قبل التسكين
 * - خيار التحكم الكلي في تكرار وكمية التصميم (Global Design Multiplier)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Sliders,
  Copy,
  Scissors,
  ArrowUpDown,
  CheckCircle2,
  LayoutGrid,
  Shapes,
  Timer,
  RotateCw,
  Loader2,
  AlertTriangle,
  Play
} from 'lucide-react';
import { SheetConfig, SortStrategy } from '../utils/nesting';

export type EngineMode = 'rect' | 'nfp';

interface CncControlsBarProps {
  config: SheetConfig;
  onChangeConfig: (newConfig: SheetConfig) => void;
  sortStrategy: SortStrategy;
  onChangeSortStrategy: (strategy: SortStrategy) => void;
  globalMultiplier: number;
  onChangeGlobalMultiplier: (multiplier: number) => void;
  language: 'ar' | 'en';
  engineMode: EngineMode;
  onChangeEngineMode: (mode: EngineMode) => void;
  nfpBudgetMs: number;
  onChangeNfpBudgetMs: (ms: number) => void;
  freeRotationCount: number;
  onChangeFreeRotationCount: (count: number) => void;
  onStartNfp: () => void;
  nfpCanStart: boolean;
  nfpWaiting: boolean;
  nfpRunning?: boolean;
  nfpProgress?: { placed: number; total: number; elapsedMs?: number } | null;
  nfpError?: string | null;
}

export const CncControlsBar: React.FC<CncControlsBarProps> = ({
  config,
  onChangeConfig,
  sortStrategy,
  onChangeSortStrategy,
  globalMultiplier,
  onChangeGlobalMultiplier,
  language,
  engineMode,
  onChangeEngineMode,
  nfpBudgetMs,
  onChangeNfpBudgetMs,
  freeRotationCount,
  onChangeFreeRotationCount,
  onStartNfp,
  nfpCanStart,
  nfpWaiting,
  nfpRunning,
  nfpProgress,
  nfpError
}) => {
  const isAr = language === 'ar';

  // وميض تأكيد بصرية عند تغيير أولوية الترتيب لإظهار استجابة فورية
  const [sortFlash, setSortFlash] = useState(0);
  const isFirstSortRender = useRef(true);

  useEffect(() => {
    if (isFirstSortRender.current) {
      isFirstSortRender.current = false;
      return;
    }
    setSortFlash((f) => f + 1);
  }, [sortStrategy]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 sm:p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
        {/* 1. أبعاد اللوح المخصصة (Width × Height بالمليمتر) */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="sheetWidthDim" className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'أبعاد اللوح المخصصة (مم)' : 'Sheet Dimensions (mm)'}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                id="sheetWidthDim"
                type="number"
                min="50"
                max="10000"
                step="10"
                value={config.sheetWidth}
                onChange={(e) =>
                  onChangeConfig({ ...config, sheetWidth: Math.max(50, Number(e.target.value) || 0) })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono-numbers font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden"
                placeholder={isAr ? 'العرض X' : 'Width X'}
                title={isAr ? 'عرض اللوح بالمليمتر' : 'Sheet width in mm'}
                aria-label={isAr ? 'عرض اللوح بالمليمتر' : 'Sheet width in mm'}
                name="sheetWidth"
              />
              <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400 font-mono-numbers">W</span>
            </div>

            <div className="relative">
              <input
                type="number"
                min="50"
                max="10000"
                step="10"
                value={config.sheetHeight}
                onChange={(e) =>
                  onChangeConfig({ ...config, sheetHeight: Math.max(50, Number(e.target.value) || 0) })
                }
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono-numbers font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden"
                placeholder={isAr ? 'الارتفاع Y' : 'Height Y'}
                title={isAr ? 'ارتفاع اللوح بالمليمتر' : 'Sheet height in mm'}
                aria-label={isAr ? 'ارتفاع اللوح بالمليمتر' : 'Sheet height in mm'}
                name="sheetHeight"
              />
              <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400 font-mono-numbers">H</span>
            </div>
          </div>
        </div>

        {/* 2. هامش اللوح (sheetMargin) */}
        <div>
          <label htmlFor="configSheetMargin" className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'هامش اللوح (sheetMargin)' : 'Sheet Margin'}</span>
          </label>
          <div className="relative">
            <input
              id="configSheetMargin"
              type="number"
              min="0"
              max="150"
              step="1"
              value={config.sheetMargin}
              onChange={(e) =>
                onChangeConfig({ ...config, sheetMargin: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono-numbers font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden"
              title={isAr ? 'الهامش المتروك من حواف اللوح بالمليمتر' : 'Edge margin in mm'}
              aria-label={isAr ? 'الهامش المتروك من حواف اللوح بالمليمتر' : 'Edge margin in mm'}
              name="sheetMargin"
            />
            <span className="absolute left-3 top-1.5 text-[10px] text-slate-400 font-mono-numbers">mm</span>
          </div>
        </div>

        {/* 3. سماكة سلاح المنشار (partGap / Kerf) */}
        <div>
          <label htmlFor="configPartGap" className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Scissors className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'سلاح المنشار (partGap)' : 'Blade Kerf Gap'}</span>
          </label>
          <div className="relative">
            <input
              id="configPartGap"
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={config.partGap}
              onChange={(e) =>
                onChangeConfig({ ...config, partGap: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono-numbers font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden"
              title={isAr ? 'سماكة سلاح المنشار والمسافة الفاصلة بين القطع بالمليمتر' : 'Saw kerf gap in mm'}
              aria-label={isAr ? 'سماكة سلاح المنشار والمسافة الفاصلة بين القطع بالمليمتر' : 'Saw kerf gap in mm'}
              name="partGap"
            />
            <span className="absolute left-3 top-1.5 text-[10px] text-slate-400 font-mono-numbers">mm</span>
          </div>
        </div>

        {/* 4. أولوية ترتيب القطع قبل التسكين */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="barSortStrategy" className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" />
              <span>{isAr ? 'أولوية ترتيب القطع' : 'Sort Heuristic'}</span>
            </label>
            {/* شارة الاستجابة الفورية: تومض مباشرة عند اختيار أي خيار جديد */}
            {sortFlash > 0 ? (
              <span
                key={sortFlash}
                className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-100 text-emerald-800 flex items-center gap-0.5 animate-in fade-in duration-300"
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                {isAr ? 'تمت إعادة التوزيع ✓' : 'Re-nested ✓'}
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-100 text-amber-800">
                {isAr ? 'استجابة فورية ⚡' : 'Live ⚡'}
              </span>
            )}
          </div>
          <select
            id="barSortStrategy"
            value={sortStrategy}
            onChange={(e) => onChangeSortStrategy(e.target.value as SortStrategy)}
            aria-label={isAr ? 'أولوية ترتيب القطع قبل التسكين' : 'Sort heuristic'}
            name="sortStrategy"
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden cursor-pointer transition-colors"
          >
            <option value="optimal">{isAr ? '✨ استغلال أقصى للوح الأول (تلقائي)' : '✨ Maximize Sheet 1 (Optimal)'}</option>
            <option value="maxDimension">{isAr ? 'الضلع الأطول أولاً' : 'Longest Side'}</option>
            <option value="area">{isAr ? 'المساحة الأكبر أولاً' : 'Largest Area'}</option>
            <option value="perimeter">{isAr ? 'المحيط الأكبر أولاً' : 'Largest Perimeter'}</option>
            <option value="width">{isAr ? 'العرض الأكبر أولاً (X)' : 'Max Width (X)'}</option>
            <option value="height">{isAr ? 'الارتفاع/الطول الأكبر أولاً (Y)' : 'Max Height (Y)'}</option>
            <option value="minDimension">{isAr ? 'الضلع الأصغر أولاً' : 'Shortest Side'}</option>
            <option value="aspectRatio">{isAr ? 'القطع النحيفة الطولية أولاً' : 'Slender / Aspect Ratio'}</option>
            <option value="original">{isAr ? 'حسب الترتيب الأصلي في الملف' : 'Original Order'}</option>
          </select>
        </div>

        {/* 5. خيار يتحكم بشكل كلي في تحديد الكمية المتكررة للتصميم (Global Multiplier) */}
        <div>
          <label htmlFor="globalMultiplier" className="block text-[11px] font-bold text-red-600 mb-1 flex items-center gap-1">
            <Copy className="w-3.5 h-3.5 text-red-600" />
            <span>{isAr ? 'تكرار كمية التصميم كلياً' : 'Total Design Multiplier'}</span>
          </label>
          <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
            <button
              type="button"
              onClick={() => onChangeGlobalMultiplier(Math.max(1, globalMultiplier - 1))}
              className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200 font-bold transition-colors cursor-pointer select-none"
              title={isAr ? 'تقليل التكرار' : 'Decrease'}
            >
              -
            </button>
            <input
              id="globalMultiplier"
              type="number"
              min="1"
              max="500"
              value={globalMultiplier}
              onChange={(e) => onChangeGlobalMultiplier(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 text-center font-bold text-xs font-mono-numbers text-red-600 bg-white py-1 focus:outline-hidden border-x border-slate-300"
              aria-label={isAr ? 'كمية تكرار التصميم كلياً' : 'Design multiplier'}
              name="globalMultiplier"
            />
            <button
              type="button"
              onClick={() => onChangeGlobalMultiplier(globalMultiplier + 1)}
              className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200 font-bold transition-colors cursor-pointer select-none"
              title={isAr ? '�� ��詟�' : 'Increase'}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 6. محرك التوزيع: مستطيلات (MaxRects) أو أشكال حرة (NFP) */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <span className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Shapes className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'محرك التوزيع' : 'Nesting Engine'}</span>
          </span>
          <div className="flex rounded-lg overflow-hidden border border-slate-300 bg-slate-50">
            <button
              type="button"
              onClick={() => onChangeEngineMode('rect')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer select-none ${
                engineMode === 'rect'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
              title={isAr ? 'محرك مستطيلات MaxRects — فوري وسريع' : 'MaxRects rectangle engine — instant'}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {isAr ? 'مستطيلات (فوري)' : 'Rects (instant)'}
            </button>
            <button
              type="button"
              onClick={() => onChangeEngineMode('nfp')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer select-none border-l border-slate-300 ${
                engineMode === 'nfp'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
              title={isAr ? 'محرك NFP للأشكال غير المنتظمة — دوران دقيق + مزامنة عصا الشفرة' : 'NFP engine for irregular shapes — fine rotation + kerf'}
            >
              <Shapes className="w-3.5 h-3.5" />
              {isAr ? 'أشكال حرة (NFP)' : 'Irregular (NFP)'}
            </button>
          </div>
        </div>

        {engineMode === 'nfp' && (
          <>
            <div>
              <label htmlFor="nfpBudgetMs" className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
                <Timer className="w-3.5 h-3.5 text-slate-600" />
                <span>{isAr ? 'ميزانية الوقت' : 'Time Budget'}</span>
              </label>
              <select
                id="nfpBudgetMs"
                value={nfpBudgetMs}
                onChange={(e) => onChangeNfpBudgetMs(Number(e.target.value))}
                aria-label={isAr ? 'ميزانية وقت محرك NFP' : 'NFP time budget'}
                name="nfpBudgetMs"
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
              >
                <option value={2000}>{isAr ? '2 ثانية (أسرع)' : '2s (fastest)'}</option>
                <option value={5000}>{isAr ? '5 ثواني' : '5s'}</option>
                <option value={10000}>{isAr ? '10 ثوانٍ' : '10s'}</option>
                <option value={30000}>{isAr ? '30 ثانية' : '30s'}</option>
                <option value={60000}>{isAr ? 'دقيقة' : '1 minute'}</option>
                <option value={120000}>{isAr ? 'دقيقتان' : '2 minutes'}</option>
                <option value={300000}>{isAr ? '5 دقائق' : '5 minutes'}</option>
                <option value={600000}>{isAr ? '10 دقائق' : '10 minutes'}</option>
              </select>
            </div>

            <div>
              <label htmlFor="nfpRotations" className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
                <RotateCw className="w-3.5 h-3.5 text-slate-600" />
                <span>{isAr ? 'زوايا الدوران' : 'Rotations'}</span>
              </label>
              <select
                id="nfpRotations"
                value={freeRotationCount}
                onChange={(e) => onChangeFreeRotationCount(Number(e.target.value))}
                aria-label={isAr ? 'عدد زوايا الدوران للأشكال الحرة' : 'Free rotation angles'}
                name="nfpRotations"
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
              >
                <option value={4}>{isAr ? '4 زوايا (90°)' : '4 (90° steps)'}</option>
                <option value={8}>{isAr ? '8 زوايا (45°)' : '8 (45° steps)'}</option>
                <option value={16}>{isAr ? '16 زاوية (22.5° — دقيق)' : '16 (22.5° — fine)'}</option>
                <option value={32}>{isAr ? '32 زاوية (11.25° — أدق)' : '32 (11.25° — finer)'}</option>
                <option value={64}>{isAr ? '64 زاوية (5.625°)' : '64 (5.625° steps)'}</option>
              </select>
            </div>
            <button type="button" onClick={onStartNfp} disabled={nfpRunning || !nfpCanStart}
              aria-label={isAr ? 'بدء تشغيل NFP' : 'Start NFP'}
              className="self-end flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {nfpRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isAr ? 'بدء' : 'Start'}
            </button>
          </>
        )}

        {engineMode === 'nfp' && nfpRunning && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {nfpProgress
              ? isAr
                ? `جاري التحسين… ${nfpProgress.placed}/${nfpProgress.total} · ${Math.floor((nfpProgress.elapsedMs??0)/1000)} ث`
                : `Optimizing… ${nfpProgress.placed}/${nfpProgress.total} · ${Math.floor((nfpProgress.elapsedMs??0)/1000)}s`
              : isAr
                ? 'جاري التحسين…'
                : 'Nesting…'}
          </div>
        )}

        {engineMode === 'nfp' && !nfpRunning && !nfpError && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {nfpWaiting
              ? (isAr ? 'اختر الوقت والزوايا ثم اضغط بدء' : 'Choose time and rotations, then press Start')
              : (isAr ? 'اكتمل بحث NFP' : 'NFP search complete')}
          </div>
        )}

        {engineMode === 'nfp' && nfpError && (
          <div
            className="flex items-center gap-1.5 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 max-w-md"
            title={nfpError}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isAr ? 'خطأ في محرك NFP' : 'NFP engine error'}: {nfpError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
