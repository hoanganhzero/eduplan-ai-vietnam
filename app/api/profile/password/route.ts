import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureIdentityToken, getRequestAccount, type Account } from "../../../auth";
import { passwordSecurityRpc } from "../../../supabase";

export async function POST(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (!identity?.account) return Response.json({ error: "Cần đăng nhập" }, { status: 401 });
    const token = await ensureIdentityToken(identity);
    const platformUser = identity.source === "platform" ? identity.platformUser : await getChatGPTUser();
    const platformVerified = Boolean(
      platformUser?.email && identity.account.email &&
        platformUser.email.toLowerCase() === identity.account.email.toLowerCase(),
    );
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await passwordSecurityRpc<{ account: Account; message: string }>("change_own", {
      token, currentPassword: payload.currentPassword, newPassword: payload.newPassword, platformVerified,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đổi mật khẩu";
    return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : 400 });
  }
}
