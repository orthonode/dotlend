"use client";

import { useEffect, useRef } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { ADDRESSES, VAULT_ABI, ORACLE_ABI } from "@/src/lib/contracts";
import { SolvencyStatus, useSolvencyHeroText } from "./SolvencyStatus";
import { useTx } from "@/src/lib/tx-context";

function FlashValue({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      prev.current = value;
      ref.current.classList.remove("flash");
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
      <div className="text-2xl font-bold text-white"><FlashValue value={value} /></div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function HealthBar({ hf, hasDebt }: { hf: bigint; hasDebt: boolean }) {
  if (!hasDebt) {
    return (
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Health Factor</span>
          <span className="font-bold text-green-400">MAX</span>
        </div>
        <div className="h-2 bg-[#222] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-green-500 w-full transition-all duration-500" />
        </div>
        <div className="text-xs text-gray-500 mt-1">No debt — collateral is fully safe</div>
      </div>
    );
  }

  const value = Number(formatEther(hf));
  const capped = Math.min(value, 3);
  const pct = (capped / 3) * 100;
  const color = value >= 1.5 ? "#22c55e" : value >= 1.2 ? "#eab308" : "#ef4444";

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">Health Factor</span>
        <FlashValue value={value.toFixed(3)} className="font-bold" />
      </div>
      <div className="h-2 bg-[#222] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      {value < 1.2 && (
        <div className="text-xs text-red-400 mt-1">⚠ Approaching liquidation threshold (1.0)</div>
      )}
      {value >= 1.2 && value < 1.5 && (
        <div className="text-xs text-yellow-500 mt-1">Healthy — liquidation triggers below 1.0</div>
      )}
    </div>
  );
}

function AccruedInterestBadge({ debt }: { debt: bigint }) {
  if (debt === 0n) return null;
  const debtNum = Number(formatEther(debt));
  const perYear = debtNum * 0.005;
  const perDay  = perYear / 365;
  const perHour = perDay / 24;
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3 text-xs space-y-1 font-mono">
      <div className="text-gray-400 font-bold uppercase tracking-widest mb-1">Stability Fee</div>
      <div className="flex justify-between">
        <span className="text-gray-500">Rate</span>
        <span className="text-white">0.5% / year (5 bps)</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Accruing per day</span>
        <span className="text-white">~${perDay.toFixed(4)} HOLLAR</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Accruing per hour</span>
        <span className="text-white">~${perHour.toFixed(6)} HOLLAR</span>
      </div>
      <div className="text-gray-600 pt-1 border-t border-[#1a1a1a]">
        Accrues every second on-chain. Auto-applied on borrow, repay, and liquidation calls via <span className="text-gray-400">accrueInterest()</span>.
      </div>
    </div>
  );
}

function Hero() {
  const heroText = useSolvencyHeroText();
  return (
    <div className="mb-2">
      <h1 className="text-3xl font-bold leading-tight">
        The First Money Market on <span className="text-[#E6007A]">Polkadot Hub</span>
      </h1>
      <p className="text-gray-400 mt-2 font-mono text-sm">
        Deposit vDOT. Borrow HOLLAR.{" "}
        <span className="text-gray-300">{heroText}</span>
      </p>
    </div>
  );
}

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
  const collateral  = (userData?.[0]?.result ?? 0n) + collateralDelta;
  const debt        = (userData?.[1]?.result ?? 0n) + debtDelta;
  const hasDebt     = debt > 0n;

  const collUSD = collateral * vdotPrice / BigInt(1e18);
  const hf      = hasDebt ? collUSD * 80n * BigInt(1e18) / (debt * 100n) : 0n;

  const nowSec  = BigInt(Math.floor(Date.now() / 1000));
  const isStale = lastUpdated > 0n && (nowSec - lastUpdated) > 3600n;

  const ltv = collUSD > 0n && hasDebt
    ? Math.min(Number(formatEther(debt)) / Number(formatEther(collUSD)) * 100, 100)
    : 0;

  const collateralDisplay = `${Number(formatEther(collateral)).toFixed(4)} vDOT`;
  const collUSDDisplay    = `$${Number(formatEther(collUSD)).toFixed(2)}`;
  const debtDisplay       = `${Number(formatEther(debt)).toFixed(6)} HOLLAR`;
  const ltvDisplay        = ltv > 0 ? `${ltv.toFixed(1)}%` : "--";
  const priceDisplay      = vdotPrice > 0n ? `$${Number(formatEther(vdotPrice)).toFixed(2)}` : "--";

  return (
    <div className="space-y-6">
      <Hero />
      <SolvencyStatus />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="vDOT Price" value={priceDisplay}
          sub={isStale ? "⚠ oracle stale — last known price" : "via PriceOracle on-chain"} />
        <StatCard label="LTV Ratio" value={ltvDisplay}
          sub="Max 70% | Liquidation threshold 80%" />
      </div>

      {address ? (
        <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-widest">Your Position</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Collateral</div>
              <div className="text-lg font-bold"><FlashValue value={collateralDisplay} /></div>
              <FlashValue value={collUSDDisplay} className="text-xs text-gray-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Debt</div>
              <div className="text-lg font-bold text-[#E6007A]"><FlashValue value={debtDisplay} /></div>
              <div className="text-xs text-gray-500">
                {hasDebt ? "0.5%/yr — accrues every second" : "No active debt"}
              </div>
            </div>
          </div>
          {collateral > 0n && <HealthBar hf={hf} hasDebt={hasDebt} />}
          {hasDebt && <AccruedInterestBadge debt={debt} />}
        </div>
      ) : (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-gray-500">
          Connect wallet to see your position
        </div>
      )}
    </div>
  );
}
