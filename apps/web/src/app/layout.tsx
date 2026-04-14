import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Research Agent",
  description: "AI-powered stock research and analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

