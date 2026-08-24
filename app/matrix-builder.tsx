"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FORM_KEYS,
  FORM_LABELS,
  LEVEL_LABELS,
  blankContent,
  blankMatrix,
  blankTopic,
  buildMatrixWord,
  contentPoints,
  matrixStats,
  type MatrixDoc,
  type MatrixTopic,
} from "./matrix-word";

type Notice = (message: string, tone?: "success" | "error") => void;

function download(doc: MatrixDoc) {
  const blob = new Blob(["﻿", buildMatrixWord(doc)], { type: "application/msword;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Ma-tran-dac-ta-${doc.subject.replace(/[^\p{L}\p{N}]+/gu, "-")}-lop-${doc.grade}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function MatrixBuilder({ notify, onExit }: { notify: Notice; onExit: () => void }) {
  const [savedDocs, setSavedDocs] = useState<MatrixDoc[]>([]);
  const [doc, setDoc] = useState<MatrixDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSavedDocs(Array.isArray(result.data?.examMatrices) ? result.data.examMatrices : []);
    } catch { setSavedDocs([]); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const persist = async (mutate: (list: MatrixDoc[]) => MatrixDoc[], message: string) => {
    setBusy(true);
    try {
      const workspaceResponse = await fetch("/api/workspace");
      const workspace = await workspaceResponse.json();
      if (!workspaceResponse.ok) throw new Error(workspace.error || "Không thể tải dữ liệu");
      const list = Array.isArray(workspace.data?.examMatrices) ? workspace.data.examMatrices as MatrixDoc[] : [];
      const next = { ...(workspace.data || {}), examMatrices: mutate(list) };
      const saveResponse = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: next }) });
      const saved = await saveResponse.json();
      if (!saveResponse.ok || !saved.saved) throw new Error(saved.error || "Không thể lưu ma trận");
      setSavedDocs(Array.isArray(saved.data?.examMatrices) ? saved.data.examMatrices : []);
      notify(message);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể lưu ma trận", "error");
      return false;
    } finally { setBusy(false); }
  };
  const saveDoc = async () => {
    if (!doc) return;
    if (!doc.topics.length || doc.topics.every((topic) => topic.contents.every((content) => !content.name.trim()))) {
      return notify("Hãy nhập ít nhất một chủ đề với nội dung/đơn vị kiến thức", "error");
    }
    const stamped = { ...doc, createdAt: doc.createdAt || new Date().toISOString() };
    const ok = await persist((list) => [stamped, ...list.filter((item) => item.id !== stamped.id)], "Đã lưu ma trận & bản đặc tả trên Supabase");
    if (ok) setDoc(stamped);
  };
  const removeDoc = (id: string) => {
    if (!window.confirm("Xóa ma trận này khỏi kho?")) return;
    void persist((list) => list.filter((item) => item.id !== id), "Đã xóa ma trận");
  };

  const update = (changes: Partial<MatrixDoc>) => setDoc((current) => (current ? { ...current, ...changes } : current));
  const updateTopic = (topicId: string, changes: Partial<MatrixTopic>) =>
    update({ topics: doc!.topics.map((topic) => (topic.id === topicId ? { ...topic, ...changes } : topic)) });

  const stats = doc ? matrixStats(doc) : null;
  const aiGenerate = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const targets = {
        nlc: stats?.formCounts[0] || 12,
        ds: stats?.formCounts[1] || 2,
        tln: stats?.formCounts[2] || 4,
        tl: stats?.formCounts[3] || 2,
      };
      const response = await fetch("/api/matrix-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: doc.subject, grade: doc.grade, kind: doc.title, content: aiContent, targets }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      update({ topics: result.topics });
      notify("AI đã dựng khung ma trận. Thầy cô duyệt, chỉnh số câu và yêu cầu cần đạt trước khi xuất Word.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tạo ma trận bằng AI", "error");
    } finally { setBusy(false); }
  };

  if (!doc) {
    return (
      <section className="matrix-shell">
        <div className="assessment-hero"><div><small>CÔNG VĂN 7991/BGDĐT-GDTrH</small><h2>Ma trận & bản đặc tả đề kiểm tra định kì</h2><p>Soạn ma trận 12 cột mức độ (Nhiều lựa chọn · “Đúng - Sai” · Trả lời ngắn · Tự luận × Biết/Hiểu/Vận dụng) và bản đặc tả kèm yêu cầu cần đạt, xuất Word khổ ngang đúng định dạng Phụ lục công văn.</p><button onClick={() => setDoc(blankMatrix())}>＋ Tạo ma trận mới</button></div><div className="assessment-hero-stats"><b>12<small>Cột mức độ</small></b><b>02<small>Bảng chuẩn</small></b><b>W<small>Xuất Word</small></b></div></div>
        <div className="assessment-head"><div><b>Kho ma trận đã lưu</b><small>Dùng lại, chỉnh sửa hoặc tải Word</small></div><button onClick={onExit}>← Về kho đề</button></div>
        <div className="assessment-grid">
          {savedDocs.map((item) => (
            <article key={item.id}>
              <div><span>CV 7991</span><i>{item.topics?.length || 0} chủ đề</i></div>
              <small>{item.subject} · Lớp {item.grade}</small>
              <h3>{item.title}</h3>
              <p>◷ {item.duration} phút · {matrixStats(item).totalQuestions} câu · {String(matrixStats(item).totalPoints).replace(".", ",")} điểm</p>
              <footer className="assessment-card-actions">
                <button className="publish" onClick={() => setDoc(item)}>Chỉnh sửa</button>
                <button onClick={() => download(item)}>⇩ Tải Word</button>
                <button className="assessment-delete" onClick={() => removeDoc(item.id)}>Xóa</button>
              </footer>
            </article>
          ))}
          {savedDocs.length === 0 && <div className="learning-empty"><span>▦</span><b>Chưa có ma trận nào</b><p>Bấm Tạo ma trận mới để bắt đầu theo mẫu Công văn 7991.</p></div>}
        </div>
      </section>
    );
  }

  return (
    <section className="matrix-shell">
      <header className="matrix-header">
        <button onClick={() => setDoc(null)}>← Kho ma trận</button>
        <div><b>Ma trận & bản đặc tả · Công văn 7991</b><small>{doc.subject} · Lớp {doc.grade} · {doc.title}</small></div>
        <nav>
          <button disabled={busy} onClick={() => void saveDoc()}>{busy ? "Đang lưu..." : "Lưu vào kho"}</button>
          <button className="publish" onClick={() => download(doc)}>⇩ Xuất Word chuẩn 7991</button>
        </nav>
      </header>

      <section className="panel matrix-info">
        <div className="matrix-info-grid">
          <label>Tên kỳ kiểm tra<input value={doc.title} onChange={(e) => update({ title: e.target.value })} /></label>
          <label>Môn học<input value={doc.subject} onChange={(e) => update({ subject: e.target.value })} /></label>
          <label>Khối<select value={doc.grade} onChange={(e) => update({ grade: e.target.value })}><option>10</option><option>11</option><option>12</option></select></label>
          <label>Năm học<input value={doc.schoolYear} onChange={(e) => update({ schoolYear: e.target.value })} /></label>
          <label>Thời gian (phút)<input type="number" min="5" max="300" value={doc.duration} onChange={(e) => update({ duration: Math.max(5, Number(e.target.value) || 45) })} /></label>
          <label className="wide">Đơn vị<input value={doc.school} onChange={(e) => update({ school: e.target.value })} /></label>
        </div>
        <div className="matrix-perq">
          <b>Điểm mỗi câu theo dạng</b>
          {FORM_KEYS.map((key, index) => (
            <label key={key}>{FORM_LABELS[index]}<input type="number" min="0.05" step="0.05" value={doc.perQuestion[key]} onChange={(e) => update({ perQuestion: { ...doc.perQuestion, [key]: Math.max(0.05, Number(e.target.value) || 0.05) } })} /></label>
          ))}
        </div>
        {stats && (
          <div className={`matrix-summary ${Math.abs(stats.totalPoints - 10) > 0.01 && stats.totalPoints > 0 ? "warn" : ""}`}>
            <span><b>{stats.totalQuestions}</b> câu · <b>{String(stats.totalPoints).replace(".", ",")}</b> điểm</span>
            {FORM_LABELS.map((label, index) => <span key={label}>{label}: {stats.formCounts[index]} câu · {String(stats.formPoints[index]).replace(".", ",")}đ</span>)}
            {LEVEL_LABELS.map((label, index) => <span key={label}>{label}: {stats.totalPoints ? Math.round((stats.levelPoints[index] / stats.totalPoints) * 100) : 0}%</span>)}
            {Math.abs(stats.totalPoints - 10) > 0.01 && stats.totalPoints > 0 && <em>⚠ Tổng chưa bằng 10 điểm</em>}
          </div>
        )}
      </section>

      <section className="panel matrix-ai">
        <div className="panel-head"><div><b>✦ AI dựng khung ma trận (tùy chọn)</b><small>Dán phạm vi kiến thức/các chủ đề của kỳ kiểm tra; AI phân bổ số câu theo cấu trúc hiện tại và soạn yêu cầu cần đạt</small></div></div>
        <div className="matrix-ai-body">
          <textarea rows={3} value={aiContent} onChange={(e) => setAiContent(e.target.value)} placeholder="Ví dụ: Chương I: Dao động cơ (dao động điều hòa, con lắc lò xo, con lắc đơn); Chương II: Sóng cơ..." />
          <button disabled={busy} onClick={() => void aiGenerate()}>{busy ? "AI đang phân tích..." : "✦ AI dựng khung"}</button>
        </div>
      </section>

      {doc.topics.map((topic, topicIndex) => (
        <section className="panel matrix-topic" key={topic.id}>
          <header>
            <span>{topicIndex + 1}</span>
            <input value={topic.name} onChange={(e) => updateTopic(topic.id, { name: e.target.value })} placeholder="Tên chủ đề/chương..." />
            <button onClick={() => updateTopic(topic.id, { contents: [...topic.contents, blankContent()] })}>＋ Nội dung</button>
            <button className="matrix-remove" onClick={() => update({ topics: doc.topics.filter((item) => item.id !== topic.id) })}>Xóa chủ đề</button>
          </header>
          {topic.contents.map((content) => (
            <article className="matrix-content" key={content.id}>
              <div className="matrix-content-head">
                <input value={content.name} onChange={(e) => updateTopic(topic.id, { contents: topic.contents.map((item) => item.id === content.id ? { ...item, name: e.target.value } : item) })} placeholder="Nội dung/đơn vị kiến thức..." />
                <strong>{String(contentPoints(doc, content)).replace(".", ",")}đ</strong>
                <button className="matrix-remove" onClick={() => updateTopic(topic.id, { contents: topic.contents.filter((item) => item.id !== content.id) })}>×</button>
              </div>
              <div className="matrix-counts">
                {FORM_LABELS.map((formLabel, formIndex) => (
                  <div key={formLabel}>
                    <b>{formLabel}</b>
                    {LEVEL_LABELS.map((levelLabel, levelIndex) => {
                      const column = formIndex * 3 + levelIndex;
                      return (
                        <label key={levelLabel}>{levelLabel}
                          <input type="number" min="0" max="30" value={content.counts[column] || 0} onChange={(e) => updateTopic(topic.id, { contents: topic.contents.map((item) => item.id === content.id ? { ...item, counts: item.counts.map((count, i) => i === column ? Math.max(0, Math.round(Number(e.target.value) || 0)) : count) } : item) })} />
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="matrix-requirements">
                <label>Yêu cầu cần đạt · Biết<textarea rows={2} value={content.know} onChange={(e) => updateTopic(topic.id, { contents: topic.contents.map((item) => item.id === content.id ? { ...item, know: e.target.value } : item) })} placeholder="- Nêu được..., trình bày được..." /></label>
                <label>Yêu cầu cần đạt · Hiểu<textarea rows={2} value={content.understand} onChange={(e) => updateTopic(topic.id, { contents: topic.contents.map((item) => item.id === content.id ? { ...item, understand: e.target.value } : item) })} placeholder="- Giải thích được..., phân tích được..." /></label>
                <label>Yêu cầu cần đạt · Vận dụng<textarea rows={2} value={content.apply} onChange={(e) => updateTopic(topic.id, { contents: topic.contents.map((item) => item.id === content.id ? { ...item, apply: e.target.value } : item) })} placeholder="- Vận dụng được... để giải quyết..." /></label>
              </div>
            </article>
          ))}
        </section>
      ))}
      <button className="matrix-add-topic" onClick={() => update({ topics: [...doc.topics, blankTopic(doc.topics.length + 1)] })}>＋ Thêm chủ đề/chương</button>
    </section>
  );
}
