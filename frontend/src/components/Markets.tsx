"use client";

import { useState } from "react";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { COMMON_ADDRESSES, MARKETS, ORACLE_ABI, EXPLORER } from "@/src/lib/contracts";

interface Asset {
  symbol: string;
  name: string;
  type: "collateral" | "borrow" | "both";
  depositApy?: string;
  borrowApy?: string;
  status: "live" | "mainnet";
  market?: "vDOT" | "WPAS" | "both";
}

const ASSETS: Asset[] = [
  {
    symbol: "vDOT",
    name: "Voucher DOT (Bifrost)",
    type: "collateral",
    depositApy: "15% (staking yield)",
    borrowApy: "—",
    status: "live",
    market: "vDOT",
  },
  {
    symbol: "WPAS",
    name: "Wrapped PAS (Native Gas Token)",
    type: "collateral",
    depositApy: "variable",
    borrowApy: "—",
    status: "live",
    market: "WPAS",
  },
  {
    symbol: "USDH",
    name: "Testnet Stablecoin",
    type: "borrow",
    depositApy: "—",
    borrowApy: "0.5%/yr",
    status: "live",
    market: "both",
  },
  {
    symbol: "USDC",
    name: "USD Coin (via Snowbridge)",
    type: "both",
    depositApy: "variable",
    borrowApy: "variable",
    status: "mainnet",
  },
  {
    symbol: "wETH",
    name: "Wrapped ETH (via Snowbridge)",
    type: "both",
    depositApy: "variable",
    borrowApy: "variable",
    status: "mainnet",
  },
  {
    symbol: "wBTC",
    name: "Wrapped BTC (via Snowbridge)",
    type: "collateral",
    depositApy: "—",
    borrowApy: "—",
    status: "mainnet",
  },
  {
    symbol: "vKSM",
    name: "Voucher KSM (Bifrost)",
    type: "collateral",
    depositApy: "18% (staking yield)",
    borrowApy: "—",
    status: "mainnet",
  },
  {
    symbol: "vETH",
    name: "Voucher ETH (Bifrost)",
    type: "collateral",
    depositApy: "4% (staking yield)",
    borrowApy: "—",
    status: "mainnet",
  },
  {
    symbol: "DOT",
    name: "Polkadot (native)",
    type: "both",
    depositApy: "variable",
    borrowApy: "variable",
    status: "mainnet",
  },
];

const TYPE_LABEL: Record<Asset["type"], string> = {
  collateral: "Collateral",
  borrow: "Borrow",
  both: "Both",
};

export function Markets() {
  const [filter, setFilter] = useState<"all" | "live" | "mainnet">("all");

  const { data: oraclePrices } = useReadContracts({
    contracts: [
      { address: COMMON_ADDRESSES.priceOracle, abi: ORACLE_ABI, functionName: "prices", args: [MARKETS.vdot.collateral] },
      { address: COMMON_ADDRESSES.priceOracle, abi: ORACLE_ABI, functionName: "prices", args: [MARKETS.wpas.collateral] },
    ],
  });

  function fmtPrice(raw: unknown): string {
    if (typeof raw !== "bigint" || raw === 0n) return "—";
    return `$${parseFloat(formatUnits(raw, 18)).toFixed(2)}`;
  }

  const vdotPrice = fmtPrice(oraclePrices?.[0]?.result);
  const wpasPrice = fmtPrice(oraclePrices?.[1]?.result);

  const filtered = ASSETS.filter(a => filter === "all" || a.status === filter);

  return (
    <div className="space-y-6">
      {/* Two live markets callout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Live on Testnet</span>
          </div>
          <div className="text-sm font-bold text-white">vDOT Market</div>
          <div className="text-xs text-gray-500 mt-1">
            Bifrost liquid staked DOT · 15% staking APY · 70% LTV · Borrow USDH
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">Oracle: <span className="text-white font-mono">{vdotPrice}</span></span>
            <a href={`${EXPLORER}/address/${MARKETS.vdot.lendingPool}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#E6007A] hover:underline font-mono">LendingPool ↗</a>
          </div>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold text-green-400 uppercase tracking-widest">Live on Testnet</span>
          </div>
          <div className="text-sm font-bold text-white">WPAS Market</div>
          <div className="text-xs text-gray-500 mt-1">
            Wrapped PAS native gas token · 70% LTV · Borrow USDH
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">Oracle: <span className="text-white font-mono">{wpasPrice}</span></span>
            <a href={`${EXPLORER}/address/${MARKETS.wpas.lendingPool}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#E6007A] hover:underline font-mono">LendingPool ↗</a>
          </div>
        </div>
      </div>

      {/* Full market table */}
      <div className="bg-[#0c0c0c] border border-white/5 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <h2 className="text-xl font-bold text-white mb-2">DotLend Markets</h2>
          <p className="text-sm text-gray-400">
            The native liquidity layer for Polkadot Hub. Two markets live on testnet.
            Snowbridge assets and full Bifrost vToken suite arriving for mainnet.
          </p>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 flex gap-2 text-xs border-b border-white/5 bg-[#080808]">
          {(["all", "live", "mainnet"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg font-bold transition border ${
                filter === f
                  ? "bg-[#E6007A] text-white border-[#E6007A]"
                  : "border-white/10 text-gray-400 hover:border-[#E6007A]"
              }`}
            >
              {f === "all" ? "All Markets" : f === "live" ? "✅ Live on Testnet" : "🔜 Coming to Mainnet"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase tracking-widest bg-[#080808] border-b border-white/5">
              <tr>
                <th className="px-6 py-4 font-normal">Asset</th>
                <th className="px-6 py-4 font-normal">Role</th>
                <th className="px-6 py-4 font-normal">Deposit APY</th>
                <th className="px-6 py-4 font-normal">Borrow APY</th>
                <th className="px-6 py-4 font-normal">Market</th>
                <th className="px-6 py-4 font-normal text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(asset => (
                <tr key={asset.symbol} className="hover:bg-white/[0.02] transition">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white mb-0.5 font-mono">{asset.symbol}</div>
                    <div className="text-xs text-gray-500">{asset.name}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-xs">{TYPE_LABEL[asset.type]}</td>
                  <td className="px-6 py-4">
                    {asset.depositApy && asset.depositApy !== "—" ? (
                      <span className="text-green-400 font-bold text-xs">{asset.depositApy}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {asset.borrowApy && asset.borrowApy !== "—" ? (
                      <span className="text-gray-300 text-xs">{asset.borrowApy}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {asset.market ? (
                      <span className="text-[10px] font-mono text-gray-400">
                        {asset.market === "both" ? "vDOT + WPAS" : asset.market}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-[10px]">Mainnet</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {asset.status === "live" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#E6007A]/10 border border-[#E6007A]/30 text-[#E6007A] text-[10px] font-bold uppercase">
                        🔜 Mainnet
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#080808]">
          <p className="text-[10px] text-gray-600 font-mono">
            Mainnet assets bridged via{" "}
            <a href="https://snowbridge.network" target="_blank" rel="noopener noreferrer" className="text-[#E6007A] hover:underline">
              Snowbridge
            </a>{" "}
            · vTokens sourced from{" "}
            <a href="https://bifrost.io" target="_blank" rel="noopener noreferrer" className="text-[#E6007A] hover:underline">
              Bifrost Finance
            </a>{" "}
            · PriceOracle is token-agnostic — any asset can be added via single address registration
          </p>
        </div>
      </div>
    </div>
  );
}
