/**
 * @file SheetCanvas.tsx
 * لوحة العرض الهندسية للألواح والقطع المسكنة
 * - خلفية اللوح بيضاء صافية (#FFFFFF) مع إطار يوضح مقاس اللوح فقط
 * - إزالة الترقيم والتسميات فوق القطع لظهورها نقية
 * - إظهار التصميم والمسارات كـ Outline بارز باللون الأحمر #FF0000
 */

import React, { useState, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Scissors,
  CheckCircle2,
  RotateCw,
  Info,
  User,
  Users,
  Settings,
  ArrowRightLeft,
  ArrowUpDown,
  Copy,
  X,
  Undo2,
  Redo2
} from 'lucide-react';
import { SheetStats, PlacedPart, GrainDirection, GrainDirectionType } from '../utils/nesting';
import { cleanSnippetForInkscape } from '../utils/exporters';

interface SheetCanvasProps {
  sheets: SheetStats[];
  activeSheetIndex: number;
  onChangeActiveSheet: (index: number) => void;
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  selectedPlacedPart?: PlacedPart | null;
  onSelectPlacedPart?: (part: PlacedPart | null, mode?: 'individual' | 'group') => void;
  onOpenPieceModal?: (part: PlacedPart, mode: 'individual' | 'group') => void;
  controlMode?: 'individual' | 'group';
  onChangeControlMode?: (mode: 'individual' | 'group') => void;
  onRotateIndividual?: (uniqueId: string) => void;
  onRotateGroup?: (partId: string) => void;
  onChangeGrainIndividual?: (uniqueId: string, grain: GrainDirectionType) => void;
  onChangeGrainGroup?: (partId: string, grain: GrainDirectionType) => void;
  onDuplicateInstance?: (uniqueId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  language: 'ar' | 'en';
}

export const SheetCanvas: React.FC<SheetCanvasProps> = ({
  sheets,
  activeSheetIndex,
  onChangeActiveSheet,
  selectedPartId,
  onSelectPart,
  selectedPlacedPart,
  onSelectPlacedPart,
  onOpenPieceModal,
  controlMode = 'individual',
  onChangeControlMode,
  onRotateIndividual,
  onRotateGroup,
  onChangeGrainIndividual,
  onChangeGrainGroup,
  onDuplicateInstance,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  language
}) => {
  const isAr = language === 'ar';
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [showCutLines, setShowCutLines] = useState(true);
  const [hoveredPart, setHoveredPart] = useState<PlacedPart | null>(null);

  const activeSheet = sheets[activeSheetIndex] || sheets[0];

  if (!activeSheet) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
        {isAr ? 'لا توجد ألواح لعرضها حالياً.' : 'No sheets to display.'}
      </div>
    );
  }

  const handleZoomIn = () => setZoom(prev => Math.min(2.5, prev + 0.15));
  const handleZoomOut = () => setZoom(prev => Math.max(0.4, prev - 0.15));
  const handleResetZoom = () => setZoom(1);

  const sheetW = activeSheet.sheetWidth;
  const sheetH = activeSheet.sheetHeight;
  const margin = activeSheet.sheetMargin;
  const usableW = Math.max(0, sheetW - margin * 2);
  const usableH = Math.max(0, sheetH - margin * 2);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-full overflow-hidden">
      {/* شريط تبويبات الألواح وأدوات التحكم باللوحة */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* ألسنة التبديل بين الألواح */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {sheets.map((sheet, idx) => {
            const isActive = idx === activeSheetIndex;
            const util = sheet.utilizationPercent;
            const utilColor =
              util >= 80 ? 'text-emerald-700 bg-emerald-100/80 border-emerald-300' :
              util >= 60 ? 'text-amber-700 bg-amber-100/80 border-amber-300' :
              'text-rose-700 bg-rose-100/80 border-rose-300';

            return (
              <button
                key={sheet.sheetIndex}
                onClick={() => onChangeActiveSheet(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span>{isAr ? `لوح #${sheet.sheetIndex}` : `Sheet #${sheet.sheetIndex}`}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono-numbers ${isActive ? 'bg-white/20 text-white' : utilColor}`}>
                  {util}%
                </span>
              </button>
            );
          })}
        </div>

        {/* أدوات الزووم وإظهار فواصل المنشار */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {/* أزرار التراجع والإعادة Undo / Redo */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 transition-colors ${
                canUndo
                  ? 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title={isAr ? 'تراجع (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 transition-colors border-s border-slate-200 ${
                canRedo
                  ? 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
              title={isAr ? 'إعادة (Ctrl+Shift+Z)' : 'Redo (Ctrl+Shift+Z)'}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* تبديل خطوط مسار المنشار */}
          <button
            onClick={() => setShowCutLines(!showCutLines)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              showCutLines
                ? 'bg-red-50 text-red-700 border-red-300'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title={isAr ? 'إظهار مسارات المنشار' : 'Toggle Saw Cut Guides'}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px] font-medium">
              {isAr ? 'فواصل السلاح' : 'Kerf Lines'}
            </span>
          </button>

          {/* أدوات الزووم */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isAr ? 'تصغير' : 'Zoom Out'}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[10px] font-mono-numbers text-slate-600 font-bold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isAr ? 'تكبير' : 'Zoom In'}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 text-slate-600 hover:bg-slate-100 border-s border-slate-200 transition-colors cursor-pointer"
              title={isAr ? 'إعادة ضبط الملاءمة' : 'Reset View'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* منطقة الرسم الكبرى SVG */}
      <div
        ref={containerRef}
        className="flex-1 bg-slate-100/70 relative overflow-auto p-4 sm:p-6 flex items-center justify-center min-h-[440px]"
      >
        {/* شريط الإجراءات والتحكم السريع العائم عند اختيار قطعة */}
        {selectedPlacedPart && (
          <div className="absolute top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-30 bg-white/95 backdrop-blur-md shadow-xl border border-slate-300 rounded-2xl p-2 sm:px-4 sm:py-2.5 flex flex-wrap items-center justify-between sm:justify-start gap-2 max-w-2xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                style={{ backgroundColor: selectedPlacedPart.color || '#ef4444' }}
              />
              <span className="text-xs font-bold text-slate-900 max-w-[130px] sm:max-w-[180px] truncate">
                {selectedPlacedPart.name}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono-numbers">
                #{selectedPlacedPart.uniqueId.replace(/.*_/, '')}
              </span>
            </div>

            {/* أزرار اختيار نطاق التحكم: فردي أو جماعي */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => onChangeControlMode?.('individual')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  controlMode === 'individual'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={isAr ? 'التحكم في هذه النسخة الفردية فقط' : 'Individual piece control'}
              >
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'تحكم فردي' : 'Individual'}</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeControlMode?.('group')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  controlMode === 'group'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={isAr ? 'التحكم في كافة القطع المتكررة من هذا الصنف' : 'Batch repeated parts control'}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{isAr ? 'تحكم جماعي' : 'Group'}</span>
              </button>
            </div>

            {/* أزرار الإجراء السريع: تدوير، قفل العروق، وتعديل تفصيلي */}
            <div className="flex items-center gap-1">
              {/* تدوير 90° */}
              <button
                type="button"
                onClick={() => {
                  if (controlMode === 'individual') {
                    onRotateIndividual?.(selectedPlacedPart.uniqueId);
                  } else {
                    onRotateGroup?.(selectedPlacedPart.id);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title={isAr ? (controlMode === 'individual' ? 'تدوير هذه النسخة 90°' : 'تدوير كافة القطع المتكررة 90°') : 'Rotate 90°'}
              >
                <RotateCw className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">{isAr ? 'تدوير 90°' : 'Rotate'}</span>
              </button>

              {/* تكرار هذه النسخة فقط كقطعة مستقلة */}
              <button
                type="button"
                onClick={() => onDuplicateInstance?.(selectedPlacedPart.uniqueId)}
                className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title={isAr ? 'تكرار هذه النسخة فقط كقطعة مستقلة دون التأثير على باقي النسخ' : 'Duplicate this instance as an independent piece'}
              >
                <Copy className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">{isAr ? 'تكرار' : 'Duplicate'}</span>
              </button>

              {/* قفل العروق السريع */}
              <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    if (controlMode === 'individual') {
                      onChangeGrainIndividual?.(selectedPlacedPart.uniqueId, GrainDirection.WIDTH);
                    } else {
                      onChangeGrainGroup?.(selectedPlacedPart.id, GrainDirection.WIDTH);
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                    selectedPlacedPart.grain === GrainDirection.WIDTH ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={isAr ? 'أفقي = عرض' : 'Width'}
                >
                  <ArrowRightLeft className="w-2.5 h-2.5 inline mx-0.5" />
                  <span>{isAr ? 'عرض' : 'W'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (controlMode === 'individual') {
                      onChangeGrainIndividual?.(selectedPlacedPart.uniqueId, GrainDirection.HEIGHT);
                    } else {
                      onChangeGrainGroup?.(selectedPlacedPart.id, GrainDirection.HEIGHT);
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                    selectedPlacedPart.grain === GrainDirection.HEIGHT ? 'bg-rose-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={isAr ? 'رأسي = طول' : 'Height'}
                >
                  <ArrowUpDown className="w-2.5 h-2.5 inline mx-0.5" />
                  <span>{isAr ? 'طول' : 'H'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (controlMode === 'individual') {
                      onChangeGrainIndividual?.(selectedPlacedPart.uniqueId, GrainDirection.FREE);
                    } else {
                      onChangeGrainGroup?.(selectedPlacedPart.id, GrainDirection.FREE);
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                    selectedPlacedPart.grain === GrainDirection.FREE ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={isAr ? 'حر = تدوير حر للقطعة حسب المساحة' : 'Free'}
                >
                  <RotateCw className="w-2.5 h-2.5 inline mx-0.5" />
                  <span>{isAr ? 'حر' : 'F'}</span>
                </button>
              </div>

              {/* زر التعديل المفصل (فتح النافذة) */}
              <button
                type="button"
                onClick={() => onOpenPieceModal?.(selectedPlacedPart, controlMode)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                title={isAr ? 'تعديل تفصيلي للقياسات والخصائص' : 'Edit details'}
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isAr ? 'تعديل' : 'Edit'}</span>
              </button>

              {/* زر إلغاء التحديد */}
              <button
                type="button"
                onClick={() => {
                  onSelectPlacedPart?.(null);
                  onSelectPart(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                title={isAr ? 'إلغاء التحديد' : 'Deselect'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div
          className="transition-transform duration-200 ease-out origin-center select-none w-full flex items-center justify-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* إطار اللوح الخارجي وحاوية الرسم */}
          <div className="relative shadow-xl rounded-none bg-white w-full max-w-[1100px] border border-slate-300">
            <svg
              viewBox={`0 0 ${sheetW} ${sheetH}`}
              className="w-full h-auto block"
              style={{
                aspectRatio: `${sheetW} / ${sheetH}`
              }}
            >
              <defs>
                {/* مسار اقتصاص لحدود اللوح لمنع ظهور أي مسارات عشوائية خارجه */}
                <clipPath id="sheetWorkAreaClip">
                  <rect x="0" y="0" width={sheetW} height={sheetH} />
                </clipPath>
              </defs>

              {/* 1. خلفية اللوح بيضاء صافية تماماً */}
              <rect
                x="0"
                y="0"
                width={sheetW}
                height={sheetH}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="3.5"
              />

              {/* إطار يوضح مقاس اللوح فقط (Width × Height mm) */}
              <g pointerEvents="none">
                {/* علامة البعد السفلي */}
                <line
                  x1="20"
                  y1={sheetH - 25}
                  x2={sheetW - 20}
                  y2={sheetH - 25}
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeDasharray="10 6"
                />
                <rect
                  x={sheetW / 2 - 190}
                  y={sheetH - 42}
                  width="380"
                  height="34"
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                  rx="6"
                />
                <text
                  x={sheetW / 2}
                  y={sheetH - 19}
                  fill="#0f172a"
                  fontSize="20"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {isAr ? `إطار اللوح: ${sheetW} × ${sheetH} مم` : `Sheet Size: ${sheetW} × ${sheetH} mm`}
                </text>
              </g>

              {/* 2. حدود هامش اللوح المتروك (sheetMargin) */}
              {margin > 0 && (
                <g pointerEvents="none">
                  <rect
                    x={margin}
                    y={margin}
                    width={usableW}
                    height={usableH}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    strokeDasharray="12 8"
                  />
                  <text
                    x={margin + 12}
                    y={margin + 20}
                    fill="#94a3b8"
                    fontSize="13"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {isAr ? `هامش: ${margin} مم` : `Margin: ${margin}mm`}
                  </text>
                </g>
              )}

              {/* 3. طبقة القطع المسكنة مع حماية الاقتصاص لمنع أي مسارات خارج صفحة العمل */}
              <g clipPath="url(#sheetWorkAreaClip)">
                {activeSheet.placedParts.map((part) => {
                  const isThisInstanceSelected = selectedPlacedPart?.uniqueId === part.uniqueId;
                  const isSamePartGroup = selectedPartId === part.id;
                  const isHovered = hoveredPart?.uniqueId === part.uniqueId;
                  const isRotated = part.rotated;

                  // أجزاء NFP: contour جاهز بإحداثيات اللوح (يشمل أي زاوية دوران)
                  if (part.contour && part.contour.length >= 3) {
                    const pts = part.contour
                      .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
                      .join(' ');
                    return (
                      <g
                        key={part.uniqueId}
                        onClick={() => {
                          if (onSelectPlacedPart) {
                            if (selectedPlacedPart?.uniqueId === part.uniqueId) {
                              onSelectPlacedPart(null);
                              onSelectPart(null);
                            } else {
                              onSelectPlacedPart(part, 'individual');
                              onSelectPart(part.id);
                            }
                          } else {
                            onSelectPart(isSamePartGroup ? null : part.id);
                          }
                        }}
                        onDoubleClick={() => {
                          onOpenPieceModal?.(part, controlMode || 'individual');
                        }}
                        onMouseEnter={() => setHoveredPart(part)}
                        onMouseLeave={() => setHoveredPart(null)}
                        className="cursor-pointer transition-opacity duration-150"
                        opacity={selectedPartId && !isSamePartGroup ? 0.35 : 1}
                      >
                        {/* المسارات الحقيقية المستوردة (تشمل الثقوب/المسارات الداخلية) */}
                        {part.svgSnippet && part.worldTx !== undefined && part.worldTy !== undefined && (
                          <g
                            transform={
                              `translate(${part.worldTx}, ${part.worldTy}) ` +
                              `rotate(${part.rotationDeg || 0}) ` +
                              `scale(${(part.originalBBox?.width ? part.originalWidth / part.originalBBox.width : 1).toFixed(4)}, ${(part.originalBBox?.height ? part.originalHeight / part.originalBBox.height : 1).toFixed(4)}) ` +
                              `translate(${-(part.originalBBox?.x || 0)}, ${-(part.originalBBox?.y || 0)})`
                            }
                            pointerEvents="none"
                            dangerouslySetInnerHTML={{ __html: cleanSnippetForInkscape(part.svgSnippet) }}
                          />
                        )}
                        {/* منطقة نقر تغطي شكل القطعة الفعلي */}
                        <polygon points={pts} fill="transparent" pointerEvents="all" />
                        {/* مؤشر فاصل الشفرة (تقريبي) */}
                        {showCutLines && activeSheet.partGap > 0 && (
                          <polygon
                            points={pts}
                            fill="none"
                            stroke="#f87171"
                            strokeWidth={Math.max(activeSheet.partGap, 1)}
                            strokeDasharray="4 2"
                            opacity="0.3"
                            pointerEvents="none"
                          />
                        )}
                        {/* الحد الخارجي الحقيقي للقص */}
                        <polygon
                          points={pts}
                          fill="none"
                          stroke="#FF0000"
                          strokeWidth="3.5"
                          pointerEvents="none"
                        />
                        {/* إطارات التحديد/التحويم */}
                        {isThisInstanceSelected ? (
                          <polygon
                            points={pts}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="4.5"
                            strokeDasharray="10 5"
                            pointerEvents="none"
                          />
                        ) : isSamePartGroup ? (
                          <polygon
                            points={pts}
                            fill="none"
                            stroke="#9333ea"
                            strokeWidth="3.5"
                            strokeDasharray="6 4"
                            pointerEvents="none"
                          />
                        ) : isHovered ? (
                          <polygon
                            points={pts}
                            fill="none"
                            stroke="#60a5fa"
                            strokeWidth="3"
                            strokeDasharray="4 4"
                            pointerEvents="none"
                          />
                        ) : null}
                      </g>
                    );
                  }

                  const scaleX = part.originalBBox?.width ? part.originalWidth / part.originalBBox.width : 1;
                  const scaleY = part.originalBBox?.height ? part.originalHeight / part.originalBBox.height : 1;
                  const scaleStr = Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001
                    ? ` scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`
                    : '';

                  const partTransform = isRotated
                    ? `translate(${part.x + part.width}, ${part.y}) rotate(90)${scaleStr}`
                    : `translate(${part.x}, ${part.y})${scaleStr}`;

                  return (
                    <g
                      key={part.uniqueId}
                      transform={partTransform}
                      onClick={() => {
                        if (onSelectPlacedPart) {
                          if (selectedPlacedPart?.uniqueId === part.uniqueId) {
                            onSelectPlacedPart(null);
                            onSelectPart(null);
                          } else {
                            // النقر على أي قطعة يفعّل التحكم الفردي بهذه النسخة تحديداً
                            // ويمكن التبديل إلى التحكم الجماعي من الشريط العائم (لكل النسخ المتكررة)
                            onSelectPlacedPart(part, 'individual');
                            onSelectPart(part.id);
                          }
                        } else {
                          onSelectPart(isSamePartGroup ? null : part.id);
                        }
                      }}
                      onDoubleClick={() => {
                        onOpenPieceModal?.(part, controlMode || 'individual');
                      }}
                      onMouseEnter={() => setHoveredPart(part)}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="cursor-pointer transition-opacity duration-150"
                      opacity={selectedPartId && !isSamePartGroup ? 0.35 : 1}
                    >
                      {/* منطقة نقر شفافة تغطي كامل مساحة القطعة (بما فيها النحيفة) لتسهيل التحديد بالنقر */}
                      <rect
                        x="0"
                        y="0"
                        width={part.originalWidth}
                        height={part.originalHeight}
                        fill="transparent"
                        pointerEvents="all"
                      />

                      {/* خط فاصل سماكة سلاح المنشار Kerf */}
                      {showCutLines && activeSheet.partGap > 0 && (
                        <rect
                          x={-activeSheet.partGap / 2}
                          y={-activeSheet.partGap / 2}
                          width={part.originalWidth + activeSheet.partGap}
                          height={part.originalHeight + activeSheet.partGap}
                          fill="none"
                          stroke="#f87171"
                          strokeWidth="0.8"
                          strokeDasharray="4 2"
                          opacity="0.4"
                        />
                      )}

                      {/* إذا كانت القطعة تحتوي على مسار SVG حقيقي مستورد */}
                      {part.svgSnippet ? (
                        <g>
                          {/* المسار الحقيقي كـ Outline أحمر بارز #FF0000 بدون وسوم svg متداخلة */}
                          <g
                            transform={`translate(${-(part.originalBBox?.x || 0)}, ${-(part.originalBBox?.y || 0)})`}
                            dangerouslySetInnerHTML={{ __html: cleanSnippetForInkscape(part.svgSnippet) }}
                          />

                          {/* إطار التحديد عند النقر أو التحويم */}
                          {isThisInstanceSelected ? (
                            <rect
                              x="-2"
                              y="-2"
                              width={part.originalWidth + 4}
                              height={part.originalHeight + 4}
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="3.5"
                              strokeDasharray="10 5"
                              rx="2"
                            />
                          ) : isSamePartGroup ? (
                            <rect
                              x="-2"
                              y="-2"
                              width={part.originalWidth + 4}
                              height={part.originalHeight + 4}
                              fill="none"
                              stroke="#9333ea"
                              strokeWidth="2.5"
                              strokeDasharray="6 4"
                              rx="2"
                            />
                          ) : isHovered ? (
                            <rect
                              x="-2"
                              y="-2"
                              width={part.originalWidth + 4}
                              height={part.originalHeight + 4}
                              fill="none"
                              stroke="#60a5fa"
                              strokeWidth="2"
                              strokeDasharray="4 4"
                              rx="2"
                            />
                          ) : null}
                        </g>
                      ) : (
                        /* للقطع المستطيلة العادية المنشأة يدوياً كـ Outline أحمر بارز #FF0000 */
                        <g>
                          <rect
                            x="0"
                            y="0"
                            width={part.originalWidth}
                            height={part.originalHeight}
                            fill="none"
                            stroke="#FF0000"
                            strokeWidth="3.5"
                            pointerEvents="none"
                          />

                          {/* إطار التحديد عند النقر أو التحويم */}
                          {isThisInstanceSelected ? (
                            <rect
                              x="-2"
                              y="-2"
                              width={part.originalWidth + 4}
                              height={part.originalHeight + 4}
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="3.5"
                              strokeDasharray="10 5"
                              rx="2"
                            />
                          ) : isSamePartGroup ? (
                            <rect
                              x="-2"
                              y="-2"
                              width={part.originalWidth + 4}
                              height={part.originalHeight + 4}
                              fill="none"
                              stroke="#9333ea"
                              strokeWidth="2.5"
                              strokeDasharray="6 4"
                              rx="2"
                            />
                          ) : isHovered ? (
                            <rect
                              x="-2"
                              y="-2"
                              width={part.originalWidth + 4}
                              height={part.originalHeight + 4}
                              fill="none"
                              stroke="#60a5fa"
                              strokeWidth="2"
                              strokeDasharray="4 4"
                              rx="2"
                            />
                          ) : null}
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>

        {/* نافذة تفاصيل القطعة عند التحويم العائم لتفادي تغطية الرسم */}
        {hoveredPart && (
          <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-xs text-white p-3 rounded-xl shadow-2xl border border-slate-700 pointer-events-none text-xs flex flex-col gap-1 max-w-xs animate-in fade-in">
            <div className="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5">
              <span className="font-bold text-red-400">{hoveredPart.name}</span>
              {hoveredPart.rotationDeg !== undefined && hoveredPart.rotationDeg !== 0 ? (
                <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <RotateCw className="w-3 h-3" />
                  <span>{isAr ? `دوران ${hoveredPart.rotationDeg}°` : `Rotated ${hoveredPart.rotationDeg}°`}</span>
                </span>
              ) : hoveredPart.rotated ? (
                <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <RotateCw className="w-3 h-3" />
                  <span>{isAr ? 'مدورة 90°' : 'Rotated 90°'}</span>
                </span>
              ) : null}
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-300 font-mono-numbers">
              <span>{isAr ? 'الأبعاد الحقيقية:' : 'Dimensions:'}</span>
              <span className="font-bold text-white">{hoveredPart.originalWidth} × {hoveredPart.originalHeight} مم</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-300 font-mono-numbers">
              <span>{isAr ? 'الموضع على اللوح (X, Y):' : 'Sheet Position:'}</span>
              <span>({Math.round(hoveredPart.x)}, {Math.round(hoveredPart.y)}) مم</span>
            </div>
          </div>
        )}
      </div>

      {/* شريط الإحصائيات والمعلومات السفلية للوح النشط */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span>
            {isAr ? 'القطع المسكنة على هذا اللوح:' : 'Parts on this sheet:'}{' '}
            <strong className="text-slate-900 font-mono-numbers">{activeSheet.placedCount}</strong>
          </span>
          <span>•</span>
          <span>
            {isAr ? 'استغلال اللوح:' : 'Utilization:'}{' '}
            <strong className="text-red-600 font-mono-numbers">{activeSheet.utilizationPercent}%</strong>
          </span>
          <span>•</span>
          <span>
            {isAr ? 'طول مسارات القص المتوقع:' : 'Cut Length:'}{' '}
            <strong className="text-slate-900 font-mono-numbers">{activeSheet.estimatedCutLengthMeters} م</strong>
          </span>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          {isAr ? 'يتم عرض القطع كـ Outline أحمر #FF0000 بمساراتها الأصلية الدقيقة' : 'Rendered as red #FF0000 vector outline'}
        </div>
      </div>
    </div>
  );
};
