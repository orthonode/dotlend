"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, formatEther } from "viem";
import { VAULT_ABI, POOL_ABI, ORACLE_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";
import { useTx } from "@/src/lib/tx-context";
import { useMarket } from "@/src/lib/market-context";

const MAX_LTV = 0.70;
const LIQ_THRESHOLD = 0.80;

export function BorrowHOLLAR() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const queryClient = useQueryClient();
  const { triggerRefetch } = useRefetch();
  const { setStatus, setOptimistic, clearOptimistic } = useTx();
  const { addresses } = useMarket();

  const { data } = useReadContracts({
    contracts: address ? [
      { address: addresses.collateralVault, abi: VAULT_ABI,  functionName: "collateralBalance", args: [address] },
      { address: addresses.collateralVault, abi: VAULT_ABI,  functionName: "debtBalance",        args: [address] },
      { address: addresses.priceOracle,     abi: ORACLE_ABI, functionName: "prices",             args: [addresses.collateral] },
    ] : [],
    query: { refetchInterval: 15_000 },
  });

  const collateralRaw = data?.[0]?.result ?? 0n;
  const currentDebt   = data?.[1]?.result ?? 0n;
  const vdotPrice     = data?.[2]?.result ?? 0n;

  const collUSD        = collateralRaw * vdotPrice / BigInt(1e18);
  const collUSDNum     = Number(formatEther(collUSD));
  const currentDebtNum = Number(formatEther(currentDebt));
  const maxBorrow      = Math.max(0, collUSDNum * MAX_LTV - currentDebtNum);

  const borrowNum = Number(amount) || 0;
  const newDebt   = currentDebtNum + borrowNum;
  const newLTV    = collUSDNum > 0 ? newDebt / collUSDNum : 0;
  const newHF     = collUSDNum > 0 ? (collUSDNum * LIQ_THRESHOLD) / newDebt : Infinity;
  const ltvColor  = newLTV >= LIQ_THRESHOLD ? "#ef4444" : newLTV >= MAX_LTV ? "#eab308" : "#22c55e";

  // Per-day interest preview for the borrow amount
  const perDay = borrowNum * 0.005 / 365;

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isPending)    setStatus("confirming"); }, [isPending, setStatus]);
  useEffect(() => { if (isConfirming) setStatus("confirming"); }, [isConfirming, setStatus]);
  useEffect(() => {
    if (isSuccess) {
      setStatus("success");
      clearOptimistic();
      queryClient.invalidateQueries();
      triggerRefetch();
      setAmount("");
    }
  }, [isSuccess, setStatus, clearOptimistic, queryClient, triggerRefetch]);
  useEffect(() => {
    if (writeError || receiptError) { setStatus("error"); clearOptimistic(); }
  }, [writeError, receiptError, setStatus, clearOptimistic]);

  function handleBorrow() {
    const parsed = parseEther(amount);
    setOptimistic(0n, parsed);
    setStatus("signing", `Borrowing ${Number(amount).toFixed(2)} HOLLAR…`);
    writeContract({
      address: addresses.lendingPool,
      abi: POOL_ABI,
      functionName: "borrow",
      args: [parsed],
    });
  }

  if (!address) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-xl p-6 text-center text-gray-500">
        Connect wallet to borrow
      </div>
    );
  }

  const busy = isPending || isConfirming;

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
      <div className="text-sm font-bold text-white">Borrow HOLLAR</div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-[#0a0a0a] rounded-lg p-3">
          <div className="text-gray-500">Collateral Value</div>
          <div className="font-bold text-white">${collUSDNum.toFixed(2)}</div>
        </div>
        <div className="bg-[#0a0a0a] rounded-lg p-3">
          <div className="text-gray-500">Max Borrow (70% LTV)</div>
          <div className="font-bold text-[#E6007A]">${maxBorrow.toFixed(2)} HOLLAR</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Borrow Amount</span>
          <button onClick={() => setAmount(maxBorrow.toFixed(6))} className="text-[#E6007A] hover:underline">
            MAX ${maxBorrow.toFixed(2)}
          </button>
        </div>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          max={maxBorrow}
          disabled={busy}
          className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50"
        />
      </div>

      {/* Stability fee — always shown when there's input */}
      {borrowNum > 0 && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3 space-y-2 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-gray-500">New LTV</span>
            <span style={{ color: ltvColor }} className="font-bold">{(newLTV * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">New Health Factor</span>
            <span style={{ color: newHF < 1.2 ? "#ef4444" : newHF < 1.5 ? "#eab308" : "#22c55e" }} className="font-bold">
              {isFinite(newHF) ? newHF.toFixed(3) : "MAX"}
            </span>
          </div>
          <div className="border-t border-[#222] pt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Stability fee</span>
              <span className="text-white">0.5% / year (5 bps)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Cost on this borrow / day</span>
              <span className="text-white">~${perDay.toFixed(4)} HOLLAR</span>
            </div>
            <div className="text-gray-600 pt-1">
              Interest accrues every second on-chain from the moment you borrow. Applied automatically on repay via <span className="text-gray-400">accrueInterest()</span>.
            </div>
          </div>
          {newHF < 1.2 && isFinite(newHF) && (
            <div className="text-red-400 font-bold border-t border-[#222] pt-2">
              ⚠ WARNING: dangerously close to liquidation threshold (HF 1.0)
            </div>
          )}
        </div>
      )}

      {/* Stability fee reminder even before input */}
      {borrowNum === 0 && (
        <div className="text-xs text-gray-600 font-mono px-1">
          Stability fee: 0.5%/yr. Accrues every second from first borrow. Repay any time — contract charges only exact debt.
        </div>
      )}

      <button
        onClick={handleBorrow}
        disabled={busy || !amount || borrowNum <= 0 || borrowNum > maxBorrow}
        className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {isPending ? "Waiting for wallet…" : "Confirming on-chain…"}
          </span>
        ) : "Borrow HOLLAR"}
      </button>

      {isSuccess && txHash && (
        <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-[#E6007A] hover:underline">
          Borrowed — View on Blockscout →
        </a>
      )}
    </div>
  );
}
