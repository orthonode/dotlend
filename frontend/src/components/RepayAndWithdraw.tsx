"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, formatEther, maxUint256 } from "viem";
import { VAULT_ABI, POOL_ABI, ERC20_ABI, EXPLORER } from "@/src/lib/contracts";
import { useRefetch } from "@/src/lib/refetch-context";
import { useTx } from "@/src/lib/tx-context";
import { useMarket } from "@/src/lib/market-context";

// ── FAQ / Protocol transparency panel ────────────────────────────────────────

function ProtocolFAQ() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/5 rounded-lg text-xs font-mono">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-3 py-2 text-gray-400 hover:text-white transition"
      >
        <span className="uppercase tracking-widest">How repay works</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-gray-500 border-t border-white/5 pt-2">
          <div>
            <span className="text-gray-300">Stability fee</span> — 0.5%/year (5 bps), accrues
            every second on-chain. Applied automatically when you call repay().
          </div>
          <div>
            <span className="text-gray-300">Full debt button</span> — fetches your exact
            on-chain debt at the moment you click Submit, so the amount is always current.
            Interest accrues per second; this eliminates both over- and under-payment.
          </div>
          <div>
            <span className="text-gray-300">Partial repay</span> — type any amount less than
            your debt to make a partial repayment. The remainder stays as debt.
          </div>
          <div>
            <span className="text-gray-300">Why withdrawal is blocked</span> — the contract
            requires debt = 0 before you can withdraw collateral. Use "Full debt" to clear
            it completely, then switch to the Withdraw tab.
          </div>
          <div>
            <span className="text-gray-300">Liquidation threshold</span> — if your health factor
            drops below 1.0 (LTV exceeds 80%), anyone can liquidate your position and receive
            a 5% bonus on the seized collateral.
          </div>
          <div className="text-gray-600 pt-1 border-t border-white/5">
            All logic is on-chain and open source:{" "}
            <a
              href="https://github.com/orthonode/dotlend/blob/main/contracts/LendingPool.sol"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E6007A] hover:underline"
            >
              LendingPool.sol →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const mapError = (e: unknown) => {
  const m = String(e).toLowerCase();
  if (m.includes("allowance")) return "Approve the token first";
  if (m.includes("ltv") || m.includes("exceeds")) return "Exceeds 70% LTV — reduce amount";
  if (m.includes("stale") || m.includes("price")) return "Oracle updating — retry in 30s";
  if (m.includes("health")) return "Would risk liquidation";
  return "Failed — check Blockscout for details";
};

// ── Main component ────────────────────────────────────────────────────────────

