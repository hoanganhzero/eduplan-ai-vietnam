import { getChatGPTUser } from "../../chatgpt-auth";
import { getRequestAccount, sessionCookie, type Account } from "../../auth";
import { platformSessionRpc, serverRpc } from "../../supabase";

const allowedRoles = new Set(["teacher", "student", "parent"]);

async function platformSession(email: string) {
  return platformSessionRpc<{
    authenticated: true;
    account: Account;
    token: string;
    expiresAt: string;
  }>(email);
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (identity?.account) {
      const platformUser = identity.source === "platform" ? identity.platformUser : await getChatGPTUser();
      const passwordResetVerified = Boolean(
        platformUser?.email && identity.account.email &&
          platformUser.email.toLowerCase() === identity.account.email.toLowerCase(),
      );
      if (identity.source === "platform") {
        const session = await platformSession(identity.platformUser.email);
        return Response.json(
          { authenticated: true, account: session.account, authSource: "platform", passwordResetVerified },
          { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
        );
      }
      return Response.json({ authenticated: true, account: identity.account, authSource: identity.source, passwordResetVerified });
    }

    const user = identity?.platformUser ?? (await getChatGPTUser());
    if (!user) return Response.json({ authenticated: false, account: null });
    const { count } = await serverRpc<{ count: number }>("count_accounts");
    if (Number(count) === 0) {
      await serverRpc("platform_upsert", { email: user.email, name: user.displayName, role: "admin" });
      const session = await platformSession(user.email);
      return Response.json(
        { authenticated: true, account: session.account, authSource: "platform", passwordResetVerified: true },
        { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
      );
    }
    return Response.json({ authenticated: true, account: null });
  } catch (error) {
    return Response.json(
      { authenticated: false, error: error instanceof Error ? error.message : "Không thể xác thực" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Cần đăng nhập trước khi đăng ký" }, { status: 401 });
    const payload = (await request.json()) as { role?: string };
    const role = payload.role ?? "";
    if (!allowedRoles.has(role)) return Response.json({ error: "Vai trò không hợp lệ" }, { status: 400 });
    await serverRpc("platform_upsert", { email: user.email, name: user.displayName, role });
    const session = await platformSession(user.email);
    return Response.json(
      { authenticated: true, account: session.account, authSource: "platform", passwordResetVerified: true },
      { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể đăng ký" }, { status: 500 });
  }
}
