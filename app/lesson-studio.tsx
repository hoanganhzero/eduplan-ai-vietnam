"use client";

import { useState } from "react";

type Notice = (message: string, tone?: "success" | "error") => void;
export type LessonBundle = {
  objectives: string[];
  competencies: string[];
  materials: string[];
  activities: Array<{ name: string; goal: string; content: string; execution: string; product: string }>;
  worksheets: Array<{ title: string; tasks: string[] }>;
  questions: Array<{ level: string; question: string; answer: string }>;
};
type SavedPlan = Record<string, unknown>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
const list = (items: string[]) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

function buildLessonWord(meta: { subject: string; grade: string; topic: string; periods: number }, bundle: LessonBundle) {
  return `<!doctype html><html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>
    body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.35;color:#111}
    h1{text-align:center;font-size:15pt;margin:6px 0}h2{font-size:13.5pt;border-bottom:1px solid #666;padding-bottom:3px;margin-top:18px}
    h3{font-size:13pt;margin:12px 0 4px}.meta{text-align:center;font-style:italic}
    .step{background:#f2f6fb;padding:6px 8px;margin:4px 0}
    .answer{color:#c00000;font-weight:bold}
    li{margin:3px 0}
  </style></head><body>
  <p style="text-align:center"><b>TRUNG TÂM GDNN-GDTX KHU VỰC TÂN NINH</b></p>
  <h1>KẾ HOẠCH BÀI DẠY (CÔNG VĂN 5512)</h1>
  <h1>${escapeHtml(meta.topic.toUpperCase())}</h1>
  <p class="meta">Môn: ${escapeHtml(meta.subject)} · Lớp ${escapeHtml(meta.grade)} · Thời lượng: ${meta.periods} tiết</p>
  <h2>I. MỤC TIÊU</h2>
  <h3>1. Kiến thức</h3><ul>${list(bundle.objectives)}</ul>
  <h3>2. Năng lực và phẩm chất</h3><ul>${list(bundle.competencies)}</ul>
  <h2>II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU</h2><ul>${list(bundle.materials)}</ul>
  <h2>III. TIẾN TRÌNH DẠY HỌC</h2>
  ${bundle.activities.map((activity) => `
    <h3>${escapeHtml(activity.name)}</h3>
    <p><b>a) Mục tiêu:</b> ${escapeHtml(activity.goal)}</p>
    <p><b>b) Nội dung:</b> ${escapeHtml(activity.content)}</p>
    <p><b>c) Sản phẩm:</b> ${escapeHtml(activity.product)}</p>
    <p><b>d) Tổ chức thực hiện:</b></p><div class="step">${escapeHtml(activity.execution).replace(/\n/g, "<br>")}</div>
  `).join("")}
  <h2>IV. PHIẾU HỌC TẬP</h2>
  ${bundle.worksheets.map((worksheet) => `<h3>${escapeHtml(worksheet.title)}</h3><ol>${list(worksheet.tasks)}</ol>`).join("")}
  <h2>V. NGÂN HÀNG CÂU HỎI KÈM ĐÁP ÁN</h2>
  ${bundle.questions.map((question, index) => `<p><b>Câu ${index + 1}.</b> (${escapeHtml(question.level)}) ${escapeHtml(question.question)}<br>Đáp án: <span class="answer">${escapeHtml(question.answer)}</span></p>`).join("")}
  </body></html>`;
}

