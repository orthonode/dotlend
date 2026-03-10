"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt, useBalance } from "wagmi";
import { parseEther, formatEther } from "viem";
import { ADDRESSES, MOCK_ABI, WPAS_ABI, EXPLORER } from "@/src/lib/contracts";
import { useMarket } from "@/src/lib/market-context";

const AMOUNT = parseEther("1000");

export function MintTokens() {
  const { address } = useAccount();
  const { marketId, addresses } = useMarket();
  const [minting, setMinting] = useState<"vdot" | "hollar" | "wpas" | null>(null);
  const [lastTx, setLastTx] = useState<{ token: string; hash: string } | null>(null);
  const [wrapAmount, setWrapAmount] = useState<string>("100");

  const { data: ethBalance } = useBalance({ address });

  const { data, refetch } = useReadContracts({
    contracts: address ? [
      { address: addresses.collateral, abi: MOCK_ABI, functionName: "balanceOf", args: [address] },
      { address: addresses.hollar, abi: MOCK_ABI, functionName: "balanceOf", args: [address] },
    ] : [],
    query: { enabled: !!address },
  });

  const collateralBal = data?.[0]?.result ?? 0n;
  const hollarBal     = data?.[1]?.result ?? 0n;

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && txHash && minting) {
      const tokenNames = { vdot: "MockvDOT", hollar: "MockUSDH", wpas: "WPAS" };
      setLastTx({ token: tokenNames[minting], hash: txHash });
      setMinting(null);
      refetch();
      reset();
    }
  }, [isSuccess, txHash, minting, refetch, reset]);

  useEffect(() => {
    if (writeError) { setMinting(null); }
  }, [writeError]);

  function handleMint(token: "vdot" | "hollar" | "wpas") {
    if (!address) return;
    setMinting(token);
    setLastTx(null);

    if (token === "wpas") {
      writeContract({
        address: addresses.collateral,
        abi: WPAS_ABI,
        functionName: "deposit",
        value: parseEther(wrapAmount || "0"),
      });
    } else {
      writeContract({
        address: token === "vdot" ? addresses.collateral : addresses.hollar,
        abi: MOCK_ABI,
        functionName: "mint",
        args: [address, AMOUNT],
      });
    }
  }

  const busy = isPending || isConfirming;

  return (
    <div className="space-y-6">
      {/* Explainer */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-6">
        <div className="text-sm font-bold text-white mb-2">How minting works</div>
        <div className="text-xs text-gray-400 space-y-2">
          <p>
            Both <span className="text-white font-mono">MockvDOT</span> and{" "}
            <span className="text-white font-mono">MockUSDH</span> have a public{" "}
            <span className="text-white font-mono">mint(address, amount)</span> function.
            Anyone can call it — no deployer key required. This is intentional for testnet testing.
          </p>
          <p>
            Minting sends <span className="text-white">1000 tokens</span> directly to your connected
            wallet. Gas (a tiny amount of testnet DOT) is deducted from your wallet — the tokens
            themselves are free.
          </p>
        </div>
        {/* Faucet link */}
        <div className="mt-4 border-t border-[#222] pt-4">
          <div className="text-xs text-gray-500 mb-2">Need testnet DOT for gas?</div>
          <a
            href="https://faucet.polkadot.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a1a2e] border border-[#E6007A]/30 text-[#E6007A] text-sm font-bold hover:bg-[#E6007A]/10 hover:border-[#E6007A]/60 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v6l3-3M12 2v6l-3-3"/>
              <path d="M5 10c0 7 7 12 7 12s7-5 7-12a7 7 0 10-14 0z"/>
            </svg>
            Get Testnet PAS (Faucet) →
          </a>
          <div className="text-[10px] text-gray-600 mt-1.5">
            Select <span className="text-gray-400">Polkadot testnet (Paseo)</span> → click <span className="text-gray-400">Use preselected chains</span> → select <span className="text-gray-400">Hub (smart contracts)</span>
          </div>
        </div>
      </div>

      {/* Balances + mint buttons */}
      {address ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Collateral (vDOT or WPAS) */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
            {marketId === "vdot" ? (
              <>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">MockvDOT</div>
                  <div className="text-2xl font-bold text-white">
                    {Number(formatEther(collateralBal)).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">{addresses.collateral}</div>
                </div>
                <button
                  onClick={() => handleMint("vdot")}
                  disabled={busy}
                  className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
                >
                  {busy && minting === "vdot" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {isPending ? "Waiting for wallet…" : "Confirming…"}
                    </span>
                  ) : "Mint 1000 MockvDOT"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Wrap Native DOT</div>
                  <div className="flex justify-between items-end mt-2 mb-1">
                    <div className="text-sm text-gray-400">Native Balance:</div>
                    <div className="text-sm font-bold text-white">
                      {ethBalance ? Number(formatEther(ethBalance.value)).toFixed(4) : "0.00"} DOT
                    </div>
                  </div>
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-sm text-gray-400">WPAS Balance:</div>
                    <div className="text-sm font-bold text-white">
                      {Number(formatEther(collateralBal)).toFixed(4)} WPAS
                    </div>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      value={wrapAmount}
                      onChange={(e) => setWrapAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={busy}
                      className="flex-1 bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#E6007A] disabled:opacity-50"
                    />
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">{addresses.collateral}</div>
                </div>
                <button
                  onClick={() => handleMint("wpas")}
                  disabled={busy || !wrapAmount || Number(wrapAmount) <= 0}
                  className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
                >
                  {busy && minting === "wpas" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {isPending ? "Waiting for wallet…" : "Confirming…"}
                    </span>
                  ) : `Wrap ${wrapAmount} DOT`}
                </button>
              </>
            )}
          </div>

          {/* USDH */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">MockUSDH</div>
              <div className="text-2xl font-bold text-white">
                {Number(formatEther(hollarBal)).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">{addresses.hollar}</div>
            </div>
            <button
              onClick={() => handleMint("hollar")}
              disabled={busy}
              className="w-full py-3 rounded-lg font-bold text-sm bg-[#E6007A] text-white hover:bg-[#c4006a] disabled:opacity-50 transition"
            >
              {busy && minting === "hollar" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isPending ? "Waiting for wallet…" : "Confirming…"}
                </span>
              ) : "Mint 1000 MockUSDH"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-gray-500">
          Connect wallet to mint tokens
        </div>
      )}

      {/* Success */}
      {lastTx && (
        <a
          href={`${EXPLORER}/tx/${lastTx.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#E6007A] hover:underline"
        >
          {lastTx.token} minted — View on Blockscout →
        </a>
      )}

      {/* Error */}
      {writeError && (
        <div className="text-xs text-red-400 text-center">
          {writeError.message.slice(0, 120)}
        </div>
      )}

      {/* Alternative: script / Blockscout */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 space-y-3">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          Prefer not to connect a wallet?
        </div>
        <div className="text-xs text-gray-500 space-y-3">
          <div>
            <span className="text-white font-bold">Option A — Script</span>
            <br />
            Clone the repo, add your private key to <span className="font-mono">.env</span>, edit{" "}
            <span className="font-mono">RECIPIENT</span> in{" "}
            <span className="font-mono">scripts/mint-to-wallet.js</span>, then run:
            <pre className="mt-1 bg-[#111] rounded p-2 text-gray-300 overflow-x-auto">
              npx hardhat run scripts/mint-to-wallet.js --network polkadotHubTestnet
            </pre>
          </div>
          <div>
            <span className="text-white font-bold">Option B — Blockscout UI</span>
            <br />
            Call <span className="font-mono">mint()</span> directly on the contract explorer — no setup needed:
            <div className="mt-1 flex flex-col gap-1">
              <a
                href={`https://blockscout-testnet.polkadot.io/address/${ADDRESSES.vdot}?tab=write_contract`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E6007A] hover:underline"
              >
                MockvDOT → Write Contract on Blockscout →
              </a>
              <a
                href={`https://blockscout-testnet.polkadot.io/address/${ADDRESSES.hollar}?tab=write_contract`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E6007A] hover:underline"
              >
                MockUSDH → Write Contract on Blockscout →
              </a>
            </div>
          </div>
          <div>
            <a
              href="https://github.com/orthonode/dotlend#testing-the-protocol--step-by-step"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E6007A] hover:underline"
            >
              Full setup guide in README →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
