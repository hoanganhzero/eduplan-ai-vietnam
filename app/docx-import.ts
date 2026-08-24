"use client";

// Đọc tệp .docx ngay trên trình duyệt (docx là tệp ZIP chứa XML) và nhận
// diện các dạng câu hỏi. Không dùng thư viện ngoài: tự đọc Central Directory
// của ZIP và giải nén bằng DecompressionStream("deflate-raw").

import type { ExamQuestion } from "./assessment-studio";

const MARK_OPEN = "⁅"; // đánh dấu đoạn chữ đỏ/gạch chân (đáp án đúng)
const MARK_CLOSE = "⁆";

function readUint32(view: DataView, offset: number) { return view.getUint32(offset, true); }
function readUint16(view: DataView, offset: number) { return view.getUint16(offset, true); }

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === "undefined") throw new Error("Trình duyệt chưa hỗ trợ đọc tệp Word. Hãy dùng Chrome, Edge hoặc Safari bản mới.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buffer: ArrayBuffer, wantedName: string) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // Tìm End of Central Directory (chữ ký 0x06054b50) từ cuối tệp.
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65536); i -= 1) {
    if (readUint32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Tệp không đúng định dạng .docx");
  const entryCount = readUint16(view, eocd + 10);
  let offset = readUint32(view, eocd + 16);
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) break;
    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localOffset = readUint32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === wantedName) {
      const localNameLength = readUint16(view, localOffset + 26);
      const localExtraLength = readUint16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error("Tệp Word dùng kiểu nén chưa hỗ trợ");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Không tìm thấy nội dung văn bản trong tệp Word");
}

function isRedColor(hex: string) {
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r >= 150 && g <= 90 && b <= 90;
}

// Chuyển document.xml thành văn bản thuần; run gạch chân hoặc chữ đỏ được
// bọc trong cặp ký hiệu MARK để nhận diện đáp án đúng.
export function docxXmlToText(xml: string) {
  const paragraphs = xml.split(/<\/w:p>/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    const runs = paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
    for (const run of runs) {
      const props = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || "";
      const underlined = /<w:u\b(?![^>]*w:val="none")/.test(props);
      const color = props.match(/<w:color[^>]*w:val="([0-9a-fA-F]{6})"/)?.[1] || "";
      const marked = underlined || isRedColor(color);
      let text = "";
      for (const t of run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []) {
        text += t.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, "");
      }
      if (/<w:tab\/>/.test(run)) text = ` ${text}`;
      if (!text) continue;
      line += marked ? `${MARK_OPEN}${text}${MARK_CLOSE}` : text;
    }
    line = line
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(new RegExp(`${MARK_CLOSE}\\s*${MARK_OPEN}`, "g"), " ")
      .trim();
    if (line) lines.push(line);
  }
  return lines;
}

export async function extractDocxLines(file: File) {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Chỉ đọc được tệp .docx. Với tệp .doc cũ, hãy mở bằng Word và Lưu dưới dạng .docx rồi tải lại.");
  }
  const entry = await readZipEntry(await file.arrayBuffer(), "word/document.xml");
  return docxXmlToText(new TextDecoder().decode(entry));
}

