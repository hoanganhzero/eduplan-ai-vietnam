"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "teacher" | "student";
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

export function AssessmentStudio({ role, notify }: { role: Role; notify: (message: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState<Subject>("Toán");
  const [kind, setKind] = useState<TestKind>("Thường xuyên");
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [counts, setCounts] = useState(templates.Toán.counts);
  const [examHeader, setExamHeader] = useState<ExamHeader>({ authority: "SỞ GD&ĐT TÂY NINH", school: "TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH", examName: "KIỂM TRA HỌC KỲ 1", schoolYear: "2025 - 2026", duration: 90, pageCount: 2 });
  const [variantCount, setVariantCount] = useState(4);
  const [firstCode, setFirstCode] = useState(101);
  const [variantMode, setVariantMode] = useState<VariantMode>("shuffle");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleAnswers, setShuffleAnswers] = useState(true);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const template = templates[subject];
  const totalQuestions = useMemo(() => Object.values(counts).reduce((sum, value) => sum + value, 0), [counts]);
  const variantCodes = useMemo(() => Array.from({ length: variantCount }, (_, index) => firstCode + index), [variantCount, firstCode]);
  const [assessments, setAssessments] = useState<Array<{ id: string; title: string; subject: string; kind: string; time: number; status: string; questions: number; sourceFile?: unknown }>>([]);
  useEffect(() => { fetch("/api/workspace").then((response) => response.json()).then((result) => setAssessments(Array.isArray(result.data?.assessments) ? result.data.assessments : [])).catch(() => setAssessments([])); }, []);

  const changeSubject = (next: Subject) => {
    setSubject(next);
    setCounts({ ...templates[next].counts });
    setExamHeader((current) => ({ ...current, duration: templates[next].time }));
    setManualFile(null);
  };
  const downloadTemplate = () => {
    const blob = new Blob(["\ufeff", buildWordTemplate(subject, kind, examHeader, firstCode)], { type: "application/msword;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = template.file; link.click(); URL.revokeObjectURL(link.href);
    notify(`Đã tải mẫu Word môn ${subject}`);
  };
  const create = async () => {
    if (!title.trim()) return notify("Vui lòng nhập tên bài kiểm tra");
    if (mode === "manual" && !manualFile) return notify("Vui lòng tải đề Word theo đúng mẫu môn học");
    if (mode === "ai" && sourceFiles.length === 0) return notify("Vui lòng tải ít nhất một tài liệu bài học hoặc chủ đề");
    if (mode === "ai" && !matrixFile) return notify("Vui lòng tải ma trận đề thi để AI bám đúng yêu cầu");
    if (mode === "ai" && totalQuestions === 0) return notify("Số lượng câu hỏi phải lớn hơn 0");
    if (variantCount < 1 || variantCount > 50) return notify("Số mã đề phải từ 1 đến 50");
    if (!shuffleQuestions && !shuffleAnswers && variantMode === "shuffle" && variantCount > 1) return notify("Hãy chọn đảo câu hỏi hoặc đảo đáp án để tạo nhiều mã đề");
    if (mode === "ai" || variantMode === "similar") return notify("Tạo đề AI từ tệp chỉ được bật khi hệ thống đọc được nội dung thật; hiện không tạo dữ liệu mô phỏng.");
    setBusy(true);
    try {
      const upload = new FormData(); upload.append("file", manualFile as File);
      const uploadResponse = await fetch("/api/assignment-files", { method: "POST", body: upload });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.file) throw new Error(uploadResult.error || "Không thể lưu tệp đề Word");
      const workspaceResponse = await fetch("/api/workspace");
      const workspace = await workspaceResponse.json();
      if (!workspaceResponse.ok) throw new Error(workspace.error || "Không thể tải kho đề");
      const record = { id: String(Date.now()), title: title.trim(), subject, kind, time: examHeader.duration, status: "Bản nháp", questions: totalQuestions, sourceFile: uploadResult.file, variantCount, firstCode, variantMode, shuffleQuestions, shuffleAnswers, includeAnswerKey };
      const next = { ...(workspace.data || {}), assessments: [record, ...(Array.isArray(workspace.data?.assessments) ? workspace.data.assessments : [])] };
      const saveResponse = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: next }) });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.saved) throw new Error(saved.error || "Không thể lưu đề");
      setAssessments(saved.data?.assessments || next.assessments);
      setCreating(false);
      notify("Đã tải và lưu đề Word thật trên Supabase dưới dạng bản nháp");
    } catch (error) { notify(error instanceof Error ? error.message : "Không thể lưu đề"); }
    finally { setBusy(false); }
  };

  if (role === "student") return <section className="assessment-shell"><div className="assessment-hero student"><div><small>PHÒNG LUYỆN TẬP & KIỂM TRA</small><h2>Làm bài đúng cấu trúc, xem kết quả rõ ràng</h2><p>Chỉ đề đã xuất bản thật mới hiển thị cho học sinh.</p></div><span>✓</span></div><div className="learning-empty"><span>✓</span><b>Chưa có đề đã xuất bản</b><p>Giáo viên cần duyệt cấu trúc câu hỏi trước khi giao.</p></div></section>;

  return <section className="assessment-shell">
    <div className="assessment-hero"><div><small>ASSESSMENT STUDIO</small><h2>Tạo đề từ mẫu Word hoặc tự động bằng AI</h2><p>Chọn đúng mẫu từng môn, nhập đề có sẵn hoặc để AI tạo theo tài liệu SGK và ma trận giáo viên cung cấp.</p><button onClick={() => setCreating(true)}>＋ Tạo bài mới</button></div><div className="assessment-hero-stats"><b>05<small>Mẫu môn học</small></b><b>04<small>Dạng câu hỏi</small></b><b>AI<small>Bám ma trận đề</small></b></div></div>
    <div className="assessment-type-row">{(["Luyện tập", "Thường xuyên", "Giữa học kỳ", "Học kỳ"] as TestKind[]).map((item, index) => <article key={item}><span>{["✦", "✓", "◷", "▣"][index]}</span><div><b>{item}</b><small>{index === 0 ? "Không giới hạn lần làm" : index === 1 ? "Đánh giá quá trình" : index === 2 ? "Theo ma trận giữa kỳ" : "Tổng kết học kỳ"}</small></div></article>)}</div>
    <div className="assessment-head"><div><b>Kho đề của tôi</b><small>Quản lý bản nháp, lịch mở đề và kết quả</small></div><button onClick={() => setCreating(true)}>＋ Tạo đề</button></div>
    <div className="assessment-grid">{assessments.map((item) => <article key={item.id}><div><span>{item.kind}</span><i>{item.status}</i></div><small>{item.subject} · {item.questions} câu/phần</small><h3>{item.title}</h3><p>◷ {item.time} phút · Đã lưu tệp nguồn</p></article>)}{assessments.length === 0 && <div className="learning-empty"><span>▤</span><b>Kho đề đang trống</b><p>Chưa có đề nào được lưu trên Supabase.</p></div>}</div>
    {creating && <div className="assessment-modal" role="dialog" aria-modal="true"><div className="assessment-builder"><button className="assessment-close" onClick={() => setCreating(false)}>×</button><small>TẠO BÀI LUYỆN TẬP / KIỂM TRA</small><h2>Thiết lập đề theo môn học</h2>
      <div className="assessment-form"><label className="wide">Tên bài<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Kiểm tra giữa học kỳ I" /></label><label>Hình thức<select value={kind} onChange={(event) => { const next = event.target.value as TestKind; setKind(next); setExamHeader((current) => ({ ...current, examName: next === "Học kỳ" ? "KIỂM TRA HỌC KỲ 1" : next === "Giữa học kỳ" ? "KIỂM TRA GIỮA HỌC KỲ 1" : next === "Thường xuyên" ? "KIỂM TRA THƯỜNG XUYÊN" : "BÀI LUYỆN TẬP" })); }}>{["Luyện tập", "Thường xuyên", "Giữa học kỳ", "Học kỳ"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Môn / nhóm môn<select value={subject} onChange={(event) => changeSubject(event.target.value as Subject)}>{Object.keys(templates).map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="creation-mode"><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><span>W</span><b>Nhập đề từ Word</b><small>Tải mẫu đúng môn rồi đưa đề lên</small></button><button className={mode === "ai" ? "active ai" : "ai"} onClick={() => setMode("ai")}><span>✦</span><b>Tạo tự động bằng AI</b><small>Tài liệu SGK + ma trận + số câu</small></button></div>
      <div className="template-preview"><div><b>{subject}</b><span>{template.time} phút · {template.label}</span></div>{template.parts.map((part, index) => <p key={part}><i>{index + 1}</i>{part}</p>)}</div>
      <section className="exam-layout-config"><div className="exam-layout-head"><div><b>Tiêu đề và chân trang theo mẫu Word</b><small>Đã nhận dạng bố cục từ tệp Mã đề 101. Giáo viên có thể sửa từng nội dung trước khi sinh đề.</small></div><button onClick={downloadTemplate}>⇩ Tải mẫu có tiêu đề</button></div><div className="exam-layout-grid"><label>Sở / đơn vị quản lý<input value={examHeader.authority} onChange={(event) => setExamHeader({ ...examHeader, authority: event.target.value })} /></label><label>Tên trường / trung tâm<input value={examHeader.school} onChange={(event) => setExamHeader({ ...examHeader, school: event.target.value })} /></label><label>Tên kỳ kiểm tra<input value={examHeader.examName} onChange={(event) => setExamHeader({ ...examHeader, examName: event.target.value })} /></label><label>Năm học<input value={examHeader.schoolYear} onChange={(event) => setExamHeader({ ...examHeader, schoolYear: event.target.value })} /></label><label>Thời gian làm bài (phút)<input type="number" min="5" max="300" value={examHeader.duration} onChange={(event) => setExamHeader({ ...examHeader, duration: Math.max(5, Number(event.target.value)) })} /></label><label>Số trang dự kiến<input type="number" min="1" max="99" value={examHeader.pageCount} onChange={(event) => setExamHeader({ ...examHeader, pageCount: Math.max(1, Number(event.target.value)) })} /></label></div><div className="exam-paper-preview"><div className="paper-heading"><section><b>{examHeader.authority}</b><strong>{examHeader.school}</strong><i>--------------------</i><em>(Đề thi có {String(examHeader.pageCount).padStart(2, "0")} trang)</em></section><section><b>{examHeader.examName}</b><strong>NĂM HỌC {examHeader.schoolYear}</strong><strong>MÔN: {subject.toUpperCase()}</strong><em>Thời gian làm bài: {examHeader.duration} PHÚT<br />(không kể thời gian phát đề)</em></section></div><div className="paper-student-line"><span>Họ và tên: ........................................</span><span>Số báo danh: ........</span><b>Mã đề {firstCode}</b></div><div className="paper-body-sample"><b>I. TRẮC NGHIỆM KHÁCH QUAN</b><span>Câu 1. Nội dung đề được nhập từ Word hoặc AI tạo...</span></div><footer><span>Mã đề {firstCode}</span><span>Trang 1/{examHeader.pageCount}</span></footer></div></section>
      {mode === "manual" ? <div className="assessment-source-panel"><div className="source-panel-head"><div><b>Bước 1 · Tải mẫu Word đúng môn</b><small>Mẫu có sẵn từng dạng câu hỏi và quy ước nhận dạng đáp án.</small></div><button onClick={downloadTemplate}>⇩ Tải {template.file}</button></div><div className="word-answer-rules"><article><span>A</span><div><b>Đáp án đúng</b><small><u>Gạch chân</u> hoặc <em>tô màu đỏ</em> nội dung đáp án</small></div></article><article><span>#</span><div><b>Giữ nguyên vị trí</b><small>Đặt # trước phương án, ví dụ: #D. Cả ba ý trên</small></div></article><article><span>▤</span><div><b>Câu mẫu theo từng phần</b><small>Nhiều lựa chọn · Đúng/Sai · Trả lời ngắn · Tự luận</small></div></article></div><label className="assessment-drop"><input type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setManualFile(e.target.files?.[0] || null)} /><span>W</span><div><b>Bước 2 · Đưa đề Word đã soạn lên</b><small>{manualFile ? `Đã chọn: ${manualFile.name}` : "Chỉ nhận .doc hoặc .docx · tối đa 25 MB"}</small></div><em>{manualFile ? "Đổi file" : "Chọn file"}</em></label><div className="import-checklist"><b>Hệ thống sẽ kiểm tra trước khi nhập</b><span>✓ Nhận dạng chữ đỏ hoặc gạch chân là đáp án đúng</span><span>✓ Giữ vị trí phương án có dấu #</span><span>✓ Cảnh báo câu sai cấu trúc để giáo viên sửa</span></div></div> : <div className="assessment-source-panel ai-source"><div className="ai-input-grid"><label className="assessment-drop compact"><input type="file" multiple accept=".doc,.docx,.pdf,.ppt,.pptx" onChange={(e) => setSourceFiles(Array.from(e.target.files || []))} /><span>☷</span><div><b>1. Tài liệu bài học / chủ đề</b><small>{sourceFiles.length ? `${sourceFiles.length} tài liệu đã chọn` : "Word, PDF, PowerPoint theo SGK hiện hành"}</small></div><em>Chọn file</em></label><label className="assessment-drop compact"><input type="file" accept=".doc,.docx,.xlsx,.xls,.pdf" onChange={(e) => setMatrixFile(e.target.files?.[0] || null)} /><span>▦</span><div><b>2. Ma trận đề kiểm tra</b><small>{matrixFile ? matrixFile.name : "Word, Excel hoặc PDF"}</small></div><em>Chọn file</em></label></div><div className="question-config-head"><div><b>3. Cấu hình số câu theo từng dạng</b><small>AI phân bổ nội dung theo tài liệu và mức độ trong ma trận.</small></div><strong>{totalQuestions} câu</strong></div><div className="question-count-grid">{countLabels.map(([key, label, note]) => <label key={key}><span><b>{label}</b><small>{note}</small></span><input type="number" min="0" max="100" value={counts[key]} onChange={(e) => setCounts({ ...counts, [key]: Math.max(0, Number(e.target.value)) })} /></label>)}</div><div className="ai-rule"><b>AI sẽ thực hiện</b><span>Phân tích ngữ liệu → đối chiếu ma trận → tạo câu hỏi → tạo đáp án, lời giải và hướng dẫn chấm → để giáo viên duyệt trước khi giao.</span></div></div>}
      <section className="variant-config"><div className="variant-config-head"><div><b>Cấu hình sinh mã đề</b><small>Mã đề được đánh liên tục từ mã đầu tiên; mỗi đề luôn có đáp án và chân trang riêng.</small></div><strong>{variantCount} đề · {variantCodes[0]}{variantCodes.length > 1 ? `–${variantCodes.at(-1)}` : ""}</strong></div><div className="variant-number-grid"><label>Số đề cần sinh<input type="number" min="1" max="50" value={variantCount} onChange={(event) => setVariantCount(Math.min(50, Math.max(1, Number(event.target.value))))} /></label><label>Mã đề bắt đầu<input type="number" min="1" max="9999" value={firstCode} onChange={(event) => setFirstCode(Math.max(1, Number(event.target.value)))} /></label><div><small>Các mã sẽ tạo</small><p>{variantCodes.slice(0, 12).map((code) => <span key={code}>{code}</span>)}{variantCodes.length > 12 && <i>+{variantCodes.length - 12}</i>}</p></div></div><div className="variant-mode"><button className={variantMode === "shuffle" ? "active" : ""} onClick={() => setVariantMode("shuffle")}><span>⇄</span><b>Đảo từ đề mẫu</b><small>Giữ nguyên câu hỏi, tạo mã đề bằng cách đổi thứ tự câu và/hoặc phương án.</small></button><button className={variantMode === "similar" ? "active ai" : "ai"} onClick={() => setVariantMode("similar")}><span>✦</span><b>AI sinh đề tương tự</b><small>Tạo câu hỏi và đáp án mới nhưng giữ cấu trúc, chủ đề, mức độ và thang điểm.</small></button></div>{variantMode === "shuffle" ? <div className="shuffle-options"><label><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} /> Đảo thứ tự câu hỏi trong từng phần</label><label><input type="checkbox" checked={shuffleAnswers} onChange={(event) => setShuffleAnswers(event.target.checked)} /> Đảo vị trí đáp án A/B/C/D</label><span>Phương án có dấu <b>#</b> luôn giữ nguyên vị trí.</span></div> : <div className="similar-rule"><span>✦</span><p><b>Nguyên tắc sinh tương tự</b><small>Không sao chép nguyên văn; giữ đúng số câu từng phần, mức độ nhận thức, phạm vi kiến thức, điểm số và kiểu đáp án của đề mẫu. Giáo viên duyệt trước khi giao.</small></p></div>}</section>
      <div className="assessment-options"><label><input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} /> Tạo đáp án, hướng dẫn chấm</label><label><input type="checkbox" defaultChecked={kind === "Luyện tập"} /> Hiện giải thích sau khi nộp</label><label><input type="checkbox" defaultChecked /> Xuất mỗi mã đề thành tệp riêng</label></div><button className="assessment-create" disabled={busy} onClick={() => void create()}>{busy ? "Đang phân tích và sinh các mã đề..." : variantMode === "similar" ? `✦ AI sinh ${variantCount} đề tương tự` : `⇄ Tạo ${variantCount} mã đề từ đề mẫu`}</button>
    </div></div>}
  </section>;
}
