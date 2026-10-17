/**
 * @file StatisticsPanel.tsx
 * لوحة الإحصائيات الشاملة، نسبة الاستغلال، تحليل الهدر، والتكلفة
 */

import React from 'react';
import {
  TrendingUp,
  Trash2,
  DollarSign,
  Scissors,
  Layers,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  PieChart
} from 'lucide-react';
import { NestingResult, SheetConfig, PartInput } from '../utils/nesting';

interface StatisticsPanelProps {
  result: NestingResult;
  config: SheetConfig;
  parts: PartInput[];
  language: 'ar' | 'en';
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  result,
  config,
  parts,
  language
}) => {
  const isAr = language === 'ar';
  const { summary, unplacedParts } = result;

  const totalAreaM2 = (summary.totalSheetArea / 1000000).toFixed(2);
  const usedAreaM2 = (summary.totalUsedArea / 1000000).toFixed(2);
  const wasteAreaM2 = (summary.totalWasteArea / 1000000).toFixed(2);

  const pricePerSheet = config.pricePerSheet || 0;
  const totalCost = summary.totalMaterialCost;
  const wasteCost = ((summary.totalWasteArea / (summary.totalSheetArea || 1)) * totalCost).toFixed(2);

  // إحصائيات عروق الخشب
  const grainStats = parts.reduce(
    (acc, p) => {
      if (p.grain === 'width') acc.width += p.count;
      else if (p.grain === 'height') acc.height += p.count;
      else acc.free += p.count;
      return acc;
    },
    { width: 0, height: 0, free: 0 }
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
      {/* عنوان اللوحة الرئيسي */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
            <PieChart className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            {isAr ? 'تقرير استغلال الألواح وتوفير الخامة' : 'Sheet Utilization & Material Yield'}
          </h3>
        </div>
        <span className="text-xs font-mono-numbers font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
          {summary.overallUtilizationPercent}% {isAr ? 'استغلال' : 'Yield'}
        </span>
      </div>

      {/* شريط مقياس الاستغلال البياني */}
      <div>
        <div className="flex justify-between text-xs font-bold mb-1">
          <span className="text-slate-700">{isAr ? 'مؤشر كفاءة التوزيع' : 'Efficiency Gauge'}</span>
          <span className="text-slate-500 font-mono-numbers">
            {isAr ? 'الهدر:' : 'Waste:'} {summary.overallWastePercent}%
          </span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${summary.overallUtilizationPercent}%` }}
            title={`Used: ${summary.overallUtilizationPercent}%`}
          />
          <div
            className="h-full bg-rose-400 transition-all duration-500"
            style={{ width: `${summary.overallWastePercent}%` }}
            title={`Waste: ${summary.overallWastePercent}%`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>{isAr ? 'الخامة المستغلة' : 'Utilized Wood'} ({usedAreaM2} m²)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
            <span>{isAr ? 'الفواضل والهدر' : 'Waste Area'} ({wasteAreaM2} m²)</span>
          </span>
        </div>
      </div>

      {/* شبكة الإحصائيات الرقمية الأربعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {/* الألواح */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-0.5">{isAr ? 'الألواح المستهلكة' : 'Sheets Used'}</div>
          <div className="text-lg font-bold text-slate-900 font-mono-numbers">
            {summary.sheetsUsed} <span className="text-xs font-normal text-slate-500">{isAr ? 'لوح' : 'sheets'}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 font-mono-numbers">
            {totalAreaM2} m² {isAr ? 'إجمالي' : 'total'}
          </div>
        </div>

        {/* تكلفة الخشب */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-0.5">{isAr ? 'إجمالي التكلفة المالية' : 'Total Material Cost'}</div>
          <div className="text-lg font-bold text-slate-900 font-mono-numbers">
            {totalCost} <span className="text-xs font-normal text-slate-500">SAR / $</span>
          </div>
          <div className="text-[10px] text-rose-600 mt-0.5 font-mono-numbers">
            {isAr ? 'قيمة الهدر:' : 'Waste Value:'} {wasteCost}
          </div>
        </div>

        {/* أمتار القص */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-0.5">{isAr ? 'مسار القص التقديري' : 'Linear Cut Length'}</div>
          <div className="text-lg font-bold text-slate-900 font-mono-numbers">
            {summary.totalEstimatedCutLengthMeters} <span className="text-xs font-normal text-slate-500">{isAr ? 'متر' : 'm'}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {isAr ? 'بمنشار/راوتر' : 'Saw Blade Passes'}
          </div>
        </div>

        {/* القطع المقصوصة */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-0.5">{isAr ? 'جاهزية القطع' : 'Parts Nesting'}</div>
          <div className="text-lg font-bold text-emerald-600 font-mono-numbers">
            {summary.totalPartsPlaced} / {summary.totalPartsProvided}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {summary.unplacedCount === 0
              ? (isAr ? 'جميع القطع مسكنة 100%' : 'All parts placed')
              : (isAr ? `${summary.unplacedCount} قطع لم تتسع!` : `${summary.unplacedCount} unplaced!`)}
          </div>
        </div>
      </div>

      {/* توزيع أوامر عروق الخشب */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-wrap items-center justify-between text-xs gap-2">
        <span className="font-bold text-slate-700">
          {isAr ? 'توزيع عروق الخشب المقفلة:' : 'Grain Locks Distribution:'}
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-blue-700 font-mono-numbers">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>{isAr ? 'أفقي (X):' : 'Width (X):'} <strong>{grainStats.width}</strong></span>
          </span>
          <span className="flex items-center gap-1 text-rose-700 font-mono-numbers">
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            <span>{isAr ? 'رأسي (Y):' : 'Height (Y):'} <strong>{grainStats.height}</strong></span>
          </span>
          <span className="flex items-center gap-1 text-emerald-700 font-mono-numbers">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>{isAr ? 'حر (Free):' : 'Free:'} <strong>{grainStats.free}</strong></span>
          </span>
        </div>
      </div>

      {/* تحذير في حال وجود قطع لم تتسع */}
      {unplacedParts.length > 0 && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>
              {isAr ? `تنبيه: يوجد ${unplacedParts.length} قطع أكبر من أبعاد اللوح أو الهامش!` : `Warning: ${unplacedParts.length} parts exceed sheet usable area!`}
            </span>
          </div>
          <div className="text-[11px] text-rose-700">
            {unplacedParts.map(p => `${p.name} (${p.width}×${p.height} مم)`).join(' ، ')}
          </div>
        </div>
      )}

      {/* نصيحة ذكية لتقليل الهدر */}
      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs flex items-start gap-2.5">
        <Lightbulb className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-amber-900 text-[11px] leading-relaxed">
          <span className="font-bold">{isAr ? 'نصيحة ورشة النجارة:' : 'Carpentry Tip:'} </span>
          {isAr ? (
            <>
              استخدم قفل <strong>Width (X)</strong> للأرفف والواجهات العريضة للحفاظ على جمالية الخطوط الخشبية، واستخدم <strong>Height (Y)</strong> لأبواب الدواليب لتبدو ألياف الخشب متناسقة مع ارتفاع الدولاب. أما القواطع الداخلية غير الظاهرة والظهور فيفضل دائماً جعلها <strong>حر (Free)</strong> للوصول إلى أعلى نسبة توفير خامة وتقليل الهدر لأقل من 15%.
            </>
          ) : (
            <>
              Use <strong>Width (X)</strong> for shelves to maintain horizontal grain beauty, and <strong>Height (Y)</strong> for tall cabinet doors. Keep internal baffles, backs, and dividers on <strong>Free</strong> orientation to boost utilization above 85% and slash wood waste.
            </>
          )}
        </div>
      </div>
    </div>
  );
};