const stripMarks = (value: string) => value.replace(new RegExp(`[${MARK_OPEN}${MARK_CLOSE}]`, "g"), "").replace(/\s+/g, " ").trim();
const hasMark = (value: string) => value.includes(MARK_OPEN);
const markedParts = (value: string) => (value.match(new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]*)${MARK_CLOSE}`, "g")) || []).map((part) => part.slice(1, -1));

type Draft = {
  header: string;
  body: string[];
  options: Array<{ letter: string; text: string; marked: boolean }>;
  statements: Array<{ letter: string; text: string; answer: boolean | null }>;
  shortAnswer: string;
  essayGuide: string;
};

function finalize(draft: Draft, index: number): ExamQuestion {
  const id = `q-${index + 1}`;
  const question = [stripMarks(draft.header), ...draft.body.map(stripMarks)].filter(Boolean).join("\n");
  if (draft.options.length >= 2) {
    const answer = draft.options.findIndex((option) => option.marked);
    return { id, type: "choice", level: "Thông hiểu", question, options: draft.options.map((option) => option.text), answer: answer >= 0 ? answer : undefined, points: 0.25 } as ExamQuestion;
  }
  if (draft.statements.length >= 2) {
    return { id, type: "true_false", level: "Thông hiểu", question, statements: draft.statements.map((statement) => ({ text: statement.text, answer: statement.answer === null ? undefined : statement.answer })), points: 1 } as ExamQuestion;
  }
  if (draft.shortAnswer) {
    return { id, type: "short", level: "Vận dụng", question, answer: draft.shortAnswer, points: 0.5 };
  }
  return { id, type: "essay", level: "Vận dụng", question, guide: draft.essayGuide, answer: "", points: 1 } as ExamQuestion;
}

// Nhận diện câu hỏi từ các dòng văn bản đã trích xuất.
export function detectQuestions(lines: string[]): { questions: ExamQuestion[]; answered: number } {
  const questions: ExamQuestion[] = [];
  let draft: Draft | null = null;
  const push = () => { if (draft) { questions.push(finalize(draft, questions.length)); draft = null; } };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const questionStart = line.match(/^(?:Câu|Bài)\s*\d+\s*[.:)]?\s*(.*)$/i);
    if (questionStart) {
      push();
      draft = { header: questionStart[1] || "", body: [], options: [], statements: [], shortAnswer: "", essayGuide: "" };
      continue;
    }
    if (!draft) continue;
    const stripped = stripMarks(line);
    const option = stripped.match(/^#?\s*([A-D])[.)]\s*(.+)$/);
    if (option && /^#?\s*[A-D][.)]/.test(stripped)) {
      draft.options.push({ letter: option[1], text: option[2].trim(), marked: hasMark(line) });
      continue;
    }
    const statement = stripped.match(/^([a-dđ])[).]\s*(.+)$/);
    if (statement) {
      let text = statement[2].trim();
      let answer: boolean | null = null;
      const marks = markedParts(line).join(" ").toLowerCase();
      if (/đúng/.test(marks) && !/sai/.test(marks)) answer = true;
      else if (/sai/.test(marks)) answer = false;
      text = text.replace(/[.,;:\s]*Đúng\s*\/\s*Sai[.,;:\s]*$/i, "").trim();
      draft.statements.push({ letter: statement[1], text, answer });
      continue;
    }
    const shortKey = stripped.match(/^(?:ĐÁP ÁN|Đáp án)(?:\s+CHẤP NHẬN KHÁC)?\s*[:：]\s*(.+)$/);
    if (shortKey) {
      const value = shortKey[1].replace(/^\[|\]$/g, "").trim();
      if (draft.shortAnswer) draft.shortAnswer += `|${value}`;
      else draft.shortAnswer = value;
      continue;
    }
    const guide = stripped.match(/^(?:GỢI Ý ĐÁP ÁN|HƯỚNG DẪN CHẤM|Gợi ý đáp án|Hướng dẫn chấm)\s*[:：]\s*(.*)$/);
    if (guide) {
      draft.essayGuide = [draft.essayGuide, guide[1]].filter(Boolean).join("\n");
      continue;
    }
    if (/^MỨC ĐỘ\s*[:：]/i.test(stripped) || /^CHỦ ĐỀ\s*[:：]/i.test(stripped) || /^-{4,}\s*HẾT/i.test(stripped)) continue;
    if (hasMark(line) && !draft.options.length && !draft.statements.length && !draft.shortAnswer) {
      // Đoạn được tô đỏ/gạch chân đứng riêng ngay sau câu hỏi → coi là đáp án ngắn.
      const marked = markedParts(line).join(" ").trim();
      if (marked && marked.length <= 120) { draft.shortAnswer = marked; continue; }
    }
    draft.body.push(line);
  }
  push();
  const answered = questions.filter((question) =>
    question.type === "choice" ? question.answer !== undefined :
    question.type === "true_false" ? (question.statements || []).every((statement) => statement.answer !== undefined) :
    question.type === "short" ? Boolean(String(question.answer || "").trim()) : true,
  ).length;
  return { questions, answered };
}
