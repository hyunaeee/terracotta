import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "orbit-ai-companion.likecorp817.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);

  return {
    metadataBase: base,
    title: "ORBIT — 나와 함께 자라는 AI",
    description: "가장 잘하는 AI 모델과 대화하고, 사용한 만큼 작은 지식 정원을 가꾸는 개인 AI 비서.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "ORBIT — 나와 함께 자라는 AI",
      description: "무엇이든 물어보세요. 지식은 조용히 자랍니다.",
      images: [{ url: new URL("/og-simple.png", base).toString(), width: 1732, height: 907, alt: "간결한 Orbit 대화와 작은 테라코타 가든" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ORBIT — 나와 함께 자라는 AI",
      description: "무엇이든 물어보세요. 지식은 조용히 자랍니다.",
      images: [new URL("/og-simple.png", base).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
