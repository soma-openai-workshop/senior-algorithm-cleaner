import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Data Portability Smoke Test",
  description: "Google Data Portability API 연결 검증",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
