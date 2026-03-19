"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, formatEther } from "viem";
import { VAULT_ABI, POOL_ABI, ORACLE_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";
import { useTx } from "@/src/lib/tx-context";
import { useMarket } from "@/src/lib/market-context";

const MAX_LTV = 0.70;
const LIQ_THRESHOLD = 0.80;

const mapError = (e: unknown) => {
  const m = String(e).toLowerCase();
  if (m.includes("allowance")) return "Approve the token first";
  if (m.includes("ltv") || m.includes("exceeds")) return "Exceeds 70% LTV — reduce amount";
  if (m.includes("stale") || m.includes("price")) return "Oracle updating — retry in 30s";
  if (m.includes("health")) return "Would risk liquidation";
  return "Failed — check Blockscout for details";
};

export function BorrowUSDH() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [successHash, setSuccessHash] = useState<string | null>(null);
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

  const publicClient = usePublicClient();
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isPending)    setStatus("confirming"); }, [isPending, setStatus]);
  useEffect(() => { if (isConfirming) setStatus("confirming"); }, [isConfirming, setStatus]);
  useEffect(() => {
    if (isSuccess && txHash) {
      setStatus("success");
      clearOptimistic();
      queryClient.invalidateQueries();
      triggerRefetch();
      setAmount("");
      setSuccessHash(txHash);
      setTimeout(() => setSuccessHash(null), 6000);
    }
  }, [isSuccess, txHash, setStatus, clearOptimistic, queryClient, triggerRefetch]);
  useEffect(() => {
    if (writeError || receiptError) { setStatus("error"); clearOptimistic(); }
  }, [writeError, receiptError, setStatus, clearOptimistic]);

  async function handleBorrow() {
    const parsed = parseEther(amount);
    setOptimistic(0n, parsed);
    setStatus("signing", `Borrowing ${Number(amount).toFixed(2)} USDH…`);
    let gas = 200_000n;
    try {
      const est = await publicClient!.estimateContractGas({
        address: addresses.lendingPool, abi: POOL_ABI, functionName: "borrow",
        args: [parsed], account: address,
      });
      gas = est * 120n / 100n;
    } catch (e) {
      console.error("Gas estimation failed (borrow):", e);
      setStatus("error");
      return;
    }
    writeContract({ address: addresses.lendingPool, abi: POOL_ABI, functionName: "borrow", args: [parsed], gas });
  }

  if (!address) {
    return (
      <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 text-center text-gray-500 text-sm">
        Connect wallet to borrow
      </div>
    );
  }

  const busy = isPending || isConfirming;

  return (
    <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 space-y-4 hover:border-white/10 transition-colors">
      <div className="text-sm font-semibold text-white">Borrow USDH</div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-[#080808] border border-white/5 rounded-lg p-3">
          <div className="text-gray-500 text-[11px]">Collateral Value</div>
          <div className="font-bold text-white">${collUSDNum.toFixed(2)}</div>
        </div>
        <div className="bg-[#080808] border border-white/5 rounded-lg p-3">
          <div className="text-gray-500 text-[11px]">Max Borrow (70%)</div>
          <div className="font-bold text-[#E6007A]">${maxBorrow.toFixed(2)}</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
          <span>Borrow Amount</span>
          <button onClick={() => setAmount(maxBorrow.toFixed(6))} className="text-[#E6007A] hover:underline">
            MAX ${maxBorrow.toFixed(2)}
          </button>
        </div>
        <input
          id="borrow-amount"
          name="borrow-amount"
          aria-label="Borrow amount"
          autoComplete="off"
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          max={maxBorrow}
          disabled={busy}
          className="w-full bg-[#080808] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50 transition-colors"
        />
      </div>

      {borrowNum > 0 && (
        <div className="bg-[#080808] border border-white/5 rounded-lg p-3 space-y-2 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-gray-500">New LTV</span>
            <span style={{ color: ltvColor }} className="font-semibold">{(newLTV * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Health Factor</span>
            <span style={{ color: newHF < 1.2 ? "#ef4444" : newHF < 1.5 ? "#eab308" : "#22c55e" }} className="font-semibold">
              {isFinite(newHF) ? newHF.toFixed(3) : "MAX"}
            </span>
          </div>
          <div className="border-t border-white/5 pt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Fee</span>
              <span className="text-white">0.5%/yr</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Daily cost</span>
              <span className="text-white">~${perDay.toFixed(4)}</span>
            </div>
          </div>
          {newHF < 1.2 && isFinite(newHF) && (
            <div className="text-red-400 font-semibold border-t border-white/5 pt-2">
              Near liquidation threshold (HF 1.0)
            </div>
          )}
        </div>
      )}

      {borrowNum === 0 && (
        <div className="text-[11px] text-gray-600 px-1">
          0.5%/yr stability fee. Accrues per second. Contract charges exact debt on repay.
        </div>
      )}

      <button
        onClick={handleBorrow}
        disabled={busy || !amount || borrowNum <= 0 || borrowNum > maxBorrow}
        className="w-full py-3 rounded-lg font-semibold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition shadow-lg shadow-[#E6007A]/10 hover:shadow-[#E6007A]/20"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {isPending ? "Waiting for wallet…" : "Confirming…"}
          </span>
        ) : "Borrow USDH"}
      </button>

      {successHash && (
        <a href={`${EXPLORER}/tx/${successHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-green-400 hover:underline">
          Confirmed — View on Blockscout
        </a>
      )}
      {(writeError || receiptError) && (
        <div className="text-xs text-red-400 text-center">
          {mapError(writeError || receiptError)}
        </div>
      )}
    </div>
  );
}
