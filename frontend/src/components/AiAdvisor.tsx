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
  "What's my risk grade and why?",
  "What happens if vDOT drops 30%?",
  "How do I improve my health factor?",
  "Explain the ZK solvency proof",
];

const MOCK_FLAGGED = [
  "0x1234567890123456789012345678901234567890",
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  "0x0000000000000000000000000000000000000001",
];

function getRiskGrade(hfNum: number, ltvPct: number) {
  if (hfNum > 3 && ltvPct < 30)  return { grade: "A", color: "text-green-400",  bg: "bg-green-400/10 border-green-400/20",  label: "Very Safe" };
  if (hfNum > 2 && ltvPct < 50)  return { grade: "B", color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/20",   label: "Safe" };
  if (hfNum > 1.5 && ltvPct < 60) return { grade: "C", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20", label: "Moderate" };
  if (hfNum > 1.2 && ltvPct < 70) return { grade: "D", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20", label: "At Risk" };
  return { grade: "F", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20", label: "Critical" };
}

export function AiAdvisor() {
  const { address } = useAccount();
  const { addresses, assetSymbol } = useMarket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(true);
  const [stressDrop, setStressDrop] = useState(20);
  const [liqDismissed, setLiqDismissed] = useState(false);
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

  const collUSD = collateral * vdotPrice / BigInt(1e18);
  const hfBig   = hasDebt ? collUSD * 80n * BigInt(1e18) / (debt * 100n) : 0n;

  const collUSDNum = Number(formatEther(collUSD));
  const debtNum    = Number(formatEther(debt));
  const hfNum      = hasDebt ? Number(formatEther(hfBig)) : 999;

  const c    = Number(formatEther(collateral)).toFixed(2);
  const cUSD = collUSDNum.toFixed(2);
  const d    = debtNum.toFixed(2);
  const hf   = hasDebt ? hfNum.toFixed(2) : "MAX";
  const p    = vdotPrice > 0n ? Number(formatEther(vdotPrice)).toFixed(2) : "unknown";
  const liq  = (hasDebt && collateral > 0n)
    ? Number(formatEther(debt * 100n * BigInt(1e18) / (collateral * 80n))).toFixed(2)
    : "n/a";
  const mb   = Math.max(0, collUSDNum * 0.70 - debtNum).toFixed(2);

  const hfColor = hfNum >= 1.5 ? "text-green-400" : hfNum >= 1.2 ? "text-yellow-400" : "text-red-500";

  // Task 1: Risk grade
  const ltvPct    = hasDebt && collUSDNum > 0 ? debtNum / collUSDNum * 100 : 0;
  const riskGrade = address && hasDebt ? getRiskGrade(hfNum, ltvPct) : null;

  // Task 2: Stress test
  const newCollUSD   = collUSDNum * (1 - stressDrop / 100);
  const newHF        = hasDebt && debtNum > 0 ? (newCollUSD * 0.8) / debtNum : 999;
  const stressStatus = newHF >= 1.3 ? "SAFE" : newHF >= 1.0 ? "WARNING" : "LIQUIDATION";

  // Task 3: Liquidation banner
  const dropToLiq    = hasDebt ? ((hfNum - 1) / hfNum * 100).toFixed(0) : "0";
  const showLiqBanner = hasDebt && hfNum < 1.3 && !liqDismissed;

  // Task 4: AML check
  const amlFlagged = address
    ? MOCK_FLAGGED.some(f => f.toLowerCase() === address.toLowerCase())
    : null;

  // Task 6: Enhanced system prompt
  const systemPrompt = address
    ? `You are DotLend's AI advisor. First EVM-native money market on Polkadot Hub.
Protocol: LTV 70% | Liq threshold 80% | Fee 0.5%/yr | Liq bonus 5% | ${assetSymbol} ~15% APY | Oracle 30min.
Wallet: ${address} | collateral ${c} ${assetSymbol} ($${cUSD}) | debt ${d} USDH | HF ${hf} | LTV ${ltvPct.toFixed(1)}% | risk grade ${riskGrade?.grade ?? "N/A"} (${riskGrade?.label ?? "no debt"}) | ${assetSymbol} price $${p} | liq price $${liq} | max borrow $${mb} USDH.
Testnet: MockUSDH with mint/burn. Mainnet will use Hollar (lending reserve model — Aave/Compound pattern, no burn rights).
Rules: never invent numbers. under 120 words. if HF<1.2 lead with liq risk.`
    : `You are DotLend's AI advisor. First EVM-native money market on Polkadot Hub.
Protocol: LTV 70% | Liq threshold 80% | Fee 0.5%/yr | Liq bonus 5% | vDOT ~15% APY | Oracle 30min.
Testnet uses MockUSDH (mint/burn). Mainnet will use Hollar (Aave/Compound lending reserve model).
No wallet connected. Explain protocol concepts generally. Rules: never invent numbers. under 120 words.`;

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
        let errMsg = "AI Advisor temporarily unavailable.";
        try {
          const errData = await res.json();
          if (errData.error) errMsg = `Error: ${errData.error}`;
        } catch { /* not JSON */ }
        setMessages(prev => [...prev, { role: "assistant", content: errMsg }]);
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
    <div className="space-y-4">
      {/* Task 3: Liquidation alert banner */}
      {showLiqBanner && (
        <div className="flex items-start justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <div className="text-sm text-red-400">
            <span className="font-bold">Liquidation Risk</span> — Your health factor is{" "}
            <span className="font-mono font-bold">{hf}</span>. A {dropToLiq}% price drop will trigger liquidation.
          </div>
          <button
            onClick={() => setLiqDismissed(true)}
            className="text-gray-500 hover:text-white text-xs shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>
      )}

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
              id="advisor-input"
              name="advisor-input"
              aria-label="Ask AI advisor"
              autoComplete="off"
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

        {/* Right panel — 35% */}
        <div className="flex-1 space-y-3 overflow-y-auto">
          {/* Task 4: AML Screening */}
          {address && (
            <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 ${
              amlFlagged
                ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
                : "bg-green-400/10 border-green-400/20 text-green-400"
            }`}>
              <span>{amlFlagged ? "AML screening flagged this address" : "AML screening passed"}</span>
              <span className="text-gray-600 ml-auto">(mock)</span>
            </div>
          )}

          {/* Position + Task 1: Risk Grade */}
          <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Your Position</div>
              {riskGrade && (
                <div className={`rounded-lg border px-2.5 py-1 flex items-center gap-1.5 ${riskGrade.bg}`}>
                  <span className={`text-base font-black leading-none ${riskGrade.color}`}>{riskGrade.grade}</span>
                  <span className={`text-[10px] font-semibold ${riskGrade.color}`}>{riskGrade.label}</span>
                </div>
              )}
            </div>

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
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-xs">LTV</span>
                    <span className="text-xs text-gray-300">{hasDebt ? `${ltvPct.toFixed(1)}%` : "--"}</span>
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
                  <div>{assetSymbol} ~15% staking APY | Oracle 30min</div>
                </div>
              </>
            )}
          </div>

          {/* Task 2: Stress Test */}
          {address && hasDebt && (
            <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-4 space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Price Drop Simulator</div>
              <div className="flex gap-1.5 flex-wrap">
                {[10, 20, 30, 40, 50].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setStressDrop(pct)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                      stressDrop === pct
                        ? "bg-[#E6007A] border-[#E6007A] text-white"
                        : "border-white/10 text-gray-400 hover:border-white/30"
                    }`}
                  >
                    -{pct}%
                  </button>
                ))}
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">New Collateral</span>
                  <span className="text-white">${newCollUSD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">New Health Factor</span>
                  <span className={
                    newHF >= 999 ? "text-green-400"
                    : newHF >= 1.3 ? "text-green-400"
                    : newHF >= 1.0 ? "text-yellow-400"
                    : "text-red-500"
                  }>
                    {newHF >= 999 ? "MAX" : newHF.toFixed(2)}
                  </span>
                </div>
                <div className={`mt-1 rounded-lg px-2 py-1 text-center font-bold text-xs border ${
                  stressStatus === "SAFE"
                    ? "bg-green-400/10 border-green-400/20 text-green-400"
                    : stressStatus === "WARNING"
                    ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
                    : "bg-red-500/10 border-red-500/20 text-red-500"
                }`}>
                  {stressStatus === "SAFE" ? "SAFE" : stressStatus === "WARNING" ? "WARNING" : "LIQUIDATION"}
                </div>
              </div>
            </div>
          )}

          {/* Task 5: Smart Contract Audit Badge */}
          <div className="bg-[#0c0c0c] border border-white/5 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Transparency</div>
              <div className="text-[10px] bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 rounded px-2 py-0.5">TESTNET</div>
            </div>
            <div className="space-y-1.5 text-[11px] text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-green-400">+</span>
                <span>Open source — all contracts on Blockscout</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">+</span>
                <span>102 tests passing (Hardhat)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">!</span>
                <span>No formal audit — testnet only</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">!</span>
                <span>Admin keys held by deployer</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400">i</span>
                <span>ZK: MockSolvencyVerifier (BN254 pending PolkaVM)</span>
              </div>
            </div>
          </div>

          {/* Bottom disclaimer */}
          <div className="text-[10px] text-gray-600 leading-relaxed px-1 pb-2">
            Risk grades, AML screening, and stress tests on testnet use simulated data. On mainnet, DotLend will integrate real behavioral analytics, Chainalysis AML screening, and dynamic collateral ratios per wallet risk profile.
          </div>
        </div>
      </div>
    </div>
  );
}