export function RepayAndWithdraw() {
  const { address } = useAccount();
  const [repayAmount, setRepayAmount] = useState("");
  const [repayAll, setRepayAll] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"repay" | "withdraw">("repay");
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { triggerRefetch } = useRefetch();
  const { setStatus, setOptimistic, clearOptimistic } = useTx();
  const { addresses, assetSymbol } = useMarket();

  const { data, refetch } = useReadContracts({
    contracts: address ? [
      { address: addresses.collateralVault, abi: VAULT_ABI, functionName: "debtBalance",       args: [address] },
      { address: addresses.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [address] },
      { address: addresses.usdh,          abi: ERC20_ABI, functionName: "balanceOf",         args: [address] },
      { address: addresses.usdh,          abi: ERC20_ABI, functionName: "allowance",         args: [address, addresses.treasuryRouter] },
    ] : [],
    query: { refetchInterval: 15_000 },
  });

  const debt       = data?.[0]?.result ?? 0n;
  const collateral = data?.[1]?.result ?? 0n;
  const usdhBal  = data?.[2]?.result ?? 0n;
  const allowance  = data?.[3]?.result ?? 0n;

  const parsedRepay    = repayAmount    ? parseEther(repayAmount)    : 0n;
  const parsedWithdraw = withdrawAmount ? parseEther(withdrawAmount) : 0n;
  const needsApproval  = parsedRepay > 0n && parsedRepay > allowance;

  const publicClient = usePublicClient();
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isPending)    setStatus("confirming"); }, [isPending, setStatus]);
  useEffect(() => { if (isConfirming) setStatus("confirming"); }, [isConfirming, setStatus]);

  useEffect(() => {
    if (isSuccess && txHash) {
      setStatus("success");
      clearOptimistic();
      refetch();
      queryClient.invalidateQueries();
      triggerRefetch();
      // PolkaVM indexing delay — refetch again after 3s to show updated debt
      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries();
        triggerRefetch();
      }, 3000);
      setRepayAmount("");
      setRepayAll(false);
      setWithdrawAmount("");
      setSuccessHash(txHash);
      setTimeout(() => setSuccessHash(null), 6000);
    }
  }, [isSuccess, txHash, setStatus, clearOptimistic, queryClient, triggerRefetch, refetch]);

  useEffect(() => {
    if (writeError || receiptError) { setStatus("error"); clearOptimistic(); }
  }, [writeError, receiptError, setStatus, clearOptimistic]);

  async function handleApprove() {
    setStatus("signing", "Approving USDH…");
    let gas = 100_000n;
    try {
      const est = await publicClient!.estimateContractGas({
        address: addresses.usdh, abi: ERC20_ABI, functionName: "approve",
        args: [addresses.treasuryRouter, maxUint256], account: address,
      });
      gas = est * 120n / 100n;
    } catch (e) { console.error("Gas estimation failed (approve):", e); }
    writeContract({ address: addresses.usdh, abi: ERC20_ABI, functionName: "approve", args: [addresses.treasuryRouter, maxUint256], gas });
  }

  async function handleRepay() {
    // If "Full debt" was clicked, fetch the exact current debt from chain
    // at submit time so we repay precisely — no buffer, no stale data.
    let amount = parsedRepay;
    if (repayAll) {
      const freshDebt = await publicClient!.readContract({
        address: addresses.collateralVault, abi: VAULT_ABI,
        functionName: "debtBalance", args: [address!],
      }) as bigint;
      if (freshDebt === 0n) return;
      // Add 0.1% buffer to cover interest accrued during tx execution
      amount = freshDebt + (freshDebt / 1000n);
    }
    setOptimistic(0n, -amount);
    setStatus("signing", `Repaying ${Number(formatEther(amount)).toFixed(6)} USDH…`);
    let gas = 200_000n;
    try {
      const est = await publicClient!.estimateContractGas({
        address: addresses.lendingPool, abi: POOL_ABI, functionName: "repay",
        args: [amount], account: address,
      });
      gas = est * 120n / 100n;
    } catch (e) { console.error("Gas estimation failed (repay):", e); }
    writeContract({ address: addresses.lendingPool, abi: POOL_ABI, functionName: "repay", args: [amount], gas });
  }

  async function handleWithdraw() {
    setOptimistic(-parsedWithdraw, 0n);
    setStatus("signing", `Withdrawing ${Number(withdrawAmount).toFixed(4)} ${assetSymbol}…`);
    let gas = 200_000n;
    try {
      const est = await publicClient!.estimateContractGas({
        address: addresses.collateralVault, abi: VAULT_ABI, functionName: "withdraw",
        args: [parsedWithdraw], account: address,
      });
      gas = est * 120n / 100n;
    } catch (e) { console.error("Gas estimation failed (withdraw):", e); }
    writeContract({ address: addresses.collateralVault, abi: VAULT_ABI, functionName: "withdraw", args: [parsedWithdraw], gas });
  }

  if (!address) {
    return (
      <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 text-center text-gray-500 text-sm">
        Connect wallet to repay or withdraw
      </div>
    );
  }

  const busy = isPending || isConfirming;

  // Estimate interest accruing per second for display
  const debtNum   = Number(formatEther(debt));
  const perSecond = debtNum * 0.005 / (365 * 24 * 3600);

  return (
    <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-6 space-y-4 hover:border-white/10 transition-colors">
      <div className="flex gap-1.5 bg-[#080808] p-1 rounded-lg">
        {(["repay", "withdraw"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-[#E6007A] text-white shadow-lg shadow-[#E6007A]/20"
                : "text-gray-400 hover:text-white"
            }`}>
            {tab === "repay" ? "Repay USDH" : `Withdraw ${assetSymbol}`}
          </button>
        ))}
      </div>

      {activeTab === "repay" && (
        <div className="space-y-3">
          {/* Balances */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#080808] rounded-lg p-2">
              <div className="text-gray-500">Outstanding Debt</div>
              <div className="font-bold text-[#E6007A] font-mono">{Number(formatEther(debt)).toFixed(6)} USDH</div>
            </div>
            <div className="bg-[#080808] rounded-lg p-2">
              <div className="text-gray-500">USDH Balance</div>
              <div className="font-bold font-mono">{Number(formatEther(usdhBal)).toFixed(6)}</div>
            </div>
          </div>

          {/* Interest accrual rate */}
          {debt > 0n && (
            <div className="bg-[#080808] border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-gray-500">
              Interest accruing at{" "}
              <span className="text-gray-300">~${perSecond.toFixed(8)}/sec</span>
              {" "}(0.5%/yr). Applied on-chain when you call repay().
            </div>
          )}

          {/* Amount input */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Repay Amount</span>
              <button
                onClick={() => { setRepayAmount(formatEther(debt)); setRepayAll(true); }}
                className="text-[#E6007A] hover:underline"
              >
                Full debt (live amount on submit)
              </button>
            </div>
            <input
              id="repay-amount" name="repay-amount"
              aria-label="Repay amount" autoComplete="off"
              type="number" value={repayAmount} onChange={e => { setRepayAmount(e.target.value); setRepayAll(false); }}
              placeholder="0.00" disabled={busy}
              className="w-full bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50"
            />
          </div>

          {/* Transparent repay explanation */}
          <div className="text-xs text-gray-600 font-mono space-y-1">
            {repayAll
              ? <div className="text-yellow-600">⚡ Full debt mode — exact on-chain balance fetched at submit time</div>
              : <div>• Enter a partial amount or use <span className="text-gray-400">Full debt</span> for exact repayment</div>
            }
            <div>• Interest accrues per second — full debt button re-reads chain on submit</div>
          </div>

          {needsApproval ? (
            <button onClick={handleApprove} disabled={busy}
              className="w-full py-3 rounded-lg font-semibold text-sm bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-50 transition">
              {busy
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    {isPending ? "Waiting for wallet…" : "Confirming…"}
                  </span>
                : "Approve USDH"}
            </button>
          ) : (
            <button onClick={handleRepay} disabled={busy || !repayAmount}
              className="w-full py-3 rounded-lg font-semibold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition">
              {busy
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isPending ? "Waiting for wallet…" : "Confirming on-chain…"}
                  </span>
                : "Repay USDH"}
            </button>
          )}

          <ProtocolFAQ />
        </div>
      )}

      {activeTab === "withdraw" && (
        <div className="space-y-3">
          <div className="bg-[#080808] rounded-lg p-3 text-xs font-mono">
            <div className="text-gray-500">Available Collateral</div>
            <div className="font-bold text-white">{Number(formatEther(collateral)).toFixed(4)} {assetSymbol}</div>
            {debt > 0n && (
              <div className="text-yellow-500 mt-2">
                ⚠ Outstanding debt: {Number(formatEther(debt)).toFixed(6)} USDH.
                Repay in full before withdrawing collateral.
              </div>
            )}
            {debt === 0n && collateral > 0n && (
              <div className="text-green-500 mt-2">✓ No debt — full collateral available to withdraw</div>
            )}
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Withdraw Amount</span>
              <button onClick={() => setWithdrawAmount(formatEther(collateral))}
                className="text-[#E6007A] hover:underline">MAX</button>
            </div>
            <input
              id="withdraw-amount" name="withdraw-amount"
              aria-label="Withdraw amount" autoComplete="off"
              type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
              placeholder="0.00" disabled={busy || debt > 0n}
              className="w-full bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50"
            />
          </div>

          <button
            onClick={handleWithdraw}
            disabled={busy || !withdrawAmount || debt > 0n}
            className="w-full py-3 rounded-lg font-semibold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
          >
            {busy
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isPending ? "Waiting for wallet…" : "Confirming on-chain…"}
                </span>
              : debt > 0n ? "Repay debt first" : `Withdraw ${assetSymbol}`}
          </button>

          <ProtocolFAQ />
        </div>
      )}

      {successHash && (
        <a href={`${EXPLORER}/tx/${successHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs text-green-400 hover:underline transition-opacity duration-500">
          ✓ Confirmed — View on Blockscout →
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
