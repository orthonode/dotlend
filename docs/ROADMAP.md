# DotLend — Roadmap

---

## Phase 1 — Foundation ✅ COMPLETE
**Target: Mar 7–8**

- [x] Hardhat + @parity/hardhat-polkadot + resolc 0.5.0 configured
- [x] OZ v4.9.6 installed and locked
- [x] Counter.sol — scaffold verification
- [x] MockvDOT.sol — ERC-20 mock (OZ v4, mint only)
- [x] MockUSDH.sol — ERC-20 mock (OZ v4, mint only)
- [x] resolc compile passes (hh-resolc-artifact-1, 0x50564d00 prefix)
- [x] .claude/ — 11 agents + 22 commands + pre-push hook
- [x] PHASES.md, ROADMAP.md, .gitignore
- [x] deploy-mocks.js — single deploy script for Phase 1 contracts
- [x] README.md skeleton

**Done when:** `npx hardhat compile --network westendAssetHub` exits 0, all artifacts hh-resolc-artifact-1.
**RESULT:** ✅ All 3 contracts → hh-resolc-artifact-1, 0x50564d00 prefix confirmed.

---

## Phase 2 — Protocol Contracts ✅ COMPLETE
**Target: Mar 9–13 | CONTRACTS LOCK Mar 13**

- [x] PriceOracle.sol — authorized oracle, staleness guard, 1-hour threshold
- [x] CollateralVault.sol — deposit/withdraw, LTV=70, liquidation threshold=80, health factor
- [x] LendingPool.sol — borrow/repay/liquidate, interest accrual via block.timestamp, 5 bps fee
- [x] test/PriceOracle.test.js
- [x] test/CollateralVault.test.js
- [x] test/LendingPool.test.js
- [x] test/Integration.test.js — full flow
- [x] scripts/deploy-protocol.js
- [x] 62 tests passing on local hardhat network

**RESULT:** ✅ `npx hardhat test` → **62 green, 0 failures**.

---

## Phase 3 — Deployment + Oracle ✅ COMPLETE
**Target: Mar 12–14**

- [x] All 5 contracts deployed to **Polkadot Hub TestNet** (Chain ID 420420417)
- [x] PriceOracle seeded with vDOT = $8.50
- [x] oracle/oracle.py — posts vDOT price every 5 min (DeFiLlama + env override)
- [x] scripts/simulate-crisis.js — price crash $8.50→$6.00, HF 1.214→0.857, liquidation ✓
- [x] scripts/interact.js — deposit→borrow→repay→withdraw flow verified

**RESULT:** ✅ Crisis simulation PASSED on live testnet. Debt cleared, 5% bonus confirmed.

---

## Phase 4 — ZK Solvency Proof ✅ COMPLETE
**Target: Mar 8–10**

- [x] circuits/solvency/src/main.nr — Noir circuit (nargo compile clean)
- [x] contracts/SolvencyVerifier.sol — UltraHonk verifier wrapper
- [x] contracts/MockSolvencyVerifier.sol — test double
- [x] LendingPool.sol — publishSolvencyProof() + SolvencyProven event
- [x] scripts/generate-solvency-proof.js — off-chain prover (noir_js + backend_barretenberg)
- [x] test/SolvencyProof.test.js — 14 tests passing
- [x] railway.json — Railway cron (every 30min, auto-submit proof)
- [x] frontend/src/components/SolvencyStatus.tsx — live SOLVENT badge widget
- [x] 102 total tests green

**RESULT:** ✅ `npx hardhat test` → **76 green, 0 failures**. Noir circuit compiles.

---

## Phase 5 — Submission ✅ COMPLETE (docs)
**Target: Mar 20, 2026 (DoraHacks deadline)**

- [x] README.md — full with all deployed addresses, architecture, security
- [x] docs/WHITEPAPER.md — mechanism, math, ZK circuit, interest model
- [x] docs/ARCHITECTURE.md — full ASCII diagrams, all user flows, deployment topology
- [x] AI advisor upgrade — A–F risk grade, price drop simulator, liquidation banner, mock AML screening, transparency card, enhanced system prompt (6 tasks, 3 files, 0 new contract calls)
- [ ] Demo video (3 min, YouTube unlisted)
- [ ] DoraHacks submission (before Mar 20 23:59)
- [ ] Send to Bifrost for review
- [ ] Hyperbridge ISMP oracle integration (post-hackathon)

**Mainnet launch — non-negotiable.**

---

## Invariants (never change)
- LTV: 70% | Liquidation: 80% | Fee: 5 bps | Liquidation bonus: 5%
- Pre-launch Goal: W3F grant + Velocity Labs DeFi Builders Cohort 2
