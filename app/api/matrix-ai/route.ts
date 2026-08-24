import { getRequestAccount } from "../../auth";

async function requireTeacher(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) throw new Error("Chỉ giáo viên hoặc quản trị viên được tạo ma trận đề");
}
async function key() { const { env } = await import("cloudflare:workers"); return ((env as unknown as Record<string, string | undefined>).KIRA_API_KEY || "").trim(); }
function fail(error: unknown) { const message = error instanceof Error ? error.message : "Không thể tạo ma trận"; return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : message.includes("chưa được kết nối") ? 503 : 400 }); }

export async function POST(request: Request) {
  try {
    await requireTeacher(request);
    const apiKey = await key();
    if (!apiKey) throw new Error("Kira AI chưa được kết nối. Quản trị viên cần cấu hình KIRA_API_KEY.");
    const body = await request.json() as {
      subject?: string; grade?: string; kind?: string; content?: string;
      targets?: { nlc?: number; ds?: number; tln?: number; tl?: number };
    };
    const content = (body.content || "").trim().slice(0, 24000);
    if (content.length < 30) return Response.json({ error: "Hãy dán phạm vi kiến thức/các chủ đề của kỳ kiểm tra (tối thiểu 30 ký tự)" }, { status: 400 });
    const targets = {
      nlc: Math.min(60, Math.max(0, Number(body.targets?.nlc) || 12)),
      ds: Math.min(20, Math.max(0, Number(body.targets?.ds) || 2)),
      tln: Math.min(30, Math.max(0, Number(body.targets?.tln) || 4)),
      tl: Math.min(10, Math.max(0, Number(body.targets?.tl) || 2)),
    };
    const prompt = `Xây dựng MA TRẬN và BẢN ĐẶC TẢ đề kiểm tra định kì theo Công văn 7991/BGDĐT-GDTrH cho môn ${body.subject || "Toán"} lớp ${body.grade || "10"}, kỳ: ${body.kind || "kiểm tra định kì"}.
Phạm vi kiến thức giáo viên cung cấp:
${content}

Tổng số câu cần phân bổ đúng: ${targets.nlc} câu Nhiều lựa chọn, ${targets.ds} câu "Đúng - Sai" (mỗi câu 4 ý), ${targets.tln} câu Trả lời ngắn, ${targets.tl} câu Tự luận. Phân bổ mức độ toàn đề khoảng 40% Biết, 30% Hiểu, 30% Vận dụng.

Trả về DUY NHẤT JSON object:
{"topics":[{"name":"Tên chủ đề/chương","contents":[{"name":"Nội dung/đơn vị kiến thức","know":"Yêu cầu cần đạt mức Biết","understand":"Yêu cầu cần đạt mức Hiểu","apply":"Yêu cầu cần đạt mức Vận dụng","counts":[nlcBiết,nlcHiểu,nlcVD,dsBiết,dsHiểu,dsVD,tlnBiết,tlnHiểu,tlnVD,tựLuậnBiết,tựLuậnHiểu,tựLuậnVD]}]}]}
Yêu cầu: 2-5 chủ đề, mỗi chủ đề 1-4 nội dung; "counts" là 12 số nguyên ≥ 0; tổng counts toàn bộ phải khớp đúng số câu từng dạng đã nêu; yêu cầu cần đạt viết theo ngôn ngữ chương trình GDPT 2018, cụ thể theo nội dung, không chung chung.`;
    const response = await fetch("https://kiraai.vn/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kira-3.5-flash",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Bạn là chuyên gia khảo thí phổ thông Việt Nam, thành thạo Công văn 7991/BGDĐT-GDTrH. Chỉ trả JSON hợp lệ, không Markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const result = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string }; message?: string };
    if (!response.ok) throw new Error(result.error?.message || result.message || "Kira AI chưa thể tạo ma trận");
    const raw = result.choices?.[0]?.message?.content || "";
    let parsed: { topics?: unknown[] };
    try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as { topics?: unknown[] }; }
    catch { throw new Error("AI trả về cấu trúc chưa hợp lệ. Vui lòng tạo lại."); }
    const topics = (Array.isArray(parsed.topics) ? parsed.topics : []).slice(0, 8).map((topic, topicIndex) => {
      const value = topic as Record<string, unknown>;
      return {
        id: `mt-ai-${topicIndex}`,
        name: String(value.name || `Chủ đề ${topicIndex + 1}`).slice(0, 200),
        contents: (Array.isArray(value.contents) ? value.contents : []).slice(0, 6).map((content, contentIndex) => {
          const item = content as Record<string, unknown>;
          const counts = Array.from({ length: 12 }, (_, index) => Math.min(30, Math.max(0, Math.round(Number((item.counts as unknown[])?.[index]) || 0))));
          return {
            id: `mc-ai-${topicIndex}-${contentIndex}`,
            name: String(item.name || "Nội dung").slice(0, 300),
            know: String(item.know || "").slice(0, 1000),
            understand: String(item.understand || "").slice(0, 1000),
            apply: String(item.apply || "").slice(0, 1000),
            counts,
          };
        }),
      };
    }).filter((topic) => topic.contents.length);
    if (!topics.length) throw new Error("AI chưa tạo được nội dung ma trận. Hãy bổ sung phạm vi kiến thức và thử lại.");
    return Response.json({ topics });
  } catch (error) { return fail(error); }
}
