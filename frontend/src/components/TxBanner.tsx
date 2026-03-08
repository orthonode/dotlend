"use client";

import { useTx } from "@/src/lib/tx-context";

const CONFIG = {
  signing:    { bg: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-400 animate-pulse", text: "text-yellow-300", msg: "Awaiting MetaMask signature…" },
  confirming: { bg: "bg-[#E6007A]/10 border-[#E6007A]/30",  dot: "bg-[#E6007A] animate-pulse",  text: "text-[#E6007A]",  msg: "Confirming on Polkadot Hub…" },
  success:    { bg: "bg-green-500/10 border-green-500/30",   dot: "bg-green-400",                 text: "text-green-400",  msg: "Transaction confirmed ✓" },
  error:      { bg: "bg-red-500/10 border-red-500/30",       dot: "bg-red-400",                   text: "text-red-400",    msg: "Transaction failed" },
};

export function TxBanner() {
  const { status, label } = useTx();
  if (status === "idle") return null;

  const c = CONFIG[status];
  const displayMsg = label && status === "signing" ? label : c.msg;

  return (
    <div className={`border-b ${c.bg} px-6 py-2 flex items-center gap-2 transition-all`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
      <span className={`text-xs font-mono ${c.text}`}>{displayMsg}</span>
    </div>
  );
}
