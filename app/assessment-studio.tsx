"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectQuestions, extractDocxDocument } from "./docx-import";
import { MatrixBuilder } from "./matrix-builder";
import { downloadAssessmentVariants } from "./assessment-docx";
import { QuestionMediaGallery, RichContent, ScienceFormulaToolbar, type QuestionMedia } from "./assessment-rich-content";

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
  statements?: Array<{ text: string; answer?: boolean }>;
  guide?: string;
  media?: QuestionMedia[];
  points: number;
};
export type AssessmentRecord = {
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
  attempts?: number;
  shuffleOnline?: boolean;
  antiCheat?: boolean;
};

async function imageDimensions(file: File) {
  try { const bitmap = await createImageBitmap(file); const result = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return result; }
  catch { return {}; }
}

async function uploadQuestionMedia(file: File, kind: QuestionMedia["kind"] = "image"): Promise<QuestionMedia> {
  let uploadFile = file;
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url; });
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth || 1200; canvas.height = image.naturalHeight || 800; const context = canvas.getContext("2d"); if (!context) throw new Error("Không thể chuyển hình SVG"); context.drawImage(image, 0, 0);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", .95)); if (!png) throw new Error("Không thể chuyển hình SVG"); uploadFile = new File([png], `${file.name.replace(/\.svg$/i, "")}.png`, { type: "image/png" });
    } finally { URL.revokeObjectURL(url); }
  }
  const form = new FormData(); form.append("file", uploadFile);
  const response = await fetch("/api/assignment-files", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok || !result.file) throw new Error(result.error || `Không thể lưu hình ${file.name}`);
  return { ...result.file, ...await imageDimensions(uploadFile), kind, caption: kind === "chart" ? "Biểu đồ" : kind === "map" ? "Bản đồ" : "" } as QuestionMedia;
}
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
  attemptCount?: number;
  violations?: number;
  violationEvents?: Array<{ type: string; at: string }>;
};

// Số lần làm cho phép: 0 = không giới hạn; mặc định Luyện tập không giới hạn,
// các hình thức khác 1 lần.
export function allowedAttempts(record: { attempts?: number; kind: string }) {
  return record.attempts ?? (record.kind === "Luyện tập" ? 0 : 1);
}

const templates = {
  "Ngữ văn": { time: 90, label: "Tự luận · 10 điểm", file: "Mau-de-Ngu-van.doc", parts: ["Đọc hiểu: 4,0 điểm · ngữ liệu ngoài SGK", "Viết đoạn nghị luận xã hội", "Viết bài nghị luận văn học/xã hội · phần Viết 6,0 điểm"], counts: { choice: 0, trueFalse: 0, short: 0, essay: 5 } },
  "Toán": { time: 90, label: "3 dạng thức", file: "Mau-de-Toan.doc", parts: ["Phần I: Trắc nghiệm nhiều lựa chọn", "Phần II: Đúng/sai, mỗi câu gồm 4 ý", "Phần III: Trả lời ngắn"], counts: { choice: 12, trueFalse: 4, short: 6, essay: 0 } },
  "Vật lý": { time: 50, label: "Công thức · đồ thị · thí nghiệm", file: "Mau-de-Vat-ly.doc", parts: ["Nhiều lựa chọn 4 phương án", "Đúng/sai theo ngữ cảnh", "Trả lời ngắn có tính toán"], counts: { choice: 18, trueFalse: 4, short: 6, essay: 0 } },
  "Hóa học": { time: 50, label: "Phương trình · cấu tạo · thí nghiệm", file: "Mau-de-Hoa-hoc.doc", parts: ["Nhiều lựa chọn 4 phương án", "Đúng/sai theo ngữ cảnh", "Trả lời ngắn có tính toán"], counts: { choice: 18, trueFalse: 4, short: 6, essay: 0 } },
  "Sinh học": { time: 50, label: "Sơ đồ · bảng số liệu · di truyền", file: "Mau-de-Sinh-hoc.doc", parts: ["Nhiều lựa chọn 4 phương án", "Đúng/sai theo ngữ cảnh", "Trả lời ngắn"], counts: { choice: 18, trueFalse: 4, short: 6, essay: 0 } },
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
      const given = normalizeText(String(answer ?? ""));
      const accepted = String(question.answer ?? "").split("|").map(normalizeText).filter(Boolean);
      if (given !== "" && accepted.includes(given)) score += question.points;
    } else if (question.type === "essay") {
      const response = String(answer ?? "").trim();
      if (!response) continue;
      const key = String(question.answer ?? "").trim();
      if (!key) { essayPending = true; continue; }
      // Tự chấm theo ý: mỗi dòng đáp án là một ý; ý được tính khi phần lớn
      // từ khóa của ý xuất hiện trong bài làm của học sinh.
      const responseNormalized = normalizeText(response);
      const ideas = key.split("\n").map(normalizeText).filter(Boolean);
      const matched = ideas.filter((idea) => {
        if (responseNormalized.includes(idea)) return true;
        const words = idea.split(" ").filter((word) => word.length > 2);
        if (!words.length) return false;
        const hits = words.filter((word) => responseNormalized.includes(word)).length;
        return hits / words.length >= 0.6;
      }).length;
      if (ideas.length) score += question.points * (matched / ideas.length);
    }
  }
  return { score: Math.round(score * 100) / 100, total: Math.round(total * 100) / 100, essayPending };
}

const typeNames: Record<ExamQuestion["type"], string> = { choice: "Trắc nghiệm", true_false: "Đúng/Sai", short: "Trả lời ngắn", essay: "Tự luận" };

