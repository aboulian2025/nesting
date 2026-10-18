/**
 * @file PieceActionModal.tsx
 * نافذة تفاعلية منبثقة للتحكم في القطعة بشكل منفرد (تحكم فردي)
 * أو على مستوى الصنف كاملاً (تحكم جماعي) لكافة القطع المتكررة
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCw,
  ArrowRightLeft,
  ArrowUpDown,
  Trash2,
  Maximize2,
  Copy,
  Layers,
  Sparkles,
  Check,
  User,
  Users
} from 'lucide-react';
import { PlacedPart, PartInput, GrainDirection, GrainDirectionType } from '../utils/nesting';

interface PieceActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  placedPart: PlacedPart | null;
  originalPart: PartInput | null;
  controlMode: 'individual' | 'group';
  onChangeControlMode: (mode: 'individual' | 'group') => void;
  onRotateIndividual: (uniqueId: string) => void;
  onRotateGroup: (partId: string) => void;
  onChangeGrainIndividual: (uniqueId: string, grain: GrainDirectionType) => void;
  onChangeGrainGroup: (partId: string, grain: GrainDirectionType) => void;
  onUpdateDimensionsIndividual?: (uniqueId: string, width: number, height: number) => void;
  onUpdateDimensionsGroup: (partId: string, width: number, height: number) => void;
  onUpdateCountGroup: (partId: string, count: number) => void;
  onDeleteIndividual: (uniqueId: string, partId: string) => void;
  onDeleteGroup: (partId: string) => void;
  onDuplicateInstance?: (uniqueId: string) => void;
  language: 'ar' | 'en';
}

export const PieceActionModal: React.FC<PieceActionModalProps> = ({
  isOpen,
  onClose,
  placedPart,
  originalPart,
  controlMode,
  onChangeControlMode,
  onRotateIndividual,
  onRotateGroup,
  onChangeGrainIndividual,
  onChangeGrainGroup,
  onUpdateDimensionsIndividual,
  onUpdateDimensionsGroup,
  onUpdateCountGroup,
  onDeleteIndividual,
  onDeleteGroup,
  onDuplicateInstance,
  language
}) => {
  if (!isOpen || !placedPart) return null;

  const isAr = language === 'ar';
  const partName = placedPart.name || (originalPart?.name ?? placedPart.id);

  // استخراج رقم النسخة إذا وُجد في الـ uniqueId مثل Door_1_2 -> رقم 2
  const instanceMatch = placedPart.uniqueId.match(/_(\d+)$/);
  const instanceNumber = instanceMatch ? instanceMatch[1] : '1';
  const totalCount = originalPart?.count || 1;

  // أبعاد التعديل المؤقتة
  const [editWidth, setEditWidth] = useState(placedPart.originalWidth);
  const [editHeight, setEditHeight] = useState(placedPart.originalHeight);

  useEffect(() => {
    if (controlMode === 'group' && originalPart) {
      setEditWidth(originalPart.width);
      setEditHeight(originalPart.height);
    } else {
      setEditWidth(placedPart.originalWidth);
      setEditHeight(placedPart.originalHeight);
    }
  }, [controlMode, originalPart, placedPart]);

  const handleApplyDimensions = () => {
    if (editWidth > 0 && editHeight > 0) {
      if (controlMode === 'individual') {
        onUpdateDimensionsIndividual?.(placedPart.uniqueId, editWidth, editHeight);
      } else if (originalPart) {
        onUpdateDimensionsGroup(originalPart.id, editWidth, editHeight);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* رأس النافذة المنبثقة */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span
              className="w-4 h-4 rounded-full shrink-0 shadow-xs ring-2 ring-white"
              style={{ backgroundColor: placedPart.color || '#3b82f6' }}
            />
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>{partName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-mono-numbers">
                  {isAr ? `نسخة #${instanceNumber}` : `Instance #${instanceNumber}`}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 font-mono-numbers">
                {placedPart.originalWidth} × {placedPart.originalHeight} mm
                <span className="mx-1 text-slate-300">|</span>
                {placedPart.rotated
                  ? (isAr ? 'حالة التسكين: مستدارة 90°' : 'Status: Rotated 90°')
                  : (isAr ? 'حالة التسكين: أفقية 0°' : 'Status: Unrotated 0°')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/70 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* محتوى النافذة المنبثقة */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* 1. زر التبديل الرئيسي: تحكم فردي vs تحكم جماعي */}
          <div>
            <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
              {isAr ? 'وضع التحكم في التعديل:' : 'Control Scope:'}
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {/* زر تحكم فردي */}
              <button
                type="button"
                onClick={() => onChangeControlMode('individual')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  controlMode === 'individual'
                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200 ring-1 ring-blue-500/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>{isAr ? 'تحكم فردي' : 'Individual Control'}</span>
              </button>

              {/* زر تحكم جماعي */}
              <button
                type="button"
                onClick={() => onChangeControlMode('group')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  controlMode === 'group'
                    ? 'bg-white text-purple-700 shadow-sm border border-slate-200 ring-1 ring-purple-500/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>{isAr ? 'تحكم جماعي' : 'Batch / Group Control'}</span>
              </button>
            </div>

            <p className="text-[10px] text-slate-500 mt-1 px-1">
              {controlMode === 'individual'
                ? (isAr
                    ? '💡 التعديلات تسري حصرياً على هذه النسخة المحددة دون المساس بباقي القطع المماثلة.'
                    : '💡 Changes apply only to this specific piece instance on the board.')
                : (isAr
                    ? `💡 التعديلات تسري على كامل الصنف وجميع القطع المتكررة المشابهة (إجمالي ${totalCount} قطع).`
                    : `💡 Changes apply to all ${totalCount} matching repeated instances of this part.`)}
            </p>
          </div>

          {/* 2. تدوير القطعة 90 درجة */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-slate-900">
                {isAr ? 'تدوير القطعة 90°' : 'Rotate Part 90°'}
              </span>
              <span className="text-[11px] text-slate-500">
                {placedPart.rotated
                  ? (isAr ? 'القطعة حالياً مستدارة رأسياً' : 'Currently rotated vertically')
                  : (isAr ? 'القطعة حالياً أفقية بالاتجاه الأصلي' : 'Currently in default orientation')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (controlMode === 'individual') {
                  onRotateIndividual(placedPart.uniqueId);
                } else if (originalPart) {
                  onRotateGroup(originalPart.id);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-800 text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'تدوير الآن' : 'Rotate Now'}</span>
            </button>
          </div>

          {/* 2.5 تكرار النسخة المحددة فقط كقطعة مستقلة (يظهر في وضع التحكم الفردي) */}
          {controlMode === 'individual' && (
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
              <div>
                <span className="block text-xs font-bold text-emerald-950">
                  {isAr ? 'تكرار هذه النسخة فقط' : 'Duplicate This Instance'}
                </span>
                <span className="text-[11px] text-emerald-800/80">
                  {isAr
                    ? 'تنشئ قطعة مستقلة جديدة (كمية 1) دون التأثير على الصنف الأصلي أو باقي النسخ.'
                    : 'Creates a new independent piece (qty 1) without affecting the original group.'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onDuplicateInstance?.(placedPart.uniqueId);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:border-emerald-600 hover:text-emerald-700 text-emerald-900 text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isAr ? 'تكرار الآن' : 'Duplicate'}</span>
              </button>
            </div>
          )}

          {/* 3. تعديل قفل العروق (أفقي=عرض \ رأسي=طول \ حر=تدوير حر حسب المساحة) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                {isAr ? 'قفل عروق الخشب:' : 'Wood Grain Lock:'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono-numbers">
                {controlMode === 'individual'
                  ? (isAr ? 'تخصيص فردي' : 'Single Override')
                  : (isAr ? 'للصنف ككل' : 'All Instances')}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {/* أفقي = عرض */}
              <button
                type="button"
                onClick={() => {
                  if (controlMode === 'individual') {
                    onChangeGrainIndividual(placedPart.uniqueId, GrainDirection.WIDTH);
                  } else if (originalPart) {
                    onChangeGrainGroup(originalPart.id, GrainDirection.WIDTH);
                  }
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                  placedPart.grain === GrainDirection.WIDTH
                    ? 'bg-blue-600 border-blue-700 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
                title={isAr ? 'أفقي = عرض: يمنع دوران القطعة وتوازي العرض X' : 'Horizontal = Width: Keeps piece horizontal'}
              >
                <ArrowRightLeft className={`w-3.5 h-3.5 mb-1 ${placedPart.grain === GrainDirection.WIDTH ? 'text-white' : 'text-blue-600'}`} />
                <span className="text-[11px] font-bold">{isAr ? 'أفقي' : 'Width'}</span>
                <span className={`text-[9px] ${placedPart.grain === GrainDirection.WIDTH ? 'text-blue-100' : 'text-slate-400'}`}>
                  {isAr ? '(عرض)' : '(Horizontal)'}
                </span>
              </button>

              {/* رأسي = طول */}
              <button
                type="button"
                onClick={() => {
                  if (controlMode === 'individual') {
                    onChangeGrainIndividual(placedPart.uniqueId, GrainDirection.HEIGHT);
                  } else if (originalPart) {
                    onChangeGrainGroup(originalPart.id, GrainDirection.HEIGHT);
                  }
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                  placedPart.grain === GrainDirection.HEIGHT
                    ? 'bg-rose-600 border-rose-700 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
                title={isAr ? 'رأسي = طول: تدوير إلزامي 90 درجة لتوازي الطول Y' : 'Vertical = Height: Mandatory 90° rotation'}
              >
                <ArrowUpDown className={`w-3.5 h-3.5 mb-1 ${placedPart.grain === GrainDirection.HEIGHT ? 'text-white' : 'text-rose-600'}`} />
                <span className="text-[11px] font-bold">{isAr ? 'رأسي' : 'Height'}</span>
                <span className={`text-[9px] ${placedPart.grain === GrainDirection.HEIGHT ? 'text-rose-100' : 'text-slate-400'}`}>
                  {isAr ? '(طول)' : '(Vertical)'}
                </span>
              </button>

              {/* حر = تدوير حر حسب المساحة */}
              <button
                type="button"
                onClick={() => {
                  if (controlMode === 'individual') {
                    onChangeGrainIndividual(placedPart.uniqueId, GrainDirection.FREE);
                  } else if (originalPart) {
                    onChangeGrainGroup(originalPart.id, GrainDirection.FREE);
                  }
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                  placedPart.grain === GrainDirection.FREE
                    ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
                title={isAr ? 'حر = تدوير حر للقطعة حسب المساحة لتقليل الهدر' : 'Free: Smart rotation to minimize waste'}
              >
                <RotateCw className={`w-3.5 h-3.5 mb-1 ${placedPart.grain === GrainDirection.FREE ? 'text-white' : 'text-emerald-600'}`} />
                <span className="text-[11px] font-bold">{isAr ? 'حر' : 'Free'}</span>
                <span className={`text-[9px] ${placedPart.grain === GrainDirection.FREE ? 'text-emerald-100' : 'text-slate-400'}`}>
                  {isAr ? '(حسب المساحة)' : '(By Space)'}
                </span>
              </button>
            </div>
          </div>

          {/* 4. تعديل الأبعاد (فردي للنسخة الحالية، أو جماعي للصنف بالكامل) */}
          <div className={`p-3 rounded-xl border space-y-3 ${
            controlMode === 'individual'
              ? 'bg-blue-50/60 border-blue-200'
              : 'bg-purple-50/60 border-purple-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold flex items-center gap-1 ${
                controlMode === 'individual' ? 'text-blue-950' : 'text-purple-950'
              }`}>
                <Maximize2 className={`w-3.5 h-3.5 ${controlMode === 'individual' ? 'text-blue-700' : 'text-purple-700'}`} />
                <span>
                  {controlMode === 'individual'
                    ? (isAr ? 'تعديل أبعاد هذه النسخة الفردية فقط (مم):' : 'Individual Instance Dimensions (mm):')
                    : (isAr ? 'تعديل أبعاد كافة القطع المتكررة (مم):' : 'Batch Parts Dimensions (mm):')}
                </span>
              </span>
              <button
                type="button"
                onClick={handleApplyDimensions}
                className={`px-2.5 py-1 text-[11px] font-bold text-white rounded-md transition-colors cursor-pointer ${
                  controlMode === 'individual'
                    ? 'bg-blue-700 hover:bg-blue-800'
                    : 'bg-purple-700 hover:bg-purple-800'
                }`}
              >
                {isAr ? 'حفظ الأبعاد' : 'Save'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10px] mb-0.5 ${controlMode === 'individual' ? 'text-blue-900' : 'text-purple-900'}`}>
                  {isAr ? 'العرض W' : 'Width'}
                </label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={editWidth}
                  onChange={(e) => setEditWidth(Math.max(10, Number(e.target.value) || 0))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono-numbers font-bold text-slate-900 focus:outline-hidden focus:border-blue-600"
                  aria-label={isAr ? 'عرض القطعة بالمليمتر' : 'Piece width in mm'}
                  name="pieceEditWidth"
                />
              </div>
              <div>
                <label className={`block text-[10px] mb-0.5 ${controlMode === 'individual' ? 'text-blue-900' : 'text-purple-900'}`}>
                  {isAr ? 'الطول H' : 'Height'}
                </label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={editHeight}
                  onChange={(e) => setEditHeight(Math.max(10, Number(e.target.value) || 0))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono-numbers font-bold text-slate-900 focus:outline-hidden focus:border-blue-600"
                  aria-label={isAr ? 'طول القطعة بالمليمتر' : 'Piece height in mm'}
                  name="pieceEditHeight"
                />
              </div>
            </div>

            {/* تعديل الكمية التكرارية (يظهر فقط في التحكم الجماعي) */}
            {controlMode === 'group' && originalPart && (
              <div className="pt-2 border-t border-purple-200/80 flex items-center justify-between">
                <span className="text-xs font-bold text-purple-950 flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5 text-purple-700" />
                  <span>{isAr ? 'تكرار الصنف (الكمية):' : 'Total Quantity:'}</span>
                </span>

                <div className="flex items-center border border-purple-300 rounded-lg overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => onUpdateCountGroup(originalPart.id, Math.max(1, originalPart.count - 1))}
                    className="px-2 py-1 text-xs text-purple-800 hover:bg-purple-100 font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-3 text-xs font-mono-numbers font-bold text-purple-950">
                    {originalPart.count}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateCountGroup(originalPart.id, originalPart.count + 1)}
                    className="px-2 py-1 text-xs text-purple-800 hover:bg-purple-100 font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. زر الحذف */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (controlMode === 'individual') {
                  onDeleteIndividual(placedPart.uniqueId, placedPart.id);
                  onClose();
                } else if (originalPart) {
                  onDeleteGroup(originalPart.id);
                  onClose();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-200 hover:border-rose-600 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {controlMode === 'individual'
                  ? (isAr ? 'حذف هذه النسخة فقط' : 'Remove This Instance')
                  : (isAr ? 'حذف الصنف بالكامل' : 'Delete Entire Part')}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