function download(meta: { subject: string; grade: string; topic: string; periods: number }, bundle: LessonBundle) {
  const blob = new Blob(["﻿", buildLessonWord(meta, bundle)], { type: "application/msword;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `KHBD-${meta.topic.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "bai-day"}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function LessonAiStudio({ notify, plans, onSavePlan, onDeletePlan }: {
  notify: Notice;
  plans: SavedPlan[];
  onSavePlan: (plan: SavedPlan) => Promise<boolean> | void;
  onDeletePlan: (id: string) => void;
}) {
  const [form, setForm] = useState({ subject: "Ngữ văn", grade: "10", periods: 2, topic: "", requirements: "" });
  const [bundle, setBundle] = useState<LessonBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key: string, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const generate = async () => {
    if (!form.topic.trim()) return notify("Vui lòng nhập chủ đề bài dạy", "error");
    setBusy(true);
    setSaved(false);
    try {
      const response = await fetch("/api/lesson-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setBundle(result.lesson);
      notify("AI đã soạn xong KHBD 5512. Thầy cô duyệt lại trước khi sử dụng.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tạo bài dạy", "error");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!bundle) return;
    const ok = await onSavePlan({
      id: String(Date.now()),
      title: form.topic.trim(),
      subject: form.subject,
      grade: form.grade,
      periods: form.periods,
      createdAt: new Date().toISOString(),
      bundle,
    });
    if (ok !== false) setSaved(true);
  };

  return (
    <div className="lesson-studio">
      <section className="ai-hero">
        <span>✦ TRỢ LÝ AI SOẠN GIẢNG</span>
        <h2>Một chủ đề, trọn bộ học liệu.</h2>
        <p>Kira AI soạn KHBD theo Công văn 5512: mục tiêu, tiến trình 4 hoạt động, phiếu học tập và ngân hàng câu hỏi kèm đáp án.</p>
        <div className="lesson-form">
          <label>Môn học<input value={form.subject} onChange={(e) => set("subject", e.target.value)} /></label>
          <label>Khối<select value={form.grade} onChange={(e) => set("grade", e.target.value)}><option>10</option><option>11</option><option>12</option></select></label>
          <label>Số tiết<input type="number" min={1} max={8} value={form.periods} onChange={(e) => set("periods", Math.min(8, Math.max(1, Number(e.target.value) || 1)))} /></label>
          <label className="wide">Chủ đề / tên bài học<input value={form.topic} onChange={(e) => set("topic", e.target.value)} placeholder="Ví dụ: Thần thoại và sử thi" /></label>
          <label className="wide">Yêu cầu cần đạt (tùy chọn)<textarea value={form.requirements} onChange={(e) => set("requirements", e.target.value)} placeholder="Dán yêu cầu cần đạt trong chương trình để AI bám sát..." /></label>
        </div>
        <button disabled={busy} onClick={() => void generate()}>{busy ? "AI đang soạn bài..." : "✦ Soạn bài dạy với AI →"}</button>
      </section>

      {bundle && (
        <section className="panel lesson-result">
          <div className="panel-head">
            <div>
              <b>{form.topic}</b>
              <small>{form.subject} · Lớp {form.grade} · {form.periods} tiết · {bundle.activities.length} hoạt động · {bundle.questions.length} câu hỏi</small>
            </div>
            <div className="lesson-result-actions">
              <button onClick={() => download(form, bundle)}>⇩ Tải Word</button>
              <button disabled={saved} onClick={() => void save()}>{saved ? "✓ Đã lưu vào kho" : "Lưu vào kho"}</button>
            </div>
          </div>
          <div className="lesson-sections">
            <article><h4>I. Mục tiêu kiến thức</h4><ul>{bundle.objectives.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><h4>II. Năng lực & phẩm chất</h4><ul>{bundle.competencies.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><h4>III. Thiết bị & học liệu</h4><ul>{bundle.materials.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </div>
          <div className="lesson-activities">
            {bundle.activities.map((activity) => (
              <article key={activity.name}>
                <b>{activity.name}</b>
                <p><i>Mục tiêu:</i> {activity.goal}</p>
                <p><i>Nội dung:</i> {activity.content}</p>
                <p><i>Sản phẩm:</i> {activity.product}</p>
                <p className="execution"><i>Tổ chức thực hiện:</i> {activity.execution}</p>
              </article>
            ))}
          </div>
          <div className="lesson-sections">
            {bundle.worksheets.map((worksheet) => (
              <article key={worksheet.title}><h4>{worksheet.title}</h4><ol>{worksheet.tasks.map((task) => <li key={task}>{task}</li>)}</ol></article>
            ))}
            <article>
              <h4>Ngân hàng câu hỏi ({bundle.questions.length})</h4>
              <ol>{bundle.questions.map((question) => <li key={question.question}><b>[{question.level}]</b> {question.question}<br /><em>Đáp án: {question.answer}</em></li>)}</ol>
            </article>
          </div>
        </section>
      )}

      <section className="panel lesson-library">
        <div className="panel-head">
          <div>
            <b>Kho bài dạy đã lưu</b>
            <small>{plans.length ? `${plans.length} bài dạy trên Supabase` : "Chưa có bài dạy nào được lưu"}</small>
          </div>
        </div>
        {plans.map((plan) => {
          const planBundle = plan.bundle as LessonBundle | undefined;
          return (
            <div className="lesson-plan-row" key={String(plan.id)}>
              <span>✦</span>
              <div>
                <b>{String(plan.title || "Bài dạy")}</b>
                <small>
                  {String(plan.subject || "")} · Lớp {String(plan.grade || "")}
                  {plan.createdAt ? ` · ${new Date(String(plan.createdAt)).toLocaleDateString("vi-VN")}` : ""}
                </small>
              </div>
              {planBundle && (
                <button
                  onClick={() =>
                    download(
                      { subject: String(plan.subject || ""), grade: String(plan.grade || "10"), topic: String(plan.title || "Bài dạy"), periods: Number(plan.periods) || 2 },
                      planBundle,
                    )
                  }
                >
                  ⇩ Word
                </button>
              )}
              <button className="lesson-delete" onClick={() => onDeletePlan(String(plan.id))}>Xóa</button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
