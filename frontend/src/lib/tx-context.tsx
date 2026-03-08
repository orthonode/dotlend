"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type TxStatus = "idle" | "signing" | "confirming" | "success" | "error";

interface TxContextValue {
  status: TxStatus;
  label: string;
  /** Optimistic collateral delta (1e18) applied to displayed position */
  collateralDelta: bigint;
  /** Optimistic debt delta (1e18) applied to displayed position */
  debtDelta: bigint;
  setStatus: (s: TxStatus, label?: string) => void;
  setOptimistic: (collDelta: bigint, debtDelta: bigint) => void;
  clearOptimistic: () => void;
}

const TxContext = createContext<TxContextValue>({
  status: "idle",
  label: "",
  collateralDelta: 0n,
  debtDelta: 0n,
  setStatus: () => {},
  setOptimistic: () => {},
  clearOptimistic: () => {},
});

export function TxProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatusState] = useState<TxStatus>("idle");
  const [label, setLabel] = useState("");
  const [collateralDelta, setCollateralDelta] = useState(0n);
  const [debtDelta, setDebtDelta] = useState(0n);
  const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = useCallback((s: TxStatus, lbl = "") => {
    setStatusState(s);
    if (lbl) setLabel(lbl);
    // Auto-reset to idle after success or error
    if (s === "success" || s === "error") {
      if (autoResetRef.current) clearTimeout(autoResetRef.current);
      autoResetRef.current = setTimeout(() => setStatusState("idle"), 3000);
    }
  }, []);

  const setOptimistic = useCallback((collDelta: bigint, dbtDelta: bigint) => {
    setCollateralDelta(collDelta);
    setDebtDelta(dbtDelta);
  }, []);

  const clearOptimistic = useCallback(() => {
    setCollateralDelta(0n);
    setDebtDelta(0n);
  }, []);

  return (
    <TxContext.Provider value={{ status, label, collateralDelta, debtDelta, setStatus, setOptimistic, clearOptimistic }}>
      {children}
    </TxContext.Provider>
  );
}

export function useTx() {
  return useContext(TxContext);
}
