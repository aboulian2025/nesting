/**
 * @file SheetSettingsModal.tsx
 * نافذة تخصيص أبعاد اللوح، سماكة سن المنشار، والهوامش والتكلفة
 * تم إزالة المقاسات القياسية الشائعة كما طلب المستخدم
 */

import React from 'react';
import { X, Sliders, DollarSign, Layers } from 'lucide-react';
import { SheetConfig, SortStrategy } from '../utils/nesting';

interface SheetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SheetConfig;
  onUpdateConfig: (newConfig: SheetConfig) => void;
  sortStrategy: SortStrategy;
  onChangeSortStrategy: (strategy: SortStrategy) => void;
  language: 'ar' | 'en';
}

export const SheetSettingsModal: React.FC<SheetSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  sortStrategy,
  onChangeSortStrategy,
  language
}) => {
  if (!isOpen) return null;
  const isAr = language === 'ar';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* رأس النافذة */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isAr ? 'إعدادات أبعاد اللوح والتكلفة' : 'Sheet & Cost Configuration'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? 'تحديد قياسات اللوح وسماكة سلاح المنشار والهوامش' : 'Set custom sheet dimensions and kerf margin'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* محتوى الإعدادات */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* الأبعاد المخصصة للوح */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold text-slate-800">
              {isAr ? 'الأبعاد المخصصة للوح (بالمليمتر)' : 'Custom Dimensions (mm)'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  {isAr ? 'عرض اللوح (X - Width)' : 'Sheet Width (X)'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="50"
                    max="10000"
                    step="10"
                    value={config.sheetWidth}
                    onChange={(e) => onUpdateConfig({ ...config, sheetWidth: Math.max(50, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono-numbers text-slate-900 focus:outline-hidden focus:border-red-500"
                    aria-label={isAr ? 'عرض اللوح بالمليمتر' : 'Sheet width in mm'}
                    name="settingsSheetWidth"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400">mm</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  {isAr ? 'ارتفاع اللوح (Y - Height)' : 'Sheet Height (Y)'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="50"
                    max="10000"
                    step="10"
                    value={config.sheetHeight}
                    onChange={(e) => onUpdateConfig({ ...config, sheetHeight: Math.max(50, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono-numbers text-slate-900 focus:outline-hidden focus:border-red-500"
                    aria-label={isAr ? 'ارتفاع اللوح بالمليمتر' : 'Sheet height in mm'}
                    name="settingsSheetHeight"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400">mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* الهامش وسماكة المنشار */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'هامش اللوح (sheetMargin)' : 'Sheet Margin'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="150"
                  step="1"
                  value={config.sheetMargin}
                  onChange={(e) => onUpdateConfig({ ...config, sheetMargin: Math.min(150, Math.max(0, Number(e.target.value) || 0)) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold font-mono-numbers text-slate-900 focus:outline-hidden focus:border-red-500"
                  aria-label={isAr ? 'هامش اللوح بالمليمتر' : 'Sheet margin in mm'}
                  name="settingsSheetMargin"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">mm</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'سلاح المنشار (partGap)' : 'Blade Kerf Gap'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="25"
                  step="0.5"
                  value={config.partGap}
                  onChange={(e) => onUpdateConfig({ ...config, partGap: Math.min(25, Math.max(0, Number(e.target.value) || 0)) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold font-mono-numbers text-slate-900 focus:outline-hidden focus:border-red-500"
                  aria-label={isAr ? 'سماكة سلاح المنشار بالمليمتر' : 'Saw kerf gap in mm'}
                  name="settingsPartGap"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">mm</span>
              </div>
            </div>
          </div>

          {/* أولوية ترتيب القطع */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isAr ? 'أولوية ترتيب القطع للتسكين' : 'Piece Sorting Priority'}
            </label>
            <select
              value={sortStrategy}
              onChange={(e) => onChangeSortStrategy(e.target.value as SortStrategy)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:border-red-500 cursor-pointer"
              aria-label={isAr ? 'أولوية ترتيب القطع للتسكين' : 'Piece sorting priority'}
              name="settingsSortStrategy"
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

          {/* التكلفة والسماكة */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                <span>{isAr ? 'سعر اللوح الواحد' : 'Price Per Sheet'}</span>
              </label>
              <input
                type="number"
                min="0"
                step="5"
                value={config.pricePerSheet || 0}
                onChange={(e) => onUpdateConfig({ ...config, pricePerSheet: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold font-mono-numbers text-slate-900 focus:outline-hidden focus:border-red-500"
                aria-label={isAr ? 'سعر اللوح الواحد' : 'Price per sheet'}
                name="settingsPricePerSheet"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>{isAr ? 'سماكة اللوح (مم)' : 'Sheet Thickness (mm)'}</span>
              </label>
              <input
                type="number"
                min="1"
                max="50"
                step="1"
                value={config.thickness || 18}
                onChange={(e) => onUpdateConfig({ ...config, thickness: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold font-mono-numbers text-slate-900 focus:outline-hidden focus:border-red-500"
                aria-label={isAr ? 'سماكة اللوح بالمليمتر' : 'Sheet thickness in mm'}
                name="settingsThickness"
              />
            </div>
          </div>
        </div>

        {/* ذيل النافذة */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isAr ? 'حفظ وإغلاق' : 'Save & Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
