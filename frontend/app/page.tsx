"use client";

import { useState } from "react";
import Link from "next/link";
import { LendingDashboard } from "@/src/components/LendingDashboard";
import { DepositCollateral } from "@/src/components/DepositCollateral";
import { BorrowUSDH } from "@/src/components/BorrowUSDH";
import { RepayAndWithdraw } from "@/src/components/RepayAndWithdraw";
import { LiquidationMonitor } from "@/src/components/LiquidationMonitor";
import { ProtocolStats } from "@/src/components/ProtocolStats";
import { Markets } from "@/src/components/Markets";
import { MARKETS } from "@/src/lib/contracts";

type Tab = "dashboard" | "markets" | "analytics";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div className="space-y-8">
      {/* Testnet notice */}
      <div className="bg-yellow-950/40 border border-yellow-600/40 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-sm text-yellow-200">
          <span className="font-bold text-yellow-400">Testnet deployment.</span>{" "}
          This uses <span className="font-mono text-yellow-300">vDOT</span> and{" "}
          <span className="font-mono text-yellow-300">USDH</span> — not real assets.
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

      {/* Hero & Navigation Tabs */}
      <div>
        <LendingDashboard />

        <div className="flex gap-4 border-b border-[#222] mt-8 mb-6">
          {(["dashboard", "markets", "analytics"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-bold capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-[#E6007A] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "dashboard" && (
          <div className="space-y-6 slide-enter">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DepositCollateral />
              <BorrowUSDH />
            </div>
            <RepayAndWithdraw />
          </div>
        )}

        {activeTab === "markets" && (
          <div className="slide-enter">
            <Markets />
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6 slide-enter">
            <ProtocolStats />
            <LiquidationMonitor />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 pt-8 mt-12 border-t border-[#111]">
        <p>Orthonode Systems | Polkadot Solidity Hackathon 2026</p>
        <div className="flex justify-center flex-wrap gap-4 mt-3">
          <a href={`https://blockscout-testnet.polkadot.io/address/${MARKETS.vdot.lendingPool}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">vDOT LendingPool</a>
          <a href={`https://blockscout-testnet.polkadot.io/address/${MARKETS.wpas.lendingPool}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">WPAS LendingPool</a>
          <a href="https://youtu.be/Oj9luiA8mJM" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">Demo Video</a>
          <a href="https://github.com/orthonode/dotlend" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">GitHub</a>
        </div>
      </div>
    </div>
  );
}
