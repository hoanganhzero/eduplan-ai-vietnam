import { getRequestAccount } from "../../auth";

async function requireTeacher(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) throw new Error("Chỉ giáo viên hoặc quản trị viên được tạo bài dạy");
  return identity.account;
}
async function key() { const { env } = await import("cloudflare:workers"); return ((env as unknown as Record<string, string | undefined>).KIRA_API_KEY || "").trim(); }
function fail(error: unknown) { const message = error instanceof Error ? error.message : "Không thể tạo bài dạy"; return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : message.includes("chưa được kết nối") ? 503 : 400 }); }

type LessonBundle = {
  objectives: string[];
  competencies: string[];
  materials: string[];
  activities: Array<{ name: string; goal: string; content: string; execution: string; product: string }>;
  worksheets: Array<{ title: string; tasks: string[] }>;
  questions: Array<{ level: string; question: string; answer: string }>;
};

const strings = (value: unknown, max: number) => (Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max) : []);

export async function POST(request: Request) {
  try {
    await requireTeacher(request);
    const apiKey = await key();
    if (!apiKey) throw new Error("Kira AI chưa được kết nối. Quản trị viên cần cấu hình KIRA_API_KEY.");
    const body = await request.json() as { subject?: string; grade?: string; topic?: string; requirements?: string; periods?: number };
    const topic = (body.topic || "").trim();
    if (!topic) return Response.json({ error: "Vui lòng nhập chủ đề bài dạy" }, { status: 400 });
    const prompt = `Soạn kế hoạch bài dạy (KHBD) theo Công văn 5512 và CTGDPT 2018 cho giáo dục thường xuyên Việt Nam.
Môn: ${body.subject || "Ngữ văn"} · Lớp: ${body.grade || "10"} · Số tiết: ${Math.min(8, Math.max(1, Number(body.periods) || 2))}
Chủ đề/bài học: ${topic}
Yêu cầu cần đạt do giáo viên nhập: ${(body.requirements || "Bám sát chương trình môn học").trim().slice(0, 2000)}

Trả về DUY NHẤT một JSON object đúng cấu trúc:
{"objectives":["..."],"competencies":["..."],"materials":["..."],"activities":[{"name":"Hoạt động 1: Mở đầu/Xác định vấn đề","goal":"...","content":"...","execution":"Chuyển giao nhiệm vụ... Thực hiện... Báo cáo... Kết luận...","product":"..."}],"worksheets":[{"title":"Phiếu học tập số 1","tasks":["..."]}],"questions":[{"level":"Nhận biết|Thông hiểu|Vận dụng","question":"...","answer":"..."}]}
Yêu cầu: đúng 4 hoạt động theo 5512 (Mở đầu; Hình thành kiến thức mới; Luyện tập; Vận dụng), mỗi hoạt động đủ 4 bước tổ chức thực hiện; 3-6 mục tiêu kiến thức; 2-4 năng lực/phẩm chất; 2 phiếu học tập, mỗi phiếu 3-5 nhiệm vụ; 8-12 câu hỏi có đáp án chia đều các mức độ. Nội dung tiếng Việt chuẩn sư phạm, cụ thể theo đúng chủ đề, không chung chung.`;
    const response = await fetch("https://kiraai.vn/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kira-3.5-flash",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Bạn là chuyên gia soạn kế hoạch bài dạy 5512 của Việt Nam. Chỉ trả JSON hợp lệ, không Markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const result = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; message?: string };
    if (!response.ok) throw new Error(result.error?.message || result.message || "Kira AI chưa thể tạo bài dạy");
    const raw = result.choices?.[0]?.message?.content || "";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as Record<string, unknown>; }
    catch { throw new Error("AI trả về cấu trúc chưa hợp lệ. Vui lòng tạo lại."); }
    const activities = (Array.isArray(parsed.activities) ? parsed.activities : []).slice(0, 6).map((item) => {
      const value = item as Record<string, unknown>;
      return {
        name: String(value.name || "Hoạt động học tập"),
        goal: String(value.goal || ""),
        content: String(value.content || ""),
        execution: String(value.execution || ""),
        product: String(value.product || ""),
      };
    });
    const worksheets = (Array.isArray(parsed.worksheets) ? parsed.worksheets : []).slice(0, 4).map((item) => {
      const value = item as Record<string, unknown>;
      return { title: String(value.title || "Phiếu học tập"), tasks: strings(value.tasks, 8) };
    });
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, 20).map((item) => {
      const value = item as Record<string, unknown>;
      return { level: String(value.level || "Thông hiểu"), question: String(value.question || ""), answer: String(value.answer || "") };
    }).filter((item) => item.question);
    const bundle: LessonBundle = {
      objectives: strings(parsed.objectives, 8),
      competencies: strings(parsed.competencies, 6),
      materials: strings(parsed.materials, 8),
      activities,
      worksheets,
      questions,
    };
    if (!bundle.activities.length || !bundle.objectives.length) throw new Error("AI chưa tạo được nội dung bài dạy đầy đủ. Vui lòng thử lại.");
    return Response.json({ lesson: bundle });
  } catch (error) { return fail(error); }
}
