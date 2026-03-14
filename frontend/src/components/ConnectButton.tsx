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
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 text-black hover:bg-yellow-400 transition"
      >
        Switch Network
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-pulse" />
          <span className="text-xs text-gray-300 font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-2.5 py-1.5 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected(), chainId: polkadotHubTestnet.id })}
      className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#E6007A] text-white hover:bg-[#c4006a] transition shadow-lg shadow-[#E6007A]/20 hover:shadow-[#E6007A]/30"
    >
      Connect Wallet
    </button>
  );
}
