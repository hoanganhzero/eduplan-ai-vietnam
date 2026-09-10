import { ensureIdentityToken, getRequestAccount, type Account } from "../../../auth";
import { passwordSecurityRpc } from "../../../supabase";

export async function POST(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (!identity?.account) return Response.json({ error: "Cần đăng nhập" }, { status: 401 });
    const token = await ensureIdentityToken(identity);
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await passwordSecurityRpc<{ account: Account; message: string }>("admin_reset", {
      token, accountKey: payload.accountKey, newPassword: payload.newPassword,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đặt lại mật khẩu";
    const status = message === "Cần đăng nhập" ? 401 : message.includes("quản trị viên") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
