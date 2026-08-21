import { ensureIdentityToken, getRequestAccount, type Account } from "../../auth";
import { serverRpc } from "../../supabase";

const supported = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (!identity?.account) return new Response("Unauthorized", { status: 401 });
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!key.startsWith("avatars/")) return new Response("Not found", { status: 404 });
    const token = await ensureIdentityToken(identity);
    const owner = await serverRpc<{ exists: boolean }>("avatar_owner", { token, key });
    if (!owner.exists) return new Response("Not found", { status: 404 });
    const { env } = await import("cloudflare:workers");
    const object = await env.BUCKET.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, max-age=3600");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (!identity?.account) return Response.json({ error: "Cần đăng nhập" }, { status: 401 });
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File) || !supported.has(file.type)) {
      return Response.json({ error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP" }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) return Response.json({ error: "Ảnh đại diện tối đa 2 MB" }, { status: 400 });
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `avatars/${crypto.randomUUID()}.${extension}`;
    const { env } = await import("cloudflare:workers");
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    try {
      const token = await ensureIdentityToken(identity);
      const result = await serverRpc<{ account: Account }>("avatar_update", { token, key });
      if (identity.account.avatarKey) await env.BUCKET.delete(identity.account.avatarKey);
      return Response.json(result);
    } catch (error) {
      await env.BUCKET.delete(key);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể cập nhật ảnh đại diện" }, { status: 500 });
  }
}
