"use client";

// RoadmapAssets.tsx
// Shows current and planned collateral/borrow assets for DotLend.
// Designed to communicate the protocol's multi-asset future to hackathon judges
// and users, while being honest about what's live vs. planned.

import { useState } from "react";

interface Asset {
  symbol: string;
  name: string;
  type: "collateral" | "borrow" | "both";
  status: "live" | "planned" | "blocked";
  source: string;
  apy?: string;
  note: string;
  blockedReason?: string;
  docsUrl?: string;
}

const ASSETS: Asset[] = [
  {
    symbol: "vDOT",
    name: "Voucher DOT",
    type: "collateral",
    status: "live",
    source: "Bifrost",
    apy: "~15%",
    note: "Liquid-staked DOT. Earns Bifrost staking yield while locked as collateral.",
    docsUrl: "https://docs.bifrost.io/products/slpx/vdot",
  },
  {
    symbol: "HOLLAR",
    name: "DotLend Stablecoin",
    type: "borrow",
    status: "live",
    source: "DotLend",
    note: "Mock USD stablecoin. Will be replaced by a proper CDP-backed stable on mainnet.",
  },
  {
    symbol: "vKSM",
    name: "Voucher KSM",
    type: "collateral",
    status: "planned",
    source: "Bifrost",
    apy: "~18%",
    note: "Liquid-staked Kusama. Same Bifrost SLPx architecture as vDOT — requires XCM asset registration on Polkadot Hub.",
    docsUrl: "https://docs.bifrost.io/products/slpx/vksm",
  },
  {
    symbol: "vGLMR",
    name: "Voucher GLMR",
    type: "collateral",
    status: "planned",
    source: "Bifrost",
    apy: "~8%",
    note: "Liquid-staked Moonbeam. Widens DotLend's collateral base to Polkadot's EVM parachain.",
    docsUrl: "https://docs.bifrost.io/products/slpx",
  },
  {
    symbol: "DOT",
    name: "Polkadot",
    type: "collateral",
    status: "planned",
    source: "Native / XCM",
    note: "Native DOT as plain collateral (no yield). Requires XCM bridge from relay chain to Polkadot Hub. Listed on Binance, Coinbase, Kraken.",
    docsUrl: "https://polkadot.network",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    type: "both",
    status: "planned",
    source: "Snowbridge",
    note: "Cross-chain USDC via Snowbridge (Ethereum→Polkadot). Enables borrow-against-stable and USDC lending pools. Listed on all major CEXes.",
    docsUrl: "https://docs.snowbridge.network",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    type: "collateral",
    status: "planned",
    source: "Snowbridge",
    note: "High-value collateral via Snowbridge. Demand from BTC holders wanting Polkadot DeFi yield without selling.",
    docsUrl: "https://docs.snowbridge.network",
  },
  {
    symbol: "ASTR",
    name: "Astar",
    type: "collateral",
    status: "planned",
    source: "XCM",
    note: "Astar Network token, already EVM-compatible. XCM transfer to Polkadot Hub straightforward.",
  },
];

const TYPE_LABEL: Record<Asset["type"], string> = {
  collateral: "Collateral",
  borrow:     "Borrow",
  both:       "Both",
};

