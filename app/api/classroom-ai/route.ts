import { getRequestAccount } from "../../auth";

async function requireTeacher(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) throw new Error("Chỉ giáo viên hoặc quản trị viên được tạo bài trình chiếu");
}
async function key() { const { env } = await import("cloudflare:workers"); return ((env as unknown as Record<string, string | undefined>).KIRA_API_KEY || "").trim(); }
function error(error: unknown) { const message = error instanceof Error ? error.message : "Không thể tạo bài trình chiếu"; return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : message.includes("chưa được kết nối") ? 503 : 400 }); }
function slideId() { return `slide-${crypto.randomUUID()}`; }

export async function POST(request: Request) {
  try {
    await requireTeacher(request); const apiKey = await key();
    if (!apiKey) throw new Error("Kira AI chưa được kết nối. Quản trị viên cần cấu hình KIRA_API_KEY.");
    const body = await request.json() as { title?: string; subject?: string; grade?: string; summary?: string; objectives?: string[]; sources?: Array<{ type?: string; name?: string }> };
    if (!body.title?.trim()) return Response.json({ error: "Vui lòng nhập tên bài học" }, { status: 400 });
    const prompt = `Tạo bài trình chiếu web dạy trực tiếp trên lớp theo CTGDPT 2018.
Tên bài: ${body.title}
Môn: ${body.subject || "Chưa xác định"}; Lớp: ${body.grade || "10"}
Nội dung trọng tâm: ${body.summary || "Bám sát bài học"}
Mục tiêu: ${(body.objectives || []).filter(Boolean).join("; ")}
Tệp giáo viên cung cấp: ${(body.sources || []).map((s) => `${s.type}: ${s.name}`).join("; ")}

Trả về duy nhất JSON array 10-16 phần tử. Mỗi phần tử đúng cấu trúc:
{"type":"content|keywords|mindmap|multiple_choice|true_false|short_answer|ordering|matching","title":"...","content":"...","items":["..."],"answer":"..."}
Yêu cầu: có mở đầu, nội dung kiến thức, ít nhất 1 trang từ khóa, 1 sơ đồ tư duy; có đủ 5 dạng luyện tập multiple_choice, true_false (đúng 4 ý), short_answer, ordering, matching. Nội dung tiếng Việt chuẩn, ngắn gọn để trình chiếu, bám môn và lớp. Với matching, items dùng định dạng vế trái::vế phải.`;
    const response = await fetch("https://kiraai.vn/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "kira-3.5-flash", temperature: 0.35, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Bạn là chuyên gia thiết kế bài giảng phổ thông Việt Nam. Chỉ trả JSON hợp lệ, không Markdown." }, { role: "user", content: prompt }] }) });
    const result = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; message?: string };
    if (!response.ok) throw new Error(result.error?.message || result.message || "AI chưa thể tạo bài trình chiếu");
    const raw = result.choices?.[0]?.message?.content || ""; let parsed: unknown;
    try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")); } catch { throw new Error("AI trả về cấu trúc chưa hợp lệ. Vui lòng tạo lại."); }
    const list = Array.isArray(parsed) ? parsed : (parsed as { sections?: unknown[]; slides?: unknown[] }).sections || (parsed as { slides?: unknown[] }).slides;
    if (!Array.isArray(list) || !list.length) throw new Error("AI chưa tạo được nội dung bài trình chiếu");
    const allowed = new Set(["content", "keywords", "mindmap", "multiple_choice", "true_false", "short_answer", "ordering", "matching"]);
    const sections = list.slice(0, 24).map((item) => { const value = item as Record<string, unknown>; const type = allowed.has(String(value.type)) ? String(value.type) : "content"; return { id: slideId(), type, title: String(value.title || "Nội dung bài học"), content: String(value.content || ""), items: Array.isArray(value.items) ? value.items.map(String).slice(0, 12) : [], answer: String(value.answer || "") }; });
    return Response.json({ sections });
  } catch (e) { return error(e); }
}
