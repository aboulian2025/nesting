/**
 * @file CncControlsBar.tsx
 * شريط التحكم المباشر في الواجهة:
 * - الأبعاد المخصصة للوح (Width, Height بالمليمتر)
 * - هامش اللوح (sheetMargin) وسماكة سلاح المنشار (partGap)
 * - خيارات أولوية ترتيب القطع قبل التسكين
 * - خيار التحكم الكلي في تكرار وكمية التصميم (Global Design Multiplier)
 */

import React from 'react';
import {
  Maximize2,
  Sliders,
  Copy,
  Scissors,
  ArrowUpDown,
  Sparkles
} from 'lucide-react';
import { SheetConfig, SortStrategy } from '../utils/nesting';

interface CncControlsBarProps {
  config: SheetConfig;
  onChangeConfig: (newConfig: SheetConfig) => void;
  sortStrategy: SortStrategy;
  onChangeSortStrategy: (strategy: SortStrategy) => void;
  globalMultiplier: number;
  onChangeGlobalMultiplier: (multiplier: number) => void;
  language: 'ar' | 'en';
}

export const CncControlsBar: React.FC<CncControlsBarProps> = ({
  config,
  onChangeConfig,
  sortStrategy,
  onChangeSortStrategy,
  globalMultiplier,
  onChangeGlobalMultiplier,
  language
}) => {
  const isAr = language === 'ar';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 sm:p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
        {/* 1. أبعاد اللوح المخصصة (Width × Height بالمليمتر) */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'أبعاد اللوح المخصصة (مم)' : 'Sheet Dimensions (mm)'}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
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
              />
              <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400 font-mono-numbers">H</span>
            </div>
          </div>
        </div>

        {/* 2. هامش اللوح (sheetMargin) */}
        <div>
          <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'هامش اللوح (sheetMargin)' : 'Sheet Margin'}</span>
          </label>
          <div className="relative">
            <input
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
            />
            <span className="absolute left-3 top-1.5 text-[10px] text-slate-400 font-mono-numbers">mm</span>
          </div>
        </div>

        {/* 3. سماكة سلاح المنشار (partGap / Kerf) */}
        <div>
          <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <Scissors className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'سلاح المنشار (partGap)' : 'Blade Kerf Gap'}</span>
          </label>
          <div className="relative">
            <input
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
            />
            <span className="absolute left-3 top-1.5 text-[10px] text-slate-400 font-mono-numbers">mm</span>
          </div>
        </div>

        {/* 4. أولوية ترتيب القطع قبل التسكين */}
        <div>
          <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" />
            <span>{isAr ? 'أولوية ترتيب القطع' : 'Sort Heuristic'}</span>
          </label>
          <select
            value={sortStrategy}
            onChange={(e) => onChangeSortStrategy(e.target.value as SortStrategy)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:border-red-500 focus:outline-hidden cursor-pointer"
          >
            <option value="optimal">{isAr ? '✨ استغلال أقصى للوح الأول (تلقائي)' : '✨ Maximize Sheet 1 (Optimal)'}</option>
            <option value="maxDimension">{isAr ? 'الضلع الأطول أولاً' : 'Longest Side'}</option>
            <option value="area">{isAr ? 'المساحة الأكبر أولاً' : 'Largest Area'}</option>
            <option value="perimeter">{isAr ? 'المحيط الأكبر أولاً' : 'Largest Perimeter'}</option>
            <option value="width">{isAr ? 'العرض الأكبر أولاً' : 'Max Width'}</option>
            <option value="height">{isAr ? 'الارتفاع الأكبر أولاً' : 'Max Height'}</option>
            <option value="original">{isAr ? 'حسب الترتيب الأصلي في الملف' : 'Original Order'}</option>
          </select>
        </div>

        {/* 5. خيار يتحكم بشكل كلي في تحديد الكمية المتكررة للتصميم (Global Multiplier) */}
        <div>
          <label className="block text-[11px] font-bold text-red-600 mb-1 flex items-center gap-1">
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
              type="number"
              min="1"
              max="500"
              value={globalMultiplier}
              onChange={(e) => onChangeGlobalMultiplier(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 text-center font-bold text-xs font-mono-numbers text-red-600 bg-white py-1 focus:outline-hidden border-x border-slate-300"
            />
            <button
              type="button"
              onClick={() => onChangeGlobalMultiplier(globalMultiplier + 1)}
              className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200 font-bold transition-colors cursor-pointer select-none"
              title={isAr ? 'زيادة التكرار' : 'Increase'}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
