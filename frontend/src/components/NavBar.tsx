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
      <nav className="hidden md:flex items-center gap-1 ml-4">
        {NAV.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`text-sm px-3 py-1.5 rounded-lg transition-all ${
                active
                  ? "font-semibold text-white bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-2.5 ml-auto">
        <Link
          href="/mint"
          className="hidden md:block text-xs px-3 py-1.5 rounded-lg border border-yellow-500/30 text-yellow-400/80 hover:bg-yellow-500/5 hover:text-yellow-400 transition"
        >
          Get tokens
        </Link>
        <ConnectButton />

        {/* Mobile hamburger */}
        <div className="md:hidden relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition text-lg"
            aria-label="Toggle menu"
          >
            {open ? "✕" : "☰"}
          </button>
          {open && (
            <div className="absolute top-full right-0 mt-2 bg-[#0c0c0c] border border-white/10 rounded-xl shadow-2xl p-4 flex flex-col gap-2.5 min-w-[180px] z-50 backdrop-blur-xl">
              {NAV.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm px-3 py-2 rounded-lg transition ${
                    pathname === href
                      ? "font-semibold text-white bg-white/5"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {label}
                </Link>
              ))}
              <hr className="border-white/5" />
              <Link href="/mint" className="text-xs text-yellow-400 px-3 py-1.5">
                Get tokens
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
