"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { ADDRESSES, VAULT_ABI, POOL_ABI, ERC20_ABI, EXPLORER } from "@/src/lib/contracts";

interface Position {
  user: `0x${string}`;
  collateral: bigint;
  debt: bigint;
  hf: bigint;
  collUSD: bigint;
}

const POOL_ABI_FULL = [
  ...POOL_ABI,
  { name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "borrower", type: "address" }], outputs: [] },
] as const;

export function LiquidationMonitor() {
  const { address } = useAccount();
  const client = usePublicClient();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!client) return;

    async function scanPositions() {
      try {
        setLoading(true);
        const depositLogs = await client!.getLogs({
          address: ADDRESSES.collateralVault,
          event: parseAbiItem("event Deposited(address indexed user, uint256 amount)"),
          fromBlock: 0n,
          toBlock: "latest",
        });

        const uniqueUsers = [...new Set(depositLogs.map(l => l.args.user!))];
        const result: Position[] = [];

        for (const user of uniqueUsers) {
          const [collateral, debt, hf, collUSD] = await Promise.all([
            client!.readContract({ address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [user] }),
            client!.readContract({ address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [user] }),
            client!.readContract({ address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "getHealthFactor",   args: [user] }),
            client!.readContract({ address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "getCollateralValue", args: [user] }),
          ]);
          if (collateral > 0n && debt > 0n) {
            result.push({ user, collateral, debt, hf, collUSD });
          }
        }

        // Sort by health factor (most at-risk first)
        result.sort((a, b) => Number(a.hf - b.hf));
        setPositions(result);
      } catch (e) {
        console.error("Scan failed:", e);
      } finally {
        setLoading(false);
      }
    }

    scanPositions();
  }, [client, isSuccess]);

  function handleLiquidate(borrower: `0x${string}`) {
    writeContract({
      address: ADDRESSES.lendingPool,
      abi: POOL_ABI_FULL,
      functionName: "liquidate",
      args: [borrower],
    });
  }

  function hfColor(hf: bigint) {
    const v = Number(formatEther(hf));
    if (v < 1.0) return "#ef4444";
    if (v < 1.2) return "#eab308";
    return "#22c55e";
  }

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-white">Liquidation Monitor</div>
        <div className="text-xs text-gray-500">5% bonus to liquidator</div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Scanning on-chain positions...</div>
      ) : positions.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No active positions found</div>
      ) : (
        <div className="space-y-3">
          {positions.map(pos => {
            const hfVal = Number(formatEther(pos.hf));
            const isLiquidatable = hfVal < 1.0;
            const hfDisplay = hfVal > 1e15 ? "MAX" : hfVal.toFixed(3);

            return (
              <div
                key={pos.user}
                className={`border rounded-lg p-4 ${
                  isLiquidatable ? "border-red-500/50 bg-red-950/20" : "border-[#222]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-mono">
                    {pos.user.slice(0, 10)}...{pos.user.slice(-6)}
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: hfColor(pos.hf) }}
                  >
                    HF: {hfDisplay}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div>
                    <div className="text-gray-500">Collateral</div>
                    <div>${Number(formatEther(pos.collUSD)).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Debt</div>
                    <div className="text-[#E6007A]">{Number(formatEther(pos.debt)).toFixed(2)} HOLLAR</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Bonus</div>
                    <div className="text-green-400">5% vDOT</div>
                  </div>
                </div>

                {isLiquidatable && address && (
                  <button
                    onClick={() => handleLiquidate(pos.user)}
                    disabled={isPending}
                    className="w-full py-2 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition"
                  >
                    {isPending ? "Liquidating..." : "Liquidate (+5% bonus)"}
                  </button>
                )}
                {!isLiquidatable && (
                  <div className="text-xs text-gray-600 text-center">
                    Not liquidatable (HF &ge; 1.0)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {txHash && isSuccess && (
        <a
          href={`${EXPLORER}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#E6007A] hover:underline"
        >
          Liquidated — View on Blockscout &rarr;
        </a>
      )}
    </div>
  );
}
