"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, formatEther, maxUint256 } from "viem";
import { ADDRESSES, VAULT_ABI, POOL_ABI, ERC20_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";

export function RepayAndWithdraw() {
  const { address } = useAccount();
  const [repayAmount, setRepayAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"repay" | "withdraw">("repay");
  const queryClient = useQueryClient();
  const { triggerRefetch } = useRefetch();

  const { data } = useReadContracts({
    contracts: address ? [
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [address] },
      { address: ADDRESSES.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [address] },
      { address: ADDRESSES.hollar,          abi: ERC20_ABI, functionName: "balanceOf",         args: [address] },
      { address: ADDRESSES.hollar,          abi: ERC20_ABI, functionName: "allowance",         args: [address, ADDRESSES.lendingPool] },
    ] : [],
    query: { refetchInterval: 15_000 },
  });

  const debt       = data?.[0]?.result ?? 0n;
  const collateral = data?.[1]?.result ?? 0n;
  const hollarBal  = data?.[2]?.result ?? 0n;
  const allowance  = data?.[3]?.result ?? 0n;

  const parsedRepay = repayAmount ? parseEther(repayAmount) : 0n;
  const needsApproval = parsedRepay > 0n && parsedRepay > allowance;

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      triggerRefetch();
    }
  }, [isSuccess, queryClient, triggerRefetch]);

  function handleApprove() {
    writeContract({
      address: ADDRESSES.hollar,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ADDRESSES.lendingPool, maxUint256],
    });
  }

  function handleRepay() {
    writeContract({
      address: ADDRESSES.lendingPool,
      abi: POOL_ABI,
      functionName: "repay",
      args: [parsedRepay],
    });
  }

  function handleWithdraw() {
    writeContract({
      address: ADDRESSES.collateralVault,
      abi: VAULT_ABI,
      functionName: "withdraw",
      args: [withdrawAmount ? parseEther(withdrawAmount) : 0n],
    });
  }

  if (!address) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-xl p-6 text-center text-gray-500">
        Connect wallet to repay or withdraw
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
      <div className="flex gap-2">
        {(["repay", "withdraw"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              activeTab === tab
                ? "bg-[#E6007A] text-white"
                : "border border-[#333] text-gray-400 hover:border-[#E6007A]"
            }`}
          >
            {tab === "repay" ? "Repay HOLLAR" : "Withdraw vDOT"}
          </button>
        ))}
      </div>

      {activeTab === "repay" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#0a0a0a] rounded-lg p-2">
              <div className="text-gray-500">Outstanding Debt</div>
              <div className="font-bold text-[#E6007A]">{Number(formatEther(debt)).toFixed(4)} HOLLAR</div>
            </div>
            <div className="bg-[#0a0a0a] rounded-lg p-2">
              <div className="text-gray-500">HOLLAR Balance</div>
              <div className="font-bold">{Number(formatEther(hollarBal)).toFixed(4)}</div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Repay Amount</span>
              <button
                onClick={() => setRepayAmount(formatEther(debt))}
                className="text-[#E6007A] hover:underline"
              >
                Full debt
              </button>
            </div>
            <input
              type="number"
              value={repayAmount}
              onChange={e => setRepayAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A]"
            />
          </div>
          <div className="text-xs text-gray-500">
            Stability fee: 0.5%/yr accrued continuously. Repay slightly more than principal to clear fully.
          </div>
          {needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isPending || isConfirming}
              className="w-full py-3 rounded-lg font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition"
            >
              {isPending || isConfirming ? "Approving..." : "Approve HOLLAR"}
            </button>
          ) : (
            <button
              onClick={handleRepay}
              disabled={isPending || isConfirming || !repayAmount}
              className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
            >
              {isPending || isConfirming ? "Repaying..." : "Repay HOLLAR"}
            </button>
          )}
        </div>
      )}

      {activeTab === "withdraw" && (
        <div className="space-y-3">
          <div className="bg-[#0a0a0a] rounded-lg p-3 text-xs">
            <div className="text-gray-500">Available Collateral</div>
            <div className="font-bold text-white">{Number(formatEther(collateral)).toFixed(4)} vDOT</div>
            {debt > 0n && (
              <div className="text-yellow-500 mt-1">Repay all debt before withdrawing collateral</div>
            )}
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Withdraw Amount</span>
              <button
                onClick={() => setWithdrawAmount(formatEther(collateral))}
                className="text-[#E6007A] hover:underline"
              >
                MAX
              </button>
            </div>
            <input
              type="number"
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A]"
            />
          </div>
          <button
            onClick={handleWithdraw}
            disabled={isPending || isConfirming || !withdrawAmount || debt > 0n}
            className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
          >
            {isPending || isConfirming ? "Withdrawing..." : "Withdraw vDOT"}
          </button>
        </div>
      )}

      {isSuccess && txHash && (
        <a
          href={`${EXPLORER}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#E6007A] hover:underline"
        >
          Success — View on Blockscout &rarr;
        </a>
      )}
    </div>
  );
}
