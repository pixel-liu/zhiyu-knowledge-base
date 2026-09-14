import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "知屿 · 个人知识库",
    template: "%s · 知屿",
  },
  description: "沉淀、连接并选择性分享你的知识。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          storageKey="zhiyu-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
