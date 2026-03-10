# DotLend — Pitch Deck
## The Aave of Polkadot

---

---

## SLIDE 1 — COVER

# DotLend

### The First Money Market on Polkadot Hub

**Deposit vDOT or native DOT. Borrow HOLLAR. Zero-knowledge solvency proofs every 30 minutes.**

---

nexucore.xyz | github.com/orthonode/dotlend

Orthonode | Arhant Barmate (Solo Founder & Engineer) | March 2026

research@orthonode.xyz

---

---

## SLIDE 2 — THE PROBLEM I FOUND

# I Couldn't Borrow Against My Staked DOT

---

I had vDOT — Bifrost's liquid staking token. It was earning 15% APY. But I needed liquidity. My options were:

1. **Sell my vDOT** — lose the staking yield forever
2. **Wait** — and miss the opportunity

On Ethereum, I'd go to Aave and borrow USDC against my stETH in 30 seconds. On Polkadot? Nothing. Zero lending markets.

---

I checked the data:

| Signal | What I Found |
|--------|-------------|
| vDOT utilization on Hydration | **76%** — supply cap literally hit |
| HOLLAR TVL | **$330M** — Polkadot's largest stablecoin |
| Native lending markets on Polkadot Hub | **Zero** |
| Ethereum lending market TVL (Aave alone) | **$20B** |

$200M+ in vDOT sitting idle. $330M in HOLLAR with no collateral use case. And nobody building the thing that connects them.

So I built it.

---

---

## SLIDE 3 — WHAT DOTLEND DOES

# Three Steps. That's It.

---

**Step 1 — Deposit vDOT (or native DOT) as collateral**
Keep earning Bifrost staking yield (~15% APY) while your assets are posted.

**Step 2 — Borrow HOLLAR (up to 70% LTV)**
Get immediate stablecoin liquidity without selling your position.

**Step 3 — Repay when ready**
Or get liquidated if health drops below 1.0. Liquidators earn a 5% bonus.

---

```
Health Factor = (Collateral Value × 0.80) / Debt

HF > 1.0  →  Safe
HF = 1.0  →  Liquidation threshold
HF < 1.0  →  Liquidatable (5% bonus to liquidators)
```

**LTV: 70% | Liquidation Threshold: 80% | Stability Fee: 0.5%/yr | Treasury Fee: 100%**

---

---

## SLIDE 4 — WHAT'S LIVE TODAY

# 12 Contracts. 92 Tests. 2 Collateral Markets.

---

**nexucore.xyz** — live right now

| Metric | Status |
|--------|--------|
| Contracts deployed | **12** across 2 markets (vDOT + native DOT) |
| Tests passing | **92 Hardhat + 6 Forge fuzz** — 0 failures |
| TreasuryRouter | **100% of fees → treasury** (MakerDAO model) |
| Oracle | Live, posting vDOT + DOT prices every 30 minutes |
| ZK Solvency | SOLVENT ✓ — proof generated every 30 minutes |
| Full flow | Deposit → Borrow → Repay → Liquidate ✓ |

---

**Markets:**
- **vDOT Market** — deposit Bifrost liquid-staked DOT, borrow HOLLAR
- **WPAS Market** — deposit native DOT (wrapped via WPAS), borrow HOLLAR

---

---

## SLIDE 5 — THE ZK INNOVATION

# The First Money Market With Cryptographic Solvency Proof

---

> "Trust us, we're solvent."

Every lending protocol says this. FTX had a dashboard. Celsius had a dashboard.

---

**DotLend's answer:**

Every 30 minutes, a zero-knowledge proof is published on-chain.

```
What it PROVES:   total_collateral_value ≥ total_debt
What it REVEALS:  nothing about individual positions
Where to VERIFY:  SolvencyGateway on Blockscout → SolvencyProven events
```

**Circuit:** Noir 1.0 | **Proving system:** UltraHonk | **Prover:** Railway cron

