import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"Job잇다 | 서울형 강소기업 청년 AI 매칭",description:"서울시 청년 고용정책을 실제 채용으로 잇는 해커톤 시연 플랫폼"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ko"><body>{children}</body></html>}
