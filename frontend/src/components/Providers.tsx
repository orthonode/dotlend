"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/src/lib/wagmi";
import { useState } from "react";
import { RefetchProvider } from "@/src/lib/refetch-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RefetchProvider>
          {children}
        </RefetchProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
