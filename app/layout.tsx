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
    description: "가장 잘하는 AI 모델을 골라 일하고, 당신을 배울수록 성장하는 개인 AI 비서.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "ORBIT — 나와 함께 자라는 AI",
      description: "생각은 맡겨. 나는 자랄게.",
      images: [{ url: new URL("/og.png", base).toString(), width: 1732, height: 907, alt: "새싹처럼 성장하는 ORBIT AI" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ORBIT — 나와 함께 자라는 AI",
      description: "생각은 맡겨. 나는 자랄게.",
      images: [new URL("/og.png", base).toString()],
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
