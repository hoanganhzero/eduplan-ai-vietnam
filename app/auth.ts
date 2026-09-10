import { getChatGPTUser } from "./chatgpt-auth";
import { platformSessionRpc, serverRpc } from "./supabase";

const COOKIE_NAME = "eduplan_session";

export type Account = {
  accountKey: string;
  email: string | null;
  username: string;
  name: string;
  role: "admin" | "teacher" | "student" | "parent";
  status: "active" | "pending" | "locked";
  hasPassword: boolean;
  avatarKey: string | null;
  avatarUrl: string | null;
  phone: string | null;
  bio: string | null;
  passwordResetRequestedAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SessionIdentity =
  | { account: Account; source: "password"; token: string }
  | {
      account: Account;
      source: "platform";
      platformUser: { email: string; displayName: string };
    }
  | {
      account: null;
      source: "platform";
      platformUser: { email: string; displayName: string };
    };

export function sessionCookie(token: string, expiresAt: string) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function requestSessionToken(request: Request) {
  return cookieValue(request, COOKIE_NAME);
}

export async function deleteRequestSession(request: Request) {
  const token = requestSessionToken(request);
  if (token) await serverRpc("logout", { token });
}

export async function getRequestAccount(request: Request): Promise<SessionIdentity | null> {
  const token = requestSessionToken(request);
  if (token) {
    const result = await serverRpc<{ account: Account | null }>("get_session", { token });
    if (result.account) return { account: result.account, source: "password", token };
  }

  const platformUser = await getChatGPTUser();
  if (!platformUser) return null;
  const result = await serverRpc<{ account: Account | null }>("get_account_by_email", {
    email: platformUser.email,
  });
  if (result.account) return { account: result.account, source: "platform", platformUser };
  return { account: null, source: "platform", platformUser };
}

export async function ensureIdentityToken(identity: SessionIdentity) {
  if (identity.source === "password") return identity.token;
  const result = await platformSessionRpc<{ token: string }>(identity.platformUser.email);
  return result.token;
}

export function publicAccount(account: Account) {
  return account;
}
