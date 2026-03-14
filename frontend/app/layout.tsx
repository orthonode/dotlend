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
      <body className="min-h-screen bg-[#050505] text-white">
        <Providers>
          <header className="sticky top-0 z-10 backdrop-blur-xl bg-[#050505]/80 border-b border-white/5">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-[#E6007A] flex items-center justify-center text-white font-extrabold text-sm">
                  D
                </div>
                <span className="text-lg font-bold tracking-tight">
                  Dot<span className="text-[#E6007A]">Lend</span>
                </span>
                <span className="text-[10px] text-gray-500 border border-white/10 px-1.5 py-0.5 rounded hidden sm:inline font-mono">
                  TestNet
                </span>
              </Link>
              <NavBar />
            </div>
            <TxBanner />
          </header>
          <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
