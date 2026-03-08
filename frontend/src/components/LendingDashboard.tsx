"use client";

import { useEffect, useRef } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { ADDRESSES, VAULT_ABI, ORACLE_ABI } from "@/src/lib/contracts";
import { SolvencyStatus } from "./SolvencyStatus";
import { useTx } from "@/src/lib/tx-context";

// Flash the Polkadot pink on value change
function FlashValue({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      prev.current = value;
      ref.current.classList.remove("flash");
      // Force reflow so re-adding the class restarts the animation
      void ref.current.offsetWidth;
      ref.current.classList.add("flash");
    }
  }, [value]);
  return <span ref={ref} className={className}>{value}</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-5">
      <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">
        <FlashValue value={value} />
      </div>
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
        <FlashValue value={label} className="font-bold" />
      </div>
      <div className="h-2 bg-[#222] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {value < 1.2 && value < 1e15 && (
        <div className="text-xs text-red-400 mt-1">Warning: approaching liquidation threshold</div>
      )}
    </div>
  );
}

const LIQ_THRESHOLD = 0.80;

export function LendingDashboard() {
  const { address } = useAccount();
  const { collateralDelta, debtDelta } = useTx();

  const { data: oracleData } = useReadContracts({
    contracts: [
      { address: ADDRESSES.priceOracle, abi: ORACLE_ABI, functionName: "prices",      args: [ADDRESSES.vdot] },
      { address: ADDRESSES.priceOracle, abi: ORACLE_ABI, functionName: "lastUpdated", args: [ADDRESSES.vdot] },
    ],
    query: { refetchInterval: 15_000 },
  });

  const { data: userData } = useReadContracts({
    contracts: address ? [
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [address] },
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [address] },
    ] : [],
    query: { refetchInterval: 15_000 },
  });

  const vdotPrice   = oracleData?.[0]?.result ?? 0n;
  const lastUpdated = oracleData?.[1]?.result ?? 0n;
  // Apply optimistic deltas so position updates the moment user submits tx
  const collateral  = (userData?.[0]?.result ?? 0n) + collateralDelta;
  const debt        = (userData?.[1]?.result ?? 0n) + debtDelta;

  // Same formula as CollateralVault.sol — computed client-side (oracle-safe)
  const collUSD = collateral * vdotPrice / BigInt(1e18);
  const hf = debt > 0n ? collUSD * 80n * BigInt(1e18) / (debt * 100n) : 0n;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const isStale = lastUpdated > 0n && (nowSec - lastUpdated) > 3600n;

  const ltv = collUSD > 0n
    ? Math.min(Number(formatEther(debt)) / Number(formatEther(collUSD)) * 100, 100)
    : 0;

  const collateralDisplay = `${Number(formatEther(collateral)).toFixed(4)} vDOT`;
  const collUSDDisplay    = `$${Number(formatEther(collUSD)).toFixed(2)}`;
  const debtDisplay       = `${Number(formatEther(debt)).toFixed(4)} HOLLAR`;
  const ltvDisplay        = ltv > 0 ? `${ltv.toFixed(1)}%` : "--";
  const priceDisplay      = vdotPrice > 0n ? `$${Number(formatEther(vdotPrice)).toFixed(2)}` : "--";

  return (
    <div className="space-y-6">
      <SolvencyStatus />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="vDOT Price"
          value={priceDisplay}
          sub={isStale ? "⚠ oracle stale — last known price" : "via PriceOracle on-chain"}
        />
        <StatCard
          label="LTV Ratio"
          value={ltvDisplay}
          sub="Max 70% | Liquidation at 80%"
        />
      </div>

      {address ? (
        <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-widest">Your Position</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Collateral</div>
              <div className="text-lg font-bold">
                <FlashValue value={collateralDisplay} />
              </div>
              <FlashValue value={collUSDDisplay} className="text-xs text-gray-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Debt</div>
              <div className="text-lg font-bold text-[#E6007A]">
                <FlashValue value={debtDisplay} />
              </div>
              <div className="text-xs text-gray-500">0.5%/yr stability fee</div>
            </div>
          </div>
          {collateral > 0n && <HealthBar hf={hf} />}
        </div>
      ) : (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-gray-500">
          Connect wallet to see your position
        </div>
      )}
    </div>
  );
}
