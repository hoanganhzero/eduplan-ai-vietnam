// Sinh tệp Word "Ma trận đề kiểm tra định kì" và "Bản đặc tả đề kiểm tra
// định kì" đúng cấu trúc Phụ lục Công văn 7991/BGDĐT-GDTrH ngày 17/12/2024:
// 12 cột mức độ (Nhiều lựa chọn / "Đúng - Sai" / Trả lời ngắn / Tự luận, mỗi
// dạng chia Biết - Hiểu - Vận dụng), cột Tổng, Tỉ lệ % điểm và các hàng
// Tổng số câu / Tổng số điểm / Tỉ lệ %.

export type MatrixContent = {
  id: string;
  name: string;
  know: string;
  understand: string;
  apply: string;
  counts: number[]; // 12 số câu: NLC B,H,V · Đ-S B,H,V · TLN B,H,V · TL B,H,V
};
export type MatrixTopic = { id: string; name: string; contents: MatrixContent[] };
export type MatrixDoc = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  schoolYear: string;
  duration: number;
  school: string;
  perQuestion: { nlc: number; ds: number; tln: number; tl: number };
  topics: MatrixTopic[];
  createdAt?: string;
};

export const FORM_LABELS = ["Nhiều lựa chọn", "“Đúng - Sai”", "Trả lời ngắn", "Tự luận"] as const;
export const LEVEL_LABELS = ["Biết", "Hiểu", "Vận dụng"] as const;
export const FORM_KEYS = ["nlc", "ds", "tln", "tl"] as const;

export function blankContent(): MatrixContent {
  return { id: `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: "", know: "", understand: "", apply: "", counts: Array(12).fill(0) };
}
export function blankTopic(index: number): MatrixTopic {
  return { id: `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: `Chủ đề ${index}`, contents: [blankContent()] };
}
export function blankMatrix(): MatrixDoc {
  return {
    id: String(Date.now()),
    title: "KIỂM TRA GIỮA HỌC KỲ I",
    subject: "Toán",
    grade: "10",
    schoolYear: "2025 - 2026",
    duration: 90,
    school: "TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH",
    perQuestion: { nlc: 0.25, ds: 1, tln: 0.5, tl: 1.5 },
    topics: [blankTopic(1)],
  };
}

const perQ = (doc: MatrixDoc, column: number) => [doc.perQuestion.nlc, doc.perQuestion.ds, doc.perQuestion.tln, doc.perQuestion.tl][Math.floor(column / 3)];
const round1 = (value: number) => Math.round(value * 100) / 100;
const vn = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

export function matrixStats(doc: MatrixDoc) {
  const columnCounts = Array(12).fill(0) as number[];
  for (const topic of doc.topics) for (const content of topic.contents) content.counts.forEach((count, index) => { columnCounts[index] += Number(count) || 0; });
  const formCounts = [0, 1, 2, 3].map((form) => columnCounts.slice(form * 3, form * 3 + 3).reduce((sum, value) => sum + value, 0));
  const formPoints = formCounts.map((count, form) => round1(count * [doc.perQuestion.nlc, doc.perQuestion.ds, doc.perQuestion.tln, doc.perQuestion.tl][form]));
  const levelCounts = [0, 1, 2].map((level) => [0, 1, 2, 3].reduce((sum, form) => sum + columnCounts[form * 3 + level], 0));
  const levelPoints = [0, 1, 2].map((level) => round1([0, 1, 2, 3].reduce((sum, form) => sum + columnCounts[form * 3 + level] * [doc.perQuestion.nlc, doc.perQuestion.ds, doc.perQuestion.tln, doc.perQuestion.tl][form], 0)));
  const totalQuestions = formCounts.reduce((sum, value) => sum + value, 0);
  const totalPoints = round1(formPoints.reduce((sum, value) => sum + value, 0));
  return { columnCounts, formCounts, formPoints, levelCounts, levelPoints, totalQuestions, totalPoints };
}
export function contentPoints(doc: MatrixDoc, content: MatrixContent) {
  return round1(content.counts.reduce((sum, count, index) => sum + (Number(count) || 0) * perQ(doc, index), 0));
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}
const cell = (value: string | number, attrs = "") => `<td ${attrs}>${value === 0 || value === "" ? "" : esc(String(value))}</td>`;
const th = (value: string, attrs = "") => `<td class="h" ${attrs}>${esc(value)}</td>`;

