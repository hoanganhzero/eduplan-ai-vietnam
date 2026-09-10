"use client";

import JSZip from "jszip";
import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, Math as DocxMath, MathComponent, MathFraction,
  MathIntegral, MathRadical, MathRun, MathSubScript, MathSubSuperScript, MathSum, MathSuperScript,
  Packer, PageBreak, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { splitRichContent, type QuestionMedia } from "./assessment-rich-content";
import type { AssessmentRecord, ExamQuestion } from "./assessment-studio";

const greek: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", omega: "ω", Omega: "Ω", phi: "φ",
  times: "×", cdot: "·", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", approx: "≈", infinity: "∞", infty: "∞", degree: "°",
  rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", rightleftharpoons: "⇌", mapsto: "↦", perp: "⊥", parallel: "∥", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩",
};

function latexMathComponents(source: string): MathComponent[] {
  let cursor = 0;
  const readGroup = (): MathComponent[] => {
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    if (source[cursor] !== "{") return readAtom();
    cursor += 1; const result = readSequence("}"); if (source[cursor] === "}") cursor += 1; return result;
  };
  const readOptional = (): MathComponent[] | undefined => {
    while (/\s/.test(source[cursor] || "")) cursor += 1; if (source[cursor] !== "[") return undefined;
    cursor += 1; const start = cursor; while (cursor < source.length && source[cursor] !== "]") cursor += 1; const value = source.slice(start, cursor); if (source[cursor] === "]") cursor += 1; return latexMathComponents(value);
  };
  const readCommand = (): MathComponent[] => {
    cursor += 1; const match = source.slice(cursor).match(/^[A-Za-z]+/); const command = match?.[0] || source[cursor] || ""; cursor += match?.[0].length || 1;
    if (command === "frac" || command === "dfrac" || command === "tfrac") return [new MathFraction({ numerator: readGroup(), denominator: readGroup() })];
    if (command === "sqrt") return [new MathRadical({ degree: readOptional(), children: readGroup() })];
    if (command === "sum") return [new MathSum({ children: [new MathRun("")] })];
    if (command === "int" || command === "iint" || command === "iiint") return [new MathIntegral({ children: [new MathRun("")] })];
    if (new Set(["mathrm", "text", "mathbf", "mathit", "operatorname"]).has(command)) return readGroup();
    if (command === "vec" || command === "hat" || command === "bar" || command === "overline") {
      const children = readGroup(); const mark = command === "vec" ? "→" : command === "hat" ? "^" : "―";
      return [new MathSuperScript({ children, superScript: [new MathRun(mark)] })];
    }
    if (command === "xrightarrow" || command === "xleftarrow") {
      const label = readGroup(); return [new MathSuperScript({ children: [new MathRun(command === "xrightarrow" ? "→" : "←")], superScript: label })];
    }
    if (command === "left" || command === "right" || command === "," || command === ";" || command === "!" || command === "quad" || command === "qquad") return command === "quad" || command === "qquad" ? [new MathRun(" ")] : [];
    return [new MathRun(greek[command] || command)];
  };
  const readAtom = (): MathComponent[] => {
    while (/\s/.test(source[cursor] || "")) { cursor += 1; return [new MathRun(" ")]; }
    if (cursor >= source.length) return [];
    if (source[cursor] === "{") return readGroup();
    if (source[cursor] === "\\") return readCommand();
    const character = source[cursor]; cursor += 1; return [new MathRun(character)];
  };
  const applyScripts = (base: MathComponent[]): MathComponent[] => {
    let sub: MathComponent[] | undefined; let sup: MathComponent[] | undefined;
    while (source[cursor] === "_" || source[cursor] === "^") { const type = source[cursor]; cursor += 1; const value = readGroup(); if (type === "_") sub = value; else sup = value; }
    if (sub && sup) return [new MathSubSuperScript({ children: base, subScript: sub, superScript: sup })];
    if (sub) return [new MathSubScript({ children: base, subScript: sub })];
    if (sup) return [new MathSuperScript({ children: base, superScript: sup })];
    return base;
  };
  const readSequence = (stop?: string): MathComponent[] => {
    const result: MathComponent[] = [];
    while (cursor < source.length && (!stop || source[cursor] !== stop)) result.push(...applyScripts(readAtom()));
    return result;
  };
  return readSequence();
}

