import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "서울잇다", description: "서울형 강소기업 청년 매칭" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
