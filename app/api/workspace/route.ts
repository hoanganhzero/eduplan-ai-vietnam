import { ensureIdentityToken, getRequestAccount } from "../../auth";
import { workspaceRpc } from "../../supabase";

async function tokenFor(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  return ensureIdentityToken(identity);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể xử lý dữ liệu";
  if (message === "Thao tác dữ liệu không được hỗ trợ") {
    return Response.json(
      { error: "Cơ sở dữ liệu chưa được cập nhật. Quản trị viên hãy chạy tệp supabase/migrations/20260824_online_exam_controls.sql trong SQL Editor của Supabase rồi thử lại." },
      { status: 503 },
    );
  }
  const status = message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const token = await tokenFor(request);
    return Response.json(await workspaceRpc("get", { token }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = await tokenFor(request);
    const payload = await request.json() as {
      action?: string;
      data?: unknown;
      submission?: unknown;
      code?: string;
      toKey?: string;
      body?: string;
      result?: unknown;
    };
    if (payload.action === "submit") {
      if (!payload.submission || typeof payload.submission !== "object") {
        return Response.json({ error: "Bài nộp không hợp lệ" }, { status: 400 });
      }
      return Response.json(await workspaceRpc("submit", { token, submission: payload.submission }));
    }
    if (payload.action === "join_class") {
      return Response.json(await workspaceRpc("join_class", { token, code: String(payload.code || "") }));
    }
    if (payload.action === "send_message") {
      return Response.json(await workspaceRpc("send_message", { token, toKey: String(payload.toKey || ""), body: String(payload.body || "") }));
    }
    if (payload.action === "read_notifications") {
      return Response.json(await workspaceRpc("read_notifications", { token }));
    }
    if (payload.action === "submit_assessment") {
      if (!payload.result || typeof payload.result !== "object") {
        return Response.json({ error: "Bài làm không hợp lệ" }, { status: 400 });
      }
      return Response.json(await workspaceRpc("submit_assessment", { token, result: payload.result }));
    }
    if (!payload.data || typeof payload.data !== "object") {
      return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    if (JSON.stringify(payload.data).length > 800_000) {
      return Response.json({ error: "Dữ liệu vượt quá giới hạn" }, { status: 413 });
    }
    return Response.json(await workspaceRpc("save", { token, data: payload.data }));
  } catch (error) {
    return errorResponse(error);
  }
}
