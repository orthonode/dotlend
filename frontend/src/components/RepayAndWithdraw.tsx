"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt } from "wagmi";
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
            <span className="text-gray-300">Full debt button</span> — adds a 1% buffer on top
            of your current debt reading. This covers interest that accrues between when the
            UI reads your balance and when your transaction confirms (~2–10 seconds).
          </div>
          <div>
            <span className="text-gray-300">You never overpay</span> — the contract caps repayment
            at your exact on-chain debt:{" "}
            <span className="text-gray-400">repayAmount = min(sent, actualDebt)</span>.
            Any excess USDH stays in your wallet untouched.
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
      { address: addresses.usdh,          abi: ERC20_ABI, functionName: "allowance",         args: [address, addresses.lendingPool] },
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

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isPending)    setStatus("confirming"); }, [isPending, setStatus]);
  useEffect(() => { if (isConfirming) setStatus("confirming"); }, [isConfirming, setStatus]);

  useEffect(() => {
    if (isSuccess && txHash) {
      setStatus("success");
      clearOptimistic();
      // Force immediate refetch so withdraw tab shows updated debt before user switches tabs
      refetch();
      queryClient.invalidateQueries();
      triggerRefetch();
      setRepayAmount("");
      setWithdrawAmount("");
      setSuccessHash(txHash);
      setTimeout(() => setSuccessHash(null), 6000);
    }
  }, [isSuccess, txHash, setStatus, clearOptimistic, queryClient, triggerRefetch, refetch]);

  useEffect(() => {
    if (writeError || receiptError) { setStatus("error"); clearOptimistic(); }
  }, [writeError, receiptError, setStatus, clearOptimistic]);

  function handleApprove() {
    setStatus("signing", "Approving USDH…");
    writeContract({ address: addresses.usdh, abi: ERC20_ABI, functionName: "approve", args: [addresses.lendingPool, maxUint256] });
  }

  function handleRepay() {
    setOptimistic(0n, -parsedRepay);
    setStatus("signing", `Repaying ${Number(repayAmount).toFixed(2)} USDH…`);
    writeContract({ address: addresses.lendingPool, abi: POOL_ABI, functionName: "repay", args: [parsedRepay] });
  }

  function handleWithdraw() {
    setOptimistic(-parsedWithdraw, 0n);
    setStatus("signing", `Withdrawing ${Number(withdrawAmount).toFixed(4)} ${assetSymbol}…`);
    writeContract({ address: addresses.collateralVault, abi: VAULT_ABI, functionName: "withdraw", args: [parsedWithdraw] });
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
  const debtNum     = Number(formatEther(debt));
  const perSecond   = debtNum * 0.005 / (365 * 24 * 3600);
  const bufferedDebt = debt + debt / 100n;

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
                onClick={() => setRepayAmount(formatEther(bufferedDebt))}
                className="text-[#E6007A] hover:underline"
              >
                Full debt (+1% buffer)
              </button>
            </div>
            <input
              id="repay-amount" name="repay-amount"
              aria-label="Repay amount" autoComplete="off"
              type="number" value={repayAmount} onChange={e => setRepayAmount(e.target.value)}
              placeholder="0.00" disabled={busy}
              className="w-full bg-[#080808] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50"
            />
          </div>

          {/* Transparent repay explanation */}
          <div className="text-xs text-gray-600 font-mono space-y-1">
            <div>• Buffer covers interest accrued during tx confirmation (~2–10s)</div>
            <div>• Contract charges only exact debt: <span className="text-gray-400">min(sent, actualDebt)</span></div>
            <div>• Excess USDH stays in your wallet — you are never overcharged</div>
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
