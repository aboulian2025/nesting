/**
 * @file Header.tsx
 * شريط العنوان والتحكم الرئيسي لمحرك توزيع الألواح
 */

import React from 'react';
import {
  Layers,
  FileDown,
  Upload,
  Settings,
  Sparkles,
  Percent,
  Box,
  Compass,
  FileSpreadsheet
} from 'lucide-react';
import { NestingResult } from '../utils/nesting';

interface HeaderProps {
  result: NestingResult;
  onOpenSettings: () => void;
  onOpenSvgModal: () => void;
  onExportSvg: () => void;
  onExportDxf: () => void;
  onExportAllDxf?: () => void;
  onExportCsv: () => void;
  onLoadSample: () => void;
  language: 'ar' | 'en';
  onToggleLanguage: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  result,
  onOpenSettings,
  onOpenSvgModal,
  onExportSvg,
  onExportDxf,
  onExportAllDxf,
  onExportCsv,
  onLoadSample,
  language,
  onToggleLanguage
}) => {
  const isAr = language === 'ar';
  const utilization = result.summary.overallUtilizationPercent;
  const badgeColor =
    utilization >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-300' :
    utilization >= 65 ? 'text-amber-700 bg-amber-50 border-amber-300' :
    'text-rose-700 bg-rose-50 border-rose-300';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* الشعار والعنوان الرئيسي */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-white shadow-sm ring-2 ring-amber-700/20">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {isAr ? 'محرك توزيع الألواح وتوفير الخامة' : 'Sheet Nesting Engine'}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium">
                  MaxRects BSSF
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>{isAr ? 'قفل عروق الخشب' : 'Wood Grain Lock'}</span>
                <span>•</span>
                <span>{isAr ? 'توفير الخامة وتقليل الهدر' : 'Material Optimization'}</span>
                <span>•</span>
                <span>{isAr ? 'دعم ملفات SVG' : 'SVG Import'}</span>
              </p>
            </div>
          </div>

          {/* مؤشرات الأداء السريعة */}
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <Box className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-slate-500 text-[10px]">{isAr ? 'الألواح المطلوبة' : 'Sheets'}</div>
                <div className="font-bold text-slate-800 font-mono-numbers">
                  {result.summary.sheetsUsed} {isAr ? 'لوح' : 'sheets'}
                </div>
              </div>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${badgeColor}`}>
              <Percent className="w-4 h-4" />
              <div>
                <div className="text-[10px] opacity-80">{isAr ? 'نسبة الاستغلال' : 'Utilization'}</div>
                <div className="font-bold font-mono-numbers text-sm">
                  {utilization}%
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <Compass className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-slate-500 text-[10px]">{isAr ? 'القطع المسكنة' : 'Parts Placed'}</div>
                <div className="font-bold text-slate-800 font-mono-numbers">
                  {result.summary.totalPartsPlaced} / {result.summary.totalPartsProvided}
                </div>
              </div>
            </div>
          </div>

          {/* أزرار الإجراءات */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* رفع أو استيراد SVG */}
            <button
              onClick={onOpenSvgModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
              title={isAr ? 'رفع ملف SVG لتحليله وتوزيعه' : 'Upload SVG file'}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isAr ? 'استيراد SVG' : 'Import SVG'}</span>
            </button>

            {/* تصدير نسخة نظيفة Inkscape SVG */}
            <button
              onClick={onExportSvg}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer shadow-xs"
              title={
                isAr
                  ? 'تصدير نسخة نظيفة متوافقة تماماً مع Inkscape وماكينات الـ CNC بدون مسارات مخفية أو خارج صفحة العمل'
                  : 'Export clean Inkscape SVG without hidden or off-canvas paths'
              }
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isAr ? 'تصدير Inkscape SVG' : 'Export Inkscape SVG'}</span>
            </button>

            {/* تصدير مخطط القص بتنسيق DXF لبرامج AutoCAD و CAM وماكينات الـ CNC */}
            <div className="inline-flex items-center rounded-lg shadow-xs">
              <button
                onClick={onExportDxf}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold ${
                  result.sheets.length > 1 ? 'rounded-s-lg border-e-0' : 'rounded-lg'
                } bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 transition-colors cursor-pointer`}
                title={
                  isAr
                    ? 'تصدير مخطط اللوح الحالي بصيغة AutoCAD DXF (R12 / ASCII) متوافق 100% مع برامج CAM وماكينات الـ CNC والراوتر والليزر'
                    : 'Export current sheet as AutoCAD DXF (R12 / ASCII) compatible with CAM & CNC machines'
                }
              >
                <FileDown className="w-3.5 h-3.5 text-sky-700" />
                <span className="font-mono text-[10px] bg-sky-200/90 px-1 py-0.5 rounded text-sky-950 font-bold">DXF</span>
                <span>{isAr ? 'تصدير DXF' : 'Export DXF'}</span>
              </button>

              {result.sheets.length > 1 && onExportAllDxf && (
                <button
                  onClick={onExportAllDxf}
                  className="inline-flex items-center px-2 py-2 text-xs font-bold rounded-e-lg bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 transition-colors cursor-pointer border-s border-s-sky-200"
                  title={
                    isAr
                      ? `تصدير كافة الألواح (${result.sheets.length} ألواح) في ملف DXF واحد مرتبة جنبًا إلى جنب`
                      : `Export all sheets (${result.sheets.length}) side by side in one DXF`
                  }
                >
                  <span className="text-[10px]">{isAr ? 'كل الألواح' : 'All'}</span>
                </button>
              )}
            </div>

            {/* تصدير CSV */}
            <button
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors cursor-pointer"
              title={isAr ? 'تنزيل قائمة القطع والمواضع كجدول إكسل' : 'Download cut list as CSV'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'جدول CSV' : 'Cut List CSV'}</span>
            </button>

            {/* زر إعدادات اللوح */}
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              title={isAr ? 'إعدادات مقاس اللوح وسماكة المنشار' : 'Sheet & Blade Settings'}
              aria-label={isAr ? 'إعدادات اللوح' : 'Sheet Settings'}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* تبديل اللغة */}
            <button
              onClick={onToggleLanguage}
              className="px-2 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              title="Toggle Language"
            >
              {language === 'ar' ? 'EN' : 'عربي'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
