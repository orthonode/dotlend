"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, formatEther } from "viem";
import { ADDRESSES, VAULT_ABI, ERC20_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";

export function DepositCollateral() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"idle" | "approve" | "deposit">("idle");
  const queryClient = useQueryClient();
  const { triggerRefetch } = useRefetch();

  const { data: vdotBalance } = useReadContract({
    address: ADDRESSES.vdot,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: allowance } = useReadContract({
    address: ADDRESSES.vdot,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.collateralVault] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // On success: immediately invalidate all wagmi queries + notify other components
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      triggerRefetch();
    }
  }, [isSuccess, queryClient, triggerRefetch]);

  const parsedAmount = amount ? parseEther(amount) : 0n;
  const needsApproval = allowance !== undefined && parsedAmount > 0n && parsedAmount > allowance;

  function handleApprove() {
    setStep("approve");
    writeContract({
      address: ADDRESSES.vdot,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.collateralVault, parsedAmount],
    });
  }

  function handleDeposit() {
    setStep("deposit");
    writeContract({
      address: ADDRESSES.collateralVault,
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [parsedAmount],
    });
  }

  if (!address) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-xl p-6 text-center text-gray-500">
        Connect wallet to deposit
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
      <div className="text-sm font-bold text-white">Deposit vDOT Collateral</div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Amount</span>
          <span>Balance: {vdotBalance !== undefined ? Number(formatEther(vdotBalance)).toFixed(4) : "--"} vDOT</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A]"
          />
          <button
            onClick={() => vdotBalance && setAmount(formatEther(vdotBalance))}
            className="px-3 py-2 text-xs border border-[#333] rounded-lg text-gray-400 hover:border-[#E6007A] hover:text-[#E6007A] transition"
          >
            MAX
          </button>
        </div>
      </div>

      {needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={isPending || isConfirming || !amount}
          className="w-full py-3 rounded-lg font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition"
        >
          {isPending || isConfirming ? "Approving..." : "Approve vDOT"}
        </button>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={isPending || isConfirming || !amount || parsedAmount === 0n}
          className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
        >
          {isPending || isConfirming ? "Depositing..." : "Deposit vDOT"}
        </button>
      )}

      {isSuccess && txHash && (
        <a
          href={`${EXPLORER}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#E6007A] hover:underline"
        >
          {step === "approve" ? "Approved" : "Deposited"} — View on Blockscout &rarr;
        </a>
      )}
    </div>
  );
}
