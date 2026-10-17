/**
 * @file PartsManager.tsx
 * إدارة قائمة القطع، تعديل الأبعاد، وتحديد قفل عروق الخشب (Wood Grain Lock)
 */

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  RotateCw,
  ArrowRightLeft,
  ArrowUpDown,
  Sparkles,
  Layers,
  Palette,
  Copy,
  Hash,
  AlertCircle
} from 'lucide-react';
import { PartInput, GrainDirection, GrainDirectionType } from '../utils/nesting';

interface PartsManagerProps {
  parts: PartInput[];
  onAddPart: (part: PartInput) => void;
  onUpdatePart: (id: string, updated: Partial<PartInput>) => void;
  onDeletePart: (id: string) => void;
  onResetParts: () => void;
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  language: 'ar' | 'en';
}

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#64748b'
];

export const PartsManager: React.FC<PartsManagerProps> = ({
  parts,
  onAddPart,
  onUpdatePart,
  onDeletePart,
  onResetParts,
  selectedPartId,
  onSelectPart,
  language
}) => {
  const isAr = language === 'ar';
  const [isAddOpen, setIsAddOpen] = useState(false);

  // حقول إضافة قطعة جديدة
  const [newName, setNewName] = useState('');
  const [newWidth, setNewWidth] = useState(600);
  const [newHeight, setNewHeight] = useState(400);
  const [newCount, setNewCount] = useState(2);
  const [newGrain, setNewGrain] = useState<GrainDirectionType>(GrainDirection.FREE);
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);

  const handleCreatePart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWidth || !newHeight) return;

    const part: PartInput = {
      id: `P_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: newName.trim() || (isAr ? `قطعة ${parts.length + 1}` : `Part ${parts.length + 1}`),
      width: Math.max(10, Number(newWidth)),
      height: Math.max(10, Number(newHeight)),
      count: Math.max(1, Number(newCount)),
      grain: newGrain,
      color: newColor
    };

    onAddPart(part);
    setNewName('');
    setIsAddOpen(false);
  };

  const totalPiecesCount = parts.reduce((sum, p) => sum + (p.count || 1), 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-full overflow-hidden">
      {/* رأس لوحة القطع */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {isAr ? 'قائمة القطع وأوامر العروق' : 'Parts List & Grain Locks'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {isAr ? `${parts.length} أصناف (${totalPiecesCount} قطعة إجمالية)` : `${parts.length} types (${totalPiecesCount} total pieces)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsAddOpen(!isAddOpen)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAr ? 'إضافة قطعة' : 'Add Part'}</span>
          </button>
        </div>
      </div>

      {/* نموذج إضافة قطعة منبثق / قابل للطي */}
      {isAddOpen && (
        <form onSubmit={handleCreatePart} className="p-4 bg-amber-50/60 border-b border-amber-200 space-y-3">
          <div className="text-xs font-bold text-amber-900 flex items-center justify-between">
            <span>{isAr ? 'بيانات القطعة الجديدة' : 'New Part Details'}</span>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="text-amber-700 hover:text-amber-900 text-xs font-medium"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {isAr ? 'اسم القطعة / التوصيف' : 'Part Name / Label'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثلاً: باب دولاب علوي' : 'e.g., Cabinet Door'}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs focus:border-amber-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {isAr ? 'الكمية المطلوبة' : 'Quantity'}
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={newCount}
                onChange={e => setNewCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs font-mono-numbers focus:border-amber-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {isAr ? 'العرض (W) مم' : 'Width (W) mm'}
              </label>
              <input
                type="number"
                min="10"
                max="5000"
                value={newWidth}
                onChange={e => setNewWidth(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs font-mono-numbers focus:border-amber-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {isAr ? 'الارتفاع (H) مم' : 'Height (H) mm'}
              </label>
              <input
                type="number"
                min="10"
                max="5000"
                value={newHeight}
                onChange={e => setNewHeight(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs font-mono-numbers focus:border-amber-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* خيار تثبيت عروق الخشب للقطعة الجديدة */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1.5">
              {isAr ? 'قفل عروق الخشب: افقي=عرض | رأسي=طول | حر=تدوير حر حسب المساحة' : 'Wood Grain Lock'}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setNewGrain(GrainDirection.WIDTH)}
                className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                  newGrain === GrainDirection.WIDTH
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title={isAr ? 'أفقي = عرض (يمنع الدوران)' : 'Horizontal = Width'}
              >
                <ArrowRightLeft className="w-3 h-3" />
                <span>{isAr ? 'أفقي (عرض)' : 'Width'}</span>
              </button>

              <button
                type="button"
                onClick={() => setNewGrain(GrainDirection.HEIGHT)}
                className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                  newGrain === GrainDirection.HEIGHT
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title={isAr ? 'رأسي = طول (تدوير 90°)' : 'Vertical = Height'}
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{isAr ? 'رأسي (طول)' : 'Height'}</span>
              </button>

              <button
                type="button"
                onClick={() => setNewGrain(GrainDirection.FREE)}
                className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                  newGrain === GrainDirection.FREE
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title={isAr ? 'حر = تدوير حر للقطعة حسب المساحة' : 'Free: Rotate to fit space'}
              >
                <RotateCw className="w-3 h-3" />
                <span>{isAr ? 'حر (حسب المساحة)' : 'Free'}</span>
              </button>
            </div>
          </div>

          {/* لون التمييز */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    newColor === c ? 'scale-125 ring-2 ring-amber-500' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
            >
              {isAr ? 'إضافة إلى القائمة' : 'Add to List'}
            </button>
          </div>
        </form>
      )}

      {/* قائمة القطع */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5">
        {parts.length === 0 ? (
          <div className="text-center py-12 px-4">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">
              {isAr ? 'لا توجد قطع حالياً. يمكنك إضافة قطع أو استيراد ملف SVG.' : 'No parts added yet. Add parts or import an SVG.'}
            </p>
            <button
              onClick={onResetParts}
              className="mt-3 px-3 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg font-bold border border-amber-200"
            >
              {isAr ? 'استعادة القطع الافتراضية' : 'Load Default Parts'}
            </button>
          </div>
        ) : (
          parts.map((part) => {
            const isSelected = selectedPartId === part.id;
            return (
              <div
                key={part.id}
                onClick={() => onSelectPart(isSelected ? null : part.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-400'
                    : 'border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {part.svgSnippet ? (
                      <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden p-0.5">
                        <svg
                          viewBox={part.viewBox || `0 0 ${part.width} ${part.height}`}
                          className="w-full h-full block"
                          dangerouslySetInnerHTML={{ __html: part.svgSnippet }}
                        />
                      </div>
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-md shrink-0 shadow-xs"
                        style={{ backgroundColor: part.color || '#3b82f6' }}
                      />
                    )}
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <span>{part.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono-numbers">
                          ×{part.count}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-numbers">
                        {part.width} × {part.height} mm
                        <span className="text-slate-400 mx-1">|</span>
                        <span>{((part.width * part.height) / 1000000).toFixed(3)} m²</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* تعديل الكمية */}
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onUpdatePart(part.id, { count: Math.max(1, part.count - 1) })}
                        className="px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 font-bold"
                        title={isAr ? 'تقليل الكمية' : 'Decrease count'}
                      >
                        -
                      </button>
                      <span className="px-2 text-[11px] font-bold font-mono-numbers text-slate-800">
                        {part.count}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdatePart(part.id, { count: part.count + 1 })}
                        className="px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 font-bold"
                        title={isAr ? 'زيادة الكمية' : 'Increase count'}
                      >
                        +
                      </button>
                    </div>

                    {/* حذف القطعة */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePart(part.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title={isAr ? 'حذف القطعة' : 'Delete part'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* أزرار قفل عروق الخشب السريعة في السطر */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]" onClick={e => e.stopPropagation()}>
                  <span className="text-slate-400 text-[10px]">
                    {isAr ? 'قفل العروق:' : 'Grain:'}
                  </span>

                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-[10px]">
                    {/* Width Lock */}
                    <button
                      type="button"
                      onClick={() => onUpdatePart(part.id, { grain: GrainDirection.WIDTH })}
                      className={`px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-all ${
                        part.grain === GrainDirection.WIDTH
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title={isAr ? 'أفقي = عرض (يمنع دوران القطعة)' : 'Horizontal = Width'}
                    >
                      <ArrowRightLeft className="w-2.5 h-2.5" />
                      <span>{isAr ? 'أفقي (عرض)' : 'Width'}</span>
                    </button>

                    {/* Height Lock */}
                    <button
                      type="button"
                      onClick={() => onUpdatePart(part.id, { grain: GrainDirection.HEIGHT })}
                      className={`px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-all ${
                        part.grain === GrainDirection.HEIGHT
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title={isAr ? 'رأسي = طول (تدوير 90° لتوازي الطول)' : 'Vertical = Height'}
                    >
                      <ArrowUpDown className="w-2.5 h-2.5" />
                      <span>{isAr ? 'رأسي (طول)' : 'Height'}</span>
                    </button>

                    {/* Free Lock */}
                    <button
                      type="button"
                      onClick={() => onUpdatePart(part.id, { grain: GrainDirection.FREE })}
                      className={`px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-all ${
                        part.grain === GrainDirection.FREE
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title={isAr ? 'حر = تدوير حر للقطعة حسب المساحة' : 'Free: Rotate to fit space'}
                    >
                      <RotateCw className="w-2.5 h-2.5" />
                      <span>{isAr ? 'حر (مساحة)' : 'Free'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* تذييل لوحة القطع */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
        <button
          onClick={onResetParts}
          className="text-slate-500 hover:text-slate-800 text-[11px] underline cursor-pointer"
        >
          {isAr ? 'إعادة ضبط النموذج' : 'Reset Sample'}
        </button>

        <span className="text-[11px] text-slate-500 font-mono-numbers">
          {isAr ? 'المساحة الكلية:' : 'Total Area:'}{' '}
          <strong className="text-slate-800">
            {(parts.reduce((sum, p) => sum + (p.width * p.height * p.count), 0) / 1000000).toFixed(2)} m²
          </strong>
        </span>
      </div>
    </div>
  );
};
