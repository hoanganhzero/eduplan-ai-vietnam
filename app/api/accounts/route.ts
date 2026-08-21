import { ensureIdentityToken, getRequestAccount, type Account } from "../../auth";
import { serverRpc } from "../../supabase";

async function adminToken(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  return ensureIdentityToken(identity);
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Cần đăng nhập" ? 401 : message.includes("quản trị viên") ? 403 : message.includes("đã được sử dụng") ? 409 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const token = await adminToken(request);
    return Response.json(await serverRpc<{ accounts: Account[] }>("list_accounts", { token }));
  } catch (error) {
    return errorResponse(error, "Không thể tải tài khoản");
  }
}

export async function POST(request: Request) {
  try {
    const token = await adminToken(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await serverRpc<{ account: Account }>("admin_create", { token, ...payload });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Không thể tạo tài khoản");
  }
}

export async function PATCH(request: Request) {
  try {
    const token = await adminToken(request);
    const payload = (await request.json()) as Record<string, unknown>;
    return Response.json(await serverRpc<{ account: Account }>("admin_update", { token, ...payload }));
  } catch (error) {
    return errorResponse(error, "Không thể cập nhật tài khoản");
  }
}

export async function DELETE(request: Request) {
  try {
    const token = await adminToken(request);
    const url = new URL(request.url);
    const accountKey = url.searchParams.get("accountKey") || url.searchParams.get("email") || "";
    return Response.json(await serverRpc<{ deleted: true }>("admin_delete", { token, accountKey }));
  } catch (error) {
    return errorResponse(error, "Không thể xóa tài khoản");
  }
}