async function downloadVariants(record: AssessmentRecord, notify: Notice) {
  if (!record.questions?.length) return notify("Đề này chưa có ngân hàng câu hỏi để sinh mã đề", "error");
  const count = Math.min(50, Math.max(1, record.variantCount || 1));
  const first = record.firstCode || 101;
  try {
    await downloadAssessmentVariants(record, (message) => notify(message));
    notify(`Đã tạo ${count} tệp DOCX mã đề ${first}${count > 1 ? `–${first + count - 1}` : ""}, giữ công thức và hình ảnh`);
  } catch (error) { notify(error instanceof Error ? error.message : "Không thể tạo tệp Word", "error"); }
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
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [subject, setSubject] = useState<Subject>("Toán");
  const [kind, setKind] = useState<TestKind>("Thường xuyên");
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [importedQuestions, setImportedQuestions] = useState<ExamQuestion[] | null>(null);
  const [importNote, setImportNote] = useState("");
  const [attempts, setAttempts] = useState<number | null>(null);
  const [shuffleOnline, setShuffleOnline] = useState(true);
  const [antiCheat, setAntiCheat] = useState(true);
  const [typePoints, setTypePoints] = useState({ choice: 0.25, trueFalse: 1, short: 0.5, essay: 1 });
  const [aiContent, setAiContent] = useState("");
  const [aiMatrixNote, setAiMatrixNote] = useState("");
  const [aiQuestions, setAiQuestions] = useState<ExamQuestion[]>([]);
  const [counts, setCounts] = useState(templates.Toán.counts);
  const [examHeader, setExamHeader] = useState<ExamHeader>({ authority: "SỞ GD&ĐT TÂY NINH", school: "TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH", examName: "KIỂM TRA HỌC KỲ 1", schoolYear: "2025 - 2026", duration: 90, pageCount: 2 });
  const [variantCount, setVariantCount] = useState(4);
  const [firstCode, setFirstCode] = useState(101);
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
    setImportedQuestions(null);
    setImportNote("");
    setAiQuestions([]);
  };
  // Đọc và nhận diện câu hỏi ngay khi giáo viên chọn tệp Word.
  const importWord = async (file: File | null) => {
    setManualFile(file);
    setImportedQuestions(null);
    setImportNote("");
    if (!file) return;
    setBusy(true);
    try {
      const extracted = await extractDocxDocument(file);
      const uploadedEntries = await Promise.all(extracted.media.map(async (item) => [item.marker, { ...await uploadQuestionMedia(item.file, item.kind), width: item.width, height: item.height }] as const));
      const detected = detectQuestions(extracted.lines, Object.fromEntries(uploadedEntries));
      if (!detected.questions.length) {
        setImportNote("Không nhận diện được câu hỏi nào (cần bắt đầu mỗi câu bằng 'Câu 1.', 'Câu 2.'...). Đề vẫn được lưu dưới dạng tệp để in ấn.");
        return;
      }
      setImportedQuestions(detected.questions);
      setImportNote(`Đã nhận diện ${detected.questions.length} câu hỏi, ${detected.answered} câu có đáp án, ${extracted.equationCount} công thức và ${uploadedEntries.length} hình/bản đồ/biểu đồ. Hãy duyệt lại bên dưới.`);
      notify(`Đã nhận diện ${detected.questions.length} câu hỏi từ tệp Word`);
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : "Không đọc được tệp Word; đề vẫn được lưu dưới dạng tệp.");
    } finally { setBusy(false); }
  };
  // Ngân hàng câu hỏi đang biên tập (AI hoặc nhận diện từ Word) để áp điểm.
  const activeBank = mode === "ai" ? aiQuestions : importedQuestions || [];
  const setActiveBank = (questions: ExamQuestion[]) => {
    if (mode === "ai") setAiQuestions(questions);
    else setImportedQuestions(questions);
  };
  const bankTotal = Math.round(activeBank.reduce((sum, question) => sum + question.points, 0) * 100) / 100;
  const typeKeyOf = (type: ExamQuestion["type"]) => (type === "true_false" ? "trueFalse" : type) as keyof typeof typePoints;
  const applyTypePoints = () => {
    setActiveBank(activeBank.map((question) => ({ ...question, points: typePoints[typeKeyOf(question.type)] })));
    notify("Đã áp dụng điểm theo dạng cho tất cả câu hỏi");
  };
  const normalizeToTen = () => {
    if (!bankTotal) return notify("Chưa có câu hỏi để chia điểm", "error");
    const scale = 10 / bankTotal;
    const scaled = activeBank.map((question) => ({ ...question, points: Math.max(0.05, Math.round(question.points * scale * 100) / 100) }));
    // Dồn phần lệch do làm tròn vào câu cuối để tổng đúng bằng 10.
    const drift = Math.round((10 - scaled.reduce((sum, question) => sum + question.points, 0)) * 100) / 100;
    if (scaled.length && Math.abs(drift) >= 0.01) scaled[scaled.length - 1] = { ...scaled[scaled.length - 1], points: Math.max(0.05, Math.round((scaled[scaled.length - 1].points + drift) * 100) / 100) };
    setActiveBank(scaled);
    notify("Đã chuẩn hóa tổng điểm toàn đề về thang 10");
  };
  const incompleteCount = (questions: ExamQuestion[]) =>
    questions.filter((question) =>
      question.type === "choice" ? question.answer === undefined || !question.options?.length :
      question.type === "true_false" ? !(question.statements || []).length || (question.statements || []).some((statement) => statement.answer === undefined) :
      question.type === "short" ? !String(question.answer || "").trim() : false,
    ).length;
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
    const onlineConfig = {
      ...(attempts !== null ? { attempts } : {}),
      shuffleOnline,
      antiCheat,
    };
    if (mode === "ai") {
      if (!aiQuestions.length) return notify("Hãy bấm 'Tạo câu hỏi bằng AI' và duyệt câu hỏi trước khi lưu đề", "error");
      const record: AssessmentRecord = {
        id: String(Date.now()), title: title.trim(), subject, kind, time: examHeader.duration, status: "Bản nháp",
        questions: aiQuestions, header: examHeader, variantCount, firstCode, variantMode: "shuffle",
        shuffleQuestions, shuffleAnswers, includeAnswerKey, createdAt: new Date().toISOString(), ...onlineConfig,
      };
      const ok = await mutateWorkspace(
        (data) => ({ ...data, assessments: [record, ...(Array.isArray(data.assessments) ? data.assessments as AssessmentRecord[] : [])] }),
        "Đã lưu đề với ngân hàng câu hỏi thật. Bấm Xuất bản để giao cho học sinh.",
      );
      if (ok) { setCreating(false); setAiQuestions([]); setTitle(""); }
      return;
    }
    if (!manualFile) return notify("Vui lòng tải tệp đề Word (.docx)", "error");
    if (importedQuestions?.length) {
      const incomplete = incompleteCount(importedQuestions);
      if (incomplete > 0) return notify(`Còn ${incomplete} câu chưa chọn/điền đáp án. Hãy hoàn tất trong phần duyệt câu hỏi bên dưới.`, "error");
    }
    if (!shuffleQuestions && !shuffleAnswers && variantCount > 1) return notify("Hãy chọn đảo câu hỏi hoặc đảo đáp án để tạo nhiều mã đề", "error");
    setBusy(true);
    try {
      const upload = new FormData(); upload.append("file", manualFile);
      const uploadResponse = await fetch("/api/assignment-files", { method: "POST", body: upload });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.file) throw new Error(uploadResult.error || "Không thể lưu tệp đề Word");
      const record: AssessmentRecord = {
        id: String(Date.now()), title: title.trim(), subject, kind, time: examHeader.duration, status: "Bản nháp",
        sourceFile: uploadResult.file, header: examHeader, variantCount, firstCode, variantMode: "shuffle",
        shuffleQuestions, shuffleAnswers, includeAnswerKey, createdAt: new Date().toISOString(), ...onlineConfig,
        ...(importedQuestions?.length ? { questions: importedQuestions } : {}),
      };
      const ok = await mutateWorkspace(
        (data) => ({ ...data, assessments: [record, ...(Array.isArray(data.assessments) ? data.assessments as AssessmentRecord[] : [])] }),
        importedQuestions?.length
          ? "Đã lưu đề Word với ngân hàng câu hỏi. Bấm Xuất bản để học sinh làm trực tuyến."
          : "Đã lưu tệp đề Word (chưa nhận diện được câu hỏi nên chỉ dùng để in ấn).",
      );
      if (ok) { setCreating(false); setTitle(""); setManualFile(null); setImportedQuestions(null); setImportNote(""); }
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

  if (matrixOpen) return <MatrixBuilder notify={notify} onExit={() => setMatrixOpen(false)} />;

  return <section className="assessment-shell">
    <div className="assessment-hero"><div><small>ASSESSMENT STUDIO</small><h2>Tạo đề từ Word hoặc tự động bằng AI</h2><p>Giữ công thức Toán–Lý–Hóa–Sinh, hình ảnh, bản đồ và biểu đồ khi xuất DOCX hoặc giao học sinh làm trực tuyến.</p><div className="assessment-hero-actions"><button onClick={() => setCreating(true)}>＋ Tạo bài mới</button><button className="matrix-open" onClick={() => setMatrixOpen(true)}>▦ Ma trận & đặc tả 7991</button></div></div><div className="assessment-hero-stats"><b>08<small>Nhóm môn học</small></b><b>04<small>Dạng câu hỏi</small></b><b>∑<small>Công thức & hình</small></b></div></div>
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
            <button onClick={() => void downloadVariants(item, notify)}>⇩ {item.variantCount || 1} mã đề DOCX</button>
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
      {mode === "manual" ? <div className="assessment-source-panel"><div className="source-panel-head"><div><b>Đưa đề Word lên — không bắt buộc theo mẫu</b><small>Hệ thống tự nhận diện Câu 1., Câu 2..., phương án A/B/C/D, ý a/b/c/d, ĐÁP ÁN: ... Đáp án <u>gạch chân</u>/<em>tô đỏ</em> được bắt tự động.</small></div><button onClick={downloadTemplate}>⇩ Mẫu tham khảo {template.file}</button></div><label className="assessment-drop"><input type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void importWord(e.target.files?.[0] || null)} /><span>W</span><div><b>Chọn tệp đề Word (.docx)</b><small>{manualFile ? `Đã chọn: ${manualFile.name}` : "Ưu tiên .docx để nhận diện câu hỏi · tối đa 25 MB"}</small></div><em>{manualFile ? "Đổi file" : "Chọn file"}</em></label>
        {importNote && <div className="import-note">{importNote}</div>}
        {importedQuestions && <QuestionBankEditor questions={importedQuestions} onChange={setImportedQuestions} notify={notify} />}
        <div className="import-checklist"><b>Lưu ý</b><span>✓ Tệp đề luôn được lưu nguyên bản trên kho tệp để in ấn, phát đề</span><span>✓ Khi đã duyệt đủ đáp án, đề có thể Xuất bản cho học sinh làm trực tuyến và tự chấm</span></div></div> : <div className="assessment-source-panel ai-source">
        <label className="ai-content-input">1. Dán ngữ liệu bài học / chủ đề <small>(bắt buộc · AI chỉ hỏi trong phạm vi nội dung này)</small><textarea rows={7} value={aiContent} onChange={(event) => setAiContent(event.target.value)} placeholder="Dán nội dung SGK, đề cương ôn tập, tóm tắt chủ đề..." /></label>
        <label className="ai-content-input">2. Yêu cầu ma trận / mức độ <small>(tùy chọn)</small><textarea rows={3} value={aiMatrixNote} onChange={(event) => setAiMatrixNote(event.target.value)} placeholder="Ví dụ: 40% nhận biết, 30% thông hiểu, 30% vận dụng; ưu tiên chương II..." /></label>
        <div className="question-config-head"><div><b>3. Cấu hình số câu theo từng dạng</b><small>AI phân bổ nội dung theo ngữ liệu và mức độ yêu cầu.</small></div><strong>{totalQuestions} câu</strong></div>
        <div className="question-count-grid">{countLabels.map(([key, label, note]) => <label key={key}><span><b>{label}</b><small>{note}</small></span><input type="number" min="0" max="100" value={counts[key]} onChange={(e) => setCounts({ ...counts, [key]: Math.max(0, Number(e.target.value)) })} /></label>)}</div>
        <button className="ai-generate" disabled={busy} onClick={() => void generateAi()}>{busy ? "AI đang tạo câu hỏi..." : "✦ Tạo câu hỏi bằng AI"}</button>
        {aiQuestions.length > 0 && <QuestionBankEditor questions={aiQuestions} onChange={setAiQuestions} notify={notify} />}
      </div>}
      {activeBank.length > 0 && <section className="type-points-config">
        <div className="online-config-head"><div><b>Cấu hình điểm theo dạng câu hỏi</b><small>Điểm mỗi câu áp cho từng dạng · tổng toàn đề hiện tại: <strong>{bankTotal} điểm</strong></small></div></div>
        <div className="type-points-grid">
          {countLabels.map(([key, label]) => {
            const count = activeBank.filter((question) => typeKeyOf(question.type) === key).length;
            return <label key={key}><b>{label}</b><input type="number" min="0.05" step="0.05" value={typePoints[key]} onChange={(event) => setTypePoints({ ...typePoints, [key]: Math.max(0.05, Number(event.target.value) || 0.05) })} /><small>điểm/câu · {count} câu</small></label>;
          })}
        </div>
        <div className="type-points-actions">
          <button onClick={applyTypePoints}>Áp dụng cho tất cả câu</button>
          <button onClick={normalizeToTen}>Chuẩn hóa tổng về thang 10</button>
          <small>Sau khi áp dụng vẫn có thể tinh chỉnh điểm từng câu trong phần duyệt câu hỏi.</small>
        </div>
      </section>}
      <section className="online-config"><div className="online-config-head"><div><b>Cấu hình làm bài trực tuyến</b><small>Áp dụng khi đề được Xuất bản cho học sinh · thời gian làm dùng ô &quot;Thời gian làm bài&quot; phía trên ({examHeader.duration} phút)</small></div></div>
        <div className="online-config-grid">
          <label>Số lần được làm<select value={attempts === null ? "default" : String(attempts)} onChange={(e) => setAttempts(e.target.value === "default" ? null : Number(e.target.value))}><option value="default">Mặc định ({kind === "Luyện tập" ? "không giới hạn" : "1 lần"})</option><option value="1">1 lần</option><option value="2">2 lần</option><option value="3">3 lần</option><option value="5">5 lần</option><option value="0">Không giới hạn</option></select></label>
          <label className="check"><input type="checkbox" checked={shuffleOnline} onChange={(e) => setShuffleOnline(e.target.checked)} /> Tự tạo mã đề riêng từng học sinh: xáo câu hỏi và đáp án trong phạm vi từng dạng (trắc nghiệm, đúng/sai, trả lời ngắn); câu tự luận giữ nguyên</label>
          <label className="check"><input type="checkbox" checked={antiCheat} onChange={(e) => setAntiCheat(e.target.checked)} /> Chống gian lận: bắt buộc toàn màn hình khi làm, chặn sao chép/dán, ghi nhận số lần thoát/rời màn hình cho giáo viên</label>
        </div>
      </section>
      <section className="variant-config"><div className="variant-config-head"><div><b>Cấu hình sinh mã đề Word</b><small>Mã đề được đánh liên tục từ mã đầu tiên; mỗi đề kèm đáp án và chân trang riêng.</small></div><strong>{variantCount} đề · {variantCodes[0]}{variantCodes.length > 1 ? `–${variantCodes.at(-1)}` : ""}</strong></div><div className="variant-number-grid"><label>Số đề cần sinh<input type="number" min="1" max="50" value={variantCount} onChange={(event) => setVariantCount(Math.min(50, Math.max(1, Number(event.target.value))))} /></label><label>Mã đề bắt đầu<input type="number" min="1" max="9999" value={firstCode} onChange={(event) => setFirstCode(Math.max(1, Number(event.target.value)))} /></label><div><small>Các mã sẽ tạo</small><p>{variantCodes.slice(0, 12).map((code) => <span key={code}>{code}</span>)}{variantCodes.length > 12 && <i>+{variantCodes.length - 12}</i>}</p></div></div><div className="shuffle-options"><label><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} /> Đảo thứ tự câu hỏi trong từng phần</label><label><input type="checkbox" checked={shuffleAnswers} onChange={(event) => setShuffleAnswers(event.target.checked)} /> Đảo vị trí đáp án A/B/C/D</label><span>Mỗi mã đề dùng một thứ tự trộn cố định, tái lập được khi tải lại.</span></div></section>
      <div className="assessment-options"><label><input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} /> Tạo đáp án, hướng dẫn chấm</label></div><button className="assessment-create" disabled={busy} onClick={() => void create()}>{busy ? "Đang xử lý..." : mode === "ai" ? "Lưu đề với ngân hàng câu hỏi" : `Lưu đề Word (${variantCount} mã đề cấu hình sẵn)`}</button>
    </div></div>}
  </section>;
}

