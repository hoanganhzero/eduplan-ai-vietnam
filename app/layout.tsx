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
  title: "Trung tâm GDNN-GDTX khu vực Tân Ninh",
  description:
    "Website chính thức của Trung tâm Giáo dục nghề nghiệp - Giáo dục thường xuyên khu vực Tân Ninh: giới thiệu, tin tức - sự kiện, tuyển sinh, đào tạo nghề, văn bản và hệ thống học tập trực tuyến EduPlan AI.",
  applicationName: "GDNN-GDTX Tân Ninh",
  keywords: [
    "Trung tâm GDNN-GDTX Tân Ninh",
    "giáo dục thường xuyên",
    "giáo dục nghề nghiệp",
    "tuyển sinh",
    "đào tạo nghề",
    "EduPlan AI",
  ],
  openGraph: {
    title: "Trung tâm GDNN-GDTX khu vực Tân Ninh",
    description:
      "Giới thiệu, tin tức, tuyển sinh và đào tạo của Trung tâm; hệ thống học tập trực tuyến EduPlan AI dành cho giáo viên, học viên và phụ huynh.",
    siteName: "GDNN-GDTX Tân Ninh",
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
