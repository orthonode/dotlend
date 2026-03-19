import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

export const polkadotHubTestnet = {
  id: 420420417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://blockscout-testnet.polkadot.io" },
  },
} as const;

export const config = createConfig({
  chains: [polkadotHubTestnet],
  ssr: true, // defer wallet reconnect until after hydration — prevents React error #418
  connectors: [
    injected(),
    walletConnect({
      projectId: "327cde52817024c462716ebabea9cb1e",
      metadata: {
        name: "DotLend",
        description: "Non-custodial money market on Polkadot Hub",
        url: "https://www.nexucore.xyz",
        icons: ["https://www.nexucore.xyz/favicon.ico"],
      },
    }),
  ],
  transports: {
    [polkadotHubTestnet.id]: http(),
  },
  // Poll for tx receipt every 2s (default is 4s) — faster post-tx UI refresh
  pollingInterval: 2_000,
});