const STATUS_STYLES: Record<Asset["status"], { badge: string; dot: string; label: string }> = {
  live:    { badge: "bg-green-500/10 border-green-500/30 text-green-400",  dot: "bg-green-400",  label: "LIVE" },
  planned: { badge: "bg-[#E6007A]/10 border-[#E6007A]/30 text-[#E6007A]", dot: "bg-[#E6007A]",  label: "PLANNED" },
  blocked: { badge: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400", dot: "bg-yellow-400", label: "BLOCKED" },
};

export function RoadmapAssets() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "live" | "planned">("all");

  const filtered = ASSETS.filter(a => filterStatus === "all" || a.status === filterStatus);
  const liveCount    = ASSETS.filter(a => a.status === "live").length;
  const plannedCount = ASSETS.filter(a => a.status === "planned").length;

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-sm font-bold text-white">Supported Assets</div>
        <p className="text-xs text-gray-500 leading-relaxed">
          DotLend&apos;s oracle and vault architecture is token-agnostic —{" "}
          <span className="text-gray-300">any ERC-20 with an on-chain price feed</span> can be
          added as collateral with a single address registration in{" "}
          <code className="text-gray-400">PriceOracle.sol</code>. The roadmap below shows
          where we go once XCM bridges and Snowbridge are stable on mainnet.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 text-xs">
        {(["all", "live", "planned"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-lg font-bold transition border ${
              filterStatus === f
                ? "bg-[#E6007A] text-white border-[#E6007A]"
                : "border-[#333] text-gray-400 hover:border-[#E6007A]"
            }`}
          >
            {f === "all"     ? `All (${ASSETS.length})`      : ""}
            {f === "live"    ? `Live (${liveCount})`          : ""}
            {f === "planned" ? `Planned (${plannedCount})`    : ""}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <div className="space-y-2">
        {filtered.map(asset => {
          const s = STATUS_STYLES[asset.status];
          const isOpen = expanded === asset.symbol;

          return (
            <div key={asset.symbol}
              className={`border rounded-xl overflow-hidden transition-all ${
                asset.status === "live" ? "border-[#2a2a2a]" : "border-[#1a1a1a]"
              }`}
            >
              {/* Row */}
              <button
                onClick={() => setExpanded(isOpen ? null : asset.symbol)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#0a0a0a] transition"
              >
                {/* Symbol + name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm font-mono">{asset.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${s.badge}`}>
                      {s.label}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#2a2a2a] text-gray-500">
                      {TYPE_LABEL[asset.type]}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{asset.name} · {asset.source}</div>
                </div>

                {/* APY (if any) */}
                {asset.apy && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-gray-500">Yield</div>
                    <div className="text-sm font-bold text-green-400">{asset.apy}</div>
                  </div>
                )}

                <span className="text-gray-600 text-xs flex-shrink-0">{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-[#1a1a1a] space-y-2 text-xs font-mono text-gray-500 bg-[#0a0a0a]">
                  <p className="text-gray-400 leading-relaxed">{asset.note}</p>

                  {asset.blockedReason && (
                    <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-lg px-3 py-2 text-yellow-500">
                      ⚠ {asset.blockedReason}
                    </div>
                  )}

                  {asset.status === "planned" && (
                    <div className="text-gray-600">
                      Prerequisites: asset registered on Polkadot Hub TestNet + price feed live in{" "}
                      <span className="text-gray-400">PriceOracle.sol</span>. No contract changes required.
                    </div>
                  )}

                  {asset.docsUrl && (
                    <a href={asset.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[#E6007A] hover:underline inline-block">
                      Docs →
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Architecture note */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-4 text-xs font-mono space-y-2 text-gray-500">
        <div className="text-gray-300 font-bold uppercase tracking-widest text-[10px] mb-2">
          How multi-asset works on mainnet
        </div>
        <div>
          <span className="text-gray-400">PriceOracle.sol</span> — stores a{" "}
          <span className="text-gray-400">mapping(address token → uint256 price)</span>. Adding a new
          asset is a single oracle call. No vault redeployment.
        </div>
        <div>
          <span className="text-gray-400">CollateralVault.sol</span> — currently single-asset (vDOT).
          Multi-asset version uses a{" "}
          <span className="text-gray-400">mapping(address token → mapping(address user → uint256))</span>{" "}
          pattern. 1 storage slot per user per token.
        </div>
        <div>
          <span className="text-gray-400">Price feeds</span> — planned migration from Python oracle to{" "}
          <a href="https://docs.hyperbridge.network/developers/ismp" target="_blank" rel="noopener noreferrer"
            className="text-[#E6007A] hover:underline">
            Hyperbridge ISMP
          </a>{" "}
          for trustless cross-chain price delivery. CoinGecko / Chainlink as fallback.
        </div>
        <div>
          <span className="text-gray-400">ZK solvency proof</span> — scales linearly. Noir circuit
          iterates over collateral array; adding tokens adds loop iterations, not new circuits.
        </div>
      </div>
    </div>
  );
}
