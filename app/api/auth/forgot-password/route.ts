import { publicRpc } from "../../../supabase";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { identifier?: string };
    const identifier = String(payload.identifier || "").trim();
    if (!identifier) return Response.json({ error: "Vui lòng nhập tên tài khoản hoặc email" }, { status: 400 });
    const result = await publicRpc<{ requested: true; message: string }>(
      "eduplan_request_password_reset", { p_identifier: identifier },
    );
    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Chưa thể ghi nhận yêu cầu lúc này. Vui lòng thử lại sau." },
      { status: 503 },
    );
  }
}