function richChildren(value: string) {
  return splitRichContent(value || "").flatMap((part) => part.type === "math"
    ? [new DocxMath({ children: latexMathComponents(part.value) })]
    : part.value.split("\n").flatMap((line, index) => [new TextRun({ text: line, break: index ? 1 : undefined })]));
}

async function normalizedImage(media: QuestionMedia) {
  const response = await fetch(media.url); if (!response.ok) throw new Error(`Không tải được hình ${media.name}`);
  const blob = await response.blob(); const basic = /image\/(png|jpeg|jpg|gif|bmp)/i.test(blob.type);
  if (basic) return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type.includes("jpeg") || blob.type.includes("jpg") ? "jpg" as const : blob.type.includes("gif") ? "gif" as const : blob.type.includes("bmp") ? "bmp" as const : "png" as const };
  const bitmap = await createImageBitmap(blob); const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext("2d"); if (!context) throw new Error(`Không chuyển đổi được hình ${media.name}`); context.drawImage(bitmap, 0, 0); bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", .95)); if (!png) throw new Error(`Không chuyển đổi được hình ${media.name}`); return { bytes: new Uint8Array(await png.arrayBuffer()), type: "png" as const };
}

async function mediaParagraphs(media: QuestionMedia[], cache: Map<string, Awaited<ReturnType<typeof normalizedImage>>>) {
  const paragraphs: Paragraph[] = [];
  for (const item of media) {
    let image = cache.get(item.url); if (!image) { image = await normalizedImage(item); cache.set(item.url, image); }
    const ratio = item.width && item.height ? item.width / item.height : 16 / 9; const width = 520; const height = Math.max(150, Math.min(520, Math.round(width / ratio)));
    paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 60 }, children: [new ImageRun({ type: image.type, data: image.bytes, transformation: { width, height }, altText: { title: item.caption || item.name, description: item.alt || item.caption || item.name, name: item.name } })] }));
    if (item.caption || item.name) paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: item.caption || item.name, italics: true, size: 22 })] }));
  }
  return paragraphs;
}

const cellBorders = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
function headerTables(record: AssessmentRecord, code: number) {
  const header = record.header || { authority: "SỞ GD&ĐT TÂY NINH", school: "TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH", examName: record.kind.toUpperCase(), schoolYear: "2025 - 2026", duration: record.time, pageCount: 2 };
  return [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: cellBorders, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: header.authority, bold: true }), new TextRun({ text: `\n${header.school}`, bold: true, color: "C00000" }), new TextRun({ text: `\n--------------------\n(Đề thi có ${String(header.pageCount).padStart(2, "0")} trang)`, italics: true })] })] }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${header.examName}\nNĂM HỌC ${header.schoolYear}\nMÔN: ${record.subject.toUpperCase()}`, bold: true }), new TextRun({ text: `\nThời gian làm bài: ${header.duration} PHÚT\n(không kể thời gian phát đề)`, italics: true })] })] }),
    ] })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 58, type: WidthType.PERCENTAGE }, children: [new Paragraph("Họ và tên: ............................................................")] }),
      new TableCell({ width: { size: 22, type: WidthType.PERCENTAGE }, children: [new Paragraph("Số báo danh: ........")] }),
      new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Mã đề ${code}`, bold: true })] })] }),
    ] })] }),
  ];
}

const partTitles: Record<ExamQuestion["type"], string> = { choice: "PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN", true_false: "PHẦN II. TRẮC NGHIỆM ĐÚNG/SAI", short: "PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN", essay: "PHẦN IV. TỰ LUẬN" };

