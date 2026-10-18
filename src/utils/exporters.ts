/**
 * @file exporters.ts
 * تصدير مخططات القص وتوزيع الألواح بصيغة Inkscape SVG متجهة نظيفة 100%، وملفات CSV لقائمة القطع
 */

import type { SheetStats, NestingResult } from './nesting.ts';
export { generateSheetDxf, generateAllSheetsDxf } from './dxfExporter.ts';

/**
 * دالة مساعدة لتنظيف وتجهيز الـ snippet لملفات Inkscape وماكينات الـ CNC
 * إزالة أي وسوم <svg> فرعية متداخلة أو وسوم style وdefs قد تسبب مشاكل إزاحة
 */
export function cleanSnippetForInkscape(snippet: string): string {
  if (!snippet) return '';
  let cleaned = snippet.trim();

  // إذا كان مغلفاً بـ <svg>...</svg> قم باستخراج المحتوى الداخلي فقط
  const svgWrapperMatch = cleaned.match(/^<svg[^>]*>([\s\S]*?)<\/svg>$/i);
  if (svgWrapperMatch) {
    cleaned = svgWrapperMatch[1].trim();
  }

  // إزالة أي وسوم style أو defs مضللة من داخل الـ snippet
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<defs[\s\S]*?<\/defs>/gi, '');

  return cleaned;
}

/**
 * توليد ملف Inkscape SVG نظيف 100% متوافق تماماً مع برنامج Inkscape، وماكينات الـ CNC، وقص الخشب والليزر
 * - بدون أي مسارات عشوائية أو مخفية خارج صفحة العمل (Artboard)
 * - بدون وسوم <svg> فرعية متداخلة (Nested SVGs) التي تسبب تشوهاً ومسارات عشوائية في Inkscape
 * - طبقات Inkscape منظمة: إطار اللوح وطبقة مسارات القص باللون الأحمر #FF0000
 * - نظام إحداثيات دقيق بالمليمتر (mm) يطابق أبعاد اللوح بدقة متناهية
 */
