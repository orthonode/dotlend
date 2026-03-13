"use client";

import { AiAdvisor } from "@/src/components/AiAdvisor";

export default function AdvisorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Advisor</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Ask about your position, liquidation risk, yield strategies, or protocol mechanics.
        </p>
      </div>
      <AiAdvisor />
    </div>
  );
}
