import { getRequestAccount } from "../../../auth";

async function kiraKey() {
  const { env } = await import("cloudflare:workers");
  return ((env as unknown as Record<string, string | undefined>).KIRA_API_KEY || "").trim();
}

async function requireTeacher(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) throw new Error("Chỉ giáo viên hoặc quản trị viên được tạo lời giảng");
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể kết nối Kira AI";
  const status = message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : message.includes("chưa được kết nối") ? 503 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    await requireTeacher(request);
    return Response.json({ connected: Boolean(await kiraKey()), provider: "kira-ai", capabilities: ["narration-script", "vietnamese-tts"] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireTeacher(request);
    const key = await kiraKey();
    if (!key) throw new Error("Kira AI chưa được kết nối. Quản trị viên cần thêm KIRA_API_KEY bí mật trong cấu hình website.");
    const body = await request.json() as { action?: "generate_script" | "speech"; context?: string; slideFileName?: string; text?: string; voice?: string };

    if (body.action === "generate_script") {
      const context = (body.context || "").trim().slice(0, 24000);
      if (!context) return Response.json({ error: "Hãy nhập nội dung bài học trước khi tạo kịch bản" }, { status: 400 });
      const response = await fetch("https://kiraai.vn/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model: "kira-3.5-flash",
          temperature: 0.45,
          messages: [
            { role: "system", content: "Bạn là chuyên gia sư phạm Việt Nam. Viết kịch bản thuyết minh bài giảng tự học ở nhà, giọng tự nhiên, câu ngắn, phát âm rõ. Chia theo Slide 1, Slide 2...; có câu chuyển ý và khoảng dừng. Không dùng bảng Markdown. Chỉ trả về kịch bản." },
            { role: "user", content: `Tệp slide: ${body.slideFileName || "chưa đặt tên"}\nNội dung bài học:\n${context}` },
          ],
        }),
      });
      const result = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; message?: string };
      if (!response.ok) throw new Error(result.error?.message || result.message || "Kira AI chưa thể tạo kịch bản");
      const script = result.choices?.[0]?.message?.content?.trim();
      if (!script) throw new Error("Kira AI chưa trả về nội dung kịch bản");
      return Response.json({ script });
    }

    if (body.action === "speech") {
      const text = (body.text || "").trim().slice(0, 4000);
      if (!text) return Response.json({ error: "Kịch bản giọng đọc đang trống" }, { status: 400 });
      const voices = new Set(["alloy", "echo", "fable", "onyx", "nova"]);
      const voice = voices.has(body.voice || "") ? body.voice : "nova";
      const response = await fetch("https://kiraai.vn/api/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "kira-3.0-flash-tts", input: text, voice, response_format: "mp3" }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
        throw new Error(result.error?.message || result.message || "Kira AI chưa thể tạo giọng đọc");
      }
      return new Response(response.body, { headers: { "Content-Type": response.headers.get("content-type") || "audio/mpeg", "Cache-Control": "private, no-store" } });
    }

    return Response.json({ error: "Thao tác Kira AI không hợp lệ" }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
