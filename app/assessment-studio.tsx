"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Role = "teacher" | "student";
type Notice = (message: string, tone?: "success" | "error") => void;
type TestKind = "Luyện tập" | "Thường xuyên" | "Giữa học kỳ" | "Học kỳ";
type Subject = keyof typeof templates;
type VariantMode = "shuffle" | "similar";
type ExamHeader = {
  authority: string;
  school: string;
  examName: string;
  schoolYear: string;
  duration: number;
  pageCount: number;
};
export type ExamQuestion = {
  id: string;
  type: "choice" | "true_false" | "short" | "essay";
  level: string;
  question: string;
  options?: string[];
  answer?: number | string;
  statements?: Array<{ text: string; answer: boolean }>;
  guide?: string;
  points: number;
};
type AssessmentRecord = {
  id: string;
  title: string;
  subject: string;
  kind: string;
  time: number;
  status: string;
  questions?: ExamQuestion[];
  header?: ExamHeader;
  variantCount?: number;
  firstCode?: number;
  variantMode?: VariantMode;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  includeAnswerKey?: boolean;
  sourceFile?: unknown;
  createdAt?: string;
};
type AssessmentResult = {
  id: string;
  assessmentId: string;
  studentKey: string;
  studentName: string;
  score: number;
  total: number;
  essayPending?: boolean;
  submittedAt?: string;
  answers?: Record<string, unknown>;
};

const templates = {
  "Ngữ văn": { time: 90, label: "Tự luận · 10 điểm", file: "Mau-de-Ngu-van.doc", parts: ["Đọc hiểu: 4,0 điểm · ngữ liệu ngoài SGK", "Viết đoạn nghị luận xã hội", "Viết bài nghị luận văn học/xã hội · phần Viết 6,0 điểm"], counts: { choice: 0, trueFalse: 0, short: 0, essay: 5 } },
  "Toán": { time: 90, label: "3 dạng thức", file: "Mau-de-Toan.doc", parts: ["Phần I: Trắc nghiệm nhiều lựa chọn", "Phần II: Đúng/sai, mỗi câu gồm 4 ý", "Phần III: Trả lời ngắn"], counts: { choice: 12, trueFalse: 4, short: 6, essay: 0 } },
  "Ngoại ngữ": { time: 50, label: "40 câu · năng lực ngôn ngữ", file: "Mau-de-Ngoai-ngu.doc", parts: ["Điền từ/cụm từ hoàn thành đoạn văn", "Sắp xếp câu thành đoạn", "Điền câu/cụm từ dài và đọc hiểu sâu"], counts: { choice: 40, trueFalse: 0, short: 0, essay: 0 } },
  "Lịch sử · Địa lý · GDKT&PL": { time: 50, label: "2 dạng thức", file: "Mau-de-KHXH.doc", parts: ["Phần I: Trắc nghiệm nhiều lựa chọn", "Phần II: Đúng/sai, mỗi câu gồm 4 ý", "Kèm đáp án và ma trận mức độ"], counts: { choice: 24, trueFalse: 4, short: 0, essay: 0 } },
  "KHTN · Tin học · Công nghệ": { time: 50, label: "Theo đặc thù môn học", file: "Mau-de-KHTN-Tin-Cong-nghe.doc", parts: ["Nhiều lựa chọn 4 phương án", "Đúng/sai theo nhóm 4 ý", "Trả lời ngắn khi môn học yêu cầu"], counts: { choice: 18, trueFalse: 4, short: 6, essay: 0 } },
};

const countLabels = [
  ["choice", "Nhiều lựa chọn", "4 phương án · chọn 1"],
  ["trueFalse", "Đúng / Sai", "Mỗi câu gồm 4 ý"],
  ["short", "Trả lời ngắn", "Số hoặc từ khóa"],
  ["essay", "Tự luận", "Đoạn/bài viết"],
] as const;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ").replace(/,/g, ".");
}
// Trộn có hạt giống để mỗi mã đề luôn tái lập được cùng một thứ tự.
function seededShuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed >>> 0 || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
// Thang điểm câu đúng/sai 4 ý theo hướng dẫn hiện hành: 1 ý=10%, 2 ý=25%, 3 ý=50%, 4 ý=100%.
function trueFalseRatio(correct: number, total: number) {
  if (total === 4) return [0, 0.1, 0.25, 0.5, 1][correct] ?? 0;
  return total ? correct / total : 0;
}
export function gradeExam(questions: ExamQuestion[], answers: Record<string, unknown>) {
  let score = 0;
  let total = 0;
  let essayPending = false;
  for (const question of questions) {
    total += question.points;
    const answer = answers[question.id];
    if (question.type === "choice") {
      if (Number(answer) === Number(question.answer)) score += question.points;
    } else if (question.type === "true_false") {
      const picks = Array.isArray(answer) ? (answer as unknown[]) : [];
      const statements = question.statements || [];
      const correct = statements.filter((statement, index) => Boolean(picks[index]) === statement.answer).length;
      score += question.points * trueFalseRatio(correct, statements.length);
    } else if (question.type === "short") {
      if (normalizeText(String(answer ?? "")) !== "" && normalizeText(String(answer ?? "")) === normalizeText(String(question.answer ?? ""))) score += question.points;
    } else if (question.type === "essay") {
      if (String(answer ?? "").trim()) essayPending = true;
    }
  }
  return { score: Math.round(score * 100) / 100, total: Math.round(total * 100) / 100, essayPending };
}

const typeNames: Record<ExamQuestion["type"], string> = { choice: "Trắc nghiệm", true_false: "Đúng/Sai", short: "Trả lời ngắn", essay: "Tự luận" };

function examHead(header: ExamHeader, subject: string, code: number) {
  const safe = Object.fromEntries(Object.entries(header).map(([key, value]) => [key, escapeHtml(String(value))])) as Record<keyof ExamHeader, string>;
  return `<table class="exam-head"><tr><td><div class="authority">${safe.authority}<br>${safe.school}</div><br>--------------------<br><i>(Đề thi có ${String(header.pageCount).padStart(2, "0")} trang)</i></td><td><div class="exam">${safe.examName}<br>NĂM HỌC ${safe.schoolYear}<br>MÔN: ${escapeHtml(subject.toUpperCase())}<br><span class="sub">Thời gian làm bài: ${safe.duration} PHÚT<br>(không kể thời gian phát đề)</span></div></td></tr></table>
  <table class="student-line"><tr><td>Họ và tên: ............................................................</td><td>Số báo danh: ........</td><td>Mã đề ${code}</td></tr></table>`;
}

