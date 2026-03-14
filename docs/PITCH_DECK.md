# DotLend — Pitch Deck

---

## SLIDE 1 — COVER

# DotLend

### The First Money Market on Polkadot Hub

Deposit vDOT or native DOT. Borrow stablecoins. Cryptographic solvency proof on every cycle.

---

nexucore.xyz | github.com/orthonode/dotlend

Arhant Barmate — Solo Founder & Engineer | Orthonode Infrastructure Labs

infrastructure@orthonode.xyz | March 2026

---

---

## SLIDE 2 — THE PROBLEM I FOUND

# I Had vDOT. I Needed Cash. There Was Nowhere to Go.

---

I had been staking DOT through Bifrost for months. vDOT was earning me around 15% APY — good yield, passive income. Then I needed liquidity for something time-sensitive.

My options were:

1. **Sell the vDOT** — lose the staking position I'd built up, and eat the slippage
2. **Wait** — and miss the window entirely

On Ethereum, I would open Aave, deposit stETH, borrow USDC, and be done in 30 seconds. On Polkadot? I searched everywhere. Hydration is a DEX — you can swap, but you can't borrow against collateral. Acala's aUSD depegged in 2022 and never recovered. Parallel Finance raised $22M and ended up at $0 TVL. There was literally no lending market on Polkadot Hub.

---

I pulled the numbers:

| What I Checked | What I Found |
|----------------|-------------|
| Bifrost vDOT | **Live** — $200M+ in liquid-staked DOT earning yield |
| Hydration USDH | **$330M TVL** — real stablecoin, growing fast |
| Snowbridge assets | **$75M+** — wETH, wBTC, USDC already bridged to Hub |
| Native lending markets on Hub | **Zero** |
| Aave TVL (Ethereum) | **$20B** — proof that the model works at scale |

Hundreds of millions in yield-bearing assets sitting idle. Real bridged assets arriving daily. And nobody connecting the two sides.

I decided to build it myself.

---

---

## SLIDE 3 — WHAT I BUILT

# DotLend — Three Steps, No Complexity

---

**Step 1 — Deposit collateral (vDOT or native DOT)**
Your vDOT keeps earning Bifrost staking yield (~15% APY) while it sits in the vault.

**Step 2 — Borrow USDH (up to 70% LTV)**
Instant stablecoin liquidity. No selling. No bridges. No waiting.

**Step 3 — Repay when ready**
Pay back USDH plus a tiny 0.5%/year stability fee. Or get liquidated if your health drops below 1.0 — liquidators earn a 5% bonus for keeping the system solvent.

---

```
Health Factor = (Collateral Value × 0.80) / Debt

HF > 1.0  →  Safe
HF = 1.0  →  Liquidation threshold
HF < 1.0  →  Liquidatable (5% bonus to liquidators)
```

The math is simple on purpose. I wanted something anyone could verify with a calculator.

---

---

## SLIDE 4 — WHAT'S LIVE TODAY

# 13 Contracts. 102 Tests. Two Live Markets. All On-Chain.

---

**nexucore.xyz** — working right now on Polkadot Hub TestNet.

| What | Status |
|------|--------|
| Smart contracts deployed | **13** across 2 independent markets |
| Tests passing | **102 Hardhat tests** — 0 failures |
| TreasuryRouter | **Live** — every stability fee gets split and routed on-chain |
| Oracle | Python script posting vDOT + DOT prices every 30 minutes via DeFiLlama |
| ZK Solvency | SOLVENT — proof published on-chain every cycle |
| Full user flow | Deposit → Borrow → Repay → Withdraw → Liquidate — all confirmed |

---

**Two markets, same architecture:**
- **vDOT Market** — Bifrost liquid-staked DOT as collateral, borrow USDH
- **WPAS Market** — native DOT (wrapped as WPAS via WETH9-style contract), borrow USDH

I built both because I wanted to prove the architecture generalizes. Adding a new collateral type is deploying three contracts and one oracle registration.

---

---

## SLIDE 5 — THE ZK SOLVENCY PROOF

# Every 30 Minutes, Math Proves We're Solvent

---

Every lending protocol shows you a dashboard that says "we're solvent." FTX had one. Celsius had one. They were lying.

I didn't want DotLend to be another "trust me" protocol. So I built a zero-knowledge solvency proof.

---

**What it does:**

Every cycle, a Noir ZK circuit takes the total collateral value and total debt from on-chain state, proves that `total_collateral ≥ total_debt` without revealing individual positions, and publishes the proof on-chain via `SolvencyGateway`.

```
Proof:     total_collateral_value ≥ total_debt
Reveals:   nothing about any individual user
Verify:    SolvencyGateway on Blockscout → SolvencyProven events
Circuit:   Noir 1.0 | Proving: UltraHonk
```

---

**Honest disclosure:** The on-chain verifier is currently `MockSolvencyVerifier` on testnet. The real UltraHonk verifier needs BN254 precompiles (EIP-196/197) that PolkaVM doesn't support yet. The real verifier is in the repo, tested, ready to deploy the moment BN254 lands. I chose to ship with a mock and be transparent about it rather than pretend it doesn't matter.

