"use client";

import { MintTokens } from "@/src/components/MintTokens";

export default function MintPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Get Test Tokens</h1>
        <p className="text-gray-400 mt-1 text-sm">
          This is a testnet deployment on Polkadot Hub TestNet. Mint free vDOT and USDH
          to your wallet to try the protocol — no real assets involved.
        </p>
      </div>
      <MintTokens />
    </div>
  );
}
