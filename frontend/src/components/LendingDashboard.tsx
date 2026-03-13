"use client";

import { useEffect, useRef } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { VAULT_ABI, ORACLE_ABI } from "@/src/lib/contracts";
import { SolvencyStatus, useSolvencyHeroText } from "./SolvencyStatus";
import { useTx } from "@/src/lib/tx-context";
import { useMarket } from "@/src/lib/market-context";

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
          <span className="font-bold text-green-400">MAX — Safe</span>
        </div>
        <div className="h-2 bg-[#222] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-green-500 w-full transition-all duration-500" />
        </div>
        <div className="text-xs text-gray-500 mt-1">No debt — collateral is fully safe</div>
      </div>
    );
  }

  const value = Number(formatEther(hf));
  const pct = Math.min(value / 2, 1) * 100;
  const color = value >= 1.5 ? "#22c55e" : value >= 1.2 ? "#eab308" : "#ef4444";
  const label = value >= 1.5 ? "Safe" : value >= 1.2 ? "At Risk" : "Danger";
  const labelClass = value >= 1.5 ? "text-green-400" : value >= 1.2 ? "text-yellow-400" : "text-red-500";

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">Health Factor</span>
        <span className="flex items-center gap-2">
          <FlashValue value={value.toFixed(2)} className="font-bold" />
          <span className={`font-bold ${labelClass}`}>{label}</span>
        </span>
      </div>
      <div className="h-2 bg-[#222] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${value < 1.2 ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%`, background: color }}
        />
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
        <span className="text-white">~${perDay.toFixed(4)} USDH</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Accruing per hour</span>
        <span className="text-white">~${perHour.toFixed(6)} USDH</span>
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
        The Liquidity Layer for <span className="text-[#E6007A]">Polkadot Hub</span>
      </h1>
      <p className="text-gray-400 mt-2 font-mono text-sm">
        Deposit any Polkadot asset. Borrow any Polkadot asset.{" "}
        <span className="text-gray-300">{heroText}</span>
      </p>
    </div>
  );
}

export function LendingDashboard() {
  const { address } = useAccount();
  const { collateralDelta, debtDelta } = useTx();
  const { marketId, setMarketId, addresses, assetSymbol } = useMarket();

  const { data: oracleData } = useReadContracts({
    contracts: [
      { address: addresses.priceOracle, abi: ORACLE_ABI, functionName: "prices",      args: [addresses.collateral] },
      { address: addresses.priceOracle, abi: ORACLE_ABI, functionName: "lastUpdated", args: [addresses.collateral] },
    ],
    query: { refetchInterval: 15_000 },
  });

  const { data: userData } = useReadContracts({
    contracts: address ? [
      { address: addresses.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [address] },
      { address: addresses.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [address] },
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

  const collNum    = Number(formatEther(collateral));
  const collUSDNum = Number(formatEther(collUSD));
  const debtNum    = Number(formatEther(debt));

  const collateralDisplay = `${collNum.toFixed(2)} ${assetSymbol} ($${collUSDNum.toFixed(2)})`;
  const debtDisplay       = `${debtNum.toFixed(2)} USDH`;
  const ltvDisplay        = ltv > 0 ? `${ltv.toFixed(1)}%` : "--";
  const priceDisplay      = vdotPrice > 0n ? `$${Number(formatEther(vdotPrice)).toFixed(2)}` : "--";

  const liqPrice = (hasDebt && collateral > 0n)
    ? Number(formatEther(debt * 100n * BigInt(1e18) / (collateral * 80n))).toFixed(2)
    : null;

  const maxBorrow = Math.max(0, collUSDNum * 0.70 - debtNum);

  return (
    <div className="space-y-6">
      <Hero />
      
      {/* Market Selector */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-2 flex gap-2">
        <button 
          onClick={() => setMarketId("vdot")}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${marketId === "vdot" ? "bg-[#E6007A] text-white" : "text-gray-400 hover:bg-[#222]"}`}
        >
          vDOT Market
        </button>
        <button 
          onClick={() => setMarketId("wpas")}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${marketId === "wpas" ? "bg-[#E6007A] text-white" : "text-gray-400 hover:bg-[#222]"}`}
        >
          WPAS Market (Native DOT)
        </button>
      </div>

      <SolvencyStatus />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label={`${assetSymbol} Price`} value={priceDisplay}
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
            </div>
            <div>
              <div className="text-xs text-gray-500">Debt</div>
              <div className="text-lg font-bold text-[#E6007A]"><FlashValue value={debtDisplay} /></div>
              <div className="text-xs text-gray-500">
                {hasDebt ? "0.5%/yr — accrues every second" : "No active debt"}
              </div>
            </div>
          </div>
          {liqPrice && (
            <div className="text-xs text-gray-500 font-mono space-y-0.5">
              <div>Liquidation price: <span className="text-red-400">${liqPrice}</span> · Current: <span className="text-white">{priceDisplay}</span></div>
            </div>
          )}
          {collateral > 0n && (
            <div className="text-xs text-gray-500 font-mono">
              {maxBorrow > 0
                ? <span>Available: <span className="text-green-400">${maxBorrow.toFixed(2)} USDH</span></span>
                : <span className="text-yellow-400">Borrow limit reached</span>
              }
            </div>
          )}
          {collateral > 0n && <HealthBar hf={hf} hasDebt={hasDebt} />}
          {hasDebt && <AccruedInterestBadge debt={debt} />}
        </div>
      ) : (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-gray-500">
          Connect your wallet to view your position
        </div>
      )}
    </div>
  );
}
