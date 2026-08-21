"use client";

import { useRef, useState } from "react";

export type AssignmentAttachment = { id: string; name: string; type: string; size: number; url: string };

const symbolGroups = {
  "Toán": ["√", "∑", "∫", "π", "∞", "≠", "≈", "≤", "≥", "±", "×", "÷", "∈", "⊂", "∠", "°", "²", "³", "₁", "₂"],
  "Hóa": ["→", "⇌", "↑", "↓", "Δ", "H₂", "O₂", "CO₂", "H₂O", "OH⁻", "H⁺", "Na⁺", "Cl⁻", "mol", "t°"],
  "Vật lý": ["Δ", "λ", "μ", "ρ", "ω", "Ω", "α", "β", "γ", "v⃗", "F⃗", "a⃗", "m/s", "m/s²", "Hz", "N", "J", "W"],
};

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function AssignmentComposer({ classes, assignments = [], onSubmit, mode = "assign" }: {
  classes: Array<{ id: number; name: string; subject: string }>;
  assignments?: Array<{ id: number; title: string; subject: string; className: string }>;
  onSubmit: (payload: Record<string, string>) => void;
  mode?: "assign" | "submit";
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<Record<string, string>>({ className: classes[0]?.name || "", subject: classes[0]?.subject || "", assignmentId: assignments[0] ? String(assignments[0].id) : "" });
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [symbols, setSymbols] = useState<keyof typeof symbolGroups>("Toán");
  const set = (key: string, value: string) => setPayload((current) => ({ ...current, [key]: value }));
  const command = (name: string, value?: string) => { editorRef.current?.focus(); document.execCommand(name, false, value); set("contentHtml", editorRef.current?.innerHTML || ""); };
  const insert = (value: string) => command("insertText", value);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setMessage("");
    try {
      const uploaded: AssignmentAttachment[] = [];
      for (const file of Array.from(files).slice(0, 8 - attachments.length)) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/assignment-files", { method: "POST", body: form });
        const result = await response.json() as { file?: AssignmentAttachment; error?: string };
        if (!response.ok || !result.file) throw new Error(result.error || `Không thể tải ${file.name}`);
        uploaded.push(result.file);
      }
      setAttachments((current) => [...current, ...uploaded]);
      setMessage(`Đã tải lên ${uploaded.length} tệp`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải tệp"); }
    finally { setUploading(false); }
  };
  const remove = async (file: AssignmentAttachment) => {
    setAttachments((current) => current.filter((item) => item.id !== file.id));
    await fetch(`/api/assignment-files?id=${encodeURIComponent(file.id)}`, { method: "DELETE" }).catch(() => undefined);
  };
  const submit = () => {
    const contentHtml = editorRef.current?.innerHTML || "";
    if (mode === "assign" && !payload.name?.trim()) { setMessage("Vui lòng nhập tên bài tập"); return; }
    if (mode === "submit" && !payload.assignmentId) { setMessage("Vui lòng chọn bài tập cần nộp"); return; }
    if (!contentHtml.replace(/<[^>]*>/g, "").trim() && attachments.length === 0) { setMessage("Hãy soạn nội dung hoặc tải ít nhất một tệp bài tập"); return; }
    onSubmit({ ...payload, contentHtml, attachments: JSON.stringify(attachments) });
  };

  return <div className="assignment-composer">
    {mode === "assign" ? <div className="assignment-basic-grid">
      <label className="wide">Tên bài tập<input value={payload.name || ""} onChange={(event) => set("name", event.target.value)} placeholder="Ví dụ: Bài tập ôn tập chương II" /></label>
      <label>Lớp<select value={payload.className} onChange={(event) => { const selected = classes.find((item) => item.name === event.target.value); set("className", event.target.value); if (selected) set("subject", selected.subject); }}>{classes.map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
      <label>Môn học<input value={payload.subject || ""} onChange={(event) => set("subject", event.target.value)} /></label>
      <label>Hạn nộp<input type="datetime-local" onChange={(event) => set("due", event.target.value)} /></label>
      <label>Thang điểm<select onChange={(event) => set("maxScore", event.target.value)}><option value="10">10 điểm</option><option value="100">100 điểm</option><option value="pass">Đạt / Chưa đạt</option></select></label>
    </div> : <><div className="submission-intro"><span>✎</span><div><b>Nộp bài trực tuyến</b><small>Em có thể tải bài làm hoặc soạn trực tiếp bên dưới</small></div></div><label className="submission-assignment-select">Bài tập cần nộp<select value={payload.assignmentId} onChange={(event) => set("assignmentId", event.target.value)}><option value="">Chọn bài tập</option>{assignments.map((assignment) => <option key={assignment.id} value={String(assignment.id)}>{assignment.title} · {assignment.className}</option>)}</select></label></>}

    <div className="assignment-source-tabs"><b>NỘI DUNG BÀI TẬP</b><span>Soạn trực tiếp và/hoặc đính kèm tệp</span></div>
    <div className="document-upload-zone">
      <div><span>⇧</span><p><b>Tải học liệu có sẵn</b><small>Word, Excel, PowerPoint, PDF, MP3 và hình ảnh · tối đa 25 MB/tệp</small></p></div>
      <label>{uploading ? "Đang tải..." : "＋ Chọn tệp"}<input disabled={uploading || attachments.length >= 8} multiple type="file" accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.mp3,.png,.jpg,.jpeg,.webp,.gif,audio/mpeg,image/*" onChange={(event) => void upload(event.target.files)} /></label>
    </div>
    {attachments.length > 0 && <div className="assignment-files">{attachments.map((file) => <article key={file.id}><span>{file.type.startsWith("image/") ? "▧" : file.type.startsWith("audio/") ? "♫" : "▤"}</span><div><b>{file.name}</b><small>{fileSize(file.size)}</small></div><button onClick={() => void remove(file)} aria-label={`Xóa ${file.name}`}>×</button></article>)}</div>}

    <div className="word-editor-shell">
      <div className="word-toolbar" aria-label="Thanh công cụ soạn thảo">
        <select aria-label="Kiểu chữ" onChange={(event) => command("formatBlock", event.target.value)}><option value="p">Đoạn văn</option><option value="h2">Tiêu đề lớn</option><option value="h3">Tiêu đề nhỏ</option></select>
        <button onClick={() => command("bold")} title="In đậm"><b>B</b></button><button onClick={() => command("italic")} title="In nghiêng"><i>I</i></button><button onClick={() => command("underline")} title="Gạch chân"><u>U</u></button>
        <button onClick={() => command("insertUnorderedList")} title="Danh sách">☷</button><button onClick={() => command("insertOrderedList")} title="Đánh số">1.</button>
        <button onClick={() => command("justifyLeft")} title="Căn trái">≡</button><button onClick={() => command("justifyCenter")} title="Căn giữa">≣</button>
        <button onClick={() => command("undo")} title="Hoàn tác">↶</button><button onClick={() => command("redo")} title="Làm lại">↷</button>
      </div>
      <div className="science-toolbar"><div>{Object.keys(symbolGroups).map((group) => <button key={group} className={symbols === group ? "active" : ""} onClick={() => setSymbols(group as keyof typeof symbolGroups)}>{group}</button>)}</div><section>{symbolGroups[symbols].map((symbol) => <button key={symbol} onClick={() => insert(symbol)}>{symbol}</button>)}</section></div>
      <div ref={editorRef} className="word-page" contentEditable suppressContentEditableWarning onInput={(event) => set("contentHtml", event.currentTarget.innerHTML)} data-placeholder="Nhập yêu cầu, câu hỏi, hướng dẫn làm bài và tiêu chí chấm điểm..." />
      <div className="word-status"><span>Nội dung được lưu cùng bài giao</span><span>Hỗ trợ ký hiệu Toán · Hóa · Lý</span></div>
    </div>
    {message && <div className="composer-message">{message}</div>}
    <button className="primary full assignment-submit" disabled={uploading} onClick={submit}>{uploading ? "Đang tải tệp..." : mode === "submit" ? "Xác nhận nộp bài" : "Giao bài và gửi thông báo"}</button>
  </div>;
}
