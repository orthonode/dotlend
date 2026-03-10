"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { COMMON_ADDRESSES, MARKETS, MarketAddresses } from "./contracts";

type MarketId = "vdot" | "wpas";

interface MarketContextState {
  marketId: MarketId;
  setMarketId: (id: MarketId) => void;
  // Merges the common protocol addresses with the specific active market's addresses
  addresses: typeof COMMON_ADDRESSES & MarketAddresses;
  assetSymbol: string;
}

const MarketContext = createContext<MarketContextState | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [marketId, setMarketId] = useState<MarketId>("vdot");

  const addresses = {
    ...COMMON_ADDRESSES,
    ...MARKETS[marketId],
  };

  const assetSymbol = marketId === "vdot" ? "vDOT" : "WPAS";

  return (
    <MarketContext.Provider value={{ marketId, setMarketId, addresses, assetSymbol }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error("useMarket must be used within a MarketProvider");
  }
  return context;
}
