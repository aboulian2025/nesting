/**
 * @file App.tsx
 * التطبيق الرئيسي لمحرك توزيع الألواح وتوفير الخامة (Sheet Nesting Engine)
 * - استيراد مسارات SVG الحقيقية
 * - خلفية اللوح بيضاء صافية مع إطار يوضح مقاس اللوح فقط
 * - أبعاد اللوح المخصصة الافتراضية: 2400 × 1200 مم
 * - استجابة فورية عند اختيار أي خيار من القائمة المنسدلة لأولوية ترتيب القطع
 * - تحكم فردي وجماعي في القطع المتكررة مع نافذة إجراءات مخصصة
 * - قفل عروق الخشب: أفقي=عرض \ رأسي=طول \ حر=تدوير حر للقطعة حسب المساحة
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { CncControlsBar } from './components/CncControlsBar';
import { SheetCanvas } from './components/SheetCanvas';
import { PartsManager } from './components/PartsManager';
import { StatisticsPanel } from './components/StatisticsPanel';
import { SheetSettingsModal } from './components/SheetSettingsModal';
import { SvgUploadModal } from './components/SvgUploadModal';
import { PieceActionModal } from './components/PieceActionModal';

import {
  nestSheets,
  PartInput,
  SheetConfig,
  SortStrategy,
  PlacedPart,
  IndividualPartOverride,
  GrainDirectionType
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
import { useUndoRedo, DocState } from './hooks/useUndoRedo';
import { useNfpNesting } from './hooks/useNfpNesting';

export default function App() {
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const isAr = language === 'ar';

  // 1. إعدادات اللوح الخام وسلاح المنشار: الأبعاد المخصصة 2400 × 1200 مم افتراضياً
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    sheetWidth: 2400, // 2400 مم عرض
    sheetHeight: 1200, // 1200 مم ارتفاع
    sheetMargin: 15,   // هامش 15 مم لتنظيف أطراف اللوح
    partGap: 4,        // سماكة سلاح المنشار (Kerf) 4 مم
    pricePerSheet: 180,
    thickness: 18
  });

  // 2. استراتيجية أولوية الترتيب للتسكين في الواجهة
  const [sortStrategy, setSortStrategy] = useState<SortStrategy>('optimal');

  // خيار التحكم الكلي في تكرار كمية التصميم
  const [globalMultiplier, setGlobalMultiplier] = useState<number>(1);

  // قائمة القطع
  const [parts, setParts] = useState<PartInput[]>(INITIAL_PARTS);

  // تخصيصات القطع الفردية (التحكم الفردي للنسخ المسكنة)
  const [partOverrides, setPartOverrides] = useState<Record<string, IndividualPartOverride>>({});

  // اللوح النشط المعروض
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // القطعة والنسخة المحددة حالياً
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedPlacedPart, setSelectedPlacedPart] = useState<PlacedPart | null>(null);

  // وضع التحكم الحالي: تحكم فردي للقطعة المحددة، أو تحكم جماعي لكافة النسخ المتكررة
  const [controlMode, setControlMode] = useState<'individual' | 'group'>('individual');
  // محرك التوزيع: MaxRects (افتراضي) أو NFP للأشكال الحرة
  const [engineMode, setEngineMode] = useState<'rect' | 'nfp'>('rect');
  // NFP: ميزانية الوقت وزوايا الدوران الدقيقة
  const [nfpBudgetMs, setNfpBudgetMs] = useState<number>(60000);
  const [freeRotationCount, setFreeRotationCount] = useState<number>(32);
  // النوافذ المنبثقة
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSvgModalOpen, setIsSvgModalOpen] = useState(false);
  const [isPieceModalOpen, setIsPieceModalOpen] = useState(false);

  // تبويب العرض للشاشات الصغيرة (mobile)
  const [mobileTab, setMobileTab] = useState<'canvas' | 'parts' | 'stats'>('canvas');

  // محرك المستطيلات MaxRects BSSF / BAF (سريع — افتراضي)
  const rectNestingResult = useMemo(() => {
    return nestSheets(parts, sheetConfig, sortStrategy, globalMultiplier, partOverrides);
  }, [parts, sheetConfig, sortStrategy, globalMultiplier, partOverrides]);

  // Editing inputs invalidates the last run. Only the explicit Start action
  // captures the new configuration and starts a worker.
  const nfpInputKey = JSON.stringify([engineMode,parts,sheetConfig,globalMultiplier,partOverrides,nfpBudgetMs,freeRotationCount]);
  const [nfpRun,setNfpRun] = useState<{key:string;id:number}|null>(null);
  const nfpRunSerial = useRef(0);
  useEffect(() => { setNfpRun(null); }, [nfpInputKey]);
  const nfpStarted = nfpRun?.key === nfpInputKey;
  const startNfp = () => setNfpRun({key:nfpInputKey,id:++nfpRunSerial.current});
  const nfpNesting = useNfpNesting({
    enabled: engineMode === 'nfp' && nfpStarted,
    runId: nfpRun?.id,
    parts,
    sheetConfig,
    globalMultiplier,
    partOverrides,
    budgetMs: nfpBudgetMs,
    freeRotationCount
  });

  // النتيجة المعروضة: NFP إن كان مفعلاً وانتهى، وإلا المستطيلات
  const nestingResult =
    engineMode === 'nfp' ? (nfpNesting.result ?? rectNestingResult) : rectNestingResult;
  const canExport = engineMode !== 'nfp' ||
    (!nfpNesting.running && !nfpNesting.error && nfpNesting.result !== null &&
      nfpNesting.result.unplacedParts.length === 0);

  // 3. خط التراجع/الإعادة (Undo/Redo) يغطي: القطع، التخصيصات الفردية، إعدادات اللوح، الترتيب، والمكرر
  const docState = useMemo<DocState>(
    () => ({ parts, partOverrides, sheetConfig, sortStrategy, globalMultiplier }),
    [parts, partOverrides, sheetConfig, sortStrategy, globalMultiplier]
  );
  const { undo: undoRaw, redo: redoRaw, canUndo, canRedo } = useUndoRedo(docState);

  // تطبيق لقطة تاريخية على كل الحالات دفعة واحدة (ومسح التحديد لتفادي إشارات قديمة)
  const applyDocState = (state: DocState) => {
    setParts(state.parts);
    setPartOverrides(state.partOverrides);
    setSheetConfig(state.sheetConfig);
    setSortStrategy(state.sortStrategy);
    setGlobalMultiplier(state.globalMultiplier);
    setSelectedPartId(null);
    setSelectedPlacedPart(null);
  };

  const handleUndo = () => {
    const state = undoRaw();
    if (state) applyDocState(state);
  };

  const handleRedo = () => {
    const state = redoRaw();
    if (state) applyDocState(state);
  };

  // اختصارات لوحة المفاتيح: Ctrl+Z تراجع، Ctrl+Shift+Z أو Ctrl+Y إعادة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return; // لا نعترض الكتابة داخل الحقول
      }
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoRaw, redoRaw]);

  // تصحيح مؤشر اللوح النشط إذا قل عدد الألواح
  useEffect(() => {
    if (activeSheetIndex >= nestingResult.sheets.length && nestingResult.sheets.length > 0) {
      setActiveSheetIndex(nestingResult.sheets.length - 1);
    }
  }, [nestingResult.sheets.length, activeSheetIndex]);

  // مزامنة القطعة المسكنة المحددة عند إعادة الحساب والتسكين
  useEffect(() => {
    if (selectedPlacedPart) {
      for (const sheet of nestingResult.sheets) {
        const found = sheet.placedParts.find((p) => p.uniqueId === selectedPlacedPart.uniqueId);
        if (found) {
          setSelectedPlacedPart(found);
          return;
        }
      }
    }
  }, [nestingResult, selectedPlacedPart]);

  // تحديث اتجاه اللغة في الوثيقة
  useEffect(() => {
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.documentElement.lang = isAr ? 'ar' : 'en';
  }, [isAr]);

  // استجابة فورية وسريعة عند تغيير أولوية الترتيب من القائمة المنسدلة
  const handleSortStrategyChange = (newStrategy: SortStrategy) => {
    setSortStrategy(newStrategy);
    setActiveSheetIndex(0); // إعادة العرض فوراً للوح الأول لمعاينة الترتيب الجديد
  };

  // إضافة قطعة جديدة
  const handleAddPart = (newPart: PartInput) => {
    setParts((prev) => [newPart, ...prev]);
  };

  // تعديل قطعة
  const handleUpdatePart = (id: string, updated: Partial<PartInput>) => {
    setParts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...updated };
        // تغيير قفل العروق يلغي التدوير المفروض على الصنف حتى يستجيب الزر فوراً
        if (updated.grain) {
          delete next.overrideRotated;
        }
        return next;
      })
    );
    // وتغيير قفل العروق يلغي أيضاً أوامر التدوير اليدوية للنسخ الفردية
    if (updated.grain) {
      clearIndividualOverrides(id, ['rotated']);
    }
  };

  // مسح تخصيصات فردية محددة لصنف كامل (النسخ المتكررة)
  const clearIndividualOverrides = (partId: string, keys: Array<'rotated' | 'grain' | 'customWidth' | 'customHeight'>) => {
    setPartOverrides((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${partId}_`)) {
          for (const k of keys) {
            delete next[key][k];
          }
        }
      }
      return next;
    });
  };

  // حذف قطعة
  const handleDeletePart = (id: string) => {
    setParts((prev) => prev.filter((p) => p.id !== id));
    if (selectedPartId === id) {
      setSelectedPartId(null);
      setSelectedPlacedPart(null);
    }
  };

  // إعادة ضبط القطع
  const handleResetParts = () => {
    setParts(INITIAL_PARTS);
    setPartOverrides({});
    setSelectedPartId(null);
    setSelectedPlacedPart(null);
  };

  // استيراد قطع من SVG
  const handleImportSvgParts = (importedParts: PartInput[], replaceExisting: boolean) => {
    if (replaceExisting) {
      setParts(importedParts);
      setPartOverrides({});
    } else {
      setParts((prev) => [...prev, ...importedParts]);
    }
    setActiveSheetIndex(0);
  };

  // معالجة اختيار قطعة على اللوح
  const handleSelectPlacedPart = (part: PlacedPart | null, mode: 'individual' | 'group' = 'individual') => {
    setSelectedPlacedPart(part);
    setSelectedPartId(part ? part.id : null);
    if (mode) setControlMode(mode);
  };

  // فتح نافذة التحكم والتعديل التفصيلية
  const handleOpenPieceModal = (part: PlacedPart, mode: 'individual' | 'group' = 'individual') => {
    setSelectedPlacedPart(part);
    setSelectedPartId(part.id);
    setControlMode(mode);
    setIsPieceModalOpen(true);
  };

  // تكرار النسخة المحددة فقط كقطعة مستقلة جديدة (دون التأثير على الصنف الأصلي أو باقي النسخ)
  // النسخة الجديدة ترث الأبعاد الفعالة، قفل العروق، اتجاه التدوير، اللون، ومسار SVG الأصلي
  const handleDuplicateInstance = (uniqueId: string) => {
    // البحث عن النسخة المسكنة على الألواح
    let placed: PlacedPart | null = null;
    for (const sheet of nestingResult.sheets) {
      const found = sheet.placedParts.find((p) => p.uniqueId === uniqueId);
      if (found) {
        placed = found;
        break;
      }
    }
    if (!placed) return;

    const base = parts.find((p) => p.id === placed!.id);
    if (!base) return;

    const clone: PartInput = {
      id: `${base.id}_copy_${Date.now()}`,
      name: isAr ? `${base.name} (نسخ)` : `${base.name} (Copy)`,
      width: placed.originalWidth,
      height: placed.originalHeight,
      count: 1,
      grain: placed.grain,
      color: base.color,
      material: base.material,
      pathData: placed.pathData,
      svgSnippet: placed.svgSnippet,
      viewBox: placed.viewBox,
      originalBBox: placed.originalBBox,
      // تثبيت اتجاه التدوير الحالي للنسخة المستقلة الجديدة
      overrideRotated: placed.rotated
    };

    setParts((prev) => [clone, ...prev]);
  };

  // تدوير القطعة فردياً (تحكم فردي)
  const handleRotateIndividual = (uniqueId: string) => {
    setPartOverrides((prev) => {
      let baseRotated = false;
      for (const sheet of nestingResult.sheets) {
        const found = sheet.placedParts.find((x) => x.uniqueId === uniqueId);
        if (found) {
          baseRotated = found.rotated;
          break;
        }
      }
      const currentOverride = prev[uniqueId]?.rotated;
      const nextRotated = currentOverride !== undefined ? !currentOverride : !baseRotated;

      return {
        ...prev,
        [uniqueId]: {
          ...prev[uniqueId],
          rotated: nextRotated
        }
      };
    });
  };

  // تدوير القطع جماعياً لكافة النسخ المتكررة (تحكم جماعي)
  // التدوير يتم عبر علامة overrideRotated على مستوى الصنف دون المساس بأبعاد القطعة الأصلية
  // حتى تبقى أبعاد القطعة (400×200 مثلاً) ثابتة تماماً وتُدار فقط اتجاه التسكين
  const handleRotateGroup = (partId: string) => {
    // معرفة الحالة الحالية لأول نسخة مسكنة من هذا الصنف
    let placedRotated = false;
    for (const sheet of nestingResult.sheets) {
      const found = sheet.placedParts.find((x) => x.id === partId);
      if (found) {
        placedRotated = found.rotated;
        break;
      }
    }

    setParts((prev) =>
      prev.map((p) => {
        if (p.id !== partId) return p;
        // عكس اتجاه التدوير المفروض على الصنف (يتجاوز قفل العروق كأمر صريح من المستخدم)
        const currentRotated = p.overrideRotated ?? placedRotated;
        return {
          ...p,
          overrideRotated: !currentRotated
        };
      })
    );
    // مسح التدويرات الفردية لهذا الصنف لتوحيدها مع الصنف العام
    clearIndividualOverrides(partId, ['rotated']);
  };

  // تعديل قفل العروق فردياً للنسخة المحددة (تحكم فردي)
  // قفل العروق (أفقي=عرض / رأسي=طول / حر=تدوير حر حسب المساحة) يلغي أمر التدوير اليدوي لنفس النسخة
  // حتى تستجيب أزرار قفل العروق فوراً دون تعارض مع overrideRotated القديم
  const handleChangeGrainIndividual = (uniqueId: string, grain: GrainDirectionType) => {
    setPartOverrides((prev) => {
      const nextOverride: IndividualPartOverride = {
        ...prev[uniqueId],
        grain
      };
      delete nextOverride.rotated;
      return {
        ...prev,
        [uniqueId]: nextOverride
      };
    });
  };

  // تعديل قفل العروق جماعياً لكافة النسخ المتكررة من نفس الصنف (تحكم جماعي)
  const handleChangeGrainGroup = (partId: string, grain: GrainDirectionType) => {
    setParts((prev) =>
      prev.map((p) => {
        if (p.id !== partId) return p;
        const next = { ...p, grain };
        // قفل العروق الجديد يلغي التدوير المفروض على الصنف (overrideRotated)
        delete next.overrideRotated;
        return next;
      })
    );
    // مسح تخصيصات العروق والتدوير الفردية لهذا الصنف لتوحيد الحالة مع الصنف العام
    clearIndividualOverrides(partId, ['grain', 'rotated']);
  };

  // تعديل أبعاد النسخة الفردية (تحكم فردي)
  const handleUpdateDimensionsIndividual = (uniqueId: string, width: number, height: number) => {
    setPartOverrides((prev) => ({
      ...prev,
      [uniqueId]: {
        ...prev[uniqueId],
        customWidth: width,
        customHeight: height
      }
    }));
  };

  // تعديل أبعاد الصنف كاملاً (تحكم جماعي لكافة النسخ المتكررة)
  const handleUpdateDimensionsGroup = (partId: string, width: number, height: number) => {
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, width, height } : p))
    );
    // مسح الأبعاد الفردية المخصصة لهذا الصنف حتى تسري الأبعاد الجديدة على كل النسخ المتكررة
    clearIndividualOverrides(partId, ['customWidth', 'customHeight']);
  };

  // تعديل كمية الصنف (تحكم جماعي)
  const handleUpdateCountGroup = (partId: string, count: number) => {
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, count: Math.max(1, count) } : p))
    );
  };

  // حذف نسخة فردية فقط (تحكم فردي)
  const handleDeleteIndividual = (uniqueId: string) => {
    setPartOverrides((prev) => ({
      ...prev,
      [uniqueId]: {
        ...prev[uniqueId],
        hidden: true
      }
    }));
    if (selectedPlacedPart?.uniqueId === uniqueId) {
      setSelectedPlacedPart(null);
    }
  };

  // حذف الصنف بالكامل (تحكم جماعي)
  const handleDeleteGroup = (partId: string) => {
    handleDeletePart(partId);
  };

  // فتح تحكم جماعي من قائمة القطع الجانبية
  const handleOpenGroupControlFromManager = (part: PartInput) => {
    const placed = nestingResult.sheets
      .flatMap((s) => s.placedParts)
      .find((p) => p.id === part.id);
    setSelectedPartId(part.id);
    if (placed) setSelectedPlacedPart(placed);
    setControlMode('group');
    setIsPieceModalOpen(true);
  };

  // فتح تحكم فردي لنسخة معينة من قائمة القطع الجانبية
  const handleOpenIndividualControlFromManager = (part: PartInput, instanceIndex: number) => {
    const uniqueId = `${part.id}_${instanceIndex}`;
    let placed = nestingResult.sheets
      .flatMap((s) => s.placedParts)
      .find((p) => p.uniqueId === uniqueId);

    if (!placed) {
      placed = {
        id: part.id,
        uniqueId,
        name: part.name,
        x: 0,
        y: 0,
        width: part.width,
        height: part.height,
        originalWidth: part.width,
        originalHeight: part.height,
        rotated: false,
        grain: part.grain,
        color: part.color,
        pathData: part.pathData,
        svgSnippet: part.svgSnippet,
        viewBox: part.viewBox
      };
    }

    setSelectedPartId(part.id);
    setSelectedPlacedPart(placed);
    setControlMode('individual');
    setIsPieceModalOpen(true);
  };

  // تصدير اللوح الحالي كنسخة Inkscape SVG نظيفة متوافقة تماماً مع ماكينات الـ CNC
  const handleExportSvg = () => {
    if (!canExport) return;
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
    if (!canExport) return;
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
    if (!canExport) return;
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
    if (!canExport) return;
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
        engineLabel={engineMode === 'nfp' ? 'NFP' : 'MaxRects BSSF'}
        exportDisabled={!canExport}
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
        {/* شريط التحكم المباشر في الواجهة: الأبعاد المخصصة 2400x1200، الهامش، سلاح المنشار، أولوية الترتيب، وتكرار الكمية */}
        <CncControlsBar
          config={sheetConfig}
          onChangeConfig={setSheetConfig}
          sortStrategy={sortStrategy}
          onChangeSortStrategy={handleSortStrategyChange}
          globalMultiplier={globalMultiplier}
          onChangeGlobalMultiplier={setGlobalMultiplier}
          language={language}
          engineMode={engineMode}
          onChangeEngineMode={setEngineMode}
          nfpBudgetMs={nfpBudgetMs}
          onChangeNfpBudgetMs={setNfpBudgetMs}
          freeRotationCount={freeRotationCount}
          onChangeFreeRotationCount={setFreeRotationCount}
          onStartNfp={startNfp}
          nfpCanStart={rectNestingResult.summary.totalPartsProvided>0}
          nfpWaiting={!nfpStarted}
          nfpRunning={nfpNesting.running}
          nfpProgress={
            nfpNesting.progress
              ? { placed: nfpNesting.progress.placed, total: nfpNesting.progress.total, elapsedMs: nfpNesting.progress.elapsedMs }
              : null
          }
          nfpError={nfpNesting.error}
        />

        {/* أزرار التبديل للشاشات الصغيرة (Mobile Tabs) */}
        {engineMode === 'nfp' && (nfpNesting.result?.optimization?.improvementPercent ?? 0) > 0.1 && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            {isAr ? 'تحسّن تجميع القطع بنسبة ' : 'Layout compaction improved by '}
            <strong>{nfpNesting.result!.optimization!.improvementPercent!.toFixed(1)}%</strong>
            {' — '}{isAr ? 'مساحة المستطيل المحيط بالقطع: من ' : 'Area enclosing the parts: from '}
            {((nfpNesting.result!.optimization!.baselineAreaMm2 ?? 0)/1e6).toFixed(3)} {isAr ? 'م² إلى ' : 'm² to '}
            {((nfpNesting.result!.optimization!.occupiedAreaMm2 ?? 0)/1e6).toFixed(3)} {isAr ? 'م²' : 'm²'}
          </div>
        )}
        {engineMode === 'nfp' && nfpNesting.result?.optimization?.method === 'baseline' &&
          nfpNesting.result.unplacedParts.length === 0 && (
          <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            {isAr
              ? (nfpNesting.result.optimization.timedOut
                ? 'اكتمل توزيع جميع القطع. انتهى وقت تحسين الأشكال؛ احتُفظ بالتوزيع المكتمل. يمكنك زيادة مدة الحساب لتحسين التداخل.'
                : 'اكتمل توزيع جميع القطع. احتُفظ بالخطة الأولية لأن محاولات تحسين الأشكال لم تعطِ توزيعًا أفضل.')
              : (nfpNesting.result.optimization.timedOut
                ? 'All parts are placed. Shape optimisation timed out; the complete layout was retained. Increase the time budget to improve interlocking.'
                : 'All parts are placed. The initial layout was retained because shape optimisation did not improve it.')}
          </div>
        )}
        {engineMode === 'nfp' && nfpNesting.result && nfpNesting.result.unplacedParts.length > 0 && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>{isAr
              ? `${nfpNesting.result.unplacedParts.length} قطع غير موزعة — التصدير متوقف حتى اكتمال التوزيع.`
              : `${nfpNesting.result.unplacedParts.length} unplaced parts — export requires a complete layout.`}</strong>
            <p>{isAr
              ? 'راجع مقاس اللوح واتجاه القطع ومدة الحساب. القطع المتبقية:'
              : 'Check sheet size, allowed rotations and calculation time. Remaining parts:'}</p>
            <p>{nfpNesting.result.unplacedParts.map(p => p.name || p.id).join('، ')}</p>
          </div>
        )}
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
          {/* الجانب: لوحة إدارة القطع وقفل العروق مع أزرار التحكم الفردي والجماعي */}
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
              onOpenGroupControl={handleOpenGroupControlFromManager}
              onOpenIndividualControl={handleOpenIndividualControlFromManager}
              language={language}
            />
          </div>

          {/* المنتصف: لوحة رسم الألواح والقص الكبرى مع شريط الإجراءات السريع للتحكم الفردي والجماعي */}
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
              selectedPlacedPart={selectedPlacedPart}
              onSelectPlacedPart={handleSelectPlacedPart}
              onOpenPieceModal={handleOpenPieceModal}
              controlMode={controlMode}
              onChangeControlMode={setControlMode}
              onRotateIndividual={handleRotateIndividual}
              onRotateGroup={handleRotateGroup}
              onChangeGrainIndividual={handleChangeGrainIndividual}
              onChangeGrainGroup={handleChangeGrainGroup}
              onDuplicateInstance={handleDuplicateInstance}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
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
        onChangeSortStrategy={handleSortStrategyChange}
        language={language}
      />

      {/* نافذة رفع وتحليل SVG */}
      <SvgUploadModal
        isOpen={isSvgModalOpen}
        onClose={() => setIsSvgModalOpen(false)}
        onImportParts={handleImportSvgParts}
        language={language}
      />

      {/* نافذة تفاعلية منبثقة للتحكم في القطعة بشكل منفرد (تحكم فردي) أو جماعي لكافة النسخ المتكررة */}
      <PieceActionModal
        isOpen={isPieceModalOpen}
        onClose={() => setIsPieceModalOpen(false)}
        placedPart={selectedPlacedPart}
        originalPart={parts.find((p) => p.id === selectedPartId) || null}
        controlMode={controlMode}
        onChangeControlMode={setControlMode}
        onRotateIndividual={handleRotateIndividual}
        onRotateGroup={handleRotateGroup}
        onChangeGrainIndividual={handleChangeGrainIndividual}
        onChangeGrainGroup={handleChangeGrainGroup}
        onUpdateDimensionsIndividual={handleUpdateDimensionsIndividual}
        onUpdateDimensionsGroup={handleUpdateDimensionsGroup}
        onUpdateCountGroup={handleUpdateCountGroup}
        onDeleteIndividual={handleDeleteIndividual}
        onDeleteGroup={handleDeleteGroup}
        onDuplicateInstance={handleDuplicateInstance}
        language={language}
      />
    </div>
  );
}
