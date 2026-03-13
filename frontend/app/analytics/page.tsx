"use client";

import { ProtocolStats } from "@/src/components/ProtocolStats";
import { LiquidationMonitor } from "@/src/components/LiquidationMonitor";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <ProtocolStats />
      <LiquidationMonitor />
    </div>
  );
}
