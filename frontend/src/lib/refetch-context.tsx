"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface RefetchContextValue {
  /** Increments on every transaction success — add to useEffect deps to re-scan */
  refetchCount: number;
  /** Call after any tx success to notify all components */
  triggerRefetch: () => void;
}

const RefetchContext = createContext<RefetchContextValue>({
  refetchCount: 0,
  triggerRefetch: () => {},
});

export function RefetchProvider({ children }: { children: React.ReactNode }) {
  const [refetchCount, setRefetchCount] = useState(0);
  const triggerRefetch = useCallback(() => setRefetchCount(n => n + 1), []);
  return (
    <RefetchContext.Provider value={{ refetchCount, triggerRefetch }}>
      {children}
    </RefetchContext.Provider>
  );
}

export function useRefetch() {
  return useContext(RefetchContext);
}
