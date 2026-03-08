"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { ADDRESSES, VAULT_ABI, ORACLE_ABI } from "@/src/lib/contracts";
import { SolvencyStatus } from "./SolvencyStatus";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function HealthBar({ hf }: { hf: bigint }) {
  const value = Number(formatEther(hf));
  const capped = Math.min(value, 3);
  const pct = (capped / 3) * 100;
  const color = value >= 1.5 ? "#22c55e" : value >= 1.0 ? "#eab308" : "#ef4444";
  const label = value > 1e15 ? "MAX" : value.toFixed(3);

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">Health Factor</span>
        <span style={{ color }} className="font-bold">{label}</span>
      </div>
      <div className="h-2 bg-[#222] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {value < 1.2 && value < 1e15 && (
        <div className="text-xs text-red-400 mt-1">Warning: approaching liquidation threshold</div>
      )}
    </div>
  );
}

export function LendingDashboard() {
  const { address } = useAccount();

  const { data: price } = useReadContract({
    address: ADDRESSES.priceOracle,
    abi: ORACLE_ABI,
    functionName: "getPrice",
    args: [ADDRESSES.vdot],
  });

  const { data: userData } = useReadContracts({
    contracts: address ? [
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [address] },
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [address] },
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "getHealthFactor",   args: [address] },
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "getCollateralValue", args: [address] },
    ] : [],
  });

  const collateral = userData?.[0]?.result ?? 0n;
  const debt      = userData?.[1]?.result ?? 0n;
  const hf        = userData?.[2]?.result ?? 0n;
  const collUSD   = userData?.[3]?.result ?? 0n;
  const vdotPrice = price ?? 0n;

  const ltv = collUSD > 0n
    ? Math.min(Number(formatEther(debt)) / Number(formatEther(collUSD)) * 100, 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ZK Solvency badge */}
      <SolvencyStatus />

      {/* Protocol stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="vDOT Price"
          value={vdotPrice > 0n ? `$${Number(formatEther(vdotPrice)).toFixed(2)}` : "--"}
          sub="via PriceOracle on-chain"
        />
        <StatCard
          label="LTV Ratio"
          value={ltv > 0 ? `${ltv.toFixed(1)}%` : "--"}
          sub="Max 70% | Liquidation at 80%"
        />
      </div>

      {/* User position */}
      {address ? (
        <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-widest">Your Position</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Collateral</div>
              <div className="text-lg font-bold">
                {Number(formatEther(collateral)).toFixed(4)} vDOT
              </div>
              <div className="text-xs text-gray-500">${Number(formatEther(collUSD)).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Debt</div>
              <div className="text-lg font-bold text-[#E6007A]">
                {Number(formatEther(debt)).toFixed(4)} HOLLAR
              </div>
              <div className="text-xs text-gray-500">0.5%/yr stability fee</div>
            </div>
          </div>
          {collateral > 0n && <HealthBar hf={hf} />}
        </div>
      ) : (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-gray-500">
          Connect MetaMask to see your position
        </div>
      )}
    </div>
  );
}
