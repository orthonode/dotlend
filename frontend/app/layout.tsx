import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/src/components/Providers";
import { NavBar } from "@/src/components/NavBar";
import { TxBanner } from "@/src/components/TxBanner";

export const metadata: Metadata = {
  title: "DotLend — First Money Market on Polkadot Hub",
  description: "Deposit vDOT or native DOT. Borrow USDH. Polkadot Hub Money Market.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-white">
        <Providers>
          <header className="sticky top-0 bg-[#0a0a0a] z-10">
            <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <span className="text-lg font-bold tracking-tight">
                  Dot<span className="text-[#E6007A]">Lend</span>
                </span>
                <span className="text-xs text-gray-500 border border-[#222] px-2 py-0.5 rounded hidden sm:inline">
                  Polkadot Hub TestNet
                </span>
              </Link>
              <NavBar />
            </div>
            <TxBanner />
          </header>
          <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