// Sinh tệp Word thật cho một mã đề từ ngân hàng câu hỏi đã duyệt.
function buildVariantWord(record: AssessmentRecord, code: number, includeKey: boolean) {
  const header = record.header || { authority: "SỞ GD&ĐT TÂY NINH", school: "TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH", examName: record.kind.toUpperCase(), schoolYear: "2025 - 2026", duration: record.time, pageCount: 2 };
  const questions = record.questions || [];
  const groups: ExamQuestion["type"][] = ["choice", "true_false", "short", "essay"];
  const partTitles: Record<ExamQuestion["type"], string> = {
    choice: "PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN",
    true_false: "PHẦN II. TRẮC NGHIỆM ĐÚNG/SAI",
    short: "PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN",
    essay: "PHẦN IV. TỰ LUẬN",
  };
  const keyRows: string[] = [];
  let body = "";
  let number = 0;
  for (const type of groups) {
    let group = questions.filter((question) => question.type === type);
    if (!group.length) continue;
    if (record.shuffleQuestions !== false) group = seededShuffle(group, code * 31 + groups.indexOf(type));
    body += `<h2>${partTitles[type]}</h2>`;
    for (const question of group) {
      number += 1;
      body += `<p><b>Câu ${number}.</b> ${escapeHtml(question.question)} <i>(${question.points} điểm)</i></p>`;
      if (question.type === "choice") {
        const order = record.shuffleAnswers !== false
          ? seededShuffle((question.options || []).map((_, index) => index), code * 97 + number)
          : (question.options || []).map((_, index) => index);
        order.forEach((optionIndex, position) => {
          body += `<p style="margin-left:14px">${String.fromCharCode(65 + position)}. ${escapeHtml(question.options?.[optionIndex] || "")}</p>`;
        });
        const keyPosition = order.indexOf(Number(question.answer));
        keyRows.push(`Câu ${number}: ${String.fromCharCode(65 + Math.max(0, keyPosition))}`);
      } else if (question.type === "true_false") {
        (question.statements || []).forEach((statement, index) => {
          body += `<p style="margin-left:14px">${String.fromCharCode(97 + index)}) ${escapeHtml(statement.text)} &nbsp; Đúng / Sai</p>`;
        });
        keyRows.push(`Câu ${number}: ${(question.statements || []).map((statement, index) => `${String.fromCharCode(97 + index)}-${statement.answer ? "Đ" : "S"}`).join(", ")}`);
      } else if (question.type === "short") {
        body += `<p style="margin-left:14px">Trả lời: .......................................................</p>`;
        keyRows.push(`Câu ${number}: ${escapeHtml(String(question.answer ?? ""))}`);
      } else {
        body += `<p style="margin-left:14px"><i>Học sinh trình bày bài làm vào giấy kiểm tra.</i></p>`;
        keyRows.push(`Câu ${number}: ${escapeHtml(question.guide || "Chấm theo hướng dẫn")}`);
      }
    }
  }
  const key = includeKey
    ? `<h2 style="page-break-before:always">ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM · MÃ ĐỀ ${code}</h2>${keyRows.map((row) => `<p class="answer">${row}</p>`).join("")}`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.3;color:#111}
  .exam-head{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 14px}.exam-head td{width:50%;border:0;padding:0 10px;text-align:center;vertical-align:top}
  .exam-head .authority{color:#d00000;font-weight:bold}.exam-head .exam{font-weight:bold}.exam-head .sub{font-style:italic;font-weight:normal}
  .student-line{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 10px}.student-line td{border:0;border-bottom:1.2pt solid #111;padding:3px 4px;font-size:12.5pt}
  .student-line td:nth-child(3){text-align:right;font-weight:bold}
  h2{font-size:14pt;margin-top:16px;border-bottom:1px solid #777;padding-bottom:3px}
  .answer{color:#d00000}
  </style></head><body>${examHead(header, record.subject, code)}${body}<p style="text-align:center;font-weight:bold;font-style:italic">------ HẾT ------</p>${key}</body></html>`;
}

function downloadVariants(record: AssessmentRecord, notify: Notice) {
  if (!record.questions?.length) return notify("Đề này chưa có ngân hàng câu hỏi để sinh mã đề", "error");
  const count = Math.min(50, Math.max(1, record.variantCount || 1));
  const first = record.firstCode || 101;
  for (let index = 0; index < count; index += 1) {
    const code = first + index;
    const blob = new Blob(["﻿", buildVariantWord(record, code, record.includeAnswerKey !== false)], { type: "application/msword;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${record.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 50) || "de"}-Ma-${code}.doc`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  notify(`Đã tạo ${count} tệp Word mã đề ${first}${count > 1 ? `–${first + count - 1}` : ""}`);
}

function buildWordTemplate(subject: Subject, kind: TestKind, header: ExamHeader, firstCode: number) {
  const template = templates[subject];
  const sections: string[] = [];
  if (template.counts.choice > 0) sections.push(`
    <h2>PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN</h2>
    <p class="hint">Cách đánh dấu: đáp án đúng phải <span class="correct">gạch chân hoặc tô đỏ</span>. Thêm dấu <b>#</b> ngay trước đáp án nếu không được phép đổi vị trí khi trộn đề.</p>
    <p><b>Câu 1.</b> Nội dung câu hỏi mẫu?</p>
    <p>A. Phương án nhiễu thứ nhất</p><p class="correct">B. Phương án đúng (đang gạch chân và tô đỏ)</p>
    <p>#C. Phương án này luôn cố định ở vị trí C</p><p>D. Phương án nhiễu thứ tư</p>
    <p class="meta">MỨC ĐỘ: Nhận biết &nbsp; | &nbsp; CHỦ ĐỀ: [Tên chủ đề] &nbsp; | &nbsp; ĐIỂM: 0,25</p>`);
  if (template.counts.trueFalse > 0) sections.push(`
    <h2>PHẦN II. TRẮC NGHIỆM ĐÚNG / SAI</h2>
    <p class="hint">Mỗi câu gồm đúng 4 ý a, b, c, d. Gạch chân hoặc tô đỏ chữ Đúng/Sai tương ứng.</p>
    <p><b>Câu 1.</b> Cho thông tin hoặc ngữ liệu: [Nhập nội dung chung]</p>
    <p>a) Nhận định thứ nhất. &nbsp; <span class="correct">Đúng</span> / Sai</p>
    <p>b) Nhận định thứ hai. &nbsp; Đúng / <span class="correct">Sai</span></p>
    <p>c) Nhận định thứ ba. &nbsp; <span class="correct">Đúng</span> / Sai</p>
    <p>d) Nhận định thứ tư. &nbsp; Đúng / <span class="correct">Sai</span></p>
    <p class="meta">MỨC ĐỘ: Thông hiểu &nbsp; | &nbsp; CHỦ ĐỀ: [Tên chủ đề]</p>`);
  if (template.counts.short > 0) sections.push(`
    <h2>PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN</h2>
    <p><b>Câu 1.</b> Nội dung bài toán/câu hỏi cần học sinh tính toán hoặc suy luận.</p>
    <p>ĐÁP ÁN: <span class="correct">[Kết quả chính xác]</span></p>
    <p>ĐÁP ÁN CHẤP NHẬN KHÁC: [Nếu có, phân cách bằng dấu ;]</p>
    <p class="meta">MỨC ĐỘ: Vận dụng &nbsp; | &nbsp; CHỦ ĐỀ: [Tên chủ đề] &nbsp; | &nbsp; ĐIỂM: 0,5</p>`);
  if (template.counts.essay > 0 || subject === "Ngữ văn") sections.push(`
    <h2>PHẦN I. ĐỌC HIỂU (4,0 ĐIỂM)</h2>
    <p><b>Ngữ liệu:</b> [Dán văn bản/ngữ liệu ngoài sách giáo khoa tại đây]</p>
    <p><b>Câu 1.</b> Câu hỏi mức độ nhận biết. <i>(0,5 điểm)</i></p>
    <p>GỢI Ý ĐÁP ÁN: <span class="correct">[Nội dung cần đạt]</span></p>
    <p><b>Câu 2.</b> Câu hỏi mức độ thông hiểu/vận dụng. <i>(1,0 điểm)</i></p>
    <p>GỢI Ý ĐÁP ÁN: <span class="correct">[Nội dung cần đạt]</span></p>
    <h2>PHẦN II. VIẾT (6,0 ĐIỂM)</h2>
    <p><b>Câu 1. Viết đoạn văn:</b> [Nhập yêu cầu nghị luận xã hội]</p>
    <p><b>Câu 2. Viết bài văn:</b> [Nhập yêu cầu nghị luận văn học/xã hội]</p>
    <p class="meta">HƯỚNG DẪN CHẤM: [Yêu cầu nội dung, hình thức, mức điểm và tiêu chí]</p>`);

  const safe = Object.fromEntries(Object.entries(header).map(([key, value]) => [key, escapeHtml(String(value))])) as Record<keyof ExamHeader, string>;
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>
    @page Section1{size:21cm 29.7cm;margin:1.1cm 1.2cm 1.4cm 1.5cm;mso-header-margin:.5cm;mso-footer-margin:.6cm;mso-footer:f1}div.Section1{page:Section1}body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.22;color:#111}.exam-head{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 14px}.exam-head td{width:50%;border:0;padding:0 10px;text-align:center;vertical-align:top}.exam-head .authority{color:#d00000;font-weight:bold;line-height:1.22}.exam-head .exam{font-weight:bold;line-height:1.22}.exam-head .sub{font-style:italic;font-weight:normal}.student-line{border-collapse:collapse;width:100%;table-layout:fixed;margin:0}.student-line td{border:0;border-bottom:1.2pt solid #111;padding:3px 4px;font-size:12.5pt}.student-line td:nth-child(1){width:57%}.student-line td:nth-child(2){width:23%}.student-line td:nth-child(3){width:20%;text-align:right;font-weight:bold}.footer{mso-element:footer}.footer table{border-collapse:collapse;width:100%;border-top:1pt solid #111}.footer td{border:0;padding-top:5px;font-size:11pt}.footer td:last-child{text-align:right}h1{text-align:center;font-size:16pt}h2{font-size:14pt;margin-top:18px;border-bottom:1px solid #777;padding-bottom:3px}.correct{color:#d00000;text-decoration:underline;font-weight:bold}.hint{background:#fff2cc;border:1px solid #d6b656;padding:8px}.meta{background:#eef4fb;padding:6px;font-size:11pt}.info-table{border-collapse:collapse;width:100%;margin:10px 0}.info-table td{border:1px solid #555;padding:6px}.rules li{margin:4px 0}</style></head><body>
    <div class="footer" id="f1"><table><tr><td>Mã đề ${firstCode}</td><td>Trang <span style="mso-field-code:' PAGE '">1</span>/<span style="mso-field-code:' NUMPAGES '">${safe.pageCount}</span></td></tr></table></div>
    <div class="Section1"><table class="exam-head"><tr><td><div class="authority">${safe.authority}<br>${safe.school}</div><br>--------------------<br><i>(Đề thi có ${String(header.pageCount).padStart(2, "0")} trang)</i></td><td><div class="exam">${safe.examName}<br>NĂM HỌC ${safe.schoolYear}<br>MÔN: ${subject.toUpperCase()}<br><span class="sub">Thời gian làm bài: ${safe.duration} PHÚT<br>(không kể thời gian phát đề)</span></div></td></tr></table>
    <table class="student-line"><tr><td>Họ và tên: ............................................................</td><td>Số báo danh: ........</td><td>Mã đề ${firstCode}</td></tr></table>
    <h2>HƯỚNG DẪN NHANH</h2><ol class="rules"><li>Thay nội dung trong dấu [ ] bằng nội dung của giáo viên.</li><li>Đáp án đúng: <span class="correct">gạch chân hoặc tô màu đỏ</span> (có thể dùng đồng thời như mẫu).</li><li>Phương án không được đảo vị trí: đặt dấu <b>#</b> ngay trước A/B/C/D, ví dụ <b>#D. Cả ba đáp án trên</b>.</li><li>Không xóa các nhãn Câu, MỨC ĐỘ, CHỦ ĐỀ, ĐIỂM, ĐÁP ÁN hoặc GỢI Ý ĐÁP ÁN.</li><li>Sao chép nguyên khối câu mẫu để tạo thêm câu mới; đánh số câu liên tục trong từng phần.</li></ol>
    <table class="info-table"><tr><td><b>Đơn vị:</b> ${safe.school}</td><td><b>Môn:</b> ${subject}</td></tr><tr><td><b>Lớp:</b> [10/11/12]</td><td><b>Thời gian:</b> ${safe.duration} phút</td></tr></table>
    ${sections.join("\n")}<p style="text-align:center;font-weight:bold;font-style:italic">------ HẾT ------</p><p class="hint">Trước khi tải lên hệ thống: kiểm tra lại phần chữ đỏ/gạch chân, dấu # và thang điểm toàn đề.</p></div></body></html>`;
}

export function AssessmentStudio({ role, notify, accountKey = "" }: { role: Role; notify: Notice; accountKey?: string }) {
  return role === "student" ? <StudentAssessments notify={notify} accountKey={accountKey} /> : <TeacherAssessments notify={notify} />;
}

function TeacherAssessments({ notify }: { notify: Notice }) {
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState<Subject>("Toán");
  const [kind, setKind] = useState<TestKind>("Thường xuyên");
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [aiContent, setAiContent] = useState("");
  const [aiMatrixNote, setAiMatrixNote] = useState("");
  const [aiQuestions, setAiQuestions] = useState<ExamQuestion[]>([]);
  const [counts, setCounts] = useState(templates.Toán.counts);
  const [examHeader, setExamHeader] = useState<ExamHeader>({ authority: "SỞ GD&ĐT TÂY NINH", school: "TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH", examName: "KIỂM TRA HỌC KỲ 1", schoolYear: "2025 - 2026", duration: 90, pageCount: 2 });
  const [variantCount, setVariantCount] = useState(4);
  const [firstCode, setFirstCode] = useState(101);
  const [variantMode, setVariantMode] = useState<VariantMode>("shuffle");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleAnswers, setShuffleAnswers] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [resultsFor, setResultsFor] = useState<AssessmentRecord | null>(null);
  const template = templates[subject];
  const totalQuestions = useMemo(() => Object.values(counts).reduce((sum, value) => sum + value, 0), [counts]);
  const variantCodes = useMemo(() => Array.from({ length: variantCount }, (_, index) => firstCode + index), [variantCount, firstCode]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAssessments(Array.isArray(result.data?.assessments) ? result.data.assessments : []);
      setResults(Array.isArray(result.data?.assessmentResults) ? result.data.assessmentResults : []);
    } catch {
      setAssessments([]);
    }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const mutateWorkspace = async (mutate: (data: Record<string, unknown>) => Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const workspaceResponse = await fetch("/api/workspace");
      const workspace = await workspaceResponse.json();
      if (!workspaceResponse.ok) throw new Error(workspace.error || "Không thể tải kho đề");
      const next = mutate((workspace.data || {}) as Record<string, unknown>);
      const saveResponse = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: next }) });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.saved) throw new Error(saved.error || "Không thể lưu kho đề");
      setAssessments(Array.isArray(saved.data?.assessments) ? saved.data.assessments : []);
      setResults(Array.isArray(saved.data?.assessmentResults) ? saved.data.assessmentResults : []);
      notify(message);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể cập nhật kho đề", "error");
      return false;
    } finally { setBusy(false); }
  };

  const changeSubject = (next: Subject) => {
    setSubject(next);
    setCounts({ ...templates[next].counts });
    setExamHeader((current) => ({ ...current, duration: templates[next].time }));
    setManualFile(null);
    setAiQuestions([]);
  };
  const downloadTemplate = () => {
    const blob = new Blob(["﻿", buildWordTemplate(subject, kind, examHeader, firstCode)], { type: "application/msword;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = template.file; link.click(); URL.revokeObjectURL(link.href);
    notify(`Đã tải mẫu Word môn ${subject}`);
  };
  const generateAi = async () => {
    if (totalQuestions === 0) return notify("Số lượng câu hỏi phải lớn hơn 0", "error");
    setBusy(true);
    try {
      const response = await fetch("/api/assessment-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, kind, content: aiContent, matrixNote: aiMatrixNote, counts }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const withIds = (result.questions as Omit<ExamQuestion, "id">[]).map((question, index) => ({ ...question, id: `q-${index + 1}` }));
      setAiQuestions(withIds);
      notify(`AI đã tạo ${withIds.length} câu hỏi. Thầy cô duyệt trước khi lưu đề.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tạo câu hỏi", "error");
    } finally { setBusy(false); }
  };
  const create = async () => {
    if (!title.trim()) return notify("Vui lòng nhập tên bài kiểm tra", "error");
    if (variantCount < 1 || variantCount > 50) return notify("Số mã đề phải từ 1 đến 50", "error");
    if (mode === "ai") {
      if (!aiQuestions.length) return notify("Hãy bấm 'Tạo câu hỏi bằng AI' và duyệt câu hỏi trước khi lưu đề", "error");
      const record: AssessmentRecord = {
        id: String(Date.now()), title: title.trim(), subject, kind, time: examHeader.duration, status: "Bản nháp",
        questions: aiQuestions, header: examHeader, variantCount, firstCode, variantMode: "shuffle",
        shuffleQuestions, shuffleAnswers, includeAnswerKey, createdAt: new Date().toISOString(),
      };
      const ok = await mutateWorkspace(
        (data) => ({ ...data, assessments: [record, ...(Array.isArray(data.assessments) ? data.assessments as AssessmentRecord[] : [])] }),
        "Đã lưu đề với ngân hàng câu hỏi thật. Bấm Xuất bản để giao cho học sinh.",
      );
      if (ok) { setCreating(false); setAiQuestions([]); setTitle(""); }
      return;
    }
    if (!manualFile) return notify("Vui lòng tải đề Word theo đúng mẫu môn học", "error");
    if (!shuffleQuestions && !shuffleAnswers && variantMode === "shuffle" && variantCount > 1) return notify("Hãy chọn đảo câu hỏi hoặc đảo đáp án để tạo nhiều mã đề", "error");
    if (variantMode === "similar") return notify("AI sinh đề tương tự chỉ khả dụng với đề tạo bằng AI (mục Tạo tự động), vì hệ thống chưa đọc được nội dung tệp Word.", "error");
    setBusy(true);
    try {
      const upload = new FormData(); upload.append("file", manualFile);
      const uploadResponse = await fetch("/api/assignment-files", { method: "POST", body: upload });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.file) throw new Error(uploadResult.error || "Không thể lưu tệp đề Word");
      const record: AssessmentRecord = { id: String(Date.now()), title: title.trim(), subject, kind, time: examHeader.duration, status: "Bản nháp", sourceFile: uploadResult.file, header: examHeader, variantCount, firstCode, variantMode, shuffleQuestions, shuffleAnswers, includeAnswerKey, createdAt: new Date().toISOString() };
      const ok = await mutateWorkspace(
        (data) => ({ ...data, assessments: [record, ...(Array.isArray(data.assessments) ? data.assessments as AssessmentRecord[] : [])] }),
        "Đã tải và lưu đề Word thật trên Supabase dưới dạng bản nháp",
      );
      if (ok) { setCreating(false); setTitle(""); setManualFile(null); }
    } catch (error) { notify(error instanceof Error ? error.message : "Không thể lưu đề", "error"); }
    finally { setBusy(false); }
  };
  const setStatus = (record: AssessmentRecord, status: string, message: string) =>
    mutateWorkspace(
      (data) => ({ ...data, assessments: (Array.isArray(data.assessments) ? data.assessments as AssessmentRecord[] : []).map((item) => item.id === record.id ? { ...item, status } : item) }),
      message,
    );
  const removeRecord = (record: AssessmentRecord) => {
    if (!window.confirm(`Xóa đề “${record.title}”?`)) return;
    void mutateWorkspace(
      (data) => ({
        ...data,
        assessments: (Array.isArray(data.assessments) ? data.assessments as AssessmentRecord[] : []).filter((item) => item.id !== record.id),
        assessmentResults: (Array.isArray(data.assessmentResults) ? data.assessmentResults as AssessmentResult[] : []).filter((item) => item.assessmentId !== record.id),
      }),
      "Đã xóa đề và kết quả liên quan",
    );
  };

  return <section className="assessment-shell">
    <div className="assessment-hero"><div><small>ASSESSMENT STUDIO</small><h2>Tạo đề từ mẫu Word hoặc tự động bằng AI</h2><p>Nhập đề Word có sẵn, hoặc dán ngữ liệu bài học để AI tạo ngân hàng câu hỏi thật — sau đó xuất bản cho học sinh làm trực tuyến và tự chấm.</p><button onClick={() => setCreating(true)}>＋ Tạo bài mới</button></div><div className="assessment-hero-stats"><b>05<small>Mẫu môn học</small></b><b>04<small>Dạng câu hỏi</small></b><b>AI<small>Bám ngữ liệu thật</small></b></div></div>
    <div className="assessment-type-row">{(["Luyện tập", "Thường xuyên", "Giữa học kỳ", "Học kỳ"] as TestKind[]).map((item, index) => <article key={item}><span>{["✦", "✓", "◷", "▣"][index]}</span><div><b>{item}</b><small>{index === 0 ? "Không giới hạn lần làm" : index === 1 ? "Đánh giá quá trình" : index === 2 ? "Theo ma trận giữa kỳ" : "Tổng kết học kỳ"}</small></div></article>)}</div>
    <div className="assessment-head"><div><b>Kho đề của tôi</b><small>Quản lý bản nháp, xuất bản trực tuyến và kết quả học sinh</small></div><button onClick={() => setCreating(true)}>＋ Tạo đề</button></div>
    <div className="assessment-grid">{assessments.map((item) => {
      const itemResults = results.filter((result) => result.assessmentId === item.id);
      return <article key={item.id}><div><span>{item.kind}</span><i>{item.status}</i></div><small>{item.subject} · {item.questions?.length ? `${item.questions.length} câu hỏi` : "Đề Word đính kèm"}</small><h3>{item.title}</h3><p>◷ {item.time} phút · {item.questions?.length ? "Ngân hàng câu hỏi thật" : "Tệp nguồn đã lưu"}</p>
        <footer className="assessment-card-actions">
          {item.questions?.length ? <>
            {item.status === "Đã xuất bản"
              ? <button onClick={() => void setStatus(item, "Bản nháp", "Đã thu hồi đề, học sinh không thấy nữa")}>Thu hồi</button>
              : <button className="publish" onClick={() => void setStatus(item, "Đã xuất bản", "Đã xuất bản. Học sinh có thể làm bài trực tuyến")}>Xuất bản</button>}
            <button onClick={() => downloadVariants(item, notify)}>⇩ {item.variantCount || 1} mã đề</button>
            <button onClick={() => setResultsFor(item)}>Kết quả ({itemResults.length})</button>
          </> : (item.sourceFile as { url?: string } | undefined)?.url ? <a href={(item.sourceFile as { url: string }).url} target="_blank" rel="noreferrer">⇩ Tệp đề</a> : null}
          <button className="assessment-delete" onClick={() => removeRecord(item)}>Xóa</button>
        </footer>
      </article>;
    })}{assessments.length === 0 && <div className="learning-empty"><span>▤</span><b>Kho đề đang trống</b><p>Chưa có đề nào được lưu trên Supabase.</p></div>}</div>

    {resultsFor && <div className="assessment-modal" role="dialog" aria-modal="true"><div className="assessment-builder results-viewer"><button className="assessment-close" onClick={() => setResultsFor(null)}>×</button><small>KẾT QUẢ TRỰC TUYẾN</small><h2>{resultsFor.title}</h2>
      {results.filter((result) => result.assessmentId === resultsFor.id).length === 0 ? <div className="learning-empty"><span>✓</span><b>Chưa có học sinh nộp bài</b><p>Kết quả xuất hiện ngay khi học sinh hoàn thành bài trực tuyến.</p></div> : <div className="results-table">{results.filter((result) => result.assessmentId === resultsFor.id).map((result) => <ResultRow key={result.id} result={result} record={resultsFor} onOverride={(finalTen) => void mutateWorkspace((data) => ({ ...data, assessmentResults: (Array.isArray(data.assessmentResults) ? data.assessmentResults as AssessmentResult[] : []).map((item) => item.id === result.id ? { ...item, score: Math.round((finalTen / 10) * (item.total || 10) * 100) / 100, essayPending: false } : item) }), `Đã lưu điểm cuối cho ${result.studentName}`)} />)}</div>}
    </div></div>}

    {creating && <div className="assessment-modal" role="dialog" aria-modal="true"><div className="assessment-builder"><button className="assessment-close" onClick={() => setCreating(false)}>×</button><small>TẠO BÀI LUYỆN TẬP / KIỂM TRA</small><h2>Thiết lập đề theo môn học</h2>
      <div className="assessment-form"><label className="wide">Tên bài<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Kiểm tra giữa học kỳ I" /></label><label>Hình thức<select value={kind} onChange={(event) => { const next = event.target.value as TestKind; setKind(next); setExamHeader((current) => ({ ...current, examName: next === "Học kỳ" ? "KIỂM TRA HỌC KỲ 1" : next === "Giữa học kỳ" ? "KIỂM TRA GIỮA HỌC KỲ 1" : next === "Thường xuyên" ? "KIỂM TRA THƯỜNG XUYÊN" : "BÀI LUYỆN TẬP" })); }}>{["Luyện tập", "Thường xuyên", "Giữa học kỳ", "Học kỳ"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Môn / nhóm môn<select value={subject} onChange={(event) => changeSubject(event.target.value as Subject)}>{Object.keys(templates).map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="creation-mode"><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><span>W</span><b>Nhập đề từ Word</b><small>Tải mẫu đúng môn rồi đưa đề lên</small></button><button className={mode === "ai" ? "active ai" : "ai"} onClick={() => setMode("ai")}><span>✦</span><b>Tạo tự động bằng AI</b><small>Dán ngữ liệu bài học + số câu từng dạng</small></button></div>
      <div className="template-preview"><div><b>{subject}</b><span>{template.time} phút · {template.label}</span></div>{template.parts.map((part, index) => <p key={part}><i>{index + 1}</i>{part}</p>)}</div>
      <section className="exam-layout-config"><div className="exam-layout-head"><div><b>Tiêu đề và chân trang theo mẫu Word</b><small>Áp dụng cho mẫu tải về và các mã đề Word được sinh ra.</small></div><button onClick={downloadTemplate}>⇩ Tải mẫu có tiêu đề</button></div><div className="exam-layout-grid"><label>Sở / đơn vị quản lý<input value={examHeader.authority} onChange={(event) => setExamHeader({ ...examHeader, authority: event.target.value })} /></label><label>Tên trường / trung tâm<input value={examHeader.school} onChange={(event) => setExamHeader({ ...examHeader, school: event.target.value })} /></label><label>Tên kỳ kiểm tra<input value={examHeader.examName} onChange={(event) => setExamHeader({ ...examHeader, examName: event.target.value })} /></label><label>Năm học<input value={examHeader.schoolYear} onChange={(event) => setExamHeader({ ...examHeader, schoolYear: event.target.value })} /></label><label>Thời gian làm bài (phút)<input type="number" min="5" max="300" value={examHeader.duration} onChange={(event) => setExamHeader({ ...examHeader, duration: Math.max(5, Number(event.target.value)) })} /></label><label>Số trang dự kiến<input type="number" min="1" max="99" value={examHeader.pageCount} onChange={(event) => setExamHeader({ ...examHeader, pageCount: Math.max(1, Number(event.target.value)) })} /></label></div><div className="exam-paper-preview"><div className="paper-heading"><section><b>{examHeader.authority}</b><strong>{examHeader.school}</strong><i>--------------------</i><em>(Đề thi có {String(examHeader.pageCount).padStart(2, "0")} trang)</em></section><section><b>{examHeader.examName}</b><strong>NĂM HỌC {examHeader.schoolYear}</strong><strong>MÔN: {subject.toUpperCase()}</strong><em>Thời gian làm bài: {examHeader.duration} PHÚT<br />(không kể thời gian phát đề)</em></section></div><div className="paper-student-line"><span>Họ và tên: ........................................</span><span>Số báo danh: ........</span><b>Mã đề {firstCode}</b></div><div className="paper-body-sample"><b>I. TRẮC NGHIỆM KHÁCH QUAN</b><span>Câu 1. Nội dung đề được nhập từ Word hoặc AI tạo...</span></div><footer><span>Mã đề {firstCode}</span><span>Trang 1/{examHeader.pageCount}</span></footer></div></section>
      {mode === "manual" ? <div className="assessment-source-panel"><div className="source-panel-head"><div><b>Bước 1 · Tải mẫu Word đúng môn</b><small>Mẫu có sẵn từng dạng câu hỏi và quy ước nhận dạng đáp án.</small></div><button onClick={downloadTemplate}>⇩ Tải {template.file}</button></div><div className="word-answer-rules"><article><span>A</span><div><b>Đáp án đúng</b><small><u>Gạch chân</u> hoặc <em>tô màu đỏ</em> nội dung đáp án</small></div></article><article><span>#</span><div><b>Giữ nguyên vị trí</b><small>Đặt # trước phương án, ví dụ: #D. Cả ba ý trên</small></div></article><article><span>▤</span><div><b>Câu mẫu theo từng phần</b><small>Nhiều lựa chọn · Đúng/Sai · Trả lời ngắn · Tự luận</small></div></article></div><label className="assessment-drop"><input type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setManualFile(e.target.files?.[0] || null)} /><span>W</span><div><b>Bước 2 · Đưa đề Word đã soạn lên</b><small>{manualFile ? `Đã chọn: ${manualFile.name}` : "Chỉ nhận .doc hoặc .docx · tối đa 25 MB"}</small></div><em>{manualFile ? "Đổi file" : "Chọn file"}</em></label><div className="import-checklist"><b>Lưu ý</b><span>✓ Tệp đề được lưu nguyên bản trên kho tệp để in ấn, phát đề</span><span>✓ Muốn học sinh làm trực tuyến và tự chấm: dùng chế độ Tạo tự động bằng AI</span></div></div> : <div className="assessment-source-panel ai-source">
        <label className="ai-content-input">1. Dán ngữ liệu bài học / chủ đề <small>(bắt buộc · AI chỉ hỏi trong phạm vi nội dung này)</small><textarea rows={7} value={aiContent} onChange={(event) => setAiContent(event.target.value)} placeholder="Dán nội dung SGK, đề cương ôn tập, tóm tắt chủ đề..." /></label>
        <label className="ai-content-input">2. Yêu cầu ma trận / mức độ <small>(tùy chọn)</small><textarea rows={3} value={aiMatrixNote} onChange={(event) => setAiMatrixNote(event.target.value)} placeholder="Ví dụ: 40% nhận biết, 30% thông hiểu, 30% vận dụng; ưu tiên chương II..." /></label>
        <div className="question-config-head"><div><b>3. Cấu hình số câu theo từng dạng</b><small>AI phân bổ nội dung theo ngữ liệu và mức độ yêu cầu.</small></div><strong>{totalQuestions} câu</strong></div>
        <div className="question-count-grid">{countLabels.map(([key, label, note]) => <label key={key}><span><b>{label}</b><small>{note}</small></span><input type="number" min="0" max="100" value={counts[key]} onChange={(e) => setCounts({ ...counts, [key]: Math.max(0, Number(e.target.value)) })} /></label>)}</div>
        <button className="ai-generate" disabled={busy} onClick={() => void generateAi()}>{busy ? "AI đang tạo câu hỏi..." : "✦ Tạo câu hỏi bằng AI"}</button>
        {aiQuestions.length > 0 && <div className="ai-question-preview"><b>Đã tạo {aiQuestions.length} câu · duyệt nhanh</b>{aiQuestions.slice(0, 50).map((question, index) => <p key={question.id}><i>{index + 1}</i><span>[{typeNames[question.type]} · {question.level} · {question.points}đ]</span> {question.question}</p>)}</div>}
      </div>}
      <section className="variant-config"><div className="variant-config-head"><div><b>Cấu hình sinh mã đề Word</b><small>Mã đề được đánh liên tục từ mã đầu tiên; mỗi đề kèm đáp án và chân trang riêng.</small></div><strong>{variantCount} đề · {variantCodes[0]}{variantCodes.length > 1 ? `–${variantCodes.at(-1)}` : ""}</strong></div><div className="variant-number-grid"><label>Số đề cần sinh<input type="number" min="1" max="50" value={variantCount} onChange={(event) => setVariantCount(Math.min(50, Math.max(1, Number(event.target.value))))} /></label><label>Mã đề bắt đầu<input type="number" min="1" max="9999" value={firstCode} onChange={(event) => setFirstCode(Math.max(1, Number(event.target.value)))} /></label><div><small>Các mã sẽ tạo</small><p>{variantCodes.slice(0, 12).map((code) => <span key={code}>{code}</span>)}{variantCodes.length > 12 && <i>+{variantCodes.length - 12}</i>}</p></div></div>{mode === "manual" && <div className="variant-mode"><button className={variantMode === "shuffle" ? "active" : ""} onClick={() => setVariantMode("shuffle")}><span>⇄</span><b>Đảo từ đề mẫu</b><small>Giữ nguyên câu hỏi, tạo mã đề bằng cách đổi thứ tự câu và/hoặc phương án.</small></button><button className={variantMode === "similar" ? "active ai" : "ai"} onClick={() => setVariantMode("similar")}><span>✦</span><b>AI sinh đề tương tự</b><small>Chỉ khả dụng với đề tạo bằng AI vì hệ thống chưa đọc được tệp Word.</small></button></div>}<div className="shuffle-options"><label><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} /> Đảo thứ tự câu hỏi trong từng phần</label><label><input type="checkbox" checked={shuffleAnswers} onChange={(event) => setShuffleAnswers(event.target.checked)} /> Đảo vị trí đáp án A/B/C/D</label><span>Mỗi mã đề dùng một thứ tự trộn cố định, tái lập được khi tải lại.</span></div></section>
      <div className="assessment-options"><label><input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} /> Tạo đáp án, hướng dẫn chấm</label></div><button className="assessment-create" disabled={busy} onClick={() => void create()}>{busy ? "Đang xử lý..." : mode === "ai" ? "Lưu đề với ngân hàng câu hỏi" : `Lưu đề Word (${variantCount} mã đề cấu hình sẵn)`}</button>
    </div></div>}
  </section>;
}

function ResultRow({ result, record, onOverride }: { result: AssessmentResult; record: AssessmentRecord; onOverride: (finalTen: number) => void }) {
  const [override, setOverride] = useState("");
  const [expanded, setExpanded] = useState(false);
  const ten = result.total ? Math.round((result.score / result.total) * 100) / 10 : result.score;
  const essays = (record.questions || []).filter((question) => question.type === "essay");
  const overrideValue = Number(override.replace(",", "."));
  const validOverride = override.trim() !== "" && Number.isFinite(overrideValue) && overrideValue >= 0 && overrideValue <= 10;
  return <div className="result-row-wrap">
    <div>
      <b>{result.studentName}</b>
      <span>{result.submittedAt ? new Date(result.submittedAt).toLocaleString("vi-VN") : ""}</span>
      <strong>{ten}/10</strong>
      <em>{result.essayPending ? "Có tự luận chờ chấm" : "Đã chấm"}</em>
      {essays.length > 0 && <button onClick={() => setExpanded(!expanded)}>{expanded ? "Thu gọn" : "Xem bài tự luận"}</button>}
      <label className="score-override">
        <input value={override} onChange={(event) => setOverride(event.target.value)} placeholder="Điểm cuối /10" aria-label={`Điểm cuối của ${result.studentName}`} />
        <button disabled={!validOverride} onClick={() => { onOverride(overrideValue); setOverride(""); }}>Lưu</button>
      </label>
    </div>
    {expanded && <div className="essay-answers">{essays.map((question, index) => <article key={question.id}><b>Câu tự luận {index + 1} · {question.points} điểm</b><p className="essay-question">{question.question}</p><p className="essay-answer">{String((result.answers || {})[question.id] || "Học sinh chưa trả lời")}</p>{question.guide && <small>Hướng dẫn chấm: {question.guide}</small>}</article>)}</div>}
  </div>;
}

function StudentAssessments({ notify, accountKey }: { notify: Notice; accountKey: string }) {
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [taking, setTaking] = useState<AssessmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAssessments((Array.isArray(result.data?.assessments) ? result.data.assessments as AssessmentRecord[] : []).filter((item) => item.status === "Đã xuất bản" && item.questions?.length));
      setResults(Array.isArray(result.data?.assessmentResults) ? result.data.assessmentResults : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tải danh sách đề", "error");
    } finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  if (taking) return <ExamRunner assessment={taking} notify={notify} onExit={() => { setTaking(null); void load(); }} />;

  return <section className="assessment-shell">
    <div className="assessment-hero student"><div><small>PHÒNG LUYỆN TẬP & KIỂM TRA</small><h2>Làm bài đúng cấu trúc, xem kết quả rõ ràng</h2><p>Chỉ đề giáo viên đã xuất bản mới hiển thị. Hệ thống tự chấm phần trắc nghiệm ngay khi nộp.</p></div><span>✓</span></div>
    {loading ? <div className="learning-empty">Đang tải danh sách đề...</div> : assessments.length === 0 ? <div className="learning-empty"><span>✓</span><b>Chưa có đề đã xuất bản</b><p>Đề sẽ xuất hiện khi giáo viên xuất bản bài luyện tập hoặc kiểm tra.</p></div> : <div className="assessment-grid">{assessments.map((item) => {
      const mine = results.find((result) => result.assessmentId === item.id && result.studentKey === accountKey);
      const retakeable = item.kind === "Luyện tập";
      return <article key={item.id}><div><span>{item.kind}</span><i>{mine ? "Đã nộp" : "Chưa làm"}</i></div><small>{item.subject} · {item.questions?.length} câu</small><h3>{item.title}</h3><p>◷ {item.time} phút · Tự chấm trắc nghiệm</p>
        {mine && <p className="my-exam-score">Điểm của em: <b>{mine.total ? Math.round((mine.score / mine.total) * 100) / 10 : mine.score}/10</b>{mine.essayPending ? " · tự luận chờ chấm" : ""}</p>}
        <footer className="assessment-card-actions">{(!mine || retakeable) && <button className="publish" onClick={() => setTaking(item)}>{mine ? "Làm lại" : "Làm bài"}</button>}{mine && !retakeable && <em className="status ok">Đã hoàn thành</em>}</footer>
      </article>;
    })}</div>}
  </section>;
}

function ExamRunner({ assessment, notify, onExit }: { assessment: AssessmentRecord; notify: Notice; onExit: () => void }) {
  const questions = useMemo(() => assessment.questions || [], [assessment]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, assessment.time) * 60);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState<{ score: number; total: number; essayPending: boolean } | null>(null);
  const set = (id: string, value: unknown) => setAnswers((current) => ({ ...current, [id]: value }));
  const answered = questions.filter((question) => {
    const value = answers[question.id];
    if (question.type === "true_false") return Array.isArray(value) && (value as unknown[]).some((entry) => entry !== undefined);
    return value !== undefined && String(value).trim() !== "";
  }).length;

  const submit = useCallback(async (auto = false) => {
    if (finished || submitting) return;
    setSubmitting(true);
    const grade = gradeExam(questions, answers);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit_assessment", result: { assessmentId: assessment.id, answers, score: grade.score, total: grade.total, essayPending: grade.essayPending } }),
      });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || "Máy chủ chưa xác nhận bài làm");
      setFinished(grade);
      notify(auto ? "Hết giờ — bài làm đã được nộp tự động" : "Đã nộp bài và lưu kết quả");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể nộp bài", "error");
    } finally { setSubmitting(false); }
  }, [answers, assessment.id, finished, notify, questions, submitting]);

  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; });
  useEffect(() => {
    if (finished) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          queueMicrotask(() => void submitRef.current(true));
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished]);

  if (finished) {
    const ten = finished.total ? Math.round((finished.score / finished.total) * 100) / 10 : finished.score;
    return <section className="exam-runner"><div className="exam-finished"><span>✓</span><small>ĐÃ NỘP BÀI</small><h2>{assessment.title}</h2><b>{ten}/10 điểm</b><p>{finished.essayPending ? "Phần trắc nghiệm đã chấm tự động; phần tự luận chờ giáo viên chấm." : "Toàn bộ bài đã được chấm tự động và lưu trên Supabase."}</p><button onClick={onExit}>← Về danh sách đề</button></div></section>;
  }
  const minutes = Math.max(0, Math.floor(secondsLeft / 60));
  const seconds = Math.max(0, secondsLeft % 60);
  return <section className="exam-runner">
    <header><button onClick={onExit}>← Thoát</button><div><b>{assessment.title}</b><small>{assessment.subject} · {assessment.kind} · {questions.length} câu</small></div><div className={`exam-timer ${secondsLeft < 300 ? "warning" : ""}`}>◷ {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</div></header>
    <main>
      {questions.map((question, index) => <article className="exam-question" key={question.id}>
        <div className="exam-question-head"><span>Câu {index + 1}</span><small>{typeNames[question.type]} · {question.level} · {question.points} điểm</small></div>
        <p>{question.question}</p>
        {question.type === "choice" && <div className="exam-options">{(question.options || []).map((option, optionIndex) => <button key={option} className={Number(answers[question.id]) === optionIndex && answers[question.id] !== undefined ? "selected" : ""} onClick={() => set(question.id, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>}
        {question.type === "true_false" && <div className="exam-truefalse">{(question.statements || []).map((statement, statementIndex) => { const picks = Array.isArray(answers[question.id]) ? [...(answers[question.id] as unknown[])] : []; return <div key={statement.text}><b>{String.fromCharCode(97 + statementIndex)})</b><span>{statement.text}</span><div><button className={picks[statementIndex] === true ? "selected" : ""} onClick={() => { picks[statementIndex] = true; set(question.id, picks); }}>Đúng</button><button className={picks[statementIndex] === false ? "selected" : ""} onClick={() => { picks[statementIndex] = false; set(question.id, picks); }}>Sai</button></div></div>; })}</div>}
        {question.type === "short" && <input className="exam-short" value={String(answers[question.id] ?? "")} onChange={(event) => set(question.id, event.target.value)} placeholder="Nhập đáp án ngắn..." />}
        {question.type === "essay" && <textarea className="exam-essay" rows={6} value={String(answers[question.id] ?? "")} onChange={(event) => set(question.id, event.target.value)} placeholder="Trình bày bài làm... (giáo viên sẽ chấm phần này)" />}
      </article>)}
    </main>
    <footer><span>Đã trả lời {answered}/{questions.length} câu</span><button className="publish" disabled={submitting} onClick={() => { if (answered < questions.length && !window.confirm("Em còn câu chưa trả lời. Nộp bài ngay?")) return; void submit(); }}>{submitting ? "Đang nộp..." : "Nộp bài"}</button></footer>
  </section>;
}