async function variantBlob(record: AssessmentRecord, code: number, cache: Map<string, Awaited<ReturnType<typeof normalizedImage>>>) {
  const groups: ExamQuestion["type"][] = ["choice", "true_false", "short", "essay"]; const children: Array<Paragraph | Table> = [...headerTables(record, code)]; const keyRows: Array<{ label: string; value: string }> = []; let number = 0;
  for (const type of groups) {
    let group = (record.questions || []).filter((question) => question.type === type); if (!group.length) continue; if (record.shuffleQuestions !== false) group = seededShuffle(group, code * 31 + groups.indexOf(type));
    children.push(new Paragraph({ spacing: { before: 200, after: 90 }, children: [new TextRun({ text: partTitles[type], bold: true, size: 28 })] }));
    for (const question of group) {
      number += 1; children.push(new Paragraph({ spacing: { before: 100, after: 70 }, children: [new TextRun({ text: `Câu ${number}. `, bold: true }), ...richChildren(question.question), new TextRun({ text: ` (${question.points} điểm)`, italics: true })] }));
      children.push(...await mediaParagraphs(question.media || [], cache));
      if (type === "choice") {
        const order = record.shuffleAnswers !== false ? seededShuffle((question.options || []).map((_, index) => index), code * 97 + number) : (question.options || []).map((_, index) => index);
        order.forEach((optionIndex, position) => children.push(new Paragraph({ indent: { left: 280 }, spacing: { after: 40 }, children: [new TextRun({ text: `${String.fromCharCode(65 + position)}. `, bold: true }), ...richChildren(question.options?.[optionIndex] || "")] })));
        keyRows.push({ label: `Câu ${number}`, value: String.fromCharCode(65 + Math.max(0, order.indexOf(Number(question.answer)))) });
      } else if (type === "true_false") {
        (question.statements || []).forEach((statement, index) => children.push(new Paragraph({ indent: { left: 280 }, children: [new TextRun({ text: `${String.fromCharCode(97 + index)}) `, bold: true }), ...richChildren(statement.text), new TextRun("   Đúng / Sai")] })));
        keyRows.push({ label: `Câu ${number}`, value: (question.statements || []).map((statement, index) => `${String.fromCharCode(97 + index)}-${statement.answer ? "Đ" : "S"}`).join(", ") });
      } else if (type === "short") { children.push(new Paragraph({ indent: { left: 280 }, children: [new TextRun("Trả lời: ........................................................")]})); keyRows.push({ label: `Câu ${number}`, value: String(question.answer ?? "") }); }
      else { children.push(new Paragraph({ indent: { left: 280 }, children: [new TextRun({ text: "Học sinh trình bày bài làm vào giấy kiểm tra.", italics: true })] })); keyRows.push({ label: `Câu ${number}`, value: question.guide || String(question.answer || "Chấm theo hướng dẫn") }); }
    }
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 180 }, children: [new TextRun({ text: "------ HẾT ------", bold: true, italics: true })] }));
  if (record.includeAnswerKey !== false) {
    children.push(new Paragraph({ children: [new PageBreak()] })); children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM · MÃ ĐỀ ${code}`, bold: true, size: 30 })] }));
    keyRows.forEach((row) => children.push(new Paragraph({ spacing: { after: 70 }, children: [new TextRun({ text: `${row.label}: `, bold: true, color: "C00000" }), ...richChildren(row.value)] })));
  }
  const doc = new Document({ styles: { default: { document: { run: { font: "Times New Roman", size: 26 }, paragraph: { spacing: { line: 312 } } } } }, sections: [{ properties: { page: { margin: { top: 700, right: 700, bottom: 850, left: 850 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`Mã đề ${code} · Trang `, PageNumber.CURRENT, "/", PageNumber.TOTAL_PAGES] })] })] }) }, children }] });
  return Packer.toBlob(doc);
}

function seededShuffle<T>(items: T[], seed: number) { const result = [...items]; let state = seed >>> 0 || 1; for (let index = result.length - 1; index > 0; index -= 1) { state = (state * 1664525 + 1013904223) >>> 0; const swap = state % (index + 1); [result[index], result[swap]] = [result[swap], result[index]]; } return result; }
function fileName(record: AssessmentRecord, code: number) { return `${record.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 50) || "de"}-Ma-${code}.docx`; }
function downloadBlob(blob: Blob, name: string) { const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }

export async function downloadAssessmentVariants(record: AssessmentRecord, progress?: (message: string) => void) {
  if (!record.questions?.length) throw new Error("Đề này chưa có ngân hàng câu hỏi để sinh mã đề");
  const count = Math.min(50, Math.max(1, record.variantCount || 1)); const first = record.firstCode || 101; const cache = new Map<string, Awaited<ReturnType<typeof normalizedImage>>>();
  if (count === 1) { progress?.("Đang tạo tệp Word có công thức và hình ảnh..."); downloadBlob(await variantBlob(record, first, cache), fileName(record, first)); return; }
  const zip = new JSZip();
  for (let index = 0; index < count; index += 1) { const code = first + index; progress?.(`Đang tạo mã đề ${code} (${index + 1}/${count})...`); zip.file(fileName(record, code), await variantBlob(record, code, cache)); }
  progress?.("Đang đóng gói các mã đề..."); downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `${record.title.replace(/[^\p{L}\p{N}]+/gu, "-") || "de"}-${first}-${first + count - 1}.zip`);
}
