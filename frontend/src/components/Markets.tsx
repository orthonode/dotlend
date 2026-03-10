"use client";

import { useState } from "react";

interface Asset {
  symbol: string;
  name: string;
  type: "collateral" | "borrow" | "both";
  depositApy?: string;
  borrowApy?: string;
  status: "live" | "mainnet";
}

const ASSETS: Asset[] = [
  {
    symbol: "vDOT",
    name: "Voucher DOT (Bifrost)",
    type: "collateral",
    depositApy: "15% (staking yield)",
    borrowApy: "—",
    status: "live",
  },
  {
    symbol: "USDH / USDH",
    name: "Testnet Stablecoin",
    type: "borrow",
    depositApy: "—",
    borrowApy: "0.5%",
    status: "live",
  },
  {
    symbol: "USDC",
    name: "USD Coin (Snowbridge)",
    type: "both",
    depositApy: "variable",
    borrowApy: "variable",
    status: "mainnet",
  },
  {
    symbol: "wETH",
    name: "Wrapped ETH (Snowbridge)",
    type: "both",
    depositApy: "variable",
    borrowApy: "variable",
    status: "mainnet",
  },
  {
    symbol: "wBTC",
    name: "Wrapped BTC (Snowbridge)",
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
    name: "Polkadot",
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
  
  const filtered = ASSETS.filter(a => filter === "all" || a.status === filter);

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden mt-8">
      {/* Header */}
      <div className="p-6 border-b border-[#222]">
        <h2 className="text-xl font-bold text-white mb-2">DotLend Markets</h2>
        <p className="text-sm text-gray-400">
          The native liquidity layer for Polkadot Hub. Deposit any asset, borrow any asset. 
          Currently live on testnet, with Snowbridge assets arriving for mainnet.
        </p>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 flex gap-2 text-xs border-b border-[#222] bg-[#0a0a0a]">
        {(["all", "live", "mainnet"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg font-bold transition border ${
              filter === f
                ? "bg-[#E6007A] text-white border-[#E6007A]"
                : "border-[#333] text-gray-400 hover:border-[#E6007A]"
            }`}
          >
            {f === "all" ? "All Markets" : f === "live" ? "Live on Testnet" : "Coming to Mainnet"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-gray-500 uppercase tracking-widest bg-[#0a0a0a] border-b border-[#222]">
            <tr>
              <th className="px-6 py-4 font-normal">Asset</th>
              <th className="px-6 py-4 font-normal">Type</th>
              <th className="px-6 py-4 font-normal">Deposit APY</th>
              <th className="px-6 py-4 font-normal">Borrow APY</th>
              <th className="px-6 py-4 font-normal text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222]">
            {filtered.map(asset => (
              <tr key={asset.symbol} className="hover:bg-[#1a1a1a] transition">
                <td className="px-6 py-4">
                  <div className="font-bold text-white mb-0.5 font-mono">{asset.symbol}</div>
                  <div className="text-xs text-gray-500">{asset.name}</div>
                </td>
                <td className="px-6 py-4 text-gray-400">{TYPE_LABEL[asset.type]}</td>
                <td className="px-6 py-4">
                  {asset.depositApy && asset.depositApy !== "—" ? (
                    <span className="text-green-400 font-bold">{asset.depositApy}</span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {asset.borrowApy && asset.borrowApy !== "—" ? (
                    <span className="text-gray-300">{asset.borrowApy}</span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {asset.status === "live" ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Live (Testnet)
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
    </div>
  );
}
