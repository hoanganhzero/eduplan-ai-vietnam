"use client";

import { useMemo, useRef, useState } from "react";

export type InteractiveQuestionType = "multiple_choice" | "drag_drop" | "ordering" | "matching" | "short_answer" | "long_answer";

export type VideoCheckpoint = {
  id: string;
  timeSeconds: number;
  title: string;
  questionType: InteractiveQuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  points: number;
  required: boolean;
};

export type InteractiveVideoConfig = {
  sourceType?: "video" | "slides";
  slideFileName?: string;
  videoFileName?: string;
  videoUrl?: string;
  narrationScript?: string;
  voice?: string;
  checkpoints: VideoCheckpoint[];
};

const questionLabels: Record<InteractiveQuestionType, string> = {
  multiple_choice: "Trắc nghiệm",
  drag_drop: "Kéo thả phân loại",
  ordering: "Sắp xếp thứ tự",
  matching: "Nối câu",
  short_answer: "Trả lời ngắn",
  long_answer: "Đoạn văn dài",
};

function checkpointId() {
  return `checkpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function parseTime(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.length === 2 ? Math.max(0, parts[0] * 60 + parts[1]) : Math.max(0, parts[0]);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

function parsePairs(options: string[]) {
  return options.map((line) => {
    const [left, ...rest] = line.split("::");
    return { left: left?.trim() || "", right: rest.join("::").trim() };
  }).filter((pair) => pair.left && pair.right);
}

export function InteractiveVideoEditor({ value, onChange, context, notify, focus = "all" }: {
  value?: InteractiveVideoConfig;
  onChange: (value: InteractiveVideoConfig) => void;
  context: string;
  notify: (message: string) => void;
  focus?: "source" | "checkpoints" | "all";
}) {
  const config: InteractiveVideoConfig = value || { checkpoints: [], voice: "nova" };
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const setConfig = (changes: Partial<InteractiveVideoConfig>) => onChange({ ...config, ...changes, checkpoints: changes.checkpoints || config.checkpoints || [] });
  const updateCheckpoint = (id: string, changes: Partial<VideoCheckpoint>) => setConfig({ checkpoints: config.checkpoints.map((item) => item.id === id ? { ...item, ...changes } : item) });
  const addCheckpoint = () => setConfig({ checkpoints: [...config.checkpoints, {
    id: checkpointId(), timeSeconds: 60, title: `Câu hỏi ${config.checkpoints.length + 1}`, questionType: "multiple_choice",
    prompt: "", options: ["Phương án A", "Phương án B", "Phương án C", "Phương án D"], correctAnswer: "Phương án A", points: 10, required: true,
  }].sort((a, b) => a.timeSeconds - b.timeSeconds) });

  const upload = async (file: File, sourceType: "video" | "slides") => {
    setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/learning-files", { method: "POST", body: form });
      const result = await response.json() as { file?: { name: string; url: string }; error?: string };
      if (!response.ok || !result.file) throw new Error(result.error || "Không thể tải học liệu");
      setConfig(sourceType === "video" ? { sourceType, videoFileName: result.file.name, videoUrl: result.file.url } : { sourceType, slideFileName: result.file.name });
      notify(sourceType === "video" ? "Đã tải video lên, thầy cô có thể đặt các mốc câu hỏi" : "Đã tải slide lên để AI tạo lời giảng và video");
    } catch (error) { notify(error instanceof Error ? error.message : "Không thể tải học liệu"); }
    finally { setUploading(false); }
  };

  const generateScript = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/media/kira", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate_script", context, slideFileName: config.slideFileName }) });
      const result = await response.json() as { script?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Không thể tạo kịch bản");
      setConfig({ narrationScript: result.script || "" });
      notify("Đã tạo kịch bản giọng đọc bằng AI");
    } catch (error) { notify(error instanceof Error ? error.message : "Không thể tạo kịch bản"); }
    finally { setBusy(false); }
  };

  const previewVoice = async () => {
    if (!config.narrationScript?.trim()) { notify("Hãy nhập hoặc tạo kịch bản giọng đọc trước"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/media/kira", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "speech", text: config.narrationScript.slice(0, 1600), voice: config.voice || "nova" }) });
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || "Không thể tạo giọng đọc"); }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(await response.blob()));
      notify("Đã tạo bản đọc thử");
    } catch (error) { notify(error instanceof Error ? error.message : "Không thể tạo giọng đọc"); }
    finally { setBusy(false); }
  };

  return <div className="interactive-author">
    {focus !== "checkpoints" && <>
    <div className="video-source-choice"><button className={(config.sourceType || "video") === "video" ? "active" : ""} onClick={() => setConfig({ sourceType: "video" })}><span>▶</span><b>Dùng video có sẵn</b><small>Tải MP4/WebM rồi đặt mốc câu hỏi</small></button><button className={config.sourceType === "slides" ? "active" : ""} onClick={() => setConfig({ sourceType: "slides" })}><span>▤</span><b>Tạo video từ slide bằng AI</b><small>PowerPoint/PDF + lời giảng tiếng Việt</small></button></div>
    <div className="interactive-workflow">
      <article><span>1</span><div><b>{config.sourceType === "slides" ? "Đưa slide lên" : "Đưa video lên"}</b><small>{config.sourceType === "slides" ? "PowerPoint hoặc PDF" : "MP4, WebM hoặc MOV · tối đa 100 MB"}</small></div><label className="file-button">{uploading ? "Đang tải..." : (config.videoFileName || config.slideFileName) ? "Đổi tệp" : "Chọn tệp"}<input disabled={uploading} type="file" accept={config.sourceType === "slides" ? ".ppt,.pptx,.pdf" : ".mp4,.webm,.mov,video/*"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, config.sourceType === "slides" ? "slides" : "video"); }} /></label></article>
      <article><span>2</span><div><b>Tạo lời giảng</b><small>AI soạn kịch bản tiếng Việt</small></div><button disabled={busy} onClick={generateScript}>✦ Tạo kịch bản</button></article>
      {focus === "all" && <article><span>3</span><div><b>Gắn tương tác</b><small>Dừng video theo phút</small></div><button onClick={addCheckpoint}>＋ Thêm mốc</button></article>}
    </div>
    {(config.slideFileName || config.videoFileName) && <div className="slide-file-chip"><span>{config.sourceType === "slides" ? "▤" : "▶"}</span><div><b>{config.slideFileName || config.videoFileName}</b><small>{config.sourceType === "slides" ? "Tệp slide nguồn để tạo video" : "Video tự học đã tải lên"}</small></div><i>Đã tải</i></div>}
    {config.sourceType === "slides" && <div className="narration-grid">
      <label>Kịch bản giọng đọc<textarea rows={7} value={config.narrationScript || ""} onChange={(event) => setConfig({ narrationScript: event.target.value })} placeholder="Nội dung giáo viên muốn giọng AI thuyết minh theo từng slide..." /></label>
      <div><label>Giọng đọc<select value={config.voice || "nova"} onChange={(event) => setConfig({ voice: event.target.value })}><option value="nova">Nova · Nữ, sáng rõ</option><option value="alloy">Alloy · Trung tính</option><option value="echo">Echo · Nam, ấm</option><option value="onyx">Onyx · Nam, trầm</option><option value="fable">Fable · Kể chuyện</option></select></label><button disabled={busy} onClick={previewVoice}>{busy ? "Đang xử lý..." : "▶ Nghe giọng đọc thử"}</button>{audioUrl && <audio controls src={audioUrl} />}</div>
    </div>}
    {config.sourceType === "slides" && <label className="video-output-url">Video bài giảng sau khi AI kết xuất<input value={config.videoUrl || ""} onChange={(event) => setConfig({ videoUrl: event.target.value })} placeholder="Đường dẫn video sẽ xuất hiện sau khi tạo xong" /><small>AI tạo kịch bản, giọng đọc và đồng bộ với từng slide. Video hoàn chỉnh dùng trong trình phát khóa tua của học sinh.</small></label>}
    </>}
    {focus !== "source" && <>
    <div className="timeline-head"><div><b>Dòng thời gian tương tác</b><small>{config.checkpoints.length} mốc · video tự dừng để học sinh trả lời</small></div><button onClick={addCheckpoint}>＋ Thêm câu hỏi theo phút</button></div>
    {config.checkpoints.length === 0 ? <div className="timeline-empty">Chưa có mốc tương tác. Hãy thêm câu hỏi tại phút giáo viên muốn video tự dừng.</div> : <div className="checkpoint-list">{config.checkpoints.map((checkpoint, index) => {
      const pairMode = checkpoint.questionType === "matching" || checkpoint.questionType === "drag_drop";
      return <article key={checkpoint.id}>
        <div className="checkpoint-marker"><span>{index + 1}</span><b>{formatTime(checkpoint.timeSeconds)}</b></div>
        <div className="checkpoint-fields">
          <div className="checkpoint-row"><label>Thời điểm (phút:giây)<input value={formatTime(checkpoint.timeSeconds)} onChange={(event) => updateCheckpoint(checkpoint.id, { timeSeconds: parseTime(event.target.value) })} /></label><label>Dạng câu hỏi<select value={checkpoint.questionType} onChange={(event) => updateCheckpoint(checkpoint.id, { questionType: event.target.value as InteractiveQuestionType })}>{Object.entries(questionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Điểm<input type="number" min="1" max="100" value={checkpoint.points} onChange={(event) => updateCheckpoint(checkpoint.id, { points: Number(event.target.value) || 1 })} /></label></div>
          <label>Câu hỏi / yêu cầu<input value={checkpoint.prompt} onChange={(event) => updateCheckpoint(checkpoint.id, { prompt: event.target.value })} placeholder="Nhập câu hỏi học sinh phải hoàn thành..." /></label>
          {(checkpoint.questionType === "multiple_choice" || checkpoint.questionType === "ordering") && <label>{checkpoint.questionType === "ordering" ? "Thứ tự đúng (mỗi ý một dòng)" : "Các phương án (mỗi phương án một dòng)"}<textarea value={checkpoint.options.join("\n")} onChange={(event) => updateCheckpoint(checkpoint.id, { options: event.target.value.split("\n").filter(Boolean), ...(checkpoint.questionType === "multiple_choice" ? {} : { correctAnswer: event.target.value }) })} /></label>}
          {pairMode && <label>{checkpoint.questionType === "matching" ? "Các cặp nối" : "Các thẻ và nhóm đúng"} <small>Định dạng: vế trái::vế phải, mỗi cặp một dòng</small><textarea value={checkpoint.options.join("\n")} onChange={(event) => updateCheckpoint(checkpoint.id, { options: event.target.value.split("\n").filter(Boolean) })} placeholder="Khái niệm::Định nghĩa đúng" /></label>}
          {checkpoint.questionType === "multiple_choice" && <label>Đáp án đúng<select value={checkpoint.correctAnswer} onChange={(event) => updateCheckpoint(checkpoint.id, { correctAnswer: event.target.value })}><option value="">Chọn đáp án</option>{checkpoint.options.map((option) => <option key={option}>{option}</option>)}</select></label>}
          {(checkpoint.questionType === "short_answer" || checkpoint.questionType === "long_answer") && <label>{checkpoint.questionType === "long_answer" ? "Từ khóa chấm điểm (phân cách bằng dấu phẩy)" : "Đáp án đúng / các đáp án cách nhau bằng dấu |"}<input value={checkpoint.correctAnswer} onChange={(event) => updateCheckpoint(checkpoint.id, { correctAnswer: event.target.value })} /></label>}
          <label className="required-check"><input type="checkbox" checked={checkpoint.required} onChange={(event) => updateCheckpoint(checkpoint.id, { required: event.target.checked })} /> Học sinh phải trả lời trước khi xem tiếp</label>
        </div>
        <button className="delete-checkpoint" onClick={() => setConfig({ checkpoints: config.checkpoints.filter((item) => item.id !== checkpoint.id) })}>×</button>
      </article>;
    })}</div>}
    </>}
  </div>;
}

export function InteractiveVideoPlayer({ config, answers, onAnswer, notify }: {
  config: InteractiveVideoConfig;
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  notify: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const furthestTime = useRef(0);
  const correctingSeek = useRef(false);
  const [active, setActive] = useState<VideoCheckpoint | null>(null);
  const [draft, setDraft] = useState<unknown>("");
  const [result, setResult] = useState<{ earned: number; total: number; correct: boolean } | null>(null);
  const [completed, setCompleted] = useState<string[]>(() => Object.keys(answers).filter((key) => key.startsWith("checkpoint-")));
  const checkpoints = useMemo(() => [...(config.checkpoints || [])].sort((a, b) => a.timeSeconds - b.timeSeconds), [config.checkpoints]);
  const pairs = active ? parsePairs(active.options) : [];

  const openCheckpoint = (checkpoint: VideoCheckpoint) => {
    videoRef.current?.pause();
    setActive(checkpoint);
    setDraft(checkpoint.questionType === "ordering" ? [...checkpoint.options].reverse() : checkpoint.questionType === "matching" || checkpoint.questionType === "drag_drop" ? {} : "");
    setResult(null);
  };
  const onTime = () => {
    const time = videoRef.current?.currentTime || 0;
    if (!correctingSeek.current && time <= furthestTime.current + 1.25) furthestTime.current = Math.max(furthestTime.current, time);
    const due = checkpoints.find((item) => !completed.includes(item.id) && time >= item.timeSeconds);
    if (due && !active) openCheckpoint(due);
  };
  const preventSeeking = () => {
    const video = videoRef.current; if (!video || correctingSeek.current) return;
    if (Math.abs(video.currentTime - furthestTime.current) > 1.5) {
      correctingSeek.current = true; video.currentTime = furthestTime.current;
      window.setTimeout(() => { correctingSeek.current = false; }, 80);
      notify("Video tự học đã khóa tua. Em cần xem và hoàn thành lần lượt các mốc câu hỏi.");
    }
  };
  const grade = () => {
    if (!active) return;
    let ratio = 0;
    if (active.questionType === "multiple_choice") ratio = normalize(String(draft)) === normalize(active.correctAnswer) ? 1 : 0;
    if (active.questionType === "short_answer") ratio = active.correctAnswer.split("|").some((answer) => normalize(answer) === normalize(String(draft))) ? 1 : 0;
    if (active.questionType === "ordering") ratio = JSON.stringify(draft) === JSON.stringify(active.options) ? 1 : 0;
    if (active.questionType === "matching" || active.questionType === "drag_drop") {
      const selections = draft as Record<string, string>;
      ratio = pairs.length ? pairs.filter((pair) => normalize(selections[pair.left] || "") === normalize(pair.right)).length / pairs.length : 0;
    }
    if (active.questionType === "long_answer") {
      const keywords = active.correctAnswer.split(",").map(normalize).filter(Boolean);
      const response = normalize(String(draft));
      ratio = keywords.length ? keywords.filter((word) => response.includes(word)).length / keywords.length : response.length >= 80 ? 1 : response.length / 80;
    }
    const earned = Math.round(active.points * ratio * 10) / 10;
    const payload = JSON.stringify({ response: draft, earned, total: active.points, correct: ratio === 1 });
    onAnswer(active.id, payload);
    setCompleted((items) => [...items, active.id]);
    setResult({ earned, total: active.points, correct: ratio === 1 });
  };
  const continueVideo = () => {
    setActive(null); setResult(null); setDraft("");
    window.setTimeout(() => videoRef.current?.play().catch(() => undefined), 60);
  };
  const hasResponse = Array.isArray(draft) ? draft.length > 0 : typeof draft === "object" ? Object.keys(draft as object).length > 0 : String(draft).trim().length > 0;

  return <div className="interactive-player">
    {config.videoUrl ? <><video ref={videoRef} controls controlsList="nodownload noplaybackrate" disablePictureInPicture preload="metadata" src={config.videoUrl} onTimeUpdate={onTime} onSeeking={preventSeeking} onSeeked={onTime} /><div className="seek-lock-notice"><span>🔒</span><b>Video khóa tua</b><small>Hoàn thành câu hỏi tại mỗi mốc để tiếp tục</small></div></> : <div className="video-missing"><span>▶</span><b>Video bài giảng chưa được kết xuất</b><p>Giáo viên cần tải video hoặc tạo video từ slide trước khi xuất bản.</p></div>}
    <div className="video-timeline"><i>{checkpoints.map((checkpoint) => <button key={checkpoint.id} type="button" disabled aria-label={`Mốc ${formatTime(checkpoint.timeSeconds)}`} title={`${formatTime(checkpoint.timeSeconds)} · ${checkpoint.prompt}`} className={completed.includes(checkpoint.id) ? "done" : ""} style={{ left: `${Math.min(98, Math.max(2, checkpoint.timeSeconds / Math.max(checkpoints.at(-1)?.timeSeconds || 1, 1) * 96))}%` }} />)}</i><div>{checkpoints.map((checkpoint) => <span key={checkpoint.id}>{formatTime(checkpoint.timeSeconds)}</span>)}</div></div>
    <div className="checkpoint-summary"><b>{completed.length}/{checkpoints.length} mốc đã hoàn thành</b><span>Video sẽ tự dừng đúng thời điểm giáo viên đã đặt</span></div>
    {active && <div className="question-gate" role="dialog" aria-modal="true"><div>
      <div className="gate-head"><span>◷ {formatTime(active.timeSeconds)}</span><small>{questionLabels[active.questionType]} · {active.points} điểm</small><h3>{active.prompt || active.title}</h3></div>
      {!result && <div className="gate-answer">
        {active.questionType === "multiple_choice" && active.options.map((option) => <button key={option} className={draft === option ? "selected" : ""} onClick={() => setDraft(option)}>{option}</button>)}
        {(active.questionType === "short_answer") && <input autoFocus value={String(draft)} onChange={(event) => setDraft(event.target.value)} placeholder="Nhập câu trả lời ngắn..." />}
        {active.questionType === "long_answer" && <textarea autoFocus rows={6} value={String(draft)} onChange={(event) => setDraft(event.target.value)} placeholder="Viết đoạn trả lời đầy đủ..." />}
        {active.questionType === "ordering" && <div className="ordering-list">{(draft as string[]).map((item, index, list) => <div key={`${item}-${index}`}><span>{index + 1}</span><b>{item}</b><button disabled={index === 0} onClick={() => { const next = [...list]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setDraft(next); }}>↑</button><button disabled={index === list.length - 1} onClick={() => { const next = [...list]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setDraft(next); }}>↓</button></div>)}</div>}
        {(active.questionType === "matching" || active.questionType === "drag_drop") && <div className="matching-list">{pairs.map((pair) => <label key={pair.left}><b>{pair.left}</b><span>→</span><select value={(draft as Record<string, string>)[pair.left] || ""} onChange={(event) => setDraft({ ...(draft as object), [pair.left]: event.target.value })}><option value="">Chọn kết quả</option>{[...new Set(pairs.map((item) => item.right))].map((right) => <option key={right}>{right}</option>)}</select></label>)}</div>}
        <button className="submit-gate" disabled={!hasResponse} onClick={grade}>Nộp câu trả lời</button>
      </div>}
      {result && <div className={`gate-result ${result.correct ? "correct" : "partial"}`}><span>{result.correct ? "✓" : "◎"}</span><h3>{result.correct ? "Chính xác!" : "Đã ghi nhận câu trả lời"}</h3><b>{result.earned}/{result.total} điểm</b><p>Điểm tại mốc này đã được lưu vào tiến độ học tập.</p><button onClick={continueVideo}>Tiếp tục xem video →</button></div>}
      {!active.required && !result && <button className="skip-gate" onClick={() => { notify("Đã bỏ qua câu hỏi không bắt buộc"); continueVideo(); }}>Bỏ qua</button>}
    </div></div>}
  </div>;
}
