"use client";

// ProtocolStats.tsx
// Shows live protocol revenue stats — total revenue collected, treasury balance,
// TVL, borrowers. Reads directly from TreasuryRouter, LendingPool, CollateralVault.
// Revenue model: stability fee (0.5%/yr) accrues to treasury. Fee routing
// evolves in phases via on-chain governance.

import { useReadContracts, usePublicClient } from "wagmi";
import { useEffect, useState } from "react";
import { formatEther, parseAbiItem } from "viem";
import {
  POOL_ABI,
  VAULT_ABI,
  ORACLE_ABI,
  EXPLORER,
} from "@/src/lib/contracts";
import { useMarket } from "@/src/lib/market-context";

// ── Treasury Router ABI ────────────────────────────────────────
const ROUTER_ABI = [
  {
    name: "totalFeesCollected",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "treasury",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// ── ERC20 balanceOf for treasury USDH balance ───────────────────────────────
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#080808] border border-white/5 rounded-xl p-4 space-y-1">
      <div className="text-[10px] text-gray-600 uppercase tracking-widest">
        {label}
      </div>
      <div
        className={`text-xl font-bold font-mono ${accent ? "text-[#E6007A]" : "text-white"}`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-600 font-mono">{sub}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProtocolStats() {
  const client = usePublicClient();
  const [uniqueBorrowers, setUniqueBorrowers] = useState<number | null>(null);
  const { addresses, assetSymbol } = useMarket();

  // Core stats from contracts
  const { data } = useReadContracts({
    contracts: [
      {
        address: addresses.treasuryRouter,
        abi: ROUTER_ABI,
        functionName: "totalFeesCollected",
      },
      {
        address: addresses.treasuryRouter,
        abi: ROUTER_ABI,
        functionName: "treasury",
      },
      {
        address: addresses.priceOracle,
        abi: ORACLE_ABI,
        functionName: "prices",
        args: [addresses.collateral],
      },
    ],
    query: { refetchInterval: 30_000 },
  });

  const feesCollected = (data?.[0]?.result as bigint) ?? 0n;
  const treasuryAddr = (data?.[1]?.result as string) ?? null;
  const collateralPrice = (data?.[2]?.result as bigint) ?? 0n;

  // Treasury USDH balance — only fetch once we have the address
  const { data: treasuryBalData } = useReadContracts({
    contracts: treasuryAddr
      ? [
          {
            address: addresses.usdh,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [treasuryAddr as `0x${string}`],
          },
        ]
      : [],
    query: { refetchInterval: 30_000, enabled: !!treasuryAddr },
  });
  const treasuryBalance = (treasuryBalData?.[0]?.result as bigint) ?? 0n;

  // Scan Borrowed events for unique borrower count
  useEffect(() => {
    if (!client) return;
    (async () => {
      try {
        const logs = await client.getLogs({
          address: addresses.lendingPool,
          event: parseAbiItem(
            "event Borrowed(address indexed user, uint256 usdhAmount)",
          ),
          fromBlock: 0n,
          toBlock: "latest",
        });
        const unique = new Set(logs.map((l) => l.args.user)).size;
        setUniqueBorrowers(unique);
      } catch {
        setUniqueBorrowers(0);
      }
    })();
  }, [client]);

  // Scan Deposited events for TVL (total collateral deposited - withdrawn)
  const [tvlCollateral, setTvlCollateral] = useState<bigint | null>(null);
  useEffect(() => {
    if (!client) return;
    (async () => {
      try {
        const deposited = await client.getLogs({
          address: addresses.collateralVault,
          event: parseAbiItem(
            "event Deposited(address indexed user, uint256 amount)",
          ),
          fromBlock: 0n,
          toBlock: "latest",
        });
        const withdrawn = await client.getLogs({
          address: addresses.collateralVault,
          event: parseAbiItem(
            "event Withdrawn(address indexed user, uint256 amount)",
          ),
          fromBlock: 0n,
          toBlock: "latest",
        });
        const totalDeposited = deposited.reduce(
          (s, l) => s + (l.args.amount as bigint),
          0n,
        );
        const totalWithdrawn = withdrawn.reduce(
          (s, l) => s + (l.args.amount as bigint),
          0n,
        );
        setTvlCollateral(totalDeposited - totalWithdrawn);
      } catch {
        setTvlCollateral(0n);
      }
    })();
  }, [client]);

  const tvlUSD =
    tvlCollateral !== null && collateralPrice > 0n
      ? Number(formatEther((tvlCollateral * collateralPrice) / BigInt(1e18))).toFixed(2)
      : "--";

  const revenueF = Number(formatEther(feesCollected)).toFixed(4);
  const treasF = Number(formatEther(treasuryBalance)).toFixed(4);

  const stabilityFeeRate = "0.5%/yr on all debt";

  return (
    <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Protocol Stats</div>
          <a
            href={`${EXPLORER}/address/${addresses.lendingPool}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#E6007A] hover:underline font-mono"
          >
            LendingPool on Blockscout →
          </a>
        </div>
        <p className="text-xs text-gray-500 font-mono">
          All values read live from on-chain state. Revenue is verifiable by
          anyone.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Total Protocol Revenue"
          value={`${revenueF} USDH`}
          sub={`Treasury balance: ${treasF} USDH`}
          accent
        />
        <Stat
          label="TVL"
          value={`$${tvlUSD}`}
          sub={
            tvlCollateral !== null
              ? `${Number(formatEther(tvlCollateral)).toFixed(4)} ${assetSymbol} locked`
              : "Loading..."
          }
        />
        <Stat
          label="Unique Borrowers"
          value={uniqueBorrowers !== null ? String(uniqueBorrowers) : "--"}
          sub="All-time, from Borrowed events"
        />
        <Stat
          label="Stability Fee"
          value={stabilityFeeRate}
          sub="Accrued continuously on all debt"
        />
      </div>

      {/* Revenue model explainer */}
      <div className="bg-[#080808] border border-white/5 rounded-lg p-4 text-xs font-mono space-y-3">
        <div className="text-gray-300 font-bold uppercase tracking-widest text-[10px]">
          Fee Distribution
        </div>
        <div className="space-y-2 text-gray-500">
          <div className="flex justify-between">
            <span>Stability fee</span>
            <span className="text-white">{stabilityFeeRate}</span>
          </div>
          <div className="flex justify-between">
            <span>Principal on repay</span>
            <span className="text-white">Burned (testnet) · returns to reserve (mainnet)</span>
          </div>
        </div>
        <div className="border-t border-white/5 pt-3 space-y-1 text-gray-600">
          <div>
            <span className="text-gray-400">Phase 1 (testnet):</span> stability fee → deployer wallet
          </div>
          <div>
            <span className="text-gray-400">Phase 2 (mainnet):</span> stability fee →{" "}
            <span className="text-[#E6007A]">buy DOT on Hydration via XCM</span>
          </div>
          <div>
            <span className="text-gray-400">Phase 3 (governance token):</span> buy DOTLEND → burn
          </div>
          <div className="mt-2">
            At <span className="text-gray-400">$10M TVL</span>:{" "}
            <span className="text-[#E6007A]">~$50K/yr</span> total revenue
            &nbsp;·&nbsp;
            At <span className="text-gray-400">$40M TVL</span>:{" "}
            <span className="text-[#E6007A]">~$200K/yr</span>
            &nbsp;·&nbsp;
            At <span className="text-gray-400">$100M TVL</span>:{" "}
            <span className="text-[#E6007A]">~$500K/yr</span>
          </div>
        </div>
      </div>

      {/* Treasury address */}
      {treasuryAddr && (
        <div className="text-[10px] text-gray-600 font-mono">
          Treasury:{" "}
          <a
            href={`${EXPLORER}/address/${treasuryAddr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-[#E6007A]"
          >
            {treasuryAddr}
          </a>
        </div>
      )}
    </div>
  );
}
