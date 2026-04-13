import type { Metadata } from "next";

import { NavBar } from "@/app/components/nav-bar";

import "./globals.css";

export const metadata: Metadata = {
  title: "JP Lab | Hoc tieng Nhat moi ngay",
  description: "Website hoc Kanji, tu vung, ngu phap, SRS va quiz JLPT ca nhan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">
        <NavBar />
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-8 lg:px-6">{children}</main>
      </body>
    </html>
  );
}

