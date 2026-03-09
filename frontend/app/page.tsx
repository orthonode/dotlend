"use client";

import Link from "next/link";
import { LendingDashboard } from "@/src/components/LendingDashboard";
import { DepositCollateral } from "@/src/components/DepositCollateral";
import { BorrowHOLLAR } from "@/src/components/BorrowHOLLAR";
import { RepayAndWithdraw } from "@/src/components/RepayAndWithdraw";
import { LiquidationMonitor } from "@/src/components/LiquidationMonitor";

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Testnet notice */}
      <div className="bg-yellow-950/40 border border-yellow-600/40 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-sm text-yellow-200">
          <span className="font-bold text-yellow-400">Testnet deployment.</span>{" "}
          This uses <span className="font-mono text-yellow-300">MockvDOT</span> and{" "}
          <span className="font-mono text-yellow-300">MockHOLLAR</span> — not real assets.
          You need to mint test tokens before you can deposit or borrow.
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/mint"
            className="px-4 py-2 rounded-lg text-sm font-bold bg-yellow-500 text-black hover:bg-yellow-400 transition whitespace-nowrap"
          >
            Mint tokens →
          </Link>
          <a
            href="https://github.com/orthonode/dotlend#testing-the-protocol--step-by-step"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-yellow-500 hover:underline whitespace-nowrap"
          >
            GitHub guide
          </a>
        </div>
      </div>

      {/* Dashboard — Hero is rendered inside LendingDashboard */}
      <LendingDashboard />

      {/* Action grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DepositCollateral />
        <BorrowHOLLAR />
      </div>

      <RepayAndWithdraw />
      <LiquidationMonitor />

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 pt-4 border-t border-[#111]">
        <p>Orthonode Systems | Polkadot Solidity Hackathon 2026</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="https://blockscout-testnet.polkadot.io/address/0xA8b36339C55c664BBe7C59d2d59Abf91f472C8d0" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">LendingPool</a>
          <a href="https://blockscout-testnet.polkadot.io/address/0xff58177D585b5dB022B0773405a40bEC443E512a" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">CollateralVault</a>
          <a href="https://youtu.be/WYxeeyrQLWc" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">Demo Video</a>
          <a href="https://github.com/orthonode/dotlend" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">GitHub</a>
        </div>
      </div>
    </div>
  );
}