// Trình duyệt và biên tập ngân hàng câu hỏi (từ tệp Word nhận diện hoặc AI).
function QuestionBankEditor({ questions, onChange, notify }: { questions: ExamQuestion[]; onChange: (questions: ExamQuestion[]) => void; notify: Notice }) {
  const update = (id: string, changes: Partial<ExamQuestion>) => onChange(questions.map((question) => question.id === id ? { ...question, ...changes } : question));
  const remove = (id: string) => onChange(questions.filter((question) => question.id !== id));
  const changeType = (question: ExamQuestion, type: ExamQuestion["type"]) => {
    if (type === question.type) return;
    const base: Partial<ExamQuestion> = { type, answer: undefined, statements: undefined, options: undefined };
    if (type === "choice") base.options = question.options?.length ? question.options : ["", "", "", ""];
    if (type === "true_false") base.statements = question.statements?.length ? question.statements : [{ text: "" }, { text: "" }, { text: "" }, { text: "" }];
    if (type === "short" || type === "essay") base.answer = "";
    update(question.id, base);
  };
  const addQuestion = (type: ExamQuestion["type"]) =>
    onChange([...questions, {
      id: `q-${Date.now().toString(36)}-${questions.length + 1}`, type, level: "Thông hiểu", question: "",
      points: type === "true_false" ? 1 : type === "essay" ? 1 : type === "short" ? 0.5 : 0.25,
      ...(type === "choice" ? { options: ["", "", "", ""] } : {}),
      ...(type === "true_false" ? { statements: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }] } : {}),
      ...(type === "short" || type === "essay" ? { answer: "" } : {}),
    } as ExamQuestion]);
  const totalPoints = Math.round(questions.reduce((sum, question) => sum + question.points, 0) * 100) / 100;
  return <div className="question-bank-editor">
    <div className="qbe-head"><b>Duyệt câu hỏi và chọn đáp án</b><span>{questions.length} câu · tổng {totalPoints} điểm</span></div>
    {questions.map((question, index) => <article key={question.id}>
      <header>
        <span>Câu {index + 1}</span>
        <select value={question.type} onChange={(event) => changeType(question, event.target.value as ExamQuestion["type"])} aria-label="Dạng câu hỏi">
          <option value="choice">Trắc nghiệm</option><option value="true_false">Đúng/Sai</option><option value="short">Trả lời ngắn</option><option value="essay">Tự luận</option>
        </select>
        <select value={question.level} onChange={(event) => update(question.id, { level: event.target.value })} aria-label="Mức độ">
          <option>Nhận biết</option><option>Thông hiểu</option><option>Vận dụng</option>
        </select>
        <label>Điểm<input type="number" min="0.1" step="0.25" value={question.points} onChange={(event) => update(question.id, { points: Math.max(0.1, Number(event.target.value) || 0.25) })} /></label>
        <button className="qbe-remove" onClick={() => remove(question.id)} aria-label={`Xóa câu ${index + 1}`}>×</button>
      </header>
      <textarea rows={3} value={question.question} onChange={(event) => update(question.id, { question: event.target.value })} placeholder="Nội dung câu hỏi... Có thể dùng công thức dạng \(x^2\)" />
      <div className="qbe-rich-preview"><small>XEM TRƯỚC</small><RichContent value={question.question || "Nội dung câu hỏi và công thức sẽ hiển thị tại đây"} /></div>
      <details className="qbe-formula-details"><summary>∑ Chèn ký hiệu/công thức Toán · Lý · Hóa · Sinh</summary><ScienceFormulaToolbar onInsert={(value) => update(question.id, { question: `${question.question}${question.question ? " " : ""}${value}` })} /></details>
      <QuestionMediaEditor question={question} onChange={(media) => update(question.id, { media })} notify={notify} />
      {question.type === "choice" && <div className="qbe-options">
        {(question.options || []).map((option, optionIndex) => <div key={optionIndex}>
          <button className={question.answer === optionIndex ? "correct" : ""} onClick={() => update(question.id, { answer: optionIndex })} title="Chọn làm đáp án đúng">{String.fromCharCode(65 + optionIndex)}</button>
          <input value={option} onChange={(event) => update(question.id, { options: (question.options || []).map((item, i) => i === optionIndex ? event.target.value : item) })} placeholder={`Phương án ${String.fromCharCode(65 + optionIndex)}`} />
          <button className="qbe-remove" onClick={() => update(question.id, { options: (question.options || []).filter((_, i) => i !== optionIndex), answer: question.answer === optionIndex ? undefined : typeof question.answer === "number" && question.answer > optionIndex ? question.answer - 1 : question.answer })} aria-label="Xóa phương án">×</button>
        </div>)}
        <div className="qbe-row-actions"><button onClick={() => update(question.id, { options: [...(question.options || []), ""] })}>＋ Thêm phương án</button><small>{question.answer === undefined ? "⚠ Bấm vào chữ cái để chọn đáp án đúng" : `Đáp án: ${String.fromCharCode(65 + Number(question.answer))}`}</small></div>
      </div>}
      {question.type === "true_false" && <div className="qbe-statements">
        {(question.statements || []).map((statement, statementIndex) => <div key={statementIndex}>
          <b>{String.fromCharCode(97 + statementIndex)})</b>
          <input value={statement.text} onChange={(event) => update(question.id, { statements: (question.statements || []).map((item, i) => i === statementIndex ? { ...item, text: event.target.value } : item) })} placeholder="Nội dung nhận định..." />
          <button className={statement.answer === true ? "selected" : ""} onClick={() => update(question.id, { statements: (question.statements || []).map((item, i) => i === statementIndex ? { ...item, answer: true } : item) })}>Đúng</button>
          <button className={statement.answer === false ? "selected" : ""} onClick={() => update(question.id, { statements: (question.statements || []).map((item, i) => i === statementIndex ? { ...item, answer: false } : item) })}>Sai</button>
        </div>)}
        {(question.statements || []).some((statement) => statement.answer === undefined) && <small className="qbe-warning">⚠ Chọn Đúng/Sai cho từng ý</small>}
      </div>}
      {question.type === "short" && <label className="qbe-answer">Đáp án đúng <small>(nhiều đáp án chấp nhận cách nhau bằng dấu |)</small><input value={String(question.answer ?? "")} onChange={(event) => update(question.id, { answer: event.target.value })} placeholder="Ví dụ: 42 | bốn mươi hai" /></label>}
      {question.type === "essay" && <label className="qbe-answer">Đáp án theo ý <small>(mỗi ý một dòng — hệ thống tự chấm theo ý khi làm trực tuyến; để trống nếu muốn giáo viên chấm tay)</small><textarea rows={3} value={String(question.answer ?? "")} onChange={(event) => update(question.id, { answer: event.target.value })} placeholder={"Ý 1: ...\nÝ 2: ..."} /></label>}
    </article>)}
    <div className="qbe-add"><b>Thêm câu mới:</b><button onClick={() => addQuestion("choice")}>＋ Trắc nghiệm</button><button onClick={() => addQuestion("true_false")}>＋ Đúng/Sai</button><button onClick={() => addQuestion("short")}>＋ Trả lời ngắn</button><button onClick={() => addQuestion("essay")}>＋ Tự luận</button></div>
  </div>;
}

