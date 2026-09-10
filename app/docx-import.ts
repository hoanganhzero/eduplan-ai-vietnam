"use client";

import JSZip from "jszip";
import type { ExamQuestion } from "./assessment-studio";
import type { QuestionMedia } from "./assessment-rich-content";

const MARK_OPEN = "⁅";
const MARK_CLOSE = "⁆";
const MEDIA_PATTERN = /⟦MEDIA:([^⟧]+)⟧/g;

export type ExtractedDocxMedia = {
  marker: string;
  file: File;
  name: string;
  kind: QuestionMedia["kind"];
  width?: number;
  height?: number;
};
export type ExtractedDocx = { lines: string[]; media: ExtractedDocxMedia[]; equationCount: number };

const direct = (element: Element | null, name: string) => element ? Array.from(element.children).find((child) => child.localName === name) || null : null;
const descendants = (element: Element | Document, name: string) => Array.from(element.getElementsByTagNameNS("*", name));
const elementText = (element: Element | null) => {
  if (!element) return "";
  const text = descendants(element, "t");
  return (text.length ? text : descendants(element, "v")).map((item) => item.textContent || "").join("");
};

function xmlDocument(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Tệp Word có nội dung XML không hợp lệ");
  return doc;
}

function relationshipId(element: Element) {
  return element.getAttribute("r:embed") || element.getAttribute("r:id") || element.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || element.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "";
}

function relationshipMap(xml: string) {
  const result = new Map<string, string>();
  for (const relation of descendants(xmlDocument(xml), "Relationship")) {
    const id = relation.getAttribute("Id") || ""; const target = relation.getAttribute("Target") || "";
    if (id && target) result.set(id, target);
  }
  return result;
}

function resolveWordTarget(target: string) {
  const pieces = `word/${target.replace(/\\/g, "/").replace(/^\//, "")}`.split("/");
  const safe: string[] = [];
  for (const piece of pieces) { if (!piece || piece === ".") continue; if (piece === "..") safe.pop(); else safe.push(piece); }
  return safe.join("/");
}

function mimeFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "bmp" ? "image/bmp" : ext === "svg" ? "image/svg+xml" : "image/png";
}

function runIsMarked(run: Element) {
  const props = direct(run, "rPr"); if (!props) return false;
  const underline = direct(props, "u"); const value = underline?.getAttribute("w:val") || underline?.getAttribute("val") || "";
  if (underline && value !== "none") return true;
  const colorNode = direct(props, "color"); const color = colorNode?.getAttribute("w:val") || colorNode?.getAttribute("val") || "";
  if (!/^[0-9a-f]{6}$/i.test(color)) return false;
  return parseInt(color.slice(0, 2), 16) >= 150 && parseInt(color.slice(2, 4), 16) <= 90 && parseInt(color.slice(4, 6), 16) <= 90;
}

function ommlChildren(element: Element | null) { return element ? Array.from(element.children).filter((child) => !child.localName.endsWith("Pr")) : []; }
function ommlToLatex(element: Element | null): string {
  if (!element) return "";
  const child = (name: string) => direct(element, name); const body = (name = "e") => ommlToLatex(child(name));
  switch (element.localName) {
    case "t": return element.textContent || "";
    case "r": return descendants(element, "t").map((item) => item.textContent || "").join("");
    case "f": return `\\frac{${body("num")}}{${body("den")}}`;
    case "rad": { const degree = body("deg"); return degree ? `\\sqrt[${degree}]{${body()}}` : `\\sqrt{${body()}}`; }
    case "sSup": return `{${body()}}^{${body("sup")}}`;
    case "sSub": return `{${body()}}_{${body("sub")}}`;
    case "sSubSup": return `{${body()}}_{${body("sub")}}^{${body("sup")}}`;
    case "nary": {
      const node = descendants(child("naryPr") || element, "chr")[0]; const symbol = node?.getAttribute("m:val") || node?.getAttribute("val") || "∑";
      const command = symbol === "∫" ? "\\int" : symbol === "∏" ? "\\prod" : symbol === "∑" ? "\\sum" : symbol;
      const sub = body("sub"); const sup = body("sup"); return `${command}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""} ${body()}`;
    }
    case "d": {
      const props = child("dPr"); const beginNode = descendants(props || element, "begChr")[0]; const endNode = descendants(props || element, "endChr")[0];
      const begin = beginNode?.getAttribute("m:val") || beginNode?.getAttribute("val") || "("; const end = endNode?.getAttribute("m:val") || endNode?.getAttribute("val") || ")";
      return `\\left${begin}${body()}\\right${end}`;
    }
    case "func": return `${body("fName")}\\left(${body()}\\right)`;
    case "acc": { const node = descendants(child("accPr") || element, "chr")[0]; const accent = node?.getAttribute("m:val") || node?.getAttribute("val") || "→"; return `\\${accent === "→" || accent === "⃗" ? "vec" : accent === "^" ? "hat" : "overline"}{${body()}}`; }
    case "bar": return `\\overline{${body()}}`;
    case "limLow": return `${body()}_{${body("lim")}}`;
    case "limUpp": return `${body()}^{${body("lim")}}`;
    case "eqArr": return ommlChildren(element).map(ommlToLatex).filter(Boolean).join("\\\\");
    case "m": { const rows = ommlChildren(element).filter((item) => item.localName === "mr"); return `\\begin{matrix}${rows.map((row) => ommlChildren(row).map(ommlToLatex).join(" & ")).join("\\\\")}\\end{matrix}`; }
    default: return ommlChildren(element).map(ommlToLatex).join("");
  }
}

