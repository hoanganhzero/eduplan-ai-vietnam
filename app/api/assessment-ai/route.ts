import { getRequestAccount } from "../../auth";

async function requireTeacher(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) throw new Error("Chỉ giáo viên hoặc quản trị viên được tạo đề kiểm tra");
}
async function key() { const { env } = await import("cloudflare:workers"); return ((env as unknown as Record<string, string | undefined>).KIRA_API_KEY || "").trim(); }
function fail(error: unknown) { const message = error instanceof Error ? error.message : "Không thể tạo đề kiểm tra"; return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : message.includes("chưa được kết nối") ? 503 : 400 }); }

export type ExamQuestion =
  | { type: "choice"; level: string; question: string; options: string[]; answer: number; points: number }
  | { type: "true_false"; level: string; question: string; statements: Array<{ text: string; answer: boolean }>; points: number }
  | { type: "short"; level: string; question: string; answer: string; points: number }
  | { type: "essay"; level: string; question: string; guide: string; points: number };

export async function POST(request: Request) {
  try {
    await requireTeacher(request);
    const apiKey = await key();
    if (!apiKey) throw new Error("Kira AI chưa được kết nối. Quản trị viên cần cấu hình KIRA_API_KEY.");
    const body = await request.json() as {
      subject?: string; grade?: string; kind?: string; content?: string; matrixNote?: string;
      counts?: { choice?: number; trueFalse?: number; short?: number; essay?: number };
    };
    const content = (body.content || "").trim().slice(0, 24000);
    if (content.length < 40) return Response.json({ error: "Hãy dán nội dung bài học/chủ đề (tối thiểu 40 ký tự) để AI ra đề bám sát ngữ liệu thật" }, { status: 400 });
    const counts = {
      choice: Math.min(50, Math.max(0, Number(body.counts?.choice) || 0)),
      trueFalse: Math.min(12, Math.max(0, Number(body.counts?.trueFalse) || 0)),
      short: Math.min(20, Math.max(0, Number(body.counts?.short) || 0)),
      essay: Math.min(6, Math.max(0, Number(body.counts?.essay) || 0)),
    };
    const total = counts.choice + counts.trueFalse + counts.short + counts.essay;
    if (!total) return Response.json({ error: "Số lượng câu hỏi phải lớn hơn 0" }, { status: 400 });
    const prompt = `Soạn đề ${body.kind || "kiểm tra"} môn ${body.subject || "Toán"} lớp ${body.grade || "10"} theo định hướng đánh giá năng lực CTGDPT 2018, bám sát NGỮ LIỆU dưới đây (không hỏi ngoài phạm vi ngữ liệu).
Số câu cần tạo: ${counts.choice} câu trắc nghiệm nhiều lựa chọn (4 phương án), ${counts.trueFalse} câu đúng/sai (mỗi câu đúng 4 ý a-b-c-d), ${counts.short} câu trả lời ngắn, ${counts.essay} câu tự luận.
${body.matrixNote ? `Yêu cầu ma trận/mức độ của giáo viên: ${String(body.matrixNote).slice(0, 1500)}` : "Phân bổ mức độ: khoảng 40% Nhận biết, 30% Thông hiểu, 30% Vận dụng."}

NGỮ LIỆU:
${content}

Trả về DUY NHẤT JSON object dạng {"questions":[...]} trong đó mỗi phần tử đúng một trong các cấu trúc:
{"type":"choice","level":"Nhận biết","question":"...","options":["...","...","...","..."],"answer":0,"points":0.25}
{"type":"true_false","level":"Thông hiểu","question":"Ngữ cảnh chung của câu","statements":[{"text":"ý a","answer":true},{"text":"ý b","answer":false},{"text":"ý c","answer":true},{"text":"ý d","answer":false}],"points":1}
{"type":"short","level":"Vận dụng","question":"...","answer":"đáp án ngắn","points":0.5}
{"type":"essay","level":"Vận dụng","question":"...","guide":"hướng dẫn chấm chi tiết","points":2}
"answer" của choice là chỉ số 0-3 của phương án đúng. Tổng điểm toàn đề bằng 10. Tiếng Việt chuẩn, số liệu chính xác, không lặp câu.`;
    const response = await fetch("https://kiraai.vn/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kira-3.5-flash",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Bạn là chuyên gia ra đề kiểm tra phổ thông Việt Nam. Chỉ trả JSON hợp lệ, không Markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const result = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; message?: string };
    if (!response.ok) throw new Error(result.error?.message || result.message || "Kira AI chưa thể tạo đề");
    const raw = result.choices?.[0]?.message?.content || "";
    let parsed: { questions?: unknown[] };
    try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as { questions?: unknown[] }; }
    catch { throw new Error("AI trả về cấu trúc chưa hợp lệ. Vui lòng tạo lại."); }
    const list = Array.isArray(parsed.questions) ? parsed.questions : Array.isArray(parsed) ? parsed as unknown[] : [];
    const questions: ExamQuestion[] = [];
    for (const item of list.slice(0, 100)) {
      const value = item as Record<string, unknown>;
      const level = String(value.level || "Thông hiểu");
      const question = String(value.question || "").trim();
      const points = Math.max(0.1, Number(value.points) || 0.25);
      if (!question) continue;
      if (value.type === "choice") {
        const options = Array.isArray(value.options) ? value.options.map(String).slice(0, 6) : [];
        if (options.length < 2) continue;
        const answer = Math.min(options.length - 1, Math.max(0, Number(value.answer) || 0));
        questions.push({ type: "choice", level, question, options, answer, points });
      } else if (value.type === "true_false") {
        const statements = (Array.isArray(value.statements) ? value.statements : []).slice(0, 4).map((entry) => {
          const statement = entry as Record<string, unknown>;
          return { text: String(statement.text || ""), answer: Boolean(statement.answer) };
        }).filter((entry) => entry.text);
        if (statements.length < 2) continue;
        questions.push({ type: "true_false", level, question, statements, points });
      } else if (value.type === "short") {
        questions.push({ type: "short", level, question, answer: String(value.answer || ""), points });
      } else if (value.type === "essay") {
        questions.push({ type: "essay", level, question, guide: String(value.guide || ""), points });
      }
    }
    if (!questions.length) throw new Error("AI chưa tạo được câu hỏi từ ngữ liệu. Vui lòng bổ sung nội dung và thử lại.");
    return Response.json({ questions });
  } catch (error) { return fail(error); }
}
