import type { Metadata } from "next";
import Link from "next/link";
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
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-gray-900 text-white shadow-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight hover:text-gray-200">
              Stock Research Agent
            </Link>
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/" className="rounded px-3 py-1.5 hover:bg-gray-700 transition-colors">
                Discovery
              </Link>
              <Link href="/notes" className="rounded px-3 py-1.5 hover:bg-gray-700 transition-colors">
                Notes
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}