function chartData(xml: string) {
  const doc = xmlDocument(xml); const type = descendants(doc, "pieChart").length ? "pie" : descendants(doc, "lineChart").length ? "line" : "bar";
  const titleNode = descendants(doc, "title")[0]; const title = titleNode ? elementText(titleNode) : "Biểu đồ";
  const series = descendants(doc, "ser").map((ser, index) => {
    const name = elementText(direct(ser, "tx")) || `Dãy ${index + 1}`; const cat = direct(ser, "cat"); const val = direct(ser, "val");
    const categories = descendants(cat || ser, "pt").map(elementText).filter(Boolean);
    const values = descendants(val || ser, "pt").map((point) => Number(elementText(point).replace(",", "."))).filter(Number.isFinite);
    return { name, categories, values };
  }).filter((item) => item.values.length);
  return { type, title, series };
}

async function chartPng(xml: string, index: number): Promise<File | null> {
  const data = chartData(xml); if (!data.series.length) return null;
  const width = 1100; const height = 620; const pad = 80; const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) return null;
  context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.fillStyle = "#17233c"; context.font = "bold 30px Arial"; context.textAlign = "center"; context.fillText(data.title || "Biểu đồ", width / 2, 42);
  const colors = ["#155eef", "#06b6d4", "#f59e0b", "#ef4444", "#8b5cf6", "#16a34a"]; const categories = data.series[0].categories.length ? data.series[0].categories : data.series[0].values.map((_, i) => String(i + 1));
  if (data.type === "pie") {
    const values = data.series[0].values; const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1; let angle = -Math.PI / 2;
    values.forEach((value, i) => { const next = angle + Math.max(0, value) / total * Math.PI * 2; context.beginPath(); context.moveTo(410, 325); context.arc(410, 325, 225, angle, next); context.closePath(); context.fillStyle = colors[i % colors.length]; context.fill(); angle = next; });
    context.textAlign = "left"; context.font = "22px Arial"; categories.forEach((label, i) => { context.fillStyle = colors[i % colors.length]; context.fillRect(720, 140 + i * 54, 28, 28); context.fillStyle = "#26354d"; context.fillText(`${label}: ${values[i] ?? ""}`, 765, 163 + i * 54); });
  } else {
    const maximum = Math.max(1, ...data.series.flatMap((item) => item.values).map(Math.abs)); const plotWidth = width - pad * 2; const plotHeight = height - 150; const step = plotWidth / Math.max(1, categories.length);
    context.strokeStyle = "#8aa0ba"; context.lineWidth = 2; context.beginPath(); context.moveTo(pad, 75); context.lineTo(pad, height - pad); context.lineTo(width - 30, height - pad); context.stroke();
    data.series.forEach((item, seriesIndex) => { context.strokeStyle = colors[seriesIndex % colors.length]; context.fillStyle = colors[seriesIndex % colors.length]; context.lineWidth = 5; context.beginPath(); item.values.forEach((value, valueIndex) => { const x = pad + step * valueIndex + step / 2; const y = height - pad - Math.max(0, value) / maximum * plotHeight; if (data.type === "line") { if (!valueIndex) context.moveTo(x, y); else context.lineTo(x, y); context.fillRect(x - 5, y - 5, 10, 10); } else { const barWidth = Math.min(70, step * .75 / data.series.length); context.fillRect(x - step * .36 + seriesIndex * barWidth, y, barWidth - 3, height - pad - y); } }); if (data.type === "line") context.stroke(); });
    context.fillStyle = "#3c4d64"; context.font = "18px Arial"; context.textAlign = "center"; categories.forEach((label, i) => context.fillText(label.slice(0, 16), pad + step * i + step / 2, height - 38));
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", .95)); return blob ? new File([blob], `bieu-do-${index + 1}.png`, { type: "image/png" }) : null;
}