export function generateInkscapeSvg(sheet: SheetStats): string {
  const margin = sheet.sheetMargin || 0;
  const sheetW = sheet.sheetWidth;
  const sheetH = sheet.sheetHeight;
  const usableW = Math.max(0, sheetW - margin * 2);
  const usableH = Math.max(0, sheetH - margin * 2);

  const partsSvg = sheet.placedParts.map((part, index) => {
    const isRot = part.rotated;
    const minX = part.originalBBox?.x || 0;
    const minY = part.originalBBox?.y || 0;

    // حساب نسبة المقياس إن وجدت
    const scaleX = part.originalBBox?.width ? part.originalWidth / part.originalBBox.width : 1;
    const scaleY = part.originalBBox?.height ? part.originalHeight / part.originalBBox.height : 1;
    const scaleStr = Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001
      ? ` scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`
      : '';

    // التحويل الهندسي المباشر (Group Transform) بدون وسوم svg متداخلة
    // هذا يضمن أن Inkscape يضع المسارات في مكانها الصحيح بالضبط داخل حدود اللوح
    const transform = isRot
      ? `translate(${part.x + part.width}, ${part.y}) rotate(90)${scaleStr} translate(${-minX}, ${-minY})`
      : `translate(${part.x}, ${part.y})${scaleStr} translate(${-minX}, ${-minY})`;

    // أجزاء NFP المستوردة: نستخدم المسارات الحقيقية (تشمل الثقوب/المسارات الداخلية)
    // مع تحويل عام (إزاحة + تدوير بأي زاوية + مقياس) لإبقاء التصميم الأصلي كاملاً
    if (
      part.contour && part.contour.length >= 3 &&
      part.svgSnippet &&
      part.worldTx !== undefined && part.worldTy !== undefined
    ) {
      const rot = part.rotationDeg || 0;
      const nfpTransform =
        `translate(${part.worldTx.toFixed(3)}, ${part.worldTy.toFixed(3)})` +
        ` rotate(${rot})${scaleStr} translate(${-minX}, ${-minY})`;
      const innerContent = cleanSnippetForInkscape(part.svgSnippet);
      return `    <!-- قطعة #${index + 1}: ${escapeXml(part.name)} -->
    <g id="part_${escapeXml(part.id)}_${index + 1}" inkscape:label="${escapeXml(part.name)}" class="cnc-cut-part" transform="${nfpTransform}">
      ${innerContent}
    </g>`;
    }

    // أجزاء NFP: contour جاهز بإحداثيات اللوح (يشمل أي زاوية دوران)
    if (part.contour && part.contour.length >= 3) {
      const pts = part.contour
        .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
        .join(' ');
      return `    <!-- قطعة #${index + 1}: ${escapeXml(part.name)} -->
    <g id="part_${escapeXml(part.id)}_${index + 1}" inkscape:label="${escapeXml(part.name)}" class="cnc-cut-part">
      <polygon
        points="${pts}"
        fill="none"
        stroke="#FF0000"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>`;
    }

    if (part.svgSnippet) {
      const innerContent = cleanSnippetForInkscape(part.svgSnippet);
      return `    <!-- قطعة #${index + 1}: ${escapeXml(part.name)} -->
    <g id="part_${escapeXml(part.id)}_${index + 1}" inkscape:label="${escapeXml(part.name)}" class="cnc-cut-part" transform="${transform}">
      ${innerContent}
    </g>`;
    }

    // للقطع المستطيلة العادية المنشأة في التطبيق
    return `    <!-- قطعة #${index + 1}: ${escapeXml(part.name)} -->
    <g id="part_${escapeXml(part.id)}_${index + 1}" inkscape:label="${escapeXml(part.name)}" class="cnc-cut-part">
      <rect 
        x="${part.x}" 
        y="${part.y}" 
        width="${part.width}" 
        height="${part.height}" 
        fill="none" 
        stroke="#FF0000" 
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="${sheetW}mm"
   height="${sheetH}mm"
   viewBox="0 0 ${sheetW} ${sheetH}"
   version="1.1"
   id="svg_sheet_${sheet.sheetIndex}"
   inkscape:version="1.3"
   sodipodi:docname="Sheet_${sheet.sheetIndex}_Nesting_${sheetW}x${sheetH}mm.svg">
  <defs id="defs_main" />
  <sodipodi:namedview
     id="base"
     pagecolor="#ffffff"
     bordercolor="#000000"
     borderopacity="0.25"
     inkscape:showpageshadow="2"
     inkscape:pageopacity="1.0"
     inkscape:pagecheckerboard="0"
     inkscape:deskcolor="#d1d1d1"
     inkscape:document-units="mm"
     showgrid="false"
     units="mm"
     viewbox-width="${sheetW}"
     viewbox-height="${sheetH}" />

  <!-- مسارات القص الحقيقية (Cut Paths - #FF0000) بدون أي إطار لوح أو هوامش -->
  <g
     inkscape:groupmode="layer"
     id="layer_cut_paths"
     inkscape:label="مسارات القص (Cut Paths - #FF0000)">
${partsSvg}
  </g>
</svg>`;
}

/**
 * التوافق المباشر: دالة generateSheetSvg تولد نسخة Inkscape SVG نظيفة
 */
export function generateSheetSvg(sheet: SheetStats): string {
  return generateInkscapeSvg(sheet);
}

/**
 * تنزيل الملف برمجياً في المتصفح
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * تصدير قائمة القطع والتسكين بصيغة CSV
 */
export function generateCutListCsv(result: NestingResult): string {
  const headers = ['SheetIndex', 'PartID', 'PartName', 'Width(mm)', 'Height(mm)', 'X(mm)', 'Y(mm)', 'Rotated', 'GrainLock', 'Area(m2)'];
  const rows: string[] = [headers.join(',')];

  result.sheets.forEach(sheet => {
    sheet.placedParts.forEach(p => {
      const areaM2 = ((p.width * p.height) / 1000000).toFixed(4);
      rows.push([
        sheet.sheetIndex,
        `"${escapeQuotes(p.id)}"`,
        `"${escapeQuotes(p.name)}"`,
        p.width,
        p.height,
        p.x,
        p.y,
        p.rotated ? 'YES' : 'NO',
        p.grain,
        areaM2
      ].join(','));
    });
  });

  return '\uFEFF' + rows.join('\r\n'); // Add UTF-8 BOM for Arabic support in Excel
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function escapeQuotes(str: string): string {
  return str.replace(/"/g, '""');
}