// Bốn hàng tiêu đề dùng chung cho cả hai bảng (phần 12 cột mức độ).
function levelHeader(leadColumns: string[], withTotal: boolean) {
  const lead = (row: number) => (row === 0 ? leadColumns.map((label) => th(label, 'rowspan="4"')).join("") : "");
  return `
  <tr>${lead(0)}${th(withTotal ? "Mức độ đánh giá" : "Số câu hỏi ở các mức độ đánh giá", 'colspan="12"')}${withTotal ? `${th("Tổng", 'colspan="3" rowspan="3"')}${th("Tỉ lệ % điểm", 'rowspan="4"')}` : ""}</tr>
  <tr>${th("TNKQ", 'colspan="9"')}${th("Tự luận", 'colspan="3" rowspan="2"')}</tr>
  <tr>${th("Nhiều lựa chọn", 'colspan="3"')}${th("“Đúng - Sai”", 'colspan="3"')}${th("Trả lời ngắn", 'colspan="3"')}</tr>
  <tr>${Array.from({ length: withTotal ? 5 : 4 }, () => LEVEL_LABELS.map((label) => th(label)).join("")).join("")}</tr>`;
}

// 1. Bảng ma trận đề kiểm tra định kì.
function matrixTable(doc: MatrixDoc) {
  const stats = matrixStats(doc);
  let body = "";
  doc.topics.forEach((topic, topicIndex) => {
    const rows = Math.max(1, topic.contents.length);
    topic.contents.forEach((content, contentIndex) => {
      const levelRow = [0, 1, 2].map((level) => [0, 1, 2, 3].reduce((sum, form) => sum + (Number(content.counts[form * 3 + level]) || 0), 0));
      const points = contentPoints(doc, content);
      body += `<tr>${contentIndex === 0 ? th(String(topicIndex + 1), `rowspan="${rows}"`) + `<td class="topic" rowspan="${rows}">${esc(topic.name)}</td>` : ""}
        <td class="content">${esc(content.name)}</td>
        ${content.counts.map((count) => cell(Number(count) || 0, 'class="n"')).join("")}
        ${levelRow.map((count) => cell(count, 'class="n"')).join("")}
        ${cell(doc.topics.length && points ? `${vn((points / 10) * 100)}%` : "", 'class="n"')}
      </tr>`;
    });
  });
  return `<table class="mx" border="1" cellspacing="0">
  ${levelHeader(["TT", "Chủ đề/Chương", "Nội dung/đơn vị kiến thức"], true)}
  ${body}
  <tr>${th("Tổng số câu", 'colspan="3"')}${stats.columnCounts.map((count) => cell(count, 'class="n"')).join("")}${stats.levelCounts.map((count) => cell(count, 'class="n"')).join("")}${cell("")}</tr>
  <tr>${th("Tổng số điểm", 'colspan="3"')}${stats.formPoints.map((points) => cell(vn(points), 'colspan="3" class="n"')).join("")}${stats.levelPoints.map((points) => cell(vn(points), 'class="n"')).join("")}${cell(vn(stats.totalPoints), 'class="n"')}</tr>
  <tr>${th("Tỉ lệ %", 'colspan="3"')}${stats.formPoints.map((points) => cell(stats.totalPoints ? vn((points / stats.totalPoints) * 100) : "", 'colspan="3" class="n"')).join("")}${stats.levelPoints.map((points) => cell(stats.totalPoints ? vn((points / stats.totalPoints) * 100) : "", 'class="n"')).join("")}${cell("100", 'class="n"')}</tr>
  </table>`;
}

