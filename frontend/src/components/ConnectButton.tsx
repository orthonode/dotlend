"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { polkadotHubTestnet } from "@/src/lib/wagmi";

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const wrongChain = isConnected && chain?.id !== polkadotHubTestnet.id;

  if (wrongChain) {
    return (
      <button
        onClick={() => connect({ connector: injected(), chainId: polkadotHubTestnet.id })}
        className="px-4 py-2 rounded-lg text-sm font-bold bg-yellow-500 text-black hover:bg-yellow-400 transition"
      >
        Switch to Polkadot Hub TestNet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 font-mono">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1 rounded text-xs border border-gray-600 text-gray-400 hover:border-gray-400 transition"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected(), chainId: polkadotHubTestnet.id })}
      className="px-4 py-2 rounded-lg text-sm font-bold bg-[#E6007A] text-white hover:bg-[#c4006a] transition"
    >
      Connect MetaMask
    </button>
  );
}
