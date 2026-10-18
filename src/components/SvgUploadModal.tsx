/**
 * @file SvgUploadModal.tsx
 * نافذة رفع وتحليل ملفات SVG والنماذج الجاهزة لقطع الخشب
 * مع دعم استيراد التصميم ككتلة متكاملة أو تفكيكه وإظهار الـ Outline الأحمر #FF0000
 */

import React, { useState } from 'react';
import {
  X,
  Upload,
  FileCode,
  Sparkles,
  ArrowRightLeft,
  ArrowUpDown,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Maximize2
} from 'lucide-react';
import { parseSvgString, SAMPLE_SVGS, ParsedSvgResult, SvgImportMode } from '../utils/svgParser';
import { GrainDirection, GrainDirectionType, PartInput } from '../utils/nesting';

interface SvgUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportParts: (parts: PartInput[], replaceExisting: boolean) => void;
  language: 'ar' | 'en';
}

export const SvgUploadModal: React.FC<SvgUploadModalProps> = ({
  isOpen,
  onClose,
  onImportParts,
  language
}) => {
  if (!isOpen) return null;
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'upload' | 'samples' | 'paste'>('upload');
  const [importMode, setImportMode] = useState<SvgImportMode>('single');
  const [defaultGrain, setDefaultGrain] = useState<GrainDirectionType>(GrainDirection.FREE);
  const [svgContent, setSvgContent] = useState('');
  const [parsedResult, setParsedResult] = useState<ParsedSvgResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);

  // تخصيص أبعاد القطعة المستوردة بالمليمتر
  const [overrideWidth, setOverrideWidth] = useState<number | ''>('');
  const [overrideHeight, setOverrideHeight] = useState<number | ''>('');
  const [partCopies, setPartCopies] = useState<number>(1);

  const processSvgContent = (content: string, fileName?: string, mode: SvgImportMode = importMode) => {
    try {
      setErrorMsg(null);
      setSvgContent(content);
      const res = parseSvgString(content, defaultGrain, 1, mode);
      if (res.parts.length === 0) {
        setErrorMsg(isAr ? 'لم يتم العثور على أشكال قابلة للقص في ملف SVG.' : 'No cuttable shapes found in SVG.');
        return;
      }
      res.fileName = fileName;
      setParsedResult(res);

      if (res.parts.length === 1) {
        setOverrideWidth(res.parts[0].width);
        setOverrideHeight(res.parts[0].height);
        setPartCopies(res.parts[0].count || 1);
      } else {
        setOverrideWidth('');
        setOverrideHeight('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(isAr ? `خطأ أثناء تحليل ملف SVG: ${msg}` : `SVG parse error: ${msg}`);
    }
  };

  const handleFile = (file: File) => {
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
      setErrorMsg(isAr ? 'صيغة الملف غير مدعومة — الرجاء اختيار ملف SVG.' : 'Unsupported file format — please select an SVG file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      processSvgContent(content, file.name, importMode);
    };
    reader.onerror = () => {
      setErrorMsg(isAr ? 'تعذر قراءة الملف المحدد.' : 'Failed to read selected file.');
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  };

  const [dragActive, setDragActive] = useState(false);
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleFile(file);
  };

  const handleModeChange = (mode: SvgImportMode) => {
    setImportMode(mode);
    if (svgContent) {
      processSvgContent(svgContent, parsedResult?.fileName, mode);
    }
  };

  const handleSelectSample = (sample: typeof SAMPLE_SVGS[0]) => {
    processSvgContent(sample.svg, sample.title, importMode);
  };

  const handleConfirmImport = () => {
    if (!parsedResult || parsedResult.parts.length === 0) return;

    let finalParts = parsedResult.parts.map(p => ({
      ...p,
      grain: defaultGrain,
      color: '#FF0000'
    }));

    // تطبيق التعديلات المخصصة للأبعاد والكمية إن وجدت
    if (finalParts.length === 1 && typeof overrideWidth === 'number' && typeof overrideHeight === 'number') {
      finalParts[0] = {
        ...finalParts[0],
        width: Math.max(10, overrideWidth),
        height: Math.max(10, overrideHeight),
        count: Math.max(1, partCopies)
      };
    }

    onImportParts(finalParts, replaceExisting);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* رأس النافذة */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-100 text-red-700 rounded-lg">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isAr ? 'استيراد تصميم حقيقي بمساراته من ملف SVG' : 'Import Real Vector Design from SVG'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? 'يتم استخراج المسارات الأصلية بجميع التفريغات والمنحنيات كـ Outline بارز باللون الأحمر #FF0000' : 'Extracts full contours and inner cutouts as bold #FF0000 red outlines'}
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

        {/* أزرار التبويب */}
        <div className="px-6 pt-3 border-b border-slate-200 bg-white flex gap-2">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'رفع ملف من الجهاز' : 'Upload File'}
          </button>
          <button
            onClick={() => setActiveTab('samples')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'samples'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'تصاميم CNC هندسية جاهزة' : 'Sample CNC Designs'}
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'paste'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'لصق كود SVG' : 'Paste SVG Code'}
          </button>
        </div>

        {/* محتوى الاستيراد */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* رسائل التنبيه والخطأ */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* تبويب 1: رفع ملف من الجهاز */}
          {activeTab === 'upload' && (
            <label
              htmlFor="svgFilePicker"
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 rounded-2xl p-8 text-center cursor-pointer transition-colors group flex flex-col items-center ${
                dragActive
                  ? 'border-red-600 bg-red-50/30'
                  : 'border-dashed border-slate-300 hover:border-red-500 bg-slate-50/50 hover:bg-red-50/20'
              }`}
            >
              <input
                id="svgFilePicker"
                type="file"
                accept=".svg,image/svg+xml"
                onChange={handleFileUpload}
                className="sr-only"
              />
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-red-100 group-hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors">
                <FolderOpen className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 mb-1">
                {isAr ? 'انقر لاختيار ملف SVG من جهازك أو اسحبه هنا' : 'Click to select an SVG file or drag & drop'}
              </p>
              <p className="text-xs text-slate-500">
                {isAr ? 'يدعم ملفات أوتوكاد وإليستريتور وبرامج CNC المختلفة' : 'Supports Illustrator, AutoCAD, Inkscape & CNC vector exports'}
              </p>
            </label>
          )}

          {/* تبويب 2: تصاميم CNC جاهزة */}
          {activeTab === 'samples' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                {isAr ? 'اختر أحد التصاميم الهندسية الحقيقية للاختبار والتسكين المباشر:' : 'Choose a realistic CNC design template to test:'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SAMPLE_SVGS.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => handleSelectSample(sample)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-red-500 hover:bg-red-50/20 text-right transition-all flex flex-col justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 group-hover:text-red-700 mb-1">
                        {isAr ? sample.title : sample.titleEn}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {sample.description}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-red-600">
                      <span>{isAr ? 'تحميل التصميم' : 'Load Design'}</span>
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* تبويب 3: لصق كود SVG */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <label htmlFor="svgPaste" className="block text-xs font-bold text-slate-700">
                {isAr ? 'الصق نص كود الـ SVG هنا:' : 'Paste raw SVG XML markup:'}
              </label>
              <textarea
                id="svgPaste"
                value={svgContent}
                onChange={(e) => setSvgContent(e.target.value)}
                placeholder="<svg ...> ... </svg>"
                className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:border-red-500 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => processSvgContent(svgContent, 'pasted_design.svg', importMode)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {isAr ? 'تحليل ومعاينة الكود' : 'Parse & Preview'}
              </button>
            </div>
          )}

          {/* خيارات وضع الاستيراد (Import Mode) وقفل العروق */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <span className="block text-xs font-bold text-slate-800">
              {isAr ? 'طريقة معالجة ملف الـ SVG:' : 'Import Mode:'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleModeChange('single')}
                className={`p-2.5 rounded-lg border text-right text-xs transition-all cursor-pointer ${
                  importMode === 'single'
                    ? 'border-red-600 bg-red-50 text-red-800 font-bold ring-1 ring-red-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span>{isAr ? 'تصميم متكامل موحد (موصى به)' : 'Single Unified Design (Recommended)'}</span>
                  {importMode === 'single' && <CheckCircle2 className="w-4 h-4 text-red-600" />}
                </div>
                <p className="text-[10px] text-slate-500 font-normal">
                  {isAr ? 'الحفاظ على كافة التفريغات والثقوب والمنحنيات كقطعة واحدة' : 'Preserve all internal holes and cutouts as one whole part'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('groups')}
                className={`p-2.5 rounded-lg border text-right text-xs transition-all cursor-pointer ${
                  importMode === 'groups'
                    ? 'border-red-600 bg-red-50 text-red-800 font-bold ring-1 ring-red-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span>{isAr ? 'تفكيك المجموعات والطبقات' : 'Explode Groups / Layers'}</span>
                  {importMode === 'groups' && <CheckCircle2 className="w-4 h-4 text-red-600" />}
                </div>
                <p className="text-[10px] text-slate-500 font-normal">
                  {isAr ? 'استخراج كل مجموعة أو طبقة كقطعة مستقلة' : 'Extract each group as a separate nested part'}
                </p>
              </button>
            </div>

            {/* تحديد قفل عروق الخشب للتصميم المستورد */}
            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                {isAr ? 'تثبيت عروق الخشب للقطع المستوردة:' : 'Wood Grain Lock for Imported Parts:'}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setDefaultGrain(GrainDirection.WIDTH)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    defaultGrain === GrainDirection.WIDTH
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'أفقي (X)' : 'Width (X)'}
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultGrain(GrainDirection.HEIGHT)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    defaultGrain === GrainDirection.HEIGHT
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'رأسي (Y)' : 'Height (Y)'}
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultGrain(GrainDirection.FREE)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    defaultGrain === GrainDirection.FREE
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'دوران حر (Free)' : 'Free'}
                </button>
              </div>
            </div>
          </div>

          {/* معاينة التصميم المستخرج بـ Outline أحمر #FF0000 */}
          {parsedResult && parsedResult.parts.length > 0 && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                  <span>{isAr ? `معاينة التصميم الحقيقي (تم العثور على ${parsedResult.parts.length} قطعة)` : `Preview (${parsedResult.parts.length} parts found)`}</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono-numbers">
                  {parsedResult.fileName || ''}
                </span>
              </div>

              {/* عارض المعاينة الهندسية */}
              <div className="h-48 bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-center overflow-hidden">
                {parsedResult.parts[0]?.svgSnippet ? (
                  <svg
                    viewBox={parsedResult.parts[0].viewBox}
                    className="max-h-full max-w-full block"
                    preserveAspectRatio="xMidYMid meet"
                    dangerouslySetInnerHTML={{ __html: parsedResult.parts[0].svgSnippet }}
                  />
                ) : (
                  <div className="text-xs text-slate-400">
                    {isAr ? 'معاينة جاهزة' : 'Preview ready'}
                  </div>
                )}
              </div>

              {/* تعديل الأبعاد المخصصة إذا كانت قطعة واحدة */}
              {parsedResult.parts.length === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label htmlFor="svgOverrideWidth" className="block text-[11px] font-bold text-slate-700 mb-1">
                      {isAr ? 'العرض (X) بالمليمتر:' : 'Width (X) mm:'}
                    </label>
                    <input
                      id="svgOverrideWidth"
                      type="number"
                      value={overrideWidth}
                      onChange={(e) => setOverrideWidth(Number(e.target.value) || '')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono-numbers text-slate-800"
                      aria-label={isAr ? 'عرض التصميم بالمليمتر' : 'Design width in mm'}
                      name="svgOverrideWidth"
                    />
                  </div>
                  <div>
                    <label htmlFor="svgOverrideHeight" className="block text-[11px] font-bold text-slate-700 mb-1">
                      {isAr ? 'الارتفاع (Y) بالمليمتر:' : 'Height (Y) mm:'}
                    </label>
                    <input
                      id="svgOverrideHeight"
                      type="number"
                      value={overrideHeight}
                      onChange={(e) => setOverrideHeight(Number(e.target.value) || '')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono-numbers text-slate-800"
                      aria-label={isAr ? 'ارتفاع التصميم بالمليمتر' : 'Design height in mm'}
                      name="svgOverrideHeight"
                    />
                  </div>
                  <div>
                    <label htmlFor="svgPartCopies" className="block text-[11px] font-bold text-slate-700 mb-1">
                      {isAr ? 'كمية التكرار (نسخ):' : 'Copies:'}
                    </label>
                    <input
                      id="svgPartCopies"
                      type="number"
                      min="1"
                      value={partCopies}
                      onChange={(e) => setPartCopies(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono-numbers text-red-600"
                      aria-label={isAr ? 'كمية التكرار بالنسخ' : 'Number of copies'}
                      name="svgPartCopies"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* أزرار التأكيد السفلية */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
            />
            <span>{isAr ? 'استبدال القطع الحالية في المشروع' : 'Replace existing parts'}</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!parsedResult || parsedResult.parts.length === 0}
              onClick={handleConfirmImport}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isAr ? 'تأكيد الاستيراد والتسكين' : 'Confirm Import & Nest'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