export async function extractDocxDocument(file: File): Promise<ExtractedDocx> {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Chỉ đọc được tệp .docx. Với tệp .doc cũ, hãy mở bằng Word và Lưu dưới dạng .docx rồi tải lại.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer()); const documentEntry = zip.file("word/document.xml"); if (!documentEntry) throw new Error("Không tìm thấy nội dung văn bản trong tệp Word");
  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("text") || "<Relationships/>"; const relations = relationshipMap(relationshipsXml); const doc = xmlDocument(await documentEntry.async("text"));
  const lines: string[] = []; const media: ExtractedDocxMedia[] = []; const mediaByTarget = new Map<string, string>(); let equationCount = 0;
  const addMedia = async (id: string, kind: QuestionMedia["kind"] = "image") => {
    const target = relations.get(id); if (!target) return ""; if (mediaByTarget.has(target)) return mediaByTarget.get(target) || "";
    if (/charts\//i.test(target)) { const xml = await zip.file(resolveWordTarget(target))?.async("text"); if (!xml) return ""; const chart = await chartPng(xml, media.length); if (!chart) return ""; const marker = crypto.randomUUID(); media.push({ marker, file: chart, name: chart.name, kind: "chart", width: 1100, height: 620 }); mediaByTarget.set(target, marker); return marker; }
    const path = resolveWordTarget(target); const entry = zip.file(path); if (!entry) return ""; const blob = await entry.async("blob"); const name = path.split("/").pop() || `hinh-${media.length + 1}.png`; const marker = crypto.randomUUID(); media.push({ marker, file: new File([blob], name, { type: mimeFor(name) }), name, kind }); mediaByTarget.set(target, marker); return marker;
  };
  for (const paragraph of descendants(doc, "p")) {
    let text = ""; const pending: Array<Promise<string>> = [];
    const walk = (node: Node) => {
      if (node.nodeType !== 1) return; const element = node as Element;
      if (element.localName === "oMath" || element.localName === "oMathPara") { const formula = ommlToLatex(element).trim(); if (formula) { text += `${element.localName === "oMathPara" ? "\\[" : "\\("}${formula}${element.localName === "oMathPara" ? "\\]" : "\\)"}`; equationCount += 1; } return; }
      if (element.localName === "r") { let runText = ""; for (const item of descendants(element, "t")) runText += item.textContent || ""; if (descendants(element, "tab").length) runText = ` ${runText}`; if (runText) text += runIsMarked(element) ? `${MARK_OPEN}${runText}${MARK_CLOSE}` : runText; for (const blip of descendants(element, "blip")) { const id = relationshipId(blip); if (id) pending.push(addMedia(id)); } for (const chart of descendants(element, "chart")) { const id = relationshipId(chart); if (id) pending.push(addMedia(id, "chart")); } return; }
      if (new Set(["hyperlink", "smartTag", "sdt", "customXml"]).has(element.localName)) Array.from(element.childNodes).forEach(walk);
    };
    Array.from(paragraph.childNodes).forEach(walk); const markers = (await Promise.all(pending)).filter(Boolean); if (markers.length) text += ` ${markers.map((marker) => `⟦MEDIA:${marker}⟧`).join(" ")}`;
    text = text.replace(new RegExp(`${MARK_CLOSE}\\s*${MARK_OPEN}`, "g"), " ").trim(); if (text) lines.push(text);
  }
  return { lines, media, equationCount };
}