function QuestionMediaEditor({ question, onChange, notify }: { question: ExamQuestion; onChange: (media: QuestionMedia[]) => void; notify: Notice }) {
  const [kind, setKind] = useState<QuestionMedia["kind"]>("image");
  const [uploading, setUploading] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if ((question.media?.length || 0) + files.length > 6) return notify("Mỗi câu tối đa 6 hình/bản đồ/biểu đồ", "error");
    setUploading(true);
    try {
      const next = await Promise.all(Array.from(files).map((file) => uploadQuestionMedia(file, kind)));
      onChange([...(question.media || []), ...next]);
      notify(`Đã lưu ${next.length} hình vào câu hỏi`);
    } catch (error) { notify(error instanceof Error ? error.message : "Không thể tải hình", "error"); }
    finally { setUploading(false); }
  };
  const remove = async (item: QuestionMedia) => {
    onChange((question.media || []).filter((media) => media.id !== item.id));
    if (item.id) await fetch(`/api/assignment-files?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }).catch(() => undefined);
  };
  return <div className="qbe-media-editor">
    <div className="qbe-media-actions">
      <select value={kind} onChange={(event) => setKind(event.target.value as QuestionMedia["kind"])} aria-label="Loại hình minh họa"><option value="image">Hình ảnh</option><option value="map">Bản đồ</option><option value="chart">Biểu đồ/đồ thị</option><option value="diagram">Sơ đồ/hình vẽ</option></select>
      <label className={uploading ? "disabled" : ""}>{uploading ? "Đang lưu hình..." : "＋ Tải hình vào câu"}<input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple onChange={(event) => void upload(event.target.files)} /></label>
      <small>Ảnh được lưu thật, đi cùng câu hỏi khi xuất bản và xuất DOCX.</small>
    </div>
    {(question.media || []).length > 0 && <div className="qbe-media-list">{(question.media || []).map((item, index) => <article key={item.id}>
      <img src={item.url} alt={item.alt || item.caption || item.name} />
      <div><b>{item.kind === "map" ? "Bản đồ" : item.kind === "chart" ? "Biểu đồ" : item.kind === "diagram" ? "Sơ đồ" : "Hình ảnh"} {index + 1}</b><input value={item.caption || ""} onChange={(event) => onChange((question.media || []).map((media) => media.id === item.id ? { ...media, caption: event.target.value, alt: event.target.value } : media))} placeholder="Chú thích hình..." /></div>
      <button type="button" onClick={() => void remove(item)} aria-label={`Xóa ${item.name}`}>×</button>
    </article>)}</div>}
  </div>;
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
      <em>{result.essayPending ? "Có tự luận chờ chấm" : "Đã chấm"}{result.attemptCount ? ` · lần làm thứ ${result.attemptCount}` : ""}</em>
      {(result.violations || 0) > 0 && <i className="violation-badge" title={(result.violationEvents || []).map((event) => `${event.type} · ${new Date(event.at).toLocaleTimeString("vi-VN")}`).join("\n")}>⚠ {result.violations} lần rời màn hình</i>}
      {essays.length > 0 && <button onClick={() => setExpanded(!expanded)}>{expanded ? "Thu gọn" : "Xem bài tự luận"}</button>}
      <label className="score-override">
        <input value={override} onChange={(event) => setOverride(event.target.value)} placeholder="Điểm cuối /10" aria-label={`Điểm cuối của ${result.studentName}`} />
        <button disabled={!validOverride} onClick={() => { onOverride(overrideValue); setOverride(""); }}>Lưu</button>
      </label>
    </div>
    {expanded && <div className="essay-answers">{essays.map((question, index) => <article key={question.id}><b>Câu tự luận {index + 1} · {question.points} điểm</b><p className="essay-question"><RichContent value={question.question} /></p><QuestionMediaGallery media={question.media} /><p className="essay-answer">{String((result.answers || {})[question.id] || "Học sinh chưa trả lời")}</p>{question.guide && <small>Hướng dẫn chấm: {question.guide}</small>}</article>)}</div>}
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

  if (taking) {
    const mine = results.find((result) => result.assessmentId === taking.id && result.studentKey === accountKey);
    return <ExamRunner assessment={taking} notify={notify} accountKey={accountKey} attempt={(mine?.attemptCount || (mine ? 1 : 0)) + 1} onExit={() => { setTaking(null); void load(); }} />;
  }

  return <section className="assessment-shell">
    <div className="assessment-hero student"><div><small>PHÒNG LUYỆN TẬP & KIỂM TRA</small><h2>Làm bài đúng cấu trúc, xem kết quả rõ ràng</h2><p>Chỉ đề giáo viên đã xuất bản mới hiển thị. Hệ thống tự chấm phần trắc nghiệm ngay khi nộp.</p></div><span>✓</span></div>
    {loading ? <div className="learning-empty">Đang tải danh sách đề...</div> : assessments.length === 0 ? <div className="learning-empty"><span>✓</span><b>Chưa có đề đã xuất bản</b><p>Đề sẽ xuất hiện khi giáo viên xuất bản bài luyện tập hoặc kiểm tra.</p></div> : <div className="assessment-grid">{assessments.map((item) => {
      const mine = results.find((result) => result.assessmentId === item.id && result.studentKey === accountKey);
      const limit = allowedAttempts(item);
      const used = mine?.attemptCount || (mine ? 1 : 0);
      const canTake = !mine || limit === 0 || used < limit;
      return <article key={item.id}><div><span>{item.kind}</span><i>{mine ? "Đã nộp" : "Chưa làm"}</i></div><small>{item.subject} · {item.questions?.length} câu</small><h3>{item.title}</h3><p>◷ {item.time} phút · {limit === 0 ? "Không giới hạn lần làm" : `Đã làm ${used}/${limit} lần`}{item.antiCheat ? " · 🔒 Giám sát" : ""}</p>
        {mine && <p className="my-exam-score">Điểm của em: <b>{mine.total ? Math.round((mine.score / mine.total) * 100) / 10 : mine.score}/10</b>{mine.essayPending ? " · tự luận chờ chấm" : ""}</p>}
        <footer className="assessment-card-actions">{canTake ? <button className="publish" onClick={() => setTaking(item)}>{mine ? "Làm lại" : "Làm bài"}</button> : <em className="status ok">Đã hết lượt làm</em>}</footer>
      </article>;
    })}</div>}
  </section>;
}

function ExamRunner({ assessment, notify, accountKey, attempt, onExit }: { assessment: AssessmentRecord; notify: Notice; accountKey: string; attempt: number; onExit: () => void }) {
  // Hạt giống theo học sinh + lần làm: mỗi em nhận một mã đề xáo riêng.
  const seed = useMemo(() => {
    let hash = 0;
    for (const character of `${assessment.id}:${accountKey}:${attempt}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return hash || 1;
  }, [assessment.id, accountKey, attempt]);
  const questions = useMemo(() => {
    const base = assessment.questions || [];
    if (!assessment.shuffleOnline) return base;
    const types: ExamQuestion["type"][] = ["choice", "true_false", "short", "essay"];
    return types.flatMap((type, index) => seededShuffle(base.filter((question) => question.type === type), seed + index));
  }, [assessment, seed]);
  const optionOrder = useMemo(() => {
    const map: Record<string, number[]> = {};
    questions.forEach((question, index) => {
      if (question.type !== "choice") return;
      const indices = (question.options || []).map((_, i) => i);
      map[question.id] = assessment.shuffleOnline ? seededShuffle(indices, seed * 7 + index) : indices;
    });
    return map;
  }, [questions, assessment.shuffleOnline, seed]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, assessment.time) * 60);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState<{ score: number; total: number; essayPending: boolean } | null>(null);
  const [started, setStarted] = useState(!assessment.antiCheat);
  const [violations, setViolations] = useState<Array<{ type: string; at: string }>>([]);
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const set = (id: string, value: unknown) => setAnswers((current) => ({ ...current, [id]: value }));
  const answered = questions.filter((question) => {
    const value = answers[question.id];
    if (question.type === "true_false") return Array.isArray(value) && (value as unknown[]).some((entry) => entry !== undefined);
    return value !== undefined && String(value).trim() !== "";
  }).length;
  const enterFullscreen = () => document.documentElement.requestFullscreen?.().catch(() => undefined);
  const start = () => { setStarted(true); void enterFullscreen(); };
  const blockClipboard = (event: React.ClipboardEvent | React.MouseEvent) => {
    if (!assessment.antiCheat || finished || !started) return;
    event.preventDefault();
    setViolations((current) => current.length >= 100 ? current : [...current, { type: "Cố sao chép/dán nội dung", at: new Date().toISOString() }]);
    notify("Bài kiểm tra không cho phép sao chép hay dán nội dung", "error");
  };

  const submit = useCallback(async (auto = false) => {
    if (finished || submitting) return;
    setSubmitting(true);
    const grade = gradeExam(questions, answers);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit_assessment", result: { assessmentId: assessment.id, answers, score: grade.score, total: grade.total, essayPending: grade.essayPending, violations: violations.length, violationEvents: violations.slice(0, 50) } }),
      });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || "Máy chủ chưa xác nhận bài làm");
      setFinished(grade);
      void document.exitFullscreen?.().catch(() => undefined);
      notify(auto ? "Hết giờ — bài làm đã được nộp tự động" : "Đã nộp bài và lưu kết quả");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể nộp bài", "error");
    } finally { setSubmitting(false); }
  }, [answers, assessment.id, finished, notify, questions, submitting, violations]);

  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; });
  useEffect(() => {
    if (finished || !started) return;
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
  }, [finished, started]);
  // Giám sát chống gian lận: ghi nhận chuyển tab, rời cửa sổ, thoát toàn màn hình.
  useEffect(() => {
    if (!assessment.antiCheat || !started || finished) return;
    const log = (type: string) => setViolations((current) => current.length >= 100 ? current : [...current, { type, at: new Date().toISOString() }]);
    const onVisibility = () => { if (document.hidden) log("Chuyển tab hoặc thu nhỏ trình duyệt"); };
    const onBlur = () => log("Rời khỏi cửa sổ làm bài");
    const onFullscreen = () => {
      if (!document.fullscreenElement) { setFullscreenLost(true); log("Thoát chế độ toàn màn hình"); }
      else setFullscreenLost(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [assessment.antiCheat, started, finished]);

  if (finished) {
    const ten = finished.total ? Math.round((finished.score / finished.total) * 100) / 10 : finished.score;
    return <section className="exam-runner"><div className="exam-finished"><span>✓</span><small>ĐÃ NỘP BÀI</small><h2>{assessment.title}</h2><b>{ten}/10 điểm</b><p>{finished.essayPending ? "Phần trắc nghiệm đã chấm tự động; phần tự luận chờ giáo viên chấm." : "Toàn bộ bài đã được chấm tự động và lưu trên Supabase."}{violations.length > 0 ? ` Hệ thống đã ghi nhận ${violations.length} lần rời màn hình trong khi làm.` : ""}</p><button onClick={onExit}>← Về danh sách đề</button></div></section>;
  }
  if (!started) {
    return <section className="exam-runner"><div className="exam-start-gate"><span>🔒</span><small>BÀI KIỂM TRA CÓ GIÁM SÁT</small><h2>{assessment.title}</h2><p>{assessment.subject} · {questions.length} câu · {assessment.time} phút</p>
      <ul>
        <li>Bài làm mở ở chế độ <b>toàn màn hình</b>; thoát toàn màn hình, chuyển tab hoặc thu nhỏ trình duyệt đều được ghi nhận và báo cho giáo viên.</li>
        <li><b>Không thể sao chép hay dán</b> nội dung trong lúc làm bài.</li>
        <li>Hết giờ hệ thống <b>tự động nộp bài</b>; mỗi em nhận một mã đề xáo câu hỏi riêng.</li>
      </ul>
      <button className="publish" onClick={start}>Bắt đầu làm bài (toàn màn hình) →</button>
      <button onClick={onExit}>← Quay lại</button>
    </div></section>;
  }
  const minutes = Math.max(0, Math.floor(secondsLeft / 60));
  const seconds = Math.max(0, secondsLeft % 60);
  return <section className={`exam-runner ${assessment.antiCheat ? "guarded" : ""}`} onCopy={blockClipboard} onCut={blockClipboard} onPaste={blockClipboard} onContextMenu={blockClipboard}>
    <header><button onClick={onExit}>← Thoát</button><div><b>{assessment.title}</b><small>{assessment.subject} · {assessment.kind} · {questions.length} câu{assessment.shuffleOnline ? " · Mã đề riêng của em" : ""}</small></div>{assessment.antiCheat && violations.length > 0 && <span className="violation-live">⚠ {violations.length}</span>}<div className={`exam-timer ${secondsLeft < 300 ? "warning" : ""}`}>◷ {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</div></header>
    <main>
      {questions.map((question, index) => <article className="exam-question" key={question.id}>
        <div className="exam-question-head"><span>Câu {index + 1}</span><small>{typeNames[question.type]} · {question.level} · {question.points} điểm</small></div>
        <p><RichContent value={question.question} /></p>
        <QuestionMediaGallery media={question.media} />
        {question.type === "choice" && <div className="exam-options">{(optionOrder[question.id] || []).map((originalIndex, position) => <button key={originalIndex} className={Number(answers[question.id]) === originalIndex && answers[question.id] !== undefined ? "selected" : ""} onClick={() => set(question.id, originalIndex)}><span>{String.fromCharCode(65 + position)}</span><RichContent value={question.options?.[originalIndex] || ""} /></button>)}</div>}
        {question.type === "true_false" && <div className="exam-truefalse">{(question.statements || []).map((statement, statementIndex) => { const picks = Array.isArray(answers[question.id]) ? [...(answers[question.id] as unknown[])] : []; return <div key={statement.text || statementIndex}><b>{String.fromCharCode(97 + statementIndex)})</b><span><RichContent value={statement.text} /></span><div><button className={picks[statementIndex] === true ? "selected" : ""} onClick={() => { picks[statementIndex] = true; set(question.id, picks); }}>Đúng</button><button className={picks[statementIndex] === false ? "selected" : ""} onClick={() => { picks[statementIndex] = false; set(question.id, picks); }}>Sai</button></div></div>; })}</div>}
        {question.type === "short" && <input className="exam-short" value={String(answers[question.id] ?? "")} onChange={(event) => set(question.id, event.target.value)} placeholder="Nhập đáp án ngắn..." />}
        {question.type === "essay" && <textarea className="exam-essay" rows={6} value={String(answers[question.id] ?? "")} onChange={(event) => set(question.id, event.target.value)} placeholder="Trình bày bài làm..." />}
      </article>)}
    </main>
    <footer><span>Đã trả lời {answered}/{questions.length} câu</span><button className="publish" disabled={submitting} onClick={() => { if (answered < questions.length && !window.confirm("Em còn câu chưa trả lời. Nộp bài ngay?")) return; void submit(); }}>{submitting ? "Đang nộp..." : "Nộp bài"}</button></footer>
    {assessment.antiCheat && fullscreenLost && <div className="fullscreen-gate"><div><span>⚠</span><b>Em đã thoát chế độ toàn màn hình</b><small>Lần rời màn hình này đã được ghi nhận và báo cho giáo viên. Hãy quay lại toàn màn hình để tiếp tục làm bài.</small><button onClick={() => { setFullscreenLost(false); void enterFullscreen(); }}>Quay lại toàn màn hình →</button></div></div>}
  </section>;
}
