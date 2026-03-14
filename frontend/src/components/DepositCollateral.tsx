"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, formatEther } from "viem";
import { VAULT_ABI, ERC20_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";
import { useTx } from "@/src/lib/tx-context";
import { useMarket } from "@/src/lib/market-context";

const mapError = (e: unknown) => {
  const m = String(e).toLowerCase();
  if (m.includes("allowance")) return "Approve the token first";
  if (m.includes("ltv") || m.includes("exceeds")) return "Exceeds 70% LTV — reduce amount";
  if (m.includes("stale") || m.includes("price")) return "Oracle updating — retry in 30s";
  if (m.includes("health")) return "Would risk liquidation";
  return "Failed — check Blockscout for details";
};

export function DepositCollateral() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"idle" | "approve" | "deposit">("idle");
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { triggerRefetch } = useRefetch();
  const { setStatus, setOptimistic, clearOptimistic } = useTx();
  const { addresses, assetSymbol } = useMarket();

  const { data: assetBalance } = useReadContract({
    address: addresses.collateral,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: allowance } = useReadContract({
    address: addresses.collateral,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, addresses.collateralVault] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  // Tx lifecycle → banner + optimistic state
  useEffect(() => { if (isPending)     setStatus("confirming"); }, [isPending, setStatus]);
  useEffect(() => { if (isConfirming)  setStatus("confirming"); }, [isConfirming, setStatus]);
  useEffect(() => {
    if (isSuccess && txHash) {
      setStatus("success");
      clearOptimistic();
      queryClient.invalidateQueries();
      triggerRefetch();
      setSuccessHash(txHash);
      setTimeout(() => setSuccessHash(null), 6000);
    }
  }, [isSuccess, txHash, setStatus, clearOptimistic, queryClient, triggerRefetch]);
  useEffect(() => {
    if (writeError || receiptError) {
      setStatus("error");
      clearOptimistic();
    }
  }, [writeError, receiptError, setStatus, clearOptimistic]);

  const parsedAmount = amount ? parseEther(amount) : 0n;
  const needsApproval = allowance !== undefined && parsedAmount > 0n && parsedAmount > allowance;

  function handleApprove() {
    setStep("approve");
    setStatus("signing", `Approving ${assetSymbol}…`);
    writeContract({
      address: addresses.collateral,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [addresses.collateralVault, parsedAmount],
    });
  }

  function handleDeposit() {
    setStep("deposit");
    // Optimistic: show collateral increasing immediately
    setOptimistic(parsedAmount, 0n);
    setStatus("signing", `Depositing ${Number(amount).toFixed(2)} ${assetSymbol}…`);
    writeContract({
      address: addresses.collateralVault,
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [parsedAmount],
    });
  }

  if (!address) {
    return (
      <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 text-center text-gray-500 text-sm">
        Connect wallet to deposit
      </div>
    );
  }

  const busy = isPending || isConfirming;

  return (
    <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 space-y-4 hover:border-white/10 transition-colors">
      <div className="text-sm font-semibold text-white">Deposit {assetSymbol}</div>

      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
          <span>Amount</span>
          <span>Balance: {assetBalance !== undefined ? Number(formatEther(assetBalance)).toFixed(4) : "--"} {assetSymbol}</span>
        </div>
        <div className="flex gap-2">
          <input
            id="deposit-amount"
            name="deposit-amount"
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={busy}
            className="flex-1 bg-[#080808] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={() => assetBalance && setAmount(formatEther(assetBalance))}
            disabled={busy}
            className="px-3 py-2.5 text-xs font-medium border border-white/10 rounded-lg text-gray-400 hover:border-[#E6007A] hover:text-[#E6007A] transition disabled:opacity-50"
          >
            MAX
          </button>
        </div>
      </div>

      {needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={busy || !amount}
          className="w-full py-3 rounded-lg font-semibold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
              {isPending ? "Waiting for wallet…" : "Confirming…"}
            </span>
          ) : `Approve ${assetSymbol}`}
        </button>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={busy || !amount || parsedAmount === 0n}
          className="w-full py-3 rounded-lg font-semibold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition shadow-lg shadow-[#E6007A]/10 hover:shadow-[#E6007A]/20"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isPending ? "Waiting for wallet…" : "Confirming…"}
            </span>
          ) : `Deposit ${assetSymbol}`}
        </button>
      )}

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
