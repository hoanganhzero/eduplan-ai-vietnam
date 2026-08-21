import { publicRpc } from "../../../supabase";
import { sessionCookie, type Account } from "../../../auth";

const roles = new Set(["teacher", "student", "parent"]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: string;
      username?: string;
      name?: string;
      password?: string;
      role?: string;
    };
    const email = payload.email?.trim().toLowerCase() ?? "";
    const username = payload.username?.trim().toLowerCase() ?? "";
    const name = payload.name?.trim() ?? "";
    const password = payload.password ?? "";
    const role = payload.role ?? "student";
    if ((email && !email.includes("@")) || !/^[a-z0-9._-]{4,30}$/.test(username) || !name) {
      return Response.json({ error: "Thông tin đăng ký chưa hợp lệ" }, { status: 400 });
    }
    if (password.length < 8) return Response.json({ error: "Mật khẩu cần ít nhất 8 ký tự" }, { status: 400 });
    if (!roles.has(role)) return Response.json({ error: "Vai trò không hợp lệ" }, { status: 400 });

    const result = await publicRpc<{ account: Account; message: string }>("eduplan_register", {
      p_email: email,
      p_username: username,
      p_name: name,
      p_password: password,
      p_role: role,
    });
    const login = await publicRpc<{
      authenticated: true;
      account: Account;
      token: string;
      expiresAt: string;
    }>("eduplan_login", { p_identifier: username, p_password: password });
    return Response.json(
      { ...result, authenticated: true, account: login.account },
      { status: 201, headers: { "Set-Cookie": sessionCookie(login.token, login.expiresAt) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đăng ký";
    const status = message.includes("đã được sử dụng") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