// 2. Bảng bản đặc tả đề kiểm tra định kì.
function specificationTable(doc: MatrixDoc) {
  const stats = matrixStats(doc);
  let body = "";
  doc.topics.forEach((topic, topicIndex) => {
    const topicRows = Math.max(1, topic.contents.length) * 3;
    topic.contents.forEach((content, contentIndex) => {
      const requirements = [
        { prefix: "- Biết:", text: content.know, level: 0 },
        { prefix: "- Hiểu:", text: content.understand, level: 1 },
        { prefix: "- Vận dụng:", text: content.apply, level: 2 },
      ];
      requirements.forEach((requirement, requirementIndex) => {
        body += `<tr>
          ${contentIndex === 0 && requirementIndex === 0 ? th(String(topicIndex + 1), `rowspan="${topicRows}"`) + `<td class="topic" rowspan="${topicRows}">${esc(topic.name)}</td>` : ""}
          ${requirementIndex === 0 ? `<td class="content" rowspan="3">${esc(content.name)}</td>` : ""}
          <td class="req">${esc(requirement.prefix)} ${esc(requirement.text || "…")}</td>
          ${Array.from({ length: 12 }, (_, column) => cell(column % 3 === requirement.level ? Number(content.counts[column]) || 0 : "", 'class="n"')).join("")}
        </tr>`;
      });
    });
  });
  return `<table class="mx" border="1" cellspacing="0">
  ${levelHeader(["TT", "Chủ đề/Chương", "Nội dung/đơn vị kiến thức", "Yêu cầu cần đạt"], false)}
  ${body}
  <tr>${th("Tổng số câu", 'colspan="3"')}${cell("")}${stats.columnCounts.map((count) => cell(count, 'class="n"')).join("")}</tr>
  <tr>${th("Tổng số điểm", 'colspan="3"')}${cell("")}${stats.formPoints.map((points) => cell(vn(points), 'colspan="3" class="n"')).join("")}</tr>
  <tr>${th("Tỉ lệ %", 'colspan="3"')}${cell("")}${stats.formPoints.map((points) => cell(stats.totalPoints ? vn((points / stats.totalPoints) * 100) : "", 'colspan="3" class="n"')).join("")}</tr>
  </table>`;
}

export function buildMatrixWord(doc: MatrixDoc) {
  const subtitle = `MÔN: ${doc.subject.toUpperCase()} - LỚP ${doc.grade} · ${doc.title} · NĂM HỌC ${doc.schoolYear} · Thời gian làm bài: ${doc.duration} phút`;
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>
  @page Section1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:1.2cm 1.2cm 1.2cm 1.2cm}
  div.Section1{page:Section1}
  body{font-family:"Times New Roman",serif;font-size:11pt;color:#111;line-height:1.25}
  h1{text-align:center;font-size:13pt;margin:4px 0}
  .sub{text-align:center;font-style:italic;margin:0 0 12px}
  .org{text-align:center;font-weight:bold;margin:0}
  table.mx{border-collapse:collapse;width:100%;table-layout:fixed}
  table.mx td{border:1pt solid #111;padding:3px 4px;vertical-align:middle;font-size:10pt;word-wrap:break-word}
  table.mx td.h{text-align:center;font-weight:bold;background:#f2f2f2}
  table.mx td.n{text-align:center}
  table.mx td.topic{font-weight:bold}
  table.mx td.req{font-size:10pt}
  ol.notes{font-size:9.5pt;font-style:italic;margin:10px 0 0;padding-left:18px}
  ol.notes li{margin:2px 0}
  .pb{page-break-before:always}
  </style></head><body><div class="Section1">
  <p class="org">${esc(doc.school)}</p>
  <h1>1. MA TRẬN ĐỀ KIỂM TRA ĐỊNH KÌ</h1>
  <p class="sub">${esc(subtitle)}</p>
  ${matrixTable(doc)}
  <ol class="notes">
    <li>Mỗi câu hỏi dạng “Đúng - Sai” bao gồm 4 ý nhỏ, mỗi ý học sinh phải chọn đúng hoặc sai.</li>
    <li>Đối với môn học không sử dụng dạng “Trả lời ngắn” thì chuyển toàn bộ số điểm cho dạng “Đúng - Sai”.</li>
    <li>Số trong các ô của ma trận thể hiện số câu hỏi cho từng dạng theo từng mức độ đánh giá.</li>
    <li>Số điểm và tỉ lệ % được tính theo cấu hình điểm mỗi câu: Nhiều lựa chọn ${vn(doc.perQuestion.nlc)} điểm/câu; “Đúng - Sai” ${vn(doc.perQuestion.ds)} điểm/câu; Trả lời ngắn ${vn(doc.perQuestion.tln)} điểm/câu; Tự luận ${vn(doc.perQuestion.tl)} điểm/câu.</li>
  </ol>
  <h1 class="pb">2. BẢN ĐẶC TẢ ĐỀ KIỂM TRA ĐỊNH KÌ</h1>
  <p class="sub">${esc(subtitle)}</p>
  ${specificationTable(doc)}
  <ol class="notes">
    <li>Cột “Yêu cầu cần đạt” ghi theo quy định trong chương trình môn học/hoạt động giáo dục; có thể ghi kèm tên viết tắt của năng lực trong ngoặc đơn, ví dụ: (n) (NL…).</li>
  </ol>
  </div></body></html>`;
}
