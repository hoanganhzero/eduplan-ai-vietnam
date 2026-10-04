import { ensureIdentityToken, getRequestAccount } from "../../../auth";
import { classImportRpc } from "../../../supabase";
import { parseClassWorkbook } from "../../../class-import";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể nhập danh sách lớp";
  const status = message === "Cần đăng nhập" ? 401 : message.includes("quản trị viên") ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestAccount(request);
    if (!identity?.account) throw new Error("Cần đăng nhập");
    const token = await ensureIdentityToken(identity);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Vui lòng chọn tệp Excel .xlsx");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Chỉ hỗ trợ tệp Excel định dạng .xlsx");
    if (file.size > 8 * 1024 * 1024) throw new Error("Tệp Excel không được lớn hơn 8 MB");
    const payload = await parseClassWorkbook(await file.arrayBuffer());
    const result = await classImportRpc<{
      createdClasses: number;
      updatedClasses: number;
      assignedStudents: number;
      assignedSubjects: number;
      errors: Array<{ sheet: string; rowNumber: number; message: string }>;
    }>(token, payload);
    if (result.errors.length) return Response.json({ ...result, error: "Tệp có dữ liệu chưa hợp lệ; chưa có thay đổi nào được lưu" }, { status: 422 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
