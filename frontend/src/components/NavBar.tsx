"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ConnectButton } from "./ConnectButton";

const NAV = [
  { label: "Dashboard", href: "/" },
  { label: "Analytics", href: "/analytics" },
  { label: "Markets", href: "/markets" },
  { label: "AI Advisor", href: "/advisor" },
];

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="flex-1 flex items-center justify-between">
      {/* Desktop nav links */}
      <nav className="hidden md:flex items-center gap-6 ml-6">
        {NAV.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`text-sm transition-colors ${
                active
                  ? "font-bold text-white border-b-2 border-[#E6007A] pb-0.5"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right side: desktop actions + mobile hamburger */}
      <div className="flex items-center gap-3 ml-auto">
        <Link
          href="/mint"
          className="hidden md:block text-xs px-3 py-1.5 rounded-lg border border-yellow-600/50 text-yellow-400 hover:bg-yellow-600/10 transition"
        >
          Get tokens
        </Link>
        <ConnectButton />

        {/* Mobile hamburger */}
        <div className="md:hidden relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-gray-400 hover:text-white p-1 text-lg"
            aria-label="Toggle menu"
          >
            ☰
          </button>
          {open && (
            <div className="absolute top-full right-0 mt-2 bg-[#0a0a0a] border border-[#222] rounded-lg shadow-lg p-4 flex flex-col gap-3 min-w-[160px] z-50">
              {NAV.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm ${
                    pathname === href ? "font-bold text-[#E6007A]" : "text-gray-400"
                  }`}
                >
                  {label}
                </Link>
              ))}
              <hr className="border-[#222]" />
              <Link href="/mint" className="text-xs text-yellow-400">
                Get tokens
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
