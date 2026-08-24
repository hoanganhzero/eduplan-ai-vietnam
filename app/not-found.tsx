import Link from "next/link";

export default function NotFound() {
  return (
    <main className="pending-page">
      <div className="pending-card">
        <span>◇</span>
        <small>KHÔNG TÌM THẤY TRANG</small>
        <h1>Trang này không tồn tại</h1>
        <p>
          Đường dẫn có thể đã thay đổi hoặc chưa được cấp quyền truy cập. Hãy
          quay lại trang chủ để tiếp tục dạy và học.
        </p>
        <Link href="/">← Về trang chủ EduPlan AI</Link>
      </div>
    </main>
  );
}
