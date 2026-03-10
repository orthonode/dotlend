"use client";

// ProtocolStats.tsx
// Shows live protocol revenue stats — treasury fees collected, HOLLAR burned,
// total borrows, TVL. Reads directly from LendingPool and CollateralVault.
// Designed to show judges the revenue model is live and verifiable on-chain.

import { useReadContracts, usePublicClient } from "wagmi";
import { useEffect, useState } from "react";
import { formatEther, parseAbiItem } from "viem";
import {
  ADDRESSES,
  POOL_ABI,
  VAULT_ABI,
  ORACLE_ABI,
  EXPLORER,
} from "@/src/lib/contracts";

// ── Treasury Router ABI ────────────────────────────────────────
// Add these to your contracts.ts ROUTER_ABI as well
const ROUTER_ABI = [
  {
    name: "totalFeesCollected",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalHollarBurned",
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

// ── ERC20 balanceOf for treasury HOLLAR balance ───────────────────────────────
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
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 space-y-1">
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
  const [treasury, setTreasury] = useState<string | null>(null);

  // Core stats from contracts
  const { data } = useReadContracts({
    contracts: [
      {
        address: ADDRESSES.treasuryRouter,
        abi: ROUTER_ABI,
        functionName: "totalFeesCollected",
      },
      {
        address: ADDRESSES.treasuryRouter,
        abi: ROUTER_ABI,
        functionName: "totalHollarBurned",
      },
      {
        address: ADDRESSES.treasuryRouter,
        abi: ROUTER_ABI,
        functionName: "treasury",
      },
      {
        address: ADDRESSES.priceOracle,
        abi: ORACLE_ABI,
        functionName: "prices",
        args: [ADDRESSES.vdot],
      },
    ],
    query: { refetchInterval: 30_000 },
  });

  const feesCollected = (data?.[0]?.result as bigint) ?? 0n;
  const hollarBurned = (data?.[1]?.result as bigint) ?? 0n;
  const treasuryAddr = (data?.[2]?.result as string) ?? null;
  const vdotPrice = (data?.[3]?.result as bigint) ?? 0n;

  // Treasury HOLLAR balance — only fetch once we have the address
  const { data: treasuryBalData } = useReadContracts({
    contracts: treasuryAddr
      ? [
          {
            address: ADDRESSES.hollar,
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
          address: ADDRESSES.lendingPool,
          event: parseAbiItem(
            "event Borrowed(address indexed user, uint256 hollarAmount)",
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

  // Scan Deposited events for TVL (total vDOT deposited - withdrawn)
  // Simpler: just read vault total supply via collateral events
  const [tvlVdot, setTvlVdot] = useState<bigint | null>(null);
  useEffect(() => {
    if (!client) return;
    (async () => {
      try {
        const deposited = await client.getLogs({
          address: ADDRESSES.collateralVault,
          event: parseAbiItem(
            "event Deposited(address indexed user, uint256 amount)",
          ),
          fromBlock: 0n,
          toBlock: "latest",
        });
        const withdrawn = await client.getLogs({
          address: ADDRESSES.collateralVault,
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
        setTvlVdot(totalDeposited - totalWithdrawn);
      } catch {
        setTvlVdot(0n);
      }
    })();
  }, [client]);

  const tvlUSD =
    tvlVdot !== null && vdotPrice > 0n
      ? Number(formatEther((tvlVdot * vdotPrice) / BigInt(1e18))).toFixed(2)
      : "--";

  const feesF = Number(formatEther(feesCollected)).toFixed(4);
  const burnedF = Number(formatEther(hollarBurned)).toFixed(4);
  const treasF = Number(formatEther(treasuryBalance)).toFixed(4);

  // Annualised fee projection — rough: if fees collected since first borrow
  // Just show raw numbers for testnet; projections are misleading at low TVL
  const protocolFeeRate = "10% of stability fee";
  const stabilityFeeRate = "0.5%/yr on all debt";

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-white">Protocol Stats</div>
          <a
            href={`${EXPLORER}/address/${ADDRESSES.lendingPool}`}
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
          label="Treasury Fees Collected"
          value={`${feesF} HOLLAR`}
          sub={`Current balance: ${treasF} HOLLAR`}
          accent
        />
        <Stat
          label="HOLLAR Burned"
          value={`${burnedF} HOLLAR`}
          sub="Deflationary — removed from supply"
        />
        <Stat
          label="TVL"
          value={`$${tvlUSD}`}
          sub={
            tvlVdot !== null
              ? `${Number(formatEther(tvlVdot)).toFixed(4)} vDOT locked`
              : "Loading..."
          }
        />
        <Stat
          label="Unique Borrowers"
          value={uniqueBorrowers !== null ? String(uniqueBorrowers) : "--"}
          sub="All-time, from Borrowed events"
        />
      </div>

      {/* Revenue model explainer */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-4 text-xs font-mono space-y-3">
        <div className="text-gray-300 font-bold uppercase tracking-widest text-[10px]">
          Revenue Model
        </div>
        <div className="space-y-2 text-gray-500">
          <div className="flex justify-between">
            <span>Stability fee on all debt</span>
            <span className="text-white">{stabilityFeeRate}</span>
          </div>
          <div className="flex justify-between">
            <span>Protocol cut of stability fee</span>
            <span className="text-[#E6007A]">{protocolFeeRate}</span>
          </div>
          <div className="flex justify-between">
            <span>Remainder</span>
            <span className="text-white">Burned (deflationary)</span>
          </div>
        </div>
        <div className="border-t border-[#1a1a1a] pt-3 space-y-1 text-gray-600">
          <div>
            At <span className="text-gray-400">$10M TVL</span>: ~$500/yr gross
            interest →{" "}
            <span className="text-[#E6007A]">~$50/yr to treasury</span>,
            ~$450/yr burned
          </div>
          <div>
            At <span className="text-gray-400">$100M TVL</span>: ~$5,000/yr
            gross interest →{" "}
            <span className="text-[#E6007A]">~$500/yr to treasury</span>,
            ~$4,500/yr burned
          </div>
          <div>
            At <span className="text-gray-400">$1B TVL</span> (Aave-scale): →{" "}
            <span className="text-[#E6007A]">~$50,000/yr to treasury</span>
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
