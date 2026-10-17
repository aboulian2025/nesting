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
  Info
} from 'lucide-react';
import { SheetStats, PlacedPart } from '../utils/nesting';
import { cleanSnippetForInkscape } from '../utils/exporters';

interface SheetCanvasProps {
  sheets: SheetStats[];
  activeSheetIndex: number;
  onChangeActiveSheet: (index: number) => void;
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  language: 'ar' | 'en';
}

export const SheetCanvas: React.FC<SheetCanvasProps> = ({
  sheets,
  activeSheetIndex,
  onChangeActiveSheet,
  selectedPartId,
  onSelectPart,
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
                  const isSelected = selectedPartId === part.id;
                  const isHovered = hoveredPart?.uniqueId === part.uniqueId;
                  const isRotated = part.rotated;

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
                      onClick={() => onSelectPart(isSelected ? null : part.id)}
                      onMouseEnter={() => setHoveredPart(part)}
                      onMouseLeave={() => setHoveredPart(null)}
                      className="cursor-pointer transition-opacity duration-150"
                      opacity={selectedPartId && !isSelected ? 0.35 : 1}
                    >
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
                          {(isSelected || isHovered) && (
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
                          )}
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
                            strokeWidth="2.5"
                          />

                          {/* إطار التحديد عند النقر أو التحويم */}
                          {(isSelected || isHovered) && (
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
                          )}
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
              {hoveredPart.rotated && (
                <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <RotateCw className="w-3 h-3" />
                  <span>{isAr ? 'مدورة 90°' : 'Rotated 90°'}</span>
                </span>
              )}
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
