"use client";

import Link from "next/link";
import { LendingDashboard } from "@/src/components/LendingDashboard";
import { DepositCollateral } from "@/src/components/DepositCollateral";
import { BorrowUSDH } from "@/src/components/BorrowUSDH";
import { RepayAndWithdraw } from "@/src/components/RepayAndWithdraw";
import { MARKETS } from "@/src/lib/contracts";

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Testnet notice — compact */}
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-sm text-yellow-200/80">
          <span className="font-semibold text-yellow-400">Testnet.</span>{" "}
          Using test <span className="font-mono text-yellow-300/80">vDOT</span>,{" "}
          <span className="font-mono text-yellow-300/80">WPAS</span> and{" "}
          <span className="font-mono text-yellow-300/80">USDH</span> — not real assets.
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/mint"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 text-black hover:bg-yellow-400 transition whitespace-nowrap"
          >
            Get tokens
          </Link>
          <a
            href="https://github.com/orthonode/dotlend#testing-the-protocol--step-by-step"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-yellow-500/70 hover:text-yellow-400 transition whitespace-nowrap"
          >
            Guide
          </a>
        </div>
      </div>

      <LendingDashboard />

      {/* Action forms */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DepositCollateral />
          <BorrowUSDH />
        </div>
        <RepayAndWithdraw />
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 pt-8 mt-12 border-t border-white/5">
        <p className="font-medium">Orthonode Systems | Polkadot Solidity Hackathon 2026</p>
        <div className="flex justify-center flex-wrap gap-4 mt-3">
          <a href={`https://blockscout-testnet.polkadot.io/address/${MARKETS.vdot.lendingPool}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A] transition">vDOT Pool</a>
          <a href={`https://blockscout-testnet.polkadot.io/address/${MARKETS.wpas.lendingPool}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A] transition">WPAS Pool</a>
          <a href="https://youtu.be/Oj9luiA8mJM" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A] transition">Demo</a>
          <a href="https://youtu.be/1zx_H9QyJIU" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A] transition">Full Walkthrough (22 min)</a>
          <a href="https://github.com/orthonode/dotlend" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A] transition">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