---

*Transparency:* On-chain verification uses `MockSolvencyVerifier` on testnet. The real UltraHonk verifier requires BN254 precompiles (EIP-196/197) which PolkaVM doesn't support yet. The real verifier is in the repo, ready to deploy when BN254 lands. We chose to be honest about this rather than hide it.

---

---

## SLIDE 6 — WHY ONLY ON POLKADOT

# Can't Build This on Ethereum

---

**On Ethereum, building this would require:**
- ✗ Chainlink oracle → centralized, expensive, another trust assumption
- ✗ Bridge for vDOT → counterparty risk defeats the purpose
- ✗ Wrapped HOLLAR → peg risk, custodian risk

**On Polkadot Hub:**
- ✓ vDOT and HOLLAR are native assets — no wrapping, no bridges
- ✓ XCM makes them natively composable across all parachains
- ✓ Hyperbridge ISMP delivers trustless price feeds on mainnet

**This isn't "EVM on another chain." This is Polkadot-native composability.**

---

---

## SLIDE 7 — REVENUE MODEL & TREASURY

# How the Money Works — Complete Transparency

---

**Current (testnet):** 100% of stability fees → protocol treasury. Zero HOLLAR burn.

**Why no burn?** HOLLAR is a stablecoin. Burning it destroys borrowing capacity for zero value. MakerDAO doesn't burn DAI — they burn MKR using DAI revenue. We follow the same model.

---

**Mainnet tokenomics (DOTLEND governance token):**

```
User repays stability fee (e.g. 100 USDC)
         ↓
70%  → Treasury reserve (operations, insurance fund, audits)
20%  → Buy DOT on Hydration DEX via XCM → Stake → vDOT → Distribute to DOTLEND stakers
10%  → Liquidity mining rewards (bootstrap new collateral markets)
```

**No burning of anything. Every dollar does real work.**

---

**Team incentive — honest disclosure:**

There is no team allocation from protocol fees today. The team's incentive is:
1. **Hackathon prize** ($3K–$4K if we win)
2. **W3F grant** (applying Q2 2026)
3. **Future governance token allocation** (standard 15–20% team allocation with 2-year vesting, publicly disclosed at launch)

We don't take a salary from the protocol until it's self-sustaining. That's the commitment.

---

---

## SLIDE 8 — THE V2 VISION

# Snowbridge Just Made This a $100M Opportunity

---

**Snowbridge** — live for over a year, $75M+ TVL, zero on-chain downtime, ~24 parachain integrations.

wETH, wBTC, and USDC are **already bridgeable** to Polkadot Hub.

---

**DotLend V2 — full two-sided market:**

| Collateral (deposit) | Borrow |
|---------------------|--------|
| vDOT (Bifrost) | USDC (Snowbridge) |
| vDOT | wETH (Snowbridge) |
| DOT (native) | USDC |
| wBTC (Snowbridge) | USDC |

This is exactly what Aave does. But on Polkadot Hub, where nobody has built it.

---

**The treasury flywheel (MakerDAO model):**

Stability fees → Treasury → Buy DOT on Hydration DEX → Stake via Bifrost → vDOT → Distributed to DOTLEND governance stakers → More TVL → More fees → More DOT bought → Token price rises

**Every dollar borrowed on DotLend eventually becomes DOT demand.**

That's the pitch Polkadot's ecosystem will care about.

---

---

## SLIDE 9 — COMPETITIVE ADVANTAGES

# What We Fix That Aave Can't

---

| Aave Weakness | DotLend Advantage |
|--------------|-------------------|
| Liquidations are chaotic — MEV bots front-run each other | ZK-proven health factor alerts via XCM (architecture ready) |
| AAVE token has weak value accrual | Treasury flywheel directly buys DOT — real backing |
| No Polkadot-native assets | vDOT, HOLLAR, native DOT as first-class collateral |
| No staking yield passthrough | Lenders earn base interest + share of vDOT yield (~15%) |

