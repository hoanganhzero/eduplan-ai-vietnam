import { getRequestAccount } from "../../auth";

async function requireSender(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) throw new Error("Chỉ giáo viên hoặc quản trị viên được gửi thông báo Zalo");
}
async function token() { const { env } = await import("cloudflare:workers"); return ((env as unknown as Record<string, string | undefined>).ZALO_ACCESS_TOKEN || "").trim(); }
function fail(error: unknown) { const message = error instanceof Error ? error.message : "Không thể gửi Zalo"; return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : message.includes("chưa được kết nối") ? 503 : 400 }); }

export async function GET(request: Request) {
  try {
    await requireSender(request);
    return Response.json({ connected: Boolean(await token()), provider: "zalo-oa" });
  } catch (error) { return fail(error); }
}

// Gửi thông báo tới người quan tâm OA. Yêu cầu OA đã được cấp quyền
// gửi tin Truyền thông (v2.0/oa/message) và người nhận đã quan tâm OA.
export async function POST(request: Request) {
  try {
    await requireSender(request);
    const accessToken = await token();
    if (!accessToken) throw new Error("Zalo OA chưa được kết nối. Quản trị viên cần cấu hình ZALO_ACCESS_TOKEN.");
    const body = await request.json() as { title?: string; message?: string; userIds?: string[] };
    const text = `${(body.title || "").trim()}${body.title ? "\n" : ""}${(body.message || "").trim()}`.trim().slice(0, 2000);
    if (!text) return Response.json({ error: "Nội dung thông báo đang trống" }, { status: 400 });
    const userIds = (Array.isArray(body.userIds) ? body.userIds : []).map(String).filter(Boolean).slice(0, 50);
    if (!userIds.length) {
      return Response.json({
        error: "Chưa có danh sách người nhận Zalo (user_id người quan tâm OA). Hãy nhập user_id trong ô người nhận hoặc dùng thông báo trong hệ thống.",
      }, { status: 400 });
    }
    const results: Array<{ userId: string; ok: boolean; detail?: string }> = [];
    for (const userId of userIds) {
      const response = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: accessToken },
        body: JSON.stringify({ recipient: { user_id: userId }, message: { text } }),
      });
      const result = await response.json().catch(() => ({})) as { error?: number; message?: string };
      const ok = response.ok && (!result.error || result.error === 0);
      results.push({ userId, ok, detail: ok ? undefined : result.message || `Mã lỗi Zalo ${result.error ?? response.status}` });
    }
    const sent = results.filter((item) => item.ok).length;
    if (!sent) throw new Error(`Zalo từ chối gửi: ${results[0]?.detail || "không rõ nguyên nhân"}`);
    return Response.json({ sent, failed: results.filter((item) => !item.ok) });
  } catch (error) { return fail(error); }
}
