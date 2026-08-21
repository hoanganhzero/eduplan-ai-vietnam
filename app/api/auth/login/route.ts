import type { Account } from "../../../auth";
import { sessionCookie } from "../../../auth";
import { publicRpc } from "../../../supabase";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { identifier?: string; password?: string };
    const identifier = payload.identifier?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    if (!identifier || !password) {
      return Response.json({ error: "Vui lòng nhập tên tài khoản/email và mật khẩu" }, { status: 400 });
    }
    const result = await publicRpc<{
      authenticated: true;
      account: Account;
      token: string;
      expiresAt: string;
    }>("eduplan_login", { p_identifier: identifier, p_password: password });
    return Response.json(
      { authenticated: true, account: result.account },
      { headers: { "Set-Cookie": sessionCookie(result.token, result.expiresAt) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đăng nhập";
    const status = message.includes("chờ Admin") || message.includes("bị khóa") ? 403 : 401;
    return Response.json({ error: message }, { status });
  }
}
