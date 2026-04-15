import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";

import { NavBar } from "@/app/components/nav-bar";

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
  title: "JP Lab | Hoc tieng Nhat moi ngay",
  description: "Website hoc Kanji, tu vung va ngu phap JLPT theo lo trinh ca nhan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body
        className={`${inter.className} ${notoSansJp.variable} ${notoSerifJp.variable} min-h-full`}
      >
        <NavBar />
        <main className="mx-auto w-full max-w-[1240px] px-4 pb-12 pt-7 lg:pl-[120px] lg:pr-6">
          {children}
        </main>
      </body>
    </html>
  );
}

