import { ensureIdentityToken, getRequestAccount, type Account } from "../../auth";
import { serverRpc } from "../../supabase";

export async function PATCH(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (!identity?.account) return Response.json({ error: "Cần đăng nhập" }, { status: 401 });
    const token = await ensureIdentityToken(identity);
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await serverRpc<{ account: Account; message: string }>("profile_update", { token, ...payload });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể cập nhật hồ sơ";
    const status = message.includes("đã được sử dụng") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
