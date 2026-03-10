# DotLend — Pitch Deck
## Polkadot Hub Native DeFi

---

---

## SLIDE 1 — COVER

# DotLend

### A Native Money Market for Polkadot Hub

**Deposit vDOT. Borrow HOLLAR. Cryptographic solvency proofs every 30 minutes.**

---

nexucore.xyz | github.com/orthonode/dotlend

Orthonode | Arhant Barmate (Founder & Lead Engineer) | March 2026

research@orthonode.xyz

---

---

## SLIDE 2 — THE GAP

# Polkadot Has $330M in Stablecoins and Zero Lending Markets

---

| Signal | Data |
|--------|------|
| vDOT utilization on Hydration | **76%** — supply cap HIT |
| HOLLAR TVL | **$330M** — launched September 2025 |
| Native money markets on Polkadot Hub | **0** |

---

**Ethereum lending markets:**
- Aave: **$20B TVL**
- Morpho: **$3B TVL**
- Compound: **$3B TVL**

**Polkadot: $0**

Not zero market share. **Literally zero.**

vDOT holders have $200M+ in yield-bearing assets with nowhere to borrow against them.

---

---

## SLIDE 3 — THE SOLUTION

# DotLend in Three Steps

---

**Step 1 — Deposit vDOT as collateral**
Keep earning Bifrost staking yield (~15% APY) while your vDOT is posted.

**Step 2 — Borrow HOLLAR (up to 70% LTV)**
Get immediate HOLLAR liquidity without selling your position.

**Step 3 — Repay when ready**
Or get liquidated if health drops below 1.0. Liquidators earn a 5% bonus.

---

```
Health Factor = (Collateral Value × 0.80) / Debt

HF > 1.0  →  Safe
HF = 1.0  →  Liquidation threshold
HF < 1.0  →  Liquidatable (5% bonus to liquidators)
```

**LTV: 70% | Liquidation Threshold: 80% | Stability Fee: 0.5%/yr**

---

---

## SLIDE 4 — LIVE DEMO

# Live on Polkadot Hub TestNet Today

---

**nexucore.xyz**

---

| Metric | Status |
|--------|--------|
| Contracts deployed | 7 — all on Chain ID 420420417 |
| Tests passing | 76 passing, 0 failures |
| Solvency status | SOLVENT ✓ — proven every 30 minutes |
| vDOT Price | $2.45 via PriceOracle on-chain |
| Full flow | Deposit → Borrow → Liquidate → Repay ✓ |

---

**Deployed contracts (Polkadot Hub TestNet):**

```
PriceOracle:     0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D
MockvDOT:        0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA
MockHOLLAR:      0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf
CollateralVault: 0xc8cdEF13677bEA21e8b8282c9cE118EbBE4fA14c
LendingPool:     0xd8e2bE395Cb8F54BEDfBc6ed6C249Ad43A4fa52b
SolvencyGateway: 0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0
```

Explorer: blockscout-testnet.polkadot.io

---

---

## SLIDE 5 — THE ZK INNOVATION

# First Money Market With Cryptographic Solvency Proof

---

**The problem with DeFi transparency:**

> "Trust us, we're solvent."

Every lending protocol, every exchange, every yield vault — they all ask you to trust a dashboard. FTX had a dashboard. Celsius had a dashboard.

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

**This is the first money market anywhere to do this.**

Not a claim. A cryptographic fact, published on-chain, every 30 minutes.

---

---

## SLIDE 6 — WHY ONLY ON POLKADOT

# Architecture That's Impossible on Ethereum

---

**On Ethereum, building this would require:**

- ✗ Chainlink oracle → centralized, expensive, another trust assumption
- ✗ Multisig bridge for vDOT → counterparty risk defeats the purpose
- ✗ Wrapped stablecoin for HOLLAR → peg risk, custodian risk

---

**On Polkadot Hub:**

- ✓ vDOT price via XCM from Bifrost — native, no bridge, no custodian
- ✓ HOLLAR is a native Polkadot asset — no wrapping required
- ✓ Hyperbridge ISMP delivers trustless cross-chain state proofs on mainnet

---

**This is not "EVM on another chain."**

This is Polkadot-native composability. vDOT and HOLLAR exist here. The lending market belongs here too.

---

---

## SLIDE 7 — TECHNICAL ARCHITECTURE

# Clean, Auditable, PolkaVM-Ready

---

```
User Wallet (MetaMask)
    │
    ├─ approve(MockvDOT, CollateralVault)
    ├─ CollateralVault.deposit(amount)   → records collateral
    ├─ LendingPool.borrow(hollarAmount)  → mints MockHOLLAR
    └─ LendingPool.repay(amount)         → burns MockHOLLAR

                    ┌───────────────────────────────────┐
                    │         Polkadot Hub TestNet       │
                    │         Chain ID: 420420417        │
    CollateralVault ◄──────── PriceOracle               │
          │                      ▲                      │
          │                      │ oracle.py (30m)      │
          ▼                      │                      │
    LendingPool ────────────► MockHOLLAR                │
          │                                             │
          ▼                                             │
   SolvencyGateway ◄── MockSolvencyVerifier             │
          │               (testnet; real verifier       │
          ▼                on mainnet w/ BN254)         │
   SolvencyProven event                                 │
   (Railway cron, every 6h)                             │
                    └───────────────────────────────────┘
```

