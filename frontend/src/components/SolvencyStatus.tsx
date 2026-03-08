// SolvencyStatus.tsx
// Reads the last SolvencyProven event from LendingPool and renders a live badge.
// Drop into nexucore.xyz header or dashboard hero section.

import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem, formatEther } from "viem";

// ── Chain config ─────────────────────────────────────────────────────────────

const POLKADOT_HUB_TESTNET = {
  id: 420420417,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth-rpc-testnet.polkadot.io"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://blockscout-testnet.polkadot.io" },
  },
};

const SOLVENCY_GATEWAY_ADDRESS = "0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0" as `0x${string}`;

const SOLVENCY_PROVEN_ABI = parseAbiItem(
  "event SolvencyProven(uint256 totalCollateral, uint256 totalDebt, uint256 timestamp)"
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface SolvencyData {
  totalCollateral: bigint;
  totalDebt: bigint;
  provenAt: Date;
  blockNumber: bigint;
  txHash: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useSolvencyStatus() {
  const [data, setData] = useState<SolvencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createPublicClient({
      chain: POLKADOT_HUB_TESTNET,
      transport: http(),
    });

    async function fetch() {
      try {
        setLoading(true);
        const logs = await client.getLogs({
          address: SOLVENCY_GATEWAY_ADDRESS,
          event: SOLVENCY_PROVEN_ABI,
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (logs.length === 0) {
          setData(null);
          return;
        }

        const latest = logs[logs.length - 1];
        setData({
          totalCollateral: latest.args.totalCollateral!,
          totalDebt: latest.args.totalDebt!,
          provenAt: new Date(Number(latest.args.timestamp!) * 1000),
          blockNumber: latest.blockNumber!,
          txHash: latest.transactionHash!,
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetch();
    // Refresh every 5 minutes
    const interval = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SolvencyStatus() {
  const { data, loading, error } = useSolvencyStatus();

  if (loading) {
    return (
      <div style={styles.container}>
        <span style={styles.dot("#888")} />
        <span style={styles.label}>Checking solvency...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.container}>
        <span style={styles.dot("#888")} />
        <span style={styles.label}>No proof on-chain yet</span>
      </div>
    );
  }

  const ageMs = Date.now() - data.provenAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const isRecent = ageHours < 12;

  const ratio = Number(data.totalCollateral) / Math.max(Number(data.totalDebt), 1);
  const ratioDisplay = isFinite(ratio) ? ratio.toFixed(2) + "x" : "inf";

  const hoursAgo = ageHours < 1
    ? `${Math.round(ageMs / 60000)} min ago`
    : `${ageHours.toFixed(1)} hr ago`;

  const explorerUrl = `https://blockscout-testnet.polkadot.io/tx/${data.txHash}`;

  return (
    <div style={styles.card}>
      {/* Header badge */}
      <div style={styles.badgeRow}>
        <span style={styles.dot(isRecent ? "#22c55e" : "#eab308")} />
        <span style={{ ...styles.badgeText, color: isRecent ? "#22c55e" : "#eab308" }}>
          {isRecent ? "SOLVENT \u2713" : "PROOF AGING"}
        </span>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <div style={styles.statLabel}>Total Collateral</div>
          <div style={styles.statValue}>${Number(formatEther(data.totalCollateral)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statLabel}>Total Debt</div>
          <div style={styles.statValue}>${Number(formatEther(data.totalDebt)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statLabel}>C/D Ratio</div>
          <div style={{ ...styles.statValue, color: "#E6007A" }}>{ratioDisplay}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>Last proven: {hoursAgo}</span>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          View proof on Blockscout &rarr;
        </a>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "8px",
    padding: "8px 16px",
    borderRadius: "8px",
    background: "#1a1a1a",
    border: "1px solid #333",
  },
  card: {
    padding: "16px 20px",
    borderRadius: "12px",
    background: "#1a1a1a",
    border: "1px solid #333",
    fontFamily: "monospace",
    minWidth: "320px",
  },
  badgeRow: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "8px",
    marginBottom: "12px",
  },
  dot: (color: string) => ({
    display: "inline-block" as const,
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: color,
    flexShrink: 0 as const,
  }),
  label: { color: "#888", fontSize: "14px" },
  badgeText: {
    fontWeight: "700" as const,
    fontSize: "14px",
    letterSpacing: "0.05em",
  },
  statsRow: {
    display: "flex" as const,
    gap: "20px",
    marginBottom: "12px",
  },
  stat: { flex: 1 },
  statLabel: { color: "#666", fontSize: "11px", marginBottom: "4px" },
  statValue: { color: "#fff", fontWeight: "600" as const, fontSize: "16px" },
  footer: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    borderTop: "1px solid #222",
    paddingTop: "10px",
  },
  footerText: { color: "#666", fontSize: "12px" },
  link: {
    color: "#E6007A",
    fontSize: "12px",
    textDecoration: "none" as const,
  },
};
