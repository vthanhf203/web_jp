import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";

import { NavBar } from "@/app/components/nav-bar";
import StreakBanner from "@/components/StreakBanner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jp",
});

const notoSerifJp = Noto_Serif_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jp-serif",
});

export const metadata: Metadata = {
  title: "JP Lab | Học tiếng Nhật mỗi ngày",
  description: "Website học Kanji, từ vựng và ngữ pháp JLPT theo lộ trình cá nhân",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body
        className={`${inter.className} ${notoSansJp.variable} ${notoSerifJp.variable} min-h-full`}
      >
        <NavBar />
        <StreakBanner />
        <main className="mx-auto w-full max-w-[1240px] px-4 pb-12 pt-7 lg:pl-[120px] lg:pr-6">
          {children}
        </main>
      </body>
    </html>
  );
}