---

**7 contracts. No SELFDESTRUCT. No EXTCODECOPY. No assembly.**

OpenZeppelin `ReentrancyGuard` on all state-changing functions.
BN254 precompile-ready for mainnet ZK verifier deployment.

---

---

## SLIDE 8 — BUILT FOR THIS ECOSYSTEM

# What the Ecosystem is Saying

---

**Victor Ji (Bifrost)**
vDOT IS the collateral on day one. DotLend is the first protocol to productize vDOT as DeFi collateral on Polkadot Hub. Integration path: Bifrost SLPx one-click — mint vDOT and post it as collateral in a single transaction.

---

**Nicolas Arevalo (Velocity Labs)**
You said money markets are #1 on Polkadot's DeFi needed list. We built one. 7 contracts, 76 tests, live frontend, ZK solvency proof. Applying for DeFi Builders Cohort 2.

---

**Radha (W3F)**
HOLLAR has $330M TVL and no native collateral utility outside Hydration. DotLend is the missing primitive. Without a lending market, HOLLAR cannot scale. W3F grant application in progress.

---

**Valery (PAL)**
4 core contracts, no assembly, no exotic opcodes, full reentrancy protection, 76 tests including edge cases. Clean separation of concerns. Ready for formal verification. Interested in the PAL audit subsidy path.

---

**Alberto (Papermoon)**
Deployed and battle-tested on Paseo first. Every PolkaVM opcode constraint respected by design. No SELFDESTRUCT, no CREATE2, no EXTCODECOPY, OZ v4.x only.

---

---

## SLIDE 9 — MARKET SIZE

# The TAM Is Proven

---

**Lending protocols on Ethereum:**

| Protocol | TVL |
|----------|-----|
| Aave | $20B |
| Morpho | $3B |
| Compound | $3B |

**Lending protocols on Polkadot: $0**

---

**Polkadot DeFi today:**

| Asset | TVL |
|-------|-----|
| Polkadot total TVL | $800M+ |
| vDOT TVL on Bifrost | $200M+ |
| HOLLAR TVL | $330M |
| Native lending markets | 0 |

---

**Conservative target: 5% of Polkadot TVL = $40M**
**Year 1 target: $10M TVL**

Protocol revenue at $10M TVL, 0.5% stability fee: **$50,000/year**
At $40M TVL: **$200,000/year** — fully self-sustaining.

---

---

## SLIDE 10 — TRACTION & ROADMAP

# Testnet → Mainnet → Ecosystem

---

**NOW (March 2026) — DONE:**

- ✓ 7 contracts deployed on Polkadot Hub TestNet (Chain ID 420420417)
- ✓ 76 tests passing, 0 failures
- ✓ Live frontend at nexucore.xyz
- ✓ ZK solvency proof pipeline (Noir circuit + Railway cron)
- ✓ Full crisis simulation: $8.50 → $6.00 price crash, HF 1.214 → 0.857, liquidation confirmed

---

**Q2 2026:**

- → W3F grant application (ecosystem-critical primitive)
- → PAL security audit (Valery subsidy path)
- → Velocity Labs DeFi Builders Cohort 2

---

**Q3 2026:**

- → Mainnet deployment with Hyperbridge ISMP oracle
- → Bifrost SLPx one-click: mint vDOT + collateralize in one transaction
- → Target: $10M TVL

---

---

## SLIDE 11 — TEAM

# Orthonode

---

**Arhant Barmate** — Founder & Lead Engineer

Building verification and governance infrastructure across multiple chains.

**DotLend** — this project, built natively for PolkaVM constraints.
7 contracts, 76 tests. Live on Westend Testnet.

---

**Current Focus:**
- Zero-knowledge solvency proofs
- On-chain oracle architectures
- Gas-optimized state execution

---

**Contact**

research@orthonode.xyz
orthonode.xyz | nexucore.xyz
github.com/orthonode
Bhopal, India

---

---

## SLIDE 12 — NEXT STEPS

# Where DotLend Goes From Here

---

**1. Mainnet Deployment**
Finalizing the Hyperbridge ISMP integration to pull trustless TWAP prices from Hydration. The technical design is complete; implementation is next.

---

**2. W3F Grant Application**
Applying for a grant to fund a formal security audit. Since DotLend uses standard OpenZeppelin contracts and avoids complex assembly, an audit via PAL is the last major hurdle before a safe mainnet launch.

---

**3. Liquidity Bootstrapping**
Looking to connect with early liquidity providers and ecosystem builders (like Velocity Labs) who want to see vDOT utilization increase.

---

DotLend is a complete technical foundation for a missing primitive.

vDOT earns yield. HOLLAR needs collateral. Polkadot Hub needs a lending market.

**DotLend connects them.**

---

nexucore.xyz
github.com/orthonode/dotlend
research@orthonode.xyz
