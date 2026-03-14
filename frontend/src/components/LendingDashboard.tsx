"use client";

import { useEffect, useRef, useState } from "react";
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

function StatCard({ label, value, sub, live }: { label: string; value: string; sub?: string; live?: boolean }) {
  return (
    <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        {live && <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-pulse" />}
        <span className="text-[11px] text-gray-500 uppercase tracking-widest font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white"><FlashValue value={value} /></div>
      {sub && <div className="text-[11px] text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function HealthBar({ hf, hasDebt }: { hf: bigint; hasDebt: boolean }) {
  if (!hasDebt) {
    return (
      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-400">Health Factor</span>
          <span className="font-semibold text-green-400">MAX</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-green-500 w-full transition-all duration-500" />
        </div>
        <div className="text-[11px] text-gray-600 mt-1">No debt — collateral is fully safe</div>
      </div>
    );
  }

  const value = Number(formatEther(hf));
  const pct = Math.min(value / 2, 1) * 100;
  const color = value >= 1.5 ? "#22c55e" : value >= 1.2 ? "#eab308" : "#ef4444";
  const label = value >= 1.5 ? "Safe" : value >= 1.2 ? "At Risk" : "Danger";
  const labelClass = value >= 1.5 ? "text-green-400" : value >= 1.2 ? "text-yellow-400" : "text-red-500";

  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-gray-400">Health Factor</span>
        <span className="flex items-center gap-2">
          <FlashValue value={value.toFixed(2)} className="font-semibold" />
          <span className={`font-semibold ${labelClass}`}>{label}</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${value < 1.2 ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {value < 1.2 && (
        <div className="text-[11px] text-red-400 mt-1">Approaching liquidation threshold (1.0)</div>
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
    <div className="bg-[#080808] border border-white/5 rounded-lg p-3 text-xs space-y-1 font-mono">
      <div className="text-gray-400 font-semibold uppercase tracking-widest text-[10px] mb-1">Stability Fee</div>
      <div className="flex justify-between">
        <span className="text-gray-500">Rate</span>
        <span className="text-white">0.5% / year</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Per day</span>
        <span className="text-white">~${perDay.toFixed(4)} USDH</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">Per hour</span>
        <span className="text-white">~${perHour.toFixed(6)} USDH</span>
      </div>
    </div>
  );
}

function Hero() {
  const heroText = useSolvencyHeroText();
  return (
    <div className="mb-4">
      <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
        The Liquidity Layer for{" "}
        <span className="bg-gradient-to-r from-[#E6007A] to-[#E6007A]/70 bg-clip-text text-transparent">
          Polkadot Hub
        </span>
      </h1>
      <p className="text-gray-400 mt-2 text-sm max-w-xl">
        Deposit any Polkadot asset. Borrow USDH stablecoin.{" "}
        <span className="text-gray-300">{heroText}</span>
      </p>
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

export function LendingDashboard() {
  const { address } = useAccount();
  const { collateralDelta, debtDelta } = useTx();
  const { marketId, setMarketId, addresses, assetSymbol } = useMarket();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [liqDismissed, setLiqDismissed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

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

  const lastUpdatedNum = Number(lastUpdated);
  const ageSec = lastUpdatedNum > 0 ? now - lastUpdatedNum : 0;
  const isStale = lastUpdatedNum > 0 && ageSec > 3600;

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

  const hfNum        = hasDebt ? Number(formatEther(hf)) : 999;
  const dropToLiq    = hasDebt ? ((hfNum - 1) / hfNum * 100).toFixed(0) : "0";
  const showLiqBanner = hasDebt && hfNum < 1.3 && !liqDismissed;

  const priceAge = lastUpdatedNum > 0 ? formatAge(ageSec) : "";
  const priceSub = isStale
    ? "Oracle stale — last known price"
    : lastUpdatedNum > 0 ? `Updated ${priceAge}` : "via PriceOracle on-chain";

  return (
    <div className="space-y-6">
      {showLiqBanner && (
        <div className="flex items-start justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <div className="text-sm text-red-400">
            <span className="font-bold">Liquidation Risk</span> — Your health factor is{" "}
            <span className="font-mono font-bold">{hfNum.toFixed(2)}</span>. A {dropToLiq}% price drop will trigger liquidation.
          </div>
          <button
            onClick={() => setLiqDismissed(true)}
            className="text-gray-500 hover:text-white text-xs shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>
      )}

      <Hero />

      {/* Market Selector */}
      <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-1.5 flex gap-1.5">
        <button
          onClick={() => setMarketId("vdot")}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
            marketId === "vdot"
              ? "bg-[#E6007A] text-white shadow-lg shadow-[#E6007A]/20"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          vDOT Market
        </button>
        <button
          onClick={() => setMarketId("wpas")}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
            marketId === "wpas"
              ? "bg-[#E6007A] text-white shadow-lg shadow-[#E6007A]/20"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          WPAS Market
        </button>
      </div>

      <SolvencyStatus />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label={`${assetSymbol} Price`}
          value={priceDisplay}
          sub={priceSub}
          live={!isStale && lastUpdatedNum > 0}
        />
        <StatCard
          label="LTV Ratio"
          value={ltvDisplay}
          sub="Max 70% | Liquidation 80%"
        />
      </div>

      {address ? (
        <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-5 space-y-4">
          <div className="text-[11px] text-gray-500 uppercase tracking-widest font-medium">Your Position</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] text-gray-500 mb-0.5">Collateral</div>
              <div className="text-lg font-bold"><FlashValue value={collateralDisplay} /></div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-0.5">Debt</div>
              <div className="text-lg font-bold text-[#E6007A]"><FlashValue value={debtDisplay} /></div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {hasDebt ? "0.5%/yr — accrues every second" : "No active debt"}
              </div>
            </div>
          </div>
          {liqPrice && (
            <div className="text-xs text-gray-500 font-mono bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
              Liquidation price: <span className="text-red-400 font-semibold">${liqPrice}</span>
              <span className="text-gray-600 mx-1.5">/</span>
              Current: <span className="text-white font-semibold">{priceDisplay}</span>
            </div>
          )}
          {collateral > 0n && (
            <div className="text-xs text-gray-500 font-mono">
              {maxBorrow > 0
                ? <span>Available to borrow: <span className="text-green-400 font-semibold">${maxBorrow.toFixed(2)} USDH</span></span>
                : <span className="text-yellow-400">Borrow limit reached</span>
              }
            </div>
          )}
          {collateral > 0n && <HealthBar hf={hf} hasDebt={hasDebt} />}
          {hasDebt && <AccruedInterestBadge debt={debt} />}
        </div>
      ) : (
        <div className="gradient-border bg-[#0c0c0c] rounded-xl p-10 text-center">
          <div className="text-gray-500 text-sm">Connect your wallet to view your position</div>
          <div className="text-gray-600 text-xs mt-1">Supports MetaMask, Talisman, SubWallet</div>
        </div>
      )}
    </div>
  );
}
