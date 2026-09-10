import { getRequestAccount } from "../../auth";

type R2ObjectLike = { body: ReadableStream; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
type R2BucketLike = {
  put: (key: string, value: ReadableStream, options?: { httpMetadata?: { contentType?: string; contentDisposition?: string }; customMetadata?: Record<string, string> }) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectLike | null>;
  head: (key: string) => Promise<(R2ObjectLike & { size?: number }) | null>;
  delete: (key: string) => Promise<void>;
};

const allowedExtensions = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "mp3", "png", "jpg", "jpeg", "webp", "gif", "bmp"]);
const maxBytes = 25 * 1024 * 1024;

async function bucket() {
  const { env } = await import("cloudflare:workers");
  const value = (env as unknown as { BUCKET?: R2BucketLike }).BUCKET;
  if (!value) throw new Error("Kho tệp đính kèm chưa được cấu hình");
  return value;
}

function safeName(name: string) {
  return name.replace(/[\r\n"\\]/g, "_").slice(0, 180);
}

async function identity(request: Request) {
  const result = await getRequestAccount(request);
  if (!result?.account) throw new Error("Cần đăng nhập");
  return result.account;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể xử lý tệp";
  return Response.json({ error: message }, { status: message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : 400 });
}

export async function POST(request: Request) {
  try {
    const account = await identity(request);
    if (!new Set(["teacher", "admin", "student"]).has(account.role)) throw new Error("Tài khoản này không được tải tệp bài tập");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Chưa chọn tệp" }, { status: 400 });
    if (file.size <= 0 || file.size > maxBytes) return Response.json({ error: "Mỗi tệp phải nhỏ hơn 25 MB" }, { status: 413 });
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.has(extension)) return Response.json({ error: "Định dạng tệp chưa được hỗ trợ" }, { status: 415 });
    const id = `assignments/${crypto.randomUUID()}.${extension}`;
    await (await bucket()).put(id, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream", contentDisposition: `inline; filename="${safeName(file.name)}"` },
      customMetadata: { owner: account.accountKey, originalName: safeName(file.name) },
    });
    return Response.json({ file: { id, name: safeName(file.name), type: file.type || "application/octet-stream", size: file.size, url: `/api/assignment-files?id=${encodeURIComponent(id)}` } });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  try {
    await identity(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^assignments\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(id)) return Response.json({ error: "Mã tệp không hợp lệ" }, { status: 400 });
    const object = await (await bucket()).get(id);
    if (!object) return Response.json({ error: "Không tìm thấy tệp" }, { status: 404 });
    const name = safeName(object.customMetadata?.originalName || "hoc-lieu");
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const account = await identity(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^assignments\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(id)) return Response.json({ error: "Mã tệp không hợp lệ" }, { status: 400 });
    const storage = await bucket();
    const object = await storage.head(id);
    if (!object) return Response.json({ deleted: true });
    if (account.role !== "admin" && object.customMetadata?.owner !== account.accountKey) throw new Error("Chỉ người tải tệp được xóa tệp này");
    await storage.delete(id);
    return Response.json({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
