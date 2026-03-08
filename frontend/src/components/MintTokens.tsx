"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContracts, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { ADDRESSES, MOCK_ABI, EXPLORER } from "@/src/lib/contracts";

const AMOUNT = parseEther("1000");

export function MintTokens() {
  const { address } = useAccount();
  const [minting, setMinting] = useState<"vdot" | "hollar" | null>(null);
  const [lastTx, setLastTx] = useState<{ token: string; hash: string } | null>(null);

  const { data, refetch } = useReadContracts({
    contracts: address ? [
      { address: ADDRESSES.vdot,   abi: MOCK_ABI, functionName: "balanceOf", args: [address] },
      { address: ADDRESSES.hollar, abi: MOCK_ABI, functionName: "balanceOf", args: [address] },
    ] : [],
    query: { enabled: !!address },
  });

  const vdotBal   = data?.[0]?.result ?? 0n;
  const hollarBal = data?.[1]?.result ?? 0n;

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && txHash && minting) {
      setLastTx({ token: minting === "vdot" ? "MockvDOT" : "MockHOLLAR", hash: txHash });
      setMinting(null);
      refetch();
      reset();
    }
  }, [isSuccess, txHash, minting, refetch, reset]);

  useEffect(() => {
    if (writeError) { setMinting(null); }
  }, [writeError]);

  function handleMint(token: "vdot" | "hollar") {
    if (!address) return;
    setMinting(token);
    setLastTx(null);
    writeContract({
      address: token === "vdot" ? ADDRESSES.vdot : ADDRESSES.hollar,
      abi: MOCK_ABI,
      functionName: "mint",
      args: [address, AMOUNT],
    });
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
            <span className="text-white font-mono">MockHOLLAR</span> have a public{" "}
            <span className="text-white font-mono">mint(address, amount)</span> function.
            Anyone can call it — no deployer key required. This is intentional for testnet testing.
          </p>
          <p>
            Minting sends <span className="text-white">1000 tokens</span> directly to your connected
            wallet. Gas (a tiny amount of testnet DOT) is deducted from your wallet — the tokens
            themselves are free.
          </p>
          <p className="text-gray-500">
            Gas is paid in testnet DOT (the native token of Polkadot Hub TestNet).
            If your wallet has no DOT, ask in the Polkadot Discord{" "}
            <span className="text-white font-mono">#faucet</span> channel.
          </p>
        </div>
      </div>

      {/* Balances + mint buttons */}
      {address ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* vDOT */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">MockvDOT</div>
              <div className="text-2xl font-bold text-white">
                {Number(formatEther(vdotBal)).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">{ADDRESSES.vdot}</div>
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
          </div>

          {/* HOLLAR */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">MockHOLLAR</div>
              <div className="text-2xl font-bold text-white">
                {Number(formatEther(hollarBal)).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5 break-all">{ADDRESSES.hollar}</div>
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
              ) : "Mint 1000 MockHOLLAR"}
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
                MockHOLLAR → Write Contract on Blockscout →
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