---

**Parallel Finance** tried this on Polkadot and collapsed with $29M TVL — before Polkadot Hub EVM existed. We're building at the right moment, on the right infrastructure.

---

---

## SLIDE 10 — MARKET SIZE

# The TAM Is Proven

---

| Asset | TVL |
|-------|-----|
| Polkadot total TVL | **$800M+** |
| vDOT on Bifrost | **$200M+** |
| HOLLAR | **$330M** |
| Native lending markets | **$0** |

---

**Conservative target: 5% of Polkadot TVL = $40M**

| TVL | Annual Revenue (0.5% fee) | Status |
|-----|--------------------------|--------|
| $10M | $50,000/yr | Self-sustaining |
| $40M | $200,000/yr | Profitable |
| $100M | $500,000/yr | Competitive with mid-tier DeFi |

---

---

## SLIDE 11 — TRACTION & ROADMAP

# Testnet → Mainnet → Ecosystem

---

**March 2026 — DONE:**
- ✓ 12 contracts deployed (2 collateral markets: vDOT + native DOT)
- ✓ 92 Hardhat + 6 Forge fuzz tests — 0 failures
- ✓ Live frontend at nexucore.xyz
- ✓ TreasuryRouter deployed — 100% fees to treasury
- ✓ ZK solvency proof pipeline (Noir + Railway)
- ✓ Full crisis simulation: price crash → liquidation confirmed

---

**Q2 2026:** W3F grant + PAL security audit + Velocity Labs cohort

**Q3 2026:** Mainnet + Snowbridge multi-asset markets (USDC, wETH, wBTC)

**Q4 2026:** DOTLEND governance token + treasury flywheel live

---

---

## SLIDE 12 — OPENZEPPELIN USAGE

# Deep OZ Composition, Not Surface-Level Imports

---

| OZ Contract | Used In | Purpose |
|------------|---------|--------|
| `Ownable` | 5 contracts | Admin functions |
| `ReentrancyGuard` | LendingPool | Reentrancy protection |
| `ERC20` | 3 contracts | Token standards |

---

**The constraint story:** When adding fee logic to `LendingPool`, the combined bytecode from Ownable + ReentrancyGuard + fee logic exceeded PolkaVM's 24KB initcode limit. The solution: `TreasuryRouter` — a separate contract implementing `IMintBurn` that sits between LendingPool and HOLLAR.

This pattern exists *because* OZ composition consumed enough bytecode that fee logic had to be externalized. The result is cleaner: more testable, more upgradeable, more auditable.

**v4.9.6 only.** PolkaVM's resolc compiler doesn't support v5.x import patterns.

---

---

## SLIDE 13 — TEAM

# Solo Founder, Full Stack

---

**Arhant Barmate** — Founder & Lead Engineer
Orthonode Infrastructure Labs | Bhopal, India

Built every contract, every test, every frontend component, every script, this pitch — alone.

---

**By the numbers:**
- 12 deployed contracts on Polkadot Hub TestNet
- 92 Hardhat + 6 Forge fuzz tests
- Live frontend, live oracle, live ZK pipeline
- Built from scratch during the hackathon window
- Commit history proves it

---

research@orthonode.xyz
orthonode.xyz | nexucore.xyz
github.com/orthonode

---

---

## SLIDE 14 — THE ASK

# What DotLend Needs Next

---

**1. Win this hackathon** → Validation + initial funding to continue building

**2. W3F grant** → Fund the PAL security audit for mainnet readiness

**3. Early vDOT depositors** → Bootstrap the first $1M TVL

---

DotLend is a complete technical foundation for a missing primitive.

vDOT earns yield. HOLLAR needs collateral utility. Polkadot Hub needs a lending market.

**DotLend connects them. And nobody else is building this.**

---

nexucore.xyz
github.com/orthonode/dotlend
research@orthonode.xyz
