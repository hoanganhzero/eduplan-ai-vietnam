import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "./toast.css";
import "./features.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-vietnamese",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduPlan AI | Trợ lý soạn giảng cho giáo viên Việt Nam",
  description:
    "Nền tảng dạy và học số cho giáo viên, học sinh và phụ huynh: tạo kế hoạch bài dạy 5512, bài eLearning tương tác, trình chiếu trên lớp, đề kiểm tra và chấm bài bằng AI.",
  applicationName: "EduPlan AI",
  keywords: ["EduPlan AI", "giáo án 5512", "eLearning", "soạn giảng AI", "kiểm tra đánh giá", "CTGDPT 2018"],
  openGraph: {
    title: "EduPlan AI | Nền tảng dạy và học số",
    description:
      "Giáo viên soạn giảng bằng AI, học sinh học và nộp bài trực tuyến, nhà trường theo dõi mọi hoạt động trong một nơi duy nhất.",
    siteName: "EduPlan AI",
    locale: "vi_VN",
    type: "website",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${beVietnamPro.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
