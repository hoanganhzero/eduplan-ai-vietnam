import { ensureIdentityToken, getRequestAccount } from "../../auth";
import { learningRpc } from "../../supabase";

async function tokenFor(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  return ensureIdentityToken(identity);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể xử lý bài học eLearning";
  const status = message === "Cần đăng nhập" ? 401 : message.includes("quyền") || message.includes("Chỉ ") ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const token = await tokenFor(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    return Response.json(
      await learningRpc(id ? "get" : "list", id ? { token, id } : { token }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = await tokenFor(request);
    const body = (await request.json()) as { action?: string; [key: string]: unknown };
    const action = body.action ?? "";
    if (!new Set(["save", "publish", "unpublish", "duplicate", "delete", "save_progress"]).has(action)) {
      return Response.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
    }
    const payload = { ...body };
    delete payload.action;
    return Response.json(await learningRpc(action, { token, ...payload }));
  } catch (error) {
    return errorResponse(error);
  }
}
