"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/src/lib/wagmi";
import { useState } from "react";
import { RefetchProvider } from "@/src/lib/refetch-context";
import { TxProvider } from "@/src/lib/tx-context";
import { MarketProvider } from "@/src/lib/market-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <TxProvider>
          <RefetchProvider>
            <MarketProvider>
              {children}
            </MarketProvider>
          </RefetchProvider>
        </TxProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
