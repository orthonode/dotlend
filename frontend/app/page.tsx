"use client";

import { LendingDashboard } from "@/src/components/LendingDashboard";
import { DepositCollateral } from "@/src/components/DepositCollateral";
import { BorrowHOLLAR } from "@/src/components/BorrowHOLLAR";
import { RepayAndWithdraw } from "@/src/components/RepayAndWithdraw";
import { LiquidationMonitor } from "@/src/components/LiquidationMonitor";

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <h1 className="text-3xl font-bold">
          The First Money Market on{" "}
          <span className="text-[#E6007A]">Polkadot Hub</span>
        </h1>
        <p className="text-gray-400 mt-2 text-sm">
          Deposit vDOT. Borrow HOLLAR. Solvency cryptographically proven every 6 hours.
        </p>
      </div>

      {/* Dashboard */}
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
          <a href="https://github.com/orthonode/dotlend" target="_blank" rel="noopener noreferrer" className="hover:text-[#E6007A]">GitHub</a>
        </div>
      </div>
    </div>
  );
}
