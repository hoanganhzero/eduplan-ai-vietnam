import { getRequestAccount } from "../../../auth";

type GammaResult = {
  generationId?: string;
  status?: "pending" | "completed" | "failed";
  gammaUrl?: string;
  exportUrl?: string;
  message?: string;
  credits?: { deducted?: number; remaining?: number };
};

async function gammaConfig() {
  const { env } = await import("cloudflare:workers");
  const key = (env as unknown as Record<string, string | undefined>).GAMMA_API_KEY;
  return key?.trim() || "";
}

async function requireTeacher(request: Request) {
  const identity = await getRequestAccount(request);
  if (!identity?.account) throw new Error("Cần đăng nhập");
  if (!new Set(["teacher", "admin"]).has(identity.account.role)) {
    throw new Error("Chỉ giáo viên hoặc quản trị viên được tạo trình chiếu");
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Không thể kết nối Gamma";
  const status = message === "Cần đăng nhập" ? 401 : message.startsWith("Chỉ ") ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    await requireTeacher(request);
    return Response.json({ connected: Boolean(await gammaConfig()), provider: "gamma" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireTeacher(request);
    const key = await gammaConfig();
    if (!key) {
      return Response.json(
        { error: "Gamma chưa được kết nối. Quản trị viên cần thêm GAMMA_API_KEY trong cấu hình website.", code: "GAMMA_NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    const body = (await request.json()) as {
      action?: "generate" | "status";
      generationId?: string;
      lesson?: {
        title?: string;
        subject?: string;
        grade?: string;
        summary?: string;
        objectives?: string[];
        sections?: Array<{
          title?: string;
          content?: string;
          type?: string;
          options?: string[];
          correctAnswer?: string;
          explanation?: string;
        }>;
      };
    };

    if (body.action === "status") {
      const generationId = body.generationId?.trim() || "";
      if (!/^[a-zA-Z0-9_-]{4,100}$/.test(generationId)) {
        return Response.json({ error: "Mã trình chiếu không hợp lệ" }, { status: 400 });
      }
      const response = await fetch(`https://public-api.gamma.app/v1.0/generations/${generationId}`, {
        headers: { "X-API-KEY": key, Accept: "application/json" },
      });
      const result = (await response.json().catch(() => ({}))) as GammaResult;
      if (!response.ok) throw new Error(result.message || "Không thể kiểm tra tiến độ tạo trình chiếu");
      return Response.json(result);
    }

    const lesson = body.lesson;
    if (!lesson?.title?.trim() || !lesson.subject?.trim()) {
      return Response.json({ error: "Vui lòng nhập tên bài học và môn học trước khi tạo slide" }, { status: 400 });
    }
    const sections = (lesson.sections || []).slice(0, 30);
    if (!sections.length) return Response.json({ error: "Bài học cần ít nhất một hoạt động" }, { status: 400 });
    const cards = [
      `# ${lesson.title}\n${lesson.subject} · Lớp ${lesson.grade || "10"}\n${lesson.summary || "Bài trình chiếu phục vụ giảng dạy trực tiếp trên lớp."}`,
      `# Mục tiêu bài học\n${(lesson.objectives || []).filter(Boolean).map((item) => `• ${item}`).join("\n") || "• Nắm được kiến thức trọng tâm\n• Vận dụng vào nhiệm vụ học tập"}`,
      ...sections.map((section, index) => {
        const options = section.type === "quiz" && section.options?.length
          ? `\n\nCâu hỏi nhanh:\n${section.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`).join("\n")}\n\nĐáp án dành cho giáo viên: ${section.correctAnswer || "Chưa thiết lập"}${section.explanation ? `\nGiải thích: ${section.explanation}` : ""}`
          : "";
        return `# Hoạt động ${index + 1}: ${section.title || "Hoạt động học tập"}\n${section.content || "Giáo viên hướng dẫn học sinh thực hiện hoạt động."}${options}`;
      }),
      "# Củng cố và giao nhiệm vụ\n• Tóm tắt ba ý quan trọng của bài học\n• Học sinh nêu một điều đã hiểu và một câu hỏi còn băn khoăn\n• Hướng dẫn nhiệm vụ học tập tiếp theo",
    ];
    const inputText = cards.join("\n---\n").slice(0, 350000);
    const response = await fetch("https://public-api.gamma.app/v1.0/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": key, Accept: "application/json" },
      body: JSON.stringify({
        inputText,
        additionalInstructions: "Thiết kế tối giản, hiện đại, dễ đọc khi chiếu trong lớp học Việt Nam. Chữ lớn, tương phản cao, mỗi trang chỉ tập trung một ý. Giữ nguyên đáp án dành cho giáo viên ở cuối trang câu hỏi.",
        textMode: "preserve",
        format: "presentation",
        cardSplit: "inputTextBreaks",
        cardOptions: { dimensions: "16x9", headerFooter: { bottomRight: { type: "cardNumber" }, hideFromFirstCard: true } },
        textOptions: { language: "vi", tone: "rõ ràng, sư phạm, khích lệ", audience: `học sinh lớp ${lesson.grade || "10"}` },
        imageOptions: { source: "pictographic" },
        sharingOptions: { workspaceAccess: "view", externalAccess: "noAccess" },
        exportAs: "pptx",
      }),
    });
    const result = (await response.json().catch(() => ({}))) as GammaResult;
    if (!response.ok || !result.generationId) {
      throw new Error(result.message || "Gamma chưa thể tạo trình chiếu. Vui lòng thử lại.");
    }
    return Response.json({ generationId: result.generationId, status: "pending" }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