---

---

## SLIDE 6 — WHY THIS ONLY WORKS ON POLKADOT

# This Protocol Doesn't Make Sense on Ethereum

---

If I tried to build this on Ethereum:
- I'd need Chainlink for pricing — adding cost, centralization, and another trust assumption
- vDOT would need to be bridged — counterparty risk defeats the entire point of liquid staking
- USDH would need wrapping — peg risk, custodian risk, slower settlement

**On Polkadot Hub, none of these problems exist:**
- vDOT and USDH are native assets — no wrapping, no bridges, no intermediaries
- XCM makes them composable across every parachain
- Hyperbridge ISMP will deliver trustless price feeds directly from Hydration's Omnipool

This isn't "Aave but on another chain." This is infrastructure that can only exist in Polkadot's architecture. That's why nobody else has built it — you have to actually understand how Polkadot works.

---

---

## SLIDE 7 — HOW THE MONEY WORKS

# Revenue Model — No Bullshit

---

I've seen too many DeFi projects claim "100% to the community" while the team secretly runs on VC money or exit-scams after the token launch. I wanted a model that's honest from day one.

**Stability fee: 0.5% per year on all borrowed USDH.** Every repayment passes through `TreasuryRouter`, which splits it on-chain:

```
User repays (principal + accrued stability fee)
         ↓
TreasuryRouter intercepts repayment
         ↓
50%  → DOT Buybacks (Hydration DEX via XCM → stake → vDOT → ecosystem flywheel)
20%  → User Incentives (liquidity mining rewards, early depositor bonuses)
18%  → System Maintenance (audits, infrastructure, oracle hosting, RPC costs)
12%  → Team Operations (founder compensation, future hires, legal)
```

---

**Why 12% to the team?**

Because a protocol where the founder earns nothing is a protocol that dies the moment grant money runs out. I'm building this alone. I need to eat. The 12% is modest, transparent, and publicly documented. If governance votes to change it later, it changes. But pretending the team needs zero money is dishonest, and I'm not going to start this project with a lie.

---

**Why 50% to DOT buybacks?**

Every dollar borrowed on DotLend creates direct demand for DOT. The treasury buys DOT on Hydration, stakes it via Bifrost, and distributes the resulting vDOT to governance stakers. This creates a flywheel: more TVL → more fees → more DOT bought → more staking → higher ecosystem value. Polkadot's ecosystem should care about this because DotLend literally converts borrowing activity into DOT demand.

---

**Revenue projections (at 0.5% annual fee):**

| TVL | Annual Revenue | What It Funds |
|-----|---------------|---------------|
| $10M | $50K/yr | Self-sustaining: covers infra + team basics |
| $40M | $200K/yr | Profitable: hire a second engineer, fund audit |
| $100M | $500K/yr | Scale: multi-chain expansion, full team |

---

---

## SLIDE 8 — THE SNOWBRIDGE OPPORTUNITY

# $75M in Bridged Assets. Zero Lending Markets.

---

Snowbridge has been live for over a year. $75M+ TVL. Zero on-chain downtime. wETH, wBTC, and USDC are already bridgeable to Polkadot Hub.

But right now, if you bridge wETH to Polkadot Hub, the only thing you can do with it is swap on Hydration. You can't borrow against it. You can't earn lending yield. There's nowhere to put it to work.

---

**DotLend V2 — full two-sided market:**

| Deposit (Collateral) | Borrow |
|---------------------|--------|
| vDOT (Bifrost) | USDC (Snowbridge) |
| DOT (native) | wETH (Snowbridge) |
| wBTC (Snowbridge) | USDC |
| wETH (Snowbridge) | USDC |

This is the exact model that made Aave a $20B protocol. Same mechanics. But on Polkadot Hub, where nobody has built it yet.

---

---

## SLIDE 9 — WHAT I LEARNED THE HARD WAY

# PolkaVM Is Not EVM. I Hit Every Wall.

---

Building this wasn't smooth. PolkaVM looks like EVM from the outside, but inside it's a completely different beast. Here's what I ran into:

**Initcode size limit:** PolkaVM caps contract bytecode much tighter than Ethereum. My LendingPool was already using Ownable + ReentrancyGuard from OpenZeppelin, and when I tried to add fee-splitting logic inline, the compiled bytecode exceeded the limit. I had to extract the fee logic into a separate `TreasuryRouter` contract. What started as a constraint turned into better architecture — the router pattern is now more testable, more upgradeable, and cleaner than inline fee logic would have been.

**OpenZeppelin v5 doesn't compile.** `resolc` (the Solidity compiler for PolkaVM) doesn't support v5.x import patterns. I'm locked to OZ v4.9.6. Every contract was written against v4, and that's not changing until the compiler catches up.

**No BN254 precompiles.** The real ZK verifier (UltraHonk) needs elliptic curve pairing that PolkaVM doesn't have yet. I built the full pipeline — Noir circuit, proof generation, verification gateway — and deployed with a mock verifier while being completely transparent about it.

