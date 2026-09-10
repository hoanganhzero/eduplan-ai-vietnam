"use client";

import { useMemo, useState } from "react";
import katex from "katex";

export type QuestionMedia = {
  id: string;
  name: string;
  type: string;
  url: string;
  caption?: string;
  alt?: string;
  width?: number;
  height?: number;
  kind?: "image" | "map" | "chart" | "diagram";
};

type RichPart = { type: "text" | "math"; value: string; display?: boolean };

// Hỗ trợ đồng thời \(...\), \[...\], $...$ và $$...$$. Nội dung chữ luôn
// được React escape; chỉ HTML do KaTeX sinh ra mới được đưa vào trang.
export function splitRichContent(value: string): RichPart[] {
  const parts: RichPart[] = [];
  const pattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[^\n$]+\$(?!\$))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "text", value: value.slice(cursor, index) });
    const raw = match[0];
    const display = raw.startsWith("\\[") || raw.startsWith("$$");
    const formula = raw.startsWith("\\[") || raw.startsWith("\\(") ? raw.slice(2, -2) : raw.slice(display ? 2 : 1, display ? -2 : -1);
    parts.push({ type: "math", value: formula.trim(), display });
    cursor = index + raw.length;
  }
  if (cursor < value.length) parts.push({ type: "text", value: value.slice(cursor) });
  return parts.length ? parts : [{ type: "text", value }];
}

export function RichContent({ value, className = "" }: { value: string; className?: string }) {
  const parts = useMemo(() => splitRichContent(value || ""), [value]);
  return <span className={`rich-content ${className}`.trim()}>{parts.map((part, index) => {
    if (part.type === "text") return <span key={index} className="rich-text">{part.value}</span>;
    let html = "";
    try {
      html = katex.renderToString(part.value, { displayMode: Boolean(part.display), throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" });
    } catch {
      return <code key={index} className="formula-error">{part.value}</code>;
    }
    return <span key={index} className={part.display ? "formula-block" : "formula-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
  })}</span>;
}

export function QuestionMediaGallery({ media = [] }: { media?: QuestionMedia[] }) {
  const [zoom, setZoom] = useState<QuestionMedia | null>(null);
  if (!media.length) return null;
  return <>
    <div className="question-media-grid">
      {media.map((item) => <figure key={item.id}>
        <button type="button" onClick={() => setZoom(item)} aria-label={`Phóng to ${item.caption || item.name}`}>
          <img src={item.url} alt={item.alt || item.caption || item.name} loading="lazy" />
          <span>⌕ Phóng to</span>
        </button>
        {(item.caption || item.name) && <figcaption>{item.caption || item.name}</figcaption>}
      </figure>)}
    </div>
    {zoom && <div className="question-media-lightbox" role="dialog" aria-modal="true" aria-label={zoom.caption || zoom.name} onClick={() => setZoom(null)}>
      <button type="button" className="question-media-close" onClick={() => setZoom(null)} aria-label="Đóng hình phóng to">×</button>
      <figure onClick={(event) => event.stopPropagation()}>
        <img src={zoom.url} alt={zoom.alt || zoom.caption || zoom.name} />
        <figcaption>{zoom.caption || zoom.name}</figcaption>
      </figure>
    </div>}
  </>;
}

export const scienceFormulaGroups = {
  "Toán": [
    ["x²", "\\(x^2\\)"], ["Phân số", "\\(\\frac{a}{b}\\)"], ["Căn", "\\(\\sqrt{x}\\)"],
    ["Tổng", "\\(\\sum_{i=1}^{n} a_i\\)"], ["Tích phân", "\\(\\int_a^b f(x)\\,dx\\)"], ["Vectơ", "\\(\\vec{u}\\)"],
  ],
  "Vật lý": [
    ["Vectơ F", "\\(\\vec{F}\\)"], ["Delta", "\\(\\Delta t\\)"], ["Omega", "\\(\\omega\\)"],
    ["Lambda", "\\(\\lambda\\)"], ["Gia tốc", "\\(m/s^2\\)"], ["Công thức", "\\(v=\\frac{s}{t}\\)"],
  ],
  "Hóa học": [
    ["Chỉ số", "\\(\\mathrm{H_2SO_4}\\)"], ["Phản ứng", "\\(\\rightarrow\\)"], ["Thuận nghịch", "\\(\\rightleftharpoons\\)"],
    ["Kết tủa", "↓"], ["Khí", "↑"], ["Điều kiện", "\\(\\xrightarrow{t^\\circ}\\)"],
  ],
  "Sinh học": [
    ["Phép lai", "\\(\\mathrm{Aa \\times Aa}\\)"], ["Tỉ lệ", "\\(\\frac{3}{4}\\)"], ["Mũi tên", "\\(\\rightarrow\\)"],
    ["DNA", "\\(\\mathrm{DNA}\\)"], ["Kiểu gen", "\\(\\mathrm{A_B_}\\)"], ["Số lượng", "\\(2^n\\)"],
  ],
} as const;

export function ScienceFormulaToolbar({ onInsert }: { onInsert: (value: string) => void }) {
  const [group, setGroup] = useState<keyof typeof scienceFormulaGroups>("Toán");
  return <div className="assessment-formula-tools">
    <div>{(Object.keys(scienceFormulaGroups) as Array<keyof typeof scienceFormulaGroups>).map((name) => <button type="button" key={name} className={name === group ? "active" : ""} onClick={() => setGroup(name)}>{name}</button>)}</div>
    <section>{scienceFormulaGroups[group].map(([label, value]) => <button type="button" key={label} onClick={() => onInsert(value)} title={value}>{label}</button>)}</section>
    <small>Công thức được đặt trong <code>\(...\)</code> và hiển thị giống nhau trên website lẫn Word.</small>
  </div>;
}
