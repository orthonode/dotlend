"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, parseAbiItem } from "viem";
import { VAULT_ABI, POOL_ABI, ORACLE_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";
import { useMarket } from "@/src/lib/market-context";

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
  const queryClient = useQueryClient();
  const { refetchCount, triggerRefetch } = useRefetch();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const { addresses, assetSymbol } = useMarket();

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      triggerRefetch();
    }
  }, [isSuccess, queryClient, triggerRefetch]);

  const scanPositions = useCallback(async () => {
    if (!client) return;
    try {
      setLoading(true);

      const depositLogs = await client.getLogs({
        address: addresses.collateralVault,
        event: parseAbiItem("event Deposited(address indexed user, uint256 amount)"),
        fromBlock: 0n,
        toBlock: "latest",
      });

      const uniqueUsers = [...new Set(depositLogs.map(l => l.args.user!))];

      const vdotPrice = await client.readContract({
        address: addresses.priceOracle,
        abi: ORACLE_ABI,
        functionName: "prices",
        args: [addresses.collateral],
      }) as bigint;

      const result: Position[] = [];

      for (const user of uniqueUsers) {
        const [collateral, debt] = await Promise.all([
          client.readContract({ address: addresses.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [user] }) as Promise<bigint>,
          client.readContract({ address: addresses.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [user] }) as Promise<bigint>,
        ]);

        if (collateral === 0n || debt === 0n) continue;

        const collUSD = collateral * vdotPrice / BigInt(1e18);
        const hf = collUSD * 80n * BigInt(1e18) / (debt * 100n);
        result.push({ user, collateral, debt, hf, collUSD });
      }

      result.sort((a, b) => (a.hf < b.hf ? -1 : a.hf > b.hf ? 1 : 0));
      setPositions(result);
    } catch {
      // scan failed — positions remain empty
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    scanPositions();
    const interval = setInterval(scanPositions, 15_000);
    return () => clearInterval(interval);
  }, [scanPositions, refetchCount]);

  function handleLiquidate(borrower: `0x${string}`) {
    writeContract({
      address: addresses.lendingPool,
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

  const liquidatable = positions.filter(p => Number(formatEther(p.hf)) < 1.0);
  const healthy      = positions.filter(p => Number(formatEther(p.hf)) >= 1.0);

  return (
    <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">Liquidation Monitor</div>
        <div className="text-xs text-gray-500">5% bonus to liquidator</div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8 text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            Scanning on-chain positions…
          </span>
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-8 space-y-1">
          <div className="text-gray-500 text-sm">No active positions found on-chain</div>
          <div className="text-gray-600 text-xs font-mono">Scanned all Deposited events from block 0</div>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex gap-3 text-xs font-mono">
            <div className="bg-[#080808] border border-white/5 rounded-lg px-3 py-2 flex-1 text-center">
              <div className="text-gray-500">Monitored</div>
              <div className="text-white font-bold">{positions.length}</div>
            </div>
            <div className={`border rounded-lg px-3 py-2 flex-1 text-center ${
              liquidatable.length > 0
                ? "bg-red-950/20 border-red-500/40"
                : "bg-[#0a0a0a] border-[#1a1a1a]"
            }`}>
              <div className="text-gray-500">Liquidatable</div>
              <div className={`font-bold ${liquidatable.length > 0 ? "text-red-400" : "text-green-400"}`}>
                {liquidatable.length}
              </div>
            </div>
            <div className="bg-[#080808] border border-white/5 rounded-lg px-3 py-2 flex-1 text-center">
              <div className="text-gray-500">Safe</div>
              <div className="text-green-400 font-bold">{healthy.length}</div>
            </div>
          </div>

          {liquidatable.length === 0 && (
            <div className="bg-green-950/20 border border-green-500/20 rounded-lg px-4 py-3 text-xs text-green-400 font-mono text-center">
              ✓ All {positions.length} position{positions.length !== 1 ? "s" : ""} healthy — no liquidations available
            </div>
          )}

          <div className="space-y-3">
            {positions.map(pos => {
              const hfVal = Number(formatEther(pos.hf));
              const isLiquidatable = hfVal < 1.0;
              const hfDisplay = hfVal > 1e15 ? "MAX" : hfVal.toFixed(3);

              return (
                <div
                  key={pos.user}
                  className={`border rounded-lg p-4 ${
                    isLiquidatable ? "border-red-500/50 bg-red-950/20" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 font-mono">
                      {pos.user.slice(0, 10)}…{pos.user.slice(-6)}
                    </span>
                    <span className="text-sm font-bold" style={{ color: hfColor(pos.hf) }}>
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
                      <div className="text-[#E6007A]">{Number(formatEther(pos.debt)).toFixed(2)} USDH</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Bonus</div>
                      <div className="text-green-400">5% {assetSymbol}</div>
                    </div>
                  </div>

                  {isLiquidatable && address && (
                    <button
                      onClick={() => handleLiquidate(pos.user)}
                      disabled={isPending}
                      className="w-full py-2 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition"
                    >
                      {isPending ? "Liquidating…" : "Liquidate (+5% bonus)"}
                    </button>
                  )}
                  {isLiquidatable && !address && (
                    <div className="text-xs text-red-400 text-center font-mono">
                      Connect wallet to liquidate
                    </div>
                  )}
                  {!isLiquidatable && (
                    <div className="text-xs text-gray-600 text-center">
                      Not liquidatable — HF ≥ 1.0
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {txHash && isSuccess && (
        <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#E6007A] hover:underline">
          Liquidated — View on Blockscout →
        </a>
      )}

      {/* How liquidation works */}
      <div className="border border-white/5 rounded-lg text-xs font-mono">
        <details>
          <summary className="px-3 py-2 text-gray-400 hover:text-white cursor-pointer uppercase tracking-widest">
            How liquidation works
          </summary>
          <div className="px-3 pb-3 pt-2 border-t border-white/5 space-y-2 text-gray-500">
            <div><span className="text-gray-300">Trigger</span> — health factor drops below 1.0 (LTV exceeds 80%). Anyone can call <span className="text-gray-400">liquidate(borrower)</span>.</div>
            <div><span className="text-gray-300">What happens</span> — the liquidator repays the borrower's full USDH debt and receives their {assetSymbol} collateral plus a 5% bonus.</div>
            <div><span className="text-gray-300">Why 80% threshold</span> — collateral is priced at the oracle's last on-chain value. Price feeds update every 30 minutes via the Python oracle; the 80% liquidation threshold gives a buffer against price drops between updates.</div>
            <div><span className="text-gray-300">This monitor</span> — scans all <span className="text-gray-400">Deposited</span> events from block 0, re-reads every 15 seconds. Health factors are computed client-side using the same formula as <span className="text-gray-400">CollateralVault.sol</span>.</div>
            <div className="pt-1 border-t border-white/5 text-gray-600">
              Source:{" "}
              <a href="https://github.com/orthonode/dotlend/blob/main/contracts/LendingPool.sol"
                target="_blank" rel="noopener noreferrer" className="text-[#E6007A] hover:underline">
                LendingPool.sol →
              </a>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