export async function extractDocxLines(file: File) { return (await extractDocxDocument(file)).lines; }
const stripMarks = (value: string) => value.replace(new RegExp(`[${MARK_OPEN}${MARK_CLOSE}]`, "g"), "").replace(MEDIA_PATTERN, "").replace(/\s+/g, " ").trim();
const hasMark = (value: string) => value.includes(MARK_OPEN);
const markedParts = (value: string) => (value.match(new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]*)${MARK_CLOSE}`, "g")) || []).map((part) => part.slice(1, -1));
const mediaMarkers = (value: string) => Array.from(value.matchAll(MEDIA_PATTERN)).map((match) => match[1]);

type Draft = { header: string; body: string[]; options: Array<{ letter: string; text: string; marked: boolean }>; statements: Array<{ letter: string; text: string; answer: boolean | null }>; shortAnswer: string; essayGuide: string; mediaIds: string[] };
function finalize(draft: Draft, index: number, mediaMap: Record<string, QuestionMedia>): ExamQuestion {
  const id = `q-${index + 1}`; const question = [stripMarks(draft.header), ...draft.body.map(stripMarks)].filter(Boolean).join("\n"); const media = [...new Set(draft.mediaIds)].map((marker) => mediaMap[marker]).filter(Boolean); const shared = { id, level: "Thông hiểu", question, ...(media.length ? { media } : {}) };
  if (draft.options.length >= 2) { const answer = draft.options.findIndex((option) => option.marked); return { ...shared, type: "choice", options: draft.options.map((option) => option.text), answer: answer >= 0 ? answer : undefined, points: 0.25 } as ExamQuestion; }
  if (draft.statements.length >= 2) return { ...shared, type: "true_false", statements: draft.statements.map((statement) => ({ text: statement.text, answer: statement.answer === null ? undefined : statement.answer })), points: 1 } as ExamQuestion;
  if (draft.shortAnswer) return { ...shared, type: "short", level: "Vận dụng", answer: draft.shortAnswer, points: 0.5 } as ExamQuestion;
  return { ...shared, type: "essay", level: "Vận dụng", guide: draft.essayGuide, answer: "", points: 1 } as ExamQuestion;
}

export function detectQuestions(lines: string[], mediaMap: Record<string, QuestionMedia> = {}): { questions: ExamQuestion[]; answered: number } {
  const questions: ExamQuestion[] = []; let draft: Draft | null = null; const push = () => { if (draft) { questions.push(finalize(draft, questions.length, mediaMap)); draft = null; } };
  for (const rawLine of lines) {
    const line = rawLine.trim(); if (!line) continue; const foundMedia = mediaMarkers(line); const questionStart = stripMarks(line).match(/^(?:Câu|Bài)\s*\d+\s*[.:)]?\s*(.*)$/i);
    if (questionStart) { push(); draft = { header: questionStart[1] || "", body: [], options: [], statements: [], shortAnswer: "", essayGuide: "", mediaIds: foundMedia }; continue; }
    if (!draft) continue; draft.mediaIds.push(...foundMedia); const stripped = stripMarks(line); const option = stripped.match(/^#?\s*([A-D])[.)]\s*(.+)$/);
    if (option) { draft.options.push({ letter: option[1], text: option[2].trim(), marked: hasMark(line) }); continue; }
    const statement = stripped.match(/^([a-dđ])[).]\s*(.+)$/); if (statement) { let text = statement[2].trim(); let answer: boolean | null = null; const marks = markedParts(line).join(" ").toLowerCase(); if (/đúng/.test(marks) && !/sai/.test(marks)) answer = true; else if (/sai/.test(marks)) answer = false; text = text.replace(/[.,;:\s]*Đúng\s*\/\s*Sai[.,;:\s]*$/i, "").trim(); draft.statements.push({ letter: statement[1], text, answer }); continue; }
    const shortKey = stripped.match(/^(?:ĐÁP ÁN|Đáp án)(?:\s+CHẤP NHẬN KHÁC)?\s*[:：]\s*(.+)$/); if (shortKey) { const value = shortKey[1].replace(/^\[|\]$/g, "").trim(); draft.shortAnswer = draft.shortAnswer ? `${draft.shortAnswer}|${value}` : value; continue; }
    const guide = stripped.match(/^(?:GỢI Ý ĐÁP ÁN|HƯỚNG DẪN CHẤM|Gợi ý đáp án|Hướng dẫn chấm)\s*[:：]\s*(.*)$/); if (guide) { draft.essayGuide = [draft.essayGuide, guide[1]].filter(Boolean).join("\n"); continue; }
    if (/^MỨC ĐỘ\s*[:：]/i.test(stripped) || /^CHỦ ĐỀ\s*[:：]/i.test(stripped) || /^-{4,}\s*HẾT/i.test(stripped)) continue;
    if (hasMark(line) && !draft.options.length && !draft.statements.length && !draft.shortAnswer) { const marked = markedParts(line).join(" ").trim(); if (marked && marked.length <= 120) { draft.shortAnswer = marked; continue; } }
    if (stripped) draft.body.push(stripped);
  }
  push(); const answered = questions.filter((question) => question.type === "choice" ? question.answer !== undefined : question.type === "true_false" ? (question.statements || []).every((statement) => statement.answer !== undefined) : question.type === "short" ? Boolean(String(question.answer || "").trim()) : true).length;
  return { questions, answered };
}
