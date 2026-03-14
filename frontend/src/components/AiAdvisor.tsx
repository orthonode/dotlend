"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { VAULT_ABI, ORACLE_ABI } from "@/src/lib/contracts";
import { useMarket } from "@/src/lib/market-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CHIPS = [
  "What's my liquidation price?",
  "How does vDOT yield offset borrow cost?",
  "What if DOT drops 20%?",
  "Explain the ZK solvency proof",
];

export function AiAdvisor() {
  const { address } = useAccount();
  const { addresses, assetSymbol } = useMarket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: oracleData } = useReadContracts({
    contracts: [
      { address: addresses.priceOracle, abi: ORACLE_ABI, functionName: "prices", args: [addresses.collateral] },
    ],
    query: { refetchInterval: 15_000 },
  });

  const { data: userData } = useReadContracts({
    contracts: address ? [
      { address: addresses.collateralVault, abi: VAULT_ABI, functionName: "collateralBalance", args: [address] },
      { address: addresses.collateralVault, abi: VAULT_ABI, functionName: "debtBalance", args: [address] },
    ] : [],
    query: { refetchInterval: 15_000 },
  });

  const vdotPrice  = oracleData?.[0]?.result ?? 0n;
  const collateral = userData?.[0]?.result ?? 0n;
  const debt       = userData?.[1]?.result ?? 0n;
  const hasDebt    = debt > 0n;

  const collUSD    = collateral * vdotPrice / BigInt(1e18);
  const hfBig      = hasDebt ? collUSD * 80n * BigInt(1e18) / (debt * 100n) : 0n;

  const c   = Number(formatEther(collateral)).toFixed(2);
  const cUSD = Number(formatEther(collUSD)).toFixed(2);
  const d   = Number(formatEther(debt)).toFixed(2);
  const hf  = hasDebt ? Number(formatEther(hfBig)).toFixed(2) : "MAX";
  const p   = vdotPrice > 0n ? Number(formatEther(vdotPrice)).toFixed(2) : "unknown";
  const liq = (hasDebt && collateral > 0n)
    ? (Number(formatEther(debt * 100n * BigInt(1e18) / (collateral * 80n)))).toFixed(2)
    : "n/a";
  const mb  = Math.max(0, Number(formatEther(collUSD)) * 0.70 - Number(formatEther(debt))).toFixed(2);

  const hfNum = hasDebt ? Number(formatEther(hfBig)) : 999;
  const hfColor = hfNum >= 1.5 ? "text-green-400" : hfNum >= 1.2 ? "text-yellow-400" : "text-red-500";

  const systemPrompt = address
    ? `You are DotLend's AI advisor. First EVM-native money market on Polkadot Hub.
Protocol: LTV 70% | Liq threshold 80% | Fee 0.5%/yr | Liq bonus 5% | vDOT ~15% APY | Oracle 30min.
Wallet: collateral ${c} ${assetSymbol} ($${cUSD}) | debt ${d} USDH | HF ${hf} | price $${p} | liq $${liq} | max borrow $${mb}.
Rules: never invent numbers. under 120 words. if HF<1.2 lead with liq risk. if no wallet explain generally.`
    : `You are DotLend's AI advisor. First EVM-native money market on Polkadot Hub.
Protocol: LTV 70% | Liq threshold 80% | Fee 0.5%/yr | Liq bonus 5% | vDOT ~15% APY | Oracle 30min.
No wallet connected. Explain protocol concepts generally.
Rules: never invent numbers. under 120 words.`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setChipsVisible(false);
    const userMsg: Message = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          systemPrompt,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: "assistant", content: "AI Advisor temporarily unavailable." }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistantText };
          return copy;
        });
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to reach AI Advisor." }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Chat panel — 65% */}
      <div className="flex flex-col" style={{ flex: "0 0 65%" }}>
        {/* Message history */}
        <div className="flex-1 bg-[#0c0c0c] border border-white/5 rounded-xl p-4 overflow-y-auto space-y-3 mb-3">
          {messages.length === 0 && (
            <div className="text-gray-500 text-sm text-center mt-8">
              Ask about your position, protocol mechanics, or risk scenarios.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-[#E6007A] text-white"
                    : "bg-white/5 text-gray-200 border border-white/10"
                }`}
              >
                {m.content || (streaming && m.role === "assistant" ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Quick chips */}
        {chipsVisible && (
          <div className="flex flex-wrap gap-2 mb-3">
            {CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => send(chip)}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:border-[#E6007A] hover:text-[#E6007A] transition"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send(input)}
            placeholder="Ask about your position..."
            disabled={streaming}
            className="flex-1 bg-[#0c0c0c] border border-white/10 rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-[#E6007A] disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="px-4 py-2 rounded-lg bg-[#E6007A] text-white text-sm font-bold hover:bg-[#c4006a] disabled:opacity-50 transition"
          >
            Send
          </button>
        </div>
      </div>

      {/* Position panel — 35% */}
      <div className="flex-1 bg-[#0c0c0c] border border-white/5 rounded-xl p-4 space-y-3 text-sm overflow-y-auto">
        <div className="text-xs text-gray-500 uppercase tracking-widest">Your Position</div>

        {!address ? (
          <div className="text-gray-500 text-xs">Connect wallet to see position data.</div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Collateral</span>
                <span className="font-bold text-white text-xs">{c} {assetSymbol} (${cUSD})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Debt</span>
                <span className="font-bold text-[#E6007A] text-xs">{d} USDH</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-xs">Health Factor</span>
                <span className={`font-bold text-xs ${hfColor}`}>{hf}</span>
              </div>
              {hasDebt && collateral > 0n && (
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Liq Price</span>
                  <span className="text-xs text-gray-300">${liq}</span>
                </div>
              )}
              {collateral > 0n && (
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Max Borrow</span>
                  <span className="text-xs text-gray-300">${mb} USDH</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">{assetSymbol} Price</span>
                <span className="text-xs text-gray-300">${p}</span>
              </div>
            </div>

            <div className="border-t border-white/5 pt-2 text-[10px] text-gray-600 space-y-1 font-mono">
              <div>LTV 70% | Liq 80% | Fee 0.5%/yr</div>
              <div>vDOT ~15% staking APY | Oracle 30min</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
