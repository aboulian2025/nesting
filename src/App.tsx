/**
 * @file App.tsx
 * التطبيق الرئيسي لمحرك توزيع الألواح وتوفير الخامة (Sheet Nesting Engine)
 * - استيراد مسارات SVG الحقيقية
 * - خلفية اللوح بيضاء صافية مع إطار يوضح مقاس اللوح فقط
 * - وضع الأبعاد المخصصة، الهامش، سلاح المنشار، أولوية الترتيب، والكمية المتكررة في الواجهة
 * - إظهار التصميم على شكل Outline بارز باللون الأحمر #FF0000 بدون ترقيم
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { CncControlsBar } from './components/CncControlsBar';
import { SheetCanvas } from './components/SheetCanvas';
import { PartsManager } from './components/PartsManager';
import { StatisticsPanel } from './components/StatisticsPanel';
import { SheetSettingsModal } from './components/SheetSettingsModal';
import { SvgUploadModal } from './components/SvgUploadModal';

import {
  nestSheets,
  PartInput,
  SheetConfig,
  SortStrategy
} from './utils/nesting';
import {
  generateSheetSvg,
  generateInkscapeSvg,
  generateSheetDxf,
  generateAllSheetsDxf,
  generateCutListCsv,
  downloadFile
} from './utils/exporters';
import { INITIAL_PARTS } from './types';

export default function App() {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const isAr = language === 'ar';

  // إعدادات اللوح الخام وسلاح المنشار (أبعاد مخصصة بالمليمتر في الواجهة)
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    sheetWidth: 2440,
    sheetHeight: 1220,
    sheetMargin: 15, // هامش 15 مم لتنظيف أطراف اللوح
    partGap: 4,      // سماكة سلاح المنشار (Kerf) 4 مم
    pricePerSheet: 180,
    thickness: 18
  });

  // استراتيجية أولوية الترتيب للتسكين في الواجهة (الاستغلال الأقصى للوح الأول)
  const [sortStrategy, setSortStrategy] = useState<SortStrategy>('optimal');

  // خيار التحكم الكلي في تكرار كمية التصميم
  const [globalMultiplier, setGlobalMultiplier] = useState<number>(1);

  // قائمة القطع
  const [parts, setParts] = useState<PartInput[]>(INITIAL_PARTS);

  // اللوح النشط المعروض
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // القطعة المحددة حالياً
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);

  // النوافذ المنبثقة
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSvgModalOpen, setIsSvgModalOpen] = useState(false);

  // تبويب العرض للشاشات الصغيرة (mobile)
  const [mobileTab, setMobileTab] = useState<'canvas' | 'parts' | 'stats'>('canvas');

  // حساب التوزيع بخوارزمية MaxRects BSSF وقفل عروق الخشب والتكرار الكلي
  const nestingResult = useMemo(() => {
    return nestSheets(parts, sheetConfig, sortStrategy, globalMultiplier);
  }, [parts, sheetConfig, sortStrategy, globalMultiplier]);

  // تصحيح مؤشر اللوح النشط إذا قل عدد الألواح
  useEffect(() => {
    if (activeSheetIndex >= nestingResult.sheets.length && nestingResult.sheets.length > 0) {
      setActiveSheetIndex(nestingResult.sheets.length - 1);
    }
  }, [nestingResult.sheets.length, activeSheetIndex]);

  // تحديث اتجاه اللغة في الوثيقة
  useEffect(() => {
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.documentElement.lang = isAr ? 'ar' : 'en';
  }, [isAr]);

  // إضافة قطعة جديدة
  const handleAddPart = (newPart: PartInput) => {
    setParts((prev) => [newPart, ...prev]);
  };

  // تعديل قطعة
  const handleUpdatePart = (id: string, updated: Partial<PartInput>) => {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  };

  // حذف قطعة
  const handleDeletePart = (id: string) => {
    setParts((prev) => prev.filter((p) => p.id !== id));
    if (selectedPartId === id) setSelectedPartId(null);
  };

  // إعادة ضبط القطع
  const handleResetParts = () => {
    setParts(INITIAL_PARTS);
    setSelectedPartId(null);
  };

  // استيراد قطع من SVG
  const handleImportSvgParts = (importedParts: PartInput[], replaceExisting: boolean) => {
    if (replaceExisting) {
      setParts(importedParts);
    } else {
      setParts((prev) => [...prev, ...importedParts]);
    }
    setActiveSheetIndex(0);
  };

  // تصدير اللوح الحالي كنسخة Inkscape SVG نظيفة متوافقة تماماً مع ماكينات الـ CNC
  const handleExportSvg = () => {
    const currentSheet = nestingResult.sheets[activeSheetIndex] || nestingResult.sheets[0];
    if (!currentSheet) return;
    const svgContent = generateInkscapeSvg(currentSheet);
    downloadFile(
      svgContent,
      `Sheet_${currentSheet.sheetIndex}_Inkscape_Clean_${sheetConfig.sheetWidth}x${sheetConfig.sheetHeight}mm.svg`,
      'image/svg+xml'
    );
  };

  // تصدير اللوح الحالي بصيغة AutoCAD DXF (R12 / ASCII) لماكينات الـ CNC وبرامج CAM
  const handleExportDxf = () => {
    const currentSheet = nestingResult.sheets[activeSheetIndex] || nestingResult.sheets[0];
    if (!currentSheet) return;
    const dxfContent = generateSheetDxf(currentSheet);
    downloadFile(
      dxfContent,
      `Sheet_${currentSheet.sheetIndex}_AutoCAD_CNC_${sheetConfig.sheetWidth}x${sheetConfig.sheetHeight}mm.dxf`,
      'application/dxf;charset=ascii'
    );
  };

  // تصدير كافة الألواح الموزعة في ملف DXF واحد مرتبة جنبًا إلى جنب لماكينات الـ CNC
  const handleExportAllDxf = () => {
    if (!nestingResult.sheets.length) return;
    const dxfContent = generateAllSheetsDxf(nestingResult.sheets, 200);
    downloadFile(
      dxfContent,
      `All_Sheets_${nestingResult.sheets.length}_AutoCAD_CNC_${sheetConfig.sheetWidth}x${sheetConfig.sheetHeight}mm.dxf`,
      'application/dxf;charset=ascii'
    );
  };

  // تصدير جدول التقطيع CSV
  const handleExportCsv = () => {
    const csvContent = generateCutListCsv(nestingResult);
    downloadFile(
      csvContent,
      `Cut_Plan_Report_${sheetConfig.sheetWidth}x${sheetConfig.sheetHeight}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  return (
    <div className={`min-h-screen bg-slate-100 flex flex-col font-sans ${isAr ? 'rtl' : 'ltr'}`}>
      {/* شريط العنوان العلوي والتحكم */}
      <Header
        result={nestingResult}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSvgModal={() => setIsSvgModalOpen(true)}
        onExportSvg={handleExportSvg}
        onExportDxf={handleExportDxf}
        onExportAllDxf={handleExportAllDxf}
        onExportCsv={handleExportCsv}
        onLoadSample={() => setIsSvgModalOpen(true)}
        language={language}
        onToggleLanguage={() => setLanguage((prev) => (prev === 'ar' ? 'en' : 'ar'))}
      />

      {/* المحتوى الرئيسي */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-6 flex flex-col gap-4">
        {/* شريط التحكم المباشر في الواجهة: الأبعاد المخصصة، الهامش، سلاح المنشار، أولوية الترتيب، وتكرار الكمية */}
        <CncControlsBar
          config={sheetConfig}
          onChangeConfig={setSheetConfig}
          sortStrategy={sortStrategy}
          onChangeSortStrategy={setSortStrategy}
          globalMultiplier={globalMultiplier}
          onChangeGlobalMultiplier={setGlobalMultiplier}
          language={language}
        />

        {/* أزرار التبديل للشاشات الصغيرة (Mobile Tabs) */}
        <div className="flex lg:hidden bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
          <button
            onClick={() => setMobileTab('canvas')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mobileTab === 'canvas'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isAr ? 'لوحة الألواح والقص' : 'Sheet Canvas'}
          </button>
          <button
            onClick={() => setMobileTab('parts')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mobileTab === 'parts'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isAr ? `قائمة القطع (${parts.length})` : `Parts (${parts.length})`}
          </button>
          <button
            onClick={() => setMobileTab('stats')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mobileTab === 'stats'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isAr ? 'تقرير الهدر والتكلفة' : 'Yield & Waste'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* الجانب: لوحة إدارة القطع وقفل العروق */}
          <div
            className={`lg:col-span-4 xl:col-span-4 h-[650px] lg:h-[720px] flex-col ${
              mobileTab === 'parts' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <PartsManager
              parts={parts}
              onAddPart={handleAddPart}
              onUpdatePart={handleUpdatePart}
              onDeletePart={handleDeletePart}
              onResetParts={handleResetParts}
              selectedPartId={selectedPartId}
              onSelectPart={setSelectedPartId}
              language={language}
            />
          </div>

          {/* المنتصف: لوحة رسم الألواح والقص الكبرى */}
          <div
            className={`lg:col-span-8 xl:col-span-8 h-[650px] lg:h-[720px] flex-col ${
              mobileTab === 'canvas' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <SheetCanvas
              sheets={nestingResult.sheets}
              activeSheetIndex={activeSheetIndex}
              onChangeActiveSheet={setActiveSheetIndex}
              selectedPartId={selectedPartId}
              onSelectPart={setSelectedPartId}
              language={language}
            />
          </div>
        </div>

        {/* لوحة التقارير، الهدر، وتوفير التكلفة في الأسفل */}
        <div className={mobileTab === 'stats' ? 'block' : 'hidden lg:block'}>
          <StatisticsPanel
            result={nestingResult}
            config={sheetConfig}
            parts={parts}
            language={language}
          />
        </div>
      </main>

      {/* نافذة إعدادات اللوح الإضافية */}
      <SheetSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={sheetConfig}
        onUpdateConfig={setSheetConfig}
        sortStrategy={sortStrategy}
        onChangeSortStrategy={setSortStrategy}
        language={language}
      />

      {/* نافذة رفع وتحليل SVG */}
      <SvgUploadModal
        isOpen={isSvgModalOpen}
        onClose={() => setIsSvgModalOpen(false)}
        onImportParts={handleImportSvgParts}
        language={language}
      />
    </div>
  );
}