**Oracle timing.** There's no Chainlink on Polkadot Hub. I wrote a Python oracle that fetches live prices from DeFiLlama (free, no API key, no geo-blocking) and posts them on-chain every 30 minutes. The PriceOracle contract has a circuit breaker — if a submitted price deviates more than 20% from the last known price, it gets rejected. This prevents flash crashes or oracle manipulation from immediately affecting liquidations.

Every one of these constraints forced a design decision. The protocol is better for it.

---

---

## SLIDE 10 — COMPETITIVE LANDSCAPE

# Everyone Else Either Failed or Isn't Building This

---

| Protocol | What Happened | Why DotLend Is Different |
|----------|--------------|--------------------------|
| **Acala** | aUSD depegged in 2022. ACA token at $0.00078. Stablecoin is now "aSEED" recovery asset. | Substrate-only, not EVM-native. We build on Hub where real assets live. |
| **Parallel Finance** | Raised $22M, reached $29M TVL, now at $0 TVL. Dead. | Right idea, wrong infrastructure, wrong time. Hub EVM didn't exist yet. |
| **Bifrost** | Active, $55M TVL, but liquid staking only. | Not a lending market. Complementary — vDOT is our primary collateral. |
| **Hydration** | Active DEX, ~$55M TVL. Great for swaps. | AMM, not a money market. DotLend is a liquidity source *for* Hydration. |

Parallel Finance proves the demand existed. They failed because Polkadot's EVM infrastructure wasn't ready. Now it is. DotLend is building at the right moment.

---

---

## SLIDE 11 — MARKET SIZE

# The TAM Isn't Theoretical

---

| Asset | Current TVL |
|-------|-------------|
| Polkadot total TVL | **$800M+** |
| vDOT on Bifrost | **$200M+** |
| USDH on Hydration | **$330M** |
| Snowbridge bridged assets | **$75M+** |
| Native lending markets on Hub | **$0** |

---

**Conservative target: 5% of Polkadot TVL = $40M**

That's $200K/year in revenue at a 0.5% stability fee. Enough to fund a small team, continuous audits, and ecosystem growth. The addressable market is already there — it just needs somewhere to go.

---

---

## SLIDE 12 — ROADMAP

# Testnet → Mainnet → Ecosystem

---

**March 2026 — Done:**
- 13 contracts deployed on Polkadot Hub TestNet (2 collateral markets)
- 102 Hardhat tests, 0 failures
- Live frontend at nexucore.xyz
- TreasuryRouter with on-chain fee split
- ZK solvency pipeline (Noir + mock verifier, full pipeline ready)
- Oracle posting live prices from DeFiLlama every 30 minutes
- Full crisis simulation: price crash → liquidation → confirmed on-chain

**Q2 2026:** W3F grant application. PAL security audit. Velocity Labs DeFi Builders Cohort.

**Q3 2026:** Mainnet launch. Replace mock tokens with real vDOT + Snowbridge USDC. Hyperbridge ISMP oracle.

**Q4 2026:** DOTLEND governance token. Treasury flywheel live. Community governance over risk parameters.

---

---

## SLIDE 13 — OPENZEPPELIN COMPOSITION

# Deep OZ Integration, Not Surface-Level Imports

---

| OZ Contract | Where | Purpose |
|-------------|-------|---------|
| `Ownable` | LendingPool, CollateralVault, PriceOracle, TreasuryRouter, SolvencyGateway | Admin access control |
| `ReentrancyGuard` | LendingPool | Protection against reentrancy in borrow/repay/liquidate |
| `ERC20` | MockvDOT, MockUSDH, TreasuryRouter | Token standard implementation |
| `SafeERC20` | CollateralVault | Safe transfer wrappers for collateral handling |

---

**The real OZ story:** When I hit PolkaVM's initcode size limit trying to add fee logic to LendingPool (which already inherited Ownable + ReentrancyGuard), I had to extract fee routing into TreasuryRouter. The router implements the same `IMintBurn` interface as MockUSDH and sits between LendingPool and the real token. This pattern exists *because* OZ composition consumed enough bytecode that the fee logic had to be externalized. The result is actually better: more testable, independently upgradeable, easier to audit.

**Locked to v4.9.6.** PolkaVM's `resolc` compiler doesn't support OZ v5.x import patterns. This is a known PolkaVM limitation, not a design choice.

---

---

## SLIDE 14 — THE ASK

# What DotLend Needs to Reach Mainnet

---

**1. Win this hackathon** — validation that the technical foundation is solid, and initial funding to keep building full-time.

**2. W3F grant** — specifically to fund a PAL security audit. No serious TVL without a professional audit. I know this.

**3. Early vDOT depositors** — bootstrap the first $1M TVL and prove the flywheel works.

---

DotLend is a complete, working protocol for a primitive that Polkadot Hub is missing. The contracts are deployed. The tests pass. The frontend works. The oracle is live. The ZK pipeline is built.

vDOT earns yield. Stablecoins need collateral utility. Polkadot Hub needs a lending market.

I built the thing that connects them. And right now, nobody else is.

---

nexucore.xyz | github.com/orthonode/dotlend | infrastructure@orthonode.xyz
